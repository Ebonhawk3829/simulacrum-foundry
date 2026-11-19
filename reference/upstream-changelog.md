# Upstream changelog — what changed since the world was last swept

WHY THIS FILE EXISTS

The reference files describe CAT, CPR, midi-qol, DAE and dnd5e **as they are now**. They are
current-state, not history. This file is the other half — the upstream changes made **since the world's
abilities were last checked**, so a search can find what a bump might have broken.

HOW TO USE

- Each entry names the mechanism and a **Look for** line: the key to search the world for.
- **Overwritten at each sync, never appended — and cleared once a build is released.** The release
  carries this file and the world is swept straight away, so the local copy is reset to this header
  after publishing.

PINNED

- Reference synced to **dnd5e 6.1.1**, **midi-qol 14.7.0**, **DAE 14.6.10**, **CAT 0.1.9**, **CPR 2.1.9**
  (`auraeffects` 2.3.0 and `gambits-premades` 3.0.5 are the second-class options).
- **This is the dnd5e 6.1 move.** midi **14.7.0** requires dnd5e **6.1.0–6.1.999** and DAE ≥14.6.10;
  a world on dnd5e 6.0 stays on midi 14.6.x. CAT 0.1.9 and CPR 2.1.9 also require dnd5e 6.1 + midi 14.7
  + DAE 14.6.10. So the whole stack moves together.

---

## Review checklist — the questions to ask the world

- [ ] **Attacker damage rules replace the trait flags** (dnd5e 6.1 / DAE 14.6.10) — dnd5e 6.1 adds
      *ignore* and *downgrade* rules for immunity/resistance/vulnerability, and they sit on the
      **attacker**, not the target. DAE's `system.traits.idi` / `idr` / `idv` (ignore the target's
      immunity/resistance/vulnerability) are **deprecated**; DAE 14.6.10 migrates them. **Ignoring
      immunity now gives FULL damage (it was half).** **Look for:** effects using `system.traits.idi/idr/idv`
      or a feature that "ignores resistance/immunity" — check the migrated rule and the half→full change.
- [ ] **Falling damage resistance/immunity/vulnerability** (dnd5e 6.1) — new trait sub-category for
      **falling** damage. **Look for:** effects/features about falling or Slow Fall.
- [ ] **Antimagic** (dnd5e 6.1 / CAT 0.1.9 / CPR 2.1.9) — a status + region behavior; an item knows
      `item.magicAvailable` (no attunement it needs, or under antimagic). CAT's **magical auras and
      regions skip antimagic creatures and stop while their source is in antimagic**; CPR suppresses
      spell/magic-item effects and hides magic-item activities while magic is unavailable; midi's
      magical area activities don't affect an antimagic creature. **Look for:** anything that applies
      magic through an aura/region, or a change that should read `item.magicAvailable`.
- [ ] **dnd5e breaking changes** (6.1) — the `dnd5e-textFormat` Handlebars helper and the `formatText`
      utility were **removed without deprecation**; `price.valueInGP` and `getCraftCost`'s gold cost are
      **no longer rounded** (round the final value yourself). **Look for:** macros using `formatText`, or
      doing craft-cost math that assumed a rounded value.
- [ ] **CAT distance API** (0.1.9) — `tokenUtils.getDistance` now returns **Infinity** when the tokens
      cannot be measured (previously it approximated). `workflowUtils`' roll helpers **drop
      `consumeUsage` — use `consumeResources`**. **Look for:** a macro reading `tokenUtils.getDistance`
      as a number, or passing `consumeUsage`.
- [ ] **CPR generic changes** (2.1.9) — `specialItemUse` drops *Consume Uses* (use *Consume Resources*);
      `teleport`'s **companions are token ids only** (not documents); `attackRider` gained damage-type /
      weapon-type / critical / single-target limits and an owner mode; `damageBonusToOneRoll` can be
      once-per-turn (and once per creature) and can skip its own item. **Look for:** those generics in
      `flags.cat.genericConfig['chris-premades']` — re-check their config.
- [ ] **midi's ignore traits came from the target** (midi 14.7.0) — `MidiQOL.applyTokenDamage` /
      `applyTokenDamageMany` took the attacker's ignore traits (`system.traits.idr` …) **from the
      target**; they now come from the workflow's actor, else the item's. **Look for:** a macro calling
      `applyTokenDamage` and expecting the old (wrong) source.
- [ ] **midi removed a setting** (14.7.0) — *Replace dnd5e activities with midi-qol equivalents* is
      gone (it never took effect). **Look for:** a world/deploy write that set it.
- [ ] **Stored cover/visibility choices** (midi 14.7.0) — a stored *Alternative Token Visibility* choice
      for walls/cover (which did nothing) becomes *Centre* / *None*; total cover from walls is now
      midi's (walls that block movement) whichever module is chosen. **Look for:** cover settings.
- [ ] **CAT grapple drag** (0.1.9) — moving while grappling a creature costs **1 extra foot per foot**
      unless the creature is 2+ sizes smaller (Tiny under 2024); `flags.cat.grappleDrag.freeSizeOffset`
      waives it. New `grappleEnded` special duration. **Look for:** movement while grappling.
- [ ] **midi sample items → CPR** (carried from 14.6.13/14.7.0) — midi **removed** its copies of *Aid*,
      *Chill Touch*, *Command*, *Dragon's Breath*, *Guiding Bolt*, *Mass Cure Wounds*, *Pass without
      Trace*, *Radiant Strikes*, *Sanctuary*, *Shield*, *Thunderwave*, *Toll the Dead*, and the actions
      *Check Cover*, *Generic Actions*, *Hide*, *Influence*, *Knock Out*, *Ready*, *Shove*, *Squeeze*,
      *Study*, *Suffocation*, *Underwater*, in favour of CPR's. Copies already on actors keep their
      macros until 14.8.0. **Look for:** a world item that is a copy of one of those; switch it to CPR's
      automation in CAT's CatKit.

