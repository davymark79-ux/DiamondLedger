// Affiliate player development — §49.
//
// FIXES A REAL, LONG-STANDING DEFECT, found by measurement: minor-league
// players never developed at all. `advanceDevelopmentPeriod` was wired for
// MLB active rosters (engine/leagueProgression.js), college players
// (engine/college.js) and academy players (engine/internationalAcademy.js),
// but the ~5,500-player AAA/AA/A/Rookie population was never passed through
// it. Verified directly: 400 of 400 traceable AAA players had byte-identical
// ratings after a full simulated season. The minor leagues — the entire
// development system — developed nobody.
//
// That silently undercut several earlier phases. §48 uncapped minor-league
// potential so a prospect could genuinely become an MLB-calibre player; with
// no growth mechanism he could never reach it, which is why measured AAA
// "headroom" kept RISING season over season (4.15 -> 9.76) — players were
// accumulating unrealised potential precisely because they never grew into
// it. §48's merit promotion was likewise re-sorting a static pool rather
// than surfacing players who had improved.
//
// SECOND PURPOSE — club differentiation. Measured: club-level quality SD
// collapses 8.31 -> ~1.0 over 26 seasons with five-season persistence at
// r=0.25, so every club ends up interchangeable and promotion/relegation
// stops tracking anything real. The cause is that every acquisition channel
// (draft, waivers, Rule 5, and §47's free-agency signing pass) is a
// worst-first EQUALIZER while nothing pulls clubs apart. §49 first tried
// economics on free agency alone and it did NOT work — measured SD 1.03 ->
// 0.95, i.e. unchanged — because free agency is a minor channel (24 signings
// a season against 80 merit promotions and 401 internal moves) and the
// affordability gate almost never binds (league payroll ~$36M against
// capacities of $37-96M). Development is the DOMINANT channel, so that is
// where an economic advantage has to act to matter.
//
// The hook is engine/growthModel.js's `locationModifier`, an extension point
// reserved since §4 "for the future college-prestige/specialty system" and
// already consumed by college and the academies in exactly this shape.

import { advanceDevelopmentPeriod } from './growthModel.js';
import { MINOR_LEAGUE_LEVELS_ORDER } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// Growth-per-period swing between the league's poorest and richest org, in
// rating points per attribute per season. Deliberately small: it compounds
// over a prospect's whole minor-league career (4-8 seasons), so a modest
// per-season edge becomes a real talent gap at promotion time without any
// single season looking implausible. Illustrative placeholder — what matters
// is whether it produces PERSISTENT club differentiation, which the club
// diagnostic measures directly rather than this constant asserting it.
export const ORG_DEVELOPMENT_SWING = 0.5;

/**
 * The `(attribute, group) => number` closure growthModel expects, driven by
 * the org's economic strength (0 = poorest club in the league, 1 = richest).
 * Centred so a league-average org is exactly neutral — this redistributes
 * development, it does not inflate the league.
 * @param {number} orgStrength - 0-1
 */
export function locationModifierForOrg(orgStrength) {
  const bonus = (orgStrength - 0.5) * ORG_DEVELOPMENT_SWING;
  return () => bonus;
}

/**
 * Season-boundary development pass over every affiliate roster.
 *
 * Runs the SAME `advanceDevelopmentPeriod` the majors/college/academies use,
 * so a minor leaguer ages, grows toward his own true potential, and is
 * subject to the same variance — with the level's own std-dev bucket applied
 * automatically via `player.developmentLevel` (Rookie ball is the most
 * volatile, AAA the least), which is exactly what that constant was built
 * for and has never been exercised until now.
 *
 * Does NOT roll retirement or position reassignment here: retirement for
 * affiliate players is a separate known gap (CLAUDE.md §45) and bundling it
 * in would change two things at once. Growth only.
 *
 * Mutates `affiliateRosterByClubId` in place — same ownership contract as
 * every other season-boundary sweep.
 * @param {object[]} teams
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @param {Map<string, number>|null} orgStrengthByTeamId - 0-1 per club; null
 *   means no economic differentiation (every org neutral), which is what
 *   every caller that doesn't pass one gets.
 * @returns {{developed: number}}
 */
export function advanceAffiliateDevelopment(teams, affiliateRosterByClubId, rng, asOfDate, orgStrengthByTeamId = null) {
  let developed = 0;

  for (const team of teams) {
    const strength = orgStrengthByTeamId?.get(team.id);
    const locationModifier = strength === undefined ? undefined : locationModifierForOrg(strength);

    for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
      const clubId = `${team.id}-${level}`;
      const roster = affiliateRosterByClubId.get(clubId);
      if (!roster) continue;

      const updated = { ...roster };
      for (const sectionKey of ROSTER_SECTIONS) {
        updated[sectionKey] = (roster[sectionKey] ?? []).map((player) => {
          developed++;
          return advanceDevelopmentPeriod(player, { rng, asOfDate, locationModifier });
        });
      }
      affiliateRosterByClubId.set(clubId, updated);
    }
  }

  return { developed };
}
