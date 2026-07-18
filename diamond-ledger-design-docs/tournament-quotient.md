# Tournament Quotient — v0.3

*A bounded Elo-style rating. Persistent forever, moves after every game a
club plays, decays gently over time, never resets. Feeds the Cup's initial
pot seeding (see In-Season Tournament doc).*

**Confirmed structure — four distinct weight tiers, increasing:** regular
season < Cup group stage < Cup knockout < League Playoffs. "Tournament"
refers to the Cup as a whole (split into its own two sub-tiers, group vs.
knockout); "League Playoffs" is now fully specced in its own doc
(4 teams per league, 3 rounds). This doc's K_context table already
reserves a slot for it.

## Range & Starting Value

- **Bounds:** 20.00 (floor) – 100.00 (ceiling), hard-clamped.
- **Center:** 60.00 (the actual midpoint of the range — used as both the
  decay target and the default for brand-new/expansion clubs with no
  history yet).

## Core Update — Bounded Elo

After every game (regular season, Cup group stage, or Cup knockout), both
teams' Quotients update:

```
Expected(self) = 1 / (1 + 10^((R_opponent − R_self) / S))
ΔR = K_context × (Actual − Expected)
R_new = clamp(R_old + ΔR, 20.00, 100.00)
```

- `Actual` = 1 for a win, 0 for a loss.
- `S` = scale constant controlling how much a given rating gap affects win
  probability. Placeholder: **S = 120** (an 80-point gap — the widest
  possible, 20 vs. 100 — implies roughly an 82% single-game win probability
  for the favorite, not a near-lock, which matches baseball's inherent
  single-game unpredictability). Needs playtesting/tuning once there's an
  actual sim to validate against.
- This is what naturally produces "beating good teams matters more than
  beating bad teams" — no separate bonus logic needed, it falls out of the
  Expected term automatically. A win against a heavy favorite yields a big
  ΔR; a win against a huge underdog yields almost nothing; a loss to a huge
  underdog costs a lot.

## Context Weight (K_context)

This is where "regular season < tournament group stage < tournament
knockout < league playoffs" lives — everything else about the formula is
identical across contexts, only the K value changes:

| Context | K_context (placeholder) |
|---|---|
| Regular season | 0.4 |
| Cup group stage | 0.7 |
| Cup knockout | 1.1 |
| League Playoffs | 1.6 |

Placeholder values only — real numbers need tuning against simulated
seasons, same as the plate-appearance engine itself. The ratio between them
matters more than the absolute numbers right now. League Playoffs sits
highest since it's the closest thing to "proving it against your own tier,
when it matters most" — consistent with real-world postseason performance
typically being weighted heaviest in similar rating systems.

## No Cross-Tier Modifier

The formula never references tier (MLB1/MLB2/future tiers) at all — only
`R_self` and `R_opponent`. A high-Quotient MLB2 club playing a low-Quotient
MLB1 club is scored exactly the same as any other matchup with that rating
gap. Tier is emergent from the ratings, never injected into them.

## Decay

Applied once, at the start of each new season (before Opening Day), to
every club regardless of activity:

```
R_adjusted = 60.00 + (R_old − 60.00) × (1 − decay_rate)
```

Placeholder: **decay_rate = 0.05** (5% pull back toward center per season).
This is a gentle regression-to-mean, not a reset — a club's rating never
snaps back to 60, it just drifts a little closer each season if nothing
else moves it. Combined with the per-game updates during the new season,
this keeps the Quotient "persistent forever" while still reflecting recent
form more than ancient history.

## New / Expansion Clubs

Start at the **floor value, 20.00** — not the center. An expansion club has
no track record and is presumptively weak; starting it at center (60.00)
would mean established clubs get an artificially inflated reward for
beating what's likely to be a bad team early on. Starting at the floor
means there's nowhere to go but up, and the Expected-score term correctly
predicts blowout losses against good clubs as the default, non-punishing
outcome. No tier-based starting adjustment either, consistent with the
no-cross-tier-modifier rule above — a new MLB1 club and a new MLB2 club
both start at 20.00.

One interaction worth noting, though not really a concern: the seasonal
decay pulls every club toward center regardless of games played, so a new
club sitting at the floor drifts upward slightly each offseason even before
it's played a game the following year. With 162+ regular-season games plus
12+ tournament games per season, though, real per-game Elo movement swamps
that 5% nudge almost immediately — a club that's actually bad will fall
right back toward the floor within its first few weeks of play. No special
threshold/exemption needed.

## Open Questions

- League Playoffs is now fully specced (League Playoffs doc). Its
  K_context = 1.6 here is still just a placeholder value, unrelated to
  the format itself now being settled.
- `S` (scale constant) and all four `K_context` values are placeholders —
  need real tuning once there's a working sim to validate rating movement
  against actual simulated outcomes.
