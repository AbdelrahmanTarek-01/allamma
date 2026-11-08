import { useRef } from 'react';
import type { DrawStroke } from '../net';

/** One stroke as an SVG path (a single point is a dot). Coordinates live in a 300 x 300 space. */
export function strokePath(pts: number[]) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0]} ${pts[1]}l.1 0`;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  return d;
}

export function Strokes({ strokes, size }: { strokes: DrawStroke[]; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" aria-hidden="true" style={{ display: 'block' }}>
      {strokes.map((s) => <path key={s.id} d={strokePath(s.pts)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  );
}

/**
 * The drawing surface. With `onStart/onMove/onEnd` set it is the drawer's pad (pointer capture, touch-action none);
 * without them it only shows strokes (the live view of the guessers, the reveal, the gallery).
 */
export function DrawCanvas({ strokes, size, onStart, onMove, onEnd }: {
  strokes: DrawStroke[];
  size: number;
  onStart?: (x: number, y: number) => void;
  onMove?: (x: number, y: number) => void;
  onEnd?: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const active = useRef(false);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 300), Math.round(((e.clientY - r.top) / r.height) * 300)] as const;
  };
  const drawable = !!onStart;
  return (
    <svg
      ref={ref} width={size} height={size} viewBox="0 0 300 300" aria-hidden="true"
      style={{ display: 'block', touchAction: 'none', cursor: drawable ? 'crosshair' : 'default' }}
      onPointerDown={drawable ? (e) => { active.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); const [x, y] = at(e); onStart!(x, y); } : undefined}
      onPointerMove={drawable ? (e) => { if (!active.current) return; const [x, y] = at(e); onMove?.(x, y); } : undefined}
      onPointerUp={drawable ? () => { if (active.current) { active.current = false; onEnd?.(); } } : undefined}
      onPointerCancel={drawable ? () => { if (active.current) { active.current = false; onEnd?.(); } } : undefined}
    >
      {strokes.map((s) => <path key={s.id} d={strokePath(s.pts)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  );
}
