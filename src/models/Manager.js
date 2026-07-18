// Manager schema — managers.md. Data shape only, same split as Player.js:
// no slider-noise rolls, no generation logic, no in-game decision-making.
// Those belong to models/generation/managerGenerator.js and
// engine/managerBehavior.js/pitchingChanges.js/etc.
//
// Origin simplification, flagged directly rather than glossed over: the
// doc says "ex-player managers draw nationality directly from their
// existing player record." No real pool of past players exists to draw
// from — this app has no season-to-season loop, so
// engine/retirement.js's advanceCareerForRoster() never actually retires
// anyone in production (same accepted gap as the Origin/Nationality/
// Retirement phase). Both origin types therefore generate nationality the
// same way (nationalityPools.js, reused directly) — `origin` is a
// flavor/label distinction, not a real linked Player id. `formerPosition`
// is a cosmetic-only nod to an ex-player's playing days, not evidence of
// an underlying Player record.

import { MANAGER_SLIDER_NAMES, MANAGER_ORIGINS, MANAGER_ATTRIBUTE_SCALE } from './constants.js';
import { getAge } from './Player.js';

export function clampManagerAttribute(value) {
  return Math.min(MANAGER_ATTRIBUTE_SCALE.MAX, Math.max(MANAGER_ATTRIBUTE_SCALE.MIN, value));
}

/**
 * @param {object} [overrides] - any Manager field.
 * @returns {object} Manager
 */
export function createManager(overrides = {}) {
  const sliders = {};
  for (const name of MANAGER_SLIDER_NAMES) {
    sliders[name] = clampManagerAttribute(overrides.sliders?.[name] ?? MANAGER_ATTRIBUTE_SCALE.AVERAGE);
  }

  return {
    id: overrides.id ?? null,

    firstName: overrides.firstName ?? '',
    lastName: overrides.lastName ?? '',
    birthdate: overrides.birthdate ?? null, // ISO date string
    birthNation: overrides.birthNation ?? null,
    heritageNations: overrides.heritageNations ?? [],

    origin: overrides.origin ?? MANAGER_ORIGINS.OUTSIDER,
    formerPosition: overrides.formerPosition ?? null, // flavor only, EX_PLAYER managers only — see file header

    teamId: overrides.teamId ?? null,

    sliders,
    temperament: clampManagerAttribute(overrides.temperament ?? MANAGER_ATTRIBUTE_SCALE.AVERAGE),
    streakRead: clampManagerAttribute(overrides.streakRead ?? MANAGER_ATTRIBUTE_SCALE.AVERAGE),
  };
}

// getAge() only reads `.birthdate` — same field name, same shape, no need
// to duplicate the calendar-math logic for Manager.
export const getManagerAge = getAge;
