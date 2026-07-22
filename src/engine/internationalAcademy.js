// International Academy + International Draft — player-pathway.md's
// International Pathway section. Phase 4 of the "Path to Draft, Minors &
// Free Agency" arc (see baseball-sim/CLAUDE.md), closely mirroring
// engine/college.js's already-validated architecture and reusing
// engine/draft.js's pool-agnostic primitives exactly the way College does.
//
// **Abstracted, not simulated** — same as College: no schedules/box
// scores/games, only a development-curve modifier via
// engine/growthModel.js's existing `locationModifier` parameter. No changes
// needed to growthModel.js itself; a new DEVELOPMENT_LEVELS.INTERNATIONAL_
// ACADEMY entry (constants.js) is its own variance bucket, not a reuse of
// COLLEGE's.
//
// **Three real divergences from College, all deliberate (see the approved
// build plan's design decisions for the full reasoning)**:
// 1. Fixed 3-year window (INTERNATIONAL_ACADEMY_YEARS), not variable 4-year
//    eligibility — no redshirt concept exists here.
// 2. No draft-and-follow rights-holding — nothing in the doc's
//    International Pathway section gives an analogous persistent-rights
//    concept, so every enrollee (fresh cohort included) is eligible for
//    every year's international draft until he exits.
// 3. A signing-WINDOW-failure roll (`rollInternationalDraftOutcome`)
//    replaces College's refusal mechanic — the doc's own literal two-step
//    "Draft Day -> signing window -> Signing Day" framing, not an active
//    refusal (no NIL-vs-signing-bonus tension exists internationally: "NIL
//    system doesn't apply the same way to international signings...
//    signing is generally assumed").
//
// **A real, SEPARATE free-agent pool + retirement curve** (per explicit
// user decision, not merged with College's freeAgentPoolById) — academy
// exit is a FIXED ~20-21 age point (3 years from a 17-18 creation age),
// unlike college graduation's more variable ~22-24, so
// INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE is shifted ~2 years
// younger than FREE_AGENT_RETIREMENT_AGE_CURVE. This is the real fix for
// unbounded population growth here too — same population-realism concern
// College's own header documents, addressed the same way (a real, steep,
// dedicated age curve that actually removes players from the pool).
//
// **The "accepted to US college" branch is built for real** (per explicit
// user decision) — `rollCollegeAcceptance` is rolled annually per enrolled
// player (not once at creation, since that would decide the outcome before
// any development happens); when it fires, the player is folded directly
// into College's own real `collegeEnrollmentById`/`collegePlayersById` via
// its exported `enrollFreshman()` — no duplicated logic.
//
// **Known, pre-existing gap, not this phase's to fix**: `generatePlayer()`
// draws first/last names from `namePools.js`'s USA-only pools regardless of
// birthNation (player-names-and-bio.md's own "full per-nation pools...
// explicitly deferred bulk-data-generation task"). An academy player from
// Japan or the Dominican Republic will still get a USA-sounding name until
// that deferred pass happens — flagged, not silently worked around here.

import { resolveDraft, computeCombinedReverseStandingsOrder, buildDraftPicks } from './draft.js';
import { advanceDevelopmentPeriod } from './growthModel.js';
import { sectionKeyForPosition } from './minorLeagues.js';
import { enrollFreshman } from './college.js';
import { generatePlayer } from '../models/generation/playerGenerator.js';
import { pick } from '../models/generation/random.js';
import { getAge } from '../models/Player.js';
import { pickInternationalBirthNation } from '../models/generation/nationalityPools.js';
import {
  INTERNATIONAL_ACADEMIES_BY_ID,
  INTERNATIONAL_ACADEMIES_BY_COUNTRY,
  locationModifierForAcademy,
} from '../models/seed/internationalAcademySeed.js';
import {
  DEVELOPMENT_LEVELS,
  INTERNATIONAL_DRAFT_ROUNDS,
  INTERNATIONAL_CLASS_SURPLUS_MULTIPLIER,
  INTERNATIONAL_ACADEMY_YEARS,
  COLLEGE_ACCEPTANCE_TRIGGER_PROBABILITY,
  INTERNATIONAL_SIGNING_FAILURE_PROBABILITY,
  INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE,
} from '../models/constants.js';

const TEAMS_COUNT = 50;

function shiftBirthdateYears(player, yearsEarlier) {
  const d = new Date(player.birthdate);
  d.setFullYear(d.getFullYear() - yearsEarlier);
  return { ...player, birthdate: d.toISOString().slice(0, 10) };
}

