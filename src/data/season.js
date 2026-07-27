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

import { teams, freeAgents, getTeamRoster, getTeamManager } from './realLeague.js';
import { affiliateClubs, initialAffiliateRosterByClubId } from './realAffiliates.js';
import { advanceOffseason } from '../engine/leagueProgression.js';
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
import { advanceEstablishedFreeAgentPool } from '../engine/freeAgency.js';
import {
  createInitialQuotientByTeamId,
  decayQuotientsForNewSeason,
  foldRegularSeasonResults,
  foldResultsArray,
  foldPlayoffResult,
  K_CONTEXT,
} from '../engine/tournamentQuotient.js';
import { drawCupGroups, simulateSeasonWithCup, buildCupGroupStandings, computeCupAdvancement, reseedForKnockout, buildKnockoutBracket } from '../engine/ledgerCup.js';
import { computeInitialReserveRoster, revalidateAndTopUpReserveRoster } from '../engine/rosterProtection.js';
import { computeInitialTaxiSquad, revalidateAndTopUpTaxiSquad, resolveTaxiPlayers, incrementOptionYearsUsed } from '../engine/taxiSquad.js';
import { buildExpansionBenchPlayers, EXPANSION_TRIGGER_WEEKS_REMAINING } from '../engine/rosterExpansion.js';
import { assignMissingContracts } from '../engine/contracts.js';
import { createRng } from '../models/generation/random.js';
import { saveLeagueState, loadLeagueState, deleteLeagueState } from './indexedDbStorage.js';

const SEASON_RNG_BASE_SEED = 20260201; // this league's original single-season seed — season 1 must reproduce it exactly
// The old localStorage key (v1-v7, superseded by the IndexedDB migration
// above) — exported purely so src/state/LeagueStateContext.jsx can do a
// one-time best-effort cleanup of any orphaned entry left over from before
// this migration. Not read from anymore; nothing migrates its contents.
export const LEGACY_LOCAL_STORAGE_KEY = 'diamondLedger.leagueState.v7';
// Bumped whenever the persisted state's SHAPE changes (v15: "The 50-man
// Roster System" arc's Phase 3 adds a real `contract` field to every
// org-affiliated player — active roster, Reserve pool, and every other
// AAA/AA/A/Rookie affiliate player; see engine/contracts.js) — continues
// the old v1-v7 localStorage version-bump convention, but now enforced as
// a real field ON the state object itself and checked on load (see
// isCompatibleSave below), since IndexedDB only ever has the one 'current'
// key (data/indexedDbStorage.js) — there's no separate versioned key to
// bump the way localStorage had.
export const STATE_SCHEMA_VERSION = 15;

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

/**
 * A saved state is only usable if its schemaVersion matches this build's
 * expected shape exactly — a missing/older/newer number means at least one
 * Map/field this code now assumes exists (e.g. Phase 5's
 * establishedFreeAgentPoolById) may be absent, which would crash deep in a
 * getter rather than fail loudly here. Same discard-don't-migrate
 * precedent as the old localStorage v1-v7 convention (LEGACY_LOCAL_STORAGE_KEY
 * above) — a mismatched save is simply ignored; the caller
 * (LeagueStateContext.jsx's hydration effect) falls back to
 * initialLeagueState, a fresh season 1 already stamped with the current
 * STATE_SCHEMA_VERSION.
 *
 * Exported as its own pure predicate (rather than inlined into
 * loadStateAsync) so scripts/validate-free-agency.mjs can exercise it
 * directly without a real IndexedDB (unavailable in Node).
 * @param {object|null} saved
 * @returns {boolean}
 */
export function isCompatibleSave(saved) {
  return !!saved && saved.schemaVersion === STATE_SCHEMA_VERSION;
}

/** @returns {Promise<object|null>} a saved, SCHEMA-COMPATIBLE state if one exists, otherwise null. Never throws. */
export async function loadStateAsync() {
  try {
    const saved = await loadLeagueState();
    return isCompatibleSave(saved) ? saved : null;
  } catch (err) {
    console.warn('Failed to load saved league state, starting fresh:', err);
    return null;
  }
}

