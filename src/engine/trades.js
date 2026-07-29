// Trades — "50-man Roster System" arc, Phase 6, per player-movement.md's
// "Trades" section: "any two clubs can agree to exchange player contracts/
// rights... No salary matching required." The first genuinely BILATERAL
// transaction in this arc — every prior action (signing, option, DFA) was
// one team acting alone; a trade changes two teams' rosters atomically in
// a single move.
//
// Real, flagged scope decisions (Auto Mode — made the call, documented it
// here rather than asking as a separate question):
// - Draft-pick trading, cash considerations, and international bonus-pool
//   space are all deferred — none of the three have a real prerequisite
//   built yet (a season's draft picks are generated AND fully resolved in
//   the same season-boundary call, so there's no persisted "pending,
//   tradeable future pick" state; no per-team cash/bonus-pool balance is
//   tracked anywhere in this codebase).
// - The trade deadline is NOT enforced, matching the doc's own explicit
//   flag ("depends on full season-calendar design, which hasn't happened
//   yet").
// - 10-and-5 no-trade rights are deferred to Phase 9 ("Player Rights") —
//   engine/serviceTime.js's isTenAndFiveEligible already takes
//   consecutiveYearsWithCurrentOrg as an unbuilt external param from
//   Phase 4; nothing tracks that field yet, and inventing it now would be
//   scope creep ahead of its own named phase.
// - Scope is the 50-man pool only (active roster + Reserve + Taxi Squad) —
//   player-movement.md's own header: "these mechanics all concern 50-man-
//   roster movement specifically."
// - No automatic roster-size reconciliation. Unlike signEstablishedFreeAgent
//   (an add-only action that releases the roster's weakest same-section
//   player to stay at cap), a trade is a simultaneous remove+add on both
//   sides with no single natural "make room" target, and the doc never
//   asks for one ("no salary cap to reconcile against"). A traded player
//   simply relocates to the matching slot type on the other team, with no
//   forced release — matching the tolerance optionPlayerToMinors/
//   designateForAssignment already shipped (an active section can shrink
//   with no auto-backfill; a temporarily lopsided roster is expected,
//   commissioner-corrected state, not a bug).
// - A traded Reserve/Taxi player lands in the receiving team's Reserve
//   pool, never automatically re-designated Taxi Squad, even if he was
//   Taxi on his old team — commissioner-vision-and-roster-rules.md is
//   explicit Taxi Squad is "designated at the start of the season, not on
//   the fly."

import { removeFromRoster, addToRoster } from './minorLeagues.js';
import { RATING_SCALE } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];
// Same AAA+AA scope engine/rosterProtection.js's RESERVE_ELIGIBLE_LEVELS
// uses — a Reserve/Taxi player's real player object physically lives on
// one of these two affiliate rosters, not in a separate array.
const RESERVE_ELIGIBLE_LEVELS = ['AAA', 'AA'];

// Post-trade medical review (player-movement.md, resolved not open): reuse
// the existing Durability rating, roll a small probability weighted so a
// lower-Durability player triggers it more often. The doc offers two
// outcomes on trigger (falls through entirely, or gets renegotiated with
// cash/a lesser piece) — only the first is built here, since no cash
// system or renegotiation UI exists to support the second.
export const MEDICAL_REVIEW_BASE_RATE = 0.05; // at max Durability (80)
export const MEDICAL_REVIEW_MAX_RATE = 0.1; // at min Durability (20)

function medicalReviewFailureProbability(player) {
  const durability = player.ratings?.durability?.current ?? RATING_SCALE.AVERAGE;
  const fragility = 1 - (durability - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN);
  return MEDICAL_REVIEW_BASE_RATE + fragility * (MEDICAL_REVIEW_MAX_RATE - MEDICAL_REVIEW_BASE_RATE);
}

/**
 * Rolls the post-trade medical review across every player involved, in
 * order — the first one to fail flags the whole trade.
 * @param {object[]} players
 * @param {() => number} rng
 * @returns {{passed: true} | {passed: false, flaggedPlayerId: string}}
 */
export function evaluatePostTradeMedicalReview(players, rng) {
  for (const player of players) {
    if (rng() < medicalReviewFailureProbability(player)) {
      return { passed: false, flaggedPlayerId: player.id };
    }
  }
  return { passed: true };
}

/**
 * Finds a player across teamId's three 50-man pools. A Reserve/Taxi
 * player's real object lives on an AAA/AA affiliate roster (reserve/taxi
 * id lists are just designation membership, same "resolve against the
 * live source of truth" pattern LeagueStateContext.jsx's getReserveRoster/
 * getTaxiSquad already use) — not a separate player-object array.
 * @param {string} teamId
 * @param {string} playerId
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, string[]>} taxiRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{pool: 'ACTIVE', player: object, sectionKey: string}
 *   | {pool: 'RESERVE'|'TAXI', player: object, sectionKey: string, level: string, clubId: string}
 *   | null}
 */
export function locatePlayer(teamId, playerId, rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId) {
  const activeRoster = rosterByTeamId.get(teamId);
  if (activeRoster) {
    for (const sectionKey of ROSTER_SECTIONS) {
      const found = activeRoster[sectionKey].find((p) => p.id === playerId);
      if (found) return { pool: 'ACTIVE', player: found, sectionKey };
    }
  }

  const reserveIds = reserveRosterByTeamId.get(teamId) ?? [];
  if (reserveIds.includes(playerId)) {
    const taxiIds = new Set(taxiRosterByTeamId.get(teamId) ?? []);
    for (const level of RESERVE_ELIGIBLE_LEVELS) {
      const clubId = `${teamId}-${level}`;
      const roster = affiliateRosterByClubId.get(clubId);
      if (!roster) continue;
      for (const sectionKey of ROSTER_SECTIONS) {
        const found = roster[sectionKey].find((p) => p.id === playerId);
        if (found) return { pool: taxiIds.has(playerId) ? 'TAXI' : 'RESERVE', player: found, sectionKey, level, clubId };
      }
    }
  }

  return null;
}

