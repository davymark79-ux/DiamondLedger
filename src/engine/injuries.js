// Injury risk, placement, and recovery — injuries.md's risk formula
// (base_rate x position_multiplier x age_multiplier x durability_modifier x
// fatigue_multiplier[pitchers only]) plus this engine's own design for the
// parts the doc leaves open: an in-game trigger moment, and real recovery-
// timeline variance (setbacks). Only the batter and the pitcher get a roll
// each plate appearance — the other 7 fielders and any non-batting
// baserunners aren't eligible, since this engine has no fielding-event or
// baserunning-event attribution to hook a realistic risk into (matches the
// already-documented "no defense modeled" limitation elsewhere). Fielding
// injuries and a "plays hurt at reduced performance" state are real,
// intentionally-flagged future work, not attempted here.
//
// Every numeric constant below is an explicit placeholder — same tuning
// status as everything else in this engine — validated for *direction*
// (durability lowers risk, age/fatigue raise it) in validate-injuries.mjs,
// not tuned against a real-world injury rate.

import { getAge } from '../models/Player.js';
import { computeFatiguePenalty } from './pitcherFatigue.js';
import { computeFatigueRiskMultiplier as computePositionPlayerFatigueMultiplier } from './positionPlayerFatigue.js';
import { randomInt, pickWeighted, pick } from '../models/generation/random.js';
import { RATING_SCALE, INJURY_SEVERITIES, PITCHER_INJURY_TYPES, POSITION_PLAYER_INJURY_TYPES } from '../models/constants.js';

// Per-plate-appearance (batters) / per-pitch (pitchers) base chance, before
// multipliers — pitchers are checked far more often per game (~100+
// pitches vs. ~4-5 PAs), so this is deliberately much smaller than the
// batter rate; the position_multiplier below is what actually makes
// pitchers the highest-risk group overall, matching injuries.md's real
// 2011-2016 injury-burden data (pitchers 39.1% of total burden).
const BASE_INJURY_RISK_PER_PA = 0.0008;
const BASE_INJURY_RISK_PER_PITCH = 0.00015;

// Relative risk by position, shaped from injuries.md's real injury-burden
// data (pitchers highest by a wide margin, IF/OF roughly comparable, C
// lower frequency, DH lowest) — not the fuller catcher-specific severity-
// profile nuance the doc also wants eventually (deferred).
const POSITION_INJURY_MULTIPLIER = Object.freeze({
  SP: 1.8, RP: 1.8,
  C: 0.9,
  '1B': 1.3, '2B': 1.3, '3B': 1.3, SS: 1.3,
  LF: 1.2, CF: 1.2, RF: 1.2,
  DH: 0.3,
});

const AGE_RISK_PER_YEAR_OVER_30 = 0.03;

// Durability (20-80) modifier — its first real mechanical use anywhere in
// this engine. Centered at population-average (50) = neutral (1.0); an
// elite-durability player's risk is meaningfully lower, a fragile one's
// meaningfully higher.
function durabilityModifier(durability) {
  const raw = 2 - durability / (RATING_SCALE.AVERAGE);
  return Math.min(1.8, Math.max(0.4, raw));
}

// Reuses pitcherFatigue.js's existing fatigue-penalty computation (0-28
// rating points) directly rather than reinventing pitcher tiredness —
// injuries.md's real anchoring data point (recent high-workload MLB
// pitchers averaging ~143-161 days to first injury in a season) is exactly
// the "fatigue compounds injury risk" relationship this reuses.
const FATIGUE_RISK_SCALE = 0.06;

function pitcherFatigueMultiplier(pitcher, pitchesThrownSoFar) {
  const fatiguePenalty = computeFatiguePenalty(pitcher.ratings.stamina.current, pitchesThrownSoFar);
  return 1 + fatiguePenalty * FATIGUE_RISK_SCALE;
}

