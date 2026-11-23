import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { TOKENS, type AIDifficulty, type AIPersonality } from "@/core";
import {
  buildConfig,
  cleanName,
  cleanToken,
  genCode,
  lockGame,
  secret,
  startState,
  type Lobby,
  type LobbySlot,
  type RuleOptions,
} from "@/lib/server/games";

export const dynamic = "force-dynamic";

const AI_NAMES: Record<AIPersonality, string> = {
  balanced: "Munshi Gopal",
  cautious: "Seth Dhanraj",
  aggressive: "Tycoon Vikram",
  trader: "Trader Meera",
};
const PERSONALITIES: AIPersonality[] = ["balanced", "cautious", "aggressive", "trader"];
const DIFFS: AIDifficulty[] = ["easy", "medium", "hard"];

function freeToken(used: string[], wanted: string): string {
  if (!used.includes(wanted)) return wanted;
  return TOKENS.find((t) => !used.includes(t.id))?.id ?? wanted;
}

function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function createOnlineRoom(host: string, token: string, slotKinds: string[], opts: RuleOptions, isPublic: boolean, diff: AIDifficulty) {
  const { config, ruleKey } = buildConfig(opts);
  const slots: LobbySlot[] = [{ name: host, kind: "human", token, claimed: true }];
  let aiIdx = 0;
  const used = [token];
  for (const k of slotKinds.slice(0, 3)) {
    if (k === "ai") {
      const personality = PERSONALITIES[aiIdx++ % 4];
      const t = freeToken(used, TOKENS[(slots.length * 2 + 1) % TOKENS.length].id);
      used.push(t);
      slots.push({ name: AI_NAMES[personality], kind: "ai", token: t, personality, difficulty: diff, claimed: true });
    } else {
      const t = freeToken(used, TOKENS[(slots.length * 2) % TOKENS.length].id);
      used.push(t);
      slots.push({ name: `Seat ${slots.length + 1}`, kind: "human", token: t, claimed: false });
    }
  }
  const lobby: Lobby = { config, slots };
  const hostSecret = secret();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await db.insert(games).values({
        code,
        mode: "online",
        status: "lobby",
        isPublic,
        ruleKey,
        lobby,
        seats: [hostSecret, ...slots.slice(1).map(() => null)],
      });
      return Response.json({ code, seat: 0, secret: hostSecret });
    } catch {
      /* code collision: retry */
    }
  }
  return err("Could not create room", 500);
}

async function joinRoom(code: string, name: string, token: string) {
  return db.transaction(async (tx) => {
    const row = await lockGame(tx, code);
    if (!row) return err("Room not found", 404);
    if (row.status !== "lobby" || !row.lobby) return err("This match has already started");
    const lobby = row.lobby as Lobby;
    const i = lobby.slots.findIndex((s) => s.kind === "human" && !s.claimed);
    if (i < 0) return err("Room is full");
    const used = lobby.slots.map((s, k) => (k === i ? "" : s.token));
    lobby.slots[i] = { ...lobby.slots[i], name, token: freeToken(used, token), claimed: true };
    const sec = secret();
    const seats = row.seats.slice();
    seats[i] = sec;
    await tx.update(games).set({ lobby, seats, updatedAt: new Date() }).where(eq(games.code, code));
    return Response.json({ code, seat: i, secret: sec });
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }
  const action = String(body.action ?? "");
  const opts = (body.options ?? {}) as RuleOptions;

  if (action === "local") {
    const list = Array.isArray(body.players) ? body.players.slice(0, 4) : [];
    if (list.length < 2) return err("2 to 4 players required");
    const used: string[] = [];
    const slots: LobbySlot[] = list.map((raw, i) => {
      const p = raw as Record<string, unknown>;
      const kind = p.kind === "ai" ? "ai" : "human";
      const personality = PERSONALITIES.includes(p.personality as AIPersonality) ? (p.personality as AIPersonality) : PERSONALITIES[i % 4];
      const difficulty = DIFFS.includes(p.difficulty as AIDifficulty) ? (p.difficulty as AIDifficulty) : "medium";
      const token = freeToken(used, cleanToken(p.token, TOKENS[i].id));
      used.push(token);
      const name = kind === "ai" ? AI_NAMES[personality] : cleanName(p.name, `Player ${i + 1}`);
      return { name, kind, token, personality: kind === "ai" ? personality : undefined, difficulty: kind === "ai" ? difficulty : undefined, claimed: true };
    });
    // Disambiguate duplicate names.
    const seen = new Map<string, number>();
    for (const s of slots) {
      const n = (seen.get(s.name) ?? 0) + 1;
      seen.set(s.name, n);
      if (n > 1) s.name = `${s.name} ${n}`;
    }
    const { config, ruleKey } = buildConfig(opts);
    const lobby: Lobby = { config, slots };
    const { state, commit, reveal } = startState(lobby);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      try {
        await db.insert(games).values({
          code,
          mode: "local",
          status: "playing",
          ruleKey,
          lobby,
          state,
          seats: [],
          seedCommit: commit,
          seedReveal: reveal,
        });
        return Response.json({ code });
      } catch {
        /* retry */
      }
    }
    return err("Could not create game", 500);
  }

  const name = cleanName(body.name, "Guest");
  const token = cleanToken(body.token, "rickshaw");

  if (action === "create") {
    const kinds = Array.isArray(body.slots) ? (body.slots as unknown[]).map(String) : ["open"];
    const diff = DIFFS.includes(body.difficulty as AIDifficulty) ? (body.difficulty as AIDifficulty) : "medium";
    return createOnlineRoom(name, token, kinds.length ? kinds : ["open"], opts, body.isPublic === true, diff);
  }

  if (action === "join") {
    const code = String(body.code ?? "").toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) return err("Enter a 6-character room code");
    return joinRoom(code, name, token);
  }

  if (action === "quick") {
    const ruleKey = body.ruleKey === "classic" ? "classic" : "bharat";
    const open = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "lobby"), eq(games.isPublic, true), eq(games.ruleKey, ruleKey)))
      .limit(10);
    for (const r of open) {
      const lobby = r.lobby as Lobby | null;
      if (lobby?.slots.some((s) => s.kind === "human" && !s.claimed)) {
        const res = await joinRoom(r.code, name, token);
        if (res.status === 200) return res;
      }
    }
    return createOnlineRoom(name, token, ["open", "open"], { mode: ruleKey, roundLimit: 30 }, true, "medium");
  }

  return err("Unknown action");
}
