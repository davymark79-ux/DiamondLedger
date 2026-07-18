// Growth Model — player-attributes-and-development.md's "Growth Model"
// section: `growth = baseline_growth + variance_roll`, applied once per
// "development period" (a college year, a minor-league season, an MLB
// aging year). This module has no concept of calendars/seasons — no
// school/pathway/season system exists yet — the caller decides cadence and
// calls advanceDevelopmentPeriod() once per period per player.
//
// Calibration principle (this matters more than any individual constant
// below): baseline growth must be modest, NOT a reliable march to the
// ceiling. Most players should never reach their true potential — only a
// clear-cut, can't-miss outlier converges quickly and fully. Reaching a
// HIGH potential should require a sustained run of favorable variance
// rolls, not just normal aging. Baseline growth here is deliberately sized
// smaller than a single period's variance std. dev. at HS/College levels,
// so variance — not baseline — is what actually determines how much of the
// gap to true potential closes, especially for a big gap. This matches the
// doc's own "bust" framing directly: a bust "still gets the baseline boost
// ... but the negative rolls mean he converges toward his true potential
// slower, and less completely, than expected."

import { RATING_SCALE, DEVELOPMENT_LEVELS, VARIANCE_STD_DEV_BY_LEVEL } from '../models/constants.js';
import { clampRating, getAge } from '../models/Player.js';
import { gaussianRandom } from '../models/generation/random.js';

export const GROWTH_ATTRIBUTE_GROUPS = Object.freeze({ PHYSICAL: 'PHYSICAL', SKILL: 'SKILL', MAKEUP: 'MAKEUP' });

// Real aging-curve research: physical tools develop early and decay
// early/hard; bat-to-ball/feel-for-the-game skills develop a bit slower but
// hold up much longer. This is the specific mechanism behind "an aging
// outfielder's legs go while his bat plays on" — no separate aging-specific
// code path is needed, it falls out of these two groups directly.
const PHYSICAL_GROWTH_ATTRIBUTES = Object.freeze(['speed', 'fielding', 'armStrength', 'velocity', 'stamina']);
const SKILL_GROWTH_ATTRIBUTES = Object.freeze([
  'contact', 'eye', 'power', 'armAccuracy', 'baserunningInstincts', 'control', 'movement', 'pitchability',
]);

export function getAttributeGrowthGroup(attribute) {
  if (PHYSICAL_GROWTH_ATTRIBUTES.includes(attribute)) return GROWTH_ATTRIBUTE_GROUPS.PHYSICAL;
  if (SKILL_GROWTH_ATTRIBUTES.includes(attribute)) return GROWTH_ATTRIBUTE_GROUPS.SKILL;
  return GROWTH_ATTRIBUTE_GROUPS.MAKEUP;
}

// Baseline rating-point growth for ONE development period (nominally one
// age-year), by group and age bracket. Deliberately modest — see file
// header. Summed across a typical age 18-26 developmental window (9
// periods), PHYSICAL totals ~9 points and SKILL ~13.5 points, both well
// under a single HS/College period's variance std. dev. (8 and 7). All
// placeholder magnitudes — needs real playtesting, same as every other
// numeric constant in this project.
const AGE_CURVE_BREAKPOINTS = Object.freeze({
  [GROWTH_ATTRIBUTE_GROUPS.PHYSICAL]: Object.freeze([
    { maxAge: 20, growth: 2 }, { maxAge: 23, growth: 1 }, { maxAge: 26, growth: 1 },
    { maxAge: 29, growth: 0 }, { maxAge: 32, growth: 0 }, { maxAge: 35, growth: -1 },
    { maxAge: 38, growth: -1 }, { maxAge: Infinity, growth: -1 },
  ]),
  [GROWTH_ATTRIBUTE_GROUPS.SKILL]: Object.freeze([
    { maxAge: 20, growth: 2 }, { maxAge: 23, growth: 2 }, { maxAge: 26, growth: 1.5 },
    { maxAge: 29, growth: 1 }, { maxAge: 32, growth: 1 }, { maxAge: 35, growth: 0 },
    { maxAge: 38, growth: 0 }, { maxAge: Infinity, growth: -1 },
  ]),
});

