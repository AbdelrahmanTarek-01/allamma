import { useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { AR, send, type LobbyRoom } from '../net';
import { sfx } from '../sound';
import { useBackEntry } from '../useBackEntry';

/**
 * "القعدات المفتوحة": the public lounges as cards, a refresh button, quick play pinned at the bottom,
 * and an empty state that offers to open a public lounge. Closes with the back button or the back gesture.
 */
export function OpenRooms({ lobby, onRefresh, onClose }: { lobby: LobbyRoom[] | null; onRefresh: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const back = useBackEntry('allammaRooms', onClose);

  // leaving for a lounge: drop our history entry first so the back gesture isn't left with a dead step
  const go = async (fn: () => Promise<unknown>) => {
    back();
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const join = (code: string) => go(() => send('room:join', { code }));
  // the server joins an existing waiting room and never creates one; NO_ROOMS (a race: the last room just filled) toasts the same message via send()
  const waiting = (lobby ?? []).filter((r) => r.status === 'waiting').length;
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

  return (
    <main className="screen">
      <header className="row">
        <button className="btn icon" aria-label="رجوع" onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <h1 className="display grow" style={{ fontSize: 26 }}>القعدات المفتوحة</h1>
        <button className="btn icon" aria-label="حدّث القايمة" disabled={lobby === null} onClick={() => { sfx.select(); onRefresh(); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 11-2.6-5.9" /><path d="M20 4v5h-5" /></svg>
        </button>
      </header>

      <div className="col" style={{ gap: 12 }}>
        {lobby === null && Array.from({ length: 3 }, (_, i) => <div key={i} className="sk card-sk" style={{ height: 78, animationDelay: `${i * 160}ms` }} />)}

        {lobby?.length === 0 && (
          <div className="card flat col center" style={{ padding: 18, gap: 12 }}>
            <span style={{ fontWeight: 800, lineHeight: 1.7 }}>مفيش قعدات مفتوحة دلوقتي، اعمل واحدة وخلّي الناس تيجي</span>
            <button className="btn yellow" disabled={busy} onClick={createPublic}><Plus /> اعمل قعدة عامة</button>
          </div>
        )}

        {lobby?.map((r, i) => {
          const g = GAMES.find((x) => x.id === r.game) ?? GAMES[0];
          return (
            <button key={r.code} className="tile pop-in" disabled={busy} onClick={() => join(r.code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, animationDelay: `${i * 50}ms` }}>
              <Character id={r.host.avatar} size={46} />
              <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                <span className="display" style={{ fontSize: 19, overflowWrap: 'anywhere' }}>{r.name}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.host.name} · {g.name}</span>
              </span>
              <span className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
                <span className="chip">{AR(r.players)}/{AR(r.max)}</span>
                {r.status === 'playing' && <span className="chip pink">بيلعبوا دلوقتي</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="dock push">
        <button className="btn big full" disabled={busy || lobby === null || waiting === 0} onClick={quick}>{lobby !== null && waiting === 0 ? 'مفيش قعدات مستنية دلوقتي' : 'العب مع ناس'}</button>
        {lobby !== null && waiting === 0 && <span className="muted" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800 }}>اعمل قعدة وخلّيها عامة، والناس هتدخلك</span>}
      </div>
    </main>
  );
}
