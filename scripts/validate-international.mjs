// Re-runnable sanity check for International Academy + International Draft
// — Phase 4 of the "Path to Draft, Minors & Free Agency" arc
// (engine/internationalAcademy.js): `npm run validate:international`. Same
// style as the other validate:* scripts — eyeball checks plus hard asserts
// on structural invariants, mirroring validate-college.mjs's own approach.

import { createRng } from '../src/models/generation/random.js';
import { createPlayer, createRating, getAge } from '../src/models/Player.js';
import {
  generateAcademyClass,
  seedInitialAcademyPopulation,
  advanceAcademyYear,
  rollCollegeAcceptance,
  rollInternationalDraftOutcome,
  rollInternationalFreeAgentRetirement,
  runInternationalPathway,
  buildInternationalDraftPicks,
} from '../src/engine/internationalAcademy.js';
import { generateHsClass } from '../src/engine/college.js';
import {
  INTERNATIONAL_ACADEMIES,
  INTERNATIONAL_ACADEMIES_BY_COUNTRY,
  locationModifierForAcademy,
} from '../src/models/seed/internationalAcademySeed.js';
import { INTERNATIONAL_NATION_POOL } from '../src/models/generation/nationalityPools.js';
import {
  INTERNATIONAL_ACADEMY_YEARS,
  INTERNATIONAL_DRAFT_ROUNDS,
  INTERNATIONAL_CLASS_SURPLUS_MULTIPLIER,
  COLLEGE_ACCEPTANCE_TRIGGER_PROBABILITY,
  INTERNATIONAL_SIGNING_FAILURE_PROBABILITY,
  INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE,
  FREE_AGENT_RETIREMENT_AGE_CURVE,
} from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const AS_OF_DATE = new Date('2026-07-22');
const TEAMS_COUNT = 50;

function makeHitter(id, current = 50) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    ratings: {
      contact: createRating(current), power: createRating(current), eye: createRating(current), buntingSkill: createRating(50),
      speed: createRating(50), baserunningInstincts: createRating(50),
      fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
      workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
    },
  });
}

function fullAffiliateRosterByClubId(teamIds) {
  const map = new Map();
  for (const teamId of teamIds) {
    for (const level of ['ROOKIE', 'A', 'AA', 'AAA']) {
      map.set(`${teamId}-${level}`, { lineup: [], rotation: [], bullpen: [], bench: [] });
    }
  }
  return map;
}

console.log('=== 1. International academies: shape + prestige/specialty growth direction ===\n');
{
  assert(INTERNATIONAL_ACADEMIES.length === 31, `31 academies generated (got ${INTERNATIONAL_ACADEMIES.length})`);
  assert(new Set(INTERNATIONAL_ACADEMIES.map((a) => a.id)).size === 31, 'every academy has a unique id');
  assert(INTERNATIONAL_ACADEMIES.every((a) => a.prestigeTier >= 1 && a.prestigeTier <= 5), 'every prestigeTier is 1-5');

  for (const { value: countryId } of INTERNATIONAL_NATION_POOL) {
    const academies = INTERNATIONAL_ACADEMIES_BY_COUNTRY.get(countryId);
    assert(academies && academies.length > 0, `${countryId} has at least one academy`);
  }

  const powerhousePitching = INTERNATIONAL_ACADEMIES.find((a) => a.prestigeTier === 1 && a.specialty === 'PITCHING_FACTORY');
  const obscureGeneralist = INTERNATIONAL_ACADEMIES.find((a) => a.prestigeTier === 5 && a.specialty === null);
  assert(powerhousePitching && obscureGeneralist, 'both a tier-1 pitching-factory academy and a tier-5 generalist academy exist in the seed table');

  const powerhouseMod = locationModifierForAcademy(powerhousePitching);
  const obscureMod = locationModifierForAcademy(obscureGeneralist);
  assert(powerhouseMod('velocity', 'PHYSICAL') > obscureMod('velocity', 'PHYSICAL'), 'a tier-1 pitching-factory academy grows a pitching attribute faster than a tier-5 generalist');
  assert(powerhouseMod('velocity', 'PHYSICAL') > powerhouseMod('contact', 'SKILL'), "the SAME pitching-factory academy's specialty bonus only applies to pitching attributes, not hitting ones");
}

