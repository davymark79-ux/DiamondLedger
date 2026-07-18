# Commissioner Vision & Roster Rules (v0.8)

## Game Framing: Commissioner, not GM/Owner

Foundational clarification, worth stating explicitly: the player's role is
**league commissioner**, not a single team's GM/owner/manager. This is a
real departure from OOTP's default mode (usually "you run one team"), even
though the underlying sim engine and "no game-watching" philosophy are
shared.

Practical implications:
- The player oversees the entire league — all major clubs (and eventually
  minors) — not one roster.
- The core gameplay loop is league-wide decisions: ruling on expansion
  petitions, approving/rejecting CBA terms, responding to scripted events
  (bankruptcies, relocations, firings) as they surface across every team,
  and setting/adjusting league-wide rules (roster limits, tournament format,
  promotion/relegation specifics).
- This retroactively clarifies the Scripted Event System from the main
  design doc: it isn't a side system, it's arguably the *core* loop — those
  are exactly the calls a commissioner makes.
- The GUI scaffold already built (Overview, Standings, Teams directory,
  Financials across all teams, League Wire) is naturally commissioner-shaped
  already, since nothing was built "my team"-specific. Keep that in mind for
  future screens — any roster view should let you inspect *any* team, not
  assume a "my roster."

## Roster Structure (initial defaults — CBA-negotiable)

- **50-man roster** — expanded from an earlier 40-man draft, specifically
  to support the Taxi Squad concept below. Full player pool a club owns
  rights to; this is now also the relevant threshold for Rule 5
  protection, waivers, and DFA (Player Movement doc — update those
  references from "40-man" to "50-man" for consistency).
- **26-man active roster** — subset of the 50 eligible to play in a given
  regular-season game (mirrors real MLB's current active roster size,
  unchanged).
- **Taxi Squad** — up to some number of the 50 (exact count TBD) can be
  designated at the start of the season as Taxi Squad. See its own
  section below.
- These are defaults, not permanent constants. Roster-size limits should be
  added to the list of CBA-negotiable terms in the main design doc's Scripted
  Event System section, alongside minimum salary, arbitration, free agency
  timelines, salary floor, luxury tax threshold/rate (see Financial
  Model: Expenses doc), IL duration structure — 10-day/60-day (see
  Injuries doc), and option years / Rule 5 eligibility timing / DFA
  resolution window (see Player Movement doc).

## Taxi Squad (new)

Solves individual player workload under a schedule this dense — not the
calendar-fitting problem itself (team game count is fixed regardless of
roster size), but the very real problem of the same 26 players absorbing
every game of an unusually heavy season (162 + Cup + up to a 33-day
maximum postseason, per the Season Calendar doc's worked exercise).

- **Designated at the start of the season**, not on the fly — a
  preseason roster decision, not a reactive one.
- **Automatically uses one option for the season** — a single, blanket
  option assignment covering the whole year, distinct from and not
  counted against the normal option rules (20-day threshold, 5-assignment
  cap — Player Movement doc). A true taxi squad arrangement, with a
  player genuinely splitting time between MLB and AAA all season, would
  blow through the standard 5-assignment cap almost immediately under
  the normal rules — this is a deliberate, separate mechanism built
  specifically to avoid that, not an oversight.
- **Expected to roughly split time between MLB and AAA** across the
  season, rather than sitting fixed at either level — a real, planned
  rotation, not an emergency-only recall pool.
- **Natural fit with the Doubleheader Bonus Roster Spot** below — taxi
  squad players are a ready-made pool to fill that bonus spot, rather
  than needing an ad hoc emergency call-up each time one is needed.
- Gives managers a real tool to actively rest regular players during the
  season's densest stretches (see Position Player Fatigue, Injuries doc)
  without a talent downgrade, since taxi squad players are real organizational
  depth, not replacement-level minimum options.
- Same pool directly supports the (future, speculative) International
  Club Championship — see `international-club-championship.md`.
  **Confirmed: 50-man roster for all clubs; 52-man for ICC-qualified
  clubs specifically during ICC games** — the extra 2 spots match the
  genuine spare AAA depth actual roster arithmetic supports (MLB 26 +
  AAA 26 = 52, only 2 beyond the standard 50), not an invented number.
  Reverts to the standard 50 outside of ICC games.

## Active Roster Expansion (late season)

**Confirmed: 26 → 28, matching real MLB's current rule exactly.** No
need for a bigger number here — the Taxi Squad already provides real
roster flexibility separately, and the Cup should be wrapping up around
the same time expansion kicks in anyway (its group stage is front-loaded
early in the 2nd half specifically to clear out before the stretch run —
Season Calendar doc), so there's minimal overlap between the two
systems to design around. This expansion is mostly about the playoff
push, not the Cup.

This universe needs the same 26→28 concept but **timed differently**:
since the minor league season is shorter than the majors', expansion
should happen once the minor league season ends, not on a fixed calendar
date the way real MLB's September 1 rule works — once affiliates finish
their season, their players become available to add without disrupting
an ongoing minor-league playoff race. Exact calendar placement still
depends on full season-calendar design (same dependency flagged for the
trade deadline in the Player Movement doc), but the *trigger* is
confirmed as minors-season-end rather than a fixed date.

## Doubleheader Bonus Roster Spot

Real MLB allows a temporary extra active-roster spot ("26th man" rule) on
days a club plays a doubleheader — activated for that day only, removed
within 24 hours, and doesn't burn an option. Given doubleheaders are
**much more common in this universe** than in real MLB (per the Weather
doc — tournament blackout weekends compress the schedule's slack), this
mechanic will see meaningfully more use here than its real-world
equivalent. Likely moot specifically during Cup tournament windows, since
clubs already have their full 50-man roster available there rather than
being capped at 26 — this bonus spot matters for regular-season
doubleheaders specifically.

## Tournament Roster Rule

- No MLB or minor league regular-season games run during in-season
  tournament ("Cup") break windows.
- Because of that, clubs bring their **full 50-man roster** (updated
  from an earlier 40-man draft, see Taxi Squad above) to the tournament,
  not just the 26-man active subset.
- Many games in a short window means efficiently deploying the full 50 —
  pitcher usage/fatigue especially — becomes a real strategic layer
  distinct from the regular season's 26-man rotation. The Taxi Squad
  concept adds a real additional lever here too.
- Build note: the plate-appearance engine's pitcher fatigue/injury-risk
  system needs to be aware of this alternate roster mode whenever the
  tournament schedule is active.
- **Confirmed, and broader than just this rule: all MLB tiers (MLB1,
  MLB2, and any future additional major tiers) are treated identically
  across the board** — "bring all 50" applies uniformly, and this is a
  general principle, not a Cup-specific exception. **The one confirmed
  exception is ICC eligibility** (International Club Championship doc) —
  which makes sense on its own terms, since ICC slots are earned via
  country rating and elite-club selection, not granted or denied by
  tier. Worth remembering as a default going forward: assume tier
  parity unless a rule is explicitly tier-specific, rather than treating
  every new mechanic as needing a separate MLB1-vs-MLB2 confirmation.

## Open Questions

- Exact CBA negotiation mechanics for roster-size changes — not yet
  specced, ties to the "simplified negotiation model" already noted in the
  main design doc.
- Does "bring all 50" apply across all tiers in the tournament, or just
  MLB1? (see above)
- Exact calendar timing of the 28-man expansion relative to
  minors-season-end — size (28) is now confirmed, timing still depends
  on full season-calendar design.
