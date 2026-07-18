// Position/Role Reassignment — an output of a development period, not a
// separate simulated event. Two mechanisms are in scope per this project's
// scoping decision (see memory: growth_model_scope.md): performance/fit-
// driven and aging-driven reassignment. Org-depth-driven and (the roster-
// system half of) injury-driven reassignment stay out of scope — they need
// Team roster-depth and deeper Injuries integration that don't exist yet.
//
// Both in-scope mechanisms reduce to the same signal: current role-relevant
// ratings vs. the demands of the current spot vs. a bounded set of adjacent
// spots. Aging doesn't need a separate code path — it just changes the
// ratings that feed this same fit check (via growthModel.js's age curve),
// and so does an injury-driven decline via that module's `injuryImpact`
// hook. That's also why Catcher now has real outgoing edges here: the
// trigger for a catcher move is "his tools declined and here's where he
// fits now," not org depth, so it's in scope.
//
// Bounded, explicitly-enumerated defensive-spectrum adjacency (not an open
// graph) + hysteresis (cooldown + a consecutive-period confirmation
// requirement + asymmetric thresholds) so this doesn't flip-flop.

import { RATING_SCALE } from '../models/constants.js';

/** @param {object} [overrides] @returns {object} RoleAssignmentState */
export function createRoleAssignmentState(overrides = {}) {
  return {
    periodsAtCurrentPosition: overrides.periodsAtCurrentPosition ?? 0,
    pendingRecommendation: overrides.pendingRecommendation ?? null,
    pendingStreak: overrides.pendingStreak ?? 0,
  };
}

// Hysteresis constants — all placeholders pending playtesting.
const MIN_PERIODS_BETWEEN_REASSIGNMENTS = 3; // hard cooldown regardless of signal strength
const CONFIRMATION_PERIODS_REQUIRED = 2; // same recommendation must recur this many consecutive periods
const MIN_SIGNAL_MARGIN_DOWNSHIFT = 5; // pitcher role check only, see below: moving to LESS demand, lower bar
const MIN_SIGNAL_MARGIN_UPSHIFT = 10; // pitcher role check only: moving to MORE demand, higher bar, needs real proof
const RP_TO_SP_MIN_ABSOLUTE_STAMINA = 55; // extra absolute gate on the RP->SP upshift specifically

// Bill-James-style defensive spectrum demand scalar — DH easiest, C hardest.
// Only used to decide upshift-vs-downshift direction for the asymmetric
// thresholds above, not as a fit score itself.
const POSITION_DEFENSIVE_DEMAND = Object.freeze({ DH: 0, '1B': 10, LF: 25, RF: 35, '3B': 45, '2B': 55, CF: 55, SS: 70, C: 80 });

// Bounded, explicit adjacency graph — exactly the moves in scope. C->1B/3B
// are real-world "converted catcher" landing spots (wear/injury-driven,
// not org depth). SS/2B/3B kept bidirectional since infield fit shifts,
// unlike aging outfield/1B moves, aren't inherently one-directional.
const DEFENSIVE_SPECTRUM_ADJACENCY = Object.freeze({
  CF: ['LF', 'RF'],
  LF: ['CF', 'RF', '1B'],
  RF: ['CF', 'LF', '1B'],
  '1B': ['LF', 'RF'],
  '2B': ['SS', '3B'],
  SS: ['2B', '3B'],
  '3B': ['2B', 'SS'],
  C: ['1B', '3B'],
  DH: [],
});

// Position-specific defensive-tool weights (pure defensive fit — offense
// isn't considered here, that's a roster-value decision for a future
// system). Every position's weights sum to 1.0 so fit scores land on a
// comparable 20-80-ish scale regardless of position — comparisons across
// positions use adequateFitThreshold() below, not raw fit magnitude, so
// this only needs to get each position's *relative emphasis* right, not an
// absolute scale. 1B deliberately de-emphasizes range/reflexes (fielding)
// relative to Catcher — real 1B defensive demand is mostly "catch throws
// cleanly" (accuracy/hands), not range, which is the whole reason it's a
// classic soft landing spot for a defensively-declined player.
const POSITION_TOOL_WEIGHTS = Object.freeze({
  CF: { speed: 0.5, fielding: 0.4, armStrength: 0.05, armAccuracy: 0.05 },
  LF: { speed: 0.25, fielding: 0.45, armStrength: 0.2, armAccuracy: 0.1 },
  RF: { speed: 0.2, fielding: 0.35, armStrength: 0.35, armAccuracy: 0.1 },
  '1B': { speed: 0.05, fielding: 0.35, armStrength: 0.1, armAccuracy: 0.5 },
  '2B': { speed: 0.35, fielding: 0.45, armStrength: 0.05, armAccuracy: 0.15 },
  SS: { speed: 0.35, fielding: 0.4, armStrength: 0.15, armAccuracy: 0.1 },
  '3B': { speed: 0.1, fielding: 0.35, armStrength: 0.35, armAccuracy: 0.2 },
  C: { fielding: 0.55, armAccuracy: 0.3, armStrength: 0.15 }, // no speed weight — irrelevant behind the plate
});

