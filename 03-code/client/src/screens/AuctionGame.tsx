import { useEffect, useRef, useState } from 'react';
import { Character } from '../components/art';
import { HelpButton } from '../components/HelpSheet';
import { Ring } from '../components/Ring';
import { Confetti, MuteButton, useTimerSounds } from '../components/ui';
import { AR, send, serverNow, type AuctionGameView, type RoomView } from '../net';
import { buzz, gameOver, music, sfx } from '../sound';

type P = { room: RoomView; g: AuctionGameView };

const LEVEL_NAME = ['', 'سهل', 'متوسط', 'صعب', 'ماكس'];
const LEVEL_BG = ['', '#3DDC97', '#4D9DFF', '#FF8A3D', '#FF4F9A'];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const fmt = (n: number) => AR(String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
const act = (action: string, payload?: unknown) => send('game:act', { game: 'auction', action, payload });
const useWho = (room: RoomView) => ({
  name: (id: string | null | undefined) => (id === room.youId ? 'إنت' : room.players.find((p) => p.id === id)?.name ?? '؟'),
  avatar: (id: string | null | undefined) => room.players.find((p) => p.id === id)?.avatar ?? 'c1'
});

/** Milliseconds left until `endsAt`, refreshed every 100 ms (the bidding countdown needs sub-second steps). */
function useMsLeft(endsAt: number | null) {
  const [, f] = useState(0);
  useEffect(() => { const i = setInterval(() => f((n) => n + 1), 100); return () => clearInterval(i); }, []);
  return endsAt ? Math.max(0, endsAt - serverNow()) : 0;
}

function Coin({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="10" fill="#FFD23F" stroke="#111" strokeWidth="2.4" /><circle cx="12" cy="12" r="6.5" fill="none" stroke="#111" strokeWidth="1.4" opacity=".5" />
      <text x="12" y="16" textAnchor="middle" fontFamily="Cairo" fontWeight="900" fontSize="10" fill="#111">ج</text>
    </svg>
  );
}

export function AuctionGame(props: P) {
  switch (props.g.phase) {
    case 'bid':
    case 'sold': return <Bidding {...props} />;
    case 'answer':
    case 'reveal': return <Answer {...props} />;
    default: return <Final {...props} />;
  }
}

/* ---------- bidding ---------- */

function Bidding({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const sold = g.phase === 'sold';
  const ms = useMsLeft(g.endsAt);
  const left = ms / 1000;
  const total = useRef(g.bidSecs);
  if (left > total.current) total.current = left;
  const mine = g.you?.money ?? 0;
  const iLead = g.buyer === room.youId;
  const D = g.bidSecs;
  const status = sold ? 'بيع!' : left > D * 0.58 ? 'مين يزوّد؟' : left > D * 0.3 ? 'على واحد…' : 'على اتنين…';
  const ringC = left > D * 0.58 ? '#3DDC97' : left > D * 0.3 ? '#FFD23F' : '#E2433B';
  const ring = 540.4 * (1 - clamp(left / total.current));
  const ham = sold ? 9 : left > D * 0.3 ? -14 + 2 * Math.sin(ms / 160) : -14 - 24 * (1 - left / (D * 0.3));
  useTimerSounds(Math.ceil(left), !sold && !!g.endsAt);

  // sounds: each bid is a coin (pitch up with the price); the auctioneer's calls tick; sold = gavel + stamp
  const prevPrice = useRef(g.price);
  useEffect(() => { if (g.price > prevPrice.current) { sfx.coin(Math.round(g.price / 50)); if (g.buyer !== room.youId) buzz(15); } prevPrice.current = g.price; }, [g.price]);
  const prevStatus = useRef(status);
  useEffect(() => { if (prevStatus.current !== status && !sold && (status === 'على واحد…' || status === 'على اتنين…')) { sfx.tick(); sfx.tick(); } prevStatus.current = status; }, [status, sold]);
  useEffect(() => { if (sold) { sfx.gavel(); const t = setTimeout(() => sfx.stamp(), 350); return () => clearTimeout(t); } }, [sold]);

  const bid = async (step: number) => { const r = await act('bid', { step }); if (!r.ok) sfx.error(); };
  const lastKey = g.log.length ? `${g.log[g.log.length - 1].by}-${g.log[g.log.length - 1].amount}` : 'none';

  return (
    <main className="screen au-screen">
      <div className="row between"><span className="display" style={{ fontSize: 20 }}>مزاد المعلومات</span><div className="row" style={{ gap: 6 }}><HelpButton gameId="auction" /><MuteButton /></div></div>
      <section className="au-lot">
        <span className="au-lotno">المعلومة {AR(g.lotNo)} من {AR(g.lots)}</span>
        <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.65, marginTop: 4 }}>المزاد على سؤال في</span>
        <span className="display" style={{ fontSize: 30, lineHeight: 1.2 }}>{g.topic}</span>
        <div className="au-hidden">
          <span style={{ fontWeight: 900, fontSize: 12.5, flex: 'none' }}>السؤال:</span>
          <span aria-hidden="true" className="row" style={{ gap: 4, flex: 1 }}><i style={{ height: 9, width: 44 }} /><i style={{ height: 9, width: 28 }} /><i style={{ height: 9, width: 36 }} /><b className="display" style={{ fontSize: 16 }}>؟</b></span>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" fill="#FFD23F" stroke="#111" strokeWidth="2.4" /><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#111" strokeWidth="2.4" /></svg>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.6 }}><span className="au-level" style={{ background: LEVEL_BG[g.tier ?? 2] }}>{LEVEL_NAME[g.tier ?? 2]}</span> سؤال واحد عن الموضوع ده بـ ٤ اختيارات. اللي يكسب المزاد بس هو اللي يجاوب.</span>
      </section>

      <section className="au-stage">
        <div className="au-ring" style={{ animation: sold ? 'thud .35s ease-out .2s' : 'none' }}>
          <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="105" cy="105" r="96" fill="#fff" stroke="#111" strokeWidth="3.5" />
            <circle cx="105" cy="105" r="86" fill="none" stroke={ringC} strokeWidth="10" strokeLinecap="round" strokeDasharray="540.4" strokeDashoffset={sold ? 540.4 : ring} />
          </svg>
          <div className="col center" style={{ position: 'relative', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.65 }}>أعلى سعر</span>
            <span key={g.price} className="row" style={{ gap: 6, animation: 'bump .35s ease-out' }}><Coin size={30} /><b className="display num" style={{ fontSize: 50, lineHeight: 1 }}>{fmt(g.price)}</b></span>
            {g.buyer ? (
              <span className="au-by" style={{ background: iLead ? '#DCEBFF' : '#fff' }}><Character id={avatar(g.buyer)} size={24} /><b style={{ fontSize: 14 }}>{name(g.buyer)}</b></span>
            ) : <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.7 }}>لسه محدش زايد</span>}
          </div>
          <svg width="104" height="104" viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', zIndex: 3, top: -46, left: -50, overflow: 'visible', transformOrigin: '12% 88%', transform: `rotate(${ham.toFixed(1)}deg)`, animation: sold ? 'auSlam .32s cubic-bezier(.55,0,.8,.3) forwards' : 'none' }}>
            <path d="M12 88L60 40" stroke="#111" strokeWidth="11" strokeLinecap="round" /><path d="M12 88L60 40" stroke="#F3E6C4" strokeWidth="5" strokeLinecap="round" />
            <g transform="translate(66 34) rotate(45)"><rect x="-21" y="-12" width="42" height="24" rx="5" fill="#FF8A3D" stroke="#111" strokeWidth="3.5" /><rect x="-21" y="-12" width="9" height="24" rx="3" fill="#111" /><rect x="12" y="-12" width="9" height="24" rx="3" fill="#111" /></g>
          </svg>
          {sold && (
            <>
              <svg width="90" height="90" viewBox="-45 -45 90 90" aria-hidden="true" style={{ position: 'absolute', zIndex: 2, top: -8, left: -6, animation: 'burst .45s ease-out .2s both' }}>
                <path d="M0-40v14M28-28l-10 10M40 0H26M28 28l-10-10M0 40V26M-28 28l10-10M-40 0h14M-28-28l10 10" stroke="#111" strokeWidth="5" strokeLinecap="round" />
              </svg>
              <div className="au-stamp">اتباعت لـ {name(g.buyer)}</div>
            </>
          )}
        </div>
        {sold
          ? <span className="display" style={{ fontSize: 20, height: 44, display: 'flex', alignItems: 'center', animation: 'slideIn .3s ease-out .7s both' }}>{name(g.buyer)} هيجاوب دلوقتي…</span>
          : <span className="display" style={{ fontSize: 24, height: 44, display: 'flex', alignItems: 'center' }}>{status}</span>}
        <div className="row" style={{ gap: 6, height: 26 }}>
          {g.log.map((l, i, a) => (
            <span key={`${lastKey}-${i}`} className="au-log" style={{ opacity: i === a.length - 1 ? 1 : 0.6 }}><Character id={avatar(l.by)} size={18} />{fmt(l.amount)}</span>
          ))}
        </div>
      </section>

      <div className="row" style={{ justifyContent: 'space-between', gap: 4 }}>
        {g.participants.map((id) => (
          <div key={id} className="col center" style={{ gap: 1, flex: 1, minWidth: 0 }}>
            <span style={{ borderRadius: '50%', boxShadow: id === g.buyer ? '0 0 0 3px #FFD23F, 0 0 0 5px #111' : 'none', display: 'flex' }}><Character id={avatar(id)} size={36} /></span>
            <span style={{ fontSize: 11.5, fontWeight: 900, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(id)}</span>
            <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>{fmt(g.money[id] ?? 0)} ج</span>
          </div>
        ))}
      </div>

      <div className="col" style={{ gap: 6 }}>
        <div className="au-bids">
          {g.steps.map((v) => {
            const off = sold || !g.you || iLead || g.price + v > mine;
            return <button key={v} className="au-bid" disabled={off} onClick={() => bid(v)} style={{ background: v === 200 ? '#FF8A3D' : '#fff', boxShadow: off ? 'none' : '4px 4px 0 #111', opacity: off ? 0.45 : 1 }}>+{AR(v)}</button>;
          })}
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>معاك <b>{fmt(mine)} ج</b> · اللي يدفع أكتر يجاوب · صح ياخد الضعف، غلط {g.penalty === 0 ? 'بيرجّع فلوسه' : g.penalty === 0.5 ? 'يخسر نص اللي دفعه' : g.penalty === 1 ? 'يخسر اللي دفعه' : 'يخسر ضعف اللي دفعه'}</span>
      </div>
    </main>
  );
}

