// Minimal placeholder player generator — produces HS/pre-draft-age Player
// objects (age 17-18, per player-names-and-bio.md) through the Player schema.
// Every distribution below is an illustrative placeholder explicitly flagged
// as needing real tuning in player-attributes-and-development.md; this exists
// to unblock building/testing the plate-appearance engine against real
// roster data, not to be the final word on any of these numbers. No growth
// rolls, no scouting-confidence-over-time, no plate-appearance logic here —
// creation-time state only.

import { createPlayer, createRating, clampRating } from '../Player.js';
import {
  RATING_SCALE,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  PITCHING_ATTRIBUTES,
  MAKEUP_ATTRIBUTES,
  DEVELOPMENT_LEVELS,
  PITCHER_POSITIONS,
} from '../constants.js';
import { createRng, randomInRange, randomInt, pickWeighted, pick, gaussianRandom } from './random.js';
import { FIRST_NAMES_USA, LAST_NAMES_USA } from './namePools.js';
import { pickBirthNation, pickHeritageNations } from './nationalityPools.js';

// Right-skewed true-potential roll (elite ceilings rare) via a power
// transform on a uniform draw — see doc's "Where 'Most Players Aren't Great'
// Actually Comes From". Exact shape not yet specced there.
const TRUE_POTENTIAL_SKEW_POWER = 2.2;

// Fraction of the gap between scale floor and true potential a HS/pre-draft
// prospect has already realized as his current rating — raw, unrefined talent.
const HS_REALIZED_FRACTION_RANGE = [0.3, 0.7];

// Same idea, but for an already-established active-roster player (see
// generateEstablishedPlayer()) — mostly arrived at his ceiling, not a raw
// prospect, but still leaves a little real headroom/bust risk for the
// Growth Model to act on rather than a maxed-out static stat block.
const ESTABLISHED_REALIZED_FRACTION_RANGE = [0.85, 1.0];

// Scouted potential = true potential + error, mild optimism bias per doc
// ("nobody hypes a guy as a future bust"). Real mechanism deferred to
// scouts.md (scout skill/specialization-driven accuracy) — this is a flat
// placeholder standing in for that until it's built.
const SCOUT_ERROR_MEAN = 2;
const SCOUT_ERROR_STD_DEV = 5;

// Illustrative roster-composition weights, not sourced from any doc — just
// enough to produce a plausible pitcher/position-player mix.
const POSITION_POOL = Object.freeze([
  { value: { position: 'SP', isPitcher: true }, weight: 0.27 },
  { value: { position: 'RP', isPitcher: true }, weight: 0.18 },
  { value: { position: 'C', isPitcher: false }, weight: 0.07 },
  { value: { position: '1B', isPitcher: false }, weight: 0.07 },
  { value: { position: '2B', isPitcher: false }, weight: 0.07 },
  { value: { position: '3B', isPitcher: false }, weight: 0.07 },
  { value: { position: 'SS', isPitcher: false }, weight: 0.07 },
  { value: { position: 'LF', isPitcher: false }, weight: 0.07 },
  { value: { position: 'CF', isPitcher: false }, weight: 0.07 },
  { value: { position: 'RF', isPitcher: false }, weight: 0.06 },
]);

// RP vs. SP archetype: relievers generated as a deviation from the SP
// baseline (0 shift) rather than symmetric opposite profiles — real bullpen
// arms skew toward max-effort velocity over a short outing at the cost of
// stamina and, often, the fuller command/repertoire a starter needs to face
// a lineup three times. Pitchability shift is deliberately mild: some elite
// relievers are excellent sequencers too, this isn't a universal rule, just
// a population-level tendency. Placeholder magnitudes, not sourced from any
// doc — flagged for the same real-playtesting tuning pass as everything else.
const PITCHER_ROLE_MEAN_SHIFTS = Object.freeze({
  SP: {},
  RP: { velocity: 6, control: -4, stamina: -10, pitchability: -3 },
});

