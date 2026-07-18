// Re-runnable sanity check for Origin/Nationality/Retirement
// (models/generation/nationalityPools.js + engine/retirement.js):
// `npm run validate:origin`. Same style as the other validate:* scripts —
// eyeball checks plus hard asserts on structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { generatePlayer, generateEstablishedPlayer } from '../src/models/generation/playerGenerator.js';
import { BIRTH_NATION_POOL, HERITAGE_NATION_COUNT_WEIGHTS, pickBirthNation, pickHeritageNations } from '../src/models/generation/nationalityPools.js';
import { computeRetirementProbability, rollRetirement, advanceCareerForRoster } from '../src/engine/retirement.js';
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

const NEUTRAL_HITTER_RATINGS = {
  contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
  speed: createRating(50), baserunningInstincts: createRating(50),
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
};

const AS_OF_DATE = new Date('2026-07-17');

function birthdateForAge(age) {
  const d = new Date(AS_OF_DATE);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

// `currentVsTruePotential` lets a test dial in exactly how far below true
// potential the player's current rating sits, for the decline-term checks.
function makeHitter(id, age, { currentVsTruePotential = 0 } = {}) {
  const truePotential = 60;
  const current = truePotential - currentVsTruePotential;
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: 'CF', isPitcher: false,
    birthdate: birthdateForAge(age),
    ratings: {
      ...NEUTRAL_HITTER_RATINGS,
      contact: createRating(current, truePotential),
      power: createRating(current, truePotential),
      eye: createRating(current, truePotential),
    },
  });
}

console.log('=== 1. Nationality generation: distribution ===\n');
{
  const rng = createRng(777);
  const trials = 20000;
  const counts = new Map();
  for (let i = 0; i < trials; i++) {
    const nation = pickBirthNation(rng);
    counts.set(nation, (counts.get(nation) ?? 0) + 1);
  }
  let maxDeviation = 0;
  for (const { value, weight } of BIRTH_NATION_POOL) {
    const observed = (counts.get(value) ?? 0) / trials;
    maxDeviation = Math.max(maxDeviation, Math.abs(observed - weight));
  }
  console.log(`  Max deviation from configured weight across ${BIRTH_NATION_POOL.length} nations: ${(maxDeviation * 100).toFixed(2)}pp`);
  assert(maxDeviation < 0.01, 'pickBirthNation matches BIRTH_NATION_POOL weights within 1 percentage point over 20k trials');
}

console.log('\n=== 2. Nationality generation: heritage nations ===\n');
{
  const rng = createRng(888);
  const trials = 20000;
  const countCounts = { 0: 0, 1: 0, 2: 0 };
  let everDuplicatesBirth = false;
  let everDuplicatesItself = false;
  for (let i = 0; i < trials; i++) {
    const birthNation = pickBirthNation(rng);
    const heritage = pickHeritageNations(rng, birthNation);
    countCounts[heritage.length] = (countCounts[heritage.length] ?? 0) + 1;
    if (heritage.includes(birthNation)) everDuplicatesBirth = true;
    if (new Set(heritage).size !== heritage.length) everDuplicatesItself = true;
  }
  assert(!everDuplicatesBirth, 'a heritage nation never duplicates the player\'s own birth nation');
  assert(!everDuplicatesItself, 'a player\'s two heritage nations (when present) are never the same nation twice');
  for (const { value, weight } of HERITAGE_NATION_COUNT_WEIGHTS) {
    const observed = countCounts[value] / trials;
    console.log(`  heritage count ${value}: observed ${(observed * 100).toFixed(1)}%, configured ${(weight * 100).toFixed(1)}%`);
    assert(Math.abs(observed - weight) < 0.02, `heritage-nation-count ${value} matches configured weight within 2 percentage points`);
  }
}

console.log('\n=== 3. Nationality wired into real generation ===\n');
{
  const rng = createRng(999);
  const players = Array.from({ length: 500 }, (_, i) => generatePlayer({ rng, overrides: { id: `gen-${i}` } }));
  const distinctNations = new Set(players.map((p) => p.birthNation));
  assert(distinctNations.size > 1, 'generatePlayer() produces real birth-nation variety, not a hardcoded constant');
  assert(players.every((p) => Array.isArray(p.heritageNations)), 'every generated player has a heritageNations array');

  const established = generateEstablishedPlayer({ rng, position: 'SS' });
  assert(typeof established.birthNation === 'string' && established.birthNation.length > 0, 'generateEstablishedPlayer() also assigns a real birth nation');
}

console.log('\n=== 4. Retirement probability: age direction ===\n');
{
  const young = computeRetirementProbability(makeHitter('young', 25), { asOfDate: AS_OF_DATE });
  const old = computeRetirementProbability(makeHitter('old', 42), { asOfDate: AS_OF_DATE });
  console.log(`  age 25: ${young.toFixed(3)}, age 42: ${old.toFixed(3)}`);
  assert(young === 0, 'a 25-year-old has zero retirement probability by default');
  assert(old > young, 'retirement probability rises with age');
}

