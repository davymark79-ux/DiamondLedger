// Domestic (HS) Draft — player-pathway.md. Phase 2 of the "Path to Draft,
// Minors & Free Agency" arc (see baseball-sim/CLAUDE.md). Resolved
// atomically at the season boundary, same timing as promotion/relegation
// and playoffs — no calendar model exists for a real mid-season draft day.
//
// **One unified 50-club draft, not split by tier** — draft rights are an
// organizational matter, not a tier-specific competition mechanic.
// Combining the two tiers into one ranked list reuses player-movement.md's
// own Waivers principle directly: "reverse combined standings... spanning
// both MLB1 and MLB2 together, no tier-based priority adjustment."
//
// **Round 1**: only MLB1's real 8 playoff participants (3 division champs +
// 1 wild card, x2 leagues) are exempt from the lottery — confirmed with the
// user that MLB2's 2 championship-series participants are NOT exempt
// (that "championship" is bragging-rights only, per engine/playoffs.js;
// both already promote to MLB1 regardless of outcome). The 42 non-exempt
// clubs enter a weighted lottery for the top 2 picks only (current real
// NHL format) — each team's rise is capped at DRAFT_LOTTERY_MAX_RISE spots
// from its natural reverse-standings rank; the rest of the pool fills picks
// 3+ in that same rank order. The 8 playoff teams fill the last 8 slots of
// round 1, ordered by how far they advanced (computePostseasonRoundsCleared),
// tiebreak = season win% (the user's specific instruction for this ordering,
// not this codebase's usual team-id tiebreak).
//
// **Round 2 onward**: straight worst-to-first by the SAME combined
// reverse-standings order across all 50 clubs (including the playoff
// teams now) — not a snake draft, real MLB repeats the same order every
// round.
//
// **Anti-tanking bonus** (computePostEliminationWinPct), added per
// explicit user request: a unified draft rewarding the worst full-season
// record gives a club zero incentive not to tank once eliminated from
// contention. Real-world precedent exists for this exact fix (floated for
// the NBA/NHL lotteries) — reward a team's win% in games AFTER its own
// mathematical elimination with extra lottery-only equity, on top of (not
// instead of) the base bad-record-drafts-early principle. This needs a
// real elimination detector, not a crude fixed-window proxy (a proxy
// wouldn't restore any actual incentive to compete) — computed as a pure
// post-processing pass over `results` (already returned by
// simulateSeason/simulateOneSeason, no engine changes needed). Per
// tier+league group (groupTeamsForScheduling's own grouping), a team is
// eliminated once its max possible remaining wins can't reach the group's
// qualifying-spot win threshold (4 for an MLB1 group's 3 champs + 1
// wildcard, 1 for an MLB2 group's single league-leader championship) — a
// deliberate simplification that doesn't separately track division-title
// vs. wildcard sub-races, and doesn't account for head-to-head tiebreakers.
// The threshold (a K-th order statistic over a multiset of win totals that
// only ever increase) is mathematically guaranteed non-decreasing on its
// own, so a team, once eliminated, can never read as un-eliminated later —
// no explicit ratchet is needed to keep that property (see
// computePostEliminationWinPct's own inline proof sketch).
// **The bonus only affects the weighted draw for picks 1-2** — a team's
// base rank (used for the rise cap, picks 3+ order, and round 2+'s order)
// is untouched by it.
//
// **Signing scope, per explicit user confirmation**: only the immediate-
// sign path is built this phase — every drafted player signs (a 100%
// placeholder rate, flagged) straight to a Rookie-ball roster slot,
// matching player-pathway.md's own resolution for HS draftees who sign
// directly. The refuse/defer-to-college/flex-contract branches wait for
// Phase 3, once College/NIL/a 50-man-flex concept actually exist to give
// them real meaning.
//
// **Pick trading**: tradeDraftPick() makes pick ownership a real, mutable
// field, but there's no autonomous AI-to-AI trading decision logic (no
// "why would team X want to trade" model exists anywhere in this
// codebase) and no forward-looking multi-season pick trading (a pick only
// exists for the class resolving THIS season boundary). A commissioner-
// facing trade UI is future polish, once there's an actual interactive
// moment to hang it on.

import { groupTeamsForScheduling } from './season.js';
import { computeWinPct } from './managerFiring.js';
import { sectionKeyForPosition } from './minorLeagues.js';
import { generatePlayers } from '../models/generation/playerGenerator.js';
import { pickWeighted } from '../models/generation/random.js';
import {
  TIERS,
  DRAFT_ROUNDS,
  DRAFT_LOTTERY_PICKS,
  DRAFT_LOTTERY_MAX_RISE,
  DRAFT_ELIMINATION_BONUS_SCALE,
  DEVELOPMENT_LEVELS,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  PITCHING_ATTRIBUTES,
} from '../models/constants.js';

