// Re-runnable sanity check for the Minor League System — Phase 1 of the
// "Path to Draft, Minors & Free Agency" arc (models/AffiliateClub.js,
// models/seed/affiliateSeed.js, engine/minorLeagues.js):
// `npm run validate:minors`. Same style as the other validate:* scripts —
// eyeball checks plus hard asserts on structural invariants.

import { createRng } from '../src/models/generation/random.js';
import { buildSeedLeagues } from '../src/models/seed/leagueSeed.js';
import { buildAffiliateClubs, buildAffiliateRosters } from '../src/models/seed/affiliateSeed.js';
import { simulateMinorLeagueSeasons, promoteAndBackfill } from '../src/engine/minorLeagues.js';
import { advanceOffseason } from '../src/engine/leagueProgression.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { MINOR_LEAGUE_LEVELS_ORDER, ROOKIE_REGIONAL_HUBS, DEVELOPMENT_LEVELS } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const AS_OF_DATE = new Date('2026-07-21');

console.log('=== 1. buildAffiliateClubs: shape ===\n');
{
  const { teams } = buildSeedLeagues();
  const rng = createRng(111);
  const clubs = buildAffiliateClubs(teams, rng);

  assert(clubs.length === teams.length * MINOR_LEAGUE_LEVELS_ORDER.length, `200 affiliate clubs generated (${clubs.length})`);

  const byParent = new Map();
  for (const club of clubs) {
    if (!byParent.has(club.parentTeamId)) byParent.set(club.parentTeamId, new Set());
    byParent.get(club.parentTeamId).add(club.level);
  }
  const everyTeamHasAllFour = [...byParent.values()].every((levels) => MINOR_LEAGUE_LEVELS_ORDER.every((l) => levels.has(l)));
  assert(byParent.size === teams.length, 'every one of the 50 teams has at least one affiliate club');
  assert(everyTeamHasAllFour, 'every team has exactly one affiliate at each of the 4 levels');

  const leagueIdMismatch = clubs.some((club) => club.leagueId !== teams.find((t) => t.id === club.parentTeamId).leagueId);
  assert(!leagueIdMismatch, "every affiliate club's leagueId matches its parent's leagueId");

  const rookieClubs = clubs.filter((c) => c.level === 'ROOKIE');
  assert(rookieClubs.every((c) => ROOKIE_REGIONAL_HUBS.includes(c.regionalHub)), 'every Rookie club has a real regional hub assigned');
  assert(clubs.filter((c) => c.level !== 'ROOKIE').every((c) => c.regionalHub === null), 'non-Rookie clubs have no regional hub');

  const idMismatch = clubs.some((club) => club.id !== `${club.parentTeamId}-${club.level}`);
  assert(!idMismatch, 'every club id follows the `${parentTeamId}-${level}` convention');
}

console.log('\n=== 2. buildAffiliateRosters: shape + quality ordering ===\n');
{
  const { teams } = buildSeedLeagues();
  const rng = createRng(222);
  const clubs = buildAffiliateClubs(teams, rng);
  const { affiliateClubs, rostersByClubId } = buildAffiliateRosters(clubs, rng, AS_OF_DATE);

  assert(affiliateClubs.length === clubs.length, 'buildAffiliateRosters returns one updated club per input club');

  const oneClub = rostersByClubId.get(affiliateClubs[0].id);
  assert(oneClub.lineup.length === 9, 'a roster has a 9-player lineup (incl. DH)');
  assert(oneClub.rotation.length === 5, 'a roster has a 5-man rotation');
  assert(oneClub.bullpen.length === 6, 'a roster has a 6-man bullpen');
  assert(oneClub.bench.length === 0, 'a roster has no bench depth (basic-sim scope)');

  function avgCurrentForLevel(level) {
    const levelClubs = affiliateClubs.filter((c) => c.level === level);
    let sum = 0;
    let count = 0;
    for (const club of levelClubs) {
      const roster = rostersByClubId.get(club.id);
      for (const player of [...roster.lineup, ...roster.rotation, ...roster.bullpen]) {
        const attrs = player.isPitcher ? ['velocity', 'control', 'movement', 'stamina', 'pitchability'] : ['contact', 'power', 'eye'];
        for (const a of attrs) {
          sum += player.ratings[a].current;
          count++;
        }
      }
    }
    return sum / count;
  }

  const avgRookie = avgCurrentForLevel('ROOKIE');
  const avgA = avgCurrentForLevel('A');
  const avgAA = avgCurrentForLevel('AA');
  const avgAAA = avgCurrentForLevel('AAA');
  console.log(`  avg current rating — ROOKIE ${avgRookie.toFixed(1)}, A ${avgA.toFixed(1)}, AA ${avgAA.toFixed(1)}, AAA ${avgAAA.toFixed(1)}`);
  assert(avgRookie < avgA, 'ROOKIE quality is below A');
  assert(avgA < avgAA, 'A quality is below AA');
  assert(avgAA < avgAAA, 'AA quality is below AAA');

  const devLevelsCorrect = affiliateClubs.every((club) => {
    const roster = rostersByClubId.get(club.id);
    return [...roster.lineup, ...roster.rotation, ...roster.bullpen].every((p) => p.developmentLevel === DEVELOPMENT_LEVELS[club.level]);
  });
  assert(devLevelsCorrect, "every generated player's developmentLevel matches its club's level");
}

