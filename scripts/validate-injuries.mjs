// Re-runnable sanity check for the Injuries system (engine/injuries.js +
// game.js's in-game hooks + engine/season.js's cross-game persistence):
// `npm run validate:injuries`. Same style as the other validate:* scripts —
// eyeball checks plus hard asserts on structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { simulateGame } from '../src/engine/game.js';
import { computeInjuryRisk, rollInjury, maybeEscalateInjury, INJURY_SEVERITY_MINIMUM_GAMES } from '../src/engine/injuries.js';
import { resolveAvailableRoster } from '../src/engine/season.js';
import { INJURY_SEVERITIES } from '../src/models/constants.js';

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

function makeBatter(id, overrides = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: overrides.position ?? 'CF',
    birthdate: overrides.birthdate ?? '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), durability: createRating(overrides.durability ?? 50), ...NEUTRAL },
  });
}

function makePitcher(id, overrides = {}) {
  return createPlayer({
    id, firstName: 'Pitcher', lastName: id, primaryPosition: 'SP', isPitcher: true,
    birthdate: overrides.birthdate ?? '1996-01-01',
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50),
      velocity: createRating(50), control: createRating(50), movement: createRating(50), stamina: createRating(overrides.stamina ?? 50),
      pitchability: createRating(50), durability: createRating(overrides.durability ?? 50), ...NEUTRAL,
    },
  });
}

console.log('=== 1. Risk direction checks ===\n');
const youngDurable = makeBatter('a', { birthdate: '2003-01-01', durability: 80 });
const oldFragile = makeBatter('b', { birthdate: '1986-01-01', durability: 20 });
assert(
  computeInjuryRisk(oldFragile, { isPitcher: false }) > computeInjuryRisk(youngDurable, { isPitcher: false }),
  'an old, low-durability player has higher injury risk than a young, durable one'
);

const durable = makeBatter('c', { durability: 80 });
const fragile = makeBatter('d', { durability: 20 });
assert(
  computeInjuryRisk(fragile, { isPitcher: false }) > computeInjuryRisk(durable, { isPitcher: false }),
  'durability alone measurably lowers risk, holding age/position constant'
);

const pitcher = makePitcher('e');
assert(
  computeInjuryRisk(pitcher, { isPitcher: true, pitchesThrownSoFar: 150 }) > computeInjuryRisk(pitcher, { isPitcher: true, pitchesThrownSoFar: 20 }),
  'a fatigued pitcher (150 pitches) has higher injury risk than a fresh one (20 pitches)'
);

console.log('\n=== 2. Severity distribution (10,000 rolls) ===\n');
const distRng = createRng(1);
const counts = {};
for (let i = 0; i < 10000; i++) {
  const injury = rollInjury(youngDurable, distRng);
  counts[injury.severity] = (counts[injury.severity] ?? 0) + 1;
}
console.log(' ', counts);
assert(counts[INJURY_SEVERITIES.DAY_TO_DAY] > counts[INJURY_SEVERITIES.SHORT_TERM_IL], 'day-to-day is the most common outcome');
assert(counts[INJURY_SEVERITIES.SHORT_TERM_IL] > counts[INJURY_SEVERITIES.LONG_TERM_IL], 'short-term IL is more common than long-term IL');
assert(
  (counts[INJURY_SEVERITIES.CAREER_ENDING] ?? 0) < (counts[INJURY_SEVERITIES.SEASON_ENDING] ?? 0),
  'career-ending is rarer than season-ending'
);
assert((counts[INJURY_SEVERITIES.CAREER_ENDING] ?? 0) / 10000 < 0.02, 'career-ending stays well under 2% of all injuries');

console.log('\n=== 3. Hard-floor guarantee (1,000 trials per IL tier) ===\n');
for (const severity of [INJURY_SEVERITIES.SHORT_TERM_IL, INJURY_SEVERITIES.LONG_TERM_IL]) {
  const floor = INJURY_SEVERITY_MINIMUM_GAMES[severity];
  const floorRng = createRng(2);
  let neverEarly = true;
  let neverNegative = true;
  for (let t = 0; t < 1000; t++) {
    let injury = { type: 'test', severity, gamesRemaining: floor, sustainedGameNumber: 0 };
    let checksTaken = 0;
    while (injury.gamesRemaining > 0 && checksTaken < 500) {
      injury = maybeEscalateInjury(injury, floorRng);
      if (injury.gamesRemaining < 0) neverNegative = false;
      checksTaken++;
    }
    // Escalation can only ever make the stay longer (reset to an
    // equal-or-higher floor), never shorter — so it should never take
    // *fewer* checks than the tier's own floor to reach zero.
    if (checksTaken < floor) neverEarly = false;
  }
  assert(neverEarly, `${severity}: never recovers before its ${floor}-game floor, across 1000 trials`);
  assert(neverNegative, `${severity}: gamesRemaining never goes negative`);
}

