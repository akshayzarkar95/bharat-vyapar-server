import { GROUP_TILES, TILES, RAIL_TILES } from "./data";
import {
  alive,
  buildCost,
  expectedActor,
  liquidationValue,
  minBid,
  mortgageValue,
  netWorth,
  ownedTiles,
  regionCount,
  rentFor,
  tradable,
  unmortgageCost,
  whyCantBuild,
  whyCantMortgage,
  whyCantSell,
} from "./engine";
import type { AIPersonality, Command, GameState, Player, Trade } from "./types";

export interface AIMove {
  actor: number;
  cmd: Command;
  note?: string;
}

/** Probability of each 2d6 total, used for expected-rent scoring. */
export const DICE_PROB: Record<number, number> = {
  2: 1 / 36, 3: 2 / 36, 4: 3 / 36, 5: 4 / 36, 6: 5 / 36, 7: 6 / 36, 8: 5 / 36, 9: 4 / 36, 10: 3 / 36, 11: 2 / 36, 12: 1 / 36,
};

interface Profile {
  reserve: number;
  greed: number;
  tradeLove: number;
}

const PROFILES: Record<AIPersonality, Profile> = {
  balanced: { reserve: 1200, greed: 1.0, tradeLove: 0.3 },
  cautious: { reserve: 3000, greed: 0.8, tradeLove: 0.15 },
  aggressive: { reserve: 300, greed: 1.3, tradeLove: 0.3 },
  trader: { reserve: 1000, greed: 1.05, tradeLove: 1 },
};

/** Utility score of owning a tile for player `pid`. */
export function tileValue(s: GameState, pid: number, id: number): number {
  const t = TILES[id];
  let v = t.price * 0.95;
  if (t.kind === "city") {
    const grp = GROUP_TILES[t.group!];
    const mine = grp.filter((g) => s.tiles[g].owner === pid && g !== id).length;
    const others = grp.filter((g) => g !== id);
    if (mine === others.length) v *= 1.9; // completes the set
    else if (mine > 0) v *= 1.3;
    else {
      const opp = new Set(others.map((g) => s.tiles[g].owner).filter((o) => o !== null && o !== pid));
      const oppAll = [...opp].some((o) => others.every((g) => s.tiles[g].owner === o));
      if (oppAll) v *= 1.5; // block a rival's set
    }
    if (s.config.bharat.regional && t.region && regionCount(s, pid, t.region) + 1 >= s.config.regionalMinCities) v *= 1.15;
  } else if (t.kind === "railway") {
    const mine = RAIL_TILES.filter((r) => s.tiles[r].owner === pid).length;
    v *= 1 + 0.25 * mine;
  } else v *= 0.8;
  return v;
}

function reserveFor(p: Player, minimal: boolean): number {
  const prof = PROFILES[minimal ? "cautious" : p.personality];
  const noise = p.difficulty === "easy" ? 0.5 + Math.random() : 1;
  return prof.reserve * noise;
}

function evalTrade(s: GameState, me: Player, t: Trade): { accept: boolean; reason: string } {
  const prof = PROFILES[me.personality];
  const valueIn =
    t.give.cash + t.give.jailCards * 500 + t.give.tiles.reduce((a, id) => a + tileValue(s, me.id, id), 0);
  let valueOut = t.get.cash + t.get.jailCards * 500;
  let completes = false;
  for (const id of t.get.tiles) {
    let v = tileValue(s, me.id, id) * 1.1;
    const tl = TILES[id];
    if (tl.kind === "city") {
      const grp = GROUP_TILES[tl.group!];
      const wouldComplete = grp.every((g) => g === id || t.give.tiles.includes(g) || s.tiles[g].owner === t.from);
      if (wouldComplete) {
        completes = true;
        v *= me.difficulty === "hard" ? 2 : 1.8;
      }
    }
    valueOut += v;
  }
  if (me.cash - t.get.cash < 800) return { accept: false, reason: "That would leave me short of cash." };
  const margin = me.personality === "cautious" ? 1.1 : me.personality === "aggressive" ? 0.97 : 1.0;
  const need = valueOut * margin;
  const accept = valueIn >= need * (me.difficulty === "hard" ? 1.03 : 1) && valueIn >= valueOut * 0.5;
  void prof;
  if (accept) return { accept: true, reason: "" };
  if (t.bargain) return { accept: false, reason: "Not for sale at that price." };
  if (completes) return { accept: false, reason: "I won't hand you a full colour set that cheaply." };
  return { accept: false, reason: valueIn < valueOut * 0.7 ? "That offer is far too low." : "Close, but I need a bit more." };
}

