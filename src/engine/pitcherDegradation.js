// Combines the two distinct axes of in-game pitcher decline into one applied
// penalty: pitcherFatigue.js (physical tiredness, driven by pitch count and
// Stamina) and timesThroughOrder.js (batter familiarity, driven by trips
// through the lineup and Pitchability). Real research shows these are
// separate effects, not the same thing measured twice — a pitcher can be
// barely fatigued in pure pitch-count terms and still decline because
// hitters have adjusted to him a third time through.

import { computeFatiguePenalty } from './pitcherFatigue.js';
import { computeTtopPenalty } from './timesThroughOrder.js';
import { withPerformanceModifiers } from './consistency.js';

const MAX_COMBINED_DEGRADATION_PENALTY = 35;

/**
 * @param {object} pitcher - Player
 * @param {number} pitchesThrown
 * @param {number} battersFaced
 * @returns {number} combined, capped rating-point penalty
 */
export function computeDegradationPenalty(pitcher, pitchesThrown, battersFaced) {
  const fatiguePenalty = computeFatiguePenalty(pitcher.ratings.stamina.current, pitchesThrown);
  const ttopPenalty = computeTtopPenalty(battersFaced, pitcher.ratings.pitchability.current);
  return Math.min(MAX_COMBINED_DEGRADATION_PENALTY, fatiguePenalty + ttopPenalty);
}

/**
 * Returns a degraded clone of `pitcher` (velocity/control/movement reduced
 * by the combined fatigue + TTOP penalty), or `pitcher` unchanged if neither
 * applies yet.
 * @param {object} pitcher - Player
 * @param {number} pitchesThrown
 * @param {number} battersFaced
 * @returns {object} Player
 */
export function applyInGameDegradation(pitcher, pitchesThrown, battersFaced) {
  const penalty = computeDegradationPenalty(pitcher, pitchesThrown, battersFaced);
  if (penalty === 0) return pitcher;
  return withPerformanceModifiers(pitcher, { velocity: -penalty, control: -penalty, movement: -penalty });
}
