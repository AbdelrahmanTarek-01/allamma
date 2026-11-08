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

// where each character floats (canvas artboard Welcome): character, left %, top %, size
const CAST = [['c2', 8, 14, 74], ['c5', 70, 10, 58], ['c1', 78, 40, 64], ['c4', 4, 44, 52], ['c3', 40, 4, 60]] as const;
const POINTS = [
  { color: 'var(--green)', text: 'ببلاش ومن غير تسجيل' },
  { color: 'var(--blue)', text: 'ابعت لينك لصحابك وكل واحد من بيته' },
  { color: 'var(--pink)', text: '٧ ألعاب، وكل شوية لعبة جديدة' }
];

/** First visit only: what اللمّة is, then the character picker. */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="screen">
      <div className="welcome-hero" aria-hidden="true">
        {CAST.map(([id, left, top, size], i) => (
          <span key={id} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${i * 0.3}s` }}><Character id={id} size={size} /></span>
        ))}
      </div>
      <div className="col center" style={{ gap: 6 }}>
        <span className="logo pop-in" style={{ fontSize: 84 }}>اللمّة<i>.</i></span>
        <h1 className="display" style={{ fontSize: 22, textAlign: 'center' }}>ألعاب القعدة، على موبايلك</h1>
      </div>
      <div className="col stagger" style={{ gap: 8 }}>
        {POINTS.map((p) => (
          <div key={p.text} className="card flat row" style={{ gap: 10, padding: '8px 12px', borderWidth: 2.5, borderRadius: 16 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, border: '2px solid var(--ink)', background: p.color, flex: 'none' }} />
            <span style={{ fontWeight: 800, fontSize: 14 }}>{p.text}</span>
          </div>
        ))}
      </div>
      <button className="btn big full push" onClick={() => { sfx.confirm(); onStart(); }}>يلا نبدأ</button>
    </main>
  );
}
