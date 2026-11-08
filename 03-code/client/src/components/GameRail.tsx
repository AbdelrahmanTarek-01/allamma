import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GAMES } from './art';
import { GameTile } from './GameTile';

/**
 * The room's "هتلعبوا إيه؟" rail: the selected game is always the first card (order = selected, then the rest in the normal order).
 * On open and join it is simply in place. When the selection changes (from the server state, so everyone matches) the "مختارة" badge
 * shows at once, and ~400 ms later the card moves to the front with a FLIP animation (transform only) while the rail scrolls back to
 * its start. A reorder never happens while a pointer is down on the rail (it waits for the release); reduced motion just reorders.
 */
export function GameRail({ selected, onPick }: { selected: string; onPick?: (id: string) => void }) {
  const [shown, setShown] = useState(selected); // the game the order is built from (follows `selected` after a short delay)
  const railRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const first = useRef<Map<string, number> | null>(null);
  const pressing = useRef(false);
  const wanted = useRef(selected);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  wanted.current = selected;

  const apply = () => {
    timer.current = null;
    if (pressing.current) return; // the finger is on the rail: try again at the release
    if (wanted.current === shownRef.current) return;
    // FIRST: where every card is now
    const rects = new Map<string, number>();
    els.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect().left));
    first.current = reduced ? null : rects;
    setShown(wanted.current);
  };
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (selected === shownRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, reduced ? 0 : 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [selected]);

  // LAST + INVERT + PLAY, right after the new order is in the DOM
  useLayoutEffect(() => {
    const before = first.current;
    first.current = null;
    railRef.current?.scrollTo({ left: 0, behavior: reduced ? 'auto' : 'smooth' });
    if (!before) return;
    els.current.forEach((el, id) => {
      const from = before.get(id);
      if (from === undefined) return;
      const dx = from - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
      void el.getBoundingClientRect(); // flush, so the inverted position is painted before the play
      el.style.transition = 'transform .45s cubic-bezier(.2, .8, .2, 1)';
      el.style.transform = '';
      const done = () => { el.style.transition = ''; el.removeEventListener('transitionend', done); };
      el.addEventListener('transitionend', done);
    });
  }, [shown]);

  const ordered = [GAMES.find((g) => g.id === shown), ...GAMES.filter((g) => g.id !== shown)].filter(Boolean) as typeof GAMES;
  const release = () => {
    pressing.current = false;
    if (wanted.current !== shownRef.current && !timer.current) timer.current = setTimeout(apply, reduced ? 0 : 150);
  };

  return (
    <div
      className="game-row" ref={railRef}
      onPointerDown={() => { pressing.current = true; }}
      onPointerUp={release} onPointerCancel={release} onPointerLeave={() => { if (pressing.current) release(); }}
    >
      {ordered.map((g) => (
        <div key={g.id} className="rail-slot" ref={(el) => { if (el) els.current.set(g.id, el); else els.current.delete(g.id); }}>
          <GameTile g={g} selected={g.id === selected} onClick={onPick ? () => onPick(g.id) : undefined} />
        </div>
      ))}
    </div>
  );
}
