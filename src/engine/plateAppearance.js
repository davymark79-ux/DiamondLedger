// Core plate-appearance outcome resolver — baseball-sim-design-doc.md's Sim
// Engine section: "plate-appearance level... batter/pitcher ratings + matchup
// modifiers produce an outcome from a probability table."
//
// Deliberately does NOT read a player's streakState: Hot/Cold Streaks are a
// purely descriptive readout in player-attributes-and-development.md ("It
// doesn't cause a player to play better or worse"), not a forward-feeding
// performance modifier. In-game performance variance instead comes from the
// separate Work-Ethic-x-Talent consistency mechanic (see consistency.js),
// applied by the caller before this function runs, not from here.
//
// Scope: resolves one isolated batter-vs-pitcher PA to an outcome. Does not
// model baserunners, defense/errors, sac flies, or pitcher fatigue — those
// belong to the future game-loop layer built on top of this.
//
// Platoon/handedness splits (see platoonShift()) are wired in here as a
// rating-point-equivalent shift added into the existing skill-diff
// calculations — batter.bats/pitcher.throws plus the batter's own
// Platoon Skill rating, previously purely cosmetic fields, now genuinely
// affect outcome probabilities.

import { RATING_SCALE } from '../models/constants.js';
import {
  PA_OUTCOMES,
  BASE_RATES,
  BASE_BABIP,
  BASE_HIT_SPLIT,
  SENSITIVITY,
  PROBABILITY_FLOOR,
  PROBABILITY_CEILING,
  MIN_SINGLE_SHARE_OF_HITS,
  PLATOON_SHIFTS,
  PLATOON_SKILL_SCALE_SENSITIVITY,
  NO_DOUBLES_SINGLE_SHIFT,
} from './plateAppearanceConstants.js';

function clampProbability(p) {
  return Math.min(PROBABILITY_CEILING, Math.max(PROBABILITY_FLOOR, p));
}

function pitcherStuff(pitcher) {
  return (pitcher.ratings.velocity.current + pitcher.ratings.movement.current) / 2;
}

// Switch-hitters always take the platoon advantage, batting opposite the
// pitcher's throwing hand — real switch-hitting's whole point.
export function effectiveBattingSide(batter, pitcherThrows) {
  if (batter.bats !== 'S') return batter.bats;
  return pitcherThrows === 'R' ? 'L' : 'R';
}

// Platoon/handedness split (plateAppearanceConstants.js's PLATOON_SHIFTS) —
// a rating-point-equivalent shift, positive when the *batter* has the
// platoon advantage, negative when disadvantaged. Scaled per-player by the
// batter's own Platoon Skill (models/constants.js's MAKEUP_ATTRIBUTES): see
// PLATOON_SKILL_SCALE_SENSITIVITY's own header comment for the compress/
// exaggerate/rare-reverse-split shape.
//
// A pitcher with no assigned throwing hand (e.g. hotColdStreaks.js's
// context-neutral LEAGUE_AVERAGE_PITCHER reference) is treated as
// handedness-neutral — zero shift — rather than crashing or silently
// producing NaN; that's also the semantically correct reading, since a
// "league average" reference opponent shouldn't carry a specific platoon
// edge either way.
// Exported for reuse by hitterChanges.js's manager-driven Platoon Tendency
// pinch-hit logic — the same signed, rating-point-equivalent platoon
// advantage/disadvantage value, not a separate reimplementation.
export function platoonShift(batter, pitcher) {
  if (pitcher.throws !== 'R' && pitcher.throws !== 'L') return 0;
  const battingSide = effectiveBattingSide(batter, pitcher.throws);
  const baseShift = PLATOON_SHIFTS[`${battingSide}_vs_${pitcher.throws}`];
  const scaleFactor = 1 - (batter.ratings.platoonSkill.current - RATING_SCALE.AVERAGE) * PLATOON_SKILL_SCALE_SENSITIVITY;
  return baseShift * scaleFactor;
}

// NOTE: this diff is oriented pitcher-minus-batter (higher = worse for the
// batter) — the opposite orientation of the other three rate functions
// below — so platoonShift (positive = good for the batter) is *subtracted*
// here, not added. Getting this backwards would give a platoon-advantaged
// batter *more* strikeouts, which validate:sim's directional asserts guard against.
function computeStrikeoutRate(batter, pitcher) {
  const diff = pitcherStuff(pitcher) - batter.ratings.contact.current - platoonShift(batter, pitcher);
  return clampProbability(BASE_RATES.strikeout + diff * SENSITIVITY.strikeout);
}

function computeWalkRate(batter, pitcher) {
  const diff = batter.ratings.eye.current - pitcher.ratings.control.current + platoonShift(batter, pitcher);
  return clampProbability(BASE_RATES.walk + diff * SENSITIVITY.walk);
}

function computeHomeRunRate(batter, pitcher) {
  const diff = batter.ratings.power.current - pitcher.ratings.movement.current + platoonShift(batter, pitcher);
  return clampProbability(BASE_RATES.homeRun + diff * SENSITIVITY.homeRun);
}