// Illustrative height(in)/weight(lb) ranges by position group — directional
// pattern from player-names-and-bio.md (pitchers tallest, 2B shortest/
// lightest, etc.); exact ranges aren't specced there, these are placeholders
// grounded in real MLB norms.
const BODY_RANGES = Object.freeze({
  SP: { height: [74, 78], weight: [190, 230] },
  RP: { height: [74, 78], weight: [190, 230] },
  C: { height: [70, 73], weight: [200, 225] },
  '1B': { height: [73, 77], weight: [210, 240] },
  '2B': { height: [68, 71], weight: [170, 190] },
  SS: { height: [70, 73], weight: [180, 200] },
  '3B': { height: [71, 74], weight: [195, 220] },
  LF: { height: [71, 75], weight: [185, 215] },
  CF: { height: [71, 75], weight: [185, 215] },
  RF: { height: [71, 75], weight: [185, 215] },
  // DH has no defensive demands driving a distinct build — treated as a
  // generic corner-power-bat frame. Only reachable via generateEstablishedPlayer();
  // generatePlayer()'s POSITION_POOL never picks DH.
  DH: { height: [72, 76], weight: [200, 230] },
});

function generateTruePotential(rng, meanShift = 0) {
  const skewed = Math.pow(rng(), TRUE_POTENTIAL_SKEW_POWER);
  const base = RATING_SCALE.MIN + (RATING_SCALE.MAX - RATING_SCALE.MIN) * skewed;
  return Math.round(clampRating(base + meanShift));
}

function generateRating(rng, meanShift = 0) {
  const truePotential = generateTruePotential(rng, meanShift);
  const realizedFraction = randomInRange(rng, ...HS_REALIZED_FRACTION_RANGE);
  const current = Math.round(RATING_SCALE.MIN + (truePotential - RATING_SCALE.MIN) * realizedFraction);
  const scoutedPotential = Math.round(truePotential + gaussianRandom(rng, SCOUT_ERROR_MEAN, SCOUT_ERROR_STD_DEV));
  return createRating(current, truePotential, scoutedPotential);
}

// Independent per attribute — deliberately not correlated (see doc's note
// that shared Work-Ethic mean-shift, applied during growth periods rather
// than at creation, is what produces clustering later without needing an
// explicit correlation mechanism here). `meanShifts` optionally recenters
// specific attributes (e.g. a reliever's Velocity/Control/Stamina/
// Pitchability archetype) without changing the underlying right-skewed shape.
function generateRatings(rng, attributeNames, meanShifts = {}) {
  const ratings = {};
  for (const name of attributeNames) {
    ratings[name] = generateRating(rng, meanShifts[name] ?? 0);
  }
  return ratings;
}

// Established-player equivalent of generateRating(): centers truePotential
// directly on a `quality` anchor +/- a modest spread, rather than an
// independent right-skewed population draw with a mean-shift nudged on top.
// Reusing generateTruePotential()'s meanShift for this doesn't work — that
// mechanism is calibrated for small archetype nudges (the RP shifts below
// are -10 to +6), not for repositioning an entire distribution's center to
// an arbitrary point on the 20-80 scale; stacking a large shift on top of
// an already-skewed draw just saturates everyone against the 80 ceiling.
const ESTABLISHED_QUALITY_SPREAD = 10;

function generateEstablishedTruePotential(rng, quality, archetypeShift = 0) {
  return Math.round(clampRating(quality + archetypeShift + randomInRange(rng, -ESTABLISHED_QUALITY_SPREAD, ESTABLISHED_QUALITY_SPREAD)));
}

function generateEstablishedRating(rng, quality, archetypeShift = 0) {
  const truePotential = generateEstablishedTruePotential(rng, quality, archetypeShift);
  const realizedFraction = randomInRange(rng, ...ESTABLISHED_REALIZED_FRACTION_RANGE);
  const current = Math.round(RATING_SCALE.MIN + (truePotential - RATING_SCALE.MIN) * realizedFraction);
  const scoutedPotential = Math.round(truePotential + gaussianRandom(rng, SCOUT_ERROR_MEAN, SCOUT_ERROR_STD_DEV));
  return createRating(current, truePotential, scoutedPotential);
}

function generateEstablishedRatings(rng, attributeNames, quality, archetypeShifts = {}) {
  const ratings = {};
  for (const name of attributeNames) {
    ratings[name] = generateEstablishedRating(rng, quality, archetypeShifts[name] ?? 0);
  }
  return ratings;
}

