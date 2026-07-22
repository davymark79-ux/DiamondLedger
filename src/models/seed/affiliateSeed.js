// Minor League affiliate generation — minor-leagues.md / rookie-league.md.
// Every MLB club gets exactly one affiliate at each of the 4 levels (50 x 4
// = 200 clubs). Roster shape mirrors rosterSeed.js's own lineup/rotation/
// bullpen convention (reusing LINEUP_POSITIONS/ROTATION_SIZE directly) so
// engine/season.js's existing game-simulation machinery — which expects
// exactly that `{lineup, rotation, bullpen, bench}` shape — works unchanged
// for affiliate games too; a flat, no-bench roster (no bullpen-depth naming,
// no bench slots) is enough for a "basic sim," per that doc's own scoped-
// down fidelity permission.
//
// Every level reuses generateEstablishedPlayer()'s 21-37 age range — a
// real, flagged simplification (see constants.js's MINOR_LEAGUE_QUALITY_BANDS
// header): nothing feeds Rookie/A ball with genuinely young 17-23-ish HS/
// international signees until the draft/international-pathway phases of
// this arc get built. Quality descends by level instead (MINOR_LEAGUE_
// QUALITY_BANDS, all below TIERS.MLB2's own band) — the real, load-bearing
// differentiator for this phase.

import { createAffiliateClub } from '../AffiliateClub.js';
import { generateEstablishedPlayer } from '../generation/playerGenerator.js';
import { LINEUP_POSITIONS, ROTATION_SIZE } from './rosterSeed.js';
import { MINOR_LEAGUE_LEVELS_ORDER, MINOR_LEAGUE_QUALITY_BANDS, DEVELOPMENT_LEVELS } from '../constants.js';
import { pick } from '../generation/random.js';
import { AFFILIATE_CITY_POOL, AFFILIATE_NICKNAME_POOL, assignRegionalHub } from '../generation/affiliateNamePools.js';

// No named bullpen roles (Long/Middle/Setup/Closer) like the MLB roster —
// organizational depth only, order doesn't matter for a basic sim.
export const AFFILIATE_BULLPEN_SIZE = 6;
export const AFFILIATE_ROSTER_SIZE = LINEUP_POSITIONS.length + ROTATION_SIZE + AFFILIATE_BULLPEN_SIZE; // 20

/**
 * @param {object[]} teams - from realLeague.js, each with `id`/`leagueId`
 * @param {() => number} rng - seeded RNG from createRng()
 * @returns {object[]} AffiliateClub[] — 200 clubs (50 teams x 4 levels), rosters still empty
 */
export function buildAffiliateClubs(teams, rng) {
  const clubs = [];
  teams.forEach((team, parentIndex) => {
    for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
      clubs.push(
        createAffiliateClub({
          id: `${team.id}-${level}`,
          parentTeamId: team.id,
          leagueId: team.leagueId,
          level,
          city: pick(rng, AFFILIATE_CITY_POOL),
          nickname: pick(rng, AFFILIATE_NICKNAME_POOL),
          regionalHub: level === 'ROOKIE' ? assignRegionalHub(parentIndex) : null,
        })
      );
    }
  });
  return clubs;
}

// Sectioned {lineup, rotation, bullpen, bench} shape, NOT a flat array —
// matches rosterSeed.js's own live-roster convention exactly, since
// engine/minorLeagues.js's promoteAndBackfill() needs to remove/insert a
// specific player from the correct section (a flat array can't tell "which
// section" a player belonged to once a few call-ups have reshuffled it).
function buildClubRoster(club, rng, asOfDate) {
  const qualityRange = MINOR_LEAGUE_QUALITY_BANDS[club.level];
  const developmentLevel = DEVELOPMENT_LEVELS[club.level];
  let slot = 0;
  const gen = (position) =>
    generateEstablishedPlayer({
      rng,
      position,
      qualityRange,
      asOfDate,
      overrides: { id: `${club.id}-${slot++}`, teamId: club.parentTeamId, developmentLevel },
    });

  return {
    lineup: LINEUP_POSITIONS.map(gen),
    rotation: Array.from({ length: ROTATION_SIZE }, () => gen('SP')),
    bullpen: Array.from({ length: AFFILIATE_BULLPEN_SIZE }, () => gen('RP')),
    bench: [], // no bench depth at the minor-league level for this basic sim
  };
}

/**
 * @param {object[]} affiliateClubs - from buildAffiliateClubs(), rosters still empty
 * @param {() => number} rng - seeded RNG from createRng()
 * @param {Date} [asOfDate] - reference date for age math, defaults to now
 * @returns {{ affiliateClubs: object[], players: object[], rostersByClubId: Map<string, object> }}
 *   affiliateClubs' own `.roster` stays a flat id array (identity/count
 *   bookkeeping, matching Team.js's own `.roster` convention) — the
 *   sectioned live-game shape is `rostersByClubId`, the one engine/
 *   minorLeagues.js and data/realAffiliates.js actually consume.
 */
export function buildAffiliateRosters(affiliateClubs, rng, asOfDate = new Date()) {
  const players = [];
  const rostersByClubId = new Map();
  const updatedClubs = affiliateClubs.map((club) => {
    const roster = buildClubRoster(club, rng, asOfDate);
    const flatPlayers = [...roster.lineup, ...roster.rotation, ...roster.bullpen];
    players.push(...flatPlayers);
    rostersByClubId.set(club.id, roster);
    return { ...club, roster: flatPlayers.map((p) => p.id) };
  });
  return { affiliateClubs: updatedClubs, players, rostersByClubId };
}
