import { arabicNum } from '../../common/ar';
import { GameError } from '../../rooms/rooms.types';
import type { Room } from '../../rooms/rooms.types';
import type { Level } from '../difficulty';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { CATEGORIES, QUESTIONS, type QuizQuestion } from '../quiz/questions';

export interface AuctionSettings {
  /** How many pieces of information are auctioned. */
  lots: 5 | 8 | 12;
}

type Phase = 'bid' | 'sold' | 'answer' | 'reveal' | 'final';

/** The difficulty table of this game (01-brainstorm/difficulty.md, "Auction" rows). `penalty` = share of the price lost on a wrong answer (0 = refund). `tier` = question difficulty. */
export const AUCTION_LEVELS: Record<Level, { bidSecs: number; start: number; penalty: number; tier: number }> = {
  easy: { bidSecs: 15, start: 1500, penalty: 0, tier: 1 },
  medium: { bidSecs: 10, start: 1000, penalty: 0.5, tier: 2 },
  hard: { bidSecs: 8, start: 800, penalty: 1, tier: 3 },
  max: { bidSecs: 5, start: 500, penalty: 2, tier: 4 }
};

export const BID_STEPS = [50, 100, 200] as const;
export const FIRST_BID_GRACE = 4; // extra seconds before the very first bid of a lot
export const SOLD_SECONDS = 3;
export const ANSWER_SECONDS = 15;
export const REVEAL_SECONDS = 14; // the lot result, then the shared standings in the last 8 s
export const PREDICT_BONUS = 50;

const SETTINGS: SettingField[] = [
  {
    key: 'lots', label: 'المعلومات', hint: 'كام معلومة هتتباع في المزاد',
    options: [{ value: 5, label: '٥', full: '٥ معلومات' }, { value: 8, label: '٨', full: '٨ معلومات' }, { value: 12, label: '١٢', full: '١٢ معلومة' }]
  }
];

export const auctionDef: GameDef<AuctionSettings> = {
  id: 'auction',
  name: 'مزاد المعلومات',
  minPlayers: 2,
  settings: SETTINGS,
  defaultSettings: () => ({ lots: 8 }),
  levels: AUCTION_LEVELS,
  create: (settings, level) => new AuctionEngine(settings, level)
};

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Questions already auctioned in this room's session: fresh ones are preferred. */
const asked = new WeakMap<Room, Set<string>>();

interface Lot {
  q: QuizQuestion;
  topic: string;
  /** Options in display order; `right` is the index of the correct one. */
  options: string[];
  right: number;
}
interface Bid { by: string; amount: number }
interface Result {
  kind: 'right' | 'wrong' | 'none';
  buyer: string | null;
  price: number;
  delta: number;
  chosen: number | null;
  correct: number;
  predictions: { id: string; yes: boolean; ok: boolean }[];
}

export class AuctionEngine implements GameEngine {
  readonly id = 'auction';
  readonly hostActions = ['next'] as const;

  private readonly settings: AuctionSettings;
  private readonly level: Level;
  private room?: Room;
  private participants: string[] = [];
  private money: Record<string, number> = {};
  private phase: Phase = 'bid';
  private endsAt: number | null = null;
  private lots: Lot[] = [];
  private lotNo = 0;
  private bids: Bid[] = [];
  private buyer: string | null = null;
  private price = 0;
  private pick: number | null = null; // the buyer's chosen option (private until it is locked)
  private locked = false;
  private predictions: Record<string, boolean> = {};
  private result: Result | null = null;
  private stats: Record<string, { bids: number; hits: number }> = {};
  private deals: { id: string; price: number; right: boolean }[] = [];

  constructor(settings: AuctionSettings, level: Level) {
    this.settings = { ...settings };
    this.level = level;
  }

  private get lv() { return AUCTION_LEVELS[this.level]; }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.participants = [...participants];
    this.participants.forEach((id) => { this.money[id] = this.lv.start; this.stats[id] = { bids: 0, hits: 0 }; });
    this.lots = this.drawLots(ctx);
    this.lotNo = 0;
    this.nextLot(ctx);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { step?: unknown; option?: unknown; yes?: unknown };
    switch (action) {
      case 'bid': return this.bid(ctx, playerId, p.step);
      case 'pick': return this.pickOption(ctx, playerId, p.option);
      case 'lock': return this.lock(ctx, playerId);
      case 'predict': return this.predict(ctx, playerId, p.yes);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    if (this.phase === 'final') return;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.predictions[playerId];
    if (this.participants.length < 2) return this.finish(ctx);
    if (this.phase === 'bid') {
      this.bids = this.bids.filter((b) => b.by !== playerId);
      const top = this.bids[this.bids.length - 1];
      this.buyer = top?.by ?? null;
      this.price = top?.amount ?? 0;
      ctx.emit();
    } else if (this.phase === 'answer' && this.buyer === playerId) {
      this.settle(ctx, null); // the buyer left: counts as a wrong answer
    } else ctx.emit();
  }

