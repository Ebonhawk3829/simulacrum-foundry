# CPR generic macro settings

Every generic macro in Chris's Premades and the settings each accepts in
`flags.cat.genericConfig`. Generated from CPR source at **2.1.4** by
`resources/generate-cpr-config.mjs` — do not hand-edit; re-run the generator.

Nothing publishes this list. CPR declares it in code, on each generic's exported
`genericConfig`, and the labels and hints it carries are localization keys. Both are
resolved here, so the descriptions below are CPR's own wording rather than a
paraphrase.

## How to read this

The shape is `flags.cat.genericConfig[source][identifier][setting]`:

```js
flags: {
  cat: {
    genericConfig: {
      'chris-premades': {
        conditionAutoSave: { conditions: ['incapacitated', 'stunned'], magical: true },
      },
    },
  },
}
```

The identifier heading each section is the *export name* of the generic, and it is
the same identifier that appears in `flags.cat.macros` — a generic is attached there
and configured here. Read `cat-macro-flags.md` for the attachment half.

**You usually do not need to write this by hand.** Every setting has a default, and an
absent setting means the default, so attaching with no `genericConfig` uses the
behaviour in the Default column.

Types: `checkbox` (boolean), `text`, `number`, `select`, `select-many` (array),
`selectIdentifiers` (array of item identifiers). Default is what is used when the
setting is absent.

**61 generics, 328 settings.** A generic that takes no
settings is not listed — it needs no configuration to attach.

---

## `actionDismissal`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity |

## `additionalTargets`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `damageType` | select-many | `[]` | Limit this feature by a list of dealt damage types. |
| `healingType` | select-many | `[]` | Limit this feature by a list of dealt healing types. |
| `identifiers` | selectIdentifiers | `[]` | Limit this feature to a list of specific items. |
| `itemType` | select-many | `[]` | Limit this feature to certain item types. |
| `disposition` | select | `ally` | Disposition |
| `range` | number | `5` | Range |
| `rangeFrom` | select | `target` | The token from which to measure range. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `targets` | number | `1` | Any value less than one will count as unlimited. |

## `advancedMeleeAttack`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `areaAnimation`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Animation |
| `areaOnly` | checkbox | `false` | Only play for activities that have an area. |

## `attackBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |
| `identifiers` | selectIdentifiers | `[]` | Limit this feature to a list of specific items. |
| `attackType` | select | `''` | Limit this feature by attack type. |

## `attackRider`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Played on the hit target when the rider is used. |
| `bonus` | text | `''` | Extra damage added to the roll when this option is chosen. |
| `bonusDamageType` | select | `''` | Damage type of the extra damage. Uses the attack's damage type when empty. |
| `creatureTypeBonus` | text | `''` | Extra damage added to the bonus when every hit target is one of the Target Creature Types. |
| `targetCreatureTypes` | select-many | `[]` | Creature types that receive the Creature Type Bonus. |
| `tag` | text | `''` | Tagged options are offered as choices under the bonus that owns the tag instead of as separate bonuses. |
| `limit` | text | `1` | How many tagged options can be chosen for one damage roll. |
| `workflowProperty` | text | `''` | Only offer this option when an earlier bonus has set this workflow property. |
| `identifiers` | selectIdentifiers | `[]` | Limit this feature to a list of specific items. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `attackAbility` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `maxSize` | select | `''` | Only offer this option when every hit target is this size or smaller. |
| `requiredItems` | selectIdentifiers | `[]` | Only offer this option when the actor has an item with one of these identifiers. |
| `suppressedBy` | selectIdentifiers | `[]` | Do not offer this option when the actor has an item with one of these identifiers. |
| `ownTurn` | checkbox | `false` | In combat, only offer this option on the attacker's own turn. |
| `selfAsTouch` | checkbox | `false` | When the activity's range is Self, roll it on the hit targets instead of the attacker. |
| `riderNearbyRange` | number | `0` | The rider activity also targets creatures within this distance of the hit target. 0 targets the hit target only. |
| `useActivityCosts` | checkbox | `false` | Use Activity Costs |

## `auraDesignation`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `choose` | checkbox | `false` | Prompt for unaffected creatures on cast. When off, only enemies are affected. |

## `banish`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Animation |

