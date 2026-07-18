// Player retirement — managers.md's "surfaces the need for player
// retirement to exist, at least minimally... a lightweight default"
// (an ex-player manager has to have stopped playing first). Deliberately
// a minimal, functional default per that doc's own framing, not a full
// financial/one-last-contract design pass.
//
// Three triggers, refined from the doc's original age/decline-only sketch
// with real user feedback: retirement should be rare mid-season and
// mostly an end-of-season decision, and a season's injury outcome should
// be a real input.
//
// 1. Age/decline voluntary retirement — soft probability, no hard cutoff,
//    same shape as every other soft-retirement system in this project
//    (Writers Corps, Scouts, Managers all use "rising probability past
//    age N"). The decline term approximates "current rating meaningfully
//    below career peak" via current-vs-truePotential instead of real
//    peak-tracking (no such field exists on Player) — an explicitly
//    flagged approximation: a bust who never developed reads similarly to
//    a declined veteran under this proxy. Acceptable given how minimal
//    this default is meant to be, and given ratings can't dynamically
//    decline in production yet anyway (growthModel.js/development.js
//    aren't wired into any season-to-season loop — see below).
// 2. Injury-driven retirement, reusing injuries.js's existing severity
//    tiers rather than inventing new state: CAREER_ENDING forces
//    retirement outright; SEASON_ENDING adds a real probability bump, but
//    only for a player already at/past the same age gate as the decline
//    term ("an older player who maybe planned to retire at season's end
//    gets a season-ending injury and just calls it there" — a young
//    player with the same injury is expected back, no bump).
// 3. DFA'd-and-not-picked-up — explicitly DEFERRED, not built here. There
//    is no DFA/waiver/roster-transaction mechanic anywhere in this
//    codebase (no trades, no waivers, no roster moves at all). This is a
//    real, specific extension point for whoever builds that system later
//    (same "computed hook, not yet acted on" pattern as
//    reassignmentReaction.js's requestsTrade/benchWorthy flags) — NOT
//    approximated with a loose proxy here, per explicit direction.
//
// Not wired into engine/season.js's simulateSeason(): this app has no
// season-to-season progression loop at all (simulateSeason() plays one
// fixed schedule once; growthModel.js/development.js have the same
// "real, validated, standalone" status today, never called from that
// loop either). advanceCareerForRoster() below is real and tested,
// ready for a future season-advancement driver to call at a season
// boundary — which matches where this mechanic belongs anyway, not
// mid-game.

import { RATING_SCALE, HITTING_ATTRIBUTES, BASERUNNING_ATTRIBUTES, DEFENSE_ATTRIBUTES, PITCHING_ATTRIBUTES, INJURY_SEVERITIES } from '../models/constants.js';
import { getAge } from '../models/Player.js';
import { getManagerAge } from '../models/Manager.js';

// Below this age, retirement probability is 0 regardless of rating —
// keeps young busts/prospects from ever reading as "in decline."
const RETIREMENT_DECLINE_MIN_AGE = 33;

// Age-bracketed base probability — 0 below 32, rising through the
// high-30s/40s, no hard cutoff. Illustrative placeholder, needs real
// playtesting like every other numeric constant in this project.
const RETIREMENT_AGE_CURVE = Object.freeze([
  { maxAge: 32, probability: 0 },
  { maxAge: 34, probability: 0.02 },
  { maxAge: 36, probability: 0.06 },
  { maxAge: 38, probability: 0.14 },
  { maxAge: 40, probability: 0.28 },
  { maxAge: 43, probability: 0.5 },
  { maxAge: Infinity, probability: 0.75 },
]);

// Denominator for the decline term: a full 20-point current-vs-true-potential
// gap (a quarter of the 20-80 scale) maps to the max decline bonus below.
const DECLINE_FULL_GAP = 20;
const RETIREMENT_DECLINE_MAX_BONUS = 0.25;

// "An older player who maybe planned to retire at season's end gets a
// season-ending injury and just calls it there" — a flat bump, not scaled
// by age within the gate (the gate itself is the age signal).
const SEASON_ENDING_INJURY_RETIREMENT_BONUS = 0.3;

function attributeGroupFor(player) {
  return player.isPitcher
    ? PITCHING_ATTRIBUTES
    : [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];
}

