# Player Names & Bio Generation — v0.3

*Covers full name generation and other fixed-at-creation bio attributes.
Ties directly into the Nationality doc's tag system and the International
Tournament doc's curated nation list.*

## Name Generation

- **First name**: drawn from the player's **birthplace** nation's naming
  pool. Given names are shaped mostly by where someone actually grew up.
- **Last name**: a weighted roll. Mostly birthplace, but if the player has
  a heritage tag, there's a real chance (~40%, placeholder) the surname
  reflects the heritage nation instead. Mirrors real-world onomastic
  patterns — surnames persist across generations even after a family
  otherwise assimilates culturally. Direct callback to the Joe Smith
  example from the Nationality doc: American-raised, English surname.
  Players without a heritage tag always draw from birthplace, since
  there's nothing else to pull from.
- **No enforced uniqueness.** Duplicate full names across thousands of
  generated players are realistic in small numbers and not worth
  dedup logic.

## Name Pool Scope

- **USA gets one pool**, not 25 (one per metro market) — first/last names
  don't meaningfully vary by US city.
- Full pools needed for the ~16–20 tournament-eligible nations already
  curated in the International Tournament doc, plus a curated
  heritage-nation list (~15–25 common real-world immigration sources) for
  domestic heritage tags. These two lists should overlap heavily — most
  tournament nations are also plausible heritage sources — to avoid
  maintaining near-duplicate lists.
- **Actual name-pool data (real representative names per nation) is a bulk
  data-generation task, deferred to build time** rather than enumerated in
  this design pass — happy to build starter sets when we get there.
- Design principle: pools should be genuine and representative of each
  culture, not caricature shortcuts.

## Other Fixed-at-Creation Bio Attributes

- **Birthdate** — derived from age at creation (17 or 18, per the Player
  Pathway doc). Just birth-year math, no separate system needed.
- **Throws** — real MLB rate is about 78% right / 22% left, a split
  that's been remarkably stable since the 1970s (roughly double the
  general population's left-handed rate, since left-handed pitching
  carries real strategic value). Recommend applying that ~78/22 split
  specifically to pitchers, with a higher right-handed skew for position
  players (closer to the general population's ~90/10) since the value of
  throwing left-handed is much more pitching-specific.
- **Bats** — real MLB trends: switch-hitting has been declining for
  decades (peaked in 1987, down to under 60 total switch-hitters
  leaguewide by 2024), while left-handed batting is overrepresented
  relative to the general population, since plenty of natural right-handed
  throwers learn to bat lefty for the platoon advantage and the head start
  toward first base. Recommend roughly **55% right / 35% left / 10%
  switch at creation** — placeholder, but grounded in the real direction
  of these trends rather than a guess.
- **Switch-hitting, resolved as developable, not purely fixed at
  creation.** Real players do sometimes learn to switch-hit, almost
  always young — college or early minors. Ties into the college specialty
  modifier system already established in the Player Pathway doc: a
  prospect at a school with a "hitting academy"-style specialty has a
  small, genuine chance of picking up switch-hitting during development.
  Rare, matching how uncommon it actually is in real baseball, but a real
  possible outcome rather than a trait locked in permanently at birth.
- **Height/weight** — real MLB data shows a clear pattern by position:
  pitchers and first basemen/DH run biggest (pitchers are the tallest
  position group in baseball; corner power spots carry the most weight),
  catchers are average height but stockier/more compact, and middle
  infield — second base especially, shortstop close behind — is the
  smallest, leanest group on the field by a real margin. Illustrative
  starting ranges:

| Position | Height tendency | Weight tendency |
|---|---|---|
| Pitcher | Tallest group | Above average |
| Catcher | Average | Above average, compact/stocky build |
| 1B / DH | Above average | Heaviest group |
| 2B | Shortest group | Lightest group |
| SS | Average | Light, lean |
| 3B | Average to above | Above average |
| OF | Average, most varied | Average, most varied |

  Exact numeric ranges (inches/lbs) not yet built out — this is a
  directional table to build the real generation ranges from later.

## Open Questions

- Full name-pool data build — deferred to build time.
- Exact heritage-nation list and its overlap with the tournament-nation
  list — needs final curation.
- Height/weight distribution by position — directional pattern resolved
  above (see table), exact numeric ranges still TBD.
- Last-name birthplace/heritage split percentage (~40% proposed) —
  placeholder, adjustable.
- Exact probability/rate for switch-hitting development at a "hitting
  academy"-specialty school — new placeholder, needs a real number.