function findTrade(s: GameState, me: Player, reserve: number): Trade | null {
  for (let g = 1; g <= 8; g++) {
    const grp = GROUP_TILES[g];
    const mine = grp.filter((t) => s.tiles[t].owner === me.id);
    const missing = grp.filter((t) => s.tiles[t].owner !== me.id);
    if (mine.length === 0 || missing.length !== 1) continue;
    const tile = missing[0];
    const owner = s.tiles[tile].owner;
    if (owner === null || s.players[owner].bankrupt || !tradable(s, owner, tile)) continue;
    if (grp.some((t) => s.tiles[t].houses > 0)) continue;
    const offer = Math.round((TILES[tile].price * 2.1) / 100) * 100;
    if (me.cash - offer < reserve * 0.5) continue;
    if (s.players[owner].cash < 0) continue;
    return { from: me.id, to: owner, give: { cash: offer, tiles: [], jailCards: 0 }, get: { cash: 0, tiles: [tile], jailCards: 0 } };
  }
  return null;
}

export function aiDecision(s: GameState): AIMove | null {
  const actor = expectedActor(s);
  if (actor < 0) return null;
  const p = s.players[actor];
  if (p.kind !== "ai") return null;
  return decide(s, p, false);
}

/** Safe default used when a human's turn timer expires. */
export function safeDefault(s: GameState): AIMove | null {
  const actor = expectedActor(s);
  if (actor < 0) return null;
  return decide(s, s.players[actor], true);
}

