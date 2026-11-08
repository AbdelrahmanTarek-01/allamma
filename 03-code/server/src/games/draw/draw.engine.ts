import { arabicNum } from '../../common/ar';
import { GameError } from '../../rooms/rooms.types';
import type { Level } from '../difficulty';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { DRAW_WORDS, normalizeGuess, oneOff, type DrawWord } from './draw-words';

export interface DrawSettings {
  /** How many times everyone draws. */
  cycles: 1 | 2;
}

type Phase = 'pick' | 'draw' | 'guess' | 'reveal' | 'final';

/** The difficulty table of this game (01-brainstorm/difficulty.md, "Draw" rows). `group` = word pool (objects / places and things / situations and ideas / feelings and proverbs). */
export const DRAW_LEVELS: Record<Level, { drawSecs: number; guessSecs: number; attempts: number; hints: number; eraser: boolean; group: 1 | 2 | 3 | 4 }> = {
  easy: { drawSecs: 90, guessSecs: 30, attempts: 4, hints: 2, eraser: true, group: 1 },
  medium: { drawSecs: 70, guessSecs: 20, attempts: 3, hints: 1, eraser: true, group: 2 },
  hard: { drawSecs: 50, guessSecs: 15, attempts: 2, hints: 1, eraser: true, group: 3 },
  max: { drawSecs: 40, guessSecs: 10, attempts: 2, hints: 0, eraser: false, group: 4 }
};

export const PICK_SECONDS = 10;
export const REVEAL_SECONDS = 16; // the round result, then the shared standings in the last 8 s
export const WORD_POINTS = [0, 100, 200, 300];
export const DRAWER_PER_GUESS = 50;
export const FLUSH_MS = 33; // live strokes: ~30 updates per second
const MAX_STROKES = 150;
const MAX_POINTS = 5000;
const COLORS = ['#111111', '#FF4F9A', '#4D9DFF', '#3DDC97', '#FF8A3D', '#B48CFF'];
const ERASER = '#FFFFFF';

const SETTINGS: SettingField[] = [
  {
    key: 'cycles', label: 'اللفّات', hint: 'كل واحد بيرسم كام مرة',
    options: [{ value: 1, label: '١', full: 'لفّة' }, { value: 2, label: '٢', full: 'لفّتين' }]
  }
];

export const drawDef: GameDef<DrawSettings> = {
  id: 'draw',
  name: 'ارسم وخمّن',
  minPlayers: 3,
  settings: SETTINGS,
  defaultSettings: () => ({ cycles: 1 }),
  levels: DRAW_LEVELS,
  create: (settings, level) => new DrawEngine(settings, level)
};

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface Stroke { id: number; c: string; w: number; pts: number[] }
interface Round {
  drawer: string;
  choices: DrawWord[];
  word: DrawWord | null;
  pts: number;
  strokes: Stroke[];
  drawTotal: number;
  guessTotal: number;
  guessStartedAt: number;
  tries: Record<string, number>;
  mine: Record<string, { text: string; near: boolean }[]>;
  hint: Record<string, string>;
  solved: Record<string, { gain: number; left: number; hinted: boolean; order: number }>;
  feed: { id: string; text: string | null; ok: boolean }[];
  skipped: boolean;
  drawerGain: number;
}
type Op = { op: 'start'; id: number; c: string; w: number } | { op: 'pts'; id: number; pts: number[] } | { op: 'undo' } | { op: 'clear' };

export class DrawEngine implements GameEngine {
  readonly id = 'draw';
  readonly hostActions = ['next'] as const;

