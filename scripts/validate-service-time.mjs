// Re-runnable sanity check for Service Time — Phase 4 of the "50-man
// Roster System" arc (engine/serviceTime.js): `npm run validate:servicetime`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.
//
// Confirmed with the user before implementation: Super Two is explicitly
// deferred (needs mid-season call-up timing this engine's season-block
// architecture can't express) — not tested here since it isn't built.
// Every other threshold (free agency, arbitration, outright-refusal,
// Rule 5 timing, minor-league free agency, 10-and-5) is real and tested.

import {
  computeServiceYears,
  isFreeAgencyEligible,
  isArbitrationEligible,
  isRule5Exposed,
  isMinorLeagueFreeAgent,
  isOutrightRefusalEligible,
  isTenAndFiveEligible,
  advanceServiceTime,
  SERVICE_DAYS_PER_SEASON,
  FREE_AGENCY_SERVICE_YEARS,
  ARBITRATION_START_SERVICE_YEARS,
  RULE5_SEASONS_SIGNED_19_PLUS,
  RULE5_SEASONS_SIGNED_UNDER_19,
  MINOR_LEAGUE_FREE_AGENCY_SEASONS,
  OUTRIGHT_REFUSAL_CONDITIONAL_YEARS,
  OUTRIGHT_REFUSAL_UNCONDITIONAL_YEARS,
  TEN_AND_FIVE_TOTAL_YEARS,
  TEN_AND_FIVE_CONSECUTIVE_YEARS,
} from '../src/engine/serviceTime.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { computeFreshSeason1State, advanceToNextSeason, STATE_SCHEMA_VERSION } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const AS_OF_DATE = new Date('2026-07-27');
const BASE_RATINGS = {
  contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
  speed: createRating(50), baserunningInstincts: createRating(50),
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
};

function birthdateForAge(age, asOfDate) {
  const d = new Date(asOfDate);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

function hitter(id, age, overrides = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: birthdateForAge(age, AS_OF_DATE),
    ratings: BASE_RATINGS,
    ...overrides,
  });
}

function emptyAffiliateRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

function record(overrides) {
  return createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, ...overrides });
}

console.log('=== 1. computeServiceYears: conversion math ===\n');
{
  assert(computeServiceYears(0) === 0, '0 days = 0 years');
  assert(computeServiceYears(SERVICE_DAYS_PER_SEASON) === 1, 'exactly one season of days = 1 year');
  assert(computeServiceYears(SERVICE_DAYS_PER_SEASON * 3.5) === 3.5, 'fractional years compute correctly');
}

console.log('\n=== 2. isFreeAgencyEligible / isArbitrationEligible: the [3, 6) arbitration window ===\n');
{
  const under3 = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * 2 });
  assert(!isArbitrationEligible(under3), 'under 3 years: not arbitration-eligible');
  assert(!isFreeAgencyEligible(under3), 'under 3 years: not free-agency-eligible');

  const exactly3 = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * ARBITRATION_START_SERVICE_YEARS });
  assert(isArbitrationEligible(exactly3), 'exactly 3 years: arbitration-eligible');
  assert(!isFreeAgencyEligible(exactly3), 'exactly 3 years: not yet free-agency-eligible');

  const almost6 = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * FREE_AGENCY_SERVICE_YEARS - 1 });
  assert(isArbitrationEligible(almost6), 'just under 6 years: still arbitration-eligible');
  assert(!isFreeAgencyEligible(almost6), 'just under 6 years: not yet free-agency-eligible');

  const exactly6 = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * FREE_AGENCY_SERVICE_YEARS });
  assert(isFreeAgencyEligible(exactly6), 'exactly 6 years: free-agency-eligible');
  assert(!isArbitrationEligible(exactly6), 'exactly 6 years: no longer arbitration-eligible (he is a free agent instead)');
}

