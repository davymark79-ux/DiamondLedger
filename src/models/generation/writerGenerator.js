// Writer generation — writers-corps.md. Illustrative placeholder
// distributions throughout, same tuning status as managerGenerator.js.

import { createWriter } from '../Writer.js';
import { WRITER_SLIDER_NAMES, MANAGER_ATTRIBUTE_SCALE } from '../constants.js';
import { createRng, randomInRange, pick, gaussianRandom } from './random.js';
import { FIRST_NAMES_USA, LAST_NAMES_USA } from './namePools.js';

// "Age — starts 24-30 (placeholder)" per the doc verbatim.
const WRITER_AGE_RANGE = [24, 30];
const ATTRIBUTE_STD_DEV = 15;

// Fictional publication names — "The {City} {Noun}", a flavor-only naming
// task per the doc (cross-references team-reputation-rivalries-and-media.md's
// own open media-naming item, not resolved here either).
const OUTLET_NOUNS = Object.freeze(['Globe', 'Herald', 'Tribune', 'Beacon', 'Ledger', 'Chronicle', 'Times', 'Post', 'Dispatch', 'Courier', 'Sentinel', 'Gazette']);

function generateBirthdate(rng, asOfDate) {
  const youngestBoundary = new Date(asOfDate);
  youngestBoundary.setFullYear(youngestBoundary.getFullYear() - WRITER_AGE_RANGE[0]);
  const oldestBoundary = new Date(asOfDate);
  oldestBoundary.setFullYear(oldestBoundary.getFullYear() - WRITER_AGE_RANGE[1] - 1);
  oldestBoundary.setDate(oldestBoundary.getDate() + 1);
  const birthTime = randomInRange(rng, oldestBoundary.getTime(), youngestBoundary.getTime());
  return new Date(birthTime).toISOString().slice(0, 10);
}

function drawAttribute(rng) {
  const value = gaussianRandom(rng, MANAGER_ATTRIBUTE_SCALE.AVERAGE, ATTRIBUTE_STD_DEV);
  return Math.round(Math.min(MANAGER_ATTRIBUTE_SCALE.MAX, Math.max(MANAGER_ATTRIBUTE_SCALE.MIN, value)));
}

/**
 * @param {object} options
 * @param {() => number} [options.rng] - seeded RNG from createRng(); created from `seed` if omitted.
 * @param {number} [options.seed]
 * @param {Date} [options.asOfDate]
 * @param {string} options.city - the beat city (v1: hometown = beat city, per the doc).
 * @param {string|null} [options.favoriteTeamId] - drives Homerism; typically the local team.
 * @param {object} [options.overrides] - applied on top via createWriter().
 * @returns {object} Writer
 */
export function generateWriter(options = {}) {
  const rng = options.rng ?? createRng(options.seed);
  const asOfDate = options.asOfDate ?? new Date();

  const sliders = {};
  for (const name of WRITER_SLIDER_NAMES) {
    sliders[name] = drawAttribute(rng);
  }

  return createWriter({
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    birthdate: generateBirthdate(rng, asOfDate),
    city: options.city,
    outlet: `The ${options.city} ${pick(rng, OUTLET_NOUNS)}`,
    favoriteTeamId: options.favoriteTeamId ?? null,
    sliders,
    ...options.overrides,
  });
}