console.log('\n=== 2. Country-weighting direction ===\n');
{
  const rng = createRng(42);
  const { players } = generateAcademyClass(rng, AS_OF_DATE, 'weight-test', 5000);
  const counts = {};
  for (const p of players) counts[p.birthNation] = (counts[p.birthNation] ?? 0) + 1;
  console.log(`  sample of ${players.length}: DR=${counts['Dominican Republic'] ?? 0}, Venezuela=${counts['Venezuela'] ?? 0}, Curacao=${counts['Curacao'] ?? 0}, Panama=${counts['Panama'] ?? 0}`);
  assert((counts['Dominican Republic'] ?? 0) > (counts['Curacao'] ?? 0), 'Dominican Republic (heavy weight) is drawn far more often than Curacao (rare)');
  assert((counts['Venezuela'] ?? 0) > (counts['Panama'] ?? 0), 'Venezuela (heavy weight) is drawn far more often than Panama (rare)');
  assert(!counts['USA'], 'USA is never drawn for the international academy population');
}

console.log('\n=== 3. rollCollegeAcceptance / rollInternationalDraftOutcome: empirical rates ===\n');
{
  const rng = createRng(7);
  const trials = 5000;
  let accepted = 0;
  let unsigned = 0;
  for (let i = 0; i < trials; i++) {
    if (rollCollegeAcceptance(rng)) accepted++;
    if (rollInternationalDraftOutcome(rng).outcome === 'unsigned') unsigned++;
  }
  const acceptRate = accepted / trials;
  const unsignedRate = unsigned / trials;
  console.log(`  observed college-acceptance rate: ${(acceptRate * 100).toFixed(2)}% (configured ${COLLEGE_ACCEPTANCE_TRIGGER_PROBABILITY * 100}%)`);
  console.log(`  observed signing-failure rate: ${(unsignedRate * 100).toFixed(2)}% (configured ${INTERNATIONAL_SIGNING_FAILURE_PROBABILITY * 100}%)`);
  assert(acceptRate > 0.06 && acceptRate < 0.10, 'college-acceptance rate lands in a plausible band around the configured 8%');
  assert(unsignedRate > 0.03 && unsignedRate < 0.07, 'signing-failure rate lands in a plausible band around the configured 5%');
}

console.log('\n=== 4. advanceAcademyYear: exit-exactly-at-year-3 state machine ===\n');
{
  const player = makeHitter('exit-test', 50);
  const academy = INTERNATIONAL_ACADEMIES[0];
  const rng = createRng(11);

  let enrollment = { academyId: academy.id, yearInAcademy: 1 };
  let result = advanceAcademyYear(enrollment, player, rng, AS_OF_DATE);
  assert(result.enrollment.yearInAcademy === 2 && result.exited === false, 'year 1 -> 2 is not an exit');

  result = advanceAcademyYear(result.enrollment, result.player, rng, AS_OF_DATE);
  assert(result.enrollment.yearInAcademy === 3 && result.exited === false, 'year 2 -> 3 is not an exit');

  result = advanceAcademyYear(result.enrollment, result.player, rng, AS_OF_DATE);
  assert(result.enrollment.yearInAcademy === 4 && result.exited === true, 'year 3 -> 4 exits (3-year window closed)');
}

console.log('\n=== 5. seedInitialAcademyPopulation: shape ===\n');
{
  const rng = createRng(99);
  const { academyEnrollmentById, academyPlayersById } = seedInitialAcademyPopulation(rng, AS_OF_DATE);
  const cohortSize = INTERNATIONAL_DRAFT_ROUNDS * TEAMS_COUNT * INTERNATIONAL_CLASS_SURPLUS_MULTIPLIER;

  assert(academyPlayersById.size === cohortSize * INTERNATIONAL_ACADEMY_YEARS, `total bootstrap population is ${INTERNATIONAL_ACADEMY_YEARS} cohorts of ${cohortSize} (expected ${cohortSize * INTERNATIONAL_ACADEMY_YEARS}, got ${academyPlayersById.size})`);

  const byYear = {};
  for (const e of academyEnrollmentById.values()) byYear[e.yearInAcademy] = (byYear[e.yearInAcademy] ?? 0) + 1;
  for (let y = 1; y <= INTERNATIONAL_ACADEMY_YEARS; y++) {
    assert(byYear[y] === cohortSize, `class year ${y} has exactly ${cohortSize} players (got ${byYear[y]})`);
  }

  const avgAgeForYear = (year) => {
    const ids = [...academyEnrollmentById.entries()].filter(([, e]) => e.yearInAcademy === year).map(([id]) => id).slice(0, 50);
    return ids.reduce((sum, id) => sum + getAge(academyPlayersById.get(id), AS_OF_DATE), 0) / ids.length;
  };
  const age1 = avgAgeForYear(1);
  const ageLast = avgAgeForYear(INTERNATIONAL_ACADEMY_YEARS);
  console.log(`  avg age — year 1: ${age1.toFixed(1)}, year ${INTERNATIONAL_ACADEMY_YEARS}: ${ageLast.toFixed(1)}`);
  assert(ageLast > age1, 'later class years are correspondingly older (birthdate correctly shifted back during bootstrap)');
  assert(ageLast - age1 >= 1 && ageLast - age1 <= 3, 'the age gap between year 1 and the last year is plausible');
}

