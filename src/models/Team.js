// Team schema — league-structure.md.

import { OWNERSHIP_TYPES, FAN_OWNERSHIP_MIN_FAN_SHARE, TIERS } from './constants.js';

/**
 * @typedef {Object} Ownership
 * @property {'SINGLE_OWNER'|'FAN_OWNED'} type
 * @property {number} [ownerWealth] - 0-1 scale, single-owner clubs only.
 * @property {number} [fanShare] - 0-1, fan-owned clubs only. Must stay >=
 *   FAN_OWNERSHIP_MIN_FAN_SHARE (a floor, not a target — a club can run
 *   anywhere from 51% to fully 100% fan-owned).
 * @property {number} [outsideShare] - 1 - fanShare, capped at 49% by construction.
 */

/**
 * @param {object} [overrides]
 * @returns {Ownership}
 */
export function createOwnership(overrides = {}) {
  const type = overrides.type ?? OWNERSHIP_TYPES.SINGLE_OWNER;

  if (type === OWNERSHIP_TYPES.FAN_OWNED) {
    const fanShare = overrides.fanShare ?? 1;
    if (fanShare < FAN_OWNERSHIP_MIN_FAN_SHARE) {
      throw new Error(
        `Fan-owned clubs must hold at least ${FAN_OWNERSHIP_MIN_FAN_SHARE * 100}% fan share, got ${fanShare * 100}%`
      );
    }
    return { type, fanShare, outsideShare: 1 - fanShare };
  }

  return { type, ownerWealth: overrides.ownerWealth ?? 0.5 };
}

/**
 * @param {object} [overrides]
 * @returns {object} Team
 */
export function createTeam(overrides = {}) {
  return {
    id: overrides.id ?? null,
    city: overrides.city ?? '',
    nickname: overrides.nickname ?? '',

    leagueId: overrides.leagueId ?? null, // LEAGUE_IDS.FOUNDRY | LEAGUE_IDS.EXCHANGE — never changes
    tier: overrides.tier ?? TIERS.MLB1, // moves via promotion/relegation
    division: overrides.division ?? null,

    ownership: overrides.ownership ?? createOwnership(),
    marketSize: overrides.marketSize ?? 0.5, // 0-1 scale, relative market population

    roster: overrides.roster ?? [], // Player ids

    wins: overrides.wins ?? 0,
    losses: overrides.losses ?? 0,
  };
}
