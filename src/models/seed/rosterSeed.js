// Attaches real Player rosters to the real 50-team league-structure.md seed
// (buildSeedLeagues()) — a full 26-man active roster per team (9 lineup +
// 5 rotation + 8 bullpen + 4 bench). Originally this generated only the 18
// spots actually needed to field a team, leaving 8 bench/bullpen-depth
// slots reserved for a future HS-draft system. That draft (and the AAA/AA/A
// organizational pyramid it was meant to feed from) never got built, and
// with the Injuries system needing somewhere real to pull an injury
// replacement from, those 8 slots are now real generated players too — see
// baseball-sim-engine-build-order memory for the full reasoning. This is
// still not the full org pyramid the original roster-construction session
// intended (no minors rosters exist) — it's specifically "give the MLB
// active roster real emergency depth."

import { generateEstablishedPlayer } from '../generation/playerGenerator.js';
import { TIERS, RATING_SCALE } from '../constants.js';

// Exported so consumers (e.g. src/data/realLeague.js's getTeamRoster()) can
// slice a flat `team.roster` id array back into sections without
// re-hardcoding these counts or parsing id strings.
export const LINEUP_POSITIONS = Object.freeze(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);
export const ROTATION_SIZE = 5;
// Named roles reused verbatim from simDemoRoster.js's existing bullpen
// convention (selectNextPitcher() in pitchingChanges.js treats the last
// array slot as the closer).
export const BULLPEN_GENERATED_ROLES = Object.freeze(['Long', 'Middle', 'Setup', 'Closer']);
// Additional bullpen depth beyond the 4 named roles — no individual role
// names, just organizational depth (real bullpens carry more than one
// long-relief/middle option).
export const BULLPEN_DEPTH_COUNT = 4;
export const BENCH_POSITIONS = Object.freeze(['C', '1B', 'SS', 'LF']);

export const ROSTER_SIZE_PER_TEAM =
  LINEUP_POSITIONS.length + ROTATION_SIZE + BULLPEN_GENERATED_ROLES.length + BULLPEN_DEPTH_COUNT + BENCH_POSITIONS.length; // 26

const FREE_AGENT_POOL_FRACTION = 0.1;

// Placeholder quality bands, same "needs real playtesting" tone as every
// other numeric constant in this engine — deliberately far enough apart
// (~20-point gap on the 20-80 scale) that MLB1 unmistakably outplays MLB2,
// per an explicit design ask, not just a hopeful default (see
// validate-roster-construction.mjs, which checks this gap directly).
export const ROSTER_QUALITY_BY_TIER = Object.freeze({
  [TIERS.MLB1]: [45, 72],
  [TIERS.MLB2]: [25, 52],
});

// Bench/bullpen-depth players are deliberately a notch below the team's
// everyday-player quality band — real depth pieces, not hidden stars, so
// losing a starter to injury is a real downgrade, not a lateral move.
const DEPTH_QUALITY_DISCOUNT = 12;

function qualityRangeForTier(tier) {
  return ROSTER_QUALITY_BY_TIER[tier] ?? ROSTER_QUALITY_BY_TIER[TIERS.MLB2];
}

function depthQualityRangeForTier(tier) {
  const [min, max] = qualityRangeForTier(tier);
  return [Math.max(RATING_SCALE.MIN, min - DEPTH_QUALITY_DISCOUNT), Math.max(RATING_SCALE.MIN, max - DEPTH_QUALITY_DISCOUNT)];
}

function buildTeamRosterPlayers(team, rng) {
  const qualityRange = qualityRangeForTier(team.tier);
  const depthQualityRange = depthQualityRangeForTier(team.tier);
  const players = [];

  for (const position of LINEUP_POSITIONS) {
    players.push(
      generateEstablishedPlayer({ rng, position, qualityRange, overrides: { id: `${team.id}-${position}`, teamId: team.id } })
    );
  }
  for (let i = 0; i < ROTATION_SIZE; i++) {
    players.push(
      generateEstablishedPlayer({ rng, position: 'SP', qualityRange, overrides: { id: `${team.id}-SP${i}`, teamId: team.id } })
    );
  }
  for (const role of BULLPEN_GENERATED_ROLES) {
    players.push(
      generateEstablishedPlayer({ rng, position: 'RP', qualityRange, overrides: { id: `${team.id}-RP-${role}`, teamId: team.id } })
    );
  }
  for (let i = 0; i < BULLPEN_DEPTH_COUNT; i++) {
    players.push(
      generateEstablishedPlayer({
        rng,
        position: 'RP',
        qualityRange: depthQualityRange,
        overrides: { id: `${team.id}-RP-Depth${i}`, teamId: team.id },
      })
    );
  }
  for (const position of BENCH_POSITIONS) {
    players.push(
      generateEstablishedPlayer({
        rng,
        position,
        qualityRange: depthQualityRange,
        overrides: { id: `${team.id}-BN-${position}`, teamId: team.id },
      })
    );
  }

  return players;
}

// Generic position mix for free agents — they aren't tied to a specific
// team's slot composition, just cycled across the same position pool a
// roster draws from.
const FREE_AGENT_POSITION_POOL = Object.freeze([...LINEUP_POSITIONS, 'SP', 'RP']);

function generateFreeAgentsForTier(tier, rosteredCountForTier, rng) {
  const count = Math.round(rosteredCountForTier * FREE_AGENT_POOL_FRACTION);
  const qualityRange = qualityRangeForTier(tier);
  return Array.from({ length: count }, (_, i) => {
    const position = FREE_AGENT_POSITION_POOL[i % FREE_AGENT_POSITION_POOL.length];
    return generateEstablishedPlayer({ rng, position, qualityRange, overrides: { id: `FA-${tier}-${i}`, teamId: null } });
  });
}

/**
 * @param {object[]} teams - from buildSeedLeagues(), each with a `tier` and empty `roster`
 * @param {() => number} rng - seeded RNG from createRng()
 * @returns {{ teams: object[], players: object[], freeAgents: object[] }}
 */
export function buildSeedRosters(teams, rng) {
  const players = [];

  const updatedTeams = teams.map((team) => {
    const teamPlayers = buildTeamRosterPlayers(team, rng);
    players.push(...teamPlayers);
    return { ...team, roster: teamPlayers.map((player) => player.id) };
  });

  const freeAgents = [];
  for (const tier of Object.values(TIERS)) {
    const tierTeamCount = updatedTeams.filter((team) => team.tier === tier).length;
    freeAgents.push(...generateFreeAgentsForTier(tier, tierTeamCount * ROSTER_SIZE_PER_TEAM, rng));
  }

  return { teams: updatedTeams, players, freeAgents };
}
