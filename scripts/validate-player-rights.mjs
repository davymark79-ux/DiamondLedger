// Re-runnable sanity check for Player Rights — Phase 9 of the "50-man
// Roster System" arc: `npm run validate:rights`.
//
// Scope note: the roadmap's third right, OUTRIGHT REFUSAL, was already
// built and wired in Phase 5 (designateForAssignment's real
// REFUSED_FREE_AGENCY outcome) and is covered by validate:ows — it is not
// re-tested here. What's new in Phase 9 is 10-and-5 no-trade rights and
// minor-league free agency.

import { executeTrade, computeNoTradeConsentProbability, NO_TRADE_BASE_CONSENT } from '../src/engine/trades.js';
import {
  findMinorLeagueFreeAgents,
  runMinorLeagueFreeAgencySweep,
  advanceMinorLeagueFreeAgentPool,
  MINOR_LEAGUE_FA_DEPARTURE_RATE,
} from '../src/engine/minorLeagueFreeAgency.js';
import { advanceServiceTime, isTenAndFiveEligible, SERVICE_DAYS_PER_SEASON, MINOR_LEAGUE_FREE_AGENCY_SEASONS, TEN_AND_FIVE_TOTAL_YEARS } from '../src/engine/serviceTime.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { computeFreshSeason1State, advanceToNextSeason } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  OK   ${message}`);
  else { console.log(`  FAIL ${message}`); failures++; }
}

const AS_OF_DATE = new Date('2026-07-27');
const RATING_KEYS = [
  'contact', 'power', 'eye', 'buntingSkill', 'speed', 'baserunningInstincts',
  'fielding', 'armStrength', 'armAccuracy',
  'workEthic', 'durability', 'consistency', 'coachability', 'platoonSkill',
];
const SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

function birthdateForAge(age, asOfDate) {
  const d = new Date(asOfDate);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

function player(id, quality, serviceOverrides = {}, extra = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: birthdateForAge(30, AS_OF_DATE),
    ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, createRating(quality)])),
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, ...serviceOverrides }),
    ...extra,
  });
}

const emptyRoster = () => ({ lineup: [], rotation: [], bullpen: [], bench: [] });

function affiliateChain(teamId, extra = {}) {
  return new Map([
    [`${teamId}-AAA`, { ...emptyRoster(), lineup: [player(`${teamId}-aaa`, 30)] }],
    [`${teamId}-AA`, { ...emptyRoster(), lineup: [player(`${teamId}-aa`, 28)] }],
    [`${teamId}-A`, { ...emptyRoster(), lineup: [player(`${teamId}-a`, 26)] }],
    [`${teamId}-ROOKIE`, { ...emptyRoster(), lineup: [player(`${teamId}-rk`, 24)] }],
    ...Object.entries(extra),
  ]);
}

console.log('=== 1. Org continuity: increments on a stable org, RESETS on a real org change ===\n');
{
  const p = player('stayer', 50, {}, { teamId: 'teamA' });
  const rosterByTeamId = new Map([['teamA', { ...emptyRoster(), lineup: [p] }]]);
  const affiliates = new Map();

  for (let i = 1; i <= 3; i++) advanceServiceTime(rosterByTeamId, new Map(), affiliates, i, AS_OF_DATE);
  const after3 = rosterByTeamId.get('teamA').lineup[0].serviceRecord;
  assert(after3.consecutiveSeasonsWithOrg === 3, `3 seasons with the same org counts 3 (got ${after3.consecutiveSeasonsWithOrg})`);
  assert(after3.lastOrgTeamId === 'teamA', 'and records the org he is in');

  // The reset must be driven by a REAL org change, not a hand-set field —
  // that's the whole point of the self-correcting design.
  const vet = rosterByTeamId.get('teamA').lineup[0];
  const rosters = new Map([
    ['teamA', { ...emptyRoster(), lineup: [vet] }],
    ['teamB', { ...emptyRoster(), lineup: [player('other', 50, {}, { teamId: 'teamB' })] }],
  ]);
  const traded = executeTrade('teamA', 'teamB', ['stayer'], [], rosters, new Map([['teamA', []], ['teamB', []]]), new Map([['teamA', []], ['teamB', []]]), new Map(), () => 0.99);
  assert(traded?.outcome === 'COMPLETED', `the trade itself completed (got ${traded?.outcome})`);

  advanceServiceTime(traded.updatedRosterByTeamId, new Map(), new Map(), 4, AS_OF_DATE);
  const movedRecord = traded.updatedRosterByTeamId.get('teamB').lineup.find((x) => x.id === 'stayer').serviceRecord;
  assert(movedRecord.consecutiveSeasonsWithOrg === 1, `an org change RESETS the counter to 1 (got ${movedRecord.consecutiveSeasonsWithOrg}) — driven through a real executeTrade, with no transaction-site bookkeeping call`);
  assert(movedRecord.lastOrgTeamId === 'teamB', 'and the tracked org follows him');
}

