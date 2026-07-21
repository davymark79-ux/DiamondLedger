// Promotion/relegation execution — league-structure.md: each league's
// last-place MLB1 club swaps tiers with that same league's first-place
// MLB2 club, evaluated separately per league (a team's league never
// changes, only its tier). models/League.js's getPromotionRelegationPairing()
// already documents this rule; this file is what actually computes and
// applies it against real standings.
//
// Not modeled: the design doc's stadium-compliance auto-relegation override
// (a club that misses its stadium deadline can be force-relegated,
// potentially overriding which team fills the slot) — no stadium/compliance
// system exists anywhere in this engine, same "don't build for systems that
// don't exist yet" stance as everywhere else in this project.

import { LEAGUE_IDS } from '../models/constants.js';
import { getPromotionRelegationPairing } from '../models/League.js';
import { computeWinPct } from './managerFiring.js';

function winPctFor(team, standingsById) {
  const { wins, losses } = standingsById.get(team.id) ?? { wins: 0, losses: 0 };
  return computeWinPct(wins, losses);
}

// No tiebreaker is specced anywhere in the design docs — ties are broken by
// team id for full determinism (this engine's rng-seeded reproducibility
// shouldn't depend on an unstable tiebreak, e.g. array iteration order).
function worst(teams, standingsById) {
  return [...teams].sort((a, b) => winPctFor(a, standingsById) - winPctFor(b, standingsById) || a.id.localeCompare(b.id))[0];
}

function best(teams, standingsById) {
  return [...teams].sort((a, b) => winPctFor(b, standingsById) - winPctFor(a, standingsById) || a.id.localeCompare(b.id))[0];
}

/**
 * @param {object[]} teams - with each team's CURRENT tier already applied (data/season.js's applyTierOverlay)
 * @param {Map<string, {wins: number, losses: number}>} standingsById - the just-completed season's final standings
 * @returns {{leagueId: string, relegatedTeamId: string, promotedTeamId: string}[]} one entry per league
 */
export function computePromotionRelegationSwaps(teams, standingsById) {
  const swaps = [];
  for (const leagueId of Object.values(LEAGUE_IDS)) {
    const { relegatedFrom, promotedFrom } = getPromotionRelegationPairing(leagueId);
    const relegationPool = teams.filter((t) => t.leagueId === leagueId && t.tier === relegatedFrom);
    const promotionPool = teams.filter((t) => t.leagueId === leagueId && t.tier === promotedFrom);
    if (relegationPool.length === 0 || promotionPool.length === 0) continue;

    const relegated = worst(relegationPool, standingsById);
    const promoted = best(promotionPool, standingsById);
    swaps.push({ leagueId, relegatedTeamId: relegated.id, promotedTeamId: promoted.id });
  }
  return swaps;
}

/**
 * @param {Map<string, string>} tierByTeamId
 * @param {{leagueId: string, relegatedTeamId: string, promotedTeamId: string}[]} swaps
 * @returns {Map<string, string>} a new Map with the swapped teams' tiers flipped
 */
export function applyPromotionRelegationSwaps(tierByTeamId, swaps) {
  const next = new Map(tierByTeamId);
  for (const { leagueId, relegatedTeamId, promotedTeamId } of swaps) {
    const { relegatedFrom, promotedFrom } = getPromotionRelegationPairing(leagueId);
    next.set(relegatedTeamId, promotedFrom); // the relegated club moves DOWN to the promoted-from tier (MLB2)
    next.set(promotedTeamId, relegatedFrom); // the promoted club moves UP to the relegated-from tier (MLB1)
  }
  return next;
}
