// Shared enums and reference constants for the Player/Team/League data model.
// Sourced from diamond-ledger-design-docs/league-structure.md and
// player-attributes-and-development.md. Numeric placeholders below (variance
// std. devs, streak thresholds) are explicitly flagged as unresolved tuning
// values in those docs — kept here as named constants so the eventual sim
// engine has one place to read them from, not because the values are final.

export const RATING_SCALE = Object.freeze({ MIN: 20, MAX: 80, AVERAGE: 50 });

export const POSITIONS = Object.freeze([
  'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP',
]);

export const PITCHER_POSITIONS = Object.freeze(['SP', 'RP']);

// Attribute groups, all on the 20-80 scale (Rating Schema section).
// Bunting Skill is an engine addition — a physical/technical bat-control
// tool (see engine/bunting.js), not an abstract trait, so it belongs here
// rather than in MAKEUP_ATTRIBUTES: it should get the same per-game form
// jitter and position-player-fatigue nudge contact/power/eye already get.
export const HITTING_ATTRIBUTES = Object.freeze(['contact', 'power', 'eye', 'buntingSkill']);
export const BASERUNNING_ATTRIBUTES = Object.freeze(['speed', 'baserunningInstincts']);
export const DEFENSE_ATTRIBUTES = Object.freeze(['fielding', 'armStrength', 'armAccuracy']);
// Pitchability is an engine addition beyond the design doc's original
// Velocity/Control/Movement/Stamina four — a "pitchability"/feel-for-pitching
// scouting trait (mixing/sequencing, adapting mid-start) distinct from raw
// stuff. It tempers the times-through-the-order penalty and dampens bad-day
// swings (see engine/timesThroughOrder.js and engine/consistency.js) — the
// profile a pitcher like Gerrit Cole represents, who holds up better a 3rd
// time through the order than a pure one-pitch-mix thrower would.
export const PITCHING_ATTRIBUTES = Object.freeze(['velocity', 'control', 'movement', 'stamina', 'pitchability']);
// Durability doubles as injury proneness; Consistency governs short-term true-ability
// drift (Hot/Cold Streaks), distinct from Work Ethic's game-to-game performance spread.
// Coachability is an engine addition beyond the design doc's original three —
// how a player reacts to an organization-recommended position/role change
// (see engine/reassignmentReaction.js): low means prone to refusing out of
// pride/stubbornness (with a morale malus, or occasionally a defiant
// "prove them wrong" spark), high means he buys in readily.
// Platoon Skill is another engine addition — how much the population-level
// handedness matchup effect (engine/plateAppearance.js's platoonShift)
// applies to this specific player: average (50) gets exactly the
// population pairing shift, high compresses it toward matchup-neutral (a
// flatter-split "everyday" hitter), low exaggerates it (a classic
// short-side platoon player), and the rare elite outlier can even flip a
// same-handed matchup into a small genuine reverse-split. Belongs here
// rather than HITTING_ATTRIBUTES specifically so it's excluded from
// position-player fatigue's attribute nudge (engine/positionPlayerFatigue.js
// only touches HITTING/BASERUNNING/DEFENSE_ATTRIBUTES) — matchup-dependency
// character shouldn't degrade just because a player is tired.
export const MAKEUP_ATTRIBUTES = Object.freeze(['workEthic', 'durability', 'consistency', 'coachability', 'platoonSkill']);

// Bats: switch-hitting is developable (rare, picked up young), not purely fixed at
// creation — see player-names-and-bio.md.
export const BATS = Object.freeze(['R', 'L', 'S']);
export const THROWS = Object.freeze(['R', 'L']);

export const LEAGUE_IDS = Object.freeze({ FOUNDRY: 'FOUNDRY', EXCHANGE: 'EXCHANGE' });

// League Identities — real divergence in ownership culture and style of play,
// not just branding (league-structure.md).
export const LEAGUES = Object.freeze({
  [LEAGUE_IDS.FOUNDRY]: Object.freeze({
    id: LEAGUE_IDS.FOUNDRY,
    name: 'The Foundry League',
    dhRule: false, // pitchers hit
    style: 'small-ball / manufacture runs',
  }),
  [LEAGUE_IDS.EXCHANGE]: Object.freeze({
    id: LEAGUE_IDS.EXCHANGE,
    name: 'The Exchange League',
    dhRule: true,
    style: 'analytics-driven / power-OBP-first',
  }),
});

export const TIERS = Object.freeze({ MLB1: 'MLB1', MLB2: 'MLB2' });

export const DIVISIONS_BY_TIER = Object.freeze({
  [TIERS.MLB1]: Object.freeze(['Atlantic', 'Heartland', 'Pacific']),
  [TIERS.MLB2]: Object.freeze(['Frontier', 'Coastal']),
});

export const OWNERSHIP_TYPES = Object.freeze({
  SINGLE_OWNER: 'SINGLE_OWNER',
  FAN_OWNED: 'FAN_OWNED', // Foundry League only, Bundesliga 50+1-style model
});

