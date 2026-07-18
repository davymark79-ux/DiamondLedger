# Player Pathway: Amateur Development to Pro — v0.5

*Covers how a player gets from creation to the majors. Builds directly on
the existing Minor League System doc (AAA/AA/A affiliate structure) and the
Nationality doc (tags assigned at creation). No college or international
amateur games are simulated — development happens as a modeled outcome,
the same way the Scripted Event System models injuries or firings, not as
an actual simulated season.*

## Player Creation

- **American players** are created as HS seniors, age 17 or 18. No HS
  season is simulated — ratings and potential are rolled directly at
  creation.
- **International players** are created at 17 or 18 within the
  international system, drawn from a country-weighted table skewed toward
  real-world baseball-strong nations (heavy from Dominican Republic,
  Venezuela, Japan, Mexico, Puerto Rico, Cuba, South Korea; light/rare from
  marginal baseball nations like Czechia). Exact weighting table TBD,
  alongside the broader player-gen numbers pass.
- **Nationality tags** are assigned at creation per the confirmed flow in
  the International Tournament & Nationality doc (birthplace + weighted
  heritage tags).
- **Names** are localized to the player's nationality/ies — a lookup-table
  problem, not a generative one.

## College System (Division 1 only, for now)

- **Abstracted development location, not a simulated league.** No
  schedules, no box scores, no actual games played out. A school is a named
  entity that modifies a player's development curve, nothing more.
- A defined roster of named D1 programs — enough to be "a robust feeder"
  for the pro pyramid. Since no games are simulated per school, the exact
  count is a naming/flavor decision, not a performance one — can be as
  large as feels right without any simulation cost.
- Each school carries:
  - A **prestige/reputation tier** — powerhouse programs accelerate overall
    development more than obscure ones.
  - Optional **specialty tag(s)** — e.g. a "pitching factory" boosts
    SP-relevant attribute growth specifically. A small set of specialty
    archetypes (pitching factory, hitting academy, defense-first, etc.),
    reused across many schools rather than a unique tag per program.
- Players get a development modifier applied to their normal development
  curve each college year, based on the school's prestige and how well its
  specialty matches the player's role.
- **4 years of eligibility.** A single medical redshirt season is possible
  if a player appears in fewer than 25% of games in a season. Since there's
  no literal per-game college sim, this needs a simple proxy (e.g. an
  injury flag check) rather than tracked box scores — TBD at build time.

## Draft (NHL-style draft-and-follow) & International Draft

- **US players may be drafted at any point after creation** — as an HS
  senior, or at any point during their college career, no restriction on
  timing.
- Drafting grants the team **rights** to that player. The player may keep
  playing college ball while the team holds those rights, exactly like NHL
  draft-and-follow.
- At each eligible juncture (end of a college season once drafted, or
  whenever a pro contract is offered), the player decides whether to sign
  or stay in college, weighing:
  - The value of the minor-league contract offered, vs.
  - The value of staying — NIL earnings plus continued development plus
    remaining eligibility.
- **International players use a separate international draft**, distinct
  from the regular (domestic) draft above. This is the primary route for
  signing a player straight out of the international academy system
  without a college stop.
- If an international player is instead accepted to a US college, they
  fold into the standard American pathway from that point on — same 4-year
  eligibility, same regular draft rules, same NIL/stay-or-sign decision.
- **Resolved:** a team's rights to a drafted player persist through his
  entire college career. Once he completes college (4 years + redshirt),
  the team must make an active choice — **assign** him to a level within
  their organization, or **release** him (terminology note: "waived"
  specifically implies other teams get a claim window before release, a
  real but separate mechanic — "release" is the more accurate term here
  unless a full waiver-claim system gets added later, which is a further
  open question of its own). A released player becomes a free agent under
  the same terms as an undrafted graduate.
- Deferred to a dedicated draft-mechanics pass: draft order, round count,
  timing/scheduling of both drafts, signing deadlines.

## Free Agency & Retirement

