// Re-runnable sanity check for Stolen Bases (engine/stolenBases.js +
// game.js's maybeAttemptSteal hook): `npm run validate:steals`. Same style
// as the other validate:* scripts — eyeball checks plus hard asserts on
// structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { identifyStealOpportunity, computeStealAttemptProbability, computeStealSuccessRate } from '../src/engine/stolenBases.js';
import { maybeAttemptSteal, simulateGame } from '../src/engine/game.js';
import { createBattingLine, createPitchingLine } from '../src/engine/boxScore.js';
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
  fielding: createRating(50), workEthic: createRating(50), consistency: createRating(50), coachability: createRating(50),
};

function makeRunner(id, { speed = 50, baserunningInstincts = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Runner', lastName: id, primaryPosition: 'CF', birthdate: '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(speed), baserunningInstincts: createRating(baserunningInstincts), armStrength: createRating(50), armAccuracy: createRating(50), durability: createRating(50), ...NEUTRAL },
  });
}

function makeCatcher(id, { armStrength = 50, armAccuracy = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Catcher', lastName: id, primaryPosition: 'C', birthdate: '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50), armStrength: createRating(armStrength), armAccuracy: createRating(armAccuracy), durability: createRating(50), ...NEUTRAL },
  });
}

function makePitcher(id, { control = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Pitcher', lastName: id, primaryPosition: 'SP', isPitcher: true, birthdate: '1996-01-01',
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50),
      velocity: createRating(50), control: createRating(control), movement: createRating(50), stamina: createRating(50), pitchability: createRating(50),
      armStrength: createRating(50), armAccuracy: createRating(50), durability: createRating(50), ...NEUTRAL,
    },
  });
}

console.log('=== 1. identifyStealOpportunity ===\n');
const runner1 = makeRunner('r1');
const runner2 = makeRunner('r2');
assert(identifyStealOpportunity({ first: null, second: null, third: null }) === null, 'empty bases: no opportunity');
assert(identifyStealOpportunity({ first: runner1, second: null, third: null })?.situationName === 'FIRST_TO_SECOND', 'runner on first, second open: FIRST_TO_SECOND');
const firstAndSecondOccupied = identifyStealOpportunity({ first: runner1, second: runner2, third: null });
assert(
  firstAndSecondOccupied?.situationName === 'SECOND_TO_THIRD' && firstAndSecondOccupied.runner === runner2,
  'runners on first and second: the trailing runner on first is blocked (second occupied), but the lead runner on second still has a valid steal-third opportunity (third is open) — not a double steal, just the one legitimate independent attempt'
);
assert(identifyStealOpportunity({ first: null, second: runner1, third: null })?.situationName === 'SECOND_TO_THIRD', 'runner on second alone, third open: SECOND_TO_THIRD');
assert(identifyStealOpportunity({ first: runner1, second: null, third: runner2 })?.situationName === 'FIRST_TO_SECOND', 'runners on first and third (second open): first can still attempt');
assert(identifyStealOpportunity({ first: null, second: null, third: runner1 }) === null, 'runner on third only: no opportunity (steals of home out of scope)');

console.log('\n=== 2. Attempt probability: direction + score-margin gate ===\n');
const firstToSecond = identifyStealOpportunity({ first: runner1, second: null, third: null }).situation;
const fastRunner = makeRunner('fast', { speed: 80, baserunningInstincts: 75 });
const slowRunner = makeRunner('slow', { speed: 25, baserunningInstincts: 30 });
assert(
  computeStealAttemptProbability(fastRunner, firstToSecond, 0) > computeStealAttemptProbability(slowRunner, firstToSecond, 0),
  'a fast, instinctive runner attempts more often than a slow one in the same situation'
);
assert(computeStealAttemptProbability(fastRunner, firstToSecond, 10) === 0, 'a double-digit blowout suppresses attempts entirely (score-margin gate)');
assert(computeStealAttemptProbability(fastRunner, firstToSecond, -10) === 0, 'a double-digit deficit also suppresses attempts (gate is symmetric)');
assert(computeStealAttemptProbability(fastRunner, firstToSecond, 2) > 0, 'a close game does not suppress attempts');

console.log('\n=== 3. Success rate: direction (runner/catcher/pitcher) ===\n');
const weakCatcher = makeCatcher('weak', { armStrength: 25, armAccuracy: 30 });
const strongCatcher = makeCatcher('strong', { armStrength: 80, armAccuracy: 75 });
const avgPitcher = makePitcher('avgp');
const goodControlPitcher = makePitcher('goodctl', { control: 80 });
assert(
  computeStealSuccessRate(fastRunner, weakCatcher, avgPitcher, firstToSecond) > computeStealSuccessRate(slowRunner, strongCatcher, avgPitcher, firstToSecond),
  'a fast runner vs. a weak-armed catcher succeeds more often than a slow runner vs. a strong-armed catcher'
);
assert(
  computeStealSuccessRate(fastRunner, weakCatcher, avgPitcher, firstToSecond) > computeStealSuccessRate(fastRunner, weakCatcher, goodControlPitcher, firstToSecond),
  'a pitcher with better control (the hold-time proxy) lowers the runner\'s success rate, holding runner/catcher fixed'
);

