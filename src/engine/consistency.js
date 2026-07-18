// In-Game Performance Consistency (Work Ethic x Talent) —
// player-attributes-and-development.md. Distinct from the development
// variance in the Growth Model (career-long, period-over-period) — this
// mechanic governs game-to-game/play-to-play swings around a player's
// already-realized current rating.
//
// Key rule from the doc: spread scales with how far above the scale floor a
// player's rating sits, not a flat penalty — a bad player with bad Work
// Ethic is just bad, consistently; a great player with bad Work Ethic is
// genuinely volatile (boom/bust), because there's real talent underneath
// the inconsistency.
//
// This module only computes the modifier. Deciding when to roll it (once
// per game, per the doc's framing) and applying it to a player's effective
// ratings before calling resolvePlateAppearance is the caller's (future
// game-loop layer's) job — kept separate so this engine module stays usable
// standalone and deterministic when no modifier is supplied.

import { RATING_SCALE, PITCHING_ATTRIBUTES } from '../models/constants.js';
import { clampRating } from '../models/Player.js';
import { gaussianRandom } from '../models/generation/random.js';

const SCALE_FLOOR = RATING_SCALE.MIN;

// Larger for poor Work Ethic (wider spread), smaller for good Work Ethic
// (tighter spread). Placeholder linear mapping: 1.5 at WE=20, 0.5 at WE=80.
function workEthicFactor(workEthic) {
  const normalized = (workEthic - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN);
  return 1.5 - normalized;
}

// Placeholder overall scale controlling how many rating points of std. dev.
// a maximally-spread player (elite talent, poor Work Ethic) swings by.
const SPREAD_SCALE = 0.15;

/**
 * performance_spread = (current_rating - scale_floor) * work_ethic_factor(WE)
 * @param {number} currentRating
 * @param {number} workEthic
 * @returns {number} standard deviation, in rating points
 */
export function computePerformanceSpread(currentRating, workEthic) {
  return (currentRating - SCALE_FLOOR) * workEthicFactor(workEthic) * SPREAD_SCALE;
}

/**
 * Draws one game's random performance deviation for a single attribute.
 * @param {number} currentRating
 * @param {number} workEthic
 * @param {() => number} rng
 * @returns {number} additive rating-point delta, +/-
 */
export function rollGamePerformanceModifier(currentRating, workEthic, rng) {
  const spread = computePerformanceSpread(currentRating, workEthic);
  return gaussianRandom(rng, 0, spread);
}

/**
 * Returns a shallow copy of `player` with a flat delta applied to the
 * `.current` rating of each named attribute — the per-game "form" a
 * game-loop would compute once via rollGamePerformanceModifier() and hold
 * constant across that player's plate appearances for the game.
 * @param {object} player - Player
 * @param {Object.<string, number>} deltasByAttribute
 * @returns {object} Player (shallow copy; original is not mutated)
 */
export function withPerformanceModifiers(player, deltasByAttribute) {
  const ratings = { ...player.ratings };
  for (const [attribute, delta] of Object.entries(deltasByAttribute)) {
    const rating = ratings[attribute];
    if (!rating) continue;
    ratings[attribute] = { ...rating, current: clampRating(rating.current + delta) };
  }
  return { ...player, ratings };
}

/**
 * Convenience: rolls and applies a game's performance modifier to every
 * rating the player has. Each attribute gets its own independent draw (per
 * the doc's "rolls independent per attribute" default), sized off that
 * player's own Work Ethic and that attribute's own current rating.
 * @param {object} player - Player
 * @param {() => number} rng
 * @returns {object} Player (shallow copy)
 */
export function applyGamePerformance(player, rng) {
  const workEthic = player.ratings.workEthic.current;
  const deltas = {};
  for (const attribute of Object.keys(player.ratings)) {
    if (attribute === 'workEthic') continue;
    deltas[attribute] = rollGamePerformanceModifier(player.ratings[attribute].current, workEthic, rng);
  }
  return withPerformanceModifiers(player, deltas);
}

// Pitchability dampens the DOWNSIDE of a pitcher's daily performance swing —
// a "doesn't have his best stuff but grinds through it" start, the profile a
// pitcher like Gerrit Cole represents (mixing/sequencing well enough to
// still get outs on an off day). It does not similarly boost good days — a
// great outing is a great outing regardless of Pitchability; this only
// raises the floor, not the ceiling. Placeholder linear mapping: no damping
// at Pitchability=20, roughly two-thirds damping at Pitchability=80.
function badDayDampingFactor(pitchability) {
  const normalized = (pitchability - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN);
  return 1 - normalized * 0.65;
}

/**
 * Same per-game form roll as applyGamePerformance(), but for pitchers:
 * additionally dampens negative (bad-day) swings on pitching attributes
 * based on Pitchability. Pitchability itself isn't perturbed — like Work
 * Ethic, it's a stable trait, not something that fluctuates game to game.
 * @param {object} pitcher - Player
 * @param {() => number} rng
 * @returns {object} Player (shallow copy)
 */
export function applyPitcherGamePerformance(pitcher, rng) {
  const workEthic = pitcher.ratings.workEthic.current;
  const pitchability = pitcher.ratings.pitchability.current;
  const deltas = {};

  for (const attribute of Object.keys(pitcher.ratings)) {
    if (attribute === 'workEthic' || attribute === 'pitchability') continue;
    let delta = rollGamePerformanceModifier(pitcher.ratings[attribute].current, workEthic, rng);
    if (PITCHING_ATTRIBUTES.includes(attribute) && delta < 0) {
      delta *= badDayDampingFactor(pitchability);
    }
    deltas[attribute] = delta;
  }

  return withPerformanceModifiers(pitcher, deltas);
}
