// College System — player-pathway.md. Phase 3 of the "Path to Draft,
// Minors & Free Agency" arc (see baseball-sim/CLAUDE.md). The single
// biggest gap in the amateur pathway: Phase 2 shipped with every drafted
// player signing immediately at a 100% placeholder rate, but in reality
// most real draftees come THROUGH college, not straight from a HS class.
//
// **Abstracted, not simulated** — no schedules/box scores/games, exactly
// like the doc specifies. A school's only real effect is a development-
// curve modifier, applied through `engine/growthModel.js`'s existing
// `locationModifier` parameter — a genuine extension point already built
// and reserved ahead of time "for the future college-prestige/specialty
// system" (its own header comment says so verbatim). No changes needed to
// growthModel.js itself.
//
// **NHL-style draft-and-follow, reconciled with a separate user-specified
// refusal branch**: the doc's main framing is that a team's rights persist
// through a drafted player's whole college career. Separately, the user
// specified a rare "outright refuses to sign" outcome where the player
// becomes an unattached free agent immediately, not bound to any team.
// Every draft selection rolls refusal first (rollDraftOutcome); everyone
// else's rights are established, and a real sign-vs-stay value comparison
// (NIL-ish value vs. a round-anchored signing-bonus proxy) decides the
// rest, exactly matching the doc's own Joe Smith worked example. A player
// who ALREADY has rights held from a prior season's draft does not
// re-enter this year's draft pool at all (he's not on the market — no
// other team can draft him away) — he just faces his own annual sign-vs-
// stay decision directly with his own rights-holding team
// (rollClaimedPlayerDecision), no refusal roll a second time.
//
// **Three population-realism problems, all addressed here** (flagged
// explicitly, not just asserted):
// 1. Season-1 cold start — an empty college system would take 3+ real
//    seasons to populate years 2-4 on its own. `seedInitialCollegePopulation`
//    bootstraps all 4 class years at once, once, at season 1 only.
// 2. Unbounded aging free-agent pool — `rollFreeAgentRetirement` is a real,
//    steep, dedicated age curve (NOT engine/retirement.js's established-pro
//    curves, wrong context/age scale) that actually removes players from
//    `freeAgentPoolById`, reaching effective certainty by the late 20s.
// 3. Elite-player statistical inflation — an ever-growing, never-pruned
//    pool would eventually accumulate an implausible number of genuinely
//    elite players by sample-size math alone. Two things keep this
//    bounded: (a) `resolveDraft`'s existing best-available-by-scoutedPotential
//    selection means a genuinely elite player is essentially never passed
//    over unless 500+ *better* players also exist in that exact year's
//    pool (which requires the backlog to already be broken); (b) the
//    free-agent retirement curve above caps how large that backlog can
//    ever get. `validate:college` verifies this empirically over a real
//    multi-season run, not just by construction.

import { resolveDraft, scoutedScore } from './draft.js';
import { advanceDevelopmentPeriod } from './growthModel.js';
import { sectionKeyForPosition } from './minorLeagues.js';
import { generatePlayer, generatePlayers } from '../models/generation/playerGenerator.js';
import { pick } from '../models/generation/random.js';
import { getAge } from '../models/Player.js';
import { COLLEGE_SCHOOLS, COLLEGE_SCHOOLS_BY_ID, locationModifierForSchool } from '../models/seed/collegeSeed.js';
import {
  DEVELOPMENT_LEVELS,
  DRAFT_ROUNDS,
  HS_CLASS_SURPLUS_MULTIPLIER,
  COLLEGE_MAX_YEARS,
  DRAFT_REFUSAL_PROBABILITY,
  COLLEGE_REDSHIRT_TRIGGER_PROBABILITY,
  GRADUATION_RELEASE_PROBABILITY,
  FREE_AGENT_RETIREMENT_AGE_CURVE,
  NIL_SCHOOL_PRESTIGE_WEIGHT,
  NIL_QUALITY_WEIGHT,
  SIGN_VALUE_BASE,
  SIGN_VALUE_ROUND_DECAY,
  STAY_PROBABILITY_SENSITIVITY,
} from '../models/constants.js';

