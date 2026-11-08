import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { EngineCtx } from '../games/game-engine';
import { DEFAULT_LEVEL, isLevel } from '../games/difficulty';
import { DEFAULT_GAME, GAME_DEFS } from '../games/registry';
import { applySettings } from '../games/settings';
import { normalizeTeams } from '../games/wave/wave.engine';
import { maskBad } from '../common/profanity';
import { AVATARS, Board, ChatMsg, GameError, LobbyRoom, Player, Privacy, Room } from './rooms.types';

const MAX_PLAYERS = 10;
const CHAT_GAP_MS = 1000;
const MAX_CHAT = 50; // chat lives in memory only, last 50 messages per room, gone with the room
const LOBBY_THROTTLE_MS = 1000;
const MAX_ROOM_NAME = 24;
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
/** Room leaderboard points by placement: 1st 10, 2nd 7, 3rd 5, everyone else 2. Team games: winners 8, losers 2. */
const PLACE_POINTS = [10, 7, 5];
const TEAM_WIN = 8;
const OTHER_POINTS = 2;
const MAX_BOARD_GAMES = 30;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffled = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

/**
 * Room concerns only: players, host, chat, settings, lounge scores and lifecycle.
 * Everything game-specific is delegated to the room's active GameEngine.
 */
@Injectable()
export class RoomsService implements OnModuleDestroy {
  private rooms = new Map<string, Room>();
  private playerRoom = new Map<string, string>();
  private onChange: (room: Room, only?: string[]) => void = () => {};
  private onPush: (room: Room, ids: string[], event: string, data: unknown) => void = () => {};
  private onChat: (room: Room, msg: ChatMsg) => void = () => {};
  private sweeper = setInterval(() => this.sweep(), 60 * 1000);
  private lastChatAt = new Map<string, number>();
  private lobbyListener: (list: LobbyRoom[]) => void = () => {};
  private lobbySig = '';
  private lobbyLastAt = 0;
  private lobbyTimer: NodeJS.Timeout | null = null;

  onModuleDestroy() {
    clearInterval(this.sweeper);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.rooms.forEach((r) => r.timer && clearTimeout(r.timer));
  }

  setListener(fn: (room: Room, only?: string[]) => void) {
    this.onChange = fn;
  }

  /** Custom engine events (live strokes): the gateway sends them to the listed players only. */
  setPushListener(fn: (room: Room, ids: string[], event: string, data: unknown) => void) {
    this.onPush = fn;
  }

  setLobbyListener(fn: (list: LobbyRoom[]) => void) {
    this.lobbyListener = fn;
  }

  /** Called for every new chat message (player or system). The gateway pushes it as `chat:new`. */
  setChatListener(fn: (room: Room, msg: ChatMsg) => void) {
    this.onChat = fn;
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
    const n = maskBad(String(name ?? '').trim()).slice(0, 14);
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
    room.engine?.onPresenceChange(this.ctx(room));
    this.emit(room);
  }

  // ---------- rooms ----------

