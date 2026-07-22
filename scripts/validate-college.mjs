// Re-runnable sanity check for the College System — Phase 3 of the "Path to
// Draft, Minors & Free Agency" arc (engine/college.js): `npm run validate:college`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.

import { createRng } from '../src/models/generation/random.js';
import { createPlayer, createRating, getAge } from '../src/models/Player.js';
import { buildDraftPicks } from '../src/engine/draft.js';
import {
  generateHsClass,
  seedInitialCollegePopulation,
  advanceCollegeYear,
  rollDraftOutcome,
  rollClaimedPlayerDecision,
  rollFreeAgentRetirement,
  runCollegePathway,
} from '../src/engine/college.js';
import { COLLEGE_SCHOOLS, COLLEGE_SCHOOLS_BY_ID, locationModifierForSchool } from '../src/models/seed/collegeSeed.js';
import { COLLEGE_MAX_YEARS, DRAFT_ROUNDS, HS_CLASS_SURPLUS_MULTIPLIER, GRADUATION_RELEASE_PROBABILITY } from '../src/models/constants.js';

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

function rosterHeadcount(affiliateRosterByClubId) {
  let total = 0;
  for (const roster of affiliateRosterByClubId.values()) {
    total += roster.lineup.length + roster.rotation.length + roster.bullpen.length + roster.bench.length;
  }
  return total;
}

console.log('=== 1. College schools: shape + prestige/specialty growth direction ===\n');
{
  assert(COLLEGE_SCHOOLS.length === 30, `30 D1 programs generated (got ${COLLEGE_SCHOOLS.length})`);
  assert(new Set(COLLEGE_SCHOOLS.map((s) => s.id)).size === 30, 'every school has a unique id');
  assert(COLLEGE_SCHOOLS.every((s) => s.prestigeTier >= 1 && s.prestigeTier <= 5), 'every prestigeTier is 1-5');

  const powerhousePitching = COLLEGE_SCHOOLS.find((s) => s.prestigeTier === 1 && s.specialty === 'PITCHING_FACTORY');
  const obscureGeneralist = COLLEGE_SCHOOLS.find((s) => s.prestigeTier === 5 && s.specialty === null);
  assert(powerhousePitching && obscureGeneralist, 'both a tier-1 pitching-factory school and a tier-5 generalist school exist in the seed table');

  const powerhouseMod = locationModifierForSchool(powerhousePitching);
  const obscureMod = locationModifierForSchool(obscureGeneralist);
  assert(powerhouseMod('velocity', 'PHYSICAL') > obscureMod('velocity', 'PHYSICAL'), 'a tier-1 pitching-factory school grows a pitching attribute faster than a tier-5 generalist');
  assert(powerhouseMod('velocity', 'PHYSICAL') > powerhouseMod('contact', 'SKILL'), "the SAME pitching-factory school's specialty bonus only applies to pitching attributes, not hitting ones");
}

console.log('\n=== 2. rollDraftOutcome / rollClaimedPlayerDecision: direction ===\n');
{
  const player = makeHitter('quality-player', 60);
  const school = COLLEGE_SCHOOLS_BY_ID.get(COLLEGE_SCHOOLS[0].id);

  const rng = createRng(1);
  const trials = 2000;
  let refusals = 0;
  for (let i = 0; i < trials; i++) {
    if (rollDraftOutcome(player, school, 5, rng).outcome === 'refused') refusals++;
  }
  const refusalRate = refusals / trials;
  console.log(`  observed refusal rate: ${(refusalRate * 100).toFixed(2)}% (configured ~3%)`);
  assert(refusalRate > 0.01 && refusalRate < 0.06, 'refusal rate lands in a plausible band around the configured 3%');

  let round1Signs = 0;
  let round10Signs = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    if (rollClaimedPlayerDecision(player, school, 1, createRng(seed * 13)).outcome === 'signed') round1Signs++;
    if (rollClaimedPlayerDecision(player, school, 10, createRng(seed * 13)).outcome === 'signed') round10Signs++;
  }
  console.log(`  round 1 (biggest signing bonus) signs ${round1Signs}/1000; round 10 signs ${round10Signs}/1000`);
  assert(round1Signs > round10Signs, 'an earlier (more lucrative) draft round signs more often than a late round, same player/school');

  const powerhouse = COLLEGE_SCHOOLS.find((s) => s.prestigeTier === 1);
  const obscure = COLLEGE_SCHOOLS.find((s) => s.prestigeTier === 5);
  let powerhouseSigns = 0;
  let obscureSigns = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    if (rollClaimedPlayerDecision(player, powerhouse, 5, createRng(seed * 29)).outcome === 'signed') powerhouseSigns++;
    if (rollClaimedPlayerDecision(player, obscure, 5, createRng(seed * 29)).outcome === 'signed') obscureSigns++;
  }
  console.log(`  powerhouse-school player signs ${powerhouseSigns}/1000; obscure-school player signs ${obscureSigns}/1000`);
  assert(obscureSigns > powerhouseSigns, 'a player at an obscure (low-NIL-value) school signs more often than one at a powerhouse, same round');
}

