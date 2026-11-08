import { arabicNum } from '../../common/ar';
import { GameError } from '../../rooms/rooms.types';
import type { Room } from '../../rooms/rooms.types';
import type { Level } from '../difficulty';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { TeamChat } from '../team-chat';
import { normalizeTeams } from '../wave/wave.engine';
import { CATEGORIES, QUESTIONS, type QuizQuestion } from './questions';

export interface QuizSettings {
  /** Power cards on (1) or off (0). */
  cards: 0 | 1;
  /** Team of each player, edited by the host in the lounge (the same editor as الموجة). */
  teams: Record<string, 0 | 1>;
}

type Team = 0 | 1;
type Phase = 'draft' | 'board' | 'question' | 'steal' | 'reveal' | 'final';

/** The difficulty table of this game (01-brainstorm/difficulty.md, "Quiz" rows). `tiers` = question difficulty of the 200 / 400 / 600 cells. */
export const QUIZ_LEVELS: Record<Level, { seconds: number; fifty: number; penalty: number; tiers: [number, number, number] }> = {
  easy: { seconds: 30, fifty: 2, penalty: 0, tiers: [1, 1, 2] },
  medium: { seconds: 20, fifty: 1, penalty: 0, tiers: [1, 2, 3] },
  hard: { seconds: 15, fifty: 1, penalty: 0.5, tiers: [2, 3, 4] },
  max: { seconds: 10, fifty: 0, penalty: 1, tiers: [3, 4, 4] }
};

export const DRAFT_SECONDS = 15;
export const BOARD_SECONDS = 30;
export const STEAL_SECONDS = 10;
export const REVEAL_SECONDS = 7;
const VALUES = [200, 400, 600] as const;

const SETTINGS: SettingField[] = [
  {
    key: 'cards', label: 'الكروت', hint: '×٢ و٥٠:٥٠ وسرقة، كل كارت مرة لكل فريق',
    options: [{ value: 1, label: 'شغّالة', full: 'الكروت شغّالة' }, { value: 0, label: 'مقفولة', full: 'من غير كروت' }]
  }
];

export const quizDef: GameDef<QuizSettings> = {
  id: 'quiz',
  name: 'حزّورة',
  minPlayers: 4,
  settings: SETTINGS,
  defaultSettings: () => ({ cards: 1, teams: {} }),
  levels: QUIZ_LEVELS,
  create: (settings, level) => new QuizEngine(settings, level)
};

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const other = (t: Team): Team => (t === 0 ? 1 : 0);
const TEAM_NAME = ['الأزرق', 'البرتقالي'] as const;

/** Questions already asked in this room (any game of حزّورة in the same session): fresh ones are preferred so nothing repeats. */
const asked = new WeakMap<Room, Set<string>>();

interface Cell {
  q: QuizQuestion;
  value: number;
  special: 'treasure' | 'bomb' | null;
  /** The options in the order players see them: `order[i]` is the index into q.options, and the right one is the one with order[i] === 0. */
  order: number[];
  used: boolean;
  /** Who got the points: a team, or 'x' when nobody did. */
  winner: Team | 'x' | null;
}
interface Row { cat: string; id: string; owner: Team; cells: Cell[] }
interface Cards { double: number; fifty: number; steal: number }

interface Current {
  r: number;
  c: number;
  team: Team;
  doubled: boolean;
  /** The steal card was played on the other team's question: they answer right now. */
  early: boolean;
  votes: Record<string, number>;
  gone: number[];
  /** The option the first team picked (struck out for the stealers). */
  struck: number | null;
  first: { team: Team; option: number | null } | null;
  second: { team: Team; option: number | null; secondsLeft: number } | null;
  outcome: { kind: 'right' | 'steal' | 'wrong' | 'none'; team: Team | null; delta: [number, number]; note: string } | null;
}

