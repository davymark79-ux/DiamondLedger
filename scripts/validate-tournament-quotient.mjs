// Re-runnable sanity check for Tournament Quotient — Phase 2 of "The
// Ledger Cup" build arc (engine/tournamentQuotient.js):
// `npm run validate:quotient`. Same style as the other validate:* scripts
// — eyeball checks plus hard asserts on structural invariants.

import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';
import { simulateOneSeason } from '../src/engine/leagueProgression.js';
import { simulatePlayoffs } from '../src/engine/playoffs.js';
import { createRng } from '../src/models/generation/random.js';
import {
  QUOTIENT_FLOOR,
  QUOTIENT_CEILING,
  QUOTIENT_CENTER,
  K_CONTEXT,
  clampQuotient,
  computeExpectedScore,
  computeQuotientDelta,
  createInitialQuotientByTeamId,
  foldGameOutcome,
  foldRegularSeasonResults,
  foldSeriesGames,
  foldPlayoffResult,
  decayQuotientsForNewSeason,
} from '../src/engine/tournamentQuotient.js';
import { computeFreshSeason1State, advanceToNextSeason, STATE_SCHEMA_VERSION } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

function sortedEntriesJson(map) {
  return JSON.stringify([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

console.log('=== 1. Bounded Elo core math ===\n');
{
  assert(computeExpectedScore(60, 60) === 0.5, 'a dead-even rating gap gives exactly a 0.5 expected score');
  assert(computeExpectedScore(80, 40) > 0.5, 'the higher-rated side has an expected score above 0.5');
  assert(computeExpectedScore(40, 80) < 0.5, 'the lower-rated side has an expected score below 0.5');
  const sum = computeExpectedScore(80, 40) + computeExpectedScore(40, 80);
  assert(Math.abs(sum - 1) < 1e-9, 'the two sides\' expected scores sum to exactly 1 (symmetric formula)');

  const worked = computeExpectedScore(100, 20);
  console.log(`  computeExpectedScore(100, 20) = ${worked.toFixed(4)} (doc's own "~82%" reasoning at the widest possible gap)`);
  assert(worked > 0.80 && worked < 0.84, 'the widest-possible rating gap (100 vs 20) lands in the doc\'s own ~82% ballpark');

  const delta = computeQuotientDelta(60, 60, 1, K_CONTEXT.REGULAR_SEASON);
  assert(Math.abs(delta - 0.2) < 1e-9, `a dead-even win at K=0.4 gives exactly a +0.2 delta (got ${delta})`);

  const ceilingResult = clampQuotient(100 + computeQuotientDelta(100, 20, 1, K_CONTEXT.LEAGUE_PLAYOFFS));
  assert(ceilingResult === QUOTIENT_CEILING, 'a win at the ceiling never overshoots past 100.00');

  const floorResult = clampQuotient(20 + computeQuotientDelta(20, 100, 0, K_CONTEXT.LEAGUE_PLAYOFFS));
  assert(floorResult === QUOTIENT_FLOOR, 'a loss at the floor never undershoots past 20.00');

  const afterGame = foldGameOutcome(new Map([['A', 60], ['B', 60]]), 'A', 'B', K_CONTEXT.REGULAR_SEASON);
  assert(afterGame.get('A') === 60.2, `winner A moves from 60 to exactly 60.2 (got ${afterGame.get('A')})`);
  assert(afterGame.get('B') === 59.8, `loser B moves from 60 to exactly 59.8 (got ${afterGame.get('B')})`);
}

console.log('\n=== 2. Decay math ===\n');
{
  assert(decayQuotientsForNewSeason(new Map([['x', 100]])).get('x') === 98.0, 'decaying 100 lands at exactly 98.0');
  assert(decayQuotientsForNewSeason(new Map([['x', 20]])).get('x') === 22.0, 'decaying 20 lands at exactly 22.0');
  assert(decayQuotientsForNewSeason(new Map([['x', 60]])).get('x') === 60.0, 'a rating already at center is unchanged by decay');

  const above = decayQuotientsForNewSeason(new Map([['x', 90]])).get('x');
  const below = decayQuotientsForNewSeason(new Map([['x', 30]])).get('x');
  assert(Math.abs(Math.abs(above - QUOTIENT_CENTER) - (90 - QUOTIENT_CENTER) * 0.95) < 1e-9, 'an above-center rating\'s distance from center shrinks by exactly 5%');
  assert(Math.abs(Math.abs(below - QUOTIENT_CENTER) - (QUOTIENT_CENTER - 30) * 0.95) < 1e-9, 'a below-center rating\'s distance from center shrinks by exactly 5%');
}

console.log('\n=== 3. Regular-season fold ===\n');
{
  // Isolated: A beats B 5 straight, alternating home/away to confirm the
  // win/loss derivation (awayRuns > homeRuns) is side-independent.
  const syntheticResults = [
    { awayTeamId: 'A', homeTeamId: 'B', awayRuns: 5, homeRuns: 2 },
    { awayTeamId: 'B', homeTeamId: 'A', awayRuns: 1, homeRuns: 4 },
    { awayTeamId: 'A', homeTeamId: 'B', awayRuns: 3, homeRuns: 0 },
    { awayTeamId: 'B', homeTeamId: 'A', awayRuns: 2, homeRuns: 6 },
    { awayTeamId: 'A', homeTeamId: 'B', awayRuns: 7, homeRuns: 1 },
  ];
  let map = new Map([['A', 60], ['B', 60]]);
  const afterFirst = foldGameOutcome(map, 'A', 'B', K_CONTEXT.REGULAR_SEASON);
  assert(afterFirst.get('A') === 60.2 && afterFirst.get('B') === 59.8, 'the first game\'s delta matches the isolated foldGameOutcome check exactly');

  map = foldRegularSeasonResults(map, syntheticResults);
  assert(map.get('A') > 60 && map.get('B') < 60, 'after 5 straight A wins (mixed home/away), A is above center and B is below — win/loss derivation is side-independent');

  const rng = createRng(9001);
  const { seasonResult } = simulateOneSeason(teams, getTeamRoster, getTeamManager, rng);
  let realMap = createInitialQuotientByTeamId(teams.map((t) => t.id));
  realMap = foldRegularSeasonResults(realMap, seasonResult.results);
  const values = [...realMap.values()];
  assert(values.every((v) => v >= QUOTIENT_FLOOR && v <= QUOTIENT_CEILING), 'every real team\'s Quotient stays within [20, 100] after a full regular season');
  assert(!values.every((v) => v === QUOTIENT_CENTER), 'real movement happened — not every team is still sitting at the starting center value');

  const standings = [...seasonResult.standingsById.entries()];
  const winPct = (id) => {
    const s = seasonResult.standingsById.get(id);
    return s.wins / (s.wins + s.losses);
  };
  const best = standings.reduce((a, b) => (winPct(a[0]) > winPct(b[0]) ? a : b))[0];
  const worst = standings.reduce((a, b) => (winPct(a[0]) < winPct(b[0]) ? a : b))[0];
  console.log(`  best-record team (${best}) Quotient: ${realMap.get(best).toFixed(2)}; worst-record team (${worst}) Quotient: ${realMap.get(worst).toFixed(2)}`);
  assert(realMap.get(best) > realMap.get(worst), 'the best-win% real team ends with a strictly higher Quotient than the worst-win% team');
}

console.log('\n=== 4. Playoff fold ===\n');
{
  const isolatedSeries = { games: [{ awayTeamId: 'A', homeTeamId: 'B', awayRuns: 5, homeRuns: 2, winnerTeamId: 'A' }] };
  const isolatedResult = foldSeriesGames(new Map([['A', 60], ['B', 60]]), isolatedSeries, K_CONTEXT.LEAGUE_PLAYOFFS);
  assert(isolatedResult.get('A') === 60.8, `winner A moves to exactly 60.8 at K=1.6 (got ${isolatedResult.get('A')})`);
  assert(isolatedResult.get('B') === 59.2, `loser B moves to exactly 59.2 at K=1.6 (got ${isolatedResult.get('B')})`);

  const rng = createRng(9001);
  const { seasonResult } = simulateOneSeason(teams, getTeamRoster, getTeamManager, rng);
  const rosterByTeamId = new Map(teams.map((t) => [t.id, getTeamRoster(t.id)]));
  const managerByTeamId = new Map(teams.map((t) => [t.id, getTeamManager(t.id)]));
  const playoffResult = simulatePlayoffs(
    teams, seasonResult.standingsById, rosterByTeamId, managerByTeamId,
    seasonResult.injuryStatusById, seasonResult.consecutiveGamesPlayedById, seasonResult.streakStateById, rng
  );

  let expectedGameCount = 0;
  for (const league of Object.values(playoffResult.leagues)) {
    expectedGameCount += league.wcRound[0].games.length + league.wcRound[1].games.length + league.lcs.games.length;
  }
  if (playoffResult.finals) expectedGameCount += playoffResult.finals.games.length;
  if (playoffResult.mlb2Championship) expectedGameCount += playoffResult.mlb2Championship.games.length;
  console.log(`  real playoff run: ${expectedGameCount} total games across both leagues + Finals + MLB2 Championship`);

  const before = createInitialQuotientByTeamId(teams.map((t) => t.id));
  const after = foldPlayoffResult(before, playoffResult);
  assert([...after.values()].every((v) => v >= QUOTIENT_FLOOR && v <= QUOTIENT_CEILING), 'every team stays within [20, 100] after folding a real playoff run');

  if (playoffResult.finals) {
    const { teamAId, teamBId } = playoffResult.finals;
    assert(after.get(teamAId) !== before.get(teamAId) && after.get(teamBId) !== before.get(teamBId), 'both Finals participants\' ratings changed — Finals games are not silently dropped');
  } else {
    console.log('  (no Finals occurred in this seed — skipping the Finals-specific check)');
  }

  if (playoffResult.mlb2Championship) {
    const { teamAId, teamBId } = playoffResult.mlb2Championship;
    assert(after.get(teamAId) !== before.get(teamAId) && after.get(teamBId) !== before.get(teamBId), 'both MLB2 Championship participants\' ratings changed — those games are not silently dropped');
  } else {
    console.log('  (no MLB2 Championship occurred in this seed — skipping that check)');
  }
}

console.log('\n=== 5. createInitialQuotientByTeamId ===\n');
{
  const defaultMap = createInitialQuotientByTeamId(['a', 'b', 'c']);
  assert([...defaultMap.values()].every((v) => v === QUOTIENT_CENTER), 'the default call seeds every team at exactly the center value (60.00) — the real-teams retrofit case');

  const expansionMap = createInitialQuotientByTeamId(['a', 'b', 'c'], QUOTIENT_FLOOR);
  assert([...expansionMap.values()].every((v) => v === QUOTIENT_FLOOR), 'an explicit QUOTIENT_FLOOR override seeds every team at exactly 20.00 — the theoretical new/expansion-club case');
}

console.log('\n=== 6. Real season-1 bootstrap wiring ===\n');
{
  const state = computeFreshSeason1State();

  let expected = createInitialQuotientByTeamId(teams.map((t) => t.id));
  expected = foldRegularSeasonResults(expected, state.seasonResult.results);
  expected = foldPlayoffResult(expected, state.playoffResult);

  assert(sortedEntriesJson(state.quotientByTeamId) === sortedEntriesJson(expected), 'the real computeFreshSeason1State() wiring matches an independently-recomputed expectation exactly');

  const withDecay = decayQuotientsForNewSeason(expected);
  assert(sortedEntriesJson(state.quotientByTeamId) !== sortedEntriesJson(withDecay), 'season 1 correctly did NOT apply a decay step (no prior season exists to decay from)');

  assert(state.schemaVersion === STATE_SCHEMA_VERSION && STATE_SCHEMA_VERSION === 10, `schemaVersion is the current STATE_SCHEMA_VERSION, 10 (got ${state.schemaVersion})`);

  const keys = [...state.quotientByTeamId.keys()].sort();
  const expectedKeys = teams.map((t) => t.id).sort();
  assert(JSON.stringify(keys) === JSON.stringify(expectedKeys), 'quotientByTeamId has exactly the 50 real team ids as keys, no more or fewer');
}

console.log('\n=== 7. Real multi-season wiring: decay genuinely applied ===\n');
{
  const state1 = computeFreshSeason1State();
  const state2 = advanceToNextSeason(state1);

  let expectedWithDecay = decayQuotientsForNewSeason(state1.quotientByTeamId);
  expectedWithDecay = foldRegularSeasonResults(expectedWithDecay, state2.seasonResult.results);
  expectedWithDecay = foldPlayoffResult(expectedWithDecay, state2.playoffResult);
  assert(sortedEntriesJson(state2.quotientByTeamId) === sortedEntriesJson(expectedWithDecay), 'season 2\'s real wiring matches an independently-recomputed decay+fold expectation exactly');

  let noDecayAlternative = foldRegularSeasonResults(state1.quotientByTeamId, state2.seasonResult.results);
  noDecayAlternative = foldPlayoffResult(noDecayAlternative, state2.playoffResult);
  assert(sortedEntriesJson(state2.quotientByTeamId) !== sortedEntriesJson(noDecayAlternative), 'skipping decay would have produced a DIFFERENT result — proving decay is a real, non-no-op step in the wired pipeline');

  assert([...state2.quotientByTeamId.values()].every((v) => v >= QUOTIENT_FLOOR && v <= QUOTIENT_CEILING), 'every value stays within [20, 100] after a real season transition');

  const keys1 = [...state1.quotientByTeamId.keys()].sort();
  const keys2 = [...state2.quotientByTeamId.keys()].sort();
  assert(JSON.stringify(keys1) === JSON.stringify(keys2), 'the same 50 team ids persist across a season transition — nothing added or dropped');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
