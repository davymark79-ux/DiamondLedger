// Manager generation — managers.md. Illustrative placeholder distributions
// throughout, same tuning status as playerGenerator.js.

import { createManager } from '../Manager.js';
import { MANAGER_SLIDER_NAMES, MANAGER_ATTRIBUTE_SCALE, MANAGER_ORIGINS, LEAGUE_IDS, POSITIONS } from '../constants.js';
import { createRng, randomInRange, pickWeighted, pick, gaussianRandom } from './random.js';
import { FIRST_NAMES_USA, LAST_NAMES_USA } from './namePools.js';
import { pickBirthNation, pickHeritageNations } from './nationalityPools.js';

// "Exact origin-split percentage (ex-player vs. outsider) — placeholder,
// needs a real number" per the doc's own Open Questions. Majority
// ex-player, matching real baseball.
const MANAGER_ORIGIN_WEIGHTS = Object.freeze([
  { value: MANAGER_ORIGINS.EX_PLAYER, weight: 0.75 },
  { value: MANAGER_ORIGINS.OUTSIDER, weight: 0.25 },
]);

// Managing doesn't require a player's physical peak — real MLB managers
// commonly work into their 60s/70s — so this window sits meaningfully
// older/wider than playerGenerator.js's established-player range (21-38).
const MANAGER_AGE_RANGE = [40, 70];

const ATTRIBUTE_STD_DEV = 15;

// The doc's "nice natural tie-in, not a hard rule": Foundry managers trend
// toward small-ball/quick-hook/Feel; Exchange trends toward platoon-heavy/
// patient/Analytics. A mean shift applied before the gaussian draw, not a
// hard constraint — a traditionalist in Exchange or an analytics mind in
// Foundry stays fully possible.
const LEAGUE_SLIDER_MEAN_SHIFT = Object.freeze({
  [LEAGUE_IDS.FOUNDRY]: Object.freeze({ smallBallTendency: 10, pitcherHook: -8, analyticsVsFeel: 8 }),
  [LEAGUE_IDS.EXCHANGE]: Object.freeze({ platoonTendency: 10, pitcherHook: 8, analyticsVsFeel: -8 }),
});

function generateBirthdate(rng, asOfDate) {
  const youngestBoundary = new Date(asOfDate);
  youngestBoundary.setFullYear(youngestBoundary.getFullYear() - MANAGER_AGE_RANGE[0]);
  const oldestBoundary = new Date(asOfDate);
  oldestBoundary.setFullYear(oldestBoundary.getFullYear() - MANAGER_AGE_RANGE[1] - 1);
  oldestBoundary.setDate(oldestBoundary.getDate() + 1);
  const birthTime = randomInRange(rng, oldestBoundary.getTime(), youngestBoundary.getTime());
  return new Date(birthTime).toISOString().slice(0, 10);
}

function drawAttribute(rng, meanShift = 0) {
  const value = gaussianRandom(rng, MANAGER_ATTRIBUTE_SCALE.AVERAGE + meanShift, ATTRIBUTE_STD_DEV);
  return Math.round(Math.min(MANAGER_ATTRIBUTE_SCALE.MAX, Math.max(MANAGER_ATTRIBUTE_SCALE.MIN, value)));
}

/**
 * @param {object} [options]
 * @param {() => number} [options.rng] - seeded RNG from createRng(); created from `seed` if omitted.
 * @param {number} [options.seed]
 * @param {Date} [options.asOfDate]
 * @param {string} [options.leagueId] - LEAGUE_IDS, optional — enables the league-flavor mean shift.
 * @param {object} [options.overrides] - applied on top via createManager().
 * @returns {object} Manager
 */
export function generateManager(options = {}) {
  const rng = options.rng ?? createRng(options.seed);
  const asOfDate = options.asOfDate ?? new Date();
  const meanShifts = LEAGUE_SLIDER_MEAN_SHIFT[options.leagueId] ?? {};

  const origin = pickWeighted(rng, MANAGER_ORIGIN_WEIGHTS);
  const birthNation = pickBirthNation(rng);

  const sliders = {};
  for (const name of MANAGER_SLIDER_NAMES) {
    sliders[name] = drawAttribute(rng, meanShifts[name] ?? 0);
  }

  return createManager({
    firstName: pick(rng, FIRST_NAMES_USA),
    lastName: pick(rng, LAST_NAMES_USA),
    birthdate: generateBirthdate(rng, asOfDate),
    birthNation,
    heritageNations: pickHeritageNations(rng, birthNation),
    origin,
    formerPosition: origin === MANAGER_ORIGINS.EX_PLAYER ? pick(rng, POSITIONS) : null,
    sliders,
    temperament: drawAttribute(rng),
    streakRead: drawAttribute(rng),
    ...options.overrides,
  });
}
