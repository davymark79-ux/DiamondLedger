// The real 50-team league, with real rosters attached — computed once at
// module load, not regenerated per render (unlike simDemoRoster.js's
// throwaway per-click matchups, this is meant to be a stable seed league).
// Uses a fixed seed rather than Date.now() for exactly that reason.

import { buildSeedLeagues } from '../models/seed/leagueSeed.js';
import {
  buildSeedRosters,
  LINEUP_POSITIONS,
  ROTATION_SIZE,
  BULLPEN_GENERATED_ROLES,
  BULLPEN_DEPTH_COUNT,
  BENCH_POSITIONS,
} from '../models/seed/rosterSeed.js';
import { buildSeedManagers } from '../models/seed/managerSeed.js';
import { createRng } from '../models/generation/random.js';

const SEED = 20260101;

const { teams: seedTeams } = buildSeedLeagues();
const rng = createRng(SEED);
const { teams, players, freeAgents } = buildSeedRosters(seedTeams, rng);
const managers = buildSeedManagers(teams, rng);

export { teams, players, freeAgents, managers };

export const playersById = new Map(players.map((player) => [player.id, player]));
export const managersById = new Map(managers.map((manager) => [manager.id, manager]));

/**
 * @param {string} teamId
 * @returns {object|null} Manager
 */
export function getTeamManager(teamId) {
  return managers.find((manager) => manager.teamId === teamId) ?? null;
}

/**
 * Resolves a team's roster id array into actual Player objects, split into
 * the same sections rosterSeed.js built them in. `bullpen` is reordered so
 * the Closer is always last (selectNextPitcher() in pitchingChanges.js
 * treats the last slot as the closer) even though the depth arms are
 * generated between Setup and Closer in `team.roster`'s raw id order.
 * @param {string} teamId
 * @returns {{lineup: object[], rotation: object[], bullpen: object[], bench: object[]}|null}
 */
export function getTeamRoster(teamId) {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;

  const rosterPlayers = team.roster.map((id) => playersById.get(id)).filter(Boolean);
  let cursor = 0;
  const take = (count) => rosterPlayers.slice(cursor, (cursor += count));

  const lineup = take(LINEUP_POSITIONS.length);
  const rotation = take(ROTATION_SIZE);
  const namedBullpen = take(BULLPEN_GENERATED_ROLES.length); // [Long, Middle, Setup, Closer]
  const bullpenDepth = take(BULLPEN_DEPTH_COUNT);
  const bench = take(BENCH_POSITIONS.length);

  return {
    lineup,
    rotation,
    bullpen: [...namedBullpen.slice(0, -1), ...bullpenDepth, namedBullpen[namedBullpen.length - 1]],
    bench,
  };
}
