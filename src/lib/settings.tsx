"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { setSfxEnabled } from "./sfx";

export interface Settings {
  textScale: number;
  reducedMotion: boolean;
  colorBlind: boolean;
  leftHand: boolean;
  sound: boolean;
  haptics: boolean;
  quality: "low" | "medium" | "high" | "ultra";
  batterySaver: boolean;
  subtitles: boolean;
}

const DEFAULTS: Settings = {
  textScale: 1,
  reducedMotion: false,
  colorBlind: false,
  leftHand: false,
  sound: true,
  haptics: true,
  quality: "high",
  batterySaver: false,
  subtitles: true,
};

const Ctx = createContext<{ s: Settings; set: (p: Partial<Settings>) => void }>({ s: DEFAULTS, set: () => {} });

function detectTier(): Settings["quality"] {
  if (typeof navigator === "undefined") return "high";
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 4) return "low";
  if (mem <= 4 || cores <= 6) return "medium";
  return "high";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    let next = DEFAULTS;
    try {
      const raw = localStorage.getItem("bv:settings");
      if (raw) next = { ...DEFAULTS, ...JSON.parse(raw) };
      else next = { ...DEFAULTS, quality: detectTier(), reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setS(next), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const h = document.documentElement;
    h.style.setProperty("--text-scale", String(s.textScale));
    h.dataset.reduced = s.reducedMotion || s.batterySaver ? "1" : "0";
    h.dataset.cb = s.colorBlind ? "1" : "0";
    h.dataset.quality = s.batterySaver ? "low" : s.quality;
    h.dataset.left = s.leftHand ? "1" : "0";
    setSfxEnabled(s.sound);
  }, [s]);

  const set = useCallback((p: Partial<Settings>) => {
    setS((prev) => {
      const n = { ...prev, ...p };
      try {
        localStorage.setItem("bv:settings", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  return <Ctx.Provider value={{ s, set }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
