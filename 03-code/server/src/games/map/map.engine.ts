import { arabicNum } from '../../common/ar';
import { GameError, type Room } from '../../rooms/rooms.types';
import type { Level } from '../difficulty';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { poolFor, type Difficulty, type MapPlace, type MapScope, type MapTheme } from './places';

export interface MapSettings {
  scope: MapScope;
  theme: MapTheme | 'all';
  places: number;
  seconds: number;
}

type Place = MapPlace & { id: string; theme: MapTheme };
type Pin = { lat: number; lon: number };
type Phase = 'guess' | 'reveal' | 'result' | 'final';

/** A hint, sent only to the player who asked for it. */
export type Hint =
  | { kind: 'text'; text: string }
  | { kind: 'circle'; lat: number; lon: number; radiusKm: number }
  /** The place is NOT beyond the line: `shade` says which side is ruled out (north = lat > at, east = lon > at ...). */
  | { kind: 'half'; axis: 'lat' | 'lon'; at: number; shade: 'north' | 'south' | 'east' | 'west' };

interface RevealEntry {
  id: string;
  lat: number | null;
  lon: number | null;
  km: number | null;
  points: number;
  hinted: boolean;
  /** Locked within the first 5 seconds. */
  fast: boolean;
  /** Time ran out and the pin was locked for them. */
  auto: boolean;
}

interface RoundState {
  place: Place;
  startedAt: number;
  pins: Record<string, Pin>;
  locked: Record<string, number>;
  hints: Record<string, Hint>;
  entries: RevealEntry[] | null;
  roundPoints: Record<string, number>;
}

export const RESULT_AUTO_SECONDS = 25;
export const REVEAL_BASE_SECONDS = 6;
export const REVEAL_PER_PIN_SECONDS = 0.8;
export const FAST_LOCK_MS = 5000;
export const HINT_PENALTY = 0.25;
/** The lounge's shared level for this game: which places are preferred and the points multiplier (same x1 / x1.5 / x2 / x2.5 as Spy). */
export const MAP_LEVELS: Record<Level, { prefer: Difficulty; multiplier: number }> = {
  easy: { prefer: 'easy', multiplier: 1 },
  medium: { prefer: 'medium', multiplier: 1.5 },
  hard: { prefer: 'hard', multiplier: 2 },
  max: { prefer: 'hard', multiplier: 2.5 }
};
/** points = round(1000 * exp(-km / scale)), per map scope. */
export const SCALE_KM: Record<MapScope, number> = { egypt: 150, arab: 400, world: 1500 };
/** The map's short side in km, used for the circle hint radius. */
const SHORT_KM: Record<MapScope, number> = { egypt: 1100, arab: 3000, world: 20000 };
/** Visible area in degrees, used to place the half-map cut inside the map. */
const BOUNDS: Record<MapScope, { lat: [number, number]; lon: [number, number] }> = {
  egypt: { lat: [21.5, 32], lon: [24, 37.5] },
  arab: { lat: [2, 40], lon: [-18, 62] },
  world: { lat: [-55, 70], lon: [-170, 180] }
};

