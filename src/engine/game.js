// Full game simulation — orchestrates resolvePlateAppearance() + baserunning
// + pitcher fatigue/TTOP/bullpen management + box-score tracking into a
// complete 9(+)-inning game.

import { RATING_SCALE } from '../models/constants.js';
import { createRng } from '../models/generation/random.js';
import { resolvePlateAppearance } from './plateAppearance.js';
import { resolveBaserunning, resolveSacrificeBunt, resolveReachedOnError } from './baserunning.js';
import { PA_OUTCOMES } from './plateAppearanceConstants.js';
import { estimatePitchCount } from './pitcherFatigue.js';
import { computeDegradationPenalty, applyInGameDegradation } from './pitcherDegradation.js';
import { shouldPullPitcher, selectNextPitcher } from './pitchingChanges.js';
import {
  shouldPinchHit,
  selectPinchHitter,
  selectEmergencyPinchHitter,
  shouldMakeDefensiveReplacement,
  selectDefensiveReplacement,
  shouldPinchRun,
  selectPinchRunner,
} from './hitterChanges.js';
import { computeInjuryRisk, rollInjury } from './injuries.js';
import { applyGamePerformance, applyPitcherGamePerformance } from './consistency.js';
import { applyFatigue } from './positionPlayerFatigue.js';
import { identifyStealOpportunity, computeStealAttemptProbability, computeStealSuccessRate } from './stolenBases.js';
import { identifyBuntSituation, computeBuntAttemptProbability, computeBuntSuccessRate } from './bunting.js';
import { computeTeamDefenseComposite, isNoDoublesActive, isInfieldInActive, computeErrorChance } from './fielding.js';
import { createBattingLine, createPitchingLine, recordPlateAppearance, recordRun, recordStolenBaseAttempt } from './boxScore.js';
import { resolveGameRules } from './gameRules.js';
import { createManager } from '../models/Manager.js';
import { resolveGameManagerState } from './managerBehavior.js';

// Per-game "form" (In-Game Performance Consistency — player-attributes-and-
// development.md) is rolled once per player per game and held constant for
// the whole outing: batters and the starter up front, each reliever at the
// moment he actually enters (we don't know in advance who'll be needed).
// dhRule defaults to true (Exchange — no Foundry small-ball bonus) for
// callers that don't know/care about league identity, like the standalone
// /box-score demo and validate-game-loop.mjs's synthetic fixtures — the
// safe, unbiased default, same precedent as consecutiveGamesPlayedById's
// empty-Map default.
function createSide(
  {
    lineup,
    startingPitcher,
    bullpen = [],
    bench = [],
    consecutiveGamesPlayedById = new Map(),
    dhRule = true,
    managerProfile = createManager(),
    streakStateById = new Map(),
  },
  rng
) {
  const formAdjustedLineup = lineup.map((player) => {
    const withForm = applyGamePerformance(player, rng);
    return applyFatigue(withForm, consecutiveGamesPlayedById.get(player.id) ?? 0);
  });
  const battingLines = new Map();
  for (const player of formAdjustedLineup) {
    battingLines.set(player.id, createBattingLine(player));
  }

  const formAdjustedStarter = applyPitcherGamePerformance(startingPitcher, rng);
  const pitchingLines = new Map();
  pitchingLines.set(formAdjustedStarter.id, createPitchingLine(formAdjustedStarter, { entryInning: 1, entryLeadMargin: 0 }));

  return {
    lineup: formAdjustedLineup,
    battingIndex: 0,
    battingLines,
    // Per-lineup-slot chain of player ids, in the order they occupied that
    // slot (starter first, then any subs) — lets the UI display substitutes
    // grouped directly under whoever they replaced instead of in raw
    // first-appearance order (see toBoxScoreSide's subDepth).
    slots: formAdjustedLineup.map((player) => [player.id]),
    startingPitcherId: formAdjustedStarter.id,
    currentPitcher: formAdjustedStarter,
    bullpen: [...bullpen],
    bench: [...bench],
    removedPlayerIds: new Set(),
    substitutions: [],
    // injuries.md — every injury sustained this game, regardless of whether
    // a replacement was actually available (see maybeInjureBatter/
    // maybeInjurePitcher below). Surfaced on simulateGame()'s return value
    // so a season loop can persist availability across games; game.js
    // itself has no notion of "which game number this is."
    injuries: [],
    pitchingLines,
    inningRuns: [],
    runsTotal: 0,
    // Position-player fatigue (positionPlayerFatigue.js) — read-only here,
    // owned/advanced by the season loop across games; kept on the side
    // object so maybeInjureBatter can factor it into computeInjuryRisk.
    consecutiveGamesPlayedById,
    // bunting.js's Foundry small-ball bonus needs to know this side's league identity.
    dhRule,
    // managers.md — the manager's static profile, plus this game's rolled
    // effective slider values (engine/managerBehavior.js's Temperament
    // noise, resolved once per game, not re-rolled per decision — see that
    // file's header). Defaults to a neutral, all-50s synthetic manager, so
    // every caller that doesn't know/care about a real manager (the
    // standalone /box-score demo, validate-game-loop.mjs's fixtures) is
    // unaffected, matching dhRule's own default-param precedent.
    managerProfile,
    managerGameState: resolveGameManagerState(managerProfile, rng),
    // Hot/Cold Streaks (hotColdStreaks.js) — read-only here, owned/advanced
    // by the season loop across games (engine/season.js's streakStateById),
    // same ownership pattern as consecutiveGamesPlayedById. Feeds the
    // Analytics-vs-Feel/Streak Read pinch-hit factor in hitterChanges.js.
    streakStateById,
    // fielding.js — team-level, not per-player (no per-fielder-per-play
    // resolution exists to attribute a specific error to).
    errors: 0,
  };
}