/**
 * Executes a bilateral trade — every named player relocates from his
 * current team/pool/section to the matching pool/section on the other
 * team. Validates everything before touching any state; on the post-trade
 * medical review failing, returns without ANY map being modified.
 * @param {string} teamAId
 * @param {string} teamBId
 * @param {string[]} playerIdsFromA
 * @param {string[]} playerIdsFromB
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, string[]>} taxiRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {() => number} [rng] - defaults to Math.random, the same
 *   live-UI-boundary-only escape hatch signEstablishedFreeAgent's
 *   `asOfDate = new Date()` default already established (a validate script
 *   passes its own seeded rng for reproducible assertions).
 * @returns {null
 *   | {outcome: 'MEDICAL_REVIEW_FAILED', flaggedPlayerId: string}
 *   | {outcome: 'COMPLETED', updatedRosterByTeamId: Map, updatedReserveRosterByTeamId: Map,
 *      updatedTaxiRosterByTeamId: Map, updatedAffiliateRosterByClubId: Map, movedPlayers: object[]}}
 *   null if the teams are the same, no players are named, or any named
 *   player id doesn't resolve on his supposed team.
 */
export function executeTrade(
  teamAId,
  teamBId,
  playerIdsFromA,
  playerIdsFromB,
  rosterByTeamId,
  reserveRosterByTeamId,
  taxiRosterByTeamId,
  affiliateRosterByClubId,
  rng = Math.random
) {
  if (!teamAId || !teamBId || teamAId === teamBId) return null;
  if ((playerIdsFromA?.length ?? 0) === 0 && (playerIdsFromB?.length ?? 0) === 0) return null;

  const located = [];
  for (const playerId of playerIdsFromA ?? []) {
    const loc = locatePlayer(teamAId, playerId, rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
    if (!loc) return null;
    located.push({ ...loc, fromTeamId: teamAId, toTeamId: teamBId });
  }
  for (const playerId of playerIdsFromB ?? []) {
    const loc = locatePlayer(teamBId, playerId, rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
    if (!loc) return null;
    located.push({ ...loc, fromTeamId: teamBId, toTeamId: teamAId });
  }

  const medicalReview = evaluatePostTradeMedicalReview(
    located.map((l) => l.player),
    rng
  );
  if (!medicalReview.passed) {
    return { outcome: 'MEDICAL_REVIEW_FAILED', flaggedPlayerId: medicalReview.flaggedPlayerId };
  }

  const nextRosterByTeamId = new Map(rosterByTeamId);
  const nextReserveRosterByTeamId = new Map(reserveRosterByTeamId);
  const nextTaxiRosterByTeamId = new Map(taxiRosterByTeamId);
  const nextAffiliateRosterByClubId = new Map(affiliateRosterByClubId);

  for (const loc of located) {
    const tradedPlayer = { ...loc.player, teamId: loc.toTeamId };

    // locatePlayer always resolves a real sectionKey in every branch, so a
    // player lands in the SAME section he came from — no re-derivation from
    // primaryPosition, which would silently relocate e.g. a bullpen arm
    // sitting in a roster section that doesn't match his listed position.
    if (loc.pool === 'ACTIVE') {
      nextRosterByTeamId.set(loc.fromTeamId, removeFromRoster(nextRosterByTeamId.get(loc.fromTeamId), loc.sectionKey, loc.player.id));
      nextRosterByTeamId.set(loc.toTeamId, addToRoster(nextRosterByTeamId.get(loc.toTeamId), loc.sectionKey, tradedPlayer));
      continue;
    }

    // RESERVE or TAXI — physically relocate on the matching-level affiliate
    // roster, keep Reserve-list membership in sync on both sides, and drop
    // (never carry forward) Taxi-list membership — see file header.
    nextAffiliateRosterByClubId.set(loc.clubId, removeFromRoster(nextAffiliateRosterByClubId.get(loc.clubId), loc.sectionKey, loc.player.id));
    const toClubId = `${loc.toTeamId}-${loc.level}`;
    const toClubRoster = nextAffiliateRosterByClubId.get(toClubId);
    if (!toClubRoster) return null; // no wired-up affiliate at that level for the receiving team
    nextAffiliateRosterByClubId.set(toClubId, addToRoster(toClubRoster, loc.sectionKey, tradedPlayer));

    nextReserveRosterByTeamId.set(
      loc.fromTeamId,
      (nextReserveRosterByTeamId.get(loc.fromTeamId) ?? []).filter((id) => id !== loc.player.id)
    );
    nextReserveRosterByTeamId.set(loc.toTeamId, [...(nextReserveRosterByTeamId.get(loc.toTeamId) ?? []), loc.player.id]);

    if (loc.pool === 'TAXI') {
      nextTaxiRosterByTeamId.set(
        loc.fromTeamId,
        (nextTaxiRosterByTeamId.get(loc.fromTeamId) ?? []).filter((id) => id !== loc.player.id)
      );
    }
  }

  return {
    outcome: 'COMPLETED',
    updatedRosterByTeamId: nextRosterByTeamId,
    updatedReserveRosterByTeamId: nextReserveRosterByTeamId,
    updatedTaxiRosterByTeamId: nextTaxiRosterByTeamId,
    updatedAffiliateRosterByClubId: nextAffiliateRosterByClubId,
    movedPlayers: located.map((l) => ({ playerId: l.player.id, fromTeamId: l.fromTeamId, toTeamId: l.toTeamId, pool: l.pool })),
  };
}
