"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TOKENS, type BharatToggles } from "@/core";
import { post, saveCreds } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { SettingsModal } from "@/components/game/panels";
import { sfx } from "@/lib/sfx";

interface Seat {
  kind: "human" | "ai";
  name: string;
  token: string;
  personality: string;
  difficulty: string;
}

const PERS = [
  ["balanced", "Balanced Munshi"],
  ["cautious", "Cautious Seth"],
  ["aggressive", "Aggressive Tycoon"],
  ["trader", "Trader"],
];

const TOGGLE_LABELS: Record<keyof BharatToggles, string> = {
  festival: "Festival Calendar",
  monsoon: "Monsoon Season",
  footfall: "Tourism Footfall",
  regional: "Regional Dominance",
  loan: "Bank Loan",
  rickshaw: "Rickshaw Die",
  jugaad: "Jugaad Cards",
  heritage: "Heritage Bonus",
};

const DEFAULT_TOGGLES: BharatToggles = { festival: true, monsoon: true, footfall: true, regional: true, loan: true, rickshaw: false, jugaad: true, heritage: true };

export default function Home() {
  const router = useRouter();
  useSettings();
  const [tab, setTab] = useState<"local" | "online">("local");
  const [count, setCount] = useState(3);
  const [seats, setSeats] = useState<Seat[]>([
    { kind: "human", name: "You", token: "rickshaw", personality: "balanced", difficulty: "medium" },
    { kind: "ai", name: "", token: "elephant", personality: "cautious", difficulty: "medium" },
    { kind: "ai", name: "", token: "tiger", personality: "aggressive", difficulty: "medium" },
    { kind: "ai", name: "", token: "peacock", personality: "trader", difficulty: "medium" },
  ]);
  const [ruleMode, setRuleMode] = useState<"bharat" | "classic">("bharat");
  const [toggles, setToggles] = useState<BharatToggles>(DEFAULT_TOGGLES);
  const [roundLimit, setRoundLimit] = useState(30);
  const [timer, setTimer] = useState(0);
  const [name, setName] = useState("Guest");
  const [token, setToken] = useState("rickshaw");
  const [joinCode, setJoinCode] = useState("");
  const [extra, setExtra] = useState<("open" | "ai")[]>(["open", "ai"]);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setRecent(JSON.parse(localStorage.getItem("bv:recent") ?? "[]"));
        const n = localStorage.getItem("bv:name");
        if (n) setName(n);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const options = { mode: ruleMode, toggles, roundLimit, timerSeconds: timer };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    sfx.click();
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const startLocal = () =>
    guard(async () => {
      const res = await post<{ code: string }>("/api/rooms", { action: "local", players: seats.slice(0, count), options });
      if (res.code) router.push(`/play/${res.code}`);
      else setErr(res.error ?? "Could not start");
    });

  const enterRoom = (res: { code?: string; seat?: number; secret?: string; error?: string }) => {
    if (res.code && res.secret !== undefined && res.seat !== undefined) {
      saveCreds(res.code, { seat: res.seat, secret: res.secret });
      try {
        localStorage.setItem("bv:name", name);
      } catch {
        /* ignore */
      }
      router.push(`/play/${res.code}`);
    } else setErr(res.error ?? "Something went wrong");
  };

  const createRoom = () => guard(async () => enterRoom(await post("/api/rooms", { action: "create", name, token, slots: extra, options, isPublic })));
  const joinRoom = () => guard(async () => enterRoom(await post("/api/rooms", { action: "join", code: joinCode, name, token })));
  const quick = () => guard(async () => enterRoom(await post("/api/rooms", { action: "quick", name, token, ruleKey: ruleMode })));

  const upd = (i: number, p: Partial<Seat>) => setSeats((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="fx pointer-events-none absolute inset-0">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="mote" style={{ left: `${(i * 41) % 100}%`, top: `${50 + ((i * 29) % 50)}%`, animationDelay: `${-i * 1.3}s` }} />
        ))}
      </div>
      <div className="relative mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6 text-center">
          <div className="text-6xl">🪔</div>
          <h1 className="title-font text-5xl font-black tracking-wide text-[#f5c04a] drop-shadow-[0_4px_12px_rgba(245,192,74,0.4)] sm:text-6xl">Bharat Vyapar 3D</h1>
          <p className="mt-1 text-lg opacity-85">Travel 40 tiles across India. Buy cities, build malls, trade, and outlast your rivals.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href="/rules" className="btn alt sm">📖 Rules book</Link>
            <Link href="/leaderboard" className="btn alt sm">🏆 Leaderboard</Link>
            <button className="btn alt sm" onClick={() => setShowSettings(true)}>⚙ Settings</button>
          </div>
        </header>

        <div className="mb-4 flex justify-center gap-2">
          <button className={`btn ${tab === "local" ? "" : "alt"}`} onClick={() => setTab("local")}>📱 Offline: vs AI / Pass & Play</button>
          <button className={`btn ${tab === "online" ? "" : "alt"}`} onClick={() => setTab("online")}>🌐 Online</button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <section className="panel p-4 md:col-span-3">
            {tab === "local" ? (
              <>
                <h2 className="title-font mb-2 text-xl font-black text-[#f5c04a]">Players</h2>
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className="font-bold">Seats</span>
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={`btn sm ${count === n ? "" : "alt"}`} onClick={() => setCount(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {seats.slice(0, count).map((s, i) => (
                    <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-xl bg-white/5 p-2">
                      <select className="field col-span-3" value={s.kind} onChange={(e) => upd(i, { kind: e.target.value as Seat["kind"] })} aria-label={`Seat ${i + 1} type`}>
                        <option value="human">Human</option>
                        <option value="ai">AI</option>
                      </select>
                      <select className="field col-span-3" value={s.token} onChange={(e) => upd(i, { token: e.target.value })} aria-label="Token">
                        {TOKENS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.icon} {t.name}
                          </option>
                        ))}
                      </select>
                      {s.kind === "human" ? (
                        <input className="field col-span-6" placeholder={`Player ${i + 1}`} maxLength={14} value={s.name} onChange={(e) => upd(i, { name: e.target.value })} />
                      ) : (
                        <>
                          <select className="field col-span-4" value={s.personality} onChange={(e) => upd(i, { personality: e.target.value })}>
                            {PERS.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <select className="field col-span-2" value={s.difficulty} onChange={(e) => upd(i, { difficulty: e.target.value })}>
                            <option value="easy">Easy</option>
                            <option value="medium">Med</option>
                            <option value="hard">Hard</option>
                          </select>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs opacity-70">Two or more humans = pass-and-play with a hide-cash screen between turns.</p>
                <button className="btn green mt-4 w-full !py-3 text-lg" disabled={busy} onClick={startLocal}>
                  ▶ Start game
                </button>
              </>
            ) : (
              <>
                <h2 className="title-font mb-2 text-xl font-black text-[#f5c04a]">Online room</h2>
                <div className="grid grid-cols-2 gap-2">
                  <input className="field" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" />
                  <select className="field" value={token} onChange={(e) => setToken(e.target.value)}>
                    {TOKENS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.icon} {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 rounded-xl bg-white/5 p-3">
                  <div className="mb-1 text-sm font-black">Create a private room</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {extra.map((k, i) => (
                      <select key={i} className="field !w-32" value={k} onChange={(e) => setExtra((x) => x.map((y, j) => (j === i ? (e.target.value as "open" | "ai") : y)))}>
                        <option value="open">Friend seat</option>
                        <option value="ai">AI player</option>
                      </select>
                    ))}
                    <button className="btn alt sm" disabled={extra.length >= 3} onClick={() => setExtra((x) => [...x, "open"])}>+ seat</button>
                    <button className="btn alt sm" disabled={extra.length <= 1} onClick={() => setExtra((x) => x.slice(0, -1))}>− seat</button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Show in quick match
                  </label>
                  <button className="btn mt-2 w-full" disabled={busy} onClick={createRoom}>Create room</button>
                </div>
                <div className="mt-3 flex gap-2">
                  <input className="field uppercase tracking-[0.3em]" maxLength={6} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" aria-label="Room code" />
                  <button className="btn" disabled={busy || joinCode.length !== 6} onClick={joinRoom}>Join</button>
                </div>
                <button className="btn green mt-3 w-full" disabled={busy} onClick={quick}>⚡ Quick match ({ruleMode === "classic" ? "Classic" : "Bharat"})</button>
                <p className="mt-2 text-xs opacity-70">Server-authoritative: every command is validated by the rules engine on the server. The match seed is committed by hash and revealed at the end.</p>
              </>
            )}
            {err && <p className="mt-3 rounded-lg bg-red-600/40 p-2 text-sm font-bold">{err}</p>}
          </section>

          <section className="panel p-4 md:col-span-2">
            <h2 className="title-font mb-2 text-xl font-black text-[#f5c04a]">Rules</h2>
            <div className="flex gap-2">
              <button className={`btn sm flex-1 ${ruleMode === "bharat" ? "" : "alt"}`} onClick={() => setRuleMode("bharat")}>Bharat Mode</button>
              <button className={`btn sm flex-1 ${ruleMode === "classic" ? "" : "alt"}`} onClick={() => setRuleMode("classic")}>Classic</button>
            </div>
            {ruleMode === "bharat" && (
              <div className="mt-3 grid grid-cols-1 gap-1">
                {(Object.keys(TOGGLE_LABELS) as (keyof BharatToggles)[]).map((k) => (
                  <label key={k} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-sm">
                    {TOGGLE_LABELS[k]}
                    <input type="checkbox" checked={toggles[k]} onChange={(e) => setToggles((t) => ({ ...t, [k]: e.target.checked }))} />
                  </label>
                ))}
              </div>
            )}
            <label className="mt-3 block text-xs font-bold uppercase opacity-70">End condition</label>
            <select className="field" value={roundLimit} onChange={(e) => setRoundLimit(Number(e.target.value))}>
              <option value={0}>Last player standing</option>
              <option value={20}>Round limit: 20</option>
              <option value={30}>Round limit: 30</option>
              <option value={40}>Round limit: 40</option>
            </select>
            <label className="mt-3 block text-xs font-bold uppercase opacity-70">Turn timer</label>
            <select className="field" value={timer} onChange={(e) => setTimer(Number(e.target.value))}>
              <option value={0}>Off</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
            {recent.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-bold uppercase opacity-70">Continue a saved game</h3>
                <div className="mt-1 flex flex-wrap gap-2">
                  {recent.map((c) => (
                    <Link key={c} href={`/play/${c}`} className="btn alt sm tracking-widest">
                      {c}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
        <footer className="mt-6 text-center text-xs opacity-60">
          Original names, art and sounds. Not affiliated with any commercial board game. Play for fun: no real-money gambling.
        </footer>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </main>
  );
}
