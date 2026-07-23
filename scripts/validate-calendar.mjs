// Re-runnable sanity check for the Week-Indexed Season Calendar —
// Phase 1 of "The Ledger Cup" build arc (engine/calendar.js):
// `npm run validate:calendar`. Same style as the other validate:* scripts
// — eyeball checks plus hard asserts on structural invariants.

import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason, TARGET_GAMES_PER_TEAM } from '../src/engine/season.js';
import { simulateOneSeason } from '../src/engine/leagueProgression.js';
import {
  buildSeasonWeekPlan,
  assignCalendarWeeks,
  buildCalendarSeasonSchedule,
  GAMES_PER_WEEK,
  OPEN_WEEKS_PER_HALF,
} from '../src/engine/calendar.js';
import { createRng } from '../src/models/generation/random.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

console.log('=== 1. buildSeasonWeekPlan({}): shape with zero blackout weeks ===\n');
{
  const plan = buildSeasonWeekPlan({});
  const expectedTotal = OPEN_WEEKS_PER_HALF * 2 + 1;
  assert(plan.weeks.length === expectedTotal, `total week count is ${OPEN_WEEKS_PER_HALF}*2 + 1 ASB = ${expectedTotal} (got ${plan.weeks.length})`);
  assert(plan.openWeekIndices.length === OPEN_WEEKS_PER_HALF * 2, `all ${OPEN_WEEKS_PER_HALF * 2} non-ASB weeks are OPEN (got ${plan.openWeekIndices.length})`);
  assert(plan.firstHalfBlackoutWeekIndices.length === 0 && plan.secondHalfBlackoutWeekIndices.length === 0, 'zero blackout weeks in either half');
  const asbWeek = plan.weeks[plan.allStarWeekIndex];
  assert(asbWeek.half === 'ASB' && asbWeek.kind === 'ALL_STAR', 'the All-Star week is its own half/kind, distinct from H1/H2');
  assert(plan.weeks.filter((w) => w.half === 'H1').length === OPEN_WEEKS_PER_HALF, `exactly ${OPEN_WEEKS_PER_HALF} H1 weeks`);
  assert(plan.weeks.filter((w) => w.half === 'H2').length === OPEN_WEEKS_PER_HALF, `exactly ${OPEN_WEEKS_PER_HALF} H2 weeks`);
  assert(plan.weeks.every((w, i) => w.index === i), 'week.index matches its array position for every week');
}

console.log('\n=== 2. buildSeasonWeekPlan: real Cup blackout counts (4 H1, 3 H2) ===\n');
{
  const plan = buildSeasonWeekPlan({ firstHalfBlackoutWeeks: 4, secondHalfBlackoutWeeks: 3 });
  assert(plan.firstHalfBlackoutWeekIndices.length === 4, `4 H1 blackout weeks (got ${plan.firstHalfBlackoutWeekIndices.length})`);
  assert(plan.secondHalfBlackoutWeekIndices.length === 3, `3 H2 blackout weeks (got ${plan.secondHalfBlackoutWeekIndices.length})`);
  assert(plan.openWeekIndices.length === OPEN_WEEKS_PER_HALF * 2, `open week count is unchanged by blackout weeks (still ${OPEN_WEEKS_PER_HALF * 2}) — blackout weeks are ADDED, not subtracted`);

  // H2's blackout weeks are front-loaded: the very first H2 weeks.
  const h2Weeks = plan.weeks.filter((w) => w.half === 'H2');
  const firstThreeH2Kinds = h2Weeks.slice(0, 3).map((w) => w.kind);
  assert(firstThreeH2Kinds.every((k) => k === 'BLACKOUT'), 'H2\'s 3 blackout weeks are front-loaded (the first 3 weeks of H2), not spread or backloaded');
  assert(h2Weeks.slice(3).every((w) => w.kind === 'OPEN'), 'the rest of H2 (after the front-loaded blackout weeks) is all OPEN');

  // H1's blackout weeks are spread roughly evenly, not clustered.
  const h1BlackoutPositions = plan.firstHalfBlackoutWeekIndices;
  const gaps = h1BlackoutPositions.slice(1).map((idx, i) => idx - h1BlackoutPositions[i]);
  const maxGap = Math.max(...gaps);
  const minGap = Math.min(...gaps);
  console.log(`  H1 blackout week indices: ${h1BlackoutPositions.join(', ')} (gaps: ${gaps.join(', ')})`);
  assert(maxGap - minGap <= 2, 'H1\'s blackout weeks are spread with roughly even gaps (not clustered together)');
}

