// Manager Firing & Rehiring — managers.md's Career Lifecycle, tying Firing
// to "the main design doc's existing 'Coaches fired' Scripted Event
// category (triggered by win%, chemistry, owner patience)."
//
// That entry (baseball-sim-design-doc.md) is the ENTIRE spec — three named
// factors, zero numeric thresholds, and no generic Scripted Event framework
// was ever built (only disconnected mock flavor data exists). Of the three:
// - Win% is real today, just not previously exposed as a reusable helper.
// - Owner patience has zero elaboration anywhere in the docs — built here
//   as a new, honestly-flagged placeholder stat, a clean slate rather than
//   a system this risks duplicating.
// - Chemistry is EXPLICITLY NOT included here, on purpose, not an oversight:
//   player-relationships.md already gives it a real future design
//   ("computed as an aggregate... of the current roster's individual Org
//   Affinity scores"), itself unbuilt (no orgAffinity field exists, and
//   Org Affinity's own inputs — tenure, Team Reputation, org investment —
//   are all unbuilt too). Approximating chemistry here would preempt and
//   likely conflict with that real design rather than defer to it. When
//   Org Affinity/chemistry gets built, this is where its factor plugs in.
//
// Unlike player/manager retirement (engine/retirement.js), firing doesn't
// need a season-to-season boundary — real teams fire managers mid-season
// after bad stretches (mockData.js's old flavor text already assumed
// exactly this: "Manager dismissed after 14-32 stretch"). This is wired
// directly into engine/season.js's existing single-season loop, not left
// standalone-and-unwired like the two retirement mechanics.

const OWNER_PATIENCE_MIN = 0;
const OWNER_PATIENCE_MAX = 100;
const OWNER_PATIENCE_NEUTRAL = 50;

// A newly-hired manager gets a fresh evaluation window (see
// engine/season.js's tenureRecordById) AND a modest benefit-of-the-doubt
// patience boost — a real honeymoon, not a blank slate back to neutral.
export const HONEYMOON_PATIENCE = 60;

// Asymmetric on purpose — "owners get impatient faster than they get
// grateful," a real, flagged placeholder shape, not a symmetric random walk.
const PATIENCE_LOSS_DELTA = 1.5;
const PATIENCE_WIN_DELTA = 1.0;

/**
 * @param {number} wins
 * @param {number} losses
 * @returns {number} 0-1, 0 if no games played yet
 */
export function computeWinPct(wins, losses) {
  const games = wins + losses;
  return games > 0 ? wins / games : 0;
}

/**
 * @param {number} currentPatience - 0-100
 * @param {boolean} won - this game's result
 * @returns {number} 0-100, clamped
 */
export function updateOwnerPatience(currentPatience, won) {
  const delta = won ? PATIENCE_WIN_DELTA : -PATIENCE_LOSS_DELTA;
  return Math.min(OWNER_PATIENCE_MAX, Math.max(OWNER_PATIENCE_MIN, currentPatience + delta));
}

// No team fires a .500-or-better manager under this model — a real,
// deliberate simplification (win% shortfall is the only thing that opens
// the door at all; patience only amplifies how quickly a bad record
// becomes fatal, it never creates risk on its own).
const MIN_GAMES_BEFORE_FIRING_ELIGIBLE = 20; // games under the CURRENT manager, not the team's whole season
const FIRING_BASE_SENSITIVITY = 0.05;
const FIRING_PATIENCE_SENSITIVITY = 0.15;

/**
 * @param {number} winPct - 0-1, under the CURRENT manager's tenure (see engine/season.js's tenureRecordById)
 * @param {number} gamesUnderManager
 * @param {number} ownerPatience - 0-100 (OWNER_PATIENCE_NEUTRAL default upstream)
 * @returns {number} probability [0, 1) this manager is fired after this game
 */
export function computeFiringProbability(winPct, gamesUnderManager, ownerPatience) {
  if (gamesUnderManager < MIN_GAMES_BEFORE_FIRING_ELIGIBLE) return 0;
  const winPctShortfall = Math.max(0, 0.5 - winPct);
  if (winPctShortfall === 0) return 0;
  const patienceFactor = (OWNER_PATIENCE_MAX - ownerPatience) / OWNER_PATIENCE_MAX;
  return winPctShortfall * (FIRING_BASE_SENSITIVITY + patienceFactor * FIRING_PATIENCE_SENSITIVITY);
}

/**
 * @param {number} winPct
 * @param {number} gamesUnderManager
 * @param {number} ownerPatience
 * @param {() => number} rng
 * @returns {boolean}
 */
export function rollFiring(winPct, gamesUnderManager, ownerPatience, rng) {
  return rng() < computeFiringProbability(winPct, gamesUnderManager, ownerPatience);
}

export { OWNER_PATIENCE_NEUTRAL };