// A position's "adequate" fit bar scales with its defensive demand — a
// demanding position (C, SS) requires a much higher composite score to be
// considered adequately staffed than an easy one (1B). This is what lets a
// defensively-declined player look "no longer adequate" at his current spot
// while looking "just fine" at an easier one, even though the two positions
// weight tools completely differently and aren't otherwise on a shared
// scale. Placeholder linear mapping, needs real playtesting.
const ADEQUATE_FIT_INTERCEPT = 25;
const ADEQUATE_FIT_SLOPE = 0.35;
function adequateFitThreshold(position) {
  return ADEQUATE_FIT_INTERCEPT + POSITION_DEFENSIVE_DEMAND[position] * ADEQUATE_FIT_SLOPE;
}

const PITCHER_ROLE_TOOL_WEIGHTS = Object.freeze({
  SP: { stamina: 0.5, control: 0.25, pitchability: 0.25 },
  RP: { velocity: 0.6, movement: 0.2, control: 0.2 },
});
const PITCHER_ROLE_DEMAND = Object.freeze({ RP: 0, SP: 1 }); // SP = upshift target (bigger ask), RP = downshift target

function weightedFit(ratings, weights) {
  return Object.entries(weights).reduce((sum, [attr, weight]) => sum + (ratings[attr]?.current ?? RATING_SCALE.AVERAGE) * weight, 0);
}

/** @returns {number|null} weighted defensive-fit composite, or null for an unweighted position (e.g. DH) */
export function computeDefensiveFit(player, position) {
  const weights = POSITION_TOOL_WEIGHTS[position];
  return weights ? weightedFit(player.ratings, weights) : null;
}

/** @returns {number} weighted role-fit composite for 'SP' or 'RP' */
export function computePitcherRoleFit(pitcher, role) {
  return weightedFit(pitcher.ratings, PITCHER_ROLE_TOOL_WEIGHTS[role]);
}

// Shared hysteresis application: given a "best candidate this period" (or
// null), enforces the confirmation requirement, returns the verdict plus
// the next RoleAssignmentState for the caller to persist. Cooldown itself
// is checked by the caller before this runs (see the two evaluate*
// functions below) since it gates entry, not the recommendation itself.
function applyHysteresis(state, best) {
  if (!best) {
    return {
      recommendedPosition: null,
      reason: null,
      direction: null,
      nextRoleState: { ...state, pendingRecommendation: null, pendingStreak: 0 },
    };
  }

  const pendingStreak = state.pendingRecommendation === best.candidate ? state.pendingStreak + 1 : 1;

  if (pendingStreak >= CONFIRMATION_PERIODS_REQUIRED) {
    return {
      recommendedPosition: best.candidate,
      reason: `${best.direction}:margin=${best.margin.toFixed(1)}`,
      direction: best.direction,
      // Reset to a fresh cooldown — whether accepted or refused, the caller
      // (reassignmentReaction.js / development.js) treats this recommendation
      // as "consumed" either way.
      nextRoleState: createRoleAssignmentState(),
    };
  }
  return {
    recommendedPosition: null,
    reason: 'pending-confirmation',
    direction: best.direction,
    nextRoleState: { periodsAtCurrentPosition: state.periodsAtCurrentPosition, pendingRecommendation: best.candidate, pendingStreak },
  };
}

/**
 * @param {object} player - Player
 * @param {object} [roleState] - from createRoleAssignmentState()
 * @param {object} [options]
 * @param {boolean} [options.dhAllowed] - default true; caller can gate by league DH rules
 * @returns {{recommendedPosition: string|null, reason: string|null, direction: string|null, nextRoleState: object}}
 */
