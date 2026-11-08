export type Difficulty = 'easy' | 'medium' | 'hard';
export type MapScope = 'egypt' | 'arab' | 'world';
export type MapTheme = 'cities' | 'landmarks' | 'stadiums' | 'dishes';
export const THEMES: MapTheme[] = ['cities', 'landmarks', 'stadiums', 'dishes'];

/** One place of a pack. Coordinates are real lat/lon (the map projection is only for display). */
export interface MapPlace {
  name: string;
  lat: number;
  lon: number;
  difficulty: Difficulty;
  /** One-line fun fact shown on the results screen. */
  fact: string;
  /** Three text hints of similar strength. They help to locate the place and never say its name. */
  hints: [string, string, string];
}

export type Pack = Record<MapTheme, MapPlace[]>;

const D = { e: 'easy', m: 'medium', h: 'hard' } as const;
/** Compact place builder: p(name, lat, lon, 'e'|'m'|'h', fact, hint1, hint2, hint3). */
export const p = (name: string, lat: number, lon: number, d: keyof typeof D, fact: string, h1: string, h2: string, h3: string): MapPlace => ({
  name, lat, lon, difficulty: D[d], fact, hints: [h1, h2, h3]
});