// Exported so other callers needing realistic handedness proportions (e.g.
// scripts/validate-game-loop.mjs's synthetic fixtures, once platoon splits
// existed and made an all-same-handed fixture an unrealistic worst case)
// can reuse these exact real proportions instead of duplicating/drifting.
export function pickThrows(rng, isPitcher) {
  const rightHandedChance = isPitcher ? 0.78 : 0.9;
  return rng() < rightHandedChance ? 'R' : 'L';
}

export function pickBats(rng) {
  const roll = rng();
  if (roll < 0.55) return 'R';
  if (roll < 0.9) return 'L';
  return 'S';
}

// Uniform random birthdate across the exact window that makes getAge()
// resolve to 17 or 18 as of `asOfDate` — picking a nominal age and then a
// random month/day independently doesn't work, since whether that birthday
// has already occurred this year shifts the computed age by one.
function generateBirthdate(rng, asOfDate) {
  const youngestBoundary = new Date(asOfDate);
  youngestBoundary.setFullYear(youngestBoundary.getFullYear() - 17); // turns 17 today

  const oldestBoundary = new Date(asOfDate);
  oldestBoundary.setFullYear(oldestBoundary.getFullYear() - 19);
  oldestBoundary.setDate(oldestBoundary.getDate() + 1); // one day short of turning 19

  const birthTime = randomInRange(rng, oldestBoundary.getTime(), youngestBoundary.getTime());
  return new Date(birthTime).toISOString().slice(0, 10);
}

// Same window-based approach as generateBirthdate(), but for an established
// active-roster player's realistic career-age span (21-37) rather than a
// fixed HS/pre-draft age. Uniform across the span — a placeholder, like
// everything else here; a real age curve would skew younger.
function generateEstablishedBirthdate(rng, asOfDate) {
  const youngestBoundary = new Date(asOfDate);
  youngestBoundary.setFullYear(youngestBoundary.getFullYear() - 21); // turns 21 today

  const oldestBoundary = new Date(asOfDate);
  oldestBoundary.setFullYear(oldestBoundary.getFullYear() - 38);
  oldestBoundary.setDate(oldestBoundary.getDate() + 1); // one day short of turning 38

  const birthTime = randomInRange(rng, oldestBoundary.getTime(), youngestBoundary.getTime());
  return new Date(birthTime).toISOString().slice(0, 10);
}

/**
 * @param {object} [options]
 * @param {number} [options.seed] - ignored if `rng` is passed.
 * @param {() => number} [options.rng] - seeded RNG from createRng(); created from `seed` if omitted.
 * @param {Date} [options.asOfDate] - reference date for age/birthdate math, defaults to now.
 * @param {object} [options.overrides] - applied on top of the generated player via createPlayer().
 * @returns {object} Player
 */
export function generatePlayer(options = {}) {
  const rng = options.rng ?? createRng(options.seed);
  const asOfDate = options.asOfDate ?? new Date();

  const positionChoice = pickWeighted(rng, POSITION_POOL);
  const isPitcher = positionChoice.isPitcher;
  const bodyRange = BODY_RANGES[positionChoice.position];
  const roleShifts = PITCHER_ROLE_MEAN_SHIFTS[positionChoice.position] ?? {};
  const birthNation = pickBirthNation(rng);

  return createPlayer({
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    birthdate: generateBirthdate(rng, asOfDate),
    birthNation,
    heritageNations: pickHeritageNations(rng, birthNation),
    bats: pickBats(rng),
    throws: pickThrows(rng, isPitcher),
    heightIn: randomInt(rng, ...bodyRange.height),
    weightLb: randomInt(rng, ...bodyRange.weight),
    primaryPosition: positionChoice.position,
    isPitcher,
    developmentLevel: DEVELOPMENT_LEVELS.HS,
    ratings: {
      ...generateRatings(rng, HITTING_ATTRIBUTES),
      ...generateRatings(rng, BASERUNNING_ATTRIBUTES),
      ...generateRatings(rng, DEFENSE_ATTRIBUTES),
      ...(isPitcher ? generateRatings(rng, PITCHING_ATTRIBUTES, roleShifts) : {}),
      ...generateRatings(rng, MAKEUP_ATTRIBUTES),
    },
    ...options.overrides,
  });
}

