// Development — composition layer wiring the Growth Model, position/role
// reassignment, and reassignment-reaction mechanics into one call site.
// Mirrors pitcherDegradation.js's role in the game loop: several focused,
// independently-testable modules, composed here for actual use.

import { advanceDevelopmentPeriod } from './growthModel.js';
import { createRoleAssignmentState, evaluatePositionReassignment, evaluatePitcherReassignment, applyReassignment } from './positionReassignment.js';
import { resolveReassignmentReaction, applyMoraleEffect } from './reassignmentReaction.js';

/**
 * Runs one full development period: growth-model attribute updates, then
 * (if a reassignment is confirmed this period) resolves whether the player
 * accepts or refuses it before applying anything. `roleState` is
 * caller-owned (see createRoleAssignmentState) — this module doesn't
 * persist anything on Player.
 *
 * @param {object} player - Player
 * @param {object} [roleState] - from createRoleAssignmentState()
 * @param {object} [options] - passed through to advanceDevelopmentPeriod()
 *   and evaluatePositionReassignment() (rng, ageOverride, levelOverride,
 *   locationModifier, injuryImpact, dhAllowed — see those modules).
 * @returns {{player: object, roleState: object, reassignment: object}}
 */
export function advanceDevelopmentPeriodWithReassignment(player, roleState, options = {}) {
  const grown = advanceDevelopmentPeriod(player, options);
  const state = roleState ?? createRoleAssignmentState();
  const evaluate = grown.isPitcher ? evaluatePitcherReassignment : evaluatePositionReassignment;
  const evaluation = evaluate(grown, state, options);

  if (!evaluation.recommendedPosition) {
    return {
      player: grown,
      roleState: evaluation.nextRoleState,
      reassignment: { status: 'none', reason: evaluation.reason },
    };
  }

  const coachability = grown.ratings.coachability?.current ?? 50;
  const reaction = resolveReassignmentReaction(coachability, evaluation.direction, options.rng);

  if (reaction.refused) {
    return {
      player: applyMoraleEffect(grown, reaction.moraleDelta),
      roleState: evaluation.nextRoleState,
      reassignment: {
        status: 'refused',
        recommendedPosition: evaluation.recommendedPosition,
        reason: evaluation.reason,
        moraleEffect: reaction.moraleEffect,
        moraleDelta: reaction.moraleDelta,
        requestsTrade: reaction.requestsTrade,
        benchWorthy: reaction.benchWorthy,
      },
    };
  }

  return {
    player: applyReassignment(grown, evaluation.recommendedPosition),
    roleState: evaluation.nextRoleState,
    reassignment: { status: 'reassigned', recommendedPosition: evaluation.recommendedPosition, reason: evaluation.reason },
  };
}