console.log('\n=== 5. Retirement probability: decline term, gated by age ===\n');
{
  const oldAtPeak = computeRetirementProbability(makeHitter('old-peak', 36, { currentVsTruePotential: 0 }), { asOfDate: AS_OF_DATE });
  const oldDeclined = computeRetirementProbability(makeHitter('old-declined', 36, { currentVsTruePotential: 20 }), { asOfDate: AS_OF_DATE });
  console.log(`  age 36, at peak: ${oldAtPeak.toFixed(3)}, age 36, declined 20pts: ${oldDeclined.toFixed(3)}`);
  assert(oldDeclined > oldAtPeak, 'a meaningfully-declined veteran retires more often than one still near his ceiling, same age');

  const youngDeclined = computeRetirementProbability(makeHitter('young-declined', 25, { currentVsTruePotential: 20 }), { asOfDate: AS_OF_DATE });
  assert(youngDeclined === 0, 'the decline term does not apply below the age gate — a 25-year-old bust never reads as "retiring"');
}

console.log('\n=== 6. Retirement probability: injury-driven ===\n');
{
  const youngCareerEnding = computeRetirementProbability(makeHitter('yce', 22), { asOfDate: AS_OF_DATE, injuryStatus: { severity: INJURY_SEVERITIES.CAREER_ENDING } });
  assert(youngCareerEnding === 1, 'CAREER_ENDING forces retirement outright, regardless of age');

  const oldHealthy = computeRetirementProbability(makeHitter('old-healthy', 36), { asOfDate: AS_OF_DATE });
  const oldSeasonEnding = computeRetirementProbability(makeHitter('old-se', 36), { asOfDate: AS_OF_DATE, injuryStatus: { severity: INJURY_SEVERITIES.SEASON_ENDING } });
  console.log(`  age 36 healthy: ${oldHealthy.toFixed(3)}, age 36 SEASON_ENDING: ${oldSeasonEnding.toFixed(3)}`);
  assert(oldSeasonEnding > oldHealthy, 'a season-ending injury raises retirement probability for an older player');

  const youngHealthy = computeRetirementProbability(makeHitter('young-healthy', 25), { asOfDate: AS_OF_DATE });
  const youngSeasonEnding = computeRetirementProbability(makeHitter('young-se', 25), { asOfDate: AS_OF_DATE, injuryStatus: { severity: INJURY_SEVERITIES.SEASON_ENDING } });
  assert(youngSeasonEnding === youngHealthy, 'a season-ending injury does NOT bump a young player\'s retirement probability — he\'s expected back');
}

console.log('\n=== 7. rollRetirement ===\n');
{
  const player = makeHitter('roll-test', 40);
  const alwaysRetires = rollRetirement(player, () => 0, { asOfDate: AS_OF_DATE });
  const neverRetires = rollRetirement(makeHitter('young-roll', 20), () => 0, { asOfDate: AS_OF_DATE });
  assert(alwaysRetires === true, 'rollRetirement fires when rng() undercuts a positive probability');
  assert(neverRetires === false, 'rollRetirement never fires for a zero-probability player regardless of rng');

  const careerEndingPlayer = makeHitter('ce-roll', 20);
  const forcedRetire = rollRetirement(careerEndingPlayer, () => 0.999999, { asOfDate: AS_OF_DATE, injuryStatus: { severity: INJURY_SEVERITIES.CAREER_ENDING } });
  assert(forcedRetire === true, 'CAREER_ENDING retires even against a rng roll that would otherwise fail');
}

console.log('\n=== 8. advanceCareerForRoster ===\n');
{
  const roster = {
    lineup: [makeHitter('l1', 25), makeHitter('l2', 45)],
    rotation: [makeHitter('r1', 30)],
    bullpen: [makeHitter('b1', 45)],
    bench: [makeHitter('bn1', 22)],
  };
  const injuryStatusById = new Map([['r1', { severity: INJURY_SEVERITIES.CAREER_ENDING }]]);

  // Fixed rng: 0 always beats a positive probability, so this removes
  // every player whose probability is > 0 (l2, b1 via age; r1 via forced
  // career-ending) and keeps every player at exactly probability 0 (l1, bn1).
  const { roster: survivors, retiredPlayerIds } = advanceCareerForRoster(roster, () => 0, { asOfDate: AS_OF_DATE, injuryStatusById });

  assert(retiredPlayerIds.includes('r1'), 'the CAREER_ENDING player is retired');
  assert(retiredPlayerIds.includes('l2') && retiredPlayerIds.includes('b1'), 'older players with positive probability are retired under a forced roll');
  assert(!retiredPlayerIds.includes('l1') && !retiredPlayerIds.includes('bn1'), 'young zero-probability players are never retired, even under a forced roll');
  assert(survivors.lineup.map((p) => p.id).includes('l1') && !survivors.lineup.map((p) => p.id).includes('l2'), 'lineup array reflects the retirement correctly');
  assert(survivors.rotation.length === 0, 'rotation array reflects the retirement correctly');
  assert(survivors.bullpen.length === 0, 'bullpen array reflects the retirement correctly');
  assert(survivors.bench.map((p) => p.id).includes('bn1'), 'bench array reflects the retirement correctly');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
