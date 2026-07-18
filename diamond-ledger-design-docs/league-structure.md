# League Structure — Market Allocation & Team Roster (v0.8)

*Feeds the design doc's League Structure section. Uses 2020 Census Metropolitan
Statistical Area (MSA) populations as "market size" — see Assumptions below.
v0.2 update: split multi-core metros into their constituent cities (see
"Splitting Multi-City Metros" below) — market allocation and tier/division
placement are unchanged from v0.1, only city identity changed.
v0.3 update: leagues named — The Foundry League (fka "AL") and The Exchange
League (fka "NL") — with distinct ownership culture and rules (see
"League Identities" below). Decision locked in: this league keeps the
every-market-gets-2-teams outcome from v0.1 as a deliberate design choice —
it gives the league office a built-in reason to run expansion drives every
few seasons to spread into new markets.*

## Design decision: every market is a two-team market (locked in)

There are exactly 25 U.S. metro areas above 2.5 million people (2020 census),
and you need exactly 50 teams (30 + 20). Every one of those 25 qualifies for
a second team under the ">1.25M supports up to 2 teams" rule, and that alone
fills all 50 slots — before the algorithm ever reaches the 1.25M–2.5M band or
the 50k step-down. Splitting metros into two cities doesn't change this: it's
still the same 25 markets, just with more specific identities.

This is now a deliberate feature, not just a mechanical outcome: it means
markets like Milwaukee, Cincinnati, Cleveland, Kansas City, Pittsburgh,
Columbus, Indianapolis, Nashville, and Las Vegas start with zero teams —
which gives the league office an actual in-world reason to periodically vote
on expansion (see the design doc's Scripted Event System → "Ownership groups
petitioning for expansion"). Every few seasons, growth pressure should push
the league into a fresh, currently-uncovered market rather than just adding
more teams to markets that already have two. Worth remembering when the
expansion-petition event logic gets built: it should weight toward
currently-absent markets specifically, not just "next biggest available
city," to keep that spreading-out dynamic alive.

## League Identities: The Foundry League & The Exchange League

The two leagues (previously "AL"/"NL" placeholders) are now named. This
isn't just branding — it's a real divergence in ownership culture and style
of play, which should eventually surface in the sim engine and financial
model:

**The Foundry League** — working-class roots, old-school. Several clubs are
fan-owned rather than held by a single owner (a genuine third ownership
archetype alongside the Financial Model's market-size/owner-wealth axes —
see open question below). No DH: pitchers hit. Style of play leans
small-ball, "manufacture runs" — situational hitting, baserunning, defense.

**The Exchange League** — Gilded Age money, mercenary. Rich, often
flashy ownership groups; the league that actually stresses the "owner
wealth" knob in the Financial Model. Uses a DH. Style of play leans
analytics-driven, power/OBP-first, big free-agent contracts.

Which specific teams sit in which league doesn't matter yet — team
histories can be retrofitted later to justify why a given club ended up
Foundry or Exchange. For now, league labels below just map 1:1 from the old
placeholders: AL → Foundry, NL → Exchange.

## Scheduling: No Interleague Play (confirmed)

**Regular season games are single-league only** — Foundry clubs play
Foundry clubs, Exchange clubs play Exchange clubs, never each other.
This is a new, explicit confirmation, not previously stated anywhere.
Direct consequences already flagged elsewhere, now made consistent:

- **League-specific awards** (MVP, Best Pitcher, Gold Glove, Silver
  Slugger, and now Rookie of the Year and Manager of the Year — Awards &
  Hall of Fame doc) make sense precisely because there's no shared
  cross-league regular-season competition to evaluate players against
  uniformly.
- **Cross-league play only happens in the Cup and the Finals** — the
  Cup's group stage already mixes MLB1/MLB2 without regard to league (10
  groups of 3 MLB1 + 2 MLB2 each, no league constraint on grouping), so
  Foundry and Exchange clubs *do* face each other there. League Playoffs
  stays strictly separate-bracket-until-Finals (League Playoffs doc),
  consistent with this.

## Splitting Multi-City Metros

Many of the 25 qualifying MSAs are named for more than one city (e.g.
"Dallas–Fort Worth–Arlington"). Where a second city in that name has a real,
distinct identity of its own — its own downtown, history, and culture, not
just a suburb — I split the metro's two franchises across both cities instead
of stacking them both on the primary city name. Where the metro's secondary
names are really just suburbs without a strong separate identity, both teams
stay in the primary city (same pattern as real MLB's Yankees/Mets,
Cubs/White Sox, Dodgers/Angels).

**Split (13 markets):** New York/Newark, Los Angeles/Anaheim, Dallas/Fort
Worth, Washington D.C./Alexandria, Philadelphia/Camden, Miami/Fort
Lauderdale, Boston/Cambridge, San Francisco/Oakland, Riverside/San
Bernardino, Seattle/Tacoma, Minneapolis/St. Paul, Tampa/St. Petersburg,
Portland/Vancouver (WA)

