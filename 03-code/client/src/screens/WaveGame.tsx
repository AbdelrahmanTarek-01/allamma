import { useEffect, useRef, useState } from 'react';
import { Character } from '../components/art';
import { Dial, type DialNeedle } from '../components/Dial';
import { HelpButton } from '../components/HelpSheet';
import { MysteryBg } from '../components/MysteryBg';
import { Confetti, MuteButton, Timer } from '../components/ui';
import { AR, send, type RoomView, type WaveGameView } from '../net';
import { gameOver, music, sfx } from '../sound';

type P = { room: RoomView; g: WaveGameView };

const TEAM = [{ name: 'الأزرق', color: '#4D9DFF' }, { name: 'البرتقالي', color: '#FF8A3D' }] as const;
const DIFF_NAME = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' } as const;
const mult = (n: number) => AR(String(n).replace('.', '٫'));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const useWho = (room: RoomView) => ({
  byId: (id: string | null | undefined) => room.players.find((p) => p.id === id),
  name: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? '؟',
  avatar: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.avatar ?? 'c1'
});

export function WaveGame(props: P) {
  switch (props.g.phase) {
    case 'clue': return props.g.you?.role === 'narrator' ? <Narrator {...props} /> : <Waiting {...props} />;
    case 'guess':
    case 'call': return <Play {...props} />;
    case 'reveal': return <Reveal {...props} />;
    default: return <Final {...props} />;
  }
}

function Header({ g }: { g: WaveGameView }) {
  return (
    <header className="row between">
      <div className="row" style={{ gap: 6 }}>
        <span className="chip pink">الدور {AR(g.turn)} من {AR(g.totalTurns)}</span>
        <HelpButton gameId="wave" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <MuteButton />
        {g.endsAt && g.phase !== 'reveal' && <Timer endsAt={g.endsAt} />}
      </div>
    </header>
  );
}

/** Teams mode: both scores, the narrator's team highlighted. */
function TeamBar({ g }: { g: WaveGameView }) {
  if (!g.teamScores) return null;
  return (
    <div className="team-bar">
      {[0, 1].map((t) => (
        <div key={t} className={`team-chip${g.narratorTeam === t ? ' on' : ''}${g.you?.team === t ? ' mine' : ''}`} style={{ ['--tc' as any]: TEAM[t].color }}>
          <span>{TEAM[t].name}{g.you?.team === t ? ' (فريقك)' : ''}</span>
          <b className="display num">{AR(g.teamScores![t])}</b>
        </div>
      ))}
    </div>
  );
}

const WatchBanner = ({ g }: { g: WaveGameView }) =>
  g.you ? null : <div className="card flat center" style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14 }}>دخلت واللعبة شغالة، هتلعب من اللفّة الجاية</div>;

/* ---------- the narrator ---------- */

function Narrator({ g }: P) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const card = g.card!;
  const go = async (voice: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await send('wave:clue', { text, voice });
    if (!r.ok) setBusy(false);
  };
  return (
    <main className="screen wave-screen">
      <Header g={g} />
      <TeamBar g={g} />
      <section className="card place-card compact">
        <div className="row between">
          <span className="label" style={{ fontSize: 12.5 }}>إنت الراوي</span>
          <span className="chip dark" style={{ fontSize: 12 }}>{DIFF_NAME[g.difficulty!]} ×{mult(g.multiplier)}</span>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>الهدف مخفي عن الباقي. وصّل لهم مكانه بكلمة واحدة.</span>
      </section>
      {/* the narrator sees the target zones; nobody else does */}
      <Dial left={card.left} right={card.right} target={g.target} label="المقياس والهدف" />
      <form className="col" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); go(false); }}>
        <input className="input" aria-label="الكلمة" maxLength={80} value={text} placeholder="اكتب الكلمة اللي توصّلهم للهدف" onChange={(e) => setText(e.target.value)} />
        <button className="btn big full" type="submit" disabled={!text.trim() || busy}>ابعت الكلمة</button>
      </form>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" disabled={busy} onClick={() => go(true)}>قلته بصوتي</button>
        <button className="btn grow" disabled={!g.canRedraw || busy} onClick={() => { sfx.card(); send('wave:redraw'); }}>
          كارت تاني {g.canRedraw ? <span className="chip pink" style={{ fontSize: 11, padding: '0 7px' }}>مرة</span> : null}
        </button>
      </div>
      <WatchBanner g={g} />
    </main>
  );
}

