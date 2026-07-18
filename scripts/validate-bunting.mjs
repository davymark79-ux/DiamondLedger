// Re-runnable sanity check for Bunting / Small Ball (engine/bunting.js +
// game.js's maybeAttemptBunt hook): `npm run validate:bunt`. Same style as
// the other validate:* scripts — eyeball checks plus hard asserts on
// structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { identifyBuntSituation, computeBuntAttemptProbability, computeBuntSuccessRate } from '../src/engine/bunting.js';
import { maybeAttemptBunt, simulateGame } from '../src/engine/game.js';
import { createBattingLine } from '../src/engine/boxScore.js';
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

function makeBatter(id, { contact = 50, power = 50, eye = 50, speed = 50, buntingSkill = 50, isPitcher = false } = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: isPitcher ? 'SP' : 'CF', isPitcher, birthdate: '1996-01-01',
    ratings: { contact: createRating(contact), power: createRating(power), eye: createRating(eye), speed: createRating(speed), buntingSkill: createRating(buntingSkill), durability: createRating(50), ...NEUTRAL },
  });
}

function makeRunner(id) {
  return makeBatter(id);
}

console.log('=== 1. identifyBuntSituation ===\n');
assert(identifyBuntSituation({ first: null, second: null, third: null }, 0) === null, 'empty bases: no situation');
assert(identifyBuntSituation({ first: makeRunner('r1'), second: null, third: null }, 2) === null, '2 outs: no situation, regardless of base state');
assert(identifyBuntSituation({ first: makeRunner('r1'), second: null, third: null }, 0)?.situationName === 'PLAIN', 'runner on first, 0 outs: PLAIN');
assert(identifyBuntSituation({ first: makeRunner('r1'), second: null, third: null }, 1)?.situationName === 'PLAIN', 'runner on first, 1 out: still eligible');
assert(identifyBuntSituation({ first: null, second: null, third: makeRunner('r3') }, 0)?.situationName === 'SQUEEZE', 'runner on third: SQUEEZE');
assert(identifyBuntSituation({ first: makeRunner('r1'), second: null, third: makeRunner('r3') }, 0)?.situationName === 'SQUEEZE', 'runners on first and third: SQUEEZE (third occupied is what matters)');

console.log('\n=== 2. Attempt probability: direction, gates, and bonuses ===\n');
const goodBunter = makeBatter('good', { buntingSkill: 80, speed: 70 });
const badBunter = makeBatter('bad', { buntingSkill: 25, speed: 30 });
const basesFirstOnly = { first: makeRunner('r1'), second: null, third: null };
const basesThirdOccupied = { first: null, second: null, third: makeRunner('r3') };

assert(
  computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, { scoreMargin: 0 })
    > computeBuntAttemptProbability(badBunter, 'PLAIN', basesFirstOnly, { scoreMargin: 0 }),
  'a better bunter (skill+speed composite) attempts more often than a worse one'
);
assert(computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, { scoreMargin: 6 }) === 0, 'a blowout (margin > 3) suppresses attempts entirely');
assert(computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, { scoreMargin: -6 }) === 0, 'a big deficit also suppresses attempts (gate is symmetric)');
assert(computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, { scoreMargin: 1 }) > 0, 'a close game does not suppress attempts');
assert(
  computeBuntAttemptProbability(goodBunter, 'SQUEEZE', basesThirdOccupied, { scoreMargin: 0 })
    < computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, { scoreMargin: 0 }),
  'SQUEEZE is attempted less often than PLAIN at the same skill level (the riskier call)'
);

const neutralContext = { scoreMargin: 0, inning: 1, scheduledInnings: 9, dhRule: true };
const foundryContext = { ...neutralContext, dhRule: false };
assert(
  computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, foundryContext)
    > computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, neutralContext),
  'a Foundry (no-DH) context attempts more often than an Exchange one, all else equal'
);

const pitcherBatting = makeBatter('pitcher', { contact: 30, power: 20, buntingSkill: 55, isPitcher: true });
assert(
  computeBuntAttemptProbability(pitcherBatting, 'PLAIN', basesFirstOnly, foundryContext)
    > computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, foundryContext),
  'a batting pitcher attempts more often than a real position player, even a good bunter, in the same Foundry context'
);

const lateInning = { scoreMargin: 0, inning: 8, scheduledInnings: 9, dhRule: true };
const earlyInning = { scoreMargin: 0, inning: 2, scheduledInnings: 9, dhRule: true };
assert(
  computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, lateInning)
    > computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, earlyInning),
  'runner-on-first-only late in the game (the "manufacture a run" spot) attempts more often than the same situation early'
);
const basesFirstAndSecond = { first: makeRunner('r1'), second: makeRunner('r2'), third: null };
assert(
  computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstAndSecond, lateInning)
    < computeBuntAttemptProbability(goodBunter, 'PLAIN', basesFirstOnly, lateInning),
  'the late-game manufacture-a-run bonus is specific to runner-on-first-only, not runners on first and second'
);

console.log('\n=== 3. Success rate: direction ===\n');
assert(computeBuntSuccessRate(goodBunter) > computeBuntSuccessRate(badBunter), 'a better bunter succeeds more often');

console.log('\n=== 4. maybeAttemptBunt — structural + forced success/failure on both situations ===\n');

