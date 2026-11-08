import { useEffect, useRef, useState } from 'react';
import { AR, serverNow, type RoomView } from '../net';
import { sfx } from '../sound';
import { Character, GAMES } from './art';

export const STANDINGS_SECONDS = 8;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v: number) => { v = clamp(v); const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };

/**
 * Between rounds: the standings take the last STANDINGS_SECONDS of the round-end phase (the game's own result screen shows first).
 * True while that last stretch runs; never on the final round (that goes straight to the game-over screen).
 */
export function useStandingsStep(endsAt: number | null, enabled: boolean) {
  const [, f] = useState(0);
  useEffect(() => { const i = setInterval(() => f((n) => n + 1), 250); return () => clearInterval(i); }, []);
  if (!enabled || !endsAt) return false;
  return endsAt - serverNow() <= STANDINGS_SECONDS * 1000;
}

export interface StandingsRow { id: string; total: number; gain: number }
export interface StandingsTeam { name: string; color: string; total: number; gain: number; ids: string[] }

interface Props {
  room: RoomView;
  /** Game id in components/art GAMES (name and colour). */
  game: string;
  round: number;
  rounds: number;
  /** "جولة" / "معلومة" / "لوحة" */
  noun?: string;
  unit?: string;
  /** One line about the round that just ended. */
  highlight: string;
  rows?: StandingsRow[];
  teams?: StandingsTeam[];
  endsAt: number | null;
  /** The host's "كمّل دلوقتي" (the game's own next action). */
  onNext?: () => void;
}

