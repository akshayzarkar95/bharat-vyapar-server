import type { FestivalId, Region, RuleConfig, TileDef } from "./types";

export const GROUP_COLORS: Record<number, { name: string; color: string }> = {
  1: { name: "Brown", color: "#8d5a3b" },
  2: { name: "Sky Blue", color: "#4fb8ea" },
  3: { name: "Pink", color: "#ec6aa5" },
  4: { name: "Orange", color: "#f08a1c" },
  5: { name: "Red", color: "#e03a3a" },
  6: { name: "Yellow", color: "#f2cf2b" },
  7: { name: "Green", color: "#3fa45a" },
  8: { name: "Royal Blue", color: "#2551d6" },
};

export const PLAYER_COLORS = ["#ff6b35", "#22d3ee", "#a3e635", "#e879f9"];

export const TOKENS: { id: string; name: string; icon: string }[] = [
  { id: "rickshaw", name: "Auto-rickshaw", icon: "🛺" },
  { id: "elephant", name: "Elephant", icon: "🐘" },
  { id: "tiger", name: "Tiger", icon: "🐅" },
  { id: "peacock", name: "Peacock", icon: "🦚" },
  { id: "lotus", name: "Lotus", icon: "🪷" },
  { id: "tabla", name: "Tabla", icon: "🥁" },
  { id: "kite", name: "Kite", icon: "🪁" },
  { id: "bat", name: "Cricket bat", icon: "🏏" },
];

export function tokenIcon(id: string): string {
  return TOKENS.find((t) => t.id === id)?.icon ?? "♟️";
}

export const REGIONS: Record<Region, string[]> = {
  North: ["Chandigarh", "Amritsar", "Varanasi", "Lucknow", "Delhi", "Jaipur"],
  West: ["Ahmedabad", "Udaipur", "Jodhpur", "Goa", "Mumbai", "Indore"],
  South: ["Kochi", "Ooty", "Mysuru", "Chennai", "Hyderabad", "Bengaluru"],
  East: ["Patna", "Bhopal", "Nagpur", "Kolkata"],
};

export const REGION_LABEL: Record<Region, string> = {
  North: "North",
  West: "West",
  South: "South",
  East: "East & Central",
};

function regionOf(name: string): Region | undefined {
  for (const r of Object.keys(REGIONS) as Region[]) if (REGIONS[r].includes(name)) return r;
  return undefined;
}

type Raw = [number, string, TileDef["kind"], number, number | undefined, string, string | undefined, TileDef["taxType"]?];

const RAW: Raw[] = [
  [0, "Shubh Aarambh", "start", 0, undefined, "🪔", "Collect ₹2,000 every time you pass."],
  [1, "Patna", "city", 2000, 1, "🏛️", "Golghar, built in 1786, is a beehive-shaped granary."],
  [2, "Khazana", "khazana", 0, undefined, "🧰", undefined],
  [3, "Bhopal", "city", 2200, 1, "🕌", "Bhopal is known as the City of Lakes."],
  [4, "Income Tax", "tax", 0, undefined, "🧾", "Pay ₹2,000 or 10% of your net worth.", "income"],
  [5, "Rajdhani Express", "railway", 5000, undefined, "🚆", "Rajdhani trains link the national capital with state capitals."],
  [6, "Indore", "city", 3000, 2, "🏰", "Rajwada, the Holkar palace, stands in the heart of the old city."],
  [7, "Naseeb", "naseeb", 0, undefined, "🎡", undefined],
  [8, "Kochi", "city", 3200, 2, "🎣", "Chinese fishing nets line the shore of Fort Kochi."],
  [9, "Nagpur", "city", 3400, 2, "🍊", "Nagpur's Zero Mile Stone marked the central point for surveying British India."],
  [10, "Kaid Khana", "jail", 0, undefined, "⛓️", "Just visiting, or serving time."],
  [11, "Chandigarh", "city", 4000, 3, "🗿", "The Rock Garden was built by Nek Chand from industrial and household waste."],
  [12, "Power Grid", "utility", 4500, undefined, "⚡", "India's national grid is among the largest synchronous grids in the world."],
  [13, "Amritsar", "city", 4200, 3, "🛕", "Harmandir Sahib sits in the middle of a pool, its upper floors covered in gold leaf."],
  [14, "Varanasi", "city", 4400, 3, "🌅", "Varanasi is among the world's oldest continuously inhabited cities."],
  [15, "Deccan Queen", "railway", 5000, undefined, "🚂", "The Deccan Queen has run between Mumbai and Pune since 1930."],
  [16, "Lucknow", "city", 5000, 4, "🏯", "Bara Imambara (1784) has a vast arched central hall with no pillars."],
  [17, "Khazana", "khazana", 0, undefined, "🧰", undefined],
  [18, "Ahmedabad", "city", 5500, 4, "🪟", "In 2017 Ahmedabad became India's first UNESCO World Heritage City."],
  [19, "Naseeb", "naseeb", 0, undefined, "🎡", undefined],
  [20, "Holiday Resort", "resort", 0, undefined, "🏖️", "A safe stop. Slides, palms and a rest."],
  [21, "Jaipur", "city", 6000, 5, "🌸", "Hawa Mahal has 953 small windows called jharokhas."],
  [22, "Naseeb", "naseeb", 0, undefined, "🎡", undefined],
  [23, "Udaipur", "city", 6200, 5, "🏝️", "The City Palace stands on the banks of Lake Pichola."],
  [24, "Jodhpur", "city", 6500, 5, "🏰", "Mehrangarh Fort rises on a hill high above the city's blue houses."],
  [25, "Vande Bharat", "railway", 5000, undefined, "🚄", "Vande Bharat is a high-speed train set designed and built in India."],
  [26, "Goa", "city", 7000, 6, "🌴", "Old Goa's churches are a UNESCO World Heritage Site."],
  [27, "Ooty", "city", 7200, 6, "🍵", "The Nilgiri Mountain Railway is a UNESCO World Heritage Site."],
  [28, "Jal Shakti Water Works", "utility", 4500, undefined, "💧", "Large dams store monsoon water for use through the dry months."],
  [29, "Mysuru", "city", 7500, 6, "👑", "Mysore Palace is lit by around 100,000 bulbs on Sundays and festival days."],
  [30, "Seedha Jail", "gotojail", 0, undefined, "🚨", "Go directly to jail."],
  [31, "Chennai", "city", 8000, 7, "🗼", "Marina Beach is among the longest urban beaches in the world."],
  [32, "Hyderabad", "city", 8500, 7, "🕍", "Charminar was built in 1591."],
  [33, "Khazana", "khazana", 0, undefined, "🧰", undefined],
  [34, "Bengaluru", "city", 9000, 7, "💻", "Vidhana Soudha is the seat of Karnataka's state legislature."],
  [35, "Shatabdi Express", "railway", 5000, undefined, "🚉", "Shatabdi day expresses began running in 1988."],
  [36, "Kolkata", "city", 10000, 8, "🌉", "Howrah Bridge is a cantilever bridge opened in 1943."],
  [37, "Delhi", "city", 11000, 8, "🏛️", "India Gate commemorates soldiers of the British Indian Army who died in the First World War."],
  [38, "Luxury Tax", "tax", 0, undefined, "💍", "Pay ₹1,500.", "luxury"],
  [39, "Mumbai", "city", 13000, 8, "🌊", "The Gateway of India was completed in 1924."],
];

