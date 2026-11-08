import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AR, serverNow } from '../net';
import { setAudio, sfx, timerTick, useAudioSettings } from '../sound';

export function useSecondsLeft(endsAt: number | null) {
  const calc = () => (endsAt ? Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!endsAt) return;
    const t = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

/** The shared timer sounds (last 5 seconds, then time up) for any countdown. */
export function useTimerSounds(left: number, on = true) {
  const prev = useRef(left);
  useEffect(() => {
    const p = prev.current;
    prev.current = left;
    if (!on) return;
    if (left === 0) { if (p > 0) timerTick(0); } else timerTick(left);
  }, [left, on]);
}

export function Timer({ endsAt, tick = true }: { endsAt: number | null; tick?: boolean }) {
  const left = useSecondsLeft(endsAt);
  useTimerSounds(left, tick && !!endsAt);
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={`timer${left > 0 && left <= 10 ? ' warn' : ''}`} role="timer" aria-label={`فاضل ${left} ثانية`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
      {AR(`${m}:${s}`)}
    </span>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {off ? <path d="M17 9l5 5M22 9l-5 5" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
    </svg>
  );
}

function NoteIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="17" cy="16" r="3" fill="currentColor" />
      {off && <path d="M3 3l18 18" stroke="#D9472B" strokeWidth={3} />}
    </svg>
  );
}

function AudioRow({ id, label, icon, on, value, onToggle, onChange }: {
  id: string; label: string; icon: ReactNode; on: boolean; value: number;
  onToggle: () => void; onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="card flat col" style={{ gap: 10, padding: 14 }}>
      <div className="row between">
        <label htmlFor={id} className="row" style={{ gap: 8, fontWeight: 900, fontSize: 16 }}>{icon}{label}</label>
        <button className={`chip${on ? ' dark' : ''}`} data-sfx="none" aria-pressed={on} onClick={onToggle} style={{ padding: '4px 14px', fontSize: 13 }}>
          {on ? 'شغّال' : 'مقفول'}
        </button>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          disabled={!on}
          className="range"
          style={{ ['--p' as any]: `${pct}%` }}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-valuetext={`${pct}٪`}
        />
        <span className="num" style={{ width: 44, fontWeight: 900, textAlign: 'center' }}>{AR(pct)}٪</span>
      </div>
    </div>
  );
}

export function SoundSheet({ onClose }: { onClose: () => void }) {
  const a = useAudioSettings();
  return (
    <Sheet title="الصوت" onClose={onClose}>
      <AudioRow
        id="vol-music" label="الموسيقى" icon={<NoteIcon off={!a.musicOn} />} on={a.musicOn} value={a.music}
        onToggle={() => { setAudio({ musicOn: !a.musicOn }); (a.musicOn ? sfx.toggleOff : sfx.toggleOn)(); }}
        onChange={(v) => setAudio({ music: v, musicOn: v > 0 })}
      />
      <AudioRow
        id="vol-sfx" label="المؤثرات" icon={<SpeakerIcon off={!a.sfxOn} />} on={a.sfxOn} value={a.sfx}
        onToggle={() => { if (a.sfxOn) sfx.toggleOff(); setAudio({ sfxOn: !a.sfxOn }); if (!a.sfxOn) sfx.toggleOn(); }}
        onChange={(v) => { setAudio({ sfx: v, sfxOn: v > 0 }); sfx.soft(); }}
      />
      <span className="muted">الإعدادات بتتحفظ على جهازك.</span>
    </Sheet>
  );
}

/** Speaker button that opens the sound settings. Kept the old name so every screen picks it up. */
export function MuteButton({ bare = false, card = false }: { bare?: boolean; card?: boolean }) {
  const a = useAudioSettings();
  const [open, setOpen] = useState(false);
  const allOff = !a.musicOn && !a.sfxOn;
  return (
    <>
      <button
        className={card ? 'h3-btn' : bare ? 'hbar-btn' : 'btn icon sm'}
        aria-label="إعدادات الصوت"
        onClick={() => setOpen(true)}
        style={card ? undefined : bare ? { background: allOff ? 'var(--yellow-soft)' : 'transparent' } : { width: 40, height: 40, boxShadow: 'none', background: allOff ? 'var(--yellow-soft)' : '#fff' }}
      >
        <SpeakerIcon off={allOff} />
      </button>
      {open && <SoundSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    sfx.whoosh();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const close = () => { sfx.close(); onClose(); };
  return (
    <div className="sheet-bg" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="display h2">{title}</h2>
          <button className="btn sm" data-sfx="none" onClick={close}>اقفل</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Counts a number up from its previous value — used for scores. */
export function useCountUp(value: number, from = 0, ms = 900) {
  const [shown, setShown] = useState(from);
  const prev = useRef(from);
  useEffect(() => {
    const start = prev.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else prev.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** One-shot confetti burst on a full-screen canvas. Change `fire` to burst again. */
export function Confetti({ fire, amount = 140, from = 'center' }: { fire: number; amount?: number; from?: 'center' | 'top' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    const cols = ['#FFD23F', '#FF4F9A', '#4D9DFF', '#3DDC97', '#B48CFF', '#FF8A3D', '#fff'];
    const ox = innerWidth / 2;
    const oy = from === 'top' ? -10 : innerHeight * 0.4;
    let parts = Array.from({ length: amount }, (_, i) => {
      const a = from === 'top' ? Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const s = from === 'top' ? 2 + Math.random() * 5 : 5 + Math.random() * 10;
      return { x: from === 'top' ? Math.random() * innerWidth : ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (from === 'top' ? 0 : 6), r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 7 + Math.random() * 7, h: 5 + Math.random() * 5, c: cols[i % cols.length], life: 1 };
    });
    let raf = 0;
    const loop = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      parts.forEach((p) => {
        p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.006;
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        g.translate(p.x * dpr, p.y * dpr);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.strokeStyle = '#111';
        g.lineWidth = 1.5 * dpr;
        g.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr);
        g.strokeRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr);
        g.restore();
      });
      if (parts.length) raf = requestAnimationFrame(loop);
      else g.clearRect(0, 0, cv.width, cv.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 25 }} />;
}

/* Skeletons shaped like the screen that is coming, so waiting never feels empty */
export function SkeletonHome({ note }: { note: string }) {
  return (
    <main className="screen" aria-busy="true">
      <div className="row between">
        <span className="logo">اللمّة<i>.</i></span>
        <div className="sk" style={{ width: 54, height: 54, borderRadius: '50%' }} />
      </div>
      <div className="sk card-sk" style={{ height: 170 }} />
      <div className="row" style={{ gap: 10 }}>
        <span className="chip dark">{note}</span>
      </div>
      <div className="grid2">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="sk card-sk" style={{ height: 134, animationDelay: `${i * 80}ms` }} />)}
      </div>
    </main>
  );
}
