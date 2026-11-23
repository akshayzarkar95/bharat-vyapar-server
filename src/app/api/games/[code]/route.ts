import { eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { type Command } from "@/core";
import { aiMove, checkSeat, loadEvents, lockGame, runCommand, startState, view, type Lobby } from "@/lib/server/games";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const [row] = await db.select().from(games).where(eq(games.code, code.toUpperCase())).limit(1);
  if (!row) return bad("Game not found", 404);
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam === null ? Math.max(0, row.seq - 40) : Number(sinceParam) || 0;
  const events = await loadEvents(row.code, since);
  return Response.json(view(row, events));
}

export async function POST(req: Request, ctx: Ctx) {
  const { code: raw } = await ctx.params;
  const code = raw.toUpperCase();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const action = String(body.action ?? "");

  return db.transaction(async (tx) => {
    const row = await lockGame(tx, code);
    if (!row) return bad("Game not found", 404);
    if (!checkSeat(row, body.seat, body.secret)) return bad("Not authorised for this seat", 403);

    if (action === "start") {
      if (row.status !== "lobby" || !row.lobby) return bad("Already started");
      if (Number(body.seat) !== 0) return bad("Only the host can start", 403);
      const lobby = row.lobby as Lobby;
      const keep = lobby.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.claimed || s.kind === "ai");
      if (keep.length < 2) return bad("Need at least 2 players. Add an AI or wait for a friend.");
      const slots = keep.map((k) => k.s);
      const seats = keep.map((k) => row.seats[k.i] ?? null);
      const nl: Lobby = { ...lobby, slots };
      const { state, commit, reveal } = startState(nl);
      const [u] = await tx
        .update(games)
        .set({ lobby: nl, seats, state, status: "playing", seedCommit: commit, seedReveal: reveal, seq: 0, updatedAt: new Date() })
        .where(eq(games.code, code))
        .returning();
      return Response.json(view(u));
    }

    if (action === "command") {
      const seat = row.mode === "local" ? Number(body.actor ?? body.seat) : Number(body.seat);
      const r = await runCommand(tx, row, seat, body.cmd as Command);
      if (!r.ok) return Response.json({ error: r.error, ...view(row) }, { status: 409 });
      return Response.json({ ...view(r.row), events: [{ seq: r.row.seq, actor: seat, events: r.events }] });
    }

    if (action === "ai") {
      const state = row.state as import("@/core").GameState | null;
      if (!state || row.status !== "playing") return bad("Game is not in progress");
      const force = body.force === true && (row.mode === "local" || Number(body.seat) === 0);
      const mv = aiMove(state, force);
      if (!mv) return Response.json({ idle: true, ...view(row) });
      const r = await runCommand(tx, row, mv.actor, mv.cmd);
      if (!r.ok) {
        return Response.json({ idle: true, error: r.error, ...view(row) });
      }
      const events = r.events.slice();
      return Response.json({
        ...view(r.row),
        note: mv.note,
        events: [{ seq: r.row.seq, actor: mv.actor, events }],
      });
    }

    return bad("Unknown action");
  });
}