/* ---------- answer / reveal ---------- */

function Answer({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const q = g.question!;
  const reveal = g.phase === 'reveal';
  const res = g.result;
  const iBuy = g.buyer === room.youId;
  const buyerName = name(g.buyer);
  const right = res?.kind === 'right';
  const [bet, setBet] = useState<boolean | null>(null);
  const picked = iBuy ? g.pick : null;
  const myPrediction = res?.predictions.find((p) => p.id === room.youId);

  useEffect(() => { if (iBuy && !reveal) sfx.turn(); }, []); // your lot: your turn to answer
  useEffect(() => {
    if (!reveal || !res) return;
    (right ? sfx.gotcha : sfx.error)();
    if (right) [0, 1, 2].forEach((i) => setTimeout(() => sfx.coin(i + 4), 200 + i * 110)); // coins fly
    if (myPrediction?.ok) setTimeout(() => sfx.pop(), 600);
  }, [reveal]);

  const pickOpt = async (i: number) => { if (!iBuy || reveal || g.locked) return; sfx.card(); await act('pick', { option: i }); };
  const lock = async () => { if (!iBuy || reveal || g.pick === null) return; sfx.confirm(); const r = await act('lock'); if (!r.ok) sfx.error(); };
  const predict = async (yes: boolean) => { if (iBuy || reveal) return; setBet(yes); sfx.select(); await act('predict', { yes }); };
  const mePred = g.predicted ?? bet;
  const yesN = res ? res.predictions.filter((p) => p.yes).length : 0;
  const noN = res ? res.predictions.length - yesN : 0;
  const worthRight = g.price, worthWrong = Math.round(g.price * g.penalty);

  return (
    <main className="screen au-screen">
      <div className="row between"><span className="display" style={{ fontSize: 20 }}>مزاد المعلومات</span><div className="row" style={{ gap: 6 }}><HelpButton gameId="auction" /><MuteButton /></div></div>
      <div className="au-buyer">
        <Character id={avatar(g.buyer)} size={40} />
        <div className="col grow" style={{ lineHeight: 1.25 }}>
          <span style={{ fontWeight: 900, fontSize: 15 }}>{buyerName} اشترى المعلومة</span>
          <span className="row" style={{ gap: 4, fontSize: 12, fontWeight: 800 }}>دفع <Coin size={14} /> {fmt(g.price)} ج · {g.topic}</span>
        </div>
        {!reveal && <Ring key="answer" endsAt={g.endsAt} color="#3DDC97" />}
      </div>
      <section className="au-qcard"><span className="display" style={{ fontSize: q.text.length > 40 ? 22 : 26, lineHeight: 1.4 }}>{q.text}</span></section>
      <section className="au-opts">
        {q.options.map((t, i) => {
          const me = picked === i;
          const ok = reveal && res && res.correct === i;
          const bad = reveal && res && res.chosen === i && !ok;
          return (
            <button key={i} className="au-opt" disabled={!iBuy || reveal} onClick={() => pickOpt(i)} style={{ background: ok ? '#3DDC97' : bad ? '#FF8A8A' : me ? '#DCEBFF' : '#fff', boxShadow: me && !reveal ? 'none' : '4px 4px 0 #111', transform: me && !reveal ? 'translate(4px,4px)' : 'none', opacity: reveal && !ok && !bad ? 0.45 : 1, fontSize: t.length > 14 ? 18 : t.length > 8 ? 22 : 26, animation: ok ? 'rightGlow .8s ease-out 2' : bad ? 'qzShake .45s' : 'none' }}>{t}</button>
          );
        })}
      </section>

      {iBuy ? (
        <div className="grid2" style={{ gap: 10 }}>
          <div className="au-box" style={{ background: '#D4F7E8' }}><span style={{ fontSize: 11.5, fontWeight: 900 }}>لو صح</span><b className="display" style={{ fontSize: 22, color: '#1F7A52' }}>+{fmt(worthRight)} ج</b></div>
          <div className="au-box" style={{ background: '#FFD6CF' }}><span style={{ fontSize: 11.5, fontWeight: 900 }}>لو غلط</span><b className="display" style={{ fontSize: 22, color: '#B3261E' }}>{worthWrong ? `−${fmt(worthWrong)} ج` : 'فلوسك ترجع'}</b></div>
        </div>
      ) : (
        <div className="au-predict">
          <span style={{ fontWeight: 900, fontSize: 14 }}>توقّع: {buyerName} هيجاوب صح؟</span>
          <div className="grid2" style={{ gap: 8 }}>
            {([['صح', true, '#3DDC97'], ['غلط', false, '#FF8A8A']] as const).map(([t, v, c]) => (
              <button key={t} className="au-pbtn" disabled={reveal} onClick={() => predict(v)} style={{ background: mePred === v ? c : '#fff', boxShadow: mePred === v ? 'none' : '3px 3px 0 #111' }}>{t}</button>
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>توقّعك لو طلع صح تاخد ٥٠ ج{reveal ? ` · ${AR(yesN)} قالوا صح · ${AR(noN)} قالوا غلط` : g.predictors.length ? ` · ${AR(g.predictors.length)} توقّعوا لحد دلوقتي` : ''}</span>
        </div>
      )}

      {reveal && right && (
        <div aria-hidden="true" className="au-coins">{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ left: `${20 + i * 8}%`, animationDelay: `${(i * 0.07).toFixed(2)}s` }}><Coin size={26} /></span>)}</div>
      )}

      <div className="col push" style={{ gap: 6 }}>
        <button className="btn big full" disabled={reveal ? false : !iBuy || g.pick === null} style={{ background: reveal ? (right ? '#3DDC97' : '#E2433B') : '#111', color: reveal ? '#111' : '#FFD23F', boxShadow: '0 6px 0 #3DDC97' }} onClick={() => (reveal ? (room.hostId === room.youId ? act('next') : undefined) : lock())}>
          {reveal ? (right ? `صح! +${fmt(res!.delta)} ج` : `غلط${res!.delta ? ` · −${fmt(res!.delta)} ج` : ' · فلوسك رجعت'}`) : !iBuy ? (mePred === null ? 'اختار توقّعك' : `استنى إجابة ${buyerName}`) : g.pick !== null ? 'ثبّت الإجابة' : 'اختار إجابة'}
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 800, textAlign: 'center' }}>{reveal ? g.fact : iBuy ? 'إنت بس اللي بتجاوب · الباقي بيتوقعوا' : `${buyerName} هو اللي بيجاوب · إنت شايف السؤال بس`}</span>
      </div>
    </main>
  );
}