export function ageCurveBaselineGrowth(age, group) {
  if (group === GROWTH_ATTRIBUTE_GROUPS.MAKEUP) return 0;
  return AGE_CURVE_BREAKPOINTS[group].find((b) => age <= b.maxAge).growth;
}

// Placeholder — the doc leaves shift_factor fully unresolved. WE=80 -> +1.5
// mean shift; WE=20 -> -1.5. WE=50 -> exactly 0 (population-level unbiased,
// per the doc's explicit resolution that variance itself stays unbiased).
const WORK_ETHIC_SHIFT_FACTOR = 0.05;
export function workEthicShift(workEthic) {
  return (workEthic - RATING_SCALE.AVERAGE) * WORK_ETHIC_SHIFT_FACTOR;
}

// Extension point for the future college-prestige/specialty system
// (player-pathway.md) and minor-league developmental context, AND for a
// future Injuries system's period-specific decline (see `injuryImpact`
// below — same resolution shape, reused by both). Defaults to neutral (0)
// since neither system exists yet. Accepts a flat number (applies to every
// attribute), a per-attribute object, or a function
// `(attribute, group) => number` for group-targeted modifiers (e.g. a
// "pitching factory" school boosting PITCHING_ATTRIBUTES specifically, or
// a concussion knocking down `eye` and `fielding` for a catcher).
function resolveModifier(modifier, attribute, group) {
  if (typeof modifier === 'function') return modifier(attribute, group) ?? 0;
  if (typeof modifier === 'number') return modifier;
  if (modifier && typeof modifier === 'object') return modifier[attribute] ?? 0;
  return 0;
}

/** @returns {number} one attribute's growth delta (baseline + variance) for one period */
export function rollAttributeGrowth({ age, attribute, workEthic, levelStdDev, rng, locationModifier, injuryImpact }) {
  const group = getAttributeGrowthGroup(attribute);
  const baseline =
    ageCurveBaselineGrowth(age, group) +
    resolveModifier(locationModifier, attribute, group) +
    resolveModifier(injuryImpact, attribute, group);
  const variance = gaussianRandom(rng, workEthicShift(workEthic), levelStdDev);
  return baseline + variance;
}

/**
 * Advances `player` through one development period. Every rated attribute's
 * `.current` moves per the Growth Model, clamped to [20,80] AND to that
 * attribute's own fixed `truePotential` (per doc: variance must never let
 * the population systematically exceed true potential — busts come from a
 * lower ceiling, not biased variance). `scoutedPotential`/`truePotential`
 * are untouched — scouted-potential revision over time is scouts.md's own
 * deferred mechanism, not this one.
 *
 * @param {object} player - Player
 * @param {object} options
 * @param {() => number} options.rng - required, seeded (createRng()).
 * @param {Date} [options.asOfDate] - for birthdate-based age calc; defaults to now.
 * @param {number} [options.ageOverride] - explicit age, bypasses birthdate calc.
 * @param {string} [options.levelOverride] - override the DEVELOPMENT_LEVELS std-dev bucket.
 * @param {number|Object.<string,number>|Function} [options.locationModifier] - see resolveModifier.
 * @param {number|Object.<string,number>|Function} [options.injuryImpact] - see resolveModifier.
 * @returns {object} Player (new object; input not mutated)
 */
export function advanceDevelopmentPeriod(player, options) {
  const level = options.levelOverride ?? player.developmentLevel;
  const levelStdDev = VARIANCE_STD_DEV_BY_LEVEL[level] ?? VARIANCE_STD_DEV_BY_LEVEL[DEVELOPMENT_LEVELS.MLB];
  const age = options.ageOverride ?? getAge(player, options.asOfDate ?? new Date()) ?? 27;
  const workEthic = player.ratings.workEthic?.current ?? RATING_SCALE.AVERAGE;

  const ratings = {};
  for (const [attribute, rating] of Object.entries(player.ratings)) {
    const growth = rollAttributeGrowth({
      age,
      attribute,
      workEthic,
      levelStdDev,
      rng: options.rng,
      locationModifier: options.locationModifier,
      injuryImpact: options.injuryImpact,
    });
    const uncapped = clampRating(rating.current + growth);
    ratings[attribute] = { ...rating, current: Math.min(uncapped, rating.truePotential) };
  }
  return { ...player, ratings };
}