function winPctFor(teamId, standingsById) {
  const { wins, losses } = standingsById.get(teamId) ?? { wins: 0, losses: 0 };
  return computeWinPct(wins, losses);
}

// ===== Ordering =====

/**
 * Ranks ALL teams worst-to-best by win% (no tier adjustment — reuses
 * player-movement.md's Waivers principle). Tiebreak by team id, same
 * deterministic-tiebreak convention as engine/playoffs.js/promotionRelegation.js.
 * @param {object[]} teams
 * @param {Map<string, {wins: number, losses: number}>} standingsById
 * @returns {string[]} team ids, worst record first
 */
export function computeCombinedReverseStandingsOrder(teams, standingsById) {
  return [...teams]
    .sort((a, b) => winPctFor(a.id, standingsById) - winPctFor(b.id, standingsById) || a.id.localeCompare(b.id))
    .map((t) => t.id);
}

/**
 * How far each of MLB1's 8 real playoff participants advanced, for round
 * 1's tail ordering. MLB2's 2 championship participants are deliberately
 * NOT included (see file header) — they stay in the lottery pool.
 * @param {object} playoffResult - engine/playoffs.js's simulatePlayoffs() return value
 * @returns {Map<string, number>} teamId -> rounds cleared (0 = lost the WC Round, 3 = won the Finals)
 */
export function computePostseasonRoundsCleared(playoffResult) {
  const roundsCleared = new Map();
  for (const leagueData of Object.values(playoffResult.leagues)) {
    if (!leagueData) continue;
    for (const series of leagueData.wcRound) {
      const loser = series.winnerTeamId === series.teamAId ? series.teamBId : series.teamAId;
      roundsCleared.set(loser, 0);
    }
    const lcsLoser = leagueData.lcs.winnerTeamId === leagueData.lcs.teamAId ? leagueData.lcs.teamBId : leagueData.lcs.teamAId;
    roundsCleared.set(lcsLoser, 1);
    // Defaults the pennant winner to "reached the championship stage" (2) —
    // overridden to 3 below if the Finals actually happened and he won it.
    // Covers playoffs.js's own rare defensive case where playoffResult.finals
    // could be null (an incomplete field elsewhere).
    roundsCleared.set(leagueData.pennantWinnerTeamId, 2);
  }
  if (playoffResult.finals) {
    const { teamAId, teamBId, winnerTeamId } = playoffResult.finals;
    const finalsLoser = winnerTeamId === teamAId ? teamBId : teamAId;
    roundsCleared.set(finalsLoser, 2);
    roundsCleared.set(winnerTeamId, 3);
  }
  return roundsCleared;
}

const MLB1_QUALIFYING_SPOTS = 4; // 3 division champs + 1 wild card
const MLB2_QUALIFYING_SPOTS = 1; // single league-leader championship

/**
 * Anti-tanking detector (see file header) — a team's win% in its own games
 * strictly after its own mathematical elimination point, per tier+league
 * group. 0 for a team never eliminated (alive through its literal last
 * game) or eliminated with no games left to play afterward.
 * @param {object[]} teams
 * @param {object[]} results - engine/season.js's simulateSeason() results array
 * @returns {Map<string, number>} teamId -> 0-1
 */
