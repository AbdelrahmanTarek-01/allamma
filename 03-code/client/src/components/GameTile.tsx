import type { CSSProperties } from 'react';
import { GAMES } from './art';

type Game = (typeof GAMES)[number];

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="10" width="16" height="11" rx="2.5" fill="#111" />
    <path d="M8 10V7.5a4 4 0 018 0V10" fill="none" stroke="#111" strokeWidth={3} />
  </svg>
);

/**
 * The game tile used on Home and in the lounge picker.
 * min-height (not height) so a two-line title never clips the tagline; the "coming soon" chip sits
 * inside the tile in the corner opposite the icon; coming-soon tiles stay white with a greyscale icon.
 */
export function GameTile({ g, selected, onClick, style }: { g: Game; selected?: boolean; onClick?: () => void; style?: CSSProperties }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`tile game-tile${selected ? ' selected' : ''}`}
      {...(onClick ? { type: 'button' as const, onClick, ...(selected !== undefined ? { 'aria-pressed': selected } : {}) } : {})}
      style={style}
    >
      {!g.ready && <span className="chip corner"><Lock /> قريباً</span>}
      {g.ready && selected && <span className="chip dark corner">مختارة</span>}
      <span className={`icontile${g.ready ? '' : ' grey'}`} style={{ background: g.color }}>{g.icon}</span>
      <span className="display game-title">{g.name}</span>
      <span className="game-tag">{g.tagline}</span>
    </Tag>
  );
}