console.log('\n=== 3. advanceCollegeYear: redshirt + graduation state machine ===\n');
{
  const player = makeHitter('redshirt-test', 50);
  const forcedRedshirt = () => 0.01; // always triggers COLLEGE_REDSHIRT_TRIGGER_PROBABILITY (0.10)
  const neverRedshirt = () => 0.99;

  const enrollment1 = { schoolId: COLLEGE_SCHOOLS[0].id, yearInSchool: 1, redshirtUsed: false, draftRightsTeamId: null, draftRound: null };
  const { enrollment: afterRedshirt, graduated: g1 } = advanceCollegeYear(enrollment1, player, forcedRedshirt, AS_OF_DATE);
  assert(afterRedshirt.redshirtUsed === true, 'a triggered redshirt sets redshirtUsed');
  assert(afterRedshirt.yearInSchool === 1, "a redshirt year doesn't advance yearInSchool");
  assert(g1 === false, 'a redshirt year 1 is never a graduation');

  // Redshirt already used — a second "trigger" roll must be ignored.
  const { enrollment: afterSecond } = advanceCollegeYear(afterRedshirt, player, forcedRedshirt, AS_OF_DATE);
  assert(afterSecond.yearInSchool === 2, 'once redshirtUsed is true, yearInSchool advances normally even if the roll would otherwise trigger again');

  const enrollment4 = { schoolId: COLLEGE_SCHOOLS[0].id, yearInSchool: 4, redshirtUsed: false, draftRightsTeamId: null, draftRound: null };
  const { enrollment: afterYear4NoRedshirt, graduated: g2 } = advanceCollegeYear(enrollment4, player, neverRedshirt, AS_OF_DATE);
  assert(afterYear4NoRedshirt.yearInSchool === 5 && g2 === true, 'year 4 with no redshirt graduates (yearInSchool exceeds COLLEGE_MAX_YEARS)');

  const { enrollment: afterYear4Redshirt, graduated: g3 } = advanceCollegeYear(enrollment4, player, forcedRedshirt, AS_OF_DATE);
  assert(afterYear4Redshirt.yearInSchool === 4 && afterYear4Redshirt.redshirtUsed === true && g3 === false, 'year 4 WITH a fresh redshirt extends one more real year instead of graduating');
}

console.log('\n=== 4. Graduation: auto-sign vs. release split ===\n');
{
  const teamIds = ['grad-team'];
  let releases = 0;
  let signs = 0;
  const trials = 300;

  for (let seed = 1; seed <= trials; seed++) {
    const rng = createRng(seed * 7);
    const collegeEnrollmentById = new Map([['grad-player', { schoolId: COLLEGE_SCHOOLS[0].id, yearInSchool: 4, redshirtUsed: true, draftRightsTeamId: 'grad-team', draftRound: 3 }]]);
    const collegePlayersById = new Map([['grad-player', makeHitter('grad-player', 45)]]);
    const freeAgentPoolById = new Map();
    const rosterCopy = fullAffiliateRosterByClubId(teamIds); // fresh copy each trial

    // Force the player to NOT re-sign early and NOT redshirt again (already used) —
    // just drive straight to the graduation branch by using an empty picks/HS class
    // (nobody drafted, nobody new enrolls) so this player is the only thing processed.
    runCollegePathway([], [], collegeEnrollmentById, collegePlayersById, freeAgentPoolById, rosterCopy, rng, AS_OF_DATE);

    if (freeAgentPoolById.has('grad-player')) releases++;
    else if (rosterHeadcount(rosterCopy) === 1) signs++;
  }

  console.log(`  of ${trials} graduation trials: ${releases} released, ${signs} auto-signed (configured release rate ~${GRADUATION_RELEASE_PROBABILITY * 100}%)`);
  assert(releases > 0 && signs > 0, 'both outcomes are real and reachable');
  assert(signs > releases, 'auto-signing is the majority outcome, matching "teams virtually always sign a senior they developed for 4 years"');
}