## `bladeSpell`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Only run when this activity is used. Leave blank to run on any activity. |
| `meleeOnly` | checkbox | `true` | Only offer equipped melee weapons. |
| `proficientOnly` | checkbox | `false` | Only offer weapons the caster is proficient with. |
| `ability` | select | `default` | Ability used for the weapon's attack and damage rolls. Spellcasting uses this spell's spellcasting ability. |
| `damageTypes` | select-many | `[]` | Damage types that can replace the weapon's damage type. |
| `optionalDamageReplacement` | checkbox | `false` | Let the caster keep the weapon's normal damage type. |
| `bonusDamageDieFormula` | text | `''` | Formula for the number of extra damage dice. Leave blank to use cantrip scaling. |
| `bonusDamageDieDenomination` | number | `0` | Die size of the extra damage dice added to the weapon attack. 0 adds none. |
| `bonusDamageTypes` | select-many | `[]` | Damage types of the extra damage dice. |
| `onHitEffect` | selectEffect | `''` | Effect applied to the target when the weapon attack hits. |
| `activityOnHit` | selectActivity | `''` | Activity used against the target when the weapon attack hits. |
| `effectNearby` | selectEffect | `''` | Effect applied to creatures near the hit target. |
| `effectNearbyRange` | number | `5` | Distance from the hit target in which creatures can receive the nearby effect. |
| `effectNearbyTargets` | number | `1` | Maximum number of creatures that receive the nearby effect. |
| `activityNearby` | selectActivity | `''` | Activity used against creatures near the hit target. The activity's target count limits how many can be chosen. |
| `activityNearbyRange` | number | `5` | Distance from the hit target in which creatures can be chosen for the nearby activity. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `checkBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |

## `checkModifier`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `modifier` | text | `''` | modifier |
| `ability` | select-many | `[]` | Abilities |

## `choiceRemoveCondition`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `affects` | select | `self` | Remove conditions from the user of the activity or from its target. |
| `count` | text | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `conditionAutoSave`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `magical` | checkbox | `false` | Magical |
| `display` | checkbox | `true` | Display |

## `contestedCheck`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceSkills` | select-many | `[]` | Skills the user contests with. The highest total is rolled. The activity's own check is the target's side. |
| `sourceAbilities` | select-many | `[]` | Ability checks the user contests with when no skill is set. The highest modifier is rolled. |
| `advantageMaxSize` | select | `''` | Roll the contest with advantage when every target is this size or smaller. |
| `sizeCheck` | select | `''` | Remove targets that are too large or immune for this grapple or shove. |

## `damageBonusToOneRoll`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Damage Bonus |
| `bonusDamageType` | select-many | `[]` | Damage types to offer as choices for this bonus. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `damageType` | select-many | `[]` | Limit this feature by a list of dealt damage types. |
| `healingType` | select-many | `[]` | Limit this feature by a list of dealt healing types. |
| `identifiers` | selectIdentifiers | `[]` | Limit this feature to a list of specific items. |
| `properties` | select-many | `[]` | Limt this feature by any matching item property. |
| `itemType` | select-many | `[]` | Limit this feature to certain item types. |
| `spellLevel` | select-many | `[]` | Limit this feature by spell level. |
| `spellSchool` | select-many | `[]` | Limit this feature by spell school. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `maxTargets` | number | `0` | Limit the bonus to this many targets. 0 applies it to every target. |
| `everyRoll` | checkbox | `false` | Add this bonus to each roll of a multi-attack rather than one of them. |
| `requireHit` | checkbox | `false` | Only apply this bonus to targets that were hit. |
| `attackerRange` | number | `0` | Only add the bonus against targets within this many feet of the attacker. 0 ignores distance. |
| `targetWounded` | checkbox | `false` | Only apply the bonus when the target is missing hit points. |
| `targetEffects` | selectIdentifiers | `[]` | Only apply this bonus to hit targets that carry one of these effects created by you. |
| `targetCreatureTypes` | select-many | `[]` | Only apply this bonus to hit targets of these creature types. |
| `useActivityCosts` | checkbox | `false` | Use Activity Costs |
| `allowCritical` | checkbox | `true` | Critical hit rules can be applied to this bonus. |

