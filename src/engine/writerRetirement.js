// Writer retirement — writers-corps.md's own words: "a simpler,
// lower-stakes version" of player/manager retirement. "Soft retirement
// window (placeholder: increasing probability starting around age 60),
// replaced immediately by a newly generated young writer at the same
// outlet/city, keeping each city's writer population roughly stable over
// time." The actual replacement (generateWriter at the same city/outlet)
// lives in engine/leagueProgression.js, alongside player/manager
// replenishment — this file is just the probability curve, matching
// engine/retirement.js's split between "roll" and "what happens after."

import { getWriterAge } from '../models/Writer.js';

const WRITER_RETIREMENT_AGE_CURVE = Object.freeze([
  { maxAge: 59, probability: 0 },
  { maxAge: 65, probability: 0.05 },
  { maxAge: 70, probability: 0.15 },
  { maxAge: 75, probability: 0.35 },
  { maxAge: Infinity, probability: 0.6 },
]);

/**
 * @param {object} writer - Writer
 * @param {object} [options]
 * @param {Date} [options.asOfDate] - defaults to now.
 * @returns {number} 0-1
 */
export function computeWriterRetirementProbability(writer, options = {}) {
  const asOfDate = options.asOfDate ?? new Date();
  const age = getWriterAge(writer, asOfDate) ?? WRITER_RETIREMENT_AGE_CURVE[0].maxAge;
  return WRITER_RETIREMENT_AGE_CURVE.find((bracket) => age <= bracket.maxAge).probability;
}

/**
 * @param {object} writer - Writer
 * @param {() => number} rng
 * @param {object} [options] - see computeWriterRetirementProbability
 * @returns {boolean}
 */
export function rollWriterRetirement(writer, rng, options = {}) {
  return rng() < computeWriterRetirementProbability(writer, options);
}