/**
 * A raw teenage international signee starts at Rookie, same as a HS
 * draftee; a player who's spent a year or two developing in the academy
 * starts a tick higher — this phase's own resolution of the doc's flagged
 * "middle ground... TBD" for the international side (a simpler 2-tier
 * version of College's 4-tier levelForYearsCompleted, since there's no
 * 4-year range here).
 * @param {number} yearsCompleted - 0 for a fresh, just-drafted signee
 */
function levelForAcademyYearsCompleted(yearsCompleted) {
  return yearsCompleted <= 1 ? 'ROOKIE' : 'A';
}

function assignSignedAcademyPlayerToLevel(player, teamId, level, affiliateRosterByClubId) {
  const clubId = `${teamId}-${level}`;
  const roster = affiliateRosterByClubId.get(clubId);
  if (!roster) return; // no affiliate system wired up for this caller
  const sectionKey = sectionKeyForPosition(player.primaryPosition);
  const signedPlayer = { ...player, developmentLevel: DEVELOPMENT_LEVELS[level], teamId };
  affiliateRosterByClubId.set(clubId, { ...roster, [sectionKey]: [...roster[sectionKey], signedPlayer] });
}

function pickAcademyForCountry(rng, countryId) {
  return pick(rng, INTERNATIONAL_ACADEMIES_BY_COUNTRY.get(countryId));
}

/**
 * This year's fresh incoming academy cohort — country picked first
 * (demographically weighted via pickInternationalBirthNation), the
 * specific academy within that country second (uniform, a flavor
 * decision). Unlike generateHsClass, returns {players, enrollments} rather
 * than a flat array: every academy player needs a country+academy
 * assignment AT CREATION (a HS senior only gets a school after missing the
 * domestic draft).
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @param {string} idPrefix - must be unique per season so ids never collide across years
 * @param {number} [count]
 * @returns {{ players: object[], enrollments: Map<string, object> }}
 */
export function generateAcademyClass(
  rng,
  asOfDate,
  idPrefix,
  count = INTERNATIONAL_DRAFT_ROUNDS * TEAMS_COUNT * INTERNATIONAL_CLASS_SURPLUS_MULTIPLIER
) {
  const players = [];
  const enrollments = new Map();
  for (let i = 0; i < count; i++) {
    const countryId = pickInternationalBirthNation(rng);
    const academy = pickAcademyForCountry(rng, countryId);
    const player = generatePlayer({
      rng,
      asOfDate,
      overrides: { id: `${idPrefix}-${i}`, birthNation: countryId, heritageNations: [] },
    });
    players.push(player);
    enrollments.set(player.id, { academyId: academy.id, yearInAcademy: 1 });
  }
  return { players, enrollments };
}

/**
 * One-time season-1 bootstrap: backfills all 3 academy class years at once,
 * mirroring seedInitialCollegePopulation exactly (3 cohorts here, not 4).
 * Without this, no returning-academy international draftee would even be
 * possible until year 3 of the whole simulation.
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ academyEnrollmentById: Map<string, object>, academyPlayersById: Map<string, object> }}
 */
export function seedInitialAcademyPopulation(rng, asOfDate) {
  const academyEnrollmentById = new Map();
  const academyPlayersById = new Map();
  const cohortSize = INTERNATIONAL_DRAFT_ROUNDS * TEAMS_COUNT * INTERNATIONAL_CLASS_SURPLUS_MULTIPLIER;
  let counter = 0;

  for (let yearInAcademy = 1; yearInAcademy <= INTERNATIONAL_ACADEMY_YEARS; yearInAcademy++) {
    const yearsAlreadyCompleted = yearInAcademy - 1;
    for (let i = 0; i < cohortSize; i++) {
      const countryId = pickInternationalBirthNation(rng);
      const academy = pickAcademyForCountry(rng, countryId);
      let player = generatePlayer({
        rng,
        asOfDate,
        overrides: { id: `intl-academy-seed-y${yearInAcademy}-${counter++}`, birthNation: countryId, heritageNations: [] },
      });
      const modifier = locationModifierForAcademy(academy);

      if (yearsAlreadyCompleted > 0) {
        player = shiftBirthdateYears(player, yearsAlreadyCompleted);
        for (let completed = 1; completed <= yearsAlreadyCompleted; completed++) {
          const pastAsOfDate = new Date(asOfDate);
          pastAsOfDate.setFullYear(pastAsOfDate.getFullYear() - (yearsAlreadyCompleted - completed));
          player = advanceDevelopmentPeriod(player, {
            rng,
            asOfDate: pastAsOfDate,
            levelOverride: DEVELOPMENT_LEVELS.INTERNATIONAL_ACADEMY,
            locationModifier: modifier,
          });
        }
      }

      academyEnrollmentById.set(player.id, { academyId: academy.id, yearInAcademy });
      academyPlayersById.set(player.id, player);
    }
  }

  return { academyEnrollmentById, academyPlayersById };
}

