// Times-Through-The-Order Penalty (TTOP) — a real, well-documented effect
// (Lichtman, Carleton, et al.) where batters perform measurably better
// against a pitcher each time they see him again in the same game,
// independent of pure pitch-count fatigue. pitcherFatigue.js models the
// physical-tiredness axis; this module models the separate batter-
// familiarity axis — a pitcher can be barely fatigued in pitch-count terms
// and still decline because hitters have adjusted to him a third time
// through the lineup.
//
// Pitchability (added alongside Velocity/Control/Movement/Stamina — see
// models/constants.js) tempers how much a given pitcher suffers from it: a
// "pitchability" ace — the profile a Gerrit-Cole type represents, mixing
// and sequencing well, adapting mid-start — holds up far better the 3rd
// time through than a more one-dimensional "here's my best pitch" thrower
// who's easier to sit on once hitters have seen him twice.

import { RATING_SCALE } from '../models/constants.js';

// Cumulative rating-point penalty by trip through the order (0-indexed:
// index 0 = first 9 batters faced, 1 = second trip, etc.), at average
// (50) Pitchability. Placeholder, directionally sized off real research
// showing each trip costs a further step beyond what pure fatigue predicts
// this early in a start.
const TTOP_PENALTY_BY_TRIP = Object.freeze([0, 3, 7, 11]);

/**
 * @param {number} battersFacedByThisPitcher - this pitcher's own cumulative batters faced
 * @param {number} [lineupSize]
 * @returns {number} 0-indexed trip number (0 = first time through)
 */
export function computeTimesThroughOrder(battersFacedByThisPitcher, lineupSize = 9) {
  return Math.floor(battersFacedByThisPitcher / lineupSize);
}

// 50 (average Pitchability) -> no adjustment to the base penalty. 80 (elite,
// Cole-type) -> well under half. 20 (one-dimensional) -> modestly worse than
// the population baseline, not just "average" — a hitter-adjustment effect
// that a pure stuff-only pitcher is more exposed to, not less.
function pitchabilityResistanceFactor(pitchability) {
  const factor = 1 - (pitchability - RATING_SCALE.AVERAGE) * 0.02;
  return Math.min(1.3, Math.max(0.35, factor));
}

/**
 * @param {number} battersFacedByThisPitcher - this pitcher's own cumulative batters faced
 * @param {number} pitchability
 * @param {number} [lineupSize]
 * @returns {number} rating-point penalty (applied to velocity/control/movement)
 */
export function computeTtopPenalty(battersFacedByThisPitcher, pitchability, lineupSize = 9) {
  const trip = Math.min(TTOP_PENALTY_BY_TRIP.length - 1, computeTimesThroughOrder(battersFacedByThisPitcher, lineupSize));
  const basePenalty = TTOP_PENALTY_BY_TRIP[trip];
  return basePenalty * pitchabilityResistanceFactor(pitchability);
}
