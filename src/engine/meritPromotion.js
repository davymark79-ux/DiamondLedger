// Merit-based promotion — §48, the second half of "players should only be
// capped by their own potential; players that are better will wind up
// getting promoted quicker."
//
// Uncapping potential (models/generation/playerGenerator.js's
// `populationPotential`) lets a minor leaguer genuinely develop into an
// MLB-calibre player. On its own that changes nothing, because until now the
// ONLY way to reach the majors was for somebody above you to retire —
// engine/leagueProgression.js's retiree-replacement cascade. A prospect who
// outgrew AAA simply sat there. This is what actually moves him.
//
// Deliberately a 1-for-1 SWAP, never a bare promotion: the better player
// comes up, the man he beat goes down to the affiliate slot he vacated. That
// keeps every roster section at exactly its prior size by construction, so
// this cannot reintroduce the depletion bug that shipped broken twice
// (CLAUDE.md §34, §40) — there is no hole to backfill because nothing is
// ever removed on net.
//
// The comparison reuses playerQualityScore (CURRENT ability, not potential)
// and the same "must be a genuine upgrade by a real margin" heuristic that
// engine/optionsWaiversDfa.js's resolveWaiverClaim and engine/rule5Draft.js
// already use, rather than inventing a second front-office AI. Potential is
// what a player can BECOME; promotion is earned on what he IS today.

import { playerQualityScore } from './minorLeagues.js';
import { MINOR_LEAGUE_LEVELS_ORDER, DEVELOPMENT_LEVELS } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// A prospect must clearly beat the incumbent, not edge him by noise —
// otherwise rosters churn every season on rating jitter. Same reasoning and
// rough magnitude as engine/rule5Draft.js's RULE5_MIN_UPGRADE_MARGIN, which
// was calibrated empirically against real state for the same purpose.
// Illustrative placeholder like every other constant in this project.
export const MERIT_PROMOTION_MIN_MARGIN = 4;

// Only the top affiliate level feeds the majors directly. A genuinely
// exceptional AA player still has to pass through AAA — which he will do
// quickly, since the level-to-level pass below runs every season.
const MLB_FEEDER_LEVEL = 'AAA';

function weakestInSection(roster, sectionKey) {
  const players = roster[sectionKey] ?? [];
  if (players.length === 0) return null;
  return players.reduce((worst, p) => (playerQualityScore(p) < playerQualityScore(worst) ? p : worst));
}

function bestFitInSection(roster, sectionKey, position) {
  const players = (roster[sectionKey] ?? []).filter((p) =>
    sectionKey === 'lineup' ? p.primaryPosition === position : true
  );
  if (players.length === 0) return null;
  return players.reduce((best, p) => (playerQualityScore(p) > playerQualityScore(best) ? p : best));
}

/**
 * One 1-for-1 swap between an MLB roster section and the org's AAA club,
 * if AAA holds a genuine upgrade on that section's weakest player.
 * @returns {boolean} whether a swap happened
 */
function tryPromoteIntoMlb(teamId, sectionKey, rosterByTeamId, affiliateRosterByClubId) {
  const roster = rosterByTeamId.get(teamId);
  const clubId = `${teamId}-${MLB_FEEDER_LEVEL}`;
  const affRoster = affiliateRosterByClubId.get(clubId);
  if (!roster || !affRoster) return false;

  const incumbent = weakestInSection(roster, sectionKey);
  if (!incumbent) return false;
  const challenger = bestFitInSection(affRoster, sectionKey, incumbent.primaryPosition);
  if (!challenger) return false;
  if (playerQualityScore(challenger) < playerQualityScore(incumbent) + MERIT_PROMOTION_MIN_MARGIN) return false;

  rosterByTeamId.set(teamId, {
    ...roster,
    [sectionKey]: [
      ...roster[sectionKey].filter((p) => p.id !== incumbent.id),
      { ...challenger, teamId, developmentLevel: DEVELOPMENT_LEVELS.MLB },
    ],
  });
  affiliateRosterByClubId.set(clubId, {
    ...affRoster,
    [sectionKey]: [
      ...(affRoster[sectionKey] ?? []).filter((p) => p.id !== challenger.id),
      { ...incumbent, teamId, developmentLevel: DEVELOPMENT_LEVELS[MLB_FEEDER_LEVEL] },
    ],
  });
  return true;
}

/**
 * The same 1-for-1 swap one rung down the ladder (AA->AAA, A->AA,
 * Rookie->A), so a prospect climbs continuously instead of being stuck
 * behind whoever happens to occupy the level above him.
 */
function tryPromoteBetweenLevels(teamId, upperLevel, lowerLevel, sectionKey, affiliateRosterByClubId) {
  const upper = affiliateRosterByClubId.get(`${teamId}-${upperLevel}`);
  const lower = affiliateRosterByClubId.get(`${teamId}-${lowerLevel}`);
  if (!upper || !lower) return false;

  const incumbent = weakestInSection(upper, sectionKey);
  if (!incumbent) return false;
  const challenger = bestFitInSection(lower, sectionKey, incumbent.primaryPosition);
  if (!challenger) return false;
  if (playerQualityScore(challenger) < playerQualityScore(incumbent) + MERIT_PROMOTION_MIN_MARGIN) return false;

  affiliateRosterByClubId.set(`${teamId}-${upperLevel}`, {
    ...upper,
    [sectionKey]: [
      ...(upper[sectionKey] ?? []).filter((p) => p.id !== incumbent.id),
      { ...challenger, developmentLevel: DEVELOPMENT_LEVELS[upperLevel] },
    ],
  });
  affiliateRosterByClubId.set(`${teamId}-${lowerLevel}`, {
    ...lower,
    [sectionKey]: [
      ...(lower[sectionKey] ?? []).filter((p) => p.id !== challenger.id),
      { ...incumbent, developmentLevel: DEVELOPMENT_LEVELS[lowerLevel] },
    ],
  });
  return true;
}

/**
 * Season-boundary merit sweep across every org.
 *
 * Runs TOP-DOWN (majors first, then AAA<-AA, AA<-A, A<-Rookie) so a single
 * pass can move a prospect more than one rung in the same offseason if he
 * has genuinely outgrown several: promoting into the majors opens the AAA
 * slot that the AA challenger then competes for, and so on down the ladder.
 *
 * Mutates both Maps in place — the same ownership contract every other
 * season-boundary sweep in this codebase uses.
 * @param {object[]} teams
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{promotedToMlb: number, promotedWithinMinors: number}}
 */
export function runMeritPromotions(teams, rosterByTeamId, affiliateRosterByClubId) {
  let promotedToMlb = 0;
  let promotedWithinMinors = 0;

  // MINOR_LEAGUE_LEVELS_ORDER is AAA-first, so consecutive pairs are
  // (AAA,AA), (AA,A), (A,ROOKIE) — exactly the top-down rungs wanted here.
  const rungs = MINOR_LEAGUE_LEVELS_ORDER.slice(0, -1).map((upper, i) => [upper, MINOR_LEAGUE_LEVELS_ORDER[i + 1]]);

  for (const team of teams) {
    for (const sectionKey of ROSTER_SECTIONS) {
      if (tryPromoteIntoMlb(team.id, sectionKey, rosterByTeamId, affiliateRosterByClubId)) promotedToMlb++;
      for (const [upper, lower] of rungs) {
        if (tryPromoteBetweenLevels(team.id, upper, lower, sectionKey, affiliateRosterByClubId)) promotedWithinMinors++;
      }
    }
  }

  return { promotedToMlb, promotedWithinMinors };
}
