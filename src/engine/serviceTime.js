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

// Founding-generation bootstrap (CLAUDE.md §47). Service time accrues from
// LEAGUE start, not career start — so without this, a 37-year-old on a
// season-1 roster reads as having 1 year of service, identical to a
// 21-year-old rookie. That was harmless while salary ran on an age proxy,
// but the moment salary keys off real service time it makes the entire
// founding generation permanently underpaid: they retire around seasons
// 3-5 having never reached the 6-year free-agency threshold. It also
// already distorted free-agency eligibility, arbitration, and 10-and-5
// rights for that generation, silently, since §37.
//
// Assumed major-league debut age. A founding player older than this is
// treated as having been in the majors continuously since then — a real
// simplification (it ignores late bloomers and time spent in the minors),
// flagged rather than modelled, because nothing in this engine records a
// pre-league-start career history to draw from.
export const ASSUMED_MLB_DEBUT_AGE = 23;

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

/**
 * "50-man Roster System" arc, Phase 9 — org-continuity tracking, feeding
 * isTenAndFiveEligible's `consecutiveYearsWithCurrentOrg` argument (which
 * Phase 4 took as an external param precisely because nothing tracked it).
 *
 * **Deliberately implemented HERE, in one place, rather than as a reset
 * call at every transaction site.** A player's org can change via trades
 * (Phase 6), waiver claims (Phase 5), the Rule 5 draft and its returns
 * (Phase 8), and free-agent signings — five sites today, and a sixth
 * whenever a future phase adds another transaction type. Comparing his
 * CURRENT teamId against the org he was in at the last sweep catches every
 * one of them, including ones that don't exist yet, instead of relying on
 * each site to remember a bookkeeping call it has no other reason to make.
 * @param {object} player
 * @param {string} teamId - the org he's in RIGHT NOW
 */
function withOrgContinuity(player, teamId) {
  const record = player.serviceRecord;
  const sameOrg = record.lastOrgTeamId === teamId;
  return {
    ...player,
    serviceRecord: {
      ...record,
      consecutiveSeasonsWithOrg: sameOrg ? record.consecutiveSeasonsWithOrg + 1 : 1,
      lastOrgTeamId: teamId,
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
 * One-time founding-generation bootstrap — see ASSUMED_MLB_DEBUT_AGE.
 *
 * Runs ONCE, at league start, and only over the active MLB rosters. It must
 * run BEFORE engine/contracts.js's assignMissingContracts, since that is
 * what prices every founding contract and is sticky-once-assigned — seeding
 * afterwards would leave the whole founding generation on league-minimum
 * deals forever.
 *
 * **Deliberately scoped to active rosters, not affiliate rosters.** Seeding
 * `minorsSeasonsAccrued` from age too would immediately flip large numbers
 * of affiliate players past the Rule 5 exposure threshold
 * (isRule5Exposed) and the minor-league free-agency threshold
 * (isMinorLeagueFreeAgent), firing a mass Rule 5 draft and a mass exodus in
 * the first offseason. That is a much larger behavioural change than this
 * phase is making, and affiliate players carrying no accrued history is
 * already the shipped status quo — it is only the MLB side that salary now
 * keys off. Left as named follow-up work.
 *
 * Never overwrites real accrued history: a player who already has
 * mlbServiceDays > 0 is returned untouched, so this is safe to call more
 * than once and cannot corrupt an in-progress league.
 * @param {Map<string, object>} rosterByTeamId - mutated in place, same
 *   ownership contract as advanceServiceTime below.
 * @param {number} currentSeasonNumber
 * @param {Date} asOfDate
 */
export function seedFoundingServiceTime(rosterByTeamId, currentSeasonNumber, asOfDate) {
  for (const [teamId, roster] of rosterByTeamId) {
    const updated = { ...roster };
    for (const sectionKey of ROSTER_SECTIONS) {
      updated[sectionKey] = roster[sectionKey].map((p) => {
        const withRecord = ensureServiceRecord(p, currentSeasonNumber, asOfDate);
        if (withRecord.serviceRecord.mlbServiceDays > 0) return withRecord;

        const age = getAge(p, asOfDate) ?? ASSUMED_MLB_DEBUT_AGE;
        const years = Math.max(0, age - ASSUMED_MLB_DEBUT_AGE);
        return {
          ...withRecord,
          serviceRecord: {
            ...withRecord.serviceRecord,
            mlbServiceDays: years * SERVICE_DAYS_PER_SEASON,
            // A founder with real major-league time was necessarily on a
            // 50-man roster to accrue it.
            wasEverProtected: years > 0 ? true : withRecord.serviceRecord.wasEverProtected,
            // ensureServiceRecord stamps ageAtSigning as the player's age
            // TODAY, which for a 30-year-old founder claims he signed at 30.
            // Clamp it to the assumed debut age so the record is internally
            // coherent (a 21-year-old keeps his real, younger age).
            ageAtSigning: Math.min(age, ASSUMED_MLB_DEBUT_AGE),
          },
        };
      });
    }
    rosterByTeamId.set(teamId, updated);
  }
}

/**
 * Gap-fill ONLY — creates a ServiceRecord for anyone missing one, and
 * credits nobody.
 *
 * Deliberately separate from advanceServiceTime below, which is a running
 * counter: calling that one a second time in a season would credit the
 * entire league a phantom extra year. Several late-stage season-boundary
 * mechanics (arbitration's non-tender backfill, the Rule 5 draft, minor-
 * league free agency, and §47's free-agency sweep) introduce brand-new
 * players AFTER advanceServiceTime has already run, via promoteAndBackfill,
 * whose cascade can generate a fresh player from thin air. Those players
 * would otherwise carry `serviceRecord: null` — the exact mirror of the
 * contract gap engine/contracts.js's second assignMissingContracts pass
 * closes, and caught the same way, by validate:servicetime's
 * population-wide "no player is missing a record" check.
 * @param {Map<string, object>} rosterByTeamId - mutated in place
 * @param {Map<string, object>} affiliateRosterByClubId - mutated in place
 * @param {number} currentSeasonNumber
 * @param {Date} asOfDate
 * @returns {{filled: number}}
 */
export function backfillMissingServiceRecords(rosterByTeamId, affiliateRosterByClubId, currentSeasonNumber, asOfDate) {
  let filled = 0;
  const fill = (roster) => {
    const updated = { ...roster };
    for (const sectionKey of ROSTER_SECTIONS) {
      updated[sectionKey] = (roster[sectionKey] ?? []).map((p) => {
        if (p.serviceRecord) return p;
        filled++;
        return ensureServiceRecord(p, currentSeasonNumber, asOfDate);
      });
    }
    return updated;
  };

  for (const [teamId, roster] of rosterByTeamId) rosterByTeamId.set(teamId, fill(roster));
  for (const [clubId, roster] of affiliateRosterByClubId) affiliateRosterByClubId.set(clubId, fill(roster));
  return { filled };
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
      updated[sectionKey] = roster[sectionKey].map((p) =>
        withOrgContinuity(creditMlbSeason(ensureServiceRecord(p, currentSeasonNumber, asOfDate)), teamId)
      );
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
          const credited = reserveIds.has(p.id) ? creditReserveSeason(withRecord) : creditMinorsSeason(withRecord);
          return withOrgContinuity(credited, teamId);
        });
      }
      affiliateRosterByClubId.set(clubId, updatedAff);
    }
  }
}