console.log('\n=== 2. isTenAndFiveEligible needs BOTH halves ===\n');
{
  const tenYears = TEN_AND_FIVE_TOTAL_YEARS * SERVICE_DAYS_PER_SEASON;
  assert(isTenAndFiveEligible(createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: tenYears }), 5), '10 years service + 5 consecutive with the org qualifies');
  assert(!isTenAndFiveEligible(createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: tenYears }), 4), '10 years but only 4 consecutive does NOT');
  assert(!isTenAndFiveEligible(createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: tenYears - SERVICE_DAYS_PER_SEASON }), 9), '9 years service does NOT, however long he has been with the club');
}

console.log('\n=== 3. Consent probability rises with a better destination ===\n');
{
  const weak = { ...emptyRoster(), lineup: [player('w1', 30), player('w2', 30)] };
  const strong = { ...emptyRoster(), lineup: [player('s1', 70), player('s2', 70)] };
  const toBetter = computeNoTradeConsentProbability(weak, strong);
  const toWorse = computeNoTradeConsentProbability(strong, weak);
  const lateral = computeNoTradeConsentProbability(weak, weak);
  console.log(`  to a better club ${toBetter.toFixed(2)} | lateral ${lateral.toFixed(2)} | to a worse club ${toWorse.toFixed(2)}`);
  assert(toBetter > toWorse, 'a veteran consents more readily to a genuinely better club than a worse one');
  assert(Math.abs(lateral - NO_TRADE_BASE_CONSENT) < 1e-9, 'a lateral move sits exactly at the base consent rate');
  assert(toBetter <= 1 && toWorse >= 0, 'probabilities stay clamped to [0,1]');
}

console.log('\n=== 4. A refused trade changes NOTHING ===\n');
{
  const tenYears = TEN_AND_FIVE_TOTAL_YEARS * SERVICE_DAYS_PER_SEASON;
  const vet = player('vet', 60, { mlbServiceDays: tenYears, consecutiveSeasonsWithOrg: 6 }, { teamId: 'teamA' });
  const rosterByTeamId = new Map([
    ['teamA', { ...emptyRoster(), lineup: [vet] }],
    ['teamB', { ...emptyRoster(), lineup: [player('b1', 50, {}, { teamId: 'teamB' })] }],
  ]);
  const reserve = new Map([['teamA', []], ['teamB', []]]);
  const taxi = new Map([['teamA', []], ['teamB', []]]);

  // rng() = 0.99 -> above any consent probability -> he refuses.
  const refused = executeTrade('teamA', 'teamB', ['vet'], [], rosterByTeamId, reserve, taxi, new Map(), () => 0.99);
  assert(refused?.outcome === 'NO_TRADE_REFUSED', `a 10-and-5 veteran can refuse outright (got ${refused?.outcome})`);
  assert(refused.refusingPlayerId === 'vet', 'and the refusing player is named');
  assert(rosterByTeamId.get('teamA').lineup.some((p) => p.id === 'vet'), 'he is still on his original club — no map was touched');
  assert(rosterByTeamId.get('teamB').lineup.length === 1, 'and the acquiring club is unchanged');

  // A SEQUENCED rng, not a constant: the consent check and the medical
  // review read the same rng but want opposite ends of it — consent needs
  // a LOW draw to waive (`rng() >= consent` refuses), the medical review
  // needs a HIGH draw to pass (`rng() < failureRate` fails). A single
  // constant can never satisfy both, so the first draw waives and every
  // later draw clears the physical.
  let call = 0;
  const consented = executeTrade('teamA', 'teamB', ['vet'], [], rosterByTeamId, reserve, taxi, new Map(), () => (call++ === 0 ? 0.0001 : 0.99));
  assert(consented?.outcome === 'COMPLETED', `the same veteran CAN be traded when he waives (got ${consented?.outcome})`);

  // A non-10-and-5 player is never asked at all.
  const kid = player('kid', 60, { mlbServiceDays: SERVICE_DAYS_PER_SEASON * 2, consecutiveSeasonsWithOrg: 2 }, { teamId: 'teamA' });
  const rosters2 = new Map([
    ['teamA', { ...emptyRoster(), lineup: [kid] }],
    ['teamB', { ...emptyRoster(), lineup: [player('b2', 50, {}, { teamId: 'teamB' })] }],
  ]);
  const kidTrade = executeTrade('teamA', 'teamB', ['kid'], [], rosters2, reserve, taxi, new Map(), () => 0.99);
  assert(kidTrade?.outcome === 'COMPLETED', 'a player without 10-and-5 rights is traded without any consent check, even at the same rng draw that made the veteran refuse');
}

