// Rule 5 Draft — "50-man Roster System" arc, Phase 8, per
// player-movement.md's "Rule 5 Draft" section: "Protects against
// roster-hoarding — if a club doesn't add a minor leaguer to its 50-man
// roster within a defined number of minor-league seasons, other clubs can
// draft him," on the real age-based split (4 seasons if signed at 19+, 5
// if signed younger).
//
// **The first production consumer of engine/serviceTime.js's
// isRule5Exposed**, which Phase 4 built and tested but deliberately left
// unused — the same "scaffolding now, real use later" payoff Phase 5 gave
// `wasOutrightedBefore` and Phase 7 gave accrued service time.
//
// Two real findings from measuring actual season-7 state before designing
// this (the same discipline §36/§40 established), both of which shaped it:
//
// 1. **4,187 players are Rule-5-exposed** out of 10,249 affiliate players.
//    A naive "everyone exposed is draftable" draft would be absurd — real
//    Rule 5 drafts pick ~15-20 players total — so this MUST be bounded.
// 2. **Real MLB's own natural bound is unusable here.** Real clubs may
//    only select with a 40-man roster opening; this engine's
//    revalidateAndTopUpReserveRoster always tops the Reserve pool back to
//    a full RESERVE_ROSTER_SIZE from a 40-player AAA+AA eligible pool, so
//    the 50-man is NEVER open and that gate would make the whole draft
//    dead code.
//
// The bound used instead: **one round, one selection per club, and only
// when the best available exposed player is a genuine upgrade over that
// club's own weakest same-section active player** — the identical
// playerQualityScore heuristic engine/optionsWaiversDfa.js's
// resolveWaiverClaim and engine/freeAgency.js's signEstablishedFreeAgent
// already use, not new AI. It's also a better fit than the real rule
// anyway: it prices a selection against an active-roster spot, which is
// exactly what the doc says the drafting club actually risks.

import { playerQualityScore, sectionKeyForPosition, removeFromRoster, addToRoster } from './minorLeagues.js';
import { backfillLevelFromBelow } from './rosterProtection.js';
import { candidatesForSigning } from './freeAgency.js';
import { isRule5Exposed } from './serviceTime.js';
import { computeCombinedReverseStandingsOrder } from './draft.js';
import { MINOR_LEAGUE_LEVELS_ORDER, DEVELOPMENT_LEVELS } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];
// A drafted player who's later sent down (or returned) lands at AAA, same
// SEND_DOWN_LEVEL convention engine/optionsWaiversDfa.js already uses.
const SEND_DOWN_LEVEL = 'AAA';

// A selection isn't free: the pick must be carried on the active 26 for a
// whole season and cannot be optioned, so a club should only spend that on
// a MEANINGFUL upgrade, not any upgrade at all. Requiring a real quality
// margin (in 20-80 rating points) over the incumbent is what bounds the
// draft to a realistic size.
//
// Calibrated empirically against a real season-6 state (3,359 exposed
// players, all 50 clubs), not guessed — the same "run the real
// distribution first" discipline §36/§40 established. Measured sweep, kept
// here so a future tuner sees the curve rather than one bare number:
//   margin  0 -> 50 picks (avg gain  5.8)   margin  8 -> 38 picks (11.7)
//   margin  4 -> 48 picks (avg gain  8.8)   margin 12 -> 25 picks (14.0)
//   margin  6 -> 46 picks (avg gain 10.0)   margin 15 -> 12 picks (16.1)
// 12 lands ~25 picks across 50 clubs — the same ~50% of clubs selecting
// that real MLB sees (~15-18 picks across 30 clubs), with a genuinely
// meaningful average upgrade rather than marginal roster churn.
export const RULE5_MIN_UPGRADE_MARGIN = 12;

/**
 * Every Rule-5-exposed player across all four affiliate levels, tagged
 * with the org that currently holds him and the level he's at.
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {number} currentSeasonNumber
 * @returns {{player: object, originalTeamId: string, level: string, clubId: string, sectionKey: string}[]}
 */
