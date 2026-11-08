import type { CSSProperties } from 'react';
import { Character, GAMES } from './art';
import { HelpButton } from './HelpSheet';

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
 * `help` adds the "?" button (a sibling of the tile button, since buttons can't nest).
 */
/** Votes shown on a game card: who voted (avatar stack, max 3 + "+N"), the count, and a "صوتك" tag on my card. */
export interface CardVotes { avatars: string[]; count: number; mine: boolean }
export function VoteRow({ v }: { v: CardVotes }) {
  return (
    <span className="vote-row">
      {v.avatars.slice(0, 3).map((a, i) => <span key={i} className="vote-av" style={{ marginInlineStart: i ? -8 : 0 }}><Character id={a} size={20} /></span>)}
      {v.count > 3 && <span className="vote-more">+{v.count - 3}</span>}
      {v.mine && <span className="vote-mine">صوتك</span>}
    </span>
  );
}

export function GameTile({ g, selected, onClick, style, help, lit, votes }: { g: Game; selected?: boolean; lit?: boolean; votes?: CardVotes; onClick?: () => void; style?: CSSProperties; help?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  const tile = (
    <Tag
      className={`tile game-tile${selected ? ' selected' : ''}${lit ? ' lit' : ''}`}
      {...(onClick ? { type: 'button' as const, onClick, ...(selected !== undefined ? { 'aria-pressed': selected } : {}) } : {})}
      style={help ? undefined : style}
    >
      {!g.ready && <span className="chip corner"><Lock /> قريباً</span>}
      {g.ready && selected && <span className="chip dark corner">مختارة</span>}
      <span className={`icontile${g.ready ? '' : ' grey'}`} style={{ background: g.color }}>{g.icon}</span>
      <span className="display game-title">{g.name}</span>
      <span className="game-tag">{g.tagline}</span>
      {votes && <VoteRow v={votes} />}
      {votes && votes.count > 0 && <span className="vote-count" aria-label={`${votes.count} أصوات`}>{votes.count}</span>}
    </Tag>
  );
  if (!help) return tile;
  return (
    <div className="tile-wrap" style={style}>
      {tile}
      <HelpButton gameId={g.id} className="on-tile" />
    </div>
  );
}
