// Aggregates raw PA_OUTCOMES into counting/rate stats — used to validate the
// plate-appearance engine's realism (Build Sequencing step 2: "validate it
// produces realistic stat lines") and, later, for box scores.

import { PA_OUTCOMES } from './plateAppearanceConstants.js';
import { resolvePlateAppearance } from './plateAppearance.js';

/**
 * @param {string[]} outcomes - array of PA_OUTCOMES
 * @returns {object} raw counts
 */
export function tallyOutcomes(outcomes) {
  const counts = {
    plateAppearances: outcomes.length,
    strikeouts: 0,
    walks: 0,
    hitByPitch: 0,
    outs: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
  };

  for (const outcome of outcomes) {
    switch (outcome) {
      case PA_OUTCOMES.STRIKEOUT: counts.strikeouts++; break;
      case PA_OUTCOMES.WALK: counts.walks++; break;
      case PA_OUTCOMES.HIT_BY_PITCH: counts.hitByPitch++; break;
      case PA_OUTCOMES.OUT: counts.outs++; break;
      case PA_OUTCOMES.SINGLE: counts.singles++; break;
      case PA_OUTCOMES.DOUBLE: counts.doubles++; break;
      case PA_OUTCOMES.TRIPLE: counts.triples++; break;
      case PA_OUTCOMES.HOME_RUN: counts.homeRuns++; break;
      default: throw new Error(`Unknown PA outcome: ${outcome}`);
    }
  }

  return counts;
}

/**
 * @param {object} counts - from tallyOutcomes()
 * @returns {object} rate stats: AVG, OBP, SLG, OPS, kRate, bbRate, hrRate
 */
export function computeStatLine(counts) {
  const hits = counts.singles + counts.doubles + counts.triples + counts.homeRuns;
  const atBats = counts.plateAppearances - counts.walks - counts.hitByPitch;
  const totalBases = counts.singles + 2 * counts.doubles + 3 * counts.triples + 4 * counts.homeRuns;
  const onBaseNumerator = hits + counts.walks + counts.hitByPitch;
  const onBaseDenominator = atBats + counts.walks + counts.hitByPitch;

  const avg = atBats > 0 ? hits / atBats : 0;
  const obp = onBaseDenominator > 0 ? onBaseNumerator / onBaseDenominator : 0;
  const slg = atBats > 0 ? totalBases / atBats : 0;

  return {
    plateAppearances: counts.plateAppearances,
    atBats,
    hits,
    avg,
    obp,
    slg,
    ops: obp + slg,
    kRate: counts.strikeouts / counts.plateAppearances,
    bbRate: counts.walks / counts.plateAppearances,
    hrRate: counts.homeRuns / counts.plateAppearances,
  };
}

/**
 * Simulates `count` independent plate appearances for one batter/pitcher
 * matchup and returns the resulting stat line. Convenience wrapper for
 * validation/testing — a real game loop would vary the pitcher/defense per
 * PA rather than repeat one matchup.
 * @param {object} batter - Player
 * @param {object} pitcher - Player
 * @param {number} count
 * @param {() => number} rng
 */
export function simulateMatchupStatLine(batter, pitcher, count, rng) {
  const outcomes = Array.from({ length: count }, () => resolvePlateAppearance(batter, pitcher, rng));
  return computeStatLine(tallyOutcomes(outcomes));
}
