# CAT: how a macro is attached to a document

Written because this is the one thing the agent could not learn from anywhere. CAT
is the substrate that every CPR automation runs on, and its README — the only
documentation it ships — says nothing about flags. Its real documentation is a
GitHub wiki, which is not installed with the module.

The shapes below were read out of CAT's own schema at the version this world runs
(v0.1.2, `scripts/lib/macros.mjs`) and out of a stored document that uses it.

---

## 1. The flag shape, which is not what you would guess

A macro is attached by `flags.cat.macros`, an **object keyed by event**, whose values
are arrays of macro references:

```js
flags: {
  cat: {
    macros: {
      roll: [
        { source: 'chris-premades', identifier: 'hex-attack', rules: 'all' },
      ],
      save: [
        { source: 'chris-premades', identifier: 'conditionAutoSave', rules: 'all' },
      ],
    },
  },
}
```

Three things are worth noticing, because each is a plausible wrong guess:

- **The top level is an object keyed by event, not an array.** It is easy to write
  `macros: [{ ... }]`, which is a different shape entirely.
- **`rules` is required**, and CAT treats `'all'` as the wildcard that matches any
  rules version. A reference with `rules: '2014'` will not be found by a lookup for
  `rules: '2024'`, but one registered for `'all'` will be — see the fallback below.
- **`source` and `identifier` are both required.** `source` is who registered the
  macro (`'chris-premades'`, `'cat'`, `'embedded'`), and `identifier` is the macro's
  own name.

The schema, verbatim from `scripts/lib/macros.mjs`:

```js
this.#macrosSchema = new fields.SchemaField({
  source: new fields.StringField({ required: true, nullable: false }),
  rules: new RulesField({ required: true }),
  identifier: new fields.StringField({ required: true, nullable: false }),
  generic: new fields.BooleanField({ required: false, nullable: false }),
  ...constants.triggerTypes.reduce((s, t) => (s[t] = makeEventGroup(), s), {}),
  genericConfig: new fields.ObjectField({ required: false, nullable: false }),
  documents: new fields.ArrayField(new fields.StringField({ required: true, nullable: false }), { required: false }),
});
```

### Event keys are not the same as pass names

The keys of `macros` are **events** — `roll`, `save`, `effect`, `move`, `combat`,
`rest`, `time`, `aura`, `summon`, `check`, `skill`, `tool`, `hitDie`, `region`,
`token`, `actor`. The *passes* (`preTargeting`, `attackRoll`, `damageRoll`, …) are a
second level inside the macro definition, and the wiki's Events page is the authority
on which passes each event offers.

## 2. The `'all'` fallback

A registration made with `rules: 'all'` is the fallback for any specific rules
version, checked only when the exact key misses:

```js
#getMacroByKey(source, identifier, rules) {
  let fnMacro = this.overwriteMacros.get(key) ?? this.fnMacros.get(key);
  if (!fnMacro && rules !== 'all') {
    fnMacro = this.overwriteMacros.get(allKey) ?? this.fnMacros.get(allKey);
  }
  return fnMacro;
}
```

The key is `source|identifier|rules`. So a stored reference of
`{ source: 'chris-premades', identifier: 'hex-attack', rules: 'all' }` will be found
when the world is running either rules version. This is why nearly everything in
CPR's compendium data says `rules: 'all'`.

## 3. `flags.cat` has three top-level keys, and only one attaches a macro

Seen on a real item (`Awakened Mind` from CPR's 2024 features pack):

| Key | Purpose |
|---|---|
| `macros` | the macro references, as above |
| `genericConfig` | configuration for a generic macro, e.g. which conditions it uses |
| `automation` | marks the document as supplied by an automation, for the Cat Kit |

**Every generic's settings are listed in `cpr-generic-config.md`** — all 51 of them,
with the type, the default, and CPR's own description of each. Read that rather than
guessing a setting name.

`genericConfig` was the interesting one for the item that exposed this file. Its
shape is `{ [source]: { [identifier]: { ...settings } } }`:

```js
flags: {
  cat: {
    genericConfig: {
      'chris-premades': {
        conditionAutoSave: {
          conditions: ['incapacitated', 'stunned', 'unconscious'],
          magical: true,
          display: true,
        },
      },
    },
  },
}
```

Notice the identifier is the same one that appears in `macros`, and that the
settings are macro-specific — there is no general schema for them. Read the macro's
own source for what it accepts.

## 4. Where the flags can live

`flags.cat` may be on the **item** or on an **activity**. In the Awakened Mind
example both are used: the item carries `flags.cat.macros.save` and the
`genericConfig`, while its activity carries `flags.cat.automation`. CAT's note that
"Item passes no longer have an activity filter, macros are applied directly to
activities instead" is the migration hint for v14 — attaching to the activity is the
modern placement.

## 5. Reading a working example beats reading this file

The reliable route is a real document, because it cannot go stale:

- `document_search` a CPR compendium with a `pack` argument for an ability like the
  one you are building, then `document_read` it and look at `flags.cat`.
- CPR's item packs are the worked examples: `cpr-features-2024`, `cpr-spells-2024`
  and their legacy equivalents.

The generic macro names are real and worth knowing, because they name the *shape* of
an automation rather than one spell: `attackRider`, `extraAttack`, `contestedCheck`,
`conditionAutoSave`, `choiceRemoveCondition`, `additionalTargets`, `banish`,
`bladeSpell`, `damageBonusToOneRoll`, `multiSingleTarget`, `reduceMaxHP`. These are
registered by CPR and configured per-item through `genericConfig`.

## 6. What this file is not

- **The settings are in another file.** This covers attaching a macro; what each
  generic accepts once attached is `cpr-generic-config.md`, generated from CPR's own
  declarations.
- **Not a pass reference.** Which passes exist per event, and in what order they fire,
  is in CAT's Events wiki page — not reproduced here, because a pass list copied out
  of the source is exactly the kind of thing that goes stale silently.
- **Not verified against a live world.** The schema is CAT's own and the example is a
  stored document, but no item using these flags has been built and observed in this
  world yet.
- **Not the CAT API.** This covers attaching macros to documents, not registering
  them (`registerFnMacros`, `registerAutomations`) — that is module-author work.
