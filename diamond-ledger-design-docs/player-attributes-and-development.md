# Player Attributes & Development — v0.11

*Covers the rating schema itself and the growth/variance model that moves
a player's ratings over time. Builds on the Player Pathway doc (college
prestige/specialty modifiers feed directly into this) and sits underneath
everything else — Tournament Quotient, financial value, roster decisions
all ultimately read off these numbers.*

## Rating Schema (20-80 scale)

Every attribute below is tracked on the standard 20-80 scale, matching the
main design doc's original note.

- **Hitting:** Contact, Power, Eye/Plate Discipline
- **Speed/Baserunning:** Speed, Baserunning instincts
- **Defense:** Fielding (range/hands), Arm Strength, Arm Accuracy
- **Pitching** (pitchers only): Velocity, Control, Movement, Stamina
- **Makeup:** Work Ethic, Durability/Injury Proneness, Consistency

Work Ethic in particular isn't just flavor — it's designed to eventually
plug into the development variance model below as a scoutable signal for
bust/breakout risk (see Future Hook at the end). Consistency is distinct
from Work Ethic — Work Ethic governs how *wide* a single game's
performance swing can be; Consistency governs how much a player's *true
underlying ability* can genuinely, if temporarily, drift in the short
term (see Hot/Cold Streaks below). A streaky player has real short-term
ability fluctuation; a highly consistent player's true ability barely
moves game to game, so any observed hot or cold stretch for him is almost
entirely noise rather than signal.

## Two Layers Per Attribute

- **True potential** — a hidden ceiling fixed at player generation. Never
  changes once set.
- **Scouted potential** — what's actually shown to the commissioner.
  Generated *with error* around the true value. That error should shrink
  over time as a player accumulates games/exposure — the "your read on him
  gets more confident the more you see him" mechanic. Not designed in
  detail yet — flagged as its own future discussion, separate from this
  doc's growth model.
- **Current rating** — where the player actually is right now, on the same
  20-80 scale. This is what game outcomes are actually computed from. It's
  what moves, period over period, via the growth model below.

## Growth Model

Each development period (a college year, a minor-league season, eventually
an MLB season for aging purposes), every attribute's **current** rating
moves toward the player's **true potential**, using:

```
growth = baseline_growth + variance_roll
```

- **baseline_growth** — driven by the player's age curve plus his
  development-location modifier (the college prestige/specialty system
  from the Player Pathway doc, or the equivalent minor-league-level
  developmental context). This is the deterministic, "generally do well"
  part.
- **variance_roll** — a random roll, independent per attribute, drawn from
  a distribution centered on zero. This is where over/underachievement
  lives.

## Variance Shape: widest at the bottom, narrows with level

The standard deviation of the variance roll should be **widest at the
lowest levels and shrink steadily as a player climbs** — a HS senior or
college freshman's trajectory is genuinely unpredictable; a AAA veteran's
isn't. Illustrative placeholder values (all need real playtesting/tuning,
same as every other numeric constant in this project so far):

| Level | Variance std. dev. (illustrative) |
|---|---|
| HS / pre-draft | 8 |
| College | 7 |
| A | 5.5 |
| AA | 3.5 |
| AAA | 2 |
| MLB (established) | 1 |

Rolls are independent per attribute (a player can breakout in Contact while
Power stays flat) rather than one global roll applied to the whole player.

## How This Produces Both Directions

- **Bust:** a highly-rated recruit at a powerhouse program racks up
  negative variance rolls. He still gets the baseline boost from a strong
  program, but the negative rolls mean he converges toward his true
  potential slower, and less completely, than expected — the "just didn't
  work out" story, despite doing everything else right.
- **Breakout / exceeding the pathway:** positive rolls let a player
  converge faster or more fully than projected. Since the org observes his
  *current* rating, not his hidden true potential, sustained positive
  variance causes his *scouted* potential to get revised upward. He isn't
  secretly exceeding a moving ceiling — the true potential was always
  fixed — the org's original estimate of that ceiling was simply wrong,
  and good variance is what exposed it.

This is what makes it possible for a player to "exceed even their pathway"
without true potential itself becoming a moving target — the surprise is
in what gets *revealed*, not in the underlying ceiling changing.

## In-Game Performance Consistency (Work Ethic × Talent)