/**
 * @param {object} player - Player
 * @param {object} [options]
 * @param {boolean} [options.isPitcher]
 * @param {number} [options.pitchesThrownSoFar] - this pitcher's own cumulative pitch count this game
 * @param {number} [options.consecutiveGamesPlayed] - position players only, see positionPlayerFatigue.js
 * @returns {number} probability [0, 1) of an injury this PA/pitch
 */
export function computeInjuryRisk(player, { isPitcher = player.isPitcher, pitchesThrownSoFar = 0, consecutiveGamesPlayed = 0 } = {}) {
  const positionMultiplier = POSITION_INJURY_MULTIPLIER[player.primaryPosition] ?? 1;
  const age = getAge(player) ?? 27;
  const ageMultiplier = 1 + Math.max(0, age - 30) * AGE_RISK_PER_YEAR_OVER_30;
  const durability = player.ratings.durability?.current ?? RATING_SCALE.AVERAGE;
  const fatigueMultiplier = isPitcher
    ? pitcherFatigueMultiplier(player, pitchesThrownSoFar)
    : computePositionPlayerFatigueMultiplier(consecutiveGamesPlayed);
  const baseRate = isPitcher ? BASE_INJURY_RISK_PER_PITCH : BASE_INJURY_RISK_PER_PA;

  return baseRate * positionMultiplier * ageMultiplier * durabilityModifier(durability) * fatigueMultiplier;
}

// Weighted so day-to-day dominates and career-ending is extremely rare, per
// injuries.md's explicit ordering ("confirmed ON by default, very rare").
const SEVERITY_WEIGHTS = Object.freeze([
  { value: INJURY_SEVERITIES.DAY_TO_DAY, weight: 70 },
  { value: INJURY_SEVERITIES.SHORT_TERM_IL, weight: 20 },
  { value: INJURY_SEVERITIES.LONG_TERM_IL, weight: 7 },
  { value: INJURY_SEVERITIES.SEASON_ENDING, weight: 2.5 },
  { value: INJURY_SEVERITIES.CAREER_ENDING, weight: 0.5 },
]);

// Order matters — setback escalation (maybeEscalateInjury) only ever moves
// forward through this list, and is capped at SEASON_ENDING (index -2);
// CAREER_ENDING is deliberately unreachable via a setback, only via the
// initial roll above.
const SEVERITY_ORDER = Object.freeze([
  INJURY_SEVERITIES.DAY_TO_DAY,
  INJURY_SEVERITIES.SHORT_TERM_IL,
  INJURY_SEVERITIES.LONG_TERM_IL,
  INJURY_SEVERITIES.SEASON_ENDING,
  INJURY_SEVERITIES.CAREER_ENDING,
]);
const MAX_SETBACK_DESTINATION_INDEX = SEVERITY_ORDER.indexOf(INJURY_SEVERITIES.SEASON_ENDING);

const DAY_TO_DAY_GAMES_RANGE = [1, 4];
// Hard floors matching the real 10-day/60-day IL structure — see file
// header and Player.js's `injury.gamesRemaining` doc comment. SEASON_ENDING
// and CAREER_ENDING use Infinity rather than a precomputed count, since
// only the season loop (which owns the schedule) knows how many games are
// actually left — "never becomes eligible again this loop" is exactly what
// gamesRemaining > 0 staying permanently true expresses.
export const INJURY_SEVERITY_MINIMUM_GAMES = Object.freeze({
  [INJURY_SEVERITIES.DAY_TO_DAY]: null, // rolls DAY_TO_DAY_GAMES_RANGE instead of a fixed floor
  [INJURY_SEVERITIES.SHORT_TERM_IL]: 10,
  [INJURY_SEVERITIES.LONG_TERM_IL]: 60,
  [INJURY_SEVERITIES.SEASON_ENDING]: Infinity,
  [INJURY_SEVERITIES.CAREER_ENDING]: Infinity,
});

function initialGamesRemaining(severity, rng) {
  if (severity === INJURY_SEVERITIES.DAY_TO_DAY) return randomInt(rng, ...DAY_TO_DAY_GAMES_RANGE);
  return INJURY_SEVERITY_MINIMUM_GAMES[severity];
}

