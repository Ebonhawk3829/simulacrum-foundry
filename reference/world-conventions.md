# This world's conventions, and the corrections not to re-learn

Two things that are true of **this world specifically** and that no generic reference can
tell you, followed by the claims that were taught before and turned out to be wrong. The
second list exists only so a fresh agent does not spend a session rediscovering them.

---

## F. World conventions

### F1. Damage is applied MANUALLY by the GM

`autoApplyDamage: "noCard"`. Damage-gated automation does not run until the GM clicks
**Apply**. **Testing consequence:** a damage-triggered ability cannot be tested
unsupervised — and a silent non-fire there looks exactly like a broken ability. Confirm the
damage was actually applied before calling an `isDamaged` reaction broken.

### F2. Testing recipe (the parts that need no damage)

- Stub `foundry.applications.api.DialogV2.wait` to capture the prompt and return a chosen
  button action.
- Force dice by wrapping `Roll.prototype.evaluate`.
- For turn-driven abilities, create a temp `Combat`, add combatants and call `nextTurn()`.
- Observe the actor's flags and the captured chat messages.
- ALWAYS cover the negative cases (declined, out of range, no target).
- Clean up in a `finally`.

### F3. Prose versus disposition

Lowercase "hostile" / "friendly" in statblock prose is **relative** (usually "not its
allies"). Capital "Hostile" / "Friendly" is the token **disposition**.

### F4. Unlinked tokens have their own actor; edits go to the BASE actor

Editing through `token.actor` on an unlinked token writes a **delta override** — it fixes
that one token and leaves the base actor and every sibling token unchanged. Deleting a delta
key writes a **tombstone**. Fix the **base** actor, then refresh the token.

Linked tokens (`prototypeToken.actorLink: true`) share **ONE** actor, so a damage, effect,
condition or reaction-counter test affects ALL of them.

---

## H. Known non-deltas — do NOT re-learn these as lessons

Each of these was recorded as a lesson and is wrong, or was reference material mistaken for a
delta. Where a correction is longer, it points at the file that now holds it.

- **"`isDamaged` fires too late to change damage" — FALSE.** It fires before the damage record
  is finalised; the damage is mutable. See the field guide, §12 (`uncanny-dodge`).
- **"`flags.dae.specialDuration` keeps only four values" — FALSE.** midi-qol reads it for a
  large set. See `dae-effect-expiry.md` §2.
- **"`workflow.saves` means the payload is wrong" — FALSE.** A success-payload is a real
  design (e.g. Eyebite: succeed → dazed, fail → choose one of three). Read the item's own
  description before judging.
- **"activity effect-links do not apply effects" — FALSE.** See the field guide, §13.
- **"concentration effects must leave their duration empty" / "must carry their own duration
  cap" — BOTH over-general.** The live world shows: a spell's own granted buff carries a
  duration matching the spell (Bless 60s/`turnStart`, Invisibility 3600s); separate
  component/companion effects leave it empty (Spirit Guardians ×2, Compelled Duel ×2,
  Guidance). Judge by what the effect IS.
- **"weapon mastery automation does not exist here" — FALSE.** See H1.
- **"smite unification was never actioned" — FALSE.** A later history entry closed it.

### H1. Weapon mastery (the real shape)

`system.mastery` on the weapon holds only the **KEY** ("sap"/"topple"/"vex") — a label,
nothing acts on it. The behaviour is a `transfer: false` ActiveEffect **on the weapon item**,
linked from the attack activity. Weapon **clones** drop non-attack activities and their
effects, so check whether a mastery survived a clone rather than assuming it was never there.
