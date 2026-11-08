import { useEffect, useRef, useState } from 'react';
import { Character, SpyIcon } from '../components/art';
import { HelpButton } from '../components/HelpSheet';
import { MysteryBg } from '../components/MysteryBg';
import { Confetti, MuteButton, Sheet, Timer, useCountUp } from '../components/ui';
import { AR, send, type GameView, type PlayerView, type RoomView } from '../net';
import { buzz, gameOver, music, sfx } from '../sound';

type P = { room: RoomView; g: GameView };

const spyLabel = (n: number) => (n === 1 ? 'جاسوس واحد' : n === 2 ? 'جاسوسين' : `${AR(n)} جواسيس`);
/** "صعب ×٢": this round's difficulty and its points multiplier. */
const DIFF_NAME = { easy: 'سهل', medium: 'متوسط', hard: 'صعب', max: 'ماكس' } as const;
const diffLabel = (g: GameView) => `${DIFF_NAME[g.difficulty]} ×${AR(String(g.multiplier).replace('.', '٫'))}`;

const usePlayers = (room: RoomView) => {
  const byId = (id: string | null) => room.players.find((p) => p.id === id);
  return { byId, name: (id: string | null) => byId(id)?.name ?? '؟' };
};

/** Runs `fn` when `value` changes, but not on the first render. */
function useOnChange<T>(value: T, fn: (prev: T) => void) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) fn(prev.current);
    prev.current = value;
  }, [value]);
}

/** Shown to someone who joined while a round was running: they watch and chat, and play from the next round. */
const WATCHING = 'دخلت والجولة شغالة، هتلعب من الجولة الجاية';
function WatchBanner({ g }: { g: GameView }) {
  return g.you ? null : <div className="card flat center" style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14 }}>{WATCHING}</div>;
}

function Header({ g, title, tag }: { g: GameView; title: string; tag?: string }) {
  return (
    <header className="row between" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 0 }}>
        <div className="row" style={{ gap: 6, alignSelf: 'flex-start' }}>
          <span className="chip pink">{tag ?? `الجولة ${AR(g.round)} من ${AR(g.totalRounds)}${g.spyCount > 1 ? ` · ${spyLabel(g.spyCount)}` : ''}`}</span>
          <HelpButton gameId="spy" />
        </div>
        <span className="display" style={{ fontSize: 26 }}>{title}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <MuteButton />
        {g.endsAt && <Timer endsAt={g.endsAt} />}
      </div>
    </header>
  );
}

export function SpyGame(props: P) {
  switch (props.g.phase) {
    case 'discuss': return <Discuss {...props} />;
    case 'vote': return <Vote {...props} />;
    case 'reveal': return <Reveal {...props} />;
    case 'guess': return <Guess {...props} />;
    case 'result': return <Result {...props} />;
    default: return <Final {...props} />;
  }
}

