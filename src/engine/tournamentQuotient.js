// Tournament Quotient — tournament-quotient.md (v0.3). A persistent, bounded
// Elo-style rating per team (20.00 floor - 100.00 ceiling, hard-clamped,
// center/decay-target 60.00). Moves after every game a club plays in ANY
// context (regular season, Cup group/knockout [inert - Phase 3's job],
// League Playoffs), decays gently once per season. Feeds the future Cup's
// initial pot seeding (Phase 3, unbuilt) - this phase only builds the
// rating system and starts it accumulating real history; nothing consumes
// it yet (no UI, no other engine file reads it).
//
// Post-hoc fold, not a live-threaded external accumulator: nothing in this
// engine uses a team-level strength rating as an INPUT to affect game
// outcomes (buildGameSide/simulateGame are driven entirely by individual
// player ratings) - Quotient is a pure OUTPUT, so a single pass over an
// already-complete results/games array after simulateOneSeason()/
// simulatePlayoffs() finish is strictly simpler and lower-risk than
// threading a new Map through simulateSeason's internals the way
// injuryStatusById/consecutiveGamesPlayedById genuinely need to be (those
// are read/written mid-loop; Quotient never needs to be known DURING
// simulation). Needs ZERO changes to engine/season.js or engine/playoffs.js.

export const QUOTIENT_FLOOR = 20.00;
export const QUOTIENT_CEILING = 100.00;
export const QUOTIENT_CENTER = 60.00; // decay target AND the retrofit-existing-team starting value (NOT the new-club value)
export const QUOTIENT_SCALE = 120; // S, placeholder — an 80-point gap (20 vs 100) implies ~82% single-game win probability for the favorite
export const QUOTIENT_DECAY_RATE = 0.05; // placeholder - 5% pull toward center per season

// Placeholder K_context values, ratio matters more than absolute magnitude.
// CUP_GROUP_STAGE/CUP_KNOCKOUT are defined now but INERT - nothing calls
// them yet, since the Cup itself doesn't exist (Phase 3). Reserved here so
// Phase 3 only has to import, not reinvent.
export const K_CONTEXT = {
  REGULAR_SEASON: 0.4,
  CUP_GROUP_STAGE: 0.7,
  CUP_KNOCKOUT: 1.1,
  LEAGUE_PLAYOFFS: 1.6,
};

export function clampQuotient(value) {
  return Math.min(QUOTIENT_CEILING, Math.max(QUOTIENT_FLOOR, value));
}

/** @returns {number} 0-1, self's win probability against opponent given the current gap */
export function computeExpectedScore(selfRating, opponentRating, scale = QUOTIENT_SCALE) {
  return 1 / (1 + 10 ** ((opponentRating - selfRating) / scale));
}

/** @returns {number} unclamped delta - caller clamps after applying to R_old */
export function computeQuotientDelta(selfRating, opponentRating, actualScore, kContext, scale = QUOTIENT_SCALE) {
  return kContext * (actualScore - computeExpectedScore(selfRating, opponentRating, scale));
}

/**
 * @param {string[]} teamIds
 * @param {number} [startingValue] - QUOTIENT_CENTER (default) for the 50 real
 *   teams being retrofitted (established clubs rated for the first time,
 *   not fictional expansion clubs); QUOTIENT_FLOOR for a genuine future
 *   new/expansion club (no expansion mechanic exists in this app yet, so
 *   this branch is theoretical/future-proofing only).
 * @returns {Map<string, number>}
 */
export function createInitialQuotientByTeamId(teamIds, startingValue = QUOTIENT_CENTER) {
  return new Map(teamIds.map((id) => [id, startingValue]));
}

/**
 * Single game, both perspectives — the core primitive every fold function
 * below composes. Missing team ids default to QUOTIENT_CENTER rather than
 * throwing (matches this codebase's existing "?? default" convention for
 * external-Map lookups).
 * @param {Map<string, number>} quotientByTeamId
 * @param {string} winnerTeamId
 * @param {string} loserTeamId
 * @param {number} kContext - one of K_CONTEXT's values
 * @returns {Map<string, number>} new Map
 */
