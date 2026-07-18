# Player Relationships & Affinity — v0.1

*Fills a real gap: several existing systems gesture at this without a
mechanism underneath — the original GUI mockup had a placeholder team
"chemistry" stat that was never defined, free agency decisions have been
implicitly money-only, and 10-and-5 rights (a player refusing a trade)
only makes narrative sense if something makes him want to stay. Also
directly answers the pre-draft NIL question: NIL is mostly for
already-drafted players, but can also be a relationship-building tool —
this doc is the mechanism that makes "relationship-building" mean
something concrete.*

## Two Affinity Dimensions Per Player

Kept to two, deliberately, rather than tracking deep individual
relationship pairs with every teammate and coach — enough to be real and
meaningful without becoming an N×M tracking problem.

- **Org Affinity** — how much a player likes his current organization.
  Accumulates with tenure, team success, and organizational investment
  in him specifically (a club funding his NIL pre-draft as a
  relationship-building gesture — see Player Pathway doc — is a direct
  input here, not just flavor). Also influenced by fit with his manager
  and teammates, folded into this single score rather than tracked as
  fully separate relationship pairs.
- **City Affinity** — how much a player likes living where the team is
  based. Distinct from Org Affinity on purpose — a player can love a
  city while playing for a bad team, or vice versa. Influenced by
  hometown proximity and heritage-community match (a player's
  nationality tags, per the Nationality doc, could plausibly boost
  affinity for a city with a strong community tie — e.g. a
  Cuban-heritage player in Miami).

## What Feeds Org Affinity

- **Tenure** — simple accumulation over time with one organization.
- **Team success** — winning seasons, deep Cup/Playoff runs, tie into
  the club's Tournament Quotient trajectory.
- **Team Reputation** (Team Reputation, Rivalries & Media doc) — playing
  for a storied, beloved franchise plausibly carries its own pull,
  independent of current performance, mirroring how that doc already
  treats reputation as separate from short-term results.
- **Organizational investment** — club-funded NIL specifically (Player
  Pathway / Financial Model: Expenses docs) is the clearest example: a
  team that invests in a prospect before he's even signed is building
  real affinity, not just buying a roster option.
- **Manager and teammate fit** — folded into this score rather than
  tracked separately (see above). A manager whose personality sliders
  (Managers doc) clash badly with a player's own makeup, or a run of
  contentious playing-time decisions, could plausibly drag this down.

## What Feeds City Affinity

- **Hometown/heritage proximity** — a player's birthplace or heritage
  nationality tags (Nationality doc) matching the team's city or a
  strong local community tie.
- Kept light deliberately — this isn't meant to be a deep simulation of
  urban preference, just enough to make "some players want to play in
  or near their hometown" a real, mechanically-grounded thing.

## Downstream Effects

- **Free agency decisions** — affinity becomes a real factor alongside
  money for AI-controlled players choosing between offers, rather than
  pure highest-bidder logic. Gives "hometown discount" and "took less
  money to stay" storylines a real mechanical basis instead of just
  flavor text.
- **Trade willingness** — low Org Affinity makes a player more likely to
  waive limited no-trade protections or request a trade himself (good
  Scripted Event material); high affinity makes 10-and-5 rights refusals
  (Player Movement doc) narratively earned rather than arbitrary.
- **Team Chemistry** — the placeholder team-level "chemistry" stat from
  the original GUI mockup now has a real basis: computed as an aggregate
  (likely just an average) of the current roster's individual Org
  Affinity scores, rather than being its own independently-tracked
  number.

## Open Questions

- Exact formula weighting each input into Org/City Affinity — not
  specced, needs real tuning once there's a working sim.
- Whether Manager and teammate fit deserve their own tracked sub-scores
  after all, rather than being folded into Org Affinity — deliberately
  simplified for v1, could be revisited if it feels too coarse in
  practice.
- How exactly free agency decision-making weighs affinity against money
  — structurally described, not a real formula yet.
- Whether affinity decays or resets on being traded (a fresh start
  effect) or carries some memory of prior orgs — not decided.