function averageRating(player, attributeNames, field) {
  const values = attributeNames.map((name) => player.ratings[name][field]);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// "Decline below career peak" proxy — see file header for why this uses
// truePotential rather than a real tracked peak.
function declineProbabilityBonus(player) {
  const attributes = attributeGroupFor(player);
  const currentAvg = averageRating(player, attributes, 'current');
  const truePotentialAvg = averageRating(player, attributes, 'truePotential');
  const gap = Math.max(0, truePotentialAvg - currentAvg);
  return Math.min(1, gap / DECLINE_FULL_GAP) * RETIREMENT_DECLINE_MAX_BONUS;
}

function baseAgeProbability(age) {
  return RETIREMENT_AGE_CURVE.find((bracket) => age <= bracket.maxAge).probability;
}

/**
 * @param {object} player - Player
 * @param {object} [options]
 * @param {Date} [options.asOfDate] - defaults to now.
 * @param {{severity: string}|null} [options.injuryStatus] - this player's
 *   current injury, if any (same shape injuries.js/season.js already use).
 * @returns {number} 0-1
 */
export function computeRetirementProbability(player, options = {}) {
  const asOfDate = options.asOfDate ?? new Date();
  const injuryStatus = options.injuryStatus ?? null;

  if (injuryStatus?.severity === INJURY_SEVERITIES.CAREER_ENDING) return 1;

  const age = getAge(player, asOfDate) ?? RATING_SCALE.AVERAGE;
  let probability = baseAgeProbability(age);

  if (age >= RETIREMENT_DECLINE_MIN_AGE) {
    probability += declineProbabilityBonus(player);
    if (injuryStatus?.severity === INJURY_SEVERITIES.SEASON_ENDING) {
      probability += SEASON_ENDING_INJURY_RETIREMENT_BONUS;
    }
  }

  return Math.min(1, probability);
}

/**
 * @param {object} player - Player
 * @param {() => number} rng
 * @param {object} [options] - see computeRetirementProbability
 * @returns {boolean}
 */
export function rollRetirement(player, rng, options = {}) {
  const probability = computeRetirementProbability(player, options);
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  return rng() < probability;
}

function rosterPlayerLists(roster) {
  return { lineup: roster.lineup, rotation: roster.rotation, bullpen: roster.bullpen, bench: roster.bench };
}

/**
 * End-of-season-only career advancement: rolls retirement once per player
 * across a full roster, filtering out anyone who retires. NOT meant to be
 * called mid-season/per-game (see file header) — real retirement decisions
 * happen at a season boundary, not mid-schedule.
 * @param {{lineup: object[], rotation: object[], bullpen: object[], bench: object[]}} roster
 * @param {() => number} rng
 * @param {object} [options]
 * @param {Date} [options.asOfDate]
 * @param {Map<string, {severity: string}>} [options.injuryStatusById] - same
 *   map shape/ownership season.js already builds.
 * @returns {{roster: object, retiredPlayerIds: string[]}}
 */
export function advanceCareerForRoster(roster, rng, options = {}) {
  const asOfDate = options.asOfDate ?? new Date();
  const injuryStatusById = options.injuryStatusById ?? new Map();
  const retiredPlayerIds = [];

  function keepIfActive(player) {
    const injuryStatus = injuryStatusById.get(player.id) ?? null;
    const retired = rollRetirement(player, rng, { asOfDate, injuryStatus });
    if (retired) retiredPlayerIds.push(player.id);
    return !retired;
  }

  const lists = rosterPlayerLists(roster);
  const filtered = {};
  for (const [key, players] of Object.entries(lists)) {
    filtered[key] = players.filter(keepIfActive);
  }

  return { roster: filtered, retiredPlayerIds };
}

// Manager Career Lifecycle (managers.md) — retirement only. Deliberately a
// much simpler formula than player retirement: no decline term (managers
// don't have current-vs-truePotential ratings — their sliders are stable
// tendencies, not skills that erode) and no injury terms (managers don't
// get injured in this sim). "Tuned older... window should sit meaningfully
// later than a player's" per the doc — real MLB managers commonly work
// into their 60s/70s, unlike players. Same "standalone and unwired" status
// as player retirement above: no season-to-season loop exists to call this
// from. Firing/Rehiring/Hall of Fame eligibility/WBC selection are NOT
// built here — see baseball-sim/CLAUDE.md's "what's not built yet" for the
// specific missing prerequisite each one is blocked on (no chemistry/
// owner-patience fields on Team, no Scripted Event framework, no HOF
// system, the already-deferred international tournament).
const MANAGER_RETIREMENT_AGE_CURVE = Object.freeze([
  { maxAge: 54, probability: 0 },
  { maxAge: 60, probability: 0.03 },
  { maxAge: 65, probability: 0.08 },
  { maxAge: 70, probability: 0.18 },
  { maxAge: 75, probability: 0.35 },
  { maxAge: Infinity, probability: 0.6 },
]);

/**
 * @param {object} manager - Manager
 * @param {object} [options]
 * @param {Date} [options.asOfDate] - defaults to now.
 * @returns {number} 0-1
 */
export function computeManagerRetirementProbability(manager, options = {}) {
  const asOfDate = options.asOfDate ?? new Date();
  const age = getManagerAge(manager, asOfDate) ?? MANAGER_RETIREMENT_AGE_CURVE[0].maxAge;
  return MANAGER_RETIREMENT_AGE_CURVE.find((bracket) => age <= bracket.maxAge).probability;
}

/**
 * @param {object} manager - Manager
 * @param {() => number} rng
 * @param {object} [options] - see computeManagerRetirementProbability
 * @returns {boolean}
 */
export function rollManagerRetirement(manager, rng, options = {}) {
  return rng() < computeManagerRetirementProbability(manager, options);
}
