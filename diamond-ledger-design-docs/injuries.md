# Injuries — v0.4

*Fills in the injury system referenced in the main design doc's Sim
Engine (pitcher fatigue → injury-risk checks) and Scripted Event System
("season-ending, career-ending; extremely rare career-ending 'accident'
abstracted, no graphic detail"). Grounded in real MLB injury-burden data
by position where useful. v0.2 adds position-player fatigue, real
10-day/60-day IL structure, corrects the tournament-stakes mechanic, and
confirms healing curves shouldn't reset at season boundaries.*

## Risk Model

Injury risk is checked as its own roll, separate from the in-game
performance-consistency roll (Player Attributes & Development doc) —
keeps the two mechanics clean and independent rather than conflating
"played badly" with "got hurt."

```
injury_risk = base_rate × position_multiplier × age_multiplier
            × durability_modifier × fatigue_multiplier (pitchers only)
```

- **`durability_modifier`** — driven by the existing Durability/Injury
  Proneness Makeup attribute (Player Attributes & Development doc,
  20-80 scale). Higher Durability = lower risk. This is the attribute's
  first real mechanical use — it was named but not yet wired to anything.
- **`age_multiplier`** — risk increases with age, consistent with the
  aging-curve concept already implied by the Growth Model's development
  system. Not yet numerically specced.
- **`position_multiplier`** — grounded in real injury-burden data by
  position (2011-2016 MLB study): pitchers carried 39.1% of total injury
  burden — more than double any position group — followed by infielders
  (27.1%), outfielders (22.8%), catchers (11.0%), DH (0.1%, reflecting
  much lower defensive/baserunning exposure). Recommend pitchers get by
  far the highest baseline multiplier, infielders and outfielders roughly
  comparable, catchers lower in raw frequency but see Severity below —
  their profile skews toward specific injury types (concussions, knee/
  meniscus) even at a lower overall rate.
- **`fatigue_multiplier`** — pitchers only, spikes as pitch count exceeds
  normal thresholds. This is the mechanic already committed to in the main
  design doc's Sim Engine section — this doc just formalizes it as one
  term in the broader risk formula rather than a standalone check. Real
  data point worth anchoring to: recent high-workload MLB pitchers
  averaged time-to-first-injury of only ~143-161 days into a season —
  well under half a full season — underscoring that pitcher fatigue
  management should be a real, constant pressure, not a rare edge case.

## Position Player Fatigue (lighter-touch, separate from pitcher fatigue)

Position players accumulate fatigue too, resolved as a genuinely lighter
mechanic than pitcher fatigue — the goal is representing that most players
need occasional rest, "not every player is Cal Ripken," not building a
punishing system.

- Fatigue accumulates across games played in a short window (consecutive
  games without rest) and **can carry over game to game** if a player
  gets genuinely worn down, rather than resetting after every game.
- Effects, both intentionally small: a minor negative modifier to that
  game's performance baseline, and a slight increase to injury risk (via
  the `position_multiplier`-adjusted formula above) — meaningfully smaller
  than the pitcher fatigue effect.
- **Most evident in doubleheaders and Cup tournament weekends** — exactly
  the high-density-games scenarios already built into the Cup's group
  stage format (1 doubleheader per team per weekend) and the "many games
  in a short window" framing from the Commissioner Vision doc. This gives
  the roster-management strategy during those stretches a second real
  lever beyond just pitcher usage — resting position players matters too,
  just less dramatically.

## Severity Tiers & Real Healing Curves

- **Day-to-day** — minimal, doesn't require an IL move, most common
  outcome by far.
- **10-day IL** — the standard short-term injured list move, matching
  real MLB structure.
- **60-day IL** — for more serious injuries, matching real MLB structure.
- **Season-ending** — out for the remainder of the season.
- **Career-ending "accident"** — extremely rare, abstracted, no graphic
  detail. **On by default, but very rare** — corrected from the earlier
  assumption that it was off by default; this is the actual decision.
- **IL duration structure (10-day/60-day) is CBA-negotiable**, joining the
  growing list in the Commissioner Vision doc (minimum salary, arbitration,
  free agency timelines, salary floor, luxury tax threshold/rate, roster
  size limits, and now IL duration).
- **Injury duration should follow real healing curves by injury type,
  not reset at season boundaries.** Most injuries are short enough that
  they resolve within a season regardless, but genuinely serious
  injuries — a Tommy John-equivalent being the clearest example, which in
  reality typically takes well over a full year to recover from — should
  be able to **carry over across the season boundary** into the following
  season. This means injury duration needs to be tracked as real elapsed
  time (or games/days), not as a season-scoped counter that quietly
  resets every offseason.
- Catchers, per the real data above, should skew toward a distinct
  severity/type profile (concussion, knee) rather than just a flat
  frequency multiplier — worth reflecting in eventual injury-type flavor
  text even though their overall raw frequency is lower than infielders/
  outfielders.

## Roster & Development Interactions

- **Call-ups** — an MLB injury creates a real, meaningful roster-churn
  moment: a spot opens, an AAA player gets called up, cascading down
  through AA, A, and now **Rookie** (`rookie-league.md`) per the Minor
  League System's affiliate structure (an AA player fills the AAA gap, an
  A player fills that gap, a Rookie-level player fills the A gap, etc.).
  **Confirmed as a fully mechanized chain reaction**, not a simplified
  direct fill — made possible by the Minor League System's v0.2 update to
  full sim (a defined "basic sim" feature set, not full engine parity with
  the majors), which means there's real performance data at every
  level to base cascade decisions on.
- **Tournament stakes — corrected.** The full 50-man roster travels for a
  Cup weekend, but if a player needs to go on IL during the tournament,
  that **does temporarily open a real roster spot**, same as during the
  regular season — a minor-league call-up can still fill it, even
  mid-tournament. The actual strategic tension isn't "no replacements are
  possible" (they are) — it's that a club already brought its strongest
  available 40 to the tournament, so an emergency call-up is very likely a
  real downgrade in quality, and the injured player himself is out for
  whatever his IL tier's minimum requires (10 or 60 days), which may span
  the rest of that tournament window regardless of the call-up. Combined
  with position-player fatigue above, this makes the "many games in a
  short window" stretch a genuine two-lever roster puzzle — pitcher usage
  and position-player rest both carry real consequences.
- **Development/redshirt tie-in** — the Player Pathway doc's college
  medical redshirt trigger (appearing in fewer than 25% of a season's
  games) will most commonly be *caused* by injury. Worth treating these
  as the same underlying event rather than two separate systems — an
  injury severe enough to keep a college player under the 25% threshold
  should be what flags redshirt eligibility, not a separately-tracked
  participation counter.

## Feeding League Wire

Injuries are the flagship example already given for Writers Corps bylines
("The New York Globe's John Elliot reports on Tom Miller's broken arm and
his potential return right before the playoffs") — no new design needed
here, just confirming the fit is direct and intentional.

## Open Questions

- Exact numeric values for `base_rate`, `age_multiplier`, and each
  position/fatigue multiplier (both pitcher and position-player) —
  deferred, needs real tuning against a working sim, same as every other
  numeric constant in this project. Design constraint now explicit:
  position-player fatigue should stay a light-touch mechanic — small
  stat/risk effects, not a punishing system.
- Exact healing-curve durations per injury type (10-day IL range, 60-day
  IL range, season-ending, and how far a Tommy-John-equivalent injury
  should realistically extend past a season boundary) — placeholders
  only, needs real figures.
- Career-ending "accident" trigger rate — confirmed **on by default, very
  rare** (corrected from the earlier off-by-default assumption). Exact
  rate still a placeholder.
