// Self-play simulation harness: npx tsx scripts/sim.ts [games] [players] [roundLimit]
import { aiDecision, applyCommand, createGame, makeConfig, netWorth, type AIPersonality, type PlayerSetup } from "../src/core";

const games = Number(process.argv[2] ?? 50);
const n = Number(process.argv[3] ?? 3);
const limit = Number(process.argv[4] ?? 40);
const pers: AIPersonality[] = ["balanced", "cautious", "aggressive", "trader"];
const wins = new Array(n).fill(0);
let rounds = 0, finished = 0, stuck = 0, errors = 0, bankr = 0;
const errMsgs = new Map<string, number>();
for (let g = 0; g < games; g++) {
  const setups: PlayerSetup[] = Array.from({ length: n }, (_, i) => ({ name: "P" + i, kind: "ai", token: "tiger", personality: pers[i % 4], difficulty: "medium" }));
  let s = createGame(setups, makeConfig({ roundLimit: limit }), 1000 + g);
  let steps = 0;
  while (s.phase !== "gameover" && steps < 20000) {
    steps++;
    const mv = aiDecision(s);
    if (!mv) { stuck++; console.log("no AI move", s.phase, s.current, s.trade, s.auction); break; }
    const r = applyCommand(s, mv.actor, mv.cmd);
    if (!r.ok) { errors++; errMsgs.set(mv.cmd.type + ": " + r.error, (errMsgs.get(mv.cmd.type + ": " + r.error) ?? 0) + 1); 
      // force progress
      const r2 = applyCommand(s, mv.actor, { type: s.phase === "roll" ? "ROLL" : "END_TURN" });
      if (r2.ok) s = r2.state; else { stuck++; break; }
      continue; }
    s = r.state;
  }
  if (s.phase === "gameover") { finished++; wins[s.winner!]++; rounds += s.round; bankr += s.players.filter(p => p.bankrupt).length; }
  else if (steps >= 20000) { stuck++; }
}
console.log({ games, finished, stuck, errors, avgRounds: rounds / Math.max(1, finished), avgBankruptcies: bankr / Math.max(1, finished), wins });
console.log([...errMsgs.entries()].slice(0, 10));
void netWorth;