// Swaps `side.lineup[slotIndex]` to `incoming`, retiring the outgoing
// player for good (see hitterChanges.js header — removedPlayerIds is the
// hard, explicitly-checked "never returns" guarantee) and creating his box
// score line if this is his first action of the game. Returns the
// (form-adjusted) incoming player so callers needing to patch other state
// — e.g. a pinch-runner replacing whoever's standing on a base — can do so.
function substituteBatter(side, slotIndex, incoming, rng, type, context) {
  const outgoing = side.lineup[slotIndex];
  side.removedPlayerIds.add(outgoing.id);

  const formAdjustedIncoming = applyGamePerformance(incoming, rng);
  side.lineup[slotIndex] = formAdjustedIncoming;
  if (!side.battingLines.has(formAdjustedIncoming.id)) {
    side.battingLines.set(formAdjustedIncoming.id, createBattingLine(formAdjustedIncoming));
  }
  side.slots[slotIndex].push(formAdjustedIncoming.id);

  side.substitutions.push({
    type,
    inning: context.inning,
    half: context.half,
    outPlayerId: outgoing.id,
    outPlayerLastName: outgoing.lastName,
    inPlayerId: formAdjustedIncoming.id,
    inPlayerLastName: formAdjustedIncoming.lastName,
  });

  return formAdjustedIncoming;
}

function maybeSubstituteBatter(offense, defense, rng, { inning, scheduledInnings, half }) {
  const slotIndex = offense.battingIndex % offense.lineup.length;
  const currentBatter = offense.lineup[slotIndex];
  const scoreMargin = offense.runsTotal - defense.runsTotal;

  if (!shouldPinchHit({ inning, scheduledInnings, scoreMargin })) return;
  const substitute = selectPinchHitter(offense.bench, currentBatter, offense.removedPlayerIds, {
    pitcher: defense.currentPitcher,
    effectiveSliders: offense.managerGameState?.effectiveSliders,
    streakRead: offense.managerProfile?.streakRead,
    streakStateById: offense.streakStateById,
    rng,
  });
  if (!substitute) return;

  substituteBatter(offense, slotIndex, substitute, rng, 'pinch-hit', { inning, half });
}

function maybeMakeDefensiveReplacements(defense, offense, rng, { inning, scheduledInnings, half }) {
  const leadMargin = defense.runsTotal - offense.runsTotal;
  if (!shouldMakeDefensiveReplacement({ inning, scheduledInnings, leadMargin })) return;

  for (let slotIndex = 0; slotIndex < defense.lineup.length; slotIndex++) {
    const currentFielder = defense.lineup[slotIndex];
    // Simplification: uses whoever currently occupies the slot's own
    // primaryPosition as "the position being defended" — accurate for the
    // original lineup, an acceptable approximation after an earlier
    // substitution, since defense isn't mechanically modeled anyway (see
    // hitterChanges.js header).
    const substitute = selectDefensiveReplacement(defense.bench, currentFielder.primaryPosition, currentFielder, defense.removedPlayerIds);
    if (substitute) {
      substituteBatter(defense, slotIndex, substitute, rng, 'defensive-replacement', { inning, half });
    }
  }
}

