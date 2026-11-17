# Upstream changelog — what changed since the world was last swept

WHY THIS FILE EXISTS

The reference files (`cat-macro-flags.md`, `cat-embedded-macros.md`, `cpr-generic-config.md`,
`midi-reactions.md`, `dnd5e-6.0-fields.md`, `dae-effect-expiry.md`) describe CAT, CPR, midi-qol and
DAE **as they are now**. They are current-state, not history: once they are synced to the pinned
versions, they already say how everything works.

This file is the other half — the upstream changes made **since the world's abilities were last
checked** against them, so a search can find what a bump might have broken.

It is **overwritten at each sync, never appended.** Once the world has been swept against a change,
that entry has done its job and is dropped; the reference files carry the new state from then on. So
this file should always be small — only what is still outstanding.

HOW TO USE

- Each entry names the mechanism and a **Look for** line: the key to search the world for
  (`document_search` over items, or a scan of `flags.cat` / `flags.midi-qol`).
- Sweep the world against these, then the next sync overwrites the file with the next delta.

PINNED

- Reference synced to **CAT 0.1.8**, **CPR 2.1.8**, **midi-qol 14.6.13** and **DAE 14.6.10**
  (midi 14.6.13 requires DAE ≥**14.6.7** and is dnd5e **6.0.x only**, max 6.0.999; CPR 2.1.8 requires
  CAT 0.1.8). midi and DAE are on **GitHub** (`latest-dnd6`).
- **midi 14.6.13 is the LAST 14.6 release.** 14.7.0 onward require dnd5e **6.1**; a world staying on
  dnd5e 6.0 installs 14.6.13 from `releases/download/v14.6.13/module.json`. This is the terminal midi
  for the 6.0 line — the next midi update is a 6.1-only release.
- **This delta:** midi **14.6.10 → 14.6.13** and DAE **14.6.8 → 14.6.10**. Everything up to midi 14.6.9
  / DAE 14.6.8 / CAT 0.1.8 / CPR 2.1.8 was swept in world and is **not** repeated here.

---

## Review checklist — the questions to ask the world

