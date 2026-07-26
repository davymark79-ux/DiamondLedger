// Re-runnable sanity check for The Ledger Cup — Phase 3 of "The Ledger Cup"
// build arc, Group Stage half (engine/ledgerCup.js + engine/season.js's
// createSeasonState/simulateGamesIntoState split): `npm run validate:cup`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.

import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';
import {
  drawCupGroups,
  buildCupGroupStageWeekends,
  buildCupGroupStandings,
  computeCupAdvancement,
  simulateSeasonWithCup,
  GROUP_STAGE_GAMES_PER_TEAM,
} from '../src/engine/ledgerCup.js';
import { createSeasonState, simulateGamesIntoState } from '../src/engine/season.js';
import { createInitialQuotientByTeamId, foldResultsArray, K_CONTEXT, QUOTIENT_CENTER } from '../src/engine/tournamentQuotient.js';
import { createRng } from '../src/models/generation/random.js';
import { TIERS, LEAGUE_IDS } from '../src/models/constants.js';
import { computeFreshSeason1State, advanceToNextSeason, applyLiveOverrides } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

console.log('=== 1. drawCupGroups: league-balance constraint on the real 50-team pool ===\n');
{
  const quotient = createInitialQuotientByTeamId(teams.map((t) => t.id));
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  let allValid = true;
  let uniqueOk = true;

  for (const seed of [1, 2, 3, 7, 42, 99, 1000, 12345]) {
    const rng = createRng(seed);
    const { groups } = drawCupGroups(teams, quotient, rng);
    if (groups.length !== 10) allValid = false;
    const allIds = groups.flat();
    if (new Set(allIds).size !== 50) uniqueOk = false;

    for (const group of groups) {
      const mlb1 = group.filter((id) => teamsById.get(id).tier === TIERS.MLB1);
      const mlb2 = group.filter((id) => teamsById.get(id).tier === TIERS.MLB2);
      if (mlb1.length !== 3 || mlb2.length !== 2) allValid = false;
      if (new Set(mlb1.map((id) => teamsById.get(id).leagueId)).size < 2) allValid = false;
      const mlb2Leagues = mlb2.map((id) => teamsById.get(id).leagueId).sort();
      if (JSON.stringify(mlb2Leagues) !== JSON.stringify([LEAGUE_IDS.EXCHANGE, LEAGUE_IDS.FOUNDRY])) allValid = false;
    }
  }
  assert(allValid, '8 different seeds: every group is exactly 3 MLB1 + 2 MLB2, MLB1 slots include >=1 Foundry + >=1 Exchange, MLB2 slots are exactly 1 Foundry + 1 Exchange');
  assert(uniqueOk, 'every draw covers all 50 real teams exactly once (no duplicates, no omissions)');
}

console.log('\n=== 2. Group-stage scheduling: 12 games/team, 3 clean weekends ===\n');
{
  const rng = createRng(42);
  const quotient = createInitialQuotientByTeamId(teams.map((t) => t.id));
  const { groups } = drawCupGroups(teams, quotient, rng);
  const { weekends } = buildCupGroupStageWeekends(teams, groups, rng);

  assert(weekends.length === 3, `exactly 3 weekends (got ${weekends.length})`);
  assert(weekends.every((w) => w.length === 100), `every weekend has 100 games — 10 groups x C(5,2) (got ${weekends.map((w) => w.length).join(', ')})`);

  const gameCountByTeamId = new Map();
  const groupByTeamId = new Map();
  groups.forEach((group, groupIndex) => group.forEach((id) => groupByTeamId.set(id, groupIndex)));
  let noSelfPlay = true;
  let staysInGroup = true;
  for (const weekend of weekends) {
    for (const game of weekend) {
      gameCountByTeamId.set(game.awayTeamId, (gameCountByTeamId.get(game.awayTeamId) ?? 0) + 1);
      gameCountByTeamId.set(game.homeTeamId, (gameCountByTeamId.get(game.homeTeamId) ?? 0) + 1);
      if (game.awayTeamId === game.homeTeamId) noSelfPlay = false;
      if (groupByTeamId.get(game.awayTeamId) !== groupByTeamId.get(game.homeTeamId)) staysInGroup = false;
    }
  }
  assert(noSelfPlay, 'no team is ever scheduled to play itself');
  assert(staysInGroup, 'every game is between two teams in the SAME group');
  assert(gameCountByTeamId.size === 50, `all 50 teams appear in the schedule (got ${gameCountByTeamId.size})`);
  assert(
    [...gameCountByTeamId.values()].every((c) => c === GROUP_STAGE_GAMES_PER_TEAM),
    `every team plays exactly ${GROUP_STAGE_GAMES_PER_TEAM} group-stage games (zero remainder)`
  );
}

