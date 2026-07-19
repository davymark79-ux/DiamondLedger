// Attaches a Writers Corps to the real 50-team league — one-or-more
// writers per team's city, per writers-corps.md ("Number of writers per
// city scales with that city's market size" — no formula given, the doc's
// own Open Questions punts on the exact numbers, so this is this
// project's own placeholder). Each team's own city gets its own writer
// population, even if two teams share a physical city — a deliberate
// simplification avoiding a city-string-deduplication pass, matching the
// doc's own "Dallas and Fort Worth each get their own" per-club framing.

import { generateWriter } from '../generation/writerGenerator.js';

const BASE_WRITERS_PER_CITY = 1;
// marketSize (0-1) scales 0-2 extra writers on top of the base 1 — an
// illustrative placeholder, same tuning status as everything else here.
const MAX_EXTRA_WRITERS_BY_MARKET_SIZE = 2;

/**
 * @param {object[]} teams - from buildSeedLeagues()/buildSeedRosters()
 * @param {() => number} rng - seeded RNG from createRng()
 * @returns {object[]} Writer[]
 */
export function buildWritersCorps(teams, rng) {
  const writers = [];
  for (const team of teams) {
    const count = BASE_WRITERS_PER_CITY + Math.round(team.marketSize * MAX_EXTRA_WRITERS_BY_MARKET_SIZE);
    for (let i = 0; i < count; i++) {
      writers.push(
        generateWriter({
          rng,
          city: team.city,
          favoriteTeamId: team.id,
          overrides: { id: `${team.id}-writer-${i}` },
        })
      );
    }
  }
  return writers;
}
