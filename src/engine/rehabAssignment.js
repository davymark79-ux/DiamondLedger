// Injury Rehab Assignments — "50-man Roster System" arc, Phase 10 (the
// FINAL phase), per player-movement.md: "a player on the MLB injured list
// can be sent to a minor-league affiliate for live game reps before
// officially activating, rather than sitting idle until fully healthy."
// Position players up to 20 days, pitchers up to 30, and it "does not use
// an option — a rehab assignment is a distinct mechanism from a normal
// optional assignment."
//
// **A real modelling problem this phase had to solve first.** A rehab
// assignment exists so a player is READY when activated — but this engine
// had no rust or ramp-up penalty for a returning player, so there was
// nothing for readiness to offset and the mechanic would have been pure
// bookkeeping. Confirmed with the user, taking the more ambitious route:
// **build the return-rust penalty first, then let a rehab stint offset
// it.** That also closes a gap CLAUDE.md has flagged since §8, which named
// consistency.js's withPerformanceModifiers as "the natural primitive to
// reuse" for exactly this family of mechanic — reused here rather than
// reinventing a rating-shifting helper.
//
// Necessarily AUTOMATIC and in-season, not a user action like Phases 5/6's
// Option/DFA/trade buttons: injuries only exist inside
// simulateGamesIntoState's per-game loop, and state.seasonResult is a
// season that has already finished, so there is no in-progress season a
// live action could reach. Same class of constraint as Super Two.
//
// Days-to-games: this engine counts injuries in GAMES, not calendar dates
// (engine/injuries.js's gamesRemaining), so the doc's 20/30-DAY caps are
// read as 20/30 games. A flagged simplification of the same class as Phase
// 4's whole-season service accrual.

import { withPerformanceModifiers } from './consistency.js';
import {
  INJURY_SEVERITIES,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  PITCHING_ATTRIBUTES,
} from '../models/constants.js';

// ===== Constants (placeholders needing playtesting, same as every other
// numeric constant in this engine) =====

export const REHAB_MAX_GAMES_POSITION_PLAYER = 20;
export const REHAB_MAX_GAMES_PITCHER = 30;

// Only the two real IL tiers produce rust. DAY_TO_DAY is too short to
// matter, and SEASON_ENDING/CAREER_ENDING carry gamesRemaining: Infinity —
// those players never return at all, so they can never be rehabbed or
// carry rust.
export const RUST_GAMES_BY_SEVERITY = Object.freeze({
  [INJURY_SEVERITIES.SHORT_TERM_IL]: 6,
  [INJURY_SEVERITIES.LONG_TERM_IL]: 14,
});

// Deliberately shaped like positionPlayerFatigue.js's own penalty: small,
// bounded, and decaying. Fatigue caps at 5 rating points; rust peaks a
// little below that, since a rusty player is off his game but not as
// compromised as one who has played 30 straight days.
export const MAX_RUST_PENALTY = 4;

// A rehab stint converts games served into rust removed at this rate.
//
// **Calibrated empirically, and the first value was wrong in an
// instructive way.** At 1.0 (one game served erases one game of rust), a
// real 150-game season produced 130 activations of which **130 had rust
// fully erased** — every rehab-eligible player serves ~13 games against at
// most 14 rust games, so the penalty NEVER actually applied and the whole
// mechanic was inert. That's precisely the "cosmetic bookkeeping" outcome
// this phase was designed to avoid. 0.6 leaves a real residue after a
// stint, so rehab meaningfully helps without erasing the injury's cost.
export const RUST_REMOVED_PER_REHAB_GAME = 0.6;

// Not every club gets every eligible player out for live reps — some
// return cold. This is what creates the actual CONTRAST the mechanic
// depends on: with every eligible player automatically rehabbing, "rehab
// vs. no rehab" has no observable difference anywhere in a season.
export const REHAB_ASSIGNMENT_PROBABILITY = 0.55;

