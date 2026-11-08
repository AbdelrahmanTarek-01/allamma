import { arabicNum } from '../../common/ar';
import { maskBad } from '../../common/profanity';
import { GameError } from '../../rooms/rooms.types';
import type { Room } from '../../rooms/rooms.types';
import type { Level } from '../difficulty';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { TeamChat } from '../team-chat';
import { normalizeTeams } from '../wave/wave.engine';
import { normalizeWord, WORDS, type WordEntry } from './words';

export interface WordsSettings {
  /** Boards in the match: best of 1 / 3 / 5. */
  boards: 1 | 3 | 5;
  /** Team of each player, edited by the host in the lounge. */
  teams: Record<string, 0 | 1>;
}

type Team = 0 | 1;
type Kind = 't0' | 't1' | 'n' | 'b';
type Phase = 'clue' | 'guess' | 'boardEnd' | 'final';

/** The difficulty table of this game (01-brainstorm/difficulty.md, "Words" rows). `guideSecs` null = open (no clock, only a long safety cap). */
export const WORDS_LEVELS: Record<Level, { perTeam: number; neutral: number; bombs: number; bombLoses: boolean; guideSecs: number | null; extra: boolean; secretPicks: boolean; tiers: number[]; cluster: boolean }> = {
  easy: { perTeam: 6, neutral: 7, bombs: 1, bombLoses: false, guideSecs: null, extra: true, secretPicks: false, tiers: [1, 2], cluster: false },
  medium: { perTeam: 7, neutral: 5, bombs: 1, bombLoses: true, guideSecs: 90, extra: true, secretPicks: false, tiers: [1, 2, 3], cluster: false },
  hard: { perTeam: 8, neutral: 3, bombs: 1, bombLoses: true, guideSecs: 60, extra: false, secretPicks: false, tiers: [2, 3, 4], cluster: true },
  max: { perTeam: 9, neutral: 0, bombs: 2, bombLoses: true, guideSecs: 45, extra: false, secretPicks: true, tiers: [3, 4], cluster: true }
};

export const OPEN_CLUE_CAP = 240;
export const GUESS_BASE_SECONDS = 60;
export const GUESS_EXTRA_SECONDS = 15;
export const BOARD_END_SECONDS = 16;
export const MAX_NUMBER = 7;

const SETTINGS: SettingField[] = [
  {
    key: 'boards', label: 'عدد اللوحات', hint: 'أحسن من كام لوحة · اللي يكسب الأغلبية يكسب الماتش',
    options: [{ value: 1, label: '١', full: 'لوحة واحدة' }, { value: 3, label: '٣', full: 'أحسن من ٣' }, { value: 5, label: '٥', full: 'أحسن من ٥' }]
  }
];

