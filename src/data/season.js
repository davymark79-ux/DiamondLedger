// The real 50-team league's LIVE, advanceable season state — persisted to
// IndexedDB so progress survives a reload (explicit user choice; the
// simpler alternative was resetting to season 1 on every reload).
// Originally localStorage-backed; migrated to IndexedDB (see
// data/indexedDbStorage.js's header) once the College System + International
// Academy populations pushed the real, serialized state size well past
// localStorage's ~5-10MB-per-origin quota — those populations are
// retirement-BOUNDED, not capped, so they keep growing every season by
// design and localStorage could never keep up long-term.
//
// This module owns the pure state-transition + persistence logic; the React
// wiring (Context/hook, the "Simulate Next Season" action, per-page getters)
// lives in src/state/LeagueStateContext.jsx, which is the only thing that
// imports from here in practice.
//
// Rng design: no single continuously-mutating rng instance is shared across
// the app's lifetime. `createRng(seed)` returns a closure that mutates its
// own internal state on every call — a single long-lived instance touched
// anywhere React might double-invoke (a lazy useState initializer, a
// useReducer reducer body — both of which React 18 StrictMode, active in
// main.jsx, deliberately double-invokes in dev to surface impure code)
// would silently desync from a StrictMode-free build. Instead,
// `seasonRngForNumber(n)` derives a fresh, deterministic rng from the
// season number alone — season 1 always reproduces the exact same result
// (matching this league's original single-season seed, 20260201, so a
// fresh browser with no saved state sees identical season-1 values to
// before this feature existed), and there's nothing rng-related to
// persist either.
//
// IndexedDB has no synchronous read API, so unlike the old localStorage
// version, `initialLeagueState` below can no longer eagerly check for a
// saved game at module-load time — it's now always a fresh, deterministic
// season 1. The real "was there a saved game" check happens asynchronously
// in src/state/LeagueStateContext.jsx's mount effect, which swaps in a real
// save (if one exists) via dispatch once IndexedDB resolves.

import { teams, getTeamRoster, getTeamManager } from './realLeague.js';
import { affiliateClubs, initialAffiliateRosterByClubId } from './realAffiliates.js';
import { simulateOneSeason, advanceOffseason } from '../engine/leagueProgression.js';
import { simulateMinorLeagueSeasons } from '../engine/minorLeagues.js';
import { computePromotionRelegationSwaps, applyPromotionRelegationSwaps, applyDivisionSwaps } from '../engine/promotionRelegation.js';
import { simulatePlayoffs } from '../engine/playoffs.js';
import { computeDraftOrder, buildDraftPicks } from '../engine/draft.js';
import { generateHsClass, seedInitialCollegePopulation, runCollegePathway } from '../engine/college.js';
import {
  seedInitialAcademyPopulation,
  generateAcademyClass,
  computeInternationalDraftOrder,
  buildInternationalDraftPicks,
  runInternationalPathway,
} from '../engine/internationalAcademy.js';
import { createRng } from '../models/generation/random.js';
import { saveLeagueState, loadLeagueState, deleteLeagueState } from './indexedDbStorage.js';

const SEASON_RNG_BASE_SEED = 20260201; // this league's original single-season seed — season 1 must reproduce it exactly
// The old localStorage key (v1-v7, superseded by the IndexedDB migration
// above) — exported purely so src/state/LeagueStateContext.jsx can do a
// one-time best-effort cleanup of any orphaned entry left over from before
// this migration. Not read from anymore; nothing migrates its contents.
export const LEGACY_LOCAL_STORAGE_KEY = 'diamondLedger.leagueState.v7';

