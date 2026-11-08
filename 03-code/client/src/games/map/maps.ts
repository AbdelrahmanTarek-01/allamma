// Types and the lazy loader for the generated maps (games/map/maps/*.ts, made by client/scripts/gen-maps.mjs).
export type MapScope = 'egypt' | 'arab' | 'world';
export interface MapProj { kind: 'mercator' | 'naturalEarth1'; scale: number; translate: [number, number]; center: [number, number] }
/** `s`: font size in px (screen size, default from CSS). */
export interface MapLabel { t: string; x: number; y: number; r: number; s?: number }
export interface MapDef {
  w: number;
  h: number;
  /** The box the "fit" button frames (map units). Everything around it is bleed. */
  focus: [number, number, number, number];
  proj: MapProj;
  shortKm: number;
  scaleKm: number;
  svg: string;
  labels: MapLabel[];
}

const loaders: Record<MapScope, () => Promise<{ default: MapDef }>> = {
  egypt: () => import('./maps/egypt'),
  arab: () => import('./maps/arab'),
  world: () => import('./maps/world')
};
const loaded: Partial<Record<MapScope, MapDef>> = {};

/** Downloads a map once (safe to call early to warm it up). */
export async function loadMapDef(scope: MapScope): Promise<MapDef> {
  return (loaded[scope] ??= (await loaders[scope]()).default);
}
export const isMapLoaded = (scope: MapScope) => !!loaded[scope];
/** The map, once loaded. MapGame waits for `loadMapDef` before it renders anything that calls this. */
export function getMapDef(scope: MapScope): MapDef {
  const d = loaded[scope];
  if (!d) throw new Error(`map ${scope} is not loaded yet`);
  return d;
}
