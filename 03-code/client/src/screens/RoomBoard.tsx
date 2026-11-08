import { useEffect, useRef, useState } from 'react';
import { Character, GAMES, Trophy } from '../components/art';
import { AR, send, type BoardRow, type RoomView } from '../net';
import { sfx } from '../sound';

const gameOf = (id: string) => GAMES.find((g) => g.id === id);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const RH = 44; // list row height
const STEP = [{ h: 92, bg: '#FFD23F' }, { h: 70, bg: '#fff' }, { h: 54, bg: '#F3E6C4' }]; // podium steps: 1st, 2nd, 3rd

/**
 * "ترتيب القعدة" (canvas artboard RoomBoard): placement points across every game played in this lounge.
 * Opened from the trophy in the lounge header, and shown automatically after each game ends (`auto`): the totals count up,
 * the rows slide from the old order to the new one, the arrows fade in, and the host gets "اختار اللعبة الجاية".
 */
export function RoomBoard({ room, auto, onClose }: { room: RoomView; auto: boolean; onClose: () => void }) {
  const b = room.board;
  const isHost = room.hostId === room.youId;
  const [tab, setTab] = useState(0); // 0 = all games, i = the i-th game played
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(auto && !reduced ? 0 : 99); // seconds into the animation
  const raf = useRef(0);

  const snd = useRef<ReturnType<typeof setTimeout>[]>([]);
  const boardSounds = () => {
    snd.current.forEach(clearTimeout);
    const at = (ms: number, fn: () => void) => snd.current.push(setTimeout(fn, ms));
    const moved = rows.filter((r, i) => r.prevRank !== null && r.prevRank !== i).length;
    for (let i = 0; i < Math.min(moved, 4); i++) at(300 + i * 90, () => sfx.whoosh()); // one whoosh per row that moves
    for (let i = 0; i < 9; i++) at(350 + i * 110, () => sfx.soft()); // the points count up
    const me = rows.findIndex((r) => r.id === room.youId);
    const prev = me >= 0 ? rows[me].prevRank : null;
    if (prev !== null && prev !== me) at(1350, () => (me < prev ? sfx.pop() : sfx.blip()));
  };
  useEffect(() => () => snd.current.forEach(clearTimeout), []);
  const play = () => {
    cancelAnimationFrame(raf.current);
    setTab(0);
    if (reduced) return setT(99);
    boardSounds();
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 2.5) raf.current = requestAnimationFrame(tick); else setT(99); };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => { if (auto && !reduced) play(); return () => cancelAnimationFrame(raf.current); }, []);

  const gameIds = b.games;
  const g = tab > 0 ? gameIds[tab - 1] : null;
  const rows = b.rows;
  const score = (r: BoardRow, upto: boolean) => (g ? r.byGame[g] ?? 0 : upto ? r.total : r.total - r.gain);
  const after = g ? [...rows].sort((x, y) => score(y, true) - score(x, true)) : rows; // rows already come sorted by total
  const k = tab === 0 ? ease((t - 0.3) / 1.1) : 1;
  const oldIndex = (r: BoardRow) => (r.prevRank === null ? rows.length : r.prevRank);

  const shown = after.slice(3);
  const top3 = after.slice(0, 3);
  const now = (r: BoardRow) => Math.round(score(r, false) + (score(r, true) - score(r, false)) * k);

  const next = () => { sfx.confirm(); onClose(); send('game:backToRoom'); };

  return (
    <main className="screen board-screen">
      <header className="row">
        <button className="btn icon" style={{ width: 40, height: 40, borderRadius: 13 }} aria-label="رجوع" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="col grow" style={{ gap: 0, lineHeight: 1.2, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 24 }}>ترتيب القعدة</span>
          <span style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name} · {AR(b.played.length)} ألعاب</span>
        </div>
        {b.played.length > 0 && (
          <button className="btn icon" style={{ width: 40, height: 40, borderRadius: 13 }} aria-label="شغّل التحديث" onClick={play}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 103-6.700L3 8M3 3v5h5" /></svg>
          </button>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="card flat col center" style={{ padding: 22, gap: 8 }}>
          <Trophy size={56} />
          <span style={{ fontWeight: 800, lineHeight: 1.7, textAlign: 'center' }}>لسه محدش خلّص لعبة هنا.<br />أول ما لعبة تخلص النقط بتظهر هنا.</span>
        </div>
      ) : (
        <>
          {/* filter tabs: all games, or one game's points only */}
          <div className="board-tabs" role="tablist" aria-label="تصفية الترتيب">
            {[{ name: 'الكل', color: '#FFD23F' }, ...gameIds.map((id) => ({ name: gameOf(id)?.name ?? id, color: gameOf(id)?.color ?? '#999' }))].map((x, i) => (
              <button key={x.name} role="tab" aria-selected={tab === i} className={`tab-pill${tab === i ? ' on' : ''}`} onClick={() => { sfx.soft(); setTab(i); }}>
                <i style={{ background: x.color }} />{x.name}
              </button>
            ))}
          </div>

          {/* podium: 1st in the middle with the crown; each step holds the rank and the points */}
          <section className="podium">
            {[1, 0, 2].map((i) => {
              const r = top3[i];
              if (!r) return <div key={i} />;
              const pop = tab === 0 ? ease((t - 1.3 - i * 0.12) / 0.5) : 1;
              return (
                <div key={r.id} className={`pod-col${r.inRoom ? '' : ' away'}`}>
                  {i === 0 && <svg className="pod-bob" width="30" height="22" viewBox="0 0 26 22" aria-hidden="true"><path d="M2 19L4 6l6 6 3-9 3 9 6-6 2 13z" fill="#FFD23F" stroke="#111" strokeWidth="2.500" strokeLinejoin="round" /></svg>}
                  <Character id={r.avatar} size={i === 0 ? 62 : 50} />
                  <span className="pod-name">{r.id === room.youId ? 'إنت' : r.name}</span>
                  <div className="pod-step" style={{ height: Math.round(STEP[i].h * (0.3 + 0.7 * pop)), background: STEP[i].bg }}>
                    <span className="display" style={{ fontSize: 22, lineHeight: 1.1 }}>{AR(i + 1)}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 900 }}>{AR(now(r))} نقطة</span>
                  </div>
                </div>
              );
            })}
          </section>

          {shown.length > 0 && (
            <section className="board-list" style={{ height: 12 + RH * shown.length }}>
              {shown.map((r, i) => {
                const newI = i + 3, oldI = oldIndex(r);
                const fromTop = Math.min(oldI, 8) - 3;
                const top = 6 + RH * (tab === 0 ? fromTop + (i - fromTop) * k : i);
                const mv = tab === 0 ? oldI - newI : 0;
                const mx = Math.max(12, ...gameIds.map((id) => r.byGame[id] ?? 0));
                return (
                  <div key={r.id} className={`board-row${r.inRoom ? '' : ' away'}`} style={{ top, borderBottom: i < shown.length - 1 ? '2px solid rgba(17,17,17,.08)' : 0 }}>
                    <span className="display" style={{ width: 22, textAlign: 'center', fontSize: 17 }}>{AR(newI + 1)}</span>
                    <Character id={r.avatar} size={30} />
                    <span style={{ fontWeight: 900, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.id === room.youId ? 'إنت' : r.name}</span>
                    {r.prevRank !== null && mv !== 0 && <span style={{ fontSize: 11, fontWeight: 900, color: mv > 0 ? '#1F9E6A' : '#E2433B', opacity: clamp((t - 1.2) / 0.3) }}>{mv > 0 ? '▲' : '▼'}{AR(Math.abs(mv))}</span>}
                    {!r.inRoom && <span className="muted" style={{ fontSize: 11 }}>خرج</span>}
                    <span className="mini-bars" aria-hidden="true">
                      {gameIds.map((id, gi) => (
                        <i key={id} style={{ height: Math.round(6 + (14 * (r.byGame[id] ?? 0)) / mx), background: tab === 0 || tab - 1 === gi ? gameOf(id)?.color ?? '#999' : '#eee' }} />
                      ))}
                    </span>
                    <span className="display num" style={{ width: 44, textAlign: 'left', fontSize: 17 }}>{AR(now(r))}</span>
                  </div>
                );
              })}
            </section>
          )}

          {/* games played: name + winner, newest last */}
          <div className="col" style={{ gap: 4 }}>
            <span className="label" style={{ fontSize: 12 }}>الألعاب اللي اتلعبت</span>
            <div className="played-pills">
              {b.played.map((p, i) => (
                <span key={p.n} className="played-pill" style={{ opacity: i === b.played.length - 1 ? clamp((t - 0.1) / 0.3) : 1 }}>
                  <i style={{ background: gameOf(p.game)?.color ?? '#999' }} />{gameOf(p.game)?.name ?? p.game} · {p.winner}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="col push" style={{ gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, textAlign: 'center', opacity: 0.8 }}>كل لعبة بتدّي نقط بالمركز: الأول ١٠ · التاني ٧ · التالت ٥ · الباقي ٢ · في الفرق الكسبانين ياخدوا ٨</span>
        {auto && isHost ? (
          <button className="btn big full" style={{ height: 58, fontSize: 22, boxShadow: '0 6px 0 #4D9DFF' }} onClick={next}>اختار اللعبة الجاية</button>
        ) : (
          <>
            {auto && <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف يختار اللعبة الجاية</span>}
            <button className="btn full" style={{ height: 54 }} onClick={onClose}>رجوع</button>
          </>
        )}
      </div>
    </main>
  );
}
