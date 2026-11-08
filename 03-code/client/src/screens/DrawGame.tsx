import { useEffect, useMemo, useRef, useState } from 'react';
import { Character } from '../components/art';
import { DrawCanvas, Strokes } from '../components/DrawCanvas';
import { HelpButton } from '../components/HelpSheet';
import { Ring } from '../components/Ring';
import { RoundStandings, useStandingsStep } from '../components/RoundStandings';
import { Confetti, MuteButton } from '../components/ui';
import { AR, send, serverNow, socket, type DrawGameView, type DrawOp, type DrawStroke, type RoomView } from '../net';
import { gameOver, music, sfx } from '../sound';

type P = { room: RoomView; g: DrawGameView };

const LEVEL_NAME: Record<string, string> = { easy: 'سهلة', medium: 'متوسطة', hard: 'صعبة', max: 'ماكس' };
const LEVEL_BG: Record<string, string> = { easy: '#3DDC97', medium: '#4D9DFF', hard: '#FF8A3D', max: '#FF4F9A' };
const SHAPE = [{ name: 'سهلة', c: '#3DDC97', tip: 'شكل بسيط' }, { name: 'متوسطة', c: '#4D9DFF', tip: 'فيها تفاصيل' }, { name: 'صعبة', c: '#FF8A3D', tip: 'فكرة صعبة الرسم' }];
const SIZES = [{ w: 5, d: 6 }, { w: 10, d: 10 }, { w: 18, d: 16 }];
const act = (action: string, payload?: unknown) => send('game:act', { game: 'draw', action, payload });
const useWho = (room: RoomView) => ({
  name: (id: string | null | undefined) => (id === room.youId ? 'إنت' : room.players.find((p) => p.id === id)?.name ?? '؟'),
  avatar: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.avatar ?? 'c1'
});
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** The strokes of the current round as a guesser sees them: the snapshot, plus the live `draw:delta` pushes applied in order. */
function useLiveStrokes(g: DrawGameView) {
  const [live, setLive] = useState({ round: g.round, rev: g.rev, strokes: g.strokes });
  useEffect(() => {
    setLive((cur) => (g.round !== cur.round || g.rev >= cur.rev ? { round: g.round, rev: g.rev, strokes: g.strokes } : cur));
  }, [g.round, g.rev, g.strokes]);
  useEffect(() => {
    const on = (d: { round: number; base: number; rev: number; ops: DrawOp[] }) => setLive((cur) => {
      if (d.round !== cur.round || d.base !== cur.rev) return cur; // a gap: the next snapshot repairs it
      let strokes = cur.strokes;
      for (const o of d.ops) {
        if (o.op === 'start') strokes = [...strokes, { id: o.id, c: o.c, w: o.w, pts: [] }];
        else if (o.op === 'pts') strokes = strokes.map((s) => (s.id === o.id ? { ...s, pts: [...s.pts, ...o.pts] } : s));
        else if (o.op === 'undo') strokes = strokes.slice(0, -1);
        else strokes = [];
      }
      return { round: cur.round, rev: d.rev, strokes };
    });
    socket.on('draw:delta', on);
    return () => { socket.off('draw:delta', on); };
  }, []);
  return live.strokes;
}

export function DrawGame(props: P) {
  switch (props.g.phase) {
    case 'pick': return <Pick {...props} />;
    case 'draw':
    case 'guess': return <Canvas {...props} />;
    case 'reveal': return <Reveal {...props} />;
    default: return <Final {...props} />;
  }
}

function TopBar({ g }: { g: DrawGameView }) {
  return (
    <div className="row between">
      <div className="row" style={{ gap: 8 }}><span className="display" style={{ fontSize: 20 }}>ارسم وخمّن</span><span className="chip">جولة {AR(g.round)} من {AR(g.rounds)}</span></div>
      <div className="row" style={{ gap: 6 }}><HelpButton gameId="draw" /><MuteButton /></div>
    </div>
  );
}

/* ---------- pick a word ---------- */

