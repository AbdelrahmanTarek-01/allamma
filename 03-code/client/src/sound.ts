/// <reference types="vite/client" />
// All audio is synthesized with WebAudio: no files to download, works offline.
// Two channels with their own volume + mute: music and effects (sfx).
import { useSyncExternalStore } from 'react';

export interface AudioSettings { music: number; sfx: number; musicOn: boolean; sfxOn: boolean }

const KEY = 'allamma.audio';
const DEFAULTS: AudioSettings = { music: 0.3, sfx: 0.8, musicOn: true, sfxOn: true };

function load(): AudioSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...DEFAULTS, ...s };
    if (localStorage.getItem('allamma.muted') === '1') return { ...DEFAULTS, musicOn: false, sfxOn: false };
  } catch { /* ignore */ }
  return DEFAULTS;
}

let settings = load();
const subs = new Set<() => void>();
export const useAudioSettings = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => settings);

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let duck: GainNode | null = null;
let master: DynamicsCompressorNode | null = null;
let lastSfxAt = 0;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.knee.value = 10;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    duck = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(duck).connect(master);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function applyVolumes() {
  if (!ctx || !sfxBus || !musicBus) return;
  const t = ctx.currentTime;
  // boosted: the raw voices are quiet on purpose, the compressor keeps the peaks safe
  sfxBus.gain.setTargetAtTime(settings.sfxOn ? settings.sfx * 2.2 : 0, t, 0.05);
  musicBus.gain.setTargetAtTime(settings.musicOn ? settings.music * 2.4 : 0, t, 0.15);
}

export function setAudio(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applyVolumes();
  subs.forEach((s) => s());
  music.refresh();
}

// Browsers only allow audio after a user gesture. Try on every gesture until the context runs,
// so audio recovers if the browser suspends it again (tab switch, phone lock, Bluetooth change).
function wake() {
  const c = ac();
  if (!c) return;
  if (c.state !== 'running') c.resume().then(() => music.refresh()).catch(() => {});
  else music.refresh();
}
const WAKE_EVENTS = ['pointerdown', 'touchend', 'keydown'] as const;
if (typeof window !== 'undefined') WAKE_EVENTS.forEach((e) => window.addEventListener(e, wake, { passive: true }));

