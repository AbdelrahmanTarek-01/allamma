import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AR, serverNow } from '../net';
import { setMuted, sfx, useMuted } from '../sound';

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

export function Timer({ endsAt, tick = true }: { endsAt: number | null; tick?: boolean }) {
  const left = useSecondsLeft(endsAt);
  useEffect(() => { if (tick && left > 0 && left <= 10) sfx.tick(); }, [left, tick]);
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={`timer${left > 0 && left <= 10 ? ' warn' : ''}`} role="timer" aria-label={`فاضل ${left} ثانية`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
      {AR(`${m}:${s}`)}
    </span>
  );
}

export function MuteButton({ dark = false }: { dark?: boolean }) {
  const muted = useMuted();
  return (
    <button
      className="btn icon sm"
      aria-label={muted ? 'شغّل الصوت' : 'اقفل الصوت'}
      aria-pressed={muted}
      onClick={() => setMuted(!muted)}
      style={{ width: 40, height: 40, background: dark ? 'transparent' : '#fff', color: dark ? '#fff' : '#111', borderColor: dark ? '#fff' : '#111', boxShadow: 'none' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? <path d="M17 9l5 5M22 9l-5 5" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
      </svg>
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="display h2">{title}</h2>
          <button className="btn sm" onClick={onClose}>اقفل</button>
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
