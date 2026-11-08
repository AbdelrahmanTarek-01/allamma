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
const CAST = ['c2', 'c5', 'c1', 'c4', 'c3', 'c6'];
const CHAT: { me: boolean; who: string; text: string }[] = [
  { me: false, who: 'c2', text: 'مين فاضي النهارده؟' },
  { me: true, who: 'c1', text: 'أنا! بس كل واحد في بيته' },
  { me: false, who: 'c2', text: 'خلاص · عملت قعدة على اللمّة' },
  { me: false, who: 'c2', text: 'ادخلوا بالكود ده' },
  { me: true, who: 'c1', text: 'دخلت! يلا مين الجاسوس' },
  { me: false, who: 'c5', text: 'هتتمسك يا حلو' }
];

/**
 * First visit only: knock on the door (3 knocks, by tapping the door or the button), the door opens, the camera pushes in to a table,
 * then the game cards, then the group chat. ONE state machine (`ph` + `settled`); only the active scene and the one leaving are mounted;
 * input is ignored while a transition runs; every timer is cleared on skip and unmount; reduced motion = plain fades, no zoom or blur.
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
    if (ph === 2) { sfx.cheer(true); }
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

  return (
    <main className="wl-screen">
      {/* the closed door */}
      <div className="row between wl-top">
        <span className="logo" style={{ fontSize: 34, lineHeight: 1 }}>اللمّة<i>.</i></span>
        <button className="wl-skip-sm" onClick={skip}>تخطّي</button>
      </div>
      <div className="col center" style={{ gap: 8, animation: 'wlUp .4s .3s both' }}>
        <span className="display" style={{ fontSize: 28, lineHeight: 1.2, textAlign: 'center' }}>{open ? 'ادخل! إنت مننا خلاص' : 'الصحاب جوه… خبّط وادخل'}</span>
        <span className="wl-status"><Character id="c3" size={24} /><i />{open ? 'فتحولك! ادخل' : '٦ صحاب جوه · بيلعبوا مين الجاسوس'}</span>
      </div>

      <div className="wl-stage" style={{ transform: inside && !reduced ? 'scale(5)' : 'none', opacity: inside ? 0 : 1 }}>
        <div className="wl-door-wrap" onClick={knock} role="button" aria-label="خبّط على الباب">
          <div className="wl-frame" />
          <div className="wl-room">
            {open && (
              <div style={{ position: 'absolute', inset: 0 }}>
                <span className="wl-table" /><span className="wl-card" style={{ left: '42%', top: '57%', background: '#FF4F9A', transform: 'rotate(-14deg)' }} /><span className="wl-card" style={{ left: '52%', top: '55%', background: '#4D9DFF', transform: 'rotate(8deg)' }} />
                <span className="row" style={{ position: 'absolute', left: 0, right: 0, top: '9%', justifyContent: 'center' }}><span className="wl-hello">أهلاً أهلاً!</span></span>
              </div>
            )}
          </div>
          <div className="wl-leaf" style={{ transform: `rotateY(${open ? -104 : 0}deg)` }}>
            <div className="wl-panel" key={`k${st.tok}`} style={{ animation: st.tok ? `${st.tok % 2 ? 'wlKnockA' : 'wlKnockB'} .35s ease-out` : 'none' }}>
              <span className="wl-pane" style={{ top: 46, height: 130, borderRadius: '80px 80px 10px 10px' }} />
              <span className="wl-pane" style={{ top: 196, height: 150, borderRadius: 10 }} />
              <span className="wl-knob" />
            </div>
            <span className="wl-plate">اللمّة<i>.</i></span>
          </div>
          {!open && (
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <span className="wl-glow" />
              {['♪', '♫', '♪'].map((c, i) => <span key={i} className="wl-note" style={{ left: `${[20, 55, 80][i]}%`, animationDelay: `${i}s` }}>{c}</span>)}
              <span className="wl-leak" style={{ top: '14%', right: -34 }}>هههههه</span>
              <span className="wl-leak" style={{ top: '36%', left: -58, animationDelay: '2.5s' }}>العب العب!</span>
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
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 14V9a2.500 2.500 0 015 0v4M14 13V7.500a2.500 2.500 0 015 0V13M19 13V9a2.500 2.500 0 015 0v8c0 6-4 10-9 10h-1c-4 0-7-3-8-6l-2-5a2.300 2.300 0 014-2l2 3" fill="#FFD23F" stroke="#FFD23F" strokeWidth="2.200" strokeLinejoin="round" strokeLinecap="round" /></svg>خبّط
          </button>
        </div>
      )}
      {open && !inside && <span className="label" style={{ textAlign: 'center', animation: 'wlUp .4s .6s both' }}>الباب اتفتح…</span>}

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
              <div className="wl-scene" style={{ ...leave(3), transition: 'transform .7s cubic-bezier(.65,0,.35,1), opacity .35s ease-in' }}>
                <span className="display" style={{ fontSize: 30, lineHeight: 1.2, textAlign: 'center', animation: 'wlUp .45s .2s both' }}>أهلاً! إنت مننا خلاص</span>
                <span style={{ fontSize: 14, fontWeight: 800, animation: 'wlUp .45s .3s both' }}>دي اللمّة · الصحاب كلهم هنا</span>
                <div style={{ position: 'relative', width: 320, height: 320, marginTop: 18, animation: 'wlUp .5s .3s both' }}>
                  <span className="wl-bigtable" />
                  {[['#FF4F9A', 41, 46, -14], ['#4D9DFF', 53, 44, 8], ['#fff', 59, 56, 18], ['#3DDC97', 46, 58, -4]].map(([c, l, t, r], i) => (
                    <span key={i} className="wl-card" style={{ left: `${l}%`, top: `${t}%`, background: c as string, transform: `rotate(${r}deg)`, width: 30, height: 42, margin: '-21px 0 0 -15px' }} />
                  ))}
                  {CAST.map((id, i) => {
                    const a = (i / CAST.length) * Math.PI * 2 - Math.PI / 2;
                    return <span key={id} style={{ position: 'absolute', left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%`, width: 68, height: 68, margin: '-34px 0 0 -34px' }}><span style={{ display: 'block', animation: `wlWave 1.4s ease-in-out ${i * 0.2}s infinite` }}><Character id={id} size={68} /></span></span>;
                  })}
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
                    <Character id="c4" size={26} /><b style={{ fontSize: 14 }}>شلة الخميس</b><span style={{ marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 900 }}>● ٤ أونلاين</span>
                  </div>
                  {CHAT.map((m, i) => (
                    <div key={i} className="row" style={{ gap: 6, alignItems: 'flex-end', flexDirection: m.me ? 'row-reverse' : 'row', alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '88%', animation: `wlUp .35s ${0.4 + i * 0.5}s both` }}>
                      <Character id={m.who} size={30} />
                      <span style={{ background: m.me ? '#DCEBFF' : '#fff', border: '2.5px solid #111', borderRadius: 14, padding: '4px 10px', fontSize: 13.5, fontWeight: 800 }}>{m.text}</span>
                      {i === 3 && <span className="display" style={{ background: '#111', color: '#FFD23F', borderRadius: 10, padding: '2px 8px', letterSpacing: 3, fontSize: 15 }}>YSF7K</span>}
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

void GAMES;
