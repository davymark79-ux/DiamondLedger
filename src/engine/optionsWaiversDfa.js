// Options, Waivers, DFA — "50-man Roster System" arc, Phase 5, per
// player-movement.md: built together since they interlock (a DFA
// resolves via waivers; options determine whether waivers are even
// needed). The first phase in this arc to give the commissioner a real,
// user-triggered ACTIVE-roster transaction beyond free-agent signing —
// see state/LeagueStateContext.jsx's optionPlayerToMinors/
// designateForAssignment, mirroring signEstablishedFreeAgent's own
// already-established shape.
//
// A real callback: engine/serviceTime.js's isOutrightRefusalEligible took
// `wasOutrightedBefore` as an external param specifically because
// outright-assignment history didn't exist until this phase. This file
// is what finally makes that param real.
//
// Two real simplifications, both flagged, both matching precedent already
// established elsewhere in this arc:
// - The 5-assignment-per-season option cap is NOT built — this engine has
//   no sub-season transaction-count tracking (same reason Phase 4's Super
//   Two and Phase 2's 20-day Taxi threshold were simplified away). Only
//   the 3-YEAR option cap is real, burned once per season-boundary
//   optional assignment — same whole-season granularity Phase 2 already
//   established for Taxi Squad's own blanket option.
// - DFA's real 7-day resolution window collapses into ONE atomic action:
//   waivers run immediately, and the outcome (claimed / outright-assigned
//   / refused-into-free-agency) resolves in the same call. This engine
//   has no day-level model to track a real waiting window against.
//
// Waiver claims use a real, simple heuristic, not full team AI — no club
// "front office" decision-making exists anywhere in this engine. Mirrors
// engine/freeAgency.js's signEstablishedFreeAgent exactly: a team claims
// if the waived player would be a genuine upgrade over that team's own
// weakest same-section player, walked in real waiver-priority order
// (engine/draft.js's computeCombinedReverseStandingsOrder — its own doc
// comment already says "reuses player-movement.md's Waivers principle,"
// built with this phase in mind).

import { playerQualityScore, sectionKeyForPosition, removeFromRoster, addToRoster } from './minorLeagues.js';
import { candidatesForSigning } from './freeAgency.js';
import { isOutrightRefusalEligible } from './serviceTime.js';
import { DEVELOPMENT_LEVELS } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];
// Outright assignments and options always land at AAA — the highest
// level, matching real baseball (a player good enough for the 50-man is
// never buried below AAA on the way down) and this codebase's own
// existing precedent (engine/rosterProtection.js's reserve pool is
// AAA+AA, and a call-up cascade always starts at AAA).
const SEND_DOWN_LEVEL = 'AAA';

export const OPTION_YEARS_CAP = 3;

/** @param {object} player - Player (must have a real ServiceRecord) */
export function hasOptionsRemaining(player) {
  return player.serviceRecord.standardOptionYearsUsed < OPTION_YEARS_CAP;
}

/**
 * "50-man Roster System" arc, Phase 8 (engine/rule5Draft.js) — a Rule 5
 * pick still serving his obligation cannot be sent down at all, per
 * player-movement.md: he "must be kept on the active 26-man MLB roster for
 * the entire following season — he cannot be optioned to the minors — or
 * must be offered back to his original club." This check is what gives
 * that rule real teeth in a UI where the commissioner could otherwise just
 * bury him at AAA.
 * @param {object} player
 */
export function isRule5Restricted(player) {
  return !!player.serviceRecord?.rule5;
}

function findOnRoster(roster, playerId) {
  for (const sectionKey of ROSTER_SECTIONS) {
    const found = roster[sectionKey].find((p) => p.id === playerId);
    if (found) return { player: found, sectionKey };
  }
  return null;
}

/**
 * Walks the waiver-priority order (worst record first), skipping the
 * player's own current team, and lets the first team who'd genuinely
 * upgrade at his position claim him — releasing their own weakest
 * same-section player to make room, same 1-for-1 mechanic
 * signEstablishedFreeAgent already established (reused via
 * freeAgency.js's exported candidatesForSigning, not reinvented).
 * @param {object} player - Player being waived (still carries his ORIGINAL teamId)
 * @param {string[]} waiverPriorityOrder - from engine/draft.js's computeCombinedReverseStandingsOrder
 * @param {Map<string, object>} rosterByTeamId
 * @returns {{claimed: true, claimingTeamId: string, releasedPlayerId: string, releasedPlayer: object, updatedRosterByTeamId: Map<string, object>}
 *   | {claimed: false}}
 */