const TEAMS_COUNT = 50;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** @returns {number} 0-1 */
function computeStayProbability(player, school, draftRound) {
  const quality = scoutedScore(player);
  const nilValue = (6 - school.prestigeTier) * NIL_SCHOOL_PRESTIGE_WEIGHT + quality * NIL_QUALITY_WEIGHT;
  const signValue = SIGN_VALUE_BASE - (draftRound - 1) * SIGN_VALUE_ROUND_DECAY;
  return clamp01(0.5 + (nilValue - signValue) * STAY_PROBABILITY_SENSITIVITY);
}

/**
 * A polished college senior starts higher than a fresh HS-direct signee —
 * this phase's own resolution of the doc's flagged "TBD middle ground."
 * @param {number} yearsCompleted - 0 for a fresh HS senior
 */
function levelForYearsCompleted(yearsCompleted) {
  if (yearsCompleted <= 1) return 'ROOKIE';
  if (yearsCompleted === 2) return 'A';
  if (yearsCompleted === 3) return 'AA';
  return 'AAA';
}

function assignSignedPlayerToLevel(player, teamId, level, affiliateRosterByClubId) {
  const clubId = `${teamId}-${level}`;
  const roster = affiliateRosterByClubId.get(clubId);
  if (!roster) return; // no affiliate system wired up for this caller
  const sectionKey = sectionKeyForPosition(player.primaryPosition);
  const signedPlayer = { ...player, developmentLevel: DEVELOPMENT_LEVELS[level], teamId };
  affiliateRosterByClubId.set(clubId, { ...roster, [sectionKey]: [...roster[sectionKey], signedPlayer] });
}

function shiftBirthdateYears(player, yearsEarlier) {
  const d = new Date(player.birthdate);
  d.setFullYear(d.getFullYear() - yearsEarlier);
  return { ...player, birthdate: d.toISOString().slice(0, 10) };
}

/**
 * This year's fresh incoming HS class, generated at a real surplus over
 * the pick count (see constants.js's HS_CLASS_SURPLUS_MULTIPLIER header for
 * why this is kept moderate, not real-MLB-scale). Reuses generatePlayer()
 * completely unmodified except forcing birthNation to USA — Phase 4
 * (engine/internationalAcademy.js) added a real international pipeline as
 * the correct destination for non-USA-born amateurs, so a HS class letting
 * `generatePlayer`'s internal `pickBirthNation` roll freely (as it did
 * before this phase) would silently run e.g. a Dominican-born player
 * through the domestic HS/college pipeline instead. `generatePlayer`
 * spreads `options.overrides` last in its `createPlayer({...})` call, so
 * `overrides.birthNation` wins over the internal roll; the small resulting
 * wrinkle (heritageNations is still rolled against the pre-override,
 * randomly-drawn nation) is accepted here as cosmetic — see
 * engine/internationalAcademy.js's header for why the academy generator
 * handles this differently.
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @param {string} idPrefix - must be unique per season so ids never collide across years
 * @param {number} [count]
 * @returns {object[]} Player[]
 */
export function generateHsClass(rng, asOfDate, idPrefix, count = DRAFT_ROUNDS * TEAMS_COUNT * HS_CLASS_SURPLUS_MULTIPLIER) {
  return generatePlayers(count, { rng, asOfDate, idPrefix, overrides: { birthNation: 'USA' } });
}

/**
 * One-time season-1 bootstrap: backfills all 4 college class years at once
 * so the system starts with a realistic, immediately-populated pyramid
 * instead of an empty one that takes 3+ real seasons to fill on its own.
 * Each cohort is generated via the normal generatePlayer() (17-18 as of
 * asOfDate), then has its birthdate shifted back by however many extra
 * years that cohort has "already completed," with that many real
 * advanceDevelopmentPeriod college-year calls fast-forwarded so age and
 * developmental progress land consistently together. Every real season
 * after this one only ever generates a true incoming freshman class —
 * this runs exactly once.
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ collegeEnrollmentById: Map<string, object>, collegePlayersById: Map<string, object> }}
 */
