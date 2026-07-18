// Configurable game-rule toggles. These are the sort of thing a future CBA
// negotiation (cba-negotiation.md's periodic owner-side/player-side
// negotiation model) could plausibly make a negotiated item rather than a
// fixed engine constant — exposed here as an explicit, defaulted options
// object so that hookup can happen later without changing simulateGame()'s
// call shape.

export const DEFAULT_GAME_RULES = Object.freeze({
  // Real-world MLB's 2020+ regular-season extra-innings rule: each
  // half-inning beginning with the first inning past regulation starts with
  // a runner already on second (the batting-order slot immediately
  // preceding that half-inning's leadoff hitter). Off by default — this
  // sim plays traditional extra innings unless a ruleset opts in.
  ghostRunnerOnSecondInExtraInnings: false,
});

/** @param {object} [overrides] @returns {object} resolved rules */
export function resolveGameRules(overrides = {}) {
  return { ...DEFAULT_GAME_RULES, ...overrides };
}
