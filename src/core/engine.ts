import {
  CLASSIC_BHARAT,
  DEFAULT_CONFIG,
  FESTIVALS,
  FESTIVAL_ORDER,
  GROUP_TILES,
  KHAZANA,
  NASEEB,
  PLAYER_COLORS,
  RAIL_TILES,
  REGIONS,
  RICKSHAW_FACES,
  TILES,
  UTILITY_TILES,
  isBuyable,
  type CardDef,
} from "./data";
import type {
  Auction,
  BharatToggles,
  Command,
  GameEvent,
  GameState,
  JugaadCard,
  Player,
  PlayerSetup,
  Region,
  Result,
  RuleConfig,
  Trade,
  TradeSide,
} from "./types";

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export function inr(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  let out: string;
  if (s.length <= 3) out = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = rest + "," + last3;
  }
  return (neg ? "-₹" : "₹") + out;
}

class RuleError extends Error {}
function fail(msg: string): never {
  throw new RuleError(msg);
}

function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(s: GameState, n: number): number {
  return Math.floor(rand(s) * n);
}
function shuffle<T>(s: GameState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Ev = GameEvent[];
function emit(ev: Ev, t: string, msg: string, extra: Partial<GameEvent> = {}) {
  ev.push({ t, msg, ...extra });
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export function makeConfig(
  partial: Partial<Omit<RuleConfig, "bharat">> & { bharat?: Partial<BharatToggles> | "classic" } = {},
): RuleConfig {
  const { bharat, ...rest } = partial;
  const toggles =
    bharat === "classic"
      ? { ...CLASSIC_BHARAT }
      : { ...DEFAULT_CONFIG.bharat, ...(bharat ?? {}) };
  return { ...DEFAULT_CONFIG, ...rest, bharat: toggles };
}

export function createGame(setups: PlayerSetup[], config: RuleConfig, seed: number): GameState {
  if (setups.length < 2 || setups.length > 4) throw new Error("2 to 4 players required");
  const s = {
    version: 1,
    seed,
    rng: seed | 0,
    config,
    players: [] as Player[],
    tiles: TILES.map(() => ({ owner: null, houses: 0, mortgaged: false, footfall: 0, waterlogged: false })),
    current: 0,
    phase: "roll",
    dice: null,
    rickshaw: null,
    rollId: 0,
    extraRoll: false,
    round: 1,
    turns: 0,
    pendingBuy: null,
    auction: null,
    trade: null,
    debt: null,
    resume: null,
    decks: { naseeb: [], khazana: [] },
    festival: null,
    monsoon: null,
    festivalCount: 0,
    winner: null,
    endReason: null,
    first: 0,
    startRolls: [],
    seq: 0,
  } as GameState;
  s.players = setups.map((p, i) => ({
    id: i,
    name: p.name,
    kind: p.kind,
    personality: p.personality ?? "balanced",
    difficulty: p.difficulty ?? "medium",
    token: p.token,
    color: PLAYER_COLORS[i],
    cash: config.startCash,
    pos: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    doubles: 0,
    loan: 0,
    credit: config.creditStart,
    loanRounds: 0,
    jugaad: [],
    nextBuildHalf: false,
    heritage: [],
    lastTradeRound: -99,
  }));
  s.decks.naseeb = shuffle(s, NASEEB.map((_, i) => i));
  s.decks.khazana = shuffle(s, KHAZANA.map((_, i) => i));
  // Highest first roll goes first; ties re-roll among tied players.
  let cands = s.players.map((p) => p.id);
  let rolls: number[] = [];
  for (let guard = 0; guard < 20; guard++) {
    rolls = s.players.map(() => 2 + randInt(s, 6) + randInt(s, 6));
    const max = Math.max(...cands.map((c) => rolls[c]));
    cands = cands.filter((c) => rolls[c] === max);
    s.startRolls = rolls;
    if (cands.length === 1) break;
  }
  s.first = cands[0];
  s.current = s.first;
  return s;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export const alive = (s: GameState) => s.players.filter((p) => !p.bankrupt);
export const baseBuildCost = (id: number, c: RuleConfig) => round10((TILES[id].price * c.buildCostPct) / 100);

export function ownsGroup(s: GameState, pid: number, group: number): boolean {
  return GROUP_TILES[group].every((t) => s.tiles[t].owner === pid);
}

export function ownedTiles(s: GameState, pid: number): number[] {
  return TILES.filter((t) => s.tiles[t.id].owner === pid).map((t) => t.id);
}

export function regionCount(s: GameState, pid: number, region: Region): number {
  return TILES.filter((t) => t.region === region && s.tiles[t.id].owner === pid).length;
}

export function buildCost(s: GameState, pid: number, tile: number): number {
  const c = s.config;
  let cost = baseBuildCost(tile, c);
  if (c.bharat.festival && s.festival?.id === "diwali") cost = cost * (1 - c.diwaliBuildDiscountPct / 100);
  if (s.players[pid].nextBuildHalf) cost = cost / 2;
  return round10(cost);
}

export function rentFor(s: GameState, id: number, diceTotal: number): number {
  const t = TILES[id];
  const ts = s.tiles[id];
  const c = s.config;
  if (ts.owner === null || ts.mortgaged || ts.waterlogged) return 0;
  const owner = ts.owner;
  if (t.kind === "railway") {
    const n = RAIL_TILES.filter((r) => s.tiles[r].owner === owner).length;
    return c.railRent[Math.max(0, n - 1)];
  }
  if (t.kind === "utility") {
    const n = UTILITY_TILES.filter((r) => s.tiles[r].owner === owner).length;
    return c.utilityMult[Math.max(0, n - 1)] * diceTotal;
  }
  if (t.kind !== "city") return 0;
  let pct = c.baseRentPct;
  if (ts.houses > 0) pct = c.shopRentPct[ts.houses - 1];
  else if (ownsGroup(s, owner, t.group!)) pct = c.setRentPct;
  let mult = 1;
  const b = c.bharat;
  if (b.festival && s.festival) {
    const f = FESTIVALS[s.festival.id];
    if (f.region && f.region === t.region) mult += c.festivalRentBonusPct / 100;
  }
  if (b.monsoon && s.monsoon && s.monsoon.region === t.region) mult -= c.monsoonRentCutPct / 100;
  if (b.footfall) mult += (ts.footfall * c.footfallPct) / 100;
  if (b.regional && t.region && regionCount(s, owner, t.region) >= c.regionalMinCities) mult += c.regionalRentPct / 100;
  return round10(((t.price * pct) / 100) * mult);
}

export function netWorth(s: GameState, pid: number): number {
  const p = s.players[pid];
  if (p.bankrupt) return 0;
  let w = p.cash - p.loan;
  for (const id of ownedTiles(s, pid)) {
    const ts = s.tiles[id];
    w += ts.mortgaged ? (TILES[id].price * s.config.mortgagePct) / 100 : TILES[id].price;
    w += ts.houses * baseBuildCost(id, s.config);
  }
  return Math.round(w);
}

export function salaryFor(s: GameState, pid: number): number {
  const c = s.config;
  let sal = c.salary;
  if (c.bharat.festival && s.festival?.id === "diwali") sal *= 2;
  if (c.bharat.regional) {
    for (const r of Object.keys(REGIONS) as Region[]) if (regionCount(s, pid, r) >= c.regionalMinCities) sal += c.regionalSalaryBonus;
  }
  return sal;
}

export function unmortgageCost(s: GameState, id: number): number {
  return round10((TILES[id].price * s.config.mortgagePct * (1 + s.config.unmortgageInterestPct / 100)) / 100);
}
export function mortgageValue(s: GameState, id: number): number {
  return Math.round((TILES[id].price * s.config.mortgagePct) / 100);
}

export function whyCantBuild(s: GameState, pid: number, id: number): string | null {
  const t = TILES[id];
  const ts = s.tiles[id];
  if (t.kind !== "city") return "Only cities can be developed";
  if (ts.owner !== pid) return "You do not own this tile";
  if (!ownsGroup(s, pid, t.group!)) return "You need the full colour group";
  const grp = GROUP_TILES[t.group!];
  if (grp.some((g) => s.tiles[g].mortgaged)) return "A tile in this group is mortgaged";
  if (ts.houses >= 5) return "Already a Mall";
  if (grp.some((g) => s.tiles[g].houses < ts.houses)) return "Build evenly across the group";
  if (s.players[pid].cash < buildCost(s, pid, id)) return "Not enough cash";
  return null;
}
export function whyCantSell(s: GameState, pid: number, id: number): string | null {
  const t = TILES[id];
  const ts = s.tiles[id];
  if (ts.owner !== pid || t.kind !== "city") return "Not yours";
  if (ts.houses <= 0) return "Nothing to sell";
  if (GROUP_TILES[t.group!].some((g) => s.tiles[g].houses > ts.houses)) return "Sell evenly across the group";
  return null;
}
export function whyCantMortgage(s: GameState, pid: number, id: number): string | null {
  const t = TILES[id];
  const ts = s.tiles[id];
  if (ts.owner !== pid || !isBuyable(id)) return "Not yours";
  if (ts.mortgaged) return "Already mortgaged";
  if (t.kind === "city" && GROUP_TILES[t.group!].some((g) => s.tiles[g].houses > 0)) return "Sell buildings in this group first";
  return null;
}

/** Tiles that can be traded: group must have no buildings. */
export function tradable(s: GameState, pid: number, id: number): boolean {
  const t = TILES[id];
  if (s.tiles[id].owner !== pid || !isBuyable(id)) return false;
  if (t.kind === "city" && GROUP_TILES[t.group!].some((g) => s.tiles[g].houses > 0)) return false;
  return true;
}

export function liquidationValue(s: GameState, pid: number): number {
  const p = s.players[pid];
  let v = p.cash;
  for (const id of ownedTiles(s, pid)) {
    const ts = s.tiles[id];
    v += (ts.houses * baseBuildCost(id, s.config) * s.config.sellBackPct) / 100;
    if (!ts.mortgaged) v += mortgageValue(s, id);
  }
  return v;
}

export function expectedActor(s: GameState): number {
  if (s.phase === "gameover") return -1;
  if (s.trade) return s.trade.to;
  if (s.phase === "auction" && s.auction) return s.auction.turn;
  if (s.phase === "debt" && s.debt) return s.debt.player;
  return s.current;
}

export function minBid(s: GameState): number {
  const a = s.auction!;
  return a.bidder === null ? s.config.auctionOpeningBid : a.bid + s.config.auctionMinRaise;
}

/* ------------------------------------------------------------------ */
/* Internal mechanics                                                  */
/* ------------------------------------------------------------------ */

function cur(s: GameState): Player {
  return s.players[s.current];
}

function settle(s: GameState) {
  if (s.phase === "gameover") return;
  const p = cur(s);
  if (p.bankrupt) return;
  s.phase = s.extraRoll && !p.inJail ? "roll" : "post";
}

function checkHeritage(s: GameState, ev: Ev) {
  if (!s.config.bharat.heritage) return;
  for (const p of alive(s)) {
    for (const g of [1, 8]) {
      if (!p.heritage.includes(g) && ownsGroup(s, p.id, g)) {
        p.heritage.push(g);
        p.cash += s.config.heritageBonus;
        emit(ev, "heritage", `${p.name} earns a Heritage Bonus of ${inr(s.config.heritageBonus)} for owning all of Group ${g}.`, {
          pid: p.id,
          amount: s.config.heritageBonus,
        });
      }
    }
  }
}

function transferCash(s: GameState, from: number, to: number | "bank", amt: number) {
  s.players[from].cash -= amt;
  if (to !== "bank") s.players[to].cash += amt;
}

/** Charge a player. Returns true if paid; false if a debt state was opened. */
function charge(s: GameState, pid: number, amt: number, creditor: number | "bank", reason: string, ev: Ev, canWaive = false): boolean {
  if (amt <= 0) return true;
  const p = s.players[pid];
  if (p.cash >= amt && !canWaive) {
    transferCash(s, pid, creditor, amt);
    emit(ev, "pay", `${p.name} pays ${inr(amt)} ${creditor === "bank" ? "to the bank" : "to " + s.players[creditor].name} (${reason}).`, {
      pid,
      to: creditor === "bank" ? undefined : creditor,
      amount: amt,
    });
    return true;
  }
  s.debt = { player: pid, amount: amt, creditor, reason, canWaive };
  s.phase = "debt";
  emit(ev, "debt", p.cash >= amt ? `${p.name} owes ${inr(amt)} (${reason}).` : `${p.name} owes ${inr(amt)} (${reason}) but has only ${inr(p.cash)}. Raise funds or go bankrupt.`, {
    pid,
    amount: amt,
  });
  return false;
}

function afterPending(s: GameState, ev: Ev) {
  if (s.resume) {
    const steps = s.resume.steps;
    s.resume = null;
    moveBy(s, steps, ev);
    land(s, ev);
    return;
  }
  settle(s);
}

function giveSalary(s: GameState, p: Player, ev: Ev) {
  const sal = salaryFor(s, p.id);
  p.cash += sal;
  emit(ev, "salary", `${p.name} passes Shubh Aarambh and collects ${inr(sal)}.`, { pid: p.id, amount: sal });
}

function moveBy(s: GameState, steps: number, ev: Ev) {
  const p = cur(s);
  const old = p.pos;
  if (steps >= 0) {
    if (old + steps >= 40) giveSalary(s, p, ev);
    p.pos = (old + steps) % 40;
  } else p.pos = (old + steps + 400) % 40;
  emit(ev, "move", `${p.name} moves to ${TILES[p.pos].name}.`, { pid: p.id, tile: p.pos, data: { from: old } });
}

function moveTo(s: GameState, target: number, ev: Ev) {
  const p = cur(s);
  const old = p.pos;
  if (target < old || (target === 0 && old !== 0)) giveSalary(s, p, ev);
  p.pos = target;
  emit(ev, "move", `${p.name} advances to ${TILES[target].name}.`, { pid: p.id, tile: target, data: { from: old, jump: true } });
}

function sendToJail(s: GameState, pid: number, ev: Ev, why: string) {
  const p = s.players[pid];
  p.pos = 10;
  p.inJail = true;
  p.jailTurns = 0;
  p.doubles = 0;
  s.extraRoll = false;
  emit(ev, "jail", `${p.name} goes to Kaid Khana (${why}).`, { pid, tile: 10 });
  if (pid === s.current) settle(s);
}

function startAuction(s: GameState, tile: number, ev: Ev) {
  const order = alive(s).map((p) => p.id);
  const a: Auction = { tile, bid: 0, bidder: null, active: order, turn: nextActive(s, order, s.current, null) };
  s.auction = a;
  s.pendingBuy = null;
  s.phase = "auction";
  emit(ev, "auction", `${TILES[tile].name} goes to auction. Opening bid ${inr(s.config.auctionOpeningBid)}.`, { tile });
  stepAuction(s, ev);
}

function nextActive(s: GameState, active: number[], from: number, bidder: number | null): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const id = (from + k) % n;
    if (active.includes(id) && id !== bidder) return id;
  }
  return active[0] ?? from;
}

function stepAuction(s: GameState, ev: Ev) {
  const a = s.auction!;
  for (let guard = 0; guard < 10; guard++) {
    if (a.active.length === 0 || (a.active.length === 1 && a.bidder !== null)) {
      finishAuction(s, ev);
      return;
    }
    if (s.players[a.turn].cash < minBid(s)) {
      const old = a.turn;
      a.turn = nextActive(s, a.active, old, a.bidder);
      a.active = a.active.filter((x) => x !== old);
      if (!a.active.includes(a.turn)) a.turn = a.active[0] ?? a.turn;
      continue;
    }
    return;
  }
}

function finishAuction(s: GameState, ev: Ev) {
  const a = s.auction!;
  if (a.bidder === null) {
    emit(ev, "auction_end", `No bids. ${TILES[a.tile].name} stays with the bank.`, { tile: a.tile });
  } else {
    const w = s.players[a.bidder];
    w.cash -= a.bid;
    s.tiles[a.tile].owner = w.id;
    s.tiles[a.tile].footfall = 0;
    emit(ev, "buy", `${w.name} wins ${TILES[a.tile].name} at auction for ${inr(a.bid)}.`, { pid: w.id, tile: a.tile, amount: a.bid, data: { auction: true } });
    checkHeritage(s, ev);
  }
  s.auction = null;
  settle(s);
}

function diceTotal(s: GameState): number {
  return s.dice ? s.dice[0] + s.dice[1] : 7;
}

function land(s: GameState, ev: Ev) {
  const p = cur(s);
  const t = TILES[p.pos];
  const ts = s.tiles[p.pos];
  switch (t.kind) {
    case "city":
    case "railway":
    case "utility": {
      if (ts.owner === null) {
        if (p.cash >= t.price) {
          s.pendingBuy = p.pos;
          s.phase = "buy";
          emit(ev, "offer", `${p.name} lands on ${t.name} (${inr(t.price)}).`, { pid: p.id, tile: p.pos });
          return;
        }
        startAuction(s, p.pos, ev);
        return;
      }
      if (ts.owner === p.id) {
        emit(ev, "visit", `${p.name} visits their own ${t.name}.`, { pid: p.id, tile: p.pos });
        settle(s);
        return;
      }
      const owner = ts.owner;
      const amt = rentFor(s, p.pos, diceTotal(s));
      if (s.config.bharat.footfall && t.kind === "city" && !ts.mortgaged) {
        ts.footfall = Math.min(s.config.footfallMax, ts.footfall + 1);
      }
      if (amt > 0) {
        emit(ev, "rent", `${p.name} owes ${inr(amt)} rent at ${t.name}.`, { pid: p.id, to: owner, amount: amt, tile: p.pos });
        if (!charge(s, p.id, amt, owner, `rent at ${t.name}`, ev, p.jugaad.includes("sifarish"))) return;
      } else {
        emit(ev, "norent", `${p.name} stays at ${t.name}. No rent is due.`, { pid: p.id, tile: p.pos });
      }
      settle(s);
      return;
    }
    case "tax":
      if (t.taxType === "income") {
        s.phase = "tax";
        emit(ev, "taxdue", `${p.name} must pay Income Tax.`, { pid: p.id });
        return;
      }
      if (!charge(s, p.id, s.config.luxuryTax, "bank", "Luxury Tax", ev)) return;
      settle(s);
      return;
    case "naseeb":
    case "khazana":
      drawCard(s, t.kind, ev);
      return;
    case "gotojail":
      sendToJail(s, p.id, ev, "Seedha Jail");
      return;
    default:
      settle(s);
  }
}

function drawCard(s: GameState, deck: "naseeb" | "khazana", ev: Ev) {
  const p = cur(s);
  const pile = s.decks[deck];
  const defs: CardDef[] = deck === "naseeb" ? NASEEB : KHAZANA;
  const idx = pile.shift()!;
  const card = defs[idx];
  emit(ev, "card", `${p.name} draws ${deck === "naseeb" ? "Naseeb" : "Khazana"}: ${card.text}`, {
    pid: p.id,
    data: { deck, text: card.text },
  });
  if (card.kind !== "jailfree") pile.push(idx);
  switch (card.kind) {
    case "collect":
      p.cash += card.amount!;
      emit(ev, "gain", `${p.name} collects ${inr(card.amount!)}.`, { pid: p.id, amount: card.amount });
      break;
    case "pay":
      if (!charge(s, p.id, card.amount!, "bank", "card", ev)) return;
      break;
    case "advance":
      moveTo(s, card.tile!, ev);
      land(s, ev);
      return;
    case "back":
      moveBy(s, -card.amount!, ev);
      land(s, ev);
      return;
    case "jail":
      sendToJail(s, p.id, ev, "card");
      return;
    case "jailfree":
      p.jailCards++;
      break;
    case "repairs": {
      let shops = 0;
      let malls = 0;
      for (const id of ownedTiles(s, p.id)) {
        const h = s.tiles[id].houses;
        if (h === 5) malls++;
        else shops += h;
      }
      const total = shops * card.shop! + malls * card.mall!;
      if (total > 0 && !charge(s, p.id, total, "bank", "repairs", ev)) return;
      break;
    }
    case "collectEach":
      for (const o of alive(s)) {
        if (o.id === p.id) continue;
        const amt = Math.min(o.cash, card.amount!);
        o.cash -= amt;
        p.cash += amt;
      }
      emit(ev, "gain", `${p.name} collects from every player.`, { pid: p.id });
      break;
  }
  settle(s);
}

function returnJailCard(s: GameState) {
  if (!s.decks.naseeb.includes(7)) s.decks.naseeb.push(7);
  else s.decks.khazana.push(4);
}

function nextTurn(s: GameState, ev: Ev) {
  const n = s.players.length;
  const old = s.current;
  const al = alive(s);
  if (al.length <= 1) {
    endGame(s, al[0]?.id ?? old, "Last player standing", ev);
    return;
  }
  let next = old;
  for (let k = 1; k <= n; k++) {
    const id = (old + k) % n;
    if (!s.players[id].bankrupt) {
      next = id;
      break;
    }
  }
  const off = (i: number) => (i - s.first + n) % n;
  const wrapped = off(next) <= off(old);
  s.players[old].doubles = 0;
  s.extraRoll = false;
  s.turns++;
  s.current = next;
  s.phase = "roll";
  s.dice = null;
  s.rickshaw = null;
  if (wrapped) {
    s.round++;
    roundTick(s, ev);
    if (s.config.roundLimit > 0 && s.round > s.config.roundLimit) {
      let best = alive(s)[0];
      for (const p of alive(s)) if (netWorth(s, p.id) > netWorth(s, best.id)) best = p;
      endGame(s, best.id, `Round limit reached. Highest net worth wins (${inr(netWorth(s, best.id))}).`, ev);
      return;
    }
  }
  emit(ev, "turn", `${s.players[next].name}'s turn.`, { pid: next });
}

function endGame(s: GameState, winner: number, reason: string, ev: Ev) {
  s.phase = "gameover";
  s.winner = winner;
  s.endReason = reason;
  s.auction = null;
  s.debt = null;
  s.trade = null;
  emit(ev, "gameover", `${s.players[winner].name} wins! ${reason}`, { pid: winner });
}

function roundTick(s: GameState, ev: Ev) {
  const c = s.config;
  const b = c.bharat;
  emit(ev, "round", `Round ${s.round} begins.`);
  if (b.loan) {
    for (const p of alive(s)) {
      if (p.loan > 0) {
        const rate = c.loanInterestPct + Math.max(0, c.creditStart - p.credit) / 10;
        const interest = Math.round((p.loan * rate) / 100);
        p.loan += interest;
        p.credit = Math.max(300, p.credit - c.creditPenaltyPerRound);
        p.loanRounds++;
        emit(ev, "interest", `${p.name}'s loan grows by ${inr(interest)} (${rate.toFixed(0)}% interest). Credit score ${p.credit}.`, { pid: p.id, amount: interest });
      }
    }
  }
  if (b.festival) {
    if (s.festival) {
      s.festival.turnsLeft--;
      if (s.festival.turnsLeft <= 0) {
        emit(ev, "festival_end", `${FESTIVALS[s.festival.id].name} celebrations end.`);
        s.festival = null;
      }
    }
    if (!s.festival && s.round % c.festivalEvery === 0) {
      const id = FESTIVAL_ORDER[randInt(s, FESTIVAL_ORDER.length)];
      s.festival = { id, turnsLeft: c.festivalDuration };
      s.festivalCount++;
      const f = FESTIVALS[id];
      emit(ev, "festival", `${f.icon} ${f.name} begins! ${f.desc}`, { data: { id } });
      if (id === "holi") {
        const rolls = alive(s).map((p) => ({ p, r: 2 + randInt(s, 6) + randInt(s, 6) }));
        const hi = rolls.reduce((a, x) => (x.r > a.r ? x : a), rolls[0]);
        const lo = rolls.reduce((a, x) => (x.r < a.r ? x : a), rolls[0]);
        if (hi.r !== lo.r) {
          const amt = Math.min(lo.p.cash, c.holiPenalty);
          lo.p.cash -= amt;
          hi.p.cash += amt;
          emit(ev, "holi", `Holi colour splash! ${lo.p.name} rolls ${lo.r} and pays ${inr(amt)} to ${hi.p.name} (${hi.r}).`, { pid: lo.p.id, to: hi.p.id, amount: amt });
        } else emit(ev, "holi", "Holi colour splash! Everyone rolled the same. Nobody pays.");
      }
    }
  }
  if (b.monsoon) {
    if (s.monsoon) {
      s.monsoon.turnsLeft--;
      if (s.monsoon.turnsLeft <= 0) {
        for (const ts of s.tiles) ts.waterlogged = false;
        emit(ev, "monsoon_end", `The monsoon moves on from the ${s.monsoon.region} region.`);
        s.monsoon = null;
      }
    }
    if (!s.monsoon && s.round % c.monsoonEvery === 0) {
      const regions = Object.keys(REGIONS) as Region[];
      const region = regions[randInt(s, regions.length)];
      s.monsoon = { region, turnsLeft: c.monsoonDuration };
      for (const t of TILES) if (t.region === region && s.tiles[t.id].owner !== null) s.tiles[t.id].waterlogged = true;
      emit(ev, "monsoon", `🌧️ Monsoon alert for the ${region} region! Rent there drops ${c.monsoonRentCutPct}%. Owners may pay ${inr(c.drainageFee)} per tile to clear waterlogging.`, { data: { region } });
    }
  }
  if (b.jugaad && s.round % c.jugaadEvery === 0) {
    const kinds: JugaadCard[] = ["jugaad", "sifarish", "bargain"];
    for (const p of alive(s)) {
      if (p.jugaad.length < c.jugaadMaxCards) {
        const k = kinds[randInt(s, 3)];
        p.jugaad.push(k);
        emit(ev, "jugaad", `${p.name} earns a ${k[0].toUpperCase() + k.slice(1)} card.`, { pid: p.id });
      }
    }
  }
}

function declareBankrupt(s: GameState, pid: number, ev: Ev) {
  const p = s.players[pid];
  const creditor = s.debt?.creditor ?? "bank";
  for (const id of ownedTiles(s, pid)) {
    const ts = s.tiles[id];
    if (ts.houses > 0) {
      p.cash += (ts.houses * baseBuildCost(id, s.config) * s.config.sellBackPct) / 100;
      ts.houses = 0;
    }
  }
  const to = creditor !== "bank" && !s.players[creditor].bankrupt ? creditor : "bank";
  if (to !== "bank") {
    const c = s.players[to];
    c.cash += p.cash;
    c.jailCards += p.jailCards;
    for (const id of ownedTiles(s, pid)) {
      s.tiles[id].owner = to;
      s.tiles[id].footfall = 0;
    }
  } else {
    for (let i = 0; i < p.jailCards; i++) returnJailCard(s);
    for (const id of ownedTiles(s, pid)) s.tiles[id] = { owner: null, houses: 0, mortgaged: false, footfall: 0, waterlogged: false };
  }
  emit(ev, "bankrupt", `${p.name} is bankrupt! Assets go to ${to === "bank" ? "the bank" : s.players[to].name}.`, { pid, to: to === "bank" ? undefined : to });
  p.cash = 0;
  p.jailCards = 0;
  p.loan = 0;
  p.bankrupt = true;
  p.jugaad = [];
  s.debt = null;
  s.resume = null;
  s.pendingBuy = null;
  s.trade = null;
  checkHeritage(s, ev);
  const al = alive(s);
  if (al.length <= 1) {
    endGame(s, al[0].id, "Last player standing", ev);
    return;
  }
  if (s.current === pid) nextTurn(s, ev);
  else settle(s);
}

function sideValid(s: GameState, pid: number, side: TradeSide): string | null {
  const p = s.players[pid];
  if (!Number.isInteger(side.cash) || side.cash < 0) return "Invalid cash amount";
  if (side.cash > p.cash) return `${p.name} does not have ${inr(side.cash)}`;
  if (!Number.isInteger(side.jailCards) || side.jailCards < 0 || side.jailCards > p.jailCards) return `${p.name} lacks that many Get Out of Jail cards`;
  for (const t of side.tiles) if (!tradable(s, pid, t)) return `${TILES[t]?.name ?? "Tile"} cannot be traded (not owned, or buildings in its group)`;
  return null;
}

function validateTrade(s: GameState, t: Trade): string | null {
  if (t.from === t.to) return "Pick another player";
  const other = s.players[t.to];
  if (!other || other.bankrupt) return "That player is out of the game";
  const empty = (x: TradeSide) => x.cash === 0 && x.tiles.length === 0 && x.jailCards === 0;
  if (empty(t.give) && empty(t.get)) return "Empty trade";
  return sideValid(s, t.from, t.give) ?? sideValid(s, t.to, t.get);
}

function executeTrade(s: GameState, t: Trade, ev: Ev) {
  const a = s.players[t.from];
  const b = s.players[t.to];
  a.cash += t.get.cash - t.give.cash;
  b.cash += t.give.cash - t.get.cash;
  a.jailCards += t.get.jailCards - t.give.jailCards;
  b.jailCards += t.give.jailCards - t.get.jailCards;
  for (const id of t.give.tiles) {
    s.tiles[id].owner = b.id;
    s.tiles[id].footfall = 0;
  }
  for (const id of t.get.tiles) {
    s.tiles[id].owner = a.id;
    s.tiles[id].footfall = 0;
  }
  emit(ev, "trade", `${b.name} accepts the trade with ${a.name}.`, { pid: a.id, to: b.id });
  checkHeritage(s, ev);
}

/* ------------------------------------------------------------------ */
/* Command execution                                                   */
/* ------------------------------------------------------------------ */

const MANAGE_PHASES = ["roll", "post", "debt", "tax"];
const FREE_PHASES = ["roll", "post"];

export function applyCommand(prev: GameState, actor: number, cmd: Command): Result {
  if (prev.phase === "gameover") return { ok: false, error: "The game is over" };
  const s: GameState = JSON.parse(JSON.stringify(prev));
  const ev: Ev = [];
  try {
    exec(s, actor, cmd, ev);
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
  s.seq++;
  return { ok: true, state: s, events: ev };
}

function exec(s: GameState, actor: number, cmd: Command, ev: Ev) {
  const p = s.players[actor];
  if (!p || p.bankrupt) fail("Unknown player");
  const c = s.config;

  // Commands that may come from a non-current player.
  switch (cmd.type) {
    case "ACCEPT_TRADE": {
      if (!s.trade || s.trade.to !== actor) fail("No trade to accept");
      const err = validateTrade(s, s.trade);
      if (err) {
        s.trade = null;
        emit(ev, "trade_void", `Trade cancelled: ${err}.`);
        return;
      }
      executeTrade(s, s.trade, ev);
      s.trade = null;
      return;
    }
    case "REJECT_TRADE":
      if (!s.trade || s.trade.to !== actor) fail("No trade to reject");
      emit(ev, "trade_reject", `${p.name} declines the offer${cmd.reason ? `: "${cmd.reason}"` : "."}`, { pid: actor, to: s.trade.from });
      s.trade = null;
      return;
    case "CANCEL_TRADE":
      if (!s.trade || s.trade.from !== actor) fail("No trade to cancel");
      s.trade = null;
      emit(ev, "trade_cancel", `${p.name} withdraws the offer.`);
      return;
    case "PAY_DRAINAGE": {
      const ts = s.tiles[cmd.tile];
      if (!ts || ts.owner !== actor || !ts.waterlogged) fail("Nothing to drain");
      if (p.cash < c.drainageFee) fail("Not enough cash");
      p.cash -= c.drainageFee;
      ts.waterlogged = false;
      emit(ev, "drain", `${p.name} pays ${inr(c.drainageFee)} to drain ${TILES[cmd.tile].name}.`, { pid: actor, amount: c.drainageFee, tile: cmd.tile });
      return;
    }
    case "BID":
    case "PASS_BID": {
      if (s.trade) fail("Resolve the pending trade first");
      if (s.phase !== "auction" || !s.auction) fail("No auction running");
      const a = s.auction;
      if (a.turn !== actor) fail("Not your turn to bid");
      if (cmd.type === "BID") {
        if (!Number.isInteger(cmd.amount) || cmd.amount < minBid(s)) fail(`Minimum bid is ${inr(minBid(s))}`);
        if (cmd.amount > p.cash) fail("You cannot afford that bid");
        a.bid = cmd.amount;
        a.bidder = actor;
        emit(ev, "bid", `${p.name} bids ${inr(cmd.amount)} for ${TILES[a.tile].name}.`, { pid: actor, amount: cmd.amount, tile: a.tile });
        a.turn = nextActive(s, a.active, actor, a.bidder);
      } else {
        const from = actor;
        a.turn = nextActive(s, a.active, from, a.bidder);
        a.active = a.active.filter((x) => x !== from);
        emit(ev, "pass", `${p.name} passes.`, { pid: actor });
        if (!a.active.includes(a.turn)) a.turn = a.active[0] ?? a.turn;
      }
      stepAuction(s, ev);
      return;
    }
  }

  if (s.trade) fail("Resolve the pending trade first");
  if (actor !== s.current) fail("It is not your turn");
  const me = p;

  switch (cmd.type) {
    case "ROLL": {
      if (s.phase !== "roll") fail("You cannot roll now");
      const d1 = 1 + randInt(s, 6);
      const d2 = 1 + randInt(s, 6);
      s.dice = [d1, d2];
      s.rollId++;
      s.rickshaw = null;
      s.extraRoll = false;
      const dbl = d1 === d2;
      let total = d1 + d2;
      let extra = 0;
      if (c.bharat.rickshaw) {
        const face = RICKSHAW_FACES[randInt(s, 6)];
        s.rickshaw = face;
        if (face === "1" || face === "2" || face === "3") extra = Number(face);
        else if (face === "auto") extra = 2;
      }
      emit(ev, "roll", `${me.name} rolls ${d1} and ${d2}${dbl ? " (doubles)" : ""}${s.rickshaw ? ` and the Rickshaw Die shows ${s.rickshaw}` : ""}.`, { pid: me.id, data: { d1, d2, rickshaw: s.rickshaw } });
      if (s.rickshaw === "chai") {
        me.cash += c.rickshawChai;
        emit(ev, "gain", `Chai break! ${me.name} collects ${inr(c.rickshawChai)}.`, { pid: me.id, amount: c.rickshawChai });
      } else if (s.rickshaw === "toll") {
        const amt = Math.min(me.cash, c.rickshawToll);
        me.cash -= amt;
        emit(ev, "pay", `Toll! ${me.name} pays ${inr(amt)}.`, { pid: me.id, amount: amt });
      }
      total += extra;
      if (me.inJail) {
        if (dbl) {
          me.inJail = false;
          me.jailTurns = 0;
          me.doubles = 0;
          emit(ev, "jail_out", `${me.name} rolls doubles and leaves jail.`, { pid: me.id });
          moveBy(s, total, ev);
          land(s, ev);
        } else {
          me.jailTurns++;
          if (me.jailTurns >= c.jailMaxTurns) {
            me.inJail = false;
            me.jailTurns = 0;
            emit(ev, "jail_out", `${me.name} must pay the fine and leaves jail.`, { pid: me.id });
            s.resume = { steps: total };
            if (!charge(s, me.id, c.jailFine, "bank", "jail fine", ev)) return;
            s.resume = null;
            moveBy(s, total, ev);
            land(s, ev);
          } else {
            emit(ev, "jail_stay", `${me.name} stays in jail (turn ${me.jailTurns} of ${c.jailMaxTurns}).`, { pid: me.id });
            s.phase = "post";
          }
        }
        return;
      }
      if (dbl) {
        me.doubles++;
        if (me.doubles >= c.maxDoublesBeforeJail) {
          sendToJail(s, me.id, ev, "three doubles in a row");
          return;
        }
        s.extraRoll = true;
      } else me.doubles = 0;
      moveBy(s, total, ev);
      land(s, ev);
      return;
    }
    case "BUY": {
      if (s.phase !== "buy" || s.pendingBuy === null) fail("Nothing to buy");
      const t = TILES[s.pendingBuy];
      if (me.cash < t.price) fail("Not enough cash");
      me.cash -= t.price;
      s.tiles[s.pendingBuy].owner = me.id;
      s.tiles[s.pendingBuy].footfall = 0;
      emit(ev, "buy", `${me.name} buys ${t.name} for ${inr(t.price)}.`, { pid: me.id, tile: t.id, amount: t.price });
      s.pendingBuy = null;
      checkHeritage(s, ev);
      settle(s);
      return;
    }
    case "DECLINE": {
      if (s.phase !== "buy" || s.pendingBuy === null) fail("Nothing to decline");
      emit(ev, "decline", `${me.name} declines ${TILES[s.pendingBuy].name}.`, { pid: me.id });
      startAuction(s, s.pendingBuy, ev);
      return;
    }
    case "PAY_TAX": {
      if (s.phase !== "tax") fail("No tax due");
      const amt = cmd.choice === "flat" ? c.incomeTaxFlat : round10((netWorth(s, me.id) * c.incomeTaxPct) / 100);
      if (!charge(s, me.id, Math.max(0, amt), "bank", "Income Tax", ev)) return;
      settle(s);
      return;
    }
    case "JAIL_PAY":
      if (s.phase !== "roll" || !me.inJail) fail("You are not in jail");
      if (me.cash < c.jailFine) fail("Not enough cash");
      me.cash -= c.jailFine;
      me.inJail = false;
      me.jailTurns = 0;
      emit(ev, "jail_out", `${me.name} pays ${inr(c.jailFine)} and leaves jail.`, { pid: me.id, amount: c.jailFine });
      return;
    case "JAIL_CARD":
      if (s.phase !== "roll" || !me.inJail) fail("You are not in jail");
      if (me.jailCards < 1) fail("No Get Out of Jail Free card");
      me.jailCards--;
      returnJailCard(s);
      me.inJail = false;
      me.jailTurns = 0;
      emit(ev, "jail_out", `${me.name} uses a Get Out of Jail Free card.`, { pid: me.id });
      return;
    case "BUILD": {
      if (!FREE_PHASES.includes(s.phase)) fail("You cannot build now");
      const err = whyCantBuild(s, me.id, cmd.tile);
      if (err) fail(err);
      const cost = buildCost(s, me.id, cmd.tile);
      if (me.nextBuildHalf) me.nextBuildHalf = false;
      me.cash -= cost;
      const ts = s.tiles[cmd.tile];
      ts.houses++;
      emit(ev, "build", ts.houses === 5 ? `${me.name} opens a Mall in ${TILES[cmd.tile].name} for ${inr(cost)}.` : `${me.name} builds Shop ${ts.houses} in ${TILES[cmd.tile].name} for ${inr(cost)}.`, { pid: me.id, tile: cmd.tile, amount: cost, data: { level: ts.houses } });
      return;
    }
    case "SELL_BUILDING": {
      if (!MANAGE_PHASES.includes(s.phase)) fail("You cannot sell now");
      const err = whyCantSell(s, me.id, cmd.tile);
      if (err) fail(err);
      const refund = Math.round((baseBuildCost(cmd.tile, c) * c.sellBackPct) / 100);
      s.tiles[cmd.tile].houses--;
      me.cash += refund;
      emit(ev, "sell", `${me.name} sells a building in ${TILES[cmd.tile].name} for ${inr(refund)}.`, { pid: me.id, tile: cmd.tile, amount: refund });
      return;
    }
    case "MORTGAGE": {
      if (!MANAGE_PHASES.includes(s.phase)) fail("You cannot mortgage now");
      const err = whyCantMortgage(s, me.id, cmd.tile);
      if (err) fail(err);
      const v = mortgageValue(s, cmd.tile);
      s.tiles[cmd.tile].mortgaged = true;
      s.tiles[cmd.tile].footfall = 0;
      me.cash += v;
      emit(ev, "mortgage", `${me.name} mortgages ${TILES[cmd.tile].name} for ${inr(v)}.`, { pid: me.id, tile: cmd.tile, amount: v });
      return;
    }
    case "UNMORTGAGE": {
      if (!FREE_PHASES.includes(s.phase)) fail("You cannot do that now");
      const ts = s.tiles[cmd.tile];
      if (!ts || ts.owner !== me.id || !ts.mortgaged) fail("Not mortgaged");
      const cost = unmortgageCost(s, cmd.tile);
      if (me.cash < cost) fail("Not enough cash");
      me.cash -= cost;
      ts.mortgaged = false;
      emit(ev, "unmortgage", `${me.name} lifts the mortgage on ${TILES[cmd.tile].name} for ${inr(cost)}.`, { pid: me.id, tile: cmd.tile, amount: cost });
      return;
    }
    case "PROPOSE_TRADE": {
      if (!FREE_PHASES.includes(s.phase)) fail("You cannot trade now");
      const t: Trade = { ...cmd.trade, from: me.id };
      const err = validateTrade(s, t);
      if (err) fail(err);
      s.trade = t;
      me.lastTradeRound = s.round;
      emit(ev, "trade_offer", `${me.name} proposes a trade to ${s.players[t.to].name}.`, { pid: me.id, to: t.to });
      return;
    }
    case "PAY_DEBT": {
      if (s.phase !== "debt" || !s.debt) fail("No debt");
      const d = s.debt;
      if (me.cash < d.amount) fail("Not enough cash. Raise funds or declare bankruptcy");
      transferCash(s, me.id, d.creditor, d.amount);
      emit(ev, "pay", `${me.name} pays ${inr(d.amount)} (${d.reason}).`, { pid: me.id, to: d.creditor === "bank" ? undefined : d.creditor, amount: d.amount });
      s.debt = null;
      afterPending(s, ev);
      return;
    }
    case "BANKRUPT":
      if (s.phase !== "debt" || !s.debt) fail("You can only go bankrupt when in debt");
      declareBankrupt(s, me.id, ev);
      return;
    case "TAKE_LOAN": {
      if (!c.bharat.loan) fail("Bank Loans are off");
      if (!MANAGE_PHASES.includes(s.phase)) fail("You cannot borrow now");
      const amt = Math.floor(cmd.amount);
      if (amt < 100) fail("Minimum loan is ₹100");
      if (me.loan + amt > c.loanMax) fail(`Loan limit is ${inr(c.loanMax)}`);
      me.loan += amt;
      me.cash += amt;
      emit(ev, "loan", `${me.name} borrows ${inr(amt)} from the bank.`, { pid: me.id, amount: amt });
      return;
    }
    case "REPAY_LOAN": {
      const amt = Math.floor(Math.min(cmd.amount, me.loan, me.cash));
      if (amt <= 0) fail("Nothing to repay");
      me.loan -= amt;
      me.cash -= amt;
      if (me.loan === 0) me.credit = Math.min(900, me.credit + 10);
      emit(ev, "repay", `${me.name} repays ${inr(amt)} of their loan.`, { pid: me.id, amount: amt });
      return;
    }
    case "USE_JUGAAD": {
      const i = me.jugaad.indexOf("jugaad");
      if (i < 0) fail("No Jugaad card");
      if (me.nextBuildHalf) fail("Already active");
      me.jugaad.splice(i, 1);
      me.nextBuildHalf = true;
      emit(ev, "jugaad_use", `${me.name} plays Jugaad: the next build costs half.`, { pid: me.id });
      return;
    }
    case "USE_SIFARISH": {
      const i = me.jugaad.indexOf("sifarish");
      if (i < 0) fail("No Sifarish card");
      if (s.phase !== "debt" || !s.debt || !s.debt.canWaive) fail("Nothing to waive");
      me.jugaad.splice(i, 1);
      emit(ev, "sifarish", `${me.name} plays Sifarish and the rent is waived.`, { pid: me.id });
      s.debt = null;
      afterPending(s, ev);
      return;
    }
    case "USE_BARGAIN": {
      if (!FREE_PHASES.includes(s.phase)) fail("You cannot do that now");
      const i = me.jugaad.indexOf("bargain");
      if (i < 0) fail("No Bargain card");
      const ts = s.tiles[me.pos];
      if (!isBuyable(me.pos) || ts.owner === null || ts.owner === me.id) fail("Land on someone else's property first");
      const t: Trade = {
        from: me.id,
        to: ts.owner,
        give: { cash: c.bargainOffer, tiles: [], jailCards: 0 },
        get: { cash: 0, tiles: [me.pos], jailCards: 0 },
        bargain: true,
      };
      const err = validateTrade(s, t);
      if (err) fail(err);
      me.jugaad.splice(i, 1);
      s.trade = t;
      emit(ev, "bargain", `${me.name} plays Bargain: offers ${inr(c.bargainOffer)} for ${TILES[me.pos].name}.`, { pid: me.id, to: ts.owner });
      return;
    }
    case "END_TURN":
      if (s.phase !== "post") fail("Finish your turn first (roll, buy or pay what is due)");
      nextTurn(s, ev);
      return;
    default:
      fail("Unknown command");
  }
}

/** Simple round/seat statistics helper for the server. */
export function summary(s: GameState) {
  return {
    round: s.round,
    winner: s.winner,
    players: s.players.map((p) => ({ name: p.name, kind: p.kind, bankrupt: p.bankrupt, net: netWorth(s, p.id) })),
  };
}