function fixedRng(sequence) {
  let i = 0;
  return () => sequence[Math.min(i++, sequence.length - 1)];
}

function makeOffenseFixture(batter) {
  return { battingLines: new Map([[batter.id, createBattingLine(batter)]]), runsTotal: 0, dhRule: true };
}

const context = { scoreMargin: 0, inning: 1, scheduledInnings: 9 };

assert(maybeAttemptBunt(makeOffenseFixture(goodBunter), { first: null, second: null, third: null }, 0, goodBunter, fixedRng([0, 0]), context) === null, 'empty bases: no bunt attempted');
assert(maybeAttemptBunt(makeOffenseFixture(goodBunter), { first: makeRunner('r1'), second: null, third: null }, 2, goodBunter, fixedRng([0, 0]), context) === null, '2 outs: no bunt attempted regardless of roll');

// PLAIN success
const plainSuccessBases = { first: makeRunner('r1'), second: null, third: null };
const plainSuccessOffense = makeOffenseFixture(goodBunter);
const plainSuccessResult = maybeAttemptBunt(plainSuccessOffense, plainSuccessBases, 0, goodBunter, fixedRng([0, 0]), context);
assert(plainSuccessResult.outsAdded === 1, 'PLAIN success: exactly one out (the batter)');
assert(plainSuccessResult.isSacrificeBunt === true, 'PLAIN success: flagged as a sacrifice bunt');
assert(plainSuccessResult.bases.first === null && plainSuccessResult.bases.second?.id === 'r1', 'PLAIN success: runner advances first to second');

// PLAIN failure
const plainFailBases = { first: makeRunner('r1'), second: null, third: null };
const plainFailResult = maybeAttemptBunt(makeOffenseFixture(goodBunter), plainFailBases, 0, goodBunter, fixedRng([0, 0.999]), context);
assert(plainFailResult.outsAdded === 1, 'PLAIN failure: exactly one out (just the batter)');
assert(plainFailResult.isSacrificeBunt === false, 'PLAIN failure: not flagged as a sacrifice — a normal recorded AB/out');
assert(plainFailResult.bases.first?.id === 'r1', 'PLAIN failure: the runner does not advance');

// SQUEEZE success
const squeezeSuccessBases = { first: null, second: null, third: makeRunner('r3') };
const squeezeSuccessResult = maybeAttemptBunt(makeOffenseFixture(goodBunter), squeezeSuccessBases, 0, goodBunter, fixedRng([0, 0]), context);
assert(squeezeSuccessResult.outsAdded === 1, 'SQUEEZE success: exactly one out (the batter) — the run scores clean');
assert(squeezeSuccessResult.scorers.length === 1 && squeezeSuccessResult.scorers[0].id === 'r3', 'SQUEEZE success: the runner from third scores');
assert(squeezeSuccessResult.isSacrificeBunt === true, 'SQUEEZE success: flagged as a sacrifice bunt too (same success mechanic as PLAIN)');

// SQUEEZE failure — the critical double-out risk
const squeezeFailBases = { first: null, second: null, third: makeRunner('r3') };
const squeezeFailResult = maybeAttemptBunt(makeOffenseFixture(goodBunter), squeezeFailBases, 0, goodBunter, fixedRng([0, 0.999]), context);
assert(squeezeFailResult.outsAdded === 2, 'SQUEEZE failure: TWO outs — the batter and the runner from third both out (the real suicide-squeeze risk)');
assert(squeezeFailResult.bases.third === null, 'SQUEEZE failure: the runner from third is removed from the bases');
assert(squeezeFailResult.scorers.length === 0, 'SQUEEZE failure: no run scores');
assert(squeezeFailResult.isSacrificeBunt === false, 'SQUEEZE failure: not flagged as a sacrifice');

console.log('\n=== 5. Wired into a real simulated season ===\n');
const rng = createRng(31);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
simulateSeason(teams, getTeamRoster, schedule, rng); // exercises the full pipeline; SH itself lives on individual battingLines, sampled below

let totalSh = 0;
let gamesChecked = 0;
const smokeRng = createRng(37);
const sampleTeamA = getTeamRoster(teams[2].id);
const sampleTeamB = getTeamRoster(teams[3].id);
for (let i = 0; i < 100; i++) {
  const box = simulateGame(
    {
      away: { lineup: sampleTeamA.lineup, startingPitcher: sampleTeamA.rotation[0], bullpen: sampleTeamA.bullpen, dhRule: true },
      home: { lineup: sampleTeamB.lineup, startingPitcher: sampleTeamB.rotation[0], bullpen: sampleTeamB.bullpen, dhRule: true },
    },
    { rng: smokeRng }
  );
  gamesChecked++;
  for (const line of [...box.away.battingLines, ...box.home.battingLines]) totalSh += line.sh;
}
const shPerTeamPerGame = totalSh / (gamesChecked * 2);
console.log(`  ${gamesChecked} games: ${totalSh} total SH (${shPerTeamPerGame.toFixed(2)} SH/team/game)`);
assert(totalSh > 0, 'sacrifice bunts occur at all over 100 games (not zero)');
assert(shPerTeamPerGame > 0.01 && shPerTeamPerGame < 2, 'SH/team/game stays in a plausible range (loose sanity bound)');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
