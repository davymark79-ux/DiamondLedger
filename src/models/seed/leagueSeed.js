// Real 50-team roster transcribed directly from league-structure.md's
// "Full 50-Team Roster" table — demonstrates the schema against the league's
// actual, locked-in market/league/division assignments (not randomly
// generated). Market-size and ownership numbers aren't specced in that doc
// yet, so they're left at createTeam()'s neutral defaults here.

import { createTeam, createOwnership } from '../Team.js';
import { createLeague } from '../League.js';
import { LEAGUE_IDS, TIERS } from '../constants.js';
import { createRng } from '../generation/random.js';

const ROSTER = [
  // MLB1 — Atlantic
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'New York', league: LEAGUE_IDS.EXCHANGE, nickname: 'Gothams' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Newark, NJ', league: LEAGUE_IDS.FOUNDRY, nickname: 'Ironbound' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Boston', league: LEAGUE_IDS.FOUNDRY, nickname: 'Cod' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Cambridge, MA', league: LEAGUE_IDS.EXCHANGE, nickname: 'Scholars' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Philadelphia', league: LEAGUE_IDS.FOUNDRY, nickname: 'Bellringers' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Camden, NJ', league: LEAGUE_IDS.EXCHANGE, nickname: 'Ironworks' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Washington, D.C.', league: LEAGUE_IDS.FOUNDRY, nickname: 'Statesmen' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Alexandria, VA', league: LEAGUE_IDS.EXCHANGE, nickname: 'Torpedoes' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Miami', league: LEAGUE_IDS.EXCHANGE, nickname: 'Flamingos' },
  { tier: TIERS.MLB1, division: 'Atlantic', city: 'Fort Lauderdale', league: LEAGUE_IDS.FOUNDRY, nickname: 'Canals' },

  // MLB1 — Heartland
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Chicago', league: LEAGUE_IDS.FOUNDRY, nickname: 'Stockyards' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Chicago', league: LEAGUE_IDS.EXCHANGE, nickname: 'Winds' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Detroit', league: LEAGUE_IDS.FOUNDRY, nickname: 'Assembly' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Detroit', league: LEAGUE_IDS.EXCHANGE, nickname: 'Rivets' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Atlanta', league: LEAGUE_IDS.FOUNDRY, nickname: 'Terminus' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Atlanta', league: LEAGUE_IDS.EXCHANGE, nickname: 'Peaches' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Houston', league: LEAGUE_IDS.FOUNDRY, nickname: 'Roughnecks' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Houston', league: LEAGUE_IDS.EXCHANGE, nickname: 'Bayou' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Dallas', league: LEAGUE_IDS.EXCHANGE, nickname: 'Wildcatters' },
  { tier: TIERS.MLB1, division: 'Heartland', city: 'Fort Worth', league: LEAGUE_IDS.FOUNDRY, nickname: 'Drovers' },

  // MLB1 — Pacific
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Los Angeles', league: LEAGUE_IDS.FOUNDRY, nickname: 'Reels' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Anaheim', league: LEAGUE_IDS.EXCHANGE, nickname: 'Groves' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'San Francisco', league: LEAGUE_IDS.EXCHANGE, nickname: 'Cable Cars' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Oakland', league: LEAGUE_IDS.FOUNDRY, nickname: 'Longshoremen' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Riverside', league: LEAGUE_IDS.EXCHANGE, nickname: 'Orange Blossoms' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'San Bernardino', league: LEAGUE_IDS.FOUNDRY, nickname: 'Freight' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Phoenix', league: LEAGUE_IDS.FOUNDRY, nickname: 'Saguaros' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Phoenix', league: LEAGUE_IDS.EXCHANGE, nickname: 'Monsoons' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Seattle', league: LEAGUE_IDS.EXCHANGE, nickname: 'Evergreens' },
  { tier: TIERS.MLB1, division: 'Pacific', city: 'Tacoma', league: LEAGUE_IDS.FOUNDRY, nickname: 'Glassblowers' },

  // MLB2 — Frontier
  { tier: TIERS.MLB2, division: 'Frontier', city: 'Denver', league: LEAGUE_IDS.FOUNDRY, nickname: 'Prospectors' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'Denver', league: LEAGUE_IDS.EXCHANGE, nickname: 'Foothills' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'San Diego', league: LEAGUE_IDS.FOUNDRY, nickname: 'Zookeepers' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'San Diego', league: LEAGUE_IDS.EXCHANGE, nickname: 'Kelp' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'San Antonio', league: LEAGUE_IDS.FOUNDRY, nickname: 'Riverwalk' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'San Antonio', league: LEAGUE_IDS.EXCHANGE, nickname: 'Ramparts' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'Portland, OR', league: LEAGUE_IDS.FOUNDRY, nickname: 'Roses' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'Vancouver, WA', league: LEAGUE_IDS.EXCHANGE, nickname: 'Garrison' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'St. Louis', league: LEAGUE_IDS.FOUNDRY, nickname: 'Gateway' },
  { tier: TIERS.MLB2, division: 'Frontier', city: 'St. Louis', league: LEAGUE_IDS.EXCHANGE, nickname: 'Levee' },

  // MLB2 — Coastal
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Baltimore', league: LEAGUE_IDS.FOUNDRY, nickname: 'Crabbers' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Baltimore', league: LEAGUE_IDS.EXCHANGE, nickname: 'Clippers' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Tampa', league: LEAGUE_IDS.FOUNDRY, nickname: 'Cigars' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'St. Petersburg', league: LEAGUE_IDS.EXCHANGE, nickname: 'Sponge Divers' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Orlando', league: LEAGUE_IDS.FOUNDRY, nickname: 'Citrus' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Orlando', league: LEAGUE_IDS.EXCHANGE, nickname: 'Springs' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Charlotte', league: LEAGUE_IDS.FOUNDRY, nickname: 'Mills' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Charlotte', league: LEAGUE_IDS.EXCHANGE, nickname: 'Crown' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'Minneapolis', league: LEAGUE_IDS.FOUNDRY, nickname: 'Millwrights' },
  { tier: TIERS.MLB2, division: 'Coastal', city: 'St. Paul', league: LEAGUE_IDS.EXCHANGE, nickname: 'Bluffs' },
];