export class QuizEngine implements GameEngine {
  readonly id = 'quiz';
  readonly hostActions = ['next'] as const;

  private readonly settings: QuizSettings;
  private readonly level: Level;
  private room?: Room;
  private participants: string[] = [];
  private teams: Record<string, Team> = {};
  private phase: Phase = 'draft';
  private endsAt: number | null = null;
  private picks: { id: string; team: Team }[] = [];
  private rows: Row[] = [];
  private turnTeam: Team = 0;
  private pickerIdx: [number, number] = [0, 0];
  private pickerId: string | null = null;
  private doubleArmed = false;
  private cards: [Cards, Cards];
  private teamScores: [number, number] = [0, 0];
  private cur: Current | null = null;
  private chat = new TeamChat();
  private stats: Record<string, { right: number; total: number }> = {};
  private moment: { text: string; sub: string; value: number } | null = null;

  constructor(settings: QuizSettings, level: Level) {
    this.settings = { ...settings };
    this.level = level;
    const fifty = settings.cards ? QUIZ_LEVELS[level].fifty : 0;
    const c = (): Cards => ({ double: settings.cards ? 1 : 0, fifty, steal: settings.cards ? 1 : 0 });
    this.cards = [c(), c()];
  }

  private get lv() { return QUIZ_LEVELS[this.level]; }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.participants = [...participants];
    this.teams = normalizeTeams(participants, this.settings.teams);
    // a team must have players: if the host left one empty, balance them
    const ids = (t: Team) => this.participants.filter((id) => this.teams[id] === t);
    if (ids(0).length === 0 || ids(1).length === 0) {
      shuffle(this.participants).forEach((id, i) => { this.teams[id] = (i % 2) as Team; });
    }
    this.participants.forEach((id) => { this.stats[id] = { right: 0, total: 0 }; });
    this.beginDraft(ctx);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { cat?: unknown; r?: unknown; c?: unknown; card?: unknown; option?: unknown; text?: unknown };
    switch (action) {
      case 'pickCategory': return this.pickCategory(ctx, playerId, p.cat);
      case 'pickCell': return this.pickCell(ctx, playerId, p.r, p.c);
      case 'card': return this.playCard(ctx, playerId, p.card);
      case 'vote': return this.vote(ctx, playerId, p.option);
      case 'lock': return this.lock(ctx, playerId);
      case 'teamChat': return this.teamChat(ctx, playerId, p.text);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    if (this.phase === 'final') return;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.teams[playerId];
    if (this.cur) delete this.cur.votes[playerId];
    if (this.team(0).length === 0 || this.team(1).length === 0) return this.finish(ctx);
    if (this.phase === 'board' && this.pickerId === playerId) this.pickerId = this.nextPicker(ctx, this.turnTeam);
    ctx.emit();
  }

  onPresenceChange(ctx: EngineCtx) {
    if (this.phase === 'board' && this.pickerId && !ctx.room.players.get(this.pickerId)?.connected) this.pickerId = this.nextPicker(ctx, this.turnTeam);
    ctx.emit();
  }

