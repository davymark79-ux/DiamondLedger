// Roster Protection — "50-man Roster System" arc, Phase 1 (Roster
// Structure). A reserve/protected designation layered on top of EXISTING
// AAA/AA affiliate players (engine/minorLeagues.js), NOT a new population —
// real baseball's 40/50-man roster is a protection status, not a separate
// invented pool. A first draft of this phase proposed generating 24 new
// players per team instead; caught and corrected before any code shipped
// (see baseball-sim/CLAUDE.md for the full story) — the whole point of this
// file is to reuse the real, already-simulated Minor League System rather
// than duplicate it.
//
// Up to RESERVE_ROSTER_SIZE (24) players per team, drawn from that team's
// own AAA + AA rosters (real MLB occasionally protects a well-regarded AA
// prospect early, not just AAA depth — confirmed with the user, not just
// AAA-only). Picked/ranked by playerQualityScore (engine/minorLeagues.js) —
// a pure sort, no rng consumed, so this never perturbs any other generated
// content's rng stream. Protection is purely a designation: a protected
// player keeps playing his real affiliate's games exactly as before — no
// double-bookkeeping, no parallel simulation. Deliberately does NOT feed
// in-game injury/rest substitution this phase (see engine/season.js's
// resolveAvailableRoster/resolveRestedRoster, both untouched) — pulling a
// protected player into an active MLB game mid-season would mean yanking
// him out of his own affiliate's season mid-stream, the exact "cascading
// mid-season injury call-ups" capability CLAUDE.md's Injuries section
// already flags as deferred future work, not this phase's job.

import { playerQualityScore, sectionKeyForPosition, findBestFit, removeFromRoster, addToRoster, generateForLevel } from './minorLeagues.js';
import { MINOR_LEAGUE_LEVELS_ORDER, DEVELOPMENT_LEVELS } from '../models/constants.js';

export const RESERVE_ROSTER_SIZE = 24;
// Real MLB occasionally protects a well-regarded AA prospect early, not
// just AAA depth — confirmed scope, not AAA-only.
const RESERVE_ELIGIBLE_LEVELS = ['AAA', 'AA'];

function eligiblePlayersForTeam(teamId, affiliateRosterByClubId) {
  const players = [];
  for (const level of RESERVE_ELIGIBLE_LEVELS) {
    const roster = affiliateRosterByClubId.get(`${teamId}-${level}`);
    if (!roster) continue;
    players.push(...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench);
  }
  return players;
}

/**
 * Season-1 bootstrap: the best RESERVE_ROSTER_SIZE players by current
 * quality across a team's combined AAA+AA rosters. Pure sort, no rng
 * consumed — the season-1 baseline every real team already generates stays
 * byte-identical to before this phase.
 * @param {string} teamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {string[]} up to RESERVE_ROSTER_SIZE player ids
 */
export function computeInitialReserveRoster(teamId, affiliateRosterByClubId) {
  const eligible = eligiblePlayersForTeam(teamId, affiliateRosterByClubId);
  return eligible
    .sort((a, b) => playerQualityScore(b) - playerQualityScore(a))
    .slice(0, RESERVE_ROSTER_SIZE)
    .map((p) => p.id);
}

/**
 * Season-to-season carry-forward: drops any previously-protected id no
 * longer present in the team's CURRENT AAA/AA rosters (called up via
 * findReserveFit/promoteAndBackfill, traded, retired, aged past A-ball —
 * no special-casing needed here, a plain membership check naturally
 * reflects whatever already happened elsewhere this season), then tops up
 * any freed slots with the next-best currently-unprotected eligible
 * player, up to RESERVE_ROSTER_SIZE. No rng — a deterministic quality sort,
 * same as the bootstrap.
 * @param {string} teamId
 * @param {string[]} currentProtectedIds
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {string[]} up to RESERVE_ROSTER_SIZE player ids
 */
export function revalidateAndTopUpReserveRoster(teamId, currentProtectedIds, affiliateRosterByClubId) {
  const eligible = eligiblePlayersForTeam(teamId, affiliateRosterByClubId);
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const stillValid = currentProtectedIds.filter((id) => eligibleIds.has(id));

  if (stillValid.length >= RESERVE_ROSTER_SIZE) return stillValid.slice(0, RESERVE_ROSTER_SIZE);

  const validSet = new Set(stillValid);
  const topUpCandidates = eligible
    .filter((p) => !validSet.has(p.id))
    .sort((a, b) => playerQualityScore(b) - playerQualityScore(a));

  const needed = RESERVE_ROSTER_SIZE - stillValid.length;
  return [...stillValid, ...topUpCandidates.slice(0, needed).map((p) => p.id)];
}

