// Plate-appearance outcome model constants.
//
// baseball-sim-design-doc.md's Sim Engine section specifies the resolution
// level and inputs ("plate-appearance level... batter/pitcher ratings +
// matchup modifiers produce an outcome from a probability table") but no
// formula. Everything below is this engine's placeholder implementation of
// that table — anchored to real modern-MLB league-average rate stats so a
// 50-vs-50 (perfectly average) matchup produces a realistic season line.
// Same tuning status as every other numeric constant in the design docs:
// needs real playtesting/calibration, not a final word.

export const PA_OUTCOMES = Object.freeze({
  STRIKEOUT: 'STRIKEOUT',
  WALK: 'WALK',
  HIT_BY_PITCH: 'HIT_BY_PITCH',
  OUT: 'OUT',
  SINGLE: 'SINGLE',
  DOUBLE: 'DOUBLE',
  TRIPLE: 'TRIPLE',
  HOME_RUN: 'HOME_RUN',
});

// League-average PA shares at a 50-vs-50 matchup. Rough modern-MLB anchors.
export const BASE_RATES = Object.freeze({
  strikeout: 0.22,
  walk: 0.085,
  hitByPitch: 0.008, // fixed — not rating-driven, no doc specs a driver for this
  homeRun: 0.03,
});

// Of PAs that are a ball in play and not a HR, share that go for a hit.
export const BASE_BABIP = 0.3;

// Of non-HR hits, split across 1B/2B/3B.
export const BASE_HIT_SPLIT = Object.freeze({ single: 0.78, double: 0.19, triple: 0.03 });

// Probability-shift sensitivity per rating point of skill differential
// (e.g. 10 points of batter.contact - pitcher.stuff moves K rate by 10 * SENSITIVITY.strikeout).
export const SENSITIVITY = Object.freeze({
  strikeout: 0.003, // batter contact vs. pitcher stuff (velocity+movement avg)
  walk: 0.0025, // batter eye vs. pitcher control
  homeRun: 0.0015, // batter power vs. pitcher movement
  babip: 0.002, // batter contact vs. pitcher movement
  speedBabipBonus: 0.0008, // per point of batter speed above average (infield hits)
  extraBaseShift: 0.002, // per point of batter power above average, shifts hit-type split toward 2B/3B
  speedExtraBaseShift: 0.001, // per point of batter speed above average, same direction
  // engine/fielding.js's team defense composite vs. RATING_SCALE.AVERAGE —
  // above-average team defense lowers BABIP (converts more balls in play
  // into outs), below-average raises it. Smaller than the batter-vs-pitcher
  // babip sensitivity above — a shared team-wide effect, not the primary matchup.
  defense: 0.0015,
});

// Shifts hit-type split share from 2B/3B toward singles when
// engine/fielding.js's isNoDoublesActive() is true (defense playing deep,
// protecting a late lead) — more bloop singles fall in, fewer balls get
// through for extra bases. Applied directly to BASE_HIT_SPLIT's double/
// triple shares in plateAppearance.js's computeHitSplit.
export const NO_DOUBLES_SINGLE_SHIFT = 0.05;

// Guardrails so extreme matchups can't push probabilities negative or over 100%.
export const PROBABILITY_FLOOR = 0.01;
export const PROBABILITY_CEILING = 0.98;
export const MIN_SINGLE_SHARE_OF_HITS = 0.3;

// Platoon/handedness splits (engine/plateAppearance.js's platoonShift) —
// population-average rating-point-equivalent shift per bats-vs-throws
// pairing, in the same units SENSITIVITY converts into a probability
// change. Deliberately asymmetric per real MLB data: left-handed batters
// carry a meaningfully bigger split (both the same-hand penalty and the
// opposite-hand bonus) than right-handed batters do — LHB vs LHP is the
// single toughest matchup, more so than RHB vs RHP. Explicit placeholder,
// illustrative-real-world-informed values, same "needs real tuning" status
// as every other constant in this file.
export const PLATOON_SHIFTS = Object.freeze({
  R_vs_R: -4, // same-hand, standard penalty
  R_vs_L: 4, // opposite-hand, standard bonus
  L_vs_L: -9, // same-hand — the real "toughest matchup" case
  L_vs_R: 6, // opposite-hand — lefties have a wider overall platoon split
});

// How much a batter's own Platoon Skill rating (models/constants.js's
// MAKEUP_ATTRIBUTES) compresses/exaggerates the population-average shift
// above. scaleFactor = 1 - (platoonSkill - 50) * this — 1 (unchanged) at
// average, shrinking toward 0 as platoonSkill climbs, growing above 1 as
// it falls. Deliberately sized so only the true tail of the scale (~80,
// already rare by this engine's population-scarcity design) pushes
// scaleFactor slightly negative — a rare, small, genuine reverse-split —
// while a merely very good rating (~70) still shows the same-direction
// population trend, just compressed.
export const PLATOON_SKILL_SCALE_SENSITIVITY = 0.035;
