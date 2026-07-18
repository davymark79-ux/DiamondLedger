# Fantasy Baseball Sim — Design Doc (v0.1)

*Living document. Update as decisions get made; move settled items out of "Open Questions" and into the relevant section.*

## Vision

A management-focused baseball simulation in the spirit of Out of the Park Baseball — deep, robust sim engine, no game-watching required, results delivered as box scores and reports. The core departure from OOTP: a fantasy world with a dynamic, expandable league pyramid (promotion/relegation, English-soccer style) rather than MLB's fixed structure, plus scripted real-world drama systems (injuries, firings, relocations, expansion, CBA negotiations).

## League Structure

- **Tier 1 (MLB):** 30 teams
- **Tier 2 (MLB2):** 20 teams
- **Below Tier 2:** full minor league system (affiliated, standard farm structure — not yet part of the promotion/relegation pyramid)
- **Future tiers:** room to add more major-league tiers above/below MLB2 over time (possible "AAAA" tier as a relegation landing spot), plus eventual college and international layers
- **Promotion/relegation:** MLB2 promotion/relegation is a genuine departure from real MLB — alt-history mechanic. Open question on where relegated MLB2 teams land until a lower major tier exists.

## Tournaments

- **In-season knockout tournament (FA Cup-style):** spans the season, open across tiers. Christopher has scheduling ideas already in mind that simplify the usual cross-tier calendar conflict problem — to be documented once specced.
- **International tournament (WBC-style):** occurs before every 4th season. Creates player-availability and injury-risk tradeoffs (rest a starter vs. field a competitive national roster).

## Financial Model

- **Two independent knobs:** market size (soft cap on sustainable payroll/revenue) and owner wealth (lets a team temporarily exceed market constraints).
- A small-market team with a wealthy owner can punch above its weight, at cost (luxury tax, debt service, etc.) — most teams remain market-constrained.
- Over-leveraged, rich-owner teams are a natural source of bankruptcy/relocation drama (one bad decision or ownership change away from crisis).
- Feeds into: stadium builds (capacity/revenue tied to a construction timer, financed via debt or ownership cash), relocation, bankruptcy, expansion petitions (market size + ownership wealth + league vote logic).

## Scripted Event System

Design as one generic framework — conditions + probabilities + effects — rather than bespoke code per event type. Known event categories:
- Player injuries (season-ending, career-ending; extremely rare career-ending "accident" abstracted, no graphic detail, off by default)
- Coaches fired (triggered by win%, chemistry, owner patience)
- Teams leaving cities / bankruptcy (financial model driven)
- Ownership groups petitioning for expansion
- New stadium builds
- Dynamic CBA negotiations (periodic event: simplified negotiation model between owner-side and player-side preferences — minimum salary, arbitration, free agency timelines, luxury tax; simplified rather than full game-theoretic, with possible strike/lockout risk)

## Sim Engine

- **Resolution:** plate-appearance level, not full pitch-by-pitch. Batter/pitcher ratings + matchup modifiers produce an outcome from a probability table.
- **Pitcher fatigue:** tracked by pitch count (e.g., "5.2 IP, 96 pitches"), feeding an injury-risk check at fatigue thresholds.
- **Output:** aggregated box scores, not play-by-play detail — matches OOTP's "don't need to watch" philosophy while still producing realistic season-long stat lines.
- **Ratings model:** 20-80 scout-style ratings (contact, power, eye, defense, etc.) plus separate potential/development traits, similar to OOTP. This schema underpins injuries, aging, trade value, and CBA arbitration value.

## Build Sequencing

1. Player/Team/League data schema
2. Plate-appearance outcome engine — validate it produces realistic stat lines over a full simulated season before building anything else
3. Layer in: pyramid movement (promotion/relegation), scripted event framework, CBA negotiation
4. Multi-tier tournament scheduling
5. Expansion to additional major tiers, college, international

## Open Questions

- Where do relegated MLB2 teams land before a lower major tier exists?
- Fixed promotion/relegation counts, or scaled to financial gap between tiers?
- Parachute payments for relegated teams, or sink-or-swim?
- In-season tournament scheduling mechanic (Christopher has an approach in mind — needs to be documented)
- Single sprawling pyramid vs. multiple parallel national pyramids long-term (currently leaning single pyramid, MLB/MLB2/minors as the seed)

## Architecture Notes

- Likely outgrows single-file artifact scope once sim engine + multi-league logic mature — plan to move to a proper multi-file codebase (Claude Code) with separate modules for: sim engine, league/schedule manager, financial model, event-script engine.
- Use this Project for design docs and lighter prototypes (e.g., a quick standings simulator to sanity-check promotion/relegation math) before the full build starts.
