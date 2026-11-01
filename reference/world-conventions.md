# This world's conventions, and how the runtime actually behaves

Four things that are true of **this world specifically** and that no generic reference can tell
you, a mechanism whose correct shape is easy to miss, and the corrections folded in from session
lessons. Each correction is written as how the thing actually works, anchored to the case that
taught it, so the same symptom pulls it back to mind.

---

## World conventions

### 1. Damage is applied MANUALLY by the GM

`autoApplyDamage: "noCard"`. Damage-gated automation does not run until the GM clicks
**Apply**. **Testing consequence:** a damage-triggered ability cannot be tested
unsupervised — and a silent non-fire there looks exactly like a broken ability. Confirm the
damage was actually applied before calling an `isDamaged` reaction broken.

**A midi save is the same shape.** When an ability rolls a save against a target, midi raises a
prompt and the workflow does not advance until the GM clicks it. A programmatic
`MidiQOL.completeActivityUse(...)` bypasses the prompt and rolls the save directly, so a scripted
pass exercises the automation AFTER the save but never the prompt the user actually sees. Say
which of the two was verified. Fine unsupervised: rolling damage (the roll, not the application),
applying conditions/effects, reading back flags and prepared bonuses, and cleanup.

### 2. Testing recipe (the parts that need no damage)

- Stub `foundry.applications.api.DialogV2.wait` to capture the prompt and return a chosen
  button action.
- Force dice by wrapping `Roll.prototype.evaluate`.
- For turn-driven abilities, create a temp `Combat`, add combatants and call `nextTurn()`.
- Observe the actor's flags and the captured chat messages.
- ALWAYS cover the negative cases (declined, out of range, no target).
- Clean up in a `finally`.

**Reproduce the REAL scope, and fix the instrument before the verdict.** A harness that feeds the
code the shape it already assumes proves nothing. When a probe returns null/empty for a value you
believe exists, check the probe first: did the lookup FIND the document (a failed `.find()` yields
the same null as a missing field); is the accessor valid (`_source` is the stored shape and
authoritative; `.toObject()` exists on documents, not every prepared sub-object — dump
`Object.keys()`); and read the same field off a **known-good** document. A probe that reports a
known-working mechanism as dead is reporting on the harness — fix it before interpreting any other
negative from that run.

Two prerequisites learned on The Nightmare Three: a self-centred emanation needs a CONTROLLED
source token (or the workflow runs with targets 0 and looks broken), and a programmatic combat must
be built from **tokens** (`{tokenId, actorId}`), not actor ids — CAT resolves actors through tokens
(`getFirstToken`), so an actor with no token on the scene is not a candidate for its embedded
macros. And if the ability resolves its subject by a GLOBAL flag, a scratch copy will never be used
— verify against the real document, moving only its scene/token context.

### 3. Prose versus disposition