// Collective fan/member shareholder base must always hold at least this share.
export const FAN_OWNERSHIP_MIN_FAN_SHARE = 0.51;

// Development period a player's current rating is growing through — feeds the
// Growth Model's variance std. dev. (below). HS/College precede a pro org;
// Rookie/A/AA/AAA/MLB are minor/major-league levels. ROOKIE added for the
// Minor League System (minor-leagues.md/rookie-league.md) — sits between
// HS and COLLEGE in variance below, since Rookie ball's population skews
// HS-signee-heavy (rookie-league.md).
export const DEVELOPMENT_LEVELS = Object.freeze({
  HS: 'HS',
  COLLEGE: 'COLLEGE',
  ROOKIE: 'ROOKIE',
  A: 'A',
  AA: 'AA',
  AAA: 'AAA',
  MLB: 'MLB',
});

// Illustrative placeholder std. devs for the per-attribute variance roll —
// widest at the lowest levels, narrows with level. Needs real playtesting.
export const VARIANCE_STD_DEV_BY_LEVEL = Object.freeze({
  [DEVELOPMENT_LEVELS.HS]: 8,
  [DEVELOPMENT_LEVELS.COLLEGE]: 7,
  [DEVELOPMENT_LEVELS.ROOKIE]: 7.5,
  [DEVELOPMENT_LEVELS.A]: 5.5,
  [DEVELOPMENT_LEVELS.AA]: 3.5,
  [DEVELOPMENT_LEVELS.AAA]: 2,
  [DEVELOPMENT_LEVELS.MLB]: 1,
});

// Minor League System (minor-leagues.md/rookie-league.md) — the Path to
// Draft/Minors/Free-Agency arc's Phase 1. Promotion order for the call-up
// cascade (engine/minorLeagues.js's promoteAndBackfill): index 0 is
// closest to the majors.
export const MINOR_LEAGUE_LEVELS_ORDER = Object.freeze(['AAA', 'AA', 'A', 'ROOKIE']);

// Quality bands (RATING_SCALE anchors, same "needs real playtesting" tone as
// ROSTER_QUALITY_BY_TIER in models/seed/rosterSeed.js) — deliberately all
// below TIERS.MLB2's [25, 52] band, descending toward Rookie ball. Used both
// for initial affiliate roster generation (models/seed/affiliateSeed.js) and
// the call-up cascade's fresh-fill fallback (engine/minorLeagues.js) when no
// eligible prospect exists at a given level. NOTE: every level currently
// reuses generateEstablishedPlayer()'s 21-37 age range — a real Rookie/A-ball
// age distribution (17-23-ish HS/international signees) isn't modeled yet,
// since nothing feeds Rookie ball with genuinely young signees until the
// draft/international-pathway phases of this arc get built. Flagged, not
// faked.
export const MINOR_LEAGUE_QUALITY_BANDS = Object.freeze({
  AAA: [25, 45],
  AA: [21, 41],
  A: [14, 34],
  ROOKIE: [10, 30],
});

// Season lengths per level (minor-leagues.md), scaled off the majors' own
// 150-game season the same way the doc derives them. Rookie's is a rough
// placeholder shape (short, per rookie-league.md) — exact game count isn't
// specced there.
export const MINOR_LEAGUE_SEASON_LENGTHS = Object.freeze({
  AAA: 139,
  AA: 128,
  A: 122,
  ROOKIE: 45,
});

// rookie-league.md's four regional hubs — Rookie affiliates are grouped and
// scheduled within their own hub only, unlike AAA/AA/A (one combined
// 50-club group each). Assignment of the 50 parent clubs across hubs is a
// round-robin placeholder (models/generation/affiliateNamePools.js) — the
// doc itself leaves real geographic assignment as an open follow-up task.
export const ROOKIE_REGIONAL_HUBS = Object.freeze(['Florida', 'Texas', 'Arizona', 'Southern California']);

// Domestic (HS) Draft — Phase 2 of the "Path to Draft, Minors & Free
// Agency" arc (player-pathway.md). All placeholders, needs real
// playtesting like every other numeric constant in this codebase.
export const DRAFT_ROUNDS = 10; // real MLB currently drafts 20 rounds; kept smaller for a first pass
export const DRAFT_LOTTERY_PICKS = 2; // current real NHL format — only the top 2 slots are actually lottery-drawn
export const DRAFT_LOTTERY_MAX_RISE = 10; // a team can't rise more than this many spots from its natural reverse-standings rank
// Anti-tanking bonus (engine/draft.js) — extra lottery-only equity for a
// team's win% in games AFTER it's mathematically eliminated, on top of the
// base worse-record-better-odds weight. Added per explicit user request:
// a unified draft with no such bonus gives MLB2 clubs especially zero
// incentive not to tank once eliminated.
export const DRAFT_ELIMINATION_BONUS_SCALE = 0.5;

