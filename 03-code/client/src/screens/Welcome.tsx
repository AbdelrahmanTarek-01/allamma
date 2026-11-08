import { Character } from '../components/art';
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

const POINTS = [
  { color: 'var(--green)', text: 'كل الألعاب من موبايلك، ومعاك صحابك' },
  { color: 'var(--blue)', text: 'ادخل بكود أو لينك، من غير تسجيل' },
  { color: 'var(--pink)', text: 'بنزوّد ألعاب جديدة على طول' }
];

/** First visit only: what اللمّة is, then the character picker. */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="screen">
      <div className="col center" style={{ gap: 6, paddingTop: 18 }}>
        <span className="logo pop-in" style={{ fontSize: 72 }}>اللمّة<i>.</i></span>
        <h1 className="display" style={{ fontSize: 24, textAlign: 'center', lineHeight: 1.35 }}>نادي ألعاب الصحاب<br />من الموبايل، وببلاش</h1>
      </div>

      <div className="welcome-cast" aria-hidden="true">
        {['c4', 'c1', 'c3', 'c8', 'c2'].map((id, i) => (
          <span key={id} className="float" style={{ animationDelay: `${i * 220}ms`, marginTop: i % 2 ? 22 : 0 }}><Character id={id} size={i === 2 ? 96 : 74} /></span>
        ))}
      </div>

      <div className="col stagger" style={{ gap: 10 }}>
        {POINTS.map((p) => (
          <div key={p.text} className="card row" style={{ gap: 12, padding: '10px 14px', boxShadow: '4px 4px 0 var(--ink)' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: p.color, border: '2.5px solid var(--ink)', flex: 'none' }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>{p.text}</span>
          </div>
        ))}
      </div>

      <button className="btn big full push" onClick={() => { sfx.confirm(); onStart(); }}>يلا نبدأ</button>
    </main>
  );
}
