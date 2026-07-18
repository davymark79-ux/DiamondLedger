// Baserunner advancement given a resolved PA outcome — layered on top of
// resolvePlateAppearance(), which only decides the batter's own outcome.
// Base-state logic isn't separately specced in the design docs; this is the
// game loop's own addition.
//
// Deliberate v1 simplifications, flagged rather than hidden:
// - Hits use a "flat" advancement model — every existing runner and the
//   batter advances exactly as many bases as the hit type, with no
//   send/hold decision-making. Speed/baserunning-instincts already feed the
//   PA engine's hit-type distribution; they don't additionally affect
//   advancement here yet.
// - Walks/HBP use standard forced-advancement-only rules.
// - Outs are split into a groundball/flyball coin flip so double plays and
//   sacrifice flies can happen. Multi-runner groundball situations beyond
//   "runner on first alone" / "runner on third" are left unresolved (both
//   runners hold) rather than modeling every real fielder's-choice
//   permutation.
// - Errors (engine/fielding.js) are resolved by the caller (game.js) before
//   ever reaching resolveBaserunning — see resolveReachedOnError below —
//   not woven into this dispatcher's own outcome switch.

import { RATING_SCALE } from '../models/constants.js';
import { PA_OUTCOMES } from './plateAppearanceConstants.js';

const GROUNDBALL_SHARE = 0.55;
const BASE_DOUBLE_PLAY_CHANCE = 0.4;
const SAC_FLY_CHANCE = 0.5;
// engine/fielding.js's team defense composite nudges the existing
// double-play-chance formula — "double-play depth" from the Defensive
// Management slider description turns out to be a direct extension of an
// already-existing mechanic, not a new decision layer.
const DP_DEFENSE_SENSITIVITY = 0.002;
// Infield-in (engine/fielding.js's isInfieldInActive()) — real success rate
// for throwing out a runner at the plate instead of the batter at first;
// deliberately not routine, a genuine gamble. Illustrative placeholder.
const INFIELD_IN_BASE_SUCCESS_RATE = 0.45;
const INFIELD_IN_DEFENSE_SENSITIVITY = 0.003;

function forceAdvance(bases, batter) {
  const { first, second, third } = bases;
  const scorers = [];
  let newSecond = second;
  let newThird = third;

  if (first) {
    if (second) {
      if (third) scorers.push(third);
      newThird = second;
    } else {
      newThird = third;
    }
    newSecond = first;
  }

  return { bases: { first: batter, second: newSecond, third: newThird }, scorers };
}

function advanceOnHit(bases, batter, numBases) {
  const existing = [bases.first, bases.second, bases.third];
  const scorers = [];
  const newPositions = [null, null, null];

  existing.forEach((runner, idx) => {
    if (!runner) return;
    const newPos = idx + 1 + numBases;
    if (newPos >= 4) scorers.push(runner);
    else newPositions[newPos - 1] = runner;
  });

  const batterNewPos = numBases;
  if (batterNewPos >= 4) scorers.push(batter);
  else newPositions[batterNewPos - 1] = batter;

  return {
    bases: { first: newPositions[0], second: newPositions[1], third: newPositions[2] },
    scorers,
  };
}

/**
 * Sacrifice-bunt advancement (engine/bunting.js) — every existing runner
 * advances exactly one base (reusing advanceOnHit's existing "shift
 * everyone forward, bases-loaded force-in-a-run included" logic), but the
 * batter himself does *not* reach base — he's out on the sacrifice, unlike
 * advanceOnHit's hit-ball callers where the batter is safe at first.
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @param {object} batter - Player (only used to identify/exclude his own placement)
 * @returns {{bases: object, scorers: object[]}}
 */
export function resolveSacrificeBunt(bases, batter) {
  const { bases: hitBases, scorers } = advanceOnHit(bases, batter, 1);
  return { bases: { ...hitBases, first: null }, scorers };
}

/**
 * A fielding error (engine/fielding.js) — the batter reaches first safely
 * and existing runners advance exactly as they would on a single (reusing
 * advanceOnHit directly, no override this time: unlike a sacrifice bunt,
 * the batter genuinely reaches base on an error).
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @param {object} batter - Player
 * @returns {{bases: object, scorers: object[]}}
 */
export function resolveReachedOnError(bases, batter) {
  return advanceOnHit(bases, batter, 1);
}

function rollDoublePlayChance(batterSpeed, defenseComposite, rng) {
  // Batter speed lowers the chance (a fast runner beats the relay); team
  // defense RAISES it (better fielders turn two more often) — opposite
  // signs, not the same subtraction repeated.
  const chance = BASE_DOUBLE_PLAY_CHANCE - (batterSpeed - 50) * 0.003 + (defenseComposite - RATING_SCALE.AVERAGE) * DP_DEFENSE_SENSITIVITY;
  return rng() < Math.min(0.6, Math.max(0.1, chance));
}

function rollInfieldInSuccess(defenseComposite, rng) {
  const chance = INFIELD_IN_BASE_SUCCESS_RATE + (defenseComposite - RATING_SCALE.AVERAGE) * INFIELD_IN_DEFENSE_SENSITIVITY;
  return rng() < Math.min(0.9, Math.max(0.1, chance));
}

