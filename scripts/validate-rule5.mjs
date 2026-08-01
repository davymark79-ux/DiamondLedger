// Re-runnable sanity check for the Rule 5 Draft — Phase 8 of the "50-man
// Roster System" arc (engine/rule5Draft.js): `npm run validate:rule5`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.
//
// The regression this phase is MOST at risk of is roster depletion: a
// selection pulls a player out of a finite, season-persistent affiliate
// pool. Phase 1 (§34) and Phase 7 (§40) both shipped that bug and both
// crashed several seasons later. Section 6 exists specifically to catch it.

import {
  findExposedPlayers,
  runRule5Draft,
  resolveRule5Obligations,
  RULE5_MIN_UPGRADE_MARGIN,
} from '../src/engine/rule5Draft.js';
import { optionPlayerToMinors, designateForAssignment } from '../src/engine/optionsWaiversDfa.js';
import { RULE5_SEASONS_SIGNED_19_PLUS } from '../src/engine/serviceTime.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { computeFreshSeason1State, advanceToNextSeason } from '../src/data/season.js';

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

/** A CF at a given quality, optionally already exposed (signed long ago, never protected). */
function player(id, quality, { firstProSeasonNumber = 1, wasEverProtected = false, teamId = null, rule5 = null } = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    teamId,
    birthdate: birthdateForAge(24, AS_OF_DATE),
    ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, createRating(quality)])),
    serviceRecord: createServiceRecord({ firstProSeasonNumber, ageAtSigning: 22, wasEverProtected, rule5 }),
  });
}

function emptyRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

// A full 4-level affiliate chain so backfill has somewhere to cascade from.
function affiliateChain(teamId, extra = {}) {
  return new Map([
    [`${teamId}-AAA`, { ...emptyRoster(), lineup: [player(`${teamId}-aaa`, 30)] }],
    [`${teamId}-AA`, { ...emptyRoster(), lineup: [player(`${teamId}-aa`, 28)] }],
    [`${teamId}-A`, { ...emptyRoster(), lineup: [player(`${teamId}-a`, 26)] }],
    [`${teamId}-ROOKIE`, { ...emptyRoster(), lineup: [player(`${teamId}-rk`, 24)] }],
    ...Object.entries(extra),
  ]);
}

const EXPOSED_SEASON = 1 + RULE5_SEASONS_SIGNED_19_PLUS; // signed season 1, exposed by this season

console.log('=== 1. findExposedPlayers: only unprotected players past the threshold ===\n');
{
  const affiliates = new Map([
    ['teamA-AAA', { ...emptyRoster(), lineup: [
      player('exposed-guy', 40),
      player('protected-guy', 40, { wasEverProtected: true }),
      player('too-recent', 40, { firstProSeasonNumber: EXPOSED_SEASON }),
    ] }],
  ]);
  const found = findExposedPlayers(affiliates, EXPOSED_SEASON);
  const ids = found.map((f) => f.player.id);
  assert(ids.includes('exposed-guy'), 'an unprotected player past the season threshold IS exposed');
  assert(!ids.includes('protected-guy'), 'a player who was ever on the 50-man is NEVER exposed');
  assert(!ids.includes('too-recent'), 'a recently-signed player is not yet exposed');
  assert(found[0].originalTeamId === 'teamA' && found[0].level === 'AAA', 'the owning org and level are parsed correctly from the club id');
}

console.log('\n=== 1b. club-id parsing survives a real hyphenated team id ===\n');
{
  // Real ids look like "alexandria-va-exchange" — a naive split('-') breaks.
  const affiliates = new Map([['alexandria-va-exchange-AA', { ...emptyRoster(), lineup: [player('hyphen-guy', 40)] }]]);
  const found = findExposedPlayers(affiliates, EXPOSED_SEASON);
  assert(found.length === 1, 'found the player under a multi-hyphen team id');
  assert(found[0].originalTeamId === 'alexandria-va-exchange', `org id parsed as the FULL team id (got "${found[0].originalTeamId}")`);
  assert(found[0].level === 'AA', 'level parsed as the last segment only');
}

