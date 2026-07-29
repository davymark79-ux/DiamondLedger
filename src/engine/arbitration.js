// Free Agency Economics — Arbitration & Non-Tender: "50-man Roster System"
// arc, Phase 7, per player-movement.md's "Service Time & Free Agency"
// section ("arbitration eligibility starts at 3 years, running through the
// 6th — a player negotiates/arbitrates salary rather than playing for a
// fixed minimum" + "non-tender: a controllable pre-free-agency player must
// be tendered a contract by a set deadline or becomes an immediate free
// agent").
//
// **The first thing in this codebase that legitimately changes an existing
// player's salary.** engine/contracts.js's assignMissingContracts is
// sticky-once-assigned, and its own header already says "Phase 7 owns real
// renegotiation" — this file is that.
//
// Scope, confirmed with the user after research turned up real missing
// prerequisites (not assumed — searched for):
// - **Super Two is NOT built.** It needs mid-season call-up timing, which
//   this whole-season-block engine can't express; already explicitly
//   deferred back in Phase 4 (see engine/serviceTime.js's own header).
// - **The service-time-manipulation countermeasures (ROY service-time
//   credit, draft-pick compensation) are NOT built.** Both need an Awards
//   system that does not exist anywhere — engine/hallOfFame.js's header
//   says awards are a zero-weighted extension point precisely because "no
//   awards... system exists." Awards is itself blocked on a second gap:
//   per-season stats (engine/season.js's seasonBattingStatsById/
//   seasonPitchingStatsById) are computed but never reach live state or
//   the React context, feeding only the offline Hall-of-Fame snapshot
//   pipeline. A real future phase, not something to fake here.
//
// Arbitration is modeled as a REAL FILE-AND-TRIAL HEARING (confirmed with
// the user over a simpler formula-driven raise): club and player each file
// a figure, and the arbitrator picks ONE of them outright — never a
// midpoint. That last property is the whole point of the real mechanic:
// because the arbitrator awards whichever filed figure sits closer to his
// own read of the player's value, filing an unrealistic number is
// mechanically punished rather than a free roll.
//
// An automatic season-boundary sweep, NOT a per-player UI action —
// deliberately unlike Phases 5/6 (Option/DFA/trades). Arbitration and
// non-tender fire for hundreds of players simultaneously at a league-wide
// deadline, so a sweep is the honest model (matching Phases 3/4's
// contracts/service-time sweeps); a per-case UI would be a serious
// per-season clicking burden with no front-office AI to help.
//
// All dollar figures/ratios below are CBA-negotiable placeholders needing
// real playtesting — same tuning status as every other numeric constant in
// this project (player-movement.md's own "CBA Tie-In" section explicitly
// lists arbitration thresholds among the negotiable terms).

import { playerQualityScore, promoteAndBackfill } from './minorLeagues.js';
import { MLB_MIN_SALARY, MLB_MAX_SALARY, SALARY_QUALITY_EXPONENT } from './contracts.js';
import { computeServiceYears, isArbitrationEligible, ARBITRATION_START_SERVICE_YEARS, FREE_AGENCY_SERVICE_YEARS } from './serviceTime.js';
import { RATING_SCALE } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// ===== Constants (CBA-negotiable placeholders — see file header) =====

// Clubs file low, players file high — the real spread that makes a hearing
// a hearing. Applied to market value.
export const CLUB_FILING_FRACTION = 0.82;
export const PLAYER_FILING_FRACTION = 1.28;
// Neither side may file below what the player already earns (real MLB caps
// how far a club can cut an arbitration salary; simplified here to "never
// below current"), and a player always files for at least a modest raise.
export const PLAYER_MIN_RAISE_FRACTION = 1.1;
// The arbitrator's own read of market value is noisy — real arbitrators
// genuinely disagree. Expressed as a fraction of market value.
export const ARBITRATOR_VALUATION_NOISE = 0.12;
// A club walks away when the projected award exceeds what the player is
// actually worth by more than this. See shouldNonTender for why this
// triggers on exactly the right players.
//
// Calibrated empirically against a real 5-season run (140 genuinely
// arbitration-eligible players across all 50 clubs), not guessed — the
// same "run the real distribution first" discipline §36 established. The
// measured sweep, kept here so a future tuner sees the whole curve rather
// than one number with no context:
//   1.30 -> 19.3%   1.40 -> 12.9%   1.45 -> 11.4%
//   1.50 ->  7.9%   1.60 ->  3.6%   1.70 ->  2.9%
// 1.50 lands non-tenders at a real but non-destructive ~8% of the
// arbitration-eligible pool each offseason.
export const NON_TENDER_VALUE_RATIO = 1.5;