Every amateur pathway now has a defined exit — no player is stuck in limbo
indefinitely:

- **US players**: if a player completes college (4 years, plus redshirt if
  applicable) without ever being drafted, he becomes a free agent —
  signable by any team at any time — or retires (retirement mechanism
  itself deferred to a later discussion).
- **International players**: if a player is neither accepted to a US
  college nor drafted via the international draft **within 3 years of
  creation**, he becomes a free agent under the same terms, or retires.
- Retirement mechanics (what triggers it, whether it's ever a real
  alternative to free agency for young undrafted players, etc.) — deferred,
  to be discussed later per Christopher.

## NIL System

- A value system existing outside the formal minors/majors contract
  structure — represents why a talented player might stay in college
  longer than otherwise made sense.
- Currently just a comparison value feeding the stay-or-sign decision above
  (school prestige + player quality/fame + market, roughly). Not yet a
  detailed financial model — deferred.

## Post-Development Assignment

- Once a player signs professionally — straight out of HS/international
  academy, or after college — they're assigned to their signing team's
  appropriate minor-league affiliate level based on current development
  state. **Resolved for the youngest signees**: HS draftees who sign
  directly (bypass college) and international draftees typically start
  at **Rookie**, the new 4th minor league tier (`rookie-league.md`) —
  the natural, realistic entry point given how young and unpolished this
  group is. A polished college senior might start at AA or AAA instead.
  Exact assignment logic for the middle ground (less-polished college
  players, older international signees, etc.) still TBD.
- From there, standard MiLB progression takes over — now Rookie → A → AA
  → AAA → MLB — until MLB-ready.

## International Pathway

International players are created directly into their respective
international system (the academy-style development location, same
abstracted non-simulated approach as college, structured per-country).
From there, within **3 years of creation**, one of three things happens:

1. **Accepted to a US college** — folds into the standard American
   pathway (see Draft section above) from that point forward.
2. **Drafted and signed via the international draft** — Season Calendar
   doc confirms this as a two-step process: Draft Day, a short signing
   window, then a Signing Day deadline. A player drafted but not signed
   by Signing Day does not count toward this branch — he falls to option
   3 below instead. Once signed, he enters the minors/majors system
   directly without a college stop.
3. **Neither happens by year 3** — becomes a free agent or retires (see
   Free Agency & Retirement above).

## Worked Example

Joe Smith, a highly-rated HS senior SP, enrolls at Western State
University — a fictional program with a "pitching factory" reputation.
Over 4 years, his SP-relevant ratings grow faster than they would at a
generic program, thanks to WSU's specialty modifier. After his junior
year, the NY Foundry club drafts him, gaining his rights. He's offered a
minor-league contract but opts to stay for his senior year instead, since
his NIL valuation exceeds the offer. After graduating — still under NY
Foundry's control — he's assigned to their A-level affiliate and continues
developing as a starter, eventually reaching the majors.

## Deferred / Open Questions

- Exact number and naming of D1 programs, and the specialty-tag taxonomy
  (how many archetypes, how strong each modifier) — flavor/build-time
  decisions, no simulation cost either way.
- Redshirt participation-tracking proxy, since there's no literal per-game
  college sim.
- Full draft mechanics — order, timing, rounds, signing deadlines for both
  the regular and international drafts — deferred to its own design pass.
- Whether a full waiver-claim system (other teams able to claim a player a
  club releases, rather than a straight release to free agency) gets added
  later — flagged as a possible future refinement, not decided.
- NIL valuation formula — deferred, currently just a conceptual lever.
- Minor-league assignment-level logic — partially resolved (youngest
  signees start at Rookie, see Post-Development Assignment above); the
  middle ground between "fresh HS/international signee" and "polished
  college senior" still TBD.
- International academy system structure/tiers per country — mirrors
  college's prestige/specialty concept, not yet detailed.
- Country-weighting table for international player generation — TBD, next
  up alongside the broader player-gen numbers pass.
- Retirement mechanics — deferred to a later discussion.
