// Re-runnable sanity check for the plate-appearance engine — Build
// Sequencing step 2's instruction to "validate it produces realistic stat
// lines" against known matchup archetypes: `npm run validate:sim`. The
// original matchup-archetype rows below are eyeball-print only (unchanged
// behavior); the platoon/handedness section adds real hard asserts.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { simulateMatchupStatLine } from '../src/engine/statLine.js';
import { computeOutcomeProbabilities } from '../src/engine/plateAppearance.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const NEUTRAL_RATINGS = {
  fielding: createRating(50),
  armStrength: createRating(50),
  armAccuracy: createRating(50),
  baserunningInstincts: createRating(50),
  workEthic: createRating(50),
  durability: createRating(50),
  consistency: createRating(50),
};

function makeBatter({ contact = 50, power = 50, eye = 50, speed = 50, bats = 'R', platoonSkill = 50 } = {}) {
  return createPlayer({
    primaryPosition: 'CF',
    bats,
    ratings: {
      contact: createRating(contact),
      power: createRating(power),
      eye: createRating(eye),
      speed: createRating(speed),
      platoonSkill: createRating(platoonSkill),
      ...NEUTRAL_RATINGS,
    },
  });
}

function makePitcher({ velocity = 50, control = 50, movement = 50, throws = 'R' } = {}) {
  return createPlayer({
    primaryPosition: 'SP',
    throws,
    ratings: {
      contact: createRating(50),
      power: createRating(50),
      eye: createRating(50),
      speed: createRating(50),
      velocity: createRating(velocity),
      control: createRating(control),
      movement: createRating(movement),
      stamina: createRating(50),
      ...NEUTRAL_RATINGS,
    },
  });
}

const PA_COUNT = 100_000;
const rng = createRng(20260712);

const matchups = [
  ['Average vs. average', makeBatter(), makePitcher()],
  ['Elite hitter (70s) vs. average pitcher', makeBatter({ contact: 70, power: 70, eye: 70, speed: 70 }), makePitcher()],
  ['Average hitter vs. elite pitcher (70s)', makeBatter(), makePitcher({ velocity: 70, control: 70, movement: 70 })],
  ['Weak hitter (30s) vs. average pitcher', makeBatter({ contact: 30, power: 30, eye: 30, speed: 30 }), makePitcher()],
  ['Power/low-contact slugger vs. average pitcher', makeBatter({ contact: 40, power: 80, eye: 45, speed: 40 }), makePitcher()],
];

console.log(`Simulating ${PA_COUNT.toLocaleString()} PA per matchup...\n`);
for (const [label, batter, pitcher] of matchups) {
  const line = simulateMatchupStatLine(batter, pitcher, PA_COUNT, rng);
  console.log(label);
  console.log(
    `  AVG ${line.avg.toFixed(3)}  OBP ${line.obp.toFixed(3)}  SLG ${line.slg.toFixed(3)}  OPS ${line.ops.toFixed(3)}  ` +
      `K% ${(line.kRate * 100).toFixed(1)}  BB% ${(line.bbRate * 100).toFixed(1)}  HR% ${(line.hrRate * 100).toFixed(1)}`
  );
}

console.log('\nReference: modern MLB league average is roughly .248/.312/.410, K% 22.5, BB% 8.2, HR% 3.1.');
console.log('Note: the "Average vs. average" row above is implicitly a same-handed (RHB vs RHP) matchup —');
console.log('createPlayer() defaults bats/throws to \'R\' — so once platoon splits exist it reads slightly');
console.log('below this reference on purpose. See the population-weighted check below for the real anchor.');

// Deterministic, no-simulation expected AVG/OBP/SLG straight from
// computeOutcomeProbabilities()'s per-PA shares — treats the probabilities
// as "shares per PA" the same way computeStatLine.js's counting stats work,
// just analytically instead of via a random sample. Zero noise, instant —
// exactly what a hard directional/magnitude assert needs, vs. the
// large-sample simulation the eyeball rows above use.
function expectedStatsFromProbabilities(p) {
  const hitShare = p.SINGLE + p.DOUBLE + p.TRIPLE + p.HOME_RUN;
  const abShare = 1 - p.WALK - p.HIT_BY_PITCH;
  const totalBasesShare = p.SINGLE + 2 * p.DOUBLE + 3 * p.TRIPLE + 4 * p.HOME_RUN;
  return {
    avg: hitShare / abShare,
    obp: hitShare + p.WALK + p.HIT_BY_PITCH,
    slg: totalBasesShare / abShare,
  };
}

console.log('\n=== Platoon/handedness splits (deterministic, no simulation noise) ===\n');

const rhb = makeBatter({ bats: 'R' });
const lhb = makeBatter({ bats: 'L' });
const switchHitter = makeBatter({ bats: 'S' });
const rhp = makePitcher({ throws: 'R' });
const lhp = makePitcher({ throws: 'L' });

const rhbVsRhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(rhb, rhp));
const rhbVsLhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(rhb, lhp));
const lhbVsLhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(lhb, lhp));
const lhbVsRhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(lhb, rhp));
const switchVsRhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(switchHitter, rhp));
const switchVsLhp = expectedStatsFromProbabilities(computeOutcomeProbabilities(switchHitter, lhp));

for (const [label, stats] of [
  ['RHB vs RHP (same-hand)', rhbVsRhp],
  ['RHB vs LHP (opposite-hand)', rhbVsLhp],
  ['LHB vs LHP (same-hand)', lhbVsLhp],
  ['LHB vs RHP (opposite-hand)', lhbVsRhp],
  ['Switch vs RHP', switchVsRhp],
  ['Switch vs LHP', switchVsLhp],
]) {
  console.log(`  ${label}: AVG ${stats.avg.toFixed(3)}  OBP ${stats.obp.toFixed(3)}  SLG ${stats.slg.toFixed(3)}`);
}

