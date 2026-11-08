import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { GameError, Room } from './rooms.types';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; error: string };

@WebSocketGateway({ cors: { origin: true } })
export class RoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly rooms: RoomsService) {}

  afterInit() {
    this.rooms.setListener((room) => this.broadcast(room));
  }

  private broadcast(room: Room) {
    room.players.forEach((p) => {
      if (p.socketIds.size === 0) return;
      const view = this.rooms.viewFor(room, p.id);
      p.socketIds.forEach((sid) => this.server.to(sid).emit('room:state', view));
    });
  }

  private run(client: Socket, fn: (playerId: string) => Record<string, unknown> | void): Ack {
    try {
      const playerId: string | undefined = client.data.playerId;
      if (!playerId) throw new GameError('عرّفنا بنفسك الأول');
      return { ok: true, ...(fn(playerId) || {}) };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      console.error(e);
      return { ok: false, error: 'حصلت مشكلة، جرّب تاني' };
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.playerId) this.rooms.detachSocket(client.data.playerId, client.id);
  }

  @SubscribeMessage('hello')
  hello(@ConnectedSocket() client: Socket, @MessageBody() body: any): Ack {
    try {
      const id = String(body?.playerId ?? '');
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new GameError('هوية غير صالحة');
      const { name, avatar } = this.rooms.cleanProfile(body?.name, body?.avatar);
      client.data.playerId = id;
      client.data.name = name;
      client.data.avatar = avatar;
      const room = this.rooms.attachSocket(id, client.id, name, avatar);
      return { ok: true, roomCode: room?.code ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof GameError ? e.message : 'حصلت مشكلة' };
    }
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => ({ code: this.rooms.createRoom(id, c.data.name, c.data.avatar, c.id).code }));
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => ({ code: this.rooms.joinRoom(b?.code, id, c.data.name, c.data.avatar, c.id).code }));
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.leave(id));
  }

  @SubscribeMessage('room:kick')
  kick(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => {
      const sockets = this.rooms.kick(id, b?.playerId);
      sockets.forEach((sid) => this.server.to(sid).emit('room:kicked'));
    });
  }

  @SubscribeMessage('room:makeHost')
  makeHost(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.makeHost(id, b?.playerId));
  }

  @SubscribeMessage('room:ready')
  ready(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.setReady(id, !!b?.ready));
  }

  @SubscribeMessage('room:chat')
  chat(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.chat(id, b?.text));
  }

  @SubscribeMessage('room:settings')
  settings(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.updateSettings(id, b ?? {}));
  }

  @SubscribeMessage('room:rename')
  rename(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.renameRoom(id, b?.name));
  }

  @SubscribeMessage('room:selectGame')
  selectGame(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.selectGame(id, b?.game));
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.startGame(id));
  }

  @SubscribeMessage('game:again')
  again(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.again(id));
  }

  // Spy actions: the service delegates them to the room's active engine.
  @SubscribeMessage('spy:nextTurn')
  nextTurn(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'nextTurn'));
  }

  @SubscribeMessage('spy:callVote')
  callVote(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'callVote'));
  }

  @SubscribeMessage('spy:vote')
  vote(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'vote', { targetId: b?.targetId }));
  }

  @SubscribeMessage('spy:guess')
  guess(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'guess', { place: b?.place }));
  }

  @SubscribeMessage('game:next')
  next(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, null, 'next'));
  }

  @SubscribeMessage('game:backToRoom')
  back(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.backToRoom(id));
  }
}
