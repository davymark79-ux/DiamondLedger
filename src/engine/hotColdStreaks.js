// Hot/Cold Streaks — player-attributes-and-development.md's "Hot/Cold
// Streaks" section. Purely descriptive: does not feed back into
// performance (see plateAppearance.js's header) — a measurement of how
// well a batter has actually been playing lately versus his own
// context-neutral true-talent baseline, in standard-deviation terms, so
// the Managers doc's Analytics-vs-Feel slider and Streak Read attribute
// have something concrete to disagree about later.
//
// The metric generalizes the doc's own worked example (a .250 hitter's
// expected 5-for-20, binomial SD ~1.94 hits) from a single batting-average
// rate to a weighted, multi-outcome wOBA-like composite: each PA is a
// categorical draw with a known weight per outcome, giving a closed-form
// per-PA mean/variance; over N actual recent PAs the sum's SD is
// sqrt(N * perPA_variance).
//
// Window shape (not specced in the doc — this engine's own design,
// resolved after user feedback): no fixed game-count cutoff, but also no
// flat unweighted cumulative sum — an exponentially-decaying (EWMA)
// accumulator instead. A flat sum was tried first and rejected: once a
// real hot stretch has accumulated a large excess, a flat sum barely
// forgets it (an additional average game only dilutes the *average* by
// 1/N, so undoing a big early excess can take vastly more games than it
// took to build — validated empirically at ~1,000+ average PA to erase a
// 5-game heater, nowhere close to "revert within a month or so"). EWMA
// fixes this: older games' influence fades geometrically every game
// (EWMA_DECAY_PER_GAME), so a real ongoing streak keeps reading as a
// streak for as long as it's actually sustained (each new game
// reinforces it, satisfying "no fixed timeline, could run a month or
// more"), while a genuine reversal shows up within a comparable few-week
// span instead of requiring an enormous pile of contrary evidence. A
// small sample (low effective PA) never confirms a tier at all regardless
// of how extreme the raw SD looks (a two-game hot stretch is not a real
// streak). See updateStreakState().

import { RATING_SCALE, HOT_COLD_TIERS, HOT_COLD_THRESHOLDS } from '../models/constants.js';
import { PA_OUTCOMES } from './plateAppearanceConstants.js';
import { computeOutcomeProbabilities } from './plateAppearance.js';

// A context-neutral reference opponent — every batter's baseline is
// computed against this, not his actual recent opponents, matching how
// real rate-stat projections are contextualized against average
// competition rather than whoever he happened to face.
const LEAGUE_AVERAGE_PITCHER = {
  ratings: {
    velocity: { current: RATING_SCALE.AVERAGE },
    control: { current: RATING_SCALE.AVERAGE },
    movement: { current: RATING_SCALE.AVERAGE },
  },
};

// wOBA-like linear weights, anchored to real modern-MLB values (outs and
// strikeouts carry no weight) — explicit placeholder, same tuning status
// as plateAppearanceConstants.js's own anchored rates.
const WOBA_WEIGHTS = Object.freeze({
  [PA_OUTCOMES.WALK]: 0.69,
  [PA_OUTCOMES.HIT_BY_PITCH]: 0.72,
  [PA_OUTCOMES.SINGLE]: 0.89,
  [PA_OUTCOMES.DOUBLE]: 1.27,
  [PA_OUTCOMES.TRIPLE]: 1.62,
  [PA_OUTCOMES.HOME_RUN]: 2.10,
});

function weightFor(outcome) {
  return WOBA_WEIGHTS[outcome] ?? 0;
}

/**
 * A batter's context-neutral per-PA composite mean and variance, computed
 * against LEAGUE_AVERAGE_PITCHER — his own statistical baseline.
 * @param {object} batter - Player
 * @returns {{mean: number, variance: number}}
 */
export function computeBaselineDistribution(batter) {
  const probabilities = computeOutcomeProbabilities(batter, LEAGUE_AVERAGE_PITCHER);
  let mean = 0;
  let meanOfSquares = 0;
  for (const [outcome, probability] of Object.entries(probabilities)) {
    const weight = weightFor(outcome);
    mean += probability * weight;
    meanOfSquares += probability * weight * weight;
  }
  return { mean, variance: Math.max(0, meanOfSquares - mean * mean) };
}

/**
 * @param {object} counts - one game's raw counts: {h, doubles, triples, hr, bb, hbp}
 * @returns {number} weighted composite total for that game
 */
