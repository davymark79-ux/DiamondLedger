# International Tournament & Player Nationality — v0.3

*Two systems bundled here: (1) player nationality/eligibility tagging,
which matters immediately once player generation starts, and (2) the WBC-
style tournament itself, which is low priority — no international play
planned for a good while per Christopher. This doc focuses mostly on (1).*

**Locked in:** the nationality generation flow below (birthplace + weighted
heritage tags, declare-and-lock mechanic, curated tournament field) is
confirmed. **Timeline:** the plan is to simulate roughly 3 seasons before
the first WBC-style tournament, which lands in Season 4 — matching the
main design doc's "occurs before every 4th season" note. That gives a
comfortable runway before the tournament format itself needs to be fully
built out.

## Design principle: shallow data, rich mechanic

Nationality is modeled as **a short list of tags per player** — no
simulated parents, grandparents, or immigration timelines. The interesting
part of the system is the *choice and lock-in*, not the ancestry math
behind it. This keeps the mechanic feeling deep to the player while staying
completely tractable at a scale of thousands of generated players.

## Nationality Generation (recommended approach)

- **Every player has a birthplace nation** (100%). For domestic-born
  players this ties to the city/market data already established.
- **~75–80% of players have only that one nationality** — most people
  don't have a plausible second-country claim; keeps most roster decisions
  simple.
- **~15–20% get exactly one heritage nation** (2 total) — recommend a
  light regional weighting (a simple lookup table by birth region, not a
  simulation) for flavor, e.g. Northeast-born skews European heritage,
  Miami-born skews Cuban/Caribbean, Southwest-born skews Mexican.
- **~2–5% get a rare second heritage nation** (3 total — the ceiling).
  Flavorful outlier cases, uncommon enough not to complicate most rosters.
- No deeper simulation than this — nationality tags are rolled once at
  player creation and otherwise inert data until a declare event uses them.
- Exact percentages and the regional weighting table are placeholders —
  to be finalized during the player generation design pass (up next).

## Declare & Lock Mechanic

- **Also extends to managers** — good managers get called on to manage
  their eligible country's national team, using this exact same
  nationality-tag mechanic. Full detail in the Managers doc's WBC National
  Team Managers section; not re-specced here to avoid duplication.

- A player may be selected for/declare for any nation among their tags.
- The first time they appear in an official tournament game for a nation,
  they are **locked to that nation forever** — a single flag on the player
  record, no further logic required.
- Untapped tags remain flavor/lore only once a player is locked.
- Open question: does the lock trigger on any competitive tournament
  appearance, or only certain games (e.g. does an exhibition/warm-up game
  count)? Recommend competitive tournament games only — flag once the
  actual tournament format gets built.

## Tournament Field: curated, not derived

- Far more nationalities will exist among generated players than could
  ever field a real tournament team — a single Polish-heritage-tagged
  player doesn't make Poland a WBC nation.
- **Recommendation: start with a fixed, curated list** of ~16–20
  baseball-relevant nations, borrowing the real World Baseball Classic's
  field for legitimacy and flavor, rather than dynamically deriving
  eligibility from whatever tags happen to appear in generation.
- The field can expand slowly later — a scripted-event-style addition,
  matching the flavor of the domestic league's own expansion mechanic —
  rather than being fully dynamic from day one.

## Deferred — low priority, no international play planned for a while

- Actual bracket/group format for the tournament itself
- Scheduling relative to the 4-season cycle and the existing Cup calendar
- Payouts/prestige rewards for winning
- Final list of tournament-eligible nations (starting proposal above, not
  locked)

## Open Questions

- Confirm the nationality-generation percentages/approach above, or adjust.
- Does the "lock" only apply to tournament games, or any official
  international appearance?
- Final tournament-eligible nation list — TBD, low priority.
