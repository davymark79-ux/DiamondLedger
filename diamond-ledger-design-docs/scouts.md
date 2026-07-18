# Scouts — v0.4

*Resolves the deferred "Scouted-potential error/confidence mechanic" open
question from Player Attributes & Development doc. Also gives the
Financial Model: Expenses doc's "front office salaries" line its first
real mechanical meaning. Follows the same generated-NPC pattern already
established for Managers and the Writers Corps.*

## Origin: Ex-Player vs. Outsider

Same pattern as Managers — a weighted roll at generation — but weighted
differently: modern scouting has real room for analytics/non-playing
backgrounds in a way managing traditionally hasn't, so scouts should lean
more toward outsiders than managers do. Exact split still a placeholder,
same as the manager origin ratio.

## Specialization

Two independent dimensions, not one generic "scouting skill":

- **Primary assignment** (categorical): **HS**, **College**,
  **International**, or **Pro-Advance** (evaluating already-professional
  players — MiLB call-up readiness, trade targets, even a club's own
  roster). Determines where a scout is actually deployed.
- **Hitting Evaluation** and **Pitching Evaluation** — two separate skill
  ratings (20-80), since a scout can have a strong eye for bats and a
  mediocre one for arms, or vice versa. Both matter regardless of primary
  assignment (an HS scout still needs to evaluate both hitters and
  pitchers within his assigned age group).
- Future extension, not designed now: **International** scouts could
  eventually specialize further by region/country (a Latin America
  specialist vs. a Japan specialist), mirroring real scouting department
  structure and the existing Nationality doc's country list. Flagged as a
  natural fit for whenever the international academy system gets built
  out further, not needed yet.

## The Mechanism: How Scouting Accuracy Actually Works

This is what resolves the deferred item from Player Attributes &
Development doc. Instead of a single generic error term applied
uniformly to every prospect's Scouted Potential, **the specific scout(s)
covering a given player determine that player's evaluation accuracy**:

- A strong scout with a good specialization match (e.g. a College scout
  with high Hitting Evaluation, assigned to a college position player)
  produces a tight, accurate Scouted Potential — closer to the hidden
  True Potential value.
- A mismatched or weak scout (a Pro-Advance specialist glancing at an HS
  pitcher, or a low-rated evaluator in general) produces a noisier,
  less reliable read.
- This gives real organizational weight to how a team builds its
  scouting department — a club that's invested well in International
  scouting should have a genuine evaluation edge on international
  prospects specifically, not just a flat best-effort guess applied
  league-wide.
- Ties directly to the "mild optimism bias" idea flagged in Player
  Attributes & Development doc's ceiling-distribution discussion —
  individual scouts could eventually carry their own bias tendency (some
  notoriously optimistic on prospects, some more skeptical), which would
  be a natural, low-cost extension of this system later. Not designed now
  — the core accuracy mechanism above doesn't require it to function.

## Team Hiring & Labor Market

- Teams hire scouts specifically for needed specializations — a club
  already strong on the pitching pipeline might deliberately seek out a
  high-Hitting-Evaluation scout to balance its department, rather than
  just accumulating scouts generically.
- Gives the Financial Model: Expenses doc's "front office salaries" line
  its first real mechanical meaning — scouting quality is something a
  club actually pays for, and a deliberate hiring decision, not a
  background number.
- Same lifecycle pattern as Managers: age tracked, soft-probability
  retirement window (same shape as Managers/Writers Corps, not a hard
  cutoff), can be fired, and can be rehired elsewhere — majors or minors —
  creating the same kind of labor-market career ladder already
  established for managers.

## Use Cases

- **Draft evaluation** — HS/college/international prospects pre-draft,
  ties to the Player Pathway doc's draft mechanics.
- **Call-up readiness** — evaluating MiLB players for MLB readiness, ties
  to the Injuries doc's call-up cascade mechanic and general roster
  management.
- **Roster/trade evaluation** — Pro-Advance scouting assessing other
  teams' players as potential trade targets, or a club's own roster for
  lineup/rotation decisions.

## Per-Team Divergent Scouting (confirmed consequence, not a bug)

Because Scouted Potential is generated *per team* — each club's own
scouts evaluate independently — **the same real player can carry
meaningfully different Scouted Potential values on different teams'
draft boards.** This isn't teams disagreeing on strategy; it's teams
genuinely having different information, because their scouts have
different skill/specialization match to that specific player. Two clubs
can both "need" a certain profile and still reach opposite conclusions
on whether a given prospect fills it — one signs eagerly, one passes —
purely from differing scouting reads, even though the player's hidden
True Potential is identical either way. This is the direct, intended
mechanism behind real-world scouting misses and steals, and it should
produce genuine draft-day storylines (a team's whole draft board is built
from its *own* noisy information, not a shared league-wide truth).

## Underfunded Scouting Departments (resolved: no floor, and shouldn't be one)

Scouting spend is front-office payroll — it sits **entirely outside the
salary floor**, which only covers player payroll (Financial Model:
Expenses doc). **Confirmed as intentional, not a gap to close:** the
salary floor exists specifically to guarantee players — the people
actually generating on-field value — get paid, not to mandate a baseline
level of organizational investment generally. A club skimping on
scouting is a real strategic choice with real competitive consequences
("it's their loss, generally"), not something the CBA needs to protect
against the way it protects player compensation.

- A financially constrained or simply cheap club can leave a
  specialization entirely unfilled (no dedicated HS scout, for instance)
  or fill it with only a low-quality, low-cost evaluator — and that's a
  legitimate, if risky, organizational strategy rather than a problem.
- **Confirmed handling for the unfilled case — "bettor's guide" fallback,
  not a hard block.** A club without a dedicated scout in some category
  still drafts there — no lockout — but gets only a generic, public-level
  read, like a racetrack bettor's guide: real information (the horse's
  record, the trainer's stats), but shallow and undifferentiated, not
  proprietary analysis. Roughly "sports magazine" quality — the same
  baseline coverage any team without real scouting there would see.
  Crucially, this isn't just *less accurate* in a generic sense — it also
  **doesn't reflect the specific club's own organizational needs or
  analytical priorities** the way a real scout would. A real scout
  evaluates talent through the lens of what that specific organization
  values; the fallback is the same undifferentiated read every
  scoutless team gets, lacking both the skill *and* the team-specific
  fit a dedicated scout brings.
- This is another real lever — beyond payroll itself — through which
  ownership philosophy and financial health translate into on-field and
  roster-building outcomes, consistent with the Financial Model's broader
  theme that these choices should have real competitive consequences, not
  just flavor text. Underinvesting here is a genuine, sometimes-rational
  tradeoff, not something that needs a rule against it.

## Open Questions

- Exact origin-split percentage (ex-player vs. outsider) — placeholder,
  likely lower ex-player share than Managers, not yet numeric.
- Number of scouts per team / department size — not yet specced, likely a
  moderate roster of complementary specializations rather than a single
  scout per team.
- Individual scout bias tendency (optimist vs. skeptic) — flagged as a
  natural future extension, not required for the core mechanism to work.
- International regional sub-specialization — flagged as a future
  extension, not needed until the international academy system is built
  out further.
- Exact formula converting scout skill + specialization match into
  Scouted Potential error magnitude — structurally described above, not
  yet a real formula. Needs tuning against a working sim, same as
  everything else in this project.