// A stint only starts once the player is genuinely close to returning —
// you don't send someone out for live reps in week one of a 60-game
// absence. Expressed as a fraction of his own cap.
export const REHAB_START_WITHIN_CAP_FRACTION = 1.0;

const RUST_ATTRIBUTES_POSITION = [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];

// ===== Rust =====

/**
 * How many games of rust a player carries on activation, derived from the
 * severity tier rather than the original duration — `gamesRemaining`
 * decrements in place, so the original length isn't recoverable at
 * activation time, and the tier is the honest signal anyway.
 * @param {string} severity - one of INJURY_SEVERITIES
 * @returns {number} 0 for tiers that produce no rust
 */
export function computeReturnRustGames(severity) {
  return RUST_GAMES_BY_SEVERITY[severity] ?? 0;
}

/**
 * The rating penalty a player carries right now, decaying to 0 as he
 * shakes it off. Peaks at MAX_RUST_PENALTY on his first game back.
 * @param {number} rustGamesRemaining
 * @param {number} rustGamesTotal - what he started with, so the decay is
 *   proportional to his own stint rather than a fixed scale
 * @returns {number} 0 when he's fully shaken it off
 */
export function computeReturnRustPenalty(rustGamesRemaining, rustGamesTotal) {
  if (rustGamesRemaining <= 0 || rustGamesTotal <= 0) return 0;
  const fraction = Math.min(1, rustGamesRemaining / rustGamesTotal);
  return Math.round(MAX_RUST_PENALTY * fraction);
}

/**
 * Applies the rust penalty to a player's real ratings — pitchers take it
 * on their pitching attributes, everyone else on the physical hitting/
 * baserunning/defense set, mirroring positionPlayerFatigue.js's applyFatigue
 * exactly. Non-mutating, per this codebase's standing convention.
 * @param {object} player
 * @param {number} rustGamesRemaining
 * @param {number} rustGamesTotal
 */
export function applyReturnRust(player, rustGamesRemaining, rustGamesTotal) {
  const penalty = computeReturnRustPenalty(rustGamesRemaining, rustGamesTotal);
  if (penalty === 0) return player;
  const attributes = player.isPitcher ? PITCHING_ATTRIBUTES : RUST_ATTRIBUTES_POSITION;
  const deltas = {};
  for (const attribute of attributes) deltas[attribute] = -penalty;
  return withPerformanceModifiers(player, deltas);
}

// ===== Rehab stints =====

/** Real MLB's own split: pitchers get the longer window. */
export function computeRehabCapGames(player) {
  return player.isPitcher ? REHAB_MAX_GAMES_PITCHER : REHAB_MAX_GAMES_POSITION_PLAYER;
}

/**
 * A player can begin a rehab stint once he's on a real IL tier and close
 * enough to returning to be worth sending out for live reps.
 * @param {object} player
 * @param {{severity: string, gamesRemaining: number}} injury
 */
export function isRehabEligible(player, injury) {
  if (!injury || !Number.isFinite(injury.gamesRemaining) || injury.gamesRemaining <= 0) return false;
  if (computeReturnRustGames(injury.severity) === 0) return false;
  return injury.gamesRemaining <= computeRehabCapGames(player) * REHAB_START_WITHIN_CAP_FRACTION;
}

/**
 * Per-game sweep over one club, run right after injuries advance:
 *   1. Anyone newly eligible starts a rehab stint.
 *   2. Anyone already on a stint serves another game of it (capped).
 *   3. Anyone whose injury just cleared is activated, converting the games
 *      he served into rust REMOVED from what he'd otherwise carry.
 *
 * The player is NOT physically moved between roster arrays during a stint —
 * he's already excluded from selection by the injury itself, so relocating
 * him would add real depletion risk (the §34/§40/§41 bug this arc hit
 * three times) for zero behavioural gain. The stint is tracked as data.
 *
 * **Never touches serviceRecord.standardOptionYearsUsed** — the doc is
 * explicit that a rehab assignment is a distinct mechanism from an
 * optional assignment.
 *
 * Mutates `rehabStatusById`/`rustStatusById` in place, same accumulator-Map
 * ownership contract as injuryStatusById itself.
 * @param {object} roster
 * @param {Map<string, object>} injuryStatusById - already advanced this game
 * @param {Map<string, object>} rehabStatusById
 * @param {Map<string, object>} rustStatusById
 * @param {() => number} rng - decides whether an eligible player actually
 *   gets sent out (see REHAB_ASSIGNMENT_PROBABILITY); omit and every
 *   eligible player rehabs, which makes the mechanic inert.
 * @returns {{started: object[], activated: object[]}}
 */
