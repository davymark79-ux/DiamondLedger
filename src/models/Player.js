// Player schema — player-attributes-and-development.md + player-names-and-bio.md.
// Data shape only: no growth rolls, no plate-appearance outcomes, no scouting
// error simulation. Those belong to the sim engine (Build Sequencing step 2+).

import {
  RATING_SCALE,
  PITCHER_POSITIONS,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  PITCHING_ATTRIBUTES,
  MAKEUP_ATTRIBUTES,
  DEVELOPMENT_LEVELS,
  HOT_COLD_THRESHOLDS,
} from './constants.js';

/**
 * @typedef {Object} Rating
 * @property {number} current - Where the player actually is right now (20-80).
 *   What sim outcomes are computed from; moves period over period via the
 *   growth model.
 * @property {number} truePotential - Hidden ceiling fixed at generation. Never
 *   changes once set.
 * @property {number} scoutedPotential - What's shown to the commissioner.
 *   Generated with error around truePotential; accuracy driven by covering
 *   scout(s) (see scouts.md), not modeled here.
 */

/**
 * @typedef {Object.<string, Rating>} PlayerRatings
 * Keyed by attribute name, e.g. `contact`, `power`, `velocity`, `workEthic`.
 */

/**
 * @typedef {Object} StreakState
 * Descriptive readout of recent performance vs. baseline (Hot/Cold Streaks).
 * Purely observational — does not feed back into performance itself.
 * @property {number|null} baselineCompositeValue - wOBA-like season baseline.
 * @property {number|null} recentCompositeValue - wOBA-like value over the recent window.
 * @property {number} standardDeviationsFromBaseline
 */

export function clampRating(value) {
  return Math.min(RATING_SCALE.MAX, Math.max(RATING_SCALE.MIN, value));
}

/**
 * @param {number} current
 * @param {number} [truePotential] - defaults to `current` when unspecified.
 * @param {number} [scoutedPotential] - defaults to `current` when unspecified.
 * @returns {Rating}
 */
export function createRating(current, truePotential = current, scoutedPotential = current) {
  return {
    current: clampRating(current),
    truePotential: clampRating(truePotential),
    scoutedPotential: clampRating(scoutedPotential),
  };
}

function ratingsForAttributes(attributeNames, value = RATING_SCALE.AVERAGE) {
  const ratings = {};
  for (const name of attributeNames) {
    ratings[name] = createRating(value);
  }
  return ratings;
}

/**
 * @param {object} [overrides] - Any Player field. `ratings` values are expected
 *   to already be Rating objects (e.g. from createRating()) when provided.
 * @returns {object} Player
 */
export function createPlayer(overrides = {}) {
  const isPitcher = overrides.isPitcher ?? PITCHER_POSITIONS.includes(overrides.primaryPosition);

  return {
    id: overrides.id ?? null,

    // Bio (player-names-and-bio.md)
    firstName: overrides.firstName ?? '',
    lastName: overrides.lastName ?? '',
    birthdate: overrides.birthdate ?? null, // ISO date string
    birthNation: overrides.birthNation ?? null,
    heritageNations: overrides.heritageNations ?? [], // 0-2 entries, see nationalityPools.js
    bats: overrides.bats ?? 'R',
    throws: overrides.throws ?? 'R',
    heightIn: overrides.heightIn ?? null,
    weightLb: overrides.weightLb ?? null,

    // Role
    primaryPosition: overrides.primaryPosition ?? null,
    eligiblePositions: overrides.eligiblePositions
      ?? (overrides.primaryPosition ? [overrides.primaryPosition] : []),
    isPitcher,

    // Org placement
    developmentLevel: overrides.developmentLevel ?? DEVELOPMENT_LEVELS.HS,
    teamId: overrides.teamId ?? null,

    // Ratings — two layers (current/truePotential/scoutedPotential) per attribute.
    ratings: {
      ...ratingsForAttributes(HITTING_ATTRIBUTES),
      ...ratingsForAttributes(BASERUNNING_ATTRIBUTES),
      ...ratingsForAttributes(DEFENSE_ATTRIBUTES),
      ...(isPitcher ? ratingsForAttributes(PITCHING_ATTRIBUTES) : {}),
      ...ratingsForAttributes(MAKEUP_ATTRIBUTES),
      ...overrides.ratings,
    },

    streakState: {
      baselineCompositeValue: overrides.streakState?.baselineCompositeValue ?? null,
      recentCompositeValue: overrides.streakState?.recentCompositeValue ?? null,
      standardDeviationsFromBaseline: overrides.streakState?.standardDeviationsFromBaseline ?? 0,
    },

    // Current injury, if any (injuries.md; see engine/injuries.js) — null
    // when healthy. { type, severity (INJURY_SEVERITIES), gamesRemaining,
    // sustainedGameNumber }. `gamesRemaining` is a hard eligibility floor,
    // not an estimate — see engine/injuries.js's header for why.
    injury: overrides.injury ?? null,
  };
}

/**
 * @param {{birthdate: string|null}} player
 * @param {Date} [asOfDate]
 * @returns {number|null}
 */
export function getAge(player, asOfDate = new Date()) {
  if (!player.birthdate) return null;
  const birth = new Date(player.birthdate);
  let age = asOfDate.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    asOfDate.getMonth() > birth.getMonth() ||
    (asOfDate.getMonth() === birth.getMonth() && asOfDate.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Classifies a standard-deviations-from-baseline reading into the five-position
 * Hot/Cold slider. Pure lookup — the SD itself is computed elsewhere (depends on
 * the composite offensive value, sample size, and rolling window, none of which
 * are specced yet).
 * @param {number} standardDeviations
 * @returns {string} one of HOT_COLD_TIERS
 */
export function getHotColdTier(standardDeviations) {
  return HOT_COLD_THRESHOLDS.find((t) => standardDeviations <= t.max).tier;
}
