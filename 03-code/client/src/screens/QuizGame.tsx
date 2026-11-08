import { useEffect, useRef, useState } from 'react';
import { Character } from '../components/art';
import { HelpButton } from '../components/HelpSheet';
import { TeamChatButton } from '../components/TeamChatSheet';
import { Confetti, MuteButton, Timer, useSecondsLeft } from '../components/ui';
import { TEAM } from '../games/teams';
import { AR, send, type QuizGameView, type RoomView } from '../net';
import { music, sfx } from '../sound';

type P = { room: RoomView; g: QuizGameView };

const KEYS = ['أ', 'ب', 'ج', 'د'];
const LEVEL_NAME: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب', max: 'ماكس' };
const fmt = (n: number) => AR(String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')).replace(/٬/g, '٬');
const money = (n: number) => (n < 0 ? '−' : '') + fmt(n);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v: number) => { v = clamp(v); const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const act = (action: string, payload?: unknown) => send('game:act', { game: 'quiz', action, payload });

const useWho = (room: RoomView) => ({
  name: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? '؟',
  avatar: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.avatar ?? 'c1'
});

export function QuizGame(props: P) {
  switch (props.g.phase) {
    case 'draft': return <Draft {...props} />;
    case 'board': return <Board {...props} />;
    case 'question':
    case 'steal':
    case 'reveal': return <Question {...props} />;
    default: return <Final {...props} />;
  }
}

function PersonChip({ n }: { n: number }) {
  return (
    <span className="qz-count" aria-label={`${AR(n)} لاعيبة`}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.5" fill="#111" /><path d="M3.500 21a8.500 8.500 0 0117 0z" fill="#111" /></svg>{AR(n)}
    </span>
  );
}

/** A tool row shared by every quiz screen: help, chat and sound. */
function Tools({ room, g, timer = true }: P & { timer?: boolean }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <HelpButton gameId="quiz" />
      <TeamChatButton room={room} game="quiz" team={g.team} chat={g.chat} />
      <MuteButton />
      {timer && g.endsAt && g.phase !== 'reveal' && <Timer endsAt={g.endsAt} />}
    </div>
  );
}

/* ---------- category draft ---------- */