/**
 * Runs this season's draft (using ITS OWN just-finished standings/playoff
 * result/results — same data promotion/relegation reads) against the
 * combined pool of a fresh HS class and the returning, unclaimed college
 * population, then processes the full College System pathway for
 * everyone else (enrollment, year advancement, graduation, free-agent
 * pruning) — see engine/college.js's runCollegePathway. Mutates
 * `affiliateRosterByClubId`/`collegeEnrollmentById`/`collegePlayersById`/
 * `freeAgentPoolById` in place, same ownership contract as
 * engine/leagueProgression.js's advanceOffseason (roleStateById) and
 * engine/minorLeagues.js's promoteAndBackfill.
 * @param {object[]} currentTeams
 * @param {Map<string, {wins: number, losses: number}>} standingsById
 * @param {object} playoffResult
 * @param {object[]} results
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {Map<string, object>} collegeEnrollmentById
 * @param {Map<string, object>} collegePlayersById
 * @param {Map<string, object>} freeAgentPoolById
 * @param {number} seasonNumber - the season whose results are driving this draft (for a unique HS-class id prefix)
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ seasonNumber: number, picks: object[], selections: object[], collegeSummary: object }} selections are
 *   enriched with {firstName, lastName, primaryPosition, isPitcher, fromCollege, outcome} directly (not just a
 *   playerId) — draftResult needs to stay a fully self-contained, JSON-native display source for the UI.
 */
function runDraftAndCollegePathway(
  currentTeams, standingsById, playoffResult, results,
  affiliateRosterByClubId, collegeEnrollmentById, collegePlayersById, freeAgentPoolById,
  seasonNumber, rng, asOfDate
) {
  const { round1Order, regularOrder } = computeDraftOrder(currentTeams, standingsById, playoffResult, results, rng);
  const picks = buildDraftPicks(round1Order, regularOrder);
  const freshHsClass = generateHsClass(rng, asOfDate, `hs-s${seasonNumber}`);

  const { summary, selections } = runCollegePathway(
    picks, freshHsClass, collegeEnrollmentById, collegePlayersById, freeAgentPoolById, affiliateRosterByClubId, rng, asOfDate
  );

  return { seasonNumber, picks, selections, collegeSummary: summary };
}

/**
 * Runs this season's international draft (a real, separate draft from the
 * domestic one above — no lottery, see engine/internationalAcademy.js's
 * header for why) against the international academy population, processing
 * the full pathway alongside it (college fold-in, signing-window
 * outcomes, year advancement, free-agent-pool pruning) — see
 * engine/internationalAcademy.js's runInternationalPathway. Mutates
 * `affiliateRosterByClubId`/`academyEnrollmentById`/`academyPlayersById`/
 * `collegeEnrollmentById`/`collegePlayersById`/
 * `internationalFreeAgentPoolById` in place, same ownership contract as
 * runDraftAndCollegePathway above.
 *
 * MUST run AFTER runDraftAndCollegePathway for the same season, not before
 * or interleaved: the college fold-in adds brand-new freshman entries into
 * collegeEnrollmentById via College's own enrollFreshman(), which must only
 * become eligible for NEXT season's domestic college draft, not
 * retroactively join one that already resolved earlier in this same call.
 * @param {object[]} currentTeams
 * @param {Map<string, {wins: number, losses: number}>} standingsById
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {Map<string, object>} academyEnrollmentById
 * @param {Map<string, object>} academyPlayersById
 * @param {Map<string, object>} collegeEnrollmentById
 * @param {Map<string, object>} collegePlayersById
 * @param {Map<string, object>} internationalFreeAgentPoolById
 * @param {number} seasonNumber
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ seasonNumber: number, picks: object[], selections: object[], internationalSummary: object }}
 */
function runInternationalPathwayForSeason(
  currentTeams, standingsById, affiliateRosterByClubId,
  academyEnrollmentById, academyPlayersById,
  collegeEnrollmentById, collegePlayersById,
  internationalFreeAgentPoolById, seasonNumber, rng, asOfDate
) {
  const order = computeInternationalDraftOrder(currentTeams, standingsById);
  const picks = buildInternationalDraftPicks(order);
  const { players: freshAcademyClass, enrollments: freshAcademyEnrollments } =
    generateAcademyClass(rng, asOfDate, `intl-s${seasonNumber}`);

  const { summary, selections } = runInternationalPathway(
    picks, freshAcademyClass, freshAcademyEnrollments,
    academyEnrollmentById, academyPlayersById,
    collegeEnrollmentById, collegePlayersById,
    internationalFreeAgentPoolById, affiliateRosterByClubId,
    rng, asOfDate
  );

  return { seasonNumber, picks, selections, internationalSummary: summary };
}

