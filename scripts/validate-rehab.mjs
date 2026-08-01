// Re-runnable sanity check for Injury Rehab Assignments — Phase 10 (the
// FINAL phase) of the "50-man Roster System" arc
// (engine/rehabAssignment.js): `npm run validate:rehab`.
//
// This phase is the only one in the arc to touch the CORE GAME LOOP
// (game.js's createSide), so section 7 exists specifically to keep the run
// environment honest — see CLAUDE.md's Calibration notes.

import {
  computeReturnRustGames,
  computeReturnRustPenalty,
  applyReturnRust,
  isRehabEligible,
  computeRehabCapGames,
  advanceRehabAndRust,
  advanceRust,
  applyFullRustOnReturn,
  REHAB_MAX_GAMES_POSITION_PLAYER,
  REHAB_MAX_GAMES_PITCHER,
  MAX_RUST_PENALTY,
} from '../src/engine/rehabAssignment.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { INJURY_SEVERITIES } from '../src/models/constants.js';
import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';
import { simulateOneSeason } from '../src/engine/leagueProgression.js';
import { createRng } from '../src/models/generation/random.js';

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  OK   ${message}`);
  else { console.log(`  FAIL ${message}`); failures++; }
}

const RATING_KEYS = [
  'contact', 'power', 'eye', 'buntingSkill', 'speed', 'baserunningInstincts',
  'fielding', 'armStrength', 'armAccuracy',
  'workEthic', 'durability', 'consistency', 'coachability', 'platoonSkill',
];

function hitter(id, quality = 50) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: '1998-01-01',
    ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, createRating(quality)])),
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22 }),
  });
}

function pitcher(id, quality = 50) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'SP', eligiblePositions: ['SP'], isPitcher: true,
    birthdate: '1998-01-01',
    ratings: {
      ...Object.fromEntries(RATING_KEYS.map((k) => [k, createRating(quality)])),
      velocity: createRating(quality), control: createRating(quality), movement: createRating(quality), stamina: createRating(quality),
    },
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 22 }),
  });
}

const roster = (players) => ({ lineup: players, rotation: [], bullpen: [], bench: [] });
const injury = (severity, gamesRemaining) => ({ severity, gamesRemaining, type: 'strain', sustainedGameNumber: 0 });

console.log('=== 1. Rust only comes from the real IL tiers ===\n');
{
  assert(computeReturnRustGames(INJURY_SEVERITIES.SHORT_TERM_IL) > 0, 'a short-term IL stint produces rust');
  assert(computeReturnRustGames(INJURY_SEVERITIES.LONG_TERM_IL) > computeReturnRustGames(INJURY_SEVERITIES.SHORT_TERM_IL),
    'a long-term IL stint produces MORE rust than a short one');
  assert(computeReturnRustGames(INJURY_SEVERITIES.DAY_TO_DAY) === 0, 'a day-to-day injury produces none — too short to matter');
  assert(computeReturnRustGames(INJURY_SEVERITIES.SEASON_ENDING) === 0, 'a season-ending injury produces none — he never returns to carry it');
  assert(computeReturnRustGames(INJURY_SEVERITIES.CAREER_ENDING) === 0, 'nor a career-ending one');
}

console.log('\n=== 2. The penalty decays to zero as he shakes it off ===\n');
{
  const total = 10;
  const first = computeReturnRustPenalty(10, total);
  const mid = computeReturnRustPenalty(5, total);
  const last = computeReturnRustPenalty(1, total);
  console.log(`  penalty by games remaining — 10: ${first}, 5: ${mid}, 1: ${last}, 0: ${computeReturnRustPenalty(0, total)}`);
  assert(first === MAX_RUST_PENALTY, `peaks at MAX_RUST_PENALTY (${MAX_RUST_PENALTY}) on his first game back`);
  assert(first > mid && mid > last, 'and decays monotonically as he plays through it');
  assert(computeReturnRustPenalty(0, total) === 0, 'reaching exactly 0 once fully shaken off');
  assert(computeReturnRustPenalty(5, 0) === 0, 'a zero total never divides by zero');
}

console.log('\n=== 3. applyReturnRust lowers real ratings, non-mutatingly ===\n');
{
  const p = hitter('rusty', 60);
  const before = p.ratings.contact.current;
  const rusted = applyReturnRust(p, 10, 10);
  assert(rusted.ratings.contact.current < before, `a rusty hitter's contact drops (${before} -> ${rusted.ratings.contact.current})`);
  assert(p.ratings.contact.current === before, 'and the ORIGINAL player object is untouched — this codebase never mutates players in place');
  assert(applyReturnRust(p, 0, 10) === p, 'zero rust returns the very same object, no needless copy');

  const sp = pitcher('rusty-arm', 60);
  const rustedArm = applyReturnRust(sp, 10, 10);
  assert(rustedArm.ratings.control.current < sp.ratings.control.current, 'a rusty pitcher takes it on his PITCHING attributes instead');
  assert(rustedArm.ratings.contact.current === sp.ratings.contact.current, 'and not on hitting attributes he never uses');
}