  private readonly settings: DrawSettings;
  private readonly level: Level;
  private participants: string[] = [];
  private order: string[] = [];
  private roundNo = 0;
  private phase: Phase = 'pick';
  private endsAt: number | null = null;
  private scores: Record<string, number> = {};
  private hintsLeft: Record<string, number> = {};
  private used = new Set<string>();
  private r!: Round;
  private rev = 0;
  private pending: Op[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private pointCount = 0;
  private ctxRef?: EngineCtx;
  private gallery: { round: number; drawer: string; word: string; strokes: Stroke[]; likes: Set<string> }[] = [];

  constructor(settings: DrawSettings, level: Level) {
    this.settings = { ...settings };
    this.level = level;
  }

  private get lv() { return DRAW_LEVELS[this.level]; }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.ctxRef = ctx;
    this.participants = [...participants];
    this.participants.forEach((id) => { this.scores[id] = 0; this.hintsLeft[id] = this.lv.hints; });
    const ring = shuffle(this.participants);
    this.order = Array.from({ length: this.settings.cycles }, () => ring).flat();
    this.roundNo = 0;
    this.nextRound(ctx);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    this.ctxRef = ctx;
    const p = (payload ?? {}) as { i?: unknown; id?: unknown; c?: unknown; w?: unknown; pts?: unknown; text?: unknown; round?: unknown };
    switch (action) {
      case 'pickWord': return this.pickWord(ctx, playerId, p.i);
      case 'strokeStart': return this.strokeStart(ctx, playerId, p.id, p.c, p.w);
      case 'strokePts': return this.strokePts(ctx, playerId, p.id, p.pts);
      case 'undo': return this.undo(ctx, playerId);
      case 'clear': return this.clear(ctx, playerId);
      case 'submit': return this.submit(ctx, playerId);
      case 'guess': return this.guess(ctx, playerId, p.text);
      case 'hint': return this.hint(ctx, playerId);
      case 'like': return this.like(ctx, playerId, p.round);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    if (this.phase === 'final') return;
    this.participants = this.participants.filter((id) => id !== playerId);
    this.order = this.order.filter((id, i) => i < this.roundNo || id !== playerId);
    if (this.participants.length < 2) return this.finish(ctx);
    if (this.r && this.r.drawer === playerId && (this.phase === 'pick' || this.phase === 'draw' || this.phase === 'guess')) {
      this.r.skipped = true;
      return this.toReveal(ctx);
    }
    if (this.phase === 'guess') return this.checkAllDone(ctx);
    ctx.emit();
  }

  onPresenceChange(ctx: EngineCtx) {
    ctx.emit();
  }

  scoreOf(playerId: string) {
    return this.scores[playerId] ?? 0;
  }

  /** Host ended the game. */
  abort(ctx: EngineCtx) {
    if (this.phase !== 'final') this.finish(ctx);
  }

  /** Share of the drawings played. */
  progress() {
    const done = this.phase === 'reveal' || this.phase === 'final' ? this.roundNo : this.roundNo - 1;
    return Math.min(1, Math.max(0, done / Math.max(1, this.order.length)));
  }

  /** The lounge went back without results: stop the stroke flush timer. */
  dispose() {
    this.clearFlush();
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  /** Secrets: the word only reaches the drawer (and everyone at the reveal); a hint letter only its owner; "قريب!" only the guesser. Guesses stay closed until the drawing is submitted. */
  viewFor(playerId: string) {
    const inGame = this.participants.includes(playerId);
    const r = this.r;
    const base = {
      type: 'draw' as const,
      phase: this.phase,
      endsAt: this.endsAt,
      level: this.level,
      participants: this.participants,
      scores: this.scores,
      round: this.roundNo,
      rounds: this.order.length,
      cfg: { eraser: this.lv.eraser, drawSecs: this.lv.drawSecs, guessSecs: this.lv.guessSecs, attempts: this.lv.attempts, hints: this.lv.hints, colors: COLORS },
      queue: this.order.slice(this.roundNo, this.roundNo + 5)
    };
    if (!r || this.phase === 'final') {
      return { ...base, drawer: null, isDrawer: false, choices: null, word: null, pts: 0, strokes: [], rev: this.rev, solvedIds: [], feed: [], me: null, result: null, final: this.phase === 'final' ? this.finalView(playerId) : null };
    }
    const isDrawer = r.drawer === playerId;
    const open = this.phase === 'reveal';
    const hasHint = r.hint[playerId] ?? null;
    return {
      ...base,
      drawer: r.drawer,
      isDrawer,
      choices: this.phase === 'pick' && isDrawer ? r.choices.map((c, i) => ({ i, w: c.w, shape: c.shape, pts: WORD_POINTS[c.shape] })) : null,
      word: r.word && (open || (isDrawer && (this.phase === 'draw' || this.phase === 'guess'))) ? r.word.w : null,
      pts: r.pts,
      strokes: this.phase === 'draw' || this.phase === 'guess' || open ? r.strokes : [],
      rev: this.rev,
      solvedIds: Object.keys(r.solved),
      feed: r.feed.slice(-6),
      me: inGame && !isDrawer
        ? {
            attemptsLeft: Math.max(0, this.lv.attempts - (r.tries[playerId] ?? 0)),
            guessed: playerId in r.solved,
            gain: r.solved[playerId]?.gain ?? 0,
            mine: r.mine[playerId] ?? [],
            hintLetter: hasHint,
            hintsLeft: this.hintsLeft[playerId] ?? 0,
            canHint: this.phase === 'guess' && !hasHint && (this.hintsLeft[playerId] ?? 0) > 0 && !!r.word && letters(r.word.w).length >= 5 && !(playerId in r.solved) && (r.tries[playerId] ?? 0) < this.lv.attempts
          }
        : null,
      result: open
        ? {
            word: r.word?.w ?? null,
            skipped: r.skipped,
            gains: Object.entries(r.solved).sort((a, b) => a[1].order - b[1].order).map(([id, s]) => ({ id, gain: s.gain, left: s.left, hinted: s.hinted })),
            outOf: this.participants.filter((id) => id !== r.drawer && !(id in r.solved) && (r.tries[id] ?? 0) >= this.lv.attempts),
            drawerGain: r.drawerGain,
            total: this.participants.length - 1
          }
        : null,
      final: null
    };
  }

  // ---------- rounds ----------

  private nextRound(ctx: EngineCtx) {
    this.clearFlush();
    const drawer = this.order[this.roundNo];
    if (!drawer) return this.finish(ctx);
    this.roundNo += 1;
    this.rev = 0;
    this.pending = [];
    this.pointCount = 0;
    this.r = {
      drawer, choices: this.choicesFor(), word: null, pts: 0, strokes: [], drawTotal: this.lv.drawSecs, guessTotal: this.lv.guessSecs, guessStartedAt: 0,
      tries: {}, mine: {}, hint: {}, solved: {}, feed: [], skipped: false, drawerGain: 0
    };
    this.phase = 'pick';
    this.endsAt = Date.now() + PICK_SECONDS * 1000;
    ctx.schedule(PICK_SECONDS, () => this.chooseWord(ctx, 0)); // out of time: the easy word
    ctx.emit();
  }

  /** Three words of the level's pool, ordered by real drawing difficulty: simple shape, more detail, a concept. Words already used in this game come last. */
  private choicesFor(): DrawWord[] {
    return [1, 2, 3].map((shape) => {
      const pool = DRAW_WORDS.filter((w) => w.group === this.lv.group && w.shape === shape);
      const fresh = pool.filter((w) => !this.used.has(w.w));
      const w = pick(fresh.length ? fresh : pool);
      this.used.add(w.w);
      return w;
    });
  }

  private pickWord(ctx: EngineCtx, playerId: string, i: unknown) {
    if (this.phase !== 'pick' || this.r.drawer !== playerId) throw new GameError('مش دورك تختار');
    const n = Number(i);
    if (!Number.isInteger(n) || n < 0 || n > 2) throw new GameError('اختيار مش صح');
    this.chooseWord(ctx, n);
  }

  private chooseWord(ctx: EngineCtx, i: number) {
    if (this.phase !== 'pick') return;
    const w = this.r.choices[i];
    this.r.word = w;
    this.r.pts = WORD_POINTS[w.shape];
    this.phase = 'draw';
    this.endsAt = Date.now() + this.lv.drawSecs * 1000;
    ctx.schedule(this.lv.drawSecs, () => this.endDrawing(ctx));
    ctx.emit();
  }

  // ---------- drawing (streamed live) ----------

  private mustDrawer(playerId: string) {
    if (this.phase !== 'draw' || this.r.drawer !== playerId) throw new GameError('مش وقته ترسم');
    return this.r;
  }

  private queue(ctx: EngineCtx, op: Op) {
    this.pending.push(op);
    if (this.flushTimer) return;
    const base = this.rev;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const ops = this.pending;
      this.pending = [];
      if (!ops.length || this.phase !== 'draw') return;
      ctx.push(this.guessers(ctx), 'draw:delta', { round: this.roundNo, base: this.rev - ops.length, rev: this.rev, ops });
    }, FLUSH_MS);
    void base;
  }