/**
 * Applies each team's CURRENT (live, possibly promoted/relegated) tier and
 * division on top of the static identity data from realLeague.js —
 * city/nickname/marketSize/ownership/leagueId never change season-to-
 * season, but tier and division now can. Used both when advancing a season
 * (engine functions need the current tier/division to schedule/group/pick
 * replacement-quality bands/find playoff division champs correctly) and by
 * the UI (src/state/LeagueStateContext.jsx exposes this as `teams`).
 * @param {object[]} baseTeams - realLeague.js's static teams array
 * @param {Map<string, string>} tierByTeamId
 * @param {Map<string, string>} divisionByTeamId
 * @returns {object[]} shallow copies with `.tier`/`.division` overridden
 */
export function applyLiveOverrides(baseTeams, tierByTeamId, divisionByTeamId) {
  return baseTeams.map((t) => ({
    ...t,
    tier: tierByTeamId.get(t.id) ?? t.tier,
    division: divisionByTeamId.get(t.id) ?? t.division,
  }));
}

function seasonRngForNumber(seasonNumber) {
  return createRng(SEASON_RNG_BASE_SEED + (seasonNumber - 1));
}

// ===== Persistence (IndexedDB — see data/indexedDbStorage.js) =====
// Stored via the structured-clone algorithm, which natively handles Maps,
// Dates, Infinity, and NaN (e.g. injuryStatusById's gamesRemaining is a
// genuine Infinity for season-/career-ending injuries, engine/injuries.js)
// — no serialize/deserialize step needed, the live state shape is stored
// and retrieved as-is.

/** Persists the full live season state — call after every advanceToNextSeason(). Never throws (a full/blocked/absent IndexedDB — e.g. a Node script importing this module — just means progress won't survive a reload, not a crash). */
export async function saveState(state) {
  try {
    await saveLeagueState(state);
  } catch (err) {
    console.warn('Failed to save league state to IndexedDB:', err);
  }
}

/** @returns {Promise<object|null>} a saved state if one exists, otherwise null. Never throws. */
export async function loadStateAsync() {
  try {
    return await loadLeagueState();
  } catch (err) {
    console.warn('Failed to load saved league state, starting fresh:', err);
    return null;
  }
}

function computeFreshSeason1State() {
  const rosterByTeamId = new Map(teams.map((t) => [t.id, getTeamRoster(t.id)]));
  const managerByTeamId = new Map(teams.map((t) => [t.id, getTeamManager(t.id)]));
  const affiliateRosterByClubId = initialAffiliateRosterByClubId();
  const asOfDate = new Date();
  const rng = seasonRngForNumber(1);

  // One-time bootstrap (season 1 only) — backfills all 4 college class
  // years at once so the system starts with a realistic, immediately-
  // populated pyramid instead of an empty one that takes 3+ real seasons
  // to fill up on its own. Every season after this only ever generates a
  // true incoming freshman class (see runDraftAndCollegePathway).
  const { collegeEnrollmentById, collegePlayersById } = seedInitialCollegePopulation(rng, asOfDate);
  const freeAgentPoolById = new Map();

  // Same one-time, season-1-only bootstrap idea as College's, but for the
  // international academy's own fixed 3-year window (see
  // engine/internationalAcademy.js's seedInitialAcademyPopulation).
  const { academyEnrollmentById, academyPlayersById } = seedInitialAcademyPopulation(rng, asOfDate);
  const internationalFreeAgentPoolById = new Map();

  const { seasonResult } = simulateOneSeason(
    teams,
    (id) => rosterByTeamId.get(id),
    (id) => managerByTeamId.get(id),
    rng
  );
  const { standingsById: affiliateStandingsById } = simulateMinorLeagueSeasons(affiliateClubs, affiliateRosterByClubId, rng);
  const playoffResult = simulatePlayoffs(
    teams,
    seasonResult.standingsById,
    rosterByTeamId,
    managerByTeamId,
    seasonResult.injuryStatusById,
    seasonResult.consecutiveGamesPlayedById,
    seasonResult.streakStateById,
    rng
  );

  // Season 1 gets a real draft too, same as playoffs — using its own
  // just-finished standings/playoff result. Draftees are signed straight
  // into affiliateRosterByClubId (mutated in place), so they show up
  // starting with season 2's own minor-league sim, not season 1's (which
  // already ran, above).
  const draftResult = runDraftAndCollegePathway(
    teams, seasonResult.standingsById, playoffResult, seasonResult.results,
    affiliateRosterByClubId, collegeEnrollmentById, collegePlayersById, freeAgentPoolById,
    1, rng, asOfDate
  );

  // Runs AFTER the domestic draft/college pathway above — see
  // runInternationalPathwayForSeason's header for why the ordering matters
  // (its college fold-in must not retroactively join a draft that already
  // resolved earlier in this same call).
  const internationalDraftResult = runInternationalPathwayForSeason(
    teams, seasonResult.standingsById, affiliateRosterByClubId,
    academyEnrollmentById, academyPlayersById,
    collegeEnrollmentById, collegePlayersById,
    internationalFreeAgentPoolById, 1, rng, asOfDate
  );

  return {
    seasonNumber: 1,
    asOfDate,
    rosterByTeamId,
    managerByTeamId,
    roleStateById: new Map(),
    tierByTeamId: new Map(teams.map((t) => [t.id, t.tier])),
    divisionByTeamId: new Map(teams.map((t) => [t.id, t.division])),
    promotionRelegationSwaps: [], // nothing to promote/relegate yet — no prior season exists to evaluate
    playoffResult,
    seasonResult,
    affiliateRosterByClubId,
    affiliateStandingsById,
    draftResult,
    collegeEnrollmentById,
    collegePlayersById,
    freeAgentPoolById,
    academyEnrollmentById,
    academyPlayersById,
    internationalFreeAgentPoolById,
    internationalDraftResult,
  };
}

