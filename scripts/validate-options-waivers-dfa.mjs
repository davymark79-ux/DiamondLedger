// Re-runnable sanity check for Options, Waivers, DFA — Phase 5 of the
// "50-man Roster System" arc (engine/optionsWaiversDfa.js):
// `npm run validate:ows`. Same style as the other validate:* scripts —
// eyeball checks plus hard asserts on structural invariants.
//
// Confirmed scope, flagged in the plan rather than asked as a separate
// question (Auto Mode): the 5-assignment-per-season option cap is NOT
// built (no sub-season transaction tracking in this engine, same reason
// Phase 4's Super Two was deferred) — only the 3-year option cap is real.
// DFA's real 7-day resolution window collapses into one atomic action —
// not tested here as a "window," since there isn't one.

import {
  OPTION_YEARS_CAP,
  hasOptionsRemaining,
  resolveWaiverClaim,
  optionPlayerToMinors,
  designateForAssignment,
} from '../src/engine/optionsWaiversDfa.js';
import { computeRetirementProbability } from '../src/engine/retirement.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { createPlayer, createRating, getAge } from '../src/models/Player.js';
import { DEVELOPMENT_LEVELS } from '../src/models/constants.js';
import { computeFreshSeason1State, advanceToNextSeason } from '../src/data/season.js';
import { computeCombinedReverseStandingsOrder } from '../src/engine/draft.js';

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

function hitter(id, contactOverride, age, overrides = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: birthdateForAge(age, AS_OF_DATE),
    ratings: { ...BASE_RATINGS, contact: createRating(contactOverride) },
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: age }),
    ...overrides,
  });
}

function emptyRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

console.log('=== 1. hasOptionsRemaining: boundary at the 3-year cap ===\n');
{
  const twoUsed = hitter('two-used', 50, 25, { serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 25, standardOptionYearsUsed: OPTION_YEARS_CAP - 1 }) });
  assert(hasOptionsRemaining(twoUsed), `${OPTION_YEARS_CAP - 1} of ${OPTION_YEARS_CAP} used: still has options remaining`);
  const atCap = hitter('at-cap', 50, 25, { serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 25, standardOptionYearsUsed: OPTION_YEARS_CAP }) });
  assert(!hasOptionsRemaining(atCap), `exactly at the ${OPTION_YEARS_CAP}-year cap: no options remaining`);
}

console.log('\n=== 2. resolveWaiverClaim: priority order, 1-for-1 release, own team skipped, no claim when nobody upgrades ===\n');
{
  const waivedPlayer = hitter('waived', 60, 28, { teamId: 'teamOwn' });
  const teamOwnRoster = { ...emptyRoster(), lineup: [waivedPlayer] };
  const teamAWeak = hitter('teamA-weak', 40, 25); // lower quality than waivedPlayer -> a real upgrade
  const teamARoster = { ...emptyRoster(), lineup: [teamAWeak] };
  const teamBStrong = hitter('teamB-strong', 80, 25); // higher quality -> NOT an upgrade, this team passes
  const teamBRoster = { ...emptyRoster(), lineup: [teamBStrong] };
  const rosterByTeamId = new Map([['teamOwn', teamOwnRoster], ['teamA', teamARoster], ['teamB', teamBRoster]]);

  // teamOwn listed first (must be skipped — it's his own team), teamB next (no upgrade, passes), teamA last (real upgrade, claims).
  const result = resolveWaiverClaim(waivedPlayer, ['teamOwn', 'teamB', 'teamA'], rosterByTeamId);
  assert(result.claimed === true, 'a genuine upgrade claims');
  assert(result.claimingTeamId === 'teamA', 'skips own team AND a non-upgrade team, claims at the first real upgrade in priority order');
  assert(result.releasedPlayerId === 'teamA-weak', 'releases the weakest same-section player on the claiming team');
  const updatedTeamA = result.updatedRosterByTeamId.get('teamA');
  assert(updatedTeamA.lineup.some((p) => p.id === 'waived'), 'the claiming team now has the waived player');
  assert(!updatedTeamA.lineup.some((p) => p.id === 'teamA-weak'), 'the released player left the claiming roster');

  const weakWaived = hitter('weak-waived', 25, 28, { teamId: 'teamOwn' });
  const strongRoster = { ...emptyRoster(), lineup: [hitter('strong-incumbent', 70, 25)] };
  const rosterByTeamId2 = new Map([['teamOwn', { ...emptyRoster(), lineup: [weakWaived] }], ['teamX', strongRoster]]);
  const noClaim = resolveWaiverClaim(weakWaived, ['teamOwn', 'teamX'], rosterByTeamId2);
  assert(noClaim.claimed === false, 'no team claims a player who would not be a genuine upgrade anywhere');
}

