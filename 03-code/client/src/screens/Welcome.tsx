import { useEffect, useRef, useState } from 'react';
import { Character, GAMES } from '../components/art';
import { sfx } from '../sound';

const KEY = 'allamma.welcomed';

/** True once the welcome screen was shown on this device (storage blocked: treat as seen, so it never nags). */
export function hasSeenWelcome() {
  try { return !!localStorage.getItem(KEY); } catch { return true; }
}
export function markWelcomed() {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
}
/** Someone who opens an invite link wants to get into the room, not to read a welcome. */
export function hasInviteLink() {
  return !!new URLSearchParams(location.search).get('room');
}

const REPLY = ['مين؟', 'مين بيخبّط؟', 'أيوه جاي!'];
const HINT = ['خبّط ٣ مرات', 'كمان مرتين', 'كمان مرة', 'بيفتحوا…'];
const BLURB: Record<string, string> = {
  spy: 'واحد بس مش عارف المكان', map: 'حط الدبوس على الخريطة', quiz: 'لوحة أسئلة بين فريقين', words: 'تلميح واحد وكلمات كتير',
  auction: 'زايد على قد ثقتك', draw: 'ارسم وصحابك يخمّنوا', wave: 'خمّنوا المكان على المقياس'
};
/** The six friends inside, in canvas order (seat 1 at the top, then clockwise). */
const CAST = ['c1', 'c3', 'c5', 'c7', 'c2', 'c4'];
/** The five muffled bubbles leaking through the closed door: text, top, side offset, delay (s). */
const LEAKS: { t: string; top: string; side: 'right' | 'left'; off: number; d: number }[] = [
  { t: 'هههههه', top: '14%', side: 'right', off: -34, d: 0 },
  { t: 'مين الجاسوس؟!', top: '36%', side: 'left', off: -58, d: 1.5 },
  { t: 'بوووم!', top: '58%', side: 'right', off: -30, d: 3 },
  { t: 'زايد ١٠٠', top: '22%', side: 'left', off: -36, d: 4.5 },
  { t: 'قريب!', top: '70%', side: 'left', off: -24, d: 6 }
];
/** Seats around the little table behind the open door (left %, top %). */
const SEATS: [number, number][] = [[50, 35], [84.6, 47.5], [84.6, 72.5], [50, 85], [15.4, 72.5], [15.4, 47.5]];
/** Seats for the big table of scene 1. */
const SEATS1: [number, number][] = [[50, 12], [82.9, 31], [82.9, 69], [50, 88], [17.1, 69], [17.1, 31]];
const TABLE_CARDS: [string, number, number, number, number][] = [['#FF4F9A', 42, 57, -14, 0.3], ['#4D9DFF', 52, 55, 8, 0.4], ['#fff', 58, 63, 18, 0.5], ['#3DDC97', 47, 66, -4, 0.6]];
const CHAT: { me: boolean; who: string; text: string; code?: boolean }[] = [
  { me: false, who: 'c6', text: 'مين فاضي النهارده؟' },
  { me: false, who: 'c4', text: 'أنا! بس كل واحد في بيته' },
  { me: true, who: 'c1', text: 'خلاص · عملت قعدة على اللمّة' },
  { me: true, who: 'c1', text: 'ادخلوا بالكود ده', code: true },
  { me: false, who: 'c7', text: 'دخلت! يلا مين الجاسوس' },
  { me: false, who: 'c4', text: 'هتتمسك يا حلو' }
];
const CONFETTI: [number, number, number, string, number, number, number, number][] = [
  [0, 7, 10, '#FF4F9A', 2.2, 0.6, 260, -15], [37, 10, 15, '#4D9DFF', 2.55, 0.7, 295, 19], [74, 13, 10, '#3DDC97', 2.9, 0.8, 330, -23], [11, 7, 15, '#fff', 3.25, 0.9, 365, 27],
  [48, 10, 10, '#FF8A3D', 3.6, 1, 400, -31], [85, 13, 15, '#B48CFF', 2.2, 1.1, 435, 35], [22, 7, 10, '#FF4F9A', 2.55, 0.6, 470, -39], [59, 10, 15, '#4D9DFF', 2.9, 0.7, 505, 43],
  [96, 13, 10, '#3DDC97', 3.25, 0.8, 540, -47], [33, 7, 15, '#fff', 3.6, 0.9, 575, 51], [70, 10, 10, '#FF8A3D', 2.2, 1, 610, -55], [7, 13, 15, '#B48CFF', 2.55, 1.1, 645, 59],
  [44, 7, 10, '#FF4F9A', 2.9, 0.6, 680, -63], [81, 10, 15, '#4D9DFF', 3.25, 0.7, 715, 67], [18, 13, 10, '#3DDC97', 3.6, 0.8, 750, -71], [55, 7, 15, '#fff', 2.2, 0.9, 785, 75],
  [92, 10, 10, '#FF8A3D', 2.55, 1, 820, -79], [29, 13, 15, '#B48CFF', 2.9, 1.1, 855, 83], [66, 7, 10, '#FF4F9A', 3.25, 0.6, 890, -87], [3, 10, 15, '#4D9DFF', 3.6, 0.7, 925, 91],
  [40, 13, 10, '#3DDC97', 2.2, 0.8, 960, -95], [77, 7, 15, '#fff', 2.55, 0.9, 995, 99]
];
const BUNTING = [['M6 8 L18 30 L30 12', '#FF4F9A'], ['M40 14 L52 36 L64 17', '#4D9DFF'], ['M74 19 L86 41 L98 21', '#3DDC97'], ['M108 22 L120 44 L132 23', '#FF8A3D'], ['M142 23 L154 45 L166 23', '#B48CFF'], ['M176 23 L188 45 L200 22', '#fff'], ['M210 22 L222 44 L234 21', '#FF4F9A'], ['M244 21 L256 43 L268 19', '#4D9DFF'], ['M278 17 L290 39 L302 14', '#3DDC97'], ['M312 12 L324 34 L336 8', '#FF8A3D']] as const;

