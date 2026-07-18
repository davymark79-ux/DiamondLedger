# Stadiums — v0.5

*Fills in the stadium-build mechanic referenced in the main design doc's
Financial Model, and in the `stadium_capacity_factor` already sitting in
the Financial Model: Revenue formula. Also feeds Financial Model: Expenses
(upkeep) and the Scripted Event System's "new stadium builds" category.*

## Core Attributes

- **Capacity** — sets the gate revenue *ceiling*. This is the
  `stadium_capacity_factor` already referenced in the Financial Model:
  Revenue doc's gate revenue formula.
- **Luxury boxes** — a distinct, discrete count separate from general
  quality tier, since tournament hosting eligibility (below) needs a
  concrete number, not an abstract tier.
- **Quality / amenity tier** — separate from capacity, drives revenue
  *per attendee* (concessions, sponsorship potential, general amenities
  beyond luxury boxes specifically). Mirrors real stadium economics — a
  newer, smaller, revenue-optimized ballpark can out-earn an older, bigger
  one.
- **Age** — quality/amenity tier decays gradually as a stadium ages,
  creating natural long-term pressure toward eventual renovation or
  replacement rather than stadiums staying static forever.
- **Roof type** — open air, fixed dome, or retractable. Determines weather
  exposure (see the Weather doc): open air gets full weather effects and
  real rainout risk, fixed domes get none ever, retractable roofs close
  ahead of bad weather and essentially never get rained out.

## Minimum Capacity Requirements by Tier

- **MLB1 requires a higher minimum stadium capacity than MLB2.** Exact
  numbers TBD/placeholder — needs real figures.
- **Minor league affiliates have no capacity requirement at all** —
  exclusively a majors-tier concern. Note: this isn't because minors are
  unsimulated (they are, per the Minor League System doc's v0.2 update —
  they're simulated, per the Minor League System doc's "basic sim" scope
  — same as the majors) — it's simply that MiLB-scale parks don't
  need MLB-caliber infrastructure to function.

### Grace Period & Compliance Deadline (resolved)

Modeled directly on real-world English football's ground-grading system
(Premier League/EFL), which turns out to be a useful precedent: promotion
is never blocked by an under-spec stadium. Instead, promotion happens
immediately, and the club has a **hard compliance deadline** to bring the
stadium up to its new tier's standard — real examples include the FA's
"March 31 of the following season" deadline for lower divisions, and the
Premier League's 3-year clock for all-seater conversion (with time in
either division counting toward it).

- **Recommended deadline: by Opening Day of the club's second season in
  the new tier** — one full season of grace, then compliance is required.
  Placeholder, adjustable.
- The required work runs on the existing Construction Timer (see
  Construction & Renovation below) using the same financing options
  (public funding, debt, ownership cash).
- **Resolved: missing the deadline triggers automatic relegation.**
  Distinct from real-world precedent (which doesn't force relegation for
  this) — a deliberate, harsher consequence here. Interacts with the
  standard standings-based relegation rule (League Structure doc: last
  place in each MLB1 league goes down) via a swap mechanic:
  - **If the non-compliant club is different from the club that would
    already be relegated by standings, the standings-based club is
    saved** — the non-compliant club relegates in its place instead.
    Still just one relegation per league in the normal case, just
    potentially a different team than standings alone would have
    produced.
  - **If the non-compliant club and the standings-last-place club happen
    to be the same team, nothing changes** — they relegate either way.
  - **The only way two clubs relegate from the same league in one season
    is if two separate clubs are simultaneously non-compliant** — both
    get auto-relegated for infractions. This is the sole path to
    exceeding the normal one-relegation-per-league count.
  - Thematically fitting given the trigger case: the non-compliant club
    is almost always a recently-promoted club that earned its way up
    through standings but wasn't ready infrastructure-wise — "good
    enough to get there" and "ready to stay there" are genuinely
    different things here.

## Tournament Hosting Requirements

Hosting In-Season Tournament (Cup) games and WBC-style international
tournament games requires meeting **separate, higher thresholds** than a
club's baseline tier-minimum capacity — both a minimum capacity **and** a
minimum luxury box count, distinct from just being MLB1. Not every MLB1
stadium automatically qualifies to host.

- **Tiered by event significance** — Cup group-stage hosting (a single
  weekend, per the In-Season Tournament doc) has a lower threshold; Cup
  Final and WBC hosting (paired with the All-Star host city) require
  meaningfully more of both capacity and luxury boxes.
- Gives well-resourced clubs a real reason to invest in a stadium beyond
  the bare tier-minimum — hosting duties become an achievable,
  stadium-driven goal in their own right.