export function foldGameOutcome(quotientByTeamId, winnerTeamId, loserTeamId, kContext) {
  const next = new Map(quotientByTeamId);
  const winnerRating = quotientByTeamId.get(winnerTeamId) ?? QUOTIENT_CENTER;
  const loserRating = quotientByTeamId.get(loserTeamId) ?? QUOTIENT_CENTER;
  next.set(winnerTeamId, clampQuotient(winnerRating + computeQuotientDelta(winnerRating, loserRating, 1, kContext)));
  next.set(loserTeamId, clampQuotient(loserRating + computeQuotientDelta(loserRating, winnerRating, 0, kContext)));
  return next;
}

/**
 * Folds engine/season.js's simulateSeason() `results` array (no
 * winnerTeamId field there — derived via awayRuns > homeRuns).
 * @param {Map<string, number>} quotientByTeamId
 * @param {object[]} results - simulateSeason()'s returned `results` array
 * @returns {Map<string, number>} new Map
 */
export function foldRegularSeasonResults(quotientByTeamId, results) {
  let next = quotientByTeamId;
  for (const game of results) {
    const awayWon = game.awayRuns > game.homeRuns;
    const winnerTeamId = awayWon ? game.awayTeamId : game.homeTeamId;
    const loserTeamId = awayWon ? game.homeTeamId : game.awayTeamId;
    next = foldGameOutcome(next, winnerTeamId, loserTeamId, K_CONTEXT.REGULAR_SEASON);
  }
  return next;
}

/**
 * Folds one engine/playoffs.js simulateBestOfSeries()-shaped series' `games`
 * array (winnerTeamId IS already present here, unlike regular-season
 * results). Exported standalone since it's the same shape Phase 3's Cup
 * knockout rounds will reuse simulateBestOfSeries for.
 * @param {Map<string, number>} quotientByTeamId
 * @param {{games: object[]}} series
 * @param {number} kContext
 * @returns {Map<string, number>} new Map
 */
export function foldSeriesGames(quotientByTeamId, series, kContext) {
  let next = quotientByTeamId;
  for (const game of series.games) {
    const loserTeamId = game.winnerTeamId === game.awayTeamId ? game.homeTeamId : game.awayTeamId;
    next = foldGameOutcome(next, game.winnerTeamId, loserTeamId, kContext);
  }
  return next;
}

/**
 * Folds a full engine/playoffs.js simulatePlayoffs() result — every
 * league's WC Round (2 series) + LCS (1 series), the cross-league Finals,
 * and the MLB2 Championship. All at K_CONTEXT.LEAGUE_PLAYOFFS — the doc
 * doesn't distinguish MLB2 Championship from "League Playoffs" as its own
 * tier, so this reuses the same weight for both.
 * @param {Map<string, number>} quotientByTeamId
 * @param {{leagues: object, finals: object|null, mlb2Championship: object|null}} playoffResult
 * @returns {Map<string, number>} new Map
 */
export function foldPlayoffResult(quotientByTeamId, playoffResult) {
  let next = quotientByTeamId;
  for (const league of Object.values(playoffResult.leagues)) {
    for (const wcSeries of league.wcRound) next = foldSeriesGames(next, wcSeries, K_CONTEXT.LEAGUE_PLAYOFFS);
    next = foldSeriesGames(next, league.lcs, K_CONTEXT.LEAGUE_PLAYOFFS);
  }
  if (playoffResult.finals) next = foldSeriesGames(next, playoffResult.finals, K_CONTEXT.LEAGUE_PLAYOFFS);
  if (playoffResult.mlb2Championship) next = foldSeriesGames(next, playoffResult.mlb2Championship, K_CONTEXT.LEAGUE_PLAYOFFS);
  return next;
}

/**
 * Once per NEW season, before that season's own games run ("before Opening
 * Day") — applies to every club regardless of activity, a gentle
 * regression-to-mean, not a reset. Never clamped explicitly — a weighted
 * contraction toward 60 starting from an already-in-bounds value can never
 * leave [20, 100].
 * @param {Map<string, number>} quotientByTeamId - ratings as they stood at
 *   the end of the PRIOR season (after that season's own regular-season +
 *   playoff folds already applied)
 * @returns {Map<string, number>} new Map
 */
export function decayQuotientsForNewSeason(quotientByTeamId) {
  const next = new Map();
  for (const [teamId, rating] of quotientByTeamId) {
    next.set(teamId, QUOTIENT_CENTER + (rating - QUOTIENT_CENTER) * (1 - QUOTIENT_DECAY_RATE));
  }
  return next;
}
