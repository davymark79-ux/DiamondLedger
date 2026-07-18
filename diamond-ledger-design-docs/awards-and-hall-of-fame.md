# Awards & Hall of Fame — v0.8

*Two systems: individual season awards (dynamically named after the first
player to reach a defined milestone) and a Hall of Fame modeled closely
on real BBWAA rules. Voting is handled by The Writers Corps
(`writers-corps.md`) — a generated population of persona-driven
sportswriters standing in for a real electorate.*

## Individual Season Awards

### Categories (per league — Foundry and Exchange each have their own)

- **MVP**
- **Best Pitcher** (Cy Young equivalent)
- **Gold Glove** — confirmed full granular slate, identical for both
  leagues since defense doesn't depend on the DH rule: C, 1B, 2B, 3B, SS,
  LF, CF, RF, **P**, Utility — 10 per league.
- **Silver Slugger** — confirmed full granular slate: C, 1B, 2B, 3B, SS,
  LF, CF, RF, Utility, plus a 10th slot that differs by league — **P for
  Foundry, DH for Exchange** (see below).
- **Rookie of the Year** and **Manager of the Year** — confirmed
  additions, **one per league** (Foundry and Exchange each have their
  own), matching every other award category. Directly justified by the
  confirmed no-interleague-play rule (League Structure doc) — there's no
  shared cross-league regular-season competition to evaluate players or
  managers against uniformly, so per-league awards are the only sensible
  shape.

Because Foundry has pitchers hit and Exchange uses a DH, their Silver
Slugger slates naturally diverge: Foundry keeps a pitcher slot (like real
NL awards before the universal DH), Exchange has a DH slot instead. Nice
bit of texture that falls directly out of the league identity work
already done, no extra design needed.

### Finals MVP (league-wide, not per-league)

Unlike the categories above, this isn't split Foundry/Exchange — it's a
single award for the cross-league Finals (League Playoffs doc), same as
a real World Series MVP. Announced immediately after the Finals conclude,
matching the real-world tradition of naming it on the field right after
the last out — see the Season Calendar doc for placement. Eligible for
the same milestone-naming mechanic as every other award above (first
player to win it 3 times gets it permanently renamed).

### Milestone-Naming Mechanic

