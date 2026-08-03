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
// 3. DFA'd-and-not-picked-up — BUILT, finally. This sat as a deliberate,
//    named extension point from the day this file was written ("no DFA/
//    waiver/roster-transaction mechanic anywhere in this codebase") all
//    the way through the 50-man Roster System arc, which shipped every
//    prerequisite it was waiting on: the 50-man pool (CLAUDE.md §34),
//    real Options/Waivers/DFA (§38), and trades (§39). engine/
//    optionsWaiversDfa.js's designateForAssignment now passes its
//    resolved outcome in as `options.dfaOutcome`.
//
//    Only the two UNCLAIMED outcomes carry a bump, and they carry
//    DIFFERENT ones — the asymmetry is deliberate and load-bearing:
//    - CLAIMED isn't passed at all. He WAS picked up; another club wants
//      him. That's the opposite of the trigger.
//    - RETURNED_TO_ORIGINAL_CLUB isn't either — a failed Rule 5 pick is a
//      young prospect going back to his own org (Rule 5 exposure is gated
//      on 4-5 minor-league seasons), not a career ending.
//    - OUTRIGHT_ASSIGNED carries the LARGER bump, because it is the only
//      retirement roll he will EVER get. Verified while building this:
//      engine/leagueProgression.js's advanceOnePlayer only walks MLB
//      active rosters, so affiliate players never roll retirement at all,
//      and an outrighted player can't escape via minor-league free agency
//      either (engine/serviceTime.js's isMinorLeagueFreeAgent requires
//      !wasEverProtected, and being outrighted means he was on the 50-man
//      by definition). Without this, a 38-year-old outrighted to AAA sits
//      there permanently.
//    - REFUSED_FREE_AGENCY carries a SMALLER one, for two reasons that
//      point the same way: he actively chose to keep playing rather than
//      accept the assignment, and he lands in establishedFreeAgentPoolById,
//      which engine/freeAgency.js's advanceEstablishedFreeAgentPool
//      already prunes with this same rollRetirement every season. A
//      full-size bump here would double-count against a roll that exists.
//
//    Gated on the same age threshold as the SEASON_ENDING injury bump
//    below, and for the same reason: being buried or released is a real
//    career signal for a veteran and simple adversity for a 26-year-old.
//    Measured against real simulated state before choosing the gate —
//    27.2% of active players clear age 33, so this is genuinely reachable
//    rather than decorative.
//
// Not wired into engine/season.js's simulateSeason(), and correctly so —
// retirement belongs at a season boundary, not mid-schedule. (This
// paragraph used to say no season-to-season loop existed at all; that
// stopped being true at CLAUDE.md §20. engine/leagueProgression.js's
// advanceOnePlayer now calls rollRetirement for real, once per active-
// roster player per season boundary, and engine/freeAgency.js's
// advanceEstablishedFreeAgentPool + engine/minorLeagueFreeAgency.js do
// the same for their own pools.) Worth knowing: those are the ONLY
// automatic callers — players sitting on an AAA/AA/A/Rookie affiliate
// roster never roll retirement at all, which is precisely the gap
// trigger 3's OUTRIGHT_ASSIGNED bump exists to close for the one case
// this file can actually see.

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

// DFA'd and nobody picked him up — see trigger 3 in the file header for
// why these two differ rather than sharing one constant. Flat bumps
// within the age gate, same shape as the injury bump above. Illustrative
// placeholders needing real playtesting, like every other numeric
// constant in this project; the resulting probability curve is printed
// by validate:ows so the shape is visible rather than implied. Chosen so
// a just-past-the-gate veteran mostly keeps playing while a genuinely old
// one mostly doesn't. MEASURED for a player at full potential (i.e. with
// the decline term at zero), outright-assigned: 0.24 at 33, 0.28 at 36,
// 0.50 at 39, 0.72 at 42 — with the refusal bump running 0.12 lower
// throughout. A genuinely declined player adds declineProbabilityBonus
// on top of those, up to a further +0.25.
const DFA_RETIREMENT_BONUS_BY_OUTCOME = Object.freeze({
  OUTRIGHT_ASSIGNED: 0.22,
  REFUSED_FREE_AGENCY: 0.1,
});

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
 * @param {'OUTRIGHT_ASSIGNED'|'REFUSED_FREE_AGENCY'|null} [options.dfaOutcome] -
 *   the resolved outcome of a DFA that just went UNCLAIMED, passed by
 *   engine/optionsWaiversDfa.js's designateForAssignment. See trigger 3 in
 *   the file header. CLAIMED and RETURNED_TO_ORIGINAL_CLUB are deliberately
 *   never passed; an unrecognized value is simply ignored rather than
 *   throwing, matching how injuryStatus treats a severity it doesn't act on.
 * @returns {number} 0-1
 */
export function computeRetirementProbability(player, options = {}) {
  const asOfDate = options.asOfDate ?? new Date();
  const injuryStatus = options.injuryStatus ?? null;
  const dfaOutcome = options.dfaOutcome ?? null;

  if (injuryStatus?.severity === INJURY_SEVERITIES.CAREER_ENDING) return 1;

  const age = getAge(player, asOfDate) ?? RATING_SCALE.AVERAGE;
  let probability = baseAgeProbability(age);

  if (age >= RETIREMENT_DECLINE_MIN_AGE) {
    probability += declineProbabilityBonus(player);
    if (injuryStatus?.severity === INJURY_SEVERITIES.SEASON_ENDING) {
      probability += SEASON_ENDING_INJURY_RETIREMENT_BONUS;
    }
    probability += DFA_RETIREMENT_BONUS_BY_OUTCOME[dfaOutcome] ?? 0;
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