export function computePostEliminationWinPct(teams, results) {
  const postElimWinPct = new Map(teams.map((t) => [t.id, 0]));

  for (const group of groupTeamsForScheduling(teams)) {
    const groupTeamIds = group.map((t) => t.id);
    const groupTeamIdSet = new Set(groupTeamIds);
    const qualifyingSpots = group[0].tier === TIERS.MLB1 ? MLB1_QUALIFYING_SPOTS : MLB2_QUALIFYING_SPOTS;

    const groupResults = results
      .filter((g) => groupTeamIdSet.has(g.awayTeamId) && groupTeamIdSet.has(g.homeTeamId))
      .sort((a, b) => a.gameNumber - b.gameNumber);

    const winsSoFar = new Map(groupTeamIds.map((id) => [id, 0]));
    const gamesSoFar = new Map(groupTeamIds.map((id) => [id, 0]));
    const totalGames = new Map(groupTeamIds.map((id) => [id, 0]));
    for (const g of groupResults) {
      totalGames.set(g.awayTeamId, totalGames.get(g.awayTeamId) + 1);
      totalGames.set(g.homeTeamId, totalGames.get(g.homeTeamId) + 1);
    }

    // No explicit ratchet needed to keep this monotonic (a team, once
    // eliminated, can never read as un-eliminated later): the qualifying-
    // spot threshold is the K-th order statistic of a multiset whose
    // entries (win totals) only ever increase, and a K-th order statistic
    // of a multiset can only stay the same or increase as its elements
    // increase — it can never decrease. So `currentThreshold` below is
    // already guaranteed non-decreasing game over game, on its own.
    const eliminatedAtIndex = new Map();

    groupResults.forEach((game, index) => {
      const awayWon = game.awayRuns > game.homeRuns;
      gamesSoFar.set(game.awayTeamId, gamesSoFar.get(game.awayTeamId) + 1);
      gamesSoFar.set(game.homeTeamId, gamesSoFar.get(game.homeTeamId) + 1);
      if (awayWon) winsSoFar.set(game.awayTeamId, winsSoFar.get(game.awayTeamId) + 1);
      else winsSoFar.set(game.homeTeamId, winsSoFar.get(game.homeTeamId) + 1);

      const sortedWins = groupTeamIds.map((id) => winsSoFar.get(id)).sort((a, b) => b - a);
      const currentThreshold = sortedWins[qualifyingSpots - 1] ?? 0;

      for (const teamId of groupTeamIds) {
        if (eliminatedAtIndex.has(teamId)) continue;
        const maxPossibleWins = winsSoFar.get(teamId) + (totalGames.get(teamId) - gamesSoFar.get(teamId));
        if (maxPossibleWins < currentThreshold) eliminatedAtIndex.set(teamId, index);
      }
    });

    for (const teamId of groupTeamIds) {
      const elimIndex = eliminatedAtIndex.get(teamId);
      if (elimIndex === undefined) continue;
      const afterGames = groupResults
        .slice(elimIndex + 1)
        .filter((g) => g.awayTeamId === teamId || g.homeTeamId === teamId);
      if (afterGames.length === 0) continue;
      const wins = afterGames.filter(
        (g) => (g.awayTeamId === teamId && g.awayRuns > g.homeRuns) || (g.homeTeamId === teamId && g.homeRuns > g.awayRuns)
      ).length;
      postElimWinPct.set(teamId, wins / afterGames.length);
    }
  }

  return postElimWinPct;
}

/**
 * Builds this season's full pick order: round 1 (lottery + playoff tail)
 * and the plain combined-standings order every other round reuses.
 * @param {object[]} teams
 * @param {Map<string, {wins: number, losses: number}>} standingsById
 * @param {object} playoffResult
 * @param {object[]} results
 * @param {() => number} rng
 * @returns {{ round1Order: string[], regularOrder: string[] }} 50 team ids each
 */
export function computeDraftOrder(teams, standingsById, playoffResult, results, rng) {
  const roundsClearedByTeamId = computePostseasonRoundsCleared(playoffResult);
  const postElimWinPctByTeamId = computePostEliminationWinPct(teams, results);
  const regularOrder = computeCombinedReverseStandingsOrder(teams, standingsById);

  const lotteryPoolOrder = regularOrder.filter((id) => !roundsClearedByTeamId.has(id));
  const rankByTeamId = new Map(lotteryPoolOrder.map((id, i) => [id, i + 1]));

  function lotteryWeight(teamId) {
    const rank = rankByTeamId.get(teamId);
    return 1 / rank + DRAFT_ELIMINATION_BONUS_SCALE * (postElimWinPctByTeamId.get(teamId) ?? 0);
  }

  const remaining = new Set(lotteryPoolOrder);
  const lotteryWinners = [];
  for (let slot = 1; slot <= DRAFT_LOTTERY_PICKS; slot++) {
    const eligible = [...remaining].filter((id) => rankByTeamId.get(id) <= slot + DRAFT_LOTTERY_MAX_RISE);
    if (eligible.length === 0) break; // shouldn't happen at this pool size, but don't crash the draft over it
    const winner = pickWeighted(rng, eligible.map((id) => ({ value: id, weight: lotteryWeight(id) })));
    lotteryWinners.push(winner);
    remaining.delete(winner);
  }

  const nonLotteryOrder = lotteryPoolOrder.filter((id) => remaining.has(id));
  const playoffTailOrder = [...roundsClearedByTeamId.keys()].sort((a, b) => {
    const roundsDiff = roundsClearedByTeamId.get(a) - roundsClearedByTeamId.get(b);
    return roundsDiff !== 0 ? roundsDiff : winPctFor(a, standingsById) - winPctFor(b, standingsById);
  });

  return { round1Order: [...lotteryWinners, ...nonLotteryOrder, ...playoffTailOrder], regularOrder };
}

// ===== Picks =====