// ---------- geometry ----------
const R_EARTH = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export function haversineKm(a: Pin, b: Pin) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}
function destination(from: Pin, bearingDeg: number, km: number): Pin {
  const d = km / R_EARTH;
  const br = rad(bearingDeg);
  const lat1 = rad(from.lat);
  const lon1 = rad(from.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: +deg(lat2).toFixed(3), lon: +(((deg(lon2) + 540) % 360) - 180).toFixed(3) };
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Pure scoring, exported for the simulation: distance points x level multiplier, +50 for a fast lock, -25% with a hint. */
export function scorePin(km: number, scope: MapScope, multiplier: number, opts: { fast: boolean; hinted: boolean }) {
  const base = Math.round(1000 * Math.exp(-km / SCALE_KM[scope]));
  const total = base * multiplier + (opts.fast ? 50 : 0);
  return Math.round(total * (opts.hinted ? 1 - HINT_PENALTY : 1));
}

/** Settings schema. Rule: one word or number per option button; explanations go in the one helper line. */
const SETTINGS: SettingField[] = [
  {
    key: 'scope', label: 'الخريطة', hint: 'مصر بس، أو كل الدول العربية، أو العالم كله',
    options: [{ value: 'egypt', label: 'مصر' }, { value: 'arab', label: 'العرب', full: 'الوطن العربي' }, { value: 'world', label: 'العالم' }]
  },
  {
    key: 'theme', label: 'هتدوّروا على إيه؟', hint: 'مدن = المدن والعواصم · أكلات = الأكلة دي جاية منين',
    options: [
      { value: 'cities', label: 'مدن' }, { value: 'landmarks', label: 'معالم' }, { value: 'stadiums', label: 'ملاعب' },
      { value: 'dishes', label: 'أكلات' }, { value: 'all', label: 'كله' }
    ]
  },
  {
    key: 'places', label: 'عدد الأماكن', hint: 'كام مكان في اللعبة',
    options: [{ value: 5, label: '٥', full: '٥ أماكن' }, { value: 10, label: '١٠', full: '١٠ أماكن' }, { value: 15, label: '١٥', full: '١٥ مكان' }]
  },
  {
    key: 'seconds', label: 'وقت المكان', hint: 'الثواني لكل مكان',
    options: [{ value: 10, label: '١٠', full: '١٠ ثواني' }, { value: 20, label: '٢٠', full: '٢٠ ثانية' }, { value: 30, label: '٣٠', full: '٣٠ ثانية' }]
  }
];

export const mapDef: GameDef<MapSettings> = {
  id: 'map',
  name: 'فين دي؟',
  minPlayers: 2,
  settings: SETTINGS,
  defaultSettings: () => ({ scope: 'egypt', theme: 'cities', places: 5, seconds: 20 }),
  levels: MAP_LEVELS,
  create: (settings, level) => new MapEngine(settings, level)
};

export class MapEngine implements GameEngine {
  readonly id = 'map';
  /** Only the host moves on from the results (it also moves on by itself after a while). */
  readonly hostActions = ['next'] as const;

  private readonly settings: MapSettings;
  private room?: Room;
  private pool: Place[] = [];
  private queue: Place[] = [];
  private scores: Record<string, number> = {};
  private phase: Phase = 'guess';
  private round = 0;
  private endsAt: number | null = null;
  private participants: string[] = [];
  private r!: RoundState;

  constructor(settings: MapSettings, private readonly level: Level = 'medium') {
    this.settings = { ...settings };
  }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.scores = {};
    this.pool = poolFor(this.settings.scope, this.settings.theme);
    this.queue = this.buildQueue();
    this.round = 0;
    this.startPlace(ctx, participants);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { lat?: unknown; lon?: unknown };
    switch (action) {
      case 'pin': return this.setPin(playerId, p.lat, p.lon);
      case 'lock': return this.lock(ctx, playerId);
      case 'unlock': return this.unlock(ctx, playerId);
      case 'hint': return this.useHint(ctx, playerId);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    delete this.scores[playerId];
    if (!this.r) return;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.r.pins[playerId];
    delete this.r.locked[playerId];
    delete this.r.hints[playerId];
    this.checkAllLocked(ctx);
  }

  onPresenceChange(ctx: EngineCtx) {
    this.checkAllLocked(ctx);
  }

  scoreOf(playerId: string) {
    return this.scores[playerId] ?? 0;
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  /** Secrets: the true location only from the reveal on, other players' pins only in the reveal, a hint only to its owner. */
  viewFor(playerId: string) {
    const r = this.r;
    const inRound = this.participants.includes(playerId);
    const revealed = this.phase === 'reveal' || this.phase === 'result' || this.phase === 'final';
    const place = r?.place;
    return {
      type: 'map',
      round: this.round,
      totalRounds: this.queue.length,
      phase: this.phase,
      endsAt: this.endsAt,
      scope: this.settings.scope,
      participants: this.participants,
      lockedIds: this.phase === 'guess' ? Object.keys(r.locked) : [],
      place: place && this.phase !== 'final'
        ? { name: place.name, theme: place.theme, difficulty: this.level, multiplier: MAP_LEVELS[this.level].multiplier, hardText: place.difficulty === 'hard' }
        : null,
      you: inRound
        ? {
            pin: this.phase === 'guess' ? r.pins[playerId] ?? null : null, // your own pin only, and only while guessing
            locked: playerId in r.locked,
            hint: r.hints[playerId] ?? null, // only yours
            canHint: this.phase === 'guess' && !r.hints[playerId]
          }
        : null,
      reveal: revealed && this.phase !== 'final' && r.entries && place
        ? { target: { lat: place.lat, lon: place.lon }, fact: place.fact, entries: r.entries }
        : null,
      roundPoints: revealed ? r.roundPoints : {}
    };
  }

  // ---------- rules ----------

  /** The places of this game: the pool shuffled, preferring the chosen difficulty, capped by what the pack has. */
  private buildQueue(): Place[] {
    const { places } = this.settings;
    const prefer = MAP_LEVELS[this.level].prefer;
    const all = shuffle(this.pool);
    const ordered = [...all.filter((x) => x.difficulty === prefer), ...all.filter((x) => x.difficulty !== prefer)];
    return shuffle(ordered.slice(0, Math.min(places, ordered.length)));
  }

  private startPlace(ctx: EngineCtx, participants: string[]) {
    this.round += 1;
    if (this.round > 1) ctx.system(`المكان ${arabicNum(this.round)}`);
    this.participants = participants;
    this.phase = 'guess';
    this.r = { place: this.queue[this.round - 1], startedAt: Date.now(), pins: {}, locked: {}, hints: {}, entries: null, roundPoints: {} };
    this.endsAt = this.r.startedAt + this.settings.seconds * 1000;
    ctx.schedule(this.settings.seconds, () => this.reveal(ctx));
    ctx.emit();
  }

  private mustGuess(playerId: string) {
    if (this.phase !== 'guess') throw new GameError('مش وقته دلوقتي');
    if (!this.participants.includes(playerId)) throw new GameError('انت مش في المكان ده');
    return this.r;
  }

  /** A pin is private: nothing is broadcast, it is only stored so time-out can lock it. */
  private setPin(playerId: string, lat: unknown, lon: unknown) {
    const r = this.mustGuess(playerId);
    if (playerId in r.locked) throw new GameError('غيّر رأيك الأول');
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new GameError('مكان مش صح');
    r.pins[playerId] = { lat: +la.toFixed(4), lon: +lo.toFixed(4) };
  }

  private lock(ctx: EngineCtx, playerId: string) {
    const r = this.mustGuess(playerId);
    if (!r.pins[playerId]) throw new GameError('حط الدبوس على الخريطة الأول');
    if (!(playerId in r.locked)) r.locked[playerId] = Date.now();
    ctx.emit();
    this.checkAllLocked(ctx);
  }

  private unlock(ctx: EngineCtx, playerId: string) {
    const r = this.mustGuess(playerId);
    delete r.locked[playerId];
    ctx.emit();
  }

  private checkAllLocked(ctx: EngineCtx) {
    if (this.phase !== 'guess' || !this.r) return;
    const online = this.participants.filter((id) => ctx.room.players.get(id)?.connected);
    if (online.length > 0 && online.every((id) => id in this.r.locked)) this.reveal(ctx);
  }

  // ---------- hints ----------

  /** The hint type is picked here by the doc's rules; the client only learns the result, and only its owner. */
  private useHint(ctx: EngineCtx, playerId: string) {
    const r = this.mustGuess(playerId);
    if (r.hints[playerId]) throw new GameError('خدت التلميح بالفعل');
    r.hints[playerId] = this.makeHint(r, playerId);
    ctx.emit();
  }

  private makeHint(r: RoundState, playerId: string): Hint {
    const place = r.place;
    const allowed: ('circle' | 'half')[] = [];
    let circle: Hint | null = null;
    let half: Hint | null = null;
    if (place.difficulty !== 'hard') { // hard places get text hints only
      circle = this.tryCircle(place);
      half = this.tryHalf(place);
      if (circle) allowed.push('circle');
      if (half) allowed.push('half');
    }
    const kinds: ('text' | 'circle' | 'half')[] = ['text', ...allowed]; // text is always allowed: the fallback
    const kind = pick(kinds);
    if (kind === 'circle' && circle) return circle;
    if (kind === 'half' && half) return half;
    // text: prefer one nobody else got, so players see different clues
    const used = new Set(Object.entries(r.hints).filter(([id, h]) => id !== playerId && h.kind === 'text').map(([, h]) => (h as { text: string }).text));
    const free = place.hints.filter((t) => !used.has(t));
    return { kind: 'text', text: pick(free.length ? free : place.hints) };
  }

  /** Circle: radius >= 30% of the map's short side (bigger when easy), target 35-75% of the radius from the center, >= 3 other pack places inside. */
  private tryCircle(place: Place): Hint | null {
    const f = place.difficulty === 'easy' ? 0.4 : 0.32;
    const radiusKm = Math.round(SHORT_KM[this.settings.scope] * f);
    const target = { lat: place.lat, lon: place.lon };
    for (let i = 0; i < 12; i++) {
      const d = radiusKm * (0.35 + Math.random() * 0.4);
      const center = destination(target, Math.random() * 360, d);
      const inside = this.pool.filter((x) => haversineKm(target, x) > 10 && haversineKm(center, x) <= radiusKm).length;
      if (inside >= 3) return { kind: 'circle', lat: center.lat, lon: center.lon, radiusKm };
    }
    return null;
  }

  /** Half: shade one side. The unshaded side must keep >= 40% of the pack's places, and the shaded side must rule out something (>= 20%). */
  private tryHalf(place: Place): Hint | null {
    const b = BOUNDS[this.settings.scope];
    for (let i = 0; i < 16; i++) {
      const shade = pick(['north', 'south', 'east', 'west'] as const);
      const axis = shade === 'north' || shade === 'south' ? 'lat' : 'lon';
      const [lo, hi] = axis === 'lat' ? b.lat : b.lon;
      const m = (0.1 + Math.random() * 0.25) * (hi - lo);
      const t = axis === 'lat' ? place.lat : place.lon;
      const at = +(shade === 'north' || shade === 'east' ? t + m : t - m).toFixed(2);
      if (at <= lo || at >= hi) continue;
      const v = (x: Pin) => (axis === 'lat' ? x.lat : x.lon);
      const shaded = (x: Pin) => (shade === 'north' || shade === 'east' ? v(x) > at : v(x) < at);
      const out = this.pool.filter(shaded).length / this.pool.length;
      if (1 - out >= 0.4 && out >= 0.2) return { kind: 'half', axis, at, shade };
    }
    return null;
  }

  // ---------- reveal, scoring, flow ----------

  private reveal(ctx: EngineCtx) {
    if (this.phase !== 'guess') return;
    const r = this.r;
    const place = r.place;
    const target = { lat: place.lat, lon: place.lon };
    const entries: RevealEntry[] = this.participants.map((id) => {
      const pin = r.pins[id];
      if (!pin) return { id, lat: null, lon: null, km: null, points: 0, hinted: !!r.hints[id], fast: false, auto: false };
      const km = haversineKm(pin, target);
      const manual = id in r.locked;
      const fast = manual && r.locked[id] - r.startedAt <= FAST_LOCK_MS;
      const hinted = !!r.hints[id];
      return { id, lat: pin.lat, lon: pin.lon, km: +km.toFixed(1), points: scorePin(km, this.settings.scope, MAP_LEVELS[this.level].multiplier, { fast, hinted }), hinted, fast, auto: !manual };
    });
    entries.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    r.entries = entries;
    entries.forEach((e) => {
      r.roundPoints[e.id] = e.points;
      this.scores[e.id] = (this.scores[e.id] ?? 0) + e.points;
    });
    this.phase = 'reveal';
    const pinned = entries.filter((e) => e.km !== null).length;
    const secs = REVEAL_BASE_SECONDS + REVEAL_PER_PIN_SECONDS * pinned;
    this.endsAt = Date.now() + secs * 1000;
    ctx.schedule(secs, () => this.toResult(ctx));
    ctx.emit();
  }

  private toResult(ctx: EngineCtx) {
    if (this.phase !== 'reveal') return;
    this.phase = 'result';
    this.endsAt = Date.now() + RESULT_AUTO_SECONDS * 1000;
    ctx.schedule(RESULT_AUTO_SECONDS, () => {
      // a timer must never throw: if too few players are connected, just wait for the host
      try { this.advance(ctx); } catch { /* the host decides */ }
    });
    ctx.emit();
  }

  /** Host "next" (or the result timer): the next place, or the final screen after the last one. */
  private advance(ctx: EngineCtx) {
    if (this.phase !== 'result') throw new GameError('مش وقته دلوقتي');
    if (this.round >= this.queue.length) {
      this.phase = 'final';
      this.endsAt = null;
      ctx.clearTimer();
      ctx.emit();
      return;
    }
    const online = [...ctx.room.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (online.length < mapDef.minPlayers) throw new GameError(`محتاجين ${arabicNum(mapDef.minPlayers)} لاعيبة على الأقل`);
    this.startPlace(ctx, online);
  }
}