console.log('\n=== 3. optionPlayerToMinors: real send-down, option counter increments, blocked once out of options ===\n');
{
  const player = hitter('opt-p', 50, 25, { teamId: 'teamY' });
  const rosterByTeamId = new Map([['teamY', { ...emptyRoster(), lineup: [player] }]]);
  const affiliateRosterByClubId = new Map([['teamY-AAA', emptyRoster()]]);

  const result = optionPlayerToMinors('opt-p', 'teamY', rosterByTeamId, affiliateRosterByClubId);
  assert(result !== null, 'a real send-down succeeds when options remain and an AAA affiliate exists');
  assert(!result.updatedRosterByTeamId.get('teamY').lineup.some((p) => p.id === 'opt-p'), 'removed from the active roster');
  const sentDown = result.updatedAffiliateRosterByClubId.get('teamY-AAA').lineup.find((p) => p.id === 'opt-p');
  assert(!!sentDown, 'added to the AAA affiliate roster');
  assert(sentDown.serviceRecord.standardOptionYearsUsed === 1, 'the option counter increments by exactly 1');
  assert(sentDown.developmentLevel === DEVELOPMENT_LEVELS.AAA, 'developmentLevel updates to AAA');

  const outOfOptions = hitter('no-opt', 50, 25, { teamId: 'teamY', serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 25, standardOptionYearsUsed: OPTION_YEARS_CAP }) });
  const rosterByTeamId2 = new Map([['teamY', { ...emptyRoster(), lineup: [outOfOptions] }]]);
  const blocked = optionPlayerToMinors('no-opt', 'teamY', rosterByTeamId2, affiliateRosterByClubId);
  assert(blocked === null, 'blocked once a player is out of options — caller should route to designateForAssignment instead');
}

console.log('\n=== 4. designateForAssignment: three real outcomes ===\n');
{
  // (a) CLAIMED
  const dfaClaimed = hitter('dfa-claimed', 60, 28, { teamId: 'teamZ' });
  const rosterByTeamIdA = new Map([
    ['teamZ', { ...emptyRoster(), lineup: [dfaClaimed] }],
    ['teamW', { ...emptyRoster(), lineup: [hitter('weak-claimer', 30, 25)] }],
  ]);
  const resultA = designateForAssignment('dfa-claimed', 'teamZ', rosterByTeamIdA, new Map([['teamZ-AAA', emptyRoster()]]), ['teamW', 'teamZ'], new Map());
  assert(resultA.outcome === 'CLAIMED', `expected CLAIMED (got ${resultA?.outcome})`);
  assert(resultA.claimingTeamId === 'teamW', 'claimed by the correct team');
  assert(resultA.updatedRosterByTeamId.get('teamW').lineup.some((p) => p.id === 'dfa-claimed'), 'the claiming team now has him');
  assert(!resultA.updatedRosterByTeamId.get('teamZ').lineup.some((p) => p.id === 'dfa-claimed'), 'his original team no longer has him');
  assert(resultA.establishedFreeAgentPoolById.has('weak-claimer'), 'the player bumped to make room enters the free-agent pool');

  // (b) OUTRIGHT_ASSIGNED — young, low service time, not refusal-eligible; nobody claims him.
  const dfaOutright = hitter('dfa-outright', 40, 24, { teamId: 'teamZ', serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 24, mlbServiceDays: 172 }) });
  const rosterByTeamIdB = new Map([
    ['teamZ', { ...emptyRoster(), lineup: [dfaOutright] }],
    ['teamOther', { ...emptyRoster(), lineup: [hitter('strong-other', 75, 25)] }],
  ]);
  const resultB = designateForAssignment('dfa-outright', 'teamZ', rosterByTeamIdB, new Map([['teamZ-AAA', emptyRoster()]]), ['teamOther'], new Map());
  assert(resultB.outcome === 'OUTRIGHT_ASSIGNED', `expected OUTRIGHT_ASSIGNED (got ${resultB?.outcome})`);
  const outrighted = resultB.affiliateRosterByClubId.get('teamZ-AAA').lineup.find((p) => p.id === 'dfa-outright');
  assert(!!outrighted, 'outright-assigned to the AAA affiliate');
  assert(outrighted.serviceRecord.wasOutrightedBefore === true, "wasOutrightedBefore flips to true -- Phase 4's isOutrightRefusalEligible finally gets a real input");

  // (c) REFUSED_FREE_AGENCY — a real veteran (6 years -> unconditionally outright-refusal-eligible), unclaimed.
  const dfaRefuse = hitter('dfa-refuse', 40, 32, { teamId: 'teamZ', serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, mlbServiceDays: 172 * 6 }) });
  const rosterByTeamIdC = new Map([
    ['teamZ', { ...emptyRoster(), lineup: [dfaRefuse] }],
    ['teamOther', { ...emptyRoster(), lineup: [hitter('strong-other-2', 75, 25)] }],
  ]);
  const resultC = designateForAssignment('dfa-refuse', 'teamZ', rosterByTeamIdC, new Map([['teamZ-AAA', emptyRoster()]]), ['teamOther'], new Map());
  assert(resultC.outcome === 'REFUSED_FREE_AGENCY', `expected REFUSED_FREE_AGENCY (got ${resultC?.outcome})`);
  assert(resultC.establishedFreeAgentPoolById.has('dfa-refuse'), 'he becomes a real free agent instead of accepting the assignment');
}

