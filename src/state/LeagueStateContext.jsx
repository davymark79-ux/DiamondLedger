// React wiring for the live, advanceable season (data/season.js owns the
// pure state-transition + persistence logic; this file is thin — it just
// holds state and exposes it). Every page that used to import directly from
// data/season.js's old static exports now calls useLeagueState() instead;
// the function names/signatures match 1:1 so the migration is mechanical.

import { createContext, useContext, useReducer, useState, useEffect, useCallback, useMemo } from 'react';
import { teams as staticTeams } from '../data/realLeague.js';
import { affiliateClubsById } from '../data/realAffiliates.js';
import {
  initialLeagueState,
  advanceToNextSeason,
  resetToSeason1,
  saveState,
  loadStateAsync,
  applyLiveOverrides,
  LEGACY_LOCAL_STORAGE_KEY,
} from '../data/season.js';
import { resolveAvailableRoster, resolveRestedRoster, buildGameSide } from '../engine/season.js';
import { computeFatiguePenalty } from '../engine/positionPlayerFatigue.js';
import { getPromotionRelegationPairing } from '../models/League.js';
import { LEAGUES } from '../models/constants.js';
import {
  signAmateurFreeAgent as signAmateurFreeAgentEngine,
  signEstablishedFreeAgent as signEstablishedFreeAgentEngine,
} from '../engine/freeAgency.js';
import { computeTeamPayroll, computeLuxuryTaxOwed, SALARY_FLOOR, LUXURY_TAX_THRESHOLD } from '../engine/contracts.js';
import {
  optionPlayerToMinors as optionPlayerToMinorsEngine,
  designateForAssignment as designateForAssignmentEngine,
  hasOptionsRemaining,
} from '../engine/optionsWaiversDfa.js';
import { computeCombinedReverseStandingsOrder } from '../engine/draft.js';
import { computeServiceYears, isFreeAgencyEligible, isArbitrationEligible } from '../engine/serviceTime.js';

const LeagueStateContext = createContext(null);

// A trivial, side-effect-free "replace state" reducer — safe under React 18
// StrictMode's dev-mode double-invocation of reducer functions (same
// payload in, same result out, no rng or other side effect touched here;
// all of that already happened in advanceSeason()/resetSeason() below,
// which are plain event-handler callbacks StrictMode does not double-run).
function reducer(_state, action) {
  return action.payload;
}

const INJURY_SEVERITY_LABELS = {
  DAY_TO_DAY: 'day-to-day',
  SHORT_TERM_IL: '10-day IL',
  LONG_TERM_IL: '60-day IL',
  SEASON_ENDING: 'season-ending',
  CAREER_ENDING: 'career-ending',
};

function formatWinPct(pct) {
  return `.${String(Math.round(pct * 1000)).padStart(3, '0')}`;
}

// Replaces realLeague.js's static playersById for anything reading the
// LIVE roster state — a retiree is replaced by a brand-new player object
// with a brand-new id over time, so the static map goes stale the moment a
// season advances.
function buildPlayersById(rosterByTeamId) {
  const map = new Map();
  for (const roster of rosterByTeamId.values()) {
    for (const player of [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench]) {
      map.set(player.id, player);
    }
  }
  return map;
}