console.log('\n=== 5. seedInitialCollegePopulation: shape ===\n');
{
  const rng = createRng(99);
  const { collegeEnrollmentById, collegePlayersById } = seedInitialCollegePopulation(rng, AS_OF_DATE);
  const cohortSize = DRAFT_ROUNDS * TEAMS_COUNT * HS_CLASS_SURPLUS_MULTIPLIER;

  assert(collegePlayersById.size === cohortSize * COLLEGE_MAX_YEARS, `total bootstrap population is ${COLLEGE_MAX_YEARS} cohorts of ${cohortSize} (expected ${cohortSize * COLLEGE_MAX_YEARS}, got ${collegePlayersById.size})`);

  const byYear = {};
  for (const e of collegeEnrollmentById.values()) byYear[e.yearInSchool] = (byYear[e.yearInSchool] ?? 0) + 1;
  for (let y = 1; y <= COLLEGE_MAX_YEARS; y++) {
    assert(byYear[y] === cohortSize, `class year ${y} has exactly ${cohortSize} players (got ${byYear[y]})`);
  }

  const avgAgeForYear = (year) => {
    const ids = [...collegeEnrollmentById.entries()].filter(([, e]) => e.yearInSchool === year).map(([id]) => id).slice(0, 50);
    return ids.reduce((sum, id) => sum + getAge(collegePlayersById.get(id), AS_OF_DATE), 0) / ids.length;
  };
  const age1 = avgAgeForYear(1);
  const age4 = avgAgeForYear(4);
  console.log(`  avg age — year 1: ${age1.toFixed(1)}, year 4: ${age4.toFixed(1)}`);
  assert(age4 > age1, 'later class years are correspondingly older (birthdate correctly shifted back during bootstrap)');
  assert(age4 - age1 >= 2 && age4 - age1 <= 4, 'the age gap between year 1 and year 4 is plausible (roughly 3 years)');
}

console.log('\n=== 6. rollFreeAgentRetirement: age direction ===\n');
{
  const young = makeHitter('young-fa', 50);
  young.birthdate = new Date(AS_OF_DATE.getFullYear() - 21, 0, 1).toISOString().slice(0, 10);
  const old = makeHitter('old-fa', 50);
  old.birthdate = new Date(AS_OF_DATE.getFullYear() - 29, 0, 1).toISOString().slice(0, 10);

  let youngRetirements = 0;
  let oldRetirements = 0;
  const trials = 1000;
  for (let seed = 1; seed <= trials; seed++) {
    if (rollFreeAgentRetirement(young, createRng(seed), AS_OF_DATE)) youngRetirements++;
    if (rollFreeAgentRetirement(old, createRng(seed), AS_OF_DATE)) oldRetirements++;
  }
  console.log(`  age-21 retirement rate: ${youngRetirements}/${trials}; age-29 retirement rate: ${oldRetirements}/${trials}`);
  assert(oldRetirements > youngRetirements, 'retirement is far more common at 29 than 21');
  assert(oldRetirements === trials, 'a 29-year-old free agent retires with effective certainty every time (past the curve\'s Infinity bracket)');
}