function resolveOut(bases, outs, batter, rng, defenseComposite, infieldInActive) {
  const isGroundball = rng() < GROUNDBALL_SHARE;

  if (isGroundball) {
    if (bases.first && outs < 2 && rollDoublePlayChance(batter.ratings.speed.current, defenseComposite, rng)) {
      return {
        bases: { first: null, second: bases.second, third: bases.third },
        outsAdded: 2,
        scorers: [],
        isSacFly: false,
        isDoublePlay: true,
      };
    }

    // A runner on third scores on a routine groundout — real baseball's
    // actual default (previously unmodeled: this engine had no mechanism
    // for a runner on third to ever score on a groundout at all). Infield-in
    // (engine/fielding.js's isInfieldInActive()) trades that away: on a
    // successful throw home, the runner from third is out at the plate
    // instead and the *batter* reaches first safely (the throw went home,
    // not to first) — a real out at a different, sometimes more valuable,
    // base, at the cost of a runner now aboard who'd otherwise be erased.
    // A double play (checked above) still takes priority when both a
    // force-at-second and a runner on third are in play — a tightly-turned
    // DP leaves no time for a third-base runner to react in reality either,
    // matching this file's existing "don't model every permutation" tone.
    if (bases.third && outs < 2) {
      const shouldAdvanceRunnerOnFirst = Boolean(bases.first) && !bases.second;
      const first = shouldAdvanceRunnerOnFirst ? null : bases.first;
      const second = shouldAdvanceRunnerOnFirst ? bases.first : bases.second;

      if (infieldInActive && rollInfieldInSuccess(defenseComposite, rng)) {
        return { bases: { first: batter, second, third: null }, outsAdded: 1, scorers: [], isSacFly: false, isDoublePlay: false };
      }
      return { bases: { first, second, third: null }, outsAdded: 1, scorers: [bases.third], isSacFly: false, isDoublePlay: false };
    }

    // Routine groundout — only resolves the common single-runner-on-first
    // case; multi-runner combinations hold in place (see file header).
    const shouldAdvanceRunnerOnFirst = Boolean(bases.first) && !bases.second;
    const first = shouldAdvanceRunnerOnFirst ? null : bases.first;
    const second = shouldAdvanceRunnerOnFirst ? bases.first : bases.second;
    return { bases: { first, second, third: bases.third }, outsAdded: 1, scorers: [], isSacFly: false, isDoublePlay: false };
  }

  // Flyball
  if (bases.third && outs < 2 && rng() < SAC_FLY_CHANCE) {
    return {
      bases: { first: bases.first, second: bases.second, third: null },
      outsAdded: 1,
      scorers: [bases.third],
      isSacFly: true,
      isDoublePlay: false,
    };
  }
  return { bases, outsAdded: 1, scorers: [], isSacFly: false, isDoublePlay: false };
}

/**
 * @param {string} outcome - PA_OUTCOMES
 * @param {{first: object|null, second: object|null, third: object|null}} bases
 * @param {number} outs - outs already recorded this half-inning (0-2)
 * @param {object} batter - Player
 * @param {() => number} rng
 * @param {object} [context]
 * @param {number} [context.defenseComposite] - engine/fielding.js's computeTeamDefenseComposite(); defaults to RATING_SCALE.AVERAGE (neutral)
 * @param {boolean} [context.infieldInActive] - engine/fielding.js's isInfieldInActive(); defaults false
 * @returns {{bases: object, outsAdded: number, scorers: object[], isSacFly: boolean, isDoublePlay: boolean}}
 */
export function resolveBaserunning(outcome, bases, outs, batter, rng, { defenseComposite = RATING_SCALE.AVERAGE, infieldInActive = false } = {}) {
  switch (outcome) {
    case PA_OUTCOMES.STRIKEOUT:
      return { bases, outsAdded: 1, scorers: [], isSacFly: false, isDoublePlay: false };
    case PA_OUTCOMES.WALK:
    case PA_OUTCOMES.HIT_BY_PITCH: {
      const { bases: newBases, scorers } = forceAdvance(bases, batter);
      return { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false };
    }
    case PA_OUTCOMES.SINGLE: {
      const { bases: newBases, scorers } = advanceOnHit(bases, batter, 1);
      return { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false };
    }
    case PA_OUTCOMES.DOUBLE: {
      const { bases: newBases, scorers } = advanceOnHit(bases, batter, 2);
      return { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false };
    }
    case PA_OUTCOMES.TRIPLE: {
      const { bases: newBases, scorers } = advanceOnHit(bases, batter, 3);
      return { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false };
    }
    case PA_OUTCOMES.HOME_RUN: {
      const { bases: newBases, scorers } = advanceOnHit(bases, batter, 4);
      return { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false };
    }
    case PA_OUTCOMES.OUT:
      return resolveOut(bases, outs, batter, rng, defenseComposite, infieldInActive);
    default:
      throw new Error(`Unknown PA outcome: ${outcome}`);
  }
}
