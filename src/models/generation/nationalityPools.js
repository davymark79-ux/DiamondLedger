// Nationality generation — international-tournament-and-nationality.md's
// "shallow data, rich mechanic" design: a short list of tags per player
// (birth nation + 0-2 heritage nations), rolled once at creation and
// otherwise inert flavor data. No simulated ancestry, no birth-region/city
// correlation (no such data exists anywhere on Player) — the doc's own
// suggested regional heritage weighting (e.g. "Miami-born skews Cuban")
// is explicitly NOT attempted here for that reason; heritage nation is
// drawn independently of birth nation instead. Illustrative placeholder
// weights approximating real MLB birthplace demographics, not sourced from
// a real dataset — same tuning status as every other numeric constant in
// this project.

import { pickWeighted } from './random.js';

export const BIRTH_NATION_POOL = Object.freeze([
  { value: 'USA', weight: 0.70 },
  { value: 'Dominican Republic', weight: 0.10 },
  { value: 'Venezuela', weight: 0.06 },
  { value: 'Cuba', weight: 0.03 },
  { value: 'Mexico', weight: 0.03 },
  { value: 'Puerto Rico', weight: 0.025 },
  { value: 'Japan', weight: 0.015 },
  { value: 'South Korea', weight: 0.01 },
  { value: 'Canada', weight: 0.01 },
  { value: 'Colombia', weight: 0.01 },
  { value: 'Panama', weight: 0.01 },
  { value: 'Curacao', weight: 0.01 },
]);

// Three-letter display codes for the UI tag — kept separate from the pool
// weights above since heritage-only nations (never a birthplace) need
// codes too.
export const NATION_CODES = Object.freeze({
  USA: 'USA',
  'Dominican Republic': 'DOM',
  Venezuela: 'VEN',
  Cuba: 'CUB',
  Mexico: 'MEX',
  'Puerto Rico': 'PUR',
  Japan: 'JPN',
  'South Korea': 'KOR',
  Canada: 'CAN',
  Colombia: 'COL',
  Panama: 'PAN',
  Curacao: 'CUW',
  Ireland: 'IRL',
  Italy: 'ITA',
  Germany: 'GER',
  Poland: 'POL',
  England: 'ENG',
  Haiti: 'HAI',
  Nicaragua: 'NCA',
  Taiwan: 'TPE',
  Brazil: 'BRA',
});

// Heritage-only entries (implausible or rare as a pro ballplayer's actual
// birthplace in this pool, but common real-world heritage claims) layered
// on top of the birth-nation list for heritage-roll variety.
const HERITAGE_ONLY_NATIONS = Object.freeze([
  'Ireland', 'Italy', 'Germany', 'Poland', 'England', 'Haiti', 'Nicaragua', 'Taiwan', 'Brazil',
]);

export const HERITAGE_NATION_POOL = Object.freeze([
  ...BIRTH_NATION_POOL.map((entry) => entry.value),
  ...HERITAGE_ONLY_NATIONS,
]);

// ~75-80% one nationality only / ~15-20% one heritage nation (2 total) /
// ~2-5% a rare second heritage nation (3 total, the ceiling) — doc's own
// recommended split, placeholder percentages per the doc itself.
export const HERITAGE_NATION_COUNT_WEIGHTS = Object.freeze([
  { value: 0, weight: 0.78 },
  { value: 1, weight: 0.18 },
  { value: 2, weight: 0.04 },
]);

export function pickBirthNation(rng) {
  return pickWeighted(rng, BIRTH_NATION_POOL);
}

// Distinct sampling (no repeats, never equal to birthNation) from
// HERITAGE_NATION_POOL — small enough (max 2 picks) that simple rejection
// sampling is fine, no need for a general-purpose shuffle utility.
export function pickHeritageNations(rng, birthNation) {
  const count = pickWeighted(rng, HERITAGE_NATION_COUNT_WEIGHTS);
  const picked = [];
  let guard = 0;
  while (picked.length < count && guard < 100) {
    guard += 1;
    const candidate = HERITAGE_NATION_POOL[Math.floor(rng() * HERITAGE_NATION_POOL.length)];
    if (candidate === birthNation || picked.includes(candidate)) continue;
    picked.push(candidate);
  }
  return picked;
}
