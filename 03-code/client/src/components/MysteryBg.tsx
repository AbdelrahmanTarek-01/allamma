import type { CSSProperties } from 'react';

type Q = CSSProperties & { '--r': string; '--o': number };

/** The faint "؟" marks drifting up: position, size, color, tilt, opacity, speed and start delay (from the design canvas). */
const MARKS: { q: Q; delay: string }[] = [
  { q: { left: '8%', top: '70%', fontSize: 46, color: '#B48CFF', '--r': '-12deg', '--o': 0.22, animationDuration: '9s' }, delay: '0s' },
  { q: { left: '80%', top: '62%', fontSize: 34, color: '#FFD23F', '--r': '14deg', '--o': 0.18, animationDuration: '11s' }, delay: '2s' },
  { q: { left: '62%', top: '88%', fontSize: 58, color: '#FF4F9A', '--r': '8deg', '--o': 0.16, animationDuration: '13s' }, delay: '4s' },
  { q: { left: '22%', top: '90%', fontSize: 30, color: '#FFFFFF', '--r': '-20deg', '--o': 0.14, animationDuration: '10s' }, delay: '6s' }
];

/**
 * "Mystery night" backdrop for the dark screens (reveal and the spy's last guess), same spec as the design
 * canvas Reveal and Guess artboards: a breathing purple glow, a yellow and a pink searchlight beam swinging from
 * the top, a few faint "؟" drifting up, and a dark vignette. A pointer-events:none layer behind the content
 * (see .mystery in styles.css); every animation stops under prefers-reduced-motion.
 */
export function MysteryBg() {
  return (
    <div className="mystery" aria-hidden="true">
      <div className="m-glow" />
      <div className="m-beam yellow" />
      <div className="m-beam pink" />
      {MARKS.map((m, i) => <span key={i} className="m-q" style={{ ...m.q, animationDelay: m.delay }}>؟</span>)}
      <div className="m-vignette" />
    </div>
  );
}
