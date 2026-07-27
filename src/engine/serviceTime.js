// Service Time — "50-man Roster System" arc, Phase 4, per
// player-movement.md's "Service Time & Free Agency" section: a per-player
// day-accrual tracker feeding every eligibility threshold in the doc —
// free agency (6 years), arbitration (3-6 years), outright-refusal
// (3-year+outrighted / 5-year unconditional), Rule 5 exposure timing
// (4-5 seasons depending on signing age), minor-league free agency
// (~6-7 seasons never protected), and 10-and-5 rights (10 total + 5
// consecutive with the same org). This file builds the counter and the
// eligibility MATH — not the enforcement actions (non-tender, a real
// Rule 5 draft, trade no-trade blocking, outright-assignment UI). Those
// belong to Phases 5-9, which don't exist yet.
//
// Deliberately whole-season granularity, not literal day-precision. Real
// MLB service time is calendar-day exact, but this engine has no
// day-level game calendar (only week-indexed scheduling exists — see
// engine/calendar.js), and a team's active/reserve/minors membership is
// effectively fixed for an entire simulated season (only changing at
// season boundaries, plus live free-agent signings that happen BETWEEN
// season simulations, never mid-simulation). A player credited for being
// on the active 26 for a season gets a full SERVICE_DAYS_PER_SEASON —
// matching the granularity this engine's season-block architecture
// actually supports. Flagged as a real simplification, not a bug.
//
// Super Two is explicitly NOT built here — confirmed with the user. It
// needs to know WHEN within a season a player was promoted (the real
// "call him up in May, not April" manipulation the doc describes), which
// this whole-season model has no way to express. The user separately
// flagged that the engine will likely need a real day-by-day simulation
// model at some point — a real future direction, not attempted this
// phase.

import { getAge } from '../models/Player.js';
import { createServiceRecord } from '../models/ServiceRecord.js';
import { MINOR_LEAGUE_LEVELS_ORDER } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// ===== Constants (CBA-negotiable placeholders — see file header) =====

export const SERVICE_DAYS_PER_SEASON = 172;
export const FREE_AGENCY_SERVICE_YEARS = 6;
export const ARBITRATION_START_SERVICE_YEARS = 3;
export const RULE5_SEASONS_SIGNED_19_PLUS = 4;
export const RULE5_SEASONS_SIGNED_UNDER_19 = 5;
export const OUTRIGHT_REFUSAL_CONDITIONAL_YEARS = 3;
export const OUTRIGHT_REFUSAL_UNCONDITIONAL_YEARS = 5;
// The doc itself calls this "~6-7 years... a less certain recollection
// [than the MLB-side numbers]" — flagged as such, not a confident figure.
export const MINOR_LEAGUE_FREE_AGENCY_SEASONS = 7;
export const TEN_AND_FIVE_TOTAL_YEARS = 10;
export const TEN_AND_FIVE_CONSECUTIVE_YEARS = 5;

// ===== Eligibility math =====

/**
 * @param {number} mlbServiceDays
 * @returns {number} fractional years
 */
export function computeServiceYears(mlbServiceDays) {
  return mlbServiceDays / SERVICE_DAYS_PER_SEASON;
}

/** @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord */
export function isFreeAgencyEligible(serviceRecord) {
  return computeServiceYears(serviceRecord.mlbServiceDays) >= FREE_AGENCY_SERVICE_YEARS;
}

/**
 * Arbitration runs "3 years through the 6th" — the [3, 6) window; at 6
 * years he's a free agent instead (see isFreeAgencyEligible), not still
 * arbitration-eligible.
 * @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord
 */
export function isArbitrationEligible(serviceRecord) {
  const years = computeServiceYears(serviceRecord.mlbServiceDays);
  return years >= ARBITRATION_START_SERVICE_YEARS && years < FREE_AGENCY_SERVICE_YEARS;
}

/**
 * Real MLB age-based split: 4 seasons if signed at 19+, 5 if signed
 * younger (more developmental runway before exposure). Gated on
 * `!wasEverProtected` — once added to the 50-man pool (active or
 * Reserve), a player is no longer Rule-5-exposed by definition.
 * @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord
 * @param {number} currentSeasonNumber
 */
export function isRule5Exposed(serviceRecord, currentSeasonNumber) {
  if (serviceRecord.wasEverProtected) return false;
  const seasonsSinceSigning = currentSeasonNumber - serviceRecord.firstProSeasonNumber;
  const threshold = (serviceRecord.ageAtSigning ?? 19) >= 19 ? RULE5_SEASONS_SIGNED_19_PLUS : RULE5_SEASONS_SIGNED_UNDER_19;
  return seasonsSinceSigning >= threshold;
}

/**
 * A player who walks on his own after accumulating enough minor-league
 * time WITHOUT ever being added to a 50-man roster — distinct from Rule
 * 5 (other teams drafting him) but the same `!wasEverProtected` gate.
 * @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord
 */
