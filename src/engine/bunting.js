// Bunting / small ball — not specced in any design doc (only managers.md
// mentions a future Small-Ball Tendency manager slider); this engine's own
// placeholder decision/resolution logic, same status as stolenBases.js's
// own un-specced approach.
//
// v1 scope, confirmed with the user: includes the suicide/safety squeeze
// (bunting with a runner on 3rd to score him) as a single higher-drama
// "runner unconditionally breaks" mode — no separate lower-risk safety-
// squeeze variant, since no Manager entity exists yet to drive that finer
// distinction. Bunting-for-a-hit (an offensive weapon, not a sacrifice) is
// out of scope, a distinct decision from what's modeled here.
//
// Real-baseball factors the user asked to have reflected: speed correlates
// with bunting proficiency (see buntComposite below); Foundry teams
// (no-DH, "manufacture runs" league identity) bunt more, especially with a
// weak-hitting pitcher at the plate; and a late-game, runner-on-first-only,
// 0-1-out situation is a classic high-value "get him into scoring
// position" spot, not just a generic any-time tactic.

import { RATING_SCALE } from '../models/constants.js';
import { PROBABILITY_FLOOR, PROBABILITY_CEILING } from './plateAppearanceConstants.js';

function clampProbability(p) {
  return Math.min(PROBABILITY_CEILING, Math.max(PROBABILITY_FLOOR, p));
}

// Bunting and speed correlate in reality (fast players/burners bunt more
// and better) — modeled at the formula level via this composite rather
// than correlating buntingSkill's own generation with speed (a bigger,
// riskier change to playerGenerator.js's uniform per-attribute generation
// sweep). Deliberately not also correlating generation itself — a real,
// conscious scoping choice, not an oversight.
const BUNT_COMPOSITE_WEIGHTS = Object.freeze({ buntingSkill: 0.7, speed: 0.3 });

function buntComposite(player) {
  return Object.entries(BUNT_COMPOSITE_WEIGHTS).reduce(
    (sum, [attr, weight]) => sum + (player.ratings[attr]?.current ?? RATING_SCALE.AVERAGE) * weight,
    0
  );
}

// Illustrative placeholders, same "needs real tuning" status as every
// other numeric constant in this engine. SQUEEZE is deliberately rarer —
// a runner on third is on the line if it fails.
const SITUATION_BASE_ATTEMPT_RATES = Object.freeze({ PLAIN: 0.05, SQUEEZE: 0.015 });
const BUNT_ATTEMPT_SENSITIVITY = 0.0025; // per buntComposite point above/below average
// Trading a guaranteed out for one base is a conservative tactic — tighter
// than stolen bases' own score-margin gate (5), not worth it outside a
// genuinely close game.
const SAC_BUNT_MAX_SCORE_MARGIN = 3;
const FOUNDRY_ATTEMPT_BONUS = 0.03; // this league's established small-ball identity
// A batting pitcher only ever occurs in a Foundry (no-DH) game already —
// this bonus naturally stacks on top of FOUNDRY_ATTEMPT_BONUS rather than
// needing to duplicate that reasoning.
const PITCHER_BATTING_ATTEMPT_BONUS = 0.15;
// Matches hitterChanges.js's existing "innings from end" convention
// (PINCH_HIT_INNINGS_FROM_END etc.) for what counts as "late."
const MANUFACTURE_RUN_LATE_INNING_THRESHOLD = 2;
const MANUFACTURE_RUN_BONUS = 0.05;

// managers.md's Small-Ball Tendency slider — added straight to the
// attempt rate, same "cleanest 1:1 mapping" treatment as Steal
// Aggressiveness in stolenBases.js. Neutral (50) reproduces the
// pre-Manager-entity fixed baseline exactly.
const SMALL_BALL_TENDENCY_SENSITIVITY = 0.002; // attempt-rate points per slider point away from neutral (50)
const MANAGER_SLIDER_NEUTRAL = 50; // MANAGER_ATTRIBUTE_SCALE.AVERAGE

const BUNT_SUCCESS_BASE_RATE = 0.75;
const BUNT_SUCCESS_SENSITIVITY = 0.004; // per buntComposite point above/below average

/**
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @param {number} outs - outs already recorded this half-inning (0-2)
 * @returns {{situationName: 'PLAIN'|'SQUEEZE'}|null}
 */
export function identifyBuntSituation(bases, outs) {
  if (outs > 1) return null;
  if (!bases.first && !bases.second && !bases.third) return null;
  return { situationName: bases.third ? 'SQUEEZE' : 'PLAIN' };
}

function isRunnerOnFirstOnly(bases) {
  return Boolean(bases.first) && !bases.second && !bases.third;
}

/**
 * @param {object} batter - Player
 * @param {string} situationName - 'PLAIN' or 'SQUEEZE'
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @param {object} context
 * @param {number} context.scoreMargin - batting team's own score minus the opponent's
 * @param {number} [context.inning]
 * @param {number} [context.scheduledInnings]
 * @param {boolean} [context.dhRule] - true = Exchange (DH), false = Foundry (no-DH); defaults true (no bonus) if unknown
 * @param {number} [context.smallBallTendency] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50).
 * @returns {number} probability [0, 1) this bunt is attempted
 */
export function computeBuntAttemptProbability(batter, situationName, bases, context) {
  if (Math.abs(context.scoreMargin) > SAC_BUNT_MAX_SCORE_MARGIN) return 0;

  let rate = SITUATION_BASE_ATTEMPT_RATES[situationName] + (buntComposite(batter) - RATING_SCALE.AVERAGE) * BUNT_ATTEMPT_SENSITIVITY;
  rate += ((context.smallBallTendency ?? MANAGER_SLIDER_NEUTRAL) - MANAGER_SLIDER_NEUTRAL) * SMALL_BALL_TENDENCY_SENSITIVITY;

  if (context.dhRule === false) rate += FOUNDRY_ATTEMPT_BONUS;
  if (batter.isPitcher) rate += PITCHER_BATTING_ATTEMPT_BONUS;

  const isLate = Number.isFinite(context.inning) && Number.isFinite(context.scheduledInnings)
    && context.inning >= context.scheduledInnings - MANUFACTURE_RUN_LATE_INNING_THRESHOLD;
  if (isRunnerOnFirstOnly(bases) && isLate) rate += MANUFACTURE_RUN_BONUS;

  return clampProbability(rate);
}

/**
 * @param {object} batter - Player
 * @returns {number} probability [0, 1) the bunt attempt is successfully laid down
 */
export function computeBuntSuccessRate(batter) {
  return clampProbability(BUNT_SUCCESS_BASE_RATE + (buntComposite(batter) - RATING_SCALE.AVERAGE) * BUNT_SUCCESS_SENSITIVITY);
}