/**
 * Generates a batch of players sharing one RNG stream (so a `seed` produces
 * a reproducible roster as a whole, not just reproducible individual players).
 * @param {number} count
 * @param {object} [options] - same as generatePlayer; `idPrefix` numbers ids as `${idPrefix}-0`, `${idPrefix}-1`, ...
 * @returns {object[]} Player[]
 */
export function generatePlayers(count, options = {}) {
  const rng = options.rng ?? createRng(options.seed);
  return Array.from({ length: count }, (_, i) =>
    generatePlayer({
      ...options,
      rng,
      overrides: {
        ...(options.idPrefix ? { id: `${options.idPrefix}-${i}` } : {}),
        ...options.overrides,
      },
    })
  );
}

/**
 * Generates an already-established, active-roster-ready Player — age 21-37,
 * developmentLevel MLB, current ratings realized to 85-100% of true
 * potential (an arrived pro, not a raw prospect). Unlike generatePlayer(),
 * `position` is a required, explicit choice rather than a random draw from
 * POSITION_POOL — real roster construction needs guaranteed position
 * coverage (an actual shortstop, not "whatever the weighted pool happened
 * to land on"), not a statistically-plausible prospect pool.
 * @param {object} options
 * @param {string} options.position - required, one of POSITIONS
 * @param {number} [options.seed] - ignored if `rng` is passed.
 * @param {() => number} [options.rng] - seeded RNG from createRng(); created from `seed` if omitted.
 * @param {Date} [options.asOfDate] - reference date for age/birthdate math, defaults to now.
 * @param {[number, number]} [options.qualityRange] - per-player quality anchor drawn from this
 *   range and applied as a uniform meanShift across every attribute (plus the RP archetype
 *   shift, for pitchers) — e.g. a roster tier's overall talent band. Defaults to no shift.
 * @param {object} [options.overrides] - applied on top of the generated player via createPlayer().
 * @returns {object} Player
 */
export function generateEstablishedPlayer(options = {}) {
  if (!options.position) throw new Error('generateEstablishedPlayer requires options.position');

  const rng = options.rng ?? createRng(options.seed);
  const asOfDate = options.asOfDate ?? new Date();
  const qualityRange = options.qualityRange ?? [0, 0];

  const position = options.position;
  const isPitcher = PITCHER_POSITIONS.includes(position);
  const bodyRange = BODY_RANGES[position];
  const roleShifts = PITCHER_ROLE_MEAN_SHIFTS[position] ?? {};
  const quality = randomInRange(rng, ...qualityRange);
  const birthNation = pickBirthNation(rng);

  return createPlayer({
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    birthdate: generateEstablishedBirthdate(rng, asOfDate),
    birthNation,
    heritageNations: pickHeritageNations(rng, birthNation),
    bats: pickBats(rng),
    throws: pickThrows(rng, isPitcher),
    heightIn: randomInt(rng, ...bodyRange.height),
    weightLb: randomInt(rng, ...bodyRange.weight),
    primaryPosition: position,
    isPitcher,
    developmentLevel: DEVELOPMENT_LEVELS.MLB,
    ratings: {
      ...generateEstablishedRatings(rng, HITTING_ATTRIBUTES, quality),
      ...generateEstablishedRatings(rng, BASERUNNING_ATTRIBUTES, quality),
      ...generateEstablishedRatings(rng, DEFENSE_ATTRIBUTES, quality),
      ...(isPitcher ? generateEstablishedRatings(rng, PITCHING_ATTRIBUTES, quality, roleShifts) : {}),
      // Makeup isn't part of the team-quality anchor — a last-place club isn't
      // necessarily full of bad-character players, same reasoning generatePlayer()
      // already applies (no archetype/position shift on makeup either). Centered
      // on population-average (50), not the team's quality band.
      ...generateEstablishedRatings(rng, MAKEUP_ATTRIBUTES, RATING_SCALE.AVERAGE),
    },
    ...options.overrides,
  });
}