/**
 * First visit only: knock on the door (3 knocks, by tapping the door or the button), the door opens, the camera pushes in to a table,
 * then the game cards, then the group chat. ONE state machine (`ph` + `settled`); only the active scene and the one leaving are mounted;
 * input is ignored while a transition runs; every timer is cleared on skip and unmount; reduced motion = plain fades, no zoom.
 *   ph 0 door · 2 table scene · 3 game cards · 4 group chat
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  const reduced = useRef(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches).current;
  const [st, setSt] = useState({ n: 0, open: false, ph: 0, settled: true, tok: 0, rep: false });
  const stRef = useRef(st);
  stRef.current = st;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearAll, []);

  /** Move to scene `ph` (a transition: input is ignored for ~1s, then only the new scene stays mounted). */
  const go = (ph: number) => {
    setSt((s) => ({ ...s, ph, settled: false }));
    sfx.whoosh();
    if (ph === 2) sfx.cheer(true);
    later(1000, () => setSt((s) => ({ ...s, settled: true })));
  };

  const knock = () => {
    const s = stRef.current;
    if (s.open || s.n >= 3) return; // ignore knocks after the third
    const n = s.n + 1;
    sfx.knock();
    setSt({ ...s, n, tok: s.tok + 1, rep: false });
    later(380, () => setSt((x) => ({ ...x, rep: true })));
    if (n === 3) {
      later(120, () => { sfx.creak(); setSt((x) => ({ ...x, open: true })); });
      later(900, () => sfx.cheer(false)); // the crowd, muffled, as the door opens
      later(1700, () => go(2));
      later(7200, () => go(3));
      later(12700, () => go(4));
    }
  };

  const next = () => {
    const s = stRef.current;
    if (s.ph < 2 || s.ph >= 4 || !s.settled) return; // ignored while a transition runs
    clearAll();
    go(s.ph + 1);
    if (s.ph + 1 < 4) later(5500, () => go(4));
  };

  const skip = () => { clearAll(); sfx.tap(); onStart(); };
  const cta = () => { clearAll(); sfx.confirm(); onStart(); };

  const { n, open, ph, settled } = st;
  const inside = ph >= 2;
  const s1On = ph === 2 || (ph === 3 && !settled);
  const s2On = ph === 3 || (ph === 4 && !settled);
  const s3On = ph >= 4;
  const leave = (p: number) => (ph >= p ? (reduced ? { opacity: 0 } : { transform: 'scale(1.35)', opacity: 0 }) : { opacity: 1 });
  const popIn = (d: number, w: number) => `wlPopIn .5s cubic-bezier(.2,1.4,.4,1) ${d}s both, wlWave 1.4s ease-in-out ${w}s infinite`;

  return (
    <main className="wl-screen">
      <div className="row between wl-top">
        <span className="logo" style={{ fontSize: 34, lineHeight: 1, animation: 'wlLogoIn .6s cubic-bezier(.2,1.4,.4,1) both' }}>اللمّة<i>.</i></span>
        <button className="wl-skip-sm" onClick={skip}>تخطّي</button>
      </div>
      <div className="col center" style={{ gap: 8, animation: 'wlUp .4s .3s both' }}>
        <span className="display" style={{ fontSize: 28, lineHeight: 1.2, textAlign: 'center' }}>{open ? 'ادخل! إنت مننا خلاص' : 'الصحاب جوه… خبّط وادخل'}</span>
        <span className="wl-status">
          <span style={{ display: 'flex' }}>
            <Character id="c6" size={24} />
            <span style={{ marginInlineStart: -8, display: 'flex' }}><Character id="c4" size={24} /></span>
            <span style={{ marginInlineStart: -8, display: 'flex' }}><Character id="c7" size={24} /></span>
          </span>
          <i />
          <span style={{ fontSize: 13, fontWeight: 900 }}>{open ? 'فتحولك! ادخل' : 'فيه لمّة شغالة جوه · سامع الدوشة؟'}</span>
        </span>
      </div>
      {/* the party bunting between the status chip and the door */}
      <svg width="354" height="44" viewBox="0 0 342 44" aria-hidden="true" style={{ alignSelf: 'center', marginTop: 6, overflow: 'visible', animation: 'wlUp .4s .45s both', flex: 'none' }}>
        <path d="M2 6 Q171 34 340 6" fill="none" stroke="#111" strokeWidth="2.5" />
        {BUNTING.map(([d, c]) => <path key={d} d={d} fill={c} stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />)}
      </svg>

      <div className="wl-stage" style={{ transform: inside && !reduced ? 'scale(5)' : 'none', opacity: inside ? 0 : 1 }}>
        <div className="wl-door-wrap" onClick={knock} role="button" aria-label="خبّط على الباب">
          <div className="wl-frame" />
          <div className="wl-room">
            {open && (
              <div style={{ position: 'absolute', inset: 0 }}>
                <span className="wl-table" />
                {TABLE_CARDS.map(([c, l, t, r, d]) => <span key={c + l} className="wl-card" style={{ left: `${l}%`, top: `${t}%`, background: c, transform: `rotate(${r}deg)`, animationDelay: `${d}s` }} />)}
                {CAST.map((id, i) => (
                  <span key={id} style={{ position: 'absolute', left: `${SEATS[i][0]}%`, top: `${SEATS[i][1]}%`, width: 54, height: 54, margin: '-27px 0 0 -27px' }}>
                    <span style={{ display: 'block', animation: popIn(0.1 + i * 0.12, 0.7 + i * 0.12) }}><Character id={id} size={54} /></span>
                  </span>
                ))}
                <span className="row" style={{ position: 'absolute', left: 0, right: 0, top: '9%', justifyContent: 'center' }}><span className="wl-hello">أهلاً أهلاً!</span></span>
              </div>
            )}
          </div>
          <div className="wl-leaf" style={{ transform: `rotateY(${open ? -104 : 0}deg)` }}>
            <div className="wl-panel" key={`k${st.tok}`} style={{ animation: st.tok ? `${st.tok % 2 ? 'wlKnockA' : 'wlKnockB'} .35s ease-out` : 'none' }}>
              <span className="wl-pane" style={{ top: 46, height: 130, borderRadius: '80px 80px 10px 10px' }} />
              <span className="wl-pane" style={{ top: 196, height: 150, borderRadius: 10 }} />
              <span className="wl-knob" />
              <span style={{ position: 'absolute', top: 212, left: 16, width: 22, height: 22, borderRadius: '50%', background: '#FFD23F', border: '3.5px solid #111' }} />
              <span style={{ position: 'absolute', top: 236, left: 22, width: 10, height: 18, borderRadius: 4, background: '#111' }} />
            </div>
            <span className="wl-plate" key={`p${st.tok}`} style={{ animation: st.tok ? `${st.tok % 2 ? 'wlKnockA' : 'wlKnockB'} .35s ease-out` : 'none' }}>اللمّة<i>.</i></span>
          </div>
          {!open && (
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <span className="wl-glow" />
              {['♪', '♫', '♪'].map((c, i) => <span key={i} className="wl-note" style={{ left: `${[20, 55, 80][i]}%`, animationDelay: `${i}s` }}>{c}</span>)}
              {LEAKS.map((l) => <span key={l.t} className="wl-leak" style={{ top: l.top, [l.side]: l.off, animationDelay: `${l.d}s` }}>{l.t}</span>)}
              {st.tok > 0 && <span key={`t${st.tok}`} className="wl-tok">طُق!</span>}
              {st.rep && n > 0 && <span className="row" style={{ position: 'absolute', top: 40, left: 0, right: 0, justifyContent: 'center' }}><span key={`r${n}`} className="wl-reply">{REPLY[n - 1]}</span></span>}
            </div>
          )}
        </div>
        <span aria-hidden="true" className="wl-mat">أهلاً</span>
        <span aria-hidden="true" className="wl-floor" />
      </div>

      {!open && (
        <div className="col" style={{ gap: 10, flex: 'none' }}>
          <div className="row" style={{ justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 900 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: '2.5px solid #111', background: i < n ? '#111' : '#fff', transition: 'background .15s' }} />)}
            <span>{HINT[n]} · أو دوس على الباب</span>
          </div>
          <button className="wl-knock-btn" onClick={knock} disabled={n >= 3}>
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 14V9a2.5 2.5 0 015 0v4M14 13V7.5a2.5 2.5 0 015 0V13M19 13V9a2.5 2.5 0 015 0v8c0 6-4 10-9 10h-1c-4 0-7-3-8-6l-2-5a2.3 2.3 0 014-2l2 3" fill="#FFD23F" stroke="#FFD23F" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" /></svg>خبّط
          </button>
        </div>
      )}
      {open && !inside && (
        <div className="col" style={{ gap: 10, flex: 'none', animation: 'wlUp .4s 1s both' }}>
          <button className="btn big full" style={{ height: 72, fontSize: 26, borderRadius: 24, boxShadow: '0 7px 0 #FF4F9A' }} onClick={cta}>ادخل · اعمل شخصيتك</button>
          <div className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}><span className="wl-pill">ببلاش</span><span className="wl-pill">من غير تسجيل</span><span className="wl-pill">٧ ألعاب</span></div>
        </div>
      )}
      {open && !reduced && (
        <div aria-hidden="true" className="wl-confetti">
          {CONFETTI.map(([l, w, h, c, dur, d, r, dx], i) => (
            <span key={i} style={{ left: `${l}%`, width: w, height: h, background: c, animation: `wlFall ${dur}s cubic-bezier(.3,.6,.5,1) ${d}s forwards`, ['--r' as any]: `${r}deg`, ['--dx' as any]: `${dx}px` }} />
          ))}
        </div>
      )}

      {/* inside: three scenes, story bars, skip, tap to advance, fixed CTA */}
      {inside && (
        <div className="wl-in" style={{ pointerEvents: 'auto' }}>
          <div className="wl-bg" style={{ animation: reduced ? 'wlFade .6s both' : 'wlPush 1.15s cubic-bezier(.2,.8,.2,1) .55s both' }}>
            <div className="wl-bars">
              {[2, 3, 4].map((k) => <span key={k}><i style={{ width: ph >= k ? '100%' : '0%', transition: ph === k ? '5s linear' : '0s' }} /></span>)}
            </div>
            <button className="wl-skip" onClick={skip}>تخطّي التعريف ←</button>
            <button className="wl-tap" onClick={next} aria-label="المشهد اللي بعده" />

            {s1On && (
              <div className="wl-scene" style={{ gap: 10, ...leave(3), transition: 'transform .7s cubic-bezier(.65,0,.35,1), opacity .35s ease-in' }}>
                <span className="display" style={{ fontSize: 30, lineHeight: 1.2, textAlign: 'center', animation: 'wlUp .45s .2s both' }}>أهلاً! إنت مننا خلاص</span>
                <span style={{ fontSize: 14, fontWeight: 800, animation: 'wlUp .45s .3s both' }}>دي اللمّة · الصحاب كلهم هنا</span>
                <div style={{ position: 'relative', width: 320, height: 320, marginTop: 18, animation: 'wlUp .5s .3s both' }}>
                  <span className="wl-bigtable" />
                  {TABLE_CARDS.map(([c, , , r], i) => {
                    const pos = [[41, 46], [53, 44], [59, 56], [46, 58]][i];
                    return <span key={i} className="wl-card" style={{ left: `${pos[0]}%`, top: `${pos[1]}%`, background: c, transform: `rotate(${r}deg)`, width: 30, height: 42, margin: '-21px 0 0 -15px', animation: 'none' }} />;
                  })}
                  {CAST.map((id, i) => (
                    <span key={id} style={{ position: 'absolute', left: `${SEATS1[i][0]}%`, top: `${SEATS1[i][1]}%`, width: 68, height: 68, margin: '-34px 0 0 -34px' }}>
                      <span style={{ display: 'block', animation: `wlWave 1.4s ease-in-out ${i * 0.2}s infinite` }}><Character id={id} size={68} /></span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {s2On && (
              <div className="wl-scene" style={{ ...leave(4), transition: 'transform .7s cubic-bezier(.65,0,.35,1), opacity .35s ease-in', animation: reduced ? 'wlFade .6s both' : 'wlEnter .8s cubic-bezier(.2,.8,.2,1) .4s backwards' }}>
                <span className="display" style={{ fontSize: 30, lineHeight: 1.2, textAlign: 'center' }}>كل قعدة لعبة شكل</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>٧ ألعاب · واختاروا اللي يعجبكم</span>
                <div style={{ position: 'relative', width: '100%', height: 300, marginTop: 26 }}>
                  {GAMES.map((g, i) => (
                    <div key={g.id} className="wl-fan" style={{ ['--z' as any]: 7 - Math.abs(i - 3), transform: `rotate(${(i - 3) * 10}deg)`, animation: reduced ? 'none' : `wlZup 7s linear ${i}s infinite` }}>
                      <div style={{ width: '100%', height: '100%', animation: reduced ? 'none' : `wlLift 7s ease-in-out ${i}s infinite` }}>
                        <div className="wl-gcard">
                          <span className="icontile" style={{ background: g.color, width: 56, height: 56 }}>{g.icon}</span>
                          <b className="display" style={{ fontSize: 15, lineHeight: 1.2, textAlign: 'center' }}>{g.name}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'relative', width: '100%', height: 56 }}>
                  {GAMES.map((g, i) => (
                    <span key={g.id} className="col center" style={{ position: 'absolute', inset: 0, opacity: reduced ? (i === 0 ? 1 : 0) : 0, animation: reduced ? 'none' : `wlDesc 7s ease-in-out ${i}s infinite`, textAlign: 'center' }}>
                      <b className="display" style={{ fontSize: 20 }}>{g.name}</b><span style={{ fontSize: 13, fontWeight: 800 }}>{BLURB[g.id] ?? g.tagline}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {s3On && (
              <div className="wl-scene" style={{ animation: reduced ? 'wlFade .6s both' : 'wlEnter .8s cubic-bezier(.2,.8,.2,1) .4s backwards', alignItems: 'stretch', gap: 10 }}>
                <span className="display" style={{ fontSize: 30, lineHeight: 1.2, textAlign: 'center' }}>ابعت اللينك لصحابك</span>
                <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'center' }}>وكل واحد يلعب من موبايله ومن بيته</span>
                <div className="wl-chat">
                  <div className="row" style={{ gap: 8, borderBottom: '2px solid rgba(17,17,17,.1)', paddingBottom: 8 }}>
                    <span style={{ display: 'flex' }}>
                      <Character id="c1" size={26} />
                      <span style={{ marginInlineStart: -10, display: 'flex' }}><Character id="c4" size={26} /></span>
                      <span style={{ marginInlineStart: -10, display: 'flex' }}><Character id="c6" size={26} /></span>
                    </span>
                    <b style={{ fontSize: 14 }}>شلة الخميس</b>
                    <span style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 900, color: '#1F9E6A' }}>● ٤ أونلاين</span>
                  </div>
                  {CHAT.map((m, i) => (
                    <div key={i} className="row" style={{ gap: 6, alignItems: 'flex-end', flexDirection: m.me ? 'row' : 'row-reverse', alignSelf: m.me ? 'flex-start' : 'flex-end', maxWidth: '88%', animation: `wlUp .35s ${(0.4 + i * 0.6).toFixed(2)}s both` }}>
                      <Character id={m.who} size={30} />
                      <div className="col" style={{ background: m.me ? '#111' : '#fff', color: m.me ? '#FFD23F' : '#111', border: '2.5px solid #111', borderRadius: 16, padding: '5px 11px', boxShadow: '3px 3px 0 #111' }}>
                        <span style={{ fontSize: m.code ? 12 : 13.5, fontWeight: 800, lineHeight: m.code ? undefined : 1.5 }}>{m.text}</span>
                        {m.code && <span dir="ltr" className="display" style={{ fontSize: 20, letterSpacing: 3, background: '#FFD23F', color: '#111', borderRadius: 10, padding: '0 10px', marginTop: 2, alignSelf: 'flex-start' }}>YSF7K</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="wl-cta">
              <button className="btn big full" style={{ height: 72, fontSize: 26, borderRadius: 24, boxShadow: '0 7px 0 #FF4F9A' }} onClick={cta}>يلا · اعمل شخصيتك</button>
              <div className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="wl-pill">ببلاش</span><span className="wl-pill">من غير تسجيل</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
