// Game Core types. Pure TypeScript: no React, Next or DB imports.

export type TileKind =
  | "start"
  | "city"
  | "railway"
  | "utility"
  | "tax"
  | "naseeb"
  | "khazana"
  | "jail"
  | "resort"
  | "gotojail";

export type Region = "North" | "West" | "South" | "East";

export interface TileDef {
  id: number;
  name: string;
  kind: TileKind;
  price: number; // 0 for non-purchasable
  group?: number; // 1..8 for cities
  region?: Region;
  icon: string;
  trivia?: string;
  taxType?: "income" | "luxury";
}

export interface BharatToggles {
  festival: boolean;
  monsoon: boolean;
  footfall: boolean;
  regional: boolean;
  loan: boolean;
  rickshaw: boolean;
  jugaad: boolean;
  heritage: boolean;
}

/** Every tunable number has a config key (Remote Config ready). */
export interface RuleConfig {
  startCash: number;
  salary: number;
  jailFine: number;
  jailMaxTurns: number;
  maxDoublesBeforeJail: number;
  auctionOpeningBid: number;
  auctionMinRaise: number;
  baseRentPct: number; // % of price
  setRentPct: number;
  shopRentPct: number[]; // index 0..4 => 1..4 shops, mall
  buildCostPct: number;
  sellBackPct: number;
  mortgagePct: number;
  unmortgageInterestPct: number;
  railRent: number[];
  utilityMult: number[];
  incomeTaxFlat: number;
  incomeTaxPct: number;
  luxuryTax: number;
  roundLimit: number; // 0 = last player standing
  // Bharat Mode
  festivalEvery: number;
  festivalDuration: number;
  festivalRentBonusPct: number;
  diwaliBuildDiscountPct: number;
  holiPenalty: number;
  monsoonEvery: number;
  monsoonDuration: number;
  monsoonRentCutPct: number;
  drainageFee: number;
  footfallMax: number;
  footfallPct: number;
  regionalMinCities: number;
  regionalRentPct: number;
  regionalSalaryBonus: number;
  loanMax: number;
  loanInterestPct: number;
  creditStart: number;
  creditPenaltyPerRound: number;
  heritageBonus: number;
  jugaadEvery: number;
  jugaadMaxCards: number;
  bargainOffer: number;
  rickshawToll: number;
  rickshawChai: number;
  timerSeconds: number; // 0 = off
  bharat: BharatToggles;
}

export type AIPersonality = "balanced" | "cautious" | "aggressive" | "trader";
export type AIDifficulty = "easy" | "medium" | "hard";

export interface PlayerSetup {
  name: string;
  kind: "human" | "ai";
  token: string;
  personality?: AIPersonality;
  difficulty?: AIDifficulty;
}

export type JugaadCard = "jugaad" | "sifarish" | "bargain";

export interface Player {
  id: number;
  name: string;
  kind: "human" | "ai";
  personality: AIPersonality;
  difficulty: AIDifficulty;
  token: string;
  color: string;
  cash: number;
  pos: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  doubles: number;
  loan: number;
  credit: number;
  loanRounds: number;
  jugaad: JugaadCard[];
  nextBuildHalf: boolean;
  heritage: number[]; // groups already awarded
  lastTradeRound: number;
}

export interface TileState {
  owner: number | null;
  houses: number; // 0..4 shops, 5 = mall
  mortgaged: boolean;
  footfall: number;
  waterlogged: boolean;
}

export type FestivalId = "diwali" | "pongal" | "durga" | "ganesh" | "baisakhi" | "holi";

export interface Festival {
  id: FestivalId;
  turnsLeft: number;
}

export interface Monsoon {
  region: Region;
  turnsLeft: number;
}

export interface Auction {
  tile: number;
  bid: number;
  bidder: number | null;
  active: number[]; // player ids still in
  turn: number; // player id whose turn it is to act
}

export interface TradeSide {
  cash: number;
  tiles: number[];
  jailCards: number;
}

export interface Trade {
  from: number;
  to: number;
  give: TradeSide; // what `from` gives
  get: TradeSide; // what `from` receives
  bargain?: boolean;
}

export interface Debt {
  player: number;
  amount: number;
  creditor: number | "bank";
  reason: string;
  canWaive: boolean;
}

export type Phase =
  | "roll"
  | "buy"
  | "auction"
  | "tax"
  | "debt"
  | "post"
  | "gameover";

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  config: RuleConfig;
  players: Player[];
  tiles: TileState[];
  current: number;
  phase: Phase;
  dice: [number, number] | null;
  rickshaw: string | null;
  rollId: number;
  extraRoll: boolean;
  round: number;
  turns: number;
  pendingBuy: number | null;
  auction: Auction | null;
  trade: Trade | null;
  debt: Debt | null;
  resume: { steps: number } | null;
  decks: { naseeb: number[]; khazana: number[] };
  festival: Festival | null;
  monsoon: Monsoon | null;
  festivalCount: number;
  winner: number | null;
  endReason: string | null;
  first: number;
  startRolls: number[];
  seq: number;
}

export interface GameEvent {
  t: string;
  msg: string;
  pid?: number;
  to?: number;
  amount?: number;
  tile?: number;
  data?: Record<string, unknown>;
}

export type Command =
  | { type: "ROLL" }
  | { type: "BUY" }
  | { type: "DECLINE" }
  | { type: "BID"; amount: number }
  | { type: "PASS_BID" }
  | { type: "PAY_TAX"; choice: "flat" | "percent" }
  | { type: "JAIL_PAY" }
  | { type: "JAIL_CARD" }
  | { type: "BUILD"; tile: number }
  | { type: "SELL_BUILDING"; tile: number }
  | { type: "MORTGAGE"; tile: number }
  | { type: "UNMORTGAGE"; tile: number }
  | { type: "PROPOSE_TRADE"; trade: Omit<Trade, "from"> }
  | { type: "ACCEPT_TRADE" }
  | { type: "REJECT_TRADE"; reason?: string }
  | { type: "CANCEL_TRADE" }
  | { type: "PAY_DEBT" }
  | { type: "BANKRUPT" }
  | { type: "TAKE_LOAN"; amount: number }
  | { type: "REPAY_LOAN"; amount: number }
  | { type: "USE_JUGAAD" }
  | { type: "USE_SIFARISH" }
  | { type: "USE_BARGAIN" }
  | { type: "PAY_DRAINAGE"; tile: number }
  | { type: "END_TURN" };

export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
