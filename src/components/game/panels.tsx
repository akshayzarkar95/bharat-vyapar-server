"use client";

import { useState, type ReactNode } from "react";
import {
  FESTIVALS,
  GROUP_COLORS,
  GROUP_TILES,
  REGION_LABEL,
  TILES,
  baseBuildCost,
  buildCost,
  inr,
  minBid,
  mortgageValue,
  netWorth,
  ownedTiles,
  rentFor,
  tokenIcon,
  tradable,
  unmortgageCost,
  whyCantBuild,
  whyCantMortgage,
  whyCantSell,
  type Command,
  type GameState,
  type Trade,
  type TradeSide,
} from "@/core";
import { useSettings } from "@/lib/settings";
import { sfx } from "@/lib/sfx";

export type Send = (cmd: Command, actor?: number) => void | Promise<void>;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className={`panel pop max-h-[92vh] w-full overflow-auto p-4 ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="title-font text-xl font-black text-[#f5c04a]">{title}</h2>
          <button className="btn alt sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const r10 = (n: number) => Math.round(n / 10) * 10;

/* ------------------------------ Title deed ------------------------------ */
export function Deed({ id, state, me, onClose, send, canAct }: { id: number; state: GameState; me: number | null; onClose: () => void; send: Send; canAct: boolean }) {
  const t = TILES[id];
  const ts = state.tiles[id];
  const c = state.config;
  const owner = ts.owner !== null ? state.players[ts.owner] : null;
  const col = t.group ? GROUP_COLORS[t.group].color : "#c99a3b";
  const buyable = t.kind === "city" || t.kind === "railway" || t.kind === "utility";
  const mine = me !== null && ts.owner === me;
  const canB = mine && canAct ? whyCantBuild(state, me!, id) : "Not now";
  const canS = mine && canAct ? whyCantSell(state, me!, id) : "Not now";
  const canM = mine && canAct ? whyCantMortgage(state, me!, id) : "Not now";
  return (
    <Modal title="Title Deed" onClose={onClose}>
      <div className="overflow-hidden rounded-xl bg-[#fff7e3] text-[#2b1a0c]">
        <div className="hero-art flex h-32 items-center justify-center text-7xl" style={{ background: `linear-gradient(135deg, ${col}, #1b1230)` }}>
          <span style={{ filter: "drop-shadow(0 6px 6px rgba(0,0,0,.5))" }}>{t.icon}</span>
          <span className="absolute bottom-1 right-2 text-[10px] text-white/60">Illustration placeholder</span>
        </div>
        <div className="p-3">
          <div className="title-font text-2xl font-black">{t.name}</div>
          <div className="text-xs font-bold opacity-70">
            {t.kind === "city" ? `Group ${t.group} · ${GROUP_COLORS[t.group!].name} · ${REGION_LABEL[t.region!]}` : t.kind.toUpperCase()}
            {t.price > 0 ? ` · Price ${inr(t.price)}` : ""}
          </div>
          {t.kind === "city" && (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {[
                  ["Rent", r10((t.price * c.baseRentPct) / 100)],
                  ["Rent with full colour set", r10((t.price * c.setRentPct) / 100)],
                  ...c.shopRentPct.map((p, i) => [i < 4 ? `With ${i + 1} Shop${i ? "s" : ""}` : "With Mall", r10((t.price * p) / 100)] as [string, number]),
                ].map(([k, v]) => (
                  <tr key={k as string} className="border-b border-black/10">
                    <td className="py-0.5">{k}</td>
                    <td className="text-right font-bold">{inr(v as number)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-0.5">Shop cost</td>
                  <td className="text-right font-bold">{inr(baseBuildCost(id, c))}</td>
                </tr>
              </tbody>
            </table>
          )}
          {t.kind === "railway" && <p className="mt-2 text-sm">Rent {c.railRent.map(inr).join(" / ")} for 1 to 4 railways owned.</p>}
          {t.kind === "utility" && <p className="mt-2 text-sm">Rent is {c.utilityMult[0]}× the dice roll with one utility, {c.utilityMult[1]}× with both.</p>}
          {!buyable && <p className="mt-2 text-sm">{t.trivia}</p>}
          {buyable && (
            <div className="mt-2 flex flex-wrap gap-1 text-xs font-bold">
              <span className="chip !bg-black/10">Owner: {owner ? `${tokenIcon(owner.token)} ${owner.name}` : "Bank"}</span>
              {ts.houses > 0 && <span className="chip !bg-black/10">{ts.houses === 5 ? "Mall" : `${ts.houses} Shop${ts.houses > 1 ? "s" : ""}`}</span>}
              {ts.footfall > 0 && <span className="chip !bg-black/10">👣 Footfall ×{ts.footfall}</span>}
              {ts.mortgaged && <span className="chip !bg-black/10">Mortgaged</span>}
              {ts.waterlogged && <span className="chip !bg-black/10">🌧️ Waterlogged</span>}
              {owner && <span className="chip !bg-black/10">Rent now {inr(rentFor(state, id, 7))}{t.kind === "utility" ? " (at 7)" : ""}</span>}
            </div>
          )}
          {buyable && t.trivia && <p className="mt-2 text-xs italic opacity-80">Did you know? {t.trivia}</p>}
        </div>
      </div>
      {mine && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.kind === "city" && (
            <>
              <button className="btn green sm" disabled={!!canB} title={canB ?? ""} onClick={() => send({ type: "BUILD", tile: id })}>
                Build {me !== null && !canB ? `(${inr(buildCost(state, me, id))})` : ""}
              </button>
              <button className="btn alt sm" disabled={!!canS} title={canS ?? ""} onClick={() => send({ type: "SELL_BUILDING", tile: id })}>
                Sell building
              </button>
            </>
          )}
          {ts.mortgaged ? (
            <button className="btn sm" disabled={!canAct} onClick={() => send({ type: "UNMORTGAGE", tile: id })}>
              Unmortgage ({inr(unmortgageCost(state, id))})
            </button>
          ) : (
            <button className="btn red sm" disabled={!!canM} title={canM ?? ""} onClick={() => send({ type: "MORTGAGE", tile: id })}>
              Mortgage (+{inr(mortgageValue(state, id))})
            </button>
          )}
          {ts.waterlogged && (
            <button className="btn alt sm" onClick={() => send({ type: "PAY_DRAINAGE", tile: id })}>
              Drain ({inr(c.drainageFee)})
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Assets manager ------------------------------ */
export function Assets({ state, pid, onClose, send, canAct }: { state: GameState; pid: number; onClose: () => void; send: Send; canAct: boolean }) {
  const p = state.players[pid];
  const c = state.config;
  const owned = ownedTiles(state, pid);
  const [loanAmt, setLoanAmt] = useState(1000);
  const groups = new Map<string, number[]>();
  for (const id of owned) {
    const t = TILES[id];
    const key = t.kind === "city" ? `Group ${t.group} · ${GROUP_COLORS[t.group!].name}` : t.kind === "railway" ? "Railways" : "Utilities";
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return (
    <Modal title={`${p.name}: Assets`} onClose={onClose} wide>
      <div className="mb-2 flex flex-wrap gap-2 text-sm font-bold">
        <span className="chip">💰 {inr(p.cash)}</span>
        <span className="chip">📈 Net worth {inr(netWorth(state, pid))}</span>
        {p.loan > 0 && <span className="chip">🏦 Loan {inr(p.loan)}</span>}
        <span className="chip">🪪 Credit {p.credit}</span>
        {p.jailCards > 0 && <span className="chip">🗝️ Jail-free ×{p.jailCards}</span>}
      </div>
      {owned.length === 0 && <p className="text-sm opacity-70">You do not own any property yet.</p>}
      {[...groups.entries()].map(([g, ids]) => (
        <div key={g} className="mb-2">
          <div className="text-xs font-bold uppercase tracking-wider opacity-60">{g}</div>
          {ids.map((id) => {
            const ts = state.tiles[id];
            const t = TILES[id];
            const cb = canAct ? whyCantBuild(state, pid, id) : "Not now";
            const cs = canAct ? whyCantSell(state, pid, id) : "Not now";
            const cm = canAct ? whyCantMortgage(state, pid, id) : "Not now";
            return (
              <div key={id} className="my-1 flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2">
                <span className="text-xl">{t.icon}</span>
                <div className="min-w-[8rem] flex-1">
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-[11px] opacity-70">
                    {ts.mortgaged ? "Mortgaged" : ts.houses === 5 ? "Mall" : ts.houses ? `${ts.houses} Shop${ts.houses > 1 ? "s" : ""}` : "No buildings"} · rent {inr(rentFor(state, id, 7))}
                    {ts.waterlogged ? " · 🌧️" : ""}
                  </div>
                </div>
                {t.kind === "city" && (
                  <>
                    <button className="btn green sm" disabled={!!cb} title={cb ?? ""} onClick={() => send({ type: "BUILD", tile: id })}>
                      Build {!cb ? inr(buildCost(state, pid, id)) : ""}
                    </button>
                    <button className="btn alt sm" disabled={!!cs} title={cs ?? ""} onClick={() => send({ type: "SELL_BUILDING", tile: id })}>
                      Sell
                    </button>
                  </>
                )}
                {ts.mortgaged ? (
                  <button className="btn sm" disabled={!canAct} onClick={() => send({ type: "UNMORTGAGE", tile: id })}>
                    Unmortgage {inr(unmortgageCost(state, id))}
                  </button>
                ) : (
                  <button className="btn red sm" disabled={!!cm} title={cm ?? ""} onClick={() => send({ type: "MORTGAGE", tile: id })}>
                    Mortgage +{inr(mortgageValue(state, id))}
                  </button>
                )}
                {ts.waterlogged && (
                  <button className="btn alt sm" onClick={() => send({ type: "PAY_DRAINAGE", tile: id })}>
                    Drain {inr(c.drainageFee)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {c.bharat.loan && (
        <div className="mt-3 rounded-lg bg-white/5 p-2">
          <div className="text-sm font-bold">🏦 Bank Loan (up to {inr(c.loanMax)}, {c.loanInterestPct}% per round)</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input type="number" className="field !w-28" value={loanAmt} min={100} step={100} onChange={(e) => setLoanAmt(Number(e.target.value))} />
            <button className="btn sm" disabled={!canAct || p.loan + loanAmt > c.loanMax} onClick={() => send({ type: "TAKE_LOAN", amount: loanAmt })}>
              Borrow
            </button>
            <button className="btn alt sm" disabled={p.loan === 0 || p.cash === 0} onClick={() => send({ type: "REPAY_LOAN", amount: Math.min(loanAmt, p.loan) })}>
              Repay
            </button>
            <button className="btn alt sm" disabled={p.loan === 0 || p.cash < p.loan} onClick={() => send({ type: "REPAY_LOAN", amount: p.loan })}>
              Repay all
            </button>
          </div>
        </div>
      )}
      {c.bharat.jugaad && (
        <div className="mt-3 rounded-lg bg-white/5 p-2">
          <div className="text-sm font-bold">🃏 Jugaad cards ({p.jugaad.length}/{c.jugaadMaxCards})</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {p.jugaad.length === 0 && <span className="text-xs opacity-70">You earn one every {c.jugaadEvery} rounds.</span>}
            {p.jugaad.map((k, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-black/20 p-2 text-xs">
                <div>
                  <div className="font-black capitalize">{k}</div>
                  <div className="opacity-70">{k === "jugaad" ? "Next build half price" : k === "sifarish" ? "Waive one rent" : `Offer ${inr(c.bargainOffer)} for the tile you stand on`}</div>
                </div>
                {k === "jugaad" && (
                  <button className="btn sm" disabled={!canAct || p.nextBuildHalf} onClick={() => send({ type: "USE_JUGAAD" })}>
                    {p.nextBuildHalf ? "Active" : "Play"}
                  </button>
                )}
                {k === "bargain" && (
                  <button className="btn sm" disabled={!canAct} onClick={() => send({ type: "USE_BARGAIN" })}>
                    Play
                  </button>
                )}
                {k === "sifarish" && <span className="opacity-70">Played when rent is due</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Trade ------------------------------ */
function sideText(s: TradeSide): string {
  const parts: string[] = [];
  if (s.cash) parts.push(inr(s.cash));
  for (const t of s.tiles) parts.push(TILES[t].name);
  if (s.jailCards) parts.push(`${s.jailCards} jail-free card${s.jailCards > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "nothing";
}

export function TradeModal({ state, me, onClose, send }: { state: GameState; me: number; onClose: () => void; send: Send }) {
  const others = state.players.filter((p) => !p.bankrupt && p.id !== me);
  const [to, setTo] = useState(others[0]?.id ?? 0);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const [giveTiles, setGiveTiles] = useState<number[]>([]);
  const [getTiles, setGetTiles] = useState<number[]>([]);
  const [giveJail, setGiveJail] = useState(0);
  const [getJail, setGetJail] = useState(0);
  const mp = state.players[me];
  const op = state.players[to];
  const toggle = (arr: number[], set: (a: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const tileList = (pid: number, sel: number[], set: (a: number[]) => void) => (
    <div className="max-h-40 overflow-auto">
      {ownedTiles(state, pid).map((id) => {
        const ok = tradable(state, pid, id);
        return (
          <label key={id} className={`flex items-center gap-2 py-0.5 text-sm ${ok ? "" : "opacity-40"}`} title={ok ? "" : "Sell buildings in this group first"}>
            <input type="checkbox" disabled={!ok} checked={sel.includes(id)} onChange={() => toggle(sel, set, id)} />
            <span>
              {TILES[id].icon} {TILES[id].name}
              {state.tiles[id].mortgaged ? " (mortgaged)" : ""}
            </span>
          </label>
        );
      })}
      {ownedTiles(state, pid).length === 0 && <div className="text-xs opacity-60">No properties</div>}
    </div>
  );
  const trade: Omit<Trade, "from"> = { to, give: { cash: giveCash, tiles: giveTiles, jailCards: giveJail }, get: { cash: getCash, tiles: getTiles, jailCards: getJail } };
  return (
    <Modal title="Propose a Trade" onClose={onClose} wide>
      <label className="text-xs font-bold uppercase opacity-70">Trade with</label>
      <select
        className="field mb-3"
        value={to}
        onChange={(e) => {
          setTo(Number(e.target.value));
          setGetTiles([]);
          setGetJail(0);
        }}
      >
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {tokenIcon(p.token)} {p.name} ({inr(p.cash)})
          </option>
        ))}
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="mb-1 font-black text-[#f5c04a]">You give</div>
          <input type="number" min={0} step={100} className="field mb-2" value={giveCash} max={mp.cash} onChange={(e) => setGiveCash(Math.max(0, Math.floor(Number(e.target.value))))} />
          {tileList(me, giveTiles, setGiveTiles)}
          {mp.jailCards > 0 && (
            <label className="mt-1 flex items-center gap-2 text-sm">
              Jail-free cards <input type="number" className="field !w-16" min={0} max={mp.jailCards} value={giveJail} onChange={(e) => setGiveJail(Number(e.target.value))} />
            </label>
          )}
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="mb-1 font-black text-[#f5c04a]">You get</div>
          <input type="number" min={0} step={100} className="field mb-2" value={getCash} max={op.cash} onChange={(e) => setGetCash(Math.max(0, Math.floor(Number(e.target.value))))} />
          {tileList(to, getTiles, setGetTiles)}
          {op.jailCards > 0 && (
            <label className="mt-1 flex items-center gap-2 text-sm">
              Jail-free cards <input type="number" className="field !w-16" min={0} max={op.jailCards} value={getJail} onChange={(e) => setGetJail(Number(e.target.value))} />
            </label>
          )}
        </div>
      </div>
      <div className="mt-3 text-sm opacity-80">
        You give <b>{sideText(trade.give)}</b> and get <b>{sideText(trade.get)}</b>.
      </div>
      <button
        className="btn mt-3"
        onClick={() => {
          send({ type: "PROPOSE_TRADE", trade });
          onClose();
        }}
      >
        Send offer
      </button>
    </Modal>
  );
}

export function TradePrompt({ state, me, send, busy }: { state: GameState; me: number | null; send: Send; busy: boolean }) {
  const t = state.trade;
  if (!t) return null;
  const a = state.players[t.from];
  const b = state.players[t.to];
  const iAmTarget = me === t.to;
  return (
    <div className="panel pop pointer-events-auto w-[min(92vw,26rem)] p-3 text-sm">
      <div className="mb-1 font-black text-[#f5c04a]">{t.bargain ? "🃏 Bargain offer" : "🤝 Trade offer"}</div>
      <p>
        <b>{a.name}</b> offers <b>{sideText(t.give)}</b> to <b>{b.name}</b> for <b>{sideText(t.get)}</b>.
      </p>
      {iAmTarget ? (
        <div className="mt-2 flex gap-2">
          <button className="btn green sm" disabled={busy} onClick={() => send({ type: "ACCEPT_TRADE" }, t.to)}>
            Accept
          </button>
          <button className="btn red sm" disabled={busy} onClick={() => send({ type: "REJECT_TRADE" }, t.to)}>
            Decline
          </button>
        </div>
      ) : me === t.from ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="opacity-70">Waiting for {b.name}…</span>
          <button className="btn alt sm" onClick={() => send({ type: "CANCEL_TRADE" }, t.from)}>
            Withdraw
          </button>
        </div>
      ) : (
        <div className="mt-2 opacity-70">Waiting for {b.name}…</div>
      )}
    </div>
  );
}

/* ------------------------------ Decision dock ------------------------------ */
export function Dock({ state, me, send, busy, openAssets, thinking }: { state: GameState; me: number | null; send: Send; busy: boolean; openAssets: () => void; thinking: string | null }) {
  const [confirmBk, setConfirmBk] = useState(false);
  const actor = state.players[state.phase === "auction" && state.auction ? state.auction.turn : state.phase === "debt" && state.debt ? state.debt.player : state.current];
  const mineTurn = me !== null && me === actor.id;

  if (state.phase === "buy" && state.pendingBuy !== null) {
    const t = TILES[state.pendingBuy];
    return (
      <div className="panel pop w-[min(92vw,26rem)] p-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">{t.icon}</div>
          <div>
            <div className="title-font text-lg font-black">{t.name}</div>
            <div className="text-xs opacity-75">Unowned · {inr(t.price)}</div>
          </div>
        </div>
        {mineTurn ? (
          <div className="mt-2 flex gap-2">
            <button className="btn green flex-1" disabled={busy} onClick={() => send({ type: "BUY" })}>
              Buy {inr(t.price)}
            </button>
            <button className="btn alt flex-1" disabled={busy} onClick={() => send({ type: "DECLINE" })}>
              Auction it
            </button>
          </div>
        ) : (
          <div className="mt-2 text-sm opacity-75">{thinking ?? `${actor.name} is deciding…`}</div>
        )}
      </div>
    );
  }

  if (state.phase === "auction" && state.auction) {
    const a = state.auction;
    const t = TILES[a.tile];
    const nb = minBid(state);
    const bidder = a.bidder !== null ? state.players[a.bidder] : null;
    return (
      <div className="panel pop w-[min(92vw,28rem)] p-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">{t.icon}</div>
          <div className="flex-1">
            <div className="title-font text-lg font-black">🔨 Auction: {t.name}</div>
            <div className="text-xs opacity-75">
              {bidder ? `High bid ${inr(a.bid)} by ${bidder.name}` : `No bids yet. Opening ${inr(nb)}`} · list price {inr(t.price)}
            </div>
          </div>
        </div>
        <div className="mt-1 text-xs opacity-80">In: {a.active.map((i) => `${tokenIcon(state.players[i].token)}${state.players[i].name}`).join(", ")}</div>
        {mineTurn ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {[nb, nb + 500, nb + 1000, nb + 2500].filter((v) => v <= actor.cash).map((v) => (
              <button key={v} className="btn green sm" disabled={busy} onClick={() => send({ type: "BID", amount: v })}>
                Bid {inr(v)}
              </button>
            ))}
            <button className="btn red sm" disabled={busy} onClick={() => send({ type: "PASS_BID" })}>
              Pass
            </button>
          </div>
        ) : (
          <div className="mt-2 text-sm opacity-75">{actor.name} to bid…</div>
        )}
      </div>
    );
  }

  if (state.phase === "tax") {
    const pct = r10((netWorth(state, actor.id) * state.config.incomeTaxPct) / 100);
    return (
      <div className="panel pop w-[min(92vw,26rem)] p-3">
        <div className="title-font text-lg font-black">🧾 Income Tax</div>
        {mineTurn ? (
          <div className="mt-2 flex gap-2">
            <button className="btn flex-1" disabled={busy} onClick={() => send({ type: "PAY_TAX", choice: "flat" })}>
              Flat {inr(state.config.incomeTaxFlat)}
            </button>
            <button className="btn alt flex-1" disabled={busy} onClick={() => send({ type: "PAY_TAX", choice: "percent" })}>
              {state.config.incomeTaxPct}% of net worth ({inr(pct)})
            </button>
          </div>
        ) : (
          <div className="mt-1 text-sm opacity-75">{actor.name} is choosing…</div>
        )}
      </div>
    );
  }

  if (state.phase === "debt" && state.debt) {
    const d = state.debt;
    const p = state.players[d.player];
    const cred = d.creditor === "bank" ? "the bank" : state.players[d.creditor].name;
    return (
      <div className="panel pop w-[min(92vw,28rem)] border-red-400/60 p-3">
        <div className="title-font text-lg font-black text-red-300">⚠️ {p.name} owes {inr(d.amount)} to {cred}</div>
        <div className="text-xs opacity-75">{d.reason} · cash {inr(p.cash)}</div>
        {mineTurn ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn green sm" disabled={busy || p.cash < d.amount} onClick={() => send({ type: "PAY_DEBT" })}>
              Pay {inr(d.amount)}
            </button>
            {d.canWaive && p.jugaad.includes("sifarish") && (
              <button className="btn sm" disabled={busy} onClick={() => send({ type: "USE_SIFARISH" })}>
                🃏 Play Sifarish
              </button>
            )}
            <button className="btn alt sm" onClick={openAssets}>
              Raise funds
            </button>
            {confirmBk ? (
              <button className="btn red sm" disabled={busy} onClick={() => send({ type: "BANKRUPT" })}>
                Confirm bankruptcy
              </button>
            ) : (
              <button className="btn red sm" onClick={() => setConfirmBk(true)}>
                Go bankrupt
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1 text-sm opacity-75">{p.name} is sorting it out…</div>
        )}
      </div>
    );
  }
  return null;
}

/* ------------------------------ Misc modals ------------------------------ */
export function CardModal({ deck, text, who, onClose }: { deck: string; text: string; who: string; onClose: () => void }) {
  const naseeb = deck === "naseeb";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="cardflip w-[min(90vw,22rem)] rounded-2xl p-5 text-center shadow-2xl"
        style={{ background: naseeb ? "linear-gradient(145deg,#ffe28a,#e59a1d)" : "linear-gradient(145deg,#9af0c6,#2fa377)", color: naseeb ? "#4a2a00" : "#053826", border: "4px solid #fff8" }}
      >
        <div className="text-6xl">{naseeb ? "🎡" : "🧰"}</div>
        <div className="title-font mt-1 text-2xl font-black">{naseeb ? "Naseeb" : "Khazana"}</div>
        <div className="text-xs font-bold uppercase tracking-widest opacity-70">{who} drew</div>
        <p className="mt-3 text-lg font-bold">{text}</p>
        <button className="btn alt mt-4">Continue</button>
      </div>
    </div>
  );
}

export function GameOver({ state, seedReveal, commit, onHome, onAgain }: { state: GameState; seedReveal: string | null; commit: string | null; onHome: () => void; onAgain?: () => void }) {
  const w = state.players[state.winner ?? 0];
  const ranking = [...state.players].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="fx pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }, (_, i) => (
          <span key={i} className="confetti" style={{ left: `${(i * 29) % 100}%`, background: ["#f5c04a", "#ec6aa5", "#4fb8ea", "#3fa45a", "#e03a3a"][i % 5], animationDelay: `${-(i % 10) * 0.4}s` }} />
        ))}
      </div>
      <div className="panel pop relative w-full max-w-md p-5 text-center">
        <div className="text-6xl">🏆</div>
        <h2 className="title-font text-3xl font-black text-[#f5c04a]">{w.name} wins!</h2>
        <p className="text-sm opacity-80">{state.endReason}</p>
        <div className="mt-3 text-left">
          {ranking.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 border-b border-white/10 py-1 text-sm">
              <span className="w-5 font-black">{i + 1}</span>
              <span className="text-xl">{tokenIcon(p.token)}</span>
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="opacity-70">{p.bankrupt ? "bankrupt" : inr(netWorth(state, p.id))}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 break-all text-left text-[10px] opacity-60">
          Fair-play audit · commit {commit?.slice(0, 24)}… reveal {seedReveal ?? "pending"}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {onAgain && (
            <button className="btn green" onClick={onAgain}>
              Rematch
            </button>
          )}
          <button className="btn alt" onClick={onHome}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { s, set } = useSettings();
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-sm">
      <span className="font-bold">{label}</span>
      {children}
    </div>
  );
  const Tog = ({ k }: { k: "reducedMotion" | "colorBlind" | "leftHand" | "sound" | "haptics" | "batterySaver" | "subtitles" }) => (
    <button
      role="switch"
      aria-checked={s[k]}
      onClick={() => {
        set({ [k]: !s[k] });
        sfx.click();
      }}
      className={`h-6 w-11 rounded-full p-0.5 transition ${s[k] ? "bg-green-500" : "bg-white/20"}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-white transition ${s[k] ? "translate-x-5" : ""}`} />
    </button>
  );
  return (
    <Modal title="Settings" onClose={onClose}>
      <Row label="Graphics preset">
        <select className="field !w-32" value={s.quality} onChange={(e) => set({ quality: e.target.value as typeof s.quality })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="ultra">Ultra</option>
        </select>
      </Row>
      <Row label="Battery saver (30 fps, fewer effects)">
        <Tog k="batterySaver" />
      </Row>
      <Row label="Text size">
        <select className="field !w-32" value={s.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })}>
          <option value={1}>Normal</option>
          <option value={1.15}>Large</option>
          <option value={1.3}>Extra large</option>
        </select>
      </Row>
      <Row label="Colour-blind patterns">
        <Tog k="colorBlind" />
      </Row>
      <Row label="Reduced motion">
        <Tog k="reducedMotion" />
      </Row>
      <Row label="Left-hand mode">
        <Tog k="leftHand" />
      </Row>
      <Row label="Sound effects">
        <Tog k="sound" />
      </Row>
      <Row label="Haptics">
        <Tog k="haptics" />
      </Row>
      <Row label="Event subtitles">
        <Tog k="subtitles" />
      </Row>
    </Modal>
  );
}

export { FESTIVALS, GROUP_TILES };
