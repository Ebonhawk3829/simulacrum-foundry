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

### 2. Testing recipe (the parts that need no damage)

- Stub `foundry.applications.api.DialogV2.wait` to capture the prompt and return a chosen
  button action.
- Force dice by wrapping `Roll.prototype.evaluate`.
- For turn-driven abilities, create a temp `Combat`, add combatants and call `nextTurn()`.
- Observe the actor's flags and the captured chat messages.
- ALWAYS cover the negative cases (declined, out of range, no target).
- Clean up in a `finally`.

### 3. Prose versus disposition

Lowercase "hostile" / "friendly" in statblock prose is **relative** (usually "not its
allies"). Capital "Hostile" / "Friendly" is the token **disposition**.

### 4. Unlinked tokens have their own actor; edits go to the BASE actor

Editing through `token.actor` on an unlinked token writes a **delta override** — it fixes
that one token and leaves the base actor and every sibling token unchanged. Deleting a delta
key writes a **tombstone**. Fix the **base** actor, then refresh the token.

Linked tokens (`prototypeToken.actorLink: true`) share **ONE** actor, so a damage, effect,
condition or reaction-counter test affects ALL of them.

---

## Weapon mastery (the real shape)

`system.mastery` on the weapon holds only the **KEY** ("sap"/"topple"/"vex") — a label,
nothing acts on it. The behaviour is a `transfer: false` ActiveEffect **on the weapon item**,
linked from the attack activity. Weapon **clones** drop non-attack activities and their
effects, so check whether a mastery survived a clone rather than assuming it was never there.

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