export const TILES: TileDef[] = RAW.map(([id, name, kind, price, group, icon, trivia, taxType]) => ({
  id,
  name,
  kind,
  price,
  group,
  region: regionOf(name),
  icon,
  trivia,
  taxType,
}));

export const GROUP_TILES: Record<number, number[]> = {};
for (const t of TILES) if (t.group) (GROUP_TILES[t.group] ||= []).push(t.id);

export const RAIL_TILES = TILES.filter((t) => t.kind === "railway").map((t) => t.id);
export const UTILITY_TILES = TILES.filter((t) => t.kind === "utility").map((t) => t.id);

export function isBuyable(id: number): boolean {
  const k = TILES[id].kind;
  return k === "city" || k === "railway" || k === "utility";
}

/** Grid coordinates (col,row) for tile i on an 11x11 ring. START bottom-right, clockwise. */
export function tileGrid(i: number): { col: number; row: number } {
  if (i <= 10) return { col: 10 - i, row: 10 };
  if (i <= 20) return { col: 0, row: 10 - (i - 10) };
  if (i <= 30) return { col: i - 20, row: 0 };
  return { col: 10, row: i - 30 };
}

export const FESTIVALS: Record<
  FestivalId,
  { name: string; region?: Region; desc: string; icon: string }
> = {
  diwali: { name: "Diwali", desc: "Salary doubled and shop build cost 20% lower.", icon: "🪔" },
  pongal: { name: "Pongal / Onam", region: "South", desc: "South region rent +25%.", icon: "🌾" },
  durga: { name: "Durga Puja", region: "East", desc: "East & Central region rent +25%.", icon: "🎭" },
  ganesh: { name: "Ganesh Chaturthi", region: "West", desc: "West region rent +25%.", icon: "🎊" },
  baisakhi: { name: "Baisakhi", region: "North", desc: "North region rent +25%.", icon: "🌻" },
  holi: { name: "Holi", desc: "Colour-splash roll: the lowest roller pays the highest.", icon: "🎨" },
};
export const FESTIVAL_ORDER: FestivalId[] = ["diwali", "pongal", "durga", "ganesh", "baisakhi", "holi"];

export type CardKind =
  | "collect"
  | "pay"
  | "advance"
  | "back"
  | "jail"
  | "jailfree"
  | "repairs"
  | "collectEach";

export interface CardDef {
  text: string;
  kind: CardKind;
  amount?: number;
  tile?: number;
  shop?: number;
  mall?: number;
}