/**
 * "50-man Roster System" arc, Phase 2 — builds the roster-resolution
 * closures engine/ledgerCup.js's simulateSeasonWithCup needs to actually
 * use Taxi Squad/expansion players in simulated games, plus the
 * teamId -> Set(taxi ids) map resolveAvailableRoster/resolveRestedRoster
 * use to apply shuttle fatigue. `getTeamRosterWithTaxi` (base 26 + that
 * team's live taxi players in `bench`) doubles as the base `getTeamRoster`
 * arg for EVERY open regular-season week, not just non-expanded ones — Taxi
 * Squad relief applies all season, unlike expansion, which only kicks in
 * from the trigger week onward (`getExpandedTeamRoster` layers 2 more
 * reserve players on top of the same taxi-augmented base).
 * @param {object[]} currentTeams
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, string[]>} taxiRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{getTeamRosterWithTaxi: (teamId: string) => object, getExpandedTeamRoster: (teamId: string) => object, taxiIdsByTeamId: Map<string, Set<string>>}}
 */
function buildTaxiAugmentedRosterFns(currentTeams, rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId) {
  const taxiIdsByTeamId = new Map(currentTeams.map((t) => [t.id, new Set(taxiRosterByTeamId.get(t.id) ?? [])]));

  function getTeamRosterWithTaxi(teamId) {
    const base = rosterByTeamId.get(teamId);
    const taxiPlayers = resolveTaxiPlayers(teamId, taxiRosterByTeamId.get(teamId) ?? [], affiliateRosterByClubId);
    return { ...base, bench: [...base.bench, ...taxiPlayers] };
  }

  function getExpandedTeamRoster(teamId) {
    const withTaxi = getTeamRosterWithTaxi(teamId);
    const expansionPlayers = buildExpansionBenchPlayers(
      teamId, reserveRosterByTeamId, taxiRosterByTeamId.get(teamId) ?? [], affiliateRosterByClubId
    );
    return { ...withTaxi, bench: [...withTaxi.bench, ...expansionPlayers] };
  }

  return { getTeamRosterWithTaxi, getExpandedTeamRoster, taxiIdsByTeamId };
}

