// Tiny synthesized sound-effects kit (WebAudio). Original, no external assets.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.08, delay = 0, slide = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.06, delay = 0, hp = 1200) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(520, 0.06, "triangle", 0.05),
  dice: () => {
    for (let i = 0; i < 7; i++) noise(0.05, 0.05 + Math.random() * 0.04, i * 0.09 + Math.random() * 0.03, 900 + Math.random() * 1800);
  },
  hop: () => tone(330, 0.09, "sine", 0.06, 0, 160),
  coin: () => {
    tone(1318, 0.09, "square", 0.04);
    tone(1760, 0.18, "square", 0.04, 0.08);
  },
  buy: () => {
    tone(392, 0.14, "triangle", 0.07);
    tone(523, 0.14, "triangle", 0.07, 0.12);
    tone(784, 0.3, "triangle", 0.07, 0.24);
  },
  rent: () => {
    tone(220, 0.15, "sawtooth", 0.04);
    tone(180, 0.2, "sawtooth", 0.04, 0.12);
  },
  card: () => noise(0.12, 0.05, 0, 2500),
  jail: () => {
    tone(140, 0.5, "square", 0.06);
    tone(95, 0.6, "square", 0.05, 0.05);
  },
  gavel: () => {
    tone(180, 0.08, "square", 0.08);
    noise(0.05, 0.08, 0, 400);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.07, i * 0.12));
  },
  festival: () => {
    [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 0.3, "triangle", 0.06, i * 0.1));
    for (let i = 0; i < 5; i++) noise(0.15, 0.04, 0.4 + i * 0.12, 3000);
  },
  error: () => tone(160, 0.18, "sawtooth", 0.05),
};

export function haptic(ms = 25) {
  try {
    if (enabled && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
