// Re-runnable sanity check for Fielding / Positioning (engine/fielding.js +
// baserunning.js's groundout-scoring/infield-in/DP-depth changes + game.js's
// error wiring): `npm run validate:fielding`. Same style as the other
// validate:* scripts — eyeball checks plus hard asserts on structural
// invariants. The biggest blast radius of any mechanic this session (core
// PA engine + core baserunning simultaneously), so this script is
// correspondingly thorough.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { computeOutcomeProbabilities } from '../src/engine/plateAppearance.js';
import { resolveBaserunning, resolveReachedOnError } from '../src/engine/baserunning.js';
import { recordPlateAppearance, createBattingLine, createPitchingLine } from '../src/engine/boxScore.js';
import { computeTeamDefenseComposite, isNoDoublesActive, isInfieldInActive, computeErrorChance } from '../src/engine/fielding.js';
import { PA_OUTCOMES } from '../src/engine/plateAppearanceConstants.js';
import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason, TARGET_GAMES_PER_TEAM } from '../src/engine/season.js';
import { simulateGame } from '../src/engine/game.js';

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
  workEthic: createRating(50), consistency: createRating(50), coachability: createRating(50), durability: createRating(50), buntingSkill: createRating(50),
};

function makeBatter(id, { contact = 50, power = 50, eye = 50, speed = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: 'CF', birthdate: '1996-01-01',
    ratings: { contact: createRating(contact), power: createRating(power), eye: createRating(eye), speed: createRating(speed), baserunningInstincts: createRating(50), fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50), ...NEUTRAL },
  });
}

function makePitcher(id, { control = 50 } = {}) {
  return createPlayer({
    id, firstName: 'Pitcher', lastName: id, primaryPosition: 'SP', isPitcher: true, birthdate: '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50), velocity: createRating(50), control: createRating(control), movement: createRating(50), stamina: createRating(50), pitchability: createRating(50), fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50), ...NEUTRAL },
  });
}

function makeFielder(id, position, fieldingRating) {
  return createPlayer({
    id, firstName: 'Fielder', lastName: id, primaryPosition: position, birthdate: '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50), fielding: createRating(fieldingRating), armStrength: createRating(fieldingRating), armAccuracy: createRating(fieldingRating), ...NEUTRAL },
  });
}

function makeDefenseFixture(fieldingRating, runsTotal = 0) {
  const lineup = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((pos, i) => makeFielder(`d${i}`, pos, fieldingRating));
  const pitcher = makePitcher('dp');
  return { lineup, currentPitcher: pitcher, runsTotal, pitchingLines: new Map([[pitcher.id, createPitchingLine(pitcher)]]) };
}

console.log('=== 1. computeTeamDefenseComposite ===\n');
const goodDefense = makeDefenseFixture(75);
const badDefense = makeDefenseFixture(25);
assert(computeTeamDefenseComposite(goodDefense) > computeTeamDefenseComposite(badDefense), 'a team of good fielders has a higher composite than a team of poor ones');
assert(computeTeamDefenseComposite(goodDefense) === 75, 'the DH slot (never fields) is correctly excluded from the composite — all 8 true fielders are rated 75, so the composite is exactly 75, not diluted');

console.log('\n=== 2. BABIP direction (defense-only, batter/pitcher fixed) ===\n');
const neutralBatter = makeBatter('nb');
const neutralPitcher = makePitcher('np');
const probsGoodD = computeOutcomeProbabilities(neutralBatter, neutralPitcher, { composite: 75 });
const probsBadD = computeOutcomeProbabilities(neutralBatter, neutralPitcher, { composite: 25 });
const babipShare = (p) => p[PA_OUTCOMES.SINGLE] + p[PA_OUTCOMES.DOUBLE] + p[PA_OUTCOMES.TRIPLE];
assert(babipShare(probsGoodD) < babipShare(probsBadD), 'better team defense lowers the ball-in-play hit share (BABIP), holding batter/pitcher fixed');
assert(probsGoodD[PA_OUTCOMES.STRIKEOUT] === probsBadD[PA_OUTCOMES.STRIKEOUT], 'defense does not affect strikeout rate');
assert(probsGoodD[PA_OUTCOMES.WALK] === probsBadD[PA_OUTCOMES.WALK], 'defense does not affect walk rate');
assert(probsGoodD[PA_OUTCOMES.HOME_RUN] === probsBadD[PA_OUTCOMES.HOME_RUN], 'defense does not affect home run rate');