  private strokeStart(ctx: EngineCtx, playerId: string, id: unknown, c: unknown, w: unknown) {
    const r = this.mustDrawer(playerId);
    const sid = Number(id);
    const color = String(c ?? '').toUpperCase();
    const width = Math.round(Number(w));
    if (!Number.isInteger(sid) || sid < 0 || r.strokes.some((s) => s.id === sid)) throw new GameError('خط مش صح');
    if (!COLORS.includes(color) && !(color === ERASER && this.lv.eraser)) throw new GameError(color === ERASER ? 'مفيش ممحاة في المستوى ده' : 'لون مش صح');
    if (!Number.isFinite(width) || width < 2 || width > 40) throw new GameError('سُمك مش صح');
    if (r.strokes.length >= MAX_STROKES) throw new GameError('الرسمة كبرت أوي، امسح حاجة');
    r.strokes.push({ id: sid, c: color, w: width, pts: [] });
    this.rev += 1;
    this.queue(ctx, { op: 'start', id: sid, c: color, w: width });
  }

  private strokePts(ctx: EngineCtx, playerId: string, id: unknown, pts: unknown) {
    const r = this.mustDrawer(playerId);
    const s = r.strokes.find((x) => x.id === Number(id));
    if (!s || !Array.isArray(pts)) throw new GameError('خط مش صح');
    const clean: number[] = [];
    for (let i = 0; i + 1 < pts.length && i < 200; i += 2) {
      const x = Math.round(Number(pts[i])), y = Math.round(Number(pts[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      clean.push(Math.min(300, Math.max(0, x)), Math.min(300, Math.max(0, y)));
    }
    if (!clean.length || this.pointCount + clean.length / 2 > MAX_POINTS) return;
    this.pointCount += clean.length / 2;
    s.pts.push(...clean);
    this.rev += 1;
    this.queue(ctx, { op: 'pts', id: s.id, pts: clean });
  }

  private undo(ctx: EngineCtx, playerId: string) {
    const r = this.mustDrawer(playerId);
    if (!r.strokes.length) return;
    const s = r.strokes.pop()!;
    this.pointCount = Math.max(0, this.pointCount - s.pts.length / 2);
    this.rev += 1;
    this.queue(ctx, { op: 'undo' });
  }

  private clear(ctx: EngineCtx, playerId: string) {
    const r = this.mustDrawer(playerId);
    if (!r.strokes.length) return;
    r.strokes = [];
    this.pointCount = 0;
    this.rev += 1;
    this.queue(ctx, { op: 'clear' });
  }

  private guessers(ctx: EngineCtx) {
    return this.participants.filter((id) => id !== this.r.drawer && ctx.room.players.get(id)?.connected);
  }

  private clearFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending = [];
  }

  /** The drawer pressed "خلصت · سلّم الرسمة". */
  private submit(ctx: EngineCtx, playerId: string) {
    const r = this.mustDrawer(playerId);
    if (!r.strokes.some((s) => s.pts.length > 0)) throw new GameError('ارسم حاجة الأول');
    this.endDrawing(ctx);
  }

  /** Time is up or the drawing was submitted: guessing opens now. An empty drawing cancels the round. */
  private endDrawing(ctx: EngineCtx) {
    if (this.phase !== 'draw') return;
    this.clearFlush();
    if (!this.r.strokes.some((s) => s.pts.length > 0)) { this.r.skipped = true; return this.toReveal(ctx); }
    this.phase = 'guess';
    this.r.guessStartedAt = Date.now();
    this.endsAt = Date.now() + this.lv.guessSecs * 1000;
    ctx.schedule(this.lv.guessSecs, () => this.toReveal(ctx));
    ctx.emit();
  }

  // ---------- guessing ----------

  private guess(ctx: EngineCtx, playerId: string, text: unknown) {
    const r = this.r;
    if (this.phase !== 'guess') throw new GameError('التخمين لسه مفتحش');
    if (!this.participants.includes(playerId) || r.drawer === playerId) throw new GameError('الرسّام مبيخمّنش');
    if (playerId in r.solved) throw new GameError('انت خمّنتها خلاص');
    if ((r.tries[playerId] ?? 0) >= this.lv.attempts) throw new GameError('محاولاتك خلصت');
    const raw = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!raw) throw new GameError('اكتب تخمينك');
    r.tries[playerId] = (r.tries[playerId] ?? 0) + 1;
    const a = normalizeGuess(raw), b = normalizeGuess(r.word!.w);
    if (a === b) {
      const left = Math.max(0, this.endsAt! - Date.now()) / 1000;
      const hinted = !!r.hint[playerId];
      const gain = Math.round(r.pts * (0.5 + 0.5 * Math.min(1, left / this.lv.guessSecs)) * (hinted ? 0.5 : 1));
      r.solved[playerId] = { gain, left: Math.round(left), hinted, order: Object.keys(r.solved).length + 1 };
      this.scores[playerId] += gain;
      r.feed.push({ id: playerId, text: null, ok: true });
      (r.mine[playerId] ??= []).push({ text: raw, near: false });
    } else {
      const near = oneOff(a, b);
      (r.mine[playerId] ??= []).push({ text: raw, near });
      r.feed.push({ id: playerId, text: raw, ok: false });
    }
    ctx.emit();
    this.checkAllDone(ctx);
  }

  private hint(ctx: EngineCtx, playerId: string) {
    const r = this.r;
    if (this.phase !== 'guess' || !r.word || r.drawer === playerId) throw new GameError('مش وقته دلوقتي');
    const word = letters(r.word.w);
    if (word.length < 5) throw new GameError('الكلمة قصيرة، مفيش كشف حرف');
    if (r.hint[playerId]) throw new GameError('كشفت حرف خلاص');
    if ((this.hintsLeft[playerId] ?? 0) <= 0) throw new GameError('مفيش كروت كشف');
    if (playerId in r.solved || (r.tries[playerId] ?? 0) >= this.lv.attempts) throw new GameError('مش وقته');
    r.hint[playerId] = pick(word); // one letter that is in the word: no position, no count
    this.hintsLeft[playerId] -= 1;
    ctx.emitTo([playerId]);
  }

  private checkAllDone(ctx: EngineCtx) {
    if (this.phase !== 'guess') return;
    const r = this.r;
    const rest = this.participants.filter((id) => id !== r.drawer);
    if (rest.length && rest.every((id) => id in r.solved || (r.tries[id] ?? 0) >= this.lv.attempts)) this.toReveal(ctx);
  }

  // ---------- reveal, next, final ----------

  private toReveal(ctx: EngineCtx) {
    if (this.phase === 'reveal' || this.phase === 'final') return;
    const r = this.r;
    this.clearFlush();
    r.drawerGain = Math.min(r.pts, DRAWER_PER_GUESS * Object.keys(r.solved).length);
    this.scores[r.drawer] = (this.scores[r.drawer] ?? 0) + r.drawerGain;
    if (r.word && r.strokes.some((s) => s.pts.length > 0)) this.gallery.push({ round: this.roundNo, drawer: r.drawer, word: r.word.w, strokes: r.strokes.map((s) => ({ ...s })), likes: new Set() });
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_SECONDS * 1000;
    ctx.schedule(REVEAL_SECONDS, () => { try { this.advance(ctx); } catch { /* the host decides */ } });
    ctx.emit();
  }

  private advance(ctx: EngineCtx) {
    if (this.phase !== 'reveal') throw new GameError('مش وقته دلوقتي');
    if (this.roundNo >= this.order.length) return this.finish(ctx);
    this.nextRound(ctx);
  }

  private finish(ctx: EngineCtx) {
    this.clearFlush();
    ctx.clearTimer();
    this.phase = 'final';
    this.endsAt = null;
    ctx.emit();
  }

  private like(ctx: EngineCtx, playerId: string, round: unknown) {
    if (this.phase !== 'final') throw new GameError('مش وقته دلوقتي');
    if (!this.participants.includes(playerId)) throw new GameError('انت مش في اللعبة');
    const g = this.gallery.find((x) => x.round === Number(round));
    if (!g) throw new GameError('الرسمة مش موجودة');
    if (g.drawer === playerId) throw new GameError('مينفعش تعمل لايك لرسمتك');
    if (g.likes.has(playerId)) g.likes.delete(playerId); else g.likes.add(playerId);
    ctx.emit();
  }

  private finalView(playerId: string) {
    const ranked = [...this.participants].sort((a, b) => (this.scores[b] ?? 0) - (this.scores[a] ?? 0));
    const hearts: Record<string, number> = {};
    this.gallery.forEach((g) => { hearts[g.drawer] = (hearts[g.drawer] ?? 0) + g.likes.size; });
    const artist = Object.entries(hearts).filter(([id, n]) => n > 0 && this.participants.includes(id)).sort((a, b) => b[1] - a[1])[0];
    return {
      ranked,
      gallery: this.gallery.map((g) => ({ round: g.round, drawer: g.drawer, word: g.word, strokes: g.strokes, likes: g.likes.size, mine: g.likes.has(playerId) })),
      artist: artist ? { id: artist[0], hearts: artist[1] } : null
    };
  }
}

/** The letters of a word without spaces (a hint card needs 5 or more of them). */
function letters(w: string): string[] {
  return [...w.replace(/\s+/g, '')].filter((c) => /[ء-ي]/.test(c));
}

void arabicNum;