console.log('\n=== 3. simulateMinorLeagueSeasons: real games, no crash ===\n');
{
  const { teams } = buildSeedLeagues();
  const rng = createRng(333);
  const clubs = buildAffiliateClubs(teams, rng);
  const { affiliateClubs, rostersByClubId } = buildAffiliateRosters(clubs, rng, AS_OF_DATE);

  // Shortened season lengths — same precedent as simulateOneSeason's own
  // gamesPerSeason override for fast validation runs.
  const shortLengths = { AAA: 8, AA: 8, A: 8, ROOKIE: 8 };
  const { standingsById } = simulateMinorLeagueSeasons(affiliateClubs, rostersByClubId, rng, shortLengths);

  assert(standingsById.size === affiliateClubs.length, 'every affiliate club has a standings entry');

  let anyNaN = false;
  let totalWins = 0;
  let totalLosses = 0;
  for (const { wins, losses } of standingsById.values()) {
    if (Number.isNaN(wins) || Number.isNaN(losses)) anyNaN = true;
    totalWins += wins;
    totalLosses += losses;
  }
  assert(!anyNaN, 'no NaN win/loss values anywhere');
  assert(totalWins === totalLosses, `total wins equal total losses across all 200 clubs (${totalWins} each) — every game has exactly one winner`);
}

console.log('\n=== 4. promoteAndBackfill: real call-up cascade ===\n');
{
  const rng = createRng(444);
  const team = { id: 'test-team' };

  function makeHitter(id, position, current) {
    return createPlayer({
      id, firstName: 'P', lastName: id, primaryPosition: position, eligiblePositions: [position], isPitcher: false,
      ratings: {
        contact: createRating(current), power: createRating(current), eye: createRating(current), buntingSkill: createRating(50),
        speed: createRating(50), baserunningInstincts: createRating(50),
        fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
        workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
      },
    });
  }

  const affiliateRosterByClubId = new Map([
    ['test-team-AAA', { lineup: [makeHitter('aaa-cf-weak', 'CF', 30), makeHitter('aaa-cf-strong', 'CF', 45)], rotation: [], bullpen: [], bench: [] }],
    ['test-team-AA', { lineup: [makeHitter('aa-cf', 'CF', 25)], rotation: [], bullpen: [], bench: [] }],
    ['test-team-A', { lineup: [], rotation: [], bullpen: [], bench: [] }],
    ['test-team-ROOKIE', { lineup: [], rotation: [], bullpen: [], bench: [] }],
  ]);

  const promoted = promoteAndBackfill(team, 'CF', affiliateRosterByClubId, rng, AS_OF_DATE);
  assert(promoted?.id === 'aaa-cf-strong', 'the best-fit AAA player (higher current rating) is the one called up, not just the first match');
  assert(promoted.developmentLevel === DEVELOPMENT_LEVELS.MLB, "the call-up's developmentLevel is promoted to MLB");

  const aaaAfter = affiliateRosterByClubId.get('test-team-AAA');
  assert(!aaaAfter.lineup.some((p) => p.id === 'aaa-cf-strong'), 'the called-up player is removed from the AAA roster');
  assert(aaaAfter.lineup.some((p) => p.id === 'aaa-cf-weak'), 'the AAA player who was NOT called up stays');
  assert(aaaAfter.lineup.some((p) => p.id === 'aa-cf'), "AAA's opening is backfilled by the AA player");

  const aaAfter = affiliateRosterByClubId.get('test-team-AA');
  assert(!aaAfter.lineup.some((p) => p.id === 'aa-cf'), 'the AA player who backfilled AAA is removed from AA');
  assert(aaAfter.lineup.length === 1, "AA's own opening (A had nobody at CF) is backfilled with a fresh generated player");
  assert(aaAfter.lineup[0].developmentLevel === DEVELOPMENT_LEVELS.AA, "AA's fresh backfill has developmentLevel AA");

  // A and ROOKIE never had a CF fit at all, so the cascade should have
  // stopped propagating past AA — neither should have been touched further.
  const aAfter = affiliateRosterByClubId.get('test-team-A');
  const rookieAfter = affiliateRosterByClubId.get('test-team-ROOKIE');
  assert(aAfter.lineup.length === 0 && rookieAfter.lineup.length === 0, 'levels below the gap (A, Rookie) are untouched');
}

