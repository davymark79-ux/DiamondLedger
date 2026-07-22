// College School schema — player-pathway.md's "abstracted development
// location, not a simulated league. A school is a named entity that
// modifies a player's development curve, nothing more." No schedules, no
// box scores, no games — every effect a school has flows through its
// prestige tier + specialty into engine/growthModel.js's locationModifier.

/**
 * @param {object} [overrides]
 * @returns {object} CollegeSchool
 */
export function createCollegeSchool(overrides = {}) {
  return {
    id: overrides.id ?? null,
    name: overrides.name ?? '',
    prestigeTier: overrides.prestigeTier ?? 3, // 1 = powerhouse ... 5 = obscure
    specialty: overrides.specialty ?? null, // one of COLLEGE_SPECIALTIES, or null (generalist program)
  };
}
