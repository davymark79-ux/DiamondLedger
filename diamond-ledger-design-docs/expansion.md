# League Expansion — v0.1

*Pacing and process for adding new teams over time. Builds on League
Structure's market algorithm (the unused step-down phase, later
repurposed for the Minor League System's market pool, now also the
source of expansion candidate markets), the "every market gets 2 teams"
design decision (explicitly built to create expansion pressure), and the
Commissioner Interface doc's decision-point framework.*

## Cadence: Frequent Early, Rare Later — Organically, Not by Fiat

Christopher's instinct, and the right one: expansion should happen more
often early in the game's history and taper off as the league matures.
**The primary driver should be organic, not an artificial decay curve
layered on top:** the pool of genuinely good remaining markets shrinks
over time as good candidates get taken, which naturally self-limits
expansion frequency without needing arbitrary pacing rules — consistent
with this project's general preference for mechanics that fall out of
real structure rather than being imposed.

- **Market pool**: candidate markets draw from the same population data
  already established in the League Structure doc — the step-down phase
  below the original 25 metros' threshold, already repurposed once for
  the Minor League System's market pool. A market can plausibly serve
  both purposes over a league's history: a city that starts as a
  Minor League-only market could later "graduate" to MLB expansion team
  status once it's economically ready, mirroring how some real MLB
  cities were minor-league-only markets earlier in real history. Exact
  coordination logic between "reserved for a minor league affiliate" and
  "eligible for MLB expansion" isn't resolved here — flagged as needing
  real design work.
- **Modest pacing throttle on top**, not instead of the organic driver:
  even if multiple markets are simultaneously eligible, capping expansion
  at roughly 1-2 approvals per some window (a season or two) prevents
  unrealistic clustering — several new teams appearing in a single
  offseason would feel wrong regardless of whether the underlying market
  math permits it.

## Decision Process

Expansion petitions are a **decision-point event**, per the Commissioner
Interface doc — an ownership group petitions for a market, the
commissioner rules (Approve / Deny / Request more information). This
already fits the existing Scripted Event System's "ownership groups
petitioning for expansion" category from the main design doc — no new
framework needed, just routing it through the decision-point pattern.

## Where New Teams Enter

**Recommended default: expansion teams start in MLB2**, not MLB1. Matches
real-world sports precedent (expansion teams rarely leap straight into a
top division) and fits this project's promotion/relegation system
thematically — a new club earns its way to MLB1 over time rather than
being handed top-tier status on arrival. League (Foundry/Exchange) and
division assignment plug into existing systems (League Structure doc) —
no new mechanic needed, just applying what's already there to a new
entrant.

## Open Questions

- Exact coordination between minor-league-reserved markets and
  MLB-expansion-eligible markets — flagged above, not resolved.
- Exact pacing numbers (how many seasons between expansion waves, early
  vs. late game) — placeholder shape confirmed (frequent early, rare
  late), no real numbers yet.
- Whether an expansion team's league (Foundry/Exchange) assignment is
  arbitrary, market-driven, or ownership-group-driven — not decided.
- How this interacts with the still-undesigned Independent League doc's
  "popular indy team becomes an affiliate" pathway, if at all — likely
  orthogonal (that's about *affiliate* status, this is about MLB
  expansion), but worth a sanity check once both systems are closer to
  real implementation.
