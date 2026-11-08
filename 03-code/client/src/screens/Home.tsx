import { useEffect, useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { MuteButton } from '../components/ui';
import { AR, send, socket, toast, useStore, type LobbyRoom } from '../net';
import { sfx } from '../sound';

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
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

  const join = async (c = code) => {
    if (c.trim().length < 4) return toast('اكتب كود الأوضة كامل');
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

      <section className="card col" style={{ gap: 10 }}>
        <label htmlFor="code" className="label" style={{ fontSize: 17 }}>معاك كود؟ ادخل على طول</label>
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); join(); }}>
          <input id="code" className="input code" placeholder="الكود" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
          <button className="btn black" disabled={busy} type="submit">يلا</button>
        </form>
        <button className="btn yellow full" disabled={busy} onClick={create}><Plus /> اعمل أوضة جديدة</button>
      </section>

      <h2 className="display" style={{ fontSize: 28 }}>قعدات مفتوحة</h2>
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

      <h2 className="display" style={{ fontSize: 28 }}>هتلعبوا إيه النهارده؟</h2>

      <div className="grid2 stagger">
        {GAMES.map((g, i) => (
          <button
            key={g.id}
            className={`tile${g.ready ? '' : ' off'}`}
            style={{ height: 134, animationDelay: `${i * 60}ms` }}
            onClick={() => { sfx.tap(); if (g.ready) create(); else toast(`${g.name} جاية قريب`); }}
          >
            {!g.ready && <span className="chip badge">قريباً</span>}
            <span className="icontile" style={{ background: g.color }}>{g.icon}</span>
            <span className="display" style={{ fontSize: 21, marginTop: 4 }}>{g.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{g.tagline}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