/**
 * Expands the round-1/regular orders into a flat list of every pick this
 * season. NOT a snake draft — every round but the first reuses the exact
 * same `regularOrder`, matching real MLB.
 * @param {string[]} round1Order
 * @param {string[]} regularOrder
 * @param {number} [rounds]
 * @returns {{id: string, round: number, pickNumber: number, originalTeamId: string, currentOwnerTeamId: string}[]}
 */
export function buildDraftPicks(round1Order, regularOrder, rounds = DRAFT_ROUNDS) {
  const picks = [];
  let pickNumber = 1;
  for (let round = 1; round <= rounds; round++) {
    const order = round === 1 ? round1Order : regularOrder;
    for (const teamId of order) {
      picks.push({ id: `pick-${pickNumber}`, round, pickNumber, originalTeamId: teamId, currentOwnerTeamId: teamId });
      pickNumber++;
    }
  }
  return picks;
}

/**
 * Reassigns one pick's current owner — the real, structural support for
 * "trades of picks are allowed" (see file header for what's deliberately
 * NOT built alongside this: no autonomous trading logic, no UI yet).
 * @param {object[]} picks
 * @param {string} pickId
 * @param {string} toTeamId
 * @returns {object[]} a new array, only the matching pick changed
 */
export function tradeDraftPick(picks, pickId, toTeamId) {
  return picks.map((pick) => (pick.id === pickId ? { ...pick, currentOwnerTeamId: toTeamId } : pick));
}

/**
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @param {string} idPrefix - must be unique per draft class (e.g. per season) so ids never collide across years
 * @param {number} [count]
 * @returns {object[]} Player[] — real HS/pre-draft prospects, generatePlayer()'s own shape, unmodified
 */
export function generateDraftClass(rng, asOfDate, idPrefix, count = DRAFT_ROUNDS * 50) {
  return generatePlayers(count, { rng, asOfDate, idPrefix });
}

function scoutedScore(player) {
  const attributes = player.isPitcher
    ? PITCHING_ATTRIBUTES
    : [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];
  return attributes.reduce((sum, name) => sum + player.ratings[name].scoutedPotential, 0) / attributes.length;
}

/**
 * Walks every pick in order; each pick's current owner takes the best
 * remaining prospect by scoutedPotential (what a real commissioner would
 * actually see, not the hidden truePotential) — automatic and
 * deterministic given the class + pick order, no manager/GM entity
 * involved. 100% sign-rate placeholder (see file header) — no "undrafted"
 * output yet.
 * @param {object[]} picks
 * @param {object[]} draftClass
 * @returns {{ selections: {pickId: string, round: number, pickNumber: number, teamId: string, playerId: string}[] }}
 */
export function resolveDraft(picks, draftClass) {
  const available = [...draftClass];
  const selections = [];

  for (const pick of [...picks].sort((a, b) => a.pickNumber - b.pickNumber)) {
    if (available.length === 0) break; // more picks than prospects generated — shouldn't happen, don't crash over it
    let bestIndex = 0;
    let bestScore = scoutedScore(available[0]);
    for (let i = 1; i < available.length; i++) {
      const score = scoutedScore(available[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [player] = available.splice(bestIndex, 1);
    selections.push({ pickId: pick.id, round: pick.round, pickNumber: pick.pickNumber, teamId: pick.currentOwnerTeamId, playerId: player.id });
  }

  return { selections };
}

/**
 * Appends every signed draftee straight into their new team's Rookie
 * affiliate roster — real, additive roster growth (not a Phase 1
 * promoteAndBackfill-style vacancy backfill), matching how a real farm
 * system grows every draft year. Mutates `affiliateRosterByClubId` in
 * place, same ownership contract as everything else this arc touches.
 * @param {object[]} selections - resolveDraft()'s own return shape
 * @param {object[]} draftClass
 * @param {Map<string, object>} affiliateRosterByClubId
 */
export function assignSignedDraftees(selections, draftClass, affiliateRosterByClubId) {
  const draftClassById = new Map(draftClass.map((p) => [p.id, p]));
  for (const selection of selections) {
    const player = draftClassById.get(selection.playerId);
    if (!player) continue;
    const clubId = `${selection.teamId}-ROOKIE`;
    const roster = affiliateRosterByClubId.get(clubId);
    if (!roster) continue; // no affiliate system wired up for this caller

    const sectionKey = sectionKeyForPosition(player.primaryPosition);
    const signedPlayer = { ...player, developmentLevel: DEVELOPMENT_LEVELS.ROOKIE, teamId: selection.teamId };
    affiliateRosterByClubId.set(clubId, { ...roster, [sectionKey]: [...roster[sectionKey], signedPlayer] });
  }
}