  onPresenceChange(ctx: EngineCtx) {
    ctx.emit();
  }

  scoreOf(playerId: string) {
    return this.money[playerId] ?? 0;
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  /** Secrets: the question exists for clients only after the lot is sold (never during bidding), and the right answer only at the reveal. The buyer's pick stays private until it is locked. */
  viewFor(playerId: string) {
    const inGame = this.participants.includes(playerId);
    const lot = this.lots[this.lotNo - 1];
    const asking = this.phase === 'answer' || this.phase === 'reveal';
    const reveal = this.phase === 'reveal' || this.phase === 'final';
    return {
      type: 'auction' as const,
      phase: this.phase,
      endsAt: this.endsAt,
      level: this.level,
      participants: this.participants,
      money: this.money,
      lotNo: this.lotNo,
      lots: this.settings.lots,
      bidSecs: this.lv.bidSecs,
      penalty: this.lv.penalty,
      topic: lot && this.phase !== 'final' ? lot.topic : null,
      tier: lot && this.phase !== 'final' ? this.lv.tier : null,
      price: this.price,
      buyer: this.buyer,
      log: this.bids.slice(-3),
      steps: BID_STEPS,
      question: lot && asking ? { text: lot.q.q, options: lot.options } : null,
      pick: this.phase === 'answer' && this.buyer === playerId ? this.pick : null,
      locked: this.locked,
      predicted: inGame && this.phase === 'answer' ? this.predictions[playerId] ?? null : null,
      predictors: this.phase === 'answer' ? Object.keys(this.predictions) : [],
      result: this.phase === 'reveal' ? this.result : null,
      fact: this.phase === 'reveal' && lot ? lot.q.fact : null,
      final: this.phase === 'final' ? this.finalView() : null,
      you: inGame ? { money: this.money[playerId] ?? 0, role: this.phase === 'answer' ? (this.buyer === playerId ? 'buyer' : 'watcher') : 'bidder' } : null,
      revealCorrect: reveal && lot ? lot.right : null
    };
  }

  // ---------- lots ----------

  /** One lot per question; the room's level picks the tier (nearest tier when short), fresh questions first. */
  private drawLots(ctx: EngineCtx): Lot[] {
    const seen = asked.get(ctx.room) ?? new Set<string>();
    asked.set(ctx.room, seen);
    const score = (q: QuizQuestion) => Math.abs(q.d - this.lv.tier) * 10 + (seen.has(q.id) ? 5 : 0) + Math.random();
    const picked = [...QUESTIONS].sort((a, b) => score(a) - score(b)).slice(0, this.settings.lots);
    picked.forEach((q) => seen.add(q.id));
    return shuffle(picked).map((q) => {
      const order = shuffle([0, 1, 2, 3]);
      return { q, topic: CATEGORIES.find((c) => c.id === q.cat)?.name ?? q.cat, options: order.map((i) => q.options[i]), right: order.indexOf(0) };
    });
  }

  private nextLot(ctx: EngineCtx) {
    this.lotNo += 1;
    if (this.lotNo > this.lots.length) return this.finish(ctx);
    this.bids = [];
    this.buyer = null;
    this.price = 0;
    this.pick = null;
    this.locked = false;
    this.predictions = {};
    this.result = null;
    this.phase = 'bid';
    this.endsAt = Date.now() + (this.lv.bidSecs + FIRST_BID_GRACE) * 1000;
    ctx.schedule(this.lv.bidSecs + FIRST_BID_GRACE, () => this.close(ctx));
    ctx.emit();
  }

  // ---------- bidding ----------

  private bid(ctx: EngineCtx, playerId: string, step: unknown) {
    if (this.phase !== 'bid') throw new GameError('المزاد خلص');
    if (!this.participants.includes(playerId)) throw new GameError('انت مش في اللعبة');
    const s = Number(step);
    if (!(BID_STEPS as readonly number[]).includes(s)) throw new GameError('مزايدة مش صح');
    if (this.buyer === playerId) throw new GameError('انت اللي مزايد بأعلى سعر خلاص');
    const amount = this.price + s;
    if (amount > (this.money[playerId] ?? 0)) throw new GameError('فلوسك مش كفاية');
    this.price = amount;
    this.buyer = playerId;
    this.bids.push({ by: playerId, amount });
    this.stats[playerId].bids += 1;
    this.endsAt = Date.now() + this.lv.bidSecs * 1000; // every bid resets the countdown
    ctx.schedule(this.lv.bidSecs, () => this.close(ctx));
    ctx.emit();
  }

  /** The countdown ran out: sold to the highest bidder, or skipped when nobody bid. */
  private close(ctx: EngineCtx) {
    if (this.phase !== 'bid') return;
    if (!this.buyer) {
      this.result = { kind: 'none', buyer: null, price: 0, delta: 0, chosen: null, correct: this.lots[this.lotNo - 1].right, predictions: [] };
      return this.toReveal(ctx);
    }
    this.phase = 'sold';
    this.endsAt = Date.now() + SOLD_SECONDS * 1000;
    ctx.schedule(SOLD_SECONDS, () => this.toAnswer(ctx));
    ctx.emit();
  }

  // ---------- the buyer answers, the others predict ----------

  private toAnswer(ctx: EngineCtx) {
    if (this.phase !== 'sold') return;
    this.phase = 'answer';
    this.endsAt = Date.now() + ANSWER_SECONDS * 1000;
    ctx.schedule(ANSWER_SECONDS, () => this.settle(ctx, this.pick));
    ctx.emit();
  }

  private pickOption(ctx: EngineCtx, playerId: string, option: unknown) {
    if (this.phase !== 'answer' || this.buyer !== playerId) throw new GameError('مش دورك تجاوب');
    if (this.locked) throw new GameError('الإجابة اتثبتت');
    const o = Number(option);
    if (!Number.isInteger(o) || o < 0 || o > 3) throw new GameError('اختيار مش صح');
    this.pick = this.pick === o ? null : o;
    ctx.emitTo([playerId]);
  }

  private lock(ctx: EngineCtx, playerId: string) {
    if (this.phase !== 'answer' || this.buyer !== playerId) throw new GameError('مش دورك تجاوب');
    if (this.pick === null) throw new GameError('اختار إجابة الأول');
    this.locked = true;
    this.settle(ctx, this.pick);
  }

  private predict(ctx: EngineCtx, playerId: string, yes: unknown) {
    if (this.phase !== 'answer') throw new GameError('مش وقته دلوقتي');
    if (!this.participants.includes(playerId) || this.buyer === playerId) throw new GameError('المشتري مبيتوقعش');
    this.predictions[playerId] = !!yes;
    ctx.emit(); // everyone sees who already predicted (not what)
  }

  /** The answer is in (or time ran out): money moves. Right: the buyer gets the price back twice (net +price); wrong: loses a share of the price by level; each correct prediction earns a bonus. */
  private settle(ctx: EngineCtx, option: number | null) {
    if (this.phase !== 'answer' || !this.buyer) return;
    const lot = this.lots[this.lotNo - 1];
    const right = option !== null && option === lot.right;
    const buyer = this.buyer;
    const before = this.money[buyer];
    const delta = right ? this.price : -Math.min(before, Math.round(this.price * this.lv.penalty));
    this.money[buyer] = before + delta;
    const predictions = Object.entries(this.predictions).map(([id, yes]) => {
      const ok = yes === right;
      if (ok && this.money[id] !== undefined) { this.money[id] += PREDICT_BONUS; this.stats[id].hits += 1; }
      return { id, yes, ok };
    });
    this.deals.push({ id: buyer, price: this.price, right });
    this.result = { kind: right ? 'right' : 'wrong', buyer, price: this.price, delta, chosen: option, correct: lot.right, predictions };
    this.toReveal(ctx);
  }

  private toReveal(ctx: EngineCtx) {
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_SECONDS * 1000;
    ctx.schedule(REVEAL_SECONDS, () => { try { this.advance(ctx); } catch { /* the host decides */ } });
    ctx.emit();
  }

  private advance(ctx: EngineCtx) {
    if (this.phase !== 'reveal') throw new GameError('مش وقته دلوقتي');
    this.nextLot(ctx);
  }

  private finish(ctx: EngineCtx) {
    ctx.clearTimer();
    this.phase = 'final';
    this.endsAt = null;
    ctx.emit();
  }

  private finalView() {
    const ids = this.participants;
    const top = <T>(list: [string, T][], score: (v: T) => number) => list.filter(([, v]) => score(v) > 0).sort((a, b) => score(b[1]) - score(a[1]))[0];
    const priciest = [...this.deals].filter((d) => ids.includes(d.id)).sort((a, b) => b.price - a.price)[0];
    const bold = top(Object.entries(this.stats).filter(([id]) => ids.includes(id)), (v) => v.bids);
    const seer = top(Object.entries(this.stats).filter(([id]) => ids.includes(id)), (v) => v.hits);
    const steal = [...this.deals].filter((d) => d.right && ids.includes(d.id)).sort((a, b) => b.price - a.price)[0];
    return {
      awards: [
        { k: 'أغلى معلومة', id: priciest?.id ?? null, why: priciest ? `دفع ${arabicNum(priciest.price)} ج على معلومة` : 'محدش اشترى' },
        { k: 'أشجع مزايد', id: bold?.[0] ?? null, why: bold ? `زوّد ${arabicNum(bold[1].bids)} مرة` : 'محدش زايد' },
        { k: 'أحسن توقّعات', id: seer?.[0] ?? null, why: seer ? `${arabicNum(seer[1].hits)} توقّع صح` : 'مفيش توقّعات صح' },
        { k: 'صفقة العمر', id: steal?.id ?? null, why: steal ? `كسب ${arabicNum(steal.price)} ج من معلومة` : 'مفيش صفقة نجحت' }
      ]
    };
  }
}
