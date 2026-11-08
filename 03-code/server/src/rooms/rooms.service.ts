import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PLACE_FAMILIES } from '../spy/places';
import { AVATARS, GameError, Player, Room, SpyGame, SpyOutcome } from './rooms.types';

export const VOTE_SECONDS = 45;
export const REVEAL_SECONDS = 6;
export const GUESS_SECONDS = 20;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

@Injectable()
export class RoomsService implements OnModuleDestroy {
  private rooms = new Map<string, Room>();
  private playerRoom = new Map<string, string>();
  private onChange: (room: Room) => void = () => {};
  private sweeper = setInterval(() => this.sweep(), 60 * 1000);

  onModuleDestroy() {
    clearInterval(this.sweeper);
    this.rooms.forEach((r) => r.timer && clearTimeout(r.timer));
  }

  setListener(fn: (room: Room) => void) {
    this.onChange = fn;
  }

  getRoom(code: string) {
    return this.rooms.get(code);
  }

  roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  // ---------- identity & connection ----------

  cleanProfile(name: unknown, avatar: unknown) {
    const n = String(name ?? '').trim().slice(0, 14);
    if (!n) throw new GameError('اكتب اسمك الأول');
    const a = AVATARS.includes(avatar as any) ? String(avatar) : 'c1';
    return { name: n, avatar: a };
  }

  attachSocket(playerId: string, socketId: string, name: string, avatar: string) {
    const room = this.roomOf(playerId);
    if (!room) return undefined;
    const p = room.players.get(playerId)!;
    p.socketIds.add(socketId);
    p.connected = true;
    p.name = name;
    p.avatar = avatar;
    room.emptySince = null;
    this.emit(room);
    return room;
  }

  detachSocket(playerId: string, socketId: string) {
    const room = this.roomOf(playerId);
    if (!room) return;
    const p = room.players.get(playerId);
    if (!p) return;
    p.socketIds.delete(socketId);
    if (p.socketIds.size > 0) return;
    p.connected = false;
    if (room.hostId === playerId) this.passHost(room);
    if (![...room.players.values()].some((x) => x.connected)) room.emptySince = Date.now();
    this.checkAllVoted(room);
    this.emit(room);
  }

  // ---------- rooms ----------

  createRoom(playerId: string, name: string, avatar: string, socketId: string) {
    this.leave(playerId);
    let code = '';
    do code = Array.from({ length: 5 }, () => pick([...CODE_CHARS])).join('');
    while (this.rooms.has(code));
    const room: Room = {
      code,
      hostId: playerId,
      players: new Map(),
      chat: [],
      settings: { discussSeconds: 480, rounds: 3 },
      game: null,
      timer: null,
      emptySince: null
    };
    this.rooms.set(code, room);
    this.addPlayer(room, playerId, name, avatar, socketId);
    return room;
  }

