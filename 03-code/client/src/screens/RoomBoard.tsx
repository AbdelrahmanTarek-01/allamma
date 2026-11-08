import { useState } from 'react';
import { Character, GAMES, Trophy } from '../components/art';
import { useCountUp } from '../components/ui';
import { AR, send, type BoardRow, type RoomView } from '../net';
import { sfx } from '../sound';

const gameOf = (id: string) => GAMES.find((g) => g.id === id);
const POD = [{ h: 92, color: '#FFD23F' }, { h: 66, color: '#4D9DFF' }, { h: 50, color: '#FF8A3D' }]; // 1st, 2nd, 3rd

/** "▲ ٢" / "▼ ١" since the previous game; nothing for a first appearance or no change. */
function Change({ now, row }: { now: number; row: BoardRow }) {
  if (row.prevRank === null) return null;
  const d = row.prevRank - now; // positive: climbed
  if (d === 0) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  return <span className="gain chip" style={{ background: d > 0 ? 'var(--green)' : 'var(--red)', color: d > 0 ? '#111' : '#fff', fontSize: 11.5, padding: '0 8px', animationDelay: '.9s' }}>{d > 0 ? '▲' : '▼'} {AR(Math.abs(d))}</span>;
}

function Points({ value, from, size }: { value: number; from: number; size: number }) {
  const shown = useCountUp(value, from, 1000);
  return <span className="display num" style={{ fontSize: size }}>{AR(shown)}</span>;
}

/**
 * "ترتيب القعدة": placement points across every game played in this lounge (01-brainstorm/room-leaderboard.md).
 * Opened from the trophy in the lounge header, and shown automatically after each game ends (`auto`):
 * then the totals count up from before the game, the rank-change arrows pop in, and the host gets "اختار اللعبة الجاية".
 */
export function RoomBoard({ room, auto, onClose }: { room: RoomView; auto: boolean; onClose: () => void }) {
  const b = room.board;
  const isHost = room.hostId === room.youId;
  const [filter, setFilter] = useState<'all' | string>('all');

  const value = (r: BoardRow) => (filter === 'all' ? r.total : r.byGame[filter] ?? 0);
  // rows come sorted by total; a game tab re-sorts by that game's points only
  const sorted = filter === 'all' ? b.rows : [...b.rows].sort((x, y) => value(y) - value(x));
  const from = (r: BoardRow) => (filter === 'all' && auto ? r.total - r.gain : value(r)); // the count-up starts before the last game
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const max = Math.max(1, ...sorted.map((r) => r.total));
  const nowRank = (r: BoardRow) => b.rows.findIndex((x) => x.id === r.id);
  const showChange = filter === 'all';

  const next = () => { sfx.confirm(); onClose(); send('game:backToRoom'); };

  return (
    <main className="screen board-screen">
      <header className="row">
        <button className="btn icon" aria-label="رجوع" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <h1 className="display grow" style={{ fontSize: 26 }}>ترتيب القعدة</h1>
        <Trophy size={34} />
      </header>

      {b.rows.length === 0 ? (
        <div className="card flat col center" style={{ padding: 22, gap: 8 }}>
          <Trophy size={56} />
          <span style={{ fontWeight: 800, lineHeight: 1.7, textAlign: 'center' }}>لسه محدش خلّص لعبة هنا.<br />أول ما لعبة تخلص النقط بتظهر هنا.</span>
        </div>
      ) : (
        <>
          {/* filter tabs: all games, or one game's points only */}
          <div className="board-tabs" role="tablist" aria-label="تصفية الترتيب">
            <button role="tab" aria-selected={filter === 'all'} className={`chip${filter === 'all' ? ' dark' : ''}`} onClick={() => { sfx.soft(); setFilter('all'); }}>الكل</button>
            {b.games.map((g) => (
              <button key={g} role="tab" aria-selected={filter === g} className={`chip${filter === g ? ' dark' : ''}`} onClick={() => { sfx.soft(); setFilter(g); }}>{gameOf(g)?.name ?? g}</button>
            ))}
          </div>

          {/* podium: 1st in the middle with the crown */}
          <div className="podium">
            {[1, 0, 2].map((i) => {
              const r = podium[i];
              if (!r) return <span key={i} className="pod-col" />;
              return (
                <div key={`${filter}-${r.id}`} className={`pod-col${i === 0 ? ' first' : ''}${r.inRoom ? '' : ' away'}`} style={{ animationDelay: `${(i === 0 ? 3 : i) * 120}ms` }}>
                  {i === 0 && <svg className="crown-drop pod-crown" width="38" height="28" viewBox="-14 -16 28 18" aria-hidden="true"><path d="M-11 0l-2-12 7 5 6-9 6 9 7-5-2 12z" fill="#FFD23F" stroke="#111" strokeWidth="1.800" strokeLinejoin="round" /></svg>}
                  <Character id={r.avatar} size={i === 0 ? 74 : 58} />
                  <span className="pod-name">{r.id === room.youId ? 'إنت' : r.name}</span>
                  <Points value={value(r)} from={from(r)} size={i === 0 ? 26 : 21} />
                  {showChange && <Change now={nowRank(r)} row={r} />}
                  <span className="pod-step" style={{ height: POD[i].h, background: POD[i].color }}>{AR(i + 1)}</span>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="card col stagger" style={{ padding: 8, gap: 4 }}>
              {rest.map((r, k) => (
                <div key={`${filter}-${r.id}`} className={`board-row${r.inRoom ? '' : ' away'}`}>
                  <span className="rank-n">{AR(k + 4)}</span>
                  <Character id={r.avatar} size={38} />
                  <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.id === room.youId ? 'إنت' : r.name}{!r.inRoom && <span className="muted" style={{ marginInlineStart: 6, fontSize: 11 }}>خرج</span>}
                    </span>
                    {/* small per-game bars, one segment per game in the game's colour */}
                    <span className="mini-bars" aria-hidden="true">
                      {b.games.map((g) => (r.byGame[g] ? <i key={g} style={{ width: `${(r.byGame[g] / max) * 100}%`, background: gameOf(g)?.color ?? '#999' }} /> : null))}
                    </span>
                  </div>
                  {showChange && <Change now={nowRank(r)} row={r} />}
                  <Points value={value(r)} from={from(r)} size={24} />
                </div>
              ))}
            </div>
          )}

          {/* games played: name + winner, newest last */}
          <div className="col" style={{ gap: 4 }}>
            <span className="label" style={{ fontSize: 12.5 }}>الألعاب اللي اتلعبت</span>
            <div className="played-strip">
              {b.played.map((g) => (
                <div key={g.n} className="played-card" style={{ ['--gc' as any]: gameOf(g.game)?.color ?? '#999' }}>
                  <span className="label" style={{ fontSize: 11.5 }}>{AR(g.n)} · {gameOf(g.game)?.name ?? g.game}</span>
                  <span style={{ fontWeight: 900, fontSize: 13.5 }}>🏆 {g.winner}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="col push" style={{ gap: 8 }}>
        {auto && isHost ? (
          <button className="btn big full" onClick={next}>اختار اللعبة الجاية</button>
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
