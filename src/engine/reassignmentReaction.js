// Reassignment Reaction — a player can refuse an organization-recommended
// position/role change out of pride/stubbornness, gated by Coachability (a
// Makeup attribute — see models/constants.js). Not specced in any design
// doc; this session's own addition, same placeholder-constant tuning status
// as everything else here.
//
// On refusal, the position does NOT change. Instead: a morale effect (a
// temporary performance swing — mostly a malus, occasionally a "prove them
// wrong" spark) plus independent requestsTrade/benchWorthy flags. Those
// flags are NOT acted on — no trade/roster/lineup system exists yet — this
// only returns them for a future system to consume, the same
// extension-point treatment as growthModel.js's locationModifier/injuryImpact.

import { RATING_SCALE, MAKEUP_ATTRIBUTES } from '../models/constants.js';
import { gaussianRandom } from '../models/generation/random.js';
import { withPerformanceModifiers } from './consistency.js';

// Refusal-chance placeholders: Coachability 20 -> ~45% base refusal chance,
// Coachability 80 -> ~10%. A demotion (downshift) is easier to take
// personally than a promotion (upshift, e.g. RP->SP or a defensive upshift)
// — refusing a promotion is rare but not impossible (pride can cut both ways).
const REFUSAL_CHANCE_AT_COACHABILITY_MIN = 0.45;
const REFUSAL_CHANCE_AT_COACHABILITY_MAX = 0.1;
const DOWNSHIFT_REFUSAL_BUMP = 0.12;
const UPSHIFT_REFUSAL_REDUCTION = 0.07;

// Given a refusal happens, mostly a malus, sometimes a defiant spark.
const SPARK_CHANCE_GIVEN_REFUSAL = 0.3;
const MALUS_MEAN = -5;
const MALUS_STD_DEV = 2;
const SPARK_MEAN = 3;
const SPARK_STD_DEV = 1.5;

const REQUEST_TRADE_BASE_CHANCE = 0.15;
const REQUEST_TRADE_LOW_COACHABILITY_BUMP = 0.15; // additional chance at Coachability floor
const BENCH_WORTHY_CHANCE = 0.2;

function normalizedCoachability(coachability) {
  return (coachability - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN); // 0 (worst) .. 1 (best)
}

/**
 * @param {number} coachability
 * @param {'upshift'|'downshift'} direction
 * @returns {number} probability [0,1]
 */
export function computeRefusalChance(coachability, direction) {
  const t = normalizedCoachability(coachability);
  let chance = REFUSAL_CHANCE_AT_COACHABILITY_MIN - t * (REFUSAL_CHANCE_AT_COACHABILITY_MIN - REFUSAL_CHANCE_AT_COACHABILITY_MAX);
  if (direction === 'downshift') chance += DOWNSHIFT_REFUSAL_BUMP;
  if (direction === 'upshift') chance -= UPSHIFT_REFUSAL_REDUCTION;
  return Math.min(0.9, Math.max(0.02, chance));
}

/**
 * Resolves whether a confirmed reassignment recommendation is refused, and
 * what happens if so. Pure decision logic — doesn't touch the Player object
 * itself (see applyMoraleEffect for that).
 * @param {number} coachability
 * @param {'upshift'|'downshift'} direction
 * @param {() => number} rng
 * @returns {{refused: boolean, moraleEffect: 'malus'|'spark'|null, moraleDelta: number, requestsTrade: boolean, benchWorthy: boolean}}
 */
export function resolveReassignmentReaction(coachability, direction, rng) {
  const refused = rng() < computeRefusalChance(coachability, direction);
  if (!refused) {
    return { refused: false, moraleEffect: null, moraleDelta: 0, requestsTrade: false, benchWorthy: false };
  }

  const isSpark = rng() < SPARK_CHANCE_GIVEN_REFUSAL;
  const moraleDelta = isSpark ? gaussianRandom(rng, SPARK_MEAN, SPARK_STD_DEV) : gaussianRandom(rng, MALUS_MEAN, MALUS_STD_DEV);

  const lowCoachabilityBoost = (1 - normalizedCoachability(coachability)) * REQUEST_TRADE_LOW_COACHABILITY_BUMP;
  const requestsTrade = rng() < REQUEST_TRADE_BASE_CHANCE + lowCoachabilityBoost;
  const benchWorthy = rng() < BENCH_WORTHY_CHANCE;

  return { refused: true, moraleEffect: isSpark ? 'spark' : 'malus', moraleDelta, requestsTrade, benchWorthy };
}

/**
 * Applies a refusal's morale delta broadly across a player's non-Makeup
 * ratings (a temporary performance swing, not a change in underlying skill
 * — not capped by truePotential, same treatment as consistency.js's
 * per-game performance modifier).
 * @param {object} player - Player
 * @param {number} moraleDelta
 * @returns {object} Player
 */
export function applyMoraleEffect(player, moraleDelta) {
  const deltas = {};
  for (const attribute of Object.keys(player.ratings)) {
    if (MAKEUP_ATTRIBUTES.includes(attribute)) continue;
    deltas[attribute] = moraleDelta;
  }
  return withPerformanceModifiers(player, deltas);
}