console.log('\n=== 3. Error chance direction ===\n');
assert(computeErrorChance(25) > computeErrorChance(75), 'a worse defense commits more errors than a better one');

console.log('\n=== 4. No-doubles hit-split shift ===\n');
const probsNoDoubles = computeOutcomeProbabilities(neutralBatter, neutralPitcher, { composite: 50, noDoublesActive: true });
const probsNormal = computeOutcomeProbabilities(neutralBatter, neutralPitcher, { composite: 50, noDoublesActive: false });
assert(probsNoDoubles[PA_OUTCOMES.DOUBLE] < probsNormal[PA_OUTCOMES.DOUBLE], 'no-doubles positioning reduces doubles share');
assert(probsNoDoubles[PA_OUTCOMES.SINGLE] > probsNormal[PA_OUTCOMES.SINGLE], 'no-doubles positioning increases singles share (the trade-off)');

console.log('\n=== 5. Situational trigger conditions ===\n');
const leadingLateDefense = makeDefenseFixture(50, 5);
const trailingLateDefense = makeDefenseFixture(50, 2);
const tiedDefense = makeDefenseFixture(50, 3);
const tiedOffense = makeDefenseFixture(50, 3);
const bigDeficitDefense = makeDefenseFixture(50, 0);
const bigDeficitOffense = makeDefenseFixture(50, 6);

assert(isNoDoublesActive(leadingLateDefense, tiedOffense, 8, 9) === true, 'no-doubles active: defense leading, late innings');
assert(isNoDoublesActive(leadingLateDefense, tiedOffense, 2, 9) === false, 'no-doubles NOT active early, even while leading');
assert(isNoDoublesActive(trailingLateDefense, tiedOffense, 8, 9) === false, 'no-doubles NOT active when trailing');

assert(isInfieldInActive(tiedDefense, tiedOffense, 8, 9) === true, 'infield-in active: tied game, late innings');
assert(isInfieldInActive(leadingLateDefense, tiedOffense, 8, 9) === false, 'infield-in NOT active when leading');
assert(isInfieldInActive(tiedDefense, tiedOffense, 2, 9) === false, 'infield-in NOT active early, even tied');
assert(isInfieldInActive(bigDeficitDefense, bigDeficitOffense, 8, 9) === false, 'infield-in NOT active in a blowout deficit — too far behind for a single run to matter this much');

console.log('\n=== 6. Groundout-scoring fix (the core baserunning behavior change) ===\n');
const r3 = makeBatter('r3');
const batter = makeBatter('batter');
function fixedRng(seq) { let i = 0; return () => seq[Math.min(i++, seq.length - 1)]; }

const routineResult = resolveBaserunning(PA_OUTCOMES.OUT, { first: null, second: null, third: r3 }, 0, batter, fixedRng([0.1, 0.99]), { defenseComposite: 50, infieldInActive: false });
assert(routineResult.scorers.length === 1 && routineResult.scorers[0].id === r3.id, 'a runner on third scores on a routine (non-infield-in) groundout with 0 outs');
assert(routineResult.bases.first === null, 'the batter is out at first on the routine groundout');
assert(routineResult.outsAdded === 1, 'only one out recorded on the routine groundout');

const twoOutsResult = resolveBaserunning(PA_OUTCOMES.OUT, { first: null, second: null, third: r3 }, 2, batter, fixedRng([0.1, 0.99]), { defenseComposite: 50, infieldInActive: false });
assert(twoOutsResult.scorers.length === 0, 'with 2 outs already, the runner on third does NOT score on a groundout (the out ends the inning instead)');

console.log('\n=== 7. Infield-in success vs. failure ===\n');
const infieldInSuccess = resolveBaserunning(PA_OUTCOMES.OUT, { first: null, second: null, third: r3 }, 0, batter, fixedRng([0.1, 0.01]), { defenseComposite: 50, infieldInActive: true });
assert(infieldInSuccess.scorers.length === 0, 'infield-in success: no run scores');
assert(infieldInSuccess.bases.first?.id === batter.id, 'infield-in success: the batter reaches first safely (the throw went home instead)');
assert(infieldInSuccess.bases.third === null, 'infield-in success: the runner from third is out at the plate');

