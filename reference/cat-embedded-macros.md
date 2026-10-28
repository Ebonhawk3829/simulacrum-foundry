# Scripting an ability: CAT embedded macros

For the abilities flags cannot express. Reading game state, branching on who did
what, or calling midi-qol's workflow utilities needs code, and about 40% of the
abilities in this world's own library need exactly that.

Written from CAT's own source at v0.1.4 (`lib/embeddedMacros.mjs`, `lib/event.mjs`)
and from Chris's Premades' macros, which are the working examples.

---

## 1. Where the code goes

`flags.cat.embeddedMacros` — an array on the **item**, holding the scripts:

```js
flags: {
  cat: {
    embeddedMacros: [
      {
        name: 'reckless-attack',
        event: 'roll',
        pass: 'attackRoll',
        macros: [{ macro: '/* your code */', priority: 0 }],
      },
    ],
  },
}
```

Three things about that shape are not guessable:

- **`macros` is an array, but it is not a list of scripts.** It holds one entry plus
  that entry's filters (distance, dispositions, disabled). One entry, always.
- **`event` and `pass` are siblings of `macros`**, not inside it.
- **There is no `_id`.** CAT appends to the array; Foundry does not need one for
  flag data.

You do not write this by hand. Pass it to `build_ability` as the `scripts` argument
and the builder writes the flag:

```js
build_ability({
  spec: { actor, name: 'Reckless Attack' },
  activities: [ /* ... */ ],
  scripts: [
    { name: 'reckless-attack', event: 'roll', pass: 'attackRoll', macro: '...' },
  ],
})
```

The builder syntax-checks every script before writing anything, so a script that
cannot parse is refused rather than stored.

`embeddedMacros` lives on the **item**. As of 0.1.3 CAT collects an item's macros and
an activity's macros of the same event and pass **separately** (an activity's are
grouped under an `activity.` key), so they no longer replace one another — both run.
Put a script on the item when it should apply to every use, and on a specific activity
only when it should not.

## 2. What the script can see

The body runs as an **async function body**. `await` works. `return` is ignored —
nothing reads the return value, so a script communicates by reading state and, if
it wants to be seen, by logging.

CAT composes the scope from the event and the document type. These are the names
that appear across events; which ones are populated depends on the event, because
a `move` event has no attack roll to report:

| Name | What it is |
|---|---|
| `document` | the document the macro is on — often the activity, not the item |
| `item`, `actor`, `token`, `scene` | resolved from the trigger when they exist |
| `activity` | the activity being used, on roll events |
| `workflow` | midi-qol's workflow, on roll events — the richest source |
| `trigger` | the scope data itself; `trigger.entity` is the old `document` |
| `round`, `combat` | during combat events |
| `utils`, `constants` | CAT's own utilities and enums, always present |

**The scope is large and worth inspecting rather than guessing.** Every CAT utility
is also injected, and `constants` holds the enums those utilities expect. When you
need a name you are unsure of, log the scope and read back what arrived.

## 3. Events and passes

An **event** is what happened; a **pass** is where in that event you run. The pass
decides what can still be changed and what is already decided:

- `roll` / `attackRoll` — the attack roll is being made. Change it here.
- `roll` / `attackRollComplete` — the attack is settled. **No adjustments can be made.**
- `roll` / `damageRoll` — the damage formula is being rolled. Change it here.
- `roll` / `damageRollComplete` — settled, again not adjustable.
- `roll` / `itemRollFinished` — the whole use is done. Good for follow-up effects.
- `move` / `actorMoved` — a token moved.
- `combat` / `preInitiative` — the combatant about to roll initiative, before its roll is
  built (`combatant` is undefined when the roll will create it).
- `combat` / `turnStart`, `turnEnd`, `everyTurn`, `combatStart`, `combatEnd` — turns and
  combat boundaries.
- `effect` / — an effect was created, deleted or expired.
- `save`, `check`, `skill`, `tool`, `rest`, `time`, `aura`, `summon`, `region`,
  `token`, `hitDie`, `actor` — the other events.

The pass names are CAT's, and the full list per event is in CAT's Events page.
Getting the pass wrong is the most common mistake: a script that adjusts an attack
roll but runs at `attackRollComplete` does nothing, silently.

## 4. What a script may and may not do

**May:** read anything — actors, items, effects, the workflow, combat state — call
every CAT and midi-qol utility in the scope, and **change the documents in play**.
Applying an effect that the ability grants is the single most common thing a script
does:

```js
await effectUtils.createEffects(actor, [effectData]);
await actor.update({ 'system.abilities.con.value': 20 });
```

