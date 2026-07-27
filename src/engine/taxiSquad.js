// Taxi Squad — "50-man Roster System" arc, Phase 2 (per
// commissioner-vision-and-roster-rules.md). A season-long designated
// SUBSET of a team's own Reserve pool (engine/rosterProtection.js, Phase 1
// — itself AAA/AA affiliate players, not a new population), sized at 5 per
// team (confirmed with the user). Unlike the Reserve pool, Taxi Squad
// players are meant to genuinely split time between MLB and AAA over the
// season — the whole point is real playing time as rest/injury relief
// without a talent downgrade, so this phase (unlike Phase 1) does touch
// in-game roster resolution: see engine/season.js's resolveAvailableRoster/
// resolveRestedRoster, which both accept an optional taxiIdSet now.
//
// Every season a player spends on the Taxi Squad burns one option year —
// confirmed by the user as real bookkeeping to start now, even though full
// Options/Waivers/DFA enforcement (the 3-year cap, 20-day/5-assignment
// thresholds) is Phase 5's job. See incrementOptionYearsUsed below.
//
// Shuttle fatigue (applyShuttleFatigue) lives in positionPlayerFatigue.js,
// not here — this module already depends on minorLeagues.js, which itself
// depends on engine/season.js, so a shuttle-fatigue function needed BY
// season.js can't also live in this file without creating an import cycle.
// See positionPlayerFatigue.js's own header for the function itself.

import { playerQualityScore } from './minorLeagues.js';
import { eligiblePlayersForTeam } from './rosterProtection.js';

export const TAXI_SQUAD_SIZE = 5;

/**
 * Season-1 bootstrap: the best TAXI_SQUAD_SIZE players by current
 * playerQualityScore among a team's already-computed Reserve pool ids
 * (never the raw AAA/AA pool directly — Taxi Squad is always a subset of
 * Reserve, same "designation over existing players" principle Phase 1
 * established for Reserve over the raw affiliate pool). Pure sort, no rng.
 * @param {string} teamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {string[]} up to TAXI_SQUAD_SIZE player ids
 */
export function computeInitialTaxiSquad(teamId, reserveRosterByTeamId, affiliateRosterByClubId) {
  const reserveIds = new Set(reserveRosterByTeamId.get(teamId) ?? []);
  const eligible = eligiblePlayersForTeam(teamId, affiliateRosterByClubId).filter((p) => reserveIds.has(p.id));
  return eligible
    .sort((a, b) => playerQualityScore(b) - playerQualityScore(a))
    .slice(0, TAXI_SQUAD_SIZE)
    .map((p) => p.id);
}

/**
 * Season-to-season carry-forward: drops any previously-taxi id that fell
 * out of the season's ALREADY-revalidated Reserve pool (called up, traded,
 * retired, aged out — no special-casing needed, a plain membership check
 * against the fresh reserve list), then tops up any freed slots with the
 * next-best remaining reserve id not already taxi-tagged, up to
 * TAXI_SQUAD_SIZE. Mirrors revalidateAndTopUpReserveRoster's structure
 * exactly (engine/rosterProtection.js). No rng.
 * @param {string} teamId
 * @param {string[]} currentTaxiIds
 * @param {string[]} newReserveIds - that team's OWN just-revalidated reserve list for the new season
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {string[]} up to TAXI_SQUAD_SIZE player ids
 */
export function revalidateAndTopUpTaxiSquad(teamId, currentTaxiIds, newReserveIds, affiliateRosterByClubId) {
  const reserveIdSet = new Set(newReserveIds);
  const stillValid = currentTaxiIds.filter((id) => reserveIdSet.has(id));
  if (stillValid.length >= TAXI_SQUAD_SIZE) return stillValid.slice(0, TAXI_SQUAD_SIZE);

  const validSet = new Set(stillValid);
  const eligible = eligiblePlayersForTeam(teamId, affiliateRosterByClubId).filter(
    (p) => reserveIdSet.has(p.id) && !validSet.has(p.id)
  );
  const topUpCandidates = eligible.sort((a, b) => playerQualityScore(b) - playerQualityScore(a));

  const needed = TAXI_SQUAD_SIZE - stillValid.length;
  return [...stillValid, ...topUpCandidates.slice(0, needed).map((p) => p.id)];
}

/**
 * Resolves Taxi Squad ids to real, live player objects — same "resolve
 * against the CURRENT source of truth" pattern
 * state/LeagueStateContext.jsx's getReserveRoster already uses for display.
 * Used by data/season.js to build the extra bench players game simulation
 * actually sees.
 * @param {string} teamId
 * @param {string[]} taxiIds
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {object[]} Player objects, in no particular order
 */
export function resolveTaxiPlayers(teamId, taxiIds, affiliateRosterByClubId) {
  if (!taxiIds || taxiIds.length === 0) return [];
  const idSet = new Set(taxiIds);
  return eligiblePlayersForTeam(teamId, affiliateRosterByClubId).filter((p) => idSet.has(p.id));
}

/**
 * +1 optionYearsUsed for every player in this season's FINALIZED Taxi
 * Squad list — every season he's on it costs an option, not just the
 * first (confirmed by the user), a "single, blanket option assignment
 * covering the whole year" per the design doc, distinct from and not
 * counted against the normal per-assignment option rules (Phase 5's job).
 * Mutates affiliateRosterByClubId in place, same "owned across seasons by
 * the caller" contract as engine/rosterProtection.js's own mutating
 * functions.
 * @param {string} teamId
 * @param {string[]} taxiIds
 * @param {Map<string, object>} affiliateRosterByClubId
 */
export function incrementOptionYearsUsed(teamId, taxiIds, affiliateRosterByClubId) {
  if (!taxiIds || taxiIds.length === 0) return;
  const idSet = new Set(taxiIds);
  for (const level of ['AAA', 'AA']) {
    const clubId = `${teamId}-${level}`;
    const roster = affiliateRosterByClubId.get(clubId);
    if (!roster) continue;
    let touched = false;
    const updated = { ...roster };
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      if (!roster[sectionKey].some((p) => idSet.has(p.id))) continue;
      touched = true;
      updated[sectionKey] = roster[sectionKey].map((p) =>
        idSet.has(p.id) ? { ...p, optionYearsUsed: p.optionYearsUsed + 1 } : p
      );
    }
    if (touched) affiliateRosterByClubId.set(clubId, updated);
  }
}
