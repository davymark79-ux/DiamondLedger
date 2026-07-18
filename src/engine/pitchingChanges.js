// Bullpen management — when to pull the current pitcher, and who comes in
// next. Not specced in the design docs beyond the Sim Engine section's
// pitch-count fatigue tracking; the thresholds and closer/save-situation
// preference below are this engine's placeholder manager-AI logic, same
// tuning status as everything else here.
//
// v1 scope: each pitcher appears at most once per game (no bringing someone
// back for a second stint), and there's no situational lefty/righty
// matching — just degradation-based pulls (see pitcherDegradation.js, which
// combines fatigue and times-through-the-order) and a save-situation
// preference for whichever reliever is last in the bullpen list (the
// "closer" slot). shouldPullPitcher() takes the combined penalty as an
// input rather than computing it itself, so it doesn't care which axis
// (tiredness vs. batter familiarity) is actually driving the pull.

// Pull point is min(hard cap, enduranceThreshold + threshold/ramp) — tuned
// so an average-stamina starter is pulled around ~95-100 pitches (modern-
// MLB realistic; earlier tuning had let starters run to ~125-146 pitches
// specifically to hit the run-environment target below, which read as
// unrealistic pitch counts). The run-environment cost of pulling starters
// this much sooner was absorbed by giving validate-game-loop.mjs's
// synthetic bullpen a real quality curve (long/middle relief below
// average, setup/closer above — see BULLPEN_QUALITY there) instead of
// loosening these thresholds back up or inflating
// plateAppearanceConstants.js's real-MLB-anchored neutral-matchup rates;
// see baseball-sim-engine-build-order memory for the full writeup of why.
const STARTER_HARD_PITCH_CAP = 115;
const RELIEVER_HARD_PITCH_CAP = 35;
const FATIGUE_PULL_PENALTY_THRESHOLD = 14; // rating points, out of the fatigue+TTOP combined max (pitcherDegradation.js) — neutral default, see managers.md's Pitcher Hook slider below
const MIN_OUTS_BEFORE_FATIGUE_PULL_STARTER = 9; // 3 innings
const MIN_OUTS_BEFORE_FATIGUE_PULL_RELIEVER = 3; // 1 inning

// A save situation makes the designated closer (last arm in the bullpen
// array) the preferred next pitcher, mirroring real bullpen usage. Neutral
// default — see managers.md's Bullpen Usage slider below.
const SAVE_SITUATION_MAX_LEAD = 3;

// managers.md's Pitcher Hook and Bullpen Usage sliders overlap enough in
// English ("long leash" / "let starters go deep") to need an explicit,
// disambiguating split: Pitcher Hook owns WHEN the current pitcher gets
// pulled (shouldPullPitcher's fatigue-penalty patience); Bullpen Usage owns
// HOW liberally the best reliever gets deployed once you're in the pen
// (selectNextPitcher's save-situation lead-margin window). A manager can
// score high on one and low on the other — a patient hook with a
// conservative closer-usage philosophy, for instance.
const PITCHER_HOOK_SENSITIVITY = 0.12; // FATIGUE_PULL_PENALTY_THRESHOLD points per slider point away from neutral (50)
const BULLPEN_USAGE_SENSITIVITY = 0.04; // SAVE_SITUATION_MAX_LEAD runs per slider point away from neutral (50)
const MANAGER_SLIDER_NEUTRAL = 50; // MANAGER_ATTRIBUTE_SCALE.AVERAGE — not imported to avoid a models/ dependency in this small a spot

/**
 * @param {object} params
 * @param {number} params.pitchesThrown - this pitcher's own cumulative pitch count
 * @param {number} params.outsRecorded - this pitcher's own cumulative outs recorded
 * @param {boolean} params.isStarter
 * @param {number} params.degradationPenalty - combined fatigue + TTOP penalty, from pitcherDegradation.js
 * @param {number} [params.pitcherHook] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50 — the
 *   pre-Manager-entity fixed threshold's own value). Low = quick hook (pulls sooner), high = long leash.
 * @returns {boolean}
 */
export function shouldPullPitcher({ pitchesThrown, outsRecorded, isStarter, degradationPenalty, pitcherHook = MANAGER_SLIDER_NEUTRAL }) {
  const hardCap = isStarter ? STARTER_HARD_PITCH_CAP : RELIEVER_HARD_PITCH_CAP;
  if (pitchesThrown >= hardCap) return true;

  const minOuts = isStarter ? MIN_OUTS_BEFORE_FATIGUE_PULL_STARTER : MIN_OUTS_BEFORE_FATIGUE_PULL_RELIEVER;
  if (outsRecorded < minOuts) return false;

  const effectiveThreshold = FATIGUE_PULL_PENALTY_THRESHOLD + (pitcherHook - MANAGER_SLIDER_NEUTRAL) * PITCHER_HOOK_SENSITIVITY;
  return degradationPenalty >= effectiveThreshold;
}

/**
 * @param {object[]} bullpen - remaining available relievers, in usage order;
 *   the last entry is treated as the closer.
 * @param {object} context
 * @param {number} context.inning
 * @param {number} context.scheduledInnings
 * @param {number} context.leadMargin - pitching team's score minus opponent's
 * @param {number} [context.bullpenUsage] - MANAGER_ATTRIBUTE_SCALE (1-100), defaults to neutral (50).
 *   Low = conservative (save-only-in-classic-situations), high = the closer/best reliever gets
 *   deployed across a wider range of situations.
 * @returns {object|null} the selected reliever, or null if the bullpen is empty
 */
export function selectNextPitcher(bullpen, { inning, scheduledInnings, leadMargin, bullpenUsage = MANAGER_SLIDER_NEUTRAL }) {
  if (bullpen.length === 0) return null;

  const effectiveMaxLead = Math.max(1, Math.round(SAVE_SITUATION_MAX_LEAD + (bullpenUsage - MANAGER_SLIDER_NEUTRAL) * BULLPEN_USAGE_SENSITIVITY));
  const isSaveSituation =
    inning >= scheduledInnings && leadMargin > 0 && leadMargin <= effectiveMaxLead;

  if (isSaveSituation) {
    return bullpen.splice(bullpen.length - 1, 1)[0];
  }
  return bullpen.shift();
}
