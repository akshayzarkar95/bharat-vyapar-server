import { createHash, randomBytes, randomInt } from "crypto";
import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "@/db";
import { gameEvents, games, matchResults } from "@/db/schema";
import {
  CLASSIC_BHARAT,
  DEFAULT_CONFIG,
  TOKENS,
  aiDecision,
  applyCommand,
  createGame,
  expectedActor,
  makeConfig,
  netWorth,
  safeDefault,
  type AIDifficulty,
  type AIPersonality,
  type BharatToggles,
  type Command,
  type GameEvent,
  type GameState,
  type PlayerSetup,
  type RuleConfig,
} from "@/core";

export type GameRow = typeof games.$inferSelect;

export interface LobbySlot {
  name: string;
  kind: "human" | "ai";
  token: string;
  personality?: AIPersonality;
  difficulty?: AIDifficulty;
  claimed: boolean;
}
export interface Lobby {
  config: RuleConfig;
  slots: LobbySlot[];
}

export interface RuleOptions {
  mode?: "classic" | "bharat";
  toggles?: Partial<BharatToggles>;
  roundLimit?: number;
  timerSeconds?: number;
  startCash?: number;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function genCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

export function secret(): string {
  return randomBytes(16).toString("hex");
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
};

export function buildConfig(o: RuleOptions = {}): { config: RuleConfig; ruleKey: string } {
  const classic = o.mode === "classic";
  const toggles: BharatToggles = classic ? { ...CLASSIC_BHARAT } : { ...DEFAULT_CONFIG.bharat };
  if (!classic && o.toggles) {
    for (const k of Object.keys(toggles) as (keyof BharatToggles)[]) {
      if (typeof o.toggles[k] === "boolean") toggles[k] = o.toggles[k]!;
    }
  }
  const config = makeConfig({
    roundLimit: clamp(o.roundLimit, 0, 100, 30),
    timerSeconds: clamp(o.timerSeconds, 0, 120, 0),
    startCash: clamp(o.startCash, 5000, 100000, DEFAULT_CONFIG.startCash),
    bharat: toggles,
  });
  return { config, ruleKey: classic ? "classic" : "bharat" };
}

export function cleanName(n: unknown, fallback: string): string {
  const s = String(n ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 14);
  return s || fallback;
}
export function cleanToken(t: unknown, fallback: string): string {
  const id = String(t ?? "");
  return TOKENS.some((x) => x.id === id) ? id : fallback;
}

export function startState(lobby: Lobby): { state: GameState; commit: string; reveal: string } {
  const seed = randomInt(1, 2 ** 31 - 1);
  const salt = randomBytes(8).toString("hex");
  const setups: PlayerSetup[] = lobby.slots.map((s) => ({
    name: s.name,
    kind: s.kind,
    token: s.token,
    personality: s.personality,
    difficulty: s.difficulty,
  }));
  const state = createGame(setups, lobby.config, seed);
  const reveal = `${seed}:${salt}`;
  const commit = createHash("sha256").update(reveal).digest("hex");
  return { state, commit, reveal };
}

export function view(row: GameRow, events: { seq: number; events: GameEvent[]; actor: number }[] = []) {
  const finished = row.status === "finished";
  return {
    code: row.code,
    mode: row.mode,
    status: row.status,
    ruleKey: row.ruleKey,
    lobby: row.lobby,
    state: row.state as GameState | null,
    seq: row.seq,
    seedCommit: row.seedCommit,
    seedReveal: finished ? row.seedReveal : null,
    events,
  };
}

export async function loadEvents(code: string, since: number) {
  const rows = await db
    .select({ seq: gameEvents.seq, events: gameEvents.events, actor: gameEvents.actor })
    .from(gameEvents)
    .where(and(eq(gameEvents.code, code), gt(gameEvents.seq, since)))
    .orderBy(asc(gameEvents.seq));
  return rows.map((r) => ({ seq: r.seq, actor: r.actor, events: r.events as GameEvent[] }));
}

export function checkSeat(row: GameRow, seat: unknown, sec: unknown): boolean {
  if (row.mode === "local") return true;
  const i = Number(seat);
  return Number.isInteger(i) && !!row.seats[i] && row.seats[i] === sec;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockGame(tx: Tx, code: string): Promise<GameRow | null> {
  const rows = await tx.select().from(games).where(eq(games.code, code)).for("update");
  return rows[0] ?? null;
}

/** Applies a command (or AI step) inside a transaction and persists the result. */
export async function runCommand(
  tx: Tx,
  row: GameRow,
  actor: number,
  cmd: Command,
): Promise<{ ok: true; row: GameRow; events: GameEvent[] } | { ok: false; error: string }> {
  const state = row.state as GameState | null;
  if (!state || row.status !== "playing") return { ok: false, error: "Game is not in progress" };
  const res = applyCommand(state, actor, cmd);
  if (!res.ok) return { ok: false, error: res.error };
  const ns = res.state;
  const finished = ns.phase === "gameover";
  await tx.insert(gameEvents).values({ code: row.code, seq: ns.seq, actor, command: cmd, events: res.events });
  const [updated] = await tx
    .update(games)
    .set({ state: ns, seq: ns.seq, status: finished ? "finished" : "playing", updatedAt: new Date() })
    .where(eq(games.code, row.code))
    .returning();
  if (finished && !row.resultRecorded) {
    const w = ns.players[ns.winner!];
    await tx.insert(matchResults).values({
      code: row.code,
      winner: w.name,
      winnerKind: w.kind,
      reason: ns.endReason ?? "",
      rounds: ns.round,
      ruleKey: row.ruleKey,
      players: ns.players.map((p) => ({ name: p.name, kind: p.kind, bankrupt: p.bankrupt, net: netWorth(ns, p.id) })),
    });
    await tx.update(games).set({ resultRecorded: true }).where(eq(games.code, row.code));
  }
  return { ok: true, row: updated, events: res.events };
}

export function aiMove(state: GameState, force: boolean) {
  return force ? safeDefault(state) : aiDecision(state);
}
export { expectedActor };
