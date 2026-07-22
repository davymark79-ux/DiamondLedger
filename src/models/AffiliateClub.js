// Minor League affiliate club schema — minor-leagues.md / rookie-league.md.
// Distinct from Team.js: an affiliate sits outside the promotion/relegation
// pyramid (players move between levels, clubs don't — minor-leagues.md),
// has no ownership/market-size economics of its own, and never changes
// `leagueId`/`level`/`parentTeamId` once created. `leagueId` is inherited
// from the parent MLB club purely so engine/season.js's existing
// `LEAGUES[team.leagueId].dhRule` lookup works unchanged for affiliate
// games too — reuse, not a new DH-rule concept.

import { MINOR_LEAGUE_LEVELS_ORDER } from './constants.js';

/**
 * @param {object} [overrides]
 * @returns {object} AffiliateClub
 */
export function createAffiliateClub(overrides = {}) {
  return {
    id: overrides.id ?? null,
    parentTeamId: overrides.parentTeamId ?? null,
    leagueId: overrides.leagueId ?? null, // LEAGUE_IDS.FOUNDRY | LEAGUE_IDS.EXCHANGE — inherited from parent, never changes
    level: overrides.level ?? MINOR_LEAGUE_LEVELS_ORDER[MINOR_LEAGUE_LEVELS_ORDER.length - 1],

    city: overrides.city ?? '',
    nickname: overrides.nickname ?? '',
    // Rookie-only (rookie-league.md's four regional leagues) — null for AAA/AA/A.
    regionalHub: overrides.regionalHub ?? null,

    roster: overrides.roster ?? [], // Player ids

    wins: overrides.wins ?? 0,
    losses: overrides.losses ?? 0,
  };
}
