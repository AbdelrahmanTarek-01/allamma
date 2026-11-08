import { useEffect, useState } from 'react';
import { Character, GAMES, Plus, Trophy } from '../components/art';
import { GameTile } from '../components/GameTile';
import { IdeasSheet } from '../components/IdeasSheet';
import { MuteButton, Sheet } from '../components/ui';
import { AR, send, socket, toast, useStore, type LobbyRoom } from '../net';
import { sfx } from '../sound';
import { OpenRooms } from './OpenRooms';

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
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

  if (roomsOpen) return <OpenRooms lobby={lobby} onRefresh={refresh} onClose={() => setRoomsOpen(false)} />;

  const count = lobby?.length ?? null;
  return (
    <main className="screen">
      <header className="row between">
        <span className="logo">اللمّة<i>.</i></span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setBoardOpen(true)} aria-label="الترتيب"><Trophy /> الترتيب</button>
          <MuteButton />
          <button className="float" onClick={onEditProfile} aria-label="غيّر اسمك أو شخصيتك" style={{ border: 0, background: 'none', padding: 0 }}>
            <Character id={profile!.avatar} size={54} />
          </button>
        </div>
      </header>

      {/* the one thing to do: open a lounge. Joining by code and the open lounges are one row below it */}
      <button className="btn big full" disabled={busy} onClick={create}><Plus /> اعمل قعدة</button>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn grow" disabled={busy} onClick={() => setCodeOpen(true)}>ادخل بكود</button>
        <button className="btn grow" onClick={() => { sfx.tap(); setRoomsOpen(true); }}>
          قعدات مفتوحة
          {count === null ? <span className="sk" style={{ width: 26, height: 20, borderRadius: 99 }} />
            : count > 0 ? <span className="chip" style={{ fontSize: 13, background: 'var(--green)' }}>{AR(count)}</span> : null}
        </button>
      </div>

      <h2 className="display" style={{ fontSize: 26 }}>الألعاب</h2>
      <div className="grid2 stagger">
        {GAMES.map((g, i) => (
          <GameTile key={g.id} g={g} help style={{ animationDelay: `${i * 60}ms` }} onClick={() => { sfx.tap(); if (g.ready) create(); else toast(`${g.name} جاية قريب`); }} />
        ))}
        {/* the last card: what we are cooking next, with a vote per idea */}
        <button className="tile soon-card" style={{ animationDelay: `${GAMES.length * 60}ms` }} onClick={() => { sfx.card(); setIdeasOpen(true); }}>
          <span className="soon-squares" aria-hidden="true">
            <i style={{ background: '#FF4F9A', transform: 'rotate(-8deg)' }} /><i style={{ background: '#3DDC97', transform: 'rotate(6deg)' }} /><i style={{ background: '#4D9DFF', transform: 'rotate(-4deg)' }} />
          </span>
          <span className="display" style={{ fontSize: 20, marginTop: 10 }}>بنحضّر ٧ كمان</span>
          <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: '#fff' }}>شوف الأفكار وصوّت للي عاوزها</span>
        </button>
      </div>

      {ideasOpen && <IdeasSheet onClose={() => setIdeasOpen(false)} />}
      {boardOpen && (
        <Sheet title="الترتيب" onClose={() => setBoardOpen(false)}>
          <div className="col center" style={{ gap: 10, padding: '10px 0 6px' }}>
            <Trophy size={64} />
            <span className="display" style={{ fontSize: 26 }}>قريباً</span>
            <span style={{ fontWeight: 700, textAlign: 'center', lineHeight: 1.6 }}>الترتيب العام بين كل اللاعيبة جاي قريب.<br />لحد وقتها كل قعدة ليها ترتيبها الخاص (الكاس اللي فوق في القعدة).</span>
          </div>
        </Sheet>
      )}
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
