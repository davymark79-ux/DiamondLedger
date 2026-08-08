// Club infrastructure — §50, the "persistent club-level multiplier" §49a
// named as the remaining untried lever for club differentiation.
//
// WHY THIS IS A DIFFERENT KIND OF MECHANISM, which is the entire point.
// Every §49 channel is a FLOW: a rich club develops prospects slightly
// faster, converts slightly more picks, retains slightly more free agents.
// Flows have to accumulate into a stock of talent to show up, and §49
// measured that stacking three more of them bought only +18% club-quality
// SD. §49a then tested whether heavy mixing was dissipating them and found
// it was not (removing merit promotion entirely bought +15%), so the
// compression is not a mixing problem and more flow channels are not the
// answer.
//
// This attaches to the CLUB instead of the player: better facilities, a
// deeper coaching and analytics staff, a better medical and travel setup.
// A player performs slightly above his raw ratings while he plays here, and
// stops doing so the moment he leaves. It therefore cannot be dissipated by
// churn at all — trades, merit promotion, free agency and retirement move
// players, and the modifier stays with the club. Persistent by construction,
// the same way engine/meritPromotion.js's 1-for-1 swap keeps section sizes
// correct by construction rather than by bookkeeping.
//
// WHAT IT DELIBERATELY DOES NOT DO, stated plainly because it changes how
// the mechanic must be measured: this does not make a rich club's players
// BETTER. `playerQualityScore` and every talent metric read raw ratings, so
// club-quality SD is untouched by design. It makes a rich club get more out
// of the players it has, so its effect appears in WINS — standings, and
// therefore promotion/relegation tracking something durable, which is what
// §49 was actually worried about ("promotion/relegation stops tracking
// anything real").
//
// Built on consistency.js's withPerformanceModifiers, the same primitive
// fatigue (positionPlayerFatigue.js), shuttle fatigue (§35), pitcher
// degradation, reassignment reaction and return rust (§43) all use — this is
// another layer in that established stack, not a new mechanism for touching
// ratings.

import { withPerformanceModifiers } from './consistency.js';
import { HITTING_ATTRIBUTES, BASERUNNING_ATTRIBUTES, DEFENSE_ATTRIBUTES, PITCHING_ATTRIBUTES } from '../models/constants.js';

// Total rich-to-poor spread, in rating points applied to every performance
// attribute. Centred, so the league-average club is exactly neutral and this
// redistributes rather than inflating the league — the same discipline every
// §49 channel follows, and the one §49c had to repair when a base rate left
// no room for half the swing.
//
// Calibrated empirically against real simulated seasons (18 each), and the
// FIRST metric was wrong — recorded here because the sweep is only
// interpretable alongside it. Win% cannot express club differentiation in
// this league at all: MLB1 clubs only play MLB1 clubs, so promotion/
// relegation normalizes win% by construction and a club that genuinely
// improves is promoted into stronger opposition and regresses toward .500.
// The control arm proved it — corr(strength, club quality) 0.609 against
// corr(strength, win%) 0.014. Re-measured on tier-INDEPENDENT metrics:
//
//   swing | corr(str, MLB1 residency) | rich third | poor third
//   ------|---------------------------|------------|------------
//     0   |           0.361           |   69.9%    |   54.4%
//     2   |           0.464           |   76.1%    |   44.9%
//     4   |           0.546           |   80.5%    |   47.1%
//     6   |           0.573           |   83.1%    |   44.1%
//
// 4 chosen with the user: it captures ~95% of the available ordering at
// two-thirds the magnitude of 6, which bought only +0.03 more correlation.
// (The per-arm "never/always in MLB1" counts are a single 18-season run
// each and are noisy — swing 4 showed MORE churn than the control, which
// cannot be a real effect of raising the swing — so they were deliberately
// not used to pick the value.) Illustrative placeholder like every other
// constant in this project.
export const CLUB_INFRASTRUCTURE_SWING = 4.0;

// The attributes the game loop actually reads to resolve a plate appearance.
// Deliberately the same sets engine/minorLeagues.js's playerQualityScore
// averages, so "what infrastructure improves" and "what counts as quality"
// cannot drift apart. Personality attributes (workEthic, coachability,
// consistency, durability, platoonSkill) are excluded — infrastructure
// changes how a player performs, not who he is.
const HITTER_ATTRIBUTES = [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];

/**
 * A club's durable performance modifier, in rating points.
 * @param {number|null} orgStrength - 0-1 position in the league's economic
 *   range (0 = poorest club, 1 = richest), or null when a caller has no
 *   economics to supply — which yields exactly 0, so every pre-§50 call site
 *   is byte-identical.
 * @returns {number} additive rating-point delta, +/-
 */
export function clubInfrastructureModifier(orgStrength) {
  if (orgStrength === null || orgStrength === undefined) return 0;
  return (orgStrength - 0.5) * CLUB_INFRASTRUCTURE_SWING;
}

/**
 * Applies a club's modifier to one player's performance attributes.
 * Non-mutating, like every other withPerformanceModifiers consumer.
 * @param {object} player - Player
 * @param {number} modifier - from clubInfrastructureModifier()
 * @returns {object} Player (shallow copy; the original is not mutated)
 */
export function applyClubInfrastructure(player, modifier) {
  if (!modifier) return player;
  const attributes = player.isPitcher ? PITCHING_ATTRIBUTES : HITTER_ATTRIBUTES;
  const deltas = {};
  for (const attribute of attributes) deltas[attribute] = modifier;
  return withPerformanceModifiers(player, deltas);
}