console.log('\n=== 5. Minor-league free agency: eligibility, departure, and the BACKFILL ===\n');
{
  const walker = player('walker', 40, { minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS, wasEverProtected: false });
  const protectedGuy = player('protected', 40, { minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS, wasEverProtected: true });
  const tooEarly = player('too-early', 40, { minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS - 1 });

  const affiliates = affiliateChain('org', {
    'org-AA': { ...emptyRoster(), lineup: [walker, protectedGuy, tooEarly] },
  });
  const eligible = findMinorLeagueFreeAgents(affiliates);
  const ids = eligible.map((e) => e.player.id);
  assert(ids.includes('walker'), 'an unprotected player past the minor-league service threshold is eligible');
  assert(!ids.includes('protected'), 'a player who was ever on a 50-man is NOT — that is Rule 5 territory, not this');
  assert(!ids.includes('too-early'), 'one season short is not eligible');
  assert(eligible.find((e) => e.player.id === 'walker').teamId === 'org', 'the owning org is parsed correctly');

  const aaBefore = affiliates.get('org-AA').lineup.length;
  const pool = new Map();
  const teamsById = new Map([['org', { id: 'org' }]]);
  // Below the departure rate -> everyone eligible walks. A small NONZERO
  // constant, never 0: the resulting backfill reaches gaussianRandom,
  // which spins forever on a constant-zero rng (CLAUDE.md §18).
  const { departed } = runMinorLeagueFreeAgencySweep(affiliates, pool, teamsById, () => 0.0001, AS_OF_DATE);
  assert(departed.length === 1 && departed[0].playerId === 'walker', 'exactly the eligible player departed');
  assert(!affiliates.get('org-AA').lineup.some((p) => p.id === 'walker'), 'he left his affiliate roster');
  assert(affiliates.get('org-AA').lineup.length === aaBefore, `and the vacated slot was BACKFILLED — org-AA still holds ${aaBefore} (the §34/§40 depletion bug, guarded directly)`);
  assert(pool.has('walker'), 'he landed in the minor-league free-agent pool');
  assert(pool.get('walker').teamId === null, 'with his org ties cut');
}