function Waiting({ room, g }: P) {
  const { name } = useWho(room);
  const card = g.card!;
  return (
    <main className="screen wave-screen">
      <Header g={g} />
      <TeamBar g={g} />
      <section className="card place-card compact">
        <span className="label" style={{ fontSize: 12.5 }}>الراوي</span>
        <h1 className="display place-name">{name(g.narratorId)} بيفكّر في كلمة…</h1>
      </section>
      <Dial left={card.left} right={card.right} label="المقياس" />
      <span className="muted" style={{ textAlign: 'center' }}>الهدف مخفي. هتحط الإبرة على حسب كلمته.</span>
      <WatchBanner g={g} />
    </main>
  );
}

/* ---------- guessing (solo and teams) and the other team's call ---------- */

/** Everyone who places the needle, with a tick on the ones who locked. */
function LockedRow({ room, g }: P) {
  const { avatar, name } = useWho(room);
  const ids = g.participants.filter((id) => id !== g.narratorId && (!g.teams || g.teams[id] === g.narratorTeam));
  return (
    <div className="locked-row" aria-label="مين ثبّت">
      {ids.map((id) => (
        <span key={id} className={`lk${g.lockedIds.includes(id) ? ' on' : ''}`} title={name(id)}>
          <Character id={avatar(id)} size={34} />
          {g.lockedIds.includes(id) && <i aria-hidden="true">✓</i>}
        </span>
      ))}
    </div>
  );
}

function TeamChat({ room, g }: P) {
  const { avatar, name } = useWho(room);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const chat = g.team?.chat ?? [];
  useEffect(() => { list.current?.scrollTo({ top: 1e6 }); }, [chat.length]);
  if (!g.team || g.you?.role === 'narrator') return null;
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await send('wave:teamChat', { text: t });
  };
  return (
    <section className="card flat team-chat" style={{ ['--tc' as any]: TEAM[g.team.index].color }}>
      <span className="label" style={{ fontSize: 12 }}>شات الفريق (فريقك بس)</span>
      <div className="tc-list" ref={list} aria-live="polite">
        {chat.length === 0 && <span className="muted">اتفقوا مع فريقكم…</span>}
        {chat.map((m) => (
          <div key={m.id} className={`tc-msg${m.from === room.youId ? ' mine' : ''}`}>
            <Character id={avatar(m.from)} size={22} />
            <span><b>{m.from === room.youId ? 'إنت' : name(m.from)}:</b> {m.text}</span>
          </div>
        ))}
      </div>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input" style={{ height: 40, fontSize: 15, borderWidth: 2.5 }} aria-label="رسالة للفريق" maxLength={120} value={text} placeholder="اكتب لفريقك" onChange={(e) => setText(e.target.value)} />
        <button className="btn black sm" type="submit" style={{ height: 40 }}>ابعت</button>
      </form>
    </section>
  );
}

