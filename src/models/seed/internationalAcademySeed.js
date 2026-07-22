// 31 named international academies across the 11 non-USA nations in
// nationalityPools.js's INTERNATIONAL_NATION_POOL — player-pathway.md:
// "International academy system structure/tiers per country... mirrors
// college's prestige/specialty concept." Concentrated on the 7 baseball-
// strong countries the doc names (Dominican Republic, Venezuela, Japan,
// Mexico, Puerto Rico, Cuba, South Korea), 1 each for the 4 marginal ones
// already in the pool (Canada/Colombia/Panama/Curacao) — parallels
// collegeSeed.js's ~30-school scale. Naming register (real place names +
// "Diamond/Baseball/Elite/Development Academy/Institute/School") is
// deliberately distinct from collegeSeed.js's "State/Tech/A&M/College"
// register, affiliateNamePools.js's fictional Western place names, AND the
// 50 real (all-US) MLB cities in leagueSeed.js — three existing naming
// registers to avoid colliding with, same collision-avoidance discipline
// collegeSeed.js's own header calls for (it caught a near-collision with
// the affiliate pool during Phase 3's build).

import { createInternationalAcademy } from '../InternationalAcademy.js';
import {
  COLLEGE_SPECIALTIES,
  PRESTIGE_GROWTH_BONUS_BY_TIER,
  SPECIALTY_GROWTH_BONUS,
  PITCHING_ATTRIBUTES,
  HITTING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
} from '../constants.js';

const { PITCHING_FACTORY, HITTING_ACADEMY, DEFENSE_FIRST, ATHLETICISM_PROGRAM } = COLLEGE_SPECIALTIES;

// [name, countryId, prestigeTier, specialty] — countryId values match
// nationalityPools.js's INTERNATIONAL_NATION_POOL entries exactly (reused
// directly, no separate id-mapping layer). Spread across tiers/specialties
// so at least one tier-1-with-specialty and one tier-5-generalist exist,
// matching collegeSeed.js's own validated pattern.
const ACADEMY_TABLE = [
  // Dominican Republic (6)
  ['Cabrera Diamond Academy', 'Dominican Republic', 1, HITTING_ACADEMY],
  ['Puerto Plata Baseball Academy', 'Dominican Republic', 2, ATHLETICISM_PROGRAM],
  ['Boca Chica Elite Academy', 'Dominican Republic', 2, null],
  ['San Pedro Development Academy', 'Dominican Republic', 3, HITTING_ACADEMY],
  ['Cibao Baseball Institute', 'Dominican Republic', 3, null],
  ['Samana Coastal Academy', 'Dominican Republic', 4, null],
  // Venezuela (5)
  ['Valencia Diamond Academy', 'Venezuela', 1, PITCHING_FACTORY],
  ['Maracaibo Baseball Institute', 'Venezuela', 2, HITTING_ACADEMY],
  ['Lara Elite Academy', 'Venezuela', 3, null],
  ['Zulia Development Academy', 'Venezuela', 3, ATHLETICISM_PROGRAM],
  ['Barinas Baseball School', 'Venezuela', 4, null],
  // Japan (4)
  ['Kansai Baseball Academy', 'Japan', 1, DEFENSE_FIRST],
  ['Hokkaido Diamond Institute', 'Japan', 2, PITCHING_FACTORY],
  ['Chubu Development Academy', 'Japan', 3, null],
  ['Kyushu Baseball School', 'Japan', 4, null],
  // Mexico (3)
  ['Jalisco Diamond Academy', 'Mexico', 2, HITTING_ACADEMY],
  ['Sonora Baseball Institute', 'Mexico', 3, null],
  ['Yucatan Development Academy', 'Mexico', 4, null],
  // Puerto Rico (3)
  ['Carolina Baseball Academy', 'Puerto Rico', 2, ATHLETICISM_PROGRAM],
  ['Ponce Diamond Institute', 'Puerto Rico', 3, null],
  ['Arecibo Development Academy', 'Puerto Rico', 4, null],
  // Cuba (3)
  ['Havana Elite Academy', 'Cuba', 2, PITCHING_FACTORY],
  ['Santiago Diamond Institute', 'Cuba', 3, null],
  ['Matanzas Baseball School', 'Cuba', 4, null],
  // South Korea (3)
  ['Seoul Diamond Academy', 'South Korea', 2, DEFENSE_FIRST],
  ['Busan Baseball Institute', 'South Korea', 3, null],
  ['Incheon Development Academy', 'South Korea', 4, null],
  // Canada (1)
  ['Ontario Baseball Academy', 'Canada', 4, null],
  // Colombia (1)
  ['Barranquilla Diamond Academy', 'Colombia', 5, null],
  // Panama (1)
  ['Panama City Baseball Institute', 'Panama', 5, null],
  // Curacao (1)
  ['Willemstad Diamond Academy', 'Curacao', 5, null],
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const INTERNATIONAL_ACADEMIES = Object.freeze(
  ACADEMY_TABLE.map(([name, countryId, prestigeTier, specialty]) =>
    createInternationalAcademy({ id: slugify(name), name, countryId, prestigeTier, specialty })
  )
);

export const INTERNATIONAL_ACADEMIES_BY_ID = new Map(INTERNATIONAL_ACADEMIES.map((academy) => [academy.id, academy]));

export const INTERNATIONAL_ACADEMIES_BY_COUNTRY = new Map();
for (const academy of INTERNATIONAL_ACADEMIES) {
  const list = INTERNATIONAL_ACADEMIES_BY_COUNTRY.get(academy.countryId) ?? [];
  list.push(academy);
  INTERNATIONAL_ACADEMIES_BY_COUNTRY.set(academy.countryId, list);
}

const SPECIALTY_ATTRIBUTE_TARGETS = Object.freeze({
  [PITCHING_FACTORY]: PITCHING_ATTRIBUTES,
  [HITTING_ACADEMY]: HITTING_ATTRIBUTES,
  [DEFENSE_FIRST]: DEFENSE_ATTRIBUTES,
  [ATHLETICISM_PROGRAM]: BASERUNNING_ATTRIBUTES,
});

/**
 * Builds the `(attribute, group) => number` closure engine/growthModel.js's
 * `advanceDevelopmentPeriod` expects as `locationModifier` — identical
 * shape to collegeSeed.js's `locationModifierForSchool`, reusing the same
 * PRESTIGE_GROWTH_BONUS_BY_TIER/SPECIALTY_GROWTH_BONUS magnitudes (no
 * signal a distinct scale is needed for academies vs. college schools).
 * @param {object} academy - InternationalAcademy
 * @returns {(attribute: string, group: string) => number}
 */
export function locationModifierForAcademy(academy) {
  const prestigeBonus = PRESTIGE_GROWTH_BONUS_BY_TIER[academy.prestigeTier] ?? 0;
  const targetAttributes = academy.specialty ? SPECIALTY_ATTRIBUTE_TARGETS[academy.specialty] : null;
  return (attribute) => prestigeBonus + (targetAttributes?.includes(attribute) ? SPECIALTY_GROWTH_BONUS : 0);
}
