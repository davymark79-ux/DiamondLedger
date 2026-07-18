// Re-runnable sanity check for the Growth Model + position/role
// reassignment + reassignment-reaction mechanics: `npm run validate:growth`.
// Same style as validate-pa-engine.mjs/validate-game-loop.mjs — an eyeball
// check, not a test framework. Bar is "directionally correct and
// plausible," since every constant involved is an explicit placeholder.

import { createPlayer, createRating } from '../src/models/Player.js';
import { generatePlayers } from '../src/models/generation/playerGenerator.js';
import { createRng } from '../src/models/generation/random.js';
import { advanceDevelopmentPeriod } from '../src/engine/growthModel.js';
import { advanceDevelopmentPeriodWithReassignment } from '../src/engine/development.js';
import {
  createRoleAssignmentState,
  evaluatePositionReassignment,
  evaluatePitcherReassignment,
} from '../src/engine/positionReassignment.js';
import { resolveReassignmentReaction } from '../src/engine/reassignmentReaction.js';

const NEUTRAL = {
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  baserunningInstincts: createRating(50), workEthic: createRating(50), durability: createRating(50),
  consistency: createRating(50), coachability: createRating(50),
};

function makePositionPlayer(overrides = {}) {
  return createPlayer({
    primaryPosition: overrides.primaryPosition ?? 'CF',
    ratings: {
      contact: createRating(...(overrides.contact ?? [40, 65])),
      power: createRating(...(overrides.power ?? [40, 60])),
      eye: createRating(...(overrides.eye ?? [40, 60])),
      speed: createRating(...(overrides.speed ?? [40, 60])),
      ...NEUTRAL,
      ...(overrides.ratingOverrides ?? {}),
    },
  });
}

function makePitcherPlayer(overrides = {}) {
  return createPlayer({
    isPitcher: true,
    primaryPosition: overrides.primaryPosition ?? 'SP',
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50),
      velocity: createRating(...(overrides.velocity ?? [50, 60])),
      control: createRating(...(overrides.control ?? [50, 60])),
      movement: createRating(...(overrides.movement ?? [50, 60])),
      stamina: createRating(...(overrides.stamina ?? [50, 60])),
      pitchability: createRating(...(overrides.pitchability ?? [50, 60])),
      ...NEUTRAL,
      ...(overrides.ratingOverrides ?? {}),
    },
  });
}

const rng = createRng(20260714);

// ---------------------------------------------------------------------
console.log('=== 1. Trajectory demo: one HS prospect, 8 development periods ===\n');
{
  const [prospect] = generatePlayers(1, { seed: 2, idPrefix: 'traj' });
  const schedule = [
    ['COLLEGE', 18], ['COLLEGE', 19], ['COLLEGE', 20], ['COLLEGE', 21],
    ['A', 22], ['AA', 23], ['AAA', 24], ['MLB', 25],
  ];
  const tracked = ['contact', 'power', 'speed', 'fielding'];
  console.log('truePotential:', Object.fromEntries(tracked.map((a) => [a, prospect.ratings[a].truePotential])));

  let player = prospect;
  let roleState = createRoleAssignmentState();
  for (const [level, age] of schedule) {
    const result = advanceDevelopmentPeriodWithReassignment(player, roleState, { rng, ageOverride: age, levelOverride: level });
    player = result.player;
    roleState = result.roleState;
    console.log(
      `  age ${age} (${level}):`,
      Object.fromEntries(tracked.map((a) => [a, player.ratings[a].current.toFixed(1)])),
      result.reassignment.status !== 'none' ? `[${result.reassignment.status}]` : ''
    );
  }
}

