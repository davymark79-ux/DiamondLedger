// Contracts & Salaries — "50-man Roster System" arc, Phase 3, per
// financial-model-expenses.md's "Player Payroll" section: every contract
// is majors/minors/both, no salary cap, a flat salary floor, a luxury tax
// above a threshold. Confirmed with the user before implementation: EVERY
// org-affiliated player gets a real contract, not just the 50-man MLB pool
// — the active 26, the Reserve pool (Phase 1), and every other AAA/AA/A/
// Rookie affiliate player too. A large population (thousands across 50
// orgs) but computationally cheap — a per-player formula, no simulation.
//
// Deliberately pure, no rng consumed anywhere in this file — a contract is
// an objective valuation of ability + experience, not a random roll. This
// also sidesteps a real threading problem: live, user-triggered signing
// actions (engine/freeAgency.js) have no seeded rng available the way
// season simulation does, so a pure formula means those call sites need no
// rng plumbing at all.
//
// Real MLB salary structure is driven by service time (pre-arb minimum,
// arbitration years, free-agent value). From §36 until §47 this file stood
// that up on an explicitly-flagged AGE-based proxy, because Service Time
// did not exist yet. It does now (§37), and as of §47 salary keys off REAL
// accrued service — see computeServiceTimeLeverage below, which is also the
// canonical curve engine/arbitration.js consumes, so the two cannot drift.
//
// That change required a companion fix, since service time accrues from
// LEAGUE start rather than career start: engine/serviceTime.js's
// seedFoundingServiceTime backfills the founding generation from age at
// league start. Without it every season-1 veteran reads as a rookie and
// prices at the league minimum forever.
//
// All dollar figures are placeholders needing real playtesting/calibration
// — same tuning status as every other numeric constant in this project
// (engine/calendar.js's GAMES_PER_WEEK, engine/rosterExpansion.js's
// EXPANSION_TRIGGER_WEEKS_REMAINING, etc.).

import { playerQualityScore } from './minorLeagues.js';
import { eligiblePlayersForTeam } from './rosterProtection.js';
import { computeServiceYears, ARBITRATION_START_SERVICE_YEARS, FREE_AGENCY_SERVICE_YEARS } from './serviceTime.js';
import { createContract, CONTRACT_TYPES } from '../models/Contract.js';
import { RATING_SCALE, MINOR_LEAGUE_LEVELS_ORDER } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// ===== Constants (placeholders — see file header) =====

export const MLB_MIN_SALARY = 750_000;
export const MLB_MAX_SALARY = 35_000_000;
// > 1 concentrates mass toward MLB_MIN_SALARY — matches real MLB's own
// skewed distribution (many players near the minimum, a handful of stars
// pulling the mean far above the median), rather than a linear ramp that
// would make an average-quality player implausibly rich.
export const SALARY_QUALITY_EXPONENT = 3.5;

export const MINORS_SALARY_BY_LEVEL = Object.freeze({
  AAA: 42_000,
  AA: 33_000,
  A: 28_000,
  ROOKIE: 26_000,
});
export const MINORS_SALARY_QUALITY_BONUS_MAX = 8_000;

