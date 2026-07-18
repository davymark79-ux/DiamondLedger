# Team Reputation, Rivalries & Media — v0.2

*Ties directly into Financial Model: Revenue — both mechanics here feed
back into gate and local media revenue as additional modifiers. Explains
something pure market size can't: why two teams in identical markets with
identical records can generate very different money.*

## Team Reputation

Persistent, club-level, distinct from Tournament Quotient. Two tracked
values:

- **Current reputation** — drifts toward a performance-implied target,
  but very slowly. Much slower smoothing than the Tournament Quotient's
  season-to-season Elo movement — reputation is a lifetime thing, not a
  form-based thing.
- **Peak reputation** — the all-time high a club has ever reached. Creates
  a **floor**: current reputation resists dropping below
  `peak_reputation × floor_retention_factor` (placeholder: 70%), except
  through a much slower "erosion" process that only kicks in after
  genuinely extreme, sustained failure — not just a handful of bad
  seasons.

This combination produces the Red Sox pattern directly: decades of losing
don't erase a fanbase built over generations, but it's not literally
permanent either — sustained-enough failure would eventually erode even
the floor, just very slowly.

## Rivalries

**Resolved: rivalry intensity has two distinct parts with different
permanence, not one uniform value.** This directly matches Christopher's
distinction between "natural" rivals (Yankees-Red Sox, Yankees-Dodgers —
no fan of one is ever becoming a fan of the other, even if day-to-day
intensity cools) and earned, circumstantial rivals (Yankees-Astros, born
from recent high-stakes meetings, genuinely capable of fading if not
renewed).

```
rivalry_intensity(A, B) = geographic_floor(A, B) + earned_component(A, B)
```

- **`geographic_floor`** — set once, permanently, from geographic/
  divisional seeding (same metro or same division). **Never decays.**
  This is the mechanical home for "natural" rivalries — the floor a
  Yankees-Red Sox-style pairing can never drop below, regardless of how
  quiet things get on the field.
- **`earned_component`** — accumulates from Cup knockout meetings and
  League Playoff series between the same two clubs, weighted by stakes
  (a Cup Final meeting matters far more than a regular season series,
  same as before). **This part decays over time** if the two clubs stop
  meeting in high-stakes contexts — the mechanical home for
  circumstantial rivalries like Yankees-Astros, which can genuinely cool
  and fade if not renewed by continued high-stakes meetings.
- Reuses a pattern already established twice elsewhere in this project
  rather than inventing a new one — the same "decay toward a floor, not
  to zero" shape already used for Team Reputation's peak-retention
  mechanic and the Tournament Quotient's seasonal decay. Consistent
  family of mechanics, not a one-off.
- A pair with no geographic seeding and no recent high-stakes history
  (most pairs) simply sits near zero on both terms — exactly as before,
  unaffected by this split.

## Revenue Tie-In

Both mechanics feed back into Financial Model: Revenue as additional
modifiers:

- **`reputation_modifier`** — applied to both gate revenue and local media
  revenue. A beloved team draws and sells merchandise regardless of
  current performance (the "NY hats regardless of record" example).
- **`rivalry_modifier`** — applied specifically to gate revenue (and
  likely local media) for games between the two rival clubs specifically.

Corresponding update needed in `financial-model-revenue.md`: both
`gate_revenue` and `local_media_revenue` formulas gain a
`reputation_modifier` term; `gate_revenue` additionally gains a
matchup-specific `rivalry_modifier` term when the opponent is a
recognized rival.

## Broadcast / Media Structure

Three tiers, mostly narrative layered on top of the existing revenue
streams rather than a fully simulated broadcast-scheduling system:

1. **Standard local/regional broadcast** — default for most games, tied
   to the existing Local Media Rights revenue stream, no separate mechanic
   needed.
2. **RSN (Regional Sports Network)** — an enhanced local media tier a club
   can invest in, likely market-size-gated and similar in shape to the
   stadium-build "construction timer" mechanic from the main design doc.
   Once established, boosts the local media revenue multiplier above the
   standard deal.
3. **National network** — at least one fictional national broadcaster in
   this universe (needs a name — flavor task, not designed here). A small
   number of marquee games per period get selected for national broadcast,
   weighted by rivalry intensity + team reputation + Tournament Quotient
   (quality). Recommend keeping this mostly narrative — strong League Wire
   feed material ("tonight's game airs nationally thanks to the budding
   rivalry") — with at most a small direct revenue bonus for featured
   clubs, rather than a fully simulated scheduling system.

## Open Questions

- All numeric placeholders (reputation smoothing rate, floor retention
  factor, rivalry growth increments, earned-component decay rate, both
  modifier magnitudes) — deferred to real tuning, consistent with the
  rest of this project.
- RSN establishment mechanic — market-size threshold, cost, construction
  timer — not yet detailed, likely mirrors the stadium-build pattern.
- National network name(s), and RSN naming per club — flavor/naming task,
  deferred.
- Exact selection algorithm for national broadcast games — deferred,
  currently just "weighted by rivalry + reputation + quality," not a real
  formula yet.