// defenseComposite is engine/fielding.js's team defense composite —
// above-average defense lowers BABIP (converts more balls in play into
// outs), below-average raises it. Deliberately BABIP-only: defense doesn't
// affect strikeouts, walks, or home runs in reality either.
function computeBabip(batter, pitcher, defenseComposite) {
  const contactDiff = batter.ratings.contact.current - pitcher.ratings.movement.current + platoonShift(batter, pitcher);
  const speedBonus = (batter.ratings.speed.current - RATING_SCALE.AVERAGE) * SENSITIVITY.speedBabipBonus;
  const defenseAdjustment = (RATING_SCALE.AVERAGE - defenseComposite) * SENSITIVITY.defense;
  return clampProbability(BASE_BABIP + contactDiff * SENSITIVITY.babip + speedBonus + defenseAdjustment);
}

// noDoublesActive is engine/fielding.js's isNoDoublesActive() — defense
// playing deep late with a lead, trading extra-base hits for more bloop
// singles falling in.
function computeHitSplit(batter, noDoublesActive) {
  const powerShift = (batter.ratings.power.current - RATING_SCALE.AVERAGE) * SENSITIVITY.extraBaseShift;
  const speedShift = (batter.ratings.speed.current - RATING_SCALE.AVERAGE) * SENSITIVITY.speedExtraBaseShift;
  const noDoublesShift = noDoublesActive ? NO_DOUBLES_SINGLE_SHIFT : 0;

  let double_ = Math.max(0.02, BASE_HIT_SPLIT.double + powerShift + speedShift - noDoublesShift);
  let triple_ = Math.max(0.005, BASE_HIT_SPLIT.triple + speedShift);

  let single_ = 1 - double_ - triple_;
  if (single_ < MIN_SINGLE_SHARE_OF_HITS) {
    const scale = (1 - MIN_SINGLE_SHARE_OF_HITS) / (double_ + triple_);
    double_ *= scale;
    triple_ *= scale;
    single_ = MIN_SINGLE_SHARE_OF_HITS;
  }

  return { single: single_, double: double_, triple: triple_ };
}

/**
 * Computes the final outcome-share distribution for a batter/pitcher
 * matchup — extracted from resolvePlateAppearance() so other callers (see
 * hotColdStreaks.js's context-neutral baseline) can get at the probability
 * distribution itself without needing to roll an actual outcome.
 * @param {object} batter - Player (uses ratings.contact/power/eye/speed/platoonSkill.current, bats)
 * @param {object} pitcher - Player (uses ratings.velocity/control/movement.current, throws)
 * @param {object} [defenseContext]
 * @param {number} [defenseContext.composite] - engine/fielding.js's computeTeamDefenseComposite(); defaults to RATING_SCALE.AVERAGE (neutral, matches every existing caller's prior behavior)
 * @param {boolean} [defenseContext.noDoublesActive] - engine/fielding.js's isNoDoublesActive(); defaults false
 * @returns {Object.<string, number>} share per PA_OUTCOMES key, summing to 1
 */
export function computeOutcomeProbabilities(batter, pitcher, { composite = RATING_SCALE.AVERAGE, noDoublesActive = false } = {}) {
  const kRate = computeStrikeoutRate(batter, pitcher);
  const bbRate = computeWalkRate(batter, pitcher);
  const hbpRate = BASE_RATES.hitByPitch;
  const hrRate = computeHomeRunRate(batter, pitcher);

  // If an extreme matchup pushes these four past ~97%, scale them down
  // proportionally rather than let the ball-in-play share go negative.
  const discreteTotal = kRate + bbRate + hbpRate + hrRate;
  const scale = discreteTotal > 0.97 ? 0.97 / discreteTotal : 1;
  const k = kRate * scale;
  const bb = bbRate * scale;
  const hbp = hbpRate * scale;
  const hr = hrRate * scale;

  const ballInPlayShare = 1 - k - bb - hbp - hr;
  const babip = computeBabip(batter, pitcher, composite);
  const hitOnBipShare = ballInPlayShare * babip;
  const outShare = ballInPlayShare - hitOnBipShare;

  const hitSplit = computeHitSplit(batter, noDoublesActive);
  const singleShare = hitOnBipShare * hitSplit.single;
  const doubleShare = hitOnBipShare * hitSplit.double;
  const tripleShare = hitOnBipShare * hitSplit.triple;

  return {
    [PA_OUTCOMES.STRIKEOUT]: k,
    [PA_OUTCOMES.WALK]: bb,
    [PA_OUTCOMES.HIT_BY_PITCH]: hbp,
    [PA_OUTCOMES.HOME_RUN]: hr,
    [PA_OUTCOMES.OUT]: outShare,
    [PA_OUTCOMES.SINGLE]: singleShare,
    [PA_OUTCOMES.DOUBLE]: doubleShare,
    [PA_OUTCOMES.TRIPLE]: tripleShare,
  };
}

/**
 * @param {object} batter - Player (uses ratings.contact/power/eye/speed/platoonSkill.current, bats)
 * @param {object} pitcher - Player (uses ratings.velocity/control/movement.current, throws)
 * @param {() => number} rng - uniform [0,1) RNG, e.g. from createRng()
 * @param {object} [defenseContext] - see computeOutcomeProbabilities()
 * @returns {string} one of PA_OUTCOMES
 */
export function resolvePlateAppearance(batter, pitcher, rng, defenseContext) {
  const probabilities = computeOutcomeProbabilities(batter, pitcher, defenseContext);

  const roll = rng();
  let acc = 0;
  for (const [outcome, share] of Object.entries(probabilities)) {
    acc += share;
    if (roll < acc) return outcome;
  }
  return PA_OUTCOMES.OUT; // floating-point fallback, should be unreachable
}