console.log('\n=== 4. Setback rate + monotonicity ===\n');
const severityOrder = [INJURY_SEVERITIES.DAY_TO_DAY, INJURY_SEVERITIES.SHORT_TERM_IL, INJURY_SEVERITIES.LONG_TERM_IL, INJURY_SEVERITIES.SEASON_ENDING, INJURY_SEVERITIES.CAREER_ENDING];
const setbackRng = createRng(3);
let setbackCount = 0;
let everDowngraded = false;
const trials = 3000;
for (let t = 0; t < trials; t++) {
  let injury = { type: 'test', severity: INJURY_SEVERITIES.SHORT_TERM_IL, gamesRemaining: INJURY_SEVERITY_MINIMUM_GAMES[INJURY_SEVERITIES.SHORT_TERM_IL], sustainedGameNumber: 0 };
  let sawSetback = false;
  let guard = 0;
  while (Number.isFinite(injury.gamesRemaining) && injury.gamesRemaining > 0 && guard < 500) {
    const prevIndex = severityOrder.indexOf(injury.severity);
    injury = maybeEscalateInjury(injury, setbackRng);
    const newIndex = severityOrder.indexOf(injury.severity);
    if (newIndex < prevIndex) everDowngraded = true;
    if (newIndex > prevIndex) sawSetback = true;
    guard++;
  }
  if (sawSetback) setbackCount++;
}
const setbackRate = setbackCount / trials;
console.log(`  SHORT_TERM_IL setback rate over ${trials} trials: ${(setbackRate * 100).toFixed(1)}%`);
assert(setbackRate > 0.01 && setbackRate < 0.3, 'setback rate is a real, occasional possibility, not near-zero or near-universal');
assert(!everDowngraded, 'a setback never moves a severity backward (less severe)');

console.log('\n=== 5. In-game injury rate + substitution correctness (300 games, real bench) ===\n');
const gameRng = createRng(4);
function makeLineup(prefix) { return Array.from({ length: 9 }, (_, i) => makeBatter(`${prefix}${i}`)); }
function makeBench(prefix) { return Array.from({ length: 4 }, (_, i) => makeBatter(`${prefix}bn${i}`)); }
function makeBullpen(prefix) { return Array.from({ length: 4 }, (_, i) => makePitcher(`${prefix}rp${i}`)); }

let totalInjuries = 0;
let gamesWithInjury = 0;
let substitutionFound = 0;
let noReplacementAvailable = 0;
let removedIdDoubleUseViolations = 0;
const GAME_COUNT = 300;

for (let i = 0; i < GAME_COUNT; i++) {
  const box = simulateGame(
    {
      away: { lineup: makeLineup(`a${i}-`), startingPitcher: makePitcher(`a${i}-sp`), bullpen: makeBullpen(`a${i}-`), bench: makeBench(`a${i}-`) },
      home: { lineup: makeLineup(`h${i}-`), startingPitcher: makePitcher(`h${i}-sp`), bullpen: makeBullpen(`h${i}-`), bench: makeBench(`h${i}-`) },
    },
    { rng: gameRng }
  );

  if (box.injuries.length > 0) gamesWithInjury++;
  totalInjuries += box.injuries.length;

  const allSubs = [...box.away.substitutions, ...box.home.substitutions];
  for (const injury of box.injuries) {
    const wasSubbed = allSubs.some((s) => s.type === 'injury' && s.outPlayerId === injury.playerId);
    if (wasSubbed) substitutionFound++;
    else noReplacementAvailable++;
  }

  // removedPlayerIds double-use: no player id should appear as an
  // outPlayerId more than once per side (the hard "never returns"
  // invariant already established for tactical subs applies identically
  // to injury-forced ones, since they share substituteBatter()).
  for (const side of [box.away, box.home]) {
    const outIds = side.substitutions.map((s) => s.outPlayerId);
    if (new Set(outIds).size !== outIds.length) removedIdDoubleUseViolations++;
  }
}

console.log(`  ${GAME_COUNT} games: ${totalInjuries} total injuries, ${gamesWithInjury} games with >=1 injury`);
console.log(`  Substitution found: ${substitutionFound}, no replacement available (played through): ${noReplacementAvailable}`);
assert(totalInjuries > 0, 'injuries occur at all over 300 games (not zero)');
assert(totalInjuries < GAME_COUNT * 2, 'injury rate stays plausible (well under an injury per team per game on average)');
assert(removedIdDoubleUseViolations === 0, 'no player is ever substituted out twice in the same game (injury path included)');

console.log('\n=== 6. Season-loop cross-game persistence (resolveAvailableRoster) ===\n');
const testRoster = {
  lineup: makeLineup('L'),
  rotation: Array.from({ length: 5 }, (_, i) => makePitcher(`R${i}`)),
  bullpen: makeBullpen('B'),
  bench: makeBench('N'),
};
const injuredPlayerId = testRoster.lineup[3].id;
const injuryStatusById = new Map([[injuredPlayerId, { type: 'test', severity: INJURY_SEVERITIES.SHORT_TERM_IL, gamesRemaining: 5, sustainedGameNumber: 0 }]]);

const resolvedWhileInjured = resolveAvailableRoster(testRoster, injuryStatusById);
assert(
  !resolvedWhileInjured.lineup.some((p) => p.id === injuredPlayerId),
  'an injured lineup player is excluded from the resolved roster while gamesRemaining > 0'
);
assert(
  resolvedWhileInjured.lineup.some((p) => testRoster.bench.some((b) => b.id === p.id)),
  'a bench player is promoted into the injured player\'s slot'
);

injuryStatusById.set(injuredPlayerId, { type: 'test', severity: INJURY_SEVERITIES.SHORT_TERM_IL, gamesRemaining: 0, sustainedGameNumber: 0 });
const resolvedAfterRecovery = resolveAvailableRoster(testRoster, injuryStatusById);
assert(
  resolvedAfterRecovery.lineup.some((p) => p.id === injuredPlayerId),
  'the player reappears in the resolved roster once gamesRemaining reaches 0'
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