/* ---------- low-level voices ---------- */

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, when = 0, slideTo?: number, bus?: AudioNode | null, at?: number) {
  const c = ctx;
  const out = bus ?? sfxBus;
  if (!c || !out) return;
  const t = at ?? c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol = 0.08, when = 0, freq = 1200, kind: BiquadFilterType = 'highpass', bus?: AudioNode | null, at?: number) {
  const c = ctx;
  const out = bus ?? sfxBus;
  if (!c || !out) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = at ?? c.currentTime + when;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = noiseBuf;
  f.type = kind;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export function buzz(pattern: number | number[]) {
  if (!settings.sfxOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

const play = (fn: () => void) => () => {
  if (!settings.sfxOn || !ac()) return;
  lastSfxAt = performance.now();
  fn();
};

/* ---------- sound effects ---------- */

export const sfx = {
  tap: play(() => tone(620, 0.05, 'triangle', 0.06)),
  soft: play(() => tone(900, 0.035, 'sine', 0.045)),
  card: play(() => { tone(420, 0.06, 'triangle', 0.07, 0, 560); noise(0.04, 0.03, 0, 3000); }),
  confirm: play(() => { tone(220, 0.09, 'square', 0.05); tone(440, 0.12, 'triangle', 0.09, 0.03); tone(660, 0.12, 'triangle', 0.06, 0.07); }),
  select: play(() => { tone(520, 0.06, 'triangle', 0.07); tone(780, 0.07, 'triangle', 0.06, 0.05); }),
  toggleOn: play(() => { tone(500, 0.05, 'triangle', 0.06); tone(750, 0.07, 'triangle', 0.06, 0.04); }),
  toggleOff: play(() => { tone(750, 0.05, 'triangle', 0.06); tone(500, 0.07, 'triangle', 0.06, 0.04); }),
  whoosh: play(() => noise(0.22, 0.05, 0, 900, 'bandpass')),
  close: play(() => noise(0.14, 0.035, 0, 1500, 'bandpass')),
  type: play(() => tone(1400 + Math.random() * 300, 0.02, 'sine', 0.02)),
  error: play(() => { tone(180, 0.12, 'square', 0.05); tone(150, 0.16, 'square', 0.05, 0.1); buzz([40, 40, 40]); }),
  notify: play(() => { tone(880, 0.07, 'sine', 0.06); tone(1320, 0.1, 'sine', 0.05, 0.06); }),
  flip: play(() => { noise(0.18, 0.09, 0, 1800); tone(300, 0.2, 'sine', 0.06, 0.05, 700); buzz(25); }),
  join: play(() => { tone(660, 0.08, 'sine', 0.08); tone(990, 0.12, 'sine', 0.08, 0.07); }),
  leave: play(() => { tone(660, 0.08, 'sine', 0.06); tone(440, 0.14, 'sine', 0.06, 0.07); }),
  chat: play(() => tone(1200, 0.05, 'sine', 0.05)),
  tick: play(() => tone(1100, 0.035, 'square', 0.035)),
  turn: play(() => { tone(440, 0.08, 'triangle', 0.08); tone(660, 0.1, 'triangle', 0.08, 0.08); buzz(40); }),
  start: play(() => { [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, i * 0.09)); buzz([30, 40, 30]); }),
  vote: play(() => { tone(300, 0.08, 'square', 0.06); tone(200, 0.12, 'square', 0.06, 0.06); buzz(30); }),
  pop: play(() => tone(880, 0.06, 'sine', 0.05, 0, 1300)),
  drumroll: (secs = 1.5) => play(() => {
    const n = Math.floor(secs / 0.06);
    for (let i = 0; i < n; i++) noise(0.05, 0.03 + (i / n) * 0.07, i * 0.06, 600);
  })(),
  stamp: play(() => { noise(0.25, 0.25, 0, 200); tone(90, 0.3, 'sine', 0.2, 0, 50); buzz(80); }),
  gotcha: play(() => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0.15 + i * 0.08)); }),
  boo: play(() => { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, 0.15 + i * 0.18)); }),
  win: play(() => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.1)); buzz([40, 60, 40, 60, 120]); }),
  lose: play(() => { tone(330, 0.25, 'triangle', 0.08); tone(262, 0.4, 'triangle', 0.08, 0.2); }),
  // فين دي؟: a pin landing on the map, a line being drawn to the target, a crown landing on the winner
  pinDrop: play(() => { tone(520, 0.1, 'sine', 0.1, 0, 180); noise(0.05, 0.05, 0.07, 700, 'lowpass'); buzz(20); }),
  lineDraw: play(() => { noise(0.9, 0.035, 0, 1200, 'bandpass'); tone(300, 0.9, 'sine', 0.035, 0, 900); }),
  crown: play(() => { tone(880, 0.1, 'triangle', 0.1); tone(1320, 0.14, 'triangle', 0.1, 0.08); tone(1760, 0.2, 'triangle', 0.09, 0.17); buzz([30, 30, 60]); }),
  fanfare: play(() => { [392, 523, 659, 784, 659, 784, 1047, 1047].forEach((f, i) => tone(f, i === 7 ? 0.6 : 0.18, 'triangle', 0.13, i * 0.12)); buzz([60, 80, 60, 80, 200]); })
};

/* Every button gets a sound by its kind, unless its own handler already played one. */
function buttonSound(e: Event) {
  const el = (e.target as HTMLElement | null)?.closest('button');
  if (!el || el.disabled || el.dataset.sfx === 'none') return;
  if (performance.now() - lastSfxAt < 80) return;
  if (el.classList.contains('big')) sfx.confirm();
  else if (el.classList.contains('tile')) sfx.card();
  else if (el.classList.contains('chip')) sfx.soft();
  else sfx.tap();
}
if (typeof document !== 'undefined') document.addEventListener('click', buttonSound);

/* ---------- background music: Egyptian maqsoum rhythm, hijaz on D ---------- */

// Hijaz on D: D Eb F# G A Bb C
const N: Record<string, number> = {
  D2: 73.42, G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, Eb3: 155.56, Fs3: 185.0, G3: 196.0, A3: 220.0, Bb3: 233.08,
  C4: 261.63, D4: 293.66, Eb4: 311.13, Fs4: 369.99, G4: 392.0, A4: 440.0, Bb4: 466.16, C5: 523.25, D5: 587.33
};

