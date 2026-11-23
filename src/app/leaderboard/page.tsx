"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { inr } from "@/core";

interface Data {
  leaders: { name: string; wins: number; games: number; best: number }[];
  recent: { code: string; winner: string; winnerKind: string; rounds: number; reason: string; ruleKey: string }[];
  totals: { matches: number; avgRounds: number };
}

export default function LeaderboardPage() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ leaders: [], recent: [], totals: { matches: 0, avgRounds: 0 } }));
  }, []);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="title-font text-3xl font-black text-[#f5c04a]">🏆 Leaderboard & Stats</h1>
        <Link href="/" className="btn alt sm">
          Menu
        </Link>
      </div>
      {!d ? (
        <p className="animate-pulse">Loading…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="panel p-3 text-center">
              <div className="text-3xl font-black text-[#ffd45e]">{d.totals.matches}</div>
              <div className="text-xs uppercase opacity-70">Matches finished</div>
            </div>
            <div className="panel p-3 text-center">
              <div className="text-3xl font-black text-[#ffd45e]">{d.totals.avgRounds}</div>
              <div className="text-xs uppercase opacity-70">Avg rounds</div>
            </div>
          </div>
          <div className="panel mb-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-left text-xs uppercase">
                <tr>
                  <th className="p-2">#</th>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Games</th>
                  <th>Win %</th>
                  <th className="pr-2 text-right">Best net worth</th>
                </tr>
              </thead>
              <tbody>
                {d.leaders.map((l, i) => (
                  <tr key={l.name} className="border-t border-white/10">
                    <td className="p-2 font-black">{i + 1}</td>
                    <td className="font-bold">{l.name}</td>
                    <td>{l.wins}</td>
                    <td>{l.games}</td>
                    <td>{Math.round((l.wins / l.games) * 100)}%</td>
                    <td className="pr-2 text-right">{inr(l.best)}</td>
                  </tr>
                ))}
                {d.leaders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center opacity-70">
                      No finished matches yet. Finish a game to appear here!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h2 className="mb-2 font-black uppercase tracking-wider opacity-70">Recent matches</h2>
          <div className="space-y-2">
            {d.recent.map((r) => (
              <div key={r.code} className="panel flex items-center justify-between p-2 text-sm">
                <span>
                  <b>{r.winner}</b> {r.winnerKind === "ai" ? "🤖" : ""} won in {r.rounds} rounds
                </span>
                <span className="chip">{r.ruleKey}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
