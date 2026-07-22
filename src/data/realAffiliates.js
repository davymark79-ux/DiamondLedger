// The real 200 minor-league affiliate clubs (50 real MLB clubs x 4 levels:
// AAA/AA/A/Rookie) — computed once at module load, mirroring realLeague.js's
// own teams/managers precedent. Only identity (id/city/nickname/level/
// parentTeamId/leagueId/regionalHub) lives here and never changes — same
// "static singleton" split realLeague.js already established for teams vs.
// data/season.js's live, evolving rosterByTeamId. Which players currently
// occupy each affiliate's roster is live state too (data/season.js's
// affiliateRosterByClubId); `initialAffiliateRosterByClubId()` below just
// gives season 1 something real to start from, exactly like realLeague.js's
// getTeamRoster() does for the majors.

import { teams } from './realLeague.js';
import { buildAffiliateClubs, buildAffiliateRosters } from '../models/seed/affiliateSeed.js';
import { createRng } from '../models/generation/random.js';

// Dedicated stream, separate from realLeague.js's own SEED and
// leagueSeed.js's TEAM_ECONOMICS_SEED — so changing this never perturbs
// which MLB players/managers get generated (same reasoning as that file's
// own separate economics stream).
const SEED = 20260401;

const rng = createRng(SEED);
const seedClubs = buildAffiliateClubs(teams, rng);
const { affiliateClubs, players, rostersByClubId } = buildAffiliateRosters(seedClubs, rng);

export { affiliateClubs };
export const affiliateClubsById = new Map(affiliateClubs.map((club) => [club.id, club]));
export const affiliatePlayersById = new Map(players.map((player) => [player.id, player]));

/**
 * @param {string} teamId
 * @param {string} level - one of MINOR_LEAGUE_LEVELS_ORDER
 * @returns {object|null} AffiliateClub
 */
export function getAffiliateClub(teamId, level) {
  return affiliateClubsById.get(`${teamId}-${level}`) ?? null;
}

/**
 * Season 1's starting point for the live, evolving affiliateRosterByClubId
 * state (data/season.js) — a fresh Map of shallow roster-section copies
 * (never the same array instances as this module's own frozen seed data,
 * so later mutation via engine/minorLeagues.js's promoteAndBackfill can
 * never reach back and corrupt it), same role realLeague.js's
 * getTeamRoster() plays for the majors' own rosterByTeamId.
 * @returns {Map<string, {lineup: object[], rotation: object[], bullpen: object[], bench: object[]}>}
 */
export function initialAffiliateRosterByClubId() {
  const map = new Map();
  for (const [clubId, roster] of rostersByClubId) {
    map.set(clubId, {
      lineup: [...roster.lineup],
      rotation: [...roster.rotation],
      bullpen: [...roster.bullpen],
      bench: [...roster.bench],
    });
  }
  return map;
}
