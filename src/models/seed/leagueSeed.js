// Real 50-team roster transcribed directly from league-structure.md's
// "Full 50-Team Roster" table — demonstrates the schema against the league's
// actual, locked-in market/league/division assignments (not randomly
// generated). Market-size and ownership numbers aren't specced in that doc
// yet, so they're left at createTeam()'s neutral defaults here.

import { createTeam } from '../Team.js';
import { createLeague } from '../League.js';
import { LEAGUE_IDS, TIERS } from '../constants.js';

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

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Builds the 50 real teams plus the two populated leagues.
 * @returns {{ teams: object[], leagues: Record<string, object> }}
 */
export function buildSeedLeagues() {
  const teams = ROSTER.map((entry) =>
    createTeam({
      id: `${slugify(entry.city)}-${entry.league.toLowerCase()}`,
      city: entry.city,
      nickname: entry.nickname,
      leagueId: entry.league,
      tier: entry.tier,
      division: entry.division,
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