// An arbitration-eligible player never captures his full open-market value
// — that's the whole point of team control — but he never captures ~none
// of it either. Real arbitration escalates roughly 40% -> 90% of market
// value across the three arb years, and porting that shape is load-bearing
// here, not cosmetic: see the calibration note on
// computeArbitrationMarketValue.
export const ARBITRATION_LEVERAGE_FLOOR = 0.4;
export const ARBITRATION_LEVERAGE_CEILING = 0.9;

// ===== Market value =====

/**
 * The player's real market value, as the arbitrator judges it.
 *
 * **The real payoff of Phase 4.** This reuses engine/contracts.js's own
 * quality curve, but drives the service-time term from REAL accrued
 * `mlbServiceDays` rather than that file's age-based
 * `computeServiceTimeProxyFraction`. contracts.js's header says outright:
 * "Phase 4 is expected to replace this proxy with a real day-accrual
 * signal; not attempted here" — this is the first place it actually
 * happens.
 *
 * Deliberately does NOT retroactively rewrite contracts.js's own proxy:
 * doing so would re-value every existing salary league-wide and invalidate
 * the empirically-calibrated SALARY_FLOOR/LUXURY_TAX_THRESHOLD (see that
 * file's own bimodal-distribution calibration note). Scoped to arbitration
 * only, on purpose.
 *
 * Within the arbitration window a player's leverage rises with service
 * time — a 5-year player commands far more than an otherwise identical
 * 3-year player, which is exactly the real escalation across arb years.
 *
 * **A real calibration bug caught by smoke-testing this against actual
 * simulated state BEFORE wiring it into data/season.js** (the arc's own
 * established discipline, and the same class of finding as §36's bimodal
 * payroll discovery): a first version ramped leverage 0 -> 1 across the
 * window, so a player at exactly 3 years valued at essentially
 * MLB_MIN_SALARY. But these players already carry salaries generated by
 * contracts.js's AGE-based proxy, which is on a completely different
 * scale — so current salary routinely exceeded "market value" and 19.3%
 * of all arbitration-eligible players were non-tendered, several times a
 * realistic rate, gutting rosters every offseason. Porting real
 * arbitration's actual 40%->90% escalation shape (the two constants above)
 * fixes the scale mismatch at its root rather than by tuning the
 * non-tender threshold around a broken valuation.
 * @param {object} player - Player (must carry a real ServiceRecord)
 * @returns {number} whole dollars
 */
export function computeArbitrationMarketValue(player) {
  const quality = playerQualityScore(player);
  const qualityFraction = Math.min(1, Math.max(0, (quality - RATING_SCALE.MIN) / (RATING_SCALE.MAX - RATING_SCALE.MIN)));
  const fullMarketValue = MLB_MIN_SALARY + qualityFraction ** SALARY_QUALITY_EXPONENT * (MLB_MAX_SALARY - MLB_MIN_SALARY);

  // Real accrued service, not age.
  const years = computeServiceYears(player.serviceRecord?.mlbServiceDays ?? 0);
  const windowSpan = FREE_AGENCY_SERVICE_YEARS - ARBITRATION_START_SERVICE_YEARS;
  const windowFraction = Math.min(1, Math.max(0, (years - ARBITRATION_START_SERVICE_YEARS) / windowSpan));
  const leverage = ARBITRATION_LEVERAGE_FLOOR + windowFraction * (ARBITRATION_LEVERAGE_CEILING - ARBITRATION_LEVERAGE_FLOOR);

  return Math.round(MLB_MIN_SALARY + leverage * (fullMarketValue - MLB_MIN_SALARY));
}