export function advanceRehabAndRust(roster, injuryStatusById, rehabStatusById, rustStatusById, rng = null) {
  const started = [];
  const activated = [];
  const players = [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench];

  for (const player of players) {
    const injury = injuryStatusById.get(player.id);
    const stint = rehabStatusById.get(player.id);

    // Still hurt: start or continue a stint.
    if (injury && injury.gamesRemaining > 0) {
      if (!stint && isRehabEligible(player, injury)) {
        // The decision is made ONCE per injury and remembered (as a
        // `declined` sentinel in the same Map, so no extra state is
        // needed). Re-rolling every remaining game would make almost
        // everyone eventually rehab, collapsing straight back to the inert
        // case this constant exists to prevent.
        if (rng && rng() >= REHAB_ASSIGNMENT_PROBABILITY) {
          rehabStatusById.set(player.id, { declined: true, severity: injury.severity });
        } else {
          rehabStatusById.set(player.id, { gamesServed: 1, severity: injury.severity });
          started.push({ playerId: player.id, firstName: player.firstName, lastName: player.lastName, primaryPosition: player.primaryPosition });
        }
      } else if (stint && !stint.declined) {
        const cap = computeRehabCapGames(player);
        if (stint.gamesServed < cap) rehabStatusById.set(player.id, { ...stint, gamesServed: stint.gamesServed + 1 });
      }
      continue;
    }

    // Injury has cleared. If he was hurt badly enough to carry rust, set it
    // now — reduced by whatever rehab he actually served (zero, for anyone
    // whose club never sent him out).
    if (stint) {
      const gamesServed = stint.declined ? 0 : stint.gamesServed;
      const baseRust = computeReturnRustGames(stint.severity);
      const removed = Math.round(gamesServed * RUST_REMOVED_PER_REHAB_GAME);
      const remaining = Math.max(0, baseRust - removed);
      rehabStatusById.delete(player.id);
      if (remaining > 0) rustStatusById.set(player.id, { gamesRemaining: remaining, gamesTotal: remaining });
      activated.push({
        playerId: player.id, firstName: player.firstName, lastName: player.lastName,
        primaryPosition: player.primaryPosition,
        rehabGamesServed: gamesServed, rustGamesCarried: remaining,
      });
    }
  }

  return { started, activated };
}

/**
 * A player who returned WITHOUT a rehab stint still carries full rust —
 * called when an injury clears for someone who never became rehab-eligible
 * (or whose club never got him out for reps). Separate from
 * advanceRehabAndRust so the "no stint" path is explicit rather than
 * implied by a missing branch.
 * @param {string} playerId
 * @param {string} severity
 * @param {Map<string, object>} rustStatusById
 */
export function applyFullRustOnReturn(playerId, severity, rustStatusById) {
  const rust = computeReturnRustGames(severity);
  if (rust > 0) rustStatusById.set(playerId, { gamesRemaining: rust, gamesTotal: rust });
}

/**
 * Ticks every active rust counter down one game and clears anyone who has
 * shaken it off. Mirrors advanceInjuriesForTeam's own shape.
 * @param {Map<string, object>} rustStatusById
 */
export function advanceRust(rustStatusById) {
  for (const [playerId, rust] of rustStatusById) {
    const remaining = rust.gamesRemaining - 1;
    if (remaining <= 0) rustStatusById.delete(playerId);
    else rustStatusById.set(playerId, { ...rust, gamesRemaining: remaining });
  }
}