console.log('\n=== 3. assignCalendarWeeks: structural guarantees on a real 50-team schedule ===\n');
{
  const rng = createRng(2026);
  const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
  const plan = buildSeasonWeekPlan({});
  const stamped = assignCalendarWeeks(schedule, plan);

  assert(stamped.length === schedule.length, 'assignCalendarWeeks never adds or drops games');
  const openWeekSet = new Set(plan.openWeekIndices);
  assert(stamped.every((g) => openWeekSet.has(g.week)), 'every game is stamped with a real OPEN week — never a blackout or All-Star week (structural guarantee: bucketing only ever indexes into openWeekIndices)');

  // Position-based bucketing (see assignCalendarWeeks's own header for why
  // — two earlier live-capacity-tracking approaches both hit real
  // cascading-overflow bugs) trivially guarantees this: week only ever
  // increases with array position, so any team's own games (a subsequence
  // of positions) can only see non-decreasing week values.
  const lastWeekByTeamId = new Map();
  let perTeamMonotonic = true;
  for (const game of stamped) {
    for (const teamId of [game.awayTeamId, game.homeTeamId]) {
      const last = lastWeekByTeamId.get(teamId) ?? -1;
      if (game.week < last) perTeamMonotonic = false;
      lastWeekByTeamId.set(teamId, game.week);
    }
  }
  assert(perTeamMonotonic, "each team's own sequence of games is monotonic non-decreasing in week number (never plays 'in the past')");

  // Not a hard per-team cap (position-based bucketing doesn't guarantee
  // one — see assignCalendarWeeks's header for why a hard-cap-guaranteeing
  // algorithm is a real graph-scheduling problem out of this phase's
  // scope) — a loose sanity bound instead, same "loose sanity bound, not
  // a tight guarantee" convention validate:steals/validate:bunt already
  // use for other approximate real-world-matching checks. GAMES_PER_WEEK
  // (6) is the target average; real per-team-per-week counts should stay
  // in a plausible band around it, not wildly blow past it.
  const gamesPerTeamPerWeek = new Map();
  for (const game of stamped) {
    for (const teamId of [game.awayTeamId, game.homeTeamId]) {
      const key = `${teamId}-${game.week}`;
      gamesPerTeamPerWeek.set(key, (gamesPerTeamPerWeek.get(key) ?? 0) + 1);
    }
  }
  const counts = [...gamesPerTeamPerWeek.values()];
  const maxPerTeamPerWeek = Math.max(...counts);
  const meanPerTeamPerWeek = counts.reduce((sum, c) => sum + c, 0) / counts.length;
  console.log(`  games/team/week — mean: ${meanPerTeamPerWeek.toFixed(2)}, max: ${maxPerTeamPerWeek} (target average: ${GAMES_PER_WEEK})`);
  assert(meanPerTeamPerWeek > GAMES_PER_WEEK * 0.5 && meanPerTeamPerWeek < GAMES_PER_WEEK * 1.5, 'mean games/team/week lands in a plausible band around the target average');
  assert(maxPerTeamPerWeek <= GAMES_PER_WEEK * 3, `no team's single-week game count wildly exceeds the target average (loose sanity bound: <= ${GAMES_PER_WEEK * 3})`);
}

console.log('\n=== 4. Regression: simulateOneSeason is a true no-op vs. the old direct buildSeasonSchedule+simulateSeason path ===\n');
{
  const seed = 4242;
  const rngA = createRng(seed);
  const rngB = createRng(seed);

  const { seasonResult: resultA, schedule: scheduleA } = simulateOneSeason(teams, getTeamRoster, () => null, rngA);

  const scheduleB = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rngB);
  const resultB = simulateSeason(teams, getTeamRoster, scheduleB, rngB, () => null);

  assert(scheduleA.length === scheduleB.length, 'both paths produce the same number of games');
  const gamesMatch = scheduleA.every((g, i) => g.awayTeamId === scheduleB[i].awayTeamId && g.homeTeamId === scheduleB[i].homeTeamId && g.gameNumber === scheduleB[i].gameNumber);
  assert(gamesMatch, 'the calendar-wrapped schedule is byte-identical to the direct schedule (same teams/order/gameNumber) — only the added `week` field differs');

  const standingsA = JSON.stringify([...resultA.standingsById.entries()].sort());
  const standingsB = JSON.stringify([...resultB.standingsById.entries()].sort());
  assert(standingsA === standingsB, 'final standings are identical between the calendar-wrapped path and the direct path (same rng seed)');

  assert(JSON.stringify(resultA.results) === JSON.stringify(resultB.results), 'the full game-by-game results array is identical between both paths');
  assert(resultA.results.length === resultB.results.length, `both paths simulate the same number of games (${resultA.results.length})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
