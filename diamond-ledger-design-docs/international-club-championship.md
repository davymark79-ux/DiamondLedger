# International Club Championship — v0.8 (Future, Speculative)

*Not being built now. This is framework so the schedule makes sense once
other countries' domestic leagues exist in-universe (Mexico, Japan,
Venezuela, etc.) — a Champions League-style tournament between top clubs
from different countries' leagues. No other countries exist yet; this
entire doc is premised on a future game-world state, not current scope.*

## Scheduling Mechanism — Revised: In-Season Is Viable After All

**Reverses v0.1's "must live in the offseason" recommendation.** That
recommendation assumed this tournament would need league-wide blackouts
the way the domestic Cup does. It doesn't — because only a handful of
clubs ever participate (unlike the Cup, where all 50 clubs are involved),
**this only needs to block out the specific participating teams**, not
the whole league.

- Real-world precedent, and a strong one: this is exactly how UEFA
  Champions League works relative to domestic soccer leagues — CL games
  run midweek specifically so domestic fixtures continue unaffected for
  every club not involved that week.
- Practical mechanism here: CL match dates get **reserved for
  participating clubs when the season schedule is first built** (their
  qualification is known from the prior season's country ratings and
  results, before the new season's schedule is generated). Every other
  team just keeps playing its normal games against *each other* on those
  same days — no blackout, no rescheduling needed for the rest of the
  league.
- The only real complexity: two CL-participating clubs that were
  originally going to play *each other* domestically on a CL date need
  that specific matchup resolved (moved elsewhere in the schedule) —
  everyone else is unaffected.
- This means the tournament genuinely can live in-season, addressing
  Christopher's actual scheduling insight directly, and doesn't compete
  with the calendar crunch the domestic Cup and League Playoffs already
  create.

## Country Rating & Slot Allocation

Modeled directly on real UEFA Champions League's coefficient-based
system, reusing the **country-strength metric** already proposed in the
WBC Tie-In section below (the same signal serves both systems).

- Every participating country sends **at least its own domestic league
  champion** — one automatic slot, floor case for even the lowest-rated
  qualifying country.
- Higher-rated countries earn **additional slots** (up to a max of 4)
  filled by their next-best clubs — 2nd, 3rd, 4th place domestically, or
  by Tournament Quotient ranking within that country's league.
- Top-rated countries: up to 4 slots. Lowest-rated qualifying countries:
  1 slot (their champion only). Exact tier breakpoints between those
  extremes not yet specced — depends entirely on how many countries
  actually exist once this becomes real, which is unknowable now.

## Group Stage

- **Pot-based draw**, reusing the same Tournament Quotient-driven pot
  logic already established for the domestic Cup's group draw — sort
  qualified clubs into pots by rating, draw one per pot into each group
  to avoid clustering all the strongest clubs together.
- **Round-robin mini-tournaments, confirmed at 2 weekends** (reduced from
  an original 3-weekend draft) — 8 group-stage games per team (4
  opponents × 2 repetitions), down from 12. Locked in specifically to
  ease the worst-case schedule burden — see the Season Calendar doc's
  worked stress-test comparison.
- **Group size is scalable, not fixed** — with so few countries existing
  for the foreseeable future, there may not even be enough total clubs to
  form multiple groups yet. This is explicitly framework for when that
  changes, not a design that needs to work today.

## Knockout Phase

- Group winners plus some number of best 2nd/3rd-place finishers advance
  — mirrors the domestic Cup's "top 2 + best 3rd-place teams" logic.
  Exact numbers scale with total participation, same reasoning as group
  size above.
- **Single-game rounds, not best-of-3 like the domestic Cup.** Confirmed
  design choice, not a simplification for convenience: a multi-game
  series between clubs from *different countries* means real
  international travel between games, which doesn't apply to the
  domestic Cup's all-US bracket. Single elimination avoids forcing that
  travel burden repeatedly through a knockout run.

## Timing

- **Runs entirely within one season** — unlike the domestic Cup, this
  does *not* span two seasons' halves. No group-stage-now/knockout-later
  split.
- **Must conclude before the regular season ends, and well clear of the
  postseason positioning stretch** — same underlying principle already
  applied to the domestic Cup's group stage being front-loaded early in
  the 2nd half: don't let a tournament obligation compete with the games
  that matter most for playoff positioning late in the year.
- A small number of elite clubs could plausibly be juggling domestic Cup,
  this tournament, *and* a playoff push in the same season — worth
  watching once real scheduling is built, flagged rather than resolved
  here.

## The WBC Tie-In

The International Tournament & Nationality doc originally recommended a
**curated, fixed** starting field for the WBC specifically because there
was no meaningful signal yet to derive it from — nationality tags alone
don't indicate whether a country has real baseball infrastructure worth a
tournament slot.

**Once other countries have actual simulated domestic leagues**, that
changes. The same country-strength metric that allocates CL slots above
would finally provide a real, earned signal — letting the WBC field
**evolve over time** rather than staying permanently fixed. A country
that builds a genuinely strong domestic league could work its way into
WBC eligibility on its own merit. Doesn't change the *current*
curated-list approach — it's the natural upgrade path once the
prerequisite (real foreign domestic leagues) exists.

## Worked Example: Maximum Possible Workload (Treble-Winning Team)

A team winning the domestic championship, the Cup, and this tournament
(40 total CL teams, 8 groups of 5) in the same season, taking the longest
possible path through everything. Updated with both confirmed reductions
— 2-weekend ICC group stage, and the League Playoffs restructured to 4
teams/league, 3 rounds (League Playoffs doc):

| Competition | Games |
|---|---|
| Regular season | 150 |
| Cup (group 12 + longest knockout run 13) | 25 |
| ICC (2-weekend group 8 + single-game knockout 4) | 12 |
| League Playoffs, WC(5)+LCS(7)+Finals(7) | 19 |
| **Total** | **206** |

Against the ~224 days available in the season, this comfortably fits with
realistic rest (~31 days, scaled from the real-MLB ratio used elsewhere in
the Season Calendar doc) and needs only **13 total doubleheaders** — 5
already built into the two tournaments' own group stages (3 Cup + 2 ICC),
leaving just 8 additional. Down substantially from the original
224-game/33-doubleheader version — the League Playoffs restructuring
(from 5 rounds to 3) did most of that work, more than triple the impact
of the ICC group-stage reduction alone. Still the clearest case for the
Taxi Squad (Commissioner Vision doc) even at this reduced level — no
individual player should be expected to absorb this workload personally,
even though the *team* can play all 206 games.

## ICC Roster Flexibility — Confirmed

**Earlier drafts (v0.4-0.6) proposed a separate ~10-player supplemental
pool. That number didn't survive actual roster arithmetic and was
withdrawn — replaced with the mechanism below, now confirmed.**

The math: MLB active roster (26) + AAA roster (26) = 52 total players,
and the standard 50-man can only cover 50 of those — leaving roughly **2
genuinely spare AAA players** not already rostered at any given moment.
There isn't a real pool of 10 additional AAA-and-above bodies sitting
unused to draw from, and reaching further to manufacture that number
would mean dipping into AA, which directly contradicts the competitive-
integrity reasoning that ruled AA out in the first place.

**Confirmed rule: 50-man roster for all clubs; 52-man for ICC-qualified
clubs specifically during ICC games.** The extra 2 spots match the
genuine spare AAA depth the arithmetic above actually supports — not an
invented number. Outside of ICC games, an ICC club's roster reverts to
the standard 50. This is a better fix than the original ~10-player draft
specifically because it doesn't require inventing organizational depth
that doesn't actually exist — every part of it is drawn from real,
countable roster math.

## Open Questions

- Exact country-strength formula — conceptually described, not a real
  formula yet.
- Exact slot-count tiers between the 1-slot floor and 4-slot ceiling —
  depends on how many countries ultimately exist, unknowable now.
- Exact group size and knockout advancement counts — scalable by design,
  not fixed.
- How to resolve the rare case of two CL-participating clubs that were
  originally scheduled against each other domestically on a CL date.
- No other countries' domestic leagues exist yet — this entire doc
  remains premised on a future game-world state.