console.log('\n=== 2. The upgrade margin gate: a marginal upgrade is NOT worth a pick ===\n');
{
  const teams = [{ id: 'picker' }, { id: 'owner' }];
  const standings = new Map([['picker', { wins: 0, losses: 100 }], ['owner', { wins: 100, losses: 0 }]]);

  function draftWith(exposedQuality) {
    const rosterByTeamId = new Map([
      ['picker', { ...emptyRoster(), lineup: [player('incumbent', 40, { teamId: 'picker' })] }],
      ['owner', { ...emptyRoster(), lineup: [player('owner-guy', 50, { teamId: 'owner' })] }],
    ]);
    const affiliates = new Map([
      ...affiliateChain('picker'),
      ...affiliateChain('owner', { 'owner-AAA': { ...emptyRoster(), lineup: [player('prospect', exposedQuality)] } }),
    ]);
    return runRule5Draft(teams, standings, rosterByTeamId, affiliates, EXPOSED_SEASON, () => 0.5, AS_OF_DATE);
  }

  const marginal = draftWith(40 + RULE5_MIN_UPGRADE_MARGIN - 1);
  assert(marginal.selections.length === 0, `a prospect only ${RULE5_MIN_UPGRADE_MARGIN - 1} points better than the incumbent is NOT selected — the roster commitment isn't worth it`);

  const real = draftWith(40 + RULE5_MIN_UPGRADE_MARGIN + 5);
  assert(real.selections.length === 1, `a prospect ${RULE5_MIN_UPGRADE_MARGIN + 5} points better IS selected`);
  assert(real.selections[0].playerId === 'prospect', 'and it is the right player');
}

console.log('\n=== 3. A selection: roster effects AND the original org backfilled ===\n');
{
  const teams = [{ id: 'picker' }, { id: 'owner' }];
  const standings = new Map([['picker', { wins: 0, losses: 100 }], ['owner', { wins: 100, losses: 0 }]]);
  const rosterByTeamId = new Map([
    ['picker', { ...emptyRoster(), lineup: [player('incumbent', 30, { teamId: 'picker' })] }],
    ['owner', { ...emptyRoster(), lineup: [player('owner-guy', 50, { teamId: 'owner' })] }],
  ]);
  const affiliates = new Map([
    ...affiliateChain('picker'),
    ...affiliateChain('owner', { 'owner-AA': { ...emptyRoster(), lineup: [player('prospect', 60)] } }),
  ]);
  const ownerAaBefore = affiliates.get('owner-AA').lineup.length;

  const { selections } = runRule5Draft(teams, standings, rosterByTeamId, affiliates, EXPOSED_SEASON, () => 0.5, AS_OF_DATE);
  assert(selections.length === 1, 'exactly one selection');

  const pickerActive = rosterByTeamId.get('picker').lineup;
  const drafted = pickerActive.find((p) => p.id === 'prospect');
  assert(!!drafted, 'the pick is on the drafting club\'s ACTIVE roster');
  assert(drafted.teamId === 'picker', 'his teamId updated');
  assert(drafted.serviceRecord.rule5?.originalTeamId === 'owner', 'he carries a Rule 5 obligation naming his original club');
  assert(drafted.serviceRecord.wasEverProtected === true, 'and is now marked protected — he is on a 26-man');
  assert(!pickerActive.some((p) => p.id === 'incumbent'), 'the displaced incumbent left the active roster');
  assert(affiliates.get('picker-AAA').lineup.some((p) => p.id === 'incumbent'), 'and was DEMOTED to the drafting club\'s own AAA (not released)');

  // The depletion guard — the specific bug §34/§40 both shipped.
  assert(!affiliates.get('owner-AA').lineup.some((p) => p.id === 'prospect'), 'the pick left his original org\'s AA roster');
  assert(affiliates.get('owner-AA').lineup.length === ownerAaBefore, `and that hole was BACKFILLED — owner-AA still holds ${ownerAaBefore} (the §34/§40 depletion bug, guarded directly)`);
}

console.log('\n=== 4. A club never drafts from its own system, and picks at most once ===\n');
{
  const teams = [{ id: 'solo' }];
  const standings = new Map([['solo', { wins: 0, losses: 100 }]]);
  const rosterByTeamId = new Map([['solo', { ...emptyRoster(), lineup: [player('weak', 25, { teamId: 'solo' })] }]]);
  const affiliates = affiliateChain('solo', { 'solo-AAA': { ...emptyRoster(), lineup: [player('own-stud', 70)] } });

  const { selections } = runRule5Draft(teams, standings, rosterByTeamId, affiliates, EXPOSED_SEASON, () => 0.5, AS_OF_DATE);
  assert(selections.length === 0, 'a club cannot select its own exposed prospect, however good he is');
  assert(affiliates.get('solo-AAA').lineup.some((p) => p.id === 'own-stud'), 'and he stays put');
}