export const NASEEB: CardDef[] = [
  { text: "Advance to Mumbai. Collect salary if you pass START.", kind: "advance", tile: 39 },
  { text: "Advance to Shubh Aarambh and collect your salary.", kind: "advance", tile: 0 },
  { text: "Advance to Jaipur. Collect salary if you pass START.", kind: "advance", tile: 21 },
  { text: "Hop on the Rajdhani Express. Collect salary if you pass START.", kind: "advance", tile: 5 },
  { text: "Your start-up gets funded. Collect ₹3,000.", kind: "collect", amount: 3000 },
  { text: "Cricket match tickets. Pay ₹1,000.", kind: "pay", amount: 1000 },
  { text: "Take a wrong turn. Go back 3 tiles.", kind: "back", amount: 3 },
  { text: "Get Out of Jail Free. Keep this card until needed.", kind: "jailfree" },
  { text: "Caught without a licence. Go directly to jail.", kind: "jail" },
  { text: "Repairs: pay ₹400 per Shop and ₹1,100 per Mall.", kind: "repairs", shop: 400, mall: 1100 },
  { text: "Traffic challan. Pay ₹800.", kind: "pay", amount: 800 },
  { text: "Dividend from your shares. Collect ₹1,500.", kind: "collect", amount: 1500 },
  { text: "Advance to Goa. Collect salary if you pass START.", kind: "advance", tile: 26 },
  { text: "Scholarship awarded. Collect ₹2,000.", kind: "collect", amount: 2000 },
  { text: "Birthday party. Collect ₹300 from every player.", kind: "collectEach", amount: 300 },
  { text: "Medical bill. Pay ₹1,200.", kind: "pay", amount: 1200 },
];

export const KHAZANA: CardDef[] = [
  { text: "Income tax refund. Collect ₹2,000.", kind: "collect", amount: 2000 },
  { text: "Advance to Shubh Aarambh and collect your salary.", kind: "advance", tile: 0 },
  { text: "An inheritance arrives. Collect ₹4,000.", kind: "collect", amount: 4000 },
  { text: "School fees. Pay ₹1,500.", kind: "pay", amount: 1500 },
  { text: "Get Out of Jail Free. Keep this card until needed.", kind: "jailfree" },
  { text: "Go directly to jail.", kind: "jail" },
  { text: "Your cousin's wedding. Collect ₹300 from every player.", kind: "collectEach", amount: 300 },
  { text: "Crops sold at a good price. Collect ₹1,800.", kind: "collect", amount: 1800 },
  { text: "Building repairs: pay ₹250 per Shop and ₹1,000 per Mall.", kind: "repairs", shop: 250, mall: 1000 },
  { text: "Insurance premium. Pay ₹1,000.", kind: "pay", amount: 1000 },
  { text: "Advance to Kolkata. Collect salary if you pass START.", kind: "advance", tile: 36 },
  { text: "Festival bonus. Collect ₹2,500.", kind: "collect", amount: 2500 },
  { text: "Doctor's fee. Pay ₹1,000.", kind: "pay", amount: 1000 },
  { text: "Advance to Varanasi. Collect salary if you pass START.", kind: "advance", tile: 14 },
  { text: "Take a break. Advance to Holiday Resort.", kind: "advance", tile: 20 },
  { text: "Consultancy fee. Collect ₹1,200.", kind: "collect", amount: 1200 },
];

export const DEFAULT_CONFIG: RuleConfig = {
  startCash: 30000,
  salary: 2000,
  jailFine: 1000,
  jailMaxTurns: 3,
  maxDoublesBeforeJail: 3,
  auctionOpeningBid: 100,
  auctionMinRaise: 100,
  baseRentPct: 8,
  setRentPct: 16,
  shopRentPct: [40, 90, 150, 200, 260],
  buildCostPct: 50,
  sellBackPct: 50,
  mortgagePct: 50,
  unmortgageInterestPct: 10,
  railRent: [500, 1000, 2000, 4000],
  utilityMult: [4, 10],
  incomeTaxFlat: 2000,
  incomeTaxPct: 10,
  luxuryTax: 1500,
  roundLimit: 0,
  festivalEvery: 8,
  festivalDuration: 4,
  festivalRentBonusPct: 25,
  diwaliBuildDiscountPct: 20,
  holiPenalty: 500,
  monsoonEvery: 10,
  monsoonDuration: 2,
  monsoonRentCutPct: 30,
  drainageFee: 300,
  footfallMax: 5,
  footfallPct: 6,
  regionalMinCities: 4,
  regionalRentPct: 10,
  regionalSalaryBonus: 500,
  loanMax: 10000,
  loanInterestPct: 10,
  creditStart: 750,
  creditPenaltyPerRound: 15,
  heritageBonus: 2000,
  jugaadEvery: 5,
  jugaadMaxCards: 2,
  bargainOffer: 1000,
  rickshawToll: 200,
  rickshawChai: 200,
  timerSeconds: 0,
  bharat: {
    festival: true,
    monsoon: true,
    footfall: true,
    regional: true,
    loan: true,
    rickshaw: false,
    jugaad: true,
    heritage: true,
  },
};

export const CLASSIC_BHARAT: RuleConfig["bharat"] = {
  festival: false,
  monsoon: false,
  footfall: false,
  regional: false,
  loan: false,
  rickshaw: false,
  jugaad: false,
  heritage: false,
};

export const RICKSHAW_FACES = ["1", "2", "3", "auto", "chai", "toll"] as const;