- [ ] **Item's own macro no longer runs implicitly** (midi 14.6.11) — an item's own macro is **no longer
      run automatically** after active effects when its *On Use Macros* list is empty (the 14.6.5
      behaviour is reverted; it double-ran macros the item's effects already called). To run it on use,
      add an entry to *On Use Macros* — leave the macro name blank to mean the item's own macro.
      **Look for:** an ability that "stopped firing" after this update because it relied on the implicit
      run.
- [ ] **Workflow rebuilt from a card** (midi 14.6.11) — a rebuilt workflow keeps the item and activity
      its use ended with (`workflow.item`, `workflow.activity`), including a modified copy a macro
      swapped in and an upcast spell at its cast level; a card button pressed afterwards runs that copy,
      not the item's original. New hook **`midi-qol.workflowRebuilt`**`(workflow, card, { readOnly })`.
      **Look for:** macros reading `workflow.item`/`workflow.activity` after a reload, or swapping in a
      modified activity.
- [ ] **`MidiQOL.socket()`** (midi 14.6.11) — no longer refuses or warns about calls by the caller's
      role (the check ran only in the caller's own client, so it protected nothing); `executeForOtherGMs`
      works again (it was misspelled `executeForOtherGMS`; the old name still works). **Look for:** the
      misspelled name, or a macro that worked around the role check.
- [ ] **Undrawn targets now take part** (midi 14.6.11) — a use given targets that aren't drawn (another
      scene or level) keeps them: they save and take damage, and `MidiQOL.DamageOnlyWorkflow` no longer
      drops them. **Look for:** abilities that assumed an unseen target was dropped, and code that
      compensated for it.
- [ ] **Untyped damage is "No Type"** (midi 14.6.11) — damage with no type, in a use with nothing typed
      to take its type from, is midi's **No Type: applied in full, with no resistance**. It used to be an
      unknown type — sometimes the type of whatever use ran last, so that use's resistances applied.
      **Look for:** macros rolling untyped damage.
- [ ] **`MidiQOL.applyTokenDamage`** (midi 14.6.11) — now gives a target that saved the activity's save
      multiplier (full/half/none), not the default. **Look for:** calls to `MidiQOL.applyTokenDamage`.
- [ ] **Waiting on players** (midi 14.6.11) — midi can show, in Foundry's player list, which players it
      is waiting on (a lightning bolt for reactions, a d20 for rolls) and lets the GM answer for them;
      macros can add their own with **`MidiQOL.playerWaits`** (see `MACROS.md`, *Waiting on Players*).
      **Look for:** a reaction/save prompt that a GM should be able to answer on a player's behalf, and
      any prior workaround.
- [ ] **Area heights** (midi 14.6.11) — an area placed at a point (Fireball, Moonbeam, a wall) is
      measured from the **floor** of its level by default (new optional rule *Height of Areas Placed at
      a Point* → *Template Origin Height* uses the caster's height; an activity can pick *Floor of the
      level* on its Region Behavior tab); an area stays within its level (a floor or ledge between the
      origin and a creature shields it), a sphere or emanation reaches only its true height from its
      centre, and an emanation reaches below the feet and above the head. **Look for:** anything that
      depends on where an area was drawn, its template-origin height, or its elevation.
- [ ] **Massive damage** (midi 14.6.13) — with *Enforce death saves* on, a **character** dropped to 0 hit
      points **dies outright** when the damage left over equals or exceeds its hit point maximum: three
      death save failures and the Dead status. Undo on the damage card reverses it, and the card's
      multiplier (×2 and so on) counts the failures as the first application does. Characters only — not
      with the vitality item, which takes the overflow. **Look for:** anything that assumed "0 HP =
      unconscious" and never a straight death.
- [ ] **Stanching wounds** (`flags.midi-qol.stanch`, midi 14.6.13) — a new flag on an effect (its own
      flag, or a change with that key) marks an effect a **check** can end: `dc` (default 15), `skill`
      (default `med`), `range` (default 5), `healing` (`none`|`spell`|`magical`|`any`). It ends when the
      affected creature rolls that skill and reaches the DC, or when a creature within range rolls it
      with the affected creature targeted (a Medicine roll from the sheet is enough); `healing` says
      whether restoring hit points also ends it. **Look for:** a hand-rolled bleeding/wounded effect that
      should use this instead.
- [ ] **midi sample items handed to CPR** (midi 14.6.13) — midi **removed** its sample copies of *Aid*,
      *Chill Touch*, *Command*, *Dragon's Breath*, *Guiding Bolt*, *Mass Cure Wounds*, *Pass without
      Trace*, *Radiant Strikes*, *Sanctuary*, *Shield*, *Thunderwave*, *Toll the Dead*, and the actions
      *Check Cover*, *Generic Actions*, *Hide*, *Influence*, *Knock Out*, *Ready*, *Shove*, *Squeeze*,
      *Study*, *Suffocation*, *Underwater*, in favour of CPR 2.1.8's. Copies already on actors keep
      their macros until 14.8.0. **Look for:** a world item that is a copy of one of those; switch it to
      CPR's automation (CAT's CatKit → apply CPR). Also: midi's *Search* now finds creatures hidden with
      CPR's *Hide*, and midi tests for CPR 2.1.8 correctly (it had checked a version named "2.1.18").
- [ ] **DAE macro change with a non-string value** (DAE 14.6.10) — a `macro.itemMacro` /
      `macro.activityMacro` / `macro.execute` change whose **value is a number or boolean** (Foundry 14
      stores `0` as a number) threw `change.value.startsWith is not a function` and **never ran**; it now
      runs with that argument. **Look for:** an effect whose `macro.*` change value is a number (e.g.
      `0`) or `true`/`false`.
- [ ] **`@item.classIdentifier` in an applied effect** (DAE 14.6.10) — it was not filled in for
      **spells**; it now is. **Look for:** an applied effect referencing `@item.classIdentifier`.

