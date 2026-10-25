# Effects: expiry, and the flags that decide it

Written because the agent could not answer "how do I make this effect last until
the target is attacked?" from any installed module. DAE ships no readable
documentation in its release archive, and the flag that answers the question is not
a dnd5e field — so nothing else in this reference covers it.

Everything here was read out of DAE's own source at the version this world runs
(v14.6.3), not from a wiki or from memory. DAE reworked expiry across 14.6.1–14.6.3 —
the changes that matter are marked below and collected in §7.

---

## 1. `duration.expiry` is the field — `flags.dae.specialDuration` is deprecated

The question "when does this end?" is answered by dnd5e's own
`duration.expiry`, not by a DAE flag:

```js
// An effect that ends when the target is damaged.
{
  name: 'Hunters Mark',
  duration: { value: 1, units: 'hour', expiry: 'isDamaged' },
}
```

`flags.dae.specialDuration` was the pre-v14 way to say this, and it is **deprecated**.
DAE migrates it on effect creation, but the migration is lossy in a way that will
surprise you:

- Only the **first** recognised entry is converted to `duration.expiry`.
- The rest are **left on the flag** rather than dropped — and the flag no longer
  drives anything.

So a converted effect can look migrated while half its expiry rules are inert. Write
`duration.expiry`.

### The deprecated names, and what they become

From `getDeprecatedSpecialDurMap()` in `src/module/specialDurations.ts`. As of DAE
14.6.2 this is a **single** map — there is no longer a separate dnd5e-5.x column,
because DAE now maps source/target names through on 6.x too and preserves the
source/target distinction:

| Old `flags.dae.specialDuration` | `duration.expiry` (this world, dnd5e 6.x) |
|---|---|
| `turnStart` | `targetStart` |
| `turnEnd` | `targetEnd` |
| `turnStartSource` | `sourceStart` |
| `turnEndSource` | `sourceEnd` |
| `combatEnd` | `combatEnd` |

This is the correction to watch for: **earlier 14.6.x mapped `turnStartSource` to
plain `turnStart`**, silently losing the source/target distinction — the code comment
calls it out. An effect that means "until the *caster's* turn starts" now migrates to
`sourceStart` and stays correct. Write `duration.expiry` directly rather than relying
on the migration either way.

## 2. `flags.dae.specialDuration` is NOT dead — it is midi-qol's field as much as DAE's

The flag is deprecated only for the turn/rest values that `duration.expiry` now covers.
For everything dnd5e has no field for it is still the live field, and **two** modules read
it. An expiry guide that lists only four values (`isAttacked`, `isDamaged`, `combatEnd`,
`joinCombat`) is describing the DAE side and missing the larger set midi-qol enforces — a
list that will make you "migrate" a working midi value off the flag and break it.

- **DAE** reads it for the combat/rest values it hooks itself.
- **midi-qol** reads it for the roll- and action-scoped expiries, in
  `Workflow.expireTargetEffects()` (`src/module/Workflow.ts`) and `expireMyEffects()`
  (`src/module/utils.ts`). Verified by extracting every `specialDuration.includes(...)`
  comparison and `expireMyEffects.bind(this)([...])` call.

### DAE-owned values (turn/rest/combat)

`duration.expiry` is the live field for the turn ones, but these flag spellings are still
read:

    turnStart, turnEnd, roundStart, roundEnd
    sourceStart, sourceEnd, targetStart, targetEnd
    combatEnd, joinCombat
    longRest, shortRest, newDay

`combatEnd` is not a dnd5e value at all; the flag is what acts. DAE's migration map
translates it to `duration.expiry` for completeness, but dnd5e ignores it.

### midi-qol-owned values (write these ON THE FLAG — no `duration.expiry` equivalent)

    1Attack, 1Attack:<actionType>       (mwak/msak/rwak/rsak)
    1Hit, 1Hit:<actionType>
    1Miss, 1Miss:<actionType>
    1Critical, 1Fumble
    1Spell, 1Action, 1Reaction
    Bonus Action, Reaction, Turn Action   (activation types)
    DamageDealt, Initiative
    isAttacked, isAttacked:<actionType>
    isDamaged, isDamaged.<damageType>
    isHealed
    isHit, isHit:<actionType>, isHitCritical, isMissed
    isSave<ability>, isSaveSuccess<ability>, isSaveFailure<ability>, isSaveFail<ability>
    isMoved