console.log('\n=== 5. The obligation: option refused, DFA returns him, sticking clears it ===\n');
{
  const r5 = { draftedSeasonNumber: 5, originalTeamId: 'home' };
  const pick = player('r5-pick', 50, { teamId: 'holder', rule5: r5 });
  const rosterByTeamId = new Map([['holder', { ...emptyRoster(), lineup: [pick] }]]);
  const affiliates = new Map([
    ['holder-AAA', emptyRoster()],
    ['home-AAA', emptyRoster()],
  ]);

  const optioned = optionPlayerToMinors('r5-pick', 'holder', rosterByTeamId, affiliates);
  assert(optioned === null, 'optionPlayerToMinors REFUSES a Rule 5 pick — "he cannot be optioned to the minors"');

  const dfa = designateForAssignment('r5-pick', 'holder', rosterByTeamId, affiliates, ['holder'], new Map());
  assert(dfa?.outcome === 'RETURNED_TO_ORIGINAL_CLUB', `a DFA on a Rule 5 pick returns him instead of running waivers (got ${dfa?.outcome})`);
  assert(dfa.returnedToTeamId === 'home', 'to the correct original club');
  const returned = dfa.affiliateRosterByClubId.get('home-AAA').lineup.find((p) => p.id === 'r5-pick');
  assert(!!returned, 'and he really lands on their AAA roster');
  assert(returned.serviceRecord.rule5 === null, 'with the obligation cleared');

  // Sticking: still on an active roster a season later.
  const stickRoster = new Map([['holder', { ...emptyRoster(), lineup: [player('sticker', 50, { teamId: 'holder', rule5: { draftedSeasonNumber: 5, originalTeamId: 'home' } })] }]]);
  const { stuck } = resolveRule5Obligations(stickRoster, new Map([['home-AAA', emptyRoster()]]), 6);
  assert(stuck.length === 1 && stuck[0].playerId === 'sticker', 'a pick still on the active roster a season later has STUCK');
  assert(stickRoster.get('holder').lineup[0].serviceRecord.rule5 === null, 'and his obligation is cleared — he is kept for good');

  // Not resolved in the SAME season he was drafted.
  const sameSeason = new Map([['holder', { ...emptyRoster(), lineup: [player('fresh', 50, { teamId: 'holder', rule5: { draftedSeasonNumber: 6, originalTeamId: 'home' } })] }]]);
  const sameSeasonResult = resolveRule5Obligations(sameSeason, new Map([['home-AAA', emptyRoster()]]), 6);
  assert(sameSeasonResult.stuck.length === 0, 'a pick drafted THIS season is not resolved yet — he owes a full season first');
}

console.log('\n=== 6. Real integration: no roster or affiliate section ever drains ===\n');
{
  let s = computeFreshSeason1State();
  assert(s.rule5Result.selections.length === 0, 'season 1 has no Rule 5 draft — nobody has accrued enough minor-league seasons');

  const perSeason = [];
  let minActiveSection = Infinity;
  let minAffiliateSection = Infinity;
  let totalStuck = 0;

  for (let i = 0; i < 6; i++) {
    s = advanceToNextSeason(s);
    perSeason.push(s.rule5Result.selections.length);
    totalStuck += s.rule5Result.stuck.length;
    for (const [, roster] of s.rosterByTeamId) {
      for (const k of SECTIONS) minActiveSection = Math.min(minActiveSection, roster[k].length);
    }
    for (const [, roster] of s.affiliateRosterByClubId) {
      // bench is legitimately empty at every affiliate level by design
      for (const k of SECTIONS.filter((x) => x !== 'bench')) minAffiliateSection = Math.min(minAffiliateSection, roster[k].length);
    }
  }

  console.log(`  picks per season: ${perSeason.join(', ')}  (total stuck: ${totalStuck})`);
  assert(perSeason.some((n) => n > 0), 'real Rule 5 selections genuinely happen against live state');
  assert(minActiveSection > 0, `no ACTIVE roster section ever drained empty (smallest: ${minActiveSection})`);
  assert(minAffiliateSection > 0, `no AFFILIATE section ever drained empty (smallest: ${minAffiliateSection}) — the §34/§40 depletion regression`);
  assert(Math.max(...perSeason) <= 50, 'never more picks than there are clubs — the one-per-club cap holds at real scale');
  assert(totalStuck > 0, 'picks genuinely resolve as stuck the following season');

  let activeTotal = 0;
  for (const [, roster] of s.rosterByTeamId) for (const k of SECTIONS) activeTotal += roster[k].length;
  assert(activeTotal === 1300, `all 50 clubs still carry exactly 26 active players (got ${activeTotal}) — every pick displaced exactly one incumbent`);

  assert(s.schemaVersion === 21, `schemaVersion is the current STATE_SCHEMA_VERSION, 21 (got ${s.schemaVersion})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
