# Player Movement: Trades, Waivers, Options, DFA, Rule 5 — v0.4

*Covers all 50-man-roster-related player movement — trades, waivers,
options, DFA, Rule 5, plus service time/free agency, outright refusal
rights, minor league free agency, rehab assignments, and 10-and-5 rights.
Builds directly on the Commissioner Vision & Roster Rules doc's 50-man/
26-man structure (updated from an earlier 40-man draft specifically to
support the Taxi Squad concept — see that doc), and applies uniformly to
both MLB1 and MLB2 — no tier-based modifiers, consistent with the "no
artificial cross-tier modifiers" principle already established for
Tournament Quotient. Scope note up front: these mechanics all concern
*50-man-roster* movement specifically — purely internal reassignment
within a club's own affiliate chain (AAA↔AA↔A) doesn't require any of
this, it's already covered as an unrestricted internal decision by the
Injuries doc's call-up cascade mechanic. Note: the standard option rules
below (20-day threshold, 5-assignment cap) don't apply to Taxi Squad
designations, which use a separate, single season-long option instead —
see Commissioner Vision doc.*

## Trades

- Any two clubs can agree to exchange player contracts/rights, draft
  picks, international bonus pool space, and cash considerations.
- **No salary matching required** — there's no salary cap to reconcile
  against (Financial Model: Expenses doc), unlike sports with hard caps.
- **Single trade deadline**, mirroring real MLB's modern simplified
  structure (post-2019, no more complex August waiver-trade period).
  Exact calendar placement not yet set — needs to land sensibly relative
  to the Cup's group-stage start (right after the All-Star break) so
  clubs know their buy/sell posture before Cup roster construction.
  Flagged as dependent on full season-calendar design, which hasn't
  happened yet.
- Post-trade medical review — see its own section below, now resolved
  rather than left as a flag.

## Waivers

Used when a club wants to remove a player from the 50-man roster to
outright assign him to the minors (once out of options — see below) or
as part of resolving a DFA (see below).

- **Priority order: reverse combined standings**, worst record first —
  spanning **both MLB1 and MLB2 together**, no tier-based priority
  adjustment. Consistent with the Tournament Quotient doc's established
  principle: pure ranking, no artificial cross-tier modifier.
- If claimed, the claiming club immediately assumes the player's
  contract/rights. If unclaimed, the original club proceeds with its
  intended move (outright assignment to the minors, release, etc.).

## Service Time & Free Agency

The backbone of contract economics — ported directly from real MLB
structure, subject to CBA per Christopher.

- **Service time accrues in 172-day years** — a player earns a day of
  service for each day on the active roster or MLB injured list; 172 days
  in a season equals one full year (mirrors the real ~187-day season with
  built-in slack).
- **Free agency at 6 years** of accrued service time.
- **Arbitration eligibility starts at 3 years**, running through the 6th
  year — a player negotiates/arbitrates salary rather than playing for
  a fixed minimum.
- **Super Two**: each year, the top 22% of players (by service time)
  who ended the prior season with **2-3 years of service and at least 86
  days that season** get a 4th year of arbitration eligibility despite not
  yet reaching 3 full years. Worth keeping exactly as real MLB does it —
  it's what makes the "call him up a couple weeks late" strategy below
  actually rational.
- **Non-tender**: a controllable pre-free-agency player must be tendered
  a contract by a set deadline or becomes an immediate free agent
  ("non-tendered").

### Service Time Manipulation (expected emergent behavior, not a bug)

Real MLB has a well-documented pattern: clubs delay a MLB-ready prospect's
call-up by a couple weeks specifically to gain an extra year of team
control before free agency (the Kris Bryant/Cubs case is the famous real
example). This should be **expected to emerge naturally here too**, once
service time is a real mechanic — not something to specifically prevent,
but worth having real countermeasures available via CBA, matching what
real MLB actually added in response:
- Automatic full-year service credit for the **top 2 Rookie of the Year
  finishers** in each league, regardless of actual days accrued.
- **Draft-pick compensation** for a club that promotes a top prospect to
  its Opening Day roster and he later finishes highly in ROY/MVP/Best
  Pitcher voting.
