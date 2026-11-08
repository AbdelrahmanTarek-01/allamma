// Generates src/games/map/maps/{egypt,arab,world}.ts: our own stylized SVG maps (no tiles, no paid map API).
// Source: Natural Earth (public domain) via the npm package world-atlas. Run: npm run gen:maps (in client).
// The output is committed, so production builds never need these dev dependencies.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoMercator, geoNaturalEarth1, geoPath, geoGraticule, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const load = (f) => require(`world-atlas/${f}`);
const countries50 = feature(load('countries-50m.json'), load('countries-50m.json').objects.countries).features;
const countries110 = feature(load('countries-110m.json'), load('countries-110m.json').objects.countries).features;

const ARAB = new Set([
  'Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya', 'Egypt', 'Sudan', 'Mauritania', 'Somalia', 'Somaliland', 'Djibouti', 'Comoros',
  'Palestine', 'Jordan', 'Lebanon', 'Syria', 'Iraq', 'Kuwait', 'Saudi Arabia', 'Bahrain', 'Qatar', 'United Arab Emirates', 'Oman', 'Yemen'
]);

// Nile waypoints [lon, lat] (Aswan -> Luxor -> Qena -> Asyut -> Minya -> Beni Suef -> Cairo -> the two Delta branches)
const NILE = [[32.90, 24.09], [32.88, 24.45], [32.78, 24.98], [32.64, 25.70], [32.72, 26.16], [31.90, 26.40], [31.19, 27.18], [30.75, 28.11], [31.10, 29.07], [31.23, 30.03]];
const ROSETTA = [[31.23, 30.03], [30.95, 30.45], [30.42, 31.40]];
const DAMIETTA = [[31.23, 30.03], [31.45, 30.75], [31.81, 31.42]];
const CANAL = [[32.31, 31.26], [32.30, 30.60], [32.55, 29.97]];

// World: the natural-earth sphere fitted to the width, then cropped to lat -58..78 (no Antarctica, no empty far north), so land fills the frame.
const WORLD_BASE = geoNaturalEarth1().fitExtent([[8, 8], [792, 412]], { type: 'Sphere' });
const WORLD_N = WORLD_BASE([0, 78])[1], WORLD_S = WORLD_BASE([0, -58])[1];
const WORLD_H = Math.ceil(WORLD_S - WORLD_N + 16);

const SPECS = {
  egypt: {
    w: 600, h: 620, set: countries50, shortKm: 1100, scaleKm: 150,
    make: () => geoMercator().center([30.5, 27]).scale(600 / ((17 * Math.PI) / 180)).translate([300, 310]),
    kind: 'mercator',
    hl: (n) => n === 'Egypt',
    labels: [
      ['البحر المتوسط', 29.5, 33.4], ['البحر الأحمر', 36.0, 24.6, 58], ['ليبيا', 24.7, 28.3], ['السودان', 29.0, 20.6], ['السعودية', 38.3, 27.6]
    ]
  },
  arab: {
    // tight on the Arab world: lon -18..60 (Atlantic to the Gulf), lat -3..38 (Somalia to south Turkey). The canvas is bigger than that box (bleed), the box is the "fit" view.
    w: 800, h: 920, set: countries50, shortKm: 4500, scaleKm: 400,
    make: () => geoMercator().center([21, 17.5]).scale(720 / ((78 * Math.PI) / 180)).translate([400, 460]),
    kind: 'mercator',
    bounds: { lon: [-18, 60], lat: [-3, 38] },
    nbrClass: 'mp-far', // neighbours of the Arab League: faded, so they don't compete
    hl: (n) => ARAB.has(n),
    labels: [
      ['البحر المتوسط', 18, 34.2], ['المحيط الأطلسي', -14.5, 29, -80], ['البحر الأحمر', 38.4, 20.5, 55], ['الخليج العربي', 51.7, 27.0, 40], ['بحر العرب', 57.5, 13.5]
    ]
  },
  world: {
    w: 800, h: WORLD_H, set: countries110, shortKm: 15000, scaleKm: 1500,
    make: () => { const p = geoNaturalEarth1().fitExtent([[8, 8], [792, 412]], { type: 'Sphere' }); const [tx, ty] = p.translate(); return p.translate([tx, ty + 8 - WORLD_N]); },
    kind: 'naturalEarth1',
    bounds: 'canvas', // the "fit" view is the whole (cropped) canvas, i.e. the land width
    gridStep: 30, gridClass: 'mp-grid light', // fewer, lighter graticule lines
    hl: (n) => n === 'Egypt',
    // seas only, small (font px, constant on screen), placed in open water away from land
    labels: [['المحيط الأطلسي', -46, 31, 0, 9], ['المحيط الهادي', -140, 8, 0, 9], ['المحيط الهادي', 160, 22, 0, 9], ['المحيط الهندي', 85, -12, 0, 9]]
  }
};

