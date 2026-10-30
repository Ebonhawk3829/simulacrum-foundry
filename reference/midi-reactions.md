# midi-qol reactions: the trigger, the condition, and what the condition can see

Reactions are midi-qol's, not dnd5e's. dnd5e has an activation type called `reaction`;
what makes an ability actually *offered* in response to something is midi's. None of this
was in any shipped reference.

Read out of midi-qol's source at the version this world runs (14.6.4), in
`src/module/utils.ts` (`reactionTypes`, `reactionTriggerLabelFor`, `doReactions`,
`ReactionDialog`) and `src/module/activities/MidiActivityMixin.ts` (`useConditionText`,
`reactionCondition`).

---

## 1. The trigger is `useConditionText`, not `activation.condition`

`activity.useConditionText` **is** midi's `reactionCondition`:

```js
get reactionCondition() { return this.useCondition ?? ""; }   // useCondition -> useConditionText
get useCondition() { return this.useConditionText ?? ""; }
```

`activation.condition` is prose and enters nothing.

An **empty** `useConditionText` is not "no trigger". midi's fallback is
`reaction === "isHit"` — a trigger it invented:

```js
if (!reactionCondition) reactionCondition = 'reaction === "isHit"';
```

## 2. Compare the trigger LABEL, not an id

The string in `reaction === "..."` comes from `reactionTriggerLabelFor(triggerType)`, which
reads `reactionTypes` in `utils.ts`:

| Activity activation (`triggerType`) | `reaction` label it matches |
|---|---|
| `reaction` / `reactionhit` | `isHit` |
| `reactiontargeted` | `isTargeted` *(declared but never emitted — see below)* |
| `reactionattacked` | `isAttacked` |
| `reactiondamage` | `isDamaged` |
| `reactionheal` | `isHealed` |
| `reactionpreattack` | `preAttack` |
| `reactionmissed` | `isMissed` |
| `reactioncritical` | `isCrit` |
| `reactionfumble` | `isFumble` |
| `reactionsave` | `isSave` |
| `reactionsavefail` | `isSaveFail` |
| `reactionsavesuccess` | `isSaveSuccess` |
| `reactionmoved` | `isMoved` |

**`isTargeted` is never emitted.** `reactionTypes` declares `reactiontargeted ->
"isTargeted"`, but scanning every `doReactions(...)` call site in 14.6.4 shows none ever
passes `reactiontargeted`, so `reaction === "isTargeted"` never becomes true. For "being
targeted by an attack", use `reaction === "preAttack"` — declared before the roll, the right
moment for a defensive reaction — optionally narrowed:
`reaction === "preAttack" && (item.actionType === "mwak" || item.actionType === "msak")`.
`isTargeted` **is** a real midi MACRO PASS ("Target is targeted but before item is rolled");
it is simply not a reaction trigger. Two vocabularies sharing one name.

## 3. Reactions PROMPT by default — no flag needed

midi always renders a `ReactionDialog` when the condition matches; only the chosen button's
callback calls `completeActivityUse`. Declining, or the timeout (30s in this world), spends
nothing and creates **no workflow**. A fallback macro at `roll/itemRollFinished` therefore
CANNOT run on a declined reaction — there is no roll.

## 4. Token scope for an actor shared by several tokens

```js
reaction === "isDamaged" && targetUuid === "<reacting token's FULL uuid>" && ...
```

- `targetUuid` is the **REACTOR** (the one reacting to damage).
- `tokenUuid` is the **ATTACKER** (the source of the triggering effect).

The uuid is a full `TokenDocument` uuid: `Scene.<sceneId>.Token.<tokenId>`. It **embeds the
scene id**, so it breaks if the token is re-placed on a new scene, and it must be re-derived
per actor — two actors with identical token names still have different uuids.

## 5. Qualifiers ARE expressible in the condition — but the sandbox is tiny

The condition is evaluated in a sandbox that exposes ONLY the bare globals `getDistance` and
`fromUuidSync`. `canvas`, `game`, `MidiQOL`, `workflow`, `actor`, `token`, `target` and
`args` are all **undefined** there, so `MidiQOL.getDistance(...)` THROWS.

Verified working forms:

```js
getDistance(fromUuidSync(tokenUuid), fromUuidSync(targetUuid)) <= 10
(item.actionType === "mwak" || item.actionType === "msak")
target.canSee        // the REACTOR can see the ATTACKER - midi binds it that way
hasAttack
```

ALWAYS guard a distance test with `!!tokenUuid`, or an unattributed damage source (an aura, a
trap) evaluates TRUE and fires the reaction.

## 6. Distance is PERIMETER-based, and `<= R` is the correct idiom

World setting `optionalRules.distanceMeasurement === "perimeter"`. midi computes
`distance = gridDistance + perimeterGap` — EDGE-TO-EDGE with a 5 ft base:

    edges touching (0 squares of gap) -> 5     a 5 ft reach
    1 square of gap                   -> 10     a 10 ft reach
    2 squares of gap                  -> 15

Express reach/range as `getDistance(...) <= R`. This is correct, not a bug — do not "switch
to centre-to-centre". `canvas.grid.measurePath([centreA, centreB])` gives the
centre-to-centre number, which is a *different* measurement, not a fix.

## 7. `canSee` is false if EITHER token is hidden

`_canSenseModes` starts `if (target.document.hidden || token.document.hidden) return [];`.
This is correct behaviour — a GM-hidden token is not part of the scene, not a trap.
Diagnostic consequence: a sight-gated reaction is absent in a dry run on a scene whose
monsters stay hidden until initiative. Check `token.document.hidden` before suspecting the
condition.

## 8. midi cannot offer a bystander's reaction

`ReactionFilter` charges the wrong actor. An ability where an **ally** is the target needs a
world-hooks approach instead of a midi reaction.

---

## What this file is not

- **Not the reaction UI.** The `ReactionDialog` layout, the timeout setting and
  `getReactionSetting(player)` (who is even offered the prompt) are not reproduced here.
- **Not a full `reactionTypes` dump.** The table above is every label as of 14.6.4; read
  `reactionTypes` in `utils.ts` if midi adds one.