// Illustrative placeholder market-size values (0-1 scale), loosely informed
// by real-world metro population/market-prestige intuition — not sourced
// from any real market-size dataset, since league-structure.md never specs
// exact numbers. Same "needs real playtesting" tuning status as every other
// numeric constant in this engine. Cities sharing a metro area with another
// club in this table (e.g. both Chicago clubs, or Newark alongside New York)
// each get their own full value rather than splitting one metro's size in
// half — a deliberate simplification, not an oversight.
const MARKET_SIZE_BY_CITY = Object.freeze({
  'New York': 1.0,
  'Los Angeles': 0.92,
  Chicago: 0.82,
  Philadelphia: 0.66,
  'San Francisco': 0.64,
  Dallas: 0.62,
  Houston: 0.6,
  'Washington, D.C.': 0.58,
  Boston: 0.56,
  Atlanta: 0.54,
  Miami: 0.52,
  Detroit: 0.48,
  Seattle: 0.46,
  Phoenix: 0.45,
  Minneapolis: 0.43,
  'San Diego': 0.42,
  Denver: 0.4,
  Baltimore: 0.38,
  'St. Louis': 0.36,
  Tampa: 0.34,
  Charlotte: 0.33,
  'San Antonio': 0.32,
  Orlando: 0.31,
  'Portland, OR': 0.3,
  Anaheim: 0.3,
  'Fort Worth': 0.28,
  Oakland: 0.28,
  'Fort Lauderdale': 0.28,
  Riverside: 0.27,
  'San Bernardino': 0.25,
  'Alexandria, VA': 0.26,
  'Newark, NJ': 0.3,
  Tacoma: 0.24,
  'Cambridge, MA': 0.24,
  'Camden, NJ': 0.24,
  'St. Petersburg': 0.22,
  'St. Paul': 0.22,
  'Vancouver, WA': 0.2,
});
const DEFAULT_MARKET_SIZE = 0.4; // fallback for any city not in the table above

// Owner wealth varies per team but has no real-world anchor at all (unlike
// market size, which at least loosely tracks real metro size) — randomized
// on its own dedicated rng stream, seeded separately from realLeague.js's
// roster/manager generation so changing this never perturbs which players
// or managers get generated (see baseball-sim-engine-build-order memory).
const TEAM_ECONOMICS_SEED = 20260301;
const OWNER_WEALTH_RANGE = [0.2, 0.8];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Builds the 50 real teams plus the two populated leagues.
 * @returns {{ teams: object[], leagues: Record<string, object> }}
 */
export function buildSeedLeagues() {
  const economicsRng = createRng(TEAM_ECONOMICS_SEED);
  const teams = ROSTER.map((entry) =>
    createTeam({
      id: `${slugify(entry.city)}-${entry.league.toLowerCase()}`,
      city: entry.city,
      nickname: entry.nickname,
      leagueId: entry.league,
      tier: entry.tier,
      division: entry.division,
      marketSize: MARKET_SIZE_BY_CITY[entry.city] ?? DEFAULT_MARKET_SIZE,
      ownership: createOwnership({
        ownerWealth: Math.round((OWNER_WEALTH_RANGE[0] + economicsRng() * (OWNER_WEALTH_RANGE[1] - OWNER_WEALTH_RANGE[0])) * 100) / 100,
      }),
    })
  );

  const leagues = Object.fromEntries(
    Object.values(LEAGUE_IDS).map((leagueId) => [
      leagueId,
      createLeague(leagueId, {
        teams: teams.filter((t) => t.leagueId === leagueId).map((t) => t.id),
      }),
    ])
  );

  return { teams, leagues };
}