console.log('\n=== 3. computeCupAdvancement: top-2 + best-4-thirds on a hand-built fixture ===\n');
{
  // 2 groups of 5, hand-picked win totals so the "who's 1st/2nd/3rd" rank
  // within EACH group is unambiguous by construction. computeCupAdvancement
  // itself always takes the best 4 of however many 3rd-place candidates
  // exist (2 here, since only 2 groups) — production always draws exactly
  // 10 groups (10 real candidates), so the "best 4 thirds across 10 groups"
  // rule itself is exercised by the second, full-size fixture below; this
  // one only checks the per-group top-2/3rd-place RANKING is correct.
  const groups = [
    ['a1', 'a2', 'a3', 'a4', 'a5'],
    ['b1', 'b2', 'b3', 'b4', 'b5'],
  ];
  const standingsById = new Map([
    ['a1', { wins: 10, losses: 2, runsFor: 50, runsAgainst: 20 }], // group A: 1st
    ['a2', { wins: 8, losses: 4, runsFor: 40, runsAgainst: 30 }], // group A: 2nd
    ['a3', { wins: 6, losses: 6, runsFor: 30, runsAgainst: 30 }], // group A: 3rd (weaker 3rd)
    ['a4', { wins: 4, losses: 8, runsFor: 20, runsAgainst: 40 }],
    ['a5', { wins: 2, losses: 10, runsFor: 10, runsAgainst: 50 }],
    ['b1', { wins: 9, losses: 3, runsFor: 45, runsAgainst: 25 }], // group B: 1st
    ['b2', { wins: 7, losses: 5, runsFor: 35, runsAgainst: 30 }], // group B: 2nd
    ['b3', { wins: 7, losses: 5, runsFor: 20, runsAgainst: 15 }], // group B: 3rd (same W-L as b2, but placed 3rd on run diff), stronger 3rd than a3
    ['b4', { wins: 3, losses: 9, runsFor: 15, runsAgainst: 45 }],
    ['b5', { wins: 1, losses: 11, runsFor: 5, runsAgainst: 55 }],
  ]);
  const { advancingTeamIds } = computeCupAdvancement(groups, standingsById);
  assert(advancingTeamIds.length === 6, `2-group fixture: 2x top-2 (4) plus both 3rd-place teams (2, since only 2 candidates exist) = 6 — got ${advancingTeamIds.length}`);
  assert(['a1', 'a2', 'b1', 'b2'].every((id) => advancingTeamIds.includes(id)), 'every top-2 finisher is included');
  assert(['a3', 'b3'].every((id) => advancingTeamIds.includes(id)), 'both 3rd-place teams are included when only 2 groups (hence 2 candidates) exist');

  // A full 10-group fixture, needed to actually exercise the real "best 4
  // thirds across 10 groups" cutoff — 9 filler groups with a deliberately
  // weak 3rd place, plus group B from above (whose 3rd-place b3 is a
  // genuinely strong 7-5 record) as the 10th group.
  const tenGroups = [];
  const tenStandings = new Map();
  for (let g = 0; g < 9; g++) {
    const ids = [`f${g}-1`, `f${g}-2`, `f${g}-3`, `f${g}-4`, `f${g}-5`];
    tenGroups.push(ids);
    tenStandings.set(ids[0], { wins: 10, losses: 2, runsFor: 50, runsAgainst: 20 });
    tenStandings.set(ids[1], { wins: 8, losses: 4, runsFor: 40, runsAgainst: 30 });
    tenStandings.set(ids[2], { wins: 5, losses: 7, runsFor: 25, runsAgainst: 35 }); // a deliberately mediocre 3rd
    tenStandings.set(ids[3], { wins: 3, losses: 9, runsFor: 20, runsAgainst: 40 });
    tenStandings.set(ids[4], { wins: 1, losses: 11, runsFor: 10, runsAgainst: 50 });
  }
  tenGroups.push(groups[1]); // group B from above — b3 (7-5, strong run diff) is a much better 3rd
  for (const [id, s] of standingsById) if (id.startsWith('b')) tenStandings.set(id, s);

  const { advancingTeamIds: tenAdvancing } = computeCupAdvancement(tenGroups, tenStandings);
  assert(tenAdvancing.length === 24, `10-group fixture: exactly 24 advance (got ${tenAdvancing.length})`);
  assert(tenAdvancing.includes('b3'), 'the genuinely strong 3rd-place team (b3, 7-5 with a big positive run differential) makes the best-4-thirds cut');
  const includedFillerThirds = tenAdvancing.filter((id) => id.endsWith('-3') && id.startsWith('f'));
  assert(includedFillerThirds.length === 3, `exactly 3 of the 9 mediocre filler 3rd-place teams also make the cut (4 total minus b3) — got ${includedFillerThirds.length}`);
}