function pickInjuryType(player, rng) {
  return pick(rng, player.isPitcher ? PITCHER_INJURY_TYPES : POSITION_PLAYER_INJURY_TYPES);
}

/**
 * Called once an injury roll has already hit (see computeInjuryRisk) — rolls
 * which injury it actually is. `gameNumber` is optional and left null by
 * default — game.js (which calls this) has no notion of "which game in a
 * season this is"; the season loop fills it in when it ingests a newly-
 * reported injury from a box score, since only it knows the schedule index.
 * @param {object} player - Player
 * @param {() => number} rng
 * @param {number|null} [gameNumber] - schedule index this injury was sustained on
 * @returns {{type: string, severity: string, gamesRemaining: number, sustainedGameNumber: number|null}}
 */
export function rollInjury(player, rng, gameNumber = null) {
  const severity = pickWeighted(rng, SEVERITY_WEIGHTS);
  return {
    type: pickInjuryType(player, rng),
    severity,
    gamesRemaining: initialGamesRemaining(severity, rng),
    sustainedGameNumber: gameNumber,
  };
}

const SETBACK_CHANCE = 0.03; // per eligible game-check, placeholder
const MAJOR_SETBACK_SHARE = 0.15; // fraction of setbacks that escalate further
// Setback rolls only happen in the games shortly after a diagnosis (initial
// or a prior escalation) — deliberately NOT a flat per-game hazard for the
// injury's entire duration. A flat hazard compounds with how long the floor
// is: at 3%/check, a 60-game LONG_TERM_IL floor would see a setback ~84% of
// the time (1-0.97^60), which reads as "almost every long injury gets
// worse," not "some players have setbacks" — the actual ask. Bounding the
// window decouples setback risk from tier duration, matching the real
// framing better: a follow-up reveals the injury is worse than first
// thought, not a fresh re-injury roll every single day of a rehab stint.
const SETBACK_WINDOW_GAMES = 3;

/**
 * Called once per game the injured player's team plays while
 * `injury.gamesRemaining > 0` — models real recovery-timeline variance
 * ("a supposed elbow strain turns into a UCL tear"): within
 * SETBACK_WINDOW_GAMES of the diagnosis (or a prior escalation), a small
 * chance escalates to a more severe tier instead, resetting the countdown
 * to that tier's own floor (a rarer "major setback" jumps further) —
 * otherwise just decrements the countdown. Never decreases gamesRemaining
 * below the current tier's floor, and escalation never moves backward to a
 * less severe tier.
 * @param {object} injury - from rollInjury() or a prior maybeEscalateInjury()
 * @param {() => number} rng
 * @returns {object} the updated injury (new object, not mutated in place)
 */
export function maybeEscalateInjury(injury, rng) {
  if (!Number.isFinite(injury.gamesRemaining)) return injury; // already season-ending/career-ending

  const floor = INJURY_SEVERITY_MINIMUM_GAMES[injury.severity];
  const gamesSinceDiagnosis = Number.isFinite(floor) ? floor - injury.gamesRemaining : 0;
  const withinSetbackWindow = gamesSinceDiagnosis < SETBACK_WINDOW_GAMES;

  if (withinSetbackWindow && rng() < SETBACK_CHANCE) {
    const isMajor = rng() < MAJOR_SETBACK_SHARE;
    const currentIndex = SEVERITY_ORDER.indexOf(injury.severity);
    const newIndex = Math.min(currentIndex + (isMajor ? 2 : 1), MAX_SETBACK_DESTINATION_INDEX);
    const newSeverity = SEVERITY_ORDER[newIndex];
    return {
      ...injury,
      severity: newSeverity,
      gamesRemaining: Math.max(injury.gamesRemaining, initialGamesRemaining(newSeverity, rng)),
    };
  }

  return { ...injury, gamesRemaining: Math.max(0, injury.gamesRemaining - 1) };
}
