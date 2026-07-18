// Re-runnable sanity check for the Manager entity (models/Manager.js,
// models/generation/managerGenerator.js, engine/managerBehavior.js, and
// its wiring into pitchingChanges.js/stolenBases.js/bunting.js/
// fielding.js/hitterChanges.js): `npm run validate:managers`. Same style
// as the other validate:* scripts — eyeball checks plus hard asserts on
// structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createManager } from '../src/models/Manager.js';
import { createRng } from '../src/models/generation/random.js';
import { generateManager } from '../src/models/generation/managerGenerator.js';
import { MANAGER_SLIDER_NAMES, MANAGER_ATTRIBUTE_SCALE, MANAGER_ORIGINS, LEAGUE_IDS, HOT_COLD_TIERS } from '../src/models/constants.js';
import { resolveGameManagerState, perceiveStreakTier } from '../src/engine/managerBehavior.js';
import { shouldPullPitcher, selectNextPitcher } from '../src/engine/pitchingChanges.js';
import { computeStealAttemptProbability } from '../src/engine/stolenBases.js';
import { computeBuntAttemptProbability } from '../src/engine/bunting.js';
import { isNoDoublesActive, isInfieldInActive } from '../src/engine/fielding.js';
import { selectPinchHitter } from '../src/engine/hitterChanges.js';
import { computeManagerRetirementProbability, rollManagerRetirement } from '../src/engine/retirement.js';
import { simulateGame } from '../src/engine/game.js';
import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason } from '../src/engine/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const NEUTRAL_HITTER_RATINGS = {
  contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
  speed: createRating(50), baserunningInstincts: createRating(50),
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
};

function makeHitter(id, { bats = 'R', contactBonus = 0 } = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: 'CF', isPitcher: false, bats, throws: 'R',
    birthdate: '1996-01-01',
    ratings: {
      ...NEUTRAL_HITTER_RATINGS,
      contact: createRating(50 + contactBonus),
      power: createRating(50 + contactBonus),
      eye: createRating(50 + contactBonus),
    },
  });
}

function makePitcher(id, { throws = 'R' } = {}) {
  return createPlayer({
    id, firstName: 'Pitcher', lastName: id, primaryPosition: 'SP', isPitcher: true, throws, bats: 'R',
    birthdate: '1996-01-01',
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
      speed: createRating(50), baserunningInstincts: createRating(50),
      velocity: createRating(50), control: createRating(50), movement: createRating(50), stamina: createRating(50), pitchability: createRating(50),
      ...NEUTRAL_HITTER_RATINGS,
    },
  });
}

console.log('=== 1. Manager generation: schema shape ===\n');
{
  const rng = createRng(111);
  const managers = Array.from({ length: 500 }, (_, i) => generateManager({ rng, overrides: { id: `m-${i}` } }));
  const allSliderKeysPresent = managers.every((m) => MANAGER_SLIDER_NAMES.every((name) => Number.isFinite(m.sliders[name])));
  const allInRange = managers.every((m) =>
    MANAGER_SLIDER_NAMES.every((name) => m.sliders[name] >= MANAGER_ATTRIBUTE_SCALE.MIN && m.sliders[name] <= MANAGER_ATTRIBUTE_SCALE.MAX)
    && m.temperament >= MANAGER_ATTRIBUTE_SCALE.MIN && m.temperament <= MANAGER_ATTRIBUTE_SCALE.MAX
    && m.streakRead >= MANAGER_ATTRIBUTE_SCALE.MIN && m.streakRead <= MANAGER_ATTRIBUTE_SCALE.MAX
  );
  assert(allSliderKeysPresent, 'every generated manager has all seven sliders as finite numbers');
  assert(allInRange, 'every slider/temperament/streakRead stays within MANAGER_ATTRIBUTE_SCALE');
  assert(managers.every((m) => typeof m.birthNation === 'string' && m.birthNation.length > 0), 'every manager gets a real birth nation (reused nationality system)');

  const exPlayerCount = managers.filter((m) => m.origin === MANAGER_ORIGINS.EX_PLAYER).length;
  const exPlayerFraction = exPlayerCount / managers.length;
  console.log(`  origin split: ${(exPlayerFraction * 100).toFixed(1)}% ex-player (configured: 75%)`);
  assert(Math.abs(exPlayerFraction - 0.75) < 0.06, 'ex-player origin fraction roughly matches the configured 75% weight');
  assert(managers.filter((m) => m.origin === MANAGER_ORIGINS.EX_PLAYER).every((m) => m.formerPosition), 'every ex-player manager has a formerPosition flavor field');
  assert(managers.filter((m) => m.origin === MANAGER_ORIGINS.OUTSIDER).every((m) => !m.formerPosition), 'no outsider manager has a formerPosition');
}