console.log('\n=== 4. Quotient folding: Cup group games use CUP_GROUP_STAGE, not REGULAR_SEASON ===\n');
{
  const cupResults = [
    { gameNumber: 0, awayTeamId: 'x', homeTeamId: 'y', awayRuns: 5, homeRuns: 2 },
    { gameNumber: 1, awayTeamId: 'x', homeTeamId: 'y', awayRuns: 3, homeRuns: 6 },
  ];
  const base = new Map([['x', QUOTIENT_CENTER], ['y', QUOTIENT_CENTER]]);
  const asRegular = foldResultsArray(base, cupResults, K_CONTEXT.REGULAR_SEASON);
  const asCupGroup = foldResultsArray(base, cupResults, K_CONTEXT.CUP_GROUP_STAGE);

  assert(K_CONTEXT.CUP_GROUP_STAGE > K_CONTEXT.REGULAR_SEASON, 'sanity: CUP_GROUP_STAGE weighs more than REGULAR_SEASON (per tournament-quotient.md)');
  assert(asCupGroup.get('x') !== asRegular.get('x'), 'the SAME two-game result folded at CUP_GROUP_STAGE produces a genuinely different rating than at REGULAR_SEASON');
  assert(
    Math.abs(asCupGroup.get('x') - QUOTIENT_CENTER) > Math.abs(asRegular.get('x') - QUOTIENT_CENTER) - 1e-9,
    'the higher K_context (CUP_GROUP_STAGE) moves the rating at least as far from center as REGULAR_SEASON would for the same net result'
  );
}

console.log('\n=== 5. State continuity: injuries/fatigue/streaks carried across a Cup weekend, not reset ===\n');
{
  const teamA = teams[0];
  const teamB = teams.find((t) => t.leagueId === teamA.leagueId && t.id !== teamA.id);
  const seasonState = createSeasonState(teams, getTeamManager);
  const cupRotationIndexById = new Map(teams.map((t) => [t.id, 0]));

  function miniBatch(n, gameNumberOffset) {
    return Array.from({ length: n }, (_, i) => ({
      gameNumber: gameNumberOffset + i,
      awayTeamId: i % 2 === 0 ? teamA.id : teamB.id,
      homeTeamId: i % 2 === 0 ? teamB.id : teamA.id,
    }));
  }

  const samplePlayer = getTeamRoster(teamA.id).lineup[0];
  const rng = createRng(11);

  simulateGamesIntoState(seasonState, teams, getTeamRoster, miniBatch(3, 0), rng); // "regular season, week 1"
  const afterWeek1 = seasonState.consecutiveGamesPlayedById.get(samplePlayer.id) ?? 0;
  const standingsAfterWeek1 = new Map([...seasonState.standingsById].map(([id, s]) => [id, { ...s }]));
  const resultsLengthAfterWeek1 = seasonState.results.length;
  const battingStatsRefAfterWeek1 = seasonState.seasonBattingStatsById.get(samplePlayer.id);

  simulateGamesIntoState(seasonState, teams, getTeamRoster, miniBatch(4, 0), rng, {
    trackStandings: false,
    trackManagerLifecycle: false,
    trackSeasonStats: false,
    rotationIndexById: cupRotationIndexById,
  }); // "a Cup group-stage weekend"
  const afterCupWeekend = seasonState.consecutiveGamesPlayedById.get(samplePlayer.id) ?? 0;

  assert(afterCupWeekend > afterWeek1, `fatigue keeps accumulating through a Cup weekend, not reset (week1=${afterWeek1}, afterCup=${afterCupWeekend})`);
  assert(seasonState.results.length === resultsLengthAfterWeek1, 'Cup games are NOT appended to the season\'s canonical results log (trackStandings: false)');
  const standingsUnchanged = [...standingsAfterWeek1].every(([id, s]) => JSON.stringify(seasonState.standingsById.get(id)) === JSON.stringify(s));
  assert(standingsUnchanged, `every team's regular-season standing (including ${teamA.id}/${teamB.id}, the two teams that actually played the Cup weekend) is unchanged by it — trackStandings: false`);
  assert(
    JSON.stringify(seasonState.seasonBattingStatsById.get(samplePlayer.id)) === JSON.stringify(battingStatsRefAfterWeek1),
    'season batting stats are unchanged by the Cup weekend (trackSeasonStats: false)'
  );

  simulateGamesIntoState(seasonState, teams, getTeamRoster, miniBatch(2, 10), rng); // "regular season, week 2 — resuming after the Cup weekend"
  const afterWeek2 = seasonState.consecutiveGamesPlayedById.get(samplePlayer.id) ?? 0;
  assert(afterWeek2 > afterCupWeekend, `fatigue continues accumulating in the FOLLOWING regular-season week, picking up from where the Cup weekend left off (afterCup=${afterCupWeekend}, afterWeek2=${afterWeek2})`);
  assert(seasonState.results.length > resultsLengthAfterWeek1, 'the resumed regular-season batch IS appended to the canonical results log again (trackStandings defaults back to true)');
}