console.log('\n=== 4. FIRST_TO_SECOND vs. SECOND_TO_THIRD baselines ===\n');
const secondToThird = identifyStealOpportunity({ first: null, second: runner1, third: null }).situation;
const avgRunner = makeRunner('avg');
const avgCatcher = makeCatcher('avg');
assert(
  computeStealAttemptProbability(avgRunner, firstToSecond, 0) > computeStealAttemptProbability(avgRunner, secondToThird, 0),
  'FIRST_TO_SECOND is attempted more often than SECOND_TO_THIRD at the same runner quality'
);
assert(
  computeStealSuccessRate(avgRunner, avgCatcher, avgPitcher, firstToSecond) > computeStealSuccessRate(avgRunner, avgCatcher, avgPitcher, secondToThird),
  'FIRST_TO_SECOND has a higher baseline success rate than SECOND_TO_THIRD'
);

console.log('\n=== 5. maybeAttemptSteal — structural + the critical mid-PA-ending-inning case ===\n');

function makeOffenseFixture(runner) {
  const battingLines = new Map([[runner.id, createBattingLine(runner)]]);
  return { battingLines };
}
function makeDefenseFixture(catcher, pitcher) {
  const pitchingLines = new Map([[pitcher.id, createPitchingLine(pitcher)]]);
  return { lineup: [catcher], currentPitcher: pitcher, pitchingLines };
}

// Deterministic fake rng: returns a fixed sequence, so the attempt roll and
// success roll are both fully controlled rather than left to chance.
function fixedRng(sequence) {
  let i = 0;
  return () => sequence[Math.min(i++, sequence.length - 1)];
}

const emptyBasesOffense = makeOffenseFixture(runner1);
const emptyBasesDefense = makeDefenseFixture(makeCatcher('c0'), makePitcher('p0'));
const noOpResult = maybeAttemptSteal(emptyBasesOffense, emptyBasesDefense, { first: null, second: null, third: null }, fixedRng([0, 0]), { scoreMargin: 0 });
assert(noOpResult.outsAdded === 0, 'no runner on base: no steal attempt, no outs added');

const runnerForSuccess = makeRunner('rs', { speed: 70, baserunningInstincts: 70 });
const successOffense = makeOffenseFixture(runnerForSuccess);
const successDefense = makeDefenseFixture(makeCatcher('c1'), makePitcher('p1'));
const successBases = { first: runnerForSuccess, second: null, third: null };
const successResult = maybeAttemptSteal(successOffense, successDefense, successBases, fixedRng([0, 0]), { scoreMargin: 0 }); // roll 0 for attempt (always clears a positive probability) and 0 for success (0 < any positive success rate)
assert(successResult.outsAdded === 0, 'a successful steal adds no outs');
assert(successBases.first === null && successBases.second === runnerForSuccess, 'a successful steal moves the runner from first to second');
assert(successOffense.battingLines.get(runnerForSuccess.id).sb === 1, 'a successful steal credits SB to the runner\'s own line');

const runnerForCs = makeRunner('rcs', { speed: 70, baserunningInstincts: 70 });
const csOffense = makeOffenseFixture(runnerForCs);
const csPitcher = makePitcher('p2');
const csDefense = makeDefenseFixture(makeCatcher('c2'), csPitcher);
const csBases = { first: runnerForCs, second: null, third: null };
const csResult = maybeAttemptSteal(csOffense, csDefense, csBases, fixedRng([0, 0.999]), { scoreMargin: 0 }); // roll 0 for attempt, 0.999 forces "caught" (>= any realistic success rate)
assert(csResult.outsAdded === 1, 'a caught-stealing adds exactly one out — the return value the caller uses to decide whether to bail before the batter\'s own PA');
assert(csBases.first === null, 'a caught-stealing removes the runner from the bases');
assert(csOffense.battingLines.get(runnerForCs.id).cs === 1, 'a caught-stealing credits CS to the runner\'s own line');
assert(csDefense.pitchingLines.get(csPitcher.id).outsRecorded === 1, 'a caught-stealing increments the pitcher\'s outsRecorded (a real out for half-inning/fatigue purposes)');
assert(csDefense.pitchingLines.get(csPitcher.id).battersFaced === 0, 'a caught-stealing does NOT increment battersFaced — the same batter is still up, not a new one faced');

console.log('\n=== 6. Wired into a real simulated season ===\n');
const rng = createRng(17);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
const { results } = simulateSeason(teams, getTeamRoster, schedule, rng);
console.log(`  (Season simulated: ${results.length} games. SB/CS are tracked on individual battingLines, not aggregated`);
console.log('  into the season-level results object — see the per-game smoke test below for real totals.)');

let totalSb = 0;
let totalCs = 0;
let gamesChecked = 0;
const smokeTestRng = createRng(23);
const sampleTeamA = getTeamRoster(teams[0].id);
const sampleTeamB = getTeamRoster(teams[1].id);
for (let i = 0; i < 100; i++) {
  const box = simulateGame(
    {
      away: { lineup: sampleTeamA.lineup, startingPitcher: sampleTeamA.rotation[0], bullpen: sampleTeamA.bullpen },
      home: { lineup: sampleTeamB.lineup, startingPitcher: sampleTeamB.rotation[0], bullpen: sampleTeamB.bullpen },
    },
    { rng: smokeTestRng }
  );
  gamesChecked++;
  for (const line of [...box.away.battingLines, ...box.home.battingLines]) {
    totalSb += line.sb;
    totalCs += line.cs;
  }
}
const sbPerTeamPerGame = totalSb / (gamesChecked * 2);
console.log(`  ${gamesChecked} games: ${totalSb} total SB, ${totalCs} total CS (${sbPerTeamPerGame.toFixed(2)} SB/team/game)`);
assert(totalSb > 0, 'stolen bases occur at all over 100 games (not zero)');
assert(sbPerTeamPerGame > 0.02 && sbPerTeamPerGame < 3, 'SB/team/game stays in a plausible range (loose sanity bound)');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