function Play({ room, g }: P) {
  const { byId, name, avatar } = useWho(room);
  const you = g.you;
  const card = g.card!;
  const teams = g.mode === 'teams';
  const calling = g.phase === 'call';
  const canDrag = !!you && you.role === 'guesser' && g.phase === 'guess';
  const me = byId(room.youId);

  // solo: my own needle lives here (and privately on the server). teams: the shared needle comes from the server.
  const [local, setLocal] = useState<number | null>(you?.needle ?? null);
  const lastDrag = useRef(0);
  const lastSend = useRef(0);
  const [, tick] = useState(0);
  const notch = useRef(-1);
  const onAngle = (a: number, end: boolean) => {
    const n = Math.floor(a / 6); // a soft tick for every notch the needle crosses
    if (notch.current !== -1 && n !== notch.current) sfx.soft();
    notch.current = n;
    setLocal(a);
    lastDrag.current = performance.now();
    const now = performance.now();
    if (end || now - lastSend.current > 110) { lastSend.current = now; send('wave:needle', { angle: a }); }
    if (end) setTimeout(() => tick((n) => n + 1), 600);
  };
  const shared = g.team?.needle ?? null;
  const recent = performance.now() - lastDrag.current < 500;
  const shown = teams ? (recent && local !== null && canDrag ? local : shared) : local;

  const needles: DialNeedle[] = [];
  if (shown !== null && (teams || canDrag)) {
    needles.push(teams ? { id: 'team', angle: shown, color: TEAM[g.team?.index ?? g.narratorTeam ?? 0].color } : { id: room.youId, angle: shown, avatar: me?.avatar ?? 'c1', color: '#FF4F9A' });
  }
  // the narrator watches their team's needle live (teams) but not the private solo needles
  const dots = teams && g.phase === 'guess' && g.team ? g.team.fingers.filter((f) => f.id !== room.youId).map((f) => ({ ...f, avatar: avatar(f.id) })) : [];

  const locked = !!you?.locked;
  const clue = g.clue;
  const sideText = { left: 'شمال', right: 'يمين' } as const;

  return (
    <main className="screen wave-screen">
      <Header g={g} />
      <TeamBar g={g} />
      <section className="card place-card compact clue-card">
        <div className="row between">
          <span className="label" style={{ fontSize: 12.5 }}>كلمة {name(g.narratorId)}</span>
          <span className="chip dark" style={{ fontSize: 12 }}>{DIFF_NAME[g.difficulty!]} ×{mult(g.multiplier)}</span>
        </div>
        <h1 className="display place-name">{clue?.voice ? 'قالها بصوته 🎤' : clue?.text}</h1>
      </section>
      <WatchBanner g={g} />

      <Dial
        left={card.left}
        right={card.right}
        target={you?.role === 'narrator' ? g.target : null}
        needles={needles}
        dots={dots}
        onAngle={canDrag && !locked ? onAngle : undefined}
        label={canDrag ? 'اسحب الإبرة' : 'المقياس'}
      />

      {/* what this player can do right now */}
      {calling ? (
        you?.role === 'caller' ? (
          <div className="card flat col" style={{ gap: 8, padding: '10px 12px' }}>
            <span style={{ fontWeight: 900 }}>الهدف على شمال الإبرة ولا يمينها؟ (+١ لو فريقكم صح)</span>
            <div className="row" style={{ gap: 8 }}>
              {(['left', 'right'] as const).map((s) => (
                <button key={s} className={`btn big grow${you.call === s ? ' on-call' : ''}`} style={you.call === s ? { background: 'var(--green)', color: '#111', boxShadow: '0 6px 0 #111' } : undefined} onClick={() => { sfx.select(); send('wave:call', { side: s }); }}>{sideText[s]}</button>
              ))}
            </div>
            <span className="muted">{g.lockedIds.length} من {AR(g.participants.filter((id) => g.teams?.[id] !== g.narratorTeam).length)} قالوا · الأغلبية هي اللي بتتحسب</span>
          </div>
        ) : (
          <div className="card flat center" style={{ padding: '10px 12px', fontWeight: 800 }}>
            الفريق {TEAM[g.narratorTeam === 0 ? 1 : 0].name} بيقول الهدف شمال ولا يمين الإبرة…
          </div>
        )
      ) : you?.role === 'narrator' ? (
        <div className="card flat col center" style={{ gap: 6, padding: '10px 12px' }}>
          <span style={{ fontWeight: 900 }}>{teams ? 'فريقك بيحرّك الإبرة…' : 'اللاعيبة بيخمّنوا…'}</span>
          <LockedRow room={room} g={g} />
        </div>
      ) : canDrag ? (
        <div className="col" style={{ gap: 8 }}>
          <LockedRow room={room} g={g} />
          {teams && <span className="muted" style={{ textAlign: 'center' }}>{AR(g.lockedIds.length)} من {AR(g.team?.need ?? 1)} وافقوا على التثبيت · لو الإبرة اتحرّكت لازم توافقوا تاني</span>}
          {locked ? (
            <button className="btn full change-btn" onClick={() => { sfx.toggleOff(); send('wave:unlock'); }}>غيّرت رأيي</button>
          ) : (
            <button className="btn big full" disabled={shown === null} onClick={() => { sfx.confirm(); send('wave:lock', teams ? {} : { angle: local }); }}>{shown === null ? 'اسحب الإبرة' : teams ? 'موافق، ثبّتوها' : 'ثبّت الإبرة'}</button>
          )}
        </div>
      ) : (
        <div className="card flat col center" style={{ gap: 6, padding: '10px 12px' }}>
          <span style={{ fontWeight: 900 }}>{teams ? `الفريق ${TEAM[g.narratorTeam ?? 0].name} بيثبّت الإبرة…` : 'الكل بيخمّن…'}</span>
          {teams && <span className="muted">جهّزوا نفسكم: بعد التثبيت هتقولوا الهدف شمال ولا يمين الإبرة.</span>}
          <LockedRow room={room} g={g} />
        </div>
      )}

      {teams && <TeamChat room={room} g={g} />}
    </main>
  );
}

/* ---------- reveal (dark, like the spy reveal) ---------- */

