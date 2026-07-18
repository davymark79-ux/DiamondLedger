# CBA Negotiation — v0.4

*Design for the process that's been referenced constantly throughout this
project — "CBA-negotiable," "the simplified negotiation model" — but
never actually specced as its own system. Explicitly connects to the
Commissioner Interface doc's distinction between a safe natural-language
shortcut and a genuinely ambitious open-ended LLM negotiation — resolved
below as closer to the former than the latter, once bounded to a known
parameter catalogue. v0.3 adds a full Ratification system (both sides
must independently vote to approve a tentative deal), which also resolves
the strike/lockout trigger condition that was previously the biggest gap.*

## The CBA as a Living Document

Governs the whole league/sim — every term tagged "CBA-negotiable"
across every doc in this project (salary floor, luxury tax threshold/
rate, roster sizes, IL duration, option years, Rule 5 eligibility timing,
DFA resolution window, service time thresholds, arbitration rules, and
more) lives under one agreement at any given time.

- **Real duration**: anywhere from 1 season and up, negotiated as part of
  the agreement itself — not a fixed term length.
- **Expiration timing, confirmed**: lands in the offseason, **7 days
  after the League Playoffs conclude** (refining the earlier placeholder
  "X days after Finals" language from the Season Calendar doc with a
  concrete number).
- **Both sides must agree** to sign a new agreement — a real negotiation
  with a real possibility of failure (see Strike/Lockout Risk below), not
  a formality.

## Negotiation Format: Freeform AI-Mediated Negotiation

**Confirmed as genuinely open-ended, not menu-driven.** An LLM plays the
players' side — analyzing the current state of the league (existing CBA
terms, financial landscape, competitive balance, real signals like
salary floor compliance patterns or luxury tax circumvention) and
formulating realistic demands and positions. The commissioner (the
player) represents the owners'/league side — can proactively propose
changes or react to the union's demands. Genuine back-and-forth, not a
fixed decision tree.

- **Selective scope, not exhaustive**: not every CBA-tagged term gets
  relitigated every cycle. Terms both sides are satisfied with simply
  carry over unchanged. The actual negotiation focuses on whatever either
  side is actually contesting.
- **Variable intensity by design**: some cycles are "status quo or status
  quo adjacent" — quick, largely unchanged renewals. Others are "larger
  scope" — real fights over many terms at once. This should emerge from
  real in-game context (a persistently low salary floor against
  skyrocketing revenue gives the union's LLM persona genuine grounds to
  push hard that cycle) rather than being arbitrarily randomized.

## Ratification

Once the commissioner and union LLM reach a tentative agreement, it isn't
automatically binding — **both owners and players independently vote to
ratify it**, matching how real CBA ratification actually works (union
membership votes separately from ownership approval; both have to pass).

### Deal Favorability Score

The tentative agreement gets scored on a symmetric scale, 0-100, where
**50 = perfectly balanced** and deviation in either direction reflects
how favorable the overall package leans toward owners or players (e.g.
"55/45 in favor of ownership"). Generated as part of the negotiation's
conclusion — the same union LLM (or a neutral analysis layer) quantifying
where the deal actually landed relative to balanced.

### Individual Voter Thresholds

Each voter — every player, every club's ownership — has their own
personal tolerance for how unfavorable a deal they'll actually accept,
compared against the single Deal Favorability Score:

```
player votes YES if deal_score >= player's_minimum_acceptable_player_share
owner votes YES if deal_score <= owner's_maximum_acceptable_player_share
```

- **Players**: threshold generated per player, with some baseline
  randomness, plus a **confirmed systematic factor: career stage /
  service time.** Younger, less-experienced players skew toward a
  **lower threshold** — more willing to accept a less-favorable deal,
  consistent with having less leverage and less immediately at stake.
  Veteran players closer to free agency skew toward a **higher
  threshold** — real leverage and real earnings on the line, more
  demanding of favorable terms. Resolves what was previously flagged as
  a future refinement.
- **Owners**: threshold generated per club, influenced by two confirmed
  factors:
  - **Owner Wealth** (Financial Model: Expenses doc) — a wealthy owner
    can absorb a player-friendly deal more easily and tolerates more of
    one than a financially stretched owner worried about the salary
    floor and luxury tax bite.
  - **League identity** (League Structure doc) — **Exchange owners skew
    toward a stricter, less-tolerant threshold**, consistent with their
    established Gilded Age, mercenary, money-focused identity; **Foundry
    owners skew more lenient**, consistent with their working-class,
    fan-friendly identity. This effect should be **strongest specifically
    on financial terms** (salary floor, luxury tax, revenue splits) and
    comparatively weaker on non-financial provisions (roster sizes, IL
    duration, and similar) — money is where the two leagues' identities
    actually diverge, not everything equally.
  - Both factors combine with the baseline per-owner randomness rather
    than replacing it — flavor and tendency, not a deterministic outcome.
- **Fan-owned clubs** (League Structure doc) are a genuine special case
  worth flagging: their single "owner vote" in the league-wide
  ratification is itself the outcome of an internal shareholder mini-vote
  under their own 51%+ democratic structure — nested governance, not
  designed in full detail here, but a natural and thematically consistent
  extension of what's already established for those clubs.

### Worked Example (Christopher's)

A tentative deal scores 55/45 in favor of ownership. Player A won't
accept below 50% for players and votes no; Players B and C will accept
45%+ and vote yes. Among that sample, the deal ratifies 2-1. The same
mechanism runs independently on the ownership side.

