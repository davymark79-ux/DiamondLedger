// Milestone-Naming Mechanic — awards-and-hall-of-fame.md's own section.
// Every award starts generic ("Foundry League Most Valuable Player") and is
// PERMANENTLY renamed to "The [Player] Award" the moment someone becomes
// the first to win that specific award three times. Once locked in it never
// changes again, "matching the real-world tradition of awards like the Cy
// Young keeping their name regardless of who surpasses the original
// honoree's total."
//
// **Scoped per SLOT, not per award type** — the doc is explicit: MVP-Foundry
// and MVP-Exchange are named by separate players, and each of the 18
// Silver Slugger position-league slots accumulates its own name
// independently.
//
// **The statistical-dominance path is SEQUENCED, not simultaneous** — this
// is the subtle part of the spec and the easy thing to get wrong. Only the
// 3-win path is live from an award's first giving. Once the award has been
// given out 10 times (enough data points to judge "historically dominant"
// against), the 2-SD path ALSO becomes available — but **only if nobody has
// already locked in 3 wins by then**. A player who reaches 3 wins before
// the 10th giving renames it permanently, and the 2-SD path never becomes
// relevant for that award at all.

export const NAMING_WINS_THRESHOLD = 3;
export const NAMING_DOMINANCE_MIN_GIVINGS = 10;
export const NAMING_DOMINANCE_SD = 2;

/**
 * A slot is one award in one league, at one position where applicable —
 * the unit the doc says gets named independently.
 */
export function awardSlotKey(type, leagueId, position = null) {
  return position ? `${type}|${leagueId}|${position}` : `${type}|${leagueId}`;
}

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Resolves naming after a season's awards are decided.
 *
 * `history` is every past winner (each `{slotKey, playerId, firstName,
 * lastName, score, seasonNumber}`), `namesBySlot` maps an already-named
 * slot to its permanent name. Both are treated as read-only; updated
 * copies are returned, matching this codebase's non-mutating convention
 * for derived state.
 *
 * @param {object[]} history - INCLUDING this season's awards
 * @param {Map<string, object>} namesBySlot
 * @param {object[]} seasonAwards - just this season's, to decide who newly triggers naming
 * @param {number} seasonNumber
 * @returns {{namesBySlot: Map<string, object>, namedThisSeason: object[]}}
 */
export function resolveAwardNaming(history, namesBySlot, seasonAwards, seasonNumber) {
  const updated = new Map(namesBySlot);
  const namedThisSeason = [];

  for (const award of seasonAwards) {
    const slotKey = awardSlotKey(award.type, award.leagueId, award.position);
    if (updated.has(slotKey)) continue; // already named — never changes again

    const slotHistory = history.filter((h) => h.slotKey === slotKey);

    // Path 1: the first player to reach three wins in this slot.
    const winsByPlayer = new Map();
    for (const h of slotHistory) winsByPlayer.set(h.playerId, (winsByPlayer.get(h.playerId) ?? 0) + 1);
    if ((winsByPlayer.get(award.playerId) ?? 0) >= NAMING_WINS_THRESHOLD) {
      updated.set(slotKey, {
        name: `The ${award.firstName} ${award.lastName} Award`,
        playerId: award.playerId, seasonNumber, reason: 'THREE_WINS',
      });
      namedThisSeason.push({ slotKey, type: award.type, leagueId: award.leagueId, position: award.position, name: `The ${award.firstName} ${award.lastName} Award`, reason: 'THREE_WINS', seasonNumber });
      continue;
    }

    // Path 2: statistical dominance — only unlocked once the award has
    // been given NAMING_DOMINANCE_MIN_GIVINGS times AND nobody has locked
    // in three wins first (guaranteed by the `continue` above plus the
    // already-named check).
    if (slotHistory.length < NAMING_DOMINANCE_MIN_GIVINGS) continue;
    const scores = slotHistory.map((h) => h.score);
    const sd = standardDeviation(scores);
    if (sd <= 0) continue;
    if (award.score >= mean(scores) + NAMING_DOMINANCE_SD * sd) {
      updated.set(slotKey, {
        name: `The ${award.firstName} ${award.lastName} Award`,
        playerId: award.playerId, seasonNumber, reason: 'STATISTICAL_DOMINANCE',
      });
      namedThisSeason.push({ slotKey, type: award.type, leagueId: award.leagueId, position: award.position, name: `The ${award.firstName} ${award.lastName} Award`, reason: 'STATISTICAL_DOMINANCE', seasonNumber });
    }
  }

  return { namesBySlot: updated, namedThisSeason };
}

const GENERIC_AWARD_LABELS = Object.freeze({
  MVP: 'Most Valuable Player',
  BEST_PITCHER: 'Best Pitcher',
  ROOKIE_OF_THE_YEAR: 'Rookie of the Year',
  MANAGER_OF_THE_YEAR: 'Manager of the Year',
  SILVER_SLUGGER: 'Silver Slugger',
});

/**
 * The display name for a slot — its permanent honoree name once locked in,
 * otherwise the generic label.
 */
export function awardDisplayName(type, leagueId, position, namesBySlot, leagueName) {
  const named = namesBySlot?.get(awardSlotKey(type, leagueId, position));
  if (named) return position ? `${named.name} (${position})` : named.name;
  const base = GENERIC_AWARD_LABELS[type] ?? type;
  const withPosition = position ? `${base} (${position})` : base;
  return leagueName ? `${leagueName} ${withPosition}` : withPosition;
}