export function isMinorLeagueFreeAgent(serviceRecord) {
  return !serviceRecord.wasEverProtected && serviceRecord.minorsSeasonsAccrued >= MINOR_LEAGUE_FREE_AGENCY_SEASONS;
}

/**
 * @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord
 * @param {boolean} wasOutrightedBefore - outright-assignment HISTORY
 *   doesn't exist until Phase 5 (Options/Waivers/DFA) — every real call
 *   site passes `false` for now, same "scaffolding now, real input
 *   later" precedent as Phase 2's `optionYearsUsed`.
 */
export function isOutrightRefusalEligible(serviceRecord, wasOutrightedBefore) {
  const years = computeServiceYears(serviceRecord.mlbServiceDays);
  return (years >= OUTRIGHT_REFUSAL_CONDITIONAL_YEARS && wasOutrightedBefore) || years >= OUTRIGHT_REFUSAL_UNCONDITIONAL_YEARS;
}

/**
 * @param {import('../models/ServiceRecord.js').ServiceRecord} serviceRecord
 * @param {number} consecutiveYearsWithCurrentOrg - Trades (Phase 6) don't
 *   exist yet, so nothing can break org continuity today — every real
 *   call site can only ever pass `currentSeasonNumber - firstProSeasonNumber`.
 */
export function isTenAndFiveEligible(serviceRecord, consecutiveYearsWithCurrentOrg) {
  const years = computeServiceYears(serviceRecord.mlbServiceDays);
  return years >= TEN_AND_FIVE_TOTAL_YEARS && consecutiveYearsWithCurrentOrg >= TEN_AND_FIVE_CONSECUTIVE_YEARS;
}

// ===== Season-boundary accrual sweep =====

function ensureServiceRecord(player, currentSeasonNumber, asOfDate) {
  if (player.serviceRecord) return player;
  return {
    ...player,
    serviceRecord: createServiceRecord({
      firstProSeasonNumber: currentSeasonNumber,
      ageAtSigning: getAge(player, asOfDate),
    }),
  };
}

function creditMlbSeason(player) {
  return {
    ...player,
    serviceRecord: {
      ...player.serviceRecord,
      mlbServiceDays: player.serviceRecord.mlbServiceDays + SERVICE_DAYS_PER_SEASON,
      wasEverProtected: true,
    },
  };
}

function creditReserveSeason(player) {
  return {
    ...player,
    serviceRecord: {
      ...player.serviceRecord,
      minorsSeasonsAccrued: player.serviceRecord.minorsSeasonsAccrued + 1,
      wasEverProtected: true,
    },
  };
}

function creditMinorsSeason(player) {
  return {
    ...player,
    serviceRecord: {
      ...player.serviceRecord,
      minorsSeasonsAccrued: player.serviceRecord.minorsSeasonsAccrued + 1,
    },
  };
}

/**
 * The season-boundary sweep — unlike engine/contracts.js's
 * `assignMissingContracts` (which assigns ONCE and never touches an
 * existing contract again), this one is a genuine RUNNING COUNTER: every
 * org-affiliated player gets credited EVERY season, not just when a field
 * is missing. Only `firstProSeasonNumber`/`ageAtSigning` are "sticky
 * once assigned" (via ensureServiceRecord); `mlbServiceDays`/
 * `minorsSeasonsAccrued` accumulate unconditionally each call.
 *
 * Credits a full season of MLB service to everyone on the active 26
 * (`rosterByTeamId`), a minors season + protected status to everyone in
 * the Reserve pool (checked directly against `reserveRosterByTeamId`
 * while walking each level's own affiliate roster, rather than a
 * separate live-resolution pass), and a minors season to every other
 * affiliate player. Mutates `rosterByTeamId`/`affiliateRosterByClubId`
 * in place, same ownership contract as every other function this arc has
 * added.
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {number} currentSeasonNumber
 * @param {Date} asOfDate
 */
export function advanceServiceTime(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId, currentSeasonNumber, asOfDate) {
  for (const [teamId, roster] of rosterByTeamId) {
    const updated = { ...roster };
    for (const sectionKey of ROSTER_SECTIONS) {
      updated[sectionKey] = roster[sectionKey].map((p) => creditMlbSeason(ensureServiceRecord(p, currentSeasonNumber, asOfDate)));
    }
    rosterByTeamId.set(teamId, updated);

    const reserveIds = new Set(reserveRosterByTeamId.get(teamId) ?? []);
    for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
      const clubId = `${teamId}-${level}`;
      const affRoster = affiliateRosterByClubId.get(clubId);
      if (!affRoster) continue;
      const updatedAff = { ...affRoster };
      for (const sectionKey of ROSTER_SECTIONS) {
        updatedAff[sectionKey] = affRoster[sectionKey].map((p) => {
          const withRecord = ensureServiceRecord(p, currentSeasonNumber, asOfDate);
          return reserveIds.has(p.id) ? creditReserveSeason(withRecord) : creditMinorsSeason(withRecord);
        });
      }
      affiliateRosterByClubId.set(clubId, updatedAff);
    }
  }
}