function decide(s: GameState, p: Player, minimal: boolean): AIMove | null {
  const prof = PROFILES[minimal ? "cautious" : p.personality];
  const reserve = reserveFor(p, minimal);
  const mv = (cmd: Command, note?: string): AIMove => ({ actor: p.id, cmd, note });

  // 1. Pending trade offer addressed to me.
  if (s.trade) {
    if (s.trade.to !== p.id) return null;
    if (minimal) return mv({ type: "REJECT_TRADE" });
    const r = evalTrade(s, p, s.trade);
    return r.accept ? mv({ type: "ACCEPT_TRADE" }) : mv({ type: "REJECT_TRADE", reason: r.reason });
  }

  // 2. Auction.
  if (s.phase === "auction" && s.auction) {
    const a = s.auction;
    const nb = minBid(s);
    const bluff = p.difficulty === "hard" ? 1 + Math.random() * 0.1 : 0.85 + Math.random() * 0.3;
    const val = tileValue(s, p.id, a.tile) * prof.greed * bluff;
    const cap = Math.min(val, p.cash - reserve * 0.4);
    if (!minimal && nb <= cap) {
      const bump = Math.random() < 0.3 ? Math.floor(Math.random() * 3) * 100 : 0;
      const amt = nb + Math.max(0, Math.min(bump, Math.floor(cap - nb)));
      return mv({ type: "BID", amount: Math.round(amt / 100) * 100 >= nb ? Math.round(amt / 100) * 100 : nb });
    }
    return mv({ type: "PASS_BID" });
  }

  // 3. Buy decision.
  if (s.phase === "buy" && s.pendingBuy !== null) {
    const t = TILES[s.pendingBuy];
    const val = tileValue(s, p.id, t.id);
    const after = p.cash - t.price;
    const special = val > t.price * 1.2;
    const ok = minimal
      ? after >= reserve
      : p.difficulty === "easy"
        ? after >= reserve * 0.5 && Math.random() < 0.8
        : after >= reserve || (special && after >= reserve * 0.3) || (t.kind === "railway" && after >= reserve * 0.5);
    return mv({ type: ok ? "BUY" : "DECLINE" });
  }

  // 4. Income tax.
  if (s.phase === "tax") {
    const pct = Math.round((netWorth(s, p.id) * s.config.incomeTaxPct) / 100);
    return mv({ type: "PAY_TAX", choice: pct < s.config.incomeTaxFlat ? "percent" : "flat" });
  }

  // 5. Debt.
  if (s.phase === "debt" && s.debt) {
    const d = s.debt;
    if (p.cash >= d.amount) {
      if (d.canWaive && p.jugaad.includes("sifarish") && (d.amount >= 800 || p.cash - d.amount < reserve)) return mv({ type: "USE_SIFARISH" });
      return mv({ type: "PAY_DEBT" });
    }
    const loanRoom = s.config.bharat.loan ? s.config.loanMax - p.loan : 0;
    if (liquidationValue(s, p.id) + loanRoom < d.amount) return mv({ type: "BANKRUPT" });
    const mort = ownedTiles(s, p.id)
      .filter((id) => !whyCantMortgage(s, p.id, id))
      .sort((a, b) => tileValue(s, p.id, a) - tileValue(s, p.id, b));
    if (mort.length) return mv({ type: "MORTGAGE", tile: mort[0] });
    const sell = ownedTiles(s, p.id)
      .filter((id) => !whyCantSell(s, p.id, id))
      .sort((a, b) => s.tiles[b].houses - s.tiles[a].houses);
    if (sell.length) return mv({ type: "SELL_BUILDING", tile: sell[0] });
    if (loanRoom >= 100) {
      const need = Math.ceil((d.amount - p.cash) / 100) * 100;
      return mv({ type: "TAKE_LOAN", amount: Math.min(loanRoom, Math.max(100, need)) });
    }
    return mv({ type: "BANKRUPT" });
  }

  if (s.phase !== "roll" && s.phase !== "post") return null;

  // 6. Normal turn actions.
  if (s.phase === "roll" && p.inJail) {
    if (p.jailCards > 0) return mv({ type: "JAIL_CARD" });
    const early = s.round < 12;
    if (!minimal && early && p.cash > reserve + s.config.jailFine * 2 && (p.personality === "aggressive" || p.difficulty === "hard")) return mv({ type: "JAIL_PAY" });
    return mv({ type: "ROLL" });
  }

  if (!minimal) {
    if (p.loan > 0 && p.cash >= p.loan + reserve + 1500) return mv({ type: "REPAY_LOAN", amount: p.loan });

    for (const id of ownedTiles(s, p.id)) {
      if (s.tiles[id].waterlogged && TILES[id].price >= 4000 && p.cash >= reserve + s.config.drainageFee) return mv({ type: "PAY_DRAINAGE", tile: id });
    }
    const mortgaged = ownedTiles(s, p.id)
      .filter((id) => s.tiles[id].mortgaged && p.cash - unmortgageCost(s, id) >= reserve * 1.5)
      .sort((a, b) => tileValue(s, p.id, b) - tileValue(s, p.id, a));
    if (mortgaged.length) return mv({ type: "UNMORTGAGE", tile: mortgaged[0] });

    const builds = ownedTiles(s, p.id).filter((id) => {
      if (whyCantBuild(s, p.id, id)) return false;
      return p.cash - buildCost(s, p.id, id) >= reserve;
    });
    if (builds.length) {
      if (p.jugaad.includes("jugaad") && !p.nextBuildHalf && buildCost(s, p.id, builds[0]) >= 1500) return mv({ type: "USE_JUGAAD" });
      builds.sort((a, b) => s.tiles[a].houses - s.tiles[b].houses || TILES[b].price - TILES[a].price);
      return mv({ type: "BUILD", tile: builds[0] });
    }

    if (p.jugaad.includes("bargain") && p.cash > reserve + s.config.bargainOffer && p.difficulty !== "easy") {
      const t = TILES[p.pos];
      const o = s.tiles[p.pos].owner;
      if ((t.kind === "city" || t.kind === "railway") && o !== null && o !== p.id && tileValue(s, p.id, p.pos) > t.price * 1.5 && tradable(s, o, p.pos)) {
        return mv({ type: "USE_BARGAIN" });
      }
    }

    if (p.lastTradeRound <= s.round - 2 && (Math.random() < prof.tradeLove || (p.difficulty === "hard" && p.personality !== "cautious"))) {
      const t = findTrade(s, p, reserve);
      if (t) {
        const { from, ...rest } = t;
        void from;
        return mv({ type: "PROPOSE_TRADE", trade: rest });
      }
      p.lastTradeRound = s.round; // local mutation only affects the in-memory snapshot; harmless
    }
  }

  return s.phase === "roll" ? mv({ type: "ROLL" }) : mv({ type: "END_TURN" });
}

/** Helper used by the UI to show which players could still win. */
export function standings(s: GameState) {
  return alive(s)
    .map((p) => ({ id: p.id, name: p.name, net: netWorth(s, p.id) }))
    .sort((a, b) => b.net - a.net);
}

export { rentFor, mortgageValue };