function Draft({ room, g }: P) {
  const mineTurn = g.team !== null && g.draftTurn === g.team;
  const slots = (t: 0 | 1) => g.cats.filter((c) => c.owner === t);
  const count = (t: 0 | 1) => g.participants.filter((id) => g.teams[id] === t).length;
  const lastPick = g.cats.filter((c) => c.owner !== null).length;
  const done = g.draftTurn === null;
  return (
    <main className="screen qz-screen">
      <header className="row between">
        <div className="col" style={{ gap: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>حزّورة · قبل ما نبدأ</span>
          <span className="display" style={{ fontSize: 28, lineHeight: 1.15 }}>اختاروا فئاتكم</span>
        </div>
        <Tools room={room} g={g} />
      </header>
      <section className="qz-draft-teams">
        {([0, 1] as const).map((t) => (
          <div key={t} className="qz-team-card" style={{ boxShadow: !done && g.draftTurn === t ? `0 0 0 4px ${TEAM[t].color}, 4px 4px 0 4px #111` : '4px 4px 0 #111' }}>
            <div className="qz-team-head" style={{ background: TEAM[t].color }}>
              <span style={{ fontWeight: 900, fontSize: 15, whiteSpace: 'nowrap' }}>{TEAM[t].name}{g.team === t ? ' (إنتوا)' : ''}</span>
              <PersonChip n={count(t)} />
            </div>
            <div className="col" style={{ padding: 8, gap: 5 }}>
              {[0, 1, 2].map((i) => {
                const c = slots(t)[i];
                return (
                  <div key={i} className="qz-slot" style={{ borderStyle: c ? 'solid' : 'dashed', background: c ? TEAM[t].soft : 'transparent', animation: c && i === slots(t).length - 1 && lastPick > 0 ? 'slotIn .45s cubic-bezier(.2,1.4,.4,1)' : 'none' }}>
                    {c ? c.name : `فئة ${AR(i + 1)}`}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      <div className="qz-turn">
        <span className="qz-dot" style={{ background: done ? '#3DDC97' : TEAM[g.draftTurn!].color }} />
        <span>{done ? 'الفئات اكتملت! اللوحة جاهزة' : mineTurn ? 'دور فريقك يختار فئة، اختار حالًا' : `دور الفريق ${TEAM[g.draftTurn!].name} يختار فئة`}</span>
      </div>
      <section className="qz-cats">
        {g.cats.map((c) => (
          <button
            key={c.id}
            className="qz-cat"
            disabled={c.owner !== null || !mineTurn}
            style={{ background: c.owner === null ? '#fff' : TEAM[c.owner].soft, opacity: c.owner !== null ? 0.75 : !mineTurn ? 0.6 : 1, boxShadow: c.owner !== null ? 'none' : '3px 3px 0 #111' }}
            onClick={async () => { sfx.card(); const r = await act('pickCategory', { cat: c.id }); if (r.ok) sfx.select(); }}
          >
            <span className="display" style={{ fontSize: 15, lineHeight: 1.2 }}>{c.name}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.7 }}>{c.sub}</span>
            {c.owner !== null && <i className="qz-owner" style={{ background: TEAM[c.owner].color }} />}
          </button>
        ))}
      </section>
      <span className="push" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800 }}>كل فريق بياخد ٣ فئات بالدور · أي حد في الفريق يقدر يختار</span>
    </main>
  );
}

/* ---------- score row ---------- */

function Scores({ g, on, mine }: { g: QuizGameView; on?: 0 | 1 | null; mine?: boolean }) {
  return (
    <section className="qz-scores">
      {([0, 1] as const).map((t) => (
        <div key={t} className={`qz-score${on === t ? ' on' : ''}`} style={on === t ? { background: TEAM[t].color } : undefined}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>{TEAM[t].name}{on === t ? (mine ? ' · دوركم' : ' · دورهم') : ''}</span>
          <b className="display num">{money(g.teamScores[t])}</b>
        </div>
      ))}
    </section>
  );
}

/* ---------- board ---------- */

function Cards({ g, canDouble }: { g: QuizGameView; canDouble: boolean }) {
  if (!g.cardsOn || g.team === null) return null;
  const c = g.cards[g.team];
  const play = async (card: string) => { sfx.card(); const r = await act('card', { card }); if (r.ok) sfx.select(); };
  const items = [
    { key: 'double', big: '×٢', title: 'دبّل', text: g.doubleArmed ? 'متفعّل على الخانة الجاية' : 'نقط السؤال الجاي بالضعف', left: c.double, usable: canDouble && c.double > 0 && !g.doubleArmed, rot: -2 },
    { key: 'fifty', big: '٥٠:٥٠', title: 'شيل إجابتين', text: 'يتشال اختيارين غلط', left: c.fifty, usable: false, rot: 1.5 },
    { key: 'steal', big: '✓', title: 'سرقة', text: 'تجاوبوا قبل الفريق التاني', left: c.steal, usable: false, rot: -1 }
  ];
  return (
    <section className="col" style={{ gap: 8 }}>
      <div className="row between"><span style={{ fontSize: 13, fontWeight: 900 }}>كروت فريقكم</span><span style={{ fontSize: 11, fontWeight: 800 }}>كل كارت مرة واحدة في اللعبة</span></div>
      <div className="qz-cards">
        {items.map((it) => {
          const used = it.left <= 0 && !(it.key === 'double' && g.doubleArmed);
          return (
            <button key={it.key} className="qz-card" disabled={!it.usable} onClick={() => play(it.key)} style={{ transform: `rotate(${it.rot}deg)`, opacity: used ? 0.5 : 1, background: used ? '#f3ecd0' : g.doubleArmed && it.key === 'double' ? 'var(--yellow)' : '#fff', boxShadow: used ? 'none' : '3px 3px 0 #111' }}>
              <span className="display" style={{ fontSize: 21, lineHeight: 1.1 }}>{used ? '✓' : it.big}{it.key === 'fifty' && it.left > 1 ? <small style={{ fontSize: 12 }}> ×{AR(it.left)}</small> : null}</span>
              <span style={{ fontSize: 12, fontWeight: 900 }}>{it.title}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', opacity: 0.8 }}>{used ? 'اتلعب خلاص' : it.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Board({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const [picked, setPicked] = useState<string | null>(null);
  const iPick = g.pickerId === room.youId;
  const myTurn = g.team === g.turnTeam;
  useEffect(() => { if (iPick) sfx.turn(); }, [iPick]);
  const tap = async (r: number, c: number) => {
    if (!iPick) return;
    sfx.card();
    setPicked(`${r}-${c}`);
    const res = await act('pickCell', { r, c });
    if (!res.ok) setPicked(null);
  };
  return (
    <main className="screen qz-screen">
      <div className="row between"><Scores g={g} on={g.turnTeam} mine={myTurn} /></div>
      <div className="row between" style={{ gap: 8 }}>
        <div className="row grow" style={{ gap: 8, minWidth: 0 }}>
          <span style={{ flex: 'none', display: 'flex' }}><Character id={avatar(g.pickerId)} size={34} /></span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
            {picked ? `${iPick ? 'اخترت' : name(g.pickerId) + ' اختار'}… استعدوا!` : iPick ? 'دورك تختار خانة لفريقك' : `دور ${name(g.pickerId)} يختار خانة لفريقه`}
          </span>
        </div>
        <span style={{ display: 'flex', flex: 'none', gap: 6, alignItems: 'center' }}>
          <TeamChatButton room={room} game="quiz" team={g.team} chat={g.chat} />
          <HelpButton gameId="quiz" />
          <MuteButton />
        </span>
      </div>
      <section className="qz-board">
        <div className="qz-grid qz-grid-head">
          <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>الفئة · <small>{LEVEL_NAME[g.level]}</small></span>
          {['سهل', 'متوسط', 'صعب'].map((x) => <span key={x} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 900 }}>{x}</span>)}
        </div>
        {g.rows.map((row, r) => (
          <div key={row.id} className="qz-grid">
            <div className="col" style={{ lineHeight: 1.2 }}>
              <span style={{ fontWeight: 900, fontSize: 13.5 }}>{row.name}</span>
              <span style={{ width: 22, height: 4, borderRadius: 99, background: TEAM[row.owner].color, marginTop: 3 }} />
            </div>
            {row.cells.map((cell, c) => {
              const isPick = picked === `${r}-${c}`;
              const w = cell.winner;
              const bg = isPick ? '#111' : w === 0 ? TEAM[0].color : w === 1 ? TEAM[1].color : w === 'x' ? '#eee' : '#FFD23F';
              return (
                <button key={c} className="qz-cell" disabled={cell.used || !iPick} onClick={() => tap(r, c)} style={{ background: bg, color: isPick ? '#FFD23F' : cell.used ? 'rgba(17,17,17,.55)' : '#111', boxShadow: cell.used ? 'none' : '3px 3px 0 #111', animation: isPick ? 'qzPick .4s cubic-bezier(.2,1.4,.4,1) forwards' : 'none', opacity: !cell.used && !iPick ? 0.92 : 1 }}>
                  <span style={{ fontSize: cell.used ? 16 : 20 }}>{w === 'x' ? '—' : AR(cell.value)}</span>
                  <span className="qz-unit" style={{ opacity: cell.used ? 0 : 0.75 }}>نقطة</span>
                </button>
              );
            })}
          </div>
        ))}
      </section>
      <div className="row between"><span style={{ fontSize: 13, fontWeight: 900 }}>فاضل {AR(g.left)} من {AR(g.total)}</span>{g.endsAt && <Timer endsAt={g.endsAt} />}</div>
      <Cards g={g} canDouble={iPick || (myTurn && g.pickerId !== null)} />
      <span className="push" style={{ textAlign: 'center', fontSize: 12, fontWeight: 800 }}>فيه كنز ×٢ وقنبلة مستخبيين في اللوحة، محدش يعرف فين</span>
    </main>
  );
}

/* ---------- question, steal, reveal ---------- */

function Ring({ endsAt, color }: { endsAt: number | null; color: string }) {
  const left = useSecondsLeft(endsAt);
  const total = useRef(0);
  if (left > total.current) total.current = left;
  const f = total.current ? left / total.current : 0;
  useEffect(() => { if (left > 0 && left <= 5) sfx.tick(); }, [left]);
  return (
    <span className="qz-ring" role="timer" aria-label={`فاضل ${left} ثانية`}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r="22" fill="#fff" stroke="#111" strokeWidth="3" />
        <circle cx="26" cy="26" r="17" fill="none" stroke={left <= 5 ? '#E2433B' : color} strokeWidth="6" strokeDasharray="106.8" strokeDashoffset={106.8 * (1 - f)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .3s linear' }} />
      </svg>
      <span className="display" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{AR(left)}</span>
    </span>
  );
}

function Question({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const q = g.question!;
  const reveal = g.phase === 'reveal';
  const steal = g.phase === 'steal';
  const answering = q.answering;
  const mine = answering !== null && g.team === answering;
  const turn = steal ? (answering === 0 ? 1 : 0) : answering !== null && q.early ? (answering === 0 ? 1 : 0) : answering;
  const onTurnTeam = (turn ?? 0) as 0 | 1;
  const myVote = g.you?.vote ?? null;
  const col = TEAM[(answering ?? onTurnTeam) as 0 | 1].color;
  const oc = q.outcome;

  // the reveal: sound once, score bump, flying points
  useEffect(() => {
    if (!reveal || !oc) return;
    if (oc.kind === 'right' || oc.kind === 'steal') {
      (g.team !== null && oc.team === g.team ? sfx.gotcha : sfx.pop)();
    } else sfx.boo();
  }, [reveal]);
  useEffect(() => { if (steal) sfx.whoosh(); }, [steal]);

  const votes = (i: number) => q.votes.filter((v) => v.option === i);
  const lead = (() => {
    const n = q.options.map((_, i) => votes(i).length);
    const max = Math.max(0, ...n);
    return { max, top: n.flatMap((v, i) => (v === max && max > 0 ? [i] : [])) };
  })();
  const hint = !mine ? (steal || q.early ? `الفريق ${TEAM[answering ?? 0].name} بيختار…` : `فريق ${TEAM[answering ?? 0].name} بيجاوب، استنوا…`)
    : lead.top.length > 1 ? 'الفريق متقسم! اتفقوا في الشات قبل ما الوقت يخلص'
    : lead.top.length === 1 ? `الفريق مايل لـ «${KEYS[lead.top[0]]}» · لو الوقت خلص بتتحسب الأغلبية`
    : 'كل واحد في الفريق يختار، والأغلبية بتكسب';

  const pick = async (i: number) => {
    if (!mine || reveal) return;
    sfx.card();
    await act('vote', { option: i });
  };
  const myCards = g.cardsOn && g.team !== null ? g.cards[g.team] : null;
  const canFifty = mine && !reveal && !!myCards && myCards.fifty > 0 && !q.options.some((o) => o.gone);
  const canSteal = !mine && g.team !== null && g.phase === 'question' && !q.early && g.team !== onTurnTeam && !!myCards && myCards.steal > 0;

  return (
    <main className="screen qz-screen">
      {(steal || reveal) && <Scores g={g} on={reveal && oc && (oc.kind === 'right' || oc.kind === 'steal') ? oc.team : null} mine />}
      {steal && (
        <div className="qz-banner" style={{ ['--bc' as any]: col }}>
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}><path d="M3 12h14M11 5l7 7-7 7" fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="col grow">
            <span className="display" style={{ fontSize: 20, color: '#FFD23F' }}>{q.first ? TEAM[q.first.team].name + (q.first.option === null ? " مجاوبوش!" : " غلط!") : ""} {mine ? "فرصتكم تسرقوها" : "الفريق التاني بيحاول يسرقها"}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{q.first?.option !== null && q.first ? `${TEAM[q.first.team].name} اختار «${q.options[q.first.option!].text}» · ` : ''}معاكم {AR(10)} ثواني بس</span>
          </div>
        </div>
      )}
      <header className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {!steal && <span className="qz-pill" style={{ background: TEAM[onTurnTeam].color }}>{q.early ? `سرقة ${TEAM[answering ?? 0].name}` : `دور ${TEAM[onTurnTeam].name}`}</span>}
        <span className="qz-pill" style={{ background: '#fff' }}>{q.cat} · {AR(q.value)}</span>
        {(q.doubled || q.special === 'treasure') && <span className="qz-pill" style={{ background: '#111', color: '#FFD23F' }}>{q.special === 'treasure' && q.doubled ? '×٤' : '×٢'} {q.special === 'treasure' ? 'كنز' : 'متفعّل'}</span>}
        {q.special === 'bomb' && <span className="qz-pill" style={{ background: '#E2433B', color: '#fff' }}>قنبلة!</span>}
        <span className="grow" />
        <TeamChatButton room={room} game="quiz" team={g.team} chat={g.chat} />
        <HelpButton gameId="quiz" />
        {!reveal ? <Ring key={g.phase + String(q.early)} endsAt={g.endsAt} color={col} /> : <MuteButton />}
      </header>

      <section className="qz-qcard">
        <span style={{ fontSize: 12.5, fontWeight: 900, opacity: 0.7 }}>سؤال {AR(q.worth)} نقطة{q.worth !== q.value ? ` (بدل ${AR(q.value)})` : ''}</span>
        <span className="display" style={{ fontSize: q.text.length > 38 ? 24 : 30, lineHeight: 1.35 }}>{q.text}</span>
      </section>

      {mine && !reveal && (g.cardsOn) && (
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 900, flex: 'none' }}>كروتكم:</span>
          <button className="qz-fifty" disabled={!canFifty} style={{ opacity: canFifty ? 1 : 0.6, background: canFifty ? '#fff' : '#f3ecd0' }} onClick={async () => { sfx.card(); await act('card', { card: 'fifty' }); }}>
            <span className="qz-minicard">٥٠</span>
            <span className="col" style={{ lineHeight: 1.2, textAlign: 'right' }}>
              <b style={{ fontSize: 13.5 }}>{myCards && myCards.fifty > 0 && !q.options.some((o) => o.gone) ? 'استخدم كارت ٥٠:٥٠' : q.options.some((o) => o.gone) ? 'استخدمتوا ٥٠:٥٠' : 'مفيش ٥٠:٥٠ متاحة'}</b>
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{q.options.some((o) => o.gone) ? 'اتشال اختيارين غلط' : myCards && myCards.fifty > 0 ? `يشيل اختيارين غلط · باقي ${AR(myCards.fifty)}` : 'اتلعبت خلاص'}</span>
            </span>
          </button>
        </div>
      )}
      {canSteal && (
        <button className="qz-fifty" style={{ background: '#fff' }} onClick={async () => { sfx.stamp(); await act('card', { card: 'steal' }); }}>
          <span className="qz-minicard" style={{ background: '#FF4F9A' }}>✓</span>
          <span className="col" style={{ lineHeight: 1.2, textAlign: 'right' }}><b style={{ fontSize: 13.5 }}>كارت السرقة</b><span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>جاوبوا قبل الفريق التاني</span></span>
        </button>
      )}

      <section className="col" style={{ gap: 10 }}>
        {q.options.map((o, i) => {
          const me = myVote === i;
          const isRight = reveal && q.correct === i;
          const firstPicked = q.first && q.first.option === i && (steal || reveal);
          const secondPicked = reveal && q.second?.option === i;
          const wrongPicked = reveal && !isRight && (firstPicked || secondPicked);
          const dead = o.gone || o.struck;
          let bg = '#fff', tag = '';
          if (dead) bg = '#f3ecd0';
          else if (me && !reveal) bg = TEAM[answering ?? 0].soft;
          if (o.struck && !reveal) tag = `${TEAM[q.first!.team].name} اختارها`;
          if (reveal && isRight) { bg = '#3DDC97'; tag = oc && (oc.kind === 'right' || oc.kind === 'steal') && (firstPicked || secondPicked) ? 'صح! ✓' : 'دي الصح'; }
          if (wrongPicked) { bg = '#FF8A80'; tag = 'غلط'; }
          return (
            <button key={i} className="qz-opt" disabled={!mine || reveal || dead} onClick={() => pick(i)} style={{ background: bg, boxShadow: dead || reveal ? 'none' : me ? '0 0 0 #111' : '4px 4px 0 #111', transform: me && !reveal ? 'translate(4px,4px)' : 'none', opacity: o.gone ? 0.45 : dead ? 0.6 : 1, animation: isRight ? 'rightGlow .8s ease-out 2' : wrongPicked ? 'qzShake .45s' : o.gone ? 'poof .35s forwards' : 'none' }}>
              <span className="qz-key" style={{ background: me && !reveal ? TEAM[answering ?? 0].color : '#FFD23F' }}>{KEYS[i]}</span>
              <span className="display grow" style={{ fontSize: o.text.length > 22 ? 17 : 22, textAlign: 'right', textDecoration: dead ? 'line-through' : 'none' }}>{o.text}</span>
              {tag && <span style={{ fontSize: 12, fontWeight: 900 }}>{tag}</span>}
              <span style={{ display: 'flex' }}>
                {votes(i).map((v) => <span key={v.id} style={{ marginInlineStart: -8, display: 'flex' }}><Character id={avatar(v.id)} size={28} /></span>)}
              </span>
            </button>
          );
        })}
      </section>

      {reveal && oc ? (
        <div className="qz-result" style={{ boxShadow: `0 0 0 4px ${oc.kind === 'right' || oc.kind === 'steal' ? '#3DDC97' : '#FF8A80'}` }}>
          <span className="display" style={{ fontSize: 20 }}>{resultTitle(oc, q.worth, g)}</span>
          {(oc.note || q.fact) && <span style={{ fontSize: 12.5, fontWeight: 700 }}>{q.fact}</span>}
          {oc.kind === 'right' || oc.kind === 'steal' ? <span className="qz-fly" aria-hidden="true">+{AR(q.worth)}</span> : null}
        </div>
      ) : (
        <>
          <button className="btn black big full qz-lock" disabled={!mine || q.votes.length === 0} style={{ boxShadow: `0 5px 0 ${col}` }} onClick={async () => { sfx.confirm(); const r = await act('lock'); if (!r.ok) sfx.error(); }}>ثبّت إجابة الفريق</button>
          <span style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800 }}>{hint}</span>
        </>
      )}
      {reveal && room.hostId === room.youId && <button className="btn full" onClick={() => { sfx.tap(); act('next'); }}>كمّل</button>}
    </main>
  );
}

function resultTitle(oc: NonNullable<QuizGameView['question']>['outcome'] & {}, worth: number, g: QuizGameView) {
  if (oc.kind === 'right') return `${TEAM[oc.team!].name}: صح! +${AR(worth)}${oc.note ? ' · ' + oc.note : ''}`;
  if (oc.kind === 'steal') return `${TEAM[oc.team!].name} سرقوها! +${AR(worth)}`;
  const first = oc.delta[0] + oc.delta[1] < 0;
  if (oc.note.includes('قنبلة')) return `قنبلة! ${first ? 'اتخصم ' + AR(Math.abs(oc.delta[0] + oc.delta[1])) : ''}`;
  return oc.kind === 'none' ? 'محدش جاوب، محدش خد النقط' : 'حتى السرقة غلط! محدش خد النقط';
}

/* ---------- final ---------- */

function Final({ room, g }: P) {
  const { name } = useWho(room);
  const isHost = room.hostId === room.youId;
  const [t, setT] = useState(0);
  const [boom, setBoom] = useState(0);
  const raf = useRef(0);
  const [a, b] = g.teamScores;
  const win: 0 | 1 | null = a === b ? null : a > b ? 0 : 1;
  const max = Math.max(1, a, b);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    music.dip(3);
    if (reduced) { setT(9); setBoom(1); return; }
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 7.2) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    const fan = setTimeout(() => { sfx.fanfare(); setBoom(1); }, 1900);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(fan); };
  }, []);
  const race = ease((t - 0.2) / 1.6);
  const shown = (v: number) => Math.round((Math.max(0, v) * race) / 10) * 10 * (v < 0 ? -1 : 1);
  const winners = win === null ? room.players.filter((p) => g.participants.includes(p.id)) : room.players.filter((p) => g.teams[p.id] === win);
  const star = g.final?.star;
  return (
    <main className="screen qz-screen">
      <Confetti fire={boom} amount={160} from="top" />
      <section className="col center" style={{ position: 'relative', gap: 4, paddingTop: 10 }}>
        <div aria-hidden="true" className="qz-rays" style={{ opacity: clamp((t - 2) / 0.5) }} />
        <svg width="120" height="120" viewBox="0 0 64 64" aria-hidden="true" style={{ position: 'relative', transform: `scale(${(0.3 + 0.7 * back((t - 1.8) / 0.6)).toFixed(2)}) rotate(${(-20 * (1 - clamp((t - 1.8) / 0.7))).toFixed(1)}deg)` }}>
          <path d="M18 8h28v14a14 14 0 01-28 0z" fill="#FFD23F" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 12H9a8 8 0 008 10M46 12h9a8 8 0 01-8 10" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M28 36h8v8h-8z" fill="#FF8A3D" stroke="#111" strokeWidth="3" />
          <path d="M20 44h24v8H20z" fill="#4D9DFF" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
          <path d="M26 16l2 4 4 .6-3 3 .7 4.400-3.700-2-3.700 2 .7-4.400-3-3 4-.6z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span style={{ position: 'relative', fontSize: 13, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '0 12px', opacity: clamp((t - 2.1) / 0.3) }}>خلصت اللوحة</span>
        <h1 className="display" style={{ position: 'relative', fontSize: 36, lineHeight: 1.15, textAlign: 'center', opacity: clamp((t - 2.1) / 0.3), transform: `translateY(${(12 * (1 - ease((t - 2.1) / 0.4))).toFixed(1)}px)` }}>{win === null ? 'تعادل!' : `الفريق ${TEAM[win].name} كسب!`}</h1>
        <div className="row" style={{ position: 'relative', gap: 6, marginTop: 4, opacity: clamp((t - 2.1) / 0.3), flexWrap: 'wrap', justifyContent: 'center' }}>
          {winners.slice(0, 5).map((p, i) => <span key={p.id} style={{ animation: `hop .6s ease-in-out ${i * 0.15}s infinite`, display: 'flex' }}><Character id={p.avatar} size={46} /></span>)}
        </div>
      </section>
      <section className="qz-bars">
        {([0, 1] as (0 | 1)[]).sort((x, y) => g.teamScores[y] - g.teamScores[x]).map((tm) => (
          <div key={tm} className="qz-bar-row">
            <span style={{ fontWeight: 900, fontSize: 14 }}>{TEAM[tm].name}</span>
            <span className="qz-bar"><span style={{ width: `${clamp((Math.max(0, g.teamScores[tm]) * race) / max) * 100}%`, background: TEAM[tm].color }} /></span>
            <span className="display num" style={{ fontSize: 20, textAlign: 'left' }}>{money(shown(g.teamScores[tm]))}</span>
          </div>
        ))}
      </section>
      <section className="grid2" style={{ opacity: clamp((t - 2.6) / 0.4), transform: `translateY(${(14 * (1 - ease((t - 2.6) / 0.5))).toFixed(1)}px)` }}>
        <div className="qz-stat"><span className="label" style={{ opacity: 0.7, fontSize: 11.5 }}>نجم اللوحة</span><span className="display" style={{ fontSize: 20 }}>{star ? name(star.id) : '—'}</span><span style={{ fontSize: 12, fontWeight: 800 }}>{star ? `جاوب ${AR(star.right)} صح من ${AR(star.total)}` : 'محدش جاوب'}</span></div>
        <div className="qz-stat"><span className="label" style={{ opacity: 0.7, fontSize: 11.5 }}>أحلى لحظة</span><span className="display" style={{ fontSize: 20 }}>{g.final?.moment?.text ?? 'لعب نضيف'}</span><span style={{ fontSize: 12, fontWeight: 800 }}>{g.final?.moment?.sub ?? 'من غير سرقة'}</span></div>
      </section>
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" style={{ boxShadow: '0 6px 0 #FF8A3D' }} onClick={() => { sfx.tap(); send('game:again'); }}>نلعبها تاني</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
