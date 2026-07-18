// Position-player substitution decisions — pinch-hitting, defensive
// replacement, and pinch-running — the hitter-side analog of
// pitchingChanges.js's bullpen logic. Not specced in any design doc; this
// session's own addition, same placeholder-constant tuning status as
// everything else here.
//
// v1 scope: the WHEN-to-substitute gates (shouldPinchHit/
// shouldMakeDefensiveReplacement/shouldPinchRun) and the defensive-
// replacement/pinch-run WHO (selectDefensiveReplacement/selectPinchRunner)
// stay fixed thresholds, matching pitchingChanges.js's own approach for
// the mechanics that don't have a Manager slider mapped to them. WHO gets
// pinch-hit for (selectPinchHitter) is the exception — see
// managerAdjustedOffensiveComposite below, which layers managers.md's
// Platoon Tendency and Analytics-vs-Feel/Streak Read onto the underlying
// offensive-composite comparison, when a manager context is provided.
//
// Both bench pools are finite, depleting, one-time-use per game (mirrors
// the bullpen's "each pitcher appears at most once" rule) — select*
// functions splice the chosen player out of the `bench` array they're
// given. `removedPlayerIds` is an explicit, defensively-checked hard
// invariant: once a player (starter or bench call-up) is subbed out, his
// id goes in that Set and he can never be selected again, even if some
// future bug left him in an array somewhere.
//
// Each tactical selector (selectPinchHitter/selectDefensiveReplacement/
// selectPinchRunner) has an "emergency" counterpart (selectEmergency*) for
// injuries.md — same eligibility logic, but no quality-improvement
// threshold to clear, since an injured player is leaving regardless of
// whether the best bench option is actually an upgrade. Still picks the
// *best* available candidate, not just any — a manager sends up his best
// remaining bat, not a random one.

import { RATING_SCALE, MANAGER_ATTRIBUTE_SCALE, HOT_COLD_TIERS } from '../models/constants.js';
import { platoonShift } from './plateAppearance.js';
import { perceiveStreakTier } from './managerBehavior.js';

const PINCH_HIT_INNINGS_FROM_END = 2; // eligible from this many innings before the scheduled end
const PINCH_HIT_MAX_SCORE_MARGIN = 4; // abs(offense's own score margin) must be within this to be a "close game"
// A real, obvious upgrade (matches PINCH_RUN_MIN_IMPROVEMENT's bar), not a
// marginal one — at 6 points, generated bench players' own rating spread
// (roughly +/-12-27 points per attribute) cleared this by luck alone often
// enough that pinch-hitting fired on ~74% of all substitutions, far more
// than a DH-era lineup (where the DH already removes the pitcher's-spot
// pinch-hit case) should see.
const PINCH_HIT_MIN_IMPROVEMENT = 14;

const DEFENSIVE_REPLACEMENT_INNINGS_FROM_END = 2;
const DEFENSIVE_REPLACEMENT_MIN_IMPROVEMENT = 8; // Fielding rating points

const PINCH_RUN_INNINGS_FROM_END = 2;
const PINCH_RUN_MAX_SCORE_MARGIN = 3; // tighter than pinch-hitting — a runner's speed matters most when the game is truly on the line
const PINCH_RUN_MIN_IMPROVEMENT = 10; // Speed/BaserunningInstincts composite points — a real, obvious speed gap, not a marginal one

const OFFENSIVE_COMPOSITE_WEIGHTS = Object.freeze({ contact: 0.4, power: 0.35, eye: 0.25 });
const SPEED_COMPOSITE_WEIGHTS = Object.freeze({ speed: 0.7, baserunningInstincts: 0.3 });

function weightedComposite(player, weights) {
  return Object.entries(weights).reduce(
    (sum, [attr, weight]) => sum + (player.ratings[attr]?.current ?? RATING_SCALE.AVERAGE) * weight,
    0
  );
}

function offensiveComposite(player) {
  return weightedComposite(player, OFFENSIVE_COMPOSITE_WEIGHTS);
}