Distinct from the development variance above — that mechanic governs
career-long growth across seasons. This one governs **game-to-game or
play-to-play consistency**, given a player's already-realized current
rating. Real-world reference point: a player like a high-talent, spotty-
focus type (think Jazz Chisholm) — a real 40/40-caliber talent who's also
capable of a genuinely boneheaded play, because the *talent* is elite even
when the *execution* isn't consistent.

The key design rule, resolved: **the spread of game-to-game performance
should scale with the player's talent level, not apply as a flat penalty
regardless of ability.** A bad player with bad Work Ethic isn't volatile —
he's just bad, consistently. A great player with bad Work Ethic is
volatile — capable of brilliance and bone-headed mistakes both, because
there's real talent underneath the inconsistency.

Concretely:

```
performance_spread = (current_rating - scale_floor) × work_ethic_factor
```

- `scale_floor` = 20 (bottom of the rating scale).
- `work_ethic_factor` is larger for poor Work Ethic (wider spread), smaller
  for good Work Ethic (tighter, more consistent performance).
- Because the multiplier applies to *how far above the floor* a player's
  rating sits, a low-rated player has little room to swing regardless of
  Work Ethic — bad talent with bad Work Ethic just produces bad results,
  consistently, matching "a bad player with bad work ethic will likely
  have bad results."
- A high-rated player has real room to swing, and poor Work Ethic widens
  that room further — producing exactly the boom/bust, highlight-reel/
  boneheaded-play pattern of a talented player with shaky discipline.
- Good Work Ethic tightens the spread at any talent level — a reliable,
  consistent player, whether that consistency is around a modest mean or
  an elite one.

This sits on top of, and is independent from, the development variance
system above — a player's Work Ethic could plausibly influence both (an
undisciplined player developing less predictably *and* performing less
consistently game-to-game), but the two mechanics are separate rolls
against separate things (career trajectory vs. single-game output).

## Hot/Cold Streaks

A byproduct of tracking recent actual performance against a player's
statistical baseline, giving the Managers doc's Analytics vs. Feel slider
something concrete to disagree about, rather than being a pure flavor
label.

**Corrected framing, resolved: this is a purely descriptive readout, not
a forward-feeding performance modifier.** It doesn't cause a player to
play better or worse — it's a measurement of how well he's actually been
playing, which a manager may perceive accurately, inaccurately, or not at
all (per Analytics vs. Feel and Streak Read, both in the Managers doc).

### The Metric: Standard Deviations, Not a Flat Percentage

Original design used a flat ±10%/±20% deviation from mean. Corrected,
because flat percentages don't account for sample-size noise and
therefore misfire on small samples. Worked example: a true .250 hitter
is expected to get 5 hits in 20 AB, with a binomial standard deviation of
about 1.94 hits (`√(20 × 0.25 × 0.75)`). Going 6-for-20 (.300) is only
about **0.5 standard deviations** above expectation — a completely
ordinary outcome for a .250 hitter, not a meaningful hot stretch, even
though it's a 20% relative jump in average. A flat-percentage threshold
would misfire on exactly this kind of routine noise constantly.

**Corrected metric: track deviation in standard deviations from the
player's expected mean, not percent of mean.** This scales correctly
regardless of sample size or which specific stat is being tracked, rather
than a fixed number that behaves inconsistently across different
situations. Worth tracking a **composite offensive value** (something
wOBA-like, capturing the full slash line) rather than batting average in
isolation — a player can be genuinely hot across average *and* power
simultaneously (see the worked example below), and a composite view
reflects that kind of real, multi-category outlier more robustly than any
single rate stat would on its own.

### Five-Position Slider (tier structure kept, thresholds corrected)

**Ice Cold — Cold — Neutral — Hot — On Fire**, now based on standard
deviations from expectation:

| Tier | Threshold (illustrative) |
|---|---|
| Ice Cold | ≤ -2.0 SD |
| Cold | -2.0 to -0.75 SD |
| Neutral | -0.75 to +0.75 SD |
| Hot | +0.75 to +2.0 SD |
| On Fire | ≥ +2.0 SD |

Using the same .250-hitter/20-AB example: roughly 7-for-20 (.350) lands
around Hot, and roughly 9-for-20 (.450) lands around On Fire — which
matches how a genuinely "blazing" stretch actually feels, versus 6-for-20
reading as unremarkable Neutral noise. Exact thresholds still placeholder,
but now scaled correctly rather than arbitrarily.

### Consistency: Real Short-Term Ability Drift, Not an Accumulator