  joinRoom(code: string, playerId: string, name: string, avatar: string, socketId: string) {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room) throw new GameError('مفيش أوضة بالكود ده');
    if (room.players.has(playerId)) {
      this.attachSocket(playerId, socketId, name, avatar);
      return room;
    }
    if (room.players.size >= MAX_PLAYERS) throw new GameError('الأوضة مليانة');
    this.leave(playerId);
    this.addPlayer(room, playerId, name, avatar, socketId);
    return room;
  }

  private addPlayer(room: Room, id: string, name: string, avatar: string, socketId: string) {
    const p: Player = {
      id, name, avatar, ready: false, connected: true, score: 0, joinedAt: Date.now(),
      socketIds: new Set([socketId])
    };
    room.players.set(id, p);
    room.emptySince = null;
    this.playerRoom.set(id, room.code);
    this.emit(room);
  }

  leave(playerId: string) {
    const room = this.roomOf(playerId);
    if (!room) return;
    room.players.delete(playerId);
    this.playerRoom.delete(playerId);
    if (room.players.size === 0) {
      this.destroy(room);
      return;
    }
    if (room.hostId === playerId) this.passHost(room);
    const g = room.game;
    if (g && g.participants.includes(playerId)) {
      g.participants = g.participants.filter((id) => id !== playerId);
      delete g.votes[playerId];
      if (g.spyId === playerId && ['discuss', 'vote', 'reveal', 'guess'].includes(g.phase)) {
        this.finishRound(room, 'detectives');
        return;
      }
      if (g.askerId === playerId || g.targetId === playerId) this.rotateTurn(g, true);
      this.checkAllVoted(room);
    }
    this.emit(room);
  }

  setReady(playerId: string, ready: boolean) {
    const room = this.mustRoom(playerId);
    room.players.get(playerId)!.ready = !!ready;
    this.emit(room);
  }

  chat(playerId: string, text: unknown) {
    const room = this.mustRoom(playerId);
    const t = String(text ?? '').trim().slice(0, 200);
    if (!t) return;
    room.chat.push({ id: randomUUID(), from: playerId, text: t, at: Date.now() });
    if (room.chat.length > 40) room.chat.splice(0, room.chat.length - 40);
    this.emit(room);
  }

  updateSettings(playerId: string, s: { discussSeconds?: unknown; rounds?: unknown }) {
    const room = this.mustHost(playerId);
    if (room.game) throw new GameError('مينفعش تغيّر الإعدادات واللعبة شغالة');
    const secs = Number(s.discussSeconds);
    const rounds = Number(s.rounds);
    if ([300, 480, 600].includes(secs)) room.settings.discussSeconds = secs;
    if ([1, 3, 5].includes(rounds)) room.settings.rounds = rounds;
    this.emit(room);
  }

  // ---------- spy game ----------

  startGame(playerId: string) {
    const room = this.mustHost(playerId);
    if (room.game && room.game.phase !== 'final') throw new GameError('اللعبة شغالة فعلاً');
    const online = [...room.players.values()].filter((p) => p.connected);
    if (online.length < MIN_PLAYERS) throw new GameError(`محتاجين ${MIN_PLAYERS} لاعيبة على الأقل`);
    room.players.forEach((p) => (p.score = 0));
    this.startRound(room, 1, online.map((p) => p.id));
  }

  private startRound(room: Room, round: number, participants: string[]) {
    const family = pick(PLACE_FAMILIES);
    const place = pick(family.places);
    const familyNames = family.places.map((p) => p.name);
    const others = shuffle(PLACE_FAMILIES.filter((f) => f !== family).flatMap((f) => f.places.map((p) => p.name)));
    const board = shuffle([...familyNames, ...others.slice(0, Math.max(0, 12 - familyNames.length))]);
    const guessOptions = shuffle([place.name, ...shuffle(familyNames.filter((n) => n !== place.name)).slice(0, 5)]);
    const spyId = pick(participants);
    const roles: Record<string, string> = {};
    let pool: string[] = [];
    participants.forEach((id) => {
      if (id === spyId) return;
      if (pool.length === 0) pool = shuffle(place.roles);
      roles[id] = pool.pop()!;
    });
    const askerId = pick(participants);
    const game: SpyGame = {
      type: 'spy',
      round,
      totalRounds: room.settings.rounds,
      phase: 'discuss',
      endsAt: Date.now() + room.settings.discussSeconds * 1000,
      place, board, guessOptions, spyId, roles, participants,
      askerId,
      targetId: pick(participants.filter((id) => id !== askerId)),
      votes: {},
      accusedId: null,
      caught: false,
      spyGuess: null,
      outcome: null,
      roundPoints: {}
    };
    room.game = game;
    this.schedule(room, room.settings.discussSeconds, () => this.startVote(room));
    this.emit(room);
  }

  nextTurn(playerId: string) {
    const room = this.mustRoom(playerId);
    const g = this.mustPhase(room, 'discuss');
    if (g.askerId !== playerId) throw new GameError('مش دورك تسأل');
    this.rotateTurn(g, false);
    this.emit(room);
  }

  private rotateTurn(g: SpyGame, reset: boolean) {
    const ids = g.participants;
    if (ids.length < 2) return;
    const prevAsker = g.askerId;
    g.askerId = reset || !ids.includes(g.targetId) ? pick(ids) : g.targetId;
    const choices = ids.filter((id) => id !== g.askerId && id !== prevAsker);
    g.targetId = pick(choices.length ? choices : ids.filter((id) => id !== g.askerId));
  }

  callVote(playerId: string) {
    const room = this.mustRoom(playerId);
    const g = this.mustPhase(room, 'discuss');
    if (!g.participants.includes(playerId)) throw new GameError('انت مش في الجولة دي');
    this.startVote(room);
  }

  private startVote(room: Room) {
    const g = room.game;
    if (!g || g.phase !== 'discuss') return;
    g.phase = 'vote';
    g.votes = {};
    g.endsAt = Date.now() + VOTE_SECONDS * 1000;
    this.schedule(room, VOTE_SECONDS, () => this.tally(room));
    this.emit(room);
  }

  vote(playerId: string, targetId: unknown) {
    const room = this.mustRoom(playerId);
    const g = this.mustPhase(room, 'vote');
    const t = String(targetId ?? '');
    if (!g.participants.includes(playerId)) throw new GameError('انت مش في الجولة دي');
    if (t === playerId) throw new GameError('مينفعش تصوّت على نفسك');
    if (!g.participants.includes(t)) throw new GameError('اللاعب ده مش موجود');
    g.votes[playerId] = t;
    this.emit(room);
    this.checkAllVoted(room);
  }

  private checkAllVoted(room: Room) {
    const g = room.game;
    if (!g || g.phase !== 'vote') return;
    const voters = g.participants.filter((id) => room.players.get(id)?.connected);
    if (voters.length > 0 && voters.every((id) => g.votes[id])) this.tally(room);
  }

  private tally(room: Room) {
    const g = room.game;
    if (!g || g.phase !== 'vote') return;
    const counts: Record<string, number> = {};
    Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    g.accusedId = max > 0 && top.length === 1 ? top[0] : null;
    g.caught = g.accusedId === g.spyId;
    g.phase = 'reveal';
    g.endsAt = Date.now() + REVEAL_SECONDS * 1000;
    this.schedule(room, REVEAL_SECONDS, () => {
      if (!room.game || room.game.phase !== 'reveal') return;
      if (g.caught) {
        g.phase = 'guess';
        g.endsAt = Date.now() + GUESS_SECONDS * 1000;
        this.schedule(room, GUESS_SECONDS, () => this.resolveGuess(room, null));
        this.emit(room);
      } else {
        this.finishRound(room, 'spy-escaped');
      }
    });
    this.emit(room);
  }

  guess(playerId: string, placeName: unknown) {
    const room = this.mustRoom(playerId);
    const g = this.mustPhase(room, 'guess');
    if (g.spyId !== playerId) throw new GameError('الجاسوس بس اللي بيخمّن');
    const name = String(placeName ?? '');
    if (!g.guessOptions.includes(name)) throw new GameError('اختار من الاختيارات');
    this.resolveGuess(room, name);
  }

  private resolveGuess(room: Room, name: string | null) {
    const g = room.game;
    if (!g || g.phase !== 'guess') return;
    g.spyGuess = name;
    this.finishRound(room, name === g.place.name ? 'spy-guessed' : 'detectives');
  }

  private finishRound(room: Room, outcome: SpyOutcome) {
    const g = room.game;
    if (!g) return;
    this.clearTimer(room);
    g.outcome = outcome;
    g.phase = 'result';
    g.endsAt = null;
    const pts: Record<string, number> = {};
    g.participants.forEach((id) => {
      const votedSpy = g.votes[id] === g.spyId;
      if (id === g.spyId) pts[id] = outcome === 'spy-escaped' ? 400 : outcome === 'spy-guessed' ? 300 : 0;
      else if (outcome === 'detectives') pts[id] = votedSpy ? 200 : 100;
      else pts[id] = votedSpy ? 100 : 0;
    });
    g.roundPoints = pts;
    Object.entries(pts).forEach(([id, n]) => {
      const p = room.players.get(id);
      if (p) p.score += n;
    });
    this.emit(room);
  }

  nextRound(playerId: string) {
    const room = this.mustHost(playerId);
    const g = this.mustPhase(room, 'result');
    if (g.round >= g.totalRounds) {
      g.phase = 'final';
      this.emit(room);
      return;
    }
    const online = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (online.length < MIN_PLAYERS) throw new GameError(`محتاجين ${MIN_PLAYERS} لاعيبة على الأقل`);
    this.startRound(room, g.round + 1, online);
  }

  backToRoom(playerId: string) {
    const room = this.mustHost(playerId);
    this.clearTimer(room);
    room.game = null;
    room.players.forEach((p) => (p.ready = false));
    this.emit(room);
  }

  // ---------- view ----------

  viewFor(room: Room, playerId: string) {
    const g = room.game;
    const players = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(({ id, name, avatar, ready, connected, score }) => ({ id, name, avatar, ready, connected, score }));
    let game: any = null;
    if (g) {
      const inRound = g.participants.includes(playerId);
      const isSpy = g.spyId === playerId;
      const ended = g.phase === 'result' || g.phase === 'final';
      const counts: Record<string, number> = {};
      Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
      game = {
        type: g.type,
        round: g.round,
        totalRounds: g.totalRounds,
        phase: g.phase,
        endsAt: g.endsAt,
        board: g.board,
        participants: g.participants,
        askerId: g.askerId,
        targetId: g.targetId,
        you: inRound ? { isSpy, place: isSpy && !ended ? null : g.place.name, role: isSpy ? null : g.roles[playerId] } : null,
        votedIds: Object.keys(g.votes),
        voteCounts: counts,
        myVote: g.votes[playerId] ?? null,
        accusedId: ['reveal', 'guess', 'result', 'final'].includes(g.phase) ? g.accusedId : null,
        caught: ['reveal', 'guess', 'result', 'final'].includes(g.phase) ? g.caught : null,
        spyId: ended || (g.phase !== 'discuss' && g.phase !== 'vote' && g.caught) ? g.spyId : null,
        guessOptions: g.phase === 'guess' && isSpy ? g.guessOptions : null,
        place: ended || (!isSpy && inRound) ? g.place.name : null,
        spyGuess: ended ? g.spyGuess : null,
        outcome: g.outcome,
        roundPoints: ended ? g.roundPoints : {}
      };
    }
    return {
      code: room.code,
      hostId: room.hostId,
      youId: playerId,
      players,
      chat: room.chat.slice(-30),
      settings: room.settings,
      game,
      serverNow: Date.now()
    };
  }

  // ---------- helpers ----------

  private mustRoom(playerId: string) {
    const room = this.roomOf(playerId);
    if (!room) throw new GameError('انت مش في أوضة');
    return room;
  }

  private mustHost(playerId: string) {
    const room = this.mustRoom(playerId);
    if (room.hostId !== playerId) throw new GameError('المضيف بس اللي يقدر يعمل كده');
    return room;
  }

  private mustPhase(room: Room, phase: SpyGame['phase']) {
    const g = room.game;
    if (!g || g.phase !== phase) throw new GameError('مش وقته دلوقتي');
    return g;
  }

  private passHost(room: Room) {
    const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).find((p) => p.connected);
    if (next) room.hostId = next.id;
  }

  private schedule(room: Room, seconds: number, fn: () => void) {
    this.clearTimer(room);
    room.timer = setTimeout(() => {
      room.timer = null;
      fn();
    }, seconds * 1000);
  }

  private clearTimer(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  private destroy(room: Room) {
    this.clearTimer(room);
    room.players.forEach((p) => this.playerRoom.delete(p.id));
    this.rooms.delete(room.code);
  }

  private sweep() {
    const now = Date.now();
    this.rooms.forEach((room) => {
      if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) this.destroy(room);
    });
  }

  private emit(room: Room) {
    if (this.rooms.has(room.code)) this.onChange(room);
  }

  stats() {
    return { rooms: this.rooms.size, players: this.playerRoom.size };
  }
}
