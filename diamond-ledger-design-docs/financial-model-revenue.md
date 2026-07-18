# Financial Model: Revenue — v0.6

*Revenue-first, per Christopher: money in determines money out (contracts,
luxury tax, and the rest of the expense side) — this doc covers only
revenue. Expenses, payroll caps, and luxury tax mechanics are a separate,
later pass. Builds on the original design doc's two-knob model (market
size as a soft cap, owner wealth as a temporary override) — this doc is
what "market size" actually cashes out to in dollar terms. Gate and local
media revenue now also incorporate reputation and rivalry modifiers — see
`team-reputation-rivalries-and-media.md`.*

## Four Revenue Streams

Each stream behaves differently with respect to market size — that
difference is where the interesting competitive-balance tension lives.

### 1. Gate Revenue
Scales with market size, stadium capacity, and team performance. The most
performance-sensitive stream — a winning team in a big city packs the
park; a bad team in a small city doesn't.
```
gate_revenue = market_size_factor × stadium_capacity_factor
             × performance_modifier × reputation_modifier
             × rivalry_modifier × base_gate_rate
```
- Ties directly to the existing stadium-build mechanic (capacity tied to a
  construction timer, from the main design doc's Financial Model section).
- Ties to the Cup's group-stage hosting bonus already flagged in the
  In-Season Tournament doc — a host club's home gets real extra gate
  revenue for the weekend (all 5 group teams' fans in town).
- `performance_modifier` — recommend basing on recent win% and/or
  Tournament Quotient rather than raw standings position, so it responds
  smoothly rather than jumping at arbitrary thresholds.
- `reputation_modifier` and `rivalry_modifier` — added per the Team
  Reputation, Rivalries & Media doc. Reputation reflects lifetime fan
  loyalty independent of current performance (the "cult following" effect
  — a bad team with deep history still draws); rivalry is matchup-specific,
  applying only when the opponent is a recognized rival.

### 2. Local Media Rights — now with real-world revenue sharing built in
Scales with market size **more aggressively than gate revenue does** —
this is realistically where big markets separate from small ones the
most. A modest performance kicker, but market size dominates.
```
local_media_gross = market_size_factor^local_media_exponent
                   × local_media_base_rate × modest_performance_modifier
                   × reputation_modifier

local_media_kept = local_media_gross × 0.52
local_media_shared_pool_contribution = local_media_gross × 0.48
```
- **Resolved: this is a real, separate revenue-sharing mechanism, not the
  same thing as the National Media pool below** — clears up what "TV
  rights revenue-sharing" in the In-Season Tournament doc was gesturing
  at. Real MLB precedent, ported directly: a club keeps the local deal it
  negotiates (52%), but 48% of local media revenue — RSN included —
  flows into a separate shared pool, redistributed using the **same
  league+tier structure as the National Media pool below**, for
  consistency rather than introducing a third differently-shaped
  mechanism.
- `local_media_exponent` > 1 (placeholder) — the whole point of this
  stream is that it scales *faster* than linear with market size, unlike
  gate revenue.
- `reputation_modifier` — same value as in gate revenue, per the Team
  Reputation, Rivalries & Media doc.
- An RSN (Regional Sports Network), if a club has established one per
  that same doc, further boosts this stream above the standard local deal
  — and, per real-world precedent, is also where a club-owned-RSN
  valuation loophole could plausibly live later (a club with an
  ownership stake in its own RSN underpricing the internal deal to
  shield revenue from the 48% share) — good future Scripted Event
  material, not designed now.

### 3. National Media Rights (Shared) — the equalizing force, now split by league too
**Resolved: splits by league first, then by tier within each league** —
a hybrid, not the original tier-only design. Two total pools (Foundry,
Exchange), each potentially a **different total size**, reflecting the
leagues' distinct financial identities (Team-Reputation-and-media-flavor
consistent with League Structure doc's Foundry/Exchange split — Exchange's
Gilded Age, mercenary, big-market identity plausibly commands a bigger
national deal than Foundry's working-class, small-ball identity, though
which direction is bigger is a real design choice, not a certainty).
Within each league's pool, MLB1 clubs of that league get a larger
per-club share than MLB2 clubs of that league — preserving the original
promotion incentive, just nested one level deeper.
```
national_media_revenue = league_pool_total(league)
                        × tier_weight(tier) / teams_in_that_league_tier
```
- Mirrors real revenue-sharing — gives small markets a real financial
  floor regardless of market size, now within a league-specific context.
- Because each league-tier combination gets its own share, this preserves
  the financial promotion incentive (MLB2 → MLB1 still means a bigger
  cut) while also giving Foundry and Exchange genuinely different overall
  financial "temperature" — not just different ownership flavor text.

### 4. Cup / League Playoff Payouts — pooled base + performance bonus
**Resolved structure**, mirroring real UEFA Champions League economics —
relevant for exactly the same underlying reason: hosting rotates (only a
group's 3 MLB1 clubs ever host a Cup weekend, per the In-Season
Tournament doc), so letting gate/concession revenue simply accrue to
whoever happens to be hosting would badly shortchange non-hosting
participants who are equally part of the tournament.

```
tournament_pool_total = Σ(gate/ticket + concessions revenue across all
                          tournament games) + tournament_tv_deal_value
base_share_per_team = tournament_pool_total / participating_teams
team_payout = base_share_per_team + round_advancement_bonus(round reached)
```

- **`tournament_tv_deal_value` is its own separate contract** — not the
  same deal as the regular season's National Media Rights pool, and
  distinct from Local Media Rights entirely. Confirmed to **trend more
  national** than either regular-season stream, matching how real
  postseason/tournament broadcast rights (March Madness, Champions
  League, World Series coverage) are typically negotiated and valued
  separately from regular-season packages — tournaments draw broader,
  more national viewing interest than any single team's local market.

- **Base pool**: all gate/ticket, concessions, and tournament-specific TV
  revenue gets pooled and **split evenly across every participating
  team**, regardless of who actually hosted which games — rewards
  participation itself, not hosting luck.
- **Round-advancement bonus**: a separate, additional payment scaled to
  how far a given team actually advanced (Play-In exit, Round of 16, QF,
  SF, Final/Championship) — this part isn't pooled, it's earned.
- Same structure applies to both the Cup (In-Season Tournament doc) and
  League Playoffs (League Playoffs doc) — one shared payout model, not
  two separate ones.
- Exact dollar figures and the base-pool/bonus split ratio remain
  placeholders — genuinely can't be set meaningfully without real
  simulated revenue data to calibrate against, same as every other
  numeric constant in this project. The *structure* is confirmed; the
  *numbers* aren't.
- Structure: a payout table keyed by round reached (group stage exit,
  play-in loss, Round of 16, Quarterfinal, Semifinal, Final — for the Cup;
  wild card exit, Divisional, Championship, Pennant, Finals — for League
  Playoffs). Exact dollar figures not yet set — same "structure now,
  numbers after a sim exists" pattern as the rest of this project.
- Also where TV rights revenue-sharing tied to tournament performance
  (mentioned in the Cup doc) plugs in, once specced further.

## Ownership Type Is Orthogonal to Revenue

All four streams above are driven by market size, stadium, performance,
and tier — not by who owns the club. This means the same revenue model
should apply identically to fan-owned Foundry League clubs as to
traditionally-owned ones. Fan ownership changes how *spending authority*
works (the owner-wealth override on the expense side), not how money comes
in. Keeps these two systems cleanly decoupled — worth confirming this
holds once fan-owned clubs get their own design pass.

## Minor League Affiliate Revenue (brief note)

Per the Minor League System doc: affiliated clubs get their own (much
smaller-scale) local market-size revenue, plus a subsidy from their parent
MLB club — the subsidy is an expense on the parent's side, revenue on the
affiliate's. Unaffiliated clubs get only their own market-size revenue, no
subsidy — consistent with their higher fold/relocate risk already
established. Full minor-league revenue scaling not detailed here — minors
operate at a much smaller absolute scale than the majors throughout.

## Open Questions

- All scaling exponents/rates/factors above are placeholders — real
  numbers need tuning against an actual simulated season, same as every
  other numeric constant in this project.
- Which league's National Media pool is actually bigger (Exchange
  proposed as the likely bigger one, matching its Gilded Age identity) —
  flagged as a real design choice above, not decided.
- Exact Cup/League Playoff payout dollar figures — deferred.
- Fan-owned club revenue — assumed identical to traditional ownership per
  above, to be confirmed when fan ownership gets its own design pass.