Redefined from the earlier draft. Consistency no longer controls how fast
an artificial "streak meter" moves — instead, it represents **how much a
player's true underlying ability can genuinely, if temporarily, fluctuate
in the short term**:

- **Low Consistency (streaky)** — real, if small, short-term drift in true
  ability. A hot stretch for this player is partly *real signal* — a
  temporary genuine uptick, not just luck.
- **High Consistency** — true ability barely moves game to game or week to
  week. Any observed hot or cold stretch for this player is almost
  entirely statistical noise, not a real change in how he's playing.

This is what makes reacting to streaks *genuinely valuable specifically
for streaky players*, and mostly a trap when applied to consistent ones —
without needing an artificial mechanic where being labeled "Hot" itself
causes better play. The observed stat (recent performance vs. baseline)
is the same measurement either way; what differs is how much of that
observed deviation is real versus noise, which depends on the player's
Consistency rating.

### How Managers Use It

Two separate manager-side questions, not one:

1. **Does this manager act on streak information at all?** Governed by
   the existing Analytics vs. Feel slider (Managers doc). Analytics-
   leaning managers ignore the readout entirely — lineup and platoon
   decisions come purely from true ratings and matchups.
2. **How accurately does he perceive it?** Governed by the Manager
   attribute **Streak Read** (Managers doc). A Feel-leaning manager with
   poor Streak Read doesn't reliably perceive a player's true tier
   correctly — real managerial fallibility, like misreading noise as a
   real hot streak, or missing a real slump. Streak Read is only
   meaningful for managers who lean Feel — an Analytics manager with
   excellent Streak Read is simply choosing not to use a skill he has.

**A Feel read can trigger more than one kind of decision, not just a
binary start/sit call:**

- **Batting order placement** — moving a hot hitter up into a more
  valuable lineup slot, not just deciding whether he plays at all.
- **Playing-time decisions that displace an established player** —
  including resting a player whose *true* rating is still excellent, on
  a short-term tactical basis rather than any real reassessment of his
  talent.

**Worked example:** A young 3B who normally hits 9th is slashing
.195/.280/.642 on the season — a weak, bottom-of-the-order profile. Over
the last week he's at .290/.420/1.050 — a genuine multi-category outlier
(both average and power surging together, not just a lucky batting-average
blip), the kind of composite deviation that should register as On Fire
under a metric that captures the full slash line rather than tracking
average alone.

The team's 39-year-old DH — still a genuinely great hitter, capable of
35+ HR — has started 12 straight games and needs a rest before a playoff
push. **That rest decision is sound on its own terms, independent of
manager philosophy** — it's the existing Position Player Fatigue mechanic
(Injuries doc) doing its job, and any competent manager, Feel or
Analytics, might make the same call to sit him. **Where Feel and
Analytics actually diverge is who fills the vacated at-bats.** An
Analytics manager slots in whichever bench option the matchup data
favors. A Feel manager, with good Streak Read, gives the games to the
red-hot 3B instead — moving him up to 3rd in the order for a game or two
to ride it — fully aware the smart-money read is that a one-week sample
will regress, and that the 3B is likely to slide back down to 9th, or even
get benched or optioned down, once the heat fades.

**This is a genuinely honest description, not a hidden edge:** the move
can backfire (an 0-for-5 with 4 strikeouts is a completely normal
outcome), or it can pay off spectacularly (a three-run double into the
corner that wins the game). Either is a plausible result of the same
decision. This is what makes **Feel management higher-variance rather
than higher-value** — not that Feel managers are secretly right and
Analytics managers are leaving value on the table, but that Feel managers
accept real expected-value risk in exchange for tactical flexibility and,
honestly, more dramatic outcomes. Some big short-term wins, some big
short-term losses — a more chaotic team than an Analytics manager would
produce, not necessarily a better or worse one over a full season.

