import { useEffect, useRef, useState } from 'react';
import { AR, send, type RoomView } from '../net';
import { gameOver, music, sfx } from '../sound';
import { Character, GAMES } from './art';
import { Confetti } from './ui';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v: number) => { v = clamp(v); const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };

export interface OverTeam { name: string; color: string; score: number; ids: string[] }
interface Props {
  room: RoomView;
  game: string;
  /** "٦ جولات" */
  doneLabel: string;
  unit?: string;
  /** Solo: everyone with their total. */
  rows?: { id: string; total: number }[];
  /** Teams: both teams (winner = higher score, equal = a tie). */
  teams?: OverTeam[];
  awards?: { k: string; who: string; why: string }[];
}

/** The shared game-over screen (canvas artboard GameOver): a podium (solo) or a cup and the winning team, two awards, the room-leaderboard line, confetti. */
export function GameOver({ room, game, doneLabel, unit = 'نقطة', rows, teams, awards }: Props) {
  const info = GAMES.find((g) => g.id === game);
  const color = info?.color ?? '#FFD23F';
  const isHost = room.hostId === room.youId;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(reduced ? 99 : 0);
  const [boom, setBoom] = useState(0);
  const raf = useRef(0);
  const ranked = [...(rows ?? [])].sort((a, b) => b.total - a.total);
  const winTeam = teams && teams[0].score !== teams[1].score ? (teams[0].score > teams[1].score ? teams[0] : teams[1]) : null;
  const mineTeam = teams?.find((x) => x.ids.includes(room.youId));
  const outcome = teams ? (winTeam && mineTeam ? (winTeam === mineTeam ? 'win' : 'lose') : null) : null;

  useEffect(() => {
    music.dip(3);
    const stop = gameOver(outcome);
    const bm = setTimeout(() => setBoom(1), 1400);
    if (!reduced) {
      const t0 = performance.now();
      const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 8) raf.current = requestAnimationFrame(tick); };
      raf.current = requestAnimationFrame(tick);
    } else setBoom(1);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(bm); stop(); };
  }, []);

  const who = (id: string) => room.players.find((p) => p.id === id);
  const nm = (id: string) => (id === room.youId ? 'إنت' : who(id)?.name ?? '؟');
  const fmt = (v: number) => AR(Math.round(v)) + (unit === 'ج' ? ' ج' : unit === 'لوحة' ? ' لوحة' : '');
  const order = [1, 0, 2];
  const rise = (i: number) => ease((t - 0.3 - (2 - i) * 0.35) / 0.5);
  const title = teams ? (winTeam ? `${winTeam.name} كسب اللعبة!` : 'تعادل!') : `${ranked[0] ? nm(ranked[0].id) : '؟'} كسب اللعبة!`;
  const roomLine = teams ? 'كل واحد في الفريق الكسبان خد +٨ في ترتيب القعدة' : ranked[0] ? `${nm(ranked[0].id)} خد +١٠ في ترتيب القعدة` : '';

  return (
    <main className="screen go-screen">
      <Confetti fire={boom} amount={170} from="top" />
      <header className="row" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '1px 10px 1px 4px' }}><span style={{ width: 14, height: 14, borderRadius: 5, border: '2px solid #111', background: color }} />{info?.name}</span>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>خلصت {doneLabel}</span>
      </header>
      <h1 className="display" style={{ fontSize: 34, lineHeight: 1.15, textAlign: 'center', opacity: clamp((t - 1.5) / 0.3) }}>{title}</h1>

      {!teams ? (
        <>
          <section className="go-podium">
            <div aria-hidden="true" className="qz-rays" style={{ top: -40, opacity: clamp((t - 1.3) / 0.5) }} />
            {order.map((i) => {
              const p = ranked[i];
              if (!p) return <div key={i} />;
              return (
                <div key={p.id} className="col center" style={{ position: 'relative', gap: 4 }}>
                  {i === 0 && <svg width="34" height="26" viewBox="0 0 26 22" aria-hidden="true" style={{ animation: 'hop 1.2s ease-in-out infinite', opacity: clamp((t - 0.4 - 2 * 0.35) / 0.2) }}><path d="M2 19L4 6l6 6 3-9 3 9 6-6 2 13z" fill="#FFD23F" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" /></svg>}
                  <span style={{ display: 'flex', transform: `scale(${back((t - 0.5 - (2 - i) * 0.35) / 0.4).toFixed(2)})`, opacity: clamp((t - 0.4 - (2 - i) * 0.35) / 0.2) }}><Character id={who(p.id)?.avatar ?? 'c1'} size={58} /></span>
                  <span style={{ fontWeight: 900, fontSize: 14, opacity: clamp((t - 0.4 - (2 - i) * 0.35) / 0.2) }}>{nm(p.id)}</span>
                  <div style={{ alignSelf: 'stretch', height: Math.round([110, 84, 64][i] * (0.25 + 0.75 * rise(i))), background: ['#FFD23F', '#fff', '#F3E6C4'][i], border: '3px solid #111', borderBottom: 0, borderRadius: '14px 14px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, overflow: 'hidden' }}>
                    <b className="display" style={{ fontSize: 24, lineHeight: 1.1 }}>{AR(i + 1)}</b>
                    <span style={{ fontSize: 12, fontWeight: 900 }}>{fmt(p.total)}</span>
                  </div>
                </div>
              );
            })}
          </section>
          {ranked.length > 3 && (
            <div className="go-rest" style={{ opacity: clamp((t - 1.7) / 0.3) }}>
              {ranked.slice(3, 5).map((r, i) => (
                <span key={r.id} className="row" style={{ gap: 7, padding: '8px 10px', borderInlineStart: i === 1 ? '2px solid rgba(17,17,17,.12)' : 0 }}>
                  <b className="display" style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', background: '#111', color: '#FFD23F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{AR(i + 4)}</b>
                  <Character id={who(r.id)?.avatar ?? 'c1'} size={28} />
                  <span className="col" style={{ lineHeight: 1.15, minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{nm(r.id)}</b><span style={{ fontSize: 11.5, fontWeight: 800, opacity: 0.7 }}>{fmt(r.total)}</span></span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <section className="col center" style={{ position: 'relative', gap: 6, paddingTop: 8 }}>
          <div aria-hidden="true" className="qz-rays" style={{ opacity: clamp((t - 1.3) / 0.5) }} />
          <svg width="96" height="96" viewBox="0 0 64 64" aria-hidden="true" style={{ position: 'relative', transform: `scale(${back((t - 0.3) / 0.6).toFixed(2)})` }}><path d="M18 8h28v14a14 14 0 01-28 0z" fill="#FFD23F" stroke="#111" strokeWidth="3" strokeLinejoin="round" /><path d="M18 12H9a8 8 0 008 10M46 12h9a8 8 0 01-8 10" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" /><path d="M28 36h8v8h-8z" fill="#FF8A3D" stroke="#111" strokeWidth="3" /><path d="M20 44h24v8H20z" fill="#4D9DFF" stroke="#111" strokeWidth="3" strokeLinejoin="round" /></svg>
          <span className="row" style={{ position: 'relative', gap: 6, opacity: clamp((t - 1.5) / 0.3), flexWrap: 'wrap', justifyContent: 'center' }}>
            {(winTeam ?? teams[0]).ids.slice(0, 5).map((id) => <span key={id} style={{ animation: 'hop .6s ease-in-out infinite', display: 'flex' }}><Character id={who(id)?.avatar ?? 'c1'} size={46} /></span>)}
          </span>
          <span className="display" style={{ position: 'relative', fontSize: 20, background: '#fff', border: '3px solid #111', borderRadius: 16, padding: '2px 18px', opacity: clamp((t - 1.5) / 0.3) }}>{fmt(teams[0].score)} – {fmt(teams[1].score)}</span>
        </section>
      )}

      {awards && awards.length > 0 && (
        <section className="grid2" style={{ gap: 10, opacity: clamp((t - 2) / 0.4), transform: `translateY(${(14 * (1 - ease((t - 2) / 0.5))).toFixed(1)}px)` }}>
          {awards.slice(0, 2).map((a) => (
            <div key={a.k} className="qz-stat" style={{ padding: '8px 10px' }}>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, border: '2px solid #111', background: color }} /><span style={{ fontSize: 11.5, fontWeight: 900, opacity: 0.75 }}>{a.k}</span></span>
              <span className="display" style={{ fontSize: 19 }}>{a.who}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800 }}>{a.why}</span>
            </div>
          ))}
        </section>
      )}

      <div className="row" style={{ gap: 8, background: '#111', color: '#fff', borderRadius: 14, padding: '8px 12px', opacity: clamp((t - 2.3) / 0.3) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v6a5 5 0 01-10 0z" fill="#FFD23F" stroke="#111" strokeWidth="2" strokeLinejoin="round" /></svg>
        <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{roomLine}</span>
        <button className="chip" style={{ background: '#FFD23F', color: '#111', fontSize: 12 }} onClick={() => { sfx.tap(); window.dispatchEvent(new Event('allamma:board')); }}>ترتيب القعدة</button>
      </div>

      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" style={{ boxShadow: `0 6px 0 ${color}` }} onClick={() => { sfx.tap(); send('game:again'); }}>نلعبها تاني</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