function Reveal({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const rv = g.reveal!;
  const card = g.card!;
  const isHost = room.hostId === room.youId;
  const last = g.turn >= g.totalTurns;
  const teams = g.mode === 'teams';
  // the needles come in one by one (lowest points first, the best last), after the cover has rotated away
  const list = [...rv.needles].reverse();
  const [open, setOpen] = useState(reducedMotion());
  const [shown, setShown] = useState(reducedMotion() ? list.length : 0);
  const [done, setDone] = useState(reducedMotion());
  const [boom, setBoom] = useState(0);
  const myPoints = g.roundPoints[room.youId] ?? 0;

  useEffect(() => {
    music.dip(2);
    if (reducedMotion()) return;
    const ts: ReturnType<typeof setTimeout>[] = [];
    ts.push(setTimeout(() => sfx.whoosh(), 250)); // the cover sweeps away
    ts.push(setTimeout(() => { setOpen(true); sfx.flip(); }, 600));
    list.forEach((_, i) => ts.push(setTimeout(() => { setShown(i + 1); sfx.pop(); }, 1700 + i * 500)));
    ts.push(setTimeout(() => {
      setDone(true);
      if (myPoints >= 3) { sfx.win(); setBoom(1); if (myPoints >= 4) setTimeout(() => sfx.crown(), 500); } else if (myPoints > 0) sfx.near(); else sfx.lose();
    }, 1700 + list.length * 500 + 400));
    return () => ts.forEach(clearTimeout);
  }, []);

  const needles: DialNeedle[] = list.slice(0, shown).map((n) => {
    if (teams) return { id: 'team', angle: n.angle!, color: TEAM[g.narratorTeam ?? 0].color };
    return { id: n.id, angle: n.angle!, avatar: avatar(n.id), color: n.id === room.youId ? '#FF4F9A' : '#4D9DFF', small: rv.needles.length > 5 };
  }).filter((n) => Number.isFinite(n.angle));

  return (
    <main className="screen dark wave-screen">
      <MysteryBg />
      <Confetti fire={boom} />
      <header className="row between">
        <div className="row" style={{ gap: 6 }}>
          <span className="chip pink">الدور {AR(g.turn)} من {AR(g.totalTurns)}</span>
          <HelpButton gameId="wave" />
        </div>
        <MuteButton />
      </header>
      <div className="col center" style={{ gap: 2 }}>
        <span className="muted" style={{ color: '#E9DDFF' }}>كلمة {name(g.narratorId)}</span>
        <h1 className="display" style={{ fontSize: 28, textAlign: 'center' }}>{g.clue?.voice ? 'قالها بصوته 🎤' : g.clue?.text}</h1>
      </div>

      <Dial left={card.left} right={card.right} target={g.target} needles={needles} cover={open ? 'open' : 'closed'} label="كشف الهدف" />

      {done && (
        <section className="card col pop-in" style={{ gap: 8, padding: '12px 14px', color: '#111' }}>
          {teams ? (
            <>
              <div className="row between">
                <span className="display" style={{ fontSize: 18 }}>الفريق {TEAM[g.narratorTeam ?? 0].name}</span>
                <span className="chip" style={{ background: TEAM[g.narratorTeam ?? 0].color }}>{AR(rv.teamPoints?.[g.narratorTeam ?? 0] ?? 0)}+ نقطة</span>
              </div>
              <span className="muted">{rv.needles.length ? `الإبرة جابت ${rv.zone ? AR(rv.zone) : 'صفر'} (×${mult(g.multiplier)} الصعوبة)` : 'مفيش إبرة اتحطت'}</span>
              <div className="row between">
                <span className="display" style={{ fontSize: 18 }}>الفريق {TEAM[g.narratorTeam === 0 ? 1 : 0].name}</span>
                <span className="chip" style={{ background: rv.call?.correct ? 'var(--green)' : '#eee' }}>{rv.call?.correct ? '+١ قالوا صح' : 'مفيش نقطة'}</span>
              </div>
              <span className="muted">
                {rv.call?.correct === true ? `الهدف كان على ${rv.call.side === 'left' ? 'شمال' : 'يمين'} الإبرة وقالوها صح`
                  : rv.call?.correct === false ? `الهدف كان على ${rv.call.side === 'left' ? 'شمال' : 'يمين'} الإبرة`
                  : 'الأصوات اتعادلت أو محدش قال'}
              </span>
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 10 }}>
                <Character id={avatar(g.narratorId)} size={36} />
                <div className="col grow" style={{ gap: 0 }}>
                  <span style={{ fontWeight: 900 }}>{g.narratorId === room.youId ? 'إنت' : name(g.narratorId)} <span className="chip soft" style={{ fontSize: 11 }}>الراوي</span></span>
                  <span className="muted" style={{ fontSize: 12 }}>متوسط نقط الكل</span>
                </div>
                <span className="display num" style={{ fontSize: 24 }}>{AR(rv.narratorAvg ?? 0)}+</span>
              </div>
              {rv.needles.map((n) => (
                <div key={n.id} className="row" style={{ gap: 10 }}>
                  <Character id={avatar(n.id)} size={36} />
                  <span className="grow" style={{ fontWeight: 900 }}>{n.id === room.youId ? 'إنت' : name(n.id)}</span>
                  <span className="chip" style={{ background: n.points ? 'var(--green)' : '#eee' }}>{n.angle === null ? 'ما ثبّتش' : n.points ? `${AR(n.points)}+` : 'بعيد'}</span>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <button className="btn big full" onClick={() => { sfx.tap(); send('game:next'); }}>{last ? 'الترتيب النهائي' : 'الدور الجاي'}</button>
        ) : <span className="label" style={{ textAlign: 'center', color: '#E9DDFF' }}>مستنيين {name(room.hostId)} يكمّل</span>}
      </div>
    </main>
  );
}

/* ---------- final ---------- */

function Final({ room, g }: P) {
  const [boom, setBoom] = useState(0);
  const teams = g.mode === 'teams' && !!g.teamScores;
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const topTeam = teams ? (g.teamScores![0] === g.teamScores![1] ? null : g.teamScores![0] > g.teamScores![1] ? 0 : 1) : null;
  const top = teams ? [] : ranked.filter((p) => p.score === ranked[0]?.score);
  const isHost = room.hostId === room.youId;

  useEffect(() => {
    music.dip(3);
    const stopSound = gameOver(teams && topTeam !== null && g.you?.team != null ? (g.you.team === topTeam ? 'win' : 'lose') : null);
    setBoom(1);
    const t = setTimeout(() => setBoom(2), 1400);
    return () => { clearTimeout(t); stopSound(); };
  }, []);

  return (
    <main className="screen wave-screen">
      <Confetti fire={boom} amount={boom === 2 ? 180 : 140} from={boom === 2 ? 'top' : 'center'} />
      <div className="row" style={{ justifyContent: 'flex-end' }}><HelpButton gameId="wave" /></div>
      <div className="col center" style={{ gap: 6 }}>
        {teams ? (
          <>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {ranked.filter((p) => topTeam === null || g.teams?.[p.id] === topTeam).slice(0, 5).map((p) => <span key={p.id} className="pop-in float"><Character id={p.avatar} size={72} /></span>)}
            </div>
            <h1 className="display pop-in" style={{ fontSize: 32, textAlign: 'center' }}>{topTeam === null ? 'تعادل!' : `الفريق ${TEAM[topTeam].name} كسب!`}</h1>
            <div className="team-bar" style={{ width: '100%' }}>
              {[0, 1].map((t) => (
                <div key={t} className={`team-chip${topTeam === t ? ' on' : ''}`} style={{ ['--tc' as any]: TEAM[t].color }}><span>{TEAM[t].name}</span><b className="display num">{AR(g.teamScores![t])}</b></div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'center' }}>{top.map((p) => <span key={p.id} className="pop-in float"><Character id={p.avatar} size={top.length > 1 ? 90 : 130} /></span>)}</div>
            <h1 className="display pop-in" style={{ fontSize: 34, textAlign: 'center' }}>{top.length > 1 ? 'تعادل!' : `${top[0]?.name} كسب اللمّة!`}</h1>
          </>
        )}
        <span className="muted">بعد {AR(g.totalTurns)} {g.totalTurns <= 10 ? 'أدوار' : 'دور'}</span>
      </div>
      <div className="card col stagger" style={{ padding: 8, gap: 4 }}>
        {ranked.map((p, i) => (
          <div key={p.id} className="row" style={{ gap: 10, padding: '6px 10px', borderRadius: 16, background: i === 0 ? 'var(--yellow)' : 'transparent', border: i === 0 ? '2.5px solid #111' : '2.5px solid transparent' }}>
            <span className="rank-n">{AR(i + 1)}</span>
            <Character id={p.avatar} size={42} />
            <span className="grow" style={{ fontWeight: 900, fontSize: 15 }}>{p.id === room.youId ? 'إنت' : p.name}{g.teams ? <span className="chip" style={{ marginInlineStart: 6, fontSize: 11, background: TEAM[g.teams[p.id] ?? 0].color }}>{TEAM[g.teams[p.id] ?? 0].name}</span> : null}</span>
            <span className="display num" style={{ fontSize: 24 }}>{AR(p.score)}</span>
          </div>
        ))}
      </div>
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
