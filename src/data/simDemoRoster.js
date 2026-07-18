// Demo roster/matchup builder for the Box Score page — parallel to
// mockData.js (placeholder *data*), but this builds real Player objects fed
// straight into the actual engine (src/engine/game.js's simulateGame()).
//
// Not full career simulation (generating an HS prospect and running him
// through the Growth Model) — that's a separate, much bigger integration.
// This is a quick, varied roster for demo purposes: ratings drawn from a
// spread so the box score has texture (some good hitters, a shaky middle
// reliever), not a full player-development pipeline.

import { createPlayer, createRating } from '../models/Player.js';
import { createRng, randomInRange, pick } from '../models/generation/random.js';
import { FIRST_NAMES_USA, LAST_NAMES_USA } from '../models/generation/namePools.js';
import { mlbTeams } from './mockData.js';

const LINEUP_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const BENCH_POSITIONS = ['C', '1B', 'SS', 'LF'];

function randomRating(rng, base, spread) {
  return createRating(base + randomInRange(rng, -spread, spread));
}

function makeBatter(rng, position, id) {
  const quality = randomInRange(rng, 35, 62); // this player's overall-quality anchor
  return createPlayer({
    id,
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    primaryPosition: position,
    ratings: {
      contact: randomRating(rng, quality, 12),
      power: randomRating(rng, quality, 15),
      eye: randomRating(rng, quality, 12),
      speed: randomRating(rng, quality, 15),
      fielding: randomRating(rng, quality, 12),
      armStrength: randomRating(rng, quality, 12),
      armAccuracy: randomRating(rng, quality, 12),
      baserunningInstincts: randomRating(rng, quality, 10),
      workEthic: randomRating(rng, 50, 15),
      durability: randomRating(rng, 50, 15),
      consistency: randomRating(rng, 50, 15),
      coachability: randomRating(rng, 50, 15),
    },
  });
}

function makePitcher(rng, position, id, { qualityRange = [35, 60] } = {}) {
  const quality = randomInRange(rng, qualityRange[0], qualityRange[1]);
  const staminaBase = position === 'SP' ? 55 : 35;
  return createPlayer({
    id,
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    primaryPosition: position,
    isPitcher: true,
    ratings: {
      contact: createRating(30),
      power: createRating(30),
      eye: createRating(30),
      speed: createRating(40),
      fielding: randomRating(rng, 40, 10),
      armStrength: randomRating(rng, 50, 10),
      armAccuracy: randomRating(rng, 50, 10),
      baserunningInstincts: createRating(30),
      velocity: randomRating(rng, quality, 12),
      control: randomRating(rng, quality, 12),
      movement: randomRating(rng, quality, 12),
      stamina: randomRating(rng, staminaBase, 12),
      pitchability: randomRating(rng, quality, 12),
      workEthic: randomRating(rng, 50, 15),
      durability: randomRating(rng, 50, 15),
      consistency: randomRating(rng, 50, 15),
      coachability: randomRating(rng, 50, 15),
    },
  });
}

// Bullpen roles ordered long-relief -> middle-relief -> setup -> closer
// (selectNextPitcher() in pitchingChanges.js treats the last slot as the
// closer). Quality ranges are deliberately non-uniform — a real closer
// isn't just "another reliever," he's usually a team's best arm, while
// long relief skews below the rotation's own quality. Previously every
// bullpen role drew from the same flat range as the starter, which meant
// a "closer" had no reliable edge over mop-up relief and starved real
// save situations of a pitcher actually good enough to hold them (see
// baseball-sim-engine-build-order memory for the diagnosis).
const BULLPEN_QUALITY_RANGES = {
  Long: [32, 52],
  Middle: [40, 58],
  Setup: [48, 64],
  Closer: [56, 74],
};

function buildDemoTeam(rng, idPrefix) {
  const lineup = LINEUP_POSITIONS.map((position) => makeBatter(rng, position, `${idPrefix}-${position}`));
  const startingPitcher = makePitcher(rng, 'SP', `${idPrefix}-SP`);
  const bullpen = ['Long', 'Middle', 'Setup', 'Closer'].map((role) =>
    makePitcher(rng, 'RP', `${idPrefix}-RP-${role}`, { qualityRange: BULLPEN_QUALITY_RANGES[role] })
  );
  const bench = BENCH_POSITIONS.map((position, i) => makeBatter(rng, position, `${idPrefix}-BN${i}-${position}`));
  return { lineup, startingPitcher, bullpen, bench };
}

function pickTwoDistinctTeams(rng) {
  const first = Math.floor(rng() * mlbTeams.length);
  let second = Math.floor(rng() * mlbTeams.length);
  while (second === first) second = Math.floor(rng() * mlbTeams.length);
  return [mlbTeams[first], mlbTeams[second]];
}

/**
 * @param {() => number} rng - seeded RNG from createRng(); caller should
 *   reuse the same rng for simulateGame() so the whole matchup is
 *   reproducible from one seed.
 * @returns {{awayTeam: object, homeTeam: object, away: object, home: object}}
 *   `away`/`home` are ready to pass directly as simulateGame()'s matchup arg.
 */
export function buildDemoMatchup(rng) {
  const [awayTeam, homeTeam] = pickTwoDistinctTeams(rng);
  return {
    awayTeam,
    homeTeam,
    away: buildDemoTeam(rng, 'away'),
    home: buildDemoTeam(rng, 'home'),
  };
}

const VENUE_SUFFIXES = ['Field', 'Park', 'Stadium'];

function computeAttendance(rng, homeTeam, awayTeam) {
  const capacity = 25000 + homeTeam.marketSize * 30000;
  const occupancy = randomInRange(rng, 0.4, 0.95) + (awayTeam.marketSize - 0.5) * 0.05; // a notable visiting market draws a bit better
  return Math.round(capacity * Math.min(1, Math.max(0.25, occupancy)));
}

function computeGameTimeMinutes(box) {
  const totalPitches = [...box.away.pitchingLines, ...box.home.pitchingLines].reduce((sum, line) => sum + line.pitches, 0);
  return Math.round(25 + totalPitches * 0.2 + box.innings * 3);
}

function formatGameTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

/**
 * Derives cosmetic game-info (venue, attendance, game time) from real
 * sim/data inputs rather than fabricating flavor text: attendance scales
 * with the home team's marketSize (already tracked in mockData.js), and
 * game time scales with the actual simulated pitch count.
 * @param {object} matchup - from buildDemoMatchup()
 * @param {object} box - simulateGame()'s return value
 * @param {() => number} rng
 * @returns {{venue: string, attendance: number, gameTime: string}}
 */
export function deriveGameContext(matchup, box, rng) {
  return {
    venue: `${matchup.homeTeam.city} ${pick(rng, VENUE_SUFFIXES)}`,
    attendance: computeAttendance(rng, matchup.homeTeam, matchup.awayTeam),
    gameTime: formatGameTime(computeGameTimeMinutes(box)),
  };
}

export { createRng };