## `endIfUnaffected`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `condition` | select | `failedSave` | End concentration on the spell when the roll has this outcome. |
| `activityId` | selectActivity | `''` | Only check uses of this activity. Leave empty to check every activity. |

## `extraAttack`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attacks` | number | `2` | Attacks |
| `prompt` | checkbox | `true` | Prompt for Targets |
| `skip` | checkbox | `true` | Skip Dead And Unconscious |
| `identifier` | text | `unarmed-strike` | Identifier of the attack item. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `grapple`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `auto` | checkbox | `false` | Apply grapple without rolling dice. |
| `checkSize` | checkbox | `true` | Check Target Size |
| `dc` | text | `''` | Overrides activity info if present. |
| `conditions` | select-many | `[]` | Additional conditions to attach to the grapple effect. |
| `useActivityInfo` | checkbox | `true` | Icons, item name, and roll DC will be taken from the parent save activity. |
| `replaceActivity` | checkbox | `true` | The parent activity roll will be discarded and replaced by the grapple macro. |

## `heroicInspiration`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `affects` | select | `self` | Give Heroic Inspiration to the activity's user or to its targets. |

## `hide`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `effect` | selectEffect | `''` | Effect |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `ignoreCover`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attack` | select | `''` | Limit this feature by attack type. |
| `cover` | select | `2` | cover |

## `itemRecovery`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `identifier` | text | `''` | Identifier |
| `period` | select | `initiative` | Recovery Period |
| `formula` | text | `''` | Formula for the uses recovered. Leave empty to recover all uses. |

## `movementAnimation`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `selectLocationsAnimation` | selectAnimation | `[object Object]` | Selection Animation |
| `moveAnimation` | selectAnimation | `[object Object]` | Move Animation |
| `movementEffect` | selectEffect | `''` | Movement Effect |

## `moveRegion`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceActivityId` | selectActivity | `''` | Activity that placed the region this activity moves. |
| `maxRange` | number | `0` | Furthest the region's centre can move from its old centre. 0 ignores distance. |

## `multiSingleTarget`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity |
| `formula` | text | `@item.level` | Formula |
| `skipDeadAndUnconscious` | checkbox | `true` | Skip Dead And Unconscious |
| `attackActivityId` | selectActivity | `''` | Attack Activity |
| `animation` | selectAnimation | `[object Object]` | Animation |
| `reactionItemIdentifiers` | selectIdentifiers | `[]` | Reaction Item Identifiers |
| `reactionEffectIdentifiers` | selectIdentifiers | `[]` | Reaction Effect Identifiers |
| `utilityRollAsDamage` | checkbox | `false` | Utility Roll As Damage |
| `combineAttacks` | checkbox | `false` | Roll one attack per target. The attack's first damage part rolls one die per attack allocated to that target. |

## `negateDamageFromEffect`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `identifiers` | selectIdentifiers | `[]` | Identifiers |

## `nextHitRider`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Played on the hit target when the rider is used. |
| `bonus` | text | `''` | Extra damage added on the next hit. @scaling is the number of levels the spell was upcast. |
| `bonusDamageType` | select | `''` | Damage type of the bonus. None uses the attack's damage type. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `rollActivity` | selectActivity | `''` | Activity rolled on the hit target after the bonus damage. |
| `riderNearbyRange` | number | `0` | The rider activity also targets creatures within this distance of the hit target. 0 targets the hit target only. |
| `endSpell` | select | `never` | When the spell ends after the rider activity is rolled. |

## `packTactics`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attackType` | select | `attack` | Limit this feature by attack type. |
| `range` | number | `5` | Nearby Range |
| `benefit` | select | `self` | Who gains advantage when the conditions of this feature are met. |

## `preventDeath`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `killedOutright` | checkbox | `false` | Include Killed Outright |
| `deathOnly` | checkbox | `false` | Killed Outright Only |
| `saveActivity` | selectActivity | `''` | Roll this activity when the feature is used; a failed save stops it from preventing death. |
| `dcFromDamage` | checkbox | `false` | Add Damage Dealt to DC |
| `excludeCritical` | checkbox | `false` | Ignore Critical Hits |
| `excludeDamageTypes` | select-many | `[]` | Ignored Damage Types |
| `display` | checkbox | `true` | Display |

