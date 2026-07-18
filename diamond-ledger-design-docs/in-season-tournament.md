# The In-Season Tournament ("The Cup") — v0.6

*This resolves the open scheduling question flagged in the main design doc's
Tournaments section ("Christopher has scheduling ideas already in mind...
to be documented once specced"). Currently open to MLB1 + MLB2 (50 teams
total) — will extend to additional tiers as the pyramid grows, per the main
design doc.*

## Overview: A Tournament That Spans Two Seasons

Unlike a typical single-season cup, this tournament's group stage runs in
the second half of one season, and its knockout rounds run in the first
half of the *following* season. Structurally:

- **Season N, 2nd half (post All-Star break):** Group stage — 3 round-robin
  weekends, no regular-season games during those weekends.
- **Season N → N+1 offseason:** Standings lock in; teams are reseeded by
  tournament record for the knockout bracket.
- **Season N+1, 1st half:** Knockout rounds, each on a weekend with no
  regular-season games, culminating in a single-game Final the day before
  the All-Star Game, at the All-Star host city.

Because promotion/relegation happens at the end of Season N, a club's tier
can change *between* the group stage it qualified in and the knockout rounds
it plays in Season N+1 — e.g. a team that group-stage-qualified as MLB1 could
be playing its knockout rounds having just been relegated to MLB2, or vice
versa. **Confirmed as intended** (real-world precedent: a club can complete
a continental campaign despite a rough domestic season).

## Seeding & Qualification

- Every major-league club carries a **Tournament Quotient** — a rating based
  on historical tournament/playoff success, weighted more heavily than
  regular-season performance. (Formula not yet specced — open question.)
- After the All-Star break, all 50 clubs are seeded into pots by Quotient
  (Champions League-style) and drawn into **10 groups of 5**: 3 MLB1 + 2
  MLB2 per group. 10 × (3+2) = 50 — matches the full league exactly.
- **League-balance constraint on the draw, confirmed**: every group's 3
  MLB1 slots must include **at least 1 Foundry and at least 1 Exchange**
  club (ruling out an all-same-league 3-0 split), and the 2 MLB2 slots
  must be **exactly one from each league** (a strict 1-1 split, not just
  "at least one"). Layered on top of the Quotient-based pot draw the same
  way real major tournaments add confederation/region constraints on top
  of seeding pots — not a replacement for the pot system, an additional
  rule the draw has to satisfy. This is also where the confirmed
  no-interleague-play rule (League Structure doc) actually gets its
  cross-league matchups from — the Cup groups are specifically where
  Foundry and Exchange clubs meet, and this constraint guarantees that
  happens robustly in every single group rather than by chance.

## Group Stage

- **3 round-robin weekends**, spread across the second half of the season.
- Each weekend, every team plays the other 4 group members once — 4 games
  over 3 days, including 1 doubleheader (there's no way to fit 4 games into
  3 days otherwise).
- Since the full round-robin repeats across all 3 weekends, **each team
  plays each groupmate 3 times total** — 12 group-stage games per team.
  Confirmed.
- **Venue:** revolving host — each weekend, the whole group plays in a
  single city. **Confirmed:** each of a group's 3 MLB1 teams hosts one of
  the 3 weekends (MLB2 clubs don't host, likely stadium-capacity driven —
  hosting means fielding all 5 teams' games for the weekend, so the bigger
  MLB1 parks make more sense as venues). Clean 1:1 fit: 3 MLB1 teams per
  group, 3 weekends, no leftover scheduling logic needed.
- No regular-season MLB or minor-league games run during these weekends —
  per the Commissioner Vision & Roster Rules doc, clubs bring their full
  50-man roster to Cup weekends.

## Advancement to Knockout

- Top 2 finishers in each of the 10 groups advance (20 teams).
- The 4 best third-place finishers (across all 10 groups) also advance.
- **24 teams total** advance; everyone else is out for the season.

## Reseeding & Knockout Bracket

- The 24 advancing teams are reseeded by tournament record (not the
  original Tournament Quotient — actual group-stage performance).
- **Seeds 1–8 receive a bye** straight into the Round of 16.
- **Seeds 9–24** (16 teams) play a **best-of-3 series** in standard
  reverse-seed pairs: 9v24, 10v23, 11v22 ... 16v17. 8 series, 8 winners.
- The 8 winners join the 8 byes to form the Round of 16 (16 teams).
- From here: **best-of-3 series each round, fixed bracket, no reseeding** —
  Round of 16 → Quarterfinal → Semifinal → **Final**.
- **The Final is a single game**, played the day before the All-Star Game,
  at the same city hosting that year's All-Star Game.

## Venues

- **Group stage:** revolving host — each group's 3 MLB1 clubs each host one
  of the 3 weekends; MLB2 clubs in the group don't host.
- **Knockout best-of-3 series:** all games at the **higher seed's home
  park** (not split/alternating, unlike a typical MLB postseason format —
  presumably for scheduling simplicity within a single weekend window).
- **Final:** single game, All-Star host city, day before the All-Star Game.

## Financials

- **Cash payout structure resolved** (Financial Model: Revenue doc): a
  pooled base share (gate/concessions/tournament TV revenue, split
  evenly across all participating teams regardless of who hosted) plus a
  separate round-advancement bonus. Exact dollar figures still
  placeholders, needing real revenue simulation data to calibrate.
- Now fully integrated into the Financial Model: Revenue doc's payout
  section — analogous to real Champions League prize money or postseason
  gate/TV revenue, no longer a dangling build note.

## Open Questions

- ✅ **Tournament Quotient formula** — specced, see `tournament-quotient.md`
  (bounded Elo, 20–100, decays gently each season, no cross-tier modifier,
  four weight tiers: regular season < Cup group < Cup knockout < League
  Playoffs). The League Playoffs tier is a placeholder weight pending that
  system's design — up next.
- **Payout amounts and TV revenue-share mechanics** — not yet specced,
  flagged for the Financial Model. Hosting a group-stage weekend likely
  means real gate revenue for the host club too (10 games across 3 days,
  all 5 group teams' fans in town) — another Financial Model tie-in worth
  remembering once that system gets built.
- Worth keeping an eye on during playtesting: with 3 MLB1 teams outnumbering
  2 MLB2 teams in every group, MLB1 dominance of group outcomes seems likely
  — not necessarily a problem (may be realistic/desirable), just worth
  watching once there's an actual sim to test against.
