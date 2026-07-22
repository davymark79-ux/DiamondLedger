// International Academy schema — player-pathway.md's International Pathway
// section, mirroring CollegeSchool.js's "abstracted development location,
// not a simulated league" design exactly: an academy is a named entity that
// modifies a player's development curve, nothing more. Unlike a college
// school, an academy is grouped under a specific country (models/seed/
// internationalAcademySeed.js's INTERNATIONAL_ACADEMIES_BY_COUNTRY) — the
// country is picked first (demographically weighted, see
// nationalityPools.js's INTERNATIONAL_NATION_POOL), the specific academy
// within it second (a flavor decision, not a population-realism one).

/**
 * @param {object} [overrides]
 * @returns {object} InternationalAcademy
 */
export function createInternationalAcademy(overrides = {}) {
  return {
    id: overrides.id ?? null,
    name: overrides.name ?? '',
    countryId: overrides.countryId ?? null, // an INTERNATIONAL_NATION_POOL value, e.g. 'Dominican Republic'
    prestigeTier: overrides.prestigeTier ?? 3, // 1 = powerhouse ... 5 = obscure, same scale as CollegeSchool
    specialty: overrides.specialty ?? null, // one of COLLEGE_SPECIALTIES, reused directly — not a new taxonomy
  };
}