type Step = string | null;
interface Track {
  bpm: number;
  doum: number[];          // steps (of 8 per bar) with the low drum
  tak: number[];           // steps with the high drum
  bass: Step[];            // one entry per bar (4 bars), played on doum hits
  melody: Step[];          // 32 eighth-note steps
  drone?: string;          // long held note per bar
  melodyVol: number;
}

const TRACKS: Record<'lobby' | 'tension', Track> = {
  lobby: {
    bpm: 112,
    doum: [0, 4],
    tak: [1, 3, 6],
    bass: ['D2', 'G2', 'A2', 'D2'],
    melody: [
      'D4', null, 'Eb4', 'Fs4', 'G4', null, 'Fs4', null,
      'G4', 'A4', null, 'Bb4', 'A4', null, 'G4', null,
      'A4', null, 'Bb4', 'A4', 'G4', 'Fs4', null, 'Eb4',
      'Fs4', null, 'Eb4', null, 'D4', null, null, null
    ],
    melodyVol: 0.11
  },
  tension: {
    bpm: 84,
    doum: [0],
    tak: [3, 6],
    bass: ['D2', 'D2', 'Eb3', 'D2'],
    melody: [
      null, null, null, null, 'A3', null, null, null,
      null, null, null, null, 'Bb3', null, 'A3', null,
      null, null, null, null, 'A3', null, null, null,
      null, null, 'Eb4', null, 'D4', null, null, null
    ],
    drone: 'D3',
    melodyVol: 0.08
  }
};

export type MusicName = 'lobby' | 'tension' | null;

export const music = (() => {
  let wanted: MusicName = null;
  let playing: MusicName = null;
  let step = 0;
  let nextAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const schedule = () => {
    if (!ctx || !musicBus || !playing) return;
    const tr = TRACKS[playing];
    const stepDur = 60 / tr.bpm / 2;
    while (nextAt < ctx.currentTime + 0.15) {
      const s = step % 32;
      const inBar = s % 8;
      const bar = Math.floor(s / 8);
      const t = nextAt;
      if (tr.doum.includes(inBar)) {
        tone(150, 0.2, 'sine', 0.35, 0, 70, musicBus, t);            // body of the doum
        tone(300, 0.08, 'triangle', 0.12, 0, 140, musicBus, t);      // upper knock so small speakers hear it
        const b = tr.bass[bar];
        if (b) tone(N[b] * 2, stepDur * 3, 'triangle', 0.14, 0, undefined, musicBus, t);
      }
      if (tr.tak.includes(inBar)) {
        noise(0.06, 0.16, 0, 3200, 'bandpass', musicBus, t);
        tone(1800, 0.03, 'sine', 0.04, 0, undefined, musicBus, t);
      }
      if (inBar === 0 && tr.drone) tone(N[tr.drone] * 2, stepDur * 8, 'sine', 0.06, 0, undefined, musicBus, t);
      const m = tr.melody[s];
      if (m) {
        tone(N[m], stepDur * 1.6, 'triangle', tr.melodyVol, 0, undefined, musicBus, t);
        tone(N[m] * 2, stepDur * 0.9, 'sine', tr.melodyVol * 0.35, 0, undefined, musicBus, t);
      }
      nextAt += stepDur;
      step++;
    }
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    playing = null;
  };

  const refresh = () => {
    const shouldPlay = wanted && settings.musicOn && settings.music > 0 && !document.hidden ? wanted : null;
    if (shouldPlay === playing) return;
    if (!shouldPlay) return stop();
    const c = ac();
    if (!c || c.state !== 'running') return; // waits for the first tap, then unlock() calls refresh()
    if (timer) clearInterval(timer);
    playing = shouldPlay;
    step = 0;
    nextAt = c.currentTime + 0.08;
    timer = setInterval(schedule, 40);
    schedule();
  };

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => refresh());

  return {
    play(name: MusicName) { wanted = name; refresh(); },
    refresh,
    /** Quiet the music for a moment (e.g. under a big sound effect). */
    dip(secs = 1.2) {
      if (!ctx || !duck) return;
      const t = ctx.currentTime;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setTargetAtTime(0.25, t, 0.05);
      duck.gain.setTargetAtTime(1, t + secs, 0.3);
    }
  };
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    music.play(null);
    WAKE_EVENTS.forEach((e) => window.removeEventListener(e, wake));
    document.removeEventListener('click', buttonSound);
    ctx?.close().catch(() => {});
  });
}
