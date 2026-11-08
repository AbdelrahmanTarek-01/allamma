import { maskBad } from '../common/profanity';
import { GameError } from '../rooms/rooms.types';
import type { Room } from '../rooms/rooms.types';

export interface TeamMsg { id: string; from: string; text: string; at: number }

/** Two private chats (one per team) for the team games. A team only ever receives its own messages. */
export class TeamChat {
  private msgs: [TeamMsg[], TeamMsg[]] = [[], []];
  private last: Record<string, number> = {};

  /** Stores a message and returns the team it belongs to (the caller sends a snapshot to that team only). */
  post(room: Room | undefined, team: 0 | 1 | undefined, playerId: string, text: unknown) {
    if (team === undefined) throw new GameError('انت مش في فريق');
    let msg = String(text ?? '').trim().slice(0, 120);
    if (!msg) return false;
    const now = Date.now();
    if (now - (this.last[playerId] ?? 0) < 1000) throw new GameError('استنى ثانية');
    this.last[playerId] = now;
    if (room?.privacy === 'public') msg = maskBad(msg);
    this.msgs[team] = [...this.msgs[team], { id: `${now}-${playerId}`, from: playerId, text: msg, at: now }].slice(-30);
    return true;
  }

  of(team: 0 | 1 | null | undefined): TeamMsg[] {
    return team === null || team === undefined ? [] : this.msgs[team];
  }
}
