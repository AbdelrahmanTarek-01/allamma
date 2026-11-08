import { useEffect, useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { GameTile } from '../components/GameTile';
import { MuteButton, Sheet } from '../components/ui';
import { AR, send, socket, toast, useStore, type LobbyRoom } from '../net';
import { sfx } from '../sound';
import { OpenRooms } from './OpenRooms';

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lobby, setLobby] = useState<LobbyRoom[] | null>(null); // null = still loading

  const fetchList = async () => {
    const res = await send('lobby:list'); // also subscribes this socket to live pushes
    return res.ok ? (res.rooms as LobbyRoom[]) : [];
  };
  // the public-rooms count on the row (and the list on its screen) stay live until we leave Home
  useEffect(() => {
    const onUpdate = (list: LobbyRoom[]) => setLobby(list);
    socket.on('lobby:update', onUpdate);
    fetchList().then(setLobby);
    return () => {
      socket.off('lobby:update', onUpdate);
      if (socket.connected) socket.emit('lobby:leave', {}, () => {});
    };
  }, []);

  const refresh = async () => {
    setLobby(null); // skeleton cards for at least half a second, so the refresh is visible
    const [list] = await Promise.all([fetchList(), new Promise((r) => setTimeout(r, 500))]);
    setLobby(list);
  };

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

  if (roomsOpen) return <OpenRooms lobby={lobby} onRefresh={refresh} onClose={() => setRoomsOpen(false)} />;

  const count = lobby?.length ?? null;
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

      {/* one compact row instead of the whole list: the list lives on its own screen */}
      <button className="tile" onClick={() => { sfx.tap(); setRoomsOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <span className="display" style={{ fontSize: 19 }}>قعدات مفتوحة</span>
        {count === null ? <span className="sk" style={{ width: 34, height: 22, borderRadius: 99 }} />
          : count > 0 ? <span className="chip pink">{AR(count)}</span>
          : <span className="muted">مفيش دلوقتي</span>}
        <span className="grow" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>

      <h2 className="display" style={{ fontSize: 26 }}>الألعاب</h2>
      <div className="grid2 stagger">
        {GAMES.map((g, i) => (
          <GameTile key={g.id} g={g} help style={{ animationDelay: `${i * 60}ms` }} onClick={() => { sfx.tap(); if (g.ready) create(); else toast(`${g.name} جاية قريب`); }} />
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
