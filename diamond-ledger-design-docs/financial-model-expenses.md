# Financial Model: Expenses — v0.9

*The "money out" side, per Christopher's framing that revenue determines
expenses. Builds on Financial Model: Revenue and the two-knob model
(market size / owner wealth) from the main design doc.*

## Player Payroll

- Every player contract is **majors, minors, or both** — a contract can
  span both (e.g. a guaranteed major-league deal that survives an option
  to the minors). Ties to the 50-man/26-man roster structure from the
  Commissioner Vision & Roster Rules doc and the AAA/AA/A minor league
  system.
- **No salary cap.**
- **Salary floor** — a minimum total payroll requirement. **Confirmed
  flat across all clubs to start**, not market-size-scaled. Deliberate
  design rationale: a flat floor is what prevents a small-market club from
  simply banking revenue-share money regardless of on-field product — the
  real-world pattern this is meant to guard against (a team that generates
  real revenue but chronically underspends on payroll, profiting
  regardless of wins or losses). Subject to change via CBA negotiation in
  future contracts, but flat is the starting rule. This is also worth
  treating as a deliberate source of small-market financial pressure in
  its own right — it feeds directly into the existing bankruptcy/
  relocation Scripted Event category, the same dramatic tension the
  Financial Model was already designed to create.
  **Scope confirmed narrow, deliberately:** the floor covers player
  payroll only — it does not, and shouldn't, extend to front-office
  spending like scouting (Scouts doc). The floor exists to guarantee
  players, the people actually generating on-field value, get paid — not
  to mandate broad organizational investment. Underspending on scouting
  or other front-office roles is a legitimate strategic choice with real
  competitive consequences, not something the CBA needs to protect
  against.
- **Luxury tax** applies above a threshold — mirrors real MLB's
  Competitive Balance Tax: an overage penalty, not a hard cap.
- Floor amount, luxury tax threshold, and tax rate/brackets are all
  **CBA-negotiable** — extends the growing list from the Commissioner
  Vision doc (now: minimum salary, arbitration, free agency timelines,
  luxury tax threshold/rate, roster size limits, and salary floor).

## Owner Wealth Funding

Confirms the mechanical role of the existing owner-wealth knob from the
main design doc: wealthy owners/ownership groups can inject supplemental
funding beyond what market-size-driven revenue supports, letting a club
spend beyond its organic means.

**Cost mechanism, resolved: the luxury tax applies to any money spent on
salary, regardless of source.** No separate treatment for owner-funded
vs. revenue-funded payroll, and no additional debt-service-style penalty
layered on top — the existing luxury tax mechanism already does the job.
The "cost" of using owner wealth isn't a new bolt-on system; it's simply
that spending more naturally raises the risk of crossing the luxury tax
threshold, the same as spending more from any other source would.

**Foundry League fan-owned clubs use a different, capped version of this
knob** — see the League Structure doc's Bundesliga 50+1 model. Outside
investment is limited to a combined 49% stake rather than one owner's
effectively unlimited personal wealth, giving these clubs real but
structurally lower-ceiling capital access than a traditionally-owned
club.

## NIL

College players receive NIL compensation instead of a team salary, per
the Player Pathway doc. **Resolved:** NIL is mostly funded by outside
sources (boosters/school NIL collectives), entirely outside the
majors/minors financial system — this remains the default case and isn't
a team expense.

**However, a major league club can optionally fund a player's NIL
directly.** The clear use case: a club holds draft rights to a player
(rights persist through his whole college career, per the Player Pathway
doc) but doesn't currently have a system roster spot to spare. Rather than
being forced into a premature sign-or-release decision, the club can pay
the player's NIL instead of a minor-league salary — keeping him developing
in college (still getting the benefit of that school's prestige/specialty
development modifier) while the club waits for a roster opening, with a
real path into the system once one exists.

- **When a club funds NIL directly, it becomes a real team expense** —
  distinct from the default booster-funded case, which never touches team
  finances at all.
- **Resolved: mostly used on already-drafted players (the clear primary
  case above), but sometimes as a pre-draft relationship-building tool**
  with a not-yet-drafted prospect. This is a real, deliberate investment
  now — see the Player Relationships & Affinity doc, where club-funded
  NIL is a direct, mechanically-meaningful input to a prospect's future
  Org Affinity, not just a flavor gesture.

## Signing Bonuses

A distinct one-time expense, tied to the (still unspecced) regular and
international draft systems — paid at the moment of signing, separate
from ongoing salary. Full structure deferred to the future draft-mechanics
design pass.

## Other Team Expenses

- **Stadium upkeep** — ongoing operational cost, distinct from the
  one-time construction cost already established in the main design doc's
  stadium-build mechanic.
- **Tier compliance upgrade** — a distinct, typically smaller one-time
  cost triggered by promotion into a tier whose infrastructure standards
  (broadcast facilities, floodlighting, VAR tech, etc., not necessarily
  capacity) a club doesn't yet meet. Cheaper and faster than a full
  capacity expansion. See the Stadiums doc's Grace Period & Compliance
  Deadline and Tier Compliance Upgrade sections for the full mechanic.
- **Expansion/relocation costs** — ties to the Scripted Event System's
  expansion petitions and bankruptcy/relocation event categories.
- **Front office salaries** — non-player payroll (GM, coaches, etc.). Now
  has real mechanical detail for two categories specifically: scouts
  (Scouts doc — quality and specialization are a genuine hiring decision,
  not a background number) and managers (Managers doc). Rest of the
  front office not yet detailed further.
- **Marketing** — possible future tie-in worth flagging: marketing spend
  could plausibly nudge a club's Reputation target or short-term
  attendance (see Team Reputation, Rivalries & Media doc). Not designed
  now, just noting the natural connection.
- **Minor league affiliate subsidy** — already established in the Minor
  League System doc as an expense on the parent club's side (revenue on
  the affiliate's side).

## Open Questions

- Club-funded NIL: drafted players only, or usable pre-draft too? Assumed
  drafted-only (see NIL above).
- Signing bonus amounts/structure — deferred to the future draft-mechanics
  pass.
- Front office salary and marketing spend — named categories only, not
  yet detailed.
- All CBA-negotiable numeric thresholds (floor amount, luxury tax
  threshold/rate) — placeholders, deferred to real tuning against an
  actual simulated season, consistent with every other numeric constant
  in this project.