console.log('\n=== 2. League-flavor mean shift ===\n');
{
  const rng = createRng(222);
  const foundryManagers = Array.from({ length: 1000 }, (_, i) => generateManager({ rng, leagueId: LEAGUE_IDS.FOUNDRY, overrides: { id: `f-${i}` } }));
  const exchangeManagers = Array.from({ length: 1000 }, (_, i) => generateManager({ rng, leagueId: LEAGUE_IDS.EXCHANGE, overrides: { id: `e-${i}` } }));
  const avg = (arr, fn) => arr.reduce((sum, m) => sum + fn(m), 0) / arr.length;

  const foundrySmallBall = avg(foundryManagers, (m) => m.sliders.smallBallTendency);
  const exchangeSmallBall = avg(exchangeManagers, (m) => m.sliders.smallBallTendency);
  console.log(`  smallBallTendency avg — Foundry: ${foundrySmallBall.toFixed(1)}, Exchange: ${exchangeSmallBall.toFixed(1)}`);
  assert(foundrySmallBall > exchangeSmallBall, 'Foundry managers skew higher Small-Ball Tendency than Exchange, on average');

  const foundryPlatoon = avg(foundryManagers, (m) => m.sliders.platoonTendency);
  const exchangePlatoon = avg(exchangeManagers, (m) => m.sliders.platoonTendency);
  console.log(`  platoonTendency avg — Foundry: ${foundryPlatoon.toFixed(1)}, Exchange: ${exchangePlatoon.toFixed(1)}`);
  assert(exchangePlatoon > foundryPlatoon, 'Exchange managers skew higher Platoon Tendency than Foundry, on average');

  const foundryFeel = avg(foundryManagers, (m) => m.sliders.analyticsVsFeel);
  const exchangeFeel = avg(exchangeManagers, (m) => m.sliders.analyticsVsFeel);
  console.log(`  analyticsVsFeel avg (high=Feel) — Foundry: ${foundryFeel.toFixed(1)}, Exchange: ${exchangeFeel.toFixed(1)}`);
  assert(foundryFeel > exchangeFeel, 'Foundry managers skew Feel-leaning, Exchange skews Analytics-leaning, on average');
}

