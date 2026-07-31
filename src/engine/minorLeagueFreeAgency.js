// Minor League Free Agency — "50-man Roster System" arc, Phase 9, per
// player-movement.md: "Distinct from Rule 5 — Rule 5 is about *other teams
// drafting* an unprotected player; this is about a player *walking on his
// own*. A minor leaguer who accumulates enough minor-league service time
// without ever being added to a 50-man roster becomes a free agent
// independent of his organization."
//
// The first production consumer of engine/serviceTime.js's
// isMinorLeagueFreeAgent, which Phase 4 built and tested but left unwired.
//
// **A real finding from smoke-testing the population before wiring any of
// this** (the §36/§40/§41 discipline, and it changed the design): 3,058
// players qualify by season 7, growing to 5,789 by season 10. Releasing
// every eligible player each season would mean thousands of simultaneous
// departures and thousands of backfill cascades. The cause is that
// eligibility is PERMANENT — once past the threshold a player stays
// eligible forever, so the set accumulates rather than clearing.
//
// The fix is also the realistic one: in real baseball the large majority of
// minor-league free agents **re-sign with their own organization**. Only a
// fraction genuinely walk. MINOR_LEAGUE_FA_DEPARTURE_RATE models exactly
// that, which bounds the annual exodus to something sane, drains the
// backlog gradually instead of in one shock, and needs no artificial cap.

import { removeFromRoster } from './minorLeagues.js';
import { backfillLevelFromBelow } from './rosterProtection.js';
import { isMinorLeagueFreeAgent } from './serviceTime.js';
import { rollRetirement } from './retirement.js';
import { MINOR_LEAGUE_LEVELS_ORDER } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// Share of eligible players who actually leave their org in a given
// offseason; the rest quietly re-sign. A CBA-negotiable placeholder like
// every other constant in this arc — see the file header for why this
// exists at all rather than releasing everyone eligible.
export const MINOR_LEAGUE_FA_DEPARTURE_RATE = 0.15;

/**
 * Every player currently eligible to walk — 7+ minor-league seasons and
 * never once added to a 50-man roster.
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{player: object, teamId: string, level: string, clubId: string, sectionKey: string}[]}
 */
export function findMinorLeagueFreeAgents(affiliateRosterByClubId) {
  const eligible = [];
  for (const [clubId, roster] of affiliateRosterByClubId) {
    // Real team ids contain hyphens ("alexandria-va-exchange"), so the
    // level is the LAST segment — same parsing care as engine/rule5Draft.js.
    const idx = clubId.lastIndexOf('-');
    const level = clubId.slice(idx + 1);
    const teamId = clubId.slice(0, idx);
    if (!MINOR_LEAGUE_LEVELS_ORDER.includes(level)) continue;

    for (const sectionKey of ROSTER_SECTIONS) {
      for (const player of roster[sectionKey]) {
        if (!player.serviceRecord) continue;
        if (!isMinorLeagueFreeAgent(player.serviceRecord)) continue;
        eligible.push({ player, teamId, level, clubId, sectionKey });
      }
    }
  }
  return eligible;
}

/**
 * The season-boundary sweep. Each departing player is removed from his
 * affiliate roster, **his vacated slot is backfilled**, and he lands in the
 * dedicated minor-league free-agent pool with his org ties cut.
 *
 * The backfill is mandatory, not defensive padding: this is the third
 * consecutive phase to remove players from finite, season-persistent
 * affiliate rosters, and Phases 1 (§34) and 7 (§40) both shipped without it
 * and crashed several seasons later with the same
 * `Cannot read properties of undefined (reading 'ratings')`.
 *
 * Mutates `affiliateRosterByClubId` and `minorLeagueFreeAgentPoolById` in
 * place, same ownership contract as every other sweep this arc adds.
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {Map<string, object>} minorLeagueFreeAgentPoolById
 * @param {Map<string, object>} teamsById
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{departed: object[], eligibleCount: number}}
 */
export function runMinorLeagueFreeAgencySweep(affiliateRosterByClubId, minorLeagueFreeAgentPoolById, teamsById, rng, asOfDate) {
  const eligible = findMinorLeagueFreeAgents(affiliateRosterByClubId);
  const departed = [];

  for (const entry of eligible) {
    if (rng() >= MINOR_LEAGUE_FA_DEPARTURE_RATE) continue; // re-signs with his own org

    const roster = affiliateRosterByClubId.get(entry.clubId);
    if (!roster) continue;
    affiliateRosterByClubId.set(entry.clubId, removeFromRoster(roster, entry.sectionKey, entry.player.id));

    const team = teamsById.get(entry.teamId);
    if (team) {
      backfillLevelFromBelow(team, entry.level, entry.player.primaryPosition, affiliateRosterByClubId, rng, asOfDate);
    }

    minorLeagueFreeAgentPoolById.set(entry.player.id, { ...entry.player, teamId: null });
    departed.push({
      playerId: entry.player.id,
      firstName: entry.player.firstName,
      lastName: entry.player.lastName,
      primaryPosition: entry.player.primaryPosition,
      formerTeamId: entry.teamId,
      fromLevel: entry.level,
    });
  }

  return { departed, eligibleCount: eligible.length };
}

/**
 * Season-boundary retirement pass over the pool. Reuses
 * engine/retirement.js's REAL established-pro curve rather than a third
 * dedicated one — these are genuine professionals in their 30s (measured
 * average age 32-33), so that curve fits, exactly the reasoning §28 used
 * for advanceEstablishedFreeAgentPool and explicitly NOT College's
 * amateur-washout curve.
 * @param {Map<string, object>} minorLeagueFreeAgentPoolById
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{retired: number}}
 */
export function advanceMinorLeagueFreeAgentPool(minorLeagueFreeAgentPoolById, rng, asOfDate) {
  let retired = 0;
  for (const [id, player] of minorLeagueFreeAgentPoolById) {
    if (rollRetirement(player, rng, { asOfDate })) {
      minorLeagueFreeAgentPoolById.delete(id);
      retired++;
    }
  }
  return { retired };
}