const OCCUPIED_BASE_KEYS = ['first', 'second', 'third'];

// Checked once per plate appearance (same cadence as maybeSubstituteBatter/
// maybeChangePitcher) since new baserunners can appear on any given play.
// Mutates `bases` in place — pinch-running replaces whoever's standing on a
// base mid-inning, unlike the other two substitution types which only ever
// swap in a lineup slot at a fixed checkpoint.
function maybeSubstituteRunners(offense, defense, bases, rng, { inning, scheduledInnings, half }) {
  const scoreMargin = offense.runsTotal - defense.runsTotal;
  if (!shouldPinchRun({ inning, scheduledInnings, scoreMargin })) return;

  for (const baseKey of OCCUPIED_BASE_KEYS) {
    const runner = bases[baseKey];
    if (!runner) continue;

    const slotIndex = offense.lineup.findIndex((player) => player.id === runner.id);
    if (slotIndex === -1) continue; // shouldn't happen, but don't crash if it does

    const substitute = selectPinchRunner(offense.bench, runner, offense.removedPlayerIds);
    if (!substitute) continue;

    bases[baseKey] = substituteBatter(offense, slotIndex, substitute, rng, 'pinch-run', { inning, half });
  }
}

function nextBatter(side) {
  const batter = side.lineup[side.battingIndex % side.lineup.length];
  side.battingIndex += 1;
  return batter;
}

// Shared by maybeChangePitcher's tactical pulls and maybeInjurePitcher's
// forced ones — form-adjusts the incoming reliever, makes him the active
// pitcher, and opens his pitching line if this is his first action.
function bringInReliever(defense, reliever, rng, { inning, leadMargin }) {
  const formAdjustedReliever = applyPitcherGamePerformance(reliever, rng);
  defense.currentPitcher = formAdjustedReliever;
  if (!defense.pitchingLines.has(formAdjustedReliever.id)) {
    defense.pitchingLines.set(formAdjustedReliever.id, createPitchingLine(formAdjustedReliever, { entryInning: inning, entryLeadMargin: leadMargin }));
  }
  return formAdjustedReliever;
}

function maybeChangePitcher(defense, offense, rng, { inning, scheduledInnings }) {
  const line = defense.pitchingLines.get(defense.currentPitcher.id);
  const isStarter = defense.currentPitcher.id === defense.startingPitcherId;
  const degradationPenalty = computeDegradationPenalty(defense.currentPitcher, line.pitches, line.battersFaced);

  const shouldPull = shouldPullPitcher({
    pitchesThrown: line.pitches,
    outsRecorded: line.outsRecorded,
    isStarter,
    degradationPenalty,
    pitcherHook: defense.managerGameState?.effectiveSliders?.pitcherHook,
  });
  if (!shouldPull) return;

  const reliever = selectNextPitcher(defense.bullpen, {
    inning,
    scheduledInnings,
    leadMargin: defense.runsTotal - offense.runsTotal,
    bullpenUsage: defense.managerGameState?.effectiveSliders?.bullpenUsage,
  });
  if (!reliever) return; // bullpen exhausted — stuck with the current arm

  bringInReliever(defense, reliever, rng, { inning, leadMargin: defense.runsTotal - offense.runsTotal });
}