  createRoom(playerId: string, name: string, avatar: string, socketId: string) {
    this.leave(playerId);
    let code = '';
    do code = Array.from({ length: 5 }, () => pick([...CODE_CHARS])).join('');
    while (this.rooms.has(code));
    const def = GAME_DEFS[DEFAULT_GAME];
    const room: Room = {
      code,
      name: this.cleanRoomName(`قعدة ${name}`),
      hostId: playerId,
      privacy: 'private',
      locked: false,
      banned: new Set(),
      players: new Map(),
      chat: [],
      selectedGame: def.id,
      difficulty: DEFAULT_LEVEL,
      settings: { [def.id]: def.defaultSettings() },
      engine: null,
      board: { totals: {}, byGame: {}, gain: {}, prevRank: {}, members: {}, played: [] },
      settled: false,
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
    if (room.banned.has(playerId)) throw new GameError('المضيف طلّعك من القعدة دي');
    if (room.locked) throw new GameError('القعدة مقفولة');
    if (room.players.size >= MAX_PLAYERS) throw new GameError('الأوضة مليانة');
    this.leave(playerId);
    this.addPlayer(room, playerId, name, avatar, socketId);
    return room;
  }

  private addPlayer(room: Room, id: string, name: string, avatar: string, socketId: string) {
    const p: Player = {
      id, name, avatar, ready: false, connected: true, lounge: 0, joinedAt: Date.now(),
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
    room.engine?.onLeave(this.ctx(room), playerId);
    this.emit(room);
  }

  /** Host removes another player. Returns the kicked player's socket ids so the gateway can notify them. */
  kick(hostId: string, targetId: unknown): string[] {
    const room = this.mustHost(hostId);
    const t = this.mustOtherMember(room, hostId, targetId);
    const socketIds = [...t.socketIds];
    room.banned.add(t.id);
    this.leave(t.id);
    return socketIds;
  }

  makeHost(hostId: string, targetId: unknown) {
    const room = this.mustHost(hostId);
    const t = this.mustOtherMember(room, hostId, targetId);
    if (!t.connected) throw new GameError('اللاعب ده النت فاصل عنده');
    room.hostId = t.id;
    this.emit(room);
  }

  setReady(playerId: string, ready: boolean) {
    const room = this.mustRoom(playerId);
    room.players.get(playerId)!.ready = !!ready;
    this.emit(room);
  }

  chat(playerId: string, text: unknown) {
    const room = this.mustRoom(playerId);
    let t = String(text ?? '').trim().slice(0, 200);
    if (!t) return;
    const now = Date.now();
    if (now - (this.lastChatAt.get(playerId) ?? 0) < CHAT_GAP_MS) throw new GameError('استنى ثانية');
    this.lastChatAt.set(playerId, now);
    if (room.privacy === 'public') t = maskBad(t);
    this.pushChat(room, { id: randomUUID(), from: playerId, text: t, at: now });
  }

  /** A system divider in the chat ("بدأت الجولة ٢"). Chat is never cleared between rounds or games. */
  private systemMessage(room: Room, text: string) {
    this.pushChat(room, { id: randomUUID(), from: '', text, at: Date.now(), system: true });
  }

  /** Keep the last MAX_CHAT messages and push just this one (no full room snapshot). */
  private pushChat(room: Room, msg: ChatMsg) {
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
    this.onChat(room, msg);
  }

  renameRoom(playerId: string, name: unknown) {
    const room = this.mustHost(playerId);
    const n = this.cleanRoomName(name);
    if (!n) throw new GameError('اكتب اسم للقعدة');
    room.name = n;
    this.emit(room);
  }

  setPrivacy(playerId: string, privacy: unknown) {
    const room = this.mustHost(playerId);
    if (privacy !== 'private' && privacy !== 'public') throw new GameError('اختيار مش صح');
    room.privacy = privacy as Privacy;
    this.emit(room);
  }

  setLocked(playerId: string, locked: unknown) {
    const room = this.mustHost(playerId);
    room.locked = !!locked;
    this.emit(room);
  }

  // ---------- public lobby ----------

  /** Public, unlocked, not full rooms that someone is still in. */
  lobbyList(): LobbyRoom[] {
    return [...this.rooms.values()]
      .filter((r) => r.privacy === 'public' && !r.locked && r.players.size < MAX_PLAYERS && [...r.players.values()].some((p) => p.connected))
      .map((r) => {
        const host = r.players.get(r.hostId) ?? [...r.players.values()][0];
        return {
          code: r.code,
          name: this.shownName(r),
          host: { name: host.name, avatar: host.avatar },
          game: r.selectedGame,
          players: r.players.size,
          max: MAX_PLAYERS,
          status: (r.engine && !r.engine.isOver() ? 'playing' : 'waiting') as LobbyRoom['status']
        };
      })
      .sort((a, b) => Number(a.status === 'playing') - Number(b.status === 'playing') || b.players - a.players || a.code.localeCompare(b.code));
  }

  /** Join the fullest public room that is waiting and has a free seat, otherwise open a new public room. */
  quickPlay(playerId: string, name: string, avatar: string, socketId: string) {
    const mine = this.roomOf(playerId);
    const best = this.lobbyList().find((l) => l.status === 'waiting' && l.code !== mine?.code && !this.rooms.get(l.code)!.banned.has(playerId));
    if (best) return { room: this.joinRoom(best.code, playerId, name, avatar, socketId), created: false };
    const room = this.createRoom(playerId, name, avatar, socketId);
    room.privacy = 'public';
    this.emit(room);
    return { room, created: true };
  }

  /** Tell lobby watchers the list changed, at most once per second and only if it really changed. */
  private touchLobby() {
    if (this.lobbyTimer) return;
    const wait = Math.max(0, this.lobbyLastAt + LOBBY_THROTTLE_MS - Date.now());
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      const list = this.lobbyList();
      const sig = JSON.stringify(list);
      if (sig === this.lobbySig) return;
      this.lobbySig = sig;
      this.lobbyLastAt = Date.now();
      this.lobbyListener(list);
    }, wait);
  }