export function evaluatePositionReassignment(player, roleState, options = {}) {
  const state = roleState ?? createRoleAssignmentState();
  if (state.periodsAtCurrentPosition < MIN_PERIODS_BETWEEN_REASSIGNMENTS) {
    return {
      recommendedPosition: null,
      reason: 'cooldown',
      direction: null,
      nextRoleState: { ...state, periodsAtCurrentPosition: state.periodsAtCurrentPosition + 1 },
    };
  }

  const dhAllowed = options.dhAllowed ?? true;
  const currentFit = computeDefensiveFit(player, player.primaryPosition);
  const currentThreshold = adequateFitThreshold(player.primaryPosition);

  // Still adequate at his current spot — nothing to evaluate.
  if (currentFit == null || currentFit >= currentThreshold) {
    return applyHysteresis(state, null);
  }

  const candidates = DEFENSIVE_SPECTRUM_ADJACENCY[player.primaryPosition] ?? [];
  let best = null;
  for (const candidate of candidates) {
    const candidateFit = computeDefensiveFit(player, candidate);
    const candidateThreshold = adequateFitThreshold(candidate);
    if (candidateFit == null || candidateFit < candidateThreshold) continue; // not adequate there either

    const direction = POSITION_DEFENSIVE_DEMAND[candidate] < POSITION_DEFENSIVE_DEMAND[player.primaryPosition] ? 'downshift' : 'upshift';
    const margin = candidateFit - candidateThreshold; // how comfortably he clears that position's bar
    if (!best || margin > best.margin) best = { candidate, margin, direction };
  }
  if (!best && dhAllowed && player.primaryPosition !== 'DH') {
    best = { candidate: 'DH', margin: currentThreshold - currentFit, direction: 'downshift' };
  }
  return applyHysteresis(state, best);
}

/**
 * @param {object} pitcher - Player (primaryPosition 'SP' or 'RP')
 * @param {object} [roleState] - from createRoleAssignmentState()
 * @param {object} [_options] - unused; accepted for call-site parity with evaluatePositionReassignment
 * @returns {{recommendedPosition: string|null, reason: string|null, direction: string|null, nextRoleState: object}}
 */
export function evaluatePitcherReassignment(pitcher, roleState, _options) {
  const state = roleState ?? createRoleAssignmentState();
  if (state.periodsAtCurrentPosition < MIN_PERIODS_BETWEEN_REASSIGNMENTS) {
    return {
      recommendedPosition: null,
      reason: 'cooldown',
      direction: null,
      nextRoleState: { ...state, periodsAtCurrentPosition: state.periodsAtCurrentPosition + 1 },
    };
  }

  const from = pitcher.primaryPosition;
  const to = from === 'SP' ? 'RP' : 'SP';
  const currentFit = computePitcherRoleFit(pitcher, from);
  const candidateFit = computePitcherRoleFit(pitcher, to);
  const margin = candidateFit - currentFit;
  const direction = PITCHER_ROLE_DEMAND[to] < PITCHER_ROLE_DEMAND[from] ? 'downshift' : 'upshift';
  const bar = direction === 'downshift' ? MIN_SIGNAL_MARGIN_DOWNSHIFT : MIN_SIGNAL_MARGIN_UPSHIFT;

  let best = null;
  if (margin >= bar) {
    const bigLeapUnproven = to === 'SP' && pitcher.ratings.stamina.current < RP_TO_SP_MIN_ABSOLUTE_STAMINA;
    if (!bigLeapUnproven) best = { candidate: to, margin, direction };
  }
  return applyHysteresis(state, best);
}

/**
 * Returns a new Player with primaryPosition switched; old position stays
 * eligible. `reason` isn't stored on Player (no schema change) — callers
 * that want an audit trail should log it themselves.
 * @param {object} player - Player
 * @param {string} recommendedPosition
 * @returns {object} Player
 */
export function applyReassignment(player, recommendedPosition) {
  const eligiblePositions = player.eligiblePositions.includes(recommendedPosition)
    ? player.eligiblePositions
    : [...player.eligiblePositions, recommendedPosition];
  return { ...player, primaryPosition: recommendedPosition, eligiblePositions };
}
