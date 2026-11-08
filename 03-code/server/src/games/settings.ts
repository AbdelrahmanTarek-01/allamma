import { arabicNum } from '../common/ar';
import { GameError } from '../rooms/rooms.types';
import type { SettingField } from './game-engine';

/**
 * Apply a client patch to a game's settings, validated against its schema.
 * Unknown keys and unknown option values are ignored. An option that needs more players than are
 * connected right now is rejected (the UI shows those locked).
 */
export function applySettings<S extends Record<string, any>>(fields: SettingField[], current: S, patch: unknown, connected: number): S {
  const p = (patch ?? {}) as Record<string, unknown>;
  const next: Record<string, any> = { ...current };
  for (const f of fields) {
    if (!(f.key in p)) continue;
    const opt = f.options.find((o) => String(o.value) === String(p[f.key]));
    if (!opt) continue;
    if (opt.minPlayers && connected < opt.minPlayers) throw new GameError(`محتاج ${arabicNum(opt.minPlayers)} لاعيبة على الأقل`);
    next[f.key] = opt.value;
  }
  return next as S;
}