console.log('\n=== 4. The real 20-vs-30 day split, and eligibility ===\n');
{
  assert(computeRehabCapGames(hitter('h')) === REHAB_MAX_GAMES_POSITION_PLAYER, `a position player caps at ${REHAB_MAX_GAMES_POSITION_PLAYER}`);
  assert(computeRehabCapGames(pitcher('p')) === REHAB_MAX_GAMES_PITCHER, `a pitcher caps at ${REHAB_MAX_GAMES_PITCHER} — real MLB's own longer window`);

  assert(isRehabEligible(hitter('h'), injury(INJURY_SEVERITIES.SHORT_TERM_IL, 8)), 'an IL player close to returning is eligible');
  assert(!isRehabEligible(hitter('h'), injury(INJURY_SEVERITIES.LONG_TERM_IL, 55)), 'someone still 55 games out is NOT — you do not send him for reps in week one');
  assert(isRehabEligible(pitcher('p'), injury(INJURY_SEVERITIES.LONG_TERM_IL, 25)), 'but a PITCHER 25 games out is, on his longer window');
  assert(!isRehabEligible(hitter('h'), injury(INJURY_SEVERITIES.LONG_TERM_IL, 25)), 'while a position player at the same 25 games out is not');
  assert(!isRehabEligible(hitter('h'), injury(INJURY_SEVERITIES.DAY_TO_DAY, 2)), 'a day-to-day injury is never rehabbed');
  assert(!isRehabEligible(hitter('h'), injury(INJURY_SEVERITIES.SEASON_ENDING, Infinity)), 'nor a season-ending one (never returns)');
}

console.log('\n=== 5. THE CORE CLAIM: a rehab stint beats no stint ===\n');
{
  // Same player, same injury. One club sends him out; the other does not.
  function runReturn({ sendOnRehab }) {
    const p = hitter('returner');
    const r = roster([p]);
    const injuries = new Map([['returner', injury(INJURY_SEVERITIES.LONG_TERM_IL, 10)]]);
    const rehab = new Map();
    const rust = new Map();
    // rng below the threshold -> always rehab; above -> always decline.
    const rng = () => (sendOnRehab ? 0.01 : 0.99);

    for (let game = 0; game < 10; game++) {
      const inj = injuries.get('returner');
      const remaining = inj.gamesRemaining - 1;
      if (remaining <= 0) {
        injuries.delete('returner');
        if (!rehab.has('returner')) applyFullRustOnReturn('returner', inj.severity, rust);
      } else injuries.set('returner', { ...inj, gamesRemaining: remaining });
      advanceRehabAndRust(r, injuries, rehab, rust, rng);
    }
    return rust.get('returner')?.gamesRemaining ?? 0;
  }

  const withRehab = runReturn({ sendOnRehab: true });
  const withoutRehab = runReturn({ sendOnRehab: false });
  console.log(`  rust carried on return — with a rehab stint: ${withRehab}, without: ${withoutRehab}`);
  assert(withoutRehab > 0, 'a player who returns cold genuinely carries rust');
  assert(withRehab < withoutRehab, 'and a player who served a rehab stint carries MEASURABLY LESS — the whole point of the mechanic');
}

