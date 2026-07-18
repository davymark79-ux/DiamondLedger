// Re-runnable sanity check for Hot/Cold Streaks (engine/hotColdStreaks.js +
// engine/season.js's cross-game persistence): `npm run validate:streaks`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { resolvePlateAppearance } from '../src/engine/plateAppearance.js';
import { tallyOutcomes } from '../src/engine/statLine.js';
import { computeBaselineDistribution, compositeValueFromCounts, classifyStreakTier, updateStreakState } from '../src/engine/hotColdStreaks.js';
import { HOT_COLD_TIERS } from '../src/models/constants.js';
import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason, TARGET_GAMES_PER_TEAM } from '../src/engine/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const NEUTRAL = {
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  baserunningInstincts: createRating(50), workEthic: createRating(50), consistency: createRating(50), coachability: createRating(50),
};

function makeBatter(id, { contact = 50, power = 50, eye = 50, speed = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: 'CF', birthdate: '1996-01-01',
    ratings: { contact: createRating(contact), power: createRating(power), eye: createRating(eye), speed: createRating(speed), durability: createRating(50), ...NEUTRAL },
  });
}

function makePitcher(id, { velocity = 50, control = 50, movement = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Pitcher', lastName: id, primaryPosition: 'SP', isPitcher: true, birthdate: '1996-01-01',
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50),
      velocity: createRating(velocity), control: createRating(control), movement: createRating(movement),
      stamina: createRating(50), pitchability: createRating(50), durability: createRating(50), ...NEUTRAL,
    },
  });
}

function simulateGameLine(batter, pitcher, paCount, rng) {
  const outcomes = Array.from({ length: paCount }, () => resolvePlateAppearance(batter, pitcher, rng));
  const counts = tallyOutcomes(outcomes);
  const h = counts.singles + counts.doubles + counts.triples + counts.homeRuns;
  return { pa: counts.plateAppearances, h, doubles: counts.doubles, triples: counts.triples, hr: counts.homeRuns, bb: counts.walks, hbp: counts.hitByPitch };
}

console.log('=== 1. wOBA weight ordering (via compositeValueFromCounts) ===\n');
const walkOnly = compositeValueFromCounts({ h: 0, doubles: 0, triples: 0, hr: 0, bb: 1, hbp: 0 });
const hbpOnly = compositeValueFromCounts({ h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 1 });
const singleOnly = compositeValueFromCounts({ h: 1, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 });
const doubleOnly = compositeValueFromCounts({ h: 1, doubles: 1, triples: 0, hr: 0, bb: 0, hbp: 0 });
const tripleOnly = compositeValueFromCounts({ h: 1, doubles: 0, triples: 1, hr: 0, bb: 0, hbp: 0 });
const hrOnly = compositeValueFromCounts({ h: 1, doubles: 0, triples: 0, hr: 1, bb: 0, hbp: 0 });
const outOnly = compositeValueFromCounts({ h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 });
assert(outOnly === 0, 'an out (no hit/walk/hbp) contributes 0 composite value');
assert(walkOnly > 0 && hbpOnly > 0, 'a walk and an HBP both carry positive weight');
assert(singleOnly < doubleOnly && doubleOnly < tripleOnly && tripleOnly < hrOnly, 'weight climbs single < double < triple < home run');
assert(walkOnly < singleOnly, 'a walk is weighted below a single');

console.log('\n=== 2. Baseline direction ===\n');
const eliteBatter = makeBatter('elite', { contact: 70, power: 70, eye: 70 });
const weakBatter = makeBatter('weak', { contact: 30, power: 30, eye: 30 });
const eliteBaseline = computeBaselineDistribution(eliteBatter);
const weakBaseline = computeBaselineDistribution(weakBatter);
console.log(`  Elite baseline mean: ${eliteBaseline.mean.toFixed(4)}, weak baseline mean: ${weakBaseline.mean.toFixed(4)}`);
assert(eliteBaseline.mean > weakBaseline.mean, 'a higher-rated batter has a higher context-neutral baseline composite');
assert(eliteBaseline.variance > 0 && weakBaseline.variance > 0, 'baseline variance is positive for both');

console.log('\n=== 3. classifyStreakTier boundaries ===\n');
assert(classifyStreakTier(-3) === HOT_COLD_TIERS.ICE_COLD, 'far below -2.0 SD classifies Ice Cold');
assert(classifyStreakTier(-2.0) === HOT_COLD_TIERS.ICE_COLD, '-2.0 SD exactly classifies Ice Cold (boundary inclusive)');
assert(classifyStreakTier(-1.0) === HOT_COLD_TIERS.COLD, '-1.0 SD classifies Cold');
assert(classifyStreakTier(-0.75) === HOT_COLD_TIERS.COLD, '-0.75 SD exactly classifies Cold (boundary inclusive)');
assert(classifyStreakTier(0) === HOT_COLD_TIERS.NEUTRAL, '0 SD classifies Neutral');
assert(classifyStreakTier(0.75) === HOT_COLD_TIERS.NEUTRAL, '0.75 SD exactly classifies Neutral (boundary inclusive)');
assert(classifyStreakTier(1.0) === HOT_COLD_TIERS.HOT, '1.0 SD classifies Hot');
assert(classifyStreakTier(2.0) === HOT_COLD_TIERS.HOT, '2.0 SD exactly classifies Hot (boundary inclusive)');
assert(classifyStreakTier(3.0) === HOT_COLD_TIERS.ON_FIRE, '3.0 SD classifies On Fire');