## `proficiencyChoice`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `effect` | selectEffect | `''` | Effect applied to each target. The {key} placeholder in its change keys becomes the chosen skill or tool path. |
| `traits` | select-many | `[skills]` | Offer skills, tools, or both. |
| `proficiency` | select | `''` | Limit the choices by the target's current proficiency. |

## `proneOnFail`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `skipProne` | checkbox | `false` | Targets that are already prone or immune to it do not roll the save. The use is cancelled when no target is left. |

## `proneOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `maxSize` | select | `''` | Targets larger than this size are not knocked prone. |

## `pullOnFail`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | text | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pullOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | text | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pushOnFail`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | text | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pushOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | text | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `redirectAttack`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity rolled when the attack is redirected. Leave blank to use the item. |
| `range` | number | `5` | Maximum distance between the creature being attacked and the new target. |
| `disposition` | select | `''` | Disposition relative to the creature being attacked. |
| `sizes` | select-many | `[]` | Limit the new target to these sizes. |
| `swapPlaces` | checkbox | `false` | The creature being attacked and the new target swap places. |
| `requireCover` | checkbox | `false` | Only offer the redirect while the creature being attacked has cover from the attacker. |

## `reduceMaxHP`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `reduceByRoll` | text | `''` | Reduce By Roll |
| `halfDamage` | checkbox | `false` | Half Damage |
| `checkSaves` | checkbox | `true` | Check Saves |
| `removeOnSave` | checkbox | `false` | Remove On Save |
| `shortRestCures` | checkbox | `false` | Short Rest Cures |
| `longRestCures` | checkbox | `true` | Long Rest Cures |
| `damageTypes` | select-many | `[]` | Damage Types |

## `reflectOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `rollActivity` | selectActivity | `''` | Activity on the effect's source item rolled against the attacker, at the level the effect was cast. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `range` | number | `0` | Only trigger when the attacker is within this distance. 0 ignores distance. |
| `requireTempHP` | checkbox | `false` | Only trigger while the effect's bearer has temporary hit points. |
| `oncePerTurn` | checkbox | `false` | Only trigger once per turn for each bearer. Outside combat it always triggers. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `rerollCheckWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |

## `rerollSaveWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |

## `rerollSkillWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |
| `skill` | select-many | `[]` | Limit this bonus to a list of skills. |

## `rerollToolWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |
| `tool` | select-many | `[]` | Limit this bonus to a list of tools. |

## `restoreUses`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `restoreActivity` | selectActivity | `''` | Activity that restores this item's uses. Leave blank to use the first activity that restores a use of this item. |
| `requireEmpty` | checkbox | `true` | Block the restore activity while uses remain. |
| `offerRestore` | checkbox | `true` | When another activity needs a use and none remain, offer to run the restore activity first. |

## `saveBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |

## `saveModifier`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `modifier` | text | `''` | modifier |
| `ability` | select-many | `[]` | Abilities |

## `saveToEndWhenFar`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | number | `30` | The save is offered only when the creature ends its turn farther than this from the effect's source. |
| `rollActivity` | selectActivity | `''` | Save activity on the source item rolled at the end of the creature's turn. A success removes this effect. |

## `selectDamageType`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `damageType` | select-many | `[]` | Prompt for a damage type when this item is rolled. |
| `rememberChoice` | checkbox | `false` | Offer "Don't ask again this combat" on the damage type prompt. |
| `atCast` | checkbox | `false` | Prompt once when the spell is cast and use that damage type for every later damage roll. |

## `skillBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |
| `skill` | select-many | `[]` | Limit this bonus to a list of skills. |
| `proficientOnly` | checkbox | `false` | Only offer this bonus on skills or tools the actor is proficient with. |

## `skillModifier`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `modifier` | text | `''` | modifier |
| `ability` | select-many | `[]` | Abilities |
| `skill` | select-many | `[]` | Skills |

