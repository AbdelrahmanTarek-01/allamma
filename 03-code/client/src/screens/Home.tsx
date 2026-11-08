import { useEffect, useRef, useState } from 'react';
import { Character, GAMES, Plus, Trophy } from '../components/art';
import { GameSheet, MIN } from '../components/GameSheet';
import { IdeaIcon, IdeasSheet } from '../components/IdeasSheet';
import { MuteButton, Sheet } from '../components/ui';
import { AR, send, socket, toast, useStore, type LobbyRoom } from '../net';
import { sfx } from '../sound';
import { OpenRooms } from './OpenRooms';

/** "لعبة الليلة" spotlight (canvas HomeV4): game, card colour and one-line hook, in the canvas order. No durations: no game defines a real one. */
const SPOT: { id: string; bg: string; hook: string }[] = [
  { id: 'spy', bg: '#FF4F9A', hook: 'واحد فيكم مش عارف إنتوا فين · اكشفوه قبل ما يكشفكم' },
  { id: 'map', bg: '#3DDC97', hook: 'حط الدبوس على الخريطة · الأقرب ياخد النقط' },
  { id: 'quiz', bg: '#B48CFF', hook: 'لوحة أسئلة بين فريقين · واسرق سؤال التاني' },
  { id: 'words', bg: '#9ADFFF', hook: 'تلميح واحد يلم كلمات كتير · وبعّد عن القنبلة' },
  { id: 'auction', bg: '#FF8A3D', hook: 'زايد على السؤال قبل ما تشوفه · على قد ثقتك' },
  { id: 'draw', bg: '#FFF3C4', hook: 'ارسم وصحابك يخمّنوا · وفي الآخر معرض الليلة' },
  { id: 'wave', bg: '#4D9DFF', hook: 'اقروا أفكار بعض على المقياس' }
];
const ROTATE_MS = 4200;
const PAUSE_AFTER_TAP_MS = 6000;
/** "يا" + the name only when it is written in Arabic letters, otherwise "يا نجم". */
const nameOrStar = (n: string) => (/^[\u0600-\u06FF\s]+$/.test(n.trim()) && n.trim() ? n.trim() : 'نجم');

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [sheetGame, setSheetGame] = useState<string | null>(null); // the tapped game tile's sheet
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
  // the big button sends nothing (default game); a game tile sends its id so the lounge opens with that game selected
  const create = async (game?: string) => {
    setBusy(true);
    await send('room:create', game ? { game } : undefined);
    setBusy(false);
  };

  // every hook lives above this early return (a hook after it crashes with "rendered fewer hooks" when the open-rooms screen shows)
  const railRef = useRef<HTMLDivElement>(null);
  // the live list is pushed (lobby:update); this is the safety net: a re-fetch right after a reconnect (the server forgot our subscription) and every 10 s while the open-rooms screen is up
  useEffect(() => {
    const refetch = () => fetchList().then(setLobby);
    const onConnect = () => setTimeout(refetch, 600); // after the hello of the new connection
    socket.on('connect', onConnect);
    const iv = roomsOpen ? setInterval(refetch, 10000) : null;
    return () => { socket.off('connect', onConnect); if (iv) clearInterval(iv); };
  }, [roomsOpen]);
  // the spotlight: auto-rotates every 4.2 s; a tap on a dot pauses it for 6 s; paused while the tab is hidden; no auto-rotate with reduced motion
  const [spot, setSpot] = useState(0);
  const touched = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const iv = setInterval(() => {
      if (document.hidden || Date.now() - touched.current < PAUSE_AFTER_TAP_MS) return;
      setSpot((i) => (i + 1) % SPOT.length);
    }, ROTATE_MS);
    return () => clearInterval(iv);
  }, []);
  // first Home visit only: the rail nudges ~90px and back once, so people see there is more to swipe (skipped with reduced motion)
  useEffect(() => {
    let seen = true;
    try { seen = !!localStorage.getItem('allamma.railHint'); if (!seen) localStorage.setItem('allamma.railHint', '1'); } catch { /* blocked storage: no nudge */ }
    if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t1 = setTimeout(() => railRef.current?.scrollTo({ left: -90, behavior: 'smooth' }), 900); // RTL: toward the end is negative
    const t2 = setTimeout(() => railRef.current?.scrollTo({ left: 0, behavior: 'smooth' }), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (roomsOpen) return <OpenRooms lobby={lobby} onRefresh={refresh} onClose={() => setRoomsOpen(false)} />;

  const count = lobby?.length ?? null;
  return (
    <main className="home3">
      <header className="row" style={{ gap: 8 }}>
        <span className="logo" style={{ fontSize: 38, lineHeight: 1 }}>اللمّة<i>.</i></span>
        <div className="row" style={{ gap: 8, marginInlineStart: 'auto' }}>
          <button className="h3-btn" onClick={() => setBoardOpen(true)} aria-label="الترتيب"><Trophy size={28} /></button>
          <MuteButton bare card />
          <button onClick={onEditProfile} aria-label="غيّر اسمك أو شخصيتك" style={{ border: 0, background: 'none', padding: 0, display: 'flex' }}>
            <span style={{ display: 'flex', borderRadius: '50%', boxShadow: '0 0 0 2.5px #111', background: '#fff' }}><Character id={profile!.avatar} size={42} /></span>
          </button>
        </div>
      </header>

      {/* greeting, then the spotlight card fills the leftover height */}
      <span className="display h3-hello">{new Date().getHours() < 12 ? 'صباح الفل' : 'مساء الفل'} يا {nameOrStar(profile!.name)}</span>
      {(() => {
        const cur = SPOT[spot];
        const g = GAMES.find((x) => x.id === cur.id)!;
        return (
          <section className="h3-spot" style={{ background: cur.bg }} onClick={() => { sfx.card(); setSheetGame(cur.id); }}>
            <span aria-hidden="true" className="h3-spot-dots" />
            <span aria-hidden="true" className="h3-spot-circle" />
            <div className="row between" style={{ position: 'absolute', top: 14, right: 14, left: 14 }}>
              <span className="h3-spot-tag">لعبة الليلة</span>
              <span className="row" style={{ gap: 5 }}>
                {SPOT.map((x, k) => (
                  <button key={x.id} aria-label={GAMES.find((y) => y.id === x.id)?.name} className="h3-dot" style={{ width: k === spot ? 22 : 9, background: k === spot ? '#111' : '#fff' }}
                    onClick={(e) => { e.stopPropagation(); touched.current = Date.now(); sfx.soft(); setSpot(k); }} />
                ))}
              </span>
            </div>
            <div key={cur.id} className="h3-spot-body">
              <span className="h3-spot-icon"><span className="icontile" style={{ background: g.color, width: 50, height: 50, borderRadius: 15 }}>{g.icon}</span></span>
              <span className="display" style={{ fontSize: 34, lineHeight: 1.15 }}>{g.name}</span>
              <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.5, maxWidth: 250 }}>{cur.hook}</span>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <span className="h3-pill">{AR(MIN[cur.id] ?? 2)}+ لاعيبة</span>
                <span className="h3-play">العبها</span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* actions in the thumb zone */}
      <section className="col" style={{ gap: 12, flex: 'none' }}>
        <button className="h3-create" disabled={busy} onClick={() => create()}>
          <span className="h3-create-ic"><Plus /></span>
          <span className="col" style={{ lineHeight: 1.2, textAlign: 'right' }}>
            <b className="display" style={{ fontSize: 26 }}>اعمل قعدة</b>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>وابعت اللينك لصحابك</span>
          </span>
        </button>
        <div className="grid2" style={{ gap: 12 }}>
          <button className="h3-act" disabled={busy} onClick={() => setCodeOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="12" height="9" rx="2" fill="#FFD23F" stroke="#111" strokeWidth="2" /><path d="M15 13h6M18 10v6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" /></svg>ادخل بكود
          </button>
          <button className="h3-act" onClick={() => { sfx.tap(); setRoomsOpen(true); }}>
            قعدات مفتوحة
            {count === null ? <span className="sk" style={{ width: 26, height: 20, borderRadius: 99 }} /> : count > 0 ? <span className="chip" style={{ fontSize: 12, background: 'var(--green)' }}>{AR(count)}</span> : null}
          </button>
        </div>
      </section>

      {/* the games: one horizontal snap rail, ending with the coming-soon card */}
      <section className="col" style={{ gap: 10, flex: 'none' }}>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <span className="row" style={{ gap: 8 }}><span className="display" style={{ fontSize: 22 }}>الألعاب</span><span className="h3-more">٧ ألعاب · اسحب ←</span></span>
          <button className="h3-all" onClick={() => { sfx.soft(); railRef.current?.scrollTo({ left: railRef.current.scrollWidth, behavior: 'smooth' }); }}>شوف الكل</button>
        </div>
        <div className="h3-rail" ref={railRef}>
          {GAMES.map((g) => (
            <button key={g.id} className="h3-card" onClick={() => { sfx.card(); setSheetGame(g.id); }}>
              <span className="icontile" style={{ background: g.color, width: 50, height: 50, borderRadius: 15, filter: g.ready ? 'none' : 'grayscale(1)' }}>{g.icon}</span>
              <span className="display" style={{ fontSize: 15, lineHeight: 1.2 }}>{g.name}</span>
              <span className="h3-min">{g.ready ? `${AR(MIN[g.id] ?? 2)}+` : 'قريباً'}</span>
            </button>
          ))}
          <button className="h3-card h3-soon" onClick={() => { sfx.card(); setIdeasOpen(true); }}>
            <span className="soon-squares" aria-hidden="true">
              <i style={{ background: '#FF4F9A', transform: 'rotate(-12deg)' }}><IdeaIcon id="mafia" size={22} /></i>
              <i style={{ background: '#3DDC97', transform: 'translateY(-4px)' }}><IdeaIcon id="categories" size={20} /></i>
            </span>
            <span className="display" style={{ fontSize: 15, lineHeight: 1.2, color: '#FFD23F' }}>+٧ ألعاب جاية</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff' }}>صوّت للي عاوزها</span>
          </button>
        </div>
      </section>

      {sheetGame && <GameSheet gameId={sheetGame} busy={busy} onCreate={async (id) => { await create(id); setSheetGame(null); }} onClose={() => setSheetGame(null)} />}
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
