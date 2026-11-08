import { ARAB } from './arab';
import { EGYPT } from './egypt';
import { WORLD } from './world';
import { THEMES, type MapPlace, type MapScope, type MapTheme, type Pack } from './types';

export type { MapPlace, MapScope, MapTheme, Difficulty } from './types';
export { THEMES } from './types';

export const PACKS: Record<MapScope, Pack> = { egypt: EGYPT, arab: ARAB, world: WORLD };

/** The place pool for a scope + theme. `all` mixes every theme of that scope. Each place gets a stable id. */
export function poolFor(scope: MapScope, theme: MapTheme | 'all'): (MapPlace & { id: string; theme: MapTheme })[] {
  const themes = theme === 'all' ? THEMES : [theme];
  return themes.flatMap((t) => PACKS[scope][t].map((pl, i) => ({ ...pl, id: `${scope}:${t}:${i}`, theme: t })));
}
