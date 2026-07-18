// Position-player fatigue — injuries.md's "Position Player Fatigue" section:
// a deliberately lighter-touch companion to pitcher fatigue (pitcherFatigue.js).
// Tracks consecutive games played (owned by the season loop, see
// engine/season.js's consecutiveGamesPlayedById) and, once a player has
// strung together enough of them without a rest, applies a small performance
// dip and a slight injury-risk bump — "not every player is Cal Ripken," not a
// punishing system.
//
// Auto-rest (managers.md's Analytics vs. Feel slider): computeRestProbability/
// rollRest below let a manager proactively bench a fatigued player before a
// game — see engine/season.js's resolveRestedRoster, which actually performs
// the swap. Zero at/below a neutral (50) slider value, since there's no prior
// "old behavior" to preserve here (nothing ever auto-rested before this) —
// only an Analytics-leaning manager (>50) starts managing workload
// proactively; a Feel-leaning one just keeps running his regulars out,
// matching today's pre-Manager-entity behavior exactly.

import { withPerformanceModifiers } from './consistency.js';
import { HITTING_ATTRIBUTES, BASERUNNING_ATTRIBUTES, DEFENSE_ATTRIBUTES } from '../models/constants.js';

// No penalty until a player has this many *prior* consecutive games under
// his belt (i.e. this is his 7th-or-later straight start).
const REST_THRESHOLD_GAMES = 6;
const FATIGUE_PENALTY_PER_GAME_OVER = 0.5;
// Deliberately much smaller than pitcher fatigue's 28-point cap — per the
// doc, "meaningfully smaller than the pitcher fatigue effect." Exported so
// computeRestProbability below can express fatigue severity as a fraction
// of this cap, rather than a second "how many games over" constant.
export const MAX_FATIGUE_PENALTY = 5;

/**
 * @param {number} consecutiveGamesPlayed - games started prior to this one, in a row, without a rest
 * @returns {number} rating-point penalty, 0 until the rest threshold, then climbs, capped
 */
export function computeFatiguePenalty(consecutiveGamesPlayed) {
  if (consecutiveGamesPlayed <= REST_THRESHOLD_GAMES) return 0;
  const gamesOver = consecutiveGamesPlayed - REST_THRESHOLD_GAMES;
  return Math.min(MAX_FATIGUE_PENALTY, gamesOver * FATIGUE_PENALTY_PER_GAME_OVER);
}

// Deliberately much smaller than pitcher fatigue's 0.06 risk scale — same
// "meaningfully smaller" direction as the performance penalty above.
const FATIGUE_RISK_SCALE = 0.03;

/**
 * @param {number} consecutiveGamesPlayed
 * @returns {number} multiplier on base injury risk, 1 (neutral) when not fatigued
 */
export function computeFatigueRiskMultiplier(consecutiveGamesPlayed) {
  return 1 + computeFatiguePenalty(consecutiveGamesPlayed) * FATIGUE_RISK_SCALE;
}

const FATIGUE_ATTRIBUTES = [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];

/**
 * Returns a fatigue-adjusted clone of `player` (every on-field physical
 * attribute nudged down by a flat amount once he's past the rest threshold),
 * or `player` itself unchanged if he isn't fatigued yet. Deliberately a flat
 * deterministic penalty across all of HITTING_ATTRIBUTES/
 * BASERUNNING_ATTRIBUTES/DEFENSE_ATTRIBUTES, not an independent per-attribute
 * roll like consistency.js's applyGamePerformance — this is a workload
 * penalty, not a talent-consistency swing.
 * @param {object} player - Player
 * @param {number} consecutiveGamesPlayed
 * @returns {object} Player
 */
export function applyFatigue(player, consecutiveGamesPlayed) {
  const penalty = computeFatiguePenalty(consecutiveGamesPlayed);
  if (penalty === 0) return player;
  const deltas = {};
  for (const attribute of FATIGUE_ATTRIBUTES) deltas[attribute] = -penalty;
  return withPerformanceModifiers(player, deltas);
}

// Even a maximally-fatigued player under a fully-Analytics-leaning manager
// isn't a guaranteed sit — some real-world unpredictability/stubbornness
// even for a load-management-minded skipper. Illustrative placeholder, same
// tuning status as every other numeric constant in this project.
const REST_PROBABILITY_SCALE = 0.6;
const MANAGER_SLIDER_NEUTRAL = 50; // MANAGER_ATTRIBUTE_SCALE.AVERAGE

/**
 * @param {number} consecutiveGamesPlayed
 * @param {number} [analyticsVsFeel] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50 -> 0).
 * @returns {number} probability [0, 1) this player is proactively rested this game
 */
export function computeRestProbability(consecutiveGamesPlayed, analyticsVsFeel = MANAGER_SLIDER_NEUTRAL) {
  const fatigueFraction = computeFatiguePenalty(consecutiveGamesPlayed) / MAX_FATIGUE_PENALTY;
  const analyticsFraction = Math.max(0, (analyticsVsFeel - MANAGER_SLIDER_NEUTRAL) / (100 - MANAGER_SLIDER_NEUTRAL));
  return fatigueFraction * analyticsFraction * REST_PROBABILITY_SCALE;
}

/**
 * @param {number} consecutiveGamesPlayed
 * @param {number} analyticsVsFeel
 * @param {() => number} rng
 * @returns {boolean}
 */
export function rollRest(consecutiveGamesPlayed, analyticsVsFeel, rng) {
  return rng() < computeRestProbability(consecutiveGamesPlayed, analyticsVsFeel);
}