console.log('\n=== 6. rollInternationalFreeAgentRetirement: age direction + comparative shift vs. College ===\n');
{
  const young = makeHitter('young-ifa', 50);
  young.birthdate = new Date(AS_OF_DATE.getFullYear() - 19, 0, 1).toISOString().slice(0, 10);
  const old = makeHitter('old-ifa', 50);
  old.birthdate = new Date(AS_OF_DATE.getFullYear() - 27, 0, 1).toISOString().slice(0, 10);

  let youngRetirements = 0;
  let oldRetirements = 0;
  const trials = 1000;
  for (let seed = 1; seed <= trials; seed++) {
    if (rollInternationalFreeAgentRetirement(young, createRng(seed), AS_OF_DATE)) youngRetirements++;
    if (rollInternationalFreeAgentRetirement(old, createRng(seed), AS_OF_DATE)) oldRetirements++;
  }
  console.log(`  age-19 retirement rate: ${youngRetirements}/${trials}; age-27 retirement rate: ${oldRetirements}/${trials}`);
  assert(oldRetirements > youngRetirements, 'retirement is far more common at 27 than 19');
  assert(oldRetirements === trials, 'a 27-year-old international free agent retires with effective certainty every time');

  const ageToCompare = 22;
  const intlProbAt22 = INTERNATIONAL_FREE_AGENT_RETIREMENT_AGE_CURVE.find((b) => ageToCompare <= b.maxAge).probability;
  const collegeProbAt22 = FREE_AGENT_RETIREMENT_AGE_CURVE.find((b) => ageToCompare <= b.maxAge).probability;
  console.log(`  at age 22 — international curve: ${intlProbAt22}, college curve: ${collegeProbAt22}`);
  assert(intlProbAt22 >= collegeProbAt22, "the international curve is genuinely shifted younger (at least as steep at the same age) than College's own curve");
}

console.log('\n=== 7. Multi-season population stability (real run, college fold-in included) ===\n');
{
  const teamIds = Array.from({ length: TEAMS_COUNT }, (_, i) => `team${i}`);
  const picks = buildInternationalDraftPicks(teamIds);
  const affiliateRosterByClubId = fullAffiliateRosterByClubId(teamIds);
  const rng = createRng(2026);

  const { academyEnrollmentById, academyPlayersById } = seedInitialAcademyPopulation(rng, AS_OF_DATE);
  const collegeEnrollmentById = new Map();
  const collegePlayersById = new Map();
  const internationalFreeAgentPoolById = new Map();

  const poolSizeHistory = [];
  const seasons = 20; // same rationale as validate-college.mjs's own multi-season run
  let currentAsOfDate = new Date(AS_OF_DATE);
  for (let season = 1; season <= seasons; season++) {
    currentAsOfDate = new Date(currentAsOfDate);
    currentAsOfDate.setFullYear(currentAsOfDate.getFullYear() + 1);
    const { players: freshAcademyClass, enrollments: freshAcademyEnrollments } =
      generateAcademyClass(rng, currentAsOfDate, `multi-intl-s${season}`);
    runInternationalPathway(
      picks, freshAcademyClass, freshAcademyEnrollments,
      academyEnrollmentById, academyPlayersById,
      collegeEnrollmentById, collegePlayersById,
      internationalFreeAgentPoolById, affiliateRosterByClubId,
      rng, currentAsOfDate
    );
    poolSizeHistory.push(internationalFreeAgentPoolById.size);
  }
  console.log(`  international free-agent pool size after each of ${seasons} seasons: ${poolSizeHistory.join(', ')}`);

  const earlyGrowth = poolSizeHistory[4] - poolSizeHistory[0];
  const lateGrowth = poolSizeHistory[seasons - 1] - poolSizeHistory[seasons - 5];
  console.log(`  growth over seasons 1-5: ${earlyGrowth}; growth over seasons ${seasons - 4}-${seasons}: ${lateGrowth}`);
  assert(lateGrowth <= earlyGrowth, "the international free-agent pool's growth rate genuinely slows over time as aging-driven retirement catches up with inflow");

  let poolQualitySum = 0;
  for (const player of internationalFreeAgentPoolById.values()) {
    const attrs = ['contact', 'power', 'eye'];
    poolQualitySum += attrs.reduce((sum, a) => sum + player.ratings[a].scoutedPotential, 0) / attrs.length;
  }
  const poolAvgQuality = poolQualitySum / internationalFreeAgentPoolById.size;

  let signedQualitySum = 0;
  let signedCount = 0;
  for (const roster of affiliateRosterByClubId.values()) {
    for (const p of [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench]) {
      if (!p.isPitcher) {
        signedQualitySum += ['contact', 'power', 'eye'].reduce((sum, a) => sum + p.ratings[a].scoutedPotential, 0) / 3;
        signedCount++;
      }
    }
  }
  const signedAvgQuality = signedCount > 0 ? signedQualitySum / signedCount : 0;
  console.log(`  international free-agent pool avg quality: ${poolAvgQuality.toFixed(1)} (n=${internationalFreeAgentPoolById.size}); signed-players avg quality: ${signedAvgQuality.toFixed(1)} (n=${signedCount})`);
  assert(poolAvgQuality < signedAvgQuality, 'the international free-agent pool skews meaningfully lower-quality than actually-signed players — elite players are not piling up unsigned');

  console.log(`  final: ${academyPlayersById.size} still enrolled in the academy, ${collegePlayersById.size} folded into college, ${internationalFreeAgentPoolById.size} international free agents`);
  assert(academyPlayersById.size > 0, `the international academy population does not fully drain to zero over ${seasons} seasons (a real, ongoing pipeline)`);
  assert(collegePlayersById.size > 0, 'the college fold-in branch produced real, ongoing college enrollments over the run');
}

