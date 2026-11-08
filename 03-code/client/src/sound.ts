// Synthesized sound effects (WebAudio) — no audio files to download, works offline.
import { useSyncExternalStore } from 'react';

const KEY = 'allamma.muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow audio after a user gesture: unlock on the first tap.
if (typeof window !== 'undefined') {
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, when = 0, slideTo?: number) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur: number, vol = 0.08, when = 0, hp = 1200) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
  f.type = 'highpass';
  f.frequency.value = hp;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export function buzz(pattern: number | number[]) {
  if (muted) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

export const sfx = {
  tap: () => tone(620, 0.05, 'triangle', 0.06),
  select: () => { tone(520, 0.06, 'triangle', 0.07); tone(780, 0.07, 'triangle', 0.06, 0.05); },
  flip: () => { noise(0.18, 0.09, 0, 1800); tone(300, 0.2, 'sine', 0.06, 0.05, 700); buzz(25); },
  join: () => { tone(660, 0.08, 'sine', 0.08); tone(990, 0.12, 'sine', 0.08, 0.07); },
  chat: () => tone(1200, 0.05, 'sine', 0.05),
  tick: () => tone(1100, 0.035, 'square', 0.035),
  turn: () => { tone(440, 0.08, 'triangle', 0.08); tone(660, 0.1, 'triangle', 0.08, 0.08); buzz(40); },
  start: () => { [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, i * 0.09)); buzz([30, 40, 30]); },
  vote: () => { tone(300, 0.08, 'square', 0.06); tone(200, 0.12, 'square', 0.06, 0.06); buzz(30); },
  pop: () => tone(880, 0.06, 'sine', 0.05, 0, 1300),
  drumroll: (secs = 1.5) => {
    const n = Math.floor(secs / 0.06);
    for (let i = 0; i < n; i++) noise(0.05, 0.03 + (i / n) * 0.07, i * 0.06, 600);
  },
  stamp: () => { noise(0.25, 0.25, 0, 200); tone(90, 0.3, 'sine', 0.2, 0, 50); buzz(80); },
  gotcha: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0.15 + i * 0.08)); },
  boo: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, 0.15 + i * 0.18)); },
  win: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.1)); buzz([40, 60, 40, 60, 120]); },
  lose: () => { tone(330, 0.25, 'triangle', 0.08); tone(262, 0.4, 'triangle', 0.08, 0.2); },
  fanfare: () => { [392, 523, 659, 784, 659, 784, 1047, 1047].forEach((f, i) => tone(f, i === 7 ? 0.6 : 0.18, 'triangle', 0.13, i * 0.12)); buzz([60, 80, 60, 80, 200]); }
};

export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
  subs.forEach((s) => s());
  if (!v) sfx.select();
}

export const useMuted = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => muted);