function Pick({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const [sel, setSel] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (g.isDrawer) sfx.turn(); }, []);
  const go = async () => { if (sel === null || sent) return; setSent(true); sfx.confirm(); const r = await act('pickWord', { i: sel }); if (!r.ok) setSent(false); };
  return (
    <main className="screen dr-screen">
      <TopBar g={g} />
      {g.isDrawer && g.choices ? (
        <>
          <div className="row" style={{ gap: 12 }}>
            <div className="col grow">
              <span style={{ fontSize: 13, fontWeight: 900 }}>دورك ترسم!</span>
              <span className="display" style={{ fontSize: 28, lineHeight: 1.2 }}>اختار كلمة</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, marginTop: 2 }}>كلمات مستوى <span className="au-level" style={{ background: LEVEL_BG[g.level] }}>{LEVEL_NAME[g.level]}</span> · كل ما المستوى يعلى الكلمات تصعب</span>
            </div>
            <Ring endsAt={g.endsAt} color="#FF4F9A" />
          </div>
          <div className="col" style={{ gap: 12 }}>
            {g.choices.map((c, k) => {
              const sh = SHAPE[c.shape - 1];
              const on = sel === c.i;
              return (
                <button key={c.i} className="dr-word" onClick={() => { sfx.card(); setSel(on ? null : c.i); }} style={{ background: on ? '#DCEBFF' : '#fff', boxShadow: on ? 'none' : '4px 4px 0 #111', transform: on ? 'translate(4px,4px)' : 'none', animationDelay: `${k * 0.08}s` }}>
                  <div className="col grow" style={{ gap: 2, textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 900 }}><span style={{ background: sh.c, border: '2px solid #111', borderRadius: 99, padding: '0 8px' }}>{sh.name}</span></span>
                    <span className="display" style={{ fontSize: 34, lineHeight: 1.2 }}>{c.w}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{sh.tip}</span>
                  </div>
                  <div className="col center" style={{ background: '#111', color: '#FFD23F', borderRadius: 16, padding: '6px 12px' }}><b className="display" style={{ fontSize: 26, lineHeight: 1 }}>{AR(c.pts)}</b><span style={{ fontSize: 11, fontWeight: 900 }}>نقطة</span></div>
                </button>
              );
            })}
          </div>
          <div className="col push" style={{ gap: 6 }}>
            <button className="btn big full" disabled={sel === null || sent} style={{ boxShadow: '0 6px 0 #FF4F9A' }} onClick={go}>{sel === null ? 'اختار كلمة الأول' : 'يلا نرسم'}</button>
            <span style={{ fontSize: 12.5, fontWeight: 800, textAlign: 'center' }}>لو الوقت خلص من غير ما تختار، بنختارلك السهلة</span>
          </div>
        </>
      ) : (
        <>
          <div className="col center grow" style={{ gap: 14, textAlign: 'center' }}>
            <div className="dr-bubble">
              <Character id={avatar(g.drawer)} size={110} />
              <svg width="64" height="64" viewBox="0 0 48 48" aria-hidden="true" style={{ position: 'absolute', bottom: -6, left: -10, animation: 'drWiggle .7s ease-in-out infinite' }}><g transform="rotate(-45 26 22)"><rect x="12" y="17" width="24" height="10" fill="#FFD23F" stroke="#111" strokeWidth="2.5" /><rect x="36" y="17" width="7" height="10" rx="2" fill="#FF4F9A" stroke="#111" strokeWidth="2.5" /><path d="M12 17L4 22l8 5z" fill="#F3D9B1" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" /><path d="M4 22l3-1.9v3.8z" fill="#111" /></g></svg>
            </div>
            <span className="display" style={{ fontSize: 28 }}>{name(g.drawer)} بيختار كلمة…</span>
            <span style={{ fontSize: 13, fontWeight: 800 }}>جهّز نفسك تخمّن · كل ما تخمّن أسرع تاخد أكتر</span>
            <Ring endsAt={g.endsAt} color="#FF4F9A" />
          </div>
          <div className="dr-queue">
            <span style={{ fontSize: 12, fontWeight: 900 }}>الدور على مين؟</span>
            <div className="row" style={{ gap: 8 }}>
              {g.queue.map((id, i) => (
                <span key={`${id}-${i}`} className="col center" style={{ gap: 2, opacity: i === 0 ? 1 : 0.6 }}>
                  <span style={{ borderRadius: '50%', boxShadow: i === 0 ? '0 0 0 3px #FFD23F, 0 0 0 5px #111' : 'none', display: 'flex' }}><Character id={avatar(id)} size={36} /></span>
                  <span style={{ fontSize: 11, fontWeight: 900 }}>{name(id)}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/* ---------- draw and guess (the same canvas, two phases) ---------- */

function Canvas({ room, g }: P) {
  const drawing = g.phase === 'draw';
  const isDrawer = g.isDrawer;
  const live = useLiveStrokes(g);

  // sounds
  useEffect(() => {
    if (isDrawer && drawing) sfx.start();
    if (!isDrawer && g.phase === 'guess') sfx.turn(); // guessing opens: chime + buzz for the guessers
    if (isDrawer && g.phase === 'guess') sfx.stamp(); // the drawing was handed in
  }, [g.phase]);
  const solved = g.solvedIds.length;
  const prevSolved = useRef(solved);
  useEffect(() => { if (solved > prevSolved.current && !g.me?.guessed) sfx.pop(); prevSolved.current = solved; }, [solved]);
  const prevGuessed = useRef(!!g.me?.guessed);
  useEffect(() => { if (g.me?.guessed && !prevGuessed.current) { sfx.gotcha(); } prevGuessed.current = !!g.me?.guessed; }, [g.me?.guessed]);
  const tries = g.me?.mine.length ?? 0;
  const prevTries = useRef(tries);
  useEffect(() => {
    if (tries > prevTries.current && g.me) {
      const last = g.me.mine[tries - 1];
      if (!g.me.guessed) { if (last.near) sfx.near(); else sfx.soft(); }
      if (g.me.attemptsLeft === 0 && !g.me.guessed) setTimeout(() => sfx.error(), 250);
    }
    prevTries.current = tries;
  }, [tries]);

  const label = drawing ? 'بيرسم دلوقتي' : 'سلّم الرسمة · خمّنوا!';
  return (
    <main className="screen dr-screen">
      <TopBar g={g} />
      {isDrawer ? <DrawerPad room={room} g={g} /> : <Guesser room={room} g={g} live={live} label={label} />}
    </main>
  );
}

function SolvedStrip({ room, g }: P) {
  const { avatar } = useWho(room);
  const guessers = g.participants.filter((id) => id !== g.drawer);
  return (
    <div className="dr-strip">
      <span style={{ fontSize: 12, fontWeight: 900 }}>{AR(g.solvedIds.length)} من {AR(guessers.length)} خمّنوها</span>
      <span className="row" style={{ marginInlineStart: 'auto', gap: 4 }}>
        {guessers.map((id) => (
          <span key={id} style={{ position: 'relative', display: 'flex', opacity: g.solvedIds.includes(id) ? 1 : 0.55 }}>
            <Character id={avatar(id)} size={28} />
            {g.solvedIds.includes(id) && <span className="dr-tick">✓</span>}
          </span>
        ))}
      </span>
    </div>
  );
}

function DrawerPad({ room, g }: P) {
  const drawing = g.phase === 'draw';
  const [strokes, setStrokes] = useState<DrawStroke[]>(g.strokes);
  const [color, setColor] = useState(g.cfg.colors[0]);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const nextId = useRef(g.strokes.reduce((m, s) => Math.max(m, s.id), 0) + 1);
  const cur = useRef<number | null>(null);
  const buf = useRef<number[]>([]);
  const last = useRef<[number, number]>([0, 0]);

  const flush = () => {
    if (cur.current === null) return;
    while (buf.current.length) act('strokePts', { id: cur.current, pts: buf.current.splice(0, 200) });
  };
  useEffect(() => { const t = setInterval(flush, 33); return () => clearInterval(t); }, []);

  const onStart = (x: number, y: number) => {
    if (!drawing) return;
    const id = nextId.current++;
    const c = eraser ? '#FFFFFF' : color;
    const w = eraser ? SIZES[size].w * 2.2 : SIZES[size].w;
    cur.current = id;
    last.current = [x, y];
    buf.current = [x, y];
    setStrokes((s) => [...s, { id, c, w, pts: [x, y] }]);
    act('strokeStart', { id, c, w: Math.round(w) });
  };
  const onMove = (x: number, y: number) => {
    if (cur.current === null) return;
    if (Math.abs(x - last.current[0]) + Math.abs(y - last.current[1]) < 3) return;
    last.current = [x, y];
    buf.current.push(x, y);
    const id = cur.current;
    setStrokes((s) => s.map((st) => (st.id === id ? { ...st, pts: [...st.pts, x, y] } : st)));
  };
  const onEnd = () => { flush(); cur.current = null; };
  const empty = !strokes.some((s) => s.pts.length > 0);
  const undo = () => { sfx.tap(); setStrokes((s) => s.slice(0, -1)); act('undo'); };
  const clear = () => { sfx.toggleOff(); setStrokes([]); act('clear'); };
  const submit = async () => { if (empty || !drawing) return; flush(); sfx.confirm(); const r = await act('submit'); if (!r.ok) sfx.error(); };

  return (
    <>
      <div className="row" style={{ gap: 10 }}>
        <div className="col grow" style={{ lineHeight: 1.2 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>ارسم الكلمة دي ومتكتبهاش</span>
          <span className="display" style={{ fontSize: 32 }}>{g.word} <span className="au-level" style={{ fontSize: 13, background: '#4D9DFF', verticalAlign: 'middle' }}>{AR(g.pts)}</span></span>
        </div>
        {drawing ? <Ring key="draw" endsAt={g.endsAt} color="#3DDC97" /> : <Ring key="guess" endsAt={g.endsAt} color="#E2433B" />}
      </div>
      <div className="dr-board" style={{ position: 'relative' }}>
        <DrawCanvas strokes={strokes} size={352} onStart={drawing ? onStart : undefined} onMove={onMove} onEnd={onEnd} />
        {drawing && empty && <span className="dr-hintxt">ارسم هنا بصباعك</span>}
        {!drawing && <span className="dr-stamp">اتسلّمت</span>}
      </div>
      {drawing ? (
        <>
          <SolvedStrip room={room} g={g} />
          <div className="row" style={{ gap: 8 }}>
            {g.cfg.colors.map((c) => <button key={c} className="dr-color" aria-label="لون" onClick={() => { sfx.soft(); setColor(c); setEraser(false); }} style={{ background: c, boxShadow: !eraser && color === c ? '0 0 0 3px #fff, 0 0 0 5px #111' : 'none', transform: !eraser && color === c ? 'scale(1.1)' : 'none' }} />)}
            <span style={{ width: 2, height: 28, background: '#111', opacity: 0.2 }} />
            {SIZES.map((z, i) => <button key={i} className="dr-size" aria-label="سُمك" onClick={() => { sfx.soft(); setSize(i); }} style={{ background: size === i ? '#FFD23F' : '#fff' }}><span style={{ width: z.d, height: z.d, borderRadius: '50%', background: '#111' }} /></button>)}
          </div>
          <div className="grid3" style={{ gap: 8 }}>
            {g.cfg.eraser ? <button className="btn" style={{ height: 46, background: eraser ? '#FFD23F' : '#fff' }} onClick={() => { sfx.soft(); setEraser(!eraser); }}>ممحاة</button> : <span />}
            <button className="btn" style={{ height: 46 }} onClick={undo} disabled={empty}>رجوع</button>
            <button className="btn" style={{ height: 46 }} onClick={clear} disabled={empty}>امسح</button>
          </div>
          <div className="col push" style={{ gap: 6 }}>
            <button className="btn big full" disabled={empty} style={{ boxShadow: '0 6px 0 #3DDC97' }} onClick={submit}>خلصت · سلّم الرسمة</button>
            <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>{empty ? 'ارسم حاجة الأول وبعدين سلّمها' : 'أول ما تسلّم، التخمين بيفتح للباقي'}</span>
          </div>
        </>
      ) : (
        <>
          <SolvedStrip room={room} g={g} />
          <Feed room={room} g={g} />
          <span className="label push" style={{ textAlign: 'center' }}>الباقي بيخمّنوا دلوقتي…</span>
        </>
      )}
    </>
  );
}

function Feed({ room, g }: P) {
  const { name, avatar } = useWho(room);
  return (
    <div className="dr-feed">
      {g.feed.map((f, i) => (
        <div key={`${f.id}-${i}`} className="row" style={{ gap: 6, animation: 'slideIn .25s ease-out' }}>
          <Character id={avatar(f.id)} size={24} />
          <span style={{ fontSize: 13, fontWeight: 900, background: f.ok ? '#3DDC97' : '#fff', border: '2px solid #111', borderRadius: 12, padding: '1px 10px' }}>{f.ok ? `${name(f.id)} خمّنتها!` : `${name(f.id)}: ${f.text}`}</span>
        </div>
      ))}
    </div>
  );
}

function Hearts({ left, total }: { left: number; total: number }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill={i < left ? '#FF4F9A' : '#ddd'} stroke="#111" strokeWidth="2.4" /></svg>
      ))}
    </span>
  );
}

function Guesser({ room, g, live, label }: P & { live: DrawStroke[]; label: string }) {
  const { name, avatar } = useWho(room);
  const guessing = g.phase === 'guess';
  const me = g.me;
  const [text, setText] = useState('');
  const [shownHint, setShownHint] = useState(false);
  const locked = !guessing || !me || me.guessed || me.attemptsLeft <= 0;
  const send1 = async () => {
    const t = text.trim();
    if (!t || locked) return;
    setText('');
    const r = await act('guess', { text: t });
    if (!r.ok) sfx.error();
  };
  const useHint = async () => { sfx.flip(); const r = await act('hint'); if (r.ok) setShownHint(true); else sfx.error(); };
  return (
    <>
      <div className="row" style={{ gap: 10 }}>
        <div className="row grow" style={{ gap: 8 }}>
          <Character id={avatar(g.drawer)} size={34} />
          <div className="col" style={{ lineHeight: 1.2, gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>{name(g.drawer)} بيرسم · {AR(g.pts)} نقطة</span>
            {me && <span className="row" style={{ gap: 5, fontSize: 11.5, fontWeight: 900 }}>محاولاتك <Hearts left={me.attemptsLeft} total={g.cfg.attempts} /></span>}
          </div>
        </div>
        <Ring key={g.phase} endsAt={g.endsAt} color={guessing ? '#E2433B' : '#3DDC97'} />
      </div>
      <div className="dr-board" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Strokes strokes={live} size={300} />
        <span className="dr-live"><Character id={avatar(g.drawer)} size={22} /><i />{label}</span>
        {!guessing ? null : <span className="dr-stamp">اتسلّمت</span>}
        {me?.guessed && (
          <div className="dr-won"><span className="display" style={{ fontSize: 40 }}>خمّنتها!</span><b className="display" style={{ background: '#111', color: '#FFD23F', borderRadius: 14, padding: '0 14px', fontSize: 26 }}>+{AR(me.gain)}</b><span style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>استنى الباقي يخمّنوا</span></div>
        )}
      </div>
      <Feed room={room} g={g} />
      {(shownHint || me?.hintLetter) && me?.hintLetter && !me.guessed && (
        <div className="row" style={{ justifyContent: 'center', gap: 10, background: '#fff', border: '2.5px solid #111', borderRadius: 16, padding: '6px 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>الكلمة فيها حرف</span>
          <span className="display" style={{ width: 38, height: 42, border: '2.5px solid #111', borderRadius: 10, background: '#EFE6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, animation: 'flipIn .4s' }}>{me.hintLetter}</span>
          <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>ليك إنت بس</span>
        </div>
      )}
      {me?.canHint && (
        <button className="dr-hint" onClick={useHint}>
          <span className="dr-hintcard">أ</span>
          <span className="col grow" style={{ lineHeight: 1.25, textAlign: 'right' }}><b style={{ fontSize: 13.5 }}>كارت «اكشف حرف»</b><span style={{ fontSize: 11.5, fontWeight: 700 }}>حرف من الكلمة · ليك إنت بس · بتاخد نص النقط</span></span>
        </button>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); send1(); }}>
        <input className="input" style={{ height: 54, flex: 1, opacity: locked ? 0.55 : 1 }} aria-label="تخمينك" disabled={locked} placeholder={!guessing ? 'التخمين هيفتح لما يسلّم الرسمة' : me?.guessed ? 'خمّنتها!' : me && me.attemptsLeft <= 0 ? 'محاولاتك خلصت' : 'اكتب تخمينك'} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn black" type="submit" disabled={locked || !text.trim()} aria-label="ابعت" style={{ width: 54, height: 54, padding: 0 }}>ابعت</button>
      </form>
      <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>{!guessing ? 'استنى الرسّام يسلّم · مفيش عدّ حروف ولا مساحات فاضية' : me && me.mine.length && me.mine[me.mine.length - 1].near && !me.guessed ? 'قريب! جرّب تاني' : 'كل ما تخمّن أسرع تاخد أكتر'}</span>
    </>
  );
}

/* ---------- round end ---------- */

function RevealView({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const res = g.result!;
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    sfx.whoosh();
    music.dip(2);
    const t0 = performance.now();
    const tick = (now: number) => { const s = (now - t0) / 1000; setT(s); if (s < 4) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const left = g.endsAt ? Math.max(0, Math.ceil((g.endsAt - serverNow()) / 1000)) : 0;
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force((n) => n + 1), 500); return () => clearInterval(i); }, []);
  const strokes = g.strokes;
  const k = clamp((t - 0.9) / 1.2);
  const k3 = 1 - Math.pow(1 - k, 3);
  const gainOf = (id: string) => res.gains.find((x) => x.id === id)?.gain ?? (id === g.drawer ? res.drawerGain : 0);
  const rows = g.participants.map((id) => ({ id, gain: gainOf(id), total: (g.scores[id] ?? 0) }));
  const shown = rows.map((r) => ({ ...r, tv: r.total - r.gain + r.gain * k3 })).sort((a, b) => b.tv - a.tv);
  const next = g.queue[1] ?? null;
  const solvedN = res.gains.length;
  return (
    <main className="screen dr-screen">
      <TopBar g={g} />
      <div className="col center" style={{ gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>الكلمة كانت</span>
        <span className="display" style={{ fontSize: 46, lineHeight: 1.1, background: '#fff', border: '3px solid #111', borderRadius: 18, padding: '2px 22px', boxShadow: '5px 5px 0 #111', animation: 'flipIn .5s cubic-bezier(.2,1.3,.4,1)', transformOrigin: '50% 0' }}>{res.word}</span>
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
        <div className="dr-mini"><Strokes strokes={strokes} size={138} /></div>
        <div className="col grow" style={{ justifyContent: 'center', gap: 6 }}>
          <span className="row" style={{ gap: 6 }}><Character id={avatar(g.drawer)} size={34} /><b style={{ fontSize: 15 }}>رسمة {name(g.drawer)}</b></span>
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>{res.skipped ? 'الرسمة مخلصتش، الجولة اتلغت' : `${AR(solvedN)} من ${AR(res.total)} خمّنوها${res.outOf.length ? ` · ${name(res.outOf[0])} خلصت محاولاته` : ''}`}</span>
          {!res.skipped && <span className="display" style={{ alignSelf: 'flex-start', fontSize: 18, background: '#111', color: '#FFD23F', borderRadius: 12, padding: '0 12px', animation: 'drPop .4s .6s both' }}>الرسّام +{AR(res.drawerGain)}</span>}
        </div>
      </div>
      <section className="dr-rows">
        {shown.map((r, i) => {
          const how = res.gains.find((x) => x.id === r.id);
          return (
            <div key={r.id} className="row" style={{ gap: 8, height: 44, borderBottom: i < shown.length - 1 ? '2px solid rgba(17,17,17,.08)' : 0 }}>
              <Character id={avatar(r.id)} size={28} />
              <b style={{ fontSize: 14 }}>{name(r.id)}</b>
              <span style={{ fontSize: 11.5, fontWeight: 800, opacity: 0.7 }}>{r.id === g.drawer ? 'الرسّام' : how ? `${how.hinted ? 'بكارت الحرف · ' : ''}في ${AR(g.cfg.guessSecs - how.left)} ث` : res.outOf.includes(r.id) ? 'خلصت محاولاته' : 'مخمّنش'}</span>
              {r.gain > 0 && <span style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 900, color: '#1F7A52', opacity: clamp((t - 0.6) / 0.3) }}>+{AR(r.gain)}</span>}
              <b className="display num" style={{ width: 46, textAlign: 'left', fontSize: 17, marginInlineStart: r.gain > 0 ? 0 : 'auto' }}>{AR(Math.round(r.tv))}</b>
            </div>
          );
        })}
      </section>
      <div className="row push" style={{ gap: 10, background: '#111', color: '#fff', borderRadius: 18, padding: '10px 14px', boxShadow: '0 6px 0 #FF4F9A' }}>
        {next ? <Character id={avatar(next)} size={40} /> : null}
        <div className="col grow" style={{ lineHeight: 1.25 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFD23F' }}>{next ? 'اللي عليه الدور يرسم' : 'آخر جولة'}</span><span className="display" style={{ fontSize: 22 }}>{next ? name(next) : 'يلا نشوف المعرض'}</span></div>
        <b className="display" style={{ fontSize: 26, color: '#FFD23F' }}>{AR(left)}</b>
      </div>
      {room.hostId === room.youId && <button className="btn full" onClick={() => { sfx.tap(); act('next'); }}>كمّل دلوقتي</button>}
    </main>
  );
}

/** The round-end screen first, then the shared standings in the last seconds (not after the last round). */
function Reveal(props: P) {
  const { room, g } = props;
  const last = g.round >= g.rounds;
  const st = useStandingsStep(g.endsAt, !last);
  if (!st || !g.result) return <RevealView {...props} />;
  const gains: Record<string, number> = {};
  g.result.gains.forEach((x) => { gains[x.id] = x.gain; });
  if (g.drawer) gains[g.drawer] = (gains[g.drawer] ?? 0) + g.result.drawerGain;
  const rows = g.participants.map((id) => ({ id, total: g.scores[id] ?? 0, gain: gains[id] ?? 0 }));
  return <RoundStandings room={room} game="draw" round={g.round} rounds={g.rounds} highlight={`الجولة دي: الكلمة كانت «${g.result.word ?? '؟'}»`} rows={rows} endsAt={g.endsAt} onNext={() => act('next')} />;
}

/* ---------- final: winner and the gallery ---------- */

function Final({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const f = g.final!;
  const isHost = room.hostId === room.youId;
  const [boom, setBoom] = useState(0);
  const winner = f.ranked[0];
  useEffect(() => {
    music.dip(3);
    const stop = gameOver(null);
    const t = setTimeout(() => setBoom(1), 1500);
    return () => { clearTimeout(t); stop(); };
  }, []);
  const like = async (round: number) => { sfx.pop(); await act('like', { round }); };
  const sorted = useMemo(() => f.gallery, [f.gallery]);
  return (
    <main className="screen dr-screen">
      <Confetti fire={boom} amount={150} from="top" />
      <section className="row" style={{ gap: 12 }}>
        <span className="float" style={{ position: 'relative', display: 'flex' }}>
          <Character id={avatar(winner)} size={70} />
          <svg width="34" height="26" viewBox="0 0 26 22" aria-hidden="true" style={{ position: 'absolute', top: -16, left: 18 }}><path d="M2 19L4 6l6 6 3-9 3 9 6-6 2 13z" fill="#FFD23F" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" /></svg>
        </span>
        <div className="col" style={{ lineHeight: 1.2 }}>
          <span style={{ fontSize: 12.5, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '0 10px', alignSelf: 'flex-start' }}>خلصت {AR(g.rounds)} جولات</span>
          <span className="display" style={{ fontSize: 32 }}>{winner === room.youId ? 'إنت كسبت!' : `${name(winner)} كسب!`}</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{AR(g.scores[winner] ?? 0)} نقطة</span>
        </div>
      </section>
      <div className="row between"><span className="display" style={{ fontSize: 22 }}>معرض الليلة</span><span style={{ fontSize: 12, fontWeight: 800 }}>دوس على القلب للرسمة اللي عجبتك</span></div>
      <div className="dr-gallery">
        {sorted.map((gl, i) => (
          <div key={gl.round} className="dr-gcard" style={{ transform: `rotate(${[-2, 1.5, 1, -1.5][i % 4]}deg)`, animationDelay: `${0.2 + i * 0.1}s` }}>
            <div className="dr-gpaper"><Strokes strokes={gl.strokes} size={108} /></div>
            <div className="row" style={{ gap: 4 }}>
              <Character id={avatar(gl.drawer)} size={20} />
              <span style={{ fontSize: 12, fontWeight: 900, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(gl.drawer)} · {gl.word}</span>
              <button className="dr-like" aria-label="عجبتني" disabled={gl.drawer === room.youId} onClick={() => like(gl.round)} style={{ background: gl.mine ? '#FFD6E7' : '#fff' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill="#FF4F9A" stroke="#111" strokeWidth="2.4" /></svg>{AR(gl.likes)}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, background: '#fff', border: '2.5px solid #111', borderRadius: 16, padding: '8px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>فنان الليلة</span>
        <span className="display" style={{ fontSize: 18 }}>{f.artist ? name(f.artist.id) : '—'}</span>
        <span style={{ marginInlineStart: 'auto', fontSize: 12, fontWeight: 800 }}>{f.artist ? `${AR(f.artist.hearts)} قلوب` : 'لسه محدش عمل لايك'}</span>
      </div>
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" style={{ boxShadow: '0 6px 0 #FF4F9A' }} onClick={() => { sfx.tap(); send('game:again'); }}>نلعبها تاني</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
