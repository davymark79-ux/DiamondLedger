// Batting/pitching box-score line tracking — baseball-sim-design-doc.md's
// Sim Engine: "Output: aggregated box scores, not play-by-play detail."

import { PA_OUTCOMES } from './plateAppearanceConstants.js';

/** @param {object} player - Player */
export function createBattingLine(player) {
  return {
    player, pa: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, k: 0, gidp: 0,
    sb: 0, cs: 0, sh: 0,
    // Risp = runners in scoring position (2nd and/or 3rd occupied) at the
    // start of the PA — derived honestly from the existing base-state the
    // sim already tracks, not a separate simulated mechanic.
    risp: { ab: 0, h: 0 },
  };
}

/**
 * @param {object} player - Player
 * @param {object} [entryContext] - when/how this pitcher entered the game,
 *   needed for W/L/S attribution (see pitcherDecisions.js). Null for both
 *   when the caller doesn't track a live game (e.g. standalone scripts).
 * @param {number} [entryContext.entryInning]
 * @param {number} [entryContext.entryLeadMargin] - his own team's score minus the opponent's, at the moment he entered
 */
export function createPitchingLine(player, { entryInning = null, entryLeadMargin = null } = {}) {
  return {
    player, battersFaced: 0, outsRecorded: 0, pitches: 0, h: 0, r: 0, er: 0, bb: 0, hbp: 0, k: 0, hr: 0,
    entryInning, entryLeadMargin,
  };
}

const COUNTS_AS_AT_BAT = new Set([
  PA_OUTCOMES.STRIKEOUT,
  PA_OUTCOMES.OUT,
  PA_OUTCOMES.SINGLE,
  PA_OUTCOMES.DOUBLE,
  PA_OUTCOMES.TRIPLE,
  PA_OUTCOMES.HOME_RUN,
]);

/**
 * Updates a batting line and its opposing pitching line for one resolved PA.
 * Does not credit individual runs scored (see recordRun) since a play can
 * score runners who aren't the batter.
 * @param {object} battingLine - from createBattingLine()
 * @param {object} pitchingLine - from createPitchingLine()
 * @param {string} outcome - PA_OUTCOMES
 * @param {{scorers: object[], isSacFly: boolean, isDoublePlay: boolean, isSacrificeBunt?: boolean, isError?: boolean}} baserunningResult - from resolveBaserunning(), engine/bunting.js's maybeAttemptBunt, or engine/fielding.js's error path
 * @param {boolean} [hadRisp] - runners in scoring position before this PA resolved
 */
export function recordPlateAppearance(battingLine, pitchingLine, outcome, baserunningResult, hadRisp = false) {
  battingLine.pa += 1;
  pitchingLine.battersFaced += 1;

  const isAtBat = COUNTS_AS_AT_BAT.has(outcome) && !baserunningResult.isSacFly && !baserunningResult.isSacrificeBunt;
  if (isAtBat) {
    battingLine.ab += 1;
    if (hadRisp) battingLine.risp.ab += 1;
  }

  if (baserunningResult.isDoublePlay) battingLine.gidp += 1;
  // Sacrifice credit only applies when the bunt actually succeeds — a
  // failed attempt (bunting.js's PLAIN or SQUEEZE failure path) is just a
  // normal recorded AB/out, matching real MLB rules.
  if (baserunningResult.isSacrificeBunt) battingLine.sh += 1;

  switch (outcome) {
    case PA_OUTCOMES.STRIKEOUT:
      battingLine.k += 1;
      pitchingLine.k += 1;
      break;
    case PA_OUTCOMES.WALK:
      battingLine.bb += 1;
      pitchingLine.bb += 1;
      break;
    case PA_OUTCOMES.HIT_BY_PITCH:
      battingLine.hbp += 1;
      pitchingLine.hbp += 1;
      break;
    case PA_OUTCOMES.SINGLE:
      battingLine.h += 1;
      pitchingLine.h += 1;
      break;
    case PA_OUTCOMES.DOUBLE:
      battingLine.h += 1;
      battingLine.doubles += 1;
      pitchingLine.h += 1;
      break;
    case PA_OUTCOMES.TRIPLE:
      battingLine.h += 1;
      battingLine.triples += 1;
      pitchingLine.h += 1;
      break;
    case PA_OUTCOMES.HOME_RUN:
      battingLine.h += 1;
      battingLine.hr += 1;
      pitchingLine.h += 1;
      pitchingLine.hr += 1;
      break;
    case PA_OUTCOMES.OUT:
      break;
    default:
      throw new Error(`Unknown PA outcome: ${outcome}`);
  }

  const isHit = outcome === PA_OUTCOMES.SINGLE || outcome === PA_OUTCOMES.DOUBLE
    || outcome === PA_OUTCOMES.TRIPLE || outcome === PA_OUTCOMES.HOME_RUN;
  if (hadRisp && isHit) battingLine.risp.h += 1;

  const runsOnPlay = baserunningResult.scorers.length;
  if (runsOnPlay > 0) {
    // No RBI credited on a run that scores via the same play as a fielding
    // error (engine/fielding.js) — a real, well-known MLB scoring rule.
    if (!baserunningResult.isError) battingLine.rbi += runsOnPlay;
    pitchingLine.r += runsOnPlay;
    // Simplified same-play-only unearned-run rule: a run scoring on the
    // exact play a fielding error occurred on isn't earned. A runner who
    // reached on an *earlier* error but scores later via a separate clean
    // play is still counted earned in this v1 model — a deliberate,
    // flagged simplification short of full inning-reconstruction logic.
    if (!baserunningResult.isError) pitchingLine.er += runsOnPlay;
  }
}

/** @param {object} battingLineForScorer - the specific runner's line, from createBattingLine() */
export function recordRun(battingLineForScorer) {
  battingLineForScorer.r += 1;
}

/**
 * Credits a stolen-base attempt to the *runner's own* batting line — not
 * necessarily the current batter's, since a steal happens mid-PA (see
 * engine/stolenBases.js).
 * @param {object} battingLineForRunner - the runner's own line, from createBattingLine()
 * @param {boolean} wasSuccessful
 */
export function recordStolenBaseAttempt(battingLineForRunner, wasSuccessful) {
  if (wasSuccessful) battingLineForRunner.sb += 1;
  else battingLineForRunner.cs += 1;
}

/** @param {number} outsRecorded */
export function formatInningsPitched(outsRecorded) {
  const fullInnings = Math.floor(outsRecorded / 3);
  const remainder = outsRecorded % 3;
  return `${fullInnings}.${remainder}`;
}
