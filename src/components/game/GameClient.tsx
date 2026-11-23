"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GROUP_COLORS, TILES, expectedActor, inr, netWorth, tileGrid, tokenIcon, type Command, type GameEvent, type GameState } from "@/core";
import { post, loadCreds, rememberGame, type Creds, type GameView } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { haptic, sfx } from "@/lib/sfx";
import { Board } from "./Board";
import { Assets, CardModal, Deed, Dock, GameOver, SettingsModal, TradeModal, TradePrompt } from "./panels";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LogLine {
  id: string;
  msg: string;
  t: string;
  pid?: number;
}

function sideRot(pos: number): number {
  if (pos % 10 === 0) return pos === 0 ? 0 : pos === 10 ? -45 : pos === 20 ? 180 : 135;
  if (pos < 10) return 0;
  if (pos < 20) return -90;
  if (pos < 30) return 180;
  return 90;
}

function MiniMap({ state }: { state: GameState }) {
  const cells = TILES.map((t) => {
    const { col, row } = tileGrid(t.id);
    const owner = state.tiles[t.id].owner;
    const bg = owner !== null ? state.players[owner].color : t.group ? GROUP_COLORS[t.group].color + "88" : "#ffffff22";
    return { t, col, row, bg };
  });
  return (
    <div className="relative mx-auto aspect-square w-32 rounded-lg bg-black/30 p-1" aria-label="Mini-map">
      <div className="grid h-full w-full" style={{ gridTemplateColumns: "repeat(11,1fr)", gridTemplateRows: "repeat(11,1fr)", gap: 1 }}>
        {cells.map(({ t, col, row, bg }) => (
          <div key={t.id} style={{ gridColumn: col + 1, gridRow: row + 1, background: bg, borderRadius: 2 }} />
        ))}
        {state.players.map((p) => {
          if (p.bankrupt) return null;
          const { col, row } = tileGrid(p.pos);
          return (
            <div key={p.id} style={{ gridColumn: col + 1, gridRow: row + 1, zIndex: 2 }} className="flex items-center justify-center">
              <span className="block rounded-full border border-white" style={{ width: 7, height: 7, background: p.color }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GameClient({ code }: { code: string }) {
  const router = useRouter();
  const { s: settings } = useSettings();
  const [view, setView] = useState<GameView | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [subs, setSubs] = useState<{ id: number; msg: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [modal, setModal] = useState<"assets" | "trade" | "settings" | null>(null);
  const [cardModal, setCardModal] = useState<{ deck: string; text: string; who: string } | null>(null);
  const [banner, setBanner] = useState<{ icon: string; title: string; desc: string } | null>(null);
  const [shown, setShown] = useState<number[]>([]);
  const [tilt, setTilt] = useState(52);
  const [rot, setRot] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [topDown, setTopDown] = useState(false);
  const [follow, setFollow] = useState(false);
  const [revealed, setRevealed] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [gameOverOpen, setGameOverOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const viewRef = useRef<GameView | null>(null);
  const busyRef = useRef(false);
  const lastSeq = useRef(-1);
  const shownRef = useRef<number[]>([]);
  const animRoll = useRef(-1);
  const mounted = useRef(true);
  const subId = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(false);
  const credsRef = useRef<Creds | null>(null);
  const aiFails = useRef(0);

  useEffect(() => {
    reducedRef.current = settings.reducedMotion || settings.batterySaver;
  }, [settings.reducedMotion, settings.batterySaver]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    setTimeout(() => {
      if (mounted.current) fn();
    }, ms);
  }, []);

  const pushSub = useCallback(
    (msg: string) => {
      const id = ++subId.current;
      setSubs((x) => [...x.slice(-2), { id, msg }]);
      later(4200, () => setSubs((x) => x.filter((y) => y.id !== id)));
    },
    [later],
  );

  const runEffects = useCallback(
    (evs: GameEvent[], state: GameState) => {
      for (const e of evs) {
        switch (e.t) {
          case "card":
            sfx.card();
            setCardModal({ deck: String(e.data?.deck), text: String(e.data?.text), who: state.players[e.pid ?? 0].name });
            break;
          case "buy":
            sfx.buy();
            haptic(40);
            pushSub(e.msg);
            break;
          case "rent":
          case "pay":
            sfx.rent();
            pushSub(e.msg);
            break;
          case "salary":
          case "gain":
          case "heritage":
            sfx.coin();
            pushSub(e.msg);
            break;
          case "festival":
          case "monsoon": {
            sfx.festival();
            const id = String(e.data?.id ?? "");
            setBanner({ icon: e.t === "monsoon" ? "🌧️" : "🎉", title: e.t === "monsoon" ? "Monsoon Alert" : id.toUpperCase(), desc: e.msg });
            later(5000, () => setBanner(null));
            break;
          }
          case "jail":
          case "bankrupt":
            sfx.jail();
            pushSub(e.msg);
            break;
          case "bid":
            sfx.gavel();
            break;
          case "gameover":
            sfx.fanfare();
            break;
          case "build":
            sfx.fanfare();
            pushSub(e.msg);
            break;
          case "trade":
          case "loan":
          case "holi":
          case "jugaad":
            sfx.coin();
            pushSub(e.msg);
            break;
        }
      }
    },
    [later, pushSub],
  );

  const applyView = useCallback(
    (v: GameView, silent = false) => {
      const prev = viewRef.current;
      if (prev && v.seq < prev.seq && v.status === prev.status) return;
      const batches = (v.events ?? []).filter((b) => b.seq > lastSeq.current).sort((a, b) => a.seq - b.seq);
      const lines: LogLine[] = [];
      let delay = 0;
      for (const b of batches) {
        lastSeq.current = Math.max(lastSeq.current, b.seq);
        b.events.forEach((e, i) => lines.push({ id: `${b.seq}-${i}`, msg: e.msg, t: e.t, pid: e.pid }));
        if (silent) continue;
        const hasRoll = b.events.some((e) => e.t === "roll");
        const mv = b.events.find((e) => e.t === "move");
        if (hasRoll) sfx.dice();
        if (hasRoll && mv) {
          const from = Number((mv.data as { from?: number })?.from ?? 0);
          const dist = ((mv.tile ?? 0) - from + 40) % 40;
          delay = reducedRef.current ? 300 : 1100 + Math.min(dist <= 14 ? dist : 2, 14) * 190 + 150;
        } else if (hasRoll) delay = reducedRef.current ? 200 : 1000;
        else if (mv) delay = 200;
        const st = v.state;
        if (st) {
          const evs = b.events;
          // roll-related effects wait for the token; others fire after short delay
          later(delay, () => runEffects(evs.filter((e) => e.t !== "roll"), st));
        }
      }
      if (lines.length) setLog((l) => [...l, ...lines].slice(-200));
      viewRef.current = v;
      setView(v);
    },
    [later, runEffects],
  );

  // initial load
  useEffect(() => {
    const c = loadCreds(code);
    credsRef.current = c;
    setTimeout(() => setCreds(c), 0);
    rememberGame(code);
    let dead = false;
    (async () => {
      try {
        const r = await fetch(`/api/games/${code}`);
        const v = (await r.json()) as GameView;
        if (dead) return;
        if (!r.ok) {
          setLoadErr(v.error ?? "Game not found");
          return;
        }
        applyView(v, true);
      } catch {
        if (!dead) setLoadErr("Could not reach the server");
      }
    })();
    return () => {
      dead = true;
    };
  }, [code, applyView]);

  // polling (online rooms and lobbies)
  const status = view?.status;
  const mode = view?.mode;
  useEffect(() => {
    if (!status || mode !== "online" || status === "finished") return;
    const id = setInterval(async () => {
      if (busyRef.current) return;
      try {
        const r = await fetch(`/api/games/${code}?since=${lastSeq.current < 0 ? 0 : lastSeq.current}`);
        if (!r.ok) return;
        const v = (await r.json()) as GameView;
        if (busyRef.current) return;
        applyView(v);
      } catch {
        /* retry next tick */
      }
    }, 1800);
    return () => clearInterval(id);
  }, [status, mode, code, applyView]);

  const state = view?.state ?? null;

  // token tween
  const posKey = state ? state.players.map((p) => p.pos).join(",") : "";
  const rollId = state?.rollId ?? 0;
  useEffect(() => {
    const s = viewRef.current?.state;
    if (!s) return;
    if (!shownRef.current.length) {
      shownRef.current = s.players.map((p) => p.pos);
      setShown(shownRef.current);
      return;
    }
    const target = s.players.map((p) => p.pos);
    if (target.every((t, i) => t === shownRef.current[i])) return;
    let cancelled = false;
    (async () => {
      if (animRoll.current !== s.rollId) {
        animRoll.current = s.rollId;
        await sleep(reducedRef.current ? 150 : 1050);
      }
      for (let i = 0; i < target.length; i++) {
        while (!cancelled && shownRef.current[i] !== target[i]) {
          const cur = shownRef.current[i];
          const fwd = (target[i] - cur + 40) % 40;
          const walk = fwd > 0 && fwd <= 14;
          const next = walk ? (cur + 1) % 40 : target[i];
          const arr = shownRef.current.slice();
          arr[i] = next;
          shownRef.current = arr;
          if (!cancelled) setShown(arr);
          sfx.hop();
          await sleep(reducedRef.current ? 40 : walk ? 190 : 500);
        }
      }
      if (!cancelled) haptic(30);
    })();
    return () => {
      cancelled = true;
    };
  }, [posKey, rollId]);

  const settled = !state || shown.length === 0 || state.players.every((p, i) => shown[i] === p.pos);

  // camera follow
  useEffect(() => {
    if (!follow || !state) return;
    const pos = shown[state.current] ?? state.players[state.current].pos;
    const target = sideRot(pos);
    setRot((r) => target + 360 * Math.round((r - target) / 360));
  }, [follow, shown, state]);

  // who am I?
  const actorId = state ? expectedActor(state) : -1;
  const actor = state && actorId >= 0 ? state.players[actorId] : null;
  const isLocal = view?.mode === "local";
  const me: number | null = !state ? null : isLocal ? (actor && actor.kind === "human" ? actor.id : null) : creds ? creds.seat : null;
  const hotseat = !!state && isLocal && state.players.filter((p) => p.kind === "human").length > 1;
  const canAct = !!state && state.phase !== "gameover" && me !== null && actorId === me && settled && !busy;
  const viewerPid = me ?? (state ? state.current : 0);

  const send = useCallback(
    async (cmd: Command, actorOverride?: number) => {
      const v = viewRef.current;
      if (!v?.state || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      sfx.click();
      const a = actorOverride ?? (v.mode === "local" ? expectedActor(v.state) : (credsRef.current?.seat ?? 0));
      const res = await post<GameView>(`/api/games/${code}`, { action: "command", cmd, actor: a, seat: credsRef.current?.seat, secret: credsRef.current?.secret });
      if (res.state) applyView(res as GameView);
      if (res.error) {
        sfx.error();
        setErr(res.error);
        later(3500, () => setErr(null));
      }
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    },
    [code, applyView, later],
  );

  const runAI = useCallback(
    async (force: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const res = await post<GameView>(`/api/games/${code}`, { action: "ai", force: force || aiFails.current >= 3, seat: credsRef.current?.seat, secret: credsRef.current?.secret });
      if (res.idle || res.error) aiFails.current++;
      else aiFails.current = 0;
      if (res.state) applyView(res as GameView);
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    },
    [code, applyView],
  );

  // AI driver with human-like pacing
  const seq = view?.seq ?? 0;
  useEffect(() => {
    if (!state || status !== "playing" || state.phase === "gameover" || !settled || busy) return;
    const a = state.players[expectedActor(state)];
    if (!a || a.kind !== "ai") return;
    const isHost = isLocal || credsRef.current?.seat === 0;
    const think = reducedRef.current ? 350 : 800 + Math.random() * 1700;
    const id = setTimeout(() => void runAI(false), think + (isHost ? 0 : 6000));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, settled, busy, status]);

  // turn timer (configurable; AI plays a safe default on timeout)
  const timerSec = state?.config.timerSeconds ?? 0;
  useEffect(() => {
    if (!timerSec || !state || state.phase === "gameover" || status !== "playing") {
      setTimeout(() => setLeft(null), 0);
      return;
    }
    const a = state.players[expectedActor(state)];
    if (!a || a.kind !== "human") {
      setTimeout(() => setLeft(null), 0);
      return;
    }
    let n = timerSec;
    setTimeout(() => setLeft(n), 0);
    const isHost = isLocal || credsRef.current?.seat === 0;
    const id = setInterval(() => {
      n -= 1;
      setLeft(Math.max(0, n));
      if (n <= -1 && isHost) {
        clearInterval(id);
        void runAI(true);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, timerSec, status]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  const startMatch = async () => {
    if (!creds) return;
    setBusy(true);
    const res = await post<GameView>(`/api/games/${code}`, { action: "start", seat: creds.seat, secret: creds.secret });
    if (res.error) {
      setErr(res.error);
      later(3500, () => setErr(null));
    } else {
      lastSeq.current = -1;
      applyView(res as GameView, true);
    }
    setBusy(false);
  };

  const rematch = async () => {
    if (!view?.lobby || !state) return;
    const c = state.config;
    const res = await post<{ code: string }>("/api/rooms", {
      action: "local",
      players: state.players.map((p) => ({ name: p.name, kind: p.kind, token: p.token, personality: p.personality, difficulty: p.difficulty })),
      options: { mode: view.ruleKey, toggles: c.bharat, roundLimit: c.roundLimit, timerSeconds: c.timerSeconds, startCash: c.startCash },
    });
    if (res.code) router.push(`/play/${res.code}`);
  };

  const hide = useMemo(() => {
    if (!hotseat || !state || !actor || actor.kind !== "human") return false;
    return revealed !== `${actor.id}:${state.turns}:${state.phase === "auction" ? "a" : ""}` && settled && state.phase !== "gameover";
  }, [hotseat, state, actor, revealed, settled]);

  if (loadErr) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="panel p-6">
          <div className="text-5xl">🧭</div>
          <p className="mt-2 text-lg font-bold">{loadErr}</p>
          <Link href="/" className="btn mt-4 inline-block">
            Back to menu
          </Link>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="title-font animate-pulse text-3xl text-[#f5c04a]">Loading Bharat Vyapar…</div>
      </div>
    );
  }

  /* ---------------- Lobby ---------------- */
  if (view.status === "lobby" && view.lobby) {
    const isHost = creds?.seat === 0;
    const slots = view.lobby.slots;
    const joined = slots.filter((s) => s.claimed || s.kind === "ai").length;
    const url = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="panel w-full max-w-lg p-6 text-center">
          <div className="text-sm font-bold uppercase tracking-widest opacity-70">Room code</div>
          <div className="title-font my-1 text-6xl font-black tracking-[0.3em] text-[#f5c04a]">{code}</div>
          <button
            className="btn alt sm"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
              later(1500, () => setCopied(false));
            }}
          >
            {copied ? "Link copied!" : "Copy invite link"}
          </button>
          <div className="mt-4 space-y-2 text-left">
            {slots.map((sl, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
                <span className="text-3xl">{tokenIcon(sl.token)}</span>
                <div className="flex-1">
                  <div className="font-bold">{sl.claimed || sl.kind === "ai" ? sl.name : "Waiting for a player…"}</div>
                  <div className="text-xs opacity-70">{sl.kind === "ai" ? `AI · ${sl.personality} · ${sl.difficulty}` : sl.claimed ? (i === 0 ? "Host" : "Joined") : "Open seat"}</div>
                </div>
                {creds?.seat === i && <span className="chip">You</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1 text-xs">
            <span className="chip">{view.ruleKey === "classic" ? "Classic rules" : "Bharat Mode"}</span>
            <span className="chip">{view.lobby.config.roundLimit ? `${view.lobby.config.roundLimit} rounds` : "Last player standing"}</span>
          </div>
          {isHost ? (
            <button className="btn green mt-4 w-full" disabled={busy || joined < 2} onClick={startMatch}>
              {joined < 2 ? "Waiting for players…" : slots.some((s) => s.kind === "human" && !s.claimed) ? "Start now (empty seats are removed)" : "Start match"}
            </button>
          ) : (
            <p className="mt-4 text-sm opacity-80">Waiting for the host to start…</p>
          )}
          {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
          <Link href="/" className="mt-3 inline-block text-sm underline opacity-70">
            Leave room
          </Link>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const cur = state.players[state.current];
  const meP = me !== null ? state.players[me] : null;
  const inJailTurn = cur.inJail && state.phase === "roll";
  const showCash = (pid: number) => !hotseat || (actor && actor.id === pid);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-stretch gap-2 overflow-x-auto bg-black/40 px-2 py-1.5">
        {state.players.map((p) => {
          const active = p.id === actorId;
          return (
            <div
              key={p.id}
              className={`flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-xl px-2 py-1 ${p.bankrupt ? "opacity-40" : ""}`}
              style={{ background: active ? `linear-gradient(135deg, ${p.color}55, #ffffff10)` : "#ffffff0d", border: `2px solid ${active ? p.color : "transparent"}` }}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full text-2xl" style={{ background: p.color + "55", border: `2px solid ${p.color}` }}>
                {tokenIcon(p.token)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-xs font-black">
                  {p.name}
                  {p.kind === "ai" ? " 🤖" : ""}
                  {me === p.id && !isLocal ? " (you)" : ""}
                </div>
                <div className="text-sm font-black text-[#ffd45e]">{p.bankrupt ? "Bankrupt" : showCash(p.id) ? inr(p.cash) : "₹ ••••"}</div>
                <div className="truncate text-[10px] opacity-70">
                  {p.bankrupt ? "" : showCash(p.id) ? `Net ${inr(netWorth(state, p.id))}` : "Hidden"}
                  {p.inJail ? " · ⛓️" : ""}
                  {p.loan > 0 ? " · 🏦" : ""}
                  {p.jailCards > 0 ? ` · 🗝️${p.jailCards}` : ""}
                  {p.jugaad.length > 0 && showCash(p.id) ? ` · 🃏${p.jugaad.length}` : ""}
                </div>
              </div>
              {active && left !== null && <span className={`text-lg font-black ${left <= 5 ? "text-red-400" : ""}`}>{left}</span>}
            </div>
          );
        })}
      </header>

      <div className="game-layout flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Stage */}
        <div className="relative min-h-0 flex-1">
          <Board state={state} shown={shown.length ? shown : state.players.map((p) => p.pos)} selected={selected} onSelect={(id) => setSelected(id)} tilt={tilt} rot={rot} zoom={zoom} topDown={topDown} onRot={setRot} onZoom={setZoom} />

          {banner && (
            <div className="banner pointer-events-none absolute left-1/2 top-3 z-20 w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl p-3 text-center" style={{ background: "linear-gradient(135deg,#ff9f1c,#e71d73)", boxShadow: "0 10px 40px rgba(0,0,0,.5)" }}>
              <div className="title-font text-2xl font-black">
                {banner.icon} {banner.title}
              </div>
              <div className="text-sm font-bold">{banner.desc}</div>
            </div>
          )}

          {/* camera controls */}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button className="btn alt sm" title="Top-down strategy view" onClick={() => setTopDown((t) => !t)}>
              {topDown ? "3D" : "2D"}
            </button>
            <button className="btn alt sm" title="Rotate left" onClick={() => setRot((r) => r - 90)}>
              ⟲
            </button>
            <button className="btn alt sm" title="Rotate right" onClick={() => setRot((r) => r + 90)}>
              ⟳
            </button>
            <button className="btn alt sm" onClick={() => setZoom((z) => Math.min(2.2, z * 1.15))}>
              ＋
            </button>
            <button className="btn alt sm" onClick={() => setZoom((z) => Math.max(0.6, z / 1.15))}>
              －
            </button>
            <button className={`btn sm ${follow ? "" : "alt"}`} title="Auto-follow camera" onClick={() => setFollow((f) => !f)}>
              🎥
            </button>
            <button className="btn alt sm" onClick={() => setModal("settings")}>
              ⚙
            </button>
            <Link href="/rules" target="_blank" className="btn alt sm text-center">
              ❓
            </Link>
          </div>

          {/* decision dock */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-2 px-2">
            {settings.subtitles && subs.length > 0 && (
              <div className="flex flex-col items-center gap-1">
                {subs.map((x) => (
                  <div key={x.id} className="pop rounded-full bg-black/70 px-3 py-1 text-center text-xs font-bold">
                    {x.msg}
                  </div>
                ))}
              </div>
            )}
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              {settled && state.trade && <TradePrompt state={state} me={isLocal ? (state.players[state.trade.to].kind === "human" ? state.trade.to : state.trade.from) : me} send={send} busy={busy} />}
              {settled && !state.trade && <Dock state={state} me={canAct || (me !== null && actorId === me) ? me : null} send={send} busy={busy || !settled} openAssets={() => setModal("assets")} thinking={null} />}
            </div>
          </div>
          {err && <div className="pop absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold shadow-xl">{err}</div>}
        </div>

        {/* Sidebar */}
        <aside className="flex max-h-40 w-full flex-col gap-2 border-white/10 bg-black/30 p-2 lg:max-h-none lg:w-64 lg:border-l">
          <div className="hidden lg:block">
            <MiniMap state={state} />
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="chip">{view.ruleKey === "classic" ? "Classic" : "Bharat Mode"}</span>
            <span className="chip">Room {code}</span>
            {state.festival && <span className="chip">🎉 {state.festival.id}</span>}
            {state.monsoon && <span className="chip">🌧️ {state.monsoon.region}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-black/30 p-2 text-xs" aria-live="polite">
            <div className="mb-1 font-black uppercase tracking-wider text-[#f5c04a]">Ledger</div>
            {log.map((l) => (
              <div key={l.id} className="mb-1 flex gap-1.5 leading-snug">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: l.pid !== undefined ? state.players[l.pid]?.color : "#888" }} />
                <span className={l.t === "turn" || l.t === "round" ? "font-bold text-[#ffd45e]" : ""}>{l.msg}</span>
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </aside>
      </div>

      {/* Action bar */}
      <footer className="flex flex-wrap items-center justify-center gap-2 bg-black/50 px-2 py-2">
        {state.phase === "gameover" ? (
          <button className="btn" onClick={() => setGameOverOpen(true)}>
            Show results
          </button>
        ) : (
          <>
            <div className="mr-1 hidden text-sm font-bold sm:block">
              <span className="text-xl">{tokenIcon(cur.token)}</span> {cur.name}
              {!settled ? " is moving…" : ""}
            </div>
            {state.phase === "roll" && !inJailTurn && (
              <button className="btn green" disabled={!canAct} onClick={() => send({ type: "ROLL" })}>
                🎲 {state.extraRoll ? "Roll again" : "Roll dice"}
              </button>
            )}
            {inJailTurn && (
              <>
                <button className="btn green" disabled={!canAct} onClick={() => send({ type: "ROLL" })}>
                  🎲 Roll for doubles
                </button>
                <button className="btn" disabled={!canAct || cur.cash < state.config.jailFine} onClick={() => send({ type: "JAIL_PAY" })}>
                  Pay {inr(state.config.jailFine)}
                </button>
                {cur.jailCards > 0 && (
                  <button className="btn alt" disabled={!canAct} onClick={() => send({ type: "JAIL_CARD" })}>
                    🗝️ Use card
                  </button>
                )}
              </>
            )}
            <button className="btn alt" onClick={() => setModal("assets")}>
              🏠 Assets & Cards
            </button>
            <button className="btn alt" disabled={!canAct || !["roll", "post"].includes(state.phase) || !!state.trade || (me !== null && me !== state.current)} onClick={() => setModal("trade")}>
              🤝 Trade
            </button>
            {state.phase === "post" && (
              <button className="btn" disabled={!canAct} onClick={() => send({ type: "END_TURN" })}>
                End turn ➜
              </button>
            )}
            {meP && !isLocal && me !== actorId && <span className="text-xs opacity-70">Waiting for {actor?.name}…</span>}
            <Link href="/" className="btn alt sm">
              Menu
            </Link>
          </>
        )}
      </footer>

      {/* Modals */}
      {selected !== null && <Deed id={selected} state={state} me={me} canAct={canAct && ["roll", "post", "debt"].includes(state.phase)} onClose={() => setSelected(null)} send={send} />}
      {modal === "assets" && <Assets state={state} pid={viewerPid} canAct={canAct && ["roll", "post", "debt", "tax"].includes(state.phase)} onClose={() => setModal(null)} send={send} />}
      {modal === "trade" && me !== null && <TradeModal state={state} me={me} onClose={() => setModal(null)} send={send} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {cardModal && <CardModal {...cardModal} onClose={() => setCardModal(null)} />}
      {state.phase === "gameover" && gameOverOpen && settled && (
        <GameOver
          state={state}
          commit={view.seedCommit}
          seedReveal={view.seedReveal}
          onHome={() => router.push("/")}
          onAgain={isLocal ? rematch : undefined}
        />
      )}
      {hide && actor && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#140b2b] p-6 text-center">
          <div>
            <div className="text-7xl">{tokenIcon(actor.token)}</div>
            <div className="title-font mt-2 text-3xl font-black text-[#f5c04a]">Pass the device to {actor.name}</div>
            <p className="mt-1 text-sm opacity-70">Cash and cards are hidden until you tap.</p>
            <button className="btn green mt-5" onClick={() => setRevealed(`${actor.id}:${state.turns}:${state.phase === "auction" ? "a" : ""}`)}>
              I am {actor.name}. Reveal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
