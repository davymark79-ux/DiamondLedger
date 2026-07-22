// The ~30 real D1 programs — player-pathway.md: "enough to be a robust
// feeder... can be as large as feels right without any simulation cost."
// Names are fictional, distinct from both the 50 real MLB cities
// (leagueSeed.js) and the Minor League affiliate flavor pool
// (affiliateNamePools.js) — this is a different naming register
// (college-sounding: State/Tech/A&M/College), not a city+nickname pair.

import { createCollegeSchool } from '../CollegeSchool.js';
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

// [name, prestigeTier, specialty] — a spread across tiers/specialties, not
// a formula; flavor/build-time decision, same tuning status as the doc
// itself assigns this list. Base place-names are deliberately distinct
// from both leagueSeed.js's 50 real MLB cities and affiliateNamePools.js's
// Minor League city pool — a different naming register (State/Tech/A&M/
// College), not a reused or overlapping place name.
const SCHOOL_TABLE = [
  ['Thornfield State University', 1, PITCHING_FACTORY],
  ['Kingston A&M', 1, HITTING_ACADEMY],
  ['Somerset University', 1, null],
  ['Hartwell Tech', 1, DEFENSE_FIRST],
  ['Briarwood State', 2, PITCHING_FACTORY],
  ['Whitmore A&M', 2, HITTING_ACADEMY],
  ['Kestrel Point University', 2, ATHLETICISM_PROGRAM],
  ['Fallbrook State', 2, null],
  ['Blackwood College', 2, DEFENSE_FIRST],
  ['Winterset State', 3, PITCHING_FACTORY],
  ['Millport University', 3, HITTING_ACADEMY],
  ['Greybridge A&M', 3, null],
  ['Oakhaven State', 3, ATHLETICISM_PROGRAM],
  ['Redcliff Tech', 3, DEFENSE_FIRST],
  ['Marchmont University', 3, null],
  ['Ridgemont State', 3, PITCHING_FACTORY],
  ['Sterling Valley A&M', 3, HITTING_ACADEMY],
  ['Elmswood College', 4, null],
  ['Duskwood State', 4, ATHLETICISM_PROGRAM],
  ['Longview University', 4, DEFENSE_FIRST],
  ['Brightwater State', 4, null],
  ['Rowanmoor College', 4, PITCHING_FACTORY],
  ['Wrenfield State', 4, HITTING_ACADEMY],
  ['Thistledown A&M', 4, null],
  ['Ironvale State', 4, ATHLETICISM_PROGRAM],
  ['Cedarville College', 5, null],
  ['Ashgrove State', 5, DEFENSE_FIRST],
  ['Hollow Creek A&M', 5, null],
  ['Foxglen College', 5, PITCHING_FACTORY],
  ['Bramblewick State', 5, null],
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const COLLEGE_SCHOOLS = Object.freeze(
  SCHOOL_TABLE.map(([name, prestigeTier, specialty]) =>
    createCollegeSchool({ id: slugify(name), name, prestigeTier, specialty })
  )
);

export const COLLEGE_SCHOOLS_BY_ID = new Map(COLLEGE_SCHOOLS.map((school) => [school.id, school]));

const SPECIALTY_ATTRIBUTE_TARGETS = Object.freeze({
  [PITCHING_FACTORY]: PITCHING_ATTRIBUTES,
  [HITTING_ACADEMY]: HITTING_ATTRIBUTES,
  [DEFENSE_FIRST]: DEFENSE_ATTRIBUTES,
  [ATHLETICISM_PROGRAM]: BASERUNNING_ATTRIBUTES,
});

/**
 * Builds the `(attribute, group) => number` closure engine/growthModel.js's
 * `advanceDevelopmentPeriod` expects as `locationModifier` — prestige
 * contributes a flat bonus to every attribute, a matching specialty adds a
 * further bonus scoped to just its own attribute list.
 * @param {object} school - CollegeSchool
 * @returns {(attribute: string, group: string) => number}
 */
export function locationModifierForSchool(school) {
  const prestigeBonus = PRESTIGE_GROWTH_BONUS_BY_TIER[school.prestigeTier] ?? 0;
  const targetAttributes = school.specialty ? SPECIALTY_ATTRIBUTE_TARGETS[school.specialty] : null;
  return (attribute) => prestigeBonus + (targetAttributes?.includes(attribute) ? SPECIALTY_GROWTH_BONUS : 0);
}