Every award starts under a generic name (e.g., "Foundry League Most
Valuable Player"). It's **permanently renamed to "The [Player] Award"**
the moment a player becomes the **first to win that specific award three
times**. Once locked in, it never changes again — even if someone later
wins more times than the namesake did, matching the real-world tradition
of awards like the Cy Young keeping their name regardless of who
surpasses the original honoree's total.

- Applies **independently per award slot** — MVP-Foundry and MVP-Exchange
  get separately named by separate players; each of the ~18 Gold Glove and
  ~18 Silver Slugger position-league slots (9 positions × 2 leagues each,
  exact position slate TBD) accumulates its own name independently over
  time as different players clear the bar at different points.
- **Three-time threshold** is a placeholder — meaningful enough to feel
  earned, achievable enough not to take absurdly long. Adjustable.
- **Alternate, faster path: statistical dominance — sequenced, not
  simultaneous.** Only the 3-win path is active from an award's first
  giving. **Once the award has been given out 10 times** (10 data
  points — enough to build a meaningful distribution), the 2-SD path
  also becomes available, but only if nobody has already locked in 3
  wins by then. If a player hits 3 wins before the award's 10th giving,
  it's already permanently renamed and the 2-SD path never becomes
  relevant for that award at all. Rewards genuine outlier dominance, not
  just longevity of winning — two historically dominant seasons can
  outweigh three merely-good ones, once there's enough history to judge
  "historically dominant" against.
- If a tie in timing is somehow possible, whoever reaches the milestone
  chronologically first gets naming rights — no real ambiguity since
  seasons resolve sequentially.
- This is excellent League Wire material — the season an award gets
  permanently renamed is a genuine historical event worth surfacing
  prominently, not just a quiet database update.

## Hall of Fame

Modeled closely on real BBWAA rules, with voting simulated rather than
skipped, since this universe has no real sportswriters.

### Manager Track

**Managers are eligible too**, per the Managers doc — real precedent
supports this directly (Bobby Cox, Joe Torre, Tony La Russa are all real
Hall of Fame managers). Same eligibility/ballot mechanics below (service
time, retirement wait, 75% threshold, 10-year ballot, Legacy Committee)
and the same Writers Corps electorate — but a **separate Hall case score
formula**, since a manager's relevant record is career wins, championships/
pennants, and tenure rather than batting or pitching stats. Formula itself
not yet specced — flagged as open.

### Eligibility & Ballot (ported directly from real rules)

- **10 years of MLB service**, retired at least **5 years**, before first
  ballot appearance.
- Voting body selects up to 10 candidates per "ballot" (simulated, see
  below).
- **75% support elects.**
- **Under 5% support drops a candidate off the ballot.**
- Maximum of **10 years** on the ballot before falling off entirely.
- **Confirmed: ported exactly from real BBWAA rules**, not adjusted for
  this universe's scale.

### Milestone Scaling (resolved: adjust the numbers, not the games counted)

A real question worth resolving carefully: players here play a shorter
150-game regular season than real MLB's 162, so the informal counting-
stat milestones that signal "clearly a Hall of Famer" (500 HR, 3,000
hits, 300 wins) would be proportionally harder to reach if used
unadjusted.

**Resolved: scale the milestone numbers down, don't fold tournament games
into career totals.** The Hall case score formula (below) already has its
own separate mechanism for valuing tournament/postseason success — it
explicitly weighs career Tournament Quotient trajectory and postseason/
Cup performance, weighted heavily. Also counting Cup and Playoff games
toward raw counting-stat totals would reward the same thing twice through
two different mechanisms, and would muddy something real baseball keeps
deliberately clean — the regular-season record book stays the regular-
season record book.

Using the same 150/162 ratio already established for the Minor League
System doc's season lengths:

| Real MLB milestone | Scaled |
|---|---|
| 500 HR | ~460 |
| 3,000 hits | ~2,775 |
| 300 wins | ~278 |

These are cultural/scouting-report benchmarks, not a formal input to the
Hall case score formula itself — that formula accounts for tournament
value on its own separate track.

### Simulated Electorate — The Writers Corps

No real voters exist, so voting is computed via **The Writers Corps** — a
generated population of persona-driven sportswriters, one or more per
city, that also provides named bylines for League Wire stories. Full
design in `writers-corps.md`. Summary of how it feeds HOF voting:

1. Compute a **Hall case score** per eligible candidate from:
   - Career counting stats
   - Awards won — especially any award that's been permanently renamed
     after them, which should weigh as a real legacy signal, not just
     another award
   - Career Tournament Quotient trajectory
   - Postseason/Cup performance, weighted heavily — consistent with the
     existing "regular season < tournament group < tournament knockout <
     league playoffs" Quotient philosophy
2. Each generated writer casts an actual simulated vote, computed from
   their personal traits (Traditionalism, Analytics, Quirkiness,
   Homerism, favorite team) interacting with the candidate's profile —
   not generic statistical noise, but structured, explainable variance
   from real persistent personas. Individual writer votes aggregate into
   the final vote percentage.

This keeps the same "structure plus real randomness" pattern already used
for player development variance and in-game performance consistency, but
the randomness is now attributable to actual personas rather than an
abstract dice roll — and it mirrors how real HOF voting is genuinely
messy because real voters disagree with each other, not because of pure
statistical chance.

### Legacy Committee (Era Committee equivalent)

A smaller, rarer secondary path for players who exhaust their 10 years on
the main ballot without reaching 75%, mirroring real MLB's Era Committees.
**Deliberately simplified for v1** — real MLB runs three rotating
committees (Contemporary Player, Contemporary Non-Player, Classic) with
16 members each and specific era coverage; this doc proposes a single,
simpler "Legacy Committee" that periodically reconsiders fallen-off
candidates, rather than replicating that full complexity immediately.
Can be split into multiple committees later if it starts to matter.

### Future Hook: Ineligibility

Real MLB has the "Pete Rose Rule" — a player on the ineligible list can
never appear on a HOF ballot regardless of merit. Worth flagging as a
natural future tie-in to the Scripted Event System (a serious scandal
event could render a player permanently ineligible) — not designed now,
just noted as a good narrative hook once that system is built out further.

## Open Questions

- Exact Hall case score formula and Writers Corps vote-simulation formula
  — deferred, needs real tuning against simulated careers once players
  actually exist and accumulate history. See writers-corps.md for the
  electorate side of this.
- Legacy Committee's exact voting mechanics and how often it convenes —
  deferred, flagged as deliberately simplified for now.
- Manager Hall case score formula — flagged in the Manager Track section
  above, not yet designed.