console.log('\n=== 5. computeRetirementProbability: the DFA bump (engine/retirement.js trigger 3) ===\n');
{
  // Same player, same age, same ratings — only the DFA outcome differs.
  const veteran = (id, age) => hitter(id, 40, age, {
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, mlbServiceDays: 172 * 8 }),
  });
  const v = veteran('vet', 36);
  const opts = (dfaOutcome) => ({ asOfDate: AS_OF_DATE, dfaOutcome });

  const none = computeRetirementProbability(v, opts(null));
  const outright = computeRetirementProbability(v, opts('OUTRIGHT_ASSIGNED'));
  const refused = computeRetirementProbability(v, opts('REFUSED_FREE_AGENCY'));

  assert(outright > none, `OUTRIGHT_ASSIGNED raises retirement probability (${none.toFixed(3)} -> ${outright.toFixed(3)})`);
  assert(refused > none, `REFUSED_FREE_AGENCY raises it too (${none.toFixed(3)} -> ${refused.toFixed(3)})`);
  // The asymmetry is the design, not an accident — see retirement.js's
  // trigger 3: an outrighted player never rolls retirement again anywhere,
  // while a refusal lands him in a pool that already rolls him annually.
  assert(outright > refused, `outright-assignment carries the LARGER bump (${outright.toFixed(3)} > ${refused.toFixed(3)}) -- it is the only roll he will ever get`);

  // Gated exactly like the SEASON_ENDING injury bump.
  const young = veteran('young-vet', 26);
  assert(
    computeRetirementProbability(young, opts('OUTRIGHT_ASSIGNED')) === computeRetirementProbability(young, opts(null)),
    'below the age gate, a DFA changes nothing at all (a 26-year-old being buried is adversity, not a career ending)'
  );

  // Outcomes that must never bump.
  for (const ignored of ['CLAIMED', 'RETURNED_TO_ORIGINAL_CLUB', 'NOT_A_REAL_OUTCOME']) {
    assert(computeRetirementProbability(v, opts(ignored)) === none, `${ignored} carries no bump (and does not throw)`);
  }

  console.log('\n  Resulting probability curve (unclaimed veteran, decline term included):');
  console.log('    age   base   outrighted   refused');
  for (const age of [32, 33, 36, 39, 42]) {
    const p = veteran(`curve-${age}`, age);
    const b = computeRetirementProbability(p, opts(null));
    const o = computeRetirementProbability(p, opts('OUTRIGHT_ASSIGNED'));
    const r = computeRetirementProbability(p, opts('REFUSED_FREE_AGENCY'));
    console.log(`    ${String(age).padEnd(5)} ${b.toFixed(3)}  ${o.toFixed(3)}        ${r.toFixed(3)}`);
  }
  console.log('');
}

