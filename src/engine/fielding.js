// Fielding / positioning (Defensive Management) — not specced in any design
// doc (only managers.md's one-line Defensive Management slider mention);
// this engine's own placeholder logic, same status as bunting.js/
// stolenBases.js. Until this module, defense had zero mechanical effect on
// any outcome anywhere in this engine (see plateAppearance.js/
// baserunning.js's own long-standing header notes) — Fielding/Arm Strength/
// Arm Accuracy's first real effect on any outcome; previously they only fed
// positionReassignment.js's fit-scoring weights, never an actual result.
//
// v1 scope: team-wide defensive quality (no per-play "which specific
// fielder" resolution — this engine has no batted-ball-location model to
// support that), errors, and three situational positioning tactics that
// don't require batter spray-tendency data: no-doubles (deep outfield
// positioning late with a lead), double-play depth (a direct extension of
// baserunning.js's existing rollDoublePlayChance, not a new decision), and
// infield-in (trading a run-prevention throw home for a baserunner). Pull-
// based shifts are out of scope — no spray-tendency data exists to react to.

import { RATING_SCALE } from '../models/constants.js';
import { PROBABILITY_FLOOR, PROBABILITY_CEILING } from './plateAppearanceConstants.js';

function clampProbability(p) {
  return Math.min(PROBABILITY_CEILING, Math.max(PROBABILITY_FLOOR, p));
}

const DEFENSE_COMPOSITE_WEIGHTS = Object.freeze({ fielding: 0.6, armStrength: 0.2, armAccuracy: 0.2 });

function isTrueFielder(player) {
  return player.primaryPosition !== 'DH' && !player.isPitcher;
}

/**
 * Team-wide defensive quality — the 8 real fielders currently on the field
 * (excludes DH, who never fields, and the pitcher, whose own fielding
 * isn't separately modeled here). Fielding/Arm Strength/Arm Accuracy's
 * first real effect on any outcome anywhere in this engine.
 * @param {object} defense - a game.js side object (uses .lineup)
 * @returns {number} 20-80 scale composite
 */
export function computeTeamDefenseComposite(defense) {
  const fielders = defense.lineup.filter(isTrueFielder);
  if (fielders.length === 0) return RATING_SCALE.AVERAGE; // graceful fallback, shouldn't happen with real roster construction
  const total = fielders.reduce(
    (sum, player) =>
      sum +
      Object.entries(DEFENSE_COMPOSITE_WEIGHTS).reduce(
        (acc, [attr, weight]) => acc + (player.ratings[attr]?.current ?? RATING_SCALE.AVERAGE) * weight,
        0
      ),
    0
  );
  return total / fielders.length;
}

// Matches hitterChanges.js's existing "innings from end" convention.
// Neutral default — see managers.md's Defensive Management slider below.
const POSITIONING_INNINGS_FROM_END = 2;
// Infield-in is used when preventing that run matters a lot — tied or down
// by a modest amount, not when comfortably ahead or hopelessly behind.
// Neutral default — see managers.md's Defensive Management slider below.
const INFIELD_IN_MAX_DEFICIT = 2;

// managers.md's Defensive Management slider — "straight away <-> heavy
// defensive micromanagement." Both trigger windows widen with the slider:
// a high-Defensive-Management manager starts applying positioning tactics
// earlier and tolerates a wider deficit; a low one barely bothers at all.
// Neutral (50) reproduces the pre-Manager-entity fixed windows exactly.
const DEFENSIVE_MANAGEMENT_SENSITIVITY = 0.04; // window points per slider point away from neutral (50)
const MANAGER_SLIDER_NEUTRAL = 50; // MANAGER_ATTRIBUTE_SCALE.AVERAGE

function effectiveWindow(baseWindow, defensiveManagement) {
  return Math.max(0, Math.round(baseWindow + (defensiveManagement - MANAGER_SLIDER_NEUTRAL) * DEFENSIVE_MANAGEMENT_SENSITIVITY));
}

function isLate(inning, scheduledInnings, defensiveManagement) {
  return inning >= scheduledInnings - effectiveWindow(POSITIONING_INNINGS_FROM_END, defensiveManagement);
}

/**
 * Deep/no-doubles outfield positioning — defense is protecting a late lead.
 * @param {object} defense - side object (uses .runsTotal)
 * @param {object} offense - side object (uses .runsTotal)
 * @param {number} inning
 * @param {number} scheduledInnings
 * @param {number} [defensiveManagement] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50).
 * @returns {boolean}
 */
export function isNoDoublesActive(defense, offense, inning, scheduledInnings, defensiveManagement = MANAGER_SLIDER_NEUTRAL) {
  return defense.runsTotal > offense.runsTotal && isLate(inning, scheduledInnings, defensiveManagement);
}

/**
 * Infield-in positioning — defense is tied or down by a modest margin late,
 * trying to cut down a run at the plate rather than concede it. Naturally
 * mutually exclusive with isNoDoublesActive by score-margin sign (a
 * leading defense never plays infield-in).
 * @param {object} defense - side object (uses .runsTotal)
 * @param {object} offense - side object (uses .runsTotal)
 * @param {number} inning
 * @param {number} scheduledInnings
 * @param {number} [defensiveManagement] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50).
 * @returns {boolean}
 */
export function isInfieldInActive(defense, offense, inning, scheduledInnings, defensiveManagement = MANAGER_SLIDER_NEUTRAL) {
  const defenseLeadMargin = defense.runsTotal - offense.runsTotal;
  const maxDeficit = effectiveWindow(INFIELD_IN_MAX_DEFICIT, defensiveManagement);
  return defenseLeadMargin <= 0 && defenseLeadMargin >= -maxDeficit && isLate(inning, scheduledInnings, defensiveManagement);
}

// Illustrative placeholder, loosely anchored to real team error rates —
// needs real tuning like every other numeric constant in this engine.
const BASE_ERROR_RATE = 0.02;
const ERROR_RATE_SENSITIVITY = 0.0006; // per defense-composite point above/below average

/**
 * Rolled once per ball-in-play out (see game.js) — a below-average defense
 * commits more errors, converting what should have been a routine out into
 * the batter (and any forced runners) reaching instead.
 * @param {number} defenseComposite
 * @returns {number} probability [0, 1)
 */
export function computeErrorChance(defenseComposite) {
  return clampProbability(BASE_ERROR_RATE + (RATING_SCALE.AVERAGE - defenseComposite) * ERROR_RATE_SENSITIVITY);
}
