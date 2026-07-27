// Active Roster Expansion — "50-man Roster System" arc, Phase 2, per
// commissioner-vision-and-roster-rules.md's "Active Roster Expansion (late
// season)" section: confirmed 26 -> 28, triggered once the minor-league
// season ends rather than a fixed calendar date. Exact calendar placement
// is explicitly still open in that doc ("depends on full season-calendar
// design"), so EXPANSION_TRIGGER_WEEKS_REMAINING below is a documented,
// tunable placeholder proxy — same status as engine/calendar.js's own
// GAMES_PER_WEEK constant — not a literally-computed minors-season-end
// date (nothing in this codebase currently places the separately-simulated
// minor-league seasons onto the MLB week-index calendar's own timeline).
//
// Unlike Taxi Squad (engine/taxiSquad.js), an expansion call-up is a real
// end-of-season promotion, not a repeated shuttle: no shuttle fatigue, no
// option-year cost.

import { playerQualityScore } from './minorLeagues.js';
import { eligiblePlayersForTeam } from './rosterProtection.js';

export const EXPANSION_BENCH_BONUS = 2; // 26 -> 28

// Placeholder, needs real playtesting/calendar-design follow-up — see file
// header. Triggers at the start of the last N open weeks of the season
// (regardless of half), a rough stand-in for "once minors wrap up."
export const EXPANSION_TRIGGER_WEEKS_REMAINING = 4;

/**
 * @param {{openWeekIndices: number[]}} weekPlan - from engine/calendar.js's buildSeasonWeekPlan
 * @param {number} [weeksRemaining]
 * @returns {number} the week.index at/after which expansion is active
 */
export function getExpansionTriggerWeekIndex(weekPlan, weeksRemaining = EXPANSION_TRIGGER_WEEKS_REMAINING) {
  const { openWeekIndices } = weekPlan;
  const triggerPosition = Math.max(0, openWeekIndices.length - weeksRemaining);
  return openWeekIndices[triggerPosition];
}

/**
 * Best EXPANSION_BENCH_BONUS reserve players NOT already on the Taxi
 * Squad, live-resolved — the 2 extra bench slots a team gets during the
 * expansion window. Excludes taxi ids purely to keep the two mechanics
 * visibly distinct or a team's own reserve pool this phase; there's no
 * actual conflict in reusing a taxi player here too, this just gives the
 * expansion bonus real reach into the rest of the reserve pool instead of
 * always re-picking the same 5 taxi players.
 * @param {string} teamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {string[]} taxiIds
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {object[]} Player objects, up to EXPANSION_BENCH_BONUS
 */
export function buildExpansionBenchPlayers(teamId, reserveRosterByTeamId, taxiIds, affiliateRosterByClubId) {
  const reserveIds = new Set(reserveRosterByTeamId.get(teamId) ?? []);
  const taxiIdSet = new Set(taxiIds ?? []);
  const eligible = eligiblePlayersForTeam(teamId, affiliateRosterByClubId).filter(
    (p) => reserveIds.has(p.id) && !taxiIdSet.has(p.id)
  );
  return eligible.sort((a, b) => playerQualityScore(b) - playerQualityScore(a)).slice(0, EXPANSION_BENCH_BONUS);
}
