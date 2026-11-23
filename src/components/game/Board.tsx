"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FESTIVALS, GROUP_COLORS, TILES, inr, tileGrid, tokenIcon, type GameState } from "@/core";

const CORNER = 1.35;
const UNIT = 1 / (9 + 2 * CORNER);

function colCenter(c: number): number {
  const w = c === 0 || c === 10 ? CORNER * UNIT : UNIT;
  const start = c === 0 ? 0 : CORNER * UNIT + (c - 1) * UNIT;
  return (start + w / 2) * 100;
}
export function tileCenter(i: number) {
  const { col, row } = tileGrid(i);
  return { x: colCenter(col), y: colCenter(row) };
}
function sideOf(i: number): "b" | "l" | "t" | "r" | "c" {
  if (i % 10 === 0) return "c";
  if (i < 10) return "b";
  if (i < 20) return "l";
  if (i < 30) return "t";
  return "r";
}

function Box({ w, h, cls }: { w: number; h: number; cls: string }) {
  const st = { "--w": `${w}em`, "--h": `${h}em` } as CSSProperties;
  return (
    <div className={`box ${cls}`} style={st}>
      <i className="f-t" />
      <i className="f-s" />
      <i className="f-n" />
      <i className="f-e" />
      <i className="f-w" />
    </div>
  );
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const NAMES = ["", "one", "two", "three", "four", "five", "six"];
const ORI: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

function Die({ v, k, x }: { v: number; k: number; x: number }) {
  const [rx, ry] = ORI[v];
  const style = { "--d": "6em", transform: `rotateX(${rx + k * 720}deg) rotateY(${ry + k * 360}deg)` } as CSSProperties;
  return (
    <div className={`die-wrap ${k > 0 ? (k % 2 ? "toss1" : "toss0") : ""}`} style={{ left: `${x}em`, top: "-3em" }}>
      <div className="die" style={style} aria-label={`Die showing ${v}`}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className={`fc f${f} ${NAMES[f]}`}>
            {Array.from({ length: 9 }, (_, c) => (
              <span key={c} className={`pip ${PIPS[f].includes(c) ? "on" : ""}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BoardProps {
  state: GameState;
  shown: number[];
  selected: number | null;
  onSelect: (id: number) => void;
  tilt: number;
  rot: number;
  zoom: number;
  topDown: boolean;
  onRot: (r: number) => void;
  onZoom: (z: number) => void;
  focusPlayer?: number;
}

export function Board({ state, shown, selected, onSelect, tilt, rot, zoom, topDown, onRot, onZoom }: BoardProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [dragging, setDragging] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const pinch = useRef(0);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const bs = Math.max(280, Math.min(size.w * 0.92, size.h * 1.32));
  const fit = topDown ? Math.min(1, (Math.min(size.w, size.h) * 0.92) / bs) : 1;
  const T = topDown ? 0 : tilt;
  const R = topDown ? 0 : rot;

  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    if (ptrs.current.size === 2) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) onZoom(Math.min(2.2, Math.max(0.6, zoom * (d / pinch.current))));
      pinch.current = d;
      moved.current = true;
      return;
    }
    if (Math.abs(dx) > 2 || Math.abs(e.clientY - p.y) > 2) {
      if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 4) {
        moved.current = true;
        setDragging(true);
      }
      if (!topDown && moved.current) onRot(rot + dx * 0.3);
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    pinch.current = 0;
    setDragging(false);
  };

  const style = { "--bs": `${bs}px`, "--tilt": `${T}deg`, "--rot": `${R}deg`, "--zoom": zoom * fit } as CSSProperties;

  // group players by tile for offsets
  const byTile = new Map<number, number[]>();
  state.players.forEach((p, i) => {
    if (p.bankrupt) return;
    const pos = shown[i] ?? p.pos;
    byTile.set(pos, [...(byTile.get(pos) ?? []), i]);
  });

  const cur = state.players[state.current];
  const fest = state.festival ? FESTIVALS[state.festival.id] : null;

  return (
    <div
      ref={stageRef}
      className="stage h-full w-full"
      style={{ perspective: "2600px" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => onZoom(Math.min(2.2, Math.max(0.6, zoom * (e.deltaY < 0 ? 1.08 : 0.92))))}
    >
      <div className="fx pointer-events-none absolute inset-0">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="mote" style={{ left: `${(i * 37) % 100}%`, top: `${60 + ((i * 53) % 40)}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${10 + (i % 5) * 3}s` }} />
        ))}
      </div>
      <div className={`board3d ${dragging ? "drag" : ""}`} style={style}>
        <div className="plane">
          {TILES.map((t) => {
            const { col, row } = tileGrid(t.id);
            const ts = state.tiles[t.id];
            const side = sideOf(t.id);
            const owner = ts.owner !== null ? state.players[ts.owner] : null;
            const buyable = t.kind === "city" || t.kind === "railway" || t.kind === "utility";
            const gc = t.group ? GROUP_COLORS[t.group].color : "#999";
            const st = { gridColumn: col + 1, gridRow: row + 1, "--c": gc, "--o": owner?.color ?? "transparent" } as CSSProperties;
            return (
              <div
                key={t.id}
                className={`tile s-${side} ${side === "c" ? "corner" : ""} ${ts.mortgaged ? "mort" : ""} ${selected === t.id ? "sel" : ""}`}
                style={st}
                onClick={() => {
                  if (!moved.current) onSelect(t.id);
                }}
                title={t.name}
              >
                {t.kind === "city" && <div className="band" data-g={t.group} />}
                {owner && <div className="own" />}
                {(!owner || !buyable) && <div className="ic">{t.icon}</div>}
                <div className="nm">{t.name}</div>
                {t.price > 0 && <div className="pr">{inr(t.price)}</div>}
                {t.kind === "tax" && <div className="pr">{t.taxType === "luxury" ? "₹1,500" : "₹2,000 / 10%"}</div>}
                {ts.mortgaged && <div className="mtag">MORTGAGED</div>}
                {ts.waterlogged && <div className="wl">🌧️</div>}
                {ts.footfall > 0 && <div className="ff">👣{ts.footfall}</div>}
                {owner && buyable && (
                  <div className="anchor" style={{ left: "50%", top: "58%" }}>
                    <div className="ring" style={{ left: "-2.6em", top: "-2.6em" }} />
                    <div className="billboard">
                      <span className="lm" key={`${t.id}-${ts.owner}`}>
                        {t.icon}
                      </span>
                    </div>
                  </div>
                )}
                {t.kind === "city" && ts.houses > 0 && (
                  <div className="shops">
                    {ts.houses < 5 ? (
                      Array.from({ length: ts.houses }, (_, k) => <Box key={k} w={1.7} h={1.9} cls="shop" />)
                    ) : (
                      <Box w={3.4} h={4} cls="mall" />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="center">
            <div className="rangoli fx" />
            <div className="absolute left-0 right-0 top-[5%] text-center">
              <div className="title-font font-black" style={{ fontSize: "4.4em", color: "#f5c04a", textShadow: "0 0.08em 0.15em #000" }}>
                Bharat Vyapar
              </div>
              <div style={{ fontSize: "1.5em", letterSpacing: "0.3em", opacity: 0.8 }}>TRADE · BUILD · PROSPER</div>
            </div>
            {fest && (
              <div className="absolute left-0 right-0 text-center banner" style={{ top: "24%", fontSize: "2.1em", color: "#ffd45e" }}>
                {fest.icon} {fest.name}
              </div>
            )}
            {state.monsoon && (
              <div className="absolute left-0 right-0 text-center" style={{ top: "30%", fontSize: "1.8em", color: "#9fe3ff" }}>
                🌧️ Monsoon: {state.monsoon.region}
              </div>
            )}
            <span className="diya" style={{ left: "8%", top: "6%" }}>🪔</span>
            <span className="diya" style={{ right: "8%", top: "6%", animationDelay: "-0.7s" }}>🪔</span>
            <div className="pond" />
            <div className="deckpile" style={{ right: "7%", bottom: "9%", background: "linear-gradient(#ffcf5a,#d9962a)", color: "#4a2a00", transform: "rotate(-6deg)" }}>
              🎡<small>Naseeb</small>
            </div>
            <div className="deckpile" style={{ right: "22%", bottom: "12%", background: "linear-gradient(#7de0b0,#2fa377)", color: "#06382a", transform: "rotate(5deg)" }}>
              🧰<small>Khazana</small>
            </div>
            <div className="absolute left-0 right-0 text-center" style={{ bottom: "4%", fontSize: "1.7em", opacity: 0.85 }}>
              Round {state.round}
              {state.config.roundLimit > 0 ? ` / ${state.config.roundLimit}` : ""} · {cur.name}
            </div>
            <div className="dice-tray" style={{ transform: "translateZ(0.2em)" }}>
              <Die v={state.dice ? state.dice[0] : 5} k={state.rollId} x={-8.5} />
              <Die v={state.dice ? state.dice[1] : 2} k={state.rollId} x={2.5} />
            </div>
            {state.rickshaw && (
              <div className="absolute left-1/2 text-center font-black" style={{ top: "62%", transform: "translateX(-50%)", fontSize: "1.8em", color: "#ffd45e" }}>
                🛺 Rickshaw Die: {state.rickshaw.toUpperCase()}
              </div>
            )}
          </div>

          <div className="tokens" style={{ gridArea: "1 / 1 / 12 / 12", pointerEvents: "none" }}>
            {state.players.map((p, i) => {
              if (p.bankrupt) return null;
              const pos = shown[i] ?? p.pos;
              const group = byTile.get(pos) ?? [i];
              const k = group.indexOf(i);
              const c = tileCenter(pos);
              const ox = ((k % 2) - (group.length > 1 ? 0.5 : 0)) * 3.2;
              const oy = (Math.floor(k / 2) - (group.length > 2 ? 0.5 : 0)) * 3.2 + 0.8;
              const style = { left: `calc(${c.x}% + ${ox}em)`, top: `calc(${c.y}% + ${oy}em)`, "--p": p.color } as CSSProperties;
              return (
                <div key={p.id} className={`tok ${i === state.current ? "active" : ""}`} style={style}>
                  <div className="disc" />
                  <div className="billboard" style={{ bottom: "0.4em" }}>
                    <span className={`em ${state.phase === "gameover" && state.winner === i ? "celebrate" : ""}`} key={pos}>
                      {tokenIcon(p.token)}
                    </span>
                  </div>
                  {p.inJail && (
                    <div className="billboard" style={{ bottom: "0.2em" }}>
                      <span className="jailbars">⛓️</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