- Exact numeric thresholds for both tiers — deferred, needs real figures
  alongside the tier-minimum capacity numbers above.

## Construction & Renovation

- New builds or major renovations take multiple seasons via a
  **construction timer** (already noted as existing in the main design
  doc, duration not yet specified — placeholder needed, see Open
  Questions).
- **Tier Compliance Upgrade — a distinct, typically smaller expense.**
  When a promoted club needs to meet its new tier's standards but doesn't
  need a full capacity expansion (broadcast camera positions, media
  areas, floodlighting, VAR infrastructure, similar to the real Luton
  Town example — roughly £10m in the real world, mostly non-capacity
  work), this should be its own smaller line item rather than folded into
  a full stadium construction project. Distinguishing traits:
  - Typically **cheaper** than a capacity expansion or new build.
  - Typically **faster** — plausibly a single-season project rather than
    the multi-season construction timer a capacity expansion needs, since
    it's technology/infrastructure work rather than physical expansion.
  - Still uses the same three financing sources below (public funding,
    debt, ownership cash).
  - If a club's shortfall includes *both* capacity and infrastructure
    (the more demanding case), the two can run as separate projects with
    separate costs/timelines rather than one bundled mega-project.
- **Financing is a real choice**, not flavor, and can be a **mix of three
  sources**:
  - **Public/municipal funding** — a club's municipality can fund part or
    all of a stadium project. Represented as a percentage of total project
    cost covered publicly (0-100%), reducing the club's own debt/cash
    burden proportionally. Real-world dynamic worth capturing as a future
    hook: public funding is often politically contested, and teams
    sometimes use relocation threats specifically to extract it — good
    material for the Scripted Event System once that gets built out
    further (not designed here, just flagged).
  - **Debt** — ongoing debt-service expense added to the club's books
    (Financial Model: Expenses).
  - **Ownership cash** — an immediate lump-sum draw from the owner-wealth
    pool, no ongoing debt, but a big one-time hit.
- **Two trigger paths**:
  - **Proactive** — commissioner/ownership greenlights a project directly.
  - **Reactive** — an aging, low-quality stadium raises the probability of
    a scripted "ownership wants a new stadium" event, feeding the existing
    Scripted Event System category from the main design doc.

## Market Size Relationship

No hard rule connecting capacity to market size. Market size is the
*primary* driver of sustainable attendance, but not the *only* one —
**Team Reputation** (from the Team Reputation, Rivalries & Media doc) is a
real secondary lever. A small market with a sufficiently deep, "cult
following"-level fanbase can justify and sustain a larger stadium than
market size alone would suggest — the real-world phenomenon of a college
town supporting a 100,000+-seat stadium is the reference point here.
Recommend letting stadium size remain an emergent outcome of market size
*and* reputation together, rather than an artificial cap tied to market
size alone. This reinforces the original no-hard-cap recommendation, now
with an explicit second mechanism (Reputation) explaining how a small
market can credibly support a bigger building.

## Ties to Other Systems

- **Gate revenue** (Financial Model: Revenue) — capacity sets the ceiling,
  quality/amenity tier modifies revenue-per-attendee.
- **Stadium upkeep** (Financial Model: Expenses) — ongoing cost, likely
  scaling with capacity, quality, and age (bigger and older stadiums cost
  more to maintain).
- **Cup hosting** (In-Season Tournament doc) — capacity and quality likely
  factor into a club's suitability as a group-stage host, and eventually
  as an All-Star/Cup Final host city.
- **Scripted Event System** — new stadium builds directly, and by
  extension relocation/bankruptcy risk if a club can't afford needed
  upkeep or a renovation it's fallen behind on.

## Open Questions

- Exact capacity/quality/age/luxury-box numeric ranges and decay rate —
  deferred, needs real tuning against a working sim, same as everything
  else.
- Exact tier-minimum capacity numbers (MLB1 vs. MLB2) and tournament
  hosting thresholds (Cup group-stage vs. Cup Final/WBC) — all deferred,
  need real figures.
- Tier Compliance Upgrade cost figures and timeline (single season
  assumed) — placeholder, needs real numbers.
- Debt financing mechanics — interest rate, repayment timeline — not yet
  detailed.
- Public funding mechanics — how the percentage gets determined, and the
  political/relocation-leverage dynamic — flagged as a future Scripted
  Event hook, not designed here.
- Construction timer length — placeholder needed (2-3 seasons?), not yet
  set.
- Relationship between stadium quality and RSN/marketing effectiveness
  (Team Reputation, Rivalries & Media doc) — not yet explored, flagged as
  a natural future connection.