// ===== Filings =====

/**
 * Anchored to BOTH the player's current salary and his market value.
 * Anchoring to current salary is not cosmetic — it's what makes
 * arbitration backward-looking, which is in turn what makes non-tender a
 * real mechanic rather than dead code (see shouldNonTender).
 * @param {number} currentSalary
 * @param {number} marketValue
 * @returns {number} whole dollars
 */
export function fileClubFigure(currentSalary, marketValue) {
  return Math.round(Math.max(currentSalary, marketValue * CLUB_FILING_FRACTION));
}

/**
 * @param {number} currentSalary
 * @param {number} marketValue
 * @returns {number} whole dollars — always strictly above the club's figure
 */
export function filePlayerFigure(currentSalary, marketValue) {
  return Math.round(Math.max(currentSalary * PLAYER_MIN_RAISE_FRACTION, marketValue * PLAYER_FILING_FRACTION));
}

// ===== The hearing =====

/**
 * Real file-and-trial: the arbitrator forms his own (noisy) read of the
 * player's value, then awards **whichever filed figure is closer to it**.
 * Never a midpoint, never a blend — that constraint is the mechanic.
 * @param {number} clubFigure
 * @param {number} playerFigure
 * @param {number} marketValue
 * @param {() => number} rng
 * @returns {{winner: 'CLUB'|'PLAYER', awardedSalary: number, arbitratorValue: number}}
 */
export function resolveArbitrationHearing(clubFigure, playerFigure, marketValue, rng) {
  // rng() in [0,1) -> a symmetric +/- ARBITRATOR_VALUATION_NOISE swing.
  const arbitratorValue = marketValue * (1 + (rng() * 2 - 1) * ARBITRATOR_VALUATION_NOISE);
  const clubDistance = Math.abs(arbitratorValue - clubFigure);
  const playerDistance = Math.abs(arbitratorValue - playerFigure);
  // Ties go to the club — an arbitrary but deterministic convention, same
  // spirit as this codebase's existing team-id tiebreaks.
  const winner = playerDistance < clubDistance ? 'PLAYER' : 'CLUB';
  return {
    winner,
    awardedSalary: winner === 'PLAYER' ? playerFigure : clubFigure,
    arbitratorValue: Math.round(arbitratorValue),
  };
}

// ===== Non-tender =====

/**
 * A real, simple heuristic — no front-office AI exists anywhere in this
 * engine (same precedent as engine/optionsWaiversDfa.js's waiver-claim
 * check and engine/freeAgency.js's release-to-make-room rule).
 *
 * Why this triggers on the RIGHT players rather than firing at random:
 * filings are anchored to current salary (sticky, backward-looking — a
 * figure earned by past performance), while market value is driven by
 * CURRENT quality (forward-looking). So the players who fail this test are
 * precisely declining veterans still being paid for what they used to be —
 * the real-world non-tender case, emerging from the mechanics rather than
 * being special-cased.
 * @param {number} projectedSalary
 * @param {number} marketValue
 */
export function shouldNonTender(projectedSalary, marketValue) {
  return projectedSalary > marketValue * NON_TENDER_VALUE_RATIO;
}

// ===== Season-boundary sweep =====

