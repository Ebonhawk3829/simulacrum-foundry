# dnd5e 5.3.3 field shapes, and the mistakes that fail silently

Reference for writing abilities as document data. Read it for the field shapes and
for the specific traps described below.

**This is not an exhaustive or authoritative list.** dnd5e has more activity types
and more fields than are described here, and the system is the source of truth —
`inspect_document_schema` and `list_document_schemas` will show the current shape
of anything. What follows is the set of things that were found to matter while
building abilities against **5.3.3 specifically**, most of which fail *quietly*
rather than erroring.

Everything here was read out of the dnd5e source. Where something was inferred
rather than confirmed, it says so.

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

## 10. Vocabulary values (5.3.3)

```
abilities        str dex con int wis cha
damage types     acid bludgeoning cold fire force lightning necrotic
                 piercing poison psychic radiant slashing thunder
template types   cone cube cylinder line sphere square circle rect radius
activation       action bonus reaction legendary lair crew special minute
                 hour day none
duration units   inst turn round minute hour day perm spec disp
use periods      lr sr day charges recharge turn round
recovery types   recoverAll loseAll formula
conditions       blinded charmed deafened exhaustion frightened grappled
                 incapacitated invisible paralyzed petrified poisoned prone
                 restrained stunned unconscious
```

`exhaustion` is a **level**, not a boolean — it takes a numeric value, and
dnd5e stores it under `system.attributes.exhaustion`.

---

## 11. Where the ecosystem's own conventions live

This module deliberately does not define ability-shape conventions, because two
installed modules already do and they are the ones that will actually act on the
flags:

- **CAT** (Coven's Automation Toolkit, module id `cat`) is the substrate. Its
  generic macros are selected by an activity flag:
  `flags.cat.macros.roll[].identifier`. Generic names include `attackRider`,
  `extraAttack`, `contestedCheck`, `conditionAutoSave`, `choiceRemoveCondition`,
  `additionalTargets`, `banish`, `bladeSpell`, `damageBonusToOneRoll`.
- **CPR** (Chris's Premades) is a library of *configured* CAT generics — its items
  use the same `midi-qol`, `midiProperties`, `dnd5e` and `cat` flag scopes.

So the fastest route to "how is this actually built" is to read a working
example: search CPR's compendiums for a similar ability with `document_search`
and read it with `document_read`. That is live data from what this world has
installed, so it cannot go stale the way a snapshot would.

---

## 12. Things not confirmed here

Recorded so they are not mistaken for facts:

- The full list of `flags.cat.*` config keys per generic. Read from the installed
  CAT module or a working example.
- Whether `enchant`, `summon` and `transform` payloads need additional required
  fields beyond their block. Not exercised.
- Behaviour of `forward` and `order` activities. Not exercised.
- dnd5e 6.x differs. This module targets 5.3.3 and `system.rolls.*` in particular
  is a 6.x path; 5.3.3 uses `system.bonuses.*`.