/** Clears any saved progress and returns a fresh season-1 state. @returns {Promise<object>} */
export async function resetToSeason1() {
  try {
    await deleteLeagueState();
  } catch (err) {
    console.warn('Failed to clear saved league state:', err);
  }
  return computeFreshSeason1State();
}

/**
 * The state the app boots with — ALWAYS a fresh, deterministic season 1
 * (IndexedDB has no synchronous read API, so a saved game can no longer be
 * checked for at this eager, outside-React module-load point the way the
 * old localStorage-backed version could). Computed exactly once at module
 * load so there's no lazy initializer for StrictMode to double-invoke. A
 * real saved game, if one exists, is loaded asynchronously and swapped in
 * by src/state/LeagueStateContext.jsx's mount effect via `loadStateAsync()`.
 */
export const initialLeagueState = computeFreshSeason1State();

/**
 * One offseason (growth/retirement/replenishment for every team) plus the
 * next season's full 150-game simulation, composed the same way
 * engine/leagueProgression.js's own simulateLeagueHistory() loop does it —
 * just one season at a time instead of a fixed N-season batch. Pure:
 * returns a new state object, does not touch storage itself (the caller —
 * LeagueStateContext.jsx's advanceSeason() — calls saveState() explicitly).
 * @param {object} state - the current live state (this module's own shape)
 * @returns {object} the next season's state, same shape
 */