// injuries.md — checked once per pitch thrown (higher cadence than batter
// injuries, since a pitcher throws far more pitches than a batter sees PAs;
// see engine/injuries.js's header for the base-rate reasoning). On a hit,
// forces a pitching change via the same unconditional selectNextPitcher()
// a tactical pull uses (no quality gate to bypass, unlike the hitter
// selectors) — if the bullpen's empty, the pitcher continues, the same
// graceful-degradation fallback maybeChangePitcher already accepts when
// exhausted.
function maybeInjurePitcher(defense, offense, rng, { inning, scheduledInnings, half }) {
  const pitcherLine = defense.pitchingLines.get(defense.currentPitcher.id);
  const risk = computeInjuryRisk(defense.currentPitcher, { isPitcher: true, pitchesThrownSoFar: pitcherLine.pitches });
  if (rng() >= risk) return;

  const injury = rollInjury(defense.currentPitcher, rng);
  defense.injuries.push({ playerId: defense.currentPitcher.id, type: injury.type, severity: injury.severity, gamesRemaining: injury.gamesRemaining, inning, half });

  const reliever = selectNextPitcher(defense.bullpen, {
    inning,
    scheduledInnings,
    leadMargin: defense.runsTotal - offense.runsTotal,
    bullpenUsage: defense.managerGameState?.effectiveSliders?.bullpenUsage,
  });
  if (!reliever) return; // no replacement available — stays in, matches the exhaustion fallback above

  bringInReliever(defense, reliever, rng, { inning, leadMargin: defense.runsTotal - offense.runsTotal });
}

// injuries.md — checked once per completed plate appearance for the batter
// who just finished it (see engine/injuries.js's header for why only the
// batter and pitcher are injury-eligible). Forces an emergency pinch-hit
// (no quality gate — the incumbent is leaving regardless) into the same
// lineup slot, patching any base he's now occupying to the replacement too,
// same as a tactical pinch-run. If the bench is empty/exhausted, he plays
// on — the same graceful-degradation fallback used everywhere else in this
// file when a substitution pool runs dry.
function maybeInjureBatter(offense, bases, batter, batterSlotIndex, rng, { inning, half }) {
  const consecutiveGamesPlayed = offense.consecutiveGamesPlayedById.get(batter.id) ?? 0;
  const risk = computeInjuryRisk(batter, { isPitcher: false, consecutiveGamesPlayed });
  if (rng() >= risk) return;

  const injury = rollInjury(batter, rng);
  offense.injuries.push({ playerId: batter.id, type: injury.type, severity: injury.severity, gamesRemaining: injury.gamesRemaining, inning, half });

  const substitute = selectEmergencyPinchHitter(offense.bench, offense.removedPlayerIds);
  if (!substitute) return;

  const replacement = substituteBatter(offense, batterSlotIndex, substitute, rng, 'injury', { inning, half });
  for (const baseKey of OCCUPIED_BASE_KEYS) {
    if (bases[baseKey]?.id === batter.id) bases[baseKey] = replacement;
  }
}

// A defense with no catcher on the field (shouldn't happen in practice —
// real roster construction always fields exactly one — but kept as a
// graceful-degradation fallback matching this engine's established pattern
// elsewhere) reads as a neutral-armed catcher rather than crashing.
const NEUTRAL_CATCHER_REFERENCE = {
  ratings: { armStrength: { current: RATING_SCALE.AVERAGE }, armAccuracy: { current: RATING_SCALE.AVERAGE } },
};

// stolenBases.js — checked once per plate appearance, before the batter's
// own PA resolves (a steal happens mid-at-bat in real baseball). Returns
// the number of outs added, since a caught-stealing can end the half-inning
// before this batter ever gets his PA — the caller must check outs >= 3 and
// bail out before calling nextBatter()/resolvePlateAppearance() for him.
// Exported (unlike this file's other maybeXxx helpers) so
// validate-stolen-bases.mjs can exercise it directly with a controlled rng
// — the mid-PA-ending-the-inning correctness property is critical enough
// to unit-test in isolation, matching how season.js's resolveAvailableRoster
// is exported for the same reason.
export function maybeAttemptSteal(offense, defense, bases, rng, { scoreMargin }) {
  const opportunity = identifyStealOpportunity(bases);
  if (!opportunity) return { outsAdded: 0 };

  const { runner, situation, situationName } = opportunity;
  const attemptProbability = computeStealAttemptProbability(
    runner,
    situation,
    scoreMargin,
    offense.managerGameState?.effectiveSliders?.stealAggressiveness
  );
  if (rng() >= attemptProbability) return { outsAdded: 0 };

  const catcher = defense.lineup.find((p) => p.primaryPosition === 'C') ?? NEUTRAL_CATCHER_REFERENCE;
  const successRate = computeStealSuccessRate(runner, catcher, defense.currentPitcher, situation);
  const succeeded = rng() < successRate;

  recordStolenBaseAttempt(offense.battingLines.get(runner.id), succeeded);

  if (succeeded) {
    if (situationName === 'FIRST_TO_SECOND') {
      bases.first = null;
      bases.second = runner;
    } else {
      bases.second = null;
      bases.third = runner;
    }
    return { outsAdded: 0 };
  }

  if (situationName === 'FIRST_TO_SECOND') bases.first = null;
  else bases.second = null;
  const pitcherLine = defense.pitchingLines.get(defense.currentPitcher.id);
  pitcherLine.outsRecorded += 1; // a real out for half-inning/fatigue purposes — deliberately not battersFaced, since the same batter is still up
  return { outsAdded: 1 };
}

