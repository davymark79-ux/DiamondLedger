// League schema — league-structure.md.

import { LEAGUES, TIERS, DIVISIONS_BY_TIER } from './constants.js';

/**
 * @param {'FOUNDRY'|'EXCHANGE'} leagueId
 * @param {object} [overrides]
 * @returns {object} League
 */
export function createLeague(leagueId, overrides = {}) {
  const base = LEAGUES[leagueId];
  if (!base) throw new Error(`Unknown league id: ${leagueId}`);

  return {
    ...base,
    teams: overrides.teams ?? [], // Team ids
  };
}

/**
 * Promotion/relegation is same-league, cross-tier: last place in a league's
 * MLB1 swaps with first place in that same league's MLB2. A team's league
 * never changes; only its tier does. (Stadium-compliance auto-relegation can
 * override which team fills the slot — see stadiums.md — not modeled here.)
 * @param {'FOUNDRY'|'EXCHANGE'} leagueId
 */
export function getPromotionRelegationPairing(leagueId) {
  return { leagueId, relegatedFrom: TIERS.MLB1, promotedFrom: TIERS.MLB2 };
}

/**
 * @param {'MLB1'|'MLB2'} tier
 * @returns {string[]}
 */
export function getDivisionsForTier(tier) {
  return DIVISIONS_BY_TIER[tier] ?? [];
}