// Flat across all clubs, per the doc: "a minimum total payroll
// requirement... confirmed flat across all clubs to start, not
// market-size-scaled." A single flat overage rate for the luxury tax — the
// doc mentions "brackets" but leaves the exact structure open, so a flat
// rate is the honest placeholder here, not a guessed-at bracket schedule.
//
// RE-CALIBRATED (CLAUDE.md §46) against the post-arbitration distribution.
// The original §36 values ($55M / $165M) were measured against a SEASON-1
// run, before arbitration existed; §40's arbitration + non-tender wave then
// re-priced the whole league and left the tax literally unreachable (0 of
// 50 clubs, every season) and the floor catching roughly half the league.
// Both are still informational-only — no scripted event is wired to either.
//
// Measured across a real 8-season run, all 50 clubs, league payroll ($M):
//
//   season 1   min 49.9  p10 55.2  med 123.2  p90 159.3  max 179.7
//   season 2   min 49.9  p10 53.6  med 114.9  p90 154.3  max 162.7
//   season 3   min 32.0  p10 42.1  med  48.1  p90  60.3  max  77.2   <- trough
//   season 4   min 34.9  p10 39.9  med  53.7  p90  73.5  max  90.9
//   season 5   min 35.4  p10 39.1  med  59.2  p90  79.1  max 114.7
//   season 6   min 31.7  p10 38.5  med  60.5  p90  82.5  max 110.4
//   season 7   min 33.6  p10 38.1  med  62.1  p90  84.3  max 109.8
//   season 8   min 35.2  p10 38.3  med  63.3  p90  85.6  max 111.5
//
// Two things that measurement showed, neither of which was obvious:
//
// 1. §40's own "~$37-75M" figure was taken at SEASON 3 — which turns out to
//    be the trough, not the steady state. Arbitration first fires at the
//    season-2 boundary (service time only starts accruing at the end of
//    season 1), so season 3 is the first fully re-priced season AND absorbs
//    the one-time non-tender wave at once. Payroll then recovers and
//    flattens: median 48.1 -> 53.7 -> 59.2 -> 60.5 -> 62.1 -> 63.3, i.e.
//    +5.6, +5.5, +1.3, +1.6, +1.2. Seasons 6-8 are approximately stable.
//    Calibrating against season 3 would have aimed at a transient.
//    Residual drift is ~$1-2M/season and decelerating; if a very long save
//    ever drifts materially past this, re-measure rather than assume.
//
// 2. §36's BIMODALITY still exists but the clusters now OVERLAP, so its
//    "set each constant just outside a cluster" reasoning no longer works.
//    At season 1 the tiers were nearly disjoint (MLB2 49.9-67.4, MLB1
//    107.9-179.7); by season 8 they are MLB2 35.2-56.6 (med 40.3) and MLB1
//    40.7-111.5 (med 72.3) — a real tier gap in the medians, but heavily
//    overlapping ranges. So these are now set on a PERCENTILE basis against
//    the whole league instead, preserving §36's actual intent (~5-10% of
//    clubs triggering on each end, not a whole tier and not nobody).
//
// Floor sits between p5 ($35.6M) and p10 ($38.3M) — and that p10 is
// remarkably steady across seasons 5-8 (39.1 / 38.5 / 38.1 / 38.3), so it
// is not tuned to one lucky snapshot. Threshold sits near p95 ($90.6M),
// deliberately a touch high rather than at p90: payroll still drifts
// gently upward, so a p90 pick would creep toward catching too many, while
// p95 keeps the tax live without it becoming unreachable again.
//
// VERIFIED at these values across the same 8-season run — clubs triggering,
// out of 50 (this is what the constants actually do, not what they were
// aimed at):
//
//   season   1    2    3    4    5    6    7    8
//   <floor   0    0    2    1    3    2    4    5
//   >tax    30   30    0    1    1    1    2    3
//
// Seasons 3-8 (the post-arbitration steady state) land where intended:
// the floor catches 2-10% and the tax 0-6%, both edging up with the gentle
// upward drift, which is the desired direction — the previous values died
// by going permanently unreachable.
//
// KNOWN ARTIFACT, stated rather than hidden: in seasons 1-2 the tax catches
// 30 of 50 clubs. Those seasons pre-date arbitration entirely (service time
// only starts accruing at the end of season 1), so every salary is still
// set by this file's own age-based proxy, which systematically overvalues
// players relative to real service time — league payroll in that window is
// genuinely inflated, and the tax is arguably reporting a real overspend
// against an artificial baseline. It is a two-season transient every save
// passes through once, against an unbounded steady state, so the steady
// state is what these are tuned for. The old values had the mirror-image
// problem and it was strictly worse: roughly right for seasons 1-2, then
// dead forever. A genuine fix is either season-scaled thresholds (the doc
// specifies flat, so not done here) or replacing the age proxy with real
// accrued service time league-wide — which §40 deliberately scoped out,
// since it would re-value every salary in the game.
export const SALARY_FLOOR = 37_000_000;
export const LUXURY_TAX_THRESHOLD = 90_000_000;
export const LUXURY_TAX_RATE = 0.20;