console.log('\n=== 6. Most eligible players re-sign rather than walking ===\n');
{
  const affiliates = affiliateChain('org2', {
    'org2-AA': { ...emptyRoster(), lineup: Array.from({ length: 100 }, (_, i) =>
      player(`w${i}`, 40, { minorsSeasonsAccrued: MINOR_LEAGUE_FREE_AGENCY_SEASONS })) },
  });
  const pool = new Map();
  // A deterministic sweep across (0,1) — the share below the rate departs.
  // The +0.5 offset is load-bearing, not cosmetic: a departure triggers
  // backfillLevelFromBelow -> generateForLevel -> gaussianRandom, whose
  // `while (u === 0) u = rng()` spins FOREVER on an rng that can return
  // exactly 0. CLAUDE.md §18 recorded this exact trap; an earlier draft of
  // this very script reintroduced it and hung.
  let n = 0;
  const { departed, eligibleCount } = runMinorLeagueFreeAgencySweep(affiliates, pool, new Map([['org2', { id: 'org2' }]]), () => ((n++ % 100) + 0.5) / 100, AS_OF_DATE);
  assert(eligibleCount === 100, `all 100 are eligible (got ${eligibleCount})`);
  const share = departed.length / eligibleCount;
  console.log(`  ${departed.length}/100 walked (departure rate ${MINOR_LEAGUE_FA_DEPARTURE_RATE})`);
  assert(share < 0.5, `the large majority re-sign with their own org rather than walking (${(share * 100).toFixed(0)}% left) — this is what bounds the annual exodus`);
}

console.log('\n=== 7. Pool pruning reuses retirement.js\'s REAL established curve ===\n');
{
  const pool = new Map();
  pool.set('young', player('young', 40, {}, { birthdate: birthdateForAge(24, AS_OF_DATE) }));
  for (let i = 0; i < 40; i++) pool.set(`old${i}`, player(`old${i}`, 40, {}, { birthdate: birthdateForAge(43, AS_OF_DATE) }));
  const before = pool.size;
  // A low but NONZERO draw — retirement.js's established curve is gentler
  // than the amateur curves (an early version of this check used 0.5 and
  // saw zero retirements, which was the test's expectation being wrong,
  // not the engine's). Still never 0, per the gaussianRandom note above.
  const { retired } = advanceMinorLeagueFreeAgentPool(pool, () => 0.02, AS_OF_DATE);
  console.log(`  ${retired} of ${before} retired at a 0.02 draw`);
  assert(retired > 0, `real retirements happen against the established curve (${retired} of ${before})`);
  assert(pool.has('young'), 'a 24-year-old survives the same pass that retired 43-year-olds — proving it is a real age curve, not a flat roll');
  assert(pool.size === before - retired, 'the pool shrank by exactly the retired count');
}

console.log('\n=== 8. Real integration: nothing drains, the pool stays bounded ===\n');
{
  let s = computeFreshSeason1State();
  assert(s.playerRightsResult.minorLeagueFreeAgents.length === 0, 'season 1 has no minor-league free agents — nobody has accrued 7 minor-league seasons yet');
  assert(s.minorLeagueFreeAgentPoolById.size === 0, 'and the pool starts empty');

  let minAffiliate = Infinity, minActive = Infinity;
  const walked = [];
  for (let i = 0; i < 8; i++) {
    s = advanceToNextSeason(s);
    walked.push(s.playerRightsResult.minorLeagueFreeAgents.length);
    for (const [, r] of s.rosterByTeamId) for (const k of SECTIONS) minActive = Math.min(minActive, r[k].length);
    for (const [, r] of s.affiliateRosterByClubId) {
      for (const k of SECTIONS.filter((x) => x !== 'bench')) minAffiliate = Math.min(minAffiliate, r[k].length);
    }
  }

  console.log(`  walked per season: ${walked.join(', ')}  |  pool now ${s.minorLeagueFreeAgentPoolById.size}`);
  assert(walked.some((n) => n > 0), 'real minor-league free agents genuinely walk against live state');
  assert(minAffiliate > 0, `no AFFILIATE section ever drained empty (smallest: ${minAffiliate}) — the §34/§40 regression this phase is most at risk of`);
  assert(minActive > 0, `no ACTIVE roster section ever drained (smallest: ${minActive})`);

  let activeTotal = 0;
  for (const [, r] of s.rosterByTeamId) for (const k of SECTIONS) activeTotal += r[k].length;
  assert(activeTotal === 1300, `all 50 clubs still carry exactly 26 active players (got ${activeTotal})`);
  assert(s.minorLeagueFreeAgentPoolById.size < 20000, `the pool stays bounded rather than growing without limit (${s.minorLeagueFreeAgentPoolById.size})`);
  assert(s.schemaVersion === 23, `schemaVersion is the current STATE_SCHEMA_VERSION, 23 (got ${s.schemaVersion})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