  scoreOf(playerId: string) {
    return this.teamScores[this.teams[playerId] ?? 0];
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  teamResult() {
    const [a, b] = this.teamScores;
    const ids = (t: Team) => this.participants.filter((id) => this.teams[id] === t);
    if (a === b) return { winners: [...ids(0), ...ids(1)], losers: [], label: 'تعادل' };
    const w: Team = a > b ? 0 : 1;
    return { winners: ids(w), losers: ids(other(w)), label: `الفريق ${TEAM_NAME[w]}` };
  }

  /** The right answer and the other team's choices stay on the server until the reveal; votes only go to the team that is answering. */
  viewFor(playerId: string) {
    const inGame = this.participants.includes(playerId);
    const myTeam: Team | null = inGame ? this.teams[playerId] : null;
    const cur = this.cur;
    const answering = this.answeringTeam();
    const revealed = this.phase === 'reveal' || this.phase === 'final';
    const base = {
      type: 'quiz' as const,
      phase: this.phase,
      endsAt: this.endsAt,
      participants: this.participants,
      teams: this.teams,
      teamScores: this.teamScores,
      turnTeam: this.turnTeam,
      level: this.level,
      cardsOn: this.settings.cards === 1,
      cards: this.cards,
      team: myTeam,
      chat: this.chat.of(myTeam),
      pickerId: this.phase === 'board' ? this.pickerId : null,
      doubleArmed: this.phase === 'board' ? this.doubleArmed : false,
      left: this.rows.reduce((n, r) => n + r.cells.filter((c) => !c.used).length, 0),
      cats: CATEGORIES.map((c) => ({ ...c, owner: this.picks.find((p) => p.id === c.id)?.team ?? null })),
      draftTurn: this.picks.length < CATEGORIES.length ? ((this.picks.length % 2) as Team) : null,
      rows: this.rows.map((r) => ({ id: r.id, name: CATEGORIES.find((c) => c.id === r.id)!.name, owner: r.owner, cells: r.cells.map((c) => ({ value: c.value, used: c.used, winner: c.winner })) })),
      total: this.rows.length * 3
    };
    if (!cur || (this.phase !== 'question' && this.phase !== 'steal' && this.phase !== 'reveal')) {
      return { ...base, question: null, you: inGame ? { role: this.roleOf(playerId), vote: null, locked: false } : null, final: this.phase === 'final' ? this.finalStats() : null };
    }
    const cell = this.rows[cur.r].cells[cur.c];
    const mine = myTeam !== null && myTeam === answering;
    const votes = mine ? cur.votes : {};
    return {
      ...base,
      question: {
        cat: CATEGORIES.find((c) => c.id === this.rows[cur.r].id)!.name,
        value: cell.value,
        worth: this.worth(cell, cur),
        special: cell.special,
        doubled: cur.doubled,
        early: cur.early,
        text: cell.q.q,
        answering,
        options: cell.order.map((o, i) => ({ text: cell.q.options[o], gone: cur.gone.includes(i), struck: cur.struck === i })),
        // teammates' choices: your own team only, while it is answering
        votes: Object.entries(votes).map(([id, option]) => ({ id, option })),
        correct: revealed ? cell.order.findIndex((o) => o === 0) : null,
        first: revealed ? cur.first : this.phase === 'steal' && cur.first ? { team: cur.first.team, option: cur.first.option } : null,
        second: revealed ? cur.second : null,
        outcome: this.phase === 'reveal' ? cur.outcome : null,
        fact: revealed ? cell.q.fact : null
      },
      you: inGame ? { role: this.roleOf(playerId), vote: mine ? cur.votes[playerId] ?? null : null, locked: false } : null,
      final: null
    };
  }

  // ---------- helpers ----------

  private team(t: Team) { return this.participants.filter((id) => this.teams[id] === t); }
  private online(ctx: EngineCtx, t: Team) { return this.team(t).filter((id) => ctx.room.players.get(id)?.connected); }

  private answeringTeam(): Team | null {
    const cur = this.cur;
    if (!cur) return null;
    if (this.phase === 'question') return cur.early ? other(cur.team) : cur.team;
    if (this.phase === 'steal') return other(cur.team);
    return null;
  }

  private roleOf(playerId: string) {
    if (!this.participants.includes(playerId)) return 'watcher';
    const t = this.teams[playerId];
    if (this.phase === 'draft') return t === this.picks.length % 2 ? 'picker' : 'watcher';
    if (this.phase === 'board') return playerId === this.pickerId ? 'picker' : t === this.turnTeam ? 'team' : 'watcher';
    return t === this.answeringTeam() ? 'answerer' : 'watcher';
  }

  private worth(cell: Cell, cur: Current) {
    return cell.value * (cur.doubled ? 2 : 1) * (cell.special === 'treasure' ? 2 : 1);
  }

  private nextPicker(ctx: EngineCtx, t: Team): string | null {
    const members = this.team(t);
    if (!members.length) return null;
    const on = members.filter((id) => ctx.room.players.get(id)?.connected);
    const pool = on.length ? on : members;
    const i = this.pickerIdx[t] % pool.length;
    this.pickerIdx[t] += 1;
    return pool[i];
  }

  // ---------- draft: each team picks 3 categories alternately ----------

  private beginDraft(ctx: EngineCtx) {
    this.phase = 'draft';
    this.endsAt = Date.now() + DRAFT_SECONDS * 1000;
    ctx.schedule(DRAFT_SECONDS, () => this.draftTimeout(ctx));
    ctx.emit();
  }

  private draftTimeout(ctx: EngineCtx) {
    if (this.phase !== 'draft') return;
    const free = CATEGORIES.filter((c) => !this.picks.some((p) => p.id === c.id));
    this.takeCategory(ctx, free[Math.floor(Math.random() * free.length)].id);
  }

  private pickCategory(ctx: EngineCtx, playerId: string, cat: unknown) {
    if (this.phase !== 'draft') throw new GameError('مش وقته دلوقتي');
    if (this.teams[playerId] !== this.picks.length % 2) throw new GameError('مش دور فريقك');
    const id = String(cat ?? '');
    if (!CATEGORIES.some((c) => c.id === id)) throw new GameError('فئة مش موجودة');
    if (this.picks.some((p) => p.id === id)) throw new GameError('الفئة دي اتاخدت');
    this.takeCategory(ctx, id);
  }

  private takeCategory(ctx: EngineCtx, id: string) {
    this.picks.push({ id, team: (this.picks.length % 2) as Team });
    if (this.picks.length < CATEGORIES.length) return this.beginDraft(ctx);
    this.buildBoard(ctx);
  }

  // ---------- board ----------

  /** One row per drafted category, three cells per row. A cell's question tier comes from the room's level; one treasure and one bomb hide in two different cells. */
  private buildBoard(ctx: EngineCtx) {
    const seen = asked.get(ctx.room) ?? new Set<string>();
    asked.set(ctx.room, seen);
    const used = new Set<string>();
    this.rows = this.picks.map(({ id, team }) => {
      const pool = QUESTIONS.filter((x) => x.cat === id);
      const cells = VALUES.map((value, i): Cell => {
        const want = this.lv.tiers[i];
        const free = pool.filter((x) => !used.has(x.id));
        const score = (x: QuizQuestion) => Math.abs(x.d - want) * 10 + (seen.has(x.id) ? 5 : 0) + Math.random();
        const q = [...free].sort((a, b) => score(a) - score(b))[0];
        used.add(q.id);
        seen.add(q.id);
        return { q, value, special: null, order: shuffle([0, 1, 2, 3]), used: false, winner: null };
      });
      return { cat: id, id, owner: team, cells };
    });
    const spots = shuffle(this.rows.flatMap((r, ri) => r.cells.map((_, ci) => [ri, ci] as const)));
    this.rows[spots[0][0]].cells[spots[0][1]].special = 'treasure';
    this.rows[spots[1][0]].cells[spots[1][1]].special = 'bomb';
    this.turnTeam = 0;
    ctx.system('اللوحة جاهزة، يلا نلعب');
    this.beginBoard(ctx);
  }

  private beginBoard(ctx: EngineCtx) {
    this.phase = 'board';
    this.cur = null;
    this.doubleArmed = false;
    this.pickerId = this.nextPicker(ctx, this.turnTeam);
    this.endsAt = Date.now() + BOARD_SECONDS * 1000;
    ctx.schedule(BOARD_SECONDS, () => this.boardTimeout(ctx));
    ctx.emit();
  }

  private boardTimeout(ctx: EngineCtx) {
    if (this.phase !== 'board') return;
    const open = this.rows.flatMap((r, ri) => r.cells.map((c, ci) => ({ c, ri, ci }))).filter((x) => !x.c.used);
    if (!open.length) return this.finish(ctx);
    const pick = open[Math.floor(Math.random() * open.length)];
    this.openCell(ctx, pick.ri, pick.ci);
  }

  private pickCell(ctx: EngineCtx, playerId: string, r: unknown, c: unknown) {
    if (this.phase !== 'board') throw new GameError('مش وقته دلوقتي');
    if (playerId !== this.pickerId) throw new GameError(this.teams[playerId] === this.turnTeam ? 'مش دورك تختار' : 'مش دور فريقك');
    const ri = Number(r), ci = Number(c);
    const cell = this.rows[ri]?.cells[ci];
    if (!cell || cell.used) throw new GameError('الخانة دي اتلعبت');
    this.openCell(ctx, ri, ci);
  }

  private openCell(ctx: EngineCtx, r: number, c: number) {
    const team = this.turnTeam;
    this.cur = { r, c, team, doubled: this.doubleArmed, early: false, votes: {}, gone: [], struck: null, first: null, second: null, outcome: null };
    this.doubleArmed = false;
    this.beginQuestion(ctx);
  }

  // ---------- question ----------

  private beginQuestion(ctx: EngineCtx) {
    this.phase = 'question';
    this.cur!.votes = {};
    this.endsAt = Date.now() + this.lv.seconds * 1000;
    ctx.schedule(this.lv.seconds, () => this.endAnswer(ctx));
    ctx.emit();
  }

  private vote(ctx: EngineCtx, playerId: string, option: unknown) {
    const cur = this.cur;
    if (!cur || (this.phase !== 'question' && this.phase !== 'steal')) throw new GameError('مش وقته دلوقتي');
    if (this.teams[playerId] !== this.answeringTeam()) throw new GameError('مش دور فريقك تجاوب');
    const o = Number(option);
    if (!Number.isInteger(o) || o < 0 || o > 3) throw new GameError('اختيار مش صح');
    if (cur.gone.includes(o) || cur.struck === o) throw new GameError('الاختيار ده مش متاح');
    if (cur.votes[playerId] === o) delete cur.votes[playerId];
    else cur.votes[playerId] = o;
    ctx.emitTo(this.team(this.answeringTeam()!));
  }

  /** The most-voted option; null on a tie or when nobody voted. */
  private leading(): number | null {
    const cur = this.cur!;
    const n = [0, 0, 0, 0];
    Object.values(cur.votes).forEach((o) => { n[o]++; });
    const max = Math.max(...n);
    if (max === 0) return null;
    const top = n.flatMap((v, i) => (v === max ? [i] : []));
    return top.length === 1 ? top[0] : null;
  }

  private lock(ctx: EngineCtx, playerId: string) {
    const cur = this.cur;
    if (!cur || (this.phase !== 'question' && this.phase !== 'steal')) throw new GameError('مش وقته دلوقتي');
    if (this.teams[playerId] !== this.answeringTeam()) throw new GameError('مش دور فريقك تجاوب');
    if (Object.keys(cur.votes).length === 0) throw new GameError('اختاروا إجابة الأول');
    if (this.leading() === null) throw new GameError('الفريق متقسم، اتفقوا الأول');
    this.endAnswer(ctx);
  }

  /** The answering team's turn is over (locked or out of time): its majority is the answer (a tie counts as no answer). */
  private endAnswer(ctx: EngineCtx) {
    const cur = this.cur;
    if (!cur || (this.phase !== 'question' && this.phase !== 'steal')) return;
    ctx.clearTimer();
    const team = this.answeringTeam()!;
    const option = this.leading();
    const cell = this.rows[cur.r].cells[cur.c];
    const right = cell.order.findIndex((o) => o === 0);
    const secondsLeft = this.endsAt ? Math.max(0, Math.round((this.endsAt - Date.now()) / 1000)) : 0;
    // every voter's own choice counts for the "board star"
    Object.entries(cur.votes).forEach(([id, o]) => {
      const s = (this.stats[id] ??= { right: 0, total: 0 });
      s.total++;
      if (o === right) s.right++;
    });
    const worth = this.worth(cell, cur);

    if (this.phase === 'question' && !cur.early) {
      cur.first = { team, option };
      if (option === right) return this.resolve(ctx, { kind: 'right', team, delta: this.delta(team, worth), note: cur.doubled ? 'دبّلتوا ونجحتوا!' : cell.special === 'treasure' ? 'كنز! النقط بالضعف' : '' });
      // wrong or no answer: a penalty (bomb: the whole value), then the other team may steal
      let loss = 0;
      if (cell.special === 'bomb') loss = worth;
      else if (option !== null) loss = Math.round(worth * this.lv.penalty);
      const delta = this.delta(team, -loss);
      this.teamScores = [this.teamScores[0] + delta[0], this.teamScores[1] + delta[1]];
      cur.struck = option;
      if (this.online(ctx, other(team)).length === 0) return this.resolve(ctx, { kind: option === null ? 'none' : 'wrong', team, delta, note: cell.special === 'bomb' ? 'قنبلة! خسرتوا النقط' : '' }, true);
      return this.beginSteal(ctx, delta);
    }

    // a steal (late, or the card played before they answered)
    cur.second = { team, option, secondsLeft };
    if (option === right) {
      const early = cur.early;
      const d = this.delta(team, worth);
      const prior = cur.outcome?.delta ?? [0, 0];
      this.moment = !this.moment || worth > this.moment.value ? { text: `سرقة الـ${arabicNum(worth)}`, sub: secondsLeft <= 3 ? 'في آخر ثواني' : early ? 'بكارت السرقة' : 'بعد غلطة الفريق التاني', value: worth } : this.moment;
      return this.resolve(ctx, { kind: 'steal', team, delta: [d[0] + prior[0], d[1] + prior[1]], note: 'سرقوها!' });
    }
    return this.resolve(ctx, { kind: option === null ? 'none' : 'wrong', team: null, delta: cur.outcome?.delta ?? [0, 0], note: 'حتى السرقة غلط! محدش خد النقط' });
  }

  private delta(team: Team, v: number): [number, number] {
    return team === 0 ? [v, 0] : [0, v];
  }

  private beginSteal(ctx: EngineCtx, firstDelta: [number, number]) {
    const cur = this.cur!;
    this.phase = 'steal';
    cur.votes = {};
    cur.gone = [];
    cur.outcome = { kind: 'wrong', team: cur.team, delta: firstDelta, note: '' }; // the first team's penalty, carried into the final result
    this.endsAt = Date.now() + STEAL_SECONDS * 1000;
    ctx.schedule(STEAL_SECONDS, () => this.endAnswer(ctx));
    ctx.emit();
  }

  // ---------- cards ----------

  private playCard(ctx: EngineCtx, playerId: string, card: unknown) {
    if (!this.settings.cards) throw new GameError('الكروت مقفولة في اللعبة دي');
    const team = this.teams[playerId];
    if (team === undefined) throw new GameError('انت مش في فريق');
    const cards = this.cards[team];
    if (card === 'double') {
      if (this.phase !== 'board' || team !== this.turnTeam) throw new GameError('الدبل قبل ما تختاروا الخانة');
      if (cards.double <= 0) throw new GameError('الكارت اتلعب خلاص');
      cards.double--;
      this.doubleArmed = true;
      return ctx.emit();
    }
    if (card === 'fifty') {
      const cur = this.cur;
      if (!cur || (this.phase !== 'question' && this.phase !== 'steal') || team !== this.answeringTeam()) throw new GameError('مش وقت الكارت ده');
      if (cards.fifty <= 0) throw new GameError('مفيش ٥٠:٥٠ متاحة');
      if (cur.gone.length) throw new GameError('الكارت اتلعب على السؤال ده');
      const cell = this.rows[cur.r].cells[cur.c];
      const right = cell.order.findIndex((o) => o === 0);
      const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== right && i !== cur.struck));
      cur.gone = wrong.slice(0, Math.min(2, wrong.length - 1)); // always leaves the right answer and one more
      cards.fifty--;
      Object.keys(cur.votes).forEach((id) => { if (cur.gone.includes(cur.votes[id])) delete cur.votes[id]; });
      return ctx.emit();
    }
    if (card === 'steal') {
      const cur = this.cur;
      if (!cur || this.phase !== 'question' || cur.early || team === cur.team) throw new GameError('السرقة على سؤال الفريق التاني بس');
      if (cards.steal <= 0) throw new GameError('كارت السرقة اتلعب خلاص');
      cards.steal--;
      cur.early = true;
      cur.first = { team: cur.team, option: null };
      ctx.clearTimer();
      this.beginQuestion(ctx); // the stealers answer right now, from a fresh timer
      return;
    }
    throw new GameError('كارت مش معروف');
  }

  // ---------- reveal and next ----------

  private resolve(ctx: EngineCtx, o: NonNullable<Current['outcome']>, penaltyApplied = false) {
    const cur = this.cur!;
    const cell = this.rows[cur.r].cells[cur.c];
    // the first team's penalty was already added when it answered wrong; only add the new part here
    const prior = cur.outcome?.delta ?? [0, 0];
    if (!penaltyApplied) {
      const add: [number, number] = [o.delta[0] - (o.kind === 'steal' || o.kind === 'wrong' ? prior[0] : 0), o.delta[1] - (o.kind === 'steal' || o.kind === 'wrong' ? prior[1] : 0)];
      this.teamScores = [this.teamScores[0] + add[0], this.teamScores[1] + add[1]];
    }
    cur.outcome = o;
    cell.used = true;
    cell.winner = o.kind === 'right' || o.kind === 'steal' ? o.team : 'x';
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_SECONDS * 1000;
    ctx.schedule(REVEAL_SECONDS, () => { try { this.advance(ctx); } catch { /* the host decides */ } });
    ctx.emit();
  }

  private advance(ctx: EngineCtx) {
    if (this.phase !== 'reveal') throw new GameError('مش وقته دلوقتي');
    if (this.rows.every((r) => r.cells.every((c) => c.used))) return this.finish(ctx);
    this.turnTeam = other(this.turnTeam);
    if (this.online(ctx, this.turnTeam).length === 0 && this.online(ctx, other(this.turnTeam)).length > 0) this.turnTeam = other(this.turnTeam);
    this.beginBoard(ctx);
  }

  private finish(ctx: EngineCtx) {
    ctx.clearTimer();
    this.phase = 'final';
    this.endsAt = null;
    ctx.emit();
  }

  private finalStats() {
    const ranked = Object.entries(this.stats).filter(([id, s]) => s.total > 0 && this.participants.includes(id)).sort((a, b) => b[1].right - a[1].right || a[1].total - b[1].total);
    const star = ranked[0] ? { id: ranked[0][0], right: ranked[0][1].right, total: ranked[0][1].total } : null;
    const bestAnswer = this.moment ?? null;
    return { star, moment: bestAnswer ? { text: bestAnswer.text, sub: bestAnswer.sub } : null };
  }

  private teamChat(ctx: EngineCtx, playerId: string, text: unknown) {
    if (this.phase === 'final') throw new GameError('مش وقته دلوقتي');
    const team = this.teams[playerId];
    if (this.chat.post(this.room, team, playerId, text)) ctx.emitTo(this.team(team));
  }
}