export function LeagueStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialLeagueState);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  // `initialLeagueState` is always a fresh season 1 (data/season.js's
  // IndexedDB migration removed the old synchronous localStorage read at
  // module-load time — see its header). The real "was there a saved game"
  // check happens here instead, once, on mount: if IndexedDB has a real
  // save, swap it in via dispatch before ever rendering `children`, so no
  // page sees a flash of fresh season-1 data that then jumps to a real
  // save. Safe under StrictMode's dev-mode double-invoke (the `cancelled`
  // flag just drops a second in-flight resolution's result — same data
  // either way, so even without the guard this would be harmless, but the
  // guard avoids a wasted dispatch after unmount).
  useEffect(() => {
    let cancelled = false;
    loadStateAsync().then((saved) => {
      if (cancelled) return;
      if (saved) dispatch({ type: 'REPLACE', payload: saved });
      // Best-effort hygiene only — reclaims quota space from the old
      // localStorage-backed version; nothing reads this key anymore.
      try {
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      } catch {
        // ignore — non-critical cleanup
      }
      setIsHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // teams' identity fields (city/nickname/marketSize/ownership/leagueId)
  // never change season-to-season, but tier and division now do
  // (promotion/relegation) — this overlays the live values on top of
  // realLeague.js's static array, so every consumer of `teams` sees the
  // CURRENT tier/division, not the season-1 ones.
  const teams = useMemo(
    () => applyLiveOverrides(staticTeams, state.tierByTeamId, state.divisionByTeamId),
    [state.tierByTeamId, state.divisionByTeamId]
  );
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const playersById = useMemo(() => buildPlayersById(state.rosterByTeamId), [state.rosterByTeamId]);

  // Deferred one tick via setTimeout so the "Simulating..." UI has a chance
  // to paint before the synchronous ~3-4s computation blocks the main
  // thread — not spec-guaranteed, but the standard practical idiom for
  // this, and reliable enough in every real browser for a one-off,
  // non-critical progress affordance. A Web Worker would be the fully
  // correct fix but is disproportionate scope here.
  const advanceSeason = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    setTimeout(async () => {
      const next = advanceToNextSeason(state);
      await saveState(next);
      dispatch({ type: 'REPLACE', payload: next });
      setIsSimulating(false);
    }, 0);
  }, [state, isSimulating]);

  const resetSeason = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    setTimeout(async () => {
      const fresh = await resetToSeason1();
      dispatch({ type: 'REPLACE', payload: fresh });
      setIsSimulating(false);
    }, 0);
  }, [isSimulating]);

  function getTeamRoster(teamId) {
    return state.rosterByTeamId.get(teamId);
  }

  function getTeamRecord(teamId) {
    return state.seasonResult.standingsById.get(teamId) ?? { wins: 0, losses: 0 };
  }

  function getTeamResults(teamId) {
    return state.seasonResult.results.filter((r) => r.awayTeamId === teamId || r.homeTeamId === teamId);
  }

  // Current injury as of the end of the current live season, or null if
  // healthy (or already recovered) — see engine/season.js's advanceInjuriesForTeam.
  function getPlayerInjuryStatus(playerId) {
    return state.seasonResult.injuryStatusById.get(playerId) ?? null;
  }

  // Consecutive games played (as of the end of the current live season)
  // without a rest — see engine/season.js's advanceFatigueForTeam. 0 for
  // anyone who isn't a full-time lineup regular right now (bench, injured,
  // or a Foundry DH-slot player).
  function getPlayerFatigueStatus(playerId) {
    return state.seasonResult.consecutiveGamesPlayedById.get(playerId) ?? 0;
  }

  function getPlayerFatiguePenalty(playerId) {
    return computeFatiguePenalty(getPlayerFatigueStatus(playerId));
  }

  // Current Hot/Cold Streak reading, or null if the player has no batting
  // record yet this season — see engine/hotColdStreaks.js.
  function getPlayerStreakState(playerId) {
    return state.seasonResult.streakStateById.get(playerId) ?? null;
  }

  // "50-man Roster System" arc, Phase 4 (engine/serviceTime.js) — resolves
  // against `playersById` (active-26 only), so this is meaningful for
  // free-agency/arbitration eligibility specifically (Rule 5 exposure only
  // ever applies to NON-active, unprotected affiliate depth, so it's
  // deliberately not exposed here).
  function getPlayerServiceInfo(playerId) {
    const player = playersById.get(playerId);
    if (!player?.serviceRecord) return null;
    return {
      years: computeServiceYears(player.serviceRecord.mlbServiceDays),
      freeAgencyEligible: isFreeAgencyEligible(player.serviceRecord),
      arbitrationEligible: isArbitrationEligible(player.serviceRecord),
    };
  }

  // "50-man Roster System" arc, Phase 5 — which action button TeamDetail.jsx
  // should offer for an active-26 player: "Option" while he has options
  // left, "DFA" once he's out (see engine/optionsWaiversDfa.js's
  // OPTION_YEARS_CAP).
  function getPlayerHasOptionsRemaining(playerId) {
    const player = playersById.get(playerId);
    if (!player?.serviceRecord) return null;
    return hasOptionsRemaining(player);
  }

  // Current manager as of the end of the current live season — managers.md's
  // Career Lifecycle (Firing & Rehiring) can change a team's assignment
  // mid-season. Falls back to this season's starting assignment (should
  // never actually be needed, since every team is pre-seeded in
  // simulateSeason, but matches this codebase's existing graceful-fallback
  // convention elsewhere).
  function getCurrentTeamManager(teamId) {
    return state.seasonResult.managerAssignmentById.get(teamId) ?? state.managerByTeamId.get(teamId) ?? null;
  }

  // Every in-season Firing & Rehiring event for a team THIS season, oldest
  // first — resets each time a season advances (no cross-season history is
  // retained, matching this app's existing "no calendar spans seasons"
  // framing).
  function getTeamManagerChanges(teamId) {
    return state.seasonResult.firings.filter((f) => f.teamId === teamId);
  }

  // Minor League System (engine/minorLeagues.js) — affiliateClubsById is
  // static identity data (data/realAffiliates.js), rosters/standings are
  // live state that evolves every season via the call-up cascade.
  function getAffiliateClub(teamId, level) {
    return affiliateClubsById.get(`${teamId}-${level}`) ?? null;
  }

  function getAffiliateRoster(clubId) {
    return state.affiliateRosterByClubId.get(clubId) ?? { lineup: [], rotation: [], bullpen: [], bench: [] };
  }

  function getAffiliateStandings(clubId) {
    return state.affiliateStandingsById.get(clubId) ?? { wins: 0, losses: 0 };
  }

  // 50-man Roster System, Phase 1 (engine/rosterProtection.js) — resolves
  // teamId's protected reserve ids against its CURRENT AAA/AA affiliate
  // rosters (not a cached snapshot), so a player who's since been called
  // up/traded/retired simply drops out of the resolved list for this
  // render, matching the existing "resolve from live source of truth"
  // pattern getAffiliateRoster/getAffiliateStandings already use. Returns
  // each player plus which level (AAA or AA) he's currently actually
  // playing at — protection doesn't pull him out of that team's real
  // season, it's purely a designation layered on top.
  function getReserveRoster(teamId) {
    const protectedIds = new Set(state.reserveRosterByTeamId.get(teamId) ?? []);
    if (protectedIds.size === 0) return [];
    const results = [];
    for (const level of ['AAA', 'AA']) {
      const roster = getAffiliateRoster(`${teamId}-${level}`);
      for (const player of [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench]) {
        if (protectedIds.has(player.id)) results.push({ player, level });
      }
    }
    return results;
  }

  // 50-man Roster System, Phase 2 — same "resolve live against the CURRENT
  // AAA/AA rosters" pattern as getReserveRoster above (Taxi Squad is always
  // a subset of the Reserve pool, see engine/taxiSquad.js's header). Taxi
  // players actually enter simulated games during the season (unlike the
  // rest of the Reserve pool) — data/season.js's incrementOptionYearsUsed
  // is what keeps each player's own optionYearsUsed field current.
  function getTaxiSquad(teamId) {
    const taxiIds = new Set(state.taxiRosterByTeamId.get(teamId) ?? []);
    if (taxiIds.size === 0) return [];
    const results = [];
    for (const level of ['AAA', 'AA']) {
      const roster = getAffiliateRoster(`${teamId}-${level}`);
      for (const player of [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench]) {
        if (taxiIds.has(player.id)) results.push({ player, level });
      }
    }
    return results;
  }

  // "50-man Roster System" arc, Phase 3 (engine/contracts.js) — real
  // per-team payroll, summed across the active 26 and the Reserve pool
  // specifically (the same 50-man basis real MLB's own luxury-tax
  // calculation uses), plus the flat floor/threshold every team is
  // measured against. A live aggregation, not stored state.
  function getTeamPayroll(teamId) {
    const payroll = computeTeamPayroll(teamId, state.rosterByTeamId, state.reserveRosterByTeamId, state.affiliateRosterByClubId);
    return {
      payroll,
      taxOwed: computeLuxuryTaxOwed(payroll),
      belowFloor: payroll < SALARY_FLOOR,
      overThreshold: payroll > LUXURY_TAX_THRESHOLD,
    };
  }

  // Domestic Draft (engine/draft.js) — this season's real draft, already
  // fully self-contained (selections carry player display fields directly,
  // see data/season.js's runDraftAndCollegePathway) so no extra lookup is
  // needed here.
  function getDraftResult() {
    return state.draftResult;
  }

  // College System (engine/college.js) — this season's pathway counts
  // (new enrollments, refusals, sign-vs-stay outcomes, graduations, free-
  // agent retirements), already folded into draftResult since both run
  // together at the same season boundary.
  function getCollegeSummary() {
    return state.draftResult.collegeSummary;
  }

  // How many players a team currently holds deferred draft rights to
  // (drafted, chose to stay in college, rights held through his college
  // career per the doc's NHL-style draft-and-follow framing).
  function getTeamCollegeRightsCount(teamId) {
    let count = 0;
    for (const enrollment of state.collegeEnrollmentById.values()) {
      if (enrollment.draftRightsTeamId === teamId) count++;
    }
    return count;
  }

  // International Academy + International Draft (engine/internationalAcademy.js)
  // — this season's real draft, already fully self-contained same as
  // getDraftResult() above.
  function getInternationalDraftResult() {
    return state.internationalDraftResult;
  }

  // This season's pathway counts (new academy enrollments, college
  // acceptances, signed/unsigned draft outcomes, free-agent exits/
  // retirements).
  function getInternationalSummary() {
    return state.internationalDraftResult.internationalSummary;
  }

  // No draft-and-follow rights-holding exists for this pathway (see
  // engine/internationalAcademy.js's header) — a signed player lands
  // directly on an affiliate roster, already visible via the Farm System's
  // existing rows. This is season-scoped, not a running "still developing
  // under this team" count like getTeamCollegeRightsCount.
  function getTeamInternationalSigningsCount(teamId) {
    return state.internationalDraftResult.selections.filter((s) => s.outcome === 'signed' && s.teamId === teamId).length;
  }

  // Free Agency (engine/freeAgency.js, Phase 5) — three separate,
  // independently-sourced pools. Plain, non-memoized reads (matching
  // getAffiliateRoster/etc's existing convention) so a post-signing
  // re-render always reflects the current Map contents.
  function getCollegeFreeAgents() {
    return [...state.freeAgentPoolById.values()];
  }

  function getInternationalFreeAgents() {
    return [...state.internationalFreeAgentPoolById.values()];
  }

  function getEstablishedFreeAgents() {
    return [...state.establishedFreeAgentPoolById.values()];
  }

  // Signs a College or International free agent onto teamId's affiliate
  // system (engine/freeAgency.js's signAmateurFreeAgent, shared by both
  // pools). Guarded by isSimulating — a season advance takes several real
  // seconds and captures `state` in a closure at click-time; a sign firing
  // in that window would otherwise get silently overwritten by the season
  // advance's own stale-captured state once it resolves.
  async function signCollegeFreeAgent(playerId, teamId) {
    if (isSimulating) return null;
    const result = signAmateurFreeAgentEngine(playerId, teamId, state.freeAgentPoolById, state.affiliateRosterByClubId);
    if (!result) return null;
    const next = { ...state };
    dispatch({ type: 'REPLACE', payload: next });
    await saveState(next);
    return result;
  }

  async function signInternationalFreeAgent(playerId, teamId) {
    if (isSimulating) return null;
    const result = signAmateurFreeAgentEngine(playerId, teamId, state.internationalFreeAgentPoolById, state.affiliateRosterByClubId);
    if (!result) return null;
    const next = { ...state };
    dispatch({ type: 'REPLACE', payload: next });
    await saveState(next);
    return result;
  }

  // Signs an established free agent directly onto teamId's 26-man MLB
  // roster (engine/freeAgency.js's signEstablishedFreeAgent). Unlike the
  // two actions above, this one DOES need a fresh rosterByTeamId Map
  // reference (not an in-place .set() on the existing one) — that Map is
  // the one piece of state everywhere else in this codebase treated as
  // "replaced wholesale on every change" (engine/leagueProgression.js's
  // advanceOffseason always builds a new Map), and playersById above is a
  // useMemo keyed on state.rosterByTeamId's reference — mutating it in
  // place would leave that memo silently stale.
  async function signEstablishedFreeAgent(playerId, teamId) {
    if (isSimulating) return null;
    const roster = state.rosterByTeamId.get(teamId);
    const result = signEstablishedFreeAgentEngine(playerId, teamId, state.establishedFreeAgentPoolById, roster, state.asOfDate);
    if (!result) return null;
    const rosterByTeamId = new Map(state.rosterByTeamId);
    rosterByTeamId.set(teamId, result.updatedRoster);
    const next = { ...state, rosterByTeamId };
    dispatch({ type: 'REPLACE', payload: next });
    await saveState(next);
    return result;
  }

  // "50-man Roster System" arc, Phase 5 (engine/optionsWaiversDfa.js) —
  // the in-options path: sends an active-26 player to teamId's AAA
  // affiliate without waivers. Both engine functions below already
  // construct their own fresh Map instances internally (unlike
  // signEstablishedFreeAgentEngine above, which is pure w.r.t. the
  // roster and leaves Map construction to this caller) — this wrapper
  // just adopts whatever they return.
  async function optionPlayerToMinors(playerId, teamId) {
    if (isSimulating) return null;
    const result = optionPlayerToMinorsEngine(playerId, teamId, state.rosterByTeamId, state.affiliateRosterByClubId);
    if (!result) return null;
    const next = { ...state, rosterByTeamId: result.updatedRosterByTeamId, affiliateRosterByClubId: result.updatedAffiliateRosterByClubId };
    dispatch({ type: 'REPLACE', payload: next });
    await saveState(next);
    return result;
  }

  // The out-of-options / emergency-room path — one atomic action
  // resolving to CLAIMED, OUTRIGHT_ASSIGNED, or REFUSED_FREE_AGENCY (see
  // engine/optionsWaiversDfa.js's own header for why this collapses real
  // MLB's 7-day DFA window into a single call). Waiver priority is
  // computed fresh each call from the CURRENT season's own standings —
  // engine/draft.js's computeCombinedReverseStandingsOrder, the same
  // reverse-combined-standings function the doc itself was written
  // expecting this phase to reuse.
  async function designateForAssignment(playerId, teamId) {
    if (isSimulating) return null;
    const waiverPriorityOrder = computeCombinedReverseStandingsOrder(teams, state.seasonResult.standingsById);
    const result = designateForAssignmentEngine(
      playerId, teamId, state.rosterByTeamId, state.affiliateRosterByClubId, waiverPriorityOrder, state.establishedFreeAgentPoolById
    );
    if (!result) return null;
    const next = {
      ...state,
      rosterByTeamId: result.updatedRosterByTeamId,
      affiliateRosterByClubId: result.affiliateRosterByClubId,
      establishedFreeAgentPoolById: result.establishedFreeAgentPoolById,
    };
    dispatch({ type: 'REPLACE', payload: next });
    await saveState(next);
    return result;
  }

  // A real, league-wide activity feed — injuries (currently-active only,
  // a partial picture: a player hurt earlier who's already recovered
  // leaves no trace) and Firing & Rehiring events (a complete log for the
  // current season), sorted most-recent-first.
  function getLeagueWireEvents() {
    const events = [];

    for (const [playerId, injury] of state.seasonResult.injuryStatusById) {
      const player = playersById.get(playerId);
      if (!player) continue;
      const team = teamsById.get(player.teamId);
      const remaining = Number.isFinite(injury.gamesRemaining) ? `, ${injury.gamesRemaining} games remaining` : '';
      events.push({
        id: `injury-${playerId}`,
        type: 'injury',
        gameNumber: injury.sustainedGameNumber,
        team: team ? `${team.city} ${team.nickname}` : '—',
        detail: `${player.firstName} ${player.lastName} (${injury.type}) — ${INJURY_SEVERITY_LABELS[injury.severity] ?? injury.severity}${remaining}.`,
      });
    }

    for (const firing of state.seasonResult.firings) {
      const team = teamsById.get(firing.teamId);
      const fired = state.seasonResult.managerNameById.get(firing.firedManagerId);
      const hired = state.seasonResult.managerNameById.get(firing.hiredManagerId);
      events.push({
        id: `firing-${firing.teamId}-${firing.gameNumber}`,
        type: 'firing',
        gameNumber: firing.gameNumber,
        team: team ? `${team.city} ${team.nickname}` : '—',
        detail: `Fired ${fired ? `${fired.firstName} ${fired.lastName}` : 'their manager'} (${formatWinPct(firing.winPctAtFiring)}), hired ${hired ? `${hired.firstName} ${hired.lastName}` : 'a replacement'}.`,
      });
    }

    // Promotion/relegation happened at the boundary entering THIS season,
    // before its first game — sorts as the oldest event in the feed
    // (gameNumber -1, before any real in-season game's 0-based numbering).
    for (const swap of state.promotionRelegationSwaps) {
      const { relegatedFrom, promotedFrom } = getPromotionRelegationPairing(swap.leagueId);
      const leagueName = LEAGUES[swap.leagueId].name;
      const relegatedTeam = teamsById.get(swap.relegatedTeamId);
      const promotedTeam = teamsById.get(swap.promotedTeamId);
      events.push({
        id: `relegation-${swap.relegatedTeamId}-${state.seasonNumber}`,
        type: 'relegation',
        gameNumber: -1,
        team: relegatedTeam ? `${relegatedTeam.city} ${relegatedTeam.nickname}` : '—',
        detail: `Relegated from ${relegatedFrom} to ${promotedFrom} — finished last in ${leagueName} ${relegatedFrom} last season.`,
      });
      events.push({
        id: `promotion-${swap.promotedTeamId}-${state.seasonNumber}`,
        type: 'promotion',
        gameNumber: -1,
        team: promotedTeam ? `${promotedTeam.city} ${promotedTeam.nickname}` : '—',
        detail: `Promoted from ${promotedFrom} to ${relegatedFrom} — finished first in ${leagueName} ${promotedFrom} last season.`,
      });
    }

    events.sort((a, b) => b.gameNumber - a.gameNumber);
    return events;
  }

  /**
   * A one-off matchup between two REAL teams for the /box-score page,
   * against the CURRENT live season's rosters/injuries/fatigue/managers —
   * a currently-injured or overworked player is correctly unavailable/rested
   * here too. No rotation-index tracking exists outside the season loop for
   * a standalone game, so this always starts each team's rotation[0].
   * @param {string} awayTeamId
   * @param {string} homeTeamId
   * @param {() => number} gameRng - the box-score page's own per-click rng
   *   for the game itself, independent of the season-progression rng.
   */
  function buildMatchup(awayTeamId, homeTeamId, gameRng) {
    const awayTeam = teamsById.get(awayTeamId);
    const homeTeam = teamsById.get(homeTeamId);
    const dhRule = LEAGUES[awayTeam.leagueId].dhRule; // same league for both sides, guaranteed by the caller

    const awayManager = getCurrentTeamManager(awayTeamId) ?? undefined;
    const homeManager = getCurrentTeamManager(homeTeamId) ?? undefined;

    const awayInjuryResolved = resolveAvailableRoster(getTeamRoster(awayTeamId), state.seasonResult.injuryStatusById);
    const homeInjuryResolved = resolveAvailableRoster(getTeamRoster(homeTeamId), state.seasonResult.injuryStatusById);
    const awayRoster = resolveRestedRoster(awayInjuryResolved, state.seasonResult.consecutiveGamesPlayedById, awayManager, gameRng);
    const homeRoster = resolveRestedRoster(homeInjuryResolved, state.seasonResult.consecutiveGamesPlayedById, homeManager, gameRng);
    const awayStarter = awayRoster.rotation[0];
    const homeStarter = homeRoster.rotation[0];

    return {
      awayTeam,
      homeTeam,
      away: buildGameSide(awayRoster, awayStarter, dhRule, state.seasonResult.consecutiveGamesPlayedById, awayManager, state.seasonResult.streakStateById),
      home: buildGameSide(homeRoster, homeStarter, dhRule, state.seasonResult.consecutiveGamesPlayedById, homeManager, state.seasonResult.streakStateById),
    };
  }

  const value = {
    seasonNumber: state.seasonNumber,
    asOfDate: state.asOfDate,
    isSimulating,
    advanceSeason,
    resetSeason,
    teams,
    results: state.seasonResult.results,
    promotionRelegationSwaps: state.promotionRelegationSwaps,
    playoffResult: state.playoffResult,
    cupState: state.cupState,
    getTeamRoster,
    getTeamRecord,
    getTeamResults,
    getPlayerInjuryStatus,
    getPlayerFatigueStatus,
    getPlayerFatiguePenalty,
    getPlayerStreakState,
    getPlayerServiceInfo,
    getPlayerHasOptionsRemaining,
    getCurrentTeamManager,
    getTeamManagerChanges,
    getLeagueWireEvents,
    buildMatchup,
    getAffiliateClub,
    getAffiliateRoster,
    getAffiliateStandings,
    getReserveRoster,
    getTaxiSquad,
    getTeamPayroll,
    getDraftResult,
    getCollegeSummary,
    getTeamCollegeRightsCount,
    getInternationalDraftResult,
    getInternationalSummary,
    getTeamInternationalSigningsCount,
    getCollegeFreeAgents,
    getInternationalFreeAgents,
    getEstablishedFreeAgents,
    signCollegeFreeAgent,
    signInternationalFreeAgent,
    signEstablishedFreeAgent,
    optionPlayerToMinors,
    designateForAssignment,
  };

  // Blocks rendering `children` (and every page's useLeagueState() calls)
  // until the IndexedDB save check above resolves — see the hydration
  // effect's comment. All hooks above are called unconditionally either
  // way, so this conditional return is Rules-of-Hooks safe.
  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-field text-ledger/60 text-sm">
        Loading your league… this may take a moment.
      </div>
    );
  }

  return <LeagueStateContext.Provider value={value}>{children}</LeagueStateContext.Provider>;
}

export function useLeagueState() {
  const ctx = useContext(LeagueStateContext);
  if (!ctx) throw new Error('useLeagueState must be used within a LeagueStateProvider');
  return ctx;
}