export function seedInitialCollegePopulation(rng, asOfDate) {
  const collegeEnrollmentById = new Map();
  const collegePlayersById = new Map();
  const cohortSize = DRAFT_ROUNDS * TEAMS_COUNT * HS_CLASS_SURPLUS_MULTIPLIER;
  let counter = 0;

  for (let yearInSchool = 1; yearInSchool <= COLLEGE_MAX_YEARS; yearInSchool++) {
    const yearsAlreadyCompleted = yearInSchool - 1;
    for (let i = 0; i < cohortSize; i++) {
      let player = generatePlayer({ rng, asOfDate, overrides: { id: `college-seed-y${yearInSchool}-${counter++}` } });
      const school = pick(rng, COLLEGE_SCHOOLS);
      const modifier = locationModifierForSchool(school);

      if (yearsAlreadyCompleted > 0) {
        player = shiftBirthdateYears(player, yearsAlreadyCompleted);
        for (let completed = 1; completed <= yearsAlreadyCompleted; completed++) {
          const pastAsOfDate = new Date(asOfDate);
          pastAsOfDate.setFullYear(pastAsOfDate.getFullYear() - (yearsAlreadyCompleted - completed));
          player = advanceDevelopmentPeriod(player, {
            rng,
            asOfDate: pastAsOfDate,
            levelOverride: DEVELOPMENT_LEVELS.COLLEGE,
            locationModifier: modifier,
          });
        }
      }

      collegeEnrollmentById.set(player.id, {
        schoolId: school.id,
        yearInSchool,
        redshirtUsed: false,
        draftRightsTeamId: null,
        draftRound: null,
      });
      collegePlayersById.set(player.id, player);
    }
  }

  return { collegeEnrollmentById, collegePlayersById };
}

/** @returns {object} the new collegeEnrollmentById entry for a freshly-enrolled freshman */
export function enrollFreshman(player, rng) {
  const school = pick(rng, COLLEGE_SCHOOLS);
  return { schoolId: school.id, yearInSchool: 1, redshirtUsed: false, draftRightsTeamId: null, draftRound: null };
}

/**
 * One real college year: growth (advanceDevelopmentPeriod with the
 * school's locationModifier), a redshirt-trigger roll (a proxy for
 * "appeared in fewer than 25% of games," since no games are simulated),
 * and eligibility bookkeeping.
 * @param {object} enrollment
 * @param {object} player
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ player: object, enrollment: object, graduated: boolean }}
 */
export function advanceCollegeYear(enrollment, player, rng, asOfDate) {
  const school = COLLEGE_SCHOOLS_BY_ID.get(enrollment.schoolId);
  const grown = advanceDevelopmentPeriod(player, {
    rng,
    asOfDate,
    levelOverride: DEVELOPMENT_LEVELS.COLLEGE,
    locationModifier: locationModifierForSchool(school),
  });

  let redshirtUsed = enrollment.redshirtUsed;
  let yearInSchool = enrollment.yearInSchool;
  if (!redshirtUsed && rng() < COLLEGE_REDSHIRT_TRIGGER_PROBABILITY) {
    redshirtUsed = true; // an extra real year, doesn't count against eligibility
  } else {
    yearInSchool += 1;
  }

  return {
    player: grown,
    enrollment: { ...enrollment, yearInSchool, redshirtUsed },
    graduated: yearInSchool > COLLEGE_MAX_YEARS,
  };
}

/**
 * The rare, immediate "wants no part of this team" outcome (user-specified,
 * distinct from the doc's own main draft-and-follow framing), rolled once
 * at the moment ANY player is newly selected in the draft. Everyone who
 * doesn't refuse faces the same sign-vs-stay value comparison
 * `rollClaimedPlayerDecision` uses for an already-rights-held player's
 * later annual decisions.
 * @returns {{outcome: 'refused'|'signed'|'deferred'}}
 */
export function rollDraftOutcome(player, school, draftRound, rng) {
  if (rng() < DRAFT_REFUSAL_PROBABILITY) return { outcome: 'refused' };
  return { outcome: rng() < computeStayProbability(player, school, draftRound) ? 'deferred' : 'signed' };
}

/**
 * The annual sign-now-with-my-own-team vs. stay decision for a player who
 * ALREADY has rights held from a prior season — no refusal roll (he
 * already accepted this team's rights when first drafted).
 * @returns {{outcome: 'signed'|'deferred'}}
 */
export function rollClaimedPlayerDecision(player, school, draftRound, rng) {
  return { outcome: rng() < computeStayProbability(player, school, draftRound) ? 'deferred' : 'signed' };
}

/**
 * The dedicated free-agent-pool retirement roll (constants.js's
 * FREE_AGENT_RETIREMENT_AGE_CURVE) — see file header for why this can't
 * just be engine/retirement.js's established-pro curve.
 * @returns {boolean}
 */