// A rating-point-equivalent bonus/penalty per perceived Hot/Cold tier,
// matching offensiveComposite's own scale (PINCH_HIT_MIN_IMPROVEMENT is
// ~14 points, so a max +/-8 swing here is a real but not overriding
// factor). "Perceived" deliberately, not "actual" — see
// managerAdjustedOffensiveComposite.
const STREAK_TIER_COMPOSITE_BONUS = Object.freeze({
  [HOT_COLD_TIERS.ICE_COLD]: -8,
  [HOT_COLD_TIERS.COLD]: -4,
  [HOT_COLD_TIERS.NEUTRAL]: 0,
  [HOT_COLD_TIERS.HOT]: 4,
  [HOT_COLD_TIERS.ON_FIRE]: 8,
});

// managers.md's Platoon Tendency and Analytics-vs-Feel/Streak Read —
// layered onto offensiveComposite() for the pinch-hit decision only (the
// doc's own framing: "lineup and platoon decisions"; defensive replacement
// is Fielding-driven and pinch-running is Speed-driven, neither is a
// platoon/streak call). Falls back to plain offensiveComposite() when no
// manager context is provided — every existing caller (validate:sim-style
// direct unit tests, a manager-less side) sees identical behavior to
// before this slider existed.
// @param {object} player
// @param {object} [context]
// @param {object} [context.pitcher] - the opposing pitcher this at-bat.
// @param {Object.<string, number>} [context.effectiveSliders] - this game's rolled slider values (engine/managerBehavior.js).
// @param {number} [context.streakRead] - MANAGER_ATTRIBUTE_SCALE, the manager's static Streak Read.
// @param {Map<string, {tier: string}>} [context.streakStateById] - engine/season.js's cross-game accumulator.
// @param {() => number} [context.rng] - required only when the streak factor is actually consulted.
function managerAdjustedOffensiveComposite(player, context = {}) {
  let composite = offensiveComposite(player);
  if (!context.pitcher || !context.effectiveSliders) return composite;

  const platoonFraction = (context.effectiveSliders.platoonTendency - MANAGER_ATTRIBUTE_SCALE.MIN)
    / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.MIN);
  composite += platoonShift(player, context.pitcher) * platoonFraction;

  const analyticsVsFeel = context.effectiveSliders.analyticsVsFeel;
  const isFeelLeaning = analyticsVsFeel > MANAGER_ATTRIBUTE_SCALE.AVERAGE;
  if (isFeelLeaning && context.streakStateById && context.rng) {
    const feelFraction = (analyticsVsFeel - MANAGER_ATTRIBUTE_SCALE.AVERAGE) / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.AVERAGE);
    const actualTier = context.streakStateById.get(player.id)?.tier ?? HOT_COLD_TIERS.NEUTRAL;
    const perceivedTier = perceiveStreakTier(actualTier, context.streakRead ?? MANAGER_ATTRIBUTE_SCALE.AVERAGE, context.rng);
    composite += STREAK_TIER_COMPOSITE_BONUS[perceivedTier] * feelFraction;
  }

  return composite;
}

// Exported for reuse by stolenBases.js — same "runner quality" concept
// already established here for pinch-run decisions.
export function speedComposite(player) {
  return weightedComposite(player, SPEED_COMPOSITE_WEIGHTS);
}

function fielding(player) {
  return player.ratings.fielding?.current ?? RATING_SCALE.AVERAGE;
}