/** Between-rounds standings shared by every game (canvas artboard RoundStandings): solo rows that re-order, or two team bars. */
export function RoundStandings({ room, game, round, rounds, noun = 'جولة', unit = 'نقطة', highlight, rows, teams, endsAt, onNext }: Props) {
  const info = GAMES.find((g) => g.id === game);
  const color = info?.color ?? '#FFD23F';
  const isHost = room.hostId === room.youId;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(reduced ? 99 : 0);
  const raf = useRef(0);
  const snd = useRef<ReturnType<typeof setTimeout>[]>([]);

  const prevOrder = rows ? [...rows].sort((a, b) => b.total - b.gain - (a.total - a.gain)).map((r) => r.id) : [];
  const order = rows ? [...rows].sort((a, b) => b.total - a.total).map((r) => r.id) : [];
  const me = rows?.find((r) => r.id === room.youId);

  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 3) raf.current = requestAnimationFrame(tick); else setT(99); };
    raf.current = requestAnimationFrame(tick);
    // sounds: a whoosh per row that moves, a soft tick stream while the totals count, pop (you went up) / blip (you went down)
    const at = (ms: number, fn: () => void) => snd.current.push(setTimeout(fn, ms));
    const moved = order.filter((id, i) => prevOrder.indexOf(id) !== i).length;
    for (let i = 0; i < Math.min(moved, 4); i++) at(700 + i * 90, () => sfx.whoosh());
    for (let i = 0; i < 8; i++) at(500 + i * 110, () => sfx.soft());
    if (me) { const a = prevOrder.indexOf(me.id), b = order.indexOf(me.id); if (a !== b) at(1900, () => (b < a ? sfx.pop() : sfx.blip())); }
    return () => { cancelAnimationFrame(raf.current); snd.current.forEach(clearTimeout); };
  }, []);

  const k = ease((t - 0.7) / 1.1);
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)) : 0;
  const ring = 106.8 * (1 - clamp(left / STANDINGS_SECONDS));
  const who = (id: string) => room.players.find((p) => p.id === id);
  const fmt = (v: number) => AR(Math.round(v)) + (unit === 'ج' ? ' ج' : '');
  const TOP = (i: number) => 6 + 56 * i;
  const maxTeam = Math.max(1, ...(teams ?? []).map((x) => x.total)) * 1.15;
  void maxTeam;

  return (
    <main className="screen rs-screen">
      <header className="row" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '1px 10px 1px 4px' }}><span style={{ width: 14, height: 14, borderRadius: 5, border: '2px solid #111', background: color }} />{info?.name}</span>
      </header>
      <div className="col" style={{ gap: 6 }}>
        <span className="display" style={{ fontSize: 28, lineHeight: 1.15 }}>الترتيب بعد {noun} {AR(round)} من {AR(rounds)}</span>
        <div className="row" style={{ gap: 5 }}>
          {Array.from({ length: rounds }, (_, i) => <span key={i} style={{ flex: 1, height: 10, borderRadius: 99, border: '2px solid #111', background: i < round ? color : '#fff', animation: i === round - 1 && !reduced ? 'drPop .4s .2s both' : 'none' }} />)}
        </div>
      </div>
      <div className="row" style={{ gap: 10, background: '#111', color: '#fff', borderRadius: 16, padding: '8px 12px', opacity: clamp(t / 0.3) }}>
        <span style={{ width: 10, height: 26, borderRadius: 99, background: color, border: '2px solid #fff', flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.5 }}>{highlight}</span>
      </div>

      {teams ? (
        <section className="rs-card col" style={{ gap: 12, padding: 14 }}>
          {teams.map((tm) => {
            const mx = Math.max(1, ...teams.map((x) => x.total)) * 1.15;
            const shown = tm.total - tm.gain + tm.gain * k;
            return (
              <div key={tm.name} className="col" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="display" style={{ fontSize: 18 }}>{tm.name}</span>
                  {tm.gain > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: '#1F7A52', opacity: clamp((t - 0.3) / 0.3) }}>+{fmt(tm.gain)}</span>}
                  <b className="display num" style={{ marginInlineStart: 'auto', fontSize: 22 }}>{fmt(shown)}{unit === 'لوحة' ? ' لوحة' : ''}</b>
                </div>
                <span className="qz-bar" style={{ height: 24 }}><span style={{ width: `${clamp(shown / mx) * 100}%`, background: tm.color }} /></span>
                <span className="row" style={{ gap: 4 }}>{tm.ids.slice(0, 6).map((id) => <Character key={id} id={who(id)?.avatar ?? 'c1'} size={24} />)}</span>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="rs-card" style={{ position: 'relative', height: 14 + 56 * Math.min(rows?.length ?? 0, 6) }}>
          {(rows ?? []).slice(0, 6).map((r) => {
            const ni = order.indexOf(r.id), oi = prevOrder.indexOf(r.id);
            const mv = oi - ni;
            const val = r.total - r.gain + r.gain * k;
            const p = who(r.id);
            return (
              <div key={r.id} className="rs-row" style={{ top: TOP(oi + (ni - oi) * k), background: r.id === room.youId ? '#DCEBFF' : 'transparent' }}>
                <b className="display" style={{ width: 24, textAlign: 'center', fontSize: 20 }}>{AR(ni + 1)}</b>
                <Character id={p?.avatar ?? 'c1'} size={34} />
                <div className="col" style={{ lineHeight: 1.2, minWidth: 0 }}>
                  <span style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id === room.youId ? 'إنت' : p?.name ?? '؟'}</span>
                  {mv !== 0 && <span style={{ fontSize: 11, fontWeight: 900, color: mv > 0 ? '#1F9E6A' : '#E2433B', opacity: clamp((t - 1.9) / 0.3) }}>{mv > 0 ? `▲ طلع ${AR(mv)}` : `▼ نزل ${AR(-mv)}`}</span>}
                </div>
                <span style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 900, color: '#1F7A52', background: '#D4F7E8', border: '2px solid #111', borderRadius: 99, padding: '0 8px', opacity: clamp((t - 0.3) / 0.3), transform: `scale(${back((t - 0.3) / 0.4).toFixed(2)})` }}>{r.gain ? `+${fmt(r.gain)}` : '—'}</span>
                <b className="display num" style={{ minWidth: 58, textAlign: 'left', fontSize: 20 }}>{fmt(val)}</b>
              </div>
            );
          })}
        </section>
      )}

      <div className="col push" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ position: 'relative', width: 52, height: 52, flex: 'none' }} role="timer" aria-label={`فاضل ${left} ثانية`}>
            <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}><circle cx="26" cy="26" r="22" fill="#fff" stroke="#111" strokeWidth="3" /><circle cx="26" cy="26" r="17" fill="none" stroke={color} strokeWidth="6" strokeDasharray="106.8" strokeDashoffset={ring} strokeLinecap="round" /></svg>
            <span className="display" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>{AR(left)}</span>
          </span>
          <div className="col" style={{ lineHeight: 1.3 }}><b style={{ fontSize: 15 }}>الجولة الجاية بتبدأ لوحدها</b><span style={{ fontSize: 12, fontWeight: 800 }}>فاضل {AR(rounds - round)} {noun === 'لوحة' ? 'لوحة' : noun === 'معلومة' ? 'معلومة' : 'جولات'} · الكل لسه في اللعبة</span></div>
        </div>
        {isHost && onNext ? <button className="btn big full" style={{ boxShadow: `0 6px 0 ${color}` }} onClick={() => { sfx.confirm(); onNext(); }}>كمّل دلوقتي</button> : null}
        <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center', opacity: 0.75 }}>الزرار للهوست بس · الباقي بيستنى العداد</span>
      </div>
    </main>
  );
}