/* ---------- discussion: role card ---------- */
function Discuss({ room, g }: P) {
  const { byId, name } = usePlayers(room);
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState(false);
  const [confirmVote, setConfirmVote] = useState(false);
  const asker = byId(g.askerId);
  const isAsker = g.askerId === room.youId;

  // "ready to vote": players toggle it, only the host actually starts the vote
  const isHost = room.hostId === room.youId;
  const readyCount = g.readyToVoteIds.length;
  const meReady = g.readyToVoteIds.includes(room.youId);
  const allReady = g.readyTotal > 0 && readyCount >= g.readyTotal;
  const readyPeople = g.readyToVoteIds.map((id) => byId(id)).filter((p): p is PlayerView => !!p).slice(0, 3);
  const notReady = Math.max(0, g.readyTotal - readyCount);
  useOnChange(allReady, () => { if (allReady && isHost) sfx.notify(); }); // the start button starts pulsing: one soft ping
  const startVote = () => {
    if (allReady) send('spy:startVote');
    else setConfirmVote(true);
  };

  useEffect(() => { sfx.start(); }, []);
  useOnChange(g.askerId, () => {
    sfx.turn();
    if (g.askerId === room.youId || g.targetId === room.youId) buzz([60, 40, 60]);
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    sfx.flip();
    if (next) setTimeout(() => sfx.stamp(), 550); // every role stamps, so the sound and buzz never give the role away
  };

  return (
    <main className="screen">
      <Header g={g} title="مين الجاسوس؟" />
      <WatchBanner g={g} />

      <div key={g.askerId} className="card flat row flash" style={{ padding: '10px 14px', boxShadow: '4px 4px 0 #111' }}>
        {asker && <span className="pop-in"><Character id={asker.avatar} size={42} /></span>}
        <span className="grow" style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.4 }}>
          دور <b style={{ fontWeight: 900 }}>{isAsker ? 'إنت' : name(g.askerId)}</b> {isAsker ? 'تسأل' : 'يسأل'} <b style={{ fontWeight: 900 }}>{g.targetId === room.youId ? 'إنت' : name(g.targetId)}</b>
        </span>
        {isAsker && <button className="btn sm yellow" onClick={() => { sfx.tap(); send('spy:nextTurn'); }}>سألت</button>}
      </div>

      {g.you ? (
        <div className="flipwrap grow" style={{ alignItems: 'center' }}>
          <button className={`flip${open ? ' open' : ''}`} onClick={toggle} aria-label={open ? 'اقفل الكارت' : 'اقلب الكارت'}>
            <div className="face front wiggle">
              <div className="tape" />
              <div className="dashed" />
              <SpyIcon size={100} />
              <span className="hand" style={{ fontSize: 30 }}>اقلب الكارت</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#4a4038', lineHeight: 1.6 }}>خبّي الموبايل الأول<br />محدش يبص على دورك</span>
            </div>
            <div className="face back">
              {/* One layout for every role: only the words differ, so a glance from the next seat tells nothing. */}
              <span className="chip card-chip">{diffLabel(g)}</span>
              <span className={`stamp${open ? ' slam' : ''}`} style={{ marginTop: 10, width: 230, boxSizing: 'border-box', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {g.you.isSpy ? 'إنت الجاسوس' : 'محقق'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#4a4038' }}>المكان</span>
              <span className="hand" style={{ fontSize: 36, lineHeight: 1.25 }}>{g.you.isSpy ? '؟؟؟' : g.you.place}</span>
              <span style={{ borderTop: '2px dashed rgba(31,42,68,.35)' }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#4a4038' }}>دورك</span>
              <span className="display" style={{ fontSize: 28, color: '#b8381f' }}>{g.you.isSpy ? 'جاسوس' : g.you.role}</span>
              <span className="push" style={{ background: '#1f2a44', color: '#fbf6ec', borderRadius: 12, padding: '10px 12px', fontSize: 13.5, fontWeight: 800, lineHeight: 1.6, textAlign: 'center', minHeight: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {g.you.isSpy ? 'اتصرف طبيعي، اسمع وخمّن المكان' : 'اسأل وجاوب، بس ما تقولش المكان صريح'}
              </span>
            </div>
          </button>
        </div>
      ) : (
        <div className="card col center grow" style={{ justifyContent: 'center' }}>
          <span className="display h2" style={{ textAlign: 'center' }}>{WATCHING}</span>
          <span className="muted">اتفرج وادردش معاهم لحد ما الجولة تخلص</span>
        </div>
      )}

      <div className="col" style={{ gap: 8 }}>
        <div className="card flat ready-bar" aria-live="polite">
          <div className="row" style={{ gap: 8 }}>
            {readyPeople.length > 0 && <span className="ready-avatars">{readyPeople.map((p) => <Character key={p.id} id={p.avatar} size={28} />)}</span>}
            <span className="grow" style={{ fontSize: 13.5, fontWeight: 900 }}>{AR(readyCount)} من {AR(g.readyTotal)} جاهزين للتصويت</span>
          </div>
          <div className="ready-track" role="progressbar" aria-valuemin={0} aria-valuemax={g.readyTotal} aria-valuenow={readyCount}>
            <span style={{ width: `${g.readyTotal ? (readyCount / g.readyTotal) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          {isHost ? (
            <>
              {g.you && <button className={`btn ready-small${meReady ? ' on' : ''}`} aria-pressed={meReady} onClick={() => send('spy:readyToVote', { ready: !meReady })}>{meReady ? 'جاهز ✓' : 'أنا جاهز'}</button>}
              <button className={`btn big grow start-vote${allReady ? ' pulse-soft' : ''}`} onClick={startVote}>ابدأ التصويت</button>
            </>
          ) : g.you ? (
            <button className={`btn grow ready-toggle${meReady ? ' on' : ''}`} aria-pressed={meReady} onClick={() => send('spy:readyToVote', { ready: !meReady })}>
              {meReady ? 'جاهز ✓ مستني الباقي' : 'جاهز للتصويت'}
            </button>
          ) : <span className="grow" />}
          <button className="btn icon sq-btn" aria-label="الأماكن الممكنة" onClick={() => { sfx.tap(); setBoard(true); }}>
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" fill="#FF4F9A" stroke="#111" strokeWidth={2} strokeLinejoin="round" /><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="#111" strokeWidth={2} /></svg>
          </button>
        </div>
        <span className="muted" style={{ textAlign: 'center', fontSize: 12.5 }}>{isHost ? 'تقدر تبدأ التصويت في أي وقت' : 'المضيف هو اللي بيبدأ التصويت'}</span>
      </div>

      {board && (
        <Sheet title="الأماكن الممكنة" onClose={() => setBoard(false)}>
          <span className="muted">المكان واحد من دول. الجاسوس بيحاول يعرفه، وانتو بتحاولوا تعرفوه هو.</span>
          <div className="grid2 stagger">
            {g.board.map((b, i) => <span key={b} className="chip" style={{ justifyContent: 'center', fontSize: 14, padding: '8px 10px', whiteSpace: 'normal', animationDelay: `${i * 30}ms` }}>{b}</span>)}
          </div>
        </Sheet>
      )}
      {confirmVote && (
        <Sheet title="نبدأ التصويت؟" onClose={() => setConfirmVote(false)}>
          <span style={{ fontWeight: 700 }}>لسه {AR(notReady)} مش جاهزين، تبدأ برضه؟</span>
          <button className="btn big full" onClick={() => { setConfirmVote(false); send('spy:startVote'); }}>أيوه، ابدأ</button>
          <button className="btn full" style={{ height: 52 }} onClick={() => setConfirmVote(false)}>لا، استنى</button>
        </Sheet>
      )}
    </main>
  );
}

/* ---------- vote ---------- */
function Vote({ room, g }: P) {
  const { byId } = usePlayers(room);
  const [picked, setPicked] = useState<string | null>(g.myVote);
  const others = g.participants.filter((id) => id !== room.youId);
  const canVote = !!g.you;
  const voted = g.myVote !== null && g.myVote === picked;
  const pct = g.participants.length ? (g.votedIds.length / g.participants.length) * 100 : 0;

  useEffect(() => { sfx.turn(); buzz(60); }, []);
  useOnChange(g.votedIds.length, (prev) => { if (g.votedIds.length > prev) sfx.pop(); });

  return (
    <main className="screen">
      <Header g={g} title="مين فيكم الجاسوس؟" tag="وقت التصويت" />
      <WatchBanner g={g} />
      <p style={{ margin: 0, fontWeight: 700 }}>دوس على اللي شاكك فيه. لو الأغلبية مسكوه، تكسبوا الجولة.</p>

      <div className="grid2 stagger">
        {others.map((id, i) => {
          const p = byId(id);
          if (!p) return null;
          const n = g.voteCounts[id] || 0;
          return (
            <button key={id} className={`tile${picked === id ? ' on' : ''}`} disabled={!canVote} aria-pressed={picked === id}
              onClick={() => { setPicked(id); sfx.select(); }} style={{ alignItems: 'center', padding: '12px 8px 10px', animationDelay: `${i * 70}ms` }}>
              {g.myVote === id && <span className="chip dark badge pop-in">صوتك</span>}
              <Character id={p.avatar} size={74} />
              <span className="display" style={{ fontSize: 20 }}>{p.name}</span>
              <span key={n} className={`chip${n > 0 ? ' bump' : ''}`}>{n === 0 ? 'محدش لسه' : `${AR(n)} ${n === 1 ? 'صوت' : 'أصوات'}`}</span>
            </button>
          );
        })}
      </div>

      <div className="col push" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span style={{ width: 120, height: 10, background: '#fff', border: '2px solid #111', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
            <span style={{ width: `${pct}%`, background: '#111', transition: 'width .3s' }} />
          </span>
          <span className="label">{AR(g.votedIds.length)} من {AR(g.participants.length)} صوّتوا</span>
        </div>
        {canVote && (
          <button className="btn big full" disabled={!picked || voted} onClick={() => { if (picked) { sfx.vote(); send('spy:vote', { targetId: picked }); } }}>
            {voted ? 'صوتك اتسجل، استنى الباقي' : picked ? `صوّت على ${byId(picked)?.name}` : 'اختار حد الأول'}
          </button>
        )}
      </div>
    </main>
  );
}

/* ---------- reveal ---------- */
function Reveal({ room, g }: P) {
  const { byId, name } = usePlayers(room);
  const [open, setOpen] = useState(false);
  const [boom, setBoom] = useState(0);
  const cardRef = useRef<HTMLButtonElement>(null);
  const accused = byId(g.accusedId);
  const counts = Object.entries(g.voteCounts).sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, ...counts.map(([, n]) => n));

  useEffect(() => {
    if (!accused) { sfx.boo(); return; }
    music.dip(4);
    sfx.drumroll(1.6);
    const t = setTimeout(() => {
      setOpen(true);
      setTimeout(() => {
        sfx.stamp();
        if (g.caught) { sfx.gotcha(); setBoom((b) => b + 1); }
        else { sfx.boo(); cardRef.current?.classList.add('shake'); }
      }, 550);
    }, 1700);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="screen dark">
      <MysteryBg />
      <Confetti fire={boom} />
      <div className="col stagger" style={{ gap: 6 }}>
        <span className="label" style={{ color: 'var(--yellow)' }}>الأصوات قالت</span>
        {counts.length === 0 && <span style={{ fontWeight: 700 }}>محدش صوّت خالص</span>}
        {counts.map(([id, n], i) => (
          <div key={id} className="row" style={{ gap: 8, animationDelay: `${i * 120}ms` }}>
            <span style={{ width: 70, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(id)}</span>
            <span className="bar"><span style={{ width: `${(n / total) * 100}%`, background: id === g.accusedId ? 'var(--pink)' : '#fff' }} /></span>
            <span style={{ width: 50, fontSize: 13, fontWeight: 800, color: 'var(--yellow)' }}>{AR(n)}</span>
          </div>
        ))}
      </div>

      <div className="flipwrap grow" style={{ alignItems: 'center' }}>
        {accused ? (
          <div className={open ? '' : 'suspense'}>
            <button ref={cardRef} className={`flip${open ? ' open' : ''}`} onClick={() => setOpen(true)} style={{ width: 290 }} aria-label="اكشف">
              <div className="face front" style={{ background: 'var(--yellow)', transform: 'none', boxShadow: '0 20px 60px -10px rgba(255,210,63,.6)', color: '#111' }}>
                <Character id={accused.avatar} size={140} />
                <span className="display" style={{ fontSize: 32 }}>{accused.name}…</span>
                <span style={{ fontWeight: 800 }}>هو ولا مش هو؟</span>
              </div>
              <div className="face back" style={{ background: '#fff', alignItems: 'center', justifyContent: 'center', textAlign: 'center', boxShadow: `0 0 0 4px ${g.caught ? 'var(--pink)' : 'var(--green)'}` }}>
                <Character id={accused.avatar} size={130} spy={!!g.caught} />
                {g.caught ? <span className={`stamp${open ? ' slam' : ''}`}>هو الجاسوس!</span> : <span className={`stamp green${open ? ' slam' : ''}`}>بريء!</span>}
                <span style={{ fontWeight: 800, color: '#111' }}>{g.caught ? 'مسكتوه يا محققين' : 'الجاسوس لسه بينكم…'}</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="card col center pop-in" style={{ color: '#111', maxWidth: 300 }}>
            <span className="display h1">الأصوات اتقسمت!</span>
            <span style={{ fontWeight: 800 }}>محدش اتمسك، والجاسوس هرب</span>
          </div>
        )}
      </div>
      <span className="muted" style={{ textAlign: 'center', color: '#fff' }}>كل الموبايلات بتشوف نفس اللحظة</span>
    </main>
  );
}

/* ---------- spy's last guess ---------- */
function Guess({ room, g }: P) {
  const { byId } = usePlayers(room);
  const [picked, setPicked] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const spy = byId(g.caughtSpyId); // the one spy the votes caught: only they guess

  useEffect(() => { if (g.guessOptions) { sfx.turn(); buzz([80, 60, 80]); } }, []);

  if (!g.guessOptions) {
    return (
      <main className="screen dark">
        <MysteryBg />
        <div className="row between"><div className="row" style={{ gap: 6 }}><span className="chip pink">الفرصة الأخيرة</span><HelpButton gameId="spy" /></div>{g.endsAt && <Timer endsAt={g.endsAt} />}</div>
        <div className="col center grow" style={{ justifyContent: 'center', gap: 12 }}>
          {spy && <span className="float"><Character id={spy.avatar} size={140} spy /></span>}
          <span className="display h1">{spy?.name} بيخمّن المكان…</span>
          <span style={{ fontWeight: 700 }}>لو خمّن صح، ياخد الجولة رغم إنكم مسكتوه</span>
          <div className="grid3" style={{ width: '100%' }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="sk" style={{ height: 54, animationDelay: `${i * 160}ms` }} />)}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen dark">
      <MysteryBg />
      <header className="row" style={{ gap: 12 }}>
        {spy && <Character id={spy.avatar} size={60} spy />}
        <div className="col grow" style={{ gap: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FF9CC5' }}>مسكوك</span>
          <span className="display" style={{ fontSize: 26 }}>فرصتك الأخيرة</span>
        </div>
        <HelpButton gameId="spy" />
        {g.endsAt && <Timer endsAt={g.endsAt} />}
      </header>
      <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.7 }}>خمّن المكان صح وتاخد الجولة. الأماكن كلها شبه بعض، فافتكر أسئلتهم كويس.</p>
      <div className="grid2 stagger">
        {g.guessOptions.map((o, i) => (
          <button key={o} className={`tile${picked === o ? ' on' : ''}`} disabled={sent} aria-pressed={picked === o} onClick={() => { setPicked(o); sfx.select(); }}
            style={{ minHeight: 78, justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxShadow: picked === o ? '0 0 0 3px var(--yellow)' : '3px 3px 0 var(--yellow)', color: '#111', animationDelay: `${i * 70}ms` }}>
            <span className="display" style={{ fontSize: 19 }}>{o}</span>
          </button>
        ))}
      </div>
      <button className="btn full push" style={{ height: 60, background: picked ? 'var(--yellow)' : 'rgba(255,255,255,.5)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}
        disabled={!picked || sent} onClick={async () => { setSent(true); sfx.vote(); const r = await send('spy:guess', { place: picked }); if (!r.ok) setSent(false); }}>
        {sent ? 'بنشوف…' : picked ? 'ده المكان، أكّد' : 'اختار مكان الأول'}
      </button>
    </main>
  );
}

/* ---------- results ---------- */
function ScoreRow({ p, i, room, g, showRound }: { p: PlayerView; i: number } & P & { showRound: boolean }) {
  const pts = showRound ? g.roundPoints[p.id] : undefined;
  const shown = useCountUp(p.score, p.score - (pts ?? 0), 1100);
  const isSpy = !!g.spyIds?.includes(p.id);
  return (
    <div className="row" style={{ gap: 10, padding: '6px 10px', borderRadius: 16, background: i === 0 ? 'var(--yellow)' : isSpy && showRound ? '#FFE3EF' : 'transparent', border: i === 0 ? '2.5px solid #111' : '2.5px solid transparent', animationDelay: `${i * 110}ms` }}>
      <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: i === 0 ? '#111' : 'transparent', color: i === 0 ? 'var(--yellow)' : '#111', border: '2.5px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>{AR(i + 1)}</span>
      <Character id={p.avatar} size={42} spy={isSpy && showRound} />
      <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
        <span style={{ fontWeight: 900, fontSize: 15 }}>
          {p.name} {p.id === room.youId && <span className="chip dark" style={{ fontSize: 11 }}>إنت</span>} {isSpy && showRound && <span className="chip pink" style={{ fontSize: 11 }}>الجاسوس</span>}
        </span>
        {pts !== undefined && <span className="gain" style={{ fontSize: 12, fontWeight: 800, color: pts > 0 ? 'var(--ok)' : '#6b2a3f', animationDelay: `${500 + i * 110}ms` }}>+{AR(pts)}</span>}
      </div>
      <span className="display num" style={{ fontSize: 24 }}>{AR(shown)}</span>
    </div>
  );
}

function Leaderboard({ room, g, showRound }: P & { showRound: boolean }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <div className="card col stagger" style={{ padding: 8, gap: 4 }}>
      {ranked.map((p, i) => <ScoreRow key={p.id} p={p} i={i} room={room} g={g} showRound={showRound} />)}
    </div>
  );
}

function Result({ room, g }: P) {
  const { name } = usePlayers(room);
  const [boom, setBoom] = useState(0);
  const isHost = room.hostId === room.youId;
  const last = g.round >= g.totalRounds;
  const won = (g.roundPoints[room.youId] ?? 0) > 0;
  const many = g.spyCount > 1;
  const spyNames = (g.spyIds ?? []).map((id) => name(id)).join(' و ');
  const caughtName = g.caughtSpyId ? name(g.caughtSpyId) : null;
  const title = g.outcome === 'detectives' ? 'المحققين كسبوا الجولة!' : g.outcome === 'spy-guessed' ? 'الجاسوس خمّن المكان!' : many ? 'الجواسيس هربوا!' : 'الجاسوس هرب!';
  const sub = g.outcome === 'detectives'
    ? (caughtName
        ? (g.spyGuess ? `${caughtName} اتمسك وخمّن ${g.spyGuess} غلط` : `${caughtName} اتمسك وماعرفش المكان`)
        : 'الجاسوس سابنا في نص الجولة')
    : g.outcome === 'spy-guessed' ? `${caughtName} اتمسك بس عرف إنه ${g.place}`
    : many ? `${spyNames} كانوا الجواسيس ومحدش اتمسك` : `${spyNames} كان الجاسوس ومحدش مسكه`;

  useEffect(() => {
    music.dip(2.5);
    if (won) { sfx.win(); setBoom(1); } else sfx.lose();
  }, []);

  return (
    <main className="screen">
      <Confetti fire={boom} />
      <div className="col" style={{ gap: 2, paddingTop: 6 }}>
        <div className="row between">
          <div className="row" style={{ gap: 6 }}>
            <span className="chip">الجولة {AR(g.round)} من {AR(g.totalRounds)}</span>
            <HelpButton gameId="spy" />
          </div>
          <MuteButton />
        </div>
        <h1 className="display pop-in" style={{ fontSize: 36, lineHeight: 1.15 }}>{title}</h1>
        <span style={{ fontWeight: 700 }}>{sub}</span>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <span className="chip soft" style={{ fontSize: 13 }}>المكان كان: {g.place}</span>
          <span className="chip dark" style={{ fontSize: 13 }}>{diffLabel(g)}</span>
        </div>
      </div>
      <WatchBanner g={g} />
      <Leaderboard room={room} g={g} showRound />
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" onClick={() => { sfx.tap(); send('game:next'); }}>{last ? 'الترتيب النهائي' : g.round + 1 === g.totalRounds ? 'الجولة الأخيرة' : 'الجولة الجاية'}</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>رجوع للأوضة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين {name(room.hostId)} يكمّل</span>}
      </div>
    </main>
  );
}

function Final({ room, g }: P) {
  const { name } = usePlayers(room);
  const [boom, setBoom] = useState(0);
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const top = ranked.filter((p) => p.score === ranked[0]?.score);
  const isHost = room.hostId === room.youId;

  useEffect(() => {
    music.dip(3);
    const stopSound = gameOver(null);
    setBoom(1);
    const t = setTimeout(() => setBoom(2), 1400);
    return () => { clearTimeout(t); stopSound(); };
  }, []);

  return (
    <main className="screen">
      <Confetti fire={boom} amount={boom === 2 ? 180 : 140} from={boom === 2 ? 'top' : 'center'} />
      <div className="row" style={{ justifyContent: 'flex-end' }}><HelpButton gameId="spy" /></div>
      <div className="col center" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'center' }}>{top.map((p) => <span key={p.id} className="pop-in float"><Character id={p.avatar} size={top.length > 1 ? 90 : 130} /></span>)}</div>
        <h1 className="display pop-in" style={{ fontSize: 34, textAlign: 'center' }}>{top.length > 1 ? 'تعادل!' : `${top[0]?.name} كسب اللمّة!`}</h1>
        <span className="muted">بعد {AR(g.totalRounds)} {g.totalRounds === 1 ? 'جولة' : 'جولات'}</span>
      </div>
      <Leaderboard room={room} g={g} showRound={false} />
      <div className="col push">
        {isHost ? (
          <>
            <button className="btn big full" onClick={() => { sfx.tap(); send('game:again'); }}>نلعبها تاني</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