### The consequence for authoring

- `1Reaction` and `1Attack` are midi values. Moving one to `duration.expiry` silently
  breaks it.
- `1Save` and `1Check` appear in **neither** module and are inert. The real save values are
  `isSave` / `isSaveSuccess` / `isSaveFailure`. Fix those if you see them.
- `flags.dae.specialDuration` is an **array**. A worked midi example:

```js
{
  name: 'Reckless',
  flags: { dae: { specialDuration: ['isAttacked'] } },
}
```

Because the flag is read by two modules, set `duration.expiry` only for the turn/rest
values and keep the flag for midi's set and `combatEnd`/`joinCombat` — do not assume one
replaces the other. See §1 for the lossy migration that makes this easy to get wrong.

## 3. Which `duration.expiry` values dnd5e actually accepts

Verified against dnd5e 6.0.6's `ActiveEffect` (`PSEUDO_EXPIRIES`,
`DURATIONLESS_EXPIRIES`, `isExpiryEvent`), not from a wiki:

| `expiry` | Meaning | Carries a duration? |
|---|---|---|
| `turnStart` | the bearer's turn starts | yes |
| `turnEnd` | the bearer's turn ends | yes |
| `sourceStart` | the *caster's* turn starts | no |
| `sourceEnd` | the *caster's* turn ends | no |
| `targetStart` | the *target's* turn starts | no |
| `targetEnd` | the *target's* turn ends | no |
| `longRest` | a long rest completes | no |
| `shortRest` | a short rest completes | no |
| `updateWorldTime` | elapsed world time passes | yes |

The last column is the trap nobody expects. dnd5e splits these three ways:

- `PSEUDO_EXPIRIES` = `sourceStart`, `sourceEnd`, `targetStart`, `targetEnd`
- `DURATIONLESS_EXPIRIES` = `longRest`, `shortRest`
- anything else = a turn-ish expiry that may carry a duration

For a **pseudo** or **durationless** expiry, `expirySupportsDuration` is false and
dnd5e **nulls `duration.value`** when the effect is created:

```js
if ( expiry && !this.expirySupportsDuration(expiry) ) {
  foundry.utils.setProperty(changed, "duration.value", null);
}
```

So `{ value: 1, units: 'hour', expiry: 'targetStart' }` does not mean "one hour, or
until the target's turn, whichever first". It means the value is discarded and the
effect ends at the target's next turn start. If you want both, that is two effects or
a `turnStart` expiry with a duration.

**But DAE 14.6.2 puts the duration back.** It deliberately preserves the duration on
*Source/Target Turn* expiries where dnd5e 6 drops it, so on this world
`{ value: 3, units: 'rounds', expiry: 'sourceStart' }` really does mean "ends at the
caster's turn start, once three rounds have passed", exactly as on dnd5e 5.x. With no
duration it is still the next such turn. The core `expirySupportsDuration` behaviour
above is what DAE works around, not what you get.

When `units` is `"turns"` and no expiry is given, dnd5e defaults it to `"turnStart"`
rather than expiring at round turnover:

```js
if ( units !== "turns" ) expiry ??= "turnStart";
```

## 4. The trap: `units: "turns"` counts wrongly with `updateWorldTime`