Lowercase "hostile" / "friendly" in statblock prose is **relative** (usually "not its
allies"). Capital "Hostile" / "Friendly" is the token **disposition**.

**Write the comparison RELATIVE to the source — `tokenDisp !== sourceDisp`, never `=== HOSTILE`
or `!== FRIENDLY`.** Disposition is absolute (party/allies FRIENDLY 1, enemies HOSTILE -1,
NEUTRAL 0, plus a SECRET -2 in use here); "a hostile creature" means hostile *to this ability's
source*, which depends entirely on the bearer, so a fixed test is right only by coincidence for
one kind of bearer. The world's own examples to copy: Silvery Barbs
(`if (t.document.disposition === triggerToken.document.disposition) continue;`) and Counterspell
against the caster's token.

### 4. Unlinked tokens have their own actor — iterate TOKENS, and write to the pool you read

An UNLINKED token has its **own synthetic actor document**. `t.actor` and
`game.actors.get(t.actorId)` are **different documents with the same actor id**: verified live, a
token actor's uuid reads `Scene.<scene>.Token.<token>.Actor.<id>` while the base reads `Actor.<id>`,
and `t.actor === game.actors.get(t.actorId)` is `false`. In this world 67 of 244 tokens are unlinked.

Consequences:

- An effect or flag written to `t.actor` is **invisible** to any scan of `game.actors`, and vice
  versa (observed for one actor id: `tokenActorEffectCount: 1, baseActorEffectCount: 0`).
- `t.actor` exists only while its token is placed. Delete the token and the synthetic actor — and
  anything written to it — is gone, so "there is no marker" does not mean "there is no
  condition/state". Persist on the **bearer** when the state must outlive the target.
- Editing through `t.actor` writes a **delta override** (fixing that one token, leaving the base
  actor and every sibling token unchanged); deleting a delta key writes a **tombstone**. Linked
  tokens (`prototypeToken.actorLink: true`) instead share **ONE** actor, so a damage, effect,
  condition or reaction-counter test affects ALL of them.

FOR ANYTHING ON THE TABLE — targeting, being hit, being in range, a marker riding on a creature, a
prompt about a token on the scene — **iterate tokens, not actors**: `canvas.tokens.placeables` for
the current scene, or every `scene.tokens[].actor` across scenes. When in doubt use a **UNION pool**
(`game.actors` PLUS each scene token's actor, deduped by **uuid**, not id — id is shared between a
token actor and its base). Read and write the **same** pool, or the write lands somewhere the read
never looks; that exact asymmetry — write `t.actor`, scan `game.actors` — is what made Vow of
Enmity's transfer return with no prompt and no error at all. Prefer the token's actor for anything
placeable, and the base actor only when the change must apply to every copy (then refresh the token).

**Never conclude "nothing found" from one pool.** An empty `game.actors` scan is a statement about
that pool, not about the world. The tell that you have this bug: everything works on linked tokens
(player characters) and silently does nothing on monsters — which are exactly the unlinked ones.

### 5. Teleport routes — both are valid; do NOT convert one into the other

Two acceptable teleport shapes exist and the ruling is to **leave both alone**: (1) dnd5e 6's
native `teleport` activity, run by midi as a workflow configured through its `midiTeleport`
block (`movers`/`blocked`/`requireSight`); (2) CPR's `teleport` generic at activity level via
`flags.cat.macros` + `genericConfig["chris-premades"].teleport`. Build on the NATIVE route only
when a teleport has NEITHER (no native activity and no CPR generic, or some legacy form). A
native activity carries BOTH blocks — `teleport.value/units` is dnd5e's, `midiTeleport.*` is
midi's — so audit both when reading one.

---

## Weapon mastery: two mechanisms, and a three-part test

`system.mastery` on a weapon holds only the **KEY** ("sap"/"topple"/"vex"). That key is a
**label, not a usable property**: a weapon can carry "slow" while its bearer holds no mastery
with it, and then nothing should act on it at all. Do not read a key as "this dangles and must
be implemented" — that inference is wrong.

**Automation is wanted only when ALL THREE hold:**

1. the actor has a **Weapon Mastery** feature;
2. on the sheet under **Configure Weapons**, that weapon's **Mastery** checkbox is enabled;
3. a weapon of that type is in the inventory.

Anything short of all three is inert **by the rules** and needs no automation.

For the automation we author, the behaviour is a `transfer: false` ActiveEffect **on the weapon
item**, linked from the attack activity via `activity.effects[]._id`. Weapon **clones** drop
non-attack activities and their effects, so check whether a mastery survived a clone rather than
assuming it was never there.

**Ours identify by NAME, not by `flags.cat.identifier`.** An identifier lookup will not find them
— read the weapon's `activities[].effects[]._id`, then the item's own effects. An audit that
searches identifiers reports them absent when they are present.

**CAT 0.1.6 can apply weapon mastery itself**, under the **Weapon Mastery** setting
(`cat.weaponMastery`: `none` | `pc` | `npc` | `both`, default `pc`). Where CAT applies the
property AND the weapon carries our hand-built effect, the same mastery lands **twice** —
confirmed in play on Sap: two effects on one actor. This world sets `none`, which suppresses the
collision but does not make it impossible: the default is `pc`, so re-enabling the setting (or a
future change to its default) reintroduces a second application alongside ours. Check all three
parts of the test **plus the setting** before adding, keeping or removing either mechanism.

---

## Corrections: how it actually works

Folded in from session lessons, each stated as the mechanism rather than as a label, and
grouped by the module it concerns.

### midi-qol

**`isDamaged` can change the damage.** It fires inside `callDamageHooksAndMacros` *before* the
damage record is finalised, so a reaction bound to it can still mutate the damage —
`uncanny-dodge` halves each entry from there, and its condition has to include `hasAttack`. The
field guide's midi section describes the flag itself.

**`workflow.saves` is used for effects that apply on a SUCCESSFUL save.** Morgantha's Eyebite is
the worked case: it is homebrew with an inverted save, where a target that SUCCEEDS is dazed, so
looping `workflow.saves` was right for it. A success-payload is a real design, not a symptom of
a wrong payload.

### dnd5e and DAE effects

**An activity's effect-link DOES apply its effect.** `activity.effects[]._id` pointing at an item
effect with `onSave: false` applies it, including on a failed save — it is a supported
mechanism. The claim that it did not came from a single negative test that read
`wf.appliedEffects`, which is `undefined` by design; one observation is not enough to overturn a
mechanism.

**`duration.expiry` and `flags.dae.specialDuration` are both live, for different values.**
`duration.expiry` is the field for the turn and rest values; the flag stays the field for every
value dnd5e has no field for — midi-qol's whole set, plus `combatEnd`/`joinCombat`. A `1Reaction`
or a `1Attack` belongs on the flag, where it still works; migrating one to `duration.expiry`
stops it. `dae-effect-expiry.md` has the full split.

**A granted effect's duration follows what the effect IS.** A spell's own granted buff carries a
duration matching the spell — Bless 60s/`turnStart`, Invisibility 3600s. A separate component or
companion effect leaves its duration empty — Spirit Guardians ×2, Compelled Duel ×2, Guidance —
which is what those cases needed. A blanket "always empty" and a blanket "always carry its own
cap" contradict each other, which is the tell that neither is the rule; the effect decides.

---

## Where project status lives

Whether something has been actioned, or is "not started", is project **state**, not a fact about
how a module behaves. It belongs in the history log, where the latest entry on a topic is the
state of record. These reference files describe mechanisms; they do not track what has been
built.