const r = (n, d = 2) => +n.toFixed(d);
const result = {};

for (const [id, s] of Object.entries(SPECS)) {
  const proj = s.make();
  proj.clipExtent([[-4, -4], [s.w + 4, s.h + 4]]);
  const path = geoPath(proj).digits(1);
  const land = s.set.filter((f) => f.properties.name !== 'Antarctica');
  const base = land.filter((f) => !s.hl(f.properties.name)).map((f) => path(f)).filter(Boolean).join('');
  const hl = land.filter((f) => s.hl(f.properties.name)).map((f) => path(f)).filter(Boolean).join('');
  const line = (pts) => path({ type: 'LineString', coordinates: pts });
  let deco = '';
  if (id === 'egypt') {
    deco = `<path class="mp-river" d="${line(NILE)}"/><path class="mp-river thin" d="${line(ROSETTA)}"/><path class="mp-river thin" d="${line(DAMIETTA)}"/><path class="mp-river thin" d="${line(CANAL)}"/>`;
  }
  const grid = path(s.gridStep ? geoGraticule().step([s.gridStep, s.gridStep])() : geoGraticule10());
  // focus: the box the "fit" button frames (the area the game is about). Everything around it is bleed so the screen never shows empty edges.
  let focus = [0, 0, s.w, s.h];
  if (s.bounds === 'canvas') {
    focus = [8, 8, s.w - 8, s.h - 8];
  } else if (s.bounds) {
    const [x0, y1] = proj([s.bounds.lon[0], s.bounds.lat[0]]), [x1, y0] = proj([s.bounds.lon[1], s.bounds.lat[1]]);
    focus = [x0, y0, x1, y1].map((v) => r(v, 1));
  } else if (id !== 'world') {
    const fb = path.bounds({ type: 'FeatureCollection', features: land.filter((f) => s.hl(f.properties.name)) });
    const padX = (fb[1][0] - fb[0][0]) * 0.05, padY = (fb[1][1] - fb[0][1]) * 0.05;
    focus = [Math.max(0, fb[0][0] - padX), Math.max(0, fb[0][1] - padY), Math.min(s.w, fb[1][0] + padX), Math.min(s.h, fb[1][1] + padY)].map((v) => r(v, 1));
  }
  const svg = `<rect class="mp-sea" width="${s.w}" height="${s.h}"/><path class="${s.gridClass ?? 'mp-grid'}" d="${grid}"/><path class="${s.nbrClass ?? 'mp-nbr'}" d="${base}"/><path class="mp-hl" d="${hl}"/>${deco}`;

  const labels = s.labels.map(([t, lon, lat, rot, sz]) => {
    const p = proj([lon, lat]);
    return { t, x: r(p[0], 1), y: r(p[1], 1), r: rot ?? 0, ...(sz ? { s: sz } : {}) };
  });

  // projection parameters: the client rebuilds the same d3 projection from these, so tap -> lat/lon is exact
  const params = { kind: s.kind, scale: r(proj.scale(), 3), translate: proj.translate().map((v) => r(v, 3)), center: proj.center ? proj.center() : [0, 0] };
  result[id] = { w: s.w, h: s.h, focus, proj: params, shortKm: s.shortKm, scaleKm: s.scaleKm, svg, labels };
  console.log(id, 'svg KB:', Math.round(svg.length / 1024), 'proj', JSON.stringify(params));
}

// one module per map, so a player only downloads the maps the lounge actually uses (see games/map/maps.ts)
const dir = resolve(here, '../src/games/map/maps');
mkdirSync(dir, { recursive: true });
const header = `// GENERATED by client/scripts/gen-maps.mjs from Natural Earth (public domain) via world-atlas. Do not edit by hand.
`;
for (const [id, def] of Object.entries(result)) {
  const file = resolve(dir, `${id}.ts`);
  writeFileSync(file, `${header}import type { MapDef } from '../maps';
const def: MapDef = ${JSON.stringify(def)};
export default def;
`);
  console.log('wrote', file, Math.round(JSON.stringify(def).length / 1024), 'KB');
}