/**
 * One real academy year: growth only (advanceDevelopmentPeriod with the
 * academy's locationModifier) — no redshirt concept here, unlike College.
 * @param {object} enrollment
 * @param {object} player
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{ player: object, enrollment: object, exited: boolean }}
 */
export function advanceAcademyYear(enrollment, player, rng, asOfDate) {
  const academy = INTERNATIONAL_ACADEMIES_BY_ID.get(enrollment.academyId);
  const grown = advanceDevelopmentPeriod(player, {
    rng,
    asOfDate,
    levelOverride: DEVELOPMENT_LEVELS.INTERNATIONAL_ACADEMY,
    locationModifier: locationModifierForAcademy(academy),
  });
  const yearInAcademy = enrollment.yearInAcademy + 1;
  return {
    player: grown,
    enrollment: { ...enrollment, yearInAcademy },
    exited: yearInAcademy > INTERNATIONAL_ACADEMY_YEARS,
  };
}

/** @returns {boolean} */
export function rollCollegeAcceptance(rng) {
  return rng() < COLLEGE_ACCEPTANCE_TRIGGER_PROBABILITY;
}

/** @returns {{outcome: 'signed'|'unsigned'}} */
export function rollInternationalDraftOutcome(rng) {
  return { outcome: rng() < INTERNATIONAL_SIGNING_FAILURE_PROBABILITY ? 'unsigned' : 'signed' };
}

/**
 * The dedicated international free-agent-pool retirement roll — its own
 * curve (constants.js's INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE),
 * kept separate from College's per explicit user decision.
 * @returns {boolean}
 */
export function rollInternationalFreeAgentRetirement(player, rng, asOfDate = new Date()) {
  const age = getAge(player, asOfDate) ?? 0;
  const probability = INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE.find((bracket) => age <= bracket.maxAge).probability;
  return rng() < probability;
}

/** Thin pass-through, no lottery — the doc gives no international draft-order rules. */
export function computeInternationalDraftOrder(teams, standingsById) {
  return computeCombinedReverseStandingsOrder(teams, standingsById);
}

/**
 * Reuses buildDraftPicks() from draft.js completely UNCHANGED (same order
 * for every round, no snake), remapping ids so they never collide with the
 * domestic draft's own pick-N ids.
 * @param {string[]} order
 * @param {number} [rounds]
 */
export function buildInternationalDraftPicks(order, rounds = INTERNATIONAL_DRAFT_ROUNDS) {
  return buildDraftPicks(order, order, rounds).map((p) => ({ ...p, id: `intl-${p.id}` }));
}

/**
 * The season-boundary orchestrator. Order matters: (1) merge this season's
 * fresh cohort into the live population, (2) roll college acceptance for
 * everyone currently enrolled (fresh cohort included) and fold accepted
 * players into collegeEnrollmentById/collegePlayersById via college.js's
 * OWN enrollFreshman(), (3) resolve this year's international draft
 * against everyone remaining (no rights-holding, so no claimed/unclaimed
 * split like College's), processing signed/unsigned per selection, (4)
 * advance everyone still enrolled one academy year, pruning anyone whose
 * 3-year window just closed into the international free-agent pool, (5)
 * prune that pool via its own retirement curve.
 * @param {object[]} picks - buildInternationalDraftPicks() output
 * @param {object[]} freshAcademyClass - this season's generateAcademyClass() players
 * @param {Map<string, object>} freshAcademyEnrollments - this season's generateAcademyClass() enrollments
 * @param {Map<string, object>} academyEnrollmentById - mutated in place
 * @param {Map<string, object>} academyPlayersById - mutated in place
 * @param {Map<string, object>} collegeEnrollmentById - College's own state, mutated in place
 * @param {Map<string, object>} collegePlayersById - College's own state, mutated in place
 * @param {Map<string, object>} internationalFreeAgentPoolById - mutated in place
 * @param {Map<string, object>} affiliateRosterByClubId - mutated in place
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{
 *   summary: {newAcademyEnrollments: number, collegeAcceptances: number, signed: number, unsigned: number, freeAgentExits: number, freeAgentRetirements: number},
 *   selections: {pickId: string, round: number, pickNumber: number, teamId: string, playerId: string, firstName: string, lastName: string, primaryPosition: string, isPitcher: boolean, countryId: string, outcome: string}[]
 * }}
 */
