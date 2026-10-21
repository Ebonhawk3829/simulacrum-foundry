# dnd5e 6.x field shapes, and the mistakes that fail silently

Reference for writing abilities as document data. Read it for the field shapes and
for the specific traps described below.

**This is not an exhaustive or authoritative list.** dnd5e has more activity types
and more fields than are described here, and the system is the source of truth —
`inspect_document_schema` and `list_document_schemas` will show the current shape
of anything. What follows is the set of things that were found to matter while
building abilities against **6.x specifically** (verified against 6.0.6), most of
which fail *quietly* rather than erroring.

Everything here was read out of the dnd5e source. Where something was inferred
rather than confirmed, it says so.

### What 6.x actually changed, for someone who knew 5.3.3

Verified by diffing `module/config.mjs` between `release-5.3.3` and
`release-6.0.6`, so this is a list of differences rather than a rewrite:

- **Bonus redirects moved onto `system.rolls.*`.** Not a wholesale rename: `system.bonuses`
  still exists and still holds `spell.dc`. What moved are the attack, damage and
  ability-check/save/skill bonuses, which now live under `system.rolls.*`. dnd5e 6.0.6
  ships a shim (`ActiveEffect5e.SHIM_FIELDS`) that redirects the old keys automatically
  and logs a compatibility warning, scheduled to be removed at 6.2 — so old effects keep
  working for now, and the warning is the signal to rewrite them. The exact mapping is in
  section 10.
- **Two activity types were added**: `teleport`, and `ring` as an area target type.
  Nothing was removed. All twelve other activity types are unchanged.
- **Effects gain a per-change Replacement setting** (Origin / Target / None) that
  decides whose data fills an effect's `@` references when it is applied. DAE
  follows it. See section 7 — this changes what an effect you already wrote does.
- Everything else verified here is **identical**: abilities, damage types,
  activation types, duration units, use periods, recovery types, movement units,
  range types, creature types, senses, weapon types. A vocabulary that looked
  different is a subset chosen by this module, not a change in the system.

---

## 1. The rule that governs everything: activity type pairs with payload

dnd5e validates an activity against its declared type. A `save` activity carries
damage; an `attack` activity carries damage; a `utility` activity rolls nothing at
all. Writing a payload that does not match the type does not always throw — it can
produce an item that saves and looks right and does nothing.

| Type | Rolls | Carries |
|---|---|---|
| `attack` | an attack roll | `damage`, `attack` |
| `save` | the target's save | `save`, `damage`, `effects` |
| `damage` | damage only | `damage` |
| `heal` | healing only | `healing` |
| `check` | an ability check | `check` |
| `cast` | nothing (marks a spell cast) | `spell` |
| `utility` | nothing | neither — activation and description only |
| `enchant` | nothing | `enchant` |
| `summon` | nothing | `summon` |
| `transform` | nothing | `transform` |
| `forward` | nothing | forwards to another activity |
| `order` | nothing | *not user-configurable* (`configurable: false`) |

Confirmed from `DND5E.activityTypes` in `module/config.mjs`.

**A consequence worth knowing:** "the target makes a save and if it fails it takes
damage" and "you make an attack and on a hit it takes damage" cannot share one
activity. An attack is not a save with different flags.

### Where activities actually live — get this wrong and the build silently does nothing

Activities are stored **inside the item's system data**, under `system.activities`,
and they are an **id-keyed object, not an array**:

```js
// A real item, straight out of a pack file:
"system": {
  "activities": {
    "bnggEGieTxb1JBWs": { "type": "save", "_id": "bnggEGieTxb1JBWs", "sort": 0, ... }
  }
}
```

The field is `ActivitiesField extends MappingField`
(`module/data/fields/activities-field.mjs`), and dnd5e's own document methods
write it the only way that works:

```js
// module/documents/item.mjs
async createActivity(type, data = {}) { ... await this.update({ [`system.activities.${activity.id}`]: { ...activity.toObject(), sort } }); }
updateActivity(id, updates) { return this.update({ [`system.activities.${id}`]: updates }); }
async deleteActivity(id) { return this.update({ [`system.activities.${id}`]: _del }); }   // pre-v14: [`system.activities.-=${id}`]: null
```