// ---------------------------------------------------------------------
console.log('\n=== 2. Work Ethic bias check (population-level, should be unbiased at WE=50) ===\n');
{
  function cohortFinalAvg(workEthic) {
    let sum = 0;
    const n = 150;
    for (let i = 0; i < n; i++) {
      let player = createPlayer({
        ratings: { contact: createRating(40, 70), power: createRating(50), eye: createRating(50), speed: createRating(50), ...NEUTRAL, workEthic: createRating(workEthic) },
      });
      for (let period = 0; period < 8; period++) {
        player = advanceDevelopmentPeriod(player, { rng, ageOverride: 19 + period, levelOverride: 'COLLEGE' });
      }
      sum += player.ratings.contact.current;
    }
    return sum / n;
  }
  const low = cohortFinalAvg(20);
  const mid = cohortFinalAvg(50);
  const high = cohortFinalAvg(80);
  console.log(`  WE=20 avg final contact: ${low.toFixed(2)}`);
  console.log(`  WE=50 avg final contact: ${mid.toFixed(2)}  (unbiased reference)`);
  console.log(`  WE=80 avg final contact: ${high.toFixed(2)}`);
  console.log(`  Expect: low < mid < high, with mid roughly centered.`);
}

// ---------------------------------------------------------------------
console.log('\n=== 3. Aging veteran check (Speed/Fielding should decline faster than Contact/Eye) ===\n');
{
  let veteran = createPlayer({
    ratings: {
      contact: createRating(60, 65), eye: createRating(60, 65),
      speed: createRating(60, 65), fielding: createRating(60, 65),
      power: createRating(50), ...NEUTRAL,
    },
  });
  const start = { ...veteran.ratings };
  for (let age = 34; age < 39; age++) {
    veteran = advanceDevelopmentPeriod(veteran, { rng, ageOverride: age, levelOverride: 'MLB' });
  }
  for (const attr of ['contact', 'eye', 'speed', 'fielding']) {
    console.log(`  ${attr}: ${start[attr].current.toFixed(1)} -> ${veteran.ratings[attr].current.toFixed(1)} (delta ${(veteran.ratings[attr].current - start[attr].current).toFixed(1)})`);
  }
  console.log('  Expect: speed/fielding deltas more negative than contact/eye deltas.');
}

// ---------------------------------------------------------------------
console.log('\n=== 4. Reassignment trigger checks ===\n');
{
  function confirmTwice(evaluateFn, player) {
    let state = createRoleAssignmentState({ periodsAtCurrentPosition: 5 });
    let result;
    for (let i = 0; i < 2; i++) {
      result = evaluateFn(player, state);
      state = result.nextRoleState;
    }
    return result;
  }

  const strugglingSP = makePitcherPlayer({ primaryPosition: 'SP', stamina: [30, 40], control: [50, 55], pitchability: [50, 55], velocity: [55, 60], movement: [50, 55] });
  const rSP = confirmTwice(evaluatePitcherReassignment, strugglingSP);
  console.log(`  Struggling low-stamina SP -> recommended: ${rSP.recommendedPosition} (expect RP)`);

  const promisingRP = makePitcherPlayer({ primaryPosition: 'RP', stamina: [75, 80], control: [65, 70], velocity: [55, 60], movement: [50, 55], pitchability: [60, 65] });
  const rRP = confirmTwice(evaluatePitcherReassignment, promisingRP);
  console.log(`  Promising high-stamina RP -> recommended: ${rRP.recommendedPosition} (expect SP)`);

  const agingCF = makePositionPlayer({
    primaryPosition: 'CF',
    ratingOverrides: { speed: createRating(28, 30), fielding: createRating(45, 50), armStrength: createRating(45), armAccuracy: createRating(45) },
  });
  const rCF = confirmTwice(evaluatePositionReassignment, agingCF);
  console.log(`  Aging low-speed CF -> recommended: ${rCF.recommendedPosition} (expect LF or RF)`);
}

