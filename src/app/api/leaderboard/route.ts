import { desc } from "drizzle-orm";
import { db } from "@/db";
import { matchResults } from "@/db/schema";

export const dynamic = "force-dynamic";

interface Row {
  name: string;
  wins: number;
  games: number;
  best: number;
}

export async function GET() {
  const rows = await db.select().from(matchResults).orderBy(desc(matchResults.id)).limit(500);
  const table = new Map<string, Row>();
  let rounds = 0;
  for (const r of rows) {
    rounds += r.rounds;
    const players = r.players as { name: string; kind: string; net: number }[];
    for (const p of players) {
      if (p.kind === "ai") continue;
      const e = table.get(p.name) ?? { name: p.name, wins: 0, games: 0, best: 0 };
      e.games++;
      if (p.name === r.winner) e.wins++;
      e.best = Math.max(e.best, p.net);
      table.set(p.name, e);
    }
  }
  const leaders = [...table.values()].sort((a, b) => b.wins - a.wins || b.best - a.best).slice(0, 25);
  const recent = rows.slice(0, 10).map((r) => ({ code: r.code, winner: r.winner, winnerKind: r.winnerKind, rounds: r.rounds, reason: r.reason, ruleKey: r.ruleKey, at: r.createdAt }));
  return Response.json({
    leaders,
    recent,
    totals: { matches: rows.length, avgRounds: rows.length ? Math.round(rounds / rows.length) : 0 },
  });
}