So there are two ways this fails silently, and both produce an item that looks
built and does nothing:

- **Writing `activities` at the top level of an update.** The key is accepted and
  then ignored, because dnd5e reads them from `system.activities`. The update
  succeeds and the array stays empty.
- **Passing an array instead of an id-keyed object.** A `MappingField` does not
  take an array.

Prefer `item.createActivity(type, data)` and let dnd5e build the class, assign an
id and set `sort`. It also throws `"<type> not found in CONFIG.DND5E.activityTypes"`
for an unknown type, which is the one loud failure available in this area.

Effects are the opposite and go at the **top level**: they are an embedded
`ActiveEffect` collection on the item (`item.effects`), not `system.effects`.
Searching 612 items in the Chris's Premades packs found `effects[]` at the top
level on 163 of them and `system.effects[]` on none.

---

## 2. `range` versus `target` — the most damaging confusion available

A save activity's **DC is computed from `activity.range`**, not from
`activity.target`. `target` carries the *area*; `range` carries *how far the
ability reaches*.

A 30 ft ability with a 5 ft sphere is:

```js
range:  { units: 'ft', value: '30', override: true }   // reach — the DC reads this
target: { template: { type: 'sphere', size: '5' } }    // area — 5 ft
```

Putting the 5 in `range` shifts the save DC of every token in play, and nothing
errors. If the ability is a plain "up to N creatures" with no area, that count
goes in `target.affects.count` and `target.template.type` stays empty.

`RangeField.value` is a **formula** field, so a bare number must be stringified.

---

## 3. A fixed DC is `dc.formula` with an *empty* `dc.calculation`

```js
save: {
  ability: ['dex'],                       // SetField — MUST be an array
  dc: { calculation: '', formula: '14' }  // empty calculation = use the literal
}
```

`save.ability` is a `SetField`, so a bare string is wrong even for one ability.

A DC that depends on the caster (spell save DC, or `8 + prof + mod`) uses
`calculation` instead — `spellcasting` for the caster's spell DC, or a formula
like `'@abilities.cha.mod + 8'`. Leaving `calculation` empty is specifically what
means "the formula is the literal DC".

---

## 4. Effects applied by a save land on **failures** by default

An entry in an activity's `effects` array applies to targets that *failed* the
save. `onSave: true` is the switch that makes it apply to everyone instead.

```js
effects: [{ _id: effectId, onSave: false }]  // false => failures only
```

The naming is misleading: `onSave` is not the damage setting, it is the
"applies on failure only" switch, and it is inverted from how it reads.

`_id` must match an id on an effect document embedded in the same item.

---

## 5. `attack.flat` is a different field from `attack.ability`

A statblock that gives a fixed bonus ("+5 to hit") uses `flat: true` with the
bonus, and an empty `ability`. A modifier the system derives from the actor's
scores uses `ability`.

```js
attack: { ability: 'str', bonus: '', flat: false }   // derived
attack: { ability: '',    bonus: '5', flat: true }   // fixed
```

Writing a fixed bonus into `ability` shifts every roll by the actor's ability
modifier, which reads as a miscalculated statblock rather than a build error.

---

## 6. `damage` and `healing` block shapes

```js
damage: {
  onSave: 'half',              // 'none' | 'half' | 'full'
  parts: [{
    number: null,
    denomination: null,
    bonus: '4d6',              // the whole formula goes here
    types: ['fire'],
    custom: { enabled: false, formula: '' }
  }]
}

healing: {
  types: [],
  bonus: '2d8',
  custom: { enabled: false, formula: '' }
}
```

`bonus` holds the complete expression because a statblock gives one ("4d6"), not
number and denomination separately. `onSave` uses **`half`, not `full`**, for
half-damage-on-a-successful-save — `none`/`half`/`full` is the activity
vocabulary and `full` there means something else.

An attack or save with no damage should still carry `{ onSave: 'none', parts: [] }`
rather than omitting the key.

---

## 7. The applied effect, and the two flags that make it work

An ActiveEffect on the item carries mechanisms, not outcomes:

```js
{
  _id: effectId,
  transfer: false,     // applied by the activity, not carried passively
  system: {
    changes: [
      // DAE applies the condition. There is NO statuses.* change key in DAE —
      // conditions go through macro.StatusEffect.
      { key: 'macro.StatusEffect', mode: 0, value: 'restrained', priority: 20 }
    ]
  },
  flags: {
    // The repeating save. midi reads this from the effect ON THE TARGET, so a
    // repeat save has nowhere to live without an effect document.
    'midi-qol': { OverTime: 'turn=end, saveDC=14, saveAbility=str, saveCount=1-' }
  }
}
```

**OverTime string:** comma-separated `key=value` pairs.
- `turn=` `start` | `end`
- `saveDC=`, `saveAbility=`
- `saveCount=N-` means "remove the effect after N successful saves"

`system.changes` is where the *intent* goes. `flags` is where *module behaviour*
goes, and each module reads its own scope.

### The 6.x trap: whose values fill an effect's `@` references

dnd5e 6 gives every effect change a **Replacement** setting — Origin, Target or
None — which decides whose data fills that change's `@` references when the effect
is applied. DAE follows it as of v14.6.0. **The default is None.**

In 5.x DAE filled **every** reference from the caster at the moment of application,
whatever the setting. So an effect written then behaves differently now, and it
fails quietly:

```js
// Written on 5.x, meaning "use MY spell DC". On 6.x with Replacement unset this
// resolves against the TARGET instead.
{ key: 'system.bonuses.spell.dc', mode: 2, value: '@attributes.spell.dc' }   // 5.x
{ key: 'system.rolls.spell.dc',   mode: 2, value: '@attributes.spell.dc' }   // 6.x path
```

Anything that reads a value from the caster — a DC, a bonus built from
`@abilities` or `@scale`, a damage rider scaled off the origin — now needs either:

- the change's **Replacement set to Origin** (the 6.x way, and the one to write), or
- the world set to **Legacy DAE** application, or the effect's own
  "Effect application" set to Legacy, or the item/pack marked with
  "DAE: Effects use legacy application".

**Application facts are always filled from the application**, so these still work
with Replacement left alone: `@item`, `@activity`, `@spellLevel`, `@itemLevel`,
`@scaling`, `@damage`, `@critical`, `@fumble`, `@itemCardUuid`, `@actorUuid`. Macro
arguments (`macro.execute`, `macro.itemMacro`) are still filled from the caster.
`##` still defers a reference to the target. Transfer (passive) effects are
unaffected.

Everything else DAE changed in v14.6.0, for completeness: `ATL.*` change keys are
converted to `token.*` on save and the `atlCompatibility` setting is gone; `[[expr]]`
now always posts its roll to chat, so use `[[[expr]]]` to roll silently; `dae.roll()`
is deprecated; and **a duration on a transfer effect no longer runs at all** — such
an effect has to be moved into the activity's Effects list instead.

### DAE 14.6.2 rewrote effect sourcing — an applied effect's `origin` is no longer its item

This is the change most likely to bite an authored effect, because it is silent. As of
DAE 14.6.2 an applied effect's origin is the caster's **concentration effect**, or the
**activity** if there is none — not the item. Two consequences:

- Applied effects **no longer carry `flags.dae.itemData`**. `flags.dae.applicationData`
  keeps only damage, critical and fumble. Use the accessors below instead of reaching
  for the item off the effect.
- The `origin` DAE and midi read is unchanged (it still lives in `system.origin`), and
  dnd5e's Replacement setting (§7) still decides whose data fills `@` references. The
  sourcing change is about *what the effect points at*, not *what fills `@`*.

```js
DAE.getEffectSource(effect)      // { actorUuid, itemUuid, activityUuid, controllingEffectUuid, sourceEffectUuid, messageUuid }
DAE.getEffectItem(effect)        // live Item, or one built from data — undefined during data prep for a deleted item
DAE.getEffectItemData(effect)    // the item's stored data; use THIS during prepareData
DAE.getMessageItemData(message)
DAE.getActorItemData(actor, uuid)
DAE.effectMatchesSource(effect, uuid)
```