Since the observed readout is a mix of real signal (proportional to a
player's own Consistency rating) and pure noise, this creates genuine,
honest tension rather than a dominant strategy: Feel managers with good
Streak Read capture real value reading streaky players correctly, but are
exposed to chasing noise on consistent players who don't actually have
much real signal to find. Analytics managers miss the real signal on
streaky players entirely, but never waste effort chasing noise either.
Neither approach is strictly correct — that's the point, and the
worked example above is a better illustration of it than a claim that
Feel managers simply win more.

## Work Ethic and Development Variance

Resolved: Work Ethic shifts the **mean** of the development variance roll
(see Growth Model), not just its spread. Concretely:

```
variance_roll ~ Normal(mean = work_ethic_shift(WE), std_dev = level_std_dev)
work_ethic_shift(WE) = (WE - 50) × shift_factor
```

- `WE` is the player's Work Ethic rating (20-80 scale); 50 (average) means
  a neutral, zero mean shift — the population-level baseline stays
  unbiased, exactly as designed in "Where 'Most Players Aren't Great'
  Actually Comes From" above.
- Above-average Work Ethic shifts the mean positive: better odds of
  positive variance rolls, and therefore better odds of actually
  converging on true potential rather than falling short of it.
- Below-average Work Ethic shifts the mean negative: the opposite —
  more likely to underperform relative to true potential.
- `shift_factor` is a placeholder constant, same tuning status as the
  variance std. dev. table and every other numeric constant in this doc.

This doesn't reintroduce the population-level skew problem flagged
earlier — the *average* player has average Work Ethic (mean shift ≈ 0),
so the overall population trend is still governed by the true-potential
generation distribution, not by variance bias. What changes is that Work
Ethic becomes a real, scoutable, causal factor in whether an *individual*
player reaches his own ceiling — which is the whole point of rating it as
an attribute in the first place, rather than just flavor text.

**Resolved: rolls stay independent per attribute, and that's sufficient
— natural clustering already emerges from the design as-is, no new
mechanism needed.** Because the *same* Work Ethic value biases the mean
of every one of a player's attribute rolls simultaneously, a disciplined
player's Contact, Power, and Fielding rolls all get pulled toward
positive in the same season together — not because the rolls are
technically correlated with each other, but because they share the same
underlying systematic bias. That produces exactly the "tends to cluster"
pattern (a disciplined player having a great all-around development
year) while each individual roll remains genuinely independent. Adding
explicit cross-attribute correlation on top would be solving a problem
the existing design already handles.

## Where "Most Players Aren't Great" Actually Comes From

Resolved design question: should busts come from skewing the variance roll
negative, or from most players simply having lower ceilings? **Lower
ceilings.** Reasoning:

- **True potential is, by definition, a player's real attainable ceiling.**
  Skewing the variance roll negative would mean players systematically
  underperform even their own true ceiling on average — which quietly
  breaks what "true potential" is supposed to mean. Variance should stay
  **symmetric and unbiased** — over a large population it nets out to
  roughly zero, sometimes above expectation, sometimes below.
- **The realistic reason most players aren't stars is that elite ceilings
  are genuinely rare.** This should be handled at the source: the
  distribution that *generates* true potential should be right-skewed —
  modest-to-average ceilings common, 70-80 grades rare — not an even
  spread across the 20-80 scale. Population scarcity belongs in generation,
  not in punishing the growth roll.
- **The emotionally resonant "everyone thought he'd be great" bust story
  has a better home: scouted potential's error.** Real-world prospect
  hype is well known to skew optimistic more often than pessimistic —
  nobody hypes a guy as a future bust. When the scouting-error mechanic
  gets designed (still deferred), it should likely carry a mild optimism
  bias — the *scouted* number tends to overstate the *true* number more
  often than it understates it. That delivers the "can't believe he
  busted" narrative cleanly, without compromising the realism of true
  potential or the fairness of the variance roll.

## Open Questions

- ✅ Scouted-potential error/confidence mechanic — specced, see
  `scouts.md`. Accuracy is now driven by the specific scout(s) covering a
  player (skill + specialization match) rather than a generic error term.
  How error narrows over time with continued exposure, and the mild
  optimism bias idea, remain open within that doc.
- Real numeric tuning of both baseline growth curves and the variance
  std. dev. table above — needs an actual sim to validate against, same
  as the Tournament Quotient's K-values and S-constant.
- Exact shape of the true-potential generation distribution (right-skewed,
  per above) — needs real numbers, not yet specced.
- `shift_factor` value for the Work Ethic mean-shift mechanic — deferred,
  needs real tuning like every other numeric constant here.
- Hot/Cold tier thresholds are now expressed in standard deviations
  (illustrative: ±0.75 SD / ±2.0 SD), corrected from an earlier flat-
  percentage draft that misfired on small-sample noise. Exact thresholds
  still placeholders, need real tuning. Rolling window size (how many
  recent games/AB feed the calculation) also not yet specced — a related
  tuning knob worth considering alongside the thresholds themselves.