// Injury severity tiers (injuries.md). DAY_TO_DAY has no real IL minimum
// and rolls a small variable range; the rest carry a hard floor
// (INJURY_SEVERITY_MINIMUM_GAMES, engine/injuries.js) matching the real
// 10-day/60-day IL structure — a player is ineligible to return before that
// floor elapses, regardless of how quickly he's actually healed. Ordered
// least-to-most severe; setback escalation (engine/injuries.js) only ever
// moves forward through this order, and stops at SEASON_ENDING —
// CAREER_ENDING is a rare, initial-roll-only outcome, never a setback
// destination.
export const INJURY_SEVERITIES = Object.freeze({
  DAY_TO_DAY: 'DAY_TO_DAY',
  SHORT_TERM_IL: 'SHORT_TERM_IL', // ~10-day IL equivalent
  LONG_TERM_IL: 'LONG_TERM_IL', // ~60-day IL equivalent
  SEASON_ENDING: 'SEASON_ENDING',
  CAREER_ENDING: 'CAREER_ENDING',
});

// Flavor injury-type pools, loosely split pitcher-arm-leaning vs. position-
// player-leg/other-leaning per injuries.md's real position-driven injury-
// burden data — not the fuller catcher-specific severity-profile nuance the
// doc also wants eventually (deferred).
export const PITCHER_INJURY_TYPES = Object.freeze([
  'shoulder inflammation', 'elbow strain', 'forearm tightness', 'lat strain', 'blister',
]);
export const POSITION_PLAYER_INJURY_TYPES = Object.freeze([
  'hamstring strain', 'oblique strain', 'ankle sprain', 'quad strain', 'wrist sprain', 'back spasms',
]);

export const HOT_COLD_TIERS = Object.freeze({
  ICE_COLD: 'ICE_COLD',
  COLD: 'COLD',
  NEUTRAL: 'NEUTRAL',
  HOT: 'HOT',
  ON_FIRE: 'ON_FIRE',
});

// Standard-deviations-from-expectation thresholds for the five-position
// Hot/Cold slider, illustrative per doc. Ordered ascending by upper bound;
// first bucket whose `max` the value is <= wins.
export const HOT_COLD_THRESHOLDS = Object.freeze([
  Object.freeze({ max: -2.0, tier: HOT_COLD_TIERS.ICE_COLD }),
  Object.freeze({ max: -0.75, tier: HOT_COLD_TIERS.COLD }),
  Object.freeze({ max: 0.75, tier: HOT_COLD_TIERS.NEUTRAL }),
  Object.freeze({ max: 2.0, tier: HOT_COLD_TIERS.HOT }),
  Object.freeze({ max: Infinity, tier: HOT_COLD_TIERS.ON_FIRE }),
]);

// managers.md — Manager entity. Deliberately a separate 1-100 scale from
// players' 20-80 RATING_SCALE (matches the doc's explicit "(1-100)" tag on
// the seven sliders); Temperament and Streak Read aren't among the seven
// bipolar sliders but the doc gives them no distinct scale, so every
// manager numeric attribute shares this one scale for simplicity.
export const MANAGER_ATTRIBUTE_SCALE = Object.freeze({ MIN: 1, MAX: 100, AVERAGE: 50 });

// The seven bipolar sliders. Direction convention (low -> high), since two
// of these overlap conceptually enough in English to need an explicit,
// disambiguating rule: 1 = quick-hook / conservative / fixed-lineup /
// Analytics / straight-away; 100 = long-leash / aggressive / heavy-
// platooning / Feel / heavy-micromanagement. Pitcher Hook (WHEN a pitcher
// gets pulled) and Bullpen Usage (HOW liberally the best reliever gets
// deployed once you're in the pen) are the two most easily confused —
// engine/pitchingChanges.js's header spells out exactly which constant each
// one owns.
export const MANAGER_SLIDER_NAMES = Object.freeze([
  'stealAggressiveness',
  'smallBallTendency',
  'pitcherHook',
  'bullpenUsage',
  'platoonTendency',
  'analyticsVsFeel',
  'defensiveManagement',
]);

// A weighted roll at generation, majority ex-player matching real baseball.
// No real pool of past players exists to draw an ex-player manager's
// record from (this app has no season-to-season loop, so
// engine/retirement.js never actually retires anyone in production) — see
// models/Manager.js's header for how this simplification is handled.
export const MANAGER_ORIGINS = Object.freeze({ EX_PLAYER: 'EX_PLAYER', OUTSIDER: 'OUTSIDER' });

// writers-corps.md — the Hall of Fame voting electorate. The doc's own
// "four personality sliders (1-100 each)" — reuses MANAGER_ATTRIBUTE_SCALE
// directly, matching the doc's explicit scale choice.
export const WRITER_SLIDER_NAMES = Object.freeze(['traditionalism', 'analytics', 'quirkinessContrarianism', 'homerism']);