/* ---------- final ---------- */

function Final({ room, g }: P) {
  const { name, avatar } = useWho(room);
  const isHost = room.hostId === room.youId;
  const [boom, setBoom] = useState(0);
  const ranked = [...g.participants].sort((a, b) => (g.money[b] ?? 0) - (g.money[a] ?? 0));
  const max = Math.max(1, g.money[ranked[0]] ?? 1);
  useEffect(() => {
    music.dip(3);
    const stop = gameOver(null);
    const t = setTimeout(() => setBoom(1), 1500);
    return () => { clearTimeout(t); stop(); };
  }, []);
  return (
    <main className="screen au-screen">
      <Confetti fire={boom} amount={150} from="top" />
      <section className="col center" style={{ gap: 4, paddingTop: 6 }}>
        <svg width="96" height="96" viewBox="0 0 64 64" aria-hidden="true" className="pop-in"><path d="M24 14h16l-4 8H28z" fill="#FF8A3D" stroke="#111" strokeWidth="3" strokeLinejoin="round" /><path d="M28 22h8c12 6 18 16 16 26-1 7-8 10-20 10S13 55 12 48c-2-10 4-20 16-26z" fill="#3DDC97" stroke="#111" strokeWidth="3" strokeLinejoin="round" /><text x="32" y="48" textAnchor="middle" fontFamily="Cairo" fontWeight="900" fontSize="16" fill="#111">ج</text></svg>
        <span style={{ fontSize: 13, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '0 12px' }}>خلص المزاد · {AR(g.lots)} معلومات</span>
        <h1 className="display pop-in" style={{ fontSize: 34, lineHeight: 1.2, textAlign: 'center' }}>{ranked[0] === room.youId ? 'إنت أغنى واحد!' : `${name(ranked[0])} أغنى واحد!`}</h1>
      </section>
      <section className="au-final-rows">
        {ranked.map((id, i) => (
          <div key={id} style={{ display: 'grid', gridTemplateColumns: '20px 32px 52px 1fr 66px', gap: 6, alignItems: 'center' }}>
            <b className="display" style={{ fontSize: 16, textAlign: 'center' }}>{AR(i + 1)}</b>
            <Character id={avatar(id)} size={30} />
            <span style={{ fontWeight: 900, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(id)}</span>
            <span className="qz-bar" style={{ height: 18 }}><span style={{ width: `${clamp((g.money[id] ?? 0) / max) * 100}%`, background: i === 0 ? '#3DDC97' : '#B48CFF' }} /></span>
            <b className="display num" style={{ fontSize: 16, textAlign: 'left' }}>{fmt(g.money[id] ?? 0)}</b>
          </div>
        ))}
      </section>
      <section className="grid2">
        {g.final?.awards.map((a) => (
          <div key={a.k} className="qz-stat" style={{ padding: '8px 10px' }}>
            <span style={{ fontSize: 11.5, fontWeight: 900, opacity: 0.75 }}>{a.k}</span>
            <span className="display" style={{ fontSize: 19 }}>{a.id ? name(a.id) : '—'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800 }}>{a.why}</span>
          </div>
        ))}
      </section>
      <div className="col push" style={{ gap: 10 }}>
        {isHost ? (
          <>
            <button className="btn big full" style={{ boxShadow: '0 6px 0 #B48CFF' }} onClick={() => { sfx.tap(); send('game:again'); }}>نلعبها تاني</button>
            <button className="btn full" onClick={() => send('game:backToRoom')}>نغيّر اللعبة</button>
          </>
        ) : <span className="label" style={{ textAlign: 'center' }}>مستنيين المضيف</span>}
      </div>
    </main>
  );
}
