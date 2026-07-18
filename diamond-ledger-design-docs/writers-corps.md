# The Writers Corps — v0.1

*Two jobs: (1) forms the simulated electorate for Hall of Fame voting,
replacing generic statistical noise with a real, structured, explainable
population of persona-driven voters; (2) provides named bylines for
League Wire news stories, giving the Scripted Event System's output real
narrative texture instead of anonymous reports.*

## Generation & Population

- One or more writers generated **per city** — not per metro, matching
  the League Structure doc's split-city naming (Dallas and Fort Worth
  each get their own writers, not a shared pool).
- Number of writers per city scales with that city's market size — bigger
  markets support more writers, consistent with how market size already
  drives revenue, team allocation, and other systems throughout this
  project.
- Each writer is attached to a fictional publication ("The New York
  Globe," per Christopher's example) — one or more outlets per city
  depending on size. Naming these outlets is a flavor/naming task,
  cross-referencing the still-open media-naming item in the Team
  Reputation, Rivalries & Media doc.
- Names drawn from the existing US name pool (Player Names & Bio doc) —
  writers assumed domestic/American for v1. International press for WBC
  coverage is flagged as a future scope extension, not needed until that
  tournament actually goes live (Season 4+, per the confirmed timeline).

## Writer Attributes

- **Age** — starts career young (placeholder: 24-30), ages each season.
- **Retirement & replacement** — soft retirement window (placeholder:
  increasing probability starting around age 60), replaced immediately by
  a newly generated young writer at the same outlet/city, keeping each
  city's writer population roughly stable over time. A simpler, lower-
  stakes version of the same "eventually ages out" concept flagged as
  deferred for players in the Player Pathway doc's retirement discussion.
- **Hometown/beat city** — the city a writer is generated for and covers.
  Kept simple for v1 (hometown = beat city); a "writer who covers a city
  different from where they grew up" layer is a possible future addition,
  not core.
- **Favorite team** — can bias voting and reporting (see Homerism below).
  A real, explainable source of imperfection rather than pure randomness —
  mirrors how real sportswriters aren't perfectly objective despite trying
  to be.
- **Personality sliders (1-100 each)**, four proposed:
  - **Traditionalism** — weights toward classic counting stats and the
    narrative "feel" of greatness (round-number milestones, postseason
    moments, the eye test).
  - **Analytics** — weights toward underlying performance value
    (correlates with Tournament Quotient-driven true talent over raw
    counting stats); a high-analytics voter may undervalue compilers and
    overvalue underappreciated but genuinely excellent players.
  - **Quirkiness/Contrarianism** — adds real unpredictability; a
    high-quirk voter is more likely to back a longshot or withhold a vote
    from a consensus lock just to be different.
  - **Homerism** — degree to which favorite-team/hometown affiliation
    biases a writer's vote or reporting, working together with the
    Favorite Team attribute above.

## Feeding Hall of Fame Voting

Replaces the generic "individual voter noise" concept from the Awards &
Hall of Fame doc with something structured and explainable: instead of
pure statistical noise around a Hall case score, each generated writer's
actual vote is computed from their personal slider values interacting
with the candidate's profile (counting stats vs. Quotient/analytics
profile vs. team history), then aggregated across the full writer
population to produce the final vote percentage. Keeps the same
"structure plus real randomness" pattern used elsewhere in this project,
but the randomness is now attributable to real, persistent personas
rather than an abstract dice roll. Requires a corresponding update to the
Awards & Hall of Fame doc's Simulated Electorate section.

## Feeding League Wire

Writers become named bylines for scripted-event news stories — e.g. "The
New York Globe's John Elliot reports on Tom Miller's broken arm and his
potential return right before the playoffs." A writer's beat city
naturally makes them more likely to report on that city's teams.
Personality sliders could eventually flavor story tone/angle (a Quirky
writer takes an unusual angle, an Analytics writer frames injury news in
performance-impact terms) — a nice-to-have for whenever actual story text
generation gets built, not a structural requirement now.

## Open Questions

- Exact number of writers per city / scaling formula by market size —
  deferred, needs real numbers.
- Publication naming per city — flavor/naming task, cross-references the
  open media-naming item in the Team Reputation, Rivalries & Media doc.
- Exact retirement age distribution and career-start age — placeholders
  above, need tuning.
- Whether international press should exist for WBC coverage — flagged as
  future scope, not needed until Season 4+.
- Exact formula for how sliders + favorite team convert into an actual
  simulated vote — structurally described above, not yet a real formula.