console.log('\n=== 6. A rehab assignment never burns an option ===\n');
{
  const p = hitter('no-option-burn');
  const before = p.serviceRecord.standardOptionYearsUsed;
  const r = roster([p]);
  const injuries = new Map([['no-option-burn', injury(INJURY_SEVERITIES.SHORT_TERM_IL, 5)]]);
  const rehab = new Map();
  advanceRehabAndRust(r, injuries, rehab, new Map(), () => 0.01);
  assert(rehab.has('no-option-burn'), 'the stint really started');
  assert(r.lineup[0].serviceRecord.standardOptionYearsUsed === before,
    'and standardOptionYearsUsed is UNCHANGED — the doc is explicit that a rehab assignment is a distinct mechanism from an optional assignment');

  // advanceRust ticks down and clears.
  const rust = new Map([['x', { gamesRemaining: 2, gamesTotal: 2 }]]);
  advanceRust(rust);
  assert(rust.get('x').gamesRemaining === 1, 'rust ticks down one game at a time');
  advanceRust(rust);
  assert(!rust.has('x'), 'and clears entirely once shaken off');
}

console.log('\n=== 7. Real season: the mechanic fires, and the run environment stays sane ===\n');
{
  const { seasonResult } = simulateOneSeason(teams, getTeamRoster, getTeamManager, createRng(20260201), 150);
  const acts = seasonResult.rehabActivations ?? [];
  const started = seasonResult.rehabStintsStarted ?? [];
  const runsPerGame = seasonResult.results.reduce((s, r) => s + r.awayRuns + r.homeRuns, 0) / seasonResult.results.length;

  const rehabbed = acts.filter((a) => a.rehabGamesServed > 0);
  const cold = acts.filter((a) => a.rehabGamesServed === 0);
  const avgRustRehabbed = rehabbed.length ? rehabbed.reduce((s, a) => s + a.rustGamesCarried, 0) / rehabbed.length : 0;
  const avgRustCold = cold.length ? cold.reduce((s, a) => s + a.rustGamesCarried, 0) / cold.length : 0;

  console.log(`  ${started.length} stints started, ${acts.length} activations (${rehabbed.length} rehabbed, ${cold.length} returned cold)`);
  console.log(`  avg rust carried — rehabbed: ${avgRustRehabbed.toFixed(1)}, cold: ${avgRustCold.toFixed(1)}`);
  console.log(`  runs/game: ${runsPerGame.toFixed(2)}`);

  assert(started.length > 0, 'real rehab stints genuinely happen across a real 150-game season');
  assert(acts.length > 0, 'and real activations resolve');
  assert(cold.length > 0, 'some players genuinely return COLD — without that contrast the mechanic would be inert');
  assert(rehabbed.length > 0, 'and some genuinely rehab');
  assert(avgRustRehabbed < avgRustCold, `at real scale, rehabbed players carry less rust than cold ones (${avgRustRehabbed.toFixed(1)} vs ${avgRustCold.toFixed(1)})`);

  // This phase touches game.js's createSide, so the run environment is a
  // real regression surface (CLAUDE.md Calibration notes). The measured
  // cost of rust at ship time was ~0.09 runs/game (7.45 -> 7.36); this
  // bound is deliberately loose enough to allow normal variance but tight
  // enough to catch a miscalibrated penalty.
  assert(runsPerGame > 6.5 && runsPerGame < 9.0, `runs/game stays in a sane band (${runsPerGame.toFixed(2)}) — rust should cost a fraction of a run, not gut scoring`);

  assert(!acts.some((a) => a.rustGamesCarried < 0), 'rust is never negative, however long a stint ran');
  const caps = { position: REHAB_MAX_GAMES_POSITION_PLAYER, pitcher: REHAB_MAX_GAMES_PITCHER };
  assert(!acts.some((a) => a.rehabGamesServed > Math.max(caps.position, caps.pitcher)), 'and no stint ever exceeds the longer of the two real caps');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
