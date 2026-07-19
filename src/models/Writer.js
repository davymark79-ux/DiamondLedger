// Writer schema — writers-corps.md's Hall of Fame voting electorate. Data
// shape only, same split as Player.js/Manager.js: no generation logic, no
// vote-simulation logic. Those belong to models/generation/writerGenerator.js
// and engine/hallOfFame.js.

import { WRITER_SLIDER_NAMES, MANAGER_ATTRIBUTE_SCALE } from './constants.js';
import { getAge } from './Player.js';

function clampSlider(value) {
  return Math.min(MANAGER_ATTRIBUTE_SCALE.MAX, Math.max(MANAGER_ATTRIBUTE_SCALE.MIN, value));
}

/**
 * @param {object} [overrides] - any Writer field.
 * @returns {object} Writer
 */
export function createWriter(overrides = {}) {
  const sliders = {};
  for (const name of WRITER_SLIDER_NAMES) {
    sliders[name] = clampSlider(overrides.sliders?.[name] ?? MANAGER_ATTRIBUTE_SCALE.AVERAGE);
  }

  return {
    id: overrides.id ?? null,
    firstName: overrides.firstName ?? '',
    lastName: overrides.lastName ?? '',
    birthdate: overrides.birthdate ?? null, // ISO date string

    city: overrides.city ?? '', // v1: hometown = beat city, per the doc
    outlet: overrides.outlet ?? '', // fictional publication name
    favoriteTeamId: overrides.favoriteTeamId ?? null, // drives Homerism

    sliders,
  };
}

// getAge() only reads `.birthdate` — same field name/shape, no need to
// duplicate the calendar-math logic for Writer (same reuse Manager.js
// already established).
export const getWriterAge = getAge;