export const wordsDef: GameDef<WordsSettings> = {
  id: 'words',
  name: 'شبكة الكلمات',
  minPlayers: 4,
  settings: SETTINGS,
  defaultSettings: () => ({ boards: 3, teams: {} }),
  levels: WORDS_LEVELS,
  create: (settings, level) => new WordsEngine(settings, level)
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
const teamKind = (t: Team): Kind => (t === 0 ? 't0' : 't1');

/** Words already used in this room's session, so a new board prefers fresh ones. */
const usedWords = new WeakMap<Room, Set<string>>();

interface Card { word: string; kind: Kind; flipped: boolean; by: string | null }
interface Board {
  cards: Card[];
  start: Team;
  turn: Team;
  guides: [string | null, string | null];
  clue: { word: string; num: number; guideId: string } | null;
  tries: number;
  flippedNow: number;
  marks: Record<string, number>;
  last: { word: string; kind: 'own' | 'neutral' | 'enemy' | 'bomb'; by: string | null; team: Team } | null;
  result: { kind: 'bomb' | 'win'; winner: Team; loser: Team | null; by: string | null; word: string | null; margin: number } | null;
}

export class WordsEngine implements GameEngine {
  readonly id = 'words';
  readonly hostActions = ['next'] as const;

  private readonly settings: WordsSettings;
  private readonly level: Level;
  private room?: Room;
  private participants: string[] = [];
  private teams: Record<string, Team> = {};
  private phase: Phase = 'clue';
  private endsAt: number | null = null;
  private boardNo = 0;
  private wins: [number, number] = [0, 0];
  private history: { n: number; how: string; winner: Team }[] = [];
  private b!: Board;
  private guideIdx: [number, number] = [0, 0];
  private everGuide = new Set<string>();
  private chat = new TeamChat();
  private stats: Record<string, { right: number; wrong: number; bomb: string | null }> = {};
  private guideHits: Record<string, number> = {};

  constructor(settings: WordsSettings, level: Level) {
    this.settings = { ...settings };
    this.level = level;
  }

  private get lv() { return WORDS_LEVELS[this.level]; }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.participants = [...participants];
    this.teams = normalizeTeams(participants, this.settings.teams);
    // each team needs a guide and at least one guesser: balance if the host left a team too small
    if (this.team(0).length < 2 || this.team(1).length < 2) shuffle(this.participants).forEach((id, i) => { this.teams[id] = (i % 2) as Team; });
    this.guideIdx = [Math.floor(Math.random() * this.team(0).length), Math.floor(Math.random() * this.team(1).length)];
    this.participants.forEach((id) => { this.stats[id] = { right: 0, wrong: 0, bomb: null }; });
    this.newBoard(ctx);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { word?: unknown; num?: unknown; i?: unknown; text?: unknown };
    switch (action) {
      case 'clue': return this.sendClue(ctx, playerId, p.word, p.num);
      case 'mark': return this.mark(ctx, playerId, p.i);
      case 'flip': return this.flip(ctx, playerId);
      case 'endTurn': return this.endTurnAction(ctx, playerId);
      case 'teamChat': return this.teamChat(ctx, playerId, p.text);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    if (this.phase === 'final') return;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.teams[playerId];
    if (this.b) delete this.b.marks[playerId];
    if (this.team(0).length < 2 || this.team(1).length < 2) return this.finish(ctx);
    if (this.b && (this.phase === 'clue' || this.phase === 'guess') && this.b.guides.includes(playerId)) {
      // the guide left: the board restarts with a fresh guide pair
      this.newBoard(ctx, true);
      return;
    }
    ctx.emit();
  }

  onPresenceChange(ctx: EngineCtx) {
    ctx.emit();
  }

  /** Lounge points (01-brainstorm/words-game.md): winning team +300 each, guides +100 more. */
  scoreOf(playerId: string) {
    if (this.phase !== 'final') return 0;
    const w = this.matchWinner();
    if (w === null || this.teams[playerId] !== w) return 0;
    return 300 + (this.everGuide.has(playerId) ? 100 : 0);
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  teamResult() {
    const ids = (t: Team) => this.participants.filter((id) => this.teams[id] === t);
    const w = this.matchWinner();
    if (w === null) return { winners: [...ids(0), ...ids(1)], losers: [], label: 'تعادل' };
    return { winners: ids(w), losers: ids(other(w)), label: `الفريق ${TEAM_NAME[w]}` };
  }

  /**
   * Secrets: only the two guides get the colour key; a card's colour reaches everyone only when it is flipped (or when the board is over).
   * Marks (a teammate's finger on a word) go to the marking team only, and on ماكس not even there (only your own mark).
   */
  viewFor(playerId: string) {
    const inGame = this.participants.includes(playerId);
    const myTeam: Team | null = inGame ? this.teams[playerId] : null;
    const b = this.b;
    const base = {
      type: 'words' as const,
      phase: this.phase,
      endsAt: this.endsAt,
      participants: this.participants,
      teams: this.teams,
      team: myTeam,
      level: this.level,
      boards: this.settings.boards,
      boardNo: this.boardNo,
      wins: this.wins,
      need: Math.floor(this.settings.boards / 2) + 1,
      history: this.history,
      chat: this.chat.of(myTeam),
      knobs: { extra: this.lv.extra, bombLoses: this.lv.bombLoses, secretPicks: this.lv.secretPicks, guideSecs: this.lv.guideSecs, perTeam: this.lv.perTeam, bombs: this.lv.bombs }
    };
    if (!b) return { ...base, turn: 0, guides: [null, null], role: 'watcher', cards: [], keys: null, clue: null, tries: 0, remaining: [0, 0], marks: {}, myMark: null, last: null, result: null, final: null };
    const over = this.phase === 'boardEnd' || this.phase === 'final';
    const isGuide = b.guides.includes(playerId);
    const onTurn = myTeam !== null && myTeam === b.turn;
    const role = !inGame ? 'watcher' : isGuide ? (b.guides[b.turn] === playerId ? 'guide' : 'guide-wait') : onTurn ? 'guesser' : 'watcher';
    const markView: Record<number, string[]> = {};
    if (this.phase === 'guess' && onTurn && !this.lv.secretPicks) {
      Object.entries(b.marks).forEach(([id, i]) => { if (this.teams[id] === myTeam) (markView[i] ??= []).push(id); });
    }
    return {
      ...base,
      turn: b.turn,
      guides: b.guides,
      role,
      cards: b.cards.map((c) => ({ word: c.word, flipped: c.flipped, kind: c.flipped || over ? c.kind : null, by: c.flipped ? c.by : null })),
      keys: isGuide || over ? b.cards.map((c) => c.kind) : null,
      clue: b.clue,
      tries: b.tries,
      remaining: [this.left(0), this.left(1)],
      marks: markView,
      myMark: this.phase === 'guess' && onTurn ? b.marks[playerId] ?? null : null,
      last: b.last,
      result: over ? b.result : null,
      final: this.phase === 'final' ? this.finalView() : null
    };
  }

  // ---------- helpers ----------

  private team(t: Team) { return this.participants.filter((id) => this.teams[id] === t); }
  private left(t: Team) { return this.b ? this.b.cards.filter((c) => c.kind === teamKind(t) && !c.flipped).length : 0; }
  private matchWinner(): Team | null { return this.wins[0] === this.wins[1] ? null : this.wins[0] > this.wins[1] ? 0 : 1; }

  /** The guide of a team for the new board: rotates through the team, skipping players who are offline. */
  private pickGuide(ctx: EngineCtx, t: Team): string | null {
    const members = this.team(t);
    if (!members.length) return null;
    const on = members.filter((id) => ctx.room.players.get(id)?.connected);
    const pool = on.length ? on : members;
    const id = pool[this.guideIdx[t] % pool.length];
    this.guideIdx[t] += 1;
    return id;
  }

  /** 20 words for a board: tiers from the level; hard and max draw words from the same few themes so they sit close together. */
  private drawWords(ctx: EngineCtx): WordEntry[] {
    const used = usedWords.get(ctx.room) ?? new Set<string>();
    usedWords.set(ctx.room, used);
    const fresh = (e: WordEntry) => !used.has(e.w);
    let pool = WORDS.filter((e) => this.lv.tiers.includes(e.d) && fresh(e));
    if (pool.length < 40) { used.clear(); pool = WORDS.filter((e) => this.lv.tiers.includes(e.d)); }
    if (this.lv.cluster) {
      // the same few themes, so the words sit close together and clues become risky
      const picked = shuffle([...new Set(pool.map((e) => e.cat))]).slice(0, 3);
      const close = pool.filter((e) => picked.includes(e.cat));
      if (close.length >= 20) pool = close;
    }
    const out = shuffle(pool).slice(0, 20);
    out.forEach((e) => used.add(e.w));
    return out;
  }

  // ---------- boards ----------

  private newBoard(ctx: EngineCtx, restart = false) {
    if (!restart) this.boardNo += 1;
    const lv = this.lv;
    const kinds: Kind[] = [
      ...Array<Kind>(lv.perTeam).fill('t0'), ...Array<Kind>(lv.perTeam).fill('t1'),
      ...Array<Kind>(lv.neutral).fill('n'), ...Array<Kind>(lv.bombs).fill('b')
    ];
    const words = this.drawWords(ctx);
    const order = shuffle(kinds);
    const start: Team = ((this.boardNo - 1) % 2) as Team;
    const guides: [string | null, string | null] = [this.pickGuide(ctx, 0), this.pickGuide(ctx, 1)];
    guides.forEach((g) => { if (g) this.everGuide.add(g); });
    this.b = {
      cards: words.map((w, i) => ({ word: w.w, kind: order[i], flipped: false, by: null })),
      start, turn: start, guides, clue: null, tries: 0, flippedNow: 0, marks: {}, last: null, result: null
    };
    ctx.system(`لوحة ${arabicNum(this.boardNo)}، دور الفريق ${TEAM_NAME[start]} الأول`);
    this.beginClue(ctx);
  }

  private beginClue(ctx: EngineCtx) {
    const b = this.b;
    b.clue = null;
    b.marks = {};
    b.tries = 0;
    b.flippedNow = 0;
    this.phase = 'clue';
    const secs = this.lv.guideSecs;
    this.endsAt = secs ? Date.now() + secs * 1000 : null;
    ctx.schedule(secs ?? OPEN_CLUE_CAP, () => this.passTurn(ctx)); // the guide never gave a clue: the turn passes
    ctx.emit();
  }

  /** Time ran out or the team stopped: the other team's turn. */
  private passTurn(ctx: EngineCtx) {
    if (this.phase !== 'clue' && this.phase !== 'guess') return;
    this.b.turn = other(this.b.turn);
    this.beginClue(ctx);
    this.b.last = null;
  }

  // ---------- guide: the clue ----------

  private sendClue(ctx: EngineCtx, playerId: string, word: unknown, num: unknown) {
    const b = this.b;
    if (this.phase !== 'clue') throw new GameError('مش وقته دلوقتي');
    if (b.guides[b.turn] !== playerId) throw new GameError('انت مش الدليل دلوقتي');
    let w = String(word ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!w) throw new GameError('اكتب كلمة واحدة');
    if (w.includes(' ')) throw new GameError('كلمة واحدة بس');
    if (this.room?.privacy === 'public') w = maskBad(w);
    const n = Math.floor(Number(num));
    const own = this.left(b.turn);
    if (!Number.isFinite(n) || n < 1 || n > Math.min(MAX_NUMBER, own)) throw new GameError(`الرقم من ١ لـ ${arabicNum(Math.min(MAX_NUMBER, own))}`);
    // the clue may not be a word on the board (also simple prefix / suffix matches with a word that is still hidden)
    const c = normalizeWord(w);
    const clash = b.cards.some((card) => {
      if (card.flipped) return false;
      const x = normalizeWord(card.word);
      return c === x || (x.length >= 3 && (c.startsWith(x) || c.endsWith(x))) || (c.length >= 3 && (x.startsWith(c) || x.endsWith(c)));
    });
    if (clash) throw new GameError('التلميح ده قريب من كلمة على اللوحة، جرّب غيره');
    b.clue = { word: w, num: n, guideId: playerId };
    b.tries = n + (this.lv.extra ? 1 : 0);
    b.flippedNow = 0;
    b.last = null;
    this.phase = 'guess';
    const secs = GUESS_BASE_SECONDS + GUESS_EXTRA_SECONDS * (b.tries - 1);
    this.endsAt = Date.now() + secs * 1000;
    ctx.schedule(secs, () => this.passTurn(ctx));
    ctx.emit();
  }

  // ---------- the team: marks, flips ----------

  private mustGuesser(playerId: string) {
    const b = this.b;
    if (this.phase !== 'guess') throw new GameError('مش وقته دلوقتي');
    if (this.teams[playerId] !== b.turn) throw new GameError('مش دور فريقك');
    if (b.guides.includes(playerId)) throw new GameError('الدليل مبيخمّنش');
    return b;
  }

  private mark(ctx: EngineCtx, playerId: string, i: unknown) {
    const b = this.mustGuesser(playerId);
    const idx = Number(i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= b.cards.length) throw new GameError('كلمة مش موجودة');
    if (b.cards[idx].flipped) throw new GameError('الكلمة دي اتقلبت');
    if (b.marks[playerId] === idx) delete b.marks[playerId];
    else b.marks[playerId] = idx;
    // marks go to the marking team only (the other team must not see them); on ماكس each player sees only their own, which they already have locally
    if (this.lv.secretPicks) return ctx.emitTo([playerId]);
    ctx.emitTo(this.team(b.turn));
  }

  /** The most-marked word; null on a tie or when nothing is marked. */
  private leading(): number | null {
    const n = new Map<number, number>();
    Object.values(this.b.marks).forEach((i) => n.set(i, (n.get(i) ?? 0) + 1));
    const max = Math.max(0, ...n.values());
    if (max === 0) return null;
    const top = [...n.entries()].filter(([, v]) => v === max).map(([k]) => k);
    return top.length === 1 ? top[0] : null;
  }

  private flip(ctx: EngineCtx, playerId: string) {
    const b = this.mustGuesser(playerId);
    if (Object.keys(b.marks).length === 0) throw new GameError('اختاروا كلمة الأول');
    const idx = this.leading();
    if (idx === null) throw new GameError('الفريق متقسم، اتفقوا على كلمة واحدة');
    const card = b.cards[idx];
    card.flipped = true;
    card.by = playerId;
    b.marks = {};
    b.flippedNow += 1;
    const st = (this.stats[playerId] ??= { right: 0, wrong: 0, bomb: null });
    const team = b.turn;

    if (card.kind === 'b') {
      st.bomb = card.word;
      b.last = { word: card.word, kind: 'bomb', by: playerId, team };
      if (this.lv.bombLoses) return this.endBoard(ctx, { kind: 'bomb', winner: other(team), loser: team, by: playerId, word: card.word, margin: this.left(other(team)) });
      return this.passTurnAfterFlip(ctx);
    }
    if (card.kind === teamKind(team)) {
      st.right += 1;
      if (b.clue) this.guideHits[b.clue.guideId] = (this.guideHits[b.clue.guideId] ?? 0) + 1;
      b.last = { word: card.word, kind: 'own', by: playerId, team };
      b.tries -= 1;
      if (this.left(team) === 0) return this.endBoard(ctx, { kind: 'win', winner: team, loser: null, by: playerId, word: card.word, margin: this.left(other(team)) });
      if (b.tries <= 0) return this.passTurnAfterFlip(ctx);
      return ctx.emit(); // right: keep going
    }
    st.wrong += 1;
    if (card.kind === 'n') {
      b.last = { word: card.word, kind: 'neutral', by: playerId, team };
      return this.passTurnAfterFlip(ctx);
    }
    // the other team's word: it counts for them, and might even finish their board
    b.last = { word: card.word, kind: 'enemy', by: playerId, team };
    if (this.left(other(team)) === 0) return this.endBoard(ctx, { kind: 'win', winner: other(team), loser: team, by: playerId, word: card.word, margin: this.left(team) });
    return this.passTurnAfterFlip(ctx);
  }

  /** The turn ended by a flip (not a timeout): keep `last` so everyone sees what happened. */
  private passTurnAfterFlip(ctx: EngineCtx) {
    const last = this.b.last;
    this.b.turn = other(this.b.turn);
    this.beginClue(ctx);
    this.b.last = last;
    ctx.emit();
  }

  private endTurnAction(ctx: EngineCtx, playerId: string) {
    const b = this.mustGuesser(playerId);
    if (b.flippedNow < 1) throw new GameError('اقلبوا كلمة واحدة الأول');
    this.passTurn(ctx);
  }

  // ---------- board end, match end ----------

  private endBoard(ctx: EngineCtx, result: NonNullable<Board['result']>) {
    const b = this.b;
    b.result = result;
    this.wins[result.winner] += 1;
    this.history.push({ n: this.boardNo, how: result.kind === 'bomb' ? `${TEAM_NAME[result.loser!]} قلب القنبلة` : result.margin > 0 ? `كشفوا كلماتهم وفاضل للتاني ${arabicNum(result.margin)}` : 'كشفوا كلماتهم', winner: result.winner });
    this.phase = 'boardEnd';
    this.endsAt = Date.now() + BOARD_END_SECONDS * 1000;
    ctx.schedule(BOARD_END_SECONDS, () => { try { this.advance(ctx); } catch { /* the host decides */ } });
    ctx.emit();
  }

  private advance(ctx: EngineCtx) {
    if (this.phase !== 'boardEnd') throw new GameError('مش وقته دلوقتي');
    const need = Math.floor(this.settings.boards / 2) + 1;
    if (this.wins[0] >= need || this.wins[1] >= need || this.boardNo >= this.settings.boards) return this.finish(ctx);
    this.newBoard(ctx);
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
    const guide = top(Object.entries(this.guideHits).filter(([id]) => ids.includes(id)), (v) => v);
    const hunter = top(Object.entries(this.stats).filter(([id]) => ids.includes(id)), (v) => v.right);
    const victim = Object.entries(this.stats).find(([id, s]) => ids.includes(id) && s.bomb);
    const bold = top(Object.entries(this.stats).filter(([id]) => ids.includes(id)), (v) => v.wrong);
    return {
      winner: this.matchWinner(),
      awards: [
        { k: 'أحسن دليل', id: guide?.[0] ?? null, why: guide ? `${arabicNum(guide[1])} كلمة اتقلبت صح من تلميحاته` : 'محدش جاب كلمة صح' },
        { k: 'صياد الكلمات', id: hunter?.[0] ?? null, why: hunter ? `قلب ${arabicNum(hunter[1].right)} صح` : 'محدش قلب صح' },
        { k: 'ضحية القنبلة', id: victim?.[0] ?? null, why: victim ? `قلب «${victim[1].bomb}»` : 'محدش اتفجر' },
        { k: 'ثقة زيادة', id: bold?.[0] ?? null, why: bold ? `قلب ${arabicNum(bold[1].wrong)} غلط` : 'مفيش غلطات' }
      ]
    };
  }

  private teamChat(ctx: EngineCtx, playerId: string, text: unknown) {
    if (this.phase === 'final') throw new GameError('مش وقته دلوقتي');
    if (this.b?.guides.includes(playerId) && this.phase !== 'boardEnd') throw new GameError('الدليل مبيكتبش لفريقه');
    const team = this.teams[playerId];
    if (this.chat.post(this.room, team, playerId, text)) ctx.emitTo(this.team(team));
  }
}