console.log('\n=== 5. promoteAndBackfill: full chain drains all the way to Rookie ===\n');
{
  const rng = createRng(555);
  const team = { id: 'full-chain-team' };
  function hitter(id) {
    return createPlayer({
      id, firstName: 'P', lastName: id, primaryPosition: 'SS', eligiblePositions: ['SS'], isPitcher: false,
      ratings: {
        contact: createRating(40), power: createRating(40), eye: createRating(40), buntingSkill: createRating(50),
        speed: createRating(50), baserunningInstincts: createRating(50),
        fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
        workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
      },
    });
  }
  const affiliateRosterByClubId = new Map([
    ['full-chain-team-AAA', { lineup: [hitter('aaa-ss')], rotation: [], bullpen: [], bench: [] }],
    ['full-chain-team-AA', { lineup: [hitter('aa-ss')], rotation: [], bullpen: [], bench: [] }],
    ['full-chain-team-A', { lineup: [hitter('a-ss')], rotation: [], bullpen: [], bench: [] }],
    ['full-chain-team-ROOKIE', { lineup: [hitter('rk-ss')], rotation: [], bullpen: [], bench: [] }],
  ]);

  const promoted = promoteAndBackfill(team, 'SS', affiliateRosterByClubId, rng, AS_OF_DATE);
  assert(promoted?.id === 'aaa-ss', 'AAA player promoted to MLB when the full chain has real fits at every level');

  const rookieAfter = affiliateRosterByClubId.get('full-chain-team-ROOKIE');
  assert(!rookieAfter.lineup.some((p) => p.id === 'rk-ss'), 'the original Rookie player moved up to backfill A');
  assert(rookieAfter.lineup.length === 1 && rookieAfter.lineup[0].developmentLevel === DEVELOPMENT_LEVELS.ROOKIE, "Rookie's own opening (bottom of the chain) is filled with a fresh signee");
}

console.log('\n=== 6. promoteAndBackfill: falls back to null when AAA has no fit ===\n');
{
  const rng = createRng(666);
  const team = { id: 'no-fit-team' };
  const affiliateRosterByClubId = new Map([
    ['no-fit-team-AAA', { lineup: [], rotation: [], bullpen: [], bench: [] }],
    ['no-fit-team-AA', { lineup: [], rotation: [], bullpen: [], bench: [] }],
    ['no-fit-team-A', { lineup: [], rotation: [], bullpen: [], bench: [] }],
    ['no-fit-team-ROOKIE', { lineup: [], rotation: [], bullpen: [], bench: [] }],
  ]);
  const promoted = promoteAndBackfill(team, '2B', affiliateRosterByClubId, rng, AS_OF_DATE);
  assert(promoted === null, 'returns null when AAA has no eligible fit — caller falls back to thin-air generation');

  const missingMapEntirely = new Map();
  const promotedNoAffiliates = promoteAndBackfill({ id: 'no-affiliates-team' }, '2B', missingMapEntirely, rng, AS_OF_DATE);
  assert(promotedNoAffiliates === null, 'returns null immediately when no affiliate system is wired up at all (e.g. a caller that never passed affiliateRosterByClubId)');
}

console.log('\n=== 7. Wired into advanceOffseason — a real retirement is replaced by a real call-up ===\n');
{
  const { teams } = buildSeedLeagues();
  const team = teams.find((t) => t.id.endsWith('-foundry')) ?? teams[0];

  function oldHitter(id) {
    return createPlayer({
      id, firstName: 'Old', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
      birthdate: '1980-01-01', // guaranteed to retire under a forced rng
      ratings: {
        contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
        speed: createRating(50), baserunningInstincts: createRating(50),
        fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
        workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
      },
    });
  }
  const roster = { lineup: [oldHitter('cf1')], rotation: [], bullpen: [], bench: [] };
  const rosterByTeamId = new Map([[team.id, roster]]);
  const managerByTeamId = new Map([[team.id, null]]);
  const affiliateRosterByClubId = new Map([
    [`${team.id}-AAA`, { lineup: [createPlayer({ id: 'real-callup', firstName: 'Real', lastName: 'Callup', primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false, ratings: { contact: createRating(60), power: createRating(60), eye: createRating(60), buntingSkill: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50), fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50), workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50) } })], rotation: [], bullpen: [], bench: [] }],
    [`${team.id}-AA`, { lineup: [], rotation: [], bullpen: [], bench: [] }],
    [`${team.id}-A`, { lineup: [], rotation: [], bullpen: [], bench: [] }],
    [`${team.id}-ROOKIE`, { lineup: [], rotation: [], bullpen: [], bench: [] }],
  ]);

  // rng() = 0.0001 (never exactly 0 — see baseball-sim/CLAUDE.md's Hall of
  // Fame section on why a true constant-zero rng can hang gaussianRandom
  // internally) forces retirement (age 46 by AS_OF_DATE, well past every
  // age-curve bracket) and always finds "the fit" (findBestFit's reduce
  // just needs a non-empty candidate list, doesn't consume rng at all).
  const forcedRng = () => 0.0001;
  const { rosterByTeamId: nextRosterByTeamId } = advanceOffseason(
    [team], rosterByTeamId, managerByTeamId, new Map(), AS_OF_DATE, forcedRng, affiliateRosterByClubId
  );

  const nextRoster = nextRosterByTeamId.get(team.id);
  assert(nextRoster.lineup[0].id === 'real-callup', 'the retiree is replaced by the real AAA call-up, not a thin-air-generated player');
  assert(!affiliateRosterByClubId.get(`${team.id}-AAA`).lineup.some((p) => p.id === 'real-callup'), 'the called-up player is removed from the AAA affiliate roster');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
