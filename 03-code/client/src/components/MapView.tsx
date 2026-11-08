import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { geoMercator, geoNaturalEarth1, type GeoProjection } from 'd3-geo';
import { getMapDef, type MapScope } from '../games/map/maps';
import { Character } from './art';

/** Rebuilds the d3 projection from the parameters stored with each generated map, so tap -> lat/lon is exact. */
const cache: Partial<Record<MapScope, GeoProjection>> = {};
export function getProjection(scope: MapScope): GeoProjection {
  if (!cache[scope]) {
    const { proj } = getMapDef(scope);
    const p = proj.kind === 'mercator' ? geoMercator().center(proj.center) : geoNaturalEarth1();
    cache[scope] = p.scale(proj.scale).translate(proj.translate);
  }
  return cache[scope]!;
}

/** A point `km` away from `from` along `bearingDeg` (client-side twin of the server helper, for drawing circles). */
export function destPoint(lat: number, lon: number, bearingDeg: number, km: number): [number, number] {
  const d = km / 6371, br = (bearingDeg * Math.PI) / 180, la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, ((((lo2 * 180) / Math.PI) + 540) % 360) - 180];
}

/** Where the cover fit is centred, [lat, lon]. */
const COVER_CENTER: [number, number] = [20, 25];

interface View { s: number; tx: number; ty: number } // screen = map * s + t
export interface MapCtx {
  /** lat/lon -> screen px inside the map box. */
  px(lat: number, lon: number): [number, number];
  /** lat/lon -> map units (use inside `layer`, which is drawn under the zoom transform). */
  xy(lat: number, lon: number): [number, number];
  /** Screen px per map unit now. */
  s: number;
  w: number;
  h: number;
}
export interface MapFocus { points: [number, number][]; key: number }

interface Props {
  scope: MapScope;
  /** A tap without dragging: lat/lon under the finger. */
  onTap?: (lat: number, lon: number) => void;
  /** Animate the camera to frame these [lat, lon] points (change `key` to run again). */
  focus?: MapFocus | null;
  /** Shapes in map units, drawn under the zoom transform (hint circle / half). */
  layer?: (c: MapCtx) => ReactNode;
  /** Pins, lines, tags in screen px (they keep the same size at any zoom). */
  overlay?: (c: MapCtx) => ReactNode;
  controls?: boolean;
  label?: string;
}