  selectGame(playerId: string, game: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر اللعبة واللعبة شغالة');
    const def = GAME_DEFS[String(game ?? '')];
    if (!def) throw new GameError('اللعبة دي جاية قريب');
    room.selectedGame = def.id;
    room.settings[def.id] ??= def.defaultSettings();
    this.emit(room);
  }

  /** Shared difficulty: same guard as the other host settings (host only, not while a game runs). */
  setDifficulty(playerId: string, level: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر الصعوبة واللعبة شغالة');
    if (!isLevel(level)) throw new GameError('اختيار مش صح');
    room.difficulty = level;
    this.emit(room);
  }

  /** Games played in two teams: حزّورة and شبكة الكلمات always, الموجة in its teams mode. */
  private usesTeams(room: Room) {
    const g = room.selectedGame;
    return g === 'quiz' || g === 'words' || (g === 'wave' && room.settings.wave?.mode === 'teams');
  }

  /** Team games: the host shuffles the teams or moves one player to the other team (stored with the game's settings). */
  teamsAction(playerId: string, op: unknown, targetId: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر الفرق واللعبة شغالة');
    if (!this.usesTeams(room)) throw new GameError('مش وقته دلوقتي');
    const s = (room.settings[room.selectedGame] ??= GAME_DEFS[room.selectedGame].defaultSettings());
    const members = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
    const cur = normalizeTeams(members, s.teams ?? {});
    if (op === 'shuffle') {
      s.teams = Object.fromEntries(shuffled(members).map((id, i) => [id, i % 2]));
    } else if (op === 'move') {
      const id = String(targetId ?? '');
      if (!room.players.has(id)) throw new GameError('اللاعب ده مش في الأوضة');
      s.teams = { ...cur, [id]: cur[id] === 0 ? 1 : 0 };
    } else throw new GameError('اختيار مش صح');
    this.emit(room);
  }

  /** Settings of the selected game. */
  updateSettings(playerId: string, patch: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر الإعدادات واللعبة شغالة');
    const def = GAME_DEFS[room.selectedGame];
    const connected = [...room.players.values()].filter((p) => p.connected).length;
    room.settings[def.id] = applySettings(def.settings, room.settings[def.id], patch, connected);
    this.emit(room);
  }

  // ---------- games ----------

  /** Start the selected game from the lounge. */
  startGame(playerId: string) {
    const room = this.mustHost(playerId);
    if (room.engine && !room.engine.isOver()) throw new GameError('اللعبة شغالة فعلاً');
    this.begin(room);
  }

  /** After the final screen: same game, same settings, fresh round scores. */
  again(playerId: string) {
    const room = this.mustHost(playerId);
    if (!room.engine || !room.engine.isOver()) throw new GameError('مش وقته دلوقتي');
    this.begin(room);
  }

  /** Back to the lounge to pick a game. Lounge scores stay. */
  backToRoom(playerId: string) {
    const room = this.mustHost(playerId);
    this.clearTimer(room);
    room.engine = null;
    room.settled = false;
    room.players.forEach((p) => (p.ready = false));
    this.emit(room);
  }

