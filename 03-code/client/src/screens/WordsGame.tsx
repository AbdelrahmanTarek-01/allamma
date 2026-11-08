import { useEffect, useRef, useState } from 'react';
import { Character } from '../components/art';
import { HelpButton } from '../components/HelpSheet';
import { RoundStandings, useStandingsStep } from '../components/RoundStandings';
import { TeamChatButton } from '../components/TeamChatSheet';
import { Confetti, MuteButton, Timer } from '../components/ui';
import { TEAM } from '../games/teams';
import { AR, send, type RoomView, type WordsGameView } from '../net';
import { gameOver, music, sfx } from '../sound';

type P = { room: RoomView; g: WordsGameView };

const KIND_BG = { t0: '#4D9DFF', t1: '#FF8A3D', n: '#F3E6C4', b: '#111' } as const;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v: number) => { v = clamp(v); const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const act = (action: string, payload?: unknown) => send('game:act', { game: 'words', action, payload });
const useWho = (room: RoomView) => ({
  name: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? '؟',
  avatar: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.avatar ?? 'c1'
});
const wordSize = (w: string) => (w.length > 8 ? 11 : w.length > 6 ? 13 : 15);

export function WordsGame(props: P) {
  switch (props.g.phase) {
    case 'boardEnd': return <BoardEnd {...props} />;
    case 'final': return <MatchEnd {...props} />;
    default: return <Play {...props} />;
  }
}

/* ---------- the two team chips + the clock ---------- */

function TopBar({ room, g }: P) {
  return (
    <>
      <div className="row between" style={{ gap: 8 }}>
        <span className="display" style={{ fontSize: 20 }}>شبكة الكلمات</span>
        <div className="row" style={{ gap: 6 }}>
          <TeamChatButton room={room} game="words" team={g.team} chat={g.chat} />
          <HelpButton gameId="words" />
          <MuteButton />
        </div>
      </div>
      <section className="wd-top">
        {([0, 1] as const).map((t) => (
          <div key={t} className={`wd-team${g.turn === t ? ' on' : ''}`} style={g.turn === t ? { background: TEAM[t].color } : undefined}>
            <span style={{ fontSize: 12.5, fontWeight: 900 }}>{TEAM[t].name}{g.turn === t ? (g.team === t ? ' · دوركم' : ' · دورهم') : ''}</span>
            <b className="display">فاضل {AR(g.remaining[t])}</b>
          </div>
        ))}
        <span className="wd-clock">{g.endsAt ? <Timer endsAt={g.endsAt} /> : <span style={{ fontSize: 13, fontWeight: 900 }}>وقت مفتوح</span>}</span>
      </section>
    </>
  );
}

/* ---------- guide, guesser, watcher ---------- */

function Play({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const isGuide = g.role === 'guide' || g.role === 'guide-wait';
  const [word, setWord] = useState('');
  const [num, setNum] = useState(2);
  const maxNum = Math.max(1, Math.min(7, g.remaining[g.turn]));
  useEffect(() => { setNum((n) => Math.min(n, maxNum)); }, [maxNum]);
  const [err, setErr] = useState('');
  const guideOnTurn = g.guides[g.turn];

  // sounds: your turn to give a clue / to guess, and what each flip did
  useEffect(() => { if (g.role === 'guide' && g.phase === 'clue') sfx.turn(); }, [g.role, g.phase, g.turn]);
  useEffect(() => { if (g.role === 'guesser' && g.phase === 'guess') sfx.turn(); }, [g.role, g.phase, g.clue?.word]);
  const lastKey = g.last ? `${g.last.word}-${g.boardNo}` : '';
  useEffect(() => {
    if (!g.last) return;
    // every device hears the same thing once a card is flipped (the colour is public by then): flip, then what it was
    sfx.flip();
    const k = g.last.kind;
    const t = setTimeout(() => (k === 'own' ? sfx.confirm : k === 'neutral' ? sfx.soft : k === 'enemy' ? sfx.error : sfx.boom)(), 260);
    return () => clearTimeout(t);
  }, [lastKey]);

  const sendClue = async () => {
    setErr('');
    const r = await act('clue', { word: word.trim(), num });
    if (!r.ok) { setErr(r.error ?? 'مش مظبوط'); sfx.error(); } else { sfx.confirm(); setWord(''); }
  };
  const tap = async (i: number) => {
    if (g.role !== 'guesser' || g.phase !== 'guess' || g.cards[i].flipped) return;
    sfx.card();
    await act('mark', { i });
  };
  const lead = (() => {
    const e = Object.entries(g.marks);
    if (g.knobs.secretPicks) return g.myMark;
    const max = Math.max(0, ...e.map(([, v]) => v.length));
    const top = e.filter(([, v]) => v.length === max && max > 0);
    return top.length === 1 ? Number(top[0][0]) : null;
  })();
  const flip = async () => { sfx.flip(); const r = await act('flip'); if (!r.ok) sfx.error(); };

  const msg = g.last && g.phase !== 'guess' ? null : g.last;
  const toast = g.last ? ({ own: ['صح! كمّلوا', '#3DDC97'], neutral: ['كلمة عادية · الدور خلص', '#fff'], enemy: [`دي بتاعة ${TEAM[g.last.team === 0 ? 1 : 0].name}! · الدور خلص`, TEAM[g.last.team === 0 ? 1 : 0].color], bomb: ['قنبلة!', '#FF8080'] } as const)[g.last.kind] : null;
  void msg;

  const banner = isGuide
    ? <div className="wd-banner"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="#FFD23F" stroke="#111" strokeWidth="1.5" /><circle cx="12" cy="12" r="3.5" fill="#111" /></svg><span>إنت الدليل · الألوان دي إنت بس اللي شايفها</span></div>
    : null;

  return (
    <main className="screen wd-screen">
      <TopBar room={room} g={g} />
      {banner}

      {/* the clue card (once given) */}
      {g.clue && (
        <section className="wd-clue">
          <Character id={avatar(g.clue.guideId)} size={40} />
          <div className="col grow" style={{ lineHeight: 1.2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800 }}>تلميح {name(g.clue.guideId)} (الدليل)</span>
            <span style={{ fontFamily: 'Marhey, Cairo, sans-serif', fontWeight: 700, fontSize: 26 }}>{g.clue.word} · {AR(g.clue.num)}</span>
          </div>
          <div className="col center" style={{ background: '#FFF3C4', border: '2px solid #111', borderRadius: 12, padding: '2px 8px' }}>
            <b className="display" style={{ fontSize: 22, lineHeight: 1.1 }}>{AR(g.tries)}</b><span style={{ fontSize: 10, fontWeight: 900 }}>محاولات</span>
          </div>
        </section>
      )}

      <section className="wd-grid">
        {g.cards.map((c, i) => {
          const key = g.keys?.[i] ?? null;
          const showKey = key !== null && !c.flipped;
          const marks = g.marks[i] ?? [];
          const mine = g.myMark === i;
          const sel = marks.length > 0 || mine;
          return (
            <button key={i} className="wd-card" disabled={c.flipped || g.role !== 'guesser' || g.phase !== 'guess'} aria-pressed={sel} onClick={() => tap(i)} style={{ transform: `rotateY(${c.flipped ? 180 : 0}deg)` }}>
              <span className="wd-face" style={{ background: showKey ? KIND_BG[key!] : sel ? '#DCEBFF' : '#fff', color: key === 'b' ? '#fff' : '#111', boxShadow: sel ? '0 0 0 3px #4D9DFF' : showKey ? 'none' : '2px 2px 0 #111', fontSize: wordSize(c.word) }}>
                {c.word}
                {key === 'b' && <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', top: 3, left: 3 }}><circle cx="11" cy="14" r="7" fill="#FF4F9A" stroke="#fff" strokeWidth="1.6" /><path d="M15 8l3-3M18 3l1 2M20 6l-2 0" stroke="#FFD23F" strokeWidth="2" strokeLinecap="round" /></svg>}
              </span>
              <span className="wd-face wd-back" style={{ background: c.kind ? KIND_BG[c.kind] : '#fff', color: c.kind === 'b' ? '#fff' : '#111', fontSize: wordSize(c.word) - 1 }}>{c.word}</span>
              {marks.length > 0 && <span className="wd-marks">{marks.map((id) => <i key={id}><Character id={avatar(id)} size={20} /></i>)}</span>}
            </button>
          );
        })}
      </section>

      {isGuide && (
        <div className="wd-legend">
          <span><i style={{ background: '#4D9DFF' }} />الأزرق</span><span><i style={{ background: '#FF8A3D' }} />البرتقالي</span><span><i style={{ background: '#F3E6C4' }} />عادية</span><span><i style={{ background: '#111' }} />القنبلة</span><span style={{ opacity: 0.6, textDecoration: 'line-through' }}>اتقلبت</span>
        </div>
      )}

      {toast && <div key={lastKey} className="wd-toast" style={{ background: toast[1] }}>{toast[0]}</div>}

      {/* guide giving a clue */}
      {g.role === 'guide' && g.phase === 'clue' && (
        <>
          <section className="wd-cluebox">
            <span style={{ fontWeight: 900, fontSize: 14 }}>اديهم كلمة واحدة ورقم</span>
            <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
              <input className="wd-input" value={word} maxLength={16} aria-label="التلميح" placeholder="كلمة واحدة" onChange={(e) => { setWord(e.target.value.replace(/\s/g, '')); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') sendClue(); }} />
              <div className="wd-step">
                <button aria-label="أقل" onClick={() => { sfx.soft(); setNum(Math.max(1, num - 1)); }}>−</button>
                <b className="display">{AR(num)}</b>
                <button aria-label="أكتر" onClick={() => { sfx.soft(); setNum(Math.min(maxNum, num + 1)); }}>+</button>
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: err ? '#B3261E' : undefined }}>{err || 'الرقم = كام كلمة من بتوعنا ليها علاقة بالتلميح · ممنوع كلمة من اللوحة نفسها'}</span>
          </section>
          <button className="btn black big full push" disabled={!word.trim()} style={{ boxShadow: `0 6px 0 ${TEAM[g.turn].color}` }} onClick={sendClue}>ابعت «{word.trim() || '…'} · {AR(num)}»</button>
        </>
      )}
      {g.role === 'guide-wait' && g.phase === 'clue' && <span className="label push" style={{ textAlign: 'center' }}>الدليل التاني بيفكر في تلميح…</span>}
      {g.role === 'guide' && g.phase === 'guess' && <span className="label push" style={{ textAlign: 'center' }}>فريقك بيخمّن… متنطقش بحاجة 🤐</span>}
      {g.role === 'guide-wait' && g.phase === 'guess' && <span className="label push" style={{ textAlign: 'center' }}>الفريق التاني بيخمّن</span>}

      {/* the team on turn, before the clue arrives */}
      {g.role === 'guesser' && g.phase === 'clue' && <span className="label push" style={{ textAlign: 'center' }}>دليلكم ({name(guideOnTurn)}) بيفكر في تلميح…</span>}
      {g.role === 'watcher' && <span className="label push" style={{ textAlign: 'center' }}>{g.phase === 'clue' ? `دليل ${TEAM[g.turn].name} بيفكر في تلميح` : `فريق ${TEAM[g.turn].name} بيخمّن… شوفوا القلبات`}</span>}

      {g.role === 'guesser' && g.phase === 'guess' && (
        <div className="col push" style={{ gap: 8 }}>
          <span style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800 }}>{g.knobs.secretPicks ? (lead !== null ? 'اختياراتكم سرّية · الأغلبية هي اللي بتتقلب' : 'اختار كلمة · اختياراتكم سرّية') : lead !== null ? 'اتفقتوا؟ اقلبوا الكلمة' : 'دوسوا على كلمة · كل واحد بيبان على اللي اختارها'}</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn black grow" style={{ height: 56, fontSize: 20, boxShadow: lead !== null ? `0 5px 0 ${TEAM[g.turn].color}` : 'none', opacity: lead !== null || g.myMark !== null ? 1 : 0.6 }} onClick={flip} disabled={g.myMark === null && lead === null}>{lead !== null ? `اقلب «${g.cards[lead].word}»` : 'اختار كلمة الأول'}</button>
            <button className="btn" style={{ width: 104, height: 56, lineHeight: 1.3 }} onClick={async () => { sfx.tap(); const r = await act('endTurn'); if (!r.ok) sfx.error(); }}>كفاية كده</button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------- end of a board: the bomb or the win ---------- */

function BoardEndView({ room, g }: P) {
  const r = g.result!;
  const bomb = r.kind === 'bomb';
  const { name } = useWho(room);
  const isHost = room.hostId === room.youId;
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const B = 1.4; // the boom moment
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setT(9); return; }
    music.dip(2.5);
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 6.5) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    const timer = setTimeout(() => (bomb ? sfx.boom() : sfx.win()), bomb ? B * 1000 : 900);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(timer); };
  }, []);
  const pre = t < B;
  const boomed = bomb && t > B;
  const shake = bomb && t > B - 0.6 && t < B + 0.5 ? (t < B ? 2 : 9) * Math.sin(t * 80) * (t < B ? 1 : 1 - (t - B) / 0.5) : 0;
  const after = clamp((t - B) / 0.8);
  const winnerName = TEAM[r.winner].name;
  const left = g.cards.filter((c) => !c.flipped);
  const winWords = g.cards.filter((c) => c.kind === (r.winner === 0 ? 't0' : 't1')).slice(0, 6);
  const rings = [0, 1, 2].map((k) => { const p = clamp((t - B - k * 0.12) / 0.7); return { size: 60 + 220 * ease(p), op: t > B ? 1 - p : 0, color: ['#FFD23F', '#FF8A3D', '#E2433B'][k] }; });
  void after;
  return (
    <main className="screen wd-end" style={{ background: boomed ? 'radial-gradient(circle at 50% 27%, #5A2219 0%, #2E1517 42%, #170C0E 100%)' : '#FFD23F', color: boomed ? '#fff' : '#111', transform: `translate(${shake.toFixed(1)}px, ${(shake * 0.4).toFixed(1)}px)` }}>
      {bomb && t > B && t < B + 0.35 && <div className="wd-flash" style={{ opacity: 1 - (t - B) / 0.35 }} />}
      <div className="row between" style={{ width: '100%', position: 'relative' }}>
        <span className="wd-tag">{bomb ? `${name(r.by)} قلب «${r.word}»` : `${winnerName} قلب آخر كلمة`}</span>
        <MuteButton />
      </div>
      <div className="wd-stage">
        {bomb && rings.map((x, i) => <span key={i} aria-hidden="true" style={{ position: 'absolute', width: x.size, height: x.size, borderRadius: '50%', border: `6px solid ${x.color}`, opacity: x.op }} />)}
        {bomb && pre && (
          <svg width="170" height="170" viewBox="0 0 64 64" aria-hidden="true" style={{ transform: `scale(${(1 + 0.06 * Math.sin(t * 30) * clamp(t / B)).toFixed(3)}) rotate(${(4 * Math.sin(t * 22)).toFixed(1)}deg)` }}>
            <circle cx="28" cy="38" r="20" fill="#111" stroke="#fff" strokeWidth="3" /><circle cx="21" cy="31" r="5" fill="#fff" opacity=".35" />
            <rect x="34" y="14" width="10" height="9" rx="2" transform="rotate(35 39 18)" fill="#555" stroke="#fff" strokeWidth="2.5" /><path d="M44 12q6-6 12-2" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="56" cy="10" r={3 + 2 * Math.abs(Math.sin(t * 25))} fill="#FFD23F" stroke="#FF8A3D" strokeWidth="2" />
          </svg>
        )}
        {!bomb && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 62px)', gap: 8, transform: `scale(${back((t - 0.1) / 0.6).toFixed(2)})` }}>
            {winWords.map((c, i) => <span key={i} className="wd-win-card" style={{ background: KIND_BG[r.winner === 0 ? 't0' : 't1'], transform: `rotate(${(i % 2 ? 1 : -1) * (2 + i)}deg)` }}>{c.word}</span>)}
          </div>
        )}
        <span className="wd-boom" style={{ color: bomb ? '#fff' : '#FFD23F', transform: `scale(${(bomb ? back((t - B) / 0.45) : back((t - 0.9) / 0.45)).toFixed(2)}) rotate(-8deg)`, opacity: bomb ? (t > B ? 1 : 0) : clamp((t - 0.9) / 0.2) * (1 - clamp((t - 2.2) / 0.4)) }}>{bomb ? 'بوووم!' : g.team === r.winner ? 'كسبنا!' : 'كسبوا!'}</span>
      </div>
      <Confetti fire={!bomb && t > 0.9 ? 1 : 0} amount={120} from="top" />
      <h1 className="display" style={{ fontSize: 36, lineHeight: 1.2, textAlign: 'center', opacity: clamp((t - (bomb ? B + 0.5 : 1)) / 0.3), textShadow: boomed ? '3px 3px 0 #000' : 'none' }}>
        {bomb ? `${TEAM[r.loser!].name} قلب القنبلة` : `${winnerName} كسب اللوحة!`}
      </h1>
      {!bomb && <span className="wd-sub" style={{ opacity: clamp((t - 1) / 0.3) }}>{r.margin > 0 ? `كشفوا كل كلماتهم وفاضل للتاني ${AR(r.margin)}` : 'كشفوا كل كلماتهم'}</span>}
      {bomb && (
        <div className="row" style={{ alignSelf: 'stretch', gap: 10, opacity: clamp((t - B - 0.5) / 0.3) }}>
          <div className="wd-verdict" style={{ background: TEAM[r.winner].color, color: '#111', transform: 'rotate(-2deg)' }}><b>{winnerName}</b><span className="display" style={{ fontSize: 20 }}>كسب</span></div>
          <div className="wd-verdict" style={{ background: '#3A2A2C', transform: 'rotate(1.5deg)' }}><b style={{ opacity: 0.7 }}>{TEAM[r.loser!].name}</b><span className="display" style={{ fontSize: 20, textDecoration: 'line-through', textDecorationColor: '#E2433B', textDecorationThickness: 3 }}>خسر</span></div>
        </div>
      )}
      <section className="wd-left" style={{ opacity: clamp((t - (bomb ? B + 0.9 : 1.4)) / 0.4) }}>
        <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>الكلمات اللي فضلت</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {left.map((c, i) => <span key={i} style={{ border: '2px solid #111', borderRadius: 10, padding: '1px 10px', fontWeight: 900, fontSize: 13, background: c.kind ? KIND_BG[c.kind] : '#fff', color: c.kind === 'b' ? '#fff' : '#111' }}>{c.word}</span>)}
        </div>
      </section>
      <div className="col push" style={{ alignSelf: 'stretch', gap: 8 }}>
        {g.wins[0] + g.wins[1] > 0 && g.boards > 1 && <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 900 }}>الماتش: {TEAM[0].name} {AR(g.wins[0])} – {AR(g.wins[1])} {TEAM[1].name}</span>}
        {isHost ? <button className="btn big full" style={{ background: bomb ? '#FFD23F' : '#111', color: bomb ? '#111' : '#FFD23F', boxShadow: `0 6px 0 ${bomb ? '#FF8A3D' : '#4D9DFF'}` }} onClick={() => { sfx.confirm(); act('next'); }}>{g.wins[0] >= g.need || g.wins[1] >= g.need || g.boardNo >= g.boards ? 'نتيجة الماتش' : 'لوحة جديدة'}</button> : <span className="label" style={{ textAlign: 'center', color: boomed ? '#fff' : undefined }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}

/** The board result first, then the shared team standings in the last seconds (not when the match is decided). */
function BoardEnd(props: P) {
  const { room, g } = props;
  const decided = g.wins[0] >= g.need || g.wins[1] >= g.need || g.boardNo >= g.boards;
  const st = useStandingsStep(g.endsAt, !decided && !!g.result);
  if (!st || !g.result) return <BoardEndView {...props} />;
  const teams = ([0, 1] as const).map((t) => ({ name: TEAM[t].name, color: TEAM[t].color, total: g.wins[t], gain: g.result!.winner === t ? 1 : 0, ids: g.participants.filter((id) => g.teams[id] === t) }));
  const hl = g.result.kind === 'bomb' ? `اللوحة دي: ${TEAM[g.result.loser!].name} قلب القنبلة` : `اللوحة دي: ${TEAM[g.result.winner].name} كشف كل كلماته`;
  return <RoundStandings room={room} game="words" noun="لوحة" unit="لوحة" round={g.boardNo} rounds={g.boards} highlight={hl} teams={teams} endsAt={g.endsAt} onNext={() => act('next')} />;
}

/* ---------- the match result ---------- */

function MatchEnd({ room, g }: P) {
  const { name } = useWho(room);
  const isHost = room.hostId === room.youId;
  const f = g.final!;
  const [t, setT] = useState(0);
  const [boom, setBoom] = useState(0);
  const raf = useRef(0);
  const at = (i: number) => 0.3 + i * 0.55;
  const T = at(g.history.length) + 0.2;
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    music.dip(3);
    const stopSound = gameOver(g.team !== null && f.winner !== null ? (g.team === f.winner ? 'win' : 'lose') : null);
    if (reduced) { setT(20); setBoom(1); return stopSound; }
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 8) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    const fan = setTimeout(() => setBoom(1), T * 1000);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(fan); stopSound(); };
  }, []);
  const w = f.winner;
  const shown = [0, 0];
  g.history.forEach((h, i) => { if (t > at(i) + 0.3) shown[h.winner]++; });
  const winners = w === null ? room.players.filter((p) => g.participants.includes(p.id)) : room.players.filter((p) => g.teams[p.id] === w);
  return (
    <main className="screen wd-screen">
      <Confetti fire={boom} amount={160} from="top" />
      <section className="col center" style={{ position: 'relative', gap: 4, paddingTop: 10 }}>
        <div aria-hidden="true" className="qz-rays" style={{ opacity: clamp((t - T - 0.2) / 0.5) }} />
        <svg width="104" height="104" viewBox="0 0 64 64" aria-hidden="true" style={{ position: 'relative', transform: `scale(${(0.3 + 0.7 * back((t - T) / 0.6)).toFixed(2)}) rotate(${(-20 * (1 - clamp((t - T) / 0.7))).toFixed(1)}deg)` }}>
          <path d="M18 8h28v14a14 14 0 01-28 0z" fill="#FFD23F" stroke="#111" strokeWidth="3" strokeLinejoin="round" /><path d="M18 12H9a8 8 0 008 10M46 12h9a8 8 0 01-8 10" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M28 36h8v8h-8z" fill="#FF8A3D" stroke="#111" strokeWidth="3" /><path d="M20 44h24v8H20z" fill="#4D9DFF" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        <span style={{ position: 'relative', fontSize: 13, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '0 12px', opacity: clamp((t - T - 0.3) / 0.3) }}>خلص الماتش{g.boards > 1 ? ` · أحسن من ${AR(g.boards)} لوحات` : ''}</span>
        <h1 className="display" style={{ position: 'relative', fontSize: 36, lineHeight: 1.15, textAlign: 'center', opacity: clamp((t - T - 0.3) / 0.3), transform: `translateY(${(12 * (1 - ease((t - T - 0.3) / 0.4))).toFixed(1)}px)` }}>{w === null ? 'تعادل!' : `${TEAM[w].name} كسب الماتش!`}</h1>
        <div className="row" style={{ position: 'relative', gap: 6, marginTop: 4, opacity: clamp((t - T - 0.3) / 0.3), flexWrap: 'wrap', justifyContent: 'center' }}>
          {winners.slice(0, 5).map((p, i) => <span key={p.id} style={{ animation: `hop .6s ease-in-out ${i * 0.15}s infinite`, display: 'flex' }}><Character id={p.avatar} size={46} /></span>)}
        </div>
      </section>
      <section className="qz-bars" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
          {([1, 0] as const).map((tm, k) => (
            <span key={tm} className="row" style={{ gap: 14 }}>
              {k === 1 && <span className="display" style={{ fontSize: 28 }}>–</span>}
              <span className="col center" style={{ lineHeight: 1 }}><span style={{ fontSize: 12, fontWeight: 900 }}>{TEAM[tm].name}</span><span className="display" style={{ fontSize: 40, background: TEAM[tm].color, border: '3px solid #111', borderRadius: 14, padding: '2px 14px', marginTop: 4 }}>{AR(shown[tm])}</span></span>
            </span>
          ))}
        </div>
        <div className="col" style={{ gap: 6 }}>
          {g.history.map((h, i) => (
            <div key={h.n} style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', gap: 8, alignItems: 'center', opacity: clamp((t - at(i)) / 0.3), transform: `translateX(${(-16 * (1 - ease((t - at(i)) / 0.4))).toFixed(1)}px)` }}>
              <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>لوحة {AR(h.n)}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{h.how}</span>
              <span style={{ fontSize: 12, fontWeight: 900, background: TEAM[h.winner].color, border: '2px solid #111', borderRadius: 99, padding: '0 10px' }}>{TEAM[h.winner].name}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid2">
        {f.awards.map((a, i) => {
          const k = T + 0.8 + i * 0.15;
          const tm = a.id ? g.teams[a.id] : null;
          return (
            <div key={a.k} className="qz-stat" style={{ padding: '8px 10px', opacity: clamp((t - k) / 0.3), transform: `translateY(${(14 * (1 - ease((t - k) / 0.4))).toFixed(1)}px)` }}>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, border: '2px solid #111', background: tm === null || tm === undefined ? '#ddd' : TEAM[tm].color }} /><span style={{ fontSize: 11.5, fontWeight: 900, opacity: 0.75 }}>{a.k}</span></span>
              <span className="display" style={{ fontSize: 19 }}>{a.id ? name(a.id) : '—'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800 }}>{a.why}</span>
            </div>
          );
        })}
      </section>
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" style={{ boxShadow: '0 6px 0 #FF8A3D' }} onClick={() => { sfx.tap(); send('game:again'); }}>ماتش جديد</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