## `specialItemUse`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `identifiers` | selectIdentifiers | `[]` | Items this feature can use. When set, item types are ignored. |
| `itemTypes` | select-many | `[]` | Item types this feature can use when no identifiers are set. |
| `equippedOnly` | checkbox | `false` | Equipped Items Only |
| `activityIdentifier` | text | `''` | Use only the activity with this identifier. Leave blank to allow any matching activity. |
| `activationTypes` | select-many | `[]` | Only activities with one of these activation types can be used. Leave empty to allow any. |
| `excludeActivityTypes` | select-many | `[]` | Activities of these types cannot be used. |
| `consumeUsage` | checkbox | `false` | Spend the used item or activity's own uses. |
| `consumeResources` | checkbox | `false` | Spend the resources the used activity consumes. |

## `spellAnimation`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Animation |

## `summonModifier`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceIdentifiers` | selectIdentifiers | `[]` | Only modify summons created by items with these identifiers. Leave empty for any summon. |
| `creatureTypes` | select-many | `[]` | Only modify summons of these creature types. Leave empty for any creature type. |
| `effect` | selectEffect | `''` | Effect from this item to add to the summon. |
| `magicalWeapons` | checkbox | `false` | The summon's items that deal damage count as magical. |
| `confirm` | checkbox | `false` | Prompt to Use |

## `targetCreatureTypes`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `creatureTypes` | select-many | `[]` | Keep only targets of these creature types. Leave empty to skip the creature type check. |
| `invert` | checkbox | `false` | Remove targets of the selected creature types instead of keeping them. |
| `aliveOnly` | checkbox | `false` | Remove targets at 0 hit points. |
| `maxSize` | select | `''` | Remove targets larger than this size. |
| `maxCR` | number | `-1` | Remove targets above this challenge rating. -1 skips the check. |
| `chooseTargets` | checkbox | `false` | For area activities, show a checklist of the remaining targets after filtering and keep only the ones picked. The user is always removed. |
| `minIntelligence` | number | `0` | Remove targets with a lower Intelligence score. 0 turns the check off. |
| `excludeSummoner` | checkbox | `false` | Remove the summoner when a summoned creature uses this item. |

## `teleport`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `targets` | select | `self` | Teleport the user, each target that failed its save, or the user to a space near one of the targets. Range is measured from the user, or from the chosen target for Near a Target. |
| `range` | text | `''` | Maximum teleport distance. Leave blank to use the activity's own range. |
| `rangeFromRoll` | checkbox | `false` | Use the activity's utility roll total as the maximum teleport distance. Falls back to Range, then the activity's own range, when nothing was rolled. |
| `requireSight` | checkbox | `true` | Only allow spaces the user can see. |
| `companions` | number | `0` | How many allies within Companion Range the user may bring along. They keep their position relative to the user. |
| `companionRange` | number | `5` | Companion Range |
| `companionMaxSize` | checkbox | `false` | Companions No Larger Than User |
| `excludeUser` | checkbox | `false` | On a self teleport, remove the user from the activity's targets. Use for areas centred on the space the user leaves. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `toolBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | text | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |
| `tool` | select-many | `[]` | Limit this bonus to a list of tools. |
| `proficientOnly` | checkbox | `false` | Only offer this bonus on skills or tools the actor is proficient with. |

## `toolModifier`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `modifier` | text | `''` | modifier |
| `ability` | select-many | `[]` | Abilities |
| `tool` | select-many | `[]` | Tools |

## `turnEndChoiceRemoveCondition`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `affects` | select | `self` | Remove conditions from the user of the activity or from its target. |
| `count` | text | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `turnStartChoiceRemoveCondition`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `affects` | select | `self` | Remove conditions from the user of the activity or from its target. |
| `count` | text | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `unhideActivities`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityIds` | selectActivities | `[]` | Activities |
| `favorite` | checkbox | `false` | Favorite Activities |

## `useOnEvent`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `events` | select-many | `[]` | Use this activity after these events. Short Rest also fires after a long rest. |
| `poolCondition` | select | `''` | Only use this activity when the items whose uses it recovers are in this state. |
| `confirm` | checkbox | `false` | Prompt to Use |

---

## Deliberately not listed


The `options` for a `select` or `select-many` setting are **not** enumerated. They
are read at run time from CPR's own `constants` module — the condition list, damage
types, creature types and so on. A copy here would go stale against the system it
has to match, and a wrong condition name fails quietly. Read the current list from
the module, or copy one from a working example in a CPR compendium.

A generic whose settings could not be resolved is reported by the generator rather
than omitted silently, so a blank section means it genuinely takes none.
