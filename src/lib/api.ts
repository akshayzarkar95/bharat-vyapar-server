import type { GameEvent, GameState } from "@/core";

export interface LobbySlotView {
  name: string;
  kind: "human" | "ai";
  token: string;
  personality?: string;
  difficulty?: string;
  claimed: boolean;
}

export interface GameView {
  code: string;
  mode: "local" | "online";
  status: "lobby" | "playing" | "finished";
  ruleKey: string;
  lobby: { config: GameState["config"]; slots: LobbySlotView[] } | null;
  state: GameState | null;
  seq: number;
  seedCommit: string | null;
  seedReveal: string | null;
  events: { seq: number; actor: number; events: GameEvent[] }[];
  error?: string;
  idle?: boolean;
  note?: string;
}

export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T & { error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as T & { error?: string };
  } catch {
    return { error: "Network error. Check your connection." } as T & { error?: string };
  }
}

export interface Creds {
  seat: number;
  secret: string;
}
export function saveCreds(code: string, c: Creds) {
  try {
    localStorage.setItem(`bv:creds:${code}`, JSON.stringify(c));
    const list: string[] = JSON.parse(localStorage.getItem("bv:recent") ?? "[]");
    localStorage.setItem("bv:recent", JSON.stringify([code, ...list.filter((x) => x !== code)].slice(0, 6)));
  } catch {
    /* ignore */
  }
}
export function loadCreds(code: string): Creds | null {
  try {
    const raw = localStorage.getItem(`bv:creds:${code}`);
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}
export function rememberGame(code: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem("bv:recent") ?? "[]");
    localStorage.setItem("bv:recent", JSON.stringify([code, ...list.filter((x) => x !== code)].slice(0, 6)));
  } catch {
    /* ignore */
  }
}
