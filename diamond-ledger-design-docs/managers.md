# Managers — v0.4

*A generated NPC population, following the same "structured persona"
pattern already established for the Writers Corps. Managers exist across
both majors and minors (both fully basic-simmed per the Minor League
System doc), are eligible for the Hall of Fame, can be called up to
manage a national team in the WBC, and tie directly into the existing
"Coaches fired" Scripted Event category from the main design doc.*

## Origin: Ex-Player vs. Outsider

A weighted roll at generation — majority ex-player (matching real
baseball, where most managers played professionally at some level), a
real minority of outsiders who came up purely through coaching/scouting,
matching Christopher's explicit ask for a mix rather than one path.

- **Ex-player managers** draw nationality directly from their existing
  player record — full reuse of the Nationality doc's system, no new
  generation needed.
- **Outsider managers** get freshly generated nationality the same way
  players do (birthplace + weighted heritage tags, per the Nationality
  doc).
- **This surfaces the need for player retirement to exist**, at least
  minimally — an ex-player manager has to have stopped playing first.
  Retirement has been sitting as "deferred, discuss later" since the
  Player Pathway doc. Proposing a lightweight default here rather than
  blocking on a full design pass:
  - Retirement probability rises with age (particularly past the
    mid-30s) and rises further as current ratings decline meaningfully
    below career peak — same soft-probability pattern as everything else
    in this project, not a hard cutoff.
  - This is a minimal, functional default to unblock the manager system.
    A fuller player-retirement design pass (financial incentives, a
    "one last contract" decision, etc.) can happen later if wanted —
    flagged as still open, not fully resolved here.

## Managerial Style — Seven Bipolar Sliders (1-100)

Same OOTP-inspired approach Christopher referenced:

- **Steal Aggressiveness** — conservative ↔ aggressive
- **Small-Ball Tendency** — swing away ↔ bunt/manufacture runs
- **Pitcher Hook** — quick hook ↔ long leash
- **Bullpen Usage** — heavy matchup shuffling ↔ let starters go deep
- **Platoon Tendency** — fixed lineup ↔ heavy matchup-based platooning
- **Analytics vs. Feel** — a broader decision-making philosophy slider,
  distinct from Platoon Tendency above (that one governs lineup/matchup
  decisions specifically; this one is the manager's overall trust in
  data-driven models vs. gut instinct and traditional scouting). Governs
  *whether* a manager acts on a player's Hot/Cold Streak state at all
  (Player Attributes & Development doc) — Analytics-leaning managers
  ignore it entirely, Feel-leaning managers factor it into lineup and
  platoon decisions. Since streaks are a real but modest, noisy signal
  (not pure illusion), this is genuine philosophical tension rather than
  one side being objectively correct.
- **Defensive Management** — straight away ↔ heavy defensive
  micromanagement (infield in, double-play depth, no-doubles defense,
  shifts). Governs how actively a manager adjusts positioning in-game
  versus leaving a standard default alignment.

### Streak Read (new attribute, separate from the sliders above)

Separate from the Analytics vs. Feel slider — that one governs *whether*
a manager acts on streak information; this one governs *how accurately*
he perceives it. A Feel-leaning manager with poor Streak Read doesn't
reliably read a player's true hot/cold tier correctly — real managerial
fallibility, like benching someone in a genuine slump one game too late,
or riding a player who was never actually hot, just running into some
luck. Only meaningful for managers who lean Feel — an Analytics manager
with excellent Streak Read is simply choosing not to use a skill he has,
which is its own bit of characterization. Full mechanic detailed in the
Player Attributes & Development doc's Hot/Cold Streaks section.

These feed directly into the Sim Engine's in-game decision-making
(stealing, pitching changes, lineup construction, defensive positioning) —
a manager's sliders are consulted at the relevant decision points during
game simulation.

**Nice natural tie-in, not a hard rule:** Foundry League's established
"manufacture runs," pitchers-hit identity and Exchange League's
analytics-driven, DH identity give a believable *tendency* for managers
in each league to skew toward certain slider values on average — Foundry
managers trending toward small-ball/quick-hook/Feel, Exchange managers
trending toward platoon-heavy/patient/Analytics — without forcing it. The
new Analytics vs. Feel slider is the most directly on-theme of the seven
for this correlation. A traditionalist manager landing in Exchange, or an
analytics-minded manager in Foundry, is exactly the kind of texture worth
keeping possible rather than constraining away.