export function findExposedPlayers(affiliateRosterByClubId, currentSeasonNumber) {
  const exposed = [];
  for (const [clubId, roster] of affiliateRosterByClubId) {
    // clubId is `${teamId}-${LEVEL}` — the level is the last segment, and a
    // real teamId can itself contain hyphens (e.g. "alexandria-va-exchange").
    const idx = clubId.lastIndexOf('-');
    const level = clubId.slice(idx + 1);
    const originalTeamId = clubId.slice(0, idx);
    if (!MINOR_LEAGUE_LEVELS_ORDER.includes(level)) continue;

    for (const sectionKey of ROSTER_SECTIONS) {
      for (const player of roster[sectionKey]) {
        if (!player.serviceRecord) continue;
        if (!isRule5Exposed(player.serviceRecord, currentSeasonNumber)) continue;
        exposed.push({ player, originalTeamId, level, clubId, sectionKey });
      }
    }
  }
  return exposed;
}

/**
 * One round, worst-to-best (engine/draft.js's computeCombinedReverseStandingsOrder
 * — the same combined, no-tier-adjustment order the domestic draft and
 * waivers both use). Each club selects at most once, and only on a genuine
 * upgrade; a club with nothing better available simply passes.
 *
 * Mutates `rosterByTeamId` and `affiliateRosterByClubId` in place, same
 * ownership contract as every other season-boundary sweep this arc adds.
 * @param {object[]} teams
 * @param {Map<string, object>} standingsById
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {number} currentSeasonNumber
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{selections: object[]}}
 */
export function runRule5Draft(teams, standingsById, rosterByTeamId, affiliateRosterByClubId, currentSeasonNumber, rng, asOfDate) {
  const order = computeCombinedReverseStandingsOrder(teams, standingsById);
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  // Best-first, so the first candidate a club finds acceptable is also the
  // best one available to it — no second pass needed.
  const exposed = findExposedPlayers(affiliateRosterByClubId, currentSeasonNumber)
    .sort((a, b) => playerQualityScore(b.player) - playerQualityScore(a.player));

  const taken = new Set();
  const selections = [];

  for (const teamId of order) {
    const roster = rosterByTeamId.get(teamId);
    if (!roster) continue;

    let choice = null;
    for (const candidate of exposed) {
      if (taken.has(candidate.player.id)) continue;
      if (candidate.originalTeamId === teamId) continue; // never from your own system

      const sectionKey = sectionKeyForPosition(candidate.player.primaryPosition);
      const incumbents = candidatesForSigning(roster, sectionKey, candidate.player.primaryPosition);
      if (incumbents.length === 0) continue;
      const weakest = incumbents.reduce((worst, p) => (playerQualityScore(p) < playerQualityScore(worst) ? p : worst));
      // Not merely better — better by a margin worth a full-season,
      // can't-be-optioned commitment. See RULE5_MIN_UPGRADE_MARGIN.
      if (playerQualityScore(candidate.player) - playerQualityScore(weakest) <= RULE5_MIN_UPGRADE_MARGIN) continue;

      choice = { candidate, sectionKey, weakest };
      break;
    }
    if (!choice) continue; // this club passes

    const { candidate, sectionKey, weakest } = choice;

    // 1. Out of the original org's affiliate roster — and IMMEDIATELY
    //    backfill the hole. Not optional padding: Phase 1 (§34) and Phase 7
    //    (§40) BOTH shipped a version that pulled a player out of a finite,
    //    season-persistent pool without refilling it, and both crashed
    //    several seasons later with the same "Cannot read properties of
    //    undefined (reading 'ratings')" once a section ran dry.
    const fromRoster = affiliateRosterByClubId.get(candidate.clubId);
    affiliateRosterByClubId.set(candidate.clubId, removeFromRoster(fromRoster, candidate.sectionKey, candidate.player.id));
    const originalTeam = teamsById.get(candidate.originalTeamId);
    if (originalTeam) {
      backfillLevelFromBelow(originalTeam, candidate.level, candidate.player.primaryPosition, affiliateRosterByClubId, rng, asOfDate);
    }

    // 2. The displaced incumbent is DEMOTED to the drafting club's own AAA,
    //    not released — he's an org player under contract, so the
    //    release-to-make-room precedent (waivers/free agency) doesn't fit;
    //    this mirrors what really happens when a Rule 5 pick makes the team.
    let updatedRoster = removeFromRoster(roster, sectionKey, weakest.id);
    const aaaClubId = `${teamId}-${SEND_DOWN_LEVEL}`;
    const aaaRoster = affiliateRosterByClubId.get(aaaClubId);
    if (aaaRoster) {
      affiliateRosterByClubId.set(
        aaaClubId,
        addToRoster(aaaRoster, sectionKey, { ...weakest, developmentLevel: DEVELOPMENT_LEVELS[SEND_DOWN_LEVEL] })
      );
    }

    // 3. The pick joins the active 26, now protected and carrying his
    //    obligation (see resolveRule5Obligations).
    const drafted = {
      ...candidate.player,
      teamId,
      developmentLevel: DEVELOPMENT_LEVELS.MLB,
      serviceRecord: {
        ...candidate.player.serviceRecord,
        wasEverProtected: true,
        rule5: { draftedSeasonNumber: currentSeasonNumber, originalTeamId: candidate.originalTeamId },
      },
    };
    rosterByTeamId.set(teamId, addToRoster(updatedRoster, sectionKey, drafted));

    taken.add(candidate.player.id);
    selections.push({
      playerId: candidate.player.id,
      firstName: candidate.player.firstName,
      lastName: candidate.player.lastName,
      primaryPosition: candidate.player.primaryPosition,
      draftingTeamId: teamId,
      originalTeamId: candidate.originalTeamId,
      fromLevel: candidate.level,
      displacedPlayerId: weakest.id,
    });
  }

  return { selections };
}

