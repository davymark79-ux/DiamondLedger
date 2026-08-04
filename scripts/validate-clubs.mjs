// Re-runnable sanity check for CLUB DIFFERENTIATION — §49's economic
// channels and §49a's benchmark correction: `npm run validate:clubs`.
//
// This script is named in engine/contracts.js's MAX_CAPACITY_MULTIPLE
// comment and engine/affiliateDevelopment.js's ORG_DEVELOPMENT_SWING comment
// ("what matters is whether it produces PERSISTENT club differentiation,
// which validate:clubs measures directly rather than this constant
// asserting it") — both written during §49, before the script existed. This
// is that script.
//
// WHAT IT GUARDS, and why each one is here rather than being obvious:
//
//  * The four §49 channels are all CENTRED on the league-average club, so
//    they redistribute talent rather than inflating the league. Getting a
//    sign or a centring wrong here would look fine in aggregate league
//    quality while quietly reversing who benefits.
//  * The EQUALIZERS stay strictly worst-first. §49 deliberately kept draft
//    order, waiver priority and Rule 5 order money-blind — only the
//    CONVERSION of a pick is economic. That asymmetry is the counterweight
//    that stops economics becoming a doom loop, and nothing else asserts it.
//  * §49a's decomposition: season 1's club-quality SD of 8.31 is almost
//    entirely the hard-coded MLB1/MLB2 seed-band gap, NOT real club
//    differentiation (genuine within-tier spread is ~1.4-1.6). This was
//    mistaken for a differentiation target once already and cost real time.
//    If someone retunes ROSTER_QUALITY_BY_TIER, section 5 fires and points
//    back at §49a rather than letting the wrong benchmark be rediscovered.
//  * The measured outcome at real scale: ordering (corr with economic
//    strength), spread, persistence, and no section draining.
//
// Style matches the other validate:* scripts — eyeball logs plus hard
// asserts on structural invariants. Note that the multi-season section is
// genuinely slow (8 real simulated seasons, several minutes).

import {
  computeClubPayrollCapacity,
  MARKET_SIZE_CAPACITY_WEIGHT,
  OWNER_WEALTH_CAPACITY_WEIGHT,
  MAX_CAPACITY_MULTIPLE,
  SALARY_FLOOR,
} from '../src/engine/contracts.js';
import { locationModifierForOrg, ORG_DEVELOPMENT_SWING } from '../src/engine/affiliateDevelopment.js';
import { RESIGN_CAPACITY_SWING, FREE_AGENCY_RESIGN_PROBABILITY } from '../src/engine/freeAgency.js';
import { rollDraftOutcome } from '../src/engine/college.js';
import { rollInternationalDraftOutcome } from '../src/engine/internationalAcademy.js';
import {
  DRAFT_SIGNING_CAPACITY_SWING,
  INTERNATIONAL_SIGNING_CAPACITY_SWING,
  INTERNATIONAL_SIGNING_FAILURE_PROBABILITY,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
} from '../src/models/constants.js';
import { computeCombinedReverseStandingsOrder } from '../src/engine/draft.js';
import { playerQualityScore } from '../src/engine/minorLeagues.js';
import { teams } from '../src/data/realLeague.js';
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

const SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];
const MINOR_LEVELS = ['AAA', 'AA', 'A', 'ROOKIE'];
// The exact set draft.js's scoutedScore averages for a position player.
const SCOUTED_ATTRIBUTES = [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const corr = (xs, ys) => {
  const mx = mean(xs);
  const my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const d = sd(xs) * sd(ys);
  return d === 0 ? 0 : cov / d;
};

function rosterQuality(roster) {
  if (!roster) return null;
  const players = SECTIONS.flatMap((s) => roster[s] ?? []);
  return players.length === 0 ? null : mean(players.map(playerQualityScore));
}

function farmQuality(teamId, affiliateRosterByClubId) {
  const perLevel = MINOR_LEVELS
    .map((lv) => rosterQuality(affiliateRosterByClubId.get(`${teamId}-${lv}`)))
    .filter((q) => q !== null);
  return perLevel.length === 0 ? null : mean(perLevel);
}

// The same 0-1 normalisation data/season.js's buildOrgStrengthByTeamId does.
// Deliberately recomputed here rather than imported: that map is module-private
// by design (see its comment), and a second derivation that must agree with the
// first is exactly what section 2 checks.
function orgStrengthMap(teamList) {
  const capacities = teamList.map((t) => computeClubPayrollCapacity(t));
  const min = Math.min(...capacities);
  const span = Math.max(...capacities) - min;
  return new Map(teamList.map((t, i) => [t.id, span === 0 ? 0.5 : (capacities[i] - min) / span]));
}

const club = (marketSize, ownerWealth) => ({ id: 'x', marketSize, ownership: { ownerWealth } });

console.log('=== 1. computeClubPayrollCapacity — the one mechanical use of marketSize/ownerWealth ===\n');
{
  const poorest = computeClubPayrollCapacity(club(0, 0));
  const richest = computeClubPayrollCapacity(club(1, 1));
  const average = computeClubPayrollCapacity(club(0.5, 0.5));
  console.log(`  poorest $${(poorest / 1e6).toFixed(1)}M   average $${(average / 1e6).toFixed(1)}M   richest $${(richest / 1e6).toFixed(1)}M`);

  assert(poorest === SALARY_FLOOR, `the weakest possible club sits exactly at SALARY_FLOOR ($${(SALARY_FLOOR / 1e6).toFixed(0)}M, got $${(poorest / 1e6).toFixed(1)}M)`);
  assert(
    richest === Math.round(SALARY_FLOOR * MAX_CAPACITY_MULTIPLE),
    `the strongest possible club sits at SALARY_FLOOR * MAX_CAPACITY_MULTIPLE (got $${(richest / 1e6).toFixed(1)}M)`
  );
  assert(average > poorest && average < richest, 'a league-average club lands strictly between the two extremes');

  // Market is the larger term by design (durable revenue vs. willingness to
  // run a deficit) — if these two weights are ever swapped, this fires.
  const bigMarketPoorOwner = computeClubPayrollCapacity(club(1, 0));
  const smallMarketRichOwner = computeClubPayrollCapacity(club(0, 1));
  console.log(`  big market/poor owner $${(bigMarketPoorOwner / 1e6).toFixed(1)}M   small market/rich owner $${(smallMarketRichOwner / 1e6).toFixed(1)}M`);
  assert(
    bigMarketPoorOwner > smallMarketRichOwner,
    `market size outweighs owner wealth (${MARKET_SIZE_CAPACITY_WEIGHT} vs ${OWNER_WEALTH_CAPACITY_WEIGHT})`
  );

  assert(
    computeClubPayrollCapacity(club(0.2, 0.5)) < computeClubPayrollCapacity(club(0.8, 0.5)),
    'capacity is monotonic increasing in market size'
  );
  assert(
    computeClubPayrollCapacity(club(0.5, 0.2)) < computeClubPayrollCapacity(club(0.5, 0.8)),
    'capacity is monotonic increasing in owner wealth'
  );

  // Both fields are hand-authored per club in realLeague.js, so out-of-range
  // or missing values are a live possibility rather than a theoretical one.
  assert(computeClubPayrollCapacity(club(5, 5)) === richest, 'out-of-range inputs clamp to the top rather than exploding the range');
  assert(computeClubPayrollCapacity(club(-3, -3)) === poorest, 'negative inputs clamp to the floor');
  assert(computeClubPayrollCapacity({}) === average, 'a club missing both fields is treated as league-average, not as zero');
  assert(computeClubPayrollCapacity(undefined) === average, 'an absent club is treated as league-average rather than throwing');
}

console.log('\n=== 2. Org strength across the REAL 50 clubs ===\n');
{
  const strength = orgStrengthMap(teams);
  const values = [...strength.values()];
  console.log(`  n=${values.length}  min ${Math.min(...values).toFixed(3)}  mean ${mean(values).toFixed(3)}  max ${Math.max(...values).toFixed(3)}  SD ${sd(values).toFixed(3)}`);

  assert(values.length === 50, `every club gets a strength (got ${values.length})`);
  assert(Math.min(...values) === 0 && Math.max(...values) === 1, 'the normalisation spans exactly 0-1 — the poorest club is 0, the richest is 1');
  assert(values.every((v) => v >= 0 && v <= 1), 'every value is inside 0-1');
  assert(sd(values) > 0.1, `the real league has genuine economic spread to differentiate on (SD ${sd(values).toFixed(3)})`);
  assert(new Set(values).size > 25, `strengths are genuinely distinct rather than clustered on a few values (${new Set(values).size} distinct)`);

  // marketSize/ownerWealth are static identity fields (only tier and division
  // ever change), which is precisely why season.js derives this ONCE at module
  // load. If either ever became per-season state, that caching turns into a
  // silent staleness bug — this is the check that would catch it.
  const again = orgStrengthMap(teams);
  assert(
    [...strength.entries()].every(([id, v]) => again.get(id) === v),
    'the derivation is a pure function of static team identity — safe to compute once at module load'
  );
}

console.log('\n=== 3. All four §49 channels are wired, centred, and pointing the right way ===\n');
{
  // Every channel must be NEUTRAL for a league-average club: these
  // redistribute talent between clubs, they do not inflate or deflate the
  // league. A sign error or an uncentred term would show up here and
  // essentially nowhere else.
  const richer = 1;
  const poorer = 0;
  const avg = 0.5;

  const devRich = locationModifierForOrg(richer)('contact', 'hitting');
  const devPoor = locationModifierForOrg(poorer)('contact', 'hitting');
  const devAvg = locationModifierForOrg(avg)('contact', 'hitting');
  console.log(`  affiliate development  rich ${devRich.toFixed(3)}  average ${devAvg.toFixed(3)}  poor ${devPoor.toFixed(3)}  (swing ${ORG_DEVELOPMENT_SWING})`);
  assert(devRich > devPoor, 'affiliate development: a richer org develops its prospects faster');
  assert(devAvg === 0, 'affiliate development is centred — a league-average org is exactly neutral');
  assert(Math.abs(devRich - devPoor - ORG_DEVELOPMENT_SWING) < 1e-9, 'the full rich-to-poor development swing equals ORG_DEVELOPMENT_SWING');

  // Both amateur channels roll refusal/failure first and then compare a
  // second roll against a probability economics shifts. Rather than restate
  // the arithmetic (which would assert nothing), probe for the rng value at
  // which the OUTCOME flips, and measure how far economics moves it — a real
  // behavioural measurement of the swing that would catch a sign error, an
  // uncentred term, or the parameter being dropped on the floor entirely.
  const sequenced = (...values) => {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  };
  const flipPoint = (roll, signedOutcome) => {
    // Bisect on the second roll; the first is pinned past the refusal gate.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (roll(mid) === signedOutcome) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };

  const prospect = { isPitcher: false, ratings: Object.fromEntries(SCOUTED_ATTRIBUTES.map((a) => [a, { scoutedPotential: 50 }])) };
  const school = { prestigeTier: 3 };
  const draftFlip = (orgStrength) =>
    flipPoint((v) => rollDraftOutcome(prospect, school, 1, sequenced(0.99, v), orgStrength).outcome, 'signed');
  const drRich = draftFlip(richer);
  const drPoor = draftFlip(poorer);
  const drNull = draftFlip(null);
  console.log(`  draft signing conversion  flip point: rich ${drRich.toFixed(3)}  unsupplied ${drNull.toFixed(3)}  poor ${drPoor.toFixed(3)}  (swing ${DRAFT_SIGNING_CAPACITY_SWING})`);
  assert(drRich < drPoor, 'draft: a richer club converts a pick over a wider range of rolls than a poorer one');
  assert(
    Math.abs(drPoor - drRich - DRAFT_SIGNING_CAPACITY_SWING) < 1e-3,
    `the measured rich-to-poor draft swing equals DRAFT_SIGNING_CAPACITY_SWING (measured ${(drPoor - drRich).toFixed(3)})`
  );
  assert(
    Math.abs((drRich + drPoor) / 2 - drNull) < 1e-3,
    'draft conversion is centred — omitting orgStrength matches the league-average club exactly, so every pre-§49 call site is unaffected'
  );
  assert(
    rollDraftOutcome(prospect, school, 1, sequenced(0.001, 0.5), richer).outcome === 'refused',
    'the refusal roll itself is money-blind — a prospect can always say no regardless of who picked him'
  );

  const intlFlip = (orgStrength) => flipPoint((v) => rollInternationalDraftOutcome(sequenced(v), orgStrength).outcome, 'signed');
  const inRich = intlFlip(richer);
  const inPoor = intlFlip(poorer);
  const inNull = intlFlip(null);
  console.log(`  international signing     flip point: rich ${inRich.toFixed(3)}  unsupplied ${inNull.toFixed(3)}  poor ${inPoor.toFixed(3)}  (swing ${INTERNATIONAL_SIGNING_CAPACITY_SWING})`);
  assert(inRich < inPoor, 'international: a richer club closes the signing window more often');

  // MEASURED DEFECT, asserted as it actually behaves rather than as intended
  // — found by this probe, and left for a deliberate decision rather than
  // retuned here (changing either constant would invalidate §49's measured
  // outcomes). rollInternationalDraftOutcome computes
  //     failure = INTERNATIONAL_SIGNING_FAILURE_PROBABILITY - (s - 0.5) * SWING
  // with a base failure of only 0.05 against a swing of 0.18. A club above
  // strength 0.5 + 0.05/0.18 = 0.778 drives that NEGATIVE, and a probability
  // below zero simply never fires — so the top ~22% of the strength range is
  // saturated and indistinguishable. Two consequences:
  //   1. the channel is NOT centred: a rich club can gain at most 0.05 while
  //      a poor club loses the full 0.09, so it acts more as a penalty on
  //      poor clubs than a bonus to rich ones;
  //   2. its EFFECTIVE swing is 0.14, not 0.18 — identical to the draft
  //      channel, so §49's "international is the largest amateur channel"
  //      holds in the constant but not in behaviour.
  const effectiveIntlSwing = inPoor - inRich;
  const saturationStrength = 0.5 + INTERNATIONAL_SIGNING_FAILURE_PROBABILITY / INTERNATIONAL_SIGNING_CAPACITY_SWING;
  console.log(
    `    NOTE: effective swing ${effectiveIntlSwing.toFixed(3)} vs nominal ${INTERNATIONAL_SIGNING_CAPACITY_SWING} — ` +
      `clamped at zero for every club above strength ${saturationStrength.toFixed(3)}`
  );
  assert(
    Math.abs(inRich) < 1e-3,
    'the richest club saturates at a zero failure rate — documented asymmetry, see the comment above and CLAUDE.md §49b'
  );
  assert(
    Math.abs(effectiveIntlSwing - INTERNATIONAL_SIGNING_FAILURE_PROBABILITY - INTERNATIONAL_SIGNING_CAPACITY_SWING / 2) < 1e-3,
    `the effective swing is base + half-swing = ${(INTERNATIONAL_SIGNING_FAILURE_PROBABILITY + INTERNATIONAL_SIGNING_CAPACITY_SWING / 2).toFixed(3)}, not the nominal ${INTERNATIONAL_SIGNING_CAPACITY_SWING} (measured ${effectiveIntlSwing.toFixed(3)})`
  );
  assert(
    inNull - inRich < inPoor - inNull,
    'and it is asymmetric — a rich club gains less than a poor club loses, because only the rich side clamps'
  );
  assert(
    INTERNATIONAL_SIGNING_CAPACITY_SWING > DRAFT_SIGNING_CAPACITY_SWING,
    'international signing is the larger of the two amateur channels BY CONSTANT — though see the note above on its effective magnitude'
  );

  const capacityByTeamId = new Map([['rich', 100e6], ['mid', 60e6], ['poor', 37e6]]);
  const resign = (id) => {
    const caps = [...capacityByTeamId.values()];
    const lo = Math.min(...caps);
    const span = Math.max(...caps) - lo;
    const s = span === 0 ? 0.5 : (capacityByTeamId.get(id) - lo) / span;
    return FREE_AGENCY_RESIGN_PROBABILITY + (s - 0.5) * RESIGN_CAPACITY_SWING;
  };
  console.log(`  free-agent retention  rich ${resign('rich').toFixed(3)}  poor ${resign('poor').toFixed(3)}  (base ${FREE_AGENCY_RESIGN_PROBABILITY}, swing ${RESIGN_CAPACITY_SWING})`);
  assert(resign('rich') > FREE_AGENCY_RESIGN_PROBABILITY, 'free agency: a rich club keeps its own free agents more often than the base rate');
  assert(resign('poor') < FREE_AGENCY_RESIGN_PROBABILITY, 'free agency: a poor club keeps them less often');
  assert(
    Math.abs((resign('rich') + resign('poor')) / 2 - FREE_AGENCY_RESIGN_PROBABILITY) < 1e-9,
    'retention is centred on FREE_AGENCY_RESIGN_PROBABILITY — the swing redistributes, it does not raise league-wide retention'
  );

  // §49 measured this directly: free agency alone moved club SD 1.03 -> 0.95,
  // i.e. nothing, because its REACH is tiny (24 signings a season against 80
  // merit promotions and 401 internal moves). Development is the dominant
  // channel and must stay the largest swing, or the whole design reverts to
  // the arrangement that was already measured not to work.
  assert(
    ORG_DEVELOPMENT_SWING > RESIGN_CAPACITY_SWING,
    'affiliate development remains the largest channel — §49 measured free agency alone as having no effect, because reach beats strength'
  );
}

console.log('\n=== 4. The equalizers stay money-blind — the anti-doom-loop counterweight ===\n');
{
  // §49's deliberate asymmetry: economics changes whether a club CONVERTS a
  // pick, never whether it gets to pick first. A poor club must keep first
  // call on amateur talent. computeCombinedReverseStandingsOrder is the
  // shared order behind the draft, waiver claims and the Rule 5 draft, so
  // this one function carries all three.
  const richestId = [...orgStrengthMap(teams).entries()].sort((a, b) => b[1] - a[1])[0][0];
  const poorestId = [...orgStrengthMap(teams).entries()].sort((a, b) => a[1] - b[1])[0][0];

  // Give the RICHEST club the worst record and the poorest club the best.
  const standingsById = new Map(
    teams.map((t) => [t.id, { wins: t.id === richestId ? 40 : t.id === poorestId ? 120 : 81, losses: t.id === richestId ? 122 : t.id === poorestId ? 42 : 81 }])
  );
  const order = computeCombinedReverseStandingsOrder(teams, standingsById);
  console.log(`  richest club (${richestId}) with the worst record picks at #${order.indexOf(richestId) + 1} of ${order.length}`);
  console.log(`  poorest club (${poorestId}) with the best record picks at #${order.indexOf(poorestId) + 1} of ${order.length}`);

  assert(order[0] === richestId, 'the richest club still picks FIRST when it has the worst record — order is earned by record, never bought');
  assert(order[order.length - 1] === poorestId, 'the poorest club still picks LAST when it has the best record');
  assert(order.length === teams.length && new Set(order).size === teams.length, 'every club appears exactly once in the order');

  const strength = orgStrengthMap(teams);
  const flatStandings = new Map(teams.map((t) => [t.id, { wins: 81, losses: 81 }]));
  const tiedOrder = computeCombinedReverseStandingsOrder(teams, flatStandings);
  const tiedCorr = corr(tiedOrder.map((id) => strength.get(id)), tiedOrder.map((_, i) => i));
  console.log(`  with every club tied at .500, corr(economic strength, pick position) = ${tiedCorr.toFixed(3)}`);
  assert(
    Math.abs(tiedCorr) < 0.3,
    `tie-breaking does not smuggle economics in through the back door (corr ${tiedCorr.toFixed(3)})`
  );
}

console.log('\n=== 5. §49a — season 1 SD is the seed-band gap, NOT club differentiation ===\n');
{
  // This is the benchmark correction §49a records. §49 read season 1's 8.31
  // league-wide SD as the differentiation the league "should" have and its
  // decay to ~1.2 as a failure. Decomposing by tier shows 8.31 is almost
  // entirely the hard-coded gap between two seed bands, and that genuine
  // club-to-club spread was only ever ~1.4-1.6 — indistinguishable from the
  // equilibrium that was being treated as broken.
  const state = computeFreshSeason1State();
  const byTier = new Map();
  for (const [teamId, roster] of state.rosterByTeamId) {
    const tier = state.tierByTeamId.get(teamId);
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(rosterQuality(roster));
  }

  const all = [...byTier.values()].flat();
  console.log(`  league-wide  n=${all.length}  mean ${mean(all).toFixed(2)}  SD ${sd(all).toFixed(3)}`);
  for (const [tier, qs] of byTier) {
    console.log(`    ${String(tier).padEnd(6)} n=${String(qs.length).padStart(2)}  mean ${mean(qs).toFixed(2)}  SD ${sd(qs).toFixed(3)}  range ${Math.min(...qs).toFixed(1)}-${Math.max(...qs).toFixed(1)}`);
  }

  const tierMeans = [...byTier.values()].map(mean);
  const tierGap = Math.max(...tierMeans) - Math.min(...tierMeans);
  const withinTierSds = [...byTier.values()].map(sd);
  console.log(`  tier gap ${tierGap.toFixed(2)}   within-tier SD ${withinTierSds.map((s) => s.toFixed(3)).join(' / ')}`);

  assert(byTier.size === 2, `season 1 seeds exactly two tiers (got ${byTier.size})`);
  assert(sd(all) > 6, `league-wide season-1 SD is large (${sd(all).toFixed(3)}) — this is the number §49 mistook for a differentiation target`);
  assert(tierGap > 10, `and it is dominated by the MLB1/MLB2 seed-band gap (${tierGap.toFixed(2)} points)`);
  assert(
    withinTierSds.every((s) => s < 3),
    `genuine within-tier club spread is small from the very first season (${withinTierSds.map((s) => s.toFixed(2)).join(', ')}) — see CLAUDE.md §49a before treating equilibrium SD as a regression`
  );
  assert(
    Math.max(...withinTierSds) < tierGap / 3,
    'the seed-band gap dwarfs real club-to-club spread — the two must not be conflated'
  );
}

console.log('\n=== 6. Real integration: ordering, spread and persistence over 8 seasons ===\n');
{
  const SEASONS = 8;
  const strength = orgStrengthMap(teams);
  const teamIds = teams.map((t) => t.id);
  const history = [];

  let state = computeFreshSeason1State();
  let minActiveSection = Infinity;
  let minAffiliateSection = Infinity;

  console.log('  season  mlbMean   mlbSD   farmMean  corrMLB  corrFarm  promoted');
  for (let s = 1; s <= SEASONS; s++) {
    const ids = teamIds.filter((id) => state.rosterByTeamId.get(id));
    const mlb = ids.map((id) => rosterQuality(state.rosterByTeamId.get(id)));
    const farm = ids.map((id) => farmQuality(id, state.affiliateRosterByClubId) ?? 0);
    const str = ids.map((id) => strength.get(id) ?? 0.5);
    history.push({ ids, mlbById: new Map(ids.map((id, i) => [id, mlb[i]])), mlbSd: sd(mlb), corrMlb: corr(str, mlb), corrFarm: corr(str, farm), str, farm });

    const p = state.meritPromotionResult ?? { promotedToMlb: 0, promotedWithinMinors: 0 };
    console.log(
      `  ${String(state.seasonNumber).padStart(6)}  ${mean(mlb).toFixed(2).padStart(7)} ${sd(mlb).toFixed(3).padStart(7)} ` +
        `${mean(farm).toFixed(2).padStart(9)} ${corr(str, mlb).toFixed(3).padStart(8)} ${corr(str, farm).toFixed(3).padStart(9)}  ${p.promotedToMlb}/${p.promotedWithinMinors}`
    );

    for (const [, roster] of state.rosterByTeamId) {
      for (const k of SECTIONS) minActiveSection = Math.min(minActiveSection, roster[k].length);
    }
    for (const [, roster] of state.affiliateRosterByClubId) {
      // bench is legitimately empty at every affiliate level by design
      for (const k of SECTIONS.filter((x) => x !== 'bench')) minAffiliateSection = Math.min(minAffiliateSection, roster[k].length);
    }

    if (s < SEASONS) state = advanceToNextSeason(state);
  }

  const last = history[history.length - 1];

  // ORDERING is what §49 actually achieved and what must not regress. The
  // farm correlation is the cleaner signal of the two — §49's own
  // discriminator showed the economic edge forms in the farm system (0.806)
  // and transmits to the majors nearly fully (0.771), which is how we know
  // the channels work and only magnitude is modest.
  assert(last.corrFarm > 0.4, `economic strength genuinely orders farm quality by season ${SEASONS} (corr ${last.corrFarm.toFixed(3)})`);
  assert(last.corrMlb > 0.2, `and that edge transmits to the major-league roster (corr ${last.corrMlb.toFixed(3)})`);
  assert(
    history[0].corrFarm < last.corrFarm,
    `the ordering is BUILT by the channels rather than seeded (season 1 ${history[0].corrFarm.toFixed(3)} -> season ${SEASONS} ${last.corrFarm.toFixed(3)})`
  );

  // The rich-third vs poor-third farm gap: §49 measured ~0.55 rating points
  // at equilibrium. Asserted directionally, since the magnitude is the open
  // design question (see §49a) and not something to freeze in a test.
  const ranked = last.ids.map((id, i) => ({ id, str: last.str[i], farm: last.farm[i] })).sort((a, b) => a.str - b.str);
  const third = Math.floor(ranked.length / 3);
  const poorThird = mean(ranked.slice(0, third).map((r) => r.farm));
  const richThird = mean(ranked.slice(-third).map((r) => r.farm));
  console.log(`\n  farm quality: poorest third ${poorThird.toFixed(2)}  richest third ${richThird.toFixed(2)}  gap ${(richThird - poorThird).toFixed(2)}`);
  assert(richThird > poorThird, `the richest third out-develops the poorest third (gap ${(richThird - poorThird).toFixed(2)} rating points)`);

  // SPREAD does collapse from the seeded 8.31, and per §49a that is correct
  // behaviour — the tier gap dissolving is what "MLB1/MLB2 are always in
  // flux" requires. What must NOT happen is spread going to zero, which
  // would mean promotion/relegation tracks nothing real.
  const fromIdx = Math.max(0, history.length - 6); // five seasons back from the last
  const from = history[fromIdx];
  const shared = from.ids.filter((id) => last.mlbById.has(id));
  const persistence = corr(shared.map((id) => from.mlbById.get(id)), shared.map((id) => last.mlbById.get(id)));
  console.log(`  club quality SD: season 1 ${history[0].mlbSd.toFixed(3)} -> season ${SEASONS} ${last.mlbSd.toFixed(3)}   persistence r(s${fromIdx + 1},s${SEASONS}) ${persistence.toFixed(3)}`);
  assert(last.mlbSd < history[0].mlbSd, 'the artificial seed-band gap does dissolve, as the in-flux tier design requires');
  assert(last.mlbSd > 0.5, `but real club-to-club spread survives rather than going to zero (SD ${last.mlbSd.toFixed(3)}) — see §49a on why ~1.3 is not itself a regression`);
  assert(persistence > 0.2, `good clubs stay good — quality persists across five seasons (r ${persistence.toFixed(3)})`);

  assert(minActiveSection > 0, `no ACTIVE roster section ever drained empty (smallest: ${minActiveSection})`);
  assert(minAffiliateSection > 0, `no AFFILIATE section ever drained empty (smallest: ${minAffiliateSection}) — the §34/§40 depletion regression`);

  let activeTotal = 0;
  for (const [, roster] of state.rosterByTeamId) for (const k of SECTIONS) activeTotal += roster[k].length;
  assert(activeTotal === 1300, `all 50 clubs still carry exactly 26 active players (got ${activeTotal})`);

  assert(state.schemaVersion === STATE_SCHEMA_VERSION, `schemaVersion is the current STATE_SCHEMA_VERSION, ${STATE_SCHEMA_VERSION} (got ${state.schemaVersion})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