  /** A game action (`spy:vote` -> game 'spy', action 'vote'). Host-only actions are declared by the engine. */
  gameAction(playerId: string, gameId: string | null, action: string, payload?: unknown) {
    const room = this.mustRoom(playerId);
    const e = room.engine;
    if (!e || (gameId && e.id !== gameId)) throw new GameError('مش وقته دلوقتي');
    if (e.hostActions.includes(action)) this.mustHost(playerId);
    e.handle(this.ctx(room), playerId, action, payload);
  }

  private begin(room: Room) {
    const def = GAME_DEFS[room.selectedGame];
    const online = [...room.players.values()].filter((p) => p.connected);
    if (online.length < def.minPlayers) throw new GameError(`محتاجين ${def.minPlayers} لاعيبة على الأقل`);
    def.validateStart?.(room.settings[def.id], online.length);
    this.clearTimer(room);
    room.engine = def.create(room.settings[def.id], room.difficulty);
    room.settled = false;
    this.systemMessage(room, `بدأت لعبة ${def.name}`);
    room.engine.start(this.ctx(room), online.map((p) => p.id));
  }

  /** Add the finished game's points to the lounge scores, once. */
  private settle(room: Room) {
    const e = room.engine;
    if (!e || room.settled || !e.isOver()) return;
    room.settled = true;
    room.players.forEach((p) => (p.lounge += e.scoreOf(p.id)));
    this.recordBoard(room, e);
  }

  /** Rank (0 = first) of everyone by total, ties keep the order of `ids`. */
  private rankOf(totals: Record<string, number>, ids: string[]) {
    const sorted = [...ids].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
    return Object.fromEntries(sorted.map((id, i) => [id, i])) as Record<string, number>;
  }

  /** A finished game becomes placement points on the room leaderboard (once per game, called from settle). */
  private recordBoard(room: Room, e: NonNullable<Room['engine']>) {
    const b = room.board;
    const ids = e.players?.() ?? [...room.players.keys()];
    if (!ids.length) return;
    const nameOf = (id: string) => room.players.get(id)?.name ?? b.members[id]?.name ?? '؟';
    const before = this.rankOf(b.totals, Object.keys(b.members));
    const pts: Record<string, number> = {};
    let winner: string;
    const team = e.teamResult?.();
    if (team) {
      team.winners.forEach((id) => (pts[id] = TEAM_WIN));
      team.losers.forEach((id) => (pts[id] = OTHER_POINTS));
      winner = team.label;
    } else {
      // placement; players with the same score share the better place
      const sorted = [...ids].sort((x, y) => e.scoreOf(y) - e.scoreOf(x));
      let place = 0;
      sorted.forEach((id, i) => {
        if (i > 0 && e.scoreOf(id) < e.scoreOf(sorted[i - 1])) place = i;
        pts[id] = PLACE_POINTS[place] ?? OTHER_POINTS;
      });
      winner = sorted.filter((id) => pts[id] === PLACE_POINTS[0]).map(nameOf).join(' و ');
    }
    b.gain = pts;
    b.prevRank = before;
    const gameId = e.id;
    (b.byGame[gameId] ??= {});
    Object.entries(pts).forEach(([id, n]) => {
      b.totals[id] = (b.totals[id] ?? 0) + n;
      b.byGame[gameId][id] = (b.byGame[gameId][id] ?? 0) + n;
      const p = room.players.get(id);
      b.members[id] = { name: p?.name ?? b.members[id]?.name ?? '؟', avatar: p?.avatar ?? b.members[id]?.avatar ?? 'c1' };
    });
    b.played.push({ n: b.played.length + 1, game: gameId, winner, at: Date.now() });
    if (b.played.length > MAX_BOARD_GAMES) b.played.splice(0, b.played.length - MAX_BOARD_GAMES);
  }