console.log('\n=== 6. designateForAssignment: the RETIRED outcome ===\n');
{
  // A real veteran: 8 years of service (unconditionally outright-refusal-
  // eligible), 37 years old, unclaimed because nobody would upgrade.
  const makeState = (age) => {
    const vet = hitter('dfa-vet', 40, age, {
      teamId: 'teamZ',
      serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, mlbServiceDays: 172 * 8 }),
    });
    return {
      rosterByTeamId: new Map([
        ['teamZ', { ...emptyRoster(), lineup: [vet] }],
        ['teamOther', { ...emptyRoster(), lineup: [hitter('strong', 75, 25)] }],
      ]),
      affiliates: new Map([['teamZ-AAA', emptyRoster()]]),
    };
  };

  // rng 0.0001 forces the roll (never a bare () => 0 -- see CLAUDE.md's Key
  // conventions; harmless here, but the convention is worth keeping).
  const s1 = makeState(37);
  const retired = designateForAssignment('dfa-vet', 'teamZ', s1.rosterByTeamId, s1.affiliates, ['teamOther'], new Map(), { rng: () => 0.0001, asOfDate: AS_OF_DATE });
  assert(retired.outcome === 'RETIRED', `an unclaimed 37-year-old can retire instead of reporting (got ${retired?.outcome})`);
  assert(retired.retiredFrom === 'REFUSED_FREE_AGENCY', `records which path he retired from (got ${retired?.retiredFrom})`);
  assert(!retired.updatedRosterByTeamId.get('teamZ').lineup.some((p) => p.id === 'dfa-vet'), 'he is off the active roster');
  assert(retired.establishedFreeAgentPoolById.size === 0, 'a retired player does NOT enter the free-agent pool');
  assert(retired.affiliateRosterByClubId.get('teamZ-AAA').lineup.length === 0, 'and does NOT land on the AAA affiliate -- retirement REPLACES the landing spot');

  // Same fixture, rng that never fires -> the normal outcome, unchanged.
  const s2 = makeState(37);
  const notRetired = designateForAssignment('dfa-vet', 'teamZ', s2.rosterByTeamId, s2.affiliates, ['teamOther'], new Map(), { rng: () => 0.999, asOfDate: AS_OF_DATE });
  assert(notRetired.outcome === 'REFUSED_FREE_AGENCY', `the same veteran who does not retire still resolves normally (got ${notRetired?.outcome})`);
  assert(notRetired.establishedFreeAgentPoolById.has('dfa-vet'), 'and does enter the free-agent pool');

  // The age gate holds end-to-end, not just in the probability function.
  const s3 = makeState(26);
  const youngResult = designateForAssignment('dfa-vet', 'teamZ', s3.rosterByTeamId, s3.affiliates, ['teamOther'], new Map(), { rng: () => 0.0001, asOfDate: AS_OF_DATE });
  assert(youngResult.outcome !== 'RETIRED', `a 26-year-old never retires off a DFA even at a forcing rng (got ${youngResult.outcome})`);

  // CLAIMED must never retire -- he was picked up, which is the opposite signal.
  const claimedVet = hitter('claimed-vet', 60, 38, { teamId: 'teamZ', serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, mlbServiceDays: 172 * 8 }) });
  const claimRosters = new Map([
    ['teamZ', { ...emptyRoster(), lineup: [claimedVet] }],
    ['teamW', { ...emptyRoster(), lineup: [hitter('weak', 30, 25)] }],
  ]);
  const claimed = designateForAssignment('claimed-vet', 'teamZ', claimRosters, new Map([['teamZ-AAA', emptyRoster()]]), ['teamW'], new Map(), { rng: () => 0.0001, asOfDate: AS_OF_DATE });
  assert(claimed.outcome === 'CLAIMED', `a claimed 38-year-old is never offered the retirement roll at all (got ${claimed.outcome})`);

  // A failed Rule 5 pick goes home, never retires -- he is a young prospect.
  const r5 = hitter('r5-vet', 40, 38, {
    teamId: 'holder',
    serviceRecord: { ...createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22, mlbServiceDays: 172 * 8 }), rule5: { originalTeamId: 'orig' } },
  });
  const r5Rosters = new Map([['holder', { ...emptyRoster(), lineup: [r5] }]]);
  const r5Result = designateForAssignment('r5-vet', 'holder', r5Rosters, new Map([['orig-AAA', emptyRoster()]]), ['holder'], new Map(), { rng: () => 0.0001, asOfDate: AS_OF_DATE });
  assert(r5Result.outcome === 'RETURNED_TO_ORIGINAL_CLUB', `a Rule 5 return short-circuits before the retirement roll (got ${r5Result.outcome})`);
}