export function computeFreshSeason1State() {
  const rosterByTeamId = new Map(teams.map((t) => [t.id, getTeamRoster(t.id)]));
  const managerByTeamId = new Map(teams.map((t) => [t.id, getTeamManager(t.id)]));
  const affiliateRosterByClubId = initialAffiliateRosterByClubId();
  const asOfDate = new Date();
  const rng = seasonRngForNumber(1);

  // 50-man Roster System, Phase 1 — up to 24 of each team's own AAA/AA
  // affiliate players protection-designated onto the 50-man pool. A pure
  // quality sort, no rng consumed (see engine/rosterProtection.js's own
  // header for why this is a designation over EXISTING players, not new
  // generation).
  const reserveRosterByTeamId = new Map(teams.map((t) => [t.id, computeInitialReserveRoster(t.id, affiliateRosterByClubId)]));

  // 50-man Roster System, Phase 2 — up to TAXI_SQUAD_SIZE of each team's
  // OWN reserve pool designated as this season's Taxi Squad (never a
  // separate pool — see engine/taxiSquad.js's header). Every player on the
  // finalized list burns one option year for this season, per the
  // "designated at the start of the season" / "single blanket option"
  // design (Player Movement doc) — real bookkeeping now, enforcement is
  // Phase 5's job.
  const taxiRosterByTeamId = new Map(teams.map((t) => [t.id, computeInitialTaxiSquad(t.id, reserveRosterByTeamId, affiliateRosterByClubId)]));
  for (const team of teams) incrementOptionYearsUsed(team.id, taxiRosterByTeamId.get(team.id), affiliateRosterByClubId);
  const { getTeamRosterWithTaxi, getExpandedTeamRoster, taxiIdsByTeamId } = buildTaxiAugmentedRosterFns(
    teams, rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId
  );

  // Tournament Quotient (Ledger Cup arc, Phase 2) — the 50 real teams are
  // established clubs being newly rated for the first time, not fictional
  // expansion clubs, so they start at CENTER (60.00), not the floor
  // reserved for a genuine new/expansion club (see
  // engine/tournamentQuotient.js). No decay call this season — season 1
  // has no prior season to decay from, same precedent as
  // promotionRelegationSwaps: [] below.
  let quotientByTeamId = createInitialQuotientByTeamId(teams.map((t) => t.id));

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

  // Season 1 has no Cup activity at all — no Quotient history exists yet
  // to draw group-stage pots from (cupGroups: null degrades
  // simulateSeasonWithCup to running exactly the same open-weeks-only path
  // simulateOneSeason used to, byte-identical at the same seed — see
  // engine/ledgerCup.js's own header). The first real group stage runs at
  // season 2 (see advanceToNextSeason).
  const { seasonResult, weekPlan } = simulateSeasonWithCup(
    teams,
    getTeamRosterWithTaxi,
    (id) => managerByTeamId.get(id),
    rng,
    null,
    null,
    undefined,
    getExpandedTeamRoster,
    EXPANSION_TRIGGER_WEEKS_REMAINING,
    taxiIdsByTeamId
  );
  // Regular-season fold — a pure post-hoc pass over this season's own
  // already-complete results array (see engine/tournamentQuotient.js's
  // header for why this isn't threaded live through simulateSeason itself).
  quotientByTeamId = foldRegularSeasonResults(quotientByTeamId, seasonResult.results);
  // knockout stays NONE too — a real bracket needs a completed group stage
  // to reseed from (see advanceToNextSeason), and season 1 has none.
  const cupState = {
    groupStagePhase: 'NONE', groups: null, cupGroupStandingsById: null, advancingTeamIds: null,
    knockout: { phase: 'NONE', seeds: null, playIn: null, roundOf16: null, quarterfinal: null, semifinal: null, final: null, championTeamId: null },
  };
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
  // Playoff fold — covers every series: both leagues' WC Round + LCS, the
  // Finals, and the MLB2 Championship (all at K_CONTEXT.LEAGUE_PLAYOFFS).
  quotientByTeamId = foldPlayoffResult(quotientByTeamId, playoffResult);

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

  // Free Agency (Phase 5) — migrates realLeague.js's frozen, never-wired
  // `freeAgents` array into LIVE, persisted state: ages/persists/prunes
  // across seasons via advanceEstablishedFreeAgentPool, same "read once,
  // then own the Map going forward" treatment teams/players/managers
  // already get from realLeague.js. A real season-1 retirement pass too,
  // for consistency with every other free-agent pool.
  const establishedFreeAgentPoolById = new Map(freeAgents.map((p) => [p.id, p]));
  advanceEstablishedFreeAgentPool(establishedFreeAgentPoolById, rng, asOfDate);

  // 50-man Roster System, Phase 3 — run LAST, after every draft/college/
  // international signing this season has already produced every new
  // player who needs one (see engine/contracts.js's own header for why a
  // single sweep here is enough: it never overwrites an existing
  // contract, so anyone already assigned earlier this function — none yet,
  // season 1 starts from scratch — is left untouched).
  assignMissingContracts(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId, asOfDate);

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
    weekPlan,
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
    establishedFreeAgentPoolById,
    quotientByTeamId,
    cupState,
    reserveRosterByTeamId,
    taxiRosterByTeamId,
    schemaVersion: STATE_SCHEMA_VERSION,
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

  // Decay — once per NEW season, before this season's own games run, using
  // ratings as they stood at the end of the PRIOR season (state.quotientByTeamId
  // already has that prior season's own regular-season + playoff folds
  // applied, from when `state` was first produced). Every club decays
  // regardless of activity.
  let quotientByTeamId = decayQuotientsForNewSeason(state.quotientByTeamId);

  // Ledger Cup group stage (Phase 3, Group Stage half) — every season from
  // season 2 onward has real Quotient history to seed pots from. Draws
  // from state.quotientByTeamId (the PRIOR season's own final rating,
  // before the decay step above) — season 1 itself never reaches here
  // (computeFreshSeason1State stays cupState.groupStagePhase: 'NONE'), so
  // this unconditionally runs a real group stage every transition.
  const cupGroups = drawCupGroups(teamsForNextSeason, state.quotientByTeamId, rng);

  // Ledger Cup Knockout Bracket (Phase 3b) — reseeds and resolves THIS
  // season using the PRIOR season's already-completed group stage
  // (state.cupState, not the cupGroups/advancement being computed THIS
  // transition — that becomes NEXT season's own knockout input, same
  // one-season-lag structure the doc itself specs). Season 2's own
  // transition is the first to see a real completed group stage in
  // state.cupState (season 1 stays groupStagePhase: 'NONE'), so season 3
  // is genuinely the first real knockout.
  const cupKnockout = state.cupState.groupStagePhase === 'GROUP_STAGE'
    ? buildKnockoutBracket(reseedForKnockout(state.cupState.advancingTeamIds, state.cupState.cupGroupStandingsById))
    : null;

  const { rosterByTeamId, managerByTeamId } = advanceOffseason(
    teamsForNextSeason,
    state.rosterByTeamId,
    state.seasonResult.managerAssignmentById,
    state.roleStateById, // mutated in place by advanceOffseason — the same Map instance is carried forward, per its own "owned across seasons by the caller" contract
    asOfDate,
    rng,
    state.affiliateRosterByClubId, // also mutated in place by the call-up cascade — same ownership contract as roleStateById
    state.reserveRosterByTeamId // read-only here (a protected reserve fit, if consumed, is reflected via affiliateRosterByClubId's own mutation above) — revalidation/top-up happens below, after this season's own affiliate composition is fully settled
  );

  // 50-man Roster System, Phase 2 — this season's own games use the PRIOR
  // season's already-finalized Taxi Squad/Reserve lists (state.*, matching
  // the same "not continuously live-updated mid-season" precedent Phase 1
  // established for the Reserve pool itself — see the revalidation below,
  // which computes the NEW lists this season's own churn produces, ready
  // for the FOLLOWING season's games, not this one).
  const { getTeamRosterWithTaxi, getExpandedTeamRoster, taxiIdsByTeamId } = buildTaxiAugmentedRosterFns(
    teamsForNextSeason, rosterByTeamId, state.reserveRosterByTeamId, state.taxiRosterByTeamId, state.affiliateRosterByClubId
  );

  const { seasonResult, weekPlan, cupGroupResults, cupKnockoutResult } = simulateSeasonWithCup(
    teamsForNextSeason,
    getTeamRosterWithTaxi,
    (id) => managerByTeamId.get(id),
    rng,
    cupGroups,
    cupKnockout,
    undefined,
    getExpandedTeamRoster,
    EXPANSION_TRIGGER_WEEKS_REMAINING,
    taxiIdsByTeamId
  );
  quotientByTeamId = foldRegularSeasonResults(quotientByTeamId, seasonResult.results);
  // Cup group-stage games fold in too, at their own (higher) K_CONTEXT —
  // consuming K_CONTEXT.CUP_GROUP_STAGE for the first time anywhere in the
  // live app (it's existed, inert, since Phase 2). NOT part of
  // seasonResult.results, so this is a genuinely separate fold, matching
  // foldPlayoffResult's own precedent below.
  quotientByTeamId = foldResultsArray(quotientByTeamId, cupGroupResults, K_CONTEXT.CUP_GROUP_STAGE);

  // Knockout games fold in too, at K_CONTEXT.CUP_KNOCKOUT (existed, inert,
  // since Phase 2) — flattening every round's own games array into one
  // flat results-shaped list first, since cupKnockoutResult keeps them
  // grouped by round/series for the eventual bracket UI (Phase 4), not
  // pre-flattened.
  if (cupKnockoutResult) {
    const allKnockoutGames = [
      ...cupKnockoutResult.playIn, ...cupKnockoutResult.roundOf16,
      ...cupKnockoutResult.quarterfinal, ...cupKnockoutResult.semifinal, cupKnockoutResult.final,
    ].flatMap((series) => series.games);
    quotientByTeamId = foldResultsArray(quotientByTeamId, allKnockoutGames, K_CONTEXT.CUP_KNOCKOUT);
  }

  const cupGroupStandingsById = buildCupGroupStandings(cupGroupResults);
  const { advancingTeamIds } = computeCupAdvancement(cupGroups.groups, cupGroupStandingsById);
  // This season's own group stage feeds NEXT season's knockout (see
  // cupKnockout above, computed from state.cupState — the PRIOR season's
  // version of this same field). This season's OWN knockout — resolved
  // above via cupKnockout/cupKnockoutResult — used the PRIOR season's
  // advancement, not this one.
  const cupState = {
    groupStagePhase: 'GROUP_STAGE', groups: cupGroups.groups, cupGroupStandingsById, advancingTeamIds,
    knockout: cupKnockoutResult
      ? {
          phase: 'COMPLETE', seeds: cupKnockoutResult.seeds,
          playIn: cupKnockoutResult.playIn, roundOf16: cupKnockoutResult.roundOf16,
          quarterfinal: cupKnockoutResult.quarterfinal, semifinal: cupKnockoutResult.semifinal,
          final: cupKnockoutResult.final, championTeamId: cupKnockoutResult.championTeamId,
        }
      : { phase: 'NONE', seeds: null, playIn: null, roundOf16: null, quarterfinal: null, semifinal: null, final: null, championTeamId: null },
  };

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
  quotientByTeamId = foldPlayoffResult(quotientByTeamId, playoffResult);

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

  // Same "this new season's own culmination" timing as the pathways above
  // — mutated in place, same instance carried forward as everything else
  // this arc touches.
  advanceEstablishedFreeAgentPool(state.establishedFreeAgentPoolById, rng, asOfDate);

  // 50-man Roster System, Phase 1 — revalidate + top up AFTER this
  // season's full affiliate-composition churn (retiree-replacement's
  // reserve consumption above, the draft/college/international pathways)
  // has fully settled, using state.affiliateRosterByClubId's own final,
  // mutated-in-place state for this season. Drops any protected id no
  // longer present in the team's current AAA/AA rosters and tops up from
  // the next-best currently-unprotected player. No rng consumed.
  const reserveRosterByTeamId = new Map(
    teamsForNextSeason.map((t) => [
      t.id,
      revalidateAndTopUpReserveRoster(t.id, state.reserveRosterByTeamId.get(t.id) ?? [], state.affiliateRosterByClubId),
    ])
  );

  // 50-man Roster System, Phase 2 — same "revalidate after this season's
  // full churn has settled" timing as the Reserve pool above, using the
  // JUST-revalidated reserveRosterByTeamId (never state.reserveRosterByTeamId
  // — a taxi id must be valid against the CURRENT reserve list, not the
  // stale prior one). Every player on the finalized list burns another
  // option year for this season (every season he's on it, not just his
  // first — confirmed by the user), mutating state.affiliateRosterByClubId
  // in place, same ownership contract as everything else this arc touches.
  const taxiRosterByTeamId = new Map(
    teamsForNextSeason.map((t) => [
      t.id,
      revalidateAndTopUpTaxiSquad(
        t.id, state.taxiRosterByTeamId.get(t.id) ?? [], reserveRosterByTeamId.get(t.id) ?? [], state.affiliateRosterByClubId
      ),
    ])
  );
  for (const t of teamsForNextSeason) incrementOptionYearsUsed(t.id, taxiRosterByTeamId.get(t.id), state.affiliateRosterByClubId);

  // 50-man Roster System, Phase 3 — run LAST, after every draft/college/
  // international signing and minor-league backfill this season has
  // already produced every new player who needs one. Never overwrites an
  // existing contract (see engine/contracts.js's own header) — every
  // player who already had one before this transition keeps it unchanged.
  assignMissingContracts(rosterByTeamId, reserveRosterByTeamId, state.affiliateRosterByClubId, asOfDate);

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
    weekPlan,
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
    establishedFreeAgentPoolById: state.establishedFreeAgentPoolById,
    quotientByTeamId,
    cupState,
    reserveRosterByTeamId,
    taxiRosterByTeamId,
    schemaVersion: STATE_SCHEMA_VERSION,
  };
}