console.log();
assert(rhbVsLhp.obp > rhbVsRhp.obp && rhbVsLhp.slg > rhbVsRhp.slg, 'RHB does better vs LHP (opposite-hand) than vs RHP (same-hand), on both OBP and SLG');
assert(lhbVsRhp.obp > lhbVsLhp.obp && lhbVsRhp.slg > lhbVsLhp.slg, 'LHB does better vs RHP (opposite-hand) than vs LHP (same-hand), on both OBP and SLG');

const pairings = [
  ['RHB vs RHP', rhbVsRhp],
  ['RHB vs LHP', rhbVsLhp],
  ['LHB vs LHP', lhbVsLhp],
  ['LHB vs RHP', lhbVsRhp],
];
const worst = pairings.reduce((a, b) => (a[1].obp + a[1].slg < b[1].obp + b[1].slg ? a : b));
assert(worst[0] === 'LHB vs LHP', 'LHB vs LHP is the single toughest of the four pairings (the real-world asymmetry)');

const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;
assert(
  closeEnough(switchVsRhp.obp, lhbVsRhp.obp) && closeEnough(switchVsRhp.slg, lhbVsRhp.slg),
  'a switch-hitter facing a RHP matches the LHB-vs-RHP pairing exactly (bats left, takes the opposite-hand advantage)'
);
assert(
  closeEnough(switchVsLhp.obp, rhbVsLhp.obp) && closeEnough(switchVsLhp.slg, rhbVsLhp.slg),
  'a switch-hitter facing a LHP matches the RHB-vs-LHP pairing exactly (bats right, takes the opposite-hand advantage)'
);

console.log('\n=== Population-weighted average (realistic handedness mix) ===\n');

// Matches playerGenerator.js's pickBats()/pickThrows(isPitcher=true) proportions exactly.
const BATS_MIX = { R: 0.55, L: 0.35, S: 0.1 };
const PITCHER_THROWS_MIX = { R: 0.78, L: 0.22 };

let weightedAvg = 0;
let weightedObp = 0;
let weightedSlg = 0;
for (const [bats, batsWeight] of Object.entries(BATS_MIX)) {
  for (const [throws, throwsWeight] of Object.entries(PITCHER_THROWS_MIX)) {
    const weight = batsWeight * throwsWeight;
    const stats = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats }), makePitcher({ throws })));
    weightedAvg += stats.avg * weight;
    weightedObp += stats.obp * weight;
    weightedSlg += stats.slg * weight;
  }
}
console.log(`  Population-weighted average: AVG ${weightedAvg.toFixed(3)}  OBP ${weightedObp.toFixed(3)}  SLG ${weightedSlg.toFixed(3)}`);
console.log('  This is the real anchor check: BASE_RATES/BASE_BABIP should stay valid for the population average');
console.log('  even though any single same-handed matchup (e.g. "Average vs. average" above) now reads a bit below it.');
assert(Math.abs(weightedAvg - 0.248) < 0.01, 'population-weighted AVG stays within 0.01 of the anchored .248 reference');
assert(Math.abs(weightedObp - 0.312) < 0.01, 'population-weighted OBP stays within 0.01 of the anchored .312 reference');
assert(Math.abs(weightedSlg - 0.41) < 0.02, 'population-weighted SLG stays within 0.02 of the anchored .410 reference');

console.log('\n=== Platoon Skill scaling (L vs L — the toughest pairing) ===\n');

// throws: undefined hits platoonShift()'s handedness-neutral guard directly
// (same one hotColdStreaks.js's context-neutral reference pitcher relies
// on) — the cleanest way to get a genuine "no platoon shift at all"
// baseline to measure every Platoon Skill level's gap against.
const noShiftBaseline = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats: 'L' }), { ...lhp, throws: undefined }));
const gapFromNeutral = (stats) => noShiftBaseline.obp + noShiftBaseline.slg - (stats.obp + stats.slg);

const lowSkill = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats: 'L', platoonSkill: 20 }), lhp));
const avgSkill = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats: 'L', platoonSkill: 50 }), lhp));
const goodSkill = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats: 'L', platoonSkill: 70 }), lhp));
const eliteSkill = expectedStatsFromProbabilities(computeOutcomeProbabilities(makeBatter({ bats: 'L', platoonSkill: 80 }), lhp));

console.log(`  Gap from neutral — Skill 20: ${gapFromNeutral(lowSkill).toFixed(4)}  Skill 50: ${gapFromNeutral(avgSkill).toFixed(4)}  Skill 70: ${gapFromNeutral(goodSkill).toFixed(4)}  Skill 80: ${gapFromNeutral(eliteSkill).toFixed(4)}`);
assert(gapFromNeutral(lowSkill) > gapFromNeutral(avgSkill), 'low Platoon Skill (20) exaggerates the L-vs-L penalty relative to average');
assert(gapFromNeutral(avgSkill) > gapFromNeutral(goodSkill), 'high Platoon Skill (70) compresses the L-vs-L penalty relative to average');
assert(gapFromNeutral(goodSkill) > 0, 'a very good (70) Platoon Skill still shows a real, if smaller, same-hand penalty — the trend only flips at the true tail');
assert(gapFromNeutral(eliteSkill) < 0, 'an elite (80) Platoon Skill L-vs-L reading flips to a small genuine reverse-split, better than a truly neutral matchup');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