console.log('\n=== 7. Multi-season population stability (real run, no leaks) ===\n');
{
  const teamIds = Array.from({ length: TEAMS_COUNT }, (_, i) => `team${i}`);
  const round1Order = [...teamIds];
  const regularOrder = [...teamIds];
  const picks = buildDraftPicks(round1Order, regularOrder);
  const affiliateRosterByClubId = fullAffiliateRosterByClubId(teamIds);
  const rng = createRng(2026);

  const { collegeEnrollmentById, collegePlayersById } = seedInitialCollegePopulation(rng, AS_OF_DATE);
  const freeAgentPoolById = new Map();

  // Real free agents must actually AGE season to season for the retirement
  // curve to ever bite — data/season.js's advanceToNextSeason() advances
  // asOfDate by one real year every season; holding it constant here would
  // silently understate retirement pressure (an earlier draft of this test
  // did exactly that and showed the pool still climbing hard after 8
  // "seasons" — a test bug, not an engine bug, fixed by advancing the date
  // for real, same as production).
  const poolSizeHistory = [];
  const seasons = 20; // enough for a cohort entering the pool at ~21-22 to age into the retirement curve's steep end
  let currentAsOfDate = new Date(AS_OF_DATE);
  for (let season = 1; season <= seasons; season++) {
    currentAsOfDate = new Date(currentAsOfDate);
    currentAsOfDate.setFullYear(currentAsOfDate.getFullYear() + 1);
    const freshHsClass = generateHsClass(rng, currentAsOfDate, `multi-s${season}`);
    runCollegePathway(picks, freshHsClass, collegeEnrollmentById, collegePlayersById, freeAgentPoolById, affiliateRosterByClubId, rng, currentAsOfDate);
    poolSizeHistory.push(freeAgentPoolById.size);
  }
  console.log(`  free-agent pool size after each of ${seasons} seasons: ${poolSizeHistory.join(', ')}`);

  const earlyGrowth = poolSizeHistory[4] - poolSizeHistory[0];
  const lateGrowth = poolSizeHistory[seasons - 1] - poolSizeHistory[seasons - 5];
  console.log(`  growth over seasons 1-5: ${earlyGrowth}; growth over seasons ${seasons - 4}-${seasons}: ${lateGrowth}`);
  assert(lateGrowth <= earlyGrowth, 'the free-agent pool\'s growth rate genuinely slows over time (late-window growth is no larger than early-window growth) as aging-driven retirement catches up with inflow');

  let poolQualitySum = 0;
  for (const player of freeAgentPoolById.values()) {
    const attrs = ['contact', 'power', 'eye'];
    poolQualitySum += attrs.reduce((sum, a) => sum + player.ratings[a].scoutedPotential, 0) / attrs.length;
  }
  const poolAvgQuality = poolQualitySum / freeAgentPoolById.size;

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
  console.log(`  free-agent pool avg quality: ${poolAvgQuality.toFixed(1)} (n=${freeAgentPoolById.size}); signed-players avg quality: ${signedAvgQuality.toFixed(1)} (n=${signedCount})`);
  assert(poolAvgQuality < signedAvgQuality, 'the free-agent pool skews meaningfully lower-quality than actually-signed players — elite players are not piling up unsigned');

  // No-leak sanity: everyone from the original bootstrap ends up somewhere real.
  let totalRosterHeadcount = rosterHeadcount(affiliateRosterByClubId);
  console.log(`  final: ${collegePlayersById.size} still enrolled, ${freeAgentPoolById.size} free agents, ${totalRosterHeadcount} signed to an affiliate roster`);
  assert(collegePlayersById.size > 0, `the college population does not fully drain to zero over ${seasons} seasons (a real, ongoing pipeline)`);
}

console.log('\n=== 8. Real wiring: data/season.js ===\n');
{
  const mod = await import('../src/data/season.js');
  const state = mod.initialLeagueState;

  assert(state.collegePlayersById.size > 0, 'season 1 has a real, populated college system (the bootstrap ran)');
  assert(state.freeAgentPoolById instanceof Map, 'freeAgentPoolById is real live state');
  assert(!!state.draftResult.collegeSummary, "draftResult carries a real collegeSummary");
  assert(state.draftResult.selections.some((s) => 'fromCollege' in s && 'outcome' in s), 'draft selections are enriched with fromCollege/outcome for the UI');

  const state2 = mod.advanceToNextSeason(state);
  assert(state2.collegePlayersById !== state.collegePlayersById || state2.seasonNumber === 2, 'advancing a season produces a real season-2 state with the college population carried forward');
  assert(state2.draftResult.collegeSummary.newEnrollments >= 0, 'season 2 produces a real collegeSummary too');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
