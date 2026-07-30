// ServiceRecord schema — "50-man Roster System" arc, Phases 4-5
// (player-movement.md's "Service Time & Free Agency" and "Options"/
// "Outright Assignment Refusal Rights" sections). Data shape only: no
// accrual/eligibility/transaction logic here (see engine/serviceTime.js,
// engine/optionsWaiversDfa.js) — same "schema vs. engine" split as
// models/Player.js/models/Contract.js themselves.

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
 * @property {number} standardOptionYearsUsed - career total, "50-man
 *   Roster System" arc Phase 5 (engine/optionsWaiversDfa.js). Distinct
 *   from Player.optionYearsUsed (Phase 2's Taxi Squad blanket-option
 *   mechanic) — the doc is explicit these are separate, non-counting-
 *   against-each-other systems.
 * @property {boolean} wasOutrightedBefore - whether this player has ever
 *   been outright-assigned to the minors before. Phase 4's
 *   isOutrightRefusalEligible took this as an external param specifically
 *   because it couldn't be computed until Phase 5 existed to set it.
 * @property {{draftedSeasonNumber: number, originalTeamId: string}|null} rule5
 *   - "50-man Roster System" arc Phase 8 (engine/rule5Draft.js). Non-null
 *   only while a Rule-5-drafted player is still serving his obligation:
 *   per player-movement.md he must be kept on the drafting club's active
 *   26-man roster for the whole following season (he cannot be optioned)
 *   or be offered back to `originalTeamId`. Cleared once he sticks.
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
    standardOptionYearsUsed: overrides.standardOptionYearsUsed ?? 0,
    wasOutrightedBefore: overrides.wasOutrightedBefore ?? false,
    rule5: overrides.rule5 ?? null,
  };
}
