# Effects: expiry, and the flags that decide it

Written because the agent could not answer "how do I make this effect last until
the target is attacked?" from any installed module. DAE ships no readable
documentation in its release archive, and the flag that answers the question is not
a dnd5e field — so nothing else in this reference covers it.

Everything here was read out of DAE's own source at the version this world runs
(v14.6.2), not from a wiki or from memory. DAE 14.6.1/14.6.2 reworked expiry — the
changes that matter are marked below and collected in §8.

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

## 2. Special durations that are still flags, because they have no core equivalent

Some expiry conditions are not turn-based and dnd5e has no field for them. These stay
on `flags.dae.specialDuration` and **are** still honoured, because DAE scans for them
itself rather than leaving them to core:

| Value | Ends when |
|---|---|
| `isAttacked` | the bearer is attacked |
| `isDamaged` | the bearer takes damage |
| `combatEnd` | the combat ends |
| `joinCombat` | the bearer joins a combat |

`combatEnd` and `joinCombat` are verified as flag-driven: DAE's own hooks filter on
`effect.flags?.dae?.specialDuration?.includes("combatEnd")` (and `"joinCombat"`).
They are **not** dnd5e expiry values — `combatEnd` does not appear in dnd5e at all.
DAE's migration map does translate `combatEnd` into `duration.expiry`, but dnd5e
ignores it; the flag is what acts. So for these four, write the flag.

A worked example of the flag form, which is what you want for these:

```js
{
  name: 'Reckless',
  flags: { dae: { specialDuration: ['isAttacked'] } },
}
```

Note the array. This is the one place the flag is still correct, and it is the case
the agent asked about.

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

## 7. What DAE 14.6.1/14.6.2 changed about expiry

Collected from DAE's changelog for the two patches this world added, because each is
the kind of change that makes an existing effect behave differently without an error:

- **Elapsed Time is retired.** Applied effects that take the activity's duration get
  no expiry event, so dnd5e 6 gives them *Turn Start* in combat; an effect that stores
  Elapsed Time is treated as having **no** expiry event.
- **Source/Target Turn expiries keep their duration** where dnd5e 6 drops it (see §3).
  A source/target **end** expiry no longer ends on the turn the effect was applied.
- **Outside combat, time passing ends an effect whose expiry event has no duration**
  (e.g. *Turn Start*, or dnd5e's *Target Turn End*), as Foundry does; only *Combat
  Start* waits for a combat.
- **Migrating deprecated special durations no longer discards** the ones
  `duration.expiry` cannot express — the rest stay on `flags.dae.specialDuration` and
  keep warning. An expiry the author set explicitly is **not** overwritten.
- **An effect inheriting its duration from the activity/item** expires with world time
  (`updateWorldTime`), not only on the round tick.
- **`enableCondition` follows expiry mode:** when it becomes false the effect ends like
  an expired one — deleted, or disabled+re-enabled under *suppress* mode.
- **Effect expiry action** (delete vs disable, §6) is per-effect via
  `CONFIG.ActiveEffect.expiryAction`, world setting as fallback.
- **`expiry-reason`** is injected into Foundry v14's expiry operations so a macro can
  tell why an effect was removed (`duration-expired:turnStart`, `dae:expired:…`).

## 8. What this file is not

- **Not a full DAE flag reference.** `flags.dae.*` also carries `stackable`,
  `macroRepeat` and `transfer`. Those are named here only where they affect expiry.
- **Not verified against a live world.** Everything above was read from DAE's source
  at v14.6.2 and dnd5e's at release-6.0.6. The migration map is DAE's own and the
  expiry list is dnd5e's own, but no effect using these values has been created and
  observed in this world yet.

DAE's own documentation (a GitLab readme, not shipped with the module) is the
authority if something here disagrees with what you observe.
