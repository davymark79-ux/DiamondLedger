// Stolen bases — not specced in any design doc (only managers.md mentions
// a future Steal Aggressiveness manager slider that will eventually consume
// this); this engine's own placeholder decision/resolution logic, same
// tuning status as pitchingChanges.js/hitterChanges.js's own un-specced
// substitution logic.
//
// v1 scope, explicitly limited (see baseball_sim_engine_build_order memory
// for the reasoning): only 1st->2nd and 2nd->3rd. Steals of home are rare,
// situational (suicide-squeeze territory), and deferred. Because a runner
// can only attempt when the very next base is open, and the two situations
// below are mutually exclusive by base-occupancy construction, there is at
// most one steal opportunity per plate appearance — no simultaneous double
// steals modeled.

import { RATING_SCALE } from '../models/constants.js';
import { PROBABILITY_FLOOR, PROBABILITY_CEILING } from './plateAppearanceConstants.js';
import { speedComposite } from './hitterChanges.js';

function clampProbability(p) {
  return Math.min(PROBABILITY_CEILING, Math.max(PROBABILITY_FLOOR, p));
}

// Illustrative placeholders, same "needs real tuning" status as every other
// numeric constant in this engine. 2nd->3rd is deliberately rarer-attempted
// and a bit riskier than 1st->2nd — less strategic incentive (already in
// scoring position via a single) and a shorter throw for the catcher.
const SITUATIONS = Object.freeze({
  FIRST_TO_SECOND: Object.freeze({ baseAttemptRate: 0.05, baseSuccessRate: 0.72 }),
  SECOND_TO_THIRD: Object.freeze({ baseAttemptRate: 0.02, baseSuccessRate: 0.68 }),
});

const STEAL_ATTEMPT_SENSITIVITY = 0.002; // per rating point of runner composite above/below average
const STEAL_ATTEMPT_MAX_SCORE_MARGIN = 5; // batting team's own lead/deficit — not worth the risk in a blowout either way

// managers.md's Steal Aggressiveness slider — the cleanest 1:1 mapping of
// any slider, added straight to the base attempt rate. Neutral (50)
// reproduces the pre-Manager-entity fixed baseline exactly.
const STEAL_AGGRESSIVENESS_SENSITIVITY = 0.0016; // attempt-rate points per slider point away from neutral (50)
const MANAGER_SLIDER_NEUTRAL = 50; // MANAGER_ATTRIBUTE_SCALE.AVERAGE

const STEAL_SUCCESS_RUNNER_VS_CATCHER_SENSITIVITY = 0.004;
const STEAL_SUCCESS_PITCHER_HOLD_SENSITIVITY = 0.002; // smaller — Control is a rough stand-in, not a dedicated attribute

// Catcher's own arm composite — Arm Strength/Accuracy's first real gameplay
// mechanical use anywhere in this engine (previously only fed
// positionReassignment.js's fit-scoring weights, never an actual outcome).
const CATCHER_ARM_WEIGHTS = Object.freeze({ armStrength: 0.6, armAccuracy: 0.4 });

function weightedComposite(player, weights) {
  return Object.entries(weights).reduce(
    (sum, [attr, weight]) => sum + (player.ratings[attr]?.current ?? RATING_SCALE.AVERAGE) * weight,
    0
  );
}

function catcherArmComposite(catcher) {
  return weightedComposite(catcher, CATCHER_ARM_WEIGHTS);
}

/**
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @returns {{runner: object, situation: object, situationName: string}|null}
 */
export function identifyStealOpportunity(bases) {
  if (bases.first && !bases.second) {
    return { runner: bases.first, situation: SITUATIONS.FIRST_TO_SECOND, situationName: 'FIRST_TO_SECOND' };
  }
  if (bases.second && !bases.third) {
    return { runner: bases.second, situation: SITUATIONS.SECOND_TO_THIRD, situationName: 'SECOND_TO_THIRD' };
  }
  return null;
}

/**
 * @param {object} runner - Player
 * @param {object} situation - one of SITUATIONS' values
 * @param {number} scoreMargin - the batting team's own score minus the opponent's
 * @param {number} [stealAggressiveness] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50).
 * @returns {number} probability [0, 1) that this runner attempts a steal this PA
 */
export function computeStealAttemptProbability(runner, situation, scoreMargin, stealAggressiveness = MANAGER_SLIDER_NEUTRAL) {
  if (Math.abs(scoreMargin) > STEAL_ATTEMPT_MAX_SCORE_MARGIN) return 0;
  const diff = speedComposite(runner) - RATING_SCALE.AVERAGE;
  const managerShift = (stealAggressiveness - MANAGER_SLIDER_NEUTRAL) * STEAL_AGGRESSIVENESS_SENSITIVITY;
  return clampProbability(situation.baseAttemptRate + diff * STEAL_ATTEMPT_SENSITIVITY + managerShift);
}

/**
 * @param {object} runner - Player
 * @param {object} catcher - Player (uses ratings.armStrength/armAccuracy.current)
 * @param {object} pitcher - Player (uses ratings.control.current)
 * @param {object} situation - one of SITUATIONS' values
 * @returns {number} probability [0, 1) the attempt succeeds
 */
export function computeStealSuccessRate(runner, catcher, pitcher, situation) {
  const runnerVsCatcherDiff = speedComposite(runner) - catcherArmComposite(catcher);
  const pitcherHoldDiff = RATING_SCALE.AVERAGE - pitcher.ratings.control.current; // better control -> quicker/more disciplined to the plate -> lower success rate
  return clampProbability(
    situation.baseSuccessRate +
      runnerVsCatcherDiff * STEAL_SUCCESS_RUNNER_VS_CATCHER_SENSITIVITY +
      pitcherHoldDiff * STEAL_SUCCESS_PITCHER_HOLD_SENSITIVITY
  );
}