### Ratification Requirement

**Majority support required independently from both sides** — over 50%
of players AND over 50% of owners — for the deal to actually take effect.
Either side failing sends the agreement back to negotiation, not
automatically to a work stoppage (see Strike/Lockout Risk below for what
actually escalates things).

## Strike/Lockout Risk

**Trigger condition, resolved**: a strike or lockout is now concretely
triggered by **ratification failure that persists past the CBA's
expiration deadline** — not a vague "negotiations feel stuck" state.
Negotiations can fail ratification and simply resume (parties adjust
terms and try again) as long as time remains; it's specifically running
out of runway *while* still failing to secure both-sides ratification
that escalates into an actual labor stoppage.

- What a strike or lockout actually *does* to the game — presumably
  delays or shortens the season, mirroring the real 2022 MLB lockout's
  effect on Spring Training and Opening Day, but this still needs its
  own mechanic — the trigger is resolved, the consequence isn't yet.

## Honest Scope Note — Revised

**Walking back the earlier framing.** This was originally flagged as the
"ambitious, not launch-scoped" category from the Commissioner Interface
doc — the same bucket as fully unbounded rule rewriting. The bounded-
catalogue resolution above changes that: because every negotiated
outcome maps onto an already-defined parameter, this is genuinely closer
to an elaborate, multi-turn version of the safe natural-language
shortcut than to open-ended game-state rewriting. Still a real technical
lift — a live LLM playing a contextually-grounded union negotiator across
a genuine back-and-forth is more involved than a single command lookup —
but it's a scoping and conversational-design problem now, not a "can the
game even do this safely" problem.

## Scope: Bounded to a Known Catalogue, Not Unbounded Rule Invention

**Resolved — this is the key design decision that makes the whole system
buildable rather than a technical risk.** The negotiation only ever
resolves to adjusting values *within* the already-established catalogue
of CBA-negotiable terms below — never inventing a genuinely new category
of rule that doesn't already have a slot in the game's data model. Every
term in that catalogue is already something the game engine knows how to
use; the negotiation just determines what value it takes.

This directly solves the practical concern that prompted this section:
if a negotiated outcome always maps onto a term the code already
understands, **the game never needs a code change as a result of a
deal** — every possible negotiated outcome already has somewhere to plug
in. The system stays freeform on the *input* side — "I want the league
to take a larger portion of TV money" is natural language, not a menu
selection — while the *output* space stays bounded to parameters the
code already handles. This is genuinely closer to the Commissioner
Interface doc's safe "natural-language shortcut" category than the risky
"unbounded rule rewriting" one — an elaborate, multi-turn negotiation
experience built on top of a bounded parameter space, not a departure
from it.

### Master Catalogue of CBA-Negotiable Terms (compiled from across this project)

**Roster & Player Movement** (Commissioner Vision, Player Movement docs)
- 26-man active roster size, 50-man total roster size, 28-man late-season
  expansion
- Taxi Squad designation count
- Option year count, and the 20-day/5-assignment option thresholds
- Rule 5 Draft eligibility timing (4-season/5-season split by signing age)
- DFA resolution window (currently 7 days)
- Outright assignment refusal thresholds (3-year+previously-outrighted;
  5-year unconditional)
- 10-and-5 rights thresholds (10 years total service, 5 consecutive with
  one club)

**Service Time & Compensation** (Player Movement doc)
- Service time year length (172 days)
- Arbitration eligibility start (3 years)
- Super Two cutoff (top 22% of the 2-3 year service bucket)
- Free agency threshold (6 years)
- Minor league free agency timing (~6-7 years, unaffiliated)
- Minimum salary
- Service-time-manipulation countermeasures (automatic ROY-finisher
  service credit, draft-pick compensation for early promotion) — both
  active by default, per the earlier resolution, but still adjustable

**Financial** (Financial Model: Expenses/Revenue docs)
- Salary floor amount
- Luxury tax threshold and rate
- Local Media Rights revenue-sharing split (currently 48% shared / 52%
  kept) — real MLB precedent for this being CBA territory specifically
- Signing bonus structure/pools — likely CBA-relevant, not yet fully
  specced (Player Pathway doc's draft mechanics)

**Injuries** (Injuries doc)
- IL duration structure (10-day / 60-day tiers)

This list is accurate as of this doc's writing but not guaranteed
exhaustive — any future doc that tags something "CBA-negotiable" should
get added here too, so this stays the single authoritative catalogue
rather than the scattered tags it grew from.

## Open Questions

- Strike/lockout gameplay consequence — trigger is now resolved (see
  above), but what it actually does to the season still needs its own
  mechanic.
- Exact threshold-generation formulas for both player and owner
  ratification votes — the systematic tendencies are now confirmed
  (career-stage for players, Owner Wealth + League identity for owners),
  but real magnitudes/weights aren't specced yet.
- Fan-owned clubs' internal ratification mini-vote — flagged as a natural
  extension, not designed in detail.
- How the union LLM's demands get grounded in actual game state (what
  data it's fed, how "realistic" pressure gets generated) — conceptually
  described, not a real technical design yet.
- Whether the commissioner can also proactively open negotiation on a
  specific term outside the normal expiration cycle, or only at the
  scheduled renewal point — not addressed.
- Relationship to the "natural-language shortcut" system (Commissioner
  Interface doc) — likely a separate, more elaborate interface than the
  quick command-routing tool, not the same feature reused.