console.log('\n=== 3. isRule5Exposed: age-based 4-vs-5-season split, gated on wasEverProtected ===\n');
{
  const signedOlder = record({ firstProSeasonNumber: 1, ageAtSigning: 22, wasEverProtected: false });
  assert(!isRule5Exposed(signedOlder, 1 + RULE5_SEASONS_SIGNED_19_PLUS - 1), 'signed at 19+: not yet exposed one season short of the 4-season threshold');
  assert(isRule5Exposed(signedOlder, 1 + RULE5_SEASONS_SIGNED_19_PLUS), 'signed at 19+: exposed at exactly the 4-season threshold');

  const signedYounger = record({ firstProSeasonNumber: 1, ageAtSigning: 17, wasEverProtected: false });
  assert(!isRule5Exposed(signedYounger, 1 + RULE5_SEASONS_SIGNED_UNDER_19 - 1), 'signed under 19: not yet exposed one season short of the 5-season threshold');
  assert(isRule5Exposed(signedYounger, 1 + RULE5_SEASONS_SIGNED_UNDER_19), 'signed under 19: exposed at exactly the 5-season threshold');

  const protectedPlayer = record({ firstProSeasonNumber: 1, ageAtSigning: 22, wasEverProtected: true });
  assert(!isRule5Exposed(protectedPlayer, 50), 'a protected player is NEVER Rule-5-exposed, regardless of how many seasons have passed');
}

console.log('\n=== 4. isMinorLeagueFreeAgent: threshold + wasEverProtected gate ===\n');
{
  const notYet = record({ minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS - 1, wasEverProtected: false });
  assert(!isMinorLeagueFreeAgent(notYet), 'one season short of the threshold: not yet a free agent');
  const atThreshold = record({ minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS, wasEverProtected: false });
  assert(isMinorLeagueFreeAgent(atThreshold), 'exactly at the threshold: a minor-league free agent');
  const protectedAtThreshold = record({ minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS, wasEverProtected: true });
  assert(!isMinorLeagueFreeAgent(protectedAtThreshold), 'protected players are never minor-league free agents, even past the threshold');
}

console.log('\n=== 5. isOutrightRefusalEligible: 3-year+outrighted vs. 5-year unconditional ===\n');
{
  const threeYearsNotOutrighted = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * OUTRIGHT_REFUSAL_CONDITIONAL_YEARS });
  assert(!isOutrightRefusalEligible(threeYearsNotOutrighted, false), '3 years, never outrighted before: not eligible');
  assert(isOutrightRefusalEligible(threeYearsNotOutrighted, true), '3 years, outrighted once before: eligible');

  const fiveYears = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * OUTRIGHT_REFUSAL_UNCONDITIONAL_YEARS });
  assert(isOutrightRefusalEligible(fiveYears, false), '5 years: unconditionally eligible, even if never outrighted before');
}

console.log('\n=== 6. isTenAndFiveEligible: total + consecutive-with-org gates ===\n');
{
  const tenYearsNewOrg = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * TEN_AND_FIVE_TOTAL_YEARS });
  assert(!isTenAndFiveEligible(tenYearsNewOrg, TEN_AND_FIVE_CONSECUTIVE_YEARS - 1), '10 total years but under 5 consecutive with current org: not eligible');
  assert(isTenAndFiveEligible(tenYearsNewOrg, TEN_AND_FIVE_CONSECUTIVE_YEARS), '10 total years and exactly 5 consecutive with current org: eligible');

  const underTenYears = record({ mlbServiceDays: SERVICE_DAYS_PER_SEASON * (TEN_AND_FIVE_TOTAL_YEARS - 1) });
  assert(!isTenAndFiveEligible(underTenYears, 10), 'under 10 total years: not eligible regardless of consecutive years');
}