**Not split (12 markets — no strong second core):** Chicago, Houston,
Atlanta, Phoenix, Detroit, San Diego, Denver, Baltimore, St. Louis, Orlando,
Charlotte, San Antonio

League assignment for split pairs: **confirmed mixed, not a rigid
convention** — 6 of the 13 pairs flip which city gets Foundry vs.
Exchange, chosen where it made thematic sense (a city's actual
character fitting one league's identity better than the other). See the
Full 50-Team Roster table below for the final assignment, and the
Resolved section for which pairs flipped and why.

## Assumptions (carried over from v0.1)

- "City" = Metropolitan Statistical Area (MSA) population, not city-proper.
- Population source: U.S. Census Bureau 2020 Census-enumerated MSA
  populations (April 1, 2020).
- Tier seeding (MLB1 vs. MLB2): top 15 markets by population → MLB1, bottom
  10 → MLB2, per league. A metro's two teams (whether split or same-city)
  start in the same tier.
- Divisions are an illustrative season-one starting point, not an optimized
  geography solve — subject to your per-season reshuffle mechanic. Split
  cities within a metro are geographically adjacent, so they stay in the
  same division as each other.

## Full 50-Team Roster

### MLB1 (top 15 markets by population → 30 teams)

| Division | Market | League | Nickname |
|---|---|---|---|
| Atlantic | New York | Exchange | Gothams |
| Atlantic | Newark, NJ | Foundry | Ironbound |
| Atlantic | Boston | Foundry | Cod |
| Atlantic | Cambridge, MA | Exchange | Scholars |
| Atlantic | Philadelphia | Foundry | Bellringers |
| Atlantic | Camden, NJ | Exchange | Ironworks |
| Atlantic | Washington, D.C. | Foundry | Statesmen |
| Atlantic | Alexandria, VA | Exchange | Torpedoes |
| Atlantic | Miami | Exchange | Flamingos |
| Atlantic | Fort Lauderdale | Foundry | Canals |
| Heartland | Chicago | Foundry | Stockyards |
| Heartland | Chicago | Exchange | Winds |
| Heartland | Detroit | Foundry | Assembly |
| Heartland | Detroit | Exchange | Rivets |
| Heartland | Atlanta | Foundry | Terminus |
| Heartland | Atlanta | Exchange | Peaches |
| Heartland | Houston | Foundry | Roughnecks |
| Heartland | Houston | Exchange | Bayou |
| Heartland | Dallas | Exchange | Wildcatters |
| Heartland | Fort Worth | Foundry | Drovers |
| Pacific | Los Angeles | Foundry | Reels |
| Pacific | Anaheim | Exchange | Groves |
| Pacific | San Francisco | Exchange | Cable Cars |
| Pacific | Oakland | Foundry | Longshoremen |
| Pacific | Riverside | Exchange | Orange Blossoms |
| Pacific | San Bernardino | Foundry | Freight |
| Pacific | Phoenix | Foundry | Saguaros |
| Pacific | Phoenix | Exchange | Monsoons |
| Pacific | Seattle | Exchange | Evergreens |
| Pacific | Tacoma | Foundry | Glassblowers |

### MLB2 (bottom 10 markets by population → 20 teams)

| Division | Market | League | Nickname |
|---|---|---|---|
| Frontier | Denver | Foundry | Prospectors |
| Frontier | Denver | Exchange | Foothills |
| Frontier | San Diego | Foundry | Zookeepers |
| Frontier | San Diego | Exchange | Kelp |
| Frontier | San Antonio | Foundry | Riverwalk |
| Frontier | San Antonio | Exchange | Ramparts |
| Frontier | Portland, OR | Foundry | Roses |
| Frontier | Vancouver, WA | Exchange | Garrison |
| Frontier | St. Louis | Foundry | Gateway |
| Frontier | St. Louis | Exchange | Levee |
| Coastal | Baltimore | Foundry | Crabbers |
| Coastal | Baltimore | Exchange | Clippers |
| Coastal | Tampa | Foundry | Cigars |
| Coastal | St. Petersburg | Exchange | Sponge Divers |
| Coastal | Orlando | Foundry | Citrus |
| Coastal | Orlando | Exchange | Springs |
| Coastal | Charlotte | Foundry | Mills |
| Coastal | Charlotte | Exchange | Crown |
| Coastal | Minneapolis | Foundry | Millwrights |
| Coastal | St. Paul | Exchange | Bluffs |

## Promotion/Relegation Pairing (unchanged from v0.1)

Last place in Foundry-MLB1 ↔ first place in Foundry-MLB2 (same league, cross-tier).
Last place in Exchange-MLB1 ↔ first place in Exchange-MLB2. A team's league (Foundry/Exchange)
never changes; only its tier does.

**Exception, confirmed in the Stadiums doc**: a club that misses its
stadium compliance deadline is automatically relegated, potentially
overriding which team fills the relegation slot (a swap mechanic, not an
additional relegation, in the normal case — see Stadiums doc's Grace
Period & Compliance Deadline section for the full rule).

## Resolved

- ✅ Every market gets 2 teams — kept deliberately, feeds the expansion-drive
  mechanic (see design decision callout above).
- ✅ Division names (Atlantic/Heartland/Pacific/Frontier/Coastal) — locked in.
- ✅ League names — The Foundry League and The Exchange League, with distinct
  ownership culture, DH rule, and style of play (see League Identities above).
- ✅ Nicknames — approved as-is.

## Fan-Owned Clubs (Foundry League) — Bundesliga 50+1 Model

Resolved — modeled directly on the real Bundesliga's 50+1 rule, which
solves exactly the tension this doc originally flagged: how does a
fan-owned club access outside capital without losing what makes it
fan-owned?

- **Shares, not a single owner.** Fans literally purchase shares of the
  club. Voting rights are proportional to ownership stake — a genuine
  shareholder democracy, not a figurehead "fan council" with no real
  power.
- **51% rule**: the collective fan/member shareholder base must always
  hold at least 51% of total shares — guaranteeing fans retain
  ultimate control no matter how much outside money comes in.
- **Outside investors can hold up to 49%** — real capital
  access for the club, structurally incapable of ever tipping into
  outside control. This is what replaces the standard single-owner
  "owner wealth" dial (Financial Model: Expenses doc) for these clubs:
  a capped, diffuse capital-injection mechanic instead of one
  individual's effectively unlimited personal wealth. Fan-owned clubs
  should have a **lower ceiling** on supplemental capital than a
  billionaire-owned club, as a direct structural consequence — not a
  penalty, just what the model actually implies.
- **Refined: the 51% fan floor is a minimum, not a target — a club can
  run anywhere from 51% to fully 100% fan-owned.** Taking on any of that
  available 0-49% outside investment is **the club's own choice, not a
  requirement** — though it may become practically necessary at higher
  competitive levels, where pure member capital alone might not keep
  pace with what it costs to compete. A genuine strategic tension: full
  democratic purity vs. real financial firepower, not a free lunch
  either way.
- **Fan-owned clubs are not exempt from the league's standard financial
  framework.** Revenue sharing (Financial Model: Revenue doc) and
  CBA-governed terms apply the same way they do to any other club —
  fan ownership changes who controls the club, not what rules the club
  operates under.
- **Profit allocation — dividends vs. reinvestment — is itself a
  shareholder governance decision**, not a fixed rule. Falls under the
  same "roughly democratic, ownership-level decisions" scope described
  above: the collective shareholder vote decides whether to pay out
  profit to fan/owners or reinvest it into payroll and infrastructure,
  season to season, same as any other major club decision under this
  model.
- **Scope of "roughly democratic"**: applies to ownership-level
  decisions — budget philosophy, executive hiring, reacting to
  ownership-tier Scripted Events — not day-to-day baseball operations,
  which still run through a normal front office/GM structure regardless
  of ownership type.
- **Natural relocation resistance, falls out of the model for free**: a
  fan-owned club's shareholders are overwhelmingly local fans who would
  have to vote to relocate their own club out of their own city — a
  scenario that essentially never happens under real fan-ownership
  models. This directly answers part of the original open question
  (relocation immunity) without needing a separate special-case rule —
  it's just what majority-local-shareholder voting naturally produces.

## Open Questions Carried Forward

- **DH rule per league** — Foundry: pitchers hit. Exchange: DH. This is a
  real branch in the plate-appearance engine's logic, not just flavor text —
  worth carrying into the Sim Engine section of the main design doc as a
  build note before that engine gets built.
- **Resolved: split-pair League assignment is now genuinely mixed, not a
  rigid primary-city-always-Foundry pattern.** 6 of the 13 split pairs
  flipped (New York/Newark, Dallas/Fort Worth, Miami/Fort Lauderdale,
  San Francisco/Oakland, Riverside/San Bernardino, Seattle/Tacoma), the
  other 7 kept their original assignment — see the Full 50-Team Roster
  table above for the current, final assignment. Where a flip happened,
  it leaned into which city in the pair actually fits which league's
  identity better (e.g. Oakland's working-class port-city character fits
  Foundry more than San Francisco's tech-money identity does) rather
  than being arbitrary.
- Which specific teams/histories end up Foundry vs. Exchange is still open —
  noted as retrofit-able later, doesn't block anything right now.