/**
 * Walks every team's active roster, finds each arbitration-eligible player
 * (engine/serviceTime.js's existing isArbitrationEligible — the [3, 6)
 * window), and either non-tenders him into the free-agent pool or runs a
 * real hearing and writes the awarded figure onto his contract.
 *
 * A satisfying knock-on effect worth naming: CLAUDE.md §28 flagged that
 * `establishedFreeAgentPoolById` is closed-loop and shrinks fast (130 -> 16
 * over 15 seasons in validate:freeagency's own run) because real free
 * agency's actual source — players reaching the open market — had no analog
 * here. Non-tenders are exactly that missing source, so this sweep
 * partially closes a limitation flagged two arcs ago.
 *
 * **A non-tender always fills the vacated roster spot via a real call-up**
 * (engine/minorLeagues.js's promoteAndBackfill — the exact AAA->MLB
 * cascade retiree replacement already uses). This is not defensive
 * padding: an early version simply dropped the player and left the hole,
 * and a real 5-season run crashed with `Cannot read properties of
 * undefined (reading 'ratings')` deep in game-side construction once a
 * roster section drained empty — the *identical* depletion bug Phase 1 hit
 * and recorded (CLAUDE.md §34: "any change that removes an item from a
 * finite, shared, season-persistent pool needs a multi-season stress
 * test... depletion bugs are silent for several iterations before they
 * crash"). If no replacement can be found at all, **the club keeps the
 * player rather than non-tendering him** — realistic on its own terms (no
 * club cuts someone it has nobody to replace with) and structurally
 * incapable of reintroducing the bug.
 *
 * Mutates `rosterByTeamId`, `establishedFreeAgentPoolById`, and
 * `affiliateRosterByClubId` in place, same ownership contract as every
 * other season-boundary sweep this arc has added (assignMissingContracts,
 * advanceServiceTime).
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} establishedFreeAgentPoolById
 * @param {Map<string, object>} teamsById - needed only to hand promoteAndBackfill a real team object
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{hearings: object[], nonTenders: object[]}}
 */
export function runArbitrationAndTenderSweep(rosterByTeamId, establishedFreeAgentPoolById, teamsById, affiliateRosterByClubId, rng, asOfDate) {
  const hearings = [];
  const nonTenders = [];

  for (const [teamId, roster] of rosterByTeamId) {
    const updated = { ...roster };

    for (const sectionKey of ROSTER_SECTIONS) {
      const kept = [];

      for (const player of roster[sectionKey]) {
        if (!player.serviceRecord || !player.contract || !isArbitrationEligible(player.serviceRecord)) {
          kept.push(player);
          continue;
        }

        const currentSalary = player.contract.annualSalary;
        const marketValue = computeArbitrationMarketValue(player);
        const clubFigure = fileClubFigure(currentSalary, marketValue);
        const playerFigure = filePlayerFigure(currentSalary, marketValue);
        // What the club can reasonably expect to pay before the hearing
        // actually happens — the midpoint of the two filings. Used ONLY for
        // the tender decision; the hearing itself never awards a midpoint.
        const projectedSalary = (clubFigure + playerFigure) / 2;

        if (shouldNonTender(projectedSalary, marketValue)) {
          // Find the replacement FIRST — see this function's own doc
          // comment for the real crash that made this mandatory.
          const team = teamsById?.get(teamId);
          const replacement = team && affiliateRosterByClubId
            ? promoteAndBackfill(team, player.primaryPosition, affiliateRosterByClubId, rng, asOfDate)
            : null;

          if (replacement) {
            nonTenders.push({
              playerId: player.id,
              teamId,
              firstName: player.firstName,
              lastName: player.lastName,
              primaryPosition: player.primaryPosition,
              previousSalary: currentSalary,
              marketValue,
              replacementPlayerId: replacement.id,
            });
            establishedFreeAgentPoolById.set(player.id, { ...player, teamId: null });
            kept.push(replacement);
            continue;
          }
          // No call-up available anywhere in the system — the club keeps
          // him rather than leaving a hole it can't fill. Falls through to
          // a normal hearing below.
        }

        const result = resolveArbitrationHearing(clubFigure, playerFigure, marketValue, rng);
        hearings.push({
          playerId: player.id,
          teamId,
          firstName: player.firstName,
          lastName: player.lastName,
          primaryPosition: player.primaryPosition,
          previousSalary: currentSalary,
          clubFigure,
          playerFigure,
          winner: result.winner,
          awardedSalary: result.awardedSalary,
        });
        kept.push({ ...player, contract: { ...player.contract, annualSalary: result.awardedSalary } });
      }

      updated[sectionKey] = kept;
    }

    rosterByTeamId.set(teamId, updated);
  }

  return { hearings, nonTenders };
}
