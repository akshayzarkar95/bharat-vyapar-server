"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_CONFIG, GROUP_COLORS, TILES, inr } from "@/core";

const c = DEFAULT_CONFIG;

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Goal and setup",
    body: [
      `Each player starts with ${inr(c.startCash)} and a token on Shubh Aarambh (START). The highest first roll goes first. Last player standing wins, or the richest player when a round limit ends the game.`,
      "Tokens: auto-rickshaw, elephant, tiger, peacock, lotus, tabla, kite and cricket bat.",
    ],
  },
  {
    title: "Your turn",
    body: [
      "Roll two dice and move clockwise. Doubles give another roll. Three doubles in a row send you to Kaid Khana (jail).",
      `Passing or landing on START pays a ${inr(c.salary)} salary.`,
      "Before or after rolling you may build, trade, mortgage and use cards. You must resolve any purchase, auction, tax or debt before ending your turn.",
    ],
  },
  {
    title: "Buying, auctions and rent",
    body: [
      "Land on an unowned property to buy it at list price. If you decline (or cannot afford it) the bank auctions it. Bidding opens at ₹100 with a ₹100 minimum raise. Players bid in turn or pass.",
      `Base rent is ${c.baseRentPct}% of the price. Owning the full colour group (with no buildings) makes it ${c.setRentPct}%.`,
      `Shops cost ${c.buildCostPct}% of the price each and must be built evenly across a full group. Rent as % of price: 1 Shop ${c.shopRentPct[0]}, 2 Shops ${c.shopRentPct[1]}, 3 Shops ${c.shopRentPct[2]}, 4 Shops ${c.shopRentPct[3]}, Mall ${c.shopRentPct[4]}. Selling a building returns half its cost.`,
      `Railways: rent ${c.railRent.map(inr).join(", ")} for 1 to 4 owned. Utilities: ${c.utilityMult[0]}× the dice total with one, ${c.utilityMult[1]}× with both.`,
      "Mortgaged tiles collect no rent. You can only mortgage a tile when its group has no buildings.",
    ],
  },
  {
    title: "Taxes, cards and jail",
    body: [
      `Income Tax: pay ${inr(c.incomeTaxFlat)} or ${c.incomeTaxPct}% of your net worth. Luxury Tax: pay ${inr(c.luxuryTax)}.`,
      "Naseeb (fortune) and Khazana (treasury) are 16-card shuffled decks. Get Out of Jail Free cards are kept until used.",
      `Jail: you go there from Seedha Jail, a card, or three doubles. Leave by rolling doubles, paying ${inr(c.jailFine)}, or using a card. After 3 failed turns you must pay. You still collect rent while jailed.`,
      "Holiday Resort is a safe stop with no effect.",
    ],
  },
  {
    title: "Trading and bankruptcy",
    body: [
      "On your turn you can trade cash, properties and Get Out of Jail Free cards with another player. Properties in a group with buildings must have those buildings sold first.",
      "If you owe more than you can pay, raise funds by mortgaging, selling buildings or borrowing (Bharat Mode). If you still cannot pay, declare bankruptcy. Your assets go to the creditor, or back to the bank.",
    ],
  },
  {
    title: "Bharat Mode: Festival Calendar",
    body: [
      `Every ${c.festivalEvery} rounds a festival runs for ${c.festivalDuration} rounds. Diwali: salary doubled and shop build cost −${c.diwaliBuildDiscountPct}%. Pongal/Onam, Durga Puja, Ganesh Chaturthi and Baisakhi: +${c.festivalRentBonusPct}% rent in the South, East & Central, West and North regions. Holi: everyone rolls once and the lowest roller pays ${inr(c.holiPenalty)} to the highest.`,
    ],
  },
  {
    title: "Bharat Mode: Monsoon Season",
    body: [
      `Every ${c.monsoonEvery} rounds a monsoon hits one region for ${c.monsoonDuration} rounds: rent there is −${c.monsoonRentCutPct}%. Owned properties in that region get a Waterlogged marker (no rent). Owners can pay a ${inr(c.drainageFee)} drainage fee per property to clear it. (Interpretation: the marker lasts the whole monsoon unless drained.)`,
    ],
  },
  {
    title: "Bharat Mode: Tourism Footfall and Regional Dominance",
    body: [
      `Each opponent visit adds a footfall stack (max ${c.footfallMax}) worth +${c.footfallPct}% rent. Stacks reset when the property changes owner or is mortgaged.`,
      `Owning ${c.regionalMinCities} or more cities in one region gives +${c.regionalRentPct}% rent there and ${inr(c.regionalSalaryBonus)} extra salary per pass.`,
      "Regions: North (Chandigarh, Amritsar, Varanasi, Lucknow, Delhi, Jaipur), West (Ahmedabad, Udaipur, Jodhpur, Goa, Mumbai, Indore), South (Kochi, Ooty, Mysuru, Chennai, Hyderabad, Bengaluru), East & Central (Patna, Bhopal, Nagpur, Kolkata).",
    ],
  },
  {
    title: "Bharat Mode: Bank Loan, Jugaad Cards, Heritage Bonus, Rickshaw Die",
    body: [
      `Bank Loan: borrow up to ${inr(c.loanMax)} per game. It grows ${c.loanInterestPct}% each full round. Each round with an open loan lowers your credit score, which raises later interest.`,
      `Jugaad cards: every ${c.jugaadEvery} rounds you may earn a card (hold up to ${c.jugaadMaxCards}). Jugaad: next build half price. Sifarish: waive one rent. Bargain: offer ${inr(c.bargainOffer)} for the tile you stand on; the owner may refuse.`,
      `Heritage Bonus: owning every Group 1 or Group 8 city pays a one-time ${inr(c.heritageBonus)}.`,
      `Rickshaw Die (optional, off by default): faces 1, 2, 3 (extra tiles, our interpretation), Auto (+2 tiles), Chai (+${inr(c.rickshawChai)}), Toll (−${inr(c.rickshawToll)}).`,
    ],
  },
  {
    title: "Not yet implemented / proposals",
    body: [
      "Joint Ventures and Timed (30/60 min) end conditions are not built yet. Round limits (20/30/40) and last-player-standing are available.",
      "AI trade counter-offers, bankruptcy-to-bank auctions (assets return to the bank unowned), Google Play Games sign-in, billing, ads and Remote Config are not part of this web build.",
      "Balance numbers all live in one config object (src/core/data.ts, DEFAULT_CONFIG) and need more simulation to hit the 60 to 90 minute target: self-play shows round-limit games finish reliably, while last-player-standing can run long.",
    ],
  },
];

