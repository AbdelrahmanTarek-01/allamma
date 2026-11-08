import { useRef } from 'react';
import { AR } from '../net';
import { useSecondsLeft, useTimerSounds } from './ui';

/** The round countdown ring (quiz question, auction answer): drains with the time left, red in the last 5 seconds, with the shared timer sounds. */
export function Ring({ endsAt, color }: { endsAt: number | null; color: string }) {
  const left = useSecondsLeft(endsAt);
  const total = useRef(0);
  if (left > total.current) total.current = left;
  const f = total.current ? left / total.current : 0;
  useTimerSounds(left, !!endsAt);
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
