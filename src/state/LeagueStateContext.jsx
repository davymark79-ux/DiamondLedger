// React wiring for the live, advanceable season (data/season.js owns the
// pure state-transition + persistence logic; this file is thin — it just
// holds state and exposes it). Every page that used to import directly from
// data/season.js's old static exports now calls useLeagueState() instead;
// the function names/signatures match 1:1 so the migration is mechanical.

import { createContext, useContext, useReducer, useState, useCallback, useMemo } from 'react';
import { teams as staticTeams } from '../data/realLeague.js';
import { initialLeagueState, advanceToNextSeason, resetToSeason1, saveState, applyLiveOverrides } from '../data/season.js';
import { resolveAvailableRoster, resolveRestedRoster, buildGameSide } from '../engine/season.js';
import { computeFatiguePenalty } from '../engine/positionPlayerFatigue.js';
import { getPromotionRelegationPairing } from '../models/League.js';
import { LEAGUES } from '../models/constants.js';

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
    setTimeout(() => {
      const next = advanceToNextSeason(state);
      saveState(next);
      dispatch({ type: 'REPLACE', payload: next });
      setIsSimulating(false);
    }, 0);
  }, [state, isSimulating]);

  const resetSeason = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    setTimeout(() => {
      const fresh = resetToSeason1();
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
    isSimulating,
    advanceSeason,
    resetSeason,
    teams,
    results: state.seasonResult.results,
    promotionRelegationSwaps: state.promotionRelegationSwaps,
    playoffResult: state.playoffResult,
    getTeamRoster,
    getTeamRecord,
    getTeamResults,
    getPlayerInjuryStatus,
    getPlayerFatigueStatus,
    getPlayerFatiguePenalty,
    getPlayerStreakState,
    getCurrentTeamManager,
    getTeamManagerChanges,
    getLeagueWireEvents,
    buildMatchup,
  };

  return <LeagueStateContext.Provider value={value}>{children}</LeagueStateContext.Provider>;
}

export function useLeagueState() {
  const ctx = useContext(LeagueStateContext);
  if (!ctx) throw new Error('useLeagueState must be used within a LeagueStateProvider');
  return ctx;
}