// ---------------------------------------------------------------------
console.log('\n=== 5. Population convergence-rate check (bucketed by true-potential tier) ===\n');
{
  const players = generatePlayers(300, { seed: 99, idPrefix: 'conv' });
  const buckets = { low: [], mid: [], high: [] };

  for (const p of players) {
    const attr = p.ratings.contact;
    const tier = attr.truePotential < 50 ? 'low' : attr.truePotential < 65 ? 'mid' : 'high';
    let player = p;
    const startCurrent = attr.current;
    for (let period = 0; period < 10; period++) {
      player = advanceDevelopmentPeriod(player, { rng, ageOverride: 18 + period, levelOverride: period < 4 ? 'COLLEGE' : period < 5 ? 'A' : period < 6 ? 'AA' : period < 7 ? 'AAA' : 'MLB' });
    }
    const gap = attr.truePotential - startCurrent;
    // Filter out tiny gaps — dividing by a near-zero denominator makes the
    // "fraction closed" metric noise-dominated (and occasionally negative)
    // regardless of how the model actually behaves; only meaningful gaps
    // isolate the convergence-rate signal this check is after.
    const closedFraction = gap >= 5 ? (player.ratings.contact.current - startCurrent) / gap : null;
    if (closedFraction != null) buckets[tier].push(closedFraction);
  }

  for (const tier of ['low', 'mid', 'high']) {
    const arr = buckets[tier];
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const fullConverge = arr.filter((f) => f >= 0.95).length;
    console.log(`  ${tier}-potential (n=${arr.length}): avg gap closed = ${(avg * 100).toFixed(1)}%, near-full convergence = ${fullConverge}/${arr.length}`);
  }
  console.log('  Expect: avg gap-closed% decreasing from low -> high tier; near-full convergence rare, especially for high tier.');
}

// ---------------------------------------------------------------------
console.log('\n=== 6. Injury-hook check ===\n');
{
  const baseCatcher = () => makePositionPlayer({
    primaryPosition: 'C',
    ratingOverrides: { fielding: createRating(55, 65), armAccuracy: createRating(55, 65), armStrength: createRating(50) },
  });

  const healthy = advanceDevelopmentPeriod(baseCatcher(), { rng, ageOverride: 28, levelOverride: 'MLB' });
  const injured = advanceDevelopmentPeriod(baseCatcher(), {
    rng, ageOverride: 28, levelOverride: 'MLB', injuryImpact: { fielding: -20, eye: -8 },
  });
  console.log(`  Healthy catcher fielding after period: ${healthy.ratings.fielding.current.toFixed(1)}`);
  console.log(`  Injured catcher fielding after period: ${injured.ratings.fielding.current.toFixed(1)} (expect notably lower)`);

  let state = createRoleAssignmentState({ periodsAtCurrentPosition: 5 });
  let injuredState = state;
  let healthyResult, injuredResult;
  for (let i = 0; i < 2; i++) {
    healthyResult = evaluatePositionReassignment(healthy, state);
    state = healthyResult.nextRoleState;
    injuredResult = evaluatePositionReassignment(injured, injuredState);
    injuredState = injuredResult.nextRoleState;
  }
  console.log(`  Healthy catcher reassignment: ${healthyResult.recommendedPosition ?? 'none'}`);
  console.log(`  Injured catcher reassignment: ${injuredResult.recommendedPosition ?? 'none'} (expect a move, e.g. toward 1B/3B)`);
}

// ---------------------------------------------------------------------
console.log('\n=== 7. Refusal mechanic check ===\n');
{
  function refusalRate(coachability, direction, trials) {
    let refusals = 0;
    let sawMalus = false;
    let sawSpark = false;
    let sawTradeRequest = false;
    let sawBenchWorthy = false;
    for (let i = 0; i < trials; i++) {
      const reaction = resolveReassignmentReaction(coachability, direction, rng);
      if (reaction.refused) {
        refusals++;
        if (reaction.moraleEffect === 'malus') sawMalus = true;
        if (reaction.moraleEffect === 'spark') sawSpark = true;
        if (reaction.requestsTrade) sawTradeRequest = true;
        if (reaction.benchWorthy) sawBenchWorthy = true;
      }
    }
    return { rate: refusals / trials, sawMalus, sawSpark, sawTradeRequest, sawBenchWorthy };
  }

  const TRIALS = 2000;
  const low = refusalRate(20, 'downshift', TRIALS);
  const high = refusalRate(80, 'downshift', TRIALS);
  console.log(`  Coachability 20, downshift: refusal rate ${(low.rate * 100).toFixed(1)}%  (malus seen: ${low.sawMalus}, spark seen: ${low.sawSpark}, trade-request seen: ${low.sawTradeRequest}, bench-worthy seen: ${low.sawBenchWorthy})`);
  console.log(`  Coachability 80, downshift: refusal rate ${(high.rate * 100).toFixed(1)}%`);
  console.log('  Expect: low-Coachability refusal rate meaningfully higher than high-Coachability.');
}
