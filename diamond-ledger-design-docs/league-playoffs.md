# League Playoffs — v0.3

*Separate from the Cup (see in-season-tournament.md) — this is each league's
own postseason, contested independently within Foundry and within Exchange,
culminating in a cross-league Finals. Currently specced for MLB1 (3
divisions per league); MLB2 needs its own version — see open questions.*

## Structure (per league — Foundry and Exchange run identical brackets)

**Restructured, v0.2 — much smaller field than the original draft.**
Reduced from a 15-team, 5-round bracket to **4 teams per league (8
total)**: the 3 division champions (Atlantic/Heartland/Pacific) plus 1
wild card per league. This was a deliberate scheduling decision as much
as a competitive one — see the Season Calendar doc's worked stress-test
example, where the original 5-round bracket was the single largest
contributor to an unrealistic maximum-games scenario.

1. **Round 1 ("WC Round"), best-of-5** — two series play simultaneously:
   - The division champ with the **best regular-season record** plays the
     **wild card** team.
   - The other two division champs play each other.
   - This deliberately pairs the best record against the wild card,
     rather than the more conventional approach of protecting the top
     seed with an easier matchup — a real design choice, not an oversight.
2. **Round 2 ("LCS"), best-of-7** — the two Round 1 winners meet, no
   reseeding. Produces the league's **pennant winner**.
3. **The Finals** — the Foundry pennant winner plays the Exchange pennant
   winner, best-of-7.

**Only 3 total rounds within a league**, down from the original draft's
5 (division bye → wild card round → divisional → championship series →
pennant series). Maximum possible games for a team winning it all: 5 + 7
+ 7 = **19**, down from the original structure's 33 — a major reduction
in the worst-case schedule burden with a much simpler, easier-to-follow
bracket as a side benefit.

Only 4 of a league's 15 MLB1 teams make the playoffs now, a significant
tightening from the original draft's 13-of-15 — much closer to real
MLB's actual playoff field size than the original much-larger draft was.

## MLB2 and lower tiers: no bracket, just a championship

MLB2 (and any future major tiers below it) skip the bracket entirely. The
league leader of each MLB2 league — Foundry2 and Exchange2 — meet in a
single championship. Since **the top team in each MLB2 league is already
guaranteed promotion to MLB1** (per the promotion/relegation rule), this
"championship" doesn't determine anything structural — both participants
are moving up regardless of the outcome. It's a bragging-rights title, not
a stakes-bearing event.

Format not yet specified — assumed **single game**, matching the
low-stakes framing, but flag if you intended a short series (best-of-3?)
instead.

## Open Questions

- **MLB2/lower-tier championship format** — single game (assumed) or a
  short series? Not yet confirmed.
- **Interaction with the Cup** — the Cup and League Playoffs both happen
  within a season. Scheduling overlap/sequencing between the two hasn't
  been worked out yet (e.g. does the Cup's knockout phase, which runs in
  the first half of the following season, ever collide with League Playoffs
  scheduling? They're likely sequential — playoffs at end of regular season,
  Cup knockout mid-following-season — but worth confirming there's no
  conflict once an actual calendar gets built.)
- **Payouts / financial tie-in — resolved.** Same pooled-base-plus-bonus
  structure as the Cup, confirmed as one shared payout model rather than
  two separate ones (Financial Model: Revenue doc). MLB2's bragging-
  rights championship isn't explicitly covered by that structure yet —
  worth a quick confirmation on whether it gets any payout at all, given
  its low-stakes framing (League Playoffs doc, MLB2 section above).