### Temperament (new makeup trait, resolved)

Managers now get their own "makeup" dimension, parallel to how players
have Work Ethic and Consistency (Player Attributes & Development doc).
Rather than a manager's seven strategic sliders being fixed values he
always follows precisely, **Temperament governs how much his actual
in-game decisions deviate from those baseline tendencies on any given
day**:

```
effective_slider_value(game) = base_slider_value + noise(Temperament)
```

- High Temperament (steady) = tight noise range — a manager reliably acts
  according to his stated sliders game after game.
- Low Temperament (volatile) = wide noise range — a manager with a clear,
  aggressive steal-happy identity could still have a night where he plays
  uncharacteristically conservative, or vice versa. His sliders remain
  his true long-run identity (the average holds), but a low-Temperament
  manager wanders from them game to game in a way a high-Temperament one
  never would.
- Directly serves "chaotic variation" per Christopher — real
  unpredictability in manager behavior without contradicting who a
  manager actually *is* over a full season, the same way player
  Consistency creates real streaks without breaking what "true talent"
  means.
- Parallel to player Consistency by design, not identical — player
  Consistency governs how much *performance* varies; manager Temperament
  governs how much *decision-making* varies. Same underlying pattern,
  applied to a different layer of the sim.

## Age & Nationality

Same demographic treatment as players — age tracked, nationality assigned
per origin type above (reusing the existing Nationality doc's mechanic
directly rather than building a parallel system).

## Career Lifecycle

- **Retirement** — soft probability window increasing with age, same
  pattern as the Writers Corps, tuned older to match real managerial
  careers (managing doesn't require a player's physical peak, so the
  window should sit meaningfully later than a player's). Satisfies "no
  100-year-old managers" through accumulating probability rather than a
  hard cutoff.
- **Firing** — ties directly into the main design doc's existing "Coaches
  fired" Scripted Event category (triggered by win%, chemistry, owner
  patience — already speced, no new framework needed).
- **Rehiring** — a fired manager isn't removed from the pool, he re-enters
  the labor market and can be hired by any other club, **majors or
  minors**. This creates a real career ladder: a fired MLB manager can
  resurface managing in AAA, and a successful minor-league manager can get
  his first MLB shot — the same kind of story real baseball produces
  constantly.

## WBC National Team Managers

Extends the International Tournament & Nationality doc, which only
covered player eligibility before now. Good managers get called on to
manage their eligible country's national team — the same nationality-tag
mechanic already governs eligibility, just applied to managers instead of
players. Selection logic (how a federation picks among eligible managers)
not fully designed here — flagged as an open question, likely weighted by
managerial success/reputation once that's tracked.

## Hall of Fame Eligibility

Managers are eligible for the same Hall of Fame as players, voted on by
the same Writers Corps electorate — real MLB precedent supports this
directly (Bobby Cox, Joe Torre, Tony La Russa are all real Hall of Fame
managers). Requires its own **Hall case score** formula distinct from the
player version, since a manager's relevant record is wins, championships/
pennants, and tenure rather than batting or pitching stats. Same
eligibility/ballot mechanics (service time, retirement wait, 75% election
threshold, 10-year ballot, Legacy Committee) as the player track — just a
different underlying case-score formula. Update needed to the Awards &
Hall of Fame doc to formalize this as a parallel track.

## Open Questions

- Exact origin-split percentage (ex-player vs. outsider) — placeholder,
  needs a real number.
- Player retirement mechanic above is a minimal, functional default —
  flagged as open for a fuller design pass later if wanted.
- WBC manager selection logic — flagged, not designed.
- Manager Hall case score formula — flagged, not designed; needs an
  update to the Awards & Hall of Fame doc.
- Exact retirement age curve for managers — placeholder, needs tuning.
- Exact noise magnitude for Temperament's effect on effective slider
  values — structurally described above, not yet a real formula, needs
  tuning against a working sim like everything else.