---

## midi-qol 14.6.13

**The last 14.6 release** — 14.7.0 onward need dnd5e 6.1 (see PINNED). The audit items are in the
checklist; the rest:

- **Massive damage** (checklist) and **stanching wounds** (`flags.midi-qol.stanch`, checklist) are the
  two new features. The sample *Infernal Glaive*, *Infernal Tail*, *Devil's Glaive*, *Wounding Weapon*
  and *Longsword of Wounding* use `stanch`; their wounds can be stanched by a creature within 5 feet, and
  *Devil's Glaive* no longer prompts at the start of the turn.
- **Fixed:** a check activity that names no ability, skill or tool threw and scored the target 1 (it now
  rolls a d20 with no modifier); with **CAT 0.1.8**, an item with a cast activity made every effect
  pointing at it throw in CAT's effect hook (midi's workaround now covers 0.1.8); an item using **CPR's
  Hide** macro was tested against a CPR version named "2.1.18" and so was handled as older CPR on CPR
  2.1.8 (now correct); damage a macro set above the target's remaining HP logged a damage-list error; a
  sample item dragged from the compendium showed in CAT's CatKit as not automated.
- **Sample items removed** in favour of CPR 2.1.8 (checklist).
- *(14.6.12)* *List Gambit's Premades prompts in the player list* is **off** by default.

## midi-qol 14.6.11

A large release; the audit items are in the checklist. The rest:

- **Waiting on players** (checklist) — plus a settings trio on the GM tab, all on: *GM can answer for
  players*, *Players see who midi is waiting for*, *List Gambit's Premades prompts in the player list*
  (now off by default as of 14.6.12).
- **Macros:** the implicit item-macro run removed (checklist); the card-rebuild and `workflowRebuilt`
  changes (checklist); `MidiQOL.socket()` (checklist).
- **Countdowns:** dialogs that answer themselves when time runs out (reactions, optional bonuses,
  choose-an-effect, a player's timed-out save) show a draining timer with a **pause** button; pausing a
  reaction also holds the attack waiting for it.
- **Dialogs:** the reaction dialog is titled with the reacting token's name, shows each reaction with
  its item's picture, has a *No reaction* button, and **Enter declines**. Fixes to target confirmation
  (stray *Clear*, Enter, off-screen), optional-bonus rerolls (Enter keeps the new roll), the
  settings-preset preview, and settings/Trouble Shooter import.
- **Saves/reactions:** a card-requested save is answered only by the requested kind of roll; a GM
  rolling a save/Active Defence/contested roll for a player uses the **player's** roll mode; a GM using
  a cross-scene reaction/area/teleport (or an item for a creature off their view) is asked to view the
  scene first (self-only reactions work anywhere); undrawn targets keep saves and damage, untyped damage
  is "No Type", and `applyTokenDamage` uses the activity's save multiplier (checklist).
- **Area heights** (checklist).
- **Removed:** ddb-game-log support.

## midi-qol 14.6.10

- Reinstated the tab labels and language entries 14.6.9 shipped without.

## DAE 14.6.10

Mostly **dnd5e 6.1** work — a condition builder for rule changes, damage-type lists for the
ignore/downgrade rules, and a migration of the attacker trait keys (`system.traits.idi` / `idr` / `idv`)
into dnd5e 6.1's damage rules — **none of which applies on dnd5e 6.0**. What applies here:

- **Fixed:** a `macro.*` change whose value is a number or boolean threw `change.value.startsWith is not
  a function` and never ran (checklist); `@item.classIdentifier` in an applied effect was not filled in
  for spells (checklist); changing a change's **key or type** kept the previous value in the value list;
  an **enchantment's rider effect** applied to a creature kept dnd5e's rider mark, so its data
  preparation threw and it could not be deleted cleanly.

## DAE 14.6.9

- A module reading a bonus path dnd5e 6 moved (`bonuses.rsak.attack` and the like) now gets **one
  deprecation warning per path**, not one for every place it reads it. Behaviour unchanged — nothing to
  sweep.
