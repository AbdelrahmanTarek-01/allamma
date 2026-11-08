import { GameMenu } from '../components/GameMenu';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Character } from '../components/art';
import { HelpButton } from '../components/HelpSheet';
import { MapView, PinMarker, TargetMarker, destPoint, type MapCtx } from '../components/MapView';
import { Confetti, MuteButton, Sheet, SkeletonHome, Timer, useCountUp } from '../components/ui';
import { AR, send, serverNow, toast, type MapEntry, type MapGameView, type MapHint, type PlayerView, type RoomView } from '../net';
import { isMapLoaded, loadMapDef, getMapDef } from '../games/map/maps';
import { gameOver, music, sfx } from '../sound';
import { GameOver } from '../components/GameOver';
import { RoundStandings, useStandingsStep } from '../components/RoundStandings';

type P = { room: RoomView; g: MapGameView };

const THEME_LABEL = { cities: 'مدينة', landmarks: 'معلم', stadiums: 'ملعب', dishes: 'الأكلة دي جاية منين؟' } as const;
const DIFF_NAME = { easy: 'سهل', medium: 'متوسط', hard: 'صعب', max: 'ماكس' } as const;
const mult = (n: number) => AR(String(n).replace('.', '٫'));
const fmtKm = (km: number) => (km < 1 ? 'أقل من ١ كم' : `${AR(Math.round(km))} كم`);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export function MapGame(props: P) {
  // the map files are separate downloads: wait for this round's map (instant when the lounge already warmed it up).
  // With the random scope the map changes between rounds, so all three load as soon as the game starts.
  const [, bump] = useState(0);
  const scope = props.g.scope;
  const random = props.room.settings.scope === 'random';
  useEffect(() => {
    let on = true;
    (random ? (['egypt', 'arab', 'world'] as const) : [scope]).forEach((sc) => { loadMapDef(sc).then(() => on && bump((n) => n + 1)).catch(() => {}); });
    return () => { on = false; };
  }, [scope, random]);
  const ready = isMapLoaded(scope);
  if (!ready) return <SkeletonHome note="بنجهّز الخريطة…" />;
  switch (props.g.phase) {
    case 'guess': return <Guess {...props} />;
    case 'reveal': return <Reveal {...props} />;
    case 'result': return <Result {...props} />;
    default: return <Final {...props} />;
  }
}

function Header({ g }: { g: MapGameView }) {
  return (
    <header className="row between">
      <div className="row" style={{ gap: 6 }}>
        <span className="chip pink">المكان {AR(g.round)} من {AR(g.totalRounds)}</span>
        <HelpButton gameId="map" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <GameMenu /><MuteButton />
        {g.phase === 'guess' && g.endsAt && <Timer endsAt={g.endsAt} />}
      </div>
    </header>
  );
}

const WatchBanner = ({ g }: { g: MapGameView }) =>
  g.you ? null : <div className="card flat center" style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14 }}>دخلت واللعبة شغالة، هتلعب من المكان الجاي</div>;

/** Place name card: what to look for + the points multiplier of this place. */
function PlaceCard({ g, compact = false }: { g: MapGameView; compact?: boolean }) {
  const p = g.place!;
  return (
    <section className={`card place-card${compact ? ' compact' : ''}`}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="label" style={{ fontSize: 12.5 }}>{THEME_LABEL[p.theme]}</span>
        <span className="chip dark" style={{ fontSize: 12 }}>{DIFF_NAME[p.difficulty]} ×{mult(p.multiplier)}</span>
      </div>
      <h1 className="display place-name">{p.name}</h1>
    </section>
  );
}

const Bulb = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.500a6.500 6.500 0 00-3.800 11.800c.6.500 1 1.200 1 2V17h5.600v-.7c0-.8.400-1.500 1-2A6.500 6.500 0 0012 2.500z" fill="#FFD23F" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9.500 20.500h5M10.300 22.500h3.400" stroke="#111" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* ---------- map shapes for hints (map units, under the zoom) ---------- */