console.log('\n=== 7. advanceServiceTime: gap-filling, correct crediting per pool, no double-counting ===\n');
{
  const activeNoRecord = hitter('active-none', 28);
  const activeWithRecord = hitter('active-has', 28, { serviceRecord: record({ mlbServiceDays: 500, firstProSeasonNumber: 1, ageAtSigning: 20 }) });
  const rosterByTeamId = new Map([['teamX', { lineup: [activeNoRecord, activeWithRecord], rotation: [], bullpen: [], bench: [] }]]);

  const reserveAaa = hitter('reserve-aaa', 24);
  const depthAaa = hitter('depth-aaa', 22);
  const depthAa = hitter('depth-aa', 20);
  const affiliateRosterByClubId = new Map([
    ['teamX-AAA', { ...emptyAffiliateRoster(), lineup: [reserveAaa, depthAaa] }],
    ['teamX-AA', { ...emptyAffiliateRoster(), lineup: [depthAa] }],
    ['teamX-A', emptyAffiliateRoster()],
    ['teamX-ROOKIE', emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([['teamX', ['reserve-aaa']]]);

  advanceServiceTime(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId, 5, AS_OF_DATE);

  const updatedRoster = rosterByTeamId.get('teamX');
  const nowActiveNone = updatedRoster.lineup.find((p) => p.id === 'active-none');
  assert(nowActiveNone.serviceRecord.firstProSeasonNumber === 5, 'a brand-new active player gets firstProSeasonNumber set to the CURRENT season');
  assert(nowActiveNone.serviceRecord.mlbServiceDays === SERVICE_DAYS_PER_SEASON, 'a brand-new active player is credited exactly one season of MLB days');
  assert(nowActiveNone.serviceRecord.wasEverProtected === true, 'an active player is marked wasEverProtected');

  const stillActiveHas = updatedRoster.lineup.find((p) => p.id === 'active-has');
  assert(stillActiveHas.serviceRecord.firstProSeasonNumber === 1, 'an existing record keeps its ORIGINAL firstProSeasonNumber, not overwritten to the current season');
  assert(stillActiveHas.serviceRecord.ageAtSigning === 20, 'an existing record keeps its original ageAtSigning');
  assert(stillActiveHas.serviceRecord.mlbServiceDays === 500 + SERVICE_DAYS_PER_SEASON, 'an existing MLB player accumulates ON TOP of his prior total, not reset');

  const aaaAfter = affiliateRosterByClubId.get('teamX-AAA');
  const reserveAfter = aaaAfter.lineup.find((p) => p.id === 'reserve-aaa');
  assert(reserveAfter.serviceRecord.wasEverProtected === true, 'a Reserve-pool AAA player is marked wasEverProtected');
  assert(reserveAfter.serviceRecord.minorsSeasonsAccrued === 1, 'a Reserve-pool AAA player is credited a minors season');
  assert(reserveAfter.serviceRecord.mlbServiceDays === 0, 'a Reserve-pool player is NOT credited MLB days just for being protected — only actual active-26 time counts');

  const depthAaaAfter = aaaAfter.lineup.find((p) => p.id === 'depth-aaa');
  assert(depthAaaAfter.serviceRecord.wasEverProtected === false, 'a non-reserve AAA player is NOT marked wasEverProtected');
  assert(depthAaaAfter.serviceRecord.minorsSeasonsAccrued === 1, 'a non-reserve AAA player is still credited a minors season');

  const depthAaAfter = affiliateRosterByClubId.get('teamX-AA').lineup.find((p) => p.id === 'depth-aa');
  assert(depthAaAfter.serviceRecord.minorsSeasonsAccrued === 1, 'a non-reserve AA player is credited a minors season too');

  // Unlike Phase 3's assignMissingContracts (assign-once, never touched
  // again), this is a genuine running counter — a second call must
  // increment further, not no-op.
  advanceServiceTime(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId, 6, AS_OF_DATE);
  const afterSecondSweep = rosterByTeamId.get('teamX').lineup.find((p) => p.id === 'active-none');
  assert(afterSecondSweep.serviceRecord.mlbServiceDays === SERVICE_DAYS_PER_SEASON * 2, 'a second sweep credits ANOTHER season on top — this is a running counter, not an idempotent backfill');
  assert(afterSecondSweep.serviceRecord.firstProSeasonNumber === 5, 'firstProSeasonNumber still never changes on a second sweep');
}

console.log('\n=== 8. Real data/season.js wiring: every org-affiliated player has a serviceRecord ===\n');
{
  const state1 = computeFreshSeason1State();
  assert(state1.schemaVersion === STATE_SCHEMA_VERSION && STATE_SCHEMA_VERSION === 17, `schemaVersion is the current STATE_SCHEMA_VERSION, 17 (got ${state1.schemaVersion})`);

  let totalPlayers = 0, missing = 0;
  for (const roster of state1.rosterByTeamId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { totalPlayers++; if (!p.serviceRecord) missing++; }
    }
  }
  for (const roster of state1.affiliateRosterByClubId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { totalPlayers++; if (!p.serviceRecord) missing++; }
    }
  }
  console.log(`  total players checked: ${totalPlayers}`);
  assert(totalPlayers > 5000, `a real, large population was actually checked (got ${totalPlayers})`);
  assert(missing === 0, `every org-affiliated player has a real serviceRecord, no gaps (got ${missing} missing)`);

  const sampleTeamId = [...state1.rosterByTeamId.keys()][0];
  const sampleActivePlayer = state1.rosterByTeamId.get(sampleTeamId).lineup[0];
  assert(sampleActivePlayer.serviceRecord.mlbServiceDays === SERVICE_DAYS_PER_SEASON, `a season-1 active player has exactly one season of MLB days (got ${sampleActivePlayer.serviceRecord.mlbServiceDays})`);
  assert(sampleActivePlayer.serviceRecord.firstProSeasonNumber === 1, 'a season-1 player has firstProSeasonNumber 1');
}

console.log('\n=== 9. Real season transition: mlbServiceDays accumulates correctly, career-start fields never overwritten ===\n');
{
  const state1 = computeFreshSeason1State();
  const sampleTeamId = [...state1.rosterByTeamId.keys()][0];
  const priorPlayerId = state1.rosterByTeamId.get(sampleTeamId).lineup[0].id;
  const priorRecord = state1.rosterByTeamId.get(sampleTeamId).lineup[0].serviceRecord;

  const state2 = advanceToNextSeason(state1);
  const carriedPlayer = state2.rosterByTeamId.get(sampleTeamId).lineup.find((p) => p.id === priorPlayerId);
  if (carriedPlayer) {
    assert(
      carriedPlayer.serviceRecord.mlbServiceDays === priorRecord.mlbServiceDays + SERVICE_DAYS_PER_SEASON,
      `a player still active next season accrues exactly one more season of MLB days (got ${carriedPlayer.serviceRecord.mlbServiceDays}, expected ${priorRecord.mlbServiceDays + SERVICE_DAYS_PER_SEASON})`
    );
    assert(carriedPlayer.serviceRecord.firstProSeasonNumber === priorRecord.firstProSeasonNumber, 'firstProSeasonNumber is unchanged across a real season transition');
    assert(carriedPlayer.serviceRecord.ageAtSigning === priorRecord.ageAtSigning, 'ageAtSigning is unchanged across a real season transition');
  } else {
    console.log('  (sample player retired/moved this transition — accrual check skipped for him, not a failure)');
  }

  let missing2 = 0, total2 = 0;
  for (const roster of state2.rosterByTeamId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { total2++; if (!p.serviceRecord) missing2++; }
    }
  }
  for (const roster of state2.affiliateRosterByClubId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { total2++; if (!p.serviceRecord) missing2++; }
    }
  }
  assert(total2 > 0 && missing2 === 0, `every player after a real season transition has a serviceRecord, including this season's new draftees/signees (checked ${total2}, missing ${missing2})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