**May not:** use the collection-level write forms — `Actor.updateDocuments`,
`Actor.createDocuments`, `Actor.deleteDocuments`, and their embedded equivalents.
Those reach past the documents the script was handed.

This is not a sandbox — a script runs with full world access in play, and pretending
otherwise would be a false comfort. What the one refusal buys is that an authored
script changes only what is in play, which is what the preview describes.

### On the shape of this rule

An earlier version of this file refused **all** writes, on the reasoning that a build
should not perform document changes. That was wrong, and wrong in a way worth
recording: 78 of Chris's Premades' own 232 macros write to the world, and
`steady-aim` — the example this feature was built for — ends with
`effectUtils.createEffects(...)`. The rule would have refused most real uses of the
feature it was guarding.

When you are unsure whether a script should write something, the question is not
"may it write" but "is this the change the ability was supposed to make" — and the
answer to that comes from the test loop, not from this file.

## 5. Making it observable

The test loop needs to see what the script saw. Two habits:

```js
async function attackRoll({ workflow, log }) {
  // log() writes one prefixed line to the console, which is what the user reads
  // back to you when they say "I pressed it and this happened".
  log(`reckless: advantage from ${workflow.advantageReasons?.join(', ') ?? 'none'}`);
}
```

- **Log the decision, not the outcome.** "advantage was set because the actor was
  raging" is diagnosable; "damage was 14" is not.
- **Prefer observable effects over silent state.** If the ability is supposed to
  apply a condition, applying it through a utility makes it show up in the recorded
  run; setting a variable does not.

## 6. Before writing one, check whether a generic already does it

A large share of what looks like it needs code is an existing generic with the right
settings. Check `cpr-generic-config.md` (every generic and every setting it accepts)
and consider attaching that first.

And read a working example: `search_documents` with a `pack` argument finds CPR
items, and `document_read` shows their `flags.cat.macros`. A similar ability that
already works is a better template than anything written here.

## 7. Pass names come from the enum — do not infer one

CAT declares its passes in `scripts/lib/constants.mjs` as **twelve separate enums**, one per
event family: `workflowPasses`, `combatPasses`, `rollPasses`, `effectPasses`, `auraPasses`,
`regionPasses`, `itemPasses`, `restPasses`, `timePasses`, `summonPasses`, `movementPasses`
and `grapplePasses`. Read the one for the event you are attaching to — a name that is valid
for one event is not valid for another.

CAT 0.1.4's `workflowPasses` members are: `preTargeting`, `preItemRoll`, `targeting`,
`preambleComplete`, `attackRollConfig`, `attackRoll`, `attackRollBonuses`,
`attackRollMissedBonuses`, `optionalBonusAttack`, `attackRollComplete`, `savesComplete`,
`damageRoll`, `optionalBonusDamage`, `damageRollBonuses`, `damageRollComplete`,
`utilityRoll`, `utilityRollBonuses`, `utilityRollComplete`, `damage`, `damageBonuses`,
`damageFlatReductions`, `damagePercentReductions`, `damageComplete`, `rollFinished`,
`onHit`, `cleanup`.

**There is no pass called `optionalDamage`** — the optional-damage pass is
`optionalBonusDamage`, and the optional-attack one is `optionalBonusAttack`. A pass name you
guessed is accepted where a name is expected and then never fires.

**New in 0.1.4:** `combatPasses` gained `preInitiative` (the combatant about to roll
initiative, before its roll is built). The rest of `combatPasses` are `turnStart`, `turnEnd`,
`everyTurn`, `combatStart` and `combatEnd` — note there is no `actorTurnStart`/`actorTurnEnd`.

## 8. Creating an effect from a macro

The working pattern is:

```js
await effectUtils.createEffects(actor, [effectData]);
```

`actor.createEmbeddedDocuments("ActiveEffect", [...])` works too. To base a new effect on an
effect **template** stored on the item, resolve it, strip `_id`, and pass the data:

```js
const d = template.toObject();
delete d._id;
await effectUtils.createEffects(actor, [d]);
```

## 9. `build_ability` does not replace — it appends

Despite its docstring, `build_ability` does not remove effects on rebuild: it appends.
Assert the effect count after rebuilding an item that already had effects. (See the field
guide, section 13, for the embedded-collection rules.)

## 10. What this file is not

- **Not verified in a live world.** The shape is CAT's own and the scope names come
  from CAT's source, but no embedded macro authored this way has yet been built and
  played. Treat the first one as a test of this file as much as of the ability.
- **Not a pass reference.** The full list of passes per event is CAT's Events page;
  the ones above are the commonly used ones.
- **Not a substitute for reading CPR.** Its macros are the working examples, and 508
  of the 521 macro references in its own items point at them.
