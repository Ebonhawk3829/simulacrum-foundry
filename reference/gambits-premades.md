# Gambit's Premades — an idea source, not a dependency

WHY THIS FILE EXISTS

Gambit's Premades (`gambits-premades`, by gambit07) is installed in this world as a **compendium of
ideas** for the in-world agent to read from at its discretion — worked examples of automated spells,
items, features, and the awkward "third-party reactions" (Counterspell, Opportunity Attacks, Silvery
Barbs). It is **not** infrastructure for this world.

THE RULE

- **Draw from it; do not depend on it.** Read its items as worked examples and adapt their approach
  into our own documents. Do **not**: put GPS identifiers in a hand-authored ability, call GPS runtime
  functions, assume GPS is present, or treat a GPS item as the automation of record for an ability.
- Where GPS and **CPR** both automate something, **CPR is the reference** (`cpr-generic-config.md`);
  treat GPS as a second opinion.
- If an ability needs a reaction GPS is known for, read its item for the pattern, then build ours on
  the same stack we already use (midi workflow hooks, CAT events) — not on GPS.
- If an ability needs an **aura**, that is `aura-effects.md` / CAT's `aura`; GPS does not change that
  rule.

WHERE TO LOOK

GPS ships 18 Item/Actor compendiums in the world, browsable as `game.packs` (and via
`document_search` / `run_javascript`): Spells (+2024), Class Features (+2024), Items (+2024), Monster
Features, Generic Features (+2024), Homebrew Features/Items/Spells, Actors, Race Features (+2024), and
3rd Party Features/Items/Spells. The difficult reaction set sits mostly in the 2014/2024 and 3rd-party
packs.

WHAT IT IS

`gambits-premades` v3.0.5, Foundry 14.369–14, dnd5e 6.0.6+. It **requires** midi-qol, Aura Effects,
Sequencer and DAE (so it is present here). It is a **content library**: its behaviour lives in item
JSON, which the reference tools do not read — so read the items themselves, in the world, not a doc.