console.log('\n=== 6. simulateSeasonWithCup: no-Cup path is byte-identical to the pre-Cup baseline ===\n');
{
  // engine/leagueProgression.js's simulateOneSeason is the pre-Cup baseline
  // this must degrade to exactly when cupGroups is null — imported directly
  // here (rather than through data/season.js, which no longer calls it)
  // purely to prove the equivalence.
  const rng1 = createRng(7);
  const scheduleModule = await import('../src/engine/leagueProgression.js');
  const baseline = scheduleModule.simulateOneSeason(teams, getTeamRoster, getTeamManager, rng1, 150);

  const rng2 = createRng(7);
  const withCupModule = await import('../src/engine/ledgerCup.js');
  const noCup = withCupModule.simulateSeasonWithCup(teams, getTeamRoster, getTeamManager, rng2, null, 150);

  assert(JSON.stringify(baseline.seasonResult.results) === JSON.stringify(noCup.seasonResult.results), 'results are byte-identical between simulateOneSeason and simulateSeasonWithCup(..., null)');
  assert(noCup.cupGroupResults === null, 'cupGroupResults is null when no Cup group draw is active');
}

console.log('\n=== 7. Real data/season.js wiring: season 1 has no Cup, season 2 runs a real group stage ===\n');
{
  assert(computeFreshSeason1State().cupState.phase === 'NONE', 'season 1 cupState.phase is NONE (no Quotient history to draw pots from yet)');

  const season2 = advanceToNextSeason(computeFreshSeason1State());
  assert(season2.cupState.phase === 'GROUP_STAGE', `season 2 runs a real group stage (got phase=${season2.cupState.phase})`);
  assert(season2.cupState.groups.length === 10, '10 groups persisted in cupState');
  assert(season2.cupState.cupGroupStandingsById.size === 50, 'all 50 teams have real Cup group standings persisted');
  assert(season2.cupState.advancingTeamIds.length === 24 && new Set(season2.cupState.advancingTeamIds).size === 24, '24 distinct advancing teams persisted');

  const liveTeams = applyLiveOverrides(teams, season2.tierByTeamId, season2.divisionByTeamId);
  const teamsById = new Map(liveTeams.map((t) => [t.id, t]));
  const compositionOk = season2.cupState.groups.every((group) => {
    const mlb1 = group.filter((id) => teamsById.get(id).tier === TIERS.MLB1);
    const mlb2 = group.filter((id) => teamsById.get(id).tier === TIERS.MLB2);
    return mlb1.length === 3 && mlb2.length === 2;
  });
  assert(compositionOk, 'every persisted group is 3 MLB1 + 2 MLB2 against season 2\'s OWN live (post-promotion/relegation) tiers');

  assert(season2.quotientByTeamId.size === 50, 'quotientByTeamId still has exactly 50 entries after a Cup-active season (regular season + Cup group folds, no drift)');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