Core's turn counting is relative to the combatant's position in the initiative
order, so with `startTurn = 5` and 8 combatants only 3 turns per round count toward
elapsed time. That is correct for `turnStart`/`turnEnd` (where you want "how many
times has *this* combatant acted") and **wrong** for elapsed time.

DAE patches this specifically: for an effect with `expiry: "updateWorldTime"`,
`units: "turns"` and a finite `duration.value`, it recomputes remaining as total
turns elapsed, counting every turn equally.

The consequence for authoring: `{ value: 5, units: 'turns', expiry: 'updateWorldTime' }`
means five *actual* turns. Without DAE it would mean five of the bearer's turns. If
that is what you want, use `turnStart`/`turnEnd` instead of relying on the patch.

## 5. A transfer effect cannot expire on a turn

DAE skips turn-based expiry for effects with `transfer: true`:

```js
if (turnExpiries.includes(expiry) && !isTransferEffect(effect)) { /* expire it */ }
```

`isTransferEffect` is simply `effect.transfer`. So an effect that transfers from an
item to the actor **will not** be ended by its own `duration.expiry` turn values. If
a transferred effect must end on a turn, set the expiry on the actor's effect rather
than on the item's.

## 6. Effect expiry action: delete versus disable

By default an expiring effect is **deleted**. DAE can instead disable it, which keeps
the effect defined and merely turns it off, and it does this per-effect via
`CONFIG.ActiveEffect.expiryAction` with a fallback to the world setting:

| Per-effect | Behaviour |
|---|---|
| `"delete"` | delete on expiry |
| `"update"` | disable on expiry, keeping the definition |

An unset per-effect value defers to the world's global action. This is worth knowing
before writing an automation that assumes the effect is gone: on a world configured
to `"update"`, the effect is still present and merely disabled.

## 7. What DAE 14.6.1–14.6.3 changed about expiry

Collected from DAE's changelog for the patches this world added, because each is the
kind of change that makes an existing effect behave differently without an error:

- **Elapsed Time is retired.** Applied effects that take the activity's duration get no
  expiry event, so dnd5e 6 gives them *Turn Start* in combat; an effect that stores
  Elapsed Time is treated as having **no** expiry event. (14.6.3: an Elapsed-Time
  effect that also has no duration now takes the activity's duration.)
- **Duration inheritance changed in 14.6.3.** An applied effect with an **expiry event
  but no duration** no longer takes the activity's duration — it inherits only when it
  has **neither**; an effect with **neither** now takes the activity's *expiry event*.
  So an effect authored with only an expiry no longer silently gains the spell's
  duration, and one authored with nothing now gains the spell's expiry.
- **Source/Target Turn expiries keep their duration** where dnd5e 6 drops it (see §3).
  A source/target **end** expiry no longer ends on the turn the effect was applied.
- **Outside combat, time passing ends an effect whose expiry event has no duration**
  (e.g. *Turn Start*, or dnd5e's *Target Turn End*), as Foundry does; only *Combat
  Start* waits for a combat.
- **Migrating deprecated special durations** no longer discards the ones
  `duration.expiry` cannot express — the rest stay on `flags.dae.specialDuration` and
  keep warning. An expiry the author set explicitly is **not** overwritten. 14.6.3
  refined this: **`combatEnd` now yields the single expiry slot** (before it could take
  it and then do nothing), and an entry the expiry already holds is dropped.
- **An effect inheriting its duration from the activity/item** expires with world time
  (`updateWorldTime`), not only on the round tick.
- **`enableCondition` follows expiry mode:** when it becomes false the effect ends like
  an expired one — deleted, or disabled+re-enabled under *suppress* mode.
- **An effect's own *Expiry Mode* is honoured** (14.6.3): under *Mark Expired* it is
  suppressed (disabled, kept) rather than deleted once out of combat.
- **Effect expiry action** (delete vs disable, §6) is per-effect via
  `CONFIG.ActiveEffect.expiryAction`, world setting as fallback.
- **`expiry-reason`** is injected into Foundry v14's expiry operations so a macro can
  tell why an effect was removed (`duration-expired:turnStart`, `dae:expired:…`).
- **`hasExpiry`/`hasDuration` were wrong** for an expiry-only effect (reported false)
  and a no-duration effect (reported true) until 14.6.3; both are exported, so if
  anything consults them, the answer changed.
- **A rounds/turns *Round End* off-by-one is fixed** (14.6.3): a 1-round *Round End*
  effect now ends at the end of the round after its duration has run out.

## 8. What this file is not

- **Not a full DAE flag reference.** `flags.dae.*` also carries `stackable`,
  `macroRepeat` and `transfer`. Those are named here only where they affect expiry.
- **Not verified against a live world.** Everything above was read from DAE's source
  at v14.6.3 and dnd5e's at release-6.0.6. The migration map is DAE's own and the
  expiry list is dnd5e's own, but no effect using these values has been created and
  observed in this world yet.

DAE's own documentation (a GitLab readme, not shipped with the module) is the
authority if something here disagrees with what you observe.
