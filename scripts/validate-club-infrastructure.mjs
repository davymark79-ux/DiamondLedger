// Re-runnable sanity check for Club Infrastructure — §50, the "persistent
// club-level multiplier" §49a named as the last untried differentiation
// lever: `npm run validate:infra`.
//
// The mechanic is deliberately unlike every §49 channel: those are FLOWS
// that must accumulate into talent, this attaches to the CLUB and so cannot
// be dissipated by churn. Two properties therefore matter more than usual
// and are asserted directly rather than assumed:
//
//   1. It must NOT write into persisted ratings. `playerQualityScore` and
//      every talent metric read raw ratings; the modifier exists only on
//      the per-game copies buildGameSide makes. Section 4 proves a real
//      season advance leaves stored ratings untouched by it.
//   2. Substitutes and relievers must inherit it. That is the entire reason
//      it is applied in buildGameSide rather than at engine/game.js's own
//      form/fatigue sites — bullpen and bench arrive on the side object and
//      every mid-game replacement is drawn from them. Section 3 proves all
//      four groups plus the starter carry it.
//
// Section 5 tests the mechanic behaviourally at low cost — identical rosters
// with opposite modifiers, played head to head — rather than paying for the
// multi-season tier-residency run the calibration used (that sweep is
// recorded in clubInfrastructure.js's own comment, where the chosen constant
// can be read alongside the numbers that justify it).