console.log('\n=== 4. Sample-size gate (2-game small-sample burst stays unconfirmed) ===\n');
const avgBatter = makeBatter('avg');
let accumulator;
let state;
({ accumulator, streakState: state } = updateStreakState(accumulator, { pa: 4, h: 4, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 }, avgBatter)); // 4-for-4
({ accumulator, streakState: state } = updateStreakState(accumulator, { pa: 4, h: 1, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 }, avgBatter)); // 1-for-4 -> 5-for-8 total
console.log(`  After 5-for-8 over 2 games: SD=${state.standardDeviationsFromBaseline.toFixed(2)}, tier=${state.tier}, effective PA=${accumulator.effectivePa.toFixed(1)}`);
assert(state.tier === HOT_COLD_TIERS.NEUTRAL, 'a 2-game/8-PA burst stays NEUTRAL (unconfirmed) despite an extreme raw SD');

console.log('\n=== 5. Confirms and persists (no fixed cutoff) ===\n');
for (let i = 0; i < 3; i++) {
  ({ accumulator, streakState: state } = updateStreakState(accumulator, { pa: 4, h: 4, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 }, avgBatter));
}
console.log(`  After 5 straight 4-for-4 games (20 PA): SD=${state.standardDeviationsFromBaseline.toFixed(2)}, tier=${state.tier}, effective PA=${accumulator.effectivePa.toFixed(1)}`);
assert(accumulator.effectivePa >= 16, 'effective sample size has cleared the confirmation gate');
assert(state.tier === HOT_COLD_TIERS.HOT || state.tier === HOT_COLD_TIERS.ON_FIRE, 'a sustained 4-for-4 stretch confirms a Hot-or-better streak');
for (let i = 0; i < 3; i++) {
  ({ accumulator, streakState: state } = updateStreakState(accumulator, { pa: 4, h: 4, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0 }, avgBatter));
}
console.log(`  After 8 straight 4-for-4 games: SD=${state.standardDeviationsFromBaseline.toFixed(2)}, tier=${state.tier}, effective PA=${accumulator.effectivePa.toFixed(1)}`);
assert(state.tier === HOT_COLD_TIERS.HOT || state.tier === HOT_COLD_TIERS.ON_FIRE, 'the streak is still confirmed after many more strong games — it does not expire on its own just from elapsed games');

console.log('\n=== 6. Reverts to Neutral within a believable span, not an enormous one ===\n');
const regressionRng = createRng(42);
const neutralPitcherForBatter = makePitcher('neutral-opp');
let revertedWithinAMonth = false;
const MONTH_OF_GAMES = 28;
for (let i = 0; i < MONTH_OF_GAMES; i++) {
  const gameLine = simulateGameLine(avgBatter, neutralPitcherForBatter, 4, regressionRng);
  ({ accumulator, streakState: state } = updateStreakState(accumulator, gameLine, avgBatter));
  if (state.tier === HOT_COLD_TIERS.NEUTRAL) revertedWithinAMonth = true;
}
console.log(`  Reverted to Neutral within ${MONTH_OF_GAMES} average games after the hot stretch: ${revertedWithinAMonth} (final tier=${state.tier}, SD=${state.standardDeviationsFromBaseline.toFixed(2)})`);
assert(revertedWithinAMonth, 'feeding a believable "month of average games" (28) after a confirmed streak reverts the reading to Neutral — the decaying accumulator forgets old evidence at a believable pace, unlike a flat cumulative sum');

console.log('\n=== 7. Wired into a real simulated season ===\n');
const rng = createRng(13);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
const { streakStateById } = simulateSeason(teams, getTeamRoster, schedule, rng);

let sawNonNeutral = false;
let sawMalformed = false;
for (const state of streakStateById.values()) {
  if (state.tier !== HOT_COLD_TIERS.NEUTRAL) sawNonNeutral = true;
  if (!Number.isFinite(state.standardDeviationsFromBaseline) || !Number.isFinite(state.baselineCompositeValue)) sawMalformed = true;
}
console.log(`  Players tracked: ${streakStateById.size}`);
assert(sawNonNeutral, 'at least one player reads a confirmed non-Neutral tier over a full season');
assert(!sawMalformed, 'no player has a NaN/non-finite streak reading');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
