# Minor League System (v0.7)

*Correction from v0.1: minor league games are simulated — real games,
not abstracted development-only. This was never explicitly decided in
this doc before now, and a cross-reference in the Stadiums doc incorrectly
assumed minors were abstracted like college; that's now fixed. The
asymmetry going forward: **Majors and Minors are both simulated; College
and International Academies remain abstracted** (no games simulated,
development-only, per the Player Pathway doc).

**Scoped as a "basic sim," not full engine parity with the majors.**
Confirmed feature set: game outcome/standings, box score, player stats,
injuries, and progression/regression (the development variance system
from Player Attributes & Development). This doesn't require the minors to
share every eventual nuance the majors engine might grow into (advanced
matchup modifiers, ballpark factors, etc.) — just enough fidelity to
produce real won-loss records, real individual stat lines, and real
performance data to drive development, injuries, and call-up decisions.
The plate-appearance-outcome approach itself can likely be shared/reused
between majors and minors at different fidelity settings, rather than
being two separate engines — an implementation detail for whenever the
actual build happens, not decided here.

Directly relevant here: call-up cascades (AAA→MLB opening a AA→AAA slot,
etc.) are fully mechanized rather than a simplified direct fill, since
there's now real simulated performance data at every level to base those
decisions on. The Injuries doc's mechanics apply uniformly across both
majors and minors. Progression/regression is the Growth Model from Player
Attributes & Development — the minors (alongside college) are the primary
stage where the development variance system's busts and breakouts
actually play out.*

## Scale

- **4 levels, confirmed**: AAA, AA, A, and **Rookie** (added — see
  `rookie-league.md` for full detail on the Rookie tier specifically,
  including its four regional leagues, hard age/service caps, and
  Spring Training stadium sharing).
- Every MLB1 + MLB2 club must have exactly 1 affiliate at each level —
  50 × 4 = **200 affiliated clubs**, up from 150.
- Affiliates sit outside the promotion/relegation pyramid — players move
  between levels, clubs don't (consistent with the main design doc).
- **Season length, confirmed** (Season Calendar doc): scaled
  proportionally from real-world MiLB lengths, using the same ratio as
  the majors' reduction from 162 to 150 games (150/162): **AAA 139, AA
  128, A 122.** All shorter than the majors' 150-game season, matching
  real-world MiLB structure and feeding the Active Roster Expansion
  trigger (Commissioner Vision doc) once these seasons end. Rookie's
  season is shorter still and shaped differently (late start, early
  finish) rather than just proportionally scaled — see `rookie-league.md`.

## Market Pool — a callback to unused algorithm

The market-allocation algorithm from the League Structure doc had a third
phase — dropping the 1.25M threshold by 50,000 increments — that never
actually ran, because the top-25-cities math happened to land exactly on 50
without needing it. The minor league system is where that phase finally
gets used: eligible minor-league markets get pulled from the population list
below where the majors left off, continuing the step-down rule downward.
*(Not yet run — needs the actual city-by-city numbers before this is final.)*

## Regional Affiliation — tiered, resolved

**Resolved: proximity requirements differ by level, not a single
guide-for-everything rule.**

- **AAA: required to be relatively close to the parent club.** This is
  no longer just flavor — it's mechanically load-bearing. The Taxi
  Squad system (Commissioner Vision doc) depends on players "roughly
  splitting time between MLB and AAA" all season, which only works if
  that trip is actually reasonable. A distant AAA affiliate would
  quietly break the system it's designed to support.
- **AA and A: still a guide, not a rule** — can be farther away.
  Wealthier parent clubs are more likely to prioritize/afford
  geographically convenient affiliates at these levels (an emergent
  behavior driven by the Financial Model's owner-wealth knob, not a
  hard constraint), and real MiLB precedent for odd long-distance
  affiliations at these levels is fair game here too.
- **Rookie: not actually a distance decision at all** — already fixed by
  the Rookie League doc's four regional hubs (Florida, Texas, Arizona,
  Southern California), all Sun Belt by design, matching real Spring
  Training geography. Every team's Rookie affiliate lands in the South
  regardless of where the parent club is based — this was already
  locked in, this just confirms it explicitly rather than leaving it
  implicit.

## Affiliated vs. Unaffiliated

- **Affiliated** clubs get a subsidy from their parent MLB club (feeds into
  the parent's expense picture in the Financial Model), on top of their own
  local market size.
- **Unaffiliated** clubs are pure market-size, no subsidy, and regularly
  lose players to affiliated clubs' scouting/player-development pipelines.
- Unaffiliated clubs are **significantly more likely to fold or relocate**
  than affiliated ones — feeds directly into the Scripted Event System's
  "Teams leaving cities / bankruptcy" category.
- Expansion teams may adopt a nearby unaffiliated club as an instant
  affiliate instead of building a farm system from scratch — a good
  cold-start shortcut for the expansion event chain. "Nearby" is a soft
  preference here too, not a requirement.

## Contraction, Expansion & Forced Re-Affiliation

- Individual minor league clubs can fold, relocate, or spring up
  independently over time.
- Every MLB club must **always** have exactly 1 AAA + 1 AA + 1 A + 1
  Rookie. If an affiliate folds or leaves, this forces a re-affiliation
  event for the parent: poach another club's affiliate, or convert/adopt
  a nearby unaffiliated club.
- **"Unaffiliated club" is now a fully-designed concept, not just
  named** — see `independent-league.md` (future, speculative, not in the
  game at launch). That doc formalizes exactly this pool: independent,
  precarious, semi-pro clubs that can occasionally get adopted as
  instant affiliates, same mechanic described here, given real texture.
- Good material for the generic conditions + probabilities + effects
  Scripted Event framework already in the main design doc — no new
  framework needed, just a new event category.

## Naming Tone

- Mixed, deliberately. Minor league names can range from grounded (matching
  the majors' "local items" style) to gloriously absurd (Rocket City Trash
  Pandas / Montgomery Biscuits energy). Majors stay grounded; minors can get
  weird — matches real-world MiLB culture.

## Open Questions

- Exact "relatively close" threshold for AAA (miles, same division, same
  region — not yet defined numerically) — the requirement itself is
  confirmed above, the specific distance isn't.
- Total minor-league market count still TBD — depends on running the
  step-down phase of the population algorithm for real, now needing to
  cover 200 affiliated markets instead of 150 given the Rookie tier
  addition.