// bunting.js — checked once per plate appearance, right after the batter
// is known but before resolvePlateAppearance runs, since a bunt is an
// alternative resolution of the *same* at-bat, not an independent mid-PA
// event like a steal. Returns `null` when no bunt is attempted (the caller
// proceeds with a normal resolvePlateAppearance/resolveBaserunning pair
// exactly as before), or a resolveBaserunning-shaped result object
// otherwise — no early-break needed in the caller's loop, unlike
// maybeAttemptSteal, since a bunt attempt *is* this batter's full turn.
// Exported for direct testability, matching maybeAttemptSteal's precedent.
export function maybeAttemptBunt(offense, bases, outs, batter, rng, { scoreMargin, inning, scheduledInnings, dhRule }) {
  const situation = identifyBuntSituation(bases, outs);
  if (!situation) return null;

  const { situationName } = situation;
  const attemptProbability = computeBuntAttemptProbability(batter, situationName, bases, {
    scoreMargin,
    inning,
    scheduledInnings,
    dhRule,
    smallBallTendency: offense.managerGameState?.effectiveSliders?.smallBallTendency,
  });
  if (rng() >= attemptProbability) return null;

  const succeeded = rng() < computeBuntSuccessRate(batter);

  if (succeeded) {
    const { bases: newBases, scorers } = resolveSacrificeBunt(bases, batter);
    return { bases: newBases, outsAdded: 1, scorers, isSacFly: false, isDoublePlay: false, isSacrificeBunt: true };
  }

  if (situationName === 'SQUEEZE') {
    // The real risk of a suicide squeeze: the runner from third broke on
    // the pitch and is out at the plate too, not just the batter.
    return { bases: { ...bases, third: null }, outsAdded: 2, scorers: [], isSacFly: false, isDoublePlay: false, isSacrificeBunt: false };
  }
  return { bases, outsAdded: 1, scorers: [], isSacFly: false, isDoublePlay: false, isSacrificeBunt: false };
}

function placeGhostRunner(offense) {
  const precedingIndex = (offense.battingIndex - 1 + offense.lineup.length) % offense.lineup.length;
  return offense.lineup[precedingIndex];
}