export function rollFreeAgentRetirement(player, rng, asOfDate = new Date()) {
  const age = getAge(player, asOfDate) ?? 0;
  const probability = FREE_AGENT_RETIREMENT_AGE_CURVE.find((bracket) => age <= bracket.maxAge).probability;
  return rng() < probability;
}

function processCollegeYearAdvance(playerId, ctx) {
  const { collegeEnrollmentById, collegePlayersById, freeAgentPoolById, affiliateRosterByClubId, rng, asOfDate, summary } = ctx;
  const player = collegePlayersById.get(playerId);
  const enrollment = collegeEnrollmentById.get(playerId);
  const { player: grown, enrollment: nextEnrollment, graduated } = advanceCollegeYear(enrollment, player, rng, asOfDate);

  if (!graduated) {
    collegePlayersById.set(playerId, grown);
    collegeEnrollmentById.set(playerId, nextEnrollment);
    return;
  }

  collegeEnrollmentById.delete(playerId);
  collegePlayersById.delete(playerId);

  if (nextEnrollment.draftRightsTeamId) {
    // "the team must make an active choice — assign him to a level, or
    // release him" (player-pathway.md) — real MLB teams virtually always
    // sign a senior they've developed for 4 years, so release stays rare.
    if (rng() < GRADUATION_RELEASE_PROBABILITY) {
      freeAgentPoolById.set(playerId, grown);
      summary.graduatedReleased++;
    } else {
      assignSignedPlayerToLevel(grown, nextEnrollment.draftRightsTeamId, levelForYearsCompleted(COLLEGE_MAX_YEARS), affiliateRosterByClubId);
      summary.graduatedSigned++;
    }
  } else {
    // Never drafted, or refused earlier — a real free agent, matching the
    // doc's "completes college without ever being drafted... free agent."
    freeAgentPoolById.set(playerId, grown);
    summary.graduatedUnclaimed++;
  }
}

/**
 * The season-boundary orchestrator: resolves this year's draft against the
 * fresh HS class plus every unclaimed (never-drafted-or-refused) returning
 * college player, processes each selection's refusal/sign/defer outcome,
 * enrolls undrafted fresh HS players as freshmen, advances every other
 * enrollee one college year, resolves already-claimed players' own annual
 * sign-vs-stay decision (no draft competition — they're not on the
 * market), resolves graduations, and prunes the free-agent pool.
 * @param {object[]} picks - engine/draft.js's buildDraftPicks() output
 * @param {object[]} freshHsClass - this season's generateHsClass() output
 * @param {Map<string, object>} collegeEnrollmentById - mutated in place
 * @param {Map<string, object>} collegePlayersById - mutated in place
 * @param {Map<string, object>} freeAgentPoolById - mutated in place
 * @param {Map<string, object>} affiliateRosterByClubId - mutated in place
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{
 *   summary: {newEnrollments: number, refusals: number, deferred: number, signedFromCollege: number, graduatedSigned: number, graduatedReleased: number, graduatedUnclaimed: number, freeAgentRetirements: number},
 *   selections: {pickId: string, round: number, pickNumber: number, teamId: string, playerId: string, firstName: string, lastName: string, primaryPosition: string, isPitcher: boolean, fromCollege: boolean, outcome: string}[]
 * }}
 */
