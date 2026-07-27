// ServiceRecord schema — "50-man Roster System" arc, Phase 4
// (player-movement.md's "Service Time & Free Agency" section). Data shape
// only: no accrual/eligibility logic here (see engine/serviceTime.js) —
// same "schema vs. engine" split as models/Player.js/models/Contract.js
// themselves.

/**
 * @typedef {Object} ServiceRecord
 * @property {number} mlbServiceDays - career total, accrued in whole-season
 *   172-day increments (see engine/serviceTime.js's own header for why
 *   this engine can't do literal day-precision).
 * @property {number} minorsSeasonsAccrued - career total minor-league
 *   seasons, whole numbers (feeds minor-league free agency).
 * @property {number} firstProSeasonNumber - the season this player was
 *   first added to any organization's system. Set once, never overwritten.
 * @property {number|null} ageAtSigning - captured once at record creation
 *   (feeds Rule 5's 19-vs-under-19 timing split) rather than recomputed
 *   later, which would need a stored historical as-of-date.
 * @property {boolean} wasEverProtected - ever appeared on the 50-man pool
 *   (active 26 OR Reserve pool) — gates Rule 5 exposure and minor-league
 *   free agency, both of which only apply to a player an org has never
 *   protected.
 */

/**
 * @param {object} overrides
 * @param {number} overrides.firstProSeasonNumber
 * @param {number|null} overrides.ageAtSigning
 * @returns {ServiceRecord}
 */
export function createServiceRecord(overrides) {
  return {
    mlbServiceDays: overrides.mlbServiceDays ?? 0,
    minorsSeasonsAccrued: overrides.minorsSeasonsAccrued ?? 0,
    firstProSeasonNumber: overrides.firstProSeasonNumber,
    ageAtSigning: overrides.ageAtSigning ?? null,
    wasEverProtected: overrides.wasEverProtected ?? false,
  };
}
