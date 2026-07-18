# Diamond Ledger — GUI Scaffold

A no-logic front-end shell for the fantasy baseball sim described in the
project's design doc. Every screen is wired to static mock data in
`src/data/mockData.js` — there is no simulation, scheduling, or event engine
behind any of it yet. The point is to nail down the interface first.

## Stack

- Vite + React + React Router
- Tailwind CSS v4 (theme tokens live in `src/index.css` under `@theme`)
- lucide-react for icons

## Running it

```bash
npm install
npm run dev
```

## Structure

```
src/
  components/     Sidebar, TierBadge, PageHeader — shared chrome
  pages/          One file per screen (Overview, Standings, Teams, ...)
  data/mockData.js  Deterministic placeholder data — 30 MLB + 20 MLB2 teams,
                     standings, a scripted event feed, fixtures, cup rounds
```

## Screens included

- **Overview** — league snapshot, upcoming fixtures, wire feed
- **Standings** — the promotion/relegation banded table (the design's
  signature mechanic). Zone sizes (`RELEGATION_COUNT`, `PROMOTION_COUNT` in
  mockData.js) are placeholders — this is an open question in the design doc.
- **Teams** / **Team Detail** — directory + placeholder team page
- **Schedule** — fixture list, all marked "Unplayed" since there's no sim
- **Cup** — round-by-round progress for the in-season knockout tournament
- **Financials** — market size vs. owner wealth, the two-knob model
- **League Wire** — scripted event feed (injuries, firings, expansion,
  stadiums, CBA), filterable by type

## Suggested next steps (see design doc's Build Sequencing)

1. Replace `mockData.js` with a real Player/Team/League data schema
2. Build the plate-appearance outcome engine as a standalone module, validate
   it against a full simulated season *before* wiring it into any screen
3. Swap the Standings/Schedule/Teams pages over to real data once the schema
   and engine exist
4. Layer in promotion/relegation movement logic, then the scripted event
   framework, then CBA negotiation
5. Multi-tier tournament scheduling for the Cup screen

## Design notes

Palette and type choices are in `src/index.css`. Concept: a front-office
ledger/scoreboard rather than a generic SaaS dashboard — deep field-green
shell, parchment panels, agate-style monospace for stat columns, a condensed
display face for headers. The standings page's dashed promotion/relegation
cut lines are the one deliberate signature element; everything else stays
quiet around it.
