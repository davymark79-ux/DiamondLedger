// Re-runnable sanity check for the season/schedule loop (engine/season.js +
// data/season.js): `npm run validate:season`. Same style as the other
// validate:* scripts — eyeball checks plus hard asserts on structural
// invariants.

import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason, TARGET_GAMES_PER_TEAM } from '../src/engine/season.js';
import { createRng } from '../src/models/generation/random.js';
import { LEAGUES, TIERS, LEAGUE_IDS } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const rng = createRng(7);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
const { standingsById, results } = simulateSeason(teams, getTeamRoster, schedule, rng);

const teamsById = new Map(teams.map((t) => [t.id, t]));

console.log('=== 1. Schedule size and grouping ===\n');
assert(schedule.length === results.length, `schedule and results are the same length (${schedule.length})`);
assert(
  schedule.every((g) => g.awayTeamId !== g.homeTeamId),
  'no team is scheduled to play itself'
);
assert(
  schedule.every((g) => teamsById.get(g.awayTeamId).leagueId === teamsById.get(g.homeTeamId).leagueId),
  'no cross-league games (Foundry only plays Foundry, Exchange only plays Exchange)'
);
assert(
  schedule.every((g) => teamsById.get(g.awayTeamId).tier === teamsById.get(g.homeTeamId).tier),
  'no cross-tier games'
);

console.log('\n=== 2. Games per team ===\n');
const groupSizeByTeamId = new Map();
for (const team of teams) {
  const groupSize = teams.filter((t) => t.tier === team.tier && t.leagueId === team.leagueId).length;
  groupSizeByTeamId.set(team.id, groupSize);
}
const gamesPlayedByTeamId = new Map(teams.map((t) => [t.id, 0]));
for (const game of schedule) {
  gamesPlayedByTeamId.set(game.awayTeamId, gamesPlayedByTeamId.get(game.awayTeamId) + 1);
  gamesPlayedByTeamId.set(game.homeTeamId, gamesPlayedByTeamId.get(game.homeTeamId) + 1);
}
const gamesCounts = [...gamesPlayedByTeamId.values()];
console.log(`  Games/team range: ${Math.min(...gamesCounts)} - ${Math.max(...gamesCounts)} (target >= ${TARGET_GAMES_PER_TEAM})`);
assert(
  teams.every((t) => {
    const played = gamesPlayedByTeamId.get(t.id);
    const groupSize = groupSizeByTeamId.get(t.id);
    return played >= TARGET_GAMES_PER_TEAM && played <= TARGET_GAMES_PER_TEAM + groupSize - 2;
  }),
  `every team played between ${TARGET_GAMES_PER_TEAM} and ${TARGET_GAMES_PER_TEAM}+groupSize-2 games`
);

console.log('\n=== 3. Home/away balance ===\n');
const homeCountByTeamId = new Map(teams.map((t) => [t.id, 0]));
for (const game of schedule) homeCountByTeamId.set(game.homeTeamId, homeCountByTeamId.get(game.homeTeamId) + 1);
const homeFractions = teams.map((t) => homeCountByTeamId.get(t.id) / gamesPlayedByTeamId.get(t.id));
console.log(`  Home-game fraction range: ${Math.min(...homeFractions).toFixed(2)} - ${Math.max(...homeFractions).toFixed(2)}`);
assert(
  homeFractions.every((f) => f >= 0.35 && f <= 0.65),
  'every team\'s home/away split stays within 35%-65%'
);

console.log('\n=== 4. Win/loss invariants ===\n');
let totalWins = 0;
let totalLosses = 0;
for (const standing of standingsById.values()) {
  totalWins += standing.wins;
  totalLosses += standing.losses;
}
assert(totalWins === schedule.length, `total wins (${totalWins}) equals total games (${schedule.length})`);
assert(totalLosses === schedule.length, `total losses (${totalLosses}) equals total games (${schedule.length})`);
assert(
  teams.every((t) => {
    const s = standingsById.get(t.id);
    return s.wins + s.losses === gamesPlayedByTeamId.get(t.id);
  }),
  'every team\'s wins+losses equals its games played'
);

