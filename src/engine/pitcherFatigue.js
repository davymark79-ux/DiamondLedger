// Pitcher fatigue — baseball-sim-design-doc.md's Sim Engine section:
// "Pitcher fatigue: tracked by pitch count... feeding an injury-risk check
// at fatigue thresholds." The injury-risk check itself belongs to
// injuries.md and isn't modeled here — this only tracks pitch count and
// applies a performance decline as it climbs, so a start "feels" like it
// tires out late; a future layer can hook an injury-risk check into it.

import { withPerformanceModifiers } from './consistency.js';

// Rough average pitches per PA by outcome (real MLB average is ~3.9 overall).
const PITCH_COUNT_BASELINE = Object.freeze({
  STRIKEOUT: 5,
  WALK: 5.5,
  HIT_BY_PITCH: 4,
  OUT: 3.2,
  SINGLE: 3.2,
  DOUBLE: 3.2,
  TRIPLE: 3.2,
  HOME_RUN: 3.2,
});

/**
 * @param {string} outcome - PA_OUTCOMES
 * @param {() => number} rng
 * @returns {number} integer pitch count for this PA
 */
export function estimatePitchCount(outcome, rng) {
  const base = PITCH_COUNT_BASELINE[outcome] ?? 3.5;
  const jitter = rng() * 2.5 - 1; // roughly [-1, 1.5)
  return Math.max(1, Math.round(base + jitter));
}

// Pitches a pitcher can throw before fatigue starts degrading his stuff,
// scaled by Stamina (20-80). Placeholder linear mapping.
export function enduranceThreshold(stamina) {
  return 60 + (stamina - 50) * 0.6;
}

const FATIGUE_PENALTY_PER_PITCH_OVER = 0.2;
const MAX_FATIGUE_PENALTY = 28;

/**
 * Rating-point penalty from fatigue at a given pitch count — 0 until the
 * stamina-scaled endurance threshold is passed, then climbs, capped.
 * @param {number} stamina
 * @param {number} pitchesThrownSoFar
 * @returns {number}
 */
export function computeFatiguePenalty(stamina, pitchesThrownSoFar) {
  const threshold = enduranceThreshold(stamina);
  if (pitchesThrownSoFar <= threshold) return 0;
  return Math.min(MAX_FATIGUE_PENALTY, (pitchesThrownSoFar - threshold) * FATIGUE_PENALTY_PER_PITCH_OVER);
}

/**
 * Returns a fatigue-adjusted clone of `pitcher` (velocity/control/movement
 * reduced once pitch count exceeds his stamina-scaled endurance threshold),
 * or `pitcher` itself unchanged if he isn't fatigued yet.
 * @param {object} pitcher - Player
 * @param {number} pitchesThrownSoFar
 * @returns {object} Player
 */
export function applyFatigue(pitcher, pitchesThrownSoFar) {
  const penalty = computeFatiguePenalty(pitcher.ratings.stamina.current, pitchesThrownSoFar);
  if (penalty === 0) return pitcher;
  return withPerformanceModifiers(pitcher, { velocity: -penalty, control: -penalty, movement: -penalty });
}