export function resolveWaiverClaim(player, waiverPriorityOrder, rosterByTeamId) {
  const sectionKey = sectionKeyForPosition(player.primaryPosition);
  const playerQuality = playerQualityScore(player);

  for (const teamId of waiverPriorityOrder) {
    if (teamId === player.teamId) continue;
    const roster = rosterByTeamId.get(teamId);
    if (!roster) continue;
    const candidates = candidatesForSigning(roster, sectionKey, player.primaryPosition);
    if (candidates.length === 0) continue;
    const weakest = candidates.reduce((worst, p) => (playerQualityScore(p) < playerQualityScore(worst) ? p : worst));
    if (playerQuality <= playerQualityScore(weakest)) continue; // not a genuine upgrade — this team passes

    const claimedPlayer = { ...player, teamId };
    const updatedRoster = {
      ...roster,
      [sectionKey]: [...roster[sectionKey].filter((p) => p.id !== weakest.id), claimedPlayer],
    };
    const updatedRosterByTeamId = new Map(rosterByTeamId);
    updatedRosterByTeamId.set(teamId, updatedRoster);

    return { claimed: true, claimingTeamId: teamId, releasedPlayerId: weakest.id, releasedPlayer: weakest, updatedRosterByTeamId };
  }

  return { claimed: false };
}

/**
 * The in-options path — moves freely without waivers, per the doc.
 * @param {string} playerId
 * @param {string} teamId
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{updatedRosterByTeamId: Map<string, object>, updatedAffiliateRosterByClubId: Map<string, object>}|null}
 *   null if the player isn't on teamId's active roster, no AAA affiliate
 *   is wired up, or he's already out of options (caller should route to
 *   designateForAssignment instead)
 */
export function optionPlayerToMinors(playerId, teamId, rosterByTeamId, affiliateRosterByClubId) {
  const roster = rosterByTeamId.get(teamId);
  if (!roster) return null;
  const found = findOnRoster(roster, playerId);
  if (!found) return null;
  const { player, sectionKey } = found;
  // A Rule 5 pick may not be optioned at all — see isRule5Restricted.
  if (isRule5Restricted(player)) return null;
  if (!hasOptionsRemaining(player)) return null;

  const clubId = `${teamId}-${SEND_DOWN_LEVEL}`;
  const affRoster = affiliateRosterByClubId.get(clubId);
  if (!affRoster) return null;

  const optionedPlayer = {
    ...player,
    developmentLevel: DEVELOPMENT_LEVELS[SEND_DOWN_LEVEL],
    serviceRecord: { ...player.serviceRecord, standardOptionYearsUsed: player.serviceRecord.standardOptionYearsUsed + 1 },
  };

  const updatedRosterByTeamId = new Map(rosterByTeamId);
  updatedRosterByTeamId.set(teamId, removeFromRoster(roster, sectionKey, playerId));
  const updatedAffiliateRosterByClubId = new Map(affiliateRosterByClubId);
  updatedAffiliateRosterByClubId.set(clubId, addToRoster(affRoster, sectionKey, optionedPlayer));

  return { updatedRosterByTeamId, updatedAffiliateRosterByClubId };
}

/**
 * The out-of-options / emergency-room path — one atomic action covering
 * what real MLB spreads across a 7-day window (see file header): removes
 * the player from the active roster, runs waivers immediately, and
 * resolves to exactly one of three outcomes.
 * @param {string} playerId
 * @param {string} teamId
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {string[]} waiverPriorityOrder
 * @param {Map<string, object>} establishedFreeAgentPoolById
 * @returns {{
 *   outcome: 'CLAIMED'|'OUTRIGHT_ASSIGNED'|'REFUSED_FREE_AGENCY',
 *   claimingTeamId?: string,
 *   updatedRosterByTeamId: Map<string, object>,
 *   affiliateRosterByClubId: Map<string, object>,
 *   establishedFreeAgentPoolById: Map<string, object>,
 * }|null} null if the player isn't on teamId's active roster
 */