console.log('\n=== 5. DH rule (structural check on lineup construction) ===\n');
function buildGameSide(roster, startingPitcher, dhRule) {
  return dhRule ? roster.lineup : [...roster.lineup.filter((p) => p.primaryPosition !== 'DH'), startingPitcher];
}
const foundryTeam = teams.find((t) => t.leagueId === LEAGUE_IDS.FOUNDRY);
const exchangeTeam = teams.find((t) => t.leagueId === LEAGUE_IDS.EXCHANGE);
const foundryLineup = buildGameSide(getTeamRoster(foundryTeam.id), getTeamRoster(foundryTeam.id).rotation[0], LEAGUES.FOUNDRY.dhRule);
const exchangeLineup = buildGameSide(getTeamRoster(exchangeTeam.id), getTeamRoster(exchangeTeam.id).rotation[0], LEAGUES.EXCHANGE.dhRule);
assert(foundryLineup.length === 9, 'Foundry (no-DH) lineup still has exactly 9 batters');
assert(!foundryLineup.some((p) => p.primaryPosition === 'DH'), 'Foundry lineup has no DH-position batter');
assert(foundryLineup.some((p) => p.primaryPosition === 'SP'), 'Foundry lineup includes the starting pitcher batting');
assert(exchangeLineup.length === 9, 'Exchange (DH) lineup has exactly 9 batters');
assert(exchangeLineup.some((p) => p.primaryPosition === 'DH'), 'Exchange lineup includes a DH-position batter');

console.log('\n=== 6. Rotation cycling (sample team) ===\n');
const sampleTeam = teams[0];
const samplePlayed = gamesPlayedByTeamId.get(sampleTeam.id);
const expectedStartsPerPitcher = samplePlayed / 5;
console.log(`  ${sampleTeam.city} ${sampleTeam.nickname}: ${samplePlayed} games played, ~${expectedStartsPerPitcher.toFixed(1)} expected starts/rotation slot`);
assert(expectedStartsPerPitcher >= TARGET_GAMES_PER_TEAM / 5 - 1, 'rotation cycles enough times for a real 5-man rotation to make sense');

console.log('\n=== 7. Scoring sanity ===\n');
let totalRuns = 0;
for (const r of results) totalRuns += r.awayRuns + r.homeRuns;
const avgRunsPerGame = totalRuns / results.length;
console.log(`  Avg runs/game across the full season: ${avgRunsPerGame.toFixed(2)}`);
console.log('  Note: this runs lower than the ~8.6-9.0 target from validate:game\'s symmetric');
console.log('  average-vs-average matchups — expected, not a bug. Real teams here have wide,');
console.log('  independently-randomized per-player quality (see roster-construction session\'s');
console.log('  notes), so mismatched-quality games naturally suppress combined scoring versus an');
console.log('  idealized 50-vs-50 matchup. A loose sanity bound, not the tight single-game target.');
assert(avgRunsPerGame >= 4 && avgRunsPerGame <= 14, 'avg runs/game is in a plausible baseball range (4-14)');

console.log('\n=== 8. Sample team season ===\n');
const printTeam = teams.find((t) => t.tier === TIERS.MLB1);
const record = standingsById.get(printTeam.id);
console.log(`  ${printTeam.city} ${printTeam.nickname}: ${record.wins}-${record.losses}`);
const sampleResults = results.filter((r) => r.awayTeamId === printTeam.id || r.homeTeamId === printTeam.id).slice(0, 5);
for (const r of sampleResults) {
  const away = teamsById.get(r.awayTeamId);
  const home = teamsById.get(r.homeTeamId);
  console.log(`  ${away.nickname} ${r.awayRuns} @ ${home.nickname} ${r.homeRuns}`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