const infieldInFailure = resolveBaserunning(PA_OUTCOMES.OUT, { first: null, second: null, third: r3 }, 0, batter, fixedRng([0.1, 0.99]), { defenseComposite: 50, infieldInActive: true });
assert(infieldInFailure.scorers.length === 1, 'infield-in failure: the run scores anyway (same as the routine case)');
assert(infieldInFailure.bases.first === null, 'infield-in failure: the batter is out at first, same as routine');

console.log('\n=== 8. Double-play depth (defense-driven DP conversion rate) ===\n');
const TRIALS = 4000;
function countDoublePlays(defenseComposite, seed) {
  const rng = createRng(seed);
  let dpCount = 0;
  const runner = makeBatter('runner-on-first');
  for (let i = 0; i < TRIALS; i++) {
    const result = resolveBaserunning(PA_OUTCOMES.OUT, { first: runner, second: null, third: null }, 0, batter, rng, { defenseComposite, infieldInActive: false });
    if (result.isDoublePlay) dpCount++;
  }
  return dpCount / TRIALS;
}
const goodDefenseDpRate = countDoublePlays(75, 41);
const badDefenseDpRate = countDoublePlays(25, 41);
console.log(`  DP rate — good defense: ${(goodDefenseDpRate * 100).toFixed(1)}%, poor defense: ${(badDefenseDpRate * 100).toFixed(1)}%`);
assert(goodDefenseDpRate > badDefenseDpRate, 'better team defense turns more double plays, holding batter speed fixed');

console.log('\n=== 9. resolveReachedOnError ===\n');
const errorRunner = makeBatter('er1');
const { bases: errorBases, scorers: errorScorers } = resolveReachedOnError({ first: null, second: errorRunner, third: null }, batter);
assert(errorBases.first?.id === batter.id, 'reached-on-error: the batter is safe at first');
assert(errorBases.third?.id === errorRunner.id, 'reached-on-error: the existing runner on second advances to third, same as a single');
assert(errorScorers.length === 0, 'reached-on-error: no run scores from a runner on second alone');

console.log('\n=== 10. recordPlateAppearance with isError ===\n');
const errorBattingLine = createBattingLine(batter);
const errorPitchingLine = createPitchingLine(makePitcher('ep'));
const scorer = makeBatter('scorer-on-error');
recordPlateAppearance(errorBattingLine, errorPitchingLine, PA_OUTCOMES.OUT, { scorers: [scorer], isSacFly: false, isDoublePlay: false, isSacrificeBunt: false, isError: true }, false);
assert(errorBattingLine.ab === 1, 'reaching on an error counts as a normal AB');
assert(errorBattingLine.h === 0, 'reaching on an error is NOT credited as a hit');
assert(errorBattingLine.rbi === 0, 'no RBI credited on a run scoring via the same play as an error');
assert(errorPitchingLine.r === 1, 'the run still counts toward the pitcher\'s runs allowed');
assert(errorPitchingLine.er === 0, 'the run is NOT earned (same-play-only simplified rule)');

console.log('\n=== 11. Wired into a real simulated season ===\n');
const rng = createRng(53);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
simulateSeason(teams, getTeamRoster, schedule, rng); // exercises the full pipeline end to end without crashing

let totalErrors = 0;
let gamesChecked = 0;
const smokeRng = createRng(59);
const sampleTeamA = getTeamRoster(teams[4].id);
const sampleTeamB = getTeamRoster(teams[5].id);
for (let i = 0; i < 100; i++) {
  const box = simulateGame(
    {
      away: { lineup: sampleTeamA.lineup, startingPitcher: sampleTeamA.rotation[0], bullpen: sampleTeamA.bullpen, dhRule: true },
      home: { lineup: sampleTeamB.lineup, startingPitcher: sampleTeamB.rotation[0], bullpen: sampleTeamB.bullpen, dhRule: true },
    },
    { rng: smokeRng }
  );
  gamesChecked++;
  totalErrors += box.away.errors + box.home.errors;
}
const errorsPerTeamPerGame = totalErrors / (gamesChecked * 2);
console.log(`  ${gamesChecked} games: ${totalErrors} total errors (${errorsPerTeamPerGame.toFixed(2)} errors/team/game)`);
assert(totalErrors > 0, 'errors occur at all over 100 games (not zero)');
assert(errorsPerTeamPerGame > 0.05 && errorsPerTeamPerGame < 3, 'errors/team/game stays in a plausible range (loose sanity bound)');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