export default function RulesPage() {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = SECTIONS.filter((s) => !needle || (s.title + s.body.join(" ")).toLowerCase().includes(needle));
  const tiles = TILES.filter((t) => !needle || t.name.toLowerCase().includes(needle) || (t.trivia ?? "").toLowerCase().includes(needle));
  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="title-font text-3xl font-black text-[#f5c04a]">📖 Rules Book</h1>
        <Link href="/" className="btn alt sm">
          Menu
        </Link>
      </div>
      <input className="field mb-4" placeholder="Search rules, cities, festivals…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rules" />
      {filtered.map((s) => (
        <section key={s.title} className="panel mb-3 p-4">
          <h2 className="title-font mb-1 text-xl font-black text-[#ffd45e]">{s.title}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="mb-2 text-sm leading-relaxed opacity-90">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section className="panel mb-3 p-4">
        <h2 className="title-font mb-2 text-xl font-black text-[#ffd45e]">The 40 tiles</h2>
        <div className="grid gap-1 sm:grid-cols-2">
          {tiles.map((t) => (
            <div key={t.id} className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-sm">
              <span className="text-2xl">{t.icon}</span>
              <div>
                <div className="font-bold">
                  {t.id}. {t.name}
                  {t.price ? ` · ${inr(t.price)}` : ""}
                </div>
                <div className="text-xs opacity-70">
                  {t.group ? `Group ${t.group} (${GROUP_COLORS[t.group].name}) · ` : ""}
                  {t.trivia}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {filtered.length === 0 && tiles.length === 0 && <p className="text-center opacity-70">Nothing matches “{q}”.</p>}
    </main>
  );
}