export function designateForAssignment(playerId, teamId, rosterByTeamId, affiliateRosterByClubId, waiverPriorityOrder, establishedFreeAgentPoolById) {
  const roster = rosterByTeamId.get(teamId);
  if (!roster) return null;
  const found = findOnRoster(roster, playerId);
  if (!found) return null;
  const { player, sectionKey } = found;

  const rosterByTeamIdAfterRemoval = new Map(rosterByTeamId);
  rosterByTeamIdAfterRemoval.set(teamId, removeFromRoster(roster, sectionKey, playerId));

  // "50-man Roster System" arc, Phase 8 — a Rule 5 pick never reaches
  // waivers: giving up on him means offering him BACK to the club he was
  // drafted from, whose rights over him never fully transferred. A real
  // fourth outcome, and the other half (with optionPlayerToMinors' refusal)
  // of the doc's "must stick or get offered back" tension.
  const rule5 = player.serviceRecord?.rule5;
  if (rule5) {
    const homeClubId = `${rule5.originalTeamId}-${SEND_DOWN_LEVEL}`;
    const homeRoster = affiliateRosterByClubId.get(homeClubId);
    const updatedAffiliates = new Map(affiliateRosterByClubId);
    if (homeRoster) {
      updatedAffiliates.set(
        homeClubId,
        addToRoster(homeRoster, sectionKey, {
          ...player,
          teamId: rule5.originalTeamId,
          developmentLevel: DEVELOPMENT_LEVELS[SEND_DOWN_LEVEL],
          serviceRecord: { ...player.serviceRecord, rule5: null },
        })
      );
    }
    return {
      outcome: 'RETURNED_TO_ORIGINAL_CLUB',
      returnedToTeamId: rule5.originalTeamId,
      updatedRosterByTeamId: rosterByTeamIdAfterRemoval,
      affiliateRosterByClubId: updatedAffiliates,
      establishedFreeAgentPoolById,
    };
  }

  const waiverResult = resolveWaiverClaim(player, waiverPriorityOrder, rosterByTeamIdAfterRemoval);
  if (waiverResult.claimed) {
    const updatedPool = new Map(establishedFreeAgentPoolById);
    updatedPool.set(waiverResult.releasedPlayerId, { ...waiverResult.releasedPlayer, teamId: null });
    return {
      outcome: 'CLAIMED',
      claimingTeamId: waiverResult.claimingTeamId,
      updatedRosterByTeamId: waiverResult.updatedRosterByTeamId,
      affiliateRosterByClubId,
      establishedFreeAgentPoolById: updatedPool,
    };
  }

  // Unclaimed — subject to outright-refusal rights (Phase 4's
  // isOutrightRefusalEligible, getting a real wasOutrightedBefore input
  // for the first time here).
  if (isOutrightRefusalEligible(player.serviceRecord, player.serviceRecord.wasOutrightedBefore)) {
    const updatedPool = new Map(establishedFreeAgentPoolById);
    updatedPool.set(playerId, { ...player, teamId: null });
    return {
      outcome: 'REFUSED_FREE_AGENCY',
      updatedRosterByTeamId: rosterByTeamIdAfterRemoval,
      affiliateRosterByClubId,
      establishedFreeAgentPoolById: updatedPool,
    };
  }

  const clubId = `${teamId}-${SEND_DOWN_LEVEL}`;
  const affRoster = affiliateRosterByClubId.get(clubId);
  const outrightedPlayer = {
    ...player,
    developmentLevel: DEVELOPMENT_LEVELS[SEND_DOWN_LEVEL],
    serviceRecord: { ...player.serviceRecord, wasOutrightedBefore: true },
  };
  const updatedAffiliateRosterByClubId = new Map(affiliateRosterByClubId);
  if (affRoster) updatedAffiliateRosterByClubId.set(clubId, addToRoster(affRoster, sectionKey, outrightedPlayer));

  return {
    outcome: 'OUTRIGHT_ASSIGNED',
    updatedRosterByTeamId: rosterByTeamIdAfterRemoval,
    affiliateRosterByClubId: updatedAffiliateRosterByClubId,
    establishedFreeAgentPoolById,
  };
}