function playHalfInning(
  offense,
  defense,
  rng,
  { inning, scheduledInnings, walkOffIfAhead = false, ghostRunner = false, offenseIsAway, scoringEvents }
) {
  let outs = 0;
  let bases = { first: null, second: null, third: null };
  if (ghostRunner) {
    bases.second = placeGhostRunner(offense);
  }
  let runsThisInning = 0;
  const half = offenseIsAway ? 'top' : 'bottom';

  maybeMakeDefensiveReplacements(defense, offense, rng, { inning, scheduledInnings, half });

  while (outs < 3) {
    maybeChangePitcher(defense, offense, rng, { inning, scheduledInnings });
    maybeSubstituteBatter(offense, defense, rng, { inning, scheduledInnings, half });
    maybeSubstituteRunners(offense, defense, bases, rng, { inning, scheduledInnings, half });

    const stealResult = maybeAttemptSteal(offense, defense, bases, rng, { scoreMargin: offense.runsTotal - defense.runsTotal });
    outs += stealResult.outsAdded;
    // A caught-stealing can be the 3rd out mid-at-bat — the batter at the
    // plate never gets his PA resolved this half-inning (matches real
    // baseball: no recorded PA, he just leads off next inning). Must bail
    // out here, before nextBatter() mutates offense.battingIndex.
    if (outs >= 3) break;

    const batterSlotIndex = offense.battingIndex % offense.lineup.length;
    const batter = nextBatter(offense);
    const pitcherLine = defense.pitchingLines.get(defense.currentPitcher.id);
    const degradedPitcher = applyInGameDegradation(defense.currentPitcher, pitcherLine.pitches, pitcherLine.battersFaced);
    const hadRisp = Boolean(bases.second || bases.third);

    // fielding.js — team defensive quality/positioning, computed fresh each
    // PA since substitutions can change who's on the field. Fielding/Arm
    // Strength/Arm Accuracy's first real effect on any outcome anywhere in
    // this engine (see fielding.js's header).
    const defenseComposite = computeTeamDefenseComposite(defense);
    const noDoublesActive = isNoDoublesActive(defense, offense, inning, scheduledInnings, defense.managerGameState?.effectiveSliders?.defensiveManagement);

    // A bunt is an alternative resolution of this same at-bat (see
    // maybeAttemptBunt's header) — when it fires, it replaces the normal
    // resolvePlateAppearance/resolveBaserunning pair entirely; everything
    // after this point (pitch count, injury check, box-score recording,
    // run-scoring) stays a single unconditional call site either way.
    const buntResult = maybeAttemptBunt(offense, bases, outs, batter, rng, {
      scoreMargin: offense.runsTotal - defense.runsTotal,
      inning,
      scheduledInnings,
      dhRule: offense.dhRule,
    });
    const outcome = buntResult
      ? PA_OUTCOMES.OUT
      : resolvePlateAppearance(batter, degradedPitcher, rng, { composite: defenseComposite, noDoublesActive });
    pitcherLine.pitches += estimatePitchCount(outcome, rng);
    maybeInjurePitcher(defense, offense, rng, { inning, scheduledInnings, half });

    // A ball that would otherwise be a clean out can instead become a
    // fielding error (fielding.js) — checked here, before resolveBaserunning,
    // since an error preempts whatever groundball/flyball/double-play/
    // infield-in sub-resolution that out would have gone through.
    const isError = !buntResult && outcome === PA_OUTCOMES.OUT && rng() < computeErrorChance(defenseComposite);
    let result;
    if (buntResult) {
      result = buntResult;
    } else if (isError) {
      const { bases: newBases, scorers } = resolveReachedOnError(bases, batter);
      result = { bases: newBases, outsAdded: 0, scorers, isSacFly: false, isDoublePlay: false, isSacrificeBunt: false, isError: true };
      defense.errors += 1;
    } else {
      const infieldInActive = isInfieldInActive(defense, offense, inning, scheduledInnings, defense.managerGameState?.effectiveSliders?.defensiveManagement);
      result = resolveBaserunning(outcome, bases, outs, batter, rng, { defenseComposite, infieldInActive });
    }
    bases = result.bases;
    outs += result.outsAdded;
    pitcherLine.outsRecorded += result.outsAdded;

    recordPlateAppearance(offense.battingLines.get(batter.id), pitcherLine, outcome, result, hadRisp);
    for (const scorer of result.scorers) {
      recordRun(offense.battingLines.get(scorer.id));
    }

    runsThisInning += result.scorers.length;
    offense.runsTotal += result.scorers.length;
    maybeInjureBatter(offense, bases, batter, batterSlotIndex, rng, { inning, half });

    if (result.scorers.length > 0 && scoringEvents) {
      scoringEvents.push({
        inning,
        half: offenseIsAway ? 'top' : 'bottom',
        awayRuns: offenseIsAway ? offense.runsTotal : defense.runsTotal,
        homeRuns: offenseIsAway ? defense.runsTotal : offense.runsTotal,
        defendingPitcherId: defense.currentPitcher.id,
      });
    }

    if (walkOffIfAhead && offense.runsTotal > defense.runsTotal) break;
  }

  offense.inningRuns.push(runsThisInning);
}

function toBoxScoreSide(side) {
  // Batting lines ordered by lineup slot, with each slot's starter followed
  // immediately by whoever subbed in for him (subDepth 0 = started the
  // game in that slot, 1+ = came in later) — rather than raw Map insertion
  // order, which would scatter subs after all nine starters regardless of
  // which slot they actually filled.
  const battingLines = side.slots.flatMap((chain) =>
    chain.map((playerId, subDepth) => ({ ...side.battingLines.get(playerId), subDepth }))
  );

  return {
    runs: side.runsTotal,
    inningRuns: side.inningRuns,
    battingLines,
    pitchingLines: [...side.pitchingLines.values()],
    substitutions: side.substitutions,
    errors: side.errors,
  };
}

