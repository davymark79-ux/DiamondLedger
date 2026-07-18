# Weather — v0.1

*Nothing crazy, per Christopher — small, realistic gameplay effects
grounded in real per-city climate data, not a dramatic system. Stacks onto
existing mechanics (fatigue, error rates) rather than introducing new
standalone systems.*

## Weather Generation

- Each stadium's real city (all cities in this project are real, per the
  League Structure doc) has real climate normals — average temperature and
  precipitation probability by date.
- Daily weather is rolled using that city's normal as a mean, with
  realistic day-to-day random variance around it — not every game simply
  hits the seasonal average.
- Actual historical climate data per city is a data-generation task,
  deferred to build time — same pattern as name pools and other bulk data
  needs throughout this project.

## Stadium Type Determines Exposure

New attribute for the Stadiums doc's Core Attributes: **roof type**.

- **Open air** — full weather exposure: real rainout risk, temperature and
  wind effects apply in full.
- **Fixed dome** — full climate control, always. No weather effects, no
  rainout risk, ever.
- **Retractable roof** — realistic simplification: the roof closes ahead
  of bad weather (the entire point of having one), so these stadiums
  should essentially never get rained out and see little-to-no extreme-
  weather gameplay effect. Still gets cosmetic "roof open" flavor on nice
  days for atmosphere, without needing to model an actual open/close
  decision mechanic.

## Gameplay Effects — kept genuinely small

- **Extreme heat** — adds to fatigue accumulation, stacking onto the
  existing fatigue mechanic (Injuries doc) rather than being a separate
  system. Affects both pitcher fatigue and the lighter position-player
  fatigue mechanic.
- **Cold / wet conditions** — slight increase to error rates (grip, footing,
  ball handling).
- **Wind** — a small stylized nudge to fly-ball-related outcomes (extra-base
  hits/home runs), not real physics — the plate-appearance-level engine
  doesn't simulate actual ball flight, so this should be a probabilistic
  adjustment to the existing outcome tables rather than a trajectory
  calculation.
- All effects intentionally small — same design discipline already applied
  to position-player fatigue ("not crippling, just represents that
  conditions matter a little").

## Rainouts & Rescheduling

- Open-air stadiums roll precipitation risk each game date; a triggered
  roll postpones the game.
- **Doubleheaders are the primary rescheduling mechanism, and should be
  meaningfully more common than in real MLB.** This isn't arbitrary — it's
  a direct consequence of the schedule being tighter than real MLB's:
  tournament blackout weekends (Cup group stage, Cup knockout, League
  Playoffs) eat into the season's slack, leaving far fewer genuinely open
  dates to slot a standalone makeup game into. A rainout mostly gets
  absorbed as a doubleheader tacked onto an already-scheduled future date,
  because a truly open day often doesn't exist.
- Not every precipitation roll needs to be a full rainout — a lighter
  "playable rain" outcome (game proceeds, cold/wet gameplay modifiers
  apply) vs. a heavier threshold that actually triggers postponement is
  worth distinguishing, rather than treating all precipitation identically.

## Open Questions

- Real climate data per city — deferred to build time, bulk data task.
- Exact precipitation threshold separating "playable rain" from "rainout"
  — not yet specced.
- Exact magnitude of all gameplay modifiers (fatigue bump, error rate bump,
  wind nudge) — placeholders, need real tuning against a working sim, same
  as every other numeric constant in this project.
- Minor Financial Model tie-in worth flagging, not designed: does a
  postponed/rescheduled game affect gate revenue for its makeup date
  (e.g. a weekday doubleheader drawing worse than the originally-scheduled
  weekend game would have)? Not addressed here.