// Shared selection core: best-scoring eligible bench candidate above
// `threshold` (default -Infinity, i.e. no gate — the emergency variants'
// entire job). Splices the chosen candidate out of `bench` in place.
function selectBest(bench, removedPlayerIds, scoreFn, { eligiblePosition, threshold = -Infinity } = {}) {
  let bestIndex = -1;
  let bestScore = threshold;
  bench.forEach((candidate, index) => {
    if (removedPlayerIds.has(candidate.id)) return;
    if (eligiblePosition && !candidate.eligiblePositions?.includes(eligiblePosition)) return;
    const score = scoreFn(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex === -1 ? null : bench.splice(bestIndex, 1)[0];
}

/**
 * @param {object} params
 * @param {number} params.inning
 * @param {number} params.scheduledInnings
 * @param {number} params.scoreMargin - the batting team's own score minus the opponent's
 * @returns {boolean}
 */
export function shouldPinchHit({ inning, scheduledInnings, scoreMargin }) {
  return inning >= scheduledInnings - PINCH_HIT_INNINGS_FROM_END && Math.abs(scoreMargin) <= PINCH_HIT_MAX_SCORE_MARGIN;
}

/**
 * @param {object[]} bench - available bench players; the chosen one is removed in place
 * @param {object} currentBatter - Player currently due up
 * @param {Set<string>} removedPlayerIds
 * @param {object} [managerContext] - see managerAdjustedOffensiveComposite; omitted -> identical to pre-Manager-entity behavior.
 * @returns {object|null} the substitute Player, or null if no clear upgrade is available
 */
export function selectPinchHitter(bench, currentBatter, removedPlayerIds, managerContext = {}) {
  const scoreFn = (player) => managerAdjustedOffensiveComposite(player, managerContext);
  return selectBest(bench, removedPlayerIds, scoreFn, {
    threshold: scoreFn(currentBatter) + PINCH_HIT_MIN_IMPROVEMENT,
  });
}

/**
 * Injury variant of selectPinchHitter — no quality gate, just the best
 * available bench bat, since the incumbent is leaving regardless.
 * @param {object[]} bench
 * @param {Set<string>} removedPlayerIds
 * @returns {object|null} the substitute Player, or null if the bench is empty/exhausted
 */
export function selectEmergencyPinchHitter(bench, removedPlayerIds) {
  return selectBest(bench, removedPlayerIds, offensiveComposite);
}

/**
 * @param {object} params
 * @param {number} params.inning
 * @param {number} params.scheduledInnings
 * @param {number} params.leadMargin - the fielding team's own score minus the opponent's
 * @returns {boolean}
 */
export function shouldMakeDefensiveReplacement({ inning, scheduledInnings, leadMargin }) {
  return inning >= scheduledInnings - DEFENSIVE_REPLACEMENT_INNINGS_FROM_END && leadMargin > 0;
}

/**
 * @param {object[]} bench - available bench players; the chosen one is removed in place
 * @param {string} position - the lineup slot's defensive position
 * @param {object} currentFielder - Player currently occupying that slot
 * @param {Set<string>} removedPlayerIds
 * @returns {object|null} the substitute Player, or null if no clear upgrade is available
 */
export function selectDefensiveReplacement(bench, position, currentFielder, removedPlayerIds) {
  return selectBest(bench, removedPlayerIds, fielding, {
    eligiblePosition: position,
    threshold: fielding(currentFielder) + DEFENSIVE_REPLACEMENT_MIN_IMPROVEMENT,
  });
}

/**
 * Injury variant of selectDefensiveReplacement — no quality gate. Not
 * called anywhere yet (fielding injuries aren't rolled this pass — only
 * the batter and the pitcher are injury-eligible each PA, see
 * engine/injuries.js's header), but kept ready for when they are.
 * @param {object[]} bench
 * @param {string} position
 * @param {Set<string>} removedPlayerIds
 * @returns {object|null} the substitute Player, or null if nobody eligible is left
 */
export function selectEmergencyDefensiveReplacement(bench, position, removedPlayerIds) {
  return selectBest(bench, removedPlayerIds, fielding, { eligiblePosition: position });
}

/**
 * @param {object} params
 * @param {number} params.inning
 * @param {number} params.scheduledInnings
 * @param {number} params.scoreMargin - the runner's own team's score minus the opponent's
 * @returns {boolean}
 */
export function shouldPinchRun({ inning, scheduledInnings, scoreMargin }) {
  return inning >= scheduledInnings - PINCH_RUN_INNINGS_FROM_END && Math.abs(scoreMargin) <= PINCH_RUN_MAX_SCORE_MARGIN;
}

/**
 * @param {object[]} bench - available bench players; the chosen one is removed in place
 * @param {object} currentRunner - Player currently on base
 * @param {Set<string>} removedPlayerIds
 * @returns {object|null} the substitute Player, or null if no clear speed upgrade is available
 */
export function selectPinchRunner(bench, currentRunner, removedPlayerIds) {
  return selectBest(bench, removedPlayerIds, speedComposite, {
    threshold: speedComposite(currentRunner) + PINCH_RUN_MIN_IMPROVEMENT,
  });
}

/**
 * Injury variant of selectPinchRunner — no quality gate.
 * @param {object[]} bench
 * @param {Set<string>} removedPlayerIds
 * @returns {object|null} the substitute Player, or null if the bench is empty/exhausted
 */
export function selectEmergencyPinchRunner(bench, removedPlayerIds) {
  return selectBest(bench, removedPlayerIds, speedComposite);
}
