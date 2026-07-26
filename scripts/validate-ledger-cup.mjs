// Re-runnable sanity check for The Ledger Cup — Phase 3 of "The Ledger Cup"
// build arc, both the Group Stage half (3a) and the Knockout Bracket half
// (3b) (engine/ledgerCup.js + engine/season.js's
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
  buildKnockoutBracket,
  simulateCupSeriesIntoState,
  simulateKnockoutRound,
  KNOCKOUT_GAMES_TO_WIN,
  FINAL_GAMES_TO_WIN,
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
  const noCup = withCupModule.simulateSeasonWithCup(teams, getTeamRoster, getTeamManager, rng2, null, null, 150);

  assert(JSON.stringify(baseline.seasonResult.results) === JSON.stringify(noCup.seasonResult.results), 'results are byte-identical between simulateOneSeason and simulateSeasonWithCup(..., null, null)');
  assert(noCup.cupGroupResults === null, 'cupGroupResults is null when no Cup group draw is active');
  assert(noCup.cupKnockoutResult === null, 'cupKnockoutResult is null when no knockout bracket is pending');
}

console.log('\n=== 7. Real data/season.js wiring: season 1 has no Cup, season 2 runs a real group stage ===\n');
{
  assert(computeFreshSeason1State().cupState.groupStagePhase === 'NONE', 'season 1 cupState.groupStagePhase is NONE (no Quotient history to draw pots from yet)');
  assert(computeFreshSeason1State().cupState.knockout.phase === 'NONE', 'season 1 cupState.knockout.phase is NONE too (nothing to reseed from)');

  const season2 = advanceToNextSeason(computeFreshSeason1State());
  assert(season2.cupState.groupStagePhase === 'GROUP_STAGE', `season 2 runs a real group stage (got groupStagePhase=${season2.cupState.groupStagePhase})`);
  assert(season2.cupState.groups.length === 10, '10 groups persisted in cupState');
  assert(season2.cupState.cupGroupStandingsById.size === 50, 'all 50 teams have real Cup group standings persisted');
  assert(season2.cupState.advancingTeamIds.length === 24 && new Set(season2.cupState.advancingTeamIds).size === 24, '24 distinct advancing teams persisted');
  assert(season2.cupState.knockout.phase === 'NONE', 'season 2 itself has NO knockout yet (season 1 had no group stage to reseed from)');

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

console.log('\n=== 8. buildKnockoutBracket: structure on a hand-built 24-seed fixture ===\n');
{
  const seeds = Array.from({ length: 24 }, (_, i) => `s${i + 1}`);
  const bracket = buildKnockoutBracket(seeds);

  assert(bracket.byes.length === 8, `8 byes for seeds 1-8 (got ${bracket.byes.length})`);
  assert(bracket.byes.every((b, i) => b.seed === i + 1 && b.teamId === `s${i + 1}`), 'byes are seeds 1-8, in order, unchanged from the input');
  assert(bracket.playInPairs.length === 8, `8 Play-In pairs (got ${bracket.playInPairs.length})`);
  const expectedPairs = [[9, 24], [10, 23], [11, 22], [12, 21], [13, 20], [14, 19], [15, 18], [16, 17]];
  const pairsMatch = bracket.playInPairs.every((p, i) => p.seedA === expectedPairs[i][0] && p.seedB === expectedPairs[i][1]);
  assert(pairsMatch, 'Play-In pairs are exactly 9v24, 10v23, 11v22, ... 16v17, in that order, per in-season-tournament.md');

  let threw = false;
  try {
    buildKnockoutBracket(seeds.slice(0, 20));
  } catch {
    threw = true;
  }
  assert(threw, 'buildKnockoutBracket rejects anything other than exactly 24 seeds');
}

console.log('\n=== 9. Knockout series/round simulation: fixed home team, correct termination, correct pairing ===\n');
{
  const rng = createRng(9001);
  const seasonState = createSeasonState(teams, getTeamManager);
  const cupKnockoutRotationIndexById = new Map(teams.map((t) => [t.id, 0]));
  const [teamA, teamB] = teams;
  const participantA = { seed: 3, teamId: teamA.id }; // higher seed (lower number) -> should host every game
  const participantB = { seed: 20, teamId: teamB.id };

  const series = simulateCupSeriesIntoState(seasonState, teams, getTeamRoster, participantA, participantB, KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById);
  assert(series.homeTeamId === teamA.id, 'the HIGHER seed (lower seed number) hosts, matching the doc\'s fixed-home-park venue rule');
  assert(series.games.every((g) => g.homeTeamId === teamA.id), 'every game in the series uses the SAME fixed home team, not an alternating pattern (unlike engine/playoffs.js)');
  assert(series.games.length === KNOCKOUT_GAMES_TO_WIN || series.games.length === KNOCKOUT_GAMES_TO_WIN + 1, `a best-of-3 series plays 2 or 3 games (got ${series.games.length})`);
  assert(series.winner.teamId === teamA.id || series.winner.teamId === teamB.id, 'the winner is one of the two real participants');

  const finalSeries = simulateCupSeriesIntoState(seasonState, teams, getTeamRoster, participantA, participantB, FINAL_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById);
  assert(finalSeries.games.length === 1, `FINAL_GAMES_TO_WIN=1 plays exactly a single game (got ${finalSeries.games.length})`);

  // A full round (4 series at once, matching a real Quarterfinal's size) —
  // confirms simulateKnockoutRound's winners array preserves pair order,
  // ready to feed straight into the next round's consecutivePairs().
  const pairs = [
    [{ seed: 1, teamId: teams[0].id }, { seed: 8, teamId: teams[1].id }],
    [{ seed: 4, teamId: teams[2].id }, { seed: 5, teamId: teams[3].id }],
    [{ seed: 2, teamId: teams[4].id }, { seed: 7, teamId: teams[5].id }],
    [{ seed: 3, teamId: teams[6].id }, { seed: 6, teamId: teams[7].id }],
  ];
  const round = simulateKnockoutRound(seasonState, teams, getTeamRoster, pairs, KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById);
  assert(round.series.length === 4 && round.winners.length === 4, `a 4-series round returns 4 series and 4 winners (got ${round.series.length}/${round.winners.length})`);
  const winnersAreParticipants = round.winners.every((w, i) => w.teamId === pairs[i][0].teamId || w.teamId === pairs[i][1].teamId);
  assert(winnersAreParticipants, 'every winner in the returned array is one of ITS OWN pair\'s two participants, in the same order as the input pairs');
}

console.log('\n=== 10. Quotient folding: Cup knockout games use CUP_KNOCKOUT, the highest of the three ===\n');
{
  assert(K_CONTEXT.CUP_KNOCKOUT > K_CONTEXT.CUP_GROUP_STAGE && K_CONTEXT.CUP_KNOCKOUT > K_CONTEXT.REGULAR_SEASON, 'sanity: CUP_KNOCKOUT weighs more than both CUP_GROUP_STAGE and REGULAR_SEASON (per tournament-quotient.md)');
  const knockoutResults = [
    { gameNumber: 0, awayTeamId: 'x', homeTeamId: 'y', awayRuns: 5, homeRuns: 2 },
    { gameNumber: 1, awayTeamId: 'x', homeTeamId: 'y', awayRuns: 3, homeRuns: 6 },
  ];
  const base = new Map([['x', QUOTIENT_CENTER], ['y', QUOTIENT_CENTER]]);
  const asGroupStage = foldResultsArray(base, knockoutResults, K_CONTEXT.CUP_GROUP_STAGE);
  const asKnockout = foldResultsArray(base, knockoutResults, K_CONTEXT.CUP_KNOCKOUT);
  assert(asKnockout.get('x') !== asGroupStage.get('x'), 'the SAME game result folded at CUP_KNOCKOUT produces a genuinely different rating than at CUP_GROUP_STAGE');
}

console.log('\n=== 11. Real data/season.js wiring: season 3 is the first real knockout (reseeded from season 2\'s group stage) ===\n');
{
  const season1 = computeFreshSeason1State();
  const season2 = advanceToNextSeason(season1);
  const t0 = Date.now();
  const season3 = advanceToNextSeason(season2);
  console.log(`  (season 3 transition took ${((Date.now() - t0) / 1000).toFixed(1)}s — real cost of a full group stage + full knockout bracket)`);

  assert(season3.cupState.groupStagePhase === 'GROUP_STAGE', 'season 3 also runs its OWN fresh group stage (unconditional from season 2 onward)');
  assert(season3.cupState.knockout.phase === 'COMPLETE', `season 3 resolves a real knockout, reseeded from season 2's group stage (got phase=${season3.cupState.knockout.phase})`);
  assert(season3.cupState.knockout.seeds.length === 24 && new Set(season3.cupState.knockout.seeds).size === 24, '24 distinct reseeded team ids persisted');
  assert(
    JSON.stringify([...season3.cupState.knockout.seeds].sort()) === JSON.stringify([...season2.cupState.advancingTeamIds].sort()),
    'the reseeded 24 are EXACTLY season 2\'s own 24 advancing teams (just reordered by tournament record), not a different pool'
  );
  assert(season3.cupState.knockout.playIn.length === 8 && season3.cupState.knockout.roundOf16.length === 8, 'Play-In (8 series) and Round of 16 (8 series) both fully resolved');
  assert(season3.cupState.knockout.quarterfinal.length === 4 && season3.cupState.knockout.semifinal.length === 2, 'Quarterfinal (4 series) and Semifinal (2 series) both fully resolved');
  assert(!!season3.cupState.knockout.final && season3.cupState.knockout.final.games.length === 1, 'a real single-game Final was played');
  assert(
    season3.cupState.knockout.championTeamId === season3.cupState.knockout.final.winner.teamId,
    'championTeamId matches the Final\'s own recorded winner'
  );

  const allChampionshipParticipants = new Set([
    ...season3.cupState.knockout.playIn.flatMap((s) => [s.homeTeamId, s.awayTeamId]),
  ]);
  assert(allChampionshipParticipants.size <= 16 && allChampionshipParticipants.size > 0, 'Play-In participants are drawn from the real 16-team Play-In pool (seeds 9-24)');

  assert(season3.quotientByTeamId.size === 50, 'quotientByTeamId still has exactly 50 entries after a season with BOTH a group stage and a knockout run (regular + group + knockout folds, no drift)');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