// ===== Service-time leverage (CLAUDE.md §47) =====
//
// This replaced an age-based proxy (`computeServiceTimeProxyFraction`,
// a 20->28 linear ramp) that stood in for real service time from §36 until
// §47. This file's own header used to say "Phase 4 is expected to replace
// this proxy with a real day-accrual signal" — §37 built the accrual, §40
// used it for arbitration only, and this is where base salary finally
// follows.
//
// Deliberately the CANONICAL curve for the whole codebase, not a second
// opinion: engine/arbitration.js's computeArbitrationMarketValue used to
// inline its own copy of the 3-6 window ramp, and now imports this instead,
// so the two can no longer drift apart. (Direction matters — arbitration.js
// already imports from this file, so the shared curve has to live here;
// putting it in arbitration.js would create a cycle.)
//
// Mirrors real MLB's three regimes, and the CLIFFS between them are real,
// not artefacts: a player at the league minimum jumps sharply on reaching
// arbitration, and jumps again on reaching free agency.
//
//   < 3 years   pre-arbitration    -> 0    (exactly MLB_MIN_SALARY)
//   3-6 years   arbitration window -> 0.4 rising to 0.9
//   >= 6 years  free agency        -> 1    (full open-market value)
export const PRE_ARBITRATION_LEVERAGE = 0;
export const ARBITRATION_LEVERAGE_FLOOR = 0.4;
export const ARBITRATION_LEVERAGE_CEILING = 0.9;
export const FREE_AGENT_LEVERAGE = 1;

/**
 * @param {import('../models/ServiceRecord.js').ServiceRecord|null} serviceRecord
 * @returns {number} 0-1. A missing record reads as zero accrued service
 *   (an amateur/unsigned player), which prices at the league minimum —
 *   the correct floor, not a crash.
 */
export function computeServiceTimeLeverage(serviceRecord) {
  const years = computeServiceYears(serviceRecord?.mlbServiceDays ?? 0);
  if (years < ARBITRATION_START_SERVICE_YEARS) return PRE_ARBITRATION_LEVERAGE;
  if (years >= FREE_AGENCY_SERVICE_YEARS) return FREE_AGENT_LEVERAGE;
  const windowFraction =
    (years - ARBITRATION_START_SERVICE_YEARS) / (FREE_AGENCY_SERVICE_YEARS - ARBITRATION_START_SERVICE_YEARS);
  return ARBITRATION_LEVERAGE_FLOOR + windowFraction * (ARBITRATION_LEVERAGE_CEILING - ARBITRATION_LEVERAGE_FLOOR);
}

// ===== Salary formulas =====

/**
 * Used for both MAJORS (active 26) and BOTH (Reserve/Taxi pool) contracts
 * — a BOTH contract is simplified to the same formula as a real MLB deal,
 * flagged: a true split-contract distinction (a lower rate while actually
 * optioned to the minors) is Phase 5/7 territory, not this phase's job.
 * Now keyed off REAL accrued service time rather than age (§47), so a
 * 30-year-old journeyman with three years of service is priced like the
 * arbitration-window player he is, not like a free agent.
 * @param {object} player - Player
 * @returns {number} whole dollars, between MLB_MIN_SALARY and MLB_MAX_SALARY
 */
export function generateMajorsStyleSalary(player) {
  const quality = playerQualityScore(player);
  const qualityFraction = Math.min(1, Math.max(0, (quality - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN)));
  const marketValue = MLB_MIN_SALARY + qualityFraction ** SALARY_QUALITY_EXPONENT * (MLB_MAX_SALARY - MLB_MIN_SALARY);
  const leverage = computeServiceTimeLeverage(player.serviceRecord);
  return Math.round(MLB_MIN_SALARY + leverage * (marketValue - MLB_MIN_SALARY));
}

/**
 * @param {object} player - Player
 * @param {string} level - one of MINOR_LEAGUE_LEVELS_ORDER
 * @returns {number} whole dollars, far below MLB scale
 */
export function generateMinorsSalary(player, level) {
  const quality = playerQualityScore(player);
  const qualityFraction = Math.min(1, Math.max(0, (quality - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN)));
  return Math.round(MINORS_SALARY_BY_LEVEL[level] + qualityFraction * MINORS_SALARY_QUALITY_BONUS_MAX);
}

/**
 * @param {object} player - Player
 * @param {'ACTIVE'|'RESERVE_TAXI'|'MINORS_DEPTH'} context
 * @param {string|null} level - required (one of MINOR_LEAGUE_LEVELS_ORDER) when context is MINORS_DEPTH
 * @param {Date} asOfDate
 * @returns {import('../models/Contract.js').Contract}
 */