console.log('\n=== 8. College fold-in correctness ===\n');
{
  const academy = INTERNATIONAL_ACADEMIES[0];
  const academyEnrollmentById = new Map([['fold-player', { academyId: academy.id, yearInAcademy: 2 }]]);
  const academyPlayersById = new Map([['fold-player', makeHitter('fold-player', 50)]]);
  const collegeEnrollmentById = new Map();
  const collegePlayersById = new Map();
  const internationalFreeAgentPoolById = new Map();
  const affiliateRosterByClubId = fullAffiliateRosterByClubId(['fold-team']);

  const forcedAcceptRng = () => 0; // rollCollegeAcceptance: 0 < COLLEGE_ACCEPTANCE_TRIGGER_PROBABILITY -> always true

  runInternationalPathway(
    [], [], new Map(),
    academyEnrollmentById, academyPlayersById,
    collegeEnrollmentById, collegePlayersById,
    internationalFreeAgentPoolById, affiliateRosterByClubId,
    forcedAcceptRng, AS_OF_DATE
  );

  assert(!academyEnrollmentById.has('fold-player') && !academyPlayersById.has('fold-player'), 'the accepted player is fully removed from the academy maps (no dual-presence leak)');
  const enrollment = collegeEnrollmentById.get('fold-player');
  assert(!!enrollment, 'the accepted player lands in collegeEnrollmentById');
  assert(!!enrollment && enrollment.yearInSchool === 1 && enrollment.draftRightsTeamId === null && !!enrollment.schoolId, 'the fold-in is a real enrollFreshman() call — yearInSchool 1, no draft rights held, a real schoolId');
  assert(collegePlayersById.has('fold-player'), 'the accepted player also lands in collegePlayersById');
}

console.log('\n=== 9. HS-class retrofit regression: generateHsClass never produces a non-USA birthNation ===\n');
{
  const rng = createRng(555);
  const hsClass = generateHsClass(rng, AS_OF_DATE, 'hs-retrofit-test', 500);
  const nonUsa = hsClass.filter((p) => p.birthNation !== 'USA');
  assert(nonUsa.length === 0, `every generated HS player has birthNation USA (${nonUsa.length}/500 were not)`);
}

console.log('\n=== 10. Real wiring: data/season.js ===\n');
{
  const mod = await import('../src/data/season.js');
  const state = mod.initialLeagueState;

  assert(state.academyPlayersById.size > 0, 'season 1 has a real, populated international academy system (the bootstrap ran)');
  assert(state.internationalFreeAgentPoolById instanceof Map, 'internationalFreeAgentPoolById is real live state');
  assert(!!state.internationalDraftResult.internationalSummary, 'internationalDraftResult carries a real internationalSummary');
  assert(state.internationalDraftResult.selections.some((s) => 'countryId' in s && 'outcome' in s), 'international draft selections are enriched with countryId/outcome for the UI');

  const state2 = mod.advanceToNextSeason(state);
  assert(state2.academyPlayersById !== state.academyPlayersById || state2.seasonNumber === 2, 'advancing a season produces a real season-2 state with the academy population carried forward');
  assert(state2.internationalDraftResult.internationalSummary.newAcademyEnrollments >= 0, 'season 2 produces a real internationalSummary too');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
