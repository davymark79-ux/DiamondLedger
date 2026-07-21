// The real 50-team league's season — computed once at module load with a
// fixed seed, same philosophy as realLeague.js (a stable, consistent world
// across the app, not regenerated per page visit). No "simulate a new
// season" button yet — that needs real shared app state to keep pages in
// sync, which doesn't exist anywhere in this app today; see
// baseball-sim-engine-build-order memory for the reasoning.

import { teams, getTeamRoster, getTeamManager, playersById } from './realLeague.js';
import { buildSeasonSchedule, simulateSeason, TARGET_GAMES_PER_TEAM } from '../engine/season.js';
import { computeFatiguePenalty } from '../engine/positionPlayerFatigue.js';
import { createRng } from '../models/generation/random.js';

const SEED = 20260201;

const rng = createRng(SEED);

export const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);

const { standingsById, injuryStatusById, consecutiveGamesPlayedById, streakStateById, managerAssignmentById, firings, managerNameById, results } = simulateSeason(teams, getTeamRoster, schedule, rng, getTeamManager);
export { standingsById, injuryStatusById, consecutiveGamesPlayedById, streakStateById, results };

const teamsById = new Map(teams.map((t) => [t.id, t]));

export function getTeamRecord(teamId) {
  return standingsById.get(teamId) ?? { wins: 0, losses: 0 };
}

export function getTeamResults(teamId) {
  return results.filter((r) => r.awayTeamId === teamId || r.homeTeamId === teamId);
}

// Current injury as of the end of the simulated season, or null if healthy
// (or already recovered) — see engine/season.js's advanceInjuriesForTeam.
export function getPlayerInjuryStatus(playerId) {
  return injuryStatusById.get(playerId) ?? null;
}

// Consecutive games played (as of the end of the simulated season) without a
// rest — see engine/season.js's advanceFatigueForTeam. 0 for anyone who
// isn't a full-time lineup regular right now (bench, injured, or a Foundry
// DH-slot player).
export function getPlayerFatigueStatus(playerId) {
  return consecutiveGamesPlayedById.get(playerId) ?? 0;
}

// Thin wrapper around positionPlayerFatigue.js's own formula, so page
// components don't need to import the engine layer directly (pages import
// from data/, data/ imports from engine/ — same layering the rest of this
// app follows).
export function getPlayerFatiguePenalty(playerId) {
  return computeFatiguePenalty(getPlayerFatigueStatus(playerId));
}

// Current Hot/Cold Streak reading, or null if the player has no batting
// record yet this season — see engine/hotColdStreaks.js. `tier` is already
// gated (NEUTRAL both for a genuinely unremarkable reading and for "not
// enough sample yet to confirm a streak") — read it directly rather than
// re-deriving from standardDeviationsFromBaseline, which would lose that
// distinction once a streak resets.
export function getPlayerStreakState(playerId) {
  return streakStateById.get(playerId) ?? null;
}

// Current manager as of the end of the simulated season — managers.md's
// Career Lifecycle (Firing & Rehiring, engine/managerFiring.js) can change
// a team's assignment mid-season, so this is NOT the same as realLeague.js's
// static getTeamManager(). Falls back to the static assignment (should
// never actually be needed, since every team is pre-seeded in
// simulateSeason, but matches this codebase's existing graceful-fallback
// convention elsewhere).
export function getCurrentTeamManager(teamId) {
  return managerAssignmentById.get(teamId) ?? getTeamManager(teamId);
}

// Every in-season Firing & Rehiring event for a team, oldest first — empty
// if the team's manager was never fired this season (the common case).
export function getTeamManagerChanges(teamId) {
  return firings.filter((f) => f.teamId === teamId);
}

const INJURY_SEVERITY_LABELS = {
  DAY_TO_DAY: 'day-to-day',
  SHORT_TERM_IL: '10-day IL',
  LONG_TERM_IL: '60-day IL',
  SEASON_ENDING: 'season-ending',
  CAREER_ENDING: 'career-ending',
};

export function formatWinPct(pct) {
  return `.${String(Math.round(pct * 1000)).padStart(3, '0')}`;
}

// A real, league-wide activity feed for the UI's "League Wire" pages —
// replaces mockData.js's old fabricated scriptedEvents (which invented
// injury/firing/financial/expansion/stadium/CBA items). Only injury and
// firing events are real in this engine; the other four categories have no
// underlying system at all, so they're simply not represented here rather
// than faked.
//
// Injuries are a real but PARTIAL picture: injuryStatusById only tracks
// currently-active injuries (see engine/season.js's advanceInjuriesForTeam,
// which deletes an entry once healed) — a player hurt earlier in the season
// who has already recovered by season's end leaves no trace here. Firings
// are a complete chronological log (engine/managerFiring.js's `firings`),
// since nothing in this engine ever forgets a past firing event.
export function getLeagueWireEvents() {
  const events = [];

  for (const [playerId, injury] of injuryStatusById) {
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

  for (const firing of firings) {
    const team = teamsById.get(firing.teamId);
    const fired = managerNameById.get(firing.firedManagerId);
    const hired = managerNameById.get(firing.hiredManagerId);
    events.push({
      id: `firing-${firing.teamId}-${firing.gameNumber}`,
      type: 'firing',
      gameNumber: firing.gameNumber,
      team: team ? `${team.city} ${team.nickname}` : '—',
      detail: `Fired ${fired ? `${fired.firstName} ${fired.lastName}` : 'their manager'} (${formatWinPct(firing.winPctAtFiring)}), hired ${hired ? `${hired.firstName} ${hired.lastName}` : 'a replacement'}.`,
    });
  }

  events.sort((a, b) => b.gameNumber - a.gameNumber);
  return events;
}