export function advanceToNextSeason(state) {
  const seasonNumber = state.seasonNumber + 1;
  const asOfDate = new Date(state.asOfDate);
  asOfDate.setFullYear(asOfDate.getFullYear() + 1);

  // Promotion/relegation is evaluated against the just-completed season's
  // final standings, BEFORE building next season's rosters/schedule — its
  // result (the new tierByTeamId/divisionByTeamId) is what makes
  // replacement-player quality bands (engine/leagueProgression.js's
  // qualityRangeForTeam), next season's scheduling/grouping
  // (engine/season.js's groupTeamsForScheduling), and next season's own
  // playoff bracket (engine/playoffs.js's computeMLB1PlayoffField, which
  // needs a correct division per team) all correctly reflect the swap.
  const currentTeams = applyLiveOverrides(teams, state.tierByTeamId, state.divisionByTeamId);
  const promotionRelegationSwaps = computePromotionRelegationSwaps(currentTeams, state.seasonResult.standingsById);
  const tierByTeamId = applyPromotionRelegationSwaps(state.tierByTeamId, promotionRelegationSwaps);
  const divisionByTeamId = applyDivisionSwaps(state.divisionByTeamId, promotionRelegationSwaps);
  const teamsForNextSeason = applyLiveOverrides(teams, tierByTeamId, divisionByTeamId);

  const rng = seasonRngForNumber(seasonNumber);

  const { rosterByTeamId, managerByTeamId } = advanceOffseason(
    teamsForNextSeason,
    state.rosterByTeamId,
    state.seasonResult.managerAssignmentById,
    state.roleStateById, // mutated in place by advanceOffseason — the same Map instance is carried forward, per its own "owned across seasons by the caller" contract
    asOfDate,
    rng,
    state.affiliateRosterByClubId // also mutated in place by the call-up cascade — same ownership contract as roleStateById
  );

  const { seasonResult } = simulateOneSeason(
    teamsForNextSeason,
    (id) => rosterByTeamId.get(id),
    (id) => managerByTeamId.get(id),
    rng
  );

  // Minor League seasons for the year just entered — run AFTER the call-up
  // cascade above (so this season's affiliate rosters already reflect any
  // promotions/backfills from the offseason that just happened), same
  // "compute this season's own state" placement as playoffs below.
  const { standingsById: affiliateStandingsById } = simulateMinorLeagueSeasons(affiliateClubs, state.affiliateRosterByClubId, rng);

  // Playoffs are THIS new season's own culmination — computed from its own
  // just-finished standings, not the previous season's (that's what
  // promotion/relegation above already used).
  const playoffResult = simulatePlayoffs(
    teamsForNextSeason,
    seasonResult.standingsById,
    rosterByTeamId,
    managerByTeamId,
    seasonResult.injuryStatusById,
    seasonResult.consecutiveGamesPlayedById,
    seasonResult.streakStateById,
    rng
  );

  // The draft (and the College System pathway alongside it) is likewise
  // THIS new season's own culmination — using the standings/playoff result
  // just computed above, NOT state's (that data already drove the draft
  // that fed THIS season's own incoming rookies, back when this state was
  // first produced — reusing it again here would silently run the same
  // season's results through the draft twice). Draftees/college signings
  // land straight in affiliateRosterByClubId (mutated in place, same
  // instance carried forward) so they're real organizational depth by the
  // time the NEXT transition's call-up cascade/minor-league sim runs;
  // collegeEnrollmentById/collegePlayersById/freeAgentPoolById are
  // likewise mutated in place and carried forward, same ownership
  // contract as everything else this arc touches.
  const draftResult = runDraftAndCollegePathway(
    teamsForNextSeason,
    seasonResult.standingsById,
    playoffResult,
    seasonResult.results,
    state.affiliateRosterByClubId,
    state.collegeEnrollmentById,
    state.collegePlayersById,
    state.freeAgentPoolById,
    seasonNumber,
    rng,
    asOfDate
  );

  // Same "this new season's own culmination" timing as the domestic draft
  // above, and must run AFTER it — see runInternationalPathwayForSeason's
  // header. academyEnrollmentById/academyPlayersById/
  // internationalFreeAgentPoolById are mutated in place and carried
  // forward, same ownership contract as everything else this arc touches.
  const internationalDraftResult = runInternationalPathwayForSeason(
    teamsForNextSeason,
    seasonResult.standingsById,
    state.affiliateRosterByClubId,
    state.academyEnrollmentById,
    state.academyPlayersById,
    state.collegeEnrollmentById,
    state.collegePlayersById,
    state.internationalFreeAgentPoolById,
    seasonNumber,
    rng,
    asOfDate
  );

  return {
    seasonNumber,
    asOfDate,
    rosterByTeamId,
    managerByTeamId,
    roleStateById: state.roleStateById,
    tierByTeamId,
    divisionByTeamId,
    promotionRelegationSwaps,
    playoffResult,
    seasonResult,
    affiliateRosterByClubId: state.affiliateRosterByClubId,
    affiliateStandingsById,
    draftResult,
    collegeEnrollmentById: state.collegeEnrollmentById,
    collegePlayersById: state.collegePlayersById,
    freeAgentPoolById: state.freeAgentPoolById,
    academyEnrollmentById: state.academyEnrollmentById,
    academyPlayersById: state.academyPlayersById,
    internationalFreeAgentPoolById: state.internationalFreeAgentPoolById,
    internationalDraftResult,
  };
}