---

## dnd5e 6.1.1  (from 6.0.6)

- **Attacker damage rules** (checklist) — the headline: *ignore* / *downgrade* immunity, resistance,
  vulnerability, on the attacker, checked at each damage roll. DAE's `idi/idr/idv` migrate to them.
- **Damage card reworked** — one resistance button per damage type (the *All Damage Resistance* button
  is gone); a downgraded immunity shows on the target; damage reduction shows on dnd5e's own cards; a
  card multiplier keeps saves, resistances and damage reduction.
- **Falling damage** traits (checklist). **Antimagic** region behavior + status (checklist).
- **Renown / factions** (optional rule): a **Faction** actor type, **Renown** items, renown tabs on
  character and group sheets.
- **Breaking** (checklist): `dnd5e-textFormat` / `formatText` removed; `price.valueInGP` /
  `getCraftCost` no longer rounded.
- **New for authors:** `ActiveEffect5e.getRollData`; `item.classIdentifier` in feature roll data;
  `@item.type.document`; equipped armour/shield known during base data prep (so effects can be
  conditional on them); change types can define **limited key options** (a select + readable labels);
  hooks `dnd5e.dropCreateItems` and `dnd5e.advancementCreateItemData`; Modify Item advancement supports
  riders; stat-block overrides for temp HP / ability replacement. The `system.bonuses.*` shim
  (`ActiveEffect5e.SHIM_FIELDS`) is **still present**, removed at 6.2.

## midi-qol 14.7.0  (from 14.6.13; dnd5e 6.1 line)

- Adapts to 6.1's **attacker rules** (applied to all damage, kept through undo/redo; one set per use,
  from its latest damage roll) and its **reworked damage card**. Antimagic and *No Reactions* handled as
  above. Activities that dnd5e declares **"like"** another type are treated as that type.
- **Fixes** (checklist): the `applyTokenDamage` ignore-trait source; a range check from an unmeasurable
  distance used to read as within reach (prone/flanking/thrown reach — it now says so); undrawn targets
  never matched an other/ammunition damage condition and didn't run `preTargetSave`/`isSave`; metric
  worlds compared metres with feet in midi's CAT automations.
- **Removed** *Replace dnd5e activities with midi-qol equivalents* (checklist); **Changed** cover and
  *Alternative Token Visibility* (checklist); **Sample items** handed to CPR (checklist);
  magic weapons that need attunement do nothing while their magic is unavailable.

## CAT 0.1.9  (from 0.1.8; dnd5e 6.1, midi 14.7)

- **API breaks** (checklist): `tokenUtils.getDistance` → **Infinity** when unmeasurable;
  `workflowUtils` roll helpers drop `consumeUsage` → `consumeResources`.
- **Antimagic** (checklist): magical auras and regions skip antimagic creatures; items whose magic is
  unavailable count as inactive and lose their magical bonus on rebuilt damage.
- **Config:** `number` options gain `min`/`max`/`step`/`integer`/`positive` (a slider when set). A new
  **Failed Save** quick condition. Class-feature automations **no longer match NPC monster features**.
- **Manual rolls** surfaced: players' pending manual rolls appear in midi's waiting list (GM can Roll /
  Minimum / Maximum); new *Who Fulfils Rolls* (Player / GM / Both) and *Prompt Timer* settings.
- **Grapple** (checklist): movement costs 1 extra foot per foot; `grappleEnded` duration.
- **New API:** `workflowUtils.rerollKeepDamage` / `refundUse`; `itemUtils.isMagical` / `attachCastActivity`;
  `effectUtils.applyNoReactions` + `actorUtils.hasNoReactions`; a `featType`; `dialogUtils.selectDie`
  `damageTypes`; `tokenUtils.grapple` `bonus`; `workflowUtils.applyDamage` `properties`.
- **Fixed:** a damage roll rebuilt from an already-scaled crit no longer doubles its dice again; an
  attack whose pass removes every hit finishes as a miss; looking up the activity behind an effect no
  longer fails on a cast activity.

## CPR 2.1.9  (from 2.1.8; dnd5e 6.1, midi 14.7, CAT 0.1.9)

- **Generic changes** (checklist): `specialItemUse` → Consume Resources; `teleport` companions are
  token ids; `attackRider` / `damageBonusToOneRoll` / `contestedCheck` / `choiceRemoveCondition` gain
  limits and modes.
- **New generics:** **`conditionGainedChoiceRemoveCondition`** (roll when a listed condition would be
  gained), **`featAbility`** (save DCs/attacks/spells use the feat's chosen ability), **`grappleAttackAdvantage`**,
  **`reduceDamageTaken`** (roll an activity to cut damage to the owner or nearby creatures), **`skillAbility`**
  (listed skills use the higher of two abilities). See `cpr-generic-config.md` (76 generics, 402 settings).
- **Antimagic**: suppresses spell/magic-item effects; magic-item activities hidden while magic is
  unavailable (checklist).
- **Fixes:** fall deals falling damage; Stabilize stanches a wound; pushes/pulls/animations skip other
  scenes/levels; 2014 Shocking Grasp / Thunderbuss apply the system's *No Reactions*.
- **Content:** 2014 & 2024 Fighter **Battle Master** (Superiority Dice + full manoeuvre set, Relentless,
  Know Your Enemy), 2014 & 2024 **Cleric domains** (Arcana, Grave, Life, Light, Trickery, War), 2024
  Druid *Circle of the Sea*, and a large feat/species batch.
