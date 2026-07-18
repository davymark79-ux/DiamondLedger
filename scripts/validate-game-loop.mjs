// Re-runnable sanity check for the full game loop, including the bullpen
// layer and the (default-off) ghost-runner extra-innings rule:
// `npm run validate:game`.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { pickBats, pickThrows } from '../src/models/generation/playerGenerator.js';
import { simulateGame } from '../src/engine/game.js';
import { formatInningsPitched } from '../src/engine/boxScore.js';

const NEUTRAL_RATINGS = {
  fielding: createRating(50),
  armStrength: createRating(50),
  armAccuracy: createRating(50),
  baserunningInstincts: createRating(50),
  workEthic: createRating(50),
  durability: createRating(50),
  consistency: createRating(50),
};

// Handedness is assigned via the real generator's own pickBats/pickThrows
// (realLeague.js's actual proportions) rather than left at createPlayer()'s
// 'R'/'R' default — now that platoon splits (plateAppearance.js) are real,
// an all-same-handed synthetic fixture would be a systematically harder
// matchup than any real (realistically-mixed) roster ever sees, understating
// this script's run-environment target for reasons that have nothing to do
// with the mechanic actually being validated here. rng is this file's shared
// seeded RNG, threaded through for determinism.
function makeBatter(id, { contact = 50, power = 50, eye = 50, speed = 50 } = {}) {
  return createPlayer({
    id,
    firstName: 'Player',
    lastName: id,
    primaryPosition: 'CF',
    bats: pickBats(rng),
    ratings: { contact: createRating(contact), power: createRating(power), eye: createRating(eye), speed: createRating(speed), platoonSkill: createRating(50), ...NEUTRAL_RATINGS },
  });
}

function makePitcher(id, { velocity = 50, control = 50, movement = 50, stamina = 50 } = {}) {
  return createPlayer({
    id,
    firstName: 'Pitcher',
    lastName: id,
    primaryPosition: 'SP',
    isPitcher: true,
    throws: pickThrows(rng, true),
    ratings: {
      contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50),
      velocity: createRating(velocity), control: createRating(control), movement: createRating(movement), stamina: createRating(stamina),
      ...NEUTRAL_RATINGS,
    },
  });
}

function makeAverageLineup(prefix) {
  return Array.from({ length: 9 }, (_, i) => makeBatter(`${prefix}${i + 1}`));
}

// Bullpen ordered long-relief -> middle-relief -> setup -> closer (last slot).
// Quality curve is deliberately non-uniform (previously all four arms sat at
// a flat league-average 50/50/50/50 with only stamina varying) — real
// bullpens skew below-average in the long-relief/mop-up slots and above-
// average in setup/closer; a flat-average bullpen understates how much
// scoring those replacement-level middle innings actually absorb, which
// matters once starters are pulled at realistic (not extended) pitch counts.
const BULLPEN_QUALITY = { Long: 42, Middle: 47, Setup: 55, Closer: 63 };

function makeBullpen(prefix, { staminaScale = 40 } = {}) {
  return ['Long', 'Middle', 'Setup', 'Closer'].map((role) => {
    const q = BULLPEN_QUALITY[role];
    return makePitcher(`${prefix}${role}`, { velocity: q, control: q, movement: q, stamina: staminaScale });
  });
}

function printBoxScore(box) {
  console.log(`Final: Away ${box.away.runs} - Home ${box.home.runs}  (${box.innings} innings)`);
  console.log('Line score (away/home):', box.away.inningRuns.join('-'), '/', box.home.inningRuns.join('-'));

  for (const [label, side] of [['AWAY', box.away], ['HOME', box.home]]) {
    console.log(`\n${label} batting:`);
    for (const line of side.battingLines) {
      console.log(
        `  ${line.player.lastName.padEnd(6)} AB:${line.ab} R:${line.r} H:${line.h} 2B:${line.doubles} 3B:${line.triples} HR:${line.hr} RBI:${line.rbi} BB:${line.bb} K:${line.k}`
      );
    }
    console.log(`${label} pitching:`);
    for (const p of side.pitchingLines) {
      console.log(
        `  ${p.player.lastName.padEnd(8)} IP:${formatInningsPitched(p.outsRecorded)} H:${p.h} R:${p.r} ER:${p.er} BB:${p.bb} K:${p.k} Pitches:${p.pitches}`
      );
    }
  }
}

const rng = createRng(20260714);

console.log('=== Single game: league-average lineups + full bullpens ===\n');
const singleGame = simulateGame(
  {
    away: { lineup: makeAverageLineup('A'), startingPitcher: makePitcher('AwayStarter'), bullpen: makeBullpen('Away') },
    home: { lineup: makeAverageLineup('H'), startingPitcher: makePitcher('HomeStarter'), bullpen: makeBullpen('Home') },
  },
  { rng }
);
printBoxScore(singleGame);

console.log('\n\n=== 500-game aggregate: ghost runner OFF (default) ===\n');
runAggregate(500, { ghostRunnerOnSecondInExtraInnings: false });

console.log('\n\n=== 500-game aggregate: ghost runner ON ===\n');
runAggregate(500, { ghostRunnerOnSecondInExtraInnings: true });

function runAggregate(gameCount, rules) {
  let totalRuns = 0;
  let totalInnings = 0;
  let extraInningGames = 0;
  let pitchersUsedTotal = 0;
  let closerUsedInSave = 0;
  let saveSituations = 0;

  for (let i = 0; i < gameCount; i++) {
    const box = simulateGame(
      {
        away: { lineup: makeAverageLineup('A'), startingPitcher: makePitcher(`AS${i}`), bullpen: makeBullpen(`A${i}`) },
        home: { lineup: makeAverageLineup('H'), startingPitcher: makePitcher(`HS${i}`), bullpen: makeBullpen(`H${i}`) },
      },
      { rng, rules }
    );
    totalRuns += box.away.runs + box.home.runs;
    totalInnings += box.innings;
    if (box.innings > 9) extraInningGames++;
    pitchersUsedTotal += box.away.pitchingLines.length + box.home.pitchingLines.length;

    for (const side of [box.home, box.away]) {
      if (side.pitchingLines.length >= 2) {
        const lastPitcher = side.pitchingLines[side.pitchingLines.length - 1];
        if (lastPitcher.player.lastName.includes('Closer') && lastPitcher.outsRecorded > 0) {
          saveSituations++;
          closerUsedInSave++;
        }
      }
    }
  }

  console.log(`Games: ${gameCount}`);
  console.log(`Avg total runs/game: ${(totalRuns / gameCount).toFixed(2)} (reference: modern MLB ~8.6-9.0)`);
  console.log(`Avg runs/team/game: ${(totalRuns / gameCount / 2).toFixed(2)} (reference: modern MLB ~4.3-4.6)`);
  console.log(`Avg innings/game: ${(totalInnings / gameCount).toFixed(2)}`);
  console.log(`Extra-inning games: ${extraInningGames} / ${gameCount}`);
  console.log(`Avg pitchers used per team per game: ${(pitchersUsedTotal / gameCount / 2).toFixed(2)}`);
  console.log(`Games where 'Closer' finished the game: ${saveSituations}`);
}