console.log('\n=== 3. Temperament noise (resolveGameManagerState) ===\n');
{
  const rng = createRng(333);
  const steadyManager = createManager({ temperament: 95, sliders: { stealAggressiveness: 50 } });
  const volatileManager = createManager({ temperament: 5, sliders: { stealAggressiveness: 50 } });

  function stdDevOfEffectiveSlider(manager, trials) {
    const values = Array.from({ length: trials }, () => resolveGameManagerState(manager, rng).effectiveSliders.stealAggressiveness);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  const steadyStdDev = stdDevOfEffectiveSlider(steadyManager, 2000);
  const volatileStdDev = stdDevOfEffectiveSlider(volatileManager, 2000);
  console.log(`  effective-slider stddev — Temperament 95: ${steadyStdDev.toFixed(2)}, Temperament 5: ${volatileStdDev.toFixed(2)}`);
  assert(volatileStdDev > steadyStdDev * 3, 'a low-Temperament manager\'s effective slider values spread far wider game-to-game than a high-Temperament one\'s');
}

console.log('\n=== 4. Pitcher Hook (shouldPullPitcher) ===\n');
{
  const base = { pitchesThrown: 90, outsRecorded: 15, isStarter: true, degradationPenalty: 14 };
  const quickHookPulls = shouldPullPitcher({ ...base, pitcherHook: 1 });
  const longLeashHolds = !shouldPullPitcher({ ...base, pitcherHook: 100 });
  assert(quickHookPulls, 'a quick-hook manager (pitcherHook=1) pulls at a degradation penalty a neutral manager would tolerate');
  assert(longLeashHolds, 'a long-leash manager (pitcherHook=100) holds at the same degradation penalty a neutral manager would pull at');
}

console.log('\n=== 5. Bullpen Usage (selectNextPitcher) ===\n');
{
  const closer = makePitcher('closer');
  const nextInLine = makePitcher('next-in-line');
  const context = { inning: 9, scheduledInnings: 9, leadMargin: 4 }; // outside the neutral (3-run) save window

  const conservativeChoice = selectNextPitcher([nextInLine, closer], { ...context, bullpenUsage: 1 });
  assert(conservativeChoice.id === 'next-in-line', 'a conservative Bullpen Usage manager (1) does NOT deploy the closer in a wider-than-classic save situation');

  const liberalChoice = selectNextPitcher([nextInLine, closer], { ...context, bullpenUsage: 100 });
  assert(liberalChoice.id === 'closer', 'a liberal Bullpen Usage manager (100) DOES deploy the closer in that same situation');
}

console.log('\n=== 6. Steal Aggressiveness (computeStealAttemptProbability) ===\n');
{
  const runner = makeHitter('runner');
  const situation = { baseAttemptRate: 0.05 };
  const conservative = computeStealAttemptProbability(runner, situation, 0, 1);
  const aggressive = computeStealAttemptProbability(runner, situation, 0, 100);
  console.log(`  attempt probability — stealAggressiveness=1: ${conservative.toFixed(3)}, =100: ${aggressive.toFixed(3)}`);
  assert(aggressive > conservative, 'higher Steal Aggressiveness raises the attempt probability');
}

console.log('\n=== 7. Small-Ball Tendency (computeBuntAttemptProbability) ===\n');
{
  const batter = makeHitter('bunter');
  const bases = { first: makeHitter('r1'), second: null, third: null };
  const context = { scoreMargin: 0, inning: 1, scheduledInnings: 9, dhRule: true };
  const conservative = computeBuntAttemptProbability(batter, 'PLAIN', bases, { ...context, smallBallTendency: 1 });
  const aggressive = computeBuntAttemptProbability(batter, 'PLAIN', bases, { ...context, smallBallTendency: 100 });
  console.log(`  attempt probability — smallBallTendency=1: ${conservative.toFixed(3)}, =100: ${aggressive.toFixed(3)}`);
  assert(aggressive > conservative, 'higher Small-Ball Tendency raises the bunt-attempt probability');
}

console.log('\n=== 8. Defensive Management (isNoDoublesActive / isInfieldInActive) ===\n');
{
  const defense = { runsTotal: 3 };
  const offense = { runsTotal: 1 };
  const inning = 6;
  const scheduledInnings = 9;
  assert(!isNoDoublesActive(defense, offense, inning, scheduledInnings, 50), 'at neutral (50), inning 6 of 9 is not yet "late" for no-doubles positioning');
  assert(isNoDoublesActive(defense, offense, inning, scheduledInnings, 100), 'a heavy-Defensive-Management manager (100) activates no-doubles positioning earlier, by inning 6');
  assert(!isNoDoublesActive(defense, offense, inning, scheduledInnings, 1), 'a hands-off manager (1) narrows the window further — still not active by inning 6');

  const tiedDefense = { runsTotal: 2 };
  const tiedOffense = { runsTotal: 2 };
  assert(isInfieldInActive(tiedDefense, tiedOffense, inning, scheduledInnings, 100), 'a heavy-Defensive-Management manager activates infield-in earlier when tied, by inning 6');
  assert(!isInfieldInActive(tiedDefense, tiedOffense, inning, scheduledInnings, 1), 'a hands-off manager does not, at the same inning');
}

console.log('\n=== 9. Platoon Tendency — pinch-hit selection ===\n');
{
  // Equal-ish base composites (candidate +8) so the platoon bonus alone
  // decides the outcome at full Platoon Tendency but not at zero.
  const pitcher = makePitcher('rhp', { throws: 'R' });
  const currentBatter = makeHitter('starter', { bats: 'R' }); // same-hand, platoon DISADVANTAGE vs this pitcher
  const candidate = makeHitter('bench-lhb', { bats: 'L', contactBonus: 8 }); // opposite-hand, platoon ADVANTAGE

  const highPlatoon = selectPinchHitter([candidate], currentBatter, new Set(), {
    pitcher,
    effectiveSliders: { platoonTendency: 100, analyticsVsFeel: 1 },
  });
  assert(highPlatoon?.id === 'bench-lhb', 'a high-Platoon-Tendency manager pinch-hits for a real, combined base+platoon advantage');

  const lowPlatoon = selectPinchHitter([candidate], currentBatter, new Set(), {
    pitcher,
    effectiveSliders: { platoonTendency: 1, analyticsVsFeel: 1 },
  });
  assert(lowPlatoon === null, 'a low-Platoon-Tendency manager does NOT pinch-hit for the same candidate — the base advantage alone isn\'t enough');
}

console.log('\n=== 10. Analytics vs. Feel + Streak Read — pinch-hit selection ===\n');
{
  const pitcher = makePitcher('rhp2', { throws: 'R' });
  const currentBatter = makeHitter('starter2', { bats: 'R' });
  const candidate = makeHitter('bench-hot', { bats: 'R', contactBonus: 8 }); // same hand as pitcher — no platoon effect either way
  const streakStateById = new Map([['bench-hot', { tier: HOT_COLD_TIERS.ON_FIRE }]]);

  const feelManager = selectPinchHitter([candidate], currentBatter, new Set(), {
    pitcher,
    effectiveSliders: { platoonTendency: 1, analyticsVsFeel: 100 },
    streakRead: 100,
    streakStateById,
    rng: () => 0.5, // near-zero perception noise at streakRead=100 regardless of roll
  });
  assert(feelManager?.id === 'bench-hot', 'a Feel-leaning manager with excellent Streak Read correctly favors a genuinely-hot bench bat');

  const analyticsManager = selectPinchHitter([candidate], currentBatter, new Set(), {
    pitcher,
    effectiveSliders: { platoonTendency: 1, analyticsVsFeel: 1 },
    streakRead: 100,
    streakStateById,
    rng: () => 0.5,
  });
  assert(analyticsManager === null, 'an Analytics-leaning manager ignores streak state entirely — the base advantage alone isn\'t enough');
}

console.log('\n=== 11. perceiveStreakTier — Streak Read fallibility direction ===\n');
{
  const rng = createRng(444);
  const trials = 2000;
  function fractionCorrect(streakRead) {
    let correct = 0;
    for (let i = 0; i < trials; i++) {
      if (perceiveStreakTier(HOT_COLD_TIERS.ON_FIRE, streakRead, rng) === HOT_COLD_TIERS.ON_FIRE) correct++;
    }
    return correct / trials;
  }
  const highReadAccuracy = fractionCorrect(100);
  const lowReadAccuracy = fractionCorrect(1);
  console.log(`  correctly perceives ON_FIRE — streakRead=100: ${(highReadAccuracy * 100).toFixed(1)}%, streakRead=1: ${(lowReadAccuracy * 100).toFixed(1)}%`);
  assert(highReadAccuracy > 0.9, 'a manager with elite Streak Read almost always perceives the true tier correctly');
  assert(highReadAccuracy > lowReadAccuracy, 'higher Streak Read is meaningfully more accurate than lower Streak Read');
}

console.log('\n=== 12. Manager Career Lifecycle — retirement ===\n');
{
  const young = computeManagerRetirementProbability(createManager({ birthdate: '1980-01-01' }), { asOfDate: new Date('2026-07-17') }); // age 46
  const old = computeManagerRetirementProbability(createManager({ birthdate: '1948-01-01' }), { asOfDate: new Date('2026-07-17') }); // age 78
  console.log(`  age 46: ${young.toFixed(3)}, age 78: ${old.toFixed(3)}`);
  assert(young === 0, 'a 46-year-old manager has zero retirement probability by default');
  assert(old > young, 'retirement probability rises with age, tuned meaningfully older than player retirement');

  const forced = rollManagerRetirement(createManager({ birthdate: '1945-01-01' }), () => 0, { asOfDate: new Date('2026-07-17') });
  assert(forced === true, 'rollManagerRetirement fires when rng() undercuts a positive probability');
}

console.log('\n=== 13. Wired into a real simulated season ===\n');
{
  const rng = createRng(555);
  const smallSchedule = buildSeasonSchedule(teams, 4, rng);
  const { results } = simulateSeason(teams, getTeamRoster, smallSchedule, rng, getTeamManager);
  assert(results.length > 0, 'a real season with real managers attached simulates without crashing');
  assert(results.every((r) => Number.isFinite(r.awayRuns) && Number.isFinite(r.homeRuns)), 'every game produces finite run totals — no NaN propagated from the manager wiring');

  // Direct single-game check too, exercising createSide's real-manager path explicitly.
  const teamA = teams[0];
  const teamB = teams[1];
  const rosterA = getTeamRoster(teamA.id);
  const rosterB = getTeamRoster(teamB.id);
  const box = simulateGame(
    {
      away: { ...rosterA, startingPitcher: rosterA.rotation[0], managerProfile: getTeamManager(teamA.id) },
      home: { ...rosterB, startingPitcher: rosterB.rotation[0], managerProfile: getTeamManager(teamB.id) },
    },
    { rng }
  );
  const allLinesFinite = [...box.away.battingLines, ...box.home.battingLines].every((line) => Number.isFinite(line.pa) && Number.isFinite(line.ab));
  assert(allLinesFinite, 'a single game with explicit real managerProfiles produces finite box-score lines throughout');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
