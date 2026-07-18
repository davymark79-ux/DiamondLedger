# Commissioner Interface: Scripted Events & Decision Points — v0.3

*Answers a genuinely central gameplay question that's been implicit since
the Commissioner Vision doc's original framing ("commissioner, not
GM/owner") but never made concrete: what does the player actually *do*,
turn to turn?*

## Two Categories of Scripted Event

The main design doc's Scripted Event System (conditions + probabilities +
effects) already covers *what* can happen. This doc covers how the player
experiences it:

- **Informational events** — the majority of what the League Wire
  (Writers Corps doc) already covers: injuries, day-to-day roster moves,
  AI-vs-AI trades, minor firings, most Cup/tournament results. These
  simply happen and get reported. No commissioner input needed or
  expected — the player observes, doesn't intervene.
- **Decision-point events** — the real commissioner moments: expansion
  petitions, CBA ratification, relocation/public-funding disputes
  (Stadiums doc), rule changes, tournament format adjustments,
  promotion/relegation zone size changes. These present as an **actual
  choice with defined options** — Approve / Deny / Request more
  information, or similar — not open-ended free text. This is what makes
  "commissioner, not GM" a real gameplay loop rather than flavor text:
  the player isn't managing a roster, they're ruling on the things that
  shape the whole league.

## Natural-Language Shortcut (recommended scope)

A prompt bar that routes natural-language input to **existing structured
decision points**, not a system that invents new game logic on the fly.
Typing "expand to Portland" or "raise the luxury tax threshold" should
resolve to the exact same flow a menu selection would reach — a UI
convenience layer on top of systems that already exist, not new game
logic. Genuinely valuable, low-risk, and buildable without changing what
kind of product this is.

## Open-Ended Rule-Suggestion System (explicitly NOT recommended for launch)

A fully open "suggest any change to the rules" system is a fundamentally
different, much bigger commitment — it would require the shipped game to
run a live LLM interpreting arbitrary suggestions and dynamically
modifying game state/logic in response, with real guardrails against
nonsensical or game-breaking interpretations. This is a genuine future
ambition, not a scoped feature — flagged as explicitly out of scope for
an initial build, worth revisiting once the core game is stable and
proven.

**Related, but resolved differently than expected: CBA Negotiation
(`cba-negotiation.md`).** Christopher wants a genuinely freeform,
LLM-mediated negotiation for the CBA specifically — a live union LLM
generating demands, the commissioner reacting or proposing in real
back-and-forth. Initially filed under this same ambitious category, but
that doc resolves the key risk by **bounding the negotiation to an
already-catalogued list of known parameters** rather than allowing
genuinely new rules to be invented — meaning it never actually requires
a runtime code change, and turns out to be closer to an elaborate
version of the natural-language shortcut above than to true open-ended
rule rewriting. Worth reading that doc's Scope section for the full
reasoning.

## Open Questions

- Exact list of which event types are decision-points vs. purely
  informational — the categories above are a starting framework, not a
  complete enumeration.
- UI specifics for how decision-point events are surfaced (a queue? a
  notification? blocking vs. non-blocking?) — not designed here, a build-
  time concern.
- Natural-language shortcut's exact scope (which decision points it can
  route to) — not enumerated, presumably grows over time as more
  decision-point systems get built.
