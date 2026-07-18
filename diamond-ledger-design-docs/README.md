# Diamond Ledger — Design Doc Index

*Master reference for the full design doc set. Start here. Also see
`baseball-sim-design-doc.md` (the original master vision doc — living
doc, mostly superseded in detail by the docs below but still the source
of the overall Vision, Build Sequencing, and Architecture Notes) and the
`diamond-ledger-scaffold` GUI project (Vite + React + Tailwind) for the
existing no-logic front-end shell.*

**Recommended build order**, per the original design doc's Build
Sequencing section, now much better informed:
1. Player/Team/League data schema — start here. `league-structure.md`,
   `player-attributes-and-development.md`, and `player-names-and-bio.md`
   define most of what the schema needs to hold.
2. Plate-appearance outcome engine — validate against a full simulated
   season before anything else. `player-attributes-and-development.md`
   (Growth Model, In-Game Performance Consistency, Hot/Cold Streaks) and
   `injuries.md` feed directly into this.
3. Layer in promotion/relegation, the Scripted Event framework, and CBA
   negotiation — `league-structure.md`, `cba-negotiation.md`.
4. Multi-tier tournament scheduling — `season-calendar.md`,
   `in-season-tournament.md`, `league-playoffs.md`.
5. Expansion to additional tiers, college, international —
   `expansion.md`, `rookie-league.md`, `independent-league.md`,
   `international-club-championship.md` (all future/speculative, lowest
   priority).

## League Structure & Identity
- `league-structure.md` — market allocation algorithm, the 50-team
  roster, Foundry/Exchange league identities, fan ownership (51%+ model)
- `team-reputation-rivalries-and-media.md` — lifetime reputation,
  rivalry intensity (permanent floor + decaying earned component), RSN/
  broadcast structure

## Players
- `player-attributes-and-development.md` — 20-80 rating schema, growth
  model, Work Ethic, Consistency, Hot/Cold Streaks, true vs. scouted
  potential
- `player-names-and-bio.md` — name generation, handedness, height/weight
- `player-pathway.md` — HS/college/international amateur pathway, draft-
  and-follow, NIL, free agency
- `player-relationships.md` — Org Affinity, City Affinity, trade
  willingness, team chemistry
- `player-movement.md` — trades, waivers, options, DFA, Rule 5, service
  time/free agency, 10-and-5 rights

## Minors & Player Development Pipeline
- `minor-leagues.md` — AAA/AA/A/Rookie affiliate structure, full basic
  sim, regional affiliation rules
- `rookie-league.md` — 4th tier, regional hubs, age/service caps
- `independent-league.md` — future/speculative, not at launch
- `scouts.md` — scouting specialization, Scouted Potential accuracy
  mechanism
- `writers-corps.md` — HOF electorate, League Wire bylines

## Competitions
- `in-season-tournament.md` — the Cup: group stage, knockout, Tournament
  Quotient-based seeding
- `tournament-quotient.md` — bounded Elo rating system
- `league-playoffs.md` — 4-team-per-league playoff bracket, MLB2
  bragging-rights championship
- `international-tournament-and-nationality.md` — WBC, nationality
  tags, declare-and-lock
- `international-club-championship.md` — future/speculative Champions
  League-style tournament
- `awards-and-hall-of-fame.md` — season awards, milestone-naming,
  Hall of Fame

## Franchise Operations
- `commissioner-vision-and-roster-rules.md` — commissioner game framing,
  40/50-man roster, Taxi Squad, roster expansion
- `commissioner-interface.md` — decision-point vs. informational events,
  natural-language shortcut
- `cba-negotiation.md` — CBA as living document, freeform LLM
  negotiation, ratification voting
- `expansion.md` — expansion cadence and process
- `managers.md` — manager generation, strategic sliders, Streak Read,
  Temperament
- `stadiums.md` — capacity/quality/roof type, tier minimums, compliance
  deadlines (with auto-relegation), financing

## Financial Model
- `financial-model-revenue.md` — gate, local media (with real 48/52
  revenue-sharing split), national media, Cup/Playoff payouts
- `financial-model-expenses.md` — payroll, salary floor, luxury tax,
  owner wealth, NIL, front office

## World Systems
- `season-calendar.md` — full season sequence, 150-game regular season,
  doubleheader math
- `weather.md` — climate simulation, roof types, rainouts

## Status Notes

- Every doc has been through a structured review pass resolving 25+
  cross-cutting open questions — see conversation history for the full
  reasoning behind each resolution if needed.
- Remaining open items in each doc fall into three categories: (1) pure
  numeric tuning placeholders that genuinely can't be set without a
  working sim to calibrate against, (2) flavor/naming/bulk data-
  generation tasks explicitly deferred to this build phase, (3) a small
  number of genuinely deferred future-scope systems (Independent League,
  International Club Championship) not needed at launch.
- Cross-references between docs are current as of this index's creation
  — if you edit one doc during the build, check for docs that reference
  it.