  /** The leaderboard as every player sees it: rows already sorted by total, with names that survive a leave. */
  private boardView(room: Room) {
    const b = room.board;
    const ids = Object.keys(b.members);
    const rank = this.rankOf(b.totals, ids);
    return {
      rows: [...ids].sort((x, y) => rank[x] - rank[y]).map((id) => {
        const p = room.players.get(id);
        return {
          id,
          name: p?.name ?? b.members[id].name,
          avatar: p?.avatar ?? b.members[id].avatar,
          inRoom: !!p,
          connected: !!p?.connected,
          total: b.totals[id] ?? 0,
          gain: b.gain[id] ?? 0,
          prevRank: id in b.prevRank ? b.prevRank[id] : null,
          byGame: Object.fromEntries(Object.keys(b.byGame).map((g) => [g, b.byGame[g][id] ?? 0]))
        };
      }),
      played: b.played,
      games: [...new Set(b.played.map((g) => g.game))]
    };
  }

  // ---------- view ----------

  viewFor(room: Room, playerId: string) {
    const e = room.engine;
    const players = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, ready: p.ready, connected: p.connected,
        score: e ? e.scoreOf(p.id) : 0, // this game's points
        lounge: p.lounge // lounge total across games
      }));
    return {
      code: room.code,
      name: this.shownName(room),
      privacy: room.privacy,
      locked: room.locked,
      hostId: room.hostId,
      youId: playerId,
      players,
      selectedGame: room.selectedGame,
      minPlayers: GAME_DEFS[room.selectedGame].minPlayers, // the lounge's start button follows the selected game
      difficulty: room.difficulty,
      board: this.boardView(room),
      // الموجة: the team of every player (saved choices + automatic balance), for the host's teams editor
      teams: this.usesTeams(room)
        ? normalizeTeams([...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id), room.settings[room.selectedGame]?.teams ?? {})
        : null,
      hasLevels: !!GAME_DEFS[room.selectedGame].levels, // only games with a level table show the difficulty control
      settings: room.settings[room.selectedGame],
      // the selected game's settings schema: the lounge renders its settings sheet from this (not needed during a game)
      settingsSchema: e ? null : GAME_DEFS[room.selectedGame].settings,
      game: e ? e.viewFor(playerId) : null,
      serverNow: Date.now()
    };
  }

  // ---------- helpers ----------

  private ctx(room: Room): EngineCtx {
    return {
      room,
      emit: () => this.emit(room),
      emitTo: (ids) => { if (this.rooms.has(room.code)) this.onChange(room, ids); },
      push: (ids, event, data) => { if (this.rooms.has(room.code)) this.onPush(room, ids, event, data); },
      schedule: (seconds, fn) => this.schedule(room, seconds, fn),
      clearTimer: () => this.clearTimer(room),
      system: (text) => this.systemMessage(room, text)
    };
  }

  /** Room name as strangers see it: bad words masked while the room is public. */
  private shownName(room: Room) {
    return room.privacy === 'public' ? maskBad(room.name) : room.name;
  }

  private cleanRoomName(name: unknown) {
    return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROOM_NAME);
  }

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

  private mustOtherMember(room: Room, selfId: string, targetId: unknown) {
    const id = String(targetId ?? '');
    if (id === selfId) throw new GameError('مينفعش تعمل كده في نفسك');
    const t = room.players.get(id);
    if (!t) throw new GameError('اللاعب ده مش في الأوضة');
    return t;
  }

  private passHost(room: Room) {
    const all = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    // if the host is gone from the room and nobody is online, still hand it to someone who is left
    const next = all.find((p) => p.connected) ?? (room.players.has(room.hostId) ? undefined : all[0]);
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
    this.touchLobby();
  }

  private sweep() {
    const now = Date.now();
    this.rooms.forEach((room) => {
      if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) this.destroy(room);
    });
  }

  private emit(room: Room) {
    if (!this.rooms.has(room.code)) return;
    this.settle(room);
    this.onChange(room);
    this.touchLobby();
  }

  stats() {
    return { rooms: this.rooms.size, players: this.playerRoom.size };
  }
}