export function compositeValueFromCounts({ h, doubles, triples, hr, bb, hbp }) {
  const singles = h - doubles - triples - hr;
  return (
    singles * WOBA_WEIGHTS[PA_OUTCOMES.SINGLE] +
    doubles * WOBA_WEIGHTS[PA_OUTCOMES.DOUBLE] +
    triples * WOBA_WEIGHTS[PA_OUTCOMES.TRIPLE] +
    hr * WOBA_WEIGHTS[PA_OUTCOMES.HOME_RUN] +
    bb * WOBA_WEIGHTS[PA_OUTCOMES.WALK] +
    hbp * WOBA_WEIGHTS[PA_OUTCOMES.HIT_BY_PITCH]
  );
}

/**
 * @param {number} standardDeviationsFromBaseline
 * @returns {string} one of HOT_COLD_TIERS
 */
export function classifyStreakTier(standardDeviationsFromBaseline) {
  for (const { max, tier } of HOT_COLD_THRESHOLDS) {
    if (standardDeviationsFromBaseline <= max) return tier;
  }
  return HOT_COLD_TIERS.ON_FIRE; // unreachable — last threshold's max is Infinity
}

// Per-game decay applied to the accumulator before folding in each new
// game — roughly a 2-3 week "memory" (half-life ≈ 8-9 games at 0.92).
// Explicit placeholder, needs real tuning like every other numeric
// constant in this engine.
const EWMA_DECAY_PER_GAME = 0.92;

// Below this much *effective* (decayed) PA, a reading is "unconfirmed":
// `tier` reports NEUTRAL regardless of the raw SD, since a small sample
// can swing extreme by chance alone (e.g. 4-for-4 then 1-for-4 the next
// game). Explicit placeholder, roughly "four games' worth" — needs real
// tuning like every other numeric constant in this engine.
const MIN_STREAK_SAMPLE_PA = 16;

/**
 * Folds this game's line into the batter's decaying streak accumulator and
 * recomputes the current reading. No fixed cap or hard reset — a real
 * streak keeps reading as a streak for as long as it's actually sustained
 * (each new supporting game reinforces it), while a genuine reversal fades
 * back to Neutral within a comparable few-week span (via
 * EWMA_DECAY_PER_GAME) rather than requiring an enormous pile of contrary
 * evidence. See file header for why a flat cumulative sum was rejected.
 * @param {{effectivePa: number, effectiveTotal: number}|null} priorAccumulator - this player's current decaying accumulator, or null/undefined if none yet
 * @param {object} gameLine - this game's raw counts: {pa,h,doubles,triples,hr,bb,hbp} (only call for games where pa > 0)
 * @param {object} batter - Player, for the baseline distribution
 * @returns {{accumulator: {effectivePa: number, effectiveTotal: number}, streakState: {baselineCompositeValue: number, recentCompositeValue: number|null, standardDeviationsFromBaseline: number, tier: string}}}
 */
export function updateStreakState(priorAccumulator, gameLine, batter) {
  const { mean, variance } = computeBaselineDistribution(batter);
  const gameActual = compositeValueFromCounts(gameLine);

  const effectivePa = (priorAccumulator?.effectivePa ?? 0) * EWMA_DECAY_PER_GAME + gameLine.pa;
  const effectiveTotal = (priorAccumulator?.effectiveTotal ?? 0) * EWMA_DECAY_PER_GAME + gameActual;
  const accumulator = { effectivePa, effectiveTotal };

  if (effectivePa === 0 || variance === 0) {
    return {
      accumulator,
      streakState: { baselineCompositeValue: mean, recentCompositeValue: null, standardDeviationsFromBaseline: 0, tier: HOT_COLD_TIERS.NEUTRAL },
    };
  }

  const sd = Math.sqrt(effectivePa * variance);
  const standardDeviationsFromBaseline = sd > 0 ? (effectiveTotal - effectivePa * mean) / sd : 0;
  const recentCompositeValue = effectiveTotal / effectivePa;

  const hasEnoughSample = effectivePa >= MIN_STREAK_SAMPLE_PA;
  const tier = hasEnoughSample ? classifyStreakTier(standardDeviationsFromBaseline) : HOT_COLD_TIERS.NEUTRAL;

  return {
    accumulator,
    streakState: { baselineCompositeValue: mean, recentCompositeValue, standardDeviationsFromBaseline, tier },
  };
}