/**
 * Resolves LAST season's obligations, per the doc's "must keep him on the
 * active 26-man roster for the entire following season... or must offer
 * him back to his original club." The doc is explicit that this tension is
 * the point of the mechanic and shouldn't be simplified away.
 *
 * Because this engine has no mid-season roster moves, STICKING is the
 * default outcome — the interesting cases come from real user actions
 * (engine/optionsWaiversDfa.js refuses to option a Rule 5 player outright,
 * and a DFA on one resolves as an offer-back instead of normal waivers).
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {number} currentSeasonNumber
 * @returns {{stuck: object[], returned: object[]}}
 */
export function resolveRule5Obligations(rosterByTeamId, affiliateRosterByClubId, currentSeasonNumber) {
  const stuck = [];
  const returned = [];

  // On an active roster a full season after being drafted -> he stuck.
  for (const [teamId, roster] of rosterByTeamId) {
    const updated = { ...roster };
    let changed = false;
    for (const sectionKey of ROSTER_SECTIONS) {
      updated[sectionKey] = roster[sectionKey].map((p) => {
        const r5 = p.serviceRecord?.rule5;
        if (!r5 || r5.draftedSeasonNumber >= currentSeasonNumber) return p;
        changed = true;
        stuck.push({
          playerId: p.id, firstName: p.firstName, lastName: p.lastName,
          primaryPosition: p.primaryPosition, teamId, originalTeamId: r5.originalTeamId,
        });
        return { ...p, serviceRecord: { ...p.serviceRecord, rule5: null } };
      });
    }
    if (changed) rosterByTeamId.set(teamId, updated);
  }

  // Anyone still carrying an obligation but NO LONGER on an active roster
  // must go back to his original club (his rights never fully transferred).
  for (const [clubId, roster] of affiliateRosterByClubId) {
    for (const sectionKey of ROSTER_SECTIONS) {
      for (const p of roster[sectionKey]) {
        const r5 = p.serviceRecord?.rule5;
        if (!r5) continue;

        affiliateRosterByClubId.set(clubId, removeFromRoster(affiliateRosterByClubId.get(clubId), sectionKey, p.id));
        const homeClubId = `${r5.originalTeamId}-${SEND_DOWN_LEVEL}`;
        const homeRoster = affiliateRosterByClubId.get(homeClubId);
        if (homeRoster) {
          affiliateRosterByClubId.set(
            homeClubId,
            addToRoster(homeRoster, sectionKey, {
              ...p,
              teamId: r5.originalTeamId,
              developmentLevel: DEVELOPMENT_LEVELS[SEND_DOWN_LEVEL],
              serviceRecord: { ...p.serviceRecord, rule5: null },
            })
          );
        }
        returned.push({
          playerId: p.id, firstName: p.firstName, lastName: p.lastName,
          primaryPosition: p.primaryPosition, originalTeamId: r5.originalTeamId,
        });
      }
    }
  }

  return { stuck, returned };
}
