# Rookie League — v0.4

*A fourth minor league tier, below A, added specifically to give the
organization real developmental depth for the youngest signees — HS
draftees who sign directly and international draftees — rather than
throwing them straight into full-season ball. Resolves an open question
flagged in the Player Pathway doc: exactly which level a fresh signee
starts at.*

## Structure

- Every MLB1/MLB2 club gets exactly **1 Rookie-level affiliate**, joining
  AAA/AA/A as a 4th mandatory tier (Minor League System doc — update
  "every club must have 1 affiliate per level" to include Rookie; total
  affiliated clubs becomes 50 × 4 = 200, up from 150).
- **Four regional leagues, not one national league**: Florida, Texas,
  Arizona, Southern California. Mirrors real MLB's Spring Training
  Grapefruit/Cactus League geography, extended to two additional hubs
  given this project's larger scale (50 clubs vs. real MLB's 30). Keeps
  travel minimal — clubs only play others in their own region.
- Which of the 50 clubs gets assigned to which regional hub isn't
  resolved here — a real follow-up task, likely tied loosely to each
  club's actual home-market geography, not evenly split (50 doesn't
  divide cleanly across 4 regions).

## Who Plays Here

- **HS draftees who sign directly** (bypass college) — per the Player
  Pathway doc, HS seniors are created at 17-18; Rookie ball is the
  natural, realistic entry point for this group rather than full-season
  A-ball. **Worth being explicit: this is a subset of HS draftees, not
  most of them.** Consistent with real baseball, many drafted 17-18
  year olds choose college instead of signing — especially when a
  strong D1 offer or above-slot signing-bonus leverage is in play,
  exactly the dynamic the draft-and-follow and NIL mechanics (Player
  Pathway doc) already model. Rookie ball's population is specifically
  the ones who *did* choose to sign, not the full pool of that age
  group.
- **International draftees**, signed via the international draft +
  Signing Day mechanic (Season Calendar doc) — same logic, youngest and
  least polished entry point. Since international players don't have the
  same college-vs-sign dynamic pulling as many away, this group likely
  makes up a proportionally larger share of Rookie rosters than the HS
  group does.
- **Marginal college draftees** — a third source, alongside HS and
  international signees. A college player who wasn't drafted highly or
  developed enough to warrant starting at A-ball or higher can also land
  in Rookie ball, despite being noticeably older than the HS/international
  entrants. This is *why* the age/service caps below needed revising — a
  college senior signing at 21-22 would blow past a tight cap before even
  playing a game.
- **Not** typically *polished* college draftees — strong college
  performers realistically start at A or higher, consistent with how
  real baseball handles this. Rookie ball is for the youngest AND the
  least-proven entrants regardless of age, not strictly an "under-21"
  tier.

## Hard Age & Service Caps

Confirmed as genuinely hard limits, not soft guidance — this is
deliberately a brief, early stage, not a long-term parking spot.
**Revised from an initial 20/2-season draft to 24/3 seasons**, once
marginal college draftees (above) were added as a legitimate entry
population — a 21-22 year old college senior signee needs real room
before hitting either cap, which the original tighter numbers didn't
allow for:

- **Age cap: 24.** A player must be promoted out of Rookie ball or
  released by the time he turns 24.
- **Service cap: 3 seasons.** Whichever limit hits first (age or
  service) triggers mandatory promotion to A-ball or release into free
  agency.
- These players are explicitly **marginal pros** — a long shot at ever
  reaching higher levels, let alone MLB. Consistent with the "most
  players simply have lower ceilings" population-level philosophy
  already established in Player Attributes & Development doc. Rookie
  ball is where that reality is most visible — most of this tier's
  players will never advance past it.

## Season Length: Short, Late Start, Early Finish

- Real-world precedent: actual MLB complex-level Rookie leagues (Florida
  Complex League, Arizona Complex League) run roughly June through
  August — much shorter than full-season A/AA/AAA, and structurally
  different, not just proportionally shorter.
- **Starts after the domestic draft (early June, Season Calendar doc)** —
  a natural, non-arbitrary reason for the late start: newly drafted HS
  players need to sign and report before the season can begin.
- **Ends well before the majors' season** — roughly matching real complex
  league timing (into August). Exact game count and dates not yet set,
  but the shape (short, late, early-finishing) is confirmed.

## Full Sim, Same as AAA/AA/A

Rookie ball joins the "basic sim" tier already established for AAA/AA/A
(Minor League System doc) — real games, box scores, stats, injuries,
progression — rather than being abstracted like college or international
academies. This matters directly for the stated motivation: if Rookie
ball is going to serve as genuine organizational depth for injury
replacement and call-up cascades, it needs real tracked performance data
like every other simulated level, not just an abstraction.

- **Extends the call-up cascade one level further**: Rookie → A → AA →
  AAA → MLB, completing the full chain already established in the
  Injuries doc (which previously started at AAA→MLB, cascading down
  through AA and A).

## MLB-Level Tournament Participation: Most Likely Not

Resolved. Rookie-level players don't realistically participate in the
Cup, League Playoffs, or any other MLB-scale system — not because of a
hard rule carved out to exclude them, but because it would take a
genuinely extreme injury crisis for the call-up cascade to actually
stretch that far in a single season, pulling a Rookie-level player all
the way up to fill an active 50/52-man MLB spot. The cascade mechanic
above makes this *possible* in principle without needing a special-case
rule to prevent it — it's just naturally rare enough that it shouldn't
be expected as a normal pathway.

## Spring Training Stadium Sharing

**Confirmed, mirrors real life directly**: clubs use their Rookie
affiliate's home stadium during Spring Training — the same facility
serves both purposes, rather than requiring a separate spring-only
complex. Real-world precedent: actual Spring Training complexes in
Florida and Arizona already double as Complex League home fields today.

- Financial Model tie-in: this means Spring Training facility costs are
  effectively folded into the Rookie affiliate's stadium upkeep
  (Financial Model: Expenses doc), rather than being a separate line —
  a genuine cost efficiency, not just flavor.
- Stadiums doc tie-in: Rookie-level stadiums are a new, much
  smaller-scale category than anything else in that doc so far — not
  subject to the MLB tier-minimum capacity requirements, similar to how
  AAA/AA/A affiliates already have no capacity requirement.

## Naming (flavor, not resolved here)

The four regional leagues need names in the spirit of "Grapefruit
League"/"Cactus League." A few directions worth considering, not
decided: something citrus-themed for Florida, desert-themed for Arizona,
and comparable regional flavor for Texas and Southern California. Left
open for a dedicated naming pass.

## Open Questions

- Exact assignment of the 50 clubs across the 4 regional hubs — not
  resolved, a real follow-up task.
- Exact season length (game count) and start/end dates — shape confirmed
  (short, late-starting, early-finishing), numbers not set.
- Regional league names — flavor task, not resolved here.
- Whether a smaller-than-"every HS draftee" population (per the college
  clarification above) means Rookie rosters run thinner than AAA/AA/A, or
  whether international signees fill the gap enough to keep roster sizes
  comparable — not yet worked out.