/**
 * @param {object} matchup
 * @param {object} matchup.away
 * @param {object[]} matchup.away.lineup - exactly 9 Players in batting order.
 *   For a no-DH league, include the pitcher himself at his batting slot; for
 *   a DH league, include a separate DH player instead — this function
 *   doesn't construct lineups itself.
 * @param {object} matchup.away.startingPitcher - Player
 * @param {object[]} [matchup.away.bullpen] - available relievers, in usage
 *   order; the last entry is treated as the closer (preferred in save
 *   situations). Each pitcher appears at most once per game.
 * @param {object[]} [matchup.away.bench] - available position-player
 *   substitutes (pinch-hitting/defensive replacement — see
 *   hitterChanges.js). Each bench player appears at most once per game;
 *   once any player is subbed out, he never returns.
 * @param {Map<string, number>} [matchup.away.consecutiveGamesPlayedById] -
 *   position-player fatigue (positionPlayerFatigue.js), owned/advanced by
 *   the season loop across games; defaults to empty (no fatigue) for
 *   single-game callers like the standalone /box-score demo.
 * @param {object} [matchup.away.managerProfile] - Manager (models/Manager.js);
 *   defaults to a neutral, all-50s synthetic manager for callers that don't
 *   know/care about a real manager. Drives managers.md's seven sliders via
 *   engine/managerBehavior.js's per-game Temperament-noised effective values.
 * @param {Map<string, {tier: string}>} [matchup.away.streakStateById] -
 *   Hot/Cold Streaks (hotColdStreaks.js), owned/advanced by the season loop
 *   across games; feeds the Analytics-vs-Feel/Streak Read pinch-hit factor.
 * @param {object} matchup.home - same shape as matchup.away
 * @param {object} [options]
 * @param {number} [options.seed]
 * @param {() => number} [options.rng]
 * @param {number} [options.scheduledInnings] - default 9
 * @param {number} [options.maxInnings] - safety valve for pathological extra-innings loops, default 30
 * @param {object} [options.rules] - see gameRules.js; merged over DEFAULT_GAME_RULES
 * @returns {object} box score: { away, home, innings, scoringEvents, injuries }
 */
export function simulateGame({ away, home }, options = {}) {
  const rng = options.rng ?? createRng(options.seed);
  const scheduledInnings = options.scheduledInnings ?? 9;
  const maxInnings = options.maxInnings ?? 30;
  const rules = resolveGameRules(options.rules);

  const awaySide = createSide(away, rng);
  const homeSide = createSide(home, rng);
  const scoringEvents = [];

  let inning = 1;
  while (inning <= maxInnings) {
    const isExtraInnings = inning > scheduledInnings;
    const isFinalScheduledOrLater = inning >= scheduledInnings;

    playHalfInning(awaySide, homeSide, rng, {
      inning,
      scheduledInnings,
      ghostRunner: isExtraInnings && rules.ghostRunnerOnSecondInExtraInnings,
      offenseIsAway: true,
      scoringEvents,
    });

    if (isFinalScheduledOrLater && homeSide.runsTotal > awaySide.runsTotal) break; // home already winning, skips their at-bat

    playHalfInning(homeSide, awaySide, rng, {
      inning,
      scheduledInnings,
      walkOffIfAhead: isFinalScheduledOrLater,
      ghostRunner: isExtraInnings && rules.ghostRunnerOnSecondInExtraInnings,
      offenseIsAway: false,
      scoringEvents,
    });

    if (isFinalScheduledOrLater && homeSide.runsTotal !== awaySide.runsTotal) break;
    inning += 1;
  }

  return {
    away: toBoxScoreSide(awaySide),
    home: toBoxScoreSide(homeSide),
    innings: awaySide.inningRuns.length,
    scoringEvents,
    // injuries.md — every injury sustained this game, both sides combined
    // (a caller tracking cross-game availability doesn't need them split by
    // side; each entry's playerId is already enough to resolve which team).
    injuries: [...awaySide.injuries, ...homeSide.injuries],
  };
}