export function runCollegePathway(picks, freshHsClass, collegeEnrollmentById, collegePlayersById, freeAgentPoolById, affiliateRosterByClubId, rng, asOfDate) {
  const summary = {
    newEnrollments: 0, refusals: 0, deferred: 0, signedFromCollege: 0,
    graduatedSigned: 0, graduatedReleased: 0, graduatedUnclaimed: 0, freeAgentRetirements: 0,
  };
  const ctx = { collegeEnrollmentById, collegePlayersById, freeAgentPoolById, affiliateRosterByClubId, rng, asOfDate, summary };

  const unclaimedReturningIds = [];
  const claimedReturningIds = [];
  for (const [playerId, enrollment] of collegeEnrollmentById) {
    (enrollment.draftRightsTeamId ? claimedReturningIds : unclaimedReturningIds).push(playerId);
  }
  const unclaimedReturningPlayers = unclaimedReturningIds.map((id) => collegePlayersById.get(id));

  // 1. This year's actual draft — only unclaimed players are on the market.
  const combinedPool = [...freshHsClass, ...unclaimedReturningPlayers];
  const combinedById = new Map(combinedPool.map((p) => [p.id, p]));
  const { selections } = resolveDraft(picks, combinedPool);
  const selectedIds = new Set(selections.map((s) => s.playerId));
  // Enriched with display fields + this pick's outcome, for the Draft page —
  // same self-contained-for-the-UI convention as Phase 2's draftResult.
  const enrichedSelections = [];

  for (const selection of selections) {
    const player = combinedById.get(selection.playerId);
    const existingEnrollment = collegeEnrollmentById.get(player.id); // undefined if fresh HS
    const yearsCompleted = existingEnrollment ? existingEnrollment.yearInSchool - 1 : 0;
    const school = existingEnrollment
      ? COLLEGE_SCHOOLS_BY_ID.get(existingEnrollment.schoolId)
      : pick(rng, COLLEGE_SCHOOLS); // a candidate/hypothetical school, becomes real if he defers

    const decision = rollDraftOutcome(player, school, selection.round, rng);
    enrichedSelections.push({
      ...selection,
      firstName: player.firstName,
      lastName: player.lastName,
      primaryPosition: player.primaryPosition,
      isPitcher: player.isPitcher,
      fromCollege: !!existingEnrollment,
      outcome: decision.outcome,
    });

    if (decision.outcome === 'refused') {
      summary.refusals++;
      collegeEnrollmentById.set(player.id, {
        schoolId: school.id,
        yearInSchool: existingEnrollment?.yearInSchool ?? 1,
        redshirtUsed: existingEnrollment?.redshirtUsed ?? false,
        draftRightsTeamId: null,
        draftRound: null,
      });
      collegePlayersById.set(player.id, player);
      if (!existingEnrollment) summary.newEnrollments++;
      continue;
    }

    if (decision.outcome === 'signed') {
      assignSignedPlayerToLevel(player, selection.teamId, levelForYearsCompleted(yearsCompleted), affiliateRosterByClubId);
      if (existingEnrollment) {
        collegeEnrollmentById.delete(player.id);
        collegePlayersById.delete(player.id);
      }
      summary.signedFromCollege++;
      continue;
    }

    // deferred
    summary.deferred++;
    collegeEnrollmentById.set(player.id, {
      schoolId: school.id,
      yearInSchool: existingEnrollment?.yearInSchool ?? 1,
      redshirtUsed: existingEnrollment?.redshirtUsed ?? false,
      draftRightsTeamId: selection.teamId,
      draftRound: selection.round,
    });
    collegePlayersById.set(player.id, player);
    if (!existingEnrollment) summary.newEnrollments++;
  }

  // 2. Fresh HS not drafted -> enroll as freshmen (unclaimed).
  for (const player of freshHsClass) {
    if (selectedIds.has(player.id)) continue;
    collegeEnrollmentById.set(player.id, enrollFreshman(player, rng));
    collegePlayersById.set(player.id, player);
    summary.newEnrollments++;
  }

  // 3. Unclaimed returning players not drafted this year -> advance a year.
  for (const id of unclaimedReturningIds) {
    if (selectedIds.has(id)) continue;
    processCollegeYearAdvance(id, ctx);
  }

  // 4. Already-claimed players -> their own annual decision, no draft competition.
  for (const id of claimedReturningIds) {
    const player = collegePlayersById.get(id);
    const enrollment = collegeEnrollmentById.get(id);
    const school = COLLEGE_SCHOOLS_BY_ID.get(enrollment.schoolId);
    const decision = rollClaimedPlayerDecision(player, school, enrollment.draftRound, rng);

    if (decision.outcome === 'signed') {
      assignSignedPlayerToLevel(player, enrollment.draftRightsTeamId, levelForYearsCompleted(enrollment.yearInSchool - 1), affiliateRosterByClubId);
      collegeEnrollmentById.delete(id);
      collegePlayersById.delete(id);
      summary.signedFromCollege++;
      continue;
    }
    processCollegeYearAdvance(id, ctx);
  }

  // 5. Prune the free-agent pool — the real fix for unbounded growth.
  for (const [playerId, player] of [...freeAgentPoolById]) {
    if (rollFreeAgentRetirement(player, rng, asOfDate)) {
      freeAgentPoolById.delete(playerId);
      summary.freeAgentRetirements++;
    }
  }

  return { summary, selections: enrichedSelections };
}
