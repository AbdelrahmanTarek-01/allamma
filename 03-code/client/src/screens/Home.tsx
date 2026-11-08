import { useEffect, useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { GameTile } from '../components/GameTile';
import { MuteButton, Sheet } from '../components/ui';
import { AR, send, socket, toast, useStore, type LobbyRoom } from '../net';
import { sfx } from '../sound';

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lobby, setLobby] = useState<LobbyRoom[] | null>(null); // null = still loading

  // public rooms: one request (also subscribes us to pushes), then live updates until we leave the screen
  useEffect(() => {
    const onUpdate = (list: LobbyRoom[]) => setLobby(list);
    socket.on('lobby:update', onUpdate);
    send('lobby:list').then((res) => setLobby(res.ok ? (res.rooms as LobbyRoom[]) : []));
    return () => {
      socket.off('lobby:update', onUpdate);
      if (socket.connected) socket.emit('lobby:leave', {}, () => {});
    };
  }, []);

  const join = async (c: string) => {
    if (c.trim().length < 4) return toast('اكتب كود القعدة كامل');
    setBusy(true);
    await send('room:join', { code: c.trim().toUpperCase() });
    setBusy(false);
  };
  const create = async () => {
    setBusy(true);
    await send('room:create');
    setBusy(false);
  };
  const quick = async () => {
    setBusy(true);
    await send('lobby:quick');
    setBusy(false);
  };

  return (
    <main className="screen">
      <header className="row between">
        <span className="logo">اللمّة<i>.</i></span>
        <div className="row" style={{ gap: 8 }}>
          <MuteButton />
          <button className="float" onClick={onEditProfile} aria-label="غيّر اسمك أو شخصيتك" style={{ border: 0, background: 'none', padding: 0 }}>
            <Character id={profile!.avatar} size={54} />
          </button>
        </div>
      </header>

      <button className="btn big full" disabled={busy} onClick={quick}>العب مع ناس</button>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn yellow grow" disabled={busy} onClick={create}><Plus /> اعمل قعدة</button>
        <button className="btn grow" disabled={busy} onClick={() => setCodeOpen(true)}>ادخل بكود</button>
      </div>

      <h2 className="display" style={{ fontSize: 26 }}>قعدات مفتوحة</h2>
      <div className="col" style={{ gap: 12 }}>
        {lobby === null && Array.from({ length: 3 }, (_, i) => <div key={i} className="sk card-sk" style={{ height: 78, animationDelay: `${i * 160}ms` }} />)}
        {lobby?.length === 0 && (
          <div className="card flat center" style={{ padding: 18, fontWeight: 800, lineHeight: 1.7 }}>مفيش قعدات مفتوحة دلوقتي، اعمل واحدة وخلّي الناس تيجي</div>
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

      <h2 className="display" style={{ fontSize: 26 }}>الألعاب</h2>
      <div className="grid2 stagger">
        {GAMES.map((g, i) => (
          <GameTile key={g.id} g={g} style={{ animationDelay: `${i * 60}ms` }} onClick={() => { sfx.tap(); if (g.ready) create(); else toast(`${g.name} جاية قريب`); }} />
        ))}
      </div>

      {codeOpen && (
        <Sheet title="ادخل بكود" onClose={() => setCodeOpen(false)}>
          <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); join(code); }}>
            <input className="input code" aria-label="كود القعدة" placeholder="الكود" autoFocus value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
            <button className="btn black" disabled={busy} type="submit">يلا</button>
          </form>
        </Sheet>
      )}
    </main>
  );
}