export function generateContractForPlayer(player, context, level) {
  if (context === 'ACTIVE') {
    return createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: generateMajorsStyleSalary(player), guaranteed: true });
  }
  if (context === 'RESERVE_TAXI') {
    return createContract({ type: CONTRACT_TYPES.BOTH, annualSalary: generateMajorsStyleSalary(player), guaranteed: true });
  }
  return createContract({ type: CONTRACT_TYPES.MINORS, annualSalary: generateMinorsSalary(player, level), guaranteed: false });
}

// ===== Backfill =====

/**
 * Season-boundary backfill: any player with `contract: null` across a
 * team's active roster, Reserve pool (live-resolved via
 * eligiblePlayersForTeam, same pattern engine/taxiSquad.js already uses),
 * or full AAA/AA/A/Rookie affiliate rosters gets a contract generated via
 * the right context. **Salary is sticky once assigned** — a player who
 * already has a contract is left completely untouched, matching "no
 * negotiation system yet" (Phase 7 owns real renegotiation). A known,
 * accepted simplification: a promoted/optioned player's contract `type`
 * can go stale relative to his CURRENT level — see file header and
 * computeTeamPayroll below, which sums by current roster membership, not
 * by this label, so payroll math itself is never corrupted by this.
 *
 * Mutates `rosterByTeamId`/`affiliateRosterByClubId` in place, same
 * ownership contract as every other function this arc has added.
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {Date} asOfDate
 * @returns {{assigned: number}}
 */
export function assignMissingContracts(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId) {
  let assigned = 0;

  function withContract(player, context, level) {
    if (player.contract) return player;
    assigned++;
    return { ...player, contract: generateContractForPlayer(player, context, level) };
  }

  for (const [teamId, roster] of rosterByTeamId) {
    const updated = { ...roster };
    for (const sectionKey of ROSTER_SECTIONS) {
      updated[sectionKey] = roster[sectionKey].map((p) => withContract(p, 'ACTIVE', null));
    }
    rosterByTeamId.set(teamId, updated);

    const reserveIds = new Set(reserveRosterByTeamId.get(teamId) ?? []);
    for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
      const clubId = `${teamId}-${level}`;
      const affRoster = affiliateRosterByClubId.get(clubId);
      if (!affRoster) continue;
      const updatedAff = { ...affRoster };
      for (const sectionKey of ROSTER_SECTIONS) {
        updatedAff[sectionKey] = affRoster[sectionKey].map((p) =>
          withContract(p, reserveIds.has(p.id) ? 'RESERVE_TAXI' : 'MINORS_DEPTH', level)
        );
      }
      affiliateRosterByClubId.set(clubId, updatedAff);
    }
  }

  return { assigned };
}

// ===== Payroll aggregation =====

/**
 * Sums `contract.annualSalary` across the active 26 AND the Reserve pool
 * specifically (not the wider MINORS affiliate depth) — matches real
 * MLB's own CBT calculation basis (the 40-man roster), and keeps this
 * figure distinct from financial-model-expenses.md's own separate "minor
 * league affiliate subsidy" expense category. A live aggregation, not
 * stored state.
 * @param {string} teamId
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, string[]>} reserveRosterByTeamId
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {number} whole dollars
 */
export function computeTeamPayroll(teamId, rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId) {
  let total = 0;

  const roster = rosterByTeamId.get(teamId);
  if (roster) {
    for (const sectionKey of ROSTER_SECTIONS) {
      for (const p of roster[sectionKey]) total += p.contract?.annualSalary ?? 0;
    }
  }

  const reserveIds = new Set(reserveRosterByTeamId.get(teamId) ?? []);
  if (reserveIds.size > 0) {
    const reservePlayers = eligiblePlayersForTeam(teamId, affiliateRosterByClubId).filter((p) => reserveIds.has(p.id));
    for (const p of reservePlayers) total += p.contract?.annualSalary ?? 0;
  }

  return total;
}

/**
 * @param {number} payroll
 * @returns {number} whole dollars owed, 0 if at/below LUXURY_TAX_THRESHOLD
 */
export function computeLuxuryTaxOwed(payroll) {
  return Math.max(0, payroll - LUXURY_TAX_THRESHOLD) * LUXURY_TAX_RATE;
}