Also in 14.6.2: `lastArg.origin` is deprecated → **`lastArg.source`** (+ `lastArg.systemOrigin`);
`flags.dae.legacyApplication` is renamed **`flags.dae.applicationMode`**
(`default`/`dnd5e`/`legacy`, unset follows the world setting); a boolean
`flags.dae.stackable` now means `false` = none / `true` = multi; `flags.dae.deleteOrigin`
applies **only to transfer effects**; and `dae.eval(...)` now evaluates **in dnd5e
formula fields** with that field's full roll data, not only at change-application.

---

## 8. Uses need two halves

`system.uses` on the item and a `consumption` block on the activity are separate.
Creating one without the other gives either a counter that never decrements or a
spend of a resource that does not exist.

```js
// on the item
system: {
  uses: {
    max: '3',
    spent: 0,
    recovery: [{ period: 'day', type: 'recoverAll' }]
  }
}

// on the activity — this is what actually decrements it
consumption: {
  targets: [{ type: 'itemUses', target: '', value: '1' }],
  scaling: { allowed: false },
  spellSlot: false
}
```

`period: 'recharge'` is a rest-independent die-roll recharge; the **threshold**
("recharge 5–6") is stored as `recovery[].formula` and is separate from the
period. Omitting the threshold leaves an ability that can be used forever.

Valid consumption target types include `itemUses`, `activityUses` and `attribute`
(confirmed in `consumption-targets-field.mjs`).

---

## 9. Idempotency is by identifier, not by name

`system.identifier` is the permanent name for automation purposes. Names are
display text and get renamed, translated and edited; a rebuild keyed on a name
would orphan the previous item and leave two on the sheet.

Note the asymmetry: an effect is found either by `flags.cat.identifier` **or** by
`name.slugify()`, so an effect's identifier flag is optional for lookup but the
item's is not.

---

## 10. Vocabulary values (6.x)

```
abilities        str dex con int wis cha       (+ hon, san added by some systems)
damage types     acid bludgeoning cold fire force lightning necrotic
                 piercing poison psychic radiant slashing thunder
template types   circle cone cube cylinder line radius sphere square wall ring
activation       action bonus reaction legendary lair crew special minute
                 hour day none
duration units   inst turn round minute hour day perm spec disp
use periods      lr sr day charges recharge turn round
recovery types   recoverAll loseAll formula
conditions       blinded charmed deafened exhaustion frightened grappled
                 incapacitated invisible paralyzed petrified poisoned prone
                 restrained stunned unconscious
```

Activity types: `attack cast check damage enchant forward heal order save summon
teleport transform utility`. `teleport` is the 6.x addition.

`exhaustion` is a **level**, not a boolean — it takes a numeric value, and
dnd5e stores it under `system.attributes.exhaustion`.

### Which bonus paths moved in 6.x

Read out of `ActiveEffect5e.SHIM_FIELDS` in `module/documents/active-effect.mjs`,
which is dnd5e's own list of old key → new key. These are the ones relevant to
abilities:

| 5.x key | 6.x key |
|---|---|
| `system.bonuses.mwak.attack` | `system.rolls.attack.mwak.bonus` |
| `system.bonuses.mwak.damage` | `system.rolls.damage.mwak.bonus` |
| `system.bonuses.abilities.check` | `system.rolls.ability.check.bonus` |
| `system.bonuses.abilities.save` | `system.rolls.ability.save.bonus` |
| `system.bonuses.abilities.skill` | `system.rolls.ability.skill.bonus` |
| `system.attributes.init.bonus` | `system.attributes.init.roll.bonus` |
| `system.attributes.concentration.bonuses.save` | `system.attributes.concentration.roll.bonus` |
| `system.attributes.death.bonuses.save` | `system.attributes.death.roll.bonus` |
| `system.attributes.movement.<speed>` | `system.attributes.movement.speeds.<speed>` |
| `system.attributes.senses.<sense>` | `system.attributes.senses.ranges.<sense>` |
| `system.rarity` | `system.rarities` |

Same pattern for `msak`, `rwak` and `rsak`. **`system.bonuses.spell.dc` did NOT
move** — it is still the spell save DC bonus, and an effect like
`saveDC=@attributes.spell.dc` is unaffected by this change.

Anything not in that table (traits, skills, tools, spells, resources, currency,
`system.attributes.ac`, `hp`, `prof`) is unchanged.

### Auto-fail and auto-success moved onto the roll fields (midi-qol 14.6.3)