const Base = memo(function Base({ scope }: { scope: MapScope }) {
  return <g dangerouslySetInnerHTML={{ __html: getMapDef(scope).svg }} />;
});

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MapView({ scope, onTap, focus, layer, overlay, controls = true, label = 'الخريطة' }: Props) {
  const def = getMapDef(scope);
  const proj = useMemo(() => getProjection(scope), [scope]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const raf = useRef(0);

  // The "fit" view. Most maps are framed to CONTAIN their focus box. A map much wider than the box (the world in a tall phone box) would be
  // letterboxed and tiny, so it COVERS the box height instead: zoomed so the map fills top to bottom, centred on Africa / Europe / the Middle East,
  // with the sides reached by panning (the cover scale is also the minimum zoom, so there is never empty sea above or below).
  const cover = size.w > 0 && def.w * size.h > 1.8 * def.h * size.w;
  const fit = useMemo(() => {
    if (!size.w) return { s0: 1, view: { s: 1, tx: 0, ty: 0 } as View };
    if (cover) {
      const s0 = size.h / def.h;
      const [cx, cy] = proj([COVER_CENTER[1], COVER_CENTER[0]]) ?? [def.w / 2, def.h / 2];
      return { s0, view: { s: s0, tx: size.w / 2 - cx * s0, ty: size.h / 2 - cy * s0 } };
    }
    const [x0, y0, x1, y1] = def.focus;
    const pad = 10;
    const s0 = Math.min((size.w - pad * 2) / (x1 - x0), (size.h - pad * 2) / (y1 - y0));
    return { s0, view: { s: s0, tx: size.w / 2 - ((x0 + x1) / 2) * s0, ty: size.h / 2 - ((y0 + y1) / 2) * s0 } };
  }, [size, def, cover, proj]);
  const limits = useRef({ min: 0.1, max: 40 });
  limits.current = { min: cover ? fit.s0 : fit.s0 * 0.9, max: fit.s0 * 18 };
  // first time a cover-fit map shows: a small "drag to see the whole world" hint, gone after 2.5 s or on the first drag
  const [hint, setHint] = useState<'show' | 'hide' | null>(null);
  useEffect(() => {
    if (!cover || !controls) return;
    let seen = true;
    try { seen = !!localStorage.getItem('allamma.worldHint'); if (!seen) localStorage.setItem('allamma.worldHint', '1'); } catch { /* blocked storage: no hint */ }
    if (seen) return;
    setHint('show');
    const t = setTimeout(() => setHint('hide'), 2500);
    return () => clearTimeout(t);
  }, [cover, controls]);

  const clamp = useCallback((v: View): View => {
    const s = Math.min(limits.current.max, Math.max(limits.current.min, v.s));
    const mw = def.w * s, mh = def.h * s;
    // the map always covers the box (it has bleed around the focus area); when zoomed out further than that it is centered
    const tx = mw <= size.w ? (size.w - mw) / 2 : Math.min(0, Math.max(size.w - mw, v.tx));
    const ty = mh <= size.h ? (size.h - mh) / 2 : Math.min(0, Math.max(size.h - mh, v.ty));
    return { s, tx, ty };
  }, [def, size]);

  const apply = useCallback((v: View) => {
    const c = clamp(v);
    viewRef.current = c;
    setViewState(c);
  }, [clamp]);

  const animateTo = useCallback((t: View, ms = 800) => {
    cancelAnimationFrame(raf.current);
    if (reduced() || ms <= 0) return apply(t);
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      apply({ s: from.s * Math.pow(t.s / from.s, e), tx: from.tx + (t.tx - from.tx) * e, ty: from.ty + (t.ty - from.ty) * e });
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [apply]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // measure the box
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => ro.disconnect();
  }, []);
  // (re)frame the focus box whenever the box size or the map changes
  useEffect(() => { if (size.w) apply(fit.view); }, [fit]);

  const zoomAt = useCallback((cx: number, cy: number, f: number) => {
    const v = viewRef.current;
    const s = Math.min(limits.current.max, Math.max(limits.current.min, v.s * f));
    const k = s / v.s;
    apply({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
  }, [apply]);

  const zoomButton = (f: number) => {
    const v = viewRef.current;
    const s = Math.min(limits.current.max, Math.max(limits.current.min, v.s * f));
    const k = s / v.s, cx = size.w / 2, cy = size.h / 2;
    animateTo({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }, 260);
  };

  // camera focus (the reveal zooms from the whole map to the area around all pins and the target)
  useEffect(() => {
    if (!focus || !size.w) return;
    if (!focus.points.length) return animateTo(fit.view, 600);
    const pts = focus.points.map(([la, lo]) => proj([lo, la])).filter(Boolean) as [number, number][];
    let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const minSpan = def.w * 0.07; // never zoom in closer than this, even when every pin sits on the same spot
    if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
    if (y1 - y0 < minSpan) { const c = (y0 + y1) / 2; y0 = c - minSpan / 2; y1 = c + minSpan / 2; }
    const padX = 54, padTop = 64, padBottom = 54;
    const s = Math.min((size.w - padX * 2) / (x1 - x0), (size.h - padTop - padBottom) / (y1 - y0));
    const sc = Math.min(limits.current.max, Math.max(limits.current.min, s));
    // pins too far apart to fit at the minimum zoom: centre on the target (the last point) so as many pins as possible stay around it
    const tooWide = (x1 - x0) * sc > size.w - padX * 2 + 1;
    const cxm = tooWide ? pts[pts.length - 1][0] : (x0 + x1) / 2;
    animateTo({ s: sc, tx: size.w / 2 - cxm * sc, ty: padTop + (size.h - padTop - padBottom) / 2 - ((y0 + y1) / 2) * sc }, 1100);
  }, [focus?.key, size.w, size.h]);

  // ---------- gestures: drag to pan, pinch to zoom, tap to place ----------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({ moved: false, pinched: false, sx: 0, sy: 0, t0: 0, lastDist: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(raf.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) g.current = { moved: false, pinched: false, sx: p.x, sy: p.y, t0: performance.now(), lastDist: 0 };
    else {
      const [a, b] = [...ptrs.current.values()];
      g.current.pinched = true;
      g.current.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (g.current.lastDist > 0) {
        const v = viewRef.current;
        // the pinch center stays under the fingers: zoom around it, and the center's own motion pans
        const mv = { x: (p.x - prev.x) / 2, y: (p.y - prev.y) / 2 };
        apply({ ...v, tx: v.tx + mv.x, ty: v.ty + mv.y });
        zoomAt(cx, cy, dist / g.current.lastDist);
      }
      g.current.lastDist = dist;
      return;
    }
    if (!g.current.moved && Math.hypot(p.x - g.current.sx, p.y - g.current.sy) > 8) g.current.moved = true;
    if (g.current.moved) {
      setHint((h) => (h === 'show' ? 'hide' : h));
      const v = viewRef.current;
      apply({ ...v, tx: v.tx + (p.x - prev.x), ty: v.ty + (p.y - prev.y) });
    }
  };

  const endPointer = (e: React.PointerEvent, cancelled = false) => {
    const had = ptrs.current.has(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (!had) return;
    const st = g.current;
    if (!cancelled && ptrs.current.size === 0 && !st.moved && !st.pinched && performance.now() - st.t0 < 700 && onTap) {
      const p = local(e);
      const v = viewRef.current;
      const ll = proj.invert?.([(p.x - v.tx) / v.s, (p.y - v.ty) / v.s]);
      if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && Math.abs(ll[1]) <= 90) onTap(ll[1], ll[0]);
    }
    if (ptrs.current.size === 0) st.pinched = false;
    if (ptrs.current.size === 1) { st.lastDist = 0; st.moved = true; } // one finger left after a pinch: keep panning, never tap
  };

  // mouse wheel / trackpad zoom around the cursor (needs a non-passive listener to stop the page from scrolling)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(raf.current);
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const ctx: MapCtx = useMemo(() => ({
    px: (lat, lon) => { const p = proj([lon, lat]) ?? [0, 0]; return [p[0] * view.s + view.tx, p[1] * view.s + view.ty]; },
    xy: (lat, lon) => { const p = proj([lon, lat]) ?? [0, 0]; return [p[0], p[1]]; },
    s: view.s, w: size.w, h: size.h
  }), [proj, view, size]);

  return (
    <div className="mapbox">
      <div
        ref={boxRef}
        className="map-stage"
        role="application"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e, true)}
      >
        {size.w > 0 && (
          <svg width={size.w} height={size.h} className="map-svg" aria-hidden="true">
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
              <Base scope={scope} />
              {layer?.(ctx)}
            </g>
            {/* sea names: constant size on screen at any zoom */}
            {def.labels.map((l, i) => {
              const x = l.x * view.s + view.tx, y = l.y * view.s + view.ty;
              if (x < -60 || x > size.w + 60 || y < -20 || y > size.h + 20) return null;
              return <text key={i} className="map-label" style={l.s ? { fontSize: l.s } : undefined} x={x} y={y} textAnchor="middle" transform={l.r ? `rotate(${l.r} ${x} ${y})` : undefined}>{l.t}</text>;
            })}
            <g>{overlay?.(ctx)}</g>
          </svg>
        )}
      </div>
      {hint && <div className={`map-hint${hint === 'hide' ? ' off' : ''}`} aria-hidden="true">اسحب ↔ عشان تشوف العالم كله</div>}
      {controls && (
        <div className="map-controls" role="group" aria-label="التحكم في الخريطة">
          <button type="button" className="map-btn" aria-label="كبّر" onClick={() => zoomButton(1.7)}>+</button>
          <button type="button" className="map-btn" aria-label="صغّر" onClick={() => zoomButton(1 / 1.7)}>−</button>
          <button type="button" className="map-btn" aria-label="الخريطة كلها" onClick={() => animateTo(fit.view, 450)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

/** A player's pin: the same size at any zoom, tip at (x, y). `drop` plays the landing animation. */
export function PinMarker({ x, y, avatar, color = '#FF4F9A', drop = false, dim = false, crown = false }: { x: number; y: number; avatar: string; color?: string; drop?: boolean; dim?: boolean; crown?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.55 : 1}>
      <g className={drop ? 'pin-drop' : undefined}>
        <ellipse cx="0" cy="1" rx="7" ry="2.6" fill="#111" opacity=".25" />
        <path d="M0 0C-4-8-16-15-16-29a16 16 0 1132 0C16-15 4-8 0 0z" fill={color} stroke="#111" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="0" cy="-29" r="11.500" fill="#fff" stroke="#111" strokeWidth="2" />
        <g transform="translate(-10 -39)"><Character id={avatar} size={20} /></g>
        {crown && (
          <g transform="translate(0 -46)">
            <g className="crown-drop">
              <path d="M-11 0l-2-12 7 5 6-9 6 9 7-5-2 12z" fill="#FFD23F" stroke="#111" strokeWidth="2.200" strokeLinejoin="round" />
            </g>
          </g>
        )}
      </g>
    </g>
  );
}

/** The real location: a star with a pulsing ring. */
export function TargetMarker({ x, y, pop = true }: { x: number; y: number; pop?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="target-ring" r="12" fill="none" stroke="#111" strokeWidth="2.500" />
      <g className={pop ? 'target-pop' : undefined}>
        <path d="M0-15l4.400 8.900 9.800 1.400-7.100 6.900 1.700 9.800L0 7.500l-8.800 4.500 1.700-9.800-7.100-6.900 9.800-1.400z" transform="translate(0 3)" fill="#FFD23F" stroke="#111" strokeWidth="2.600" strokeLinejoin="round" />
      </g>
    </g>
  );
}