console.log('\n=== 7. Real integration: a genuine multi-season save, real teams, real rosters ===\n');
{
  let s = computeFreshSeason1State();
  for (let i = 0; i < 3; i++) s = advanceToNextSeason(s);

  const teamId = [...s.rosterByTeamId.keys()][0];
  const roster = s.rosterByTeamId.get(teamId);
  const optionTarget = roster.lineup[0];
  const dfaTarget = roster.lineup[1];

  const optResult = optionPlayerToMinors(optionTarget.id, teamId, s.rosterByTeamId, s.affiliateRosterByClubId);
  assert(optResult !== null || !hasOptionsRemaining(optionTarget), 'optionPlayerToMinors against real state either succeeds or is correctly blocked, never crashes');

  const waiverOrder = computeCombinedReverseStandingsOrder([...s.rosterByTeamId.keys()].map((id) => ({ id })), s.seasonResult.standingsById);
  assert(waiverOrder.length === s.rosterByTeamId.size, `waiver priority order covers every real team (got ${waiverOrder.length}, expected ${s.rosterByTeamId.size})`);

  // An explicit rng, deliberately: dfaTarget is a REAL player of unknown
  // age, so leaving this at the Math.random default would make the outcome
  // assertion below genuinely flaky the moment he happens to be 33+.
  const dfaResult = designateForAssignment(dfaTarget.id, teamId, s.rosterByTeamId, s.affiliateRosterByClubId, waiverOrder, s.establishedFreeAgentPoolById, { rng: () => 0.999, asOfDate: s.asOfDate });
  assert(dfaResult !== null, 'designateForAssignment against a real, live save succeeds');
  assert(['CLAIMED', 'OUTRIGHT_ASSIGNED', 'REFUSED_FREE_AGENCY'].includes(dfaResult.outcome), `a real, valid outcome was produced (got ${dfaResult.outcome})`);

  // The same real DFA at a forcing rng: either he retires, or he is too
  // young / was claimed. Both are correct; what must never happen is a
  // crash or a player landing in two places at once.
  const forced = designateForAssignment(dfaTarget.id, teamId, s.rosterByTeamId, s.affiliateRosterByClubId, waiverOrder, s.establishedFreeAgentPoolById, { rng: () => 0.0001, asOfDate: s.asOfDate });
  assert(forced !== null, 'the same DFA at a forcing rng also resolves cleanly against real state');

  // The above frequently resolves CLAIMED (a real 50-team waiver order
  // almost always finds someone who'd upgrade), which would leave the
  // RETIRED-against-real-state path never actually exercised. Isolate it:
  // a real 33+ player off a real roster, with an EMPTY waiver order so the
  // unclaimed branch is guaranteed. Everything else stays real state.
  let oldTarget = null, oldTargetTeamId = null;
  outer: for (const [tid, r] of s.rosterByTeamId) {
    for (const k of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of r[k]) {
        if (getAge(p, s.asOfDate) >= 36) { oldTarget = p; oldTargetTeamId = tid; break outer; }
      }
    }
  }
  assert(oldTarget !== null, 'found a real 36+ player on a real roster to exercise the retirement path');
  if (oldTarget) {
    const retiredForReal = designateForAssignment(
      oldTarget.id, oldTargetTeamId, s.rosterByTeamId, s.affiliateRosterByClubId, [], s.establishedFreeAgentPoolById,
      { rng: () => 0.0001, asOfDate: s.asOfDate }
    );
    assert(retiredForReal.outcome === 'RETIRED', `a real unclaimed 36+ player retires (got ${retiredForReal?.outcome})`);
    const inPool = retiredForReal.establishedFreeAgentPoolById.has(oldTarget.id);
    const onAffiliate = [...retiredForReal.affiliateRosterByClubId.values()].some((r) =>
      ['lineup', 'rotation', 'bullpen', 'bench'].some((k) => (r[k] ?? []).some((p) => p.id === oldTarget.id))
    );
    const stillActive = [...retiredForReal.updatedRosterByTeamId.values()].some((r) =>
      ['lineup', 'rotation', 'bullpen', 'bench'].some((k) => r[k].some((p) => p.id === oldTarget.id))
    );
    assert(!inPool, 'a real retired player is in NO free-agent pool');
    assert(!onAffiliate, 'a real retired player is on NO affiliate roster');
    assert(!stillActive, 'a real retired player is on NO active roster -- he is genuinely gone from the league');
  }
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
