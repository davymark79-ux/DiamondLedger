// Contract schema — "50-man Roster System" arc, Phase 3
// (financial-model-expenses.md's "Player Payroll" section). Data shape
// only: no salary generation logic here (see engine/contracts.js) — same
// "schema vs. engine" split as models/Player.js itself.

/**
 * @typedef {Object} Contract
 * @property {'MAJORS'|'MINORS'|'BOTH'} type - per the doc: "a contract can
 *   span both (e.g. a guaranteed major-league deal that survives an
 *   option to the minors)".
 * @property {number} annualSalary - whole dollars.
 * @property {boolean} guaranteed - whether the club owes this money
 *   regardless of roster status (real MLB/40-man-style deals) vs. a
 *   standard non-guaranteed minor-league contract.
 */

export const CONTRACT_TYPES = {
  MAJORS: 'MAJORS',
  MINORS: 'MINORS',
  BOTH: 'BOTH',
};

/**
 * @param {object} overrides
 * @param {string} overrides.type - one of CONTRACT_TYPES
 * @param {number} overrides.annualSalary
 * @param {boolean} overrides.guaranteed
 * @returns {Contract}
 */
export function createContract(overrides) {
  return {
    type: overrides.type,
    annualSalary: overrides.annualSalary,
    guaranteed: overrides.guaranteed,
  };
}