export function runInternationalPathway(
  picks,
  freshAcademyClass,
  freshAcademyEnrollments,
  academyEnrollmentById,
  academyPlayersById,
  collegeEnrollmentById,
  collegePlayersById,
  internationalFreeAgentPoolById,
  affiliateRosterByClubId,
  rng,
  asOfDate
) {
  const summary = {
    newAcademyEnrollments: freshAcademyClass.length,
    collegeAcceptances: 0,
    signed: 0,
    unsigned: 0,
    freeAgentExits: 0,
    freeAgentRetirements: 0,
  };

  // 1. Merge this season's fresh cohort into the live population.
  for (const player of freshAcademyClass) {
    academyPlayersById.set(player.id, player);
    academyEnrollmentById.set(player.id, freshAcademyEnrollments.get(player.id));
  }

  // 2. Roll college acceptance for everyone currently enrolled (fresh
  // cohort included) — a real fold-in to College's own state, no
  // duplicated enrollment logic.
  const currentIds = [...academyEnrollmentById.keys()];
  const remainingIds = [];
  for (const id of currentIds) {
    if (rollCollegeAcceptance(rng)) {
      const player = academyPlayersById.get(id);
      collegeEnrollmentById.set(id, enrollFreshman(player, rng));
      collegePlayersById.set(id, player);
      academyEnrollmentById.delete(id);
      academyPlayersById.delete(id);
      summary.collegeAcceptances++;
    } else {
      remainingIds.push(id);
    }
  }

  // 3. This year's international draft — everyone still enrolled is
  // eligible every year (no draft-and-follow rights-holding for this
  // pathway, see file header).
  const remainingPlayers = remainingIds.map((id) => academyPlayersById.get(id));
  const { selections } = resolveDraft(picks, remainingPlayers);
  const enrichedSelections = [];

  for (const selection of selections) {
    const player = academyPlayersById.get(selection.playerId);
    const enrollment = academyEnrollmentById.get(selection.playerId);
    const decision = rollInternationalDraftOutcome(rng);

    enrichedSelections.push({
      ...selection,
      firstName: player.firstName,
      lastName: player.lastName,
      primaryPosition: player.primaryPosition,
      isPitcher: player.isPitcher,
      countryId: player.birthNation,
      outcome: decision.outcome,
    });

    if (decision.outcome === 'signed') {
      const yearsCompleted = enrollment.yearInAcademy - 1;
      assignSignedAcademyPlayerToLevel(player, selection.teamId, levelForAcademyYearsCompleted(yearsCompleted), affiliateRosterByClubId);
      academyEnrollmentById.delete(player.id);
      academyPlayersById.delete(player.id);
      summary.signed++;
      continue;
    }

    // unsigned — falls back into the academy for another year if eligible
    // (handled by step 4 below, same as any other never-drafted enrollee),
    // or exits straight to the international free-agent pool if his
    // 3-year window already closed this cycle.
    summary.unsigned++;
  }

  // 4. Everyone remaining (unsigned-draft-outcome + never-drafted-this-year)
  // advances one academy year; a year-3 window closing exits to the
  // international free-agent pool — this pathway's own real fix for
  // unbounded population growth, alongside the retirement curve below.
  for (const id of remainingIds) {
    if (!academyEnrollmentById.has(id)) continue; // signed and removed above
    const player = academyPlayersById.get(id);
    const enrollment = academyEnrollmentById.get(id);
    const { player: grown, enrollment: nextEnrollment, exited } = advanceAcademyYear(enrollment, player, rng, asOfDate);

    if (exited) {
      academyEnrollmentById.delete(id);
      academyPlayersById.delete(id);
      internationalFreeAgentPoolById.set(id, grown);
      summary.freeAgentExits++;
    } else {
      academyPlayersById.set(id, grown);
      academyEnrollmentById.set(id, nextEnrollment);
    }
  }

  // 5. Prune the international free-agent pool via its own dedicated,
  // separate retirement curve.
  for (const [playerId, player] of [...internationalFreeAgentPoolById]) {
    if (rollInternationalFreeAgentRetirement(player, rng, asOfDate)) {
      internationalFreeAgentPoolById.delete(playerId);
      summary.freeAgentRetirements++;
    }
  }

  return { summary, selections: enrichedSelections };
}