/** One-shot 0..1 progress, for the hint animations. */
function useProgress(ms: number, key: unknown) {
  const [p, setP] = useState(reducedMotion() ? 1 : 0);
  useEffect(() => {
    if (reducedMotion()) { setP(1); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => { const k = clamp01((now - t0) / ms); setP(k); if (k < 1) raf = requestAnimationFrame(step); };
    setP(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return p;
}

const ringPath = (pts: [number, number][]) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;

type ShapeHint = Exclude<MapHint, { kind: 'text' }>;

function HintShape({ hint, c, scopeW }: { hint: ShapeHint; c: MapCtx; scopeW: number }) {
  const sweep = useProgress(850, hint.kind === 'half' ? `${hint.axis}${hint.at}${hint.shade}` : 'circle');
  if (hint.kind === 'circle') {
    const pts: [number, number][] = [];
    for (let b = 0; b < 360; b += 4) { const [la, lo] = destPoint(hint.lat, hint.lon, b, hint.radiusKm); pts.push(c.xy(la, lo)); }
    // a circle that crosses the date line of a world map would be torn apart by the projection: draw only the outline then
    const torn = pts.some((p, i) => Math.abs(p[0] - pts[(i + 1) % pts.length][0]) > scopeW / 2);
    return torn
      ? <path className="hint-circle" d={pts.map((p, i) => (Math.abs(p[0] - pts[(i + pts.length - 1) % pts.length][0]) > scopeW / 2 ? 'M' : i ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')} fill="none" />
      : <path className="hint-circle grow" d={ringPath(pts)} />;
  }
  // half: the side that is ruled out is shaded; the shading sweeps in from the edge of the map to the cut line
  const TOP = 85, e = 1 - Math.pow(1 - sweep, 3);
  const lerp = (a: number, b: number) => a + (b - a) * e;
  let latR: [number, number] = [-TOP, TOP], lonR: [number, number] = [-180, 180];
  if (hint.shade === 'north') latR = [lerp(TOP, hint.at), TOP];
  if (hint.shade === 'south') latR = [-TOP, lerp(-TOP, hint.at)];
  if (hint.shade === 'east') lonR = [lerp(180, hint.at), 180];
  if (hint.shade === 'west') lonR = [-180, lerp(-180, hint.at)];
  const ring: [number, number][] = [];
  const edge = (a: [number, number], b: [number, number]) => { const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)); for (let i = 0; i < n; i++) ring.push(c.xy(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)); };
  // points are (lat, lon); walk the rectangle's four edges
  edge([latR[0], lonR[0]], [latR[0], lonR[1]]);
  edge([latR[0], lonR[1]], [latR[1], lonR[1]]);
  edge([latR[1], lonR[1]], [latR[1], lonR[0]]);
  edge([latR[1], lonR[0]], [latR[0], lonR[0]]);
  const cut: [number, number][] = [];
  const cutLat = hint.shade === 'north' ? latR[0] : latR[1], cutLon = hint.shade === 'east' ? lonR[0] : lonR[1];
  for (let i = 0; i <= 60; i++) {
    const f = i / 60;
    cut.push(hint.axis === 'lat' ? c.xy(cutLat, -180 + 360 * f) : c.xy(-TOP + 2 * TOP * f, cutLon));
  }
  return (
    <>
      <path className="hint-half" d={ringPath(ring)} />
      <path className="hint-cut" d={`M${cut.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`} fill="none" />
    </>
  );
}

/* ---------- guess ---------- */

function LockedChip({ room, g, onClick }: P & { onClick: () => void }) {
  const total = g.participants.length;
  const locked = g.participants.filter((id) => g.lockedIds.includes(id));
  const shown = locked.slice(0, 3);
  return (
    <button type="button" className="locked-chip" onClick={onClick} aria-label={`${AR(locked.length)} من ${AR(total)} ثبّتوا، افتح القائمة`}>
      <span className="ready-avatars">
        {shown.map((id) => <Character key={id} id={room.players.find((p) => p.id === id)?.avatar ?? 'c1'} size={26} />)}
        {locked.length > 3 && <span className="chip dark plus-chip">+{AR(locked.length - 3)}</span>}
      </span>
      <span style={{ fontWeight: 900, fontSize: 13.5 }}>{AR(locked.length)} من {AR(total)} ثبّتوا</span>
    </button>
  );
}

function Guess({ room, g }: P) {
  const you = g.you;
  const me = room.players.find((p) => p.id === room.youId)!;
  const [pin, setPin] = useState(you?.pin ?? null);
  const [sheet, setSheet] = useState(false);
  const locked = !!you?.locked;
  const hint = you?.hint ?? null;
  const total = useRef(Math.max(1, Number(room.settings.seconds) || 20)).current;
  const used = Math.max(0, total - (g.endsAt ? (g.endsAt - serverNow()) / 1000 : total));
  const def = getMapDef(g.scope);

  const onTap = (lat: number, lon: number) => {
    if (!you) return;
    if (locked) { sfx.error(); toast('غيّر رأيك الأول لو عايز تنقل الدبوس'); return; }
    setPin({ lat, lon });
    sfx.pinDrop();
    send('map:pin', { lat, lon });
  };

  return (
    <main className="screen map-screen">
      <Header g={g} />
      <div className="timebar" aria-hidden="true"><i style={{ animationDuration: `${total}s`, animationDelay: `-${used.toFixed(2)}s` }} /></div>
      <PlaceCard g={g} />
      <WatchBanner g={g} />
      {hint?.kind === 'text' && (
        <div className="hint-card pop-in"><Bulb /><span>{hint.text}</span></div>
      )}
      {hint && hint.kind !== 'text' && (
        <div className="hint-card pop-in"><Bulb /><span>{hint.kind === 'circle' ? 'المكان في مكان ما جوه الدايرة الوردي' : 'المكان مش في الجزء المظلّل'}</span></div>
      )}
      <MapView
        scope={g.scope}
        onTap={you ? onTap : undefined}
        layer={hint && hint.kind !== 'text' ? (c) => <HintShape hint={hint} c={c} scopeW={def.w} /> : undefined}
        overlay={(c) => {
          if (!pin) return null;
          const [x, y] = c.px(pin.lat, pin.lon);
          return <PinMarker key={`${pin.lat},${pin.lon}`} x={x} y={y} avatar={me.avatar} drop color={locked ? '#3DDC97' : '#FF4F9A'} />;
        }}
      />
      <div className="dock map-dock">
        {you && (
          <div className="row between" style={{ gap: 8 }}>
            <button type="button" className="btn sm hint-btn" disabled={!you.canHint || locked} onClick={() => { sfx.select(); send('map:hint'); }} aria-label="تلميح، بيخصم ربع النقط">
              <Bulb size={20} />
              {you.hint ? 'خدت التلميح' : 'تلميح'}
              {!you.hint && <span className="chip pink" style={{ fontSize: 11, padding: '0 7px' }}>−٢٥٪</span>}
            </button>
            <LockedChip room={room} g={g} onClick={() => setSheet(true)} />
          </div>
        )}
        {you ? (
          locked ? (
            <button className="btn full change-btn" onClick={() => { sfx.toggleOff(); send('map:unlock'); }}>غيّرت رأيي</button>
          ) : (
            <button className="btn big full" disabled={!pin} onClick={() => { sfx.confirm(); send('map:lock'); }}>{pin ? 'ثبّت الدبوس' : 'اضغط على الخريطة'}</button>
          )
        ) : (
          <LockedChip room={room} g={g} onClick={() => setSheet(true)} />
        )}
      </div>
      {sheet && (
        <Sheet title="مين ثبّت؟" onClose={() => setSheet(false)}>
          <div className="col" style={{ gap: 6 }}>
            {g.participants.map((id) => {
              const p = room.players.find((x) => x.id === id);
              if (!p) return null;
              const done = g.lockedIds.includes(id);
              return (
                <div key={id} className="row" style={{ gap: 10, padding: '6px 8px', borderRadius: 14, background: done ? '#E6FBF1' : 'transparent' }}>
                  <Character id={p.avatar} size={36} />
                  <span className="grow" style={{ fontWeight: 900 }}>{id === room.youId ? 'إنت' : p.name}</span>
                  <span className={`chip${done ? '' : ' soft'}`} style={{ background: done ? 'var(--green)' : undefined }}>{done ? 'ثبّت ✓' : 'بيفكّر…'}</span>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
    </main>
  );
}

/* ---------- reveal ---------- */

// timeline (ms from the start of the reveal)
const T_TARGET = 250, T_DROP0 = 950, T_DROP_STEP = 620, T_LINE_STEP = 340, T_LINE_DUR = 1100;

function useElapsed(totalMs: number) {
  const [t, setT] = useState(reducedMotion() ? totalMs : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => { const e = Math.min(now - t0, totalMs); setT(e); if (e < totalMs) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [totalMs]);
  return t;
}

const bez = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

function Reveal({ room, g }: P) {
  const rv = g.reveal;
  const players = room.players;
  const who = (id: string) => players.find((p) => p.id === id);
  const entries = rv?.entries ?? [];
  const pinned = entries.filter((e): e is MapEntry & { lat: number; lon: number; km: number } => e.km !== null && e.lat !== null && e.lon !== null);
  const dropOrder = useMemo(() => [...pinned].reverse(), []); // farthest first, closest last
  const n = dropOrder.length;
  const lines0 = T_DROP0 + n * T_DROP_STEP;
  const lastEnd = lines0 + Math.max(0, n - 1) * T_LINE_STEP + T_LINE_DUR;
  const winnerAt = n ? lastEnd + 250 : T_TARGET + 400;
  const t = useElapsed(winnerAt + 1000);
  const [boom, setBoom] = useState(0);
  const winner = pinned[0];
  const meWon = winner?.id === room.youId;
  const focus = useMemo(() => ({ key: 1, points: [...pinned.map((e) => [e.lat, e.lon] as [number, number]), ...(rv ? [[rv.target.lat, rv.target.lon] as [number, number]] : [])] }), []);

  // sounds on the timeline (each cue fires once)
  const fired = useRef(new Set<string>());
  useEffect(() => {
    const once = (id: string, at: number, fn: () => void) => { if (t >= at && !fired.current.has(id)) { fired.current.add(id); fn(); } };
    once('target', T_TARGET, () => sfx.pop());
    dropOrder.forEach((_, i) => once(`d${i}`, T_DROP0 + i * T_DROP_STEP, () => sfx.pinDrop()));
    dropOrder.forEach((_, i) => once(`l${i}`, lines0 + i * T_LINE_STEP, () => sfx.lineDraw()));
    once('near', winnerAt + 500, () => { const mine = entries.find((e) => e.id === room.youId); if (!meWon && mine && mine.points >= 600) sfx.near(); });
    once('win', winnerAt, () => { if (winner) { (meWon ? sfx.win : sfx.crown)(); setBoom(1); } else sfx.lose(); });
  }, [t]);
  useEffect(() => { music.dip(3); }, []);

  // bars: every player, sorted live by the distance counted so far (closest on top)
  const ROW = 34;
  const finalRank = new Map(entries.map((e, i) => [e.id, i]));
  const live = entries.map((e) => {
    const j = dropOrder.findIndex((d) => d.id === e.id);
    const p = j < 0 ? 0 : easeInOut(clamp01((t - (lines0 + j * T_LINE_STEP)) / T_LINE_DUR));
    return { e, cur: e.km === null ? Infinity : e.km * p, p };
  });
  const sorted = [...live].sort((a, b) => a.cur - b.cur || (finalRank.get(a.e.id)! - finalRank.get(b.e.id)!));
  const maxKm = Math.max(1, ...pinned.map((e) => e.km));
  const winnerShown = t >= winnerAt;
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (winnerShown) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [winnerShown]);

  const second = pinned[1];
  const winLine = !winner
    ? 'محدش حط دبوس!'
    : meWon
      ? (second ? `إنت الأقرب! أقرب من ${who(second.id)?.name ?? ''} بـ ${fmtKm(second.km - winner.km)}` : 'إنت الأقرب!')
      : (() => { const mine = pinned.find((e) => e.id === room.youId); return `${who(winner.id)?.name ?? ''} الأقرب!${mine ? ` أقرب منك بـ ${fmtKm(mine.km - winner.km)}` : ''}`; })();

  return (
    <main className="screen map-screen">
      <Confetti fire={boom} />
      <Header g={g} />
      <PlaceCard g={g} compact />
      <MapView
        scope={g.scope}
        controls={false}
        focus={t > 120 ? focus : null}
        label="الخريطة، كشف الدبابيس"
        overlay={(c) => {
          if (!rv) return null;
          const [tx, ty] = c.px(rv.target.lat, rv.target.lon);
          const lines: ReactNode[] = [];
          const pins: ReactNode[] = [];
          const tags: ReactNode[] = [];
          dropOrder.forEach((e, j) => {
            const [x, y] = c.px(e.lat, e.lon);
            const dropAt = T_DROP0 + j * T_DROP_STEP;
            if (t >= dropAt) pins.push(<PinMarker key={e.id} x={x} y={y} avatar={who(e.id)?.avatar ?? 'c1'} color={e.id === room.youId ? '#FF4F9A' : '#4D9DFF'} drop crown={winnerShown && e.id === winner?.id} />);
            const p = easeInOut(clamp01((t - (lines0 + j * T_LINE_STEP)) / T_LINE_DUR));
            if (p <= 0) return;
            const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy) || 1;
            const off = len * 0.22 * (j % 2 ? 1 : -1);
            const cx = (x + tx) / 2 + (-dy / len) * off, cy = (y + ty) / 2 + (dx / len) * off;
            const hx = bez(x, cx, tx, p), hy = bez(y, cy, ty, p);
            lines.push(
              <g key={e.id}>
                <path d={`M${x} ${y}Q${cx} ${cy} ${tx} ${ty}`} className="reveal-line" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} stroke={e.id === room.youId ? '#FF4F9A' : '#2F6FB8'} />
                {p < 1 && <circle cx={hx} cy={hy} r="5" fill="#fff" stroke="#111" strokeWidth="2.500" />}
              </g>
            );
            const tagP = Math.min(p, 0.62), tx2 = bez(x, cx, tx, tagP * 0.9), ty2 = bez(y, cy, ty, tagP * 0.9);
            tags.push(
              <g key={e.id} transform={`translate(${tx2} ${ty2 - 14})`}>
                <rect x="-31" y="-11" width="62" height="22" rx="11" fill="#fff" stroke="#111" strokeWidth="2.500" />
                <text className="map-tag" textAnchor="middle" y="5">{fmtKm(e.km * p)}</text>
              </g>
            );
          });
          return (
            <>
              {lines}
              {pins}
              {t >= T_TARGET && <TargetMarker x={tx} y={ty} />}
              {tags}
            </>
          );
        }}
      />

      {/* distance bars: grow with the lines, re-sort as the numbers change; the closest gets a crown */}
      <div className="bars" style={{ height: Math.min(entries.length, 6) * ROW }}>
        <div className="bars-inner" style={{ height: entries.length * ROW }}>
          {sorted.map(({ e, cur }, rank) => {
            const p = who(e.id);
            const isWin = winnerShown && e.id === winner?.id;
            return (
              <div key={e.id} className={`bar-row${isWin ? ' win' : ''}`} style={{ transform: `translateY(${rank * ROW}px)`, height: ROW - 4 }}>
                <Character id={p?.avatar ?? 'c1'} size={26} />
                <span className="bar-name">{e.id === room.youId ? 'إنت' : p?.name}</span>
                <span className="bar-track">
                  <i style={{ width: `${e.km === null ? 0 : (cur / maxKm) * 100}%`, background: e.id === room.youId ? 'var(--pink)' : 'var(--blue)' }} />
                </span>
                <span className="bar-km num">{e.km === null ? 'ما حطش دبوس' : fmtKm(cur)}</span>
                {isWin && <svg className="crown-drop bar-crown" width="20" height="16" viewBox="-12 -14 24 16" aria-hidden="true"><path d="M-11 0l-2-12 7 5 6-9 6 9 7-5-2 12z" fill="#FFD23F" stroke="#111" strokeWidth="2" strokeLinejoin="round" /></svg>}
              </div>
            );
          })}
        </div>
      </div>

      {winnerShown && (
        <div ref={cardRef} className="card winner-card pop-in">
          {winner ? (
            <>
              <div className="winner-who">
                <span className="winner-avatar"><Character id={who(winner.id)?.avatar ?? 'c1'} size={72} /></span>
                <svg className="crown-drop winner-crown" width="46" height="34" viewBox="-14 -16 28 18" aria-hidden="true"><path d="M-11 0l-2-12 7 5 6-9 6 9 7-5-2 12z" fill="#FFD23F" stroke="#111" strokeWidth="1.800" strokeLinejoin="round" /></svg>
                <span className="points-sticker">{AR(winner.points)}+</span>
              </div>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="display" style={{ fontSize: 22 }}>{winLine}</span>
                <span className="muted">{fmtKm(winner.km)} من المكان الحقيقي</span>
              </div>
            </>
          ) : (
            <span className="display" style={{ fontSize: 20 }}>{winLine}</span>
          )}
        </div>
      )}
      <WatchBanner g={g} />
    </main>
  );
}

/* ---------- results ---------- */

const ROW_H = 60;

function RankRow({ p, total, prev, pts, from, to, step, isYou }: { p: PlayerView; total: number; prev: number; pts: number; from: number; to: number; step: number; isYou: boolean }) {
  const shown = useCountUp(step >= 2 ? total : prev, prev, 950);
  const moved = from - to; // positive: climbed
  const leader = step >= 3 ? to === 0 : from === 0;
  return (
    <div className={`rank-row${leader ? ' leader' : ''}`} style={{ transform: `translateY(${(step >= 3 ? to : from) * ROW_H}px)`, height: ROW_H - 6 }}>
      <span className="rank-n">{AR((step >= 3 ? to : from) + 1)}</span>
      <Character id={p.avatar} size={40} />
      <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
        <span style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isYou ? 'إنت' : p.name}</span>
        <span className="row" style={{ gap: 6, minHeight: 20 }}>
          {step >= 1 && pts > 0 && <span className="gain chip" style={{ background: 'var(--green)', fontSize: 11.5, padding: '0 8px', animationDelay: '0s' }}>{AR(pts)}+</span>}
          {step >= 1 && pts === 0 && <span className="muted" style={{ fontSize: 12 }}>٠+</span>}
          {step >= 4 && moved !== 0 && <span className="gain chip" style={{ background: moved > 0 ? 'var(--green)' : 'var(--red)', color: moved > 0 ? '#111' : '#fff', fontSize: 11.5, padding: '0 8px', animationDelay: '0s' }}>{moved > 0 ? '▲' : '▼'} {AR(Math.abs(moved))}</span>}
        </span>
      </div>
      <span className="display num" style={{ fontSize: 26 }}>{AR(shown)}</span>
    </div>
  );
}

/** Rows start in the previous order, +points chips appear, totals count up, then rows slide to the new order with ▲/▼. */
function Ranking({ room, g }: P) {
  const [step, setStep] = useState(0);
  const rows = room.players.map((p, i) => ({ p, i, total: p.score, pts: g.roundPoints[p.id] ?? 0, prev: p.score - (g.roundPoints[p.id] ?? 0) }));
  const prevOrder = [...rows].sort((a, b) => b.prev - a.prev || a.i - b.i).map((r) => r.p.id);
  const newOrder = [...rows].sort((a, b) => b.total - a.total || prevOrder.indexOf(a.p.id) - prevOrder.indexOf(b.p.id)).map((r) => r.p.id);

  useEffect(() => {
    if (reducedMotion()) { setStep(4); return; }
    setStep(0);
    const ts = [setTimeout(() => setStep(1), 450), setTimeout(() => { setStep(2); sfx.pop(); }, 1000), setTimeout(() => { setStep(3); sfx.whoosh(); }, 2300), setTimeout(() => setStep(4), 3100)];
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="rank-board" style={{ height: rows.length * ROW_H }}>
        {rows.map((r) => (
          <RankRow key={r.p.id} p={r.p} total={r.total} prev={r.prev} pts={r.pts} from={prevOrder.indexOf(r.p.id)} to={newOrder.indexOf(r.p.id)} step={step} isYou={r.p.id === room.youId} />
        ))}
      </div>
    </div>
  );
}

function ResultView({ room, g }: P) {
  const isHost = room.hostId === room.youId;
  const last = g.round >= g.totalRounds;
  const mine = g.reveal?.entries.find((e) => e.id === room.youId);
  const place = g.place!;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '؟';

  const parts: string[] = [];
  if (mine && mine.km !== null) {
    if (place.multiplier !== 1) parts.push(`×${mult(place.multiplier)} ${DIFF_NAME[place.difficulty]}`);
    if (mine.fast) parts.push('+٥٠ سرعة');
    if (mine.hinted) parts.push('−٢٥٪ تلميح');
  }

  return (
    <main className="screen map-screen">
      <Header g={g} />
      <section className="card place-card compact">
        <div className="row between"><span className="label" style={{ fontSize: 12.5 }}>{THEME_LABEL[place.theme]}</span>{g.endsAt && <Timer endsAt={g.endsAt} tick={false} />}</div>
        <h1 className="display place-name">{place.name}</h1>
        <p className="fact"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" fill="#FF4F9A" stroke="#111" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="9" r="2.500" fill="#fff" stroke="#111" strokeWidth="1.500" /></svg>{g.reveal?.fact}</p>
      </section>
      <WatchBanner g={g} />
      <p className="points-line">
        {mine && mine.km !== null
          ? <>دبوسك كان بعيد <b>{fmtKm(mine.km)}</b> وخدت <b>{AR(mine.points)}</b> نقطة{parts.length ? <span className="muted"> ({parts.join(' · ')})</span> : null}</>
          : g.you ? 'مفيش دبوس منك المرة دي، يعني صفر نقط.' : null}
        <span className="muted" style={{ display: 'block' }}>كل ما دبوسك أقرب، نقطك أكتر، والصعوبة بتضرب النقط.</span>
      </p>
      <Ranking room={room} g={g} />
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" onClick={() => { sfx.tap(); send('game:next'); }}>{last ? 'الترتيب النهائي' : 'المكان الجاي'}</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>رجوع للأوضة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين {nameOf(room.hostId)} يكمّل</span>}
      </div>
    </main>
  );
}

/* ---------- final ---------- */

function Result(props: P) {
  const { room, g } = props;
  const last = g.round >= g.totalRounds;
  const st = useStandingsStep(g.endsAt, !last);
  if (!st) return <ResultView {...props} />;
  const rows = room.players.filter((p) => g.participants.includes(p.id)).map((p) => ({ id: p.id, total: p.score, gain: g.roundPoints[p.id] ?? 0 }));
  return <RoundStandings room={room} game="map" round={g.round} rounds={g.totalRounds} highlight={`الجولة دي: المكان كان ${g.place?.name ?? '؟'}`} rows={rows} endsAt={g.endsAt} onNext={() => send('game:next')} />;
}

function Final({ room, g }: P) {
  const rows = room.players.filter((p) => g.participants.includes(p.id)).map((p) => ({ id: p.id, total: p.score }));
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const nm = (id: string) => (id === room.youId ? 'إنت' : room.players.find((p) => p.id === id)?.name ?? '؟');
  const awards = sorted.length > 1 ? [{ k: 'بطل الخريطة', who: nm(sorted[0].id), why: `${AR(sorted[0].total)} نقطة` }, { k: 'المنافس القوي', who: nm(sorted[1].id), why: `ورا الأول بـ ${AR(sorted[0].total - sorted[1].total)} نقطة` }] : [];
  return <GameOver room={room} game="map" doneLabel={`${AR(g.totalRounds)} جولات`} rows={rows} awards={awards} />;
}