/**
 * Finds the best same-position fit among a team's PROTECTED reserve
 * players specifically (not just any AAA/AA player) — a protected player
 * is the one a real club could call up immediately without any further
 * procedure, matching real 40-man logic. Used by
 * engine/leagueProgression.js's retiree-replacement cascade, checked
 * BEFORE falling through to engine/minorLeagues.js's broader
 * promoteAndBackfill cascade.
 * @param {string} teamId
 * @param {string} position
 * @param {string[]} reserveIds
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{player: object, clubId: string, sectionKey: string, level: string}|null}
 */
export function findReserveFit(teamId, position, reserveIds, affiliateRosterByClubId) {
  if (!reserveIds || reserveIds.length === 0) return null;
  const reserveIdSet = new Set(reserveIds);
  const sectionKey = sectionKeyForPosition(position);

  for (const level of RESERVE_ELIGIBLE_LEVELS) {
    const clubId = `${teamId}-${level}`;
    const roster = affiliateRosterByClubId.get(clubId);
    if (!roster) continue;
    const sectionPlayers = roster[sectionKey] ?? [];
    const candidates = (sectionKey === 'lineup' ? sectionPlayers.filter((p) => p.primaryPosition === position) : sectionPlayers).filter(
      (p) => reserveIdSet.has(p.id)
    );
    if (candidates.length === 0) continue;
    const best = candidates.reduce((best, p) => (playerQualityScore(p) > playerQualityScore(best) ? p : best));
    return { player: best, clubId, sectionKey, level };
  }
  return null;
}

/**
 * A real bug caught during this phase's own regression testing (a 4-season
 * validate:freeagency loop crashed on a game-side construction with an
 * undefined player — traced to an AAA/AA roster shrinking below the size
 * the game engine assumes): consuming a reserve fit removes him from his
 * AAA/AA roster, exactly like engine/minorLeagues.js's promoteAndBackfill
 * does for its own MLB call-ups — but unlike that function, nothing was
 * backfilling the vacated slot. Over several seasons this drained AAA/AA
 * rosters with no replenishment, eventually leaving a section too short
 * for a real game side. This mirrors promoteAndBackfill's own cascade
 * (AAA<-AA<-A<-Rookie, fresh-generate at the end of the chain) but starts
 * ONE LEVEL BELOW the level a reserve fit was actually promoted FROM,
 * since that promotion (not this function) already handled the reserve
 * player's own removal — this only refills what he left behind.
 * @param {object} team
 * @param {string} level - the level findReserveFit's result came from ('AAA' or 'AA')
 * @param {string} position
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {() => number} rng
 * @param {Date} asOfDate
 */
export function backfillLevelFromBelow(team, level, position, affiliateRosterByClubId, rng, asOfDate) {
  const sectionKey = sectionKeyForPosition(position);
  const levelIndex = MINOR_LEAGUE_LEVELS_ORDER.indexOf(level);
  let priorClubId = `${team.id}-${level}`; // the vacancy this whole call exists to refill

  for (let i = levelIndex + 1; i < MINOR_LEAGUE_LEVELS_ORDER.length; i++) {
    const belowLevel = MINOR_LEAGUE_LEVELS_ORDER[i];
    const clubId = `${team.id}-${belowLevel}`;
    const roster = affiliateRosterByClubId.get(clubId);
    if (!roster) return; // no affiliate wired up for this caller — nothing to backfill from

    const fit = findBestFit(roster, position);
    if (!fit) {
      const priorLevel = MINOR_LEAGUE_LEVELS_ORDER[i - 1];
      const fresh = generateForLevel(priorLevel, position, team, rng, asOfDate);
      affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, fresh));
      return;
    }

    affiliateRosterByClubId.set(clubId, removeFromRoster(roster, sectionKey, fit.id));
    const priorLevel = MINOR_LEAGUE_LEVELS_ORDER[i - 1];
    const promoted = { ...fit, developmentLevel: DEVELOPMENT_LEVELS[priorLevel] };
    affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, promoted));

    priorClubId = clubId;
  }

  // Reached the end of the chain (Rookie itself had a fit and got
  // drained) — Rookie's own opening always gets a fresh signee, same
  // end-of-chain behavior as promoteAndBackfill.
  const fresh = generateForLevel('ROOKIE', position, team, rng, asOfDate);
  affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, fresh));
}