The other half of the same idea, but midi-qol's change rather than dnd5e's. midi extends
dnd5e's `D20RollModificationField` so every D20 roll field now has `fail` and `success`
beside `bonus`/`min`/`max`/`mode`. The old midi flag keys are **deprecated** — DAE
converts them and reports the deprecation, but write the field:

| Deprecated (midi ≤14.6.2) | Field (14.6.3) |
|---|---|
| `flags.midi-qol.fail.ability.save.dex` | `system.abilities.dex.save.roll.fail` |
| `flags.midi-qol.fail.ability.check.all` | `system.rolls.ability.check.fail` |
| `flags.midi-qol.fail.attack.all` | `system.rolls.attack.fail` |
| `flags.midi-qol.fail.skill.ste` | `system.skills.ste.roll.fail` |
| `flags.midi-qol.success.*` (same shapes) | `….roll.success` |
| `flags.midi-qol.concentrationSaveBonus` | `system.attributes.concentration.roll.bonus` |

Concentration, death and initiative have their own: `system.attributes.concentration.roll.fail|success`,
`system.attributes.death.roll.fail|success`, `system.attributes.init.roll.fail|success`.
Also note `flags.midi-qol.optional.<name>.<rollType>` **without** the `.all` suffix is no
longer rewritten to `.all` — write `flags.midi-qol.optional.<name>.<rollType>.all`.

**These fields were partly broken until 14.6.4.** midi 14.6.3 shipped them with three
check-activity bugs, all fixed in 14.6.4: a skill or tool check could lose the roller's
fail/success/min/max/advantage (with CAT active, a Stealth check ignored
`system.skills.ste.roll.success`); a check offering several skills or tools rolled the
chosen one with the first one's ability (Acrobatics with Strength); and a tool's check
activity read the flags for the tool's *default* ability rather than the tool item's own.
On 14.6.3 the fields were right for saves, attacks and single-skill checks and wrong for
the rest; on 14.6.4 they are right throughout.

---

## 11. Where the ecosystem's own conventions live

This module deliberately does not define ability-shape conventions, because two
installed modules already do and they are the ones that will actually act on the
flags:

- **CAT** (Coven's Automation Toolkit, module id `cat`) is the substrate. A macro is
  attached with `flags.cat.macros`, an object **keyed by event** whose values are
  arrays of `{ source, identifier, rules }` references. The full shape, the required
  fields, and the `genericConfig` side are in `cat-macro-flags.md` — read that
  before attaching anything, because the shape is not the obvious one.
- **CPR** (Chris's Premades) is a library of *configured* CAT generics — its items
  use the same `midi-qol`, `midiProperties`, `dnd5e` and `cat` flag scopes.

So the fastest route to "how is this actually built" is to read a working
example: search CPR's compendiums for a similar ability with `document_search`
and read it with `document_read`. That is live data from what this world has
installed, so it cannot go stale the way a snapshot would.

**Expiry is the exception, and it has its own file.** When an effect should end —
on a turn, on a rest, when the bearer is attacked — the vocabulary is in
`dae-effect-expiry.md`. Two things there are easy to get wrong: `duration.expiry`
is the field, not `flags.dae.specialDuration`, and on plain dnd5e 6 several expiry
values silently discard `duration.value` (DAE 14.6.2 restores it for source/target
turn expiries — read the file).

---

## 12. Things not confirmed here

Recorded so they are not mistaken for facts:

- The full list of `flags.cat.*` config keys per generic. Every generic's settings
  and their defaults are in `cpr-generic-config.md`, but the **options** for a
  `select`-typed setting (the condition list, damage types, creature types) are
  deliberately not copied — they are read at run time from CPR's own `constants`, and
  a stale copy would fail quietly.
- Whether `enchant`, `summon`, `transform` and `teleport` payloads need additional
  required fields beyond their block. `teleport` is new in 6.x and is not
  exercised here.
- Behaviour of `forward` and `order` activities. Not exercised.
- What `system.rolls.*` accepts *in full*. The redirects in section 10 were read out
  of dnd5e's own `SHIM_FIELDS`, so they are authoritative for the keys listed — but
  `system.rolls` also holds non-persisted proficiency and roll-mode fields that are
  not bonus targets, and those are not enumerated here.
