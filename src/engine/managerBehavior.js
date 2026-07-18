// Manager behavioral fallibility — managers.md's Temperament ("effective_
// slider_value = base_slider_value + noise(Temperament)") and Streak Read
// ("how accurately he perceives" a player's true Hot/Cold tier). Two
// independent "add noise inversely related to a trait" mechanisms,
// co-located since both are manager-specific behavioral fallibility, not
// player mechanics. Illustrative placeholder magnitudes throughout — the
// doc itself flags Temperament's noise magnitude as "needs tuning against
// a working sim like everything else."

import { MANAGER_SLIDER_NAMES, MANAGER_ATTRIBUTE_SCALE, HOT_COLD_TIERS } from '../models/constants.js';
import { gaussianRandom } from '../models/generation/random.js';

function clampAttribute(value) {
  return Math.min(MANAGER_ATTRIBUTE_SCALE.MAX, Math.max(MANAGER_ATTRIBUTE_SCALE.MIN, value));
}

// High Temperament (steady) -> tight noise; low (volatile) -> wide. A
// manager's sliders remain his true long-run identity (the average holds
// across many games) but a low-Temperament manager wanders from them game
// to game in a way a high-Temperament one never would.
const TEMPERAMENT_NOISE_STD_DEV_RANGE = [2, 20]; // [at MAX temperament, at MIN temperament]

function temperamentNoiseStdDev(temperament) {
  const fraction = (temperament - MANAGER_ATTRIBUTE_SCALE.MIN) / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.MIN);
  return TEMPERAMENT_NOISE_STD_DEV_RANGE[1] - fraction * (TEMPERAMENT_NOISE_STD_DEV_RANGE[1] - TEMPERAMENT_NOISE_STD_DEV_RANGE[0]);
}

/**
 * Rolls an effective value for each of the seven sliders once per game —
 * NOT re-rolled per decision. The doc's "a manager could have a night
 * where he plays uncharacteristically conservative" framing means one
 * roll per game per slider, matching the per-game jitter already applied
 * elsewhere in this engine (e.g. consistency.js's form roll). Streak Read
 * is deliberately NOT noised here — it's a fixed skill/perception
 * attribute, not a bipolar tendency the doc ever describes as fluctuating
 * night to night.
 * @param {object} manager - Manager
 * @param {() => number} rng
 * @returns {{effectiveSliders: Object.<string, number>}}
 */
export function resolveGameManagerState(manager, rng) {
  const noiseStdDev = temperamentNoiseStdDev(manager.temperament);
  const effectiveSliders = {};
  for (const name of MANAGER_SLIDER_NAMES) {
    effectiveSliders[name] = clampAttribute(manager.sliders[name] + gaussianRandom(rng, 0, noiseStdDev));
  }
  return { effectiveSliders };
}

// Ordinal order of the five-position Hot/Cold slider, ICE_COLD -> ON_FIRE
// (matches HOT_COLD_THRESHOLDS' own ascending order in constants.js).
const STREAK_TIER_ORDER = Object.freeze([
  HOT_COLD_TIERS.ICE_COLD,
  HOT_COLD_TIERS.COLD,
  HOT_COLD_TIERS.NEUTRAL,
  HOT_COLD_TIERS.HOT,
  HOT_COLD_TIERS.ON_FIRE,
]);

// High Streak Read -> almost always correct; low -> frequently misreads,
// in EITHER direction — one mechanism covers both failure modes the doc
// describes: "benching someone in a genuine slump one game too late"
// (fails to perceive a real cold streak) and "riding a player who was
// never actually hot, just running into some luck" (perceives a hot
// streak that isn't really there).
const PERCEPTION_NOISE_STD_DEV_RANGE = [0.15, 1.3]; // [at MAX streakRead, at MIN streakRead]

/**
 * @param {string} actualTier - HOT_COLD_TIERS, the player's real tier.
 * @param {number} streakRead - MANAGER_ATTRIBUTE_SCALE.
 * @param {() => number} rng
 * @returns {string} HOT_COLD_TIERS - what the manager believes the tier is, possibly wrong.
 */
export function perceiveStreakTier(actualTier, streakRead, rng) {
  const fraction = (streakRead - MANAGER_ATTRIBUTE_SCALE.MIN) / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.MIN);
  const noiseStdDev = PERCEPTION_NOISE_STD_DEV_RANGE[1] - fraction * (PERCEPTION_NOISE_STD_DEV_RANGE[1] - PERCEPTION_NOISE_STD_DEV_RANGE[0]);
  const actualIndex = STREAK_TIER_ORDER.indexOf(actualTier);
  const perceivedIndex = Math.round(actualIndex + gaussianRandom(rng, 0, noiseStdDev));
  const clampedIndex = Math.min(STREAK_TIER_ORDER.length - 1, Math.max(0, perceivedIndex));
  return STREAK_TIER_ORDER[clampedIndex];
}