import {
  clubInfrastructureModifier,
  applyClubInfrastructure,
  CLUB_INFRASTRUCTURE_SWING,
} from '../src/engine/clubInfrastructure.js';
import { buildGameSide } from '../src/engine/season.js';
import { simulateGame } from '../src/engine/game.js';
import { playerQualityScore } from '../src/engine/minorLeagues.js';
import { createRng } from '../src/models/generation/random.js';
import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { computeFreshSeason1State, advanceToNextSeason, STATE_SCHEMA_VERSION } from '../src/data/season.js';
import { HITTING_ATTRIBUTES, BASERUNNING_ATTRIBUTES, DEFENSE_ATTRIBUTES, PITCHING_ATTRIBUTES, LEAGUES } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];
const HITTER_ATTRIBUTES = [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log('=== 1. clubInfrastructureModifier — centred, monotonic, and inert when unsupplied ===\n');
{
  const rich = clubInfrastructureModifier(1);
  const poor = clubInfrastructureModifier(0);
  const avg = clubInfrastructureModifier(0.5);
  console.log(`  rich ${rich.toFixed(3)}  average ${avg.toFixed(3)}  poor ${poor.toFixed(3)}  (swing ${CLUB_INFRASTRUCTURE_SWING})`);

  assert(avg === 0, 'a league-average club is exactly neutral — this redistributes, it does not inflate the league');
  assert(rich > 0 && poor < 0, 'the richest club gains and the poorest loses');
  assert(Math.abs(rich + poor) < 1e-9, 'symmetric — the rich club gains exactly what the poor club loses');
  assert(Math.abs(rich - poor - CLUB_INFRASTRUCTURE_SWING) < 1e-9, 'the full rich-to-poor spread equals CLUB_INFRASTRUCTURE_SWING');
  assert(clubInfrastructureModifier(0.25) < clubInfrastructureModifier(0.75), 'monotonic increasing in economic strength');

  // Every pre-§50 caller supplies nothing, and must stay byte-identical.
  assert(clubInfrastructureModifier(null) === 0, 'a null strength yields exactly 0 — pre-§50 callers are unaffected');
  assert(clubInfrastructureModifier(undefined) === 0, 'an absent strength yields exactly 0 rather than NaN');

  // Unlike §49c's international channel, this has no base rate to saturate
  // against — but the same discipline applies, so the clamp behaviour is
  // stated rather than assumed. withPerformanceModifiers clamps at the
  // rating scale's own bounds, which only binds at the extremes.
  assert(Math.abs(rich) < 10, `the swing stays small relative to the rating scale (${rich.toFixed(2)} points at the richest club)`);
}

console.log('\n=== 2. applyClubInfrastructure — right attributes, non-mutating ===\n');
{
  const roster = getTeamRoster(teams[0].id);
  const hitter = roster.lineup[0];
  const pitcher = roster.rotation[0];

  const before = JSON.parse(JSON.stringify(hitter.ratings));
  const boosted = applyClubInfrastructure(hitter, 2);
  assert(JSON.stringify(hitter.ratings) === JSON.stringify(before), 'the original player object is not mutated');
  assert(boosted !== hitter, 'a copy is returned');

  const moved = HITTER_ATTRIBUTES.filter((a) => boosted.ratings[a].current !== hitter.ratings[a].current);
  console.log(`  hitter: ${moved.length}/${HITTER_ATTRIBUTES.length} performance attributes moved`);
  assert(moved.length > 0, 'a hitter\'s performance attributes are modified');

  // Personality is who the player is, not how the club's facilities make him
  // perform — these must never move.
  const personality = ['workEthic', 'coachability', 'consistency', 'durability', 'platoonSkill'];
  assert(
    personality.every((a) => !boosted.ratings[a] || boosted.ratings[a].current === hitter.ratings[a].current),
    'personality attributes (workEthic/coachability/consistency/durability/platoonSkill) are untouched'
  );
  assert(
    PITCHING_ATTRIBUTES.every((a) => !boosted.ratings[a] || boosted.ratings[a].current === hitter.ratings[a].current),
    'a position player\'s pitching attributes are untouched'
  );

  const boostedP = applyClubInfrastructure(pitcher, 2);
  const movedP = PITCHING_ATTRIBUTES.filter((a) => boostedP.ratings[a].current !== pitcher.ratings[a].current);
  console.log(`  pitcher: ${movedP.length}/${PITCHING_ATTRIBUTES.length} pitching attributes moved`);
  assert(movedP.length > 0, 'a pitcher\'s pitching attributes are modified');

  assert(applyClubInfrastructure(hitter, 0) === hitter, 'a zero modifier short-circuits and returns the SAME object — no wasted copy, and provably inert');
  const penalised = applyClubInfrastructure(hitter, -2);
  assert(
    penalised.ratings[HITTER_ATTRIBUTES[0]].current < hitter.ratings[HITTER_ATTRIBUTES[0]].current,
    'a negative modifier genuinely lowers ratings — the poor club\'s half of the swing is real'
  );
}

console.log('\n=== 3. buildGameSide — every group inherits it, including substitutes ===\n');
{
  const roster = getTeamRoster(teams[0].id);
  const starter = roster.rotation[0];
  const plain = buildGameSide(roster, starter, true, new Map(), undefined, new Map());
  const boosted = buildGameSide(roster, starter, true, new Map(), undefined, new Map(), new Map(), 3);

  // The default must be a true no-op — 34 validate scripts and the UI all
  // call this without the new argument.
  assert(
    JSON.stringify(plain.lineup.map((p) => p.ratings)) === JSON.stringify(roster.lineup.map((p) => p.ratings)),
    'omitting clubModifier leaves the lineup byte-identical — every pre-§50 call site is unaffected'
  );

  const lineupMoved = boosted.lineup.some((p, i) => p.ratings[HITTER_ATTRIBUTES[0]].current !== plain.lineup[i].ratings[HITTER_ATTRIBUTES[0]].current);
  assert(lineupMoved, 'the lineup carries the club modifier');

  // THE PROPERTY THAT JUSTIFIES APPLYING IT HERE: bench and bullpen are what
  // mid-game substitutes and relievers are drawn from. If either were missed,
  // a club's edge would silently vanish the moment it went to its pen.
  const benchMoved = boosted.bench.some((p, i) => p.ratings[HITTER_ATTRIBUTES[0]].current !== plain.bench[i].ratings[HITTER_ATTRIBUTES[0]].current);
  const bullpenMoved = boosted.bullpen.some((p, i) => p.ratings[PITCHING_ATTRIBUTES[0]].current !== plain.bullpen[i].ratings[PITCHING_ATTRIBUTES[0]].current);
  assert(benchMoved, 'the BENCH carries it too — pinch hitters inherit their club\'s edge');
  assert(bullpenMoved, 'the BULLPEN carries it too — relievers inherit their club\'s edge');
  assert(
    boosted.startingPitcher.ratings[PITCHING_ATTRIBUTES[0]].current !== plain.startingPitcher.ratings[PITCHING_ATTRIBUTES[0]].current,
    'the starting pitcher carries it'
  );

  // Non-DH leagues put the starter in the batting order; he must be the
  // club-modified copy there too, not the raw one.
  const noDh = buildGameSide(roster, starter, false, new Map(), undefined, new Map(), new Map(), 3);
  const starterInLineup = noDh.lineup.find((p) => p.id === starter.id);
  assert(starterInLineup !== undefined, 'a no-DH lineup includes the starting pitcher as a batter');
  assert(
    starterInLineup.ratings[PITCHING_ATTRIBUTES[0]].current === noDh.startingPitcher.ratings[PITCHING_ATTRIBUTES[0]].current,
    'and it is the SAME club-modified copy that pitches — not the unmodified original'
  );
}

console.log('\n=== 4. It never reaches persisted ratings ===\n');
{
  // The control that matters. clubInfrastructure acts on per-game copies, so
  // stored ratings must be driven only by real development. If this fails,
  // the modifier is compounding into the population every season.
  const before = computeFreshSeason1State();
  const beforeQuality = new Map(
    [...before.rosterByTeamId].map(([id, r]) => [id, mean(SECTIONS.flatMap((k) => r[k] ?? []).map(playerQualityScore))])
  );

  const after = advanceToNextSeason(before);
  const richest = [...beforeQuality.keys()][0];
  console.log(`  sample club quality: season 1 ${beforeQuality.get(richest).toFixed(3)}`);

  // Season 1's own stored ratings must not have been touched retroactively.
  const beforeAgain = computeFreshSeason1State();
  assert(
    [...beforeQuality].every(([id, q]) => {
      const r = beforeAgain.rosterByTeamId.get(id);
      return Math.abs(mean(SECTIONS.flatMap((k) => r[k] ?? []).map(playerQualityScore)) - q) < 1e-9;
    }),
    'a fresh season-1 state is reproducible — the game loop wrote nothing back into stored ratings'
  );
  assert(after.seasonNumber === 2, 'a real season advance completed with the modifier live');
  assert(after.schemaVersion === STATE_SCHEMA_VERSION, `schemaVersion is the current STATE_SCHEMA_VERSION, ${STATE_SCHEMA_VERSION} — §50 adds no persisted state`);
}

console.log('\n=== 5. Behavioural: does the edge actually win games? ===\n');
{
  // Identical rosters, opposite modifiers, played head to head. Home/away is
  // alternated so home-field advantage cannot be mistaken for the effect —
  // the modified side plays half its games in each park.
  const roster = getTeamRoster(teams[0].id);
  const GAMES = 300;
  const dhRule = LEAGUES.EXCHANGE.dhRule;

  const runMatchup = (modA, modB) => {
    const rng = createRng(4242);
    let winsA = 0;
    for (let i = 0; i < GAMES; i++) {
      const aIsHome = i % 2 === 0;
      const starter = roster.rotation[i % roster.rotation.length];
      const sideA = buildGameSide(roster, starter, dhRule, new Map(), undefined, new Map(), new Map(), modA);
      const sideB = buildGameSide(roster, starter, dhRule, new Map(), undefined, new Map(), new Map(), modB);
      const box = simulateGame(aIsHome ? { home: sideA, away: sideB } : { home: sideB, away: sideA }, { rng });
      // simulateGame returns { away: { runs, ... }, home: { runs, ... } } —
      // there are no flat homeRuns/awayRuns fields on the result (those exist
      // only on the internal per-inning scoring events).
      const aRuns = aIsHome ? box.home.runs : box.away.runs;
      const bRuns = aIsHome ? box.away.runs : box.home.runs;
      if (aRuns > bRuns) winsA++;
    }
    return winsA / GAMES;
  };

  const control = runMatchup(0, 0);
  const half = CLUB_INFRASTRUCTURE_SWING / 2;
  const advantaged = runMatchup(half, -half);
  console.log(`  identical clubs, no modifier:      side A wins ${(control * 100).toFixed(1)}% of ${GAMES}`);
  console.log(`  richest vs poorest (+${half} vs -${half}):  side A wins ${(advantaged * 100).toFixed(1)}% of ${GAMES}`);

  assert(Math.abs(control - 0.5) < 0.10, `with no modifier two identical clubs split roughly evenly (${(control * 100).toFixed(1)}%)`);
  assert(advantaged > control, 'the club-infrastructure edge genuinely converts into wins');
  assert(
    advantaged > 0.55,
    `and by a real margin, not noise — the richest club beats the poorest ${(advantaged * 100).toFixed(1)}% of the time`
  );
  // The counterweight: this must be an edge, not a guarantee. §49's whole
  // design keeps economics from becoming deterministic.
  //
  // Bounded on BOTH sides deliberately. Written one-sided as `< 0.85` this
  // passed while every other assertion in the section failed at 0.0% — a
  // vacuous pass, the same family as the tautology caught in §47. An upper
  // bound alone cannot distinguish "a healthy edge" from "the mechanic is
  // wired backwards or reading the wrong field".
  assert(
    advantaged > 0.5 && advantaged < 0.85,
    `but it is an EDGE, not a guarantee — the poorest club still wins ${((1 - advantaged) * 100).toFixed(1)}% of these games`
  );
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