- **Resolved: both active by default from day one.** These are genuinely
  real, currently-active provisions in the actual MLB CBA (added in the
  2022 reforms responding to service-time manipulation cases like Kris
  Bryant's) — "match real life" means starting with them switched on,
  not dormant. Still fully **CBA-negotiable** going forward, same as
  every other numeric/rule threshold in this project — a future in-game
  CBA could weaken, strengthen, or remove them, exactly like real MLB's
  terms can shift between agreements.

## Outright Assignment Refusal Rights

A nuance on the Waivers section above — not every player can simply be
sent down once he clears waivers:

- Players with **3+ years of service** (or Super Two status) **who have
  been outrighted once before** can refuse a second or later outright
  assignment and elect free agency instead.
- Players with **5+ years of service** can refuse **any** outright
  assignment to the minors, electing free agency instead — a broader
  right than the 3-year version above.
- Released players become free agents immediately regardless of service
  time, obviously.

## Minor League Free Agency

Distinct from Rule 5 — Rule 5 is about *other teams drafting* an
unprotected player; this is about a player *walking on his own*. A minor
leaguer who accumulates enough minor-league service time **without ever
being added to a 50-man roster** becomes a free agent independent of his
organization. Approximate real-world figure is around 6-7 years, though
this is a less certain recollection than the MLB-side numbers above —
flagged for verification, and CBA-adjustable regardless per Christopher's
framing.

## Injury Rehab Assignments

Connects the Injuries doc and the Minor League System doc directly: a
player on the MLB injured list can be sent to a minor-league affiliate
for live game reps before officially activating, rather than sitting idle
until fully healthy.

- **Position players: up to 20 days. Pitchers: up to 30 days.** Real MLB
  splits, worth keeping exactly as-is.
- **Does not use an option** — a rehab assignment is a distinct mechanism
  from a normal optional assignment.

## 10-and-5 Rights

Full no-trade protection, earned **automatically** rather than
individually negotiated — a player with **10 years of total MLB service,
the last 5 consecutive years with the same club**, cannot be traded
without his consent. Distinct from an individually-negotiated no-trade
clause (which this doc treats as optional/deferred flavor, per the
Trades section above) — this is a foundational, CBA-guaranteed veteran
protection worth having as the default rather than something a player
has to negotiate for.

## Options — corrected

- Players get a defined number of **option years** (recommend **3**,
  matching real MLB) usable early in a career — during an optioned
  season, a player can move freely between the 50-man/active roster and
  the minors without clearing waivers.
- **Corrected from an earlier draft: an option year is only burned if
  total time on optional assignment exceeds 20 days in that season.** A
  player optioned and recalled quickly (a brief look, sent back down)
  within that 20-day window preserves the option year — matches the real
  rule exactly, and gives clubs meaningful flexibility for short looks
  without cost.
- **Separate cap: a player can be optioned a maximum of 5 times in a
  single season**, regardless of the 20-day rule above — a distinct limit
  from the career option-year count.
- Once a player is out of options, moving him to the minors requires
  passing through waivers first, same as any other 50-man removal
  (subject to the refusal rights above).

## DFA (Designated for Assignment)

- Immediately removes a player from the 50-man roster, freeing the spot,
  while the club has a defined resolution window — recommend **7 days**,
  matching real MLB — to trade him, release him, or (if he clears
  waivers) outright assign him to the minors.
- If claimed on waivers during that window, the claiming club assumes his
  contract.
- Common uses: emergency 50-man space (adding a new signee, making a
  call-up), or a step toward removing a player from the organization
  entirely.

## Rule 5 Draft

Protects against roster-hoarding — a separate, later-stage draft from the
initial entry draft(s) already specced in the Player Pathway doc, held
in the offseason.

- If a club doesn't add a minor leaguer to its 50-man roster within a
  defined number of minor-league seasons, other clubs can draft him.
  Recommend porting real MLB's age-based split directly: **4 seasons if
  signed at 19 or older, 5 seasons if signed younger** — since the
  underlying logic (give younger signees more developmental runway before
  exposure) applies just as well here.
- **The drafting club must keep him on the active 26-man MLB roster for
  the entire following season** — he cannot be optioned to the minors —
  or must offer him back to his original club. This is the mechanism's
  whole point: it prevents an organization from burying a good prospect
  indefinitely behind a deep depth chart, and gives other clubs a real
  way to acquire players stuck in that position. Worth porting exactly,
  not simplifying — the "must stick or get offered back" tension is what
  makes it work.

## CBA Tie-In

Extends the growing CBA-negotiable list from the Commissioner Vision doc:
**option year count and the 20-day/5-assignment thresholds**, **Rule 5
eligibility timing** (4/5-season split), **DFA resolution window**
(currently 7 days), **service time thresholds** (172-day year, 3-year
arbitration start, Super Two's 22% cutoff, 6-year free agency),
**outright refusal thresholds** (3-year+outrighted, 5-year unconditional),
**minor league free agency timing**, and **10-and-5 rights thresholds**
should all join minimum salary, salary floor, luxury tax threshold/rate,
and roster size limits as terms the CBA negotiation system can move over
time. This is now most of the economic skeleton of the sport — sensible,
given it's also most of what real MLB's actual CBA negotiations fight
over.

## Post-Trade Medical Review (resolved: reuses existing data)

No new subsystem needed — reuses the Durability/Injury Proneness
attribute that already exists (Player Attributes & Development doc).
At the moment a trade is agreed, roll a small probability (placeholder:
5-10%) that the review surfaces a real issue, weighted so lower-Durability
players trigger it more often, since that attribute already represents a
player's real injury risk profile. If triggered, the trade either falls
through entirely or gets renegotiated (cash or a lesser piece added to
compensate) — both realistic outcomes for an actual failed physical.

## Open Questions

- Exact trade deadline placement on the season calendar — deferred,
  depends on full season-calendar design.
- Minor league free agency timing — approximate real-world figure (~6-7
  years) flagged as a less certain recollection than the MLB-side
  numbers, worth verifying, though CBA-adjustable regardless.
- Post-trade medical review trigger probability — placeholder, needs
  tuning.
- All numeric defaults above are ported directly from real MLB as
  sensible starting points — flag if any should diverge for this
  universe's scale.
