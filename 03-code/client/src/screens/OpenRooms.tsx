import { useEffect, useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { levelOf } from '../games/difficulty';
import { AR, joinRoom, send, type LobbyRoom } from '../net';
import { sfx } from '../sound';
import { useBackEntry } from '../useBackEntry';

/**
 * "القعدات المفتوحة" (canvas OpenRoomsV2): the public lounges as cards. Tapping a card SELECTS it (pressed + a check badge), tapping again
 * deselects, full lounges can't be selected. The big button follows the selection: none = quick play, open = enter it, ask mode = send a request.
 * Closes with the back button or the back gesture.
 */
export function OpenRooms({ lobby, onClose }: { lobby: LobbyRoom[] | null; onRefresh?: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const back = useBackEntry('allammaRooms', onClose);

  // a selected lounge that filled up or disappeared is no longer selected
  const chosen = lobby?.find((r) => r.code === sel && !r.full) ?? null;
  useEffect(() => { if (sel && !chosen) setSel(null); }, [sel, chosen]);

  // leaving for a lounge: drop our history entry first so the back gesture isn't left with a dead step
  const go = async (fn: () => Promise<unknown>) => {
    back();
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const waiting = (lobby ?? []).filter((r) => r.status === 'waiting' && !r.full && !r.ask).length;
  const quick = async () => {
    setBusy(true);
    const r = await send('lobby:quick'); // on NO_ROOMS we stay here (the toast says why) and nothing was created
    setBusy(false);
    if (r.ok) back();
  };
  const createPublic = () => go(async () => {
    const r = await send('room:create');
    if (r.ok) await send('room:privacy', { privacy: 'public' });
  });
  const act = () => {
    if (chosen) { sfx.confirm(); return go(() => joinRoom(chosen.code)); }
    return quick();
  };
  const noQuick = !chosen && lobby !== null && waiting === 0;
  const shadow = !chosen ? '#FF4F9A' : chosen.ask ? '#B48CFF' : '#3DDC97';

  return (
    <main className="screen">
      <header className="row" style={{ gap: 10 }}>
        <button className="btn icon" aria-label="رجوع" onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <h1 className="display grow" style={{ fontSize: 24 }}>القعدات المفتوحة</h1>
        <span className="row" style={{ gap: 5, fontSize: 12, fontWeight: 900 }}><i className="or-live" />لايف</span>
      </header>
      <span style={{ fontSize: 13, fontWeight: 800, marginTop: -4 }}>اختار قعدة وبعدين ادخل، أو سيبها علينا</span>

      <div className="col" style={{ gap: 12, padding: '10px 4px 8px 0' }}>
        {lobby === null && Array.from({ length: 3 }, (_, i) => <div key={i} className="sk card-sk" style={{ height: 104, animationDelay: `${i * 160}ms` }} />)}

        {lobby?.length === 0 && (
          <div className="card flat col center" style={{ padding: 18, gap: 12 }}>
            <span style={{ fontWeight: 800, lineHeight: 1.7 }}>مفيش قعدات مفتوحة دلوقتي، اعمل واحدة وخلّي الناس تيجي</span>
            <button className="btn yellow" disabled={busy} onClick={createPublic}><Plus /> اعمل قعدة عامة</button>
          </div>
        )}

        {lobby?.map((r, i) => {
          const g = GAMES.find((x) => x.id === r.game) ?? GAMES[0];
          const lv = levelOf(r.difficulty as never);
          const on = sel === r.code && !r.full;
          return (
            <button
              key={r.code} className="or-card pop-in" aria-pressed={on} aria-disabled={r.full} disabled={busy}
              onClick={() => { if (r.full) { sfx.error(); return; } sfx.card(); setSel(on ? null : r.code); }}
              style={{ background: r.full ? '#ECE4C8' : on ? '#FFF3C4' : '#fff', boxShadow: on || r.full ? '0 0 0 #111' : '4px 4px 0 #111', transform: on ? 'translate(4px, 4px)' : 'none', opacity: r.full ? 0.7 : 1, animationDelay: `${i * 60}ms` }}
            >
              <div className="row" style={{ gap: 10 }}>
                <span className="icontile" style={{ background: g.color, width: 42, height: 42, borderRadius: 13, flex: 'none', filter: r.full ? 'grayscale(1)' : 'none' }}><span style={{ display: 'flex', transform: 'scale(.8)' }}>{g.icon}</span></span>
                <div className="col grow" style={{ lineHeight: 1.25, minWidth: 0 }}>
                  <span className="display" style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{g.name}</span>
                </div>
                <span className="display" style={{ fontSize: 15, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '0 10px' }}>{AR(r.players)} / {AR(r.max)}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="row" style={{ filter: r.full ? 'grayscale(1)' : 'none' }}>
                  {r.avatars.slice(0, 4).map((av, k) => <span key={k} style={{ marginInlineStart: k ? -10 : 0, display: 'flex', borderRadius: '50%', background: '#fff' }}><Character id={av} size={28} /></span>)}
                  {r.players > 4 && <span style={{ marginInlineStart: -6, fontSize: 11, fontWeight: 900, background: '#111', color: '#fff', borderRadius: 99, padding: '0 6px', alignSelf: 'center' }}>+{AR(r.players - 4)}</span>}
                </span>
                <span className="row" style={{ marginInlineStart: 'auto', gap: 5 }}>
                  {r.status === 'playing' && <span className="or-chip" style={{ background: '#FF4F9A' }}>بيلعبوا</span>}
                  {r.full
                    ? <span className="or-chip" style={{ background: '#d9d2bb' }}>مليانة</span>
                    : <span className="or-chip" style={{ background: lv.color }}>{lv.label}</span>}
                  {r.ask && !r.full && (
                    <span className="or-chip" style={{ background: '#EFE6FF', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" fill="#B48CFF" stroke="#111" strokeWidth="2.6" /></svg>بإذن
                    </span>
                  )}
                </span>
              </div>
              {on && <span className="or-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
            </button>
          );
        })}
      </div>

      <div className="col push" style={{ gap: 6 }}>
        <button className="or-act" disabled={busy || lobby === null || noQuick} style={{ boxShadow: `0 6px 0 ${shadow}` }} onClick={act}>
          <span className="display" style={{ fontSize: 23, lineHeight: 1.15 }}>{chosen ? (chosen.ask ? 'اطلب تدخل' : 'ادخل القعدة') : noQuick ? 'مفيش قعدات مستنية دلوقتي' : 'العب مع ناس'}</span>
          {chosen && <span className="or-act-room">{chosen.name}</span>}
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 800, textAlign: 'center' }}>
          {chosen ? (chosen.ask ? 'الهوست لازم يوافق الأول' : 'دوس تاني على القعدة عشان تلغي الاختيار') : noQuick ? 'اعمل قعدة وخلّيها عامة، والناس هتدخلك' : 'بندخّلك أول قعدة مفتوحة فيها مكان'}
        </span>
      </div>
    </main>
  );
}
