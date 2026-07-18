// Attaches one real Manager to each of the real 50-team league-structure.md
// seed — exactly one manager per team (an inferred 1:1 cardinality;
// managers.md never states it explicitly, but its Career Lifecycle
// "rehiring" language, where a fired manager re-enters a labor market
// other clubs hire from, implies it).

import { generateManager } from '../generation/managerGenerator.js';

/**
 * @param {object[]} teams - from buildSeedLeagues()/buildSeedRosters(), each with an `id`/`leagueId`
 * @param {() => number} rng - seeded RNG from createRng()
 * @returns {object[]} Manager[]
 */
export function buildSeedManagers(teams, rng) {
  return teams.map((team) =>
    generateManager({ rng, leagueId: team.leagueId, overrides: { id: `${team.id}-Manager`, teamId: team.id } })
  );
}
