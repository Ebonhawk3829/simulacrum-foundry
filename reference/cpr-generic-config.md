# CPR generic macro settings

Every generic macro in Chris's Premades and the settings each accepts in
`flags.cat.genericConfig`. Generated from CPR source at **2.1.8** by
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

**71 generics: 66 with settings, 5 with none (363 settings total).**

---

## `actionDismissal`

Deletes the item once its roll finishes. Bound on an item. Fires on `itemRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity |

## `additionalTargets`

Prompts to add nearby tokens as extra targets of a matching item, then rolls this item or an activity. Bound on an item. Fires on `actorTargeting`.

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

## `attackBonus`

Offers a bonus formula on a d20 roll. Bound on an effect, an activity or an item.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
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

Offers this activity as an optional damage bonus on a hit, then rolls it on the hit targets. Bound on an activity. Fires on `actorOptionalBonusDamage` and `actorRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Played on the hit target when the rider is used. |
| `bonus` | formula | `''` | Extra damage added to the roll when this option is chosen. |
| `bonusDamageType` | select | `''` | Damage type of the extra damage. Uses the attack's damage type when empty. |
| `creatureTypeBonus` | formula | `''` | Extra damage added to the bonus when every hit target is one of the Target Creature Types. |
| `targetCreatureTypes` | select-many | `[]` | Creature types that receive the Creature Type Bonus. |
| `tag` | text | `''` | Tagged options are offered as choices under the bonus that owns the tag instead of as separate bonuses. |
| `limit` | formula | `1` | How many tagged options can be chosen for one damage roll. |
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

Aura filter that only passes creatures grappled by the aura's source. Selected as an aura's `filter`. Fires on `filter`. / export const grappledBySource = { rules: 'all', version: '2.1.3', aura: [ { pass: 'filter', macro: grappled, priority: 50 } ] }; function summoner({source, target}) { return summonUtils.getSummonData(source)?.owner === target; } /** Aura filter that only passes the summoner of the aura's source. Selected as an aura's `filter`. Fires on `filter`. / export const summonerOfSource = { rules: 'all', version: '2.1.3', aura: [ { pass: 'filter', macro: summoner, priority: 50 } ] }; function notDesignated({source, target, sourceToken, targetToken, descriptor}) { const designated = source.flags['chris-premades']?.auraDesignated?.[descriptor.id]; if (!designated) return tokenUtils.isEnemy(sourceToken, targetToken); return !designated.includes(target.uuid); } /** Aura filter that skips the creatures the caster designated when casting the spell, or the caster's allies when nothing was designated. Selected as an aura's `filter`. Fires on `filter`. / export const notDesignatedBySource = { rules: 'all', version: '2.1.4', aura: [ { pass: 'filter', macro: notDesignated, priority: 50 } ] }; async function designate({document: item, workflow}) { if (workflow.activity.id !== item.system.activities.contents[0]?.id) return; const identifier = documentUtils.getIdentifier(item); const key = 'auraDesignated.' + identifier; if (!automationUtils.getGenericConfigValue(item, 'chris-premades', 'auraDesignation', 'choose')) { if (workflow.actor.flags['chris-premades']?.auraDesignated?.[identifier]) await documentUtils.setFlag(workflow.actor, 'chris-premades', key, null); return; } await designateCreatures(item, workflow, workflow.actor, 'CHRISPREMADES.Macros.Generic.AuraDesignation.Prompt', key); } /** Before the spell's aura is created, prompts the caster for creatures it leaves unaffected; the caster is always one. Without `choose`, nothing is designated and the filter leaves out the caster's allies. Pair with the `notDesignatedBySource` aura filter on an aura effect whose identifier matches the item's. Bound on an item. Fires on `itemPreambleComplete` for the item's first activity.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `choose` | checkbox | `false` | Prompt for unaffected creatures on cast. When off, only enemies are affected. |

## `banish`

Hides the affected actor's tokens while the effect exists and reveals them when it is deleted. Bound on an effect. Fires on `created` and `deleted`. An effect flagged `flags.cat.banish.permanent` that runs its full duration leaves the tokens hidden.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Animation |

## `bladeSpell`

Makes an attack with one of the caster's equipped weapons against a single target, then applies on-hit riders. Bound on an item. Fires on `itemRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Only run when this activity is used. Leave blank to run on any activity. |
| `meleeOnly` | checkbox | `true` | Only offer equipped melee weapons. |
| `proficientOnly` | checkbox | `false` | Only offer weapons the caster is proficient with. |
| `ability` | select | `default` | Ability used for the weapon's attack and damage rolls. Spellcasting uses this spell's spellcasting ability. |
| `damageTypes` | select-many | `[]` | Damage types that can replace the weapon's damage type. |
| `optionalDamageReplacement` | checkbox | `false` | Let the caster keep the weapon's normal damage type. |
| `bonusDamageDieFormula` | formula | `''` | Formula for the number of extra damage dice. Leave blank to use cantrip scaling. |
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

## `breathing`

Marks an item or effect that lets its creature breathe water, or not need to breathe at all. Environment areas skip Holding Breath for it. Bound on an item or effect. Fires on `created` and `deleted`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `mode` | select | `water` | Environment areas don't make the creature hold its breath where it can breathe. |

## `checkBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
| `phase` | select | `postResult` | When this bonus is offered during the roll. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `optional` | checkbox | `true` | Prompt before the bonus is added, rather than always adding it. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `false` | Roll this item when used. |
| `useActivityCosts` | checkbox | `false` | Only offer this bonus when its costs can be paid. |
| `consumeSuccessOnly` | checkbox | `false` | Costs are consumed only if the roll succeeds with the bonus. |

## `checkModifier`

Adds d20 modifiers to a roll and rerolls it. Bound on an effect or an item. Fires on `actorBonus`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `modifier` | text | `''` | modifier |
| `ability` | select-many | `[]` | Abilities |

## `choiceRemoveCondition`

Prompts to remove listed conditions from the user or its target once the roll finishes. Bound on an activity. Fires on `activityPreTargeting` and `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `affects` | select | `self` | Remove conditions from the user of the activity or from its target. |
| `count` | formula | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `conditionAutoSave`

Makes the actor automatically succeed on saves against activities that apply one of the listed conditions. Bound on an item. Fires on `actorTargetSituational`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `magical` | checkbox | `false` | Magical |
| `display` | checkbox | `true` | Display |

## `contestedCheck`

Rolls a check for the user and sets the activity's check DC to the result. Bound on an activity. Fires on `activityTargeting` and `activityPreambleComplete`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceSkills` | select-many | `[]` | Skills the user contests with. The highest total is rolled. The activity's own check is the target's side. |
| `sourceAbilities` | select-many | `[]` | Ability checks the user contests with when no skill is set. The highest modifier is rolled. |
| `advantageMaxSize` | select | `''` | Roll the contest with advantage when every target is this size or smaller. |
| `sizeCheck` | select | `''` | Remove targets that are too large or immune for this grapple or shove. |

## `contextAdvantage`

Before a listed ability check, saving throw, skill or tool check, CAT asks whether to roll it with advantage. Bound on an item or an effect. Fires on `actorContext`. An item must be equipped, and attuned if it needs attunement.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `check` | select-many | `[]` | Check Abilities |
| `save` | select-many | `[]` | Save Abilities |
| `skill` | select-many | `[]` | Skills |
| `tool` | select-many | `[]` | Tools |
| `statuses` | select-many | `[]` | Blocking Conditions |
| `label` | text | `''` | Label |

## `damageBonusToOneRoll`

Offers a damage bonus on a matching damage or healing roll. Bound on an effect or an item. Fires on `actorOptionalBonusDamage`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Damage Bonus |
| `bonusDamageType` | select-many | `[]` | Damage types to offer as choices for this bonus. |
| `applyTo` | select | `damage` | This bonus applies to damage, healing, or both. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `damageType` | select-many | `[]` | Limit this feature by a list of dealt damage types. |
| `healingType` | select-many | `[]` | Limit this feature by a list of dealt healing types. |
| `identifiers` | selectIdentifiers | `[]` | Limit this feature to a list of specific items. |
| `properties` | select-many | `[]` | Limt this feature by any matching item property. |
| `itemType` | select-many | `[]` | Limit this feature to certain item types. |
| `spellLevel` | select-many | `[]` | Limit this feature by spell level. |
| `spellSchool` | select-many | `[]` | Limit this feature by spell school. |
| `firstCastOnly` | checkbox | `false` | Bonus applies only on the initial cast for a spell. |
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

Ends concentration on the spell when the roll left no creature affected. Bound on an item or an activity. Fires on `itemRollFinished` and `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `condition` | select | `failedSave` | End concentration on the spell when the roll has this outcome. |
| `activityId` | selectActivity | `''` | Only check uses of this activity. Leave empty to check every activity. |

## `environment`

Applies environment effects to tokens in this scene, level or region. Underwater and No Air start Holding Breath unless the creature can breathe there. Breathable Air in any overlapping area cancels that. Extreme Cold and Extreme Heat roll a Constitution save each hour of world time. Extreme Heat grants a Drink Water item, and drinking skips the next heat save. Effects are removed once the token is in no matching area. Bound on a scene, level or region. Fires when a token is placed, moves, enters or leaves, and when combat starts.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `environments` | select-many | `[]` | Environments |
| `timing` | select | `always` | When tokens in this area are affected. |
| `coldIdentifiers` | selectIdentifiers | `[]` | Identifiers of equipped items or effects that make the creature succeed on Extreme Cold saves. |
| `heatIdentifiers` | selectIdentifiers | `[]` | Identifiers of equipped items or effects that make the creature succeed on Extreme Heat saves. |
| `heatDisadvantageIdentifiers` | selectIdentifiers | `[]` | Identifiers of equipped items or effects that give disadvantage on Extreme Heat saves, such as heavy clothing. |
| `saveInterval` | number | `3600` | Seconds of world time between Extreme Cold or Extreme Heat saves. A combat round is 6 seconds. |
| `coldDC` | number | `10` | DC of the Extreme Cold save. |
| `heatDC` | number | `5` | DC of the first Extreme Heat save. |
| `heatDCIncrease` | number | `1` | Added to the Extreme Heat DC for each save after the first. |
| `heatArmorTypes` | select-many | `[medium, heavy]` | Creatures wearing armor of these types have disadvantage on the Extreme Heat save. |
| `exhaustion` | number | `1` | Exhaustion levels a failed Extreme Cold or Extreme Heat save gives. |

## `extraAttack`

Splits a number of attacks with another item among nearby enemies once the roll finishes. Bound on an activity. Fires on `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attacks` | number | `2` | Attacks |
| `prompt` | checkbox | `true` | Prompt for Targets |
| `skip` | checkbox | `true` | Skip Dead And Unconscious |
| `identifier` | text | `unarmed-strike` | Identifier of the attack item. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `firearm`

Firearm rules. A natural roll at or below the misfire score turns the attack into a miss and damages the firearm, and a damaged or broken firearm can't attack. Weapon properties: `explosive` makes creatures within 5 feet of each hit target save (Dex, DC 8 + Dex + proficiency) or take 1d8 Fire; `recoil` blocks attacks beyond the weapon's normal range for the rest of the turn after an attack in combat; `blaring` gives Disadvantage on Stealth until the start of the user's next turn. Bound on an item. Fires on `itemPreTargeting`, `itemPreambleComplete`, `itemAttackRollComplete` and `itemRollFinished`. The item's `repair` activity rolls a tinker's tools check against 8 + the misfire score; a failure breaks the firearm.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `misfire` | number | `0` | Misfire Score |
| `unproficientPenalty` | number | `1` | Misfire Increase Without Proficiency |

## `grapple`

Attempts to grapple each target before the activity rolls. Bound on an activity. Fires on `activityPreItemRoll`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `auto` | checkbox | `false` | Apply grapple without rolling dice. |
| `checkSize` | checkbox | `true` | Check Target Size |
| `dc` | formula | `''` | Overrides activity info if present. |
| `conditions` | select-many | `[]` | Additional conditions to attach to the grapple effect. |
| `useActivityInfo` | checkbox | `true` | Icons, item name, and roll DC will be taken from the parent save activity. |
| `replaceActivity` | checkbox | `true` | The parent activity roll will be discarded and replaced by the grapple macro. |

## `heroicInspiration`

Gives Heroic Inspiration to the activity's user or its targets. Bound on an activity. Fires on `activityPreTargeting` and `activityRollFinished`. Creatures that already have Heroic Inspiration or are not characters are skipped, and the use is cancelled when nobody is left.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `affects` | select | `self` | Give Heroic Inspiration to the activity's user or to its targets. |

## `hide`

Gives the user the system's Hiding condition once the roll finishes, unless the check failed. The check total is the DC to find them, and attacking ends it. Bound on an activity. Fires on `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `dc` | formula | `''` | Formula the Stealth check must reach to hide. Leave blank for no DC. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `ignoreCover`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attack` | select | `''` | Limit this feature by attack type. |
| `cover` | select | `2` | cover |

## `itemRecovery`

Enchants another item on the actor with an extra uses recovery entry. Bound on an item. Fires on `created`, `medkit`, and `munched`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `identifier` | text | `''` | Identifier |
| `period` | select | `initiative` | Recovery Period |
| `formula` | formula | `''` | Formula for the uses recovered. Leave empty to recover all uses. |

## `modifyNextDamage`

Maximizes or doubles the bearer's next damage roll. Bound on an effect. Fires on `actorDamageRollComplete`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `mode` | select | `maximize` | Mode |
| `itemTypes` | select-many | `[]` | Item Types |
| `maxSpellLevel` | number | `9` | Max Spell Level |
| `consume` | checkbox | `true` | Remove After Use |

## `movementAnimation`

Prompts for locations within range once the roll finishes, then moves the user's token through them. Bound on an activity. Fires on `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `selectLocationsAnimation` | selectAnimation | `[object Object]` | Selection Animation |
| `moveAnimation` | selectAnimation | `[object Object]` | Move Animation |
| `movementEffect` | selectEffect | `''` | Movement Effect |

## `moveRegion`

Name a placed region after its spell and show the spell's move activity until the region is gone. @param {object} region Placed region. @param {object} item Spell that placed it. @param {string} moveIdentifier Identifier of the activity that moves the region. @returns {Promise<void>} / export async function prepareMovableRegion(region, item, moveIdentifier) { await documentUtils.update(region, {name: item.name}); const move = itemUtils.getActivityByIdentifier(item, moveIdentifier); if (!move) return; const unhideEffect = await itemUtils.unhideActivities(item, [move.id], {ids: true, favorite: true}); if (unhideEffect) await documentUtils.makeDependent(region, [unhideEffect]); } export async function syncRegionLights(region) { const {x, y} = getRegionCenter(region); const updates = region.parent.lights.filter(light => light.flags.dnd5e?.dependentOn === region.uuid && (light.x !== x || light.y !== y)).map(light => ({_id: light.id, x, y})); if (updates.length) await documentUtils.updateEmbeddedDocuments(region.parent, 'AmbientLight', updates); } function getPlacedRegion(activity, scene) { return regionUtils.getPlacedRegions(scene, activity).at(-1); } async function use({document, workflow}) { const newRegion = workflow.template; if (!newRegion) return; const config = automationUtils.getGenericConfigValues(document, 'chris-premades', 'moveRegion', configKeys); const identifier = documentUtils.getIdentifier(workflow.item); const sourceActivity = workflow.item.system.activities.get(config.sourceActivityId); if (!sourceActivity) { await documentUtils.deleteDocument(newRegion); return Logging.addMacroWarning('CPR', identifier, 'CHRISPREMADES.Macros.Generic.MoveRegion.NoSourceActivity', {notify: 'warn'}); } const region = getPlacedRegion(sourceActivity, newRegion.parent); if (!region) { await documentUtils.deleteDocument(newRegion); return Logging.addMacroWarning('CPR', identifier, 'CHRISPREMADES.Macros.Generic.MoveRegion.NoRegion'); } if (config.maxRange) { const oldArea = regionUtils.getArea(region); const newArea = regionUtils.getArea(newRegion); const distance = distanceUtils.measureDistance(region.parent, [oldArea, newArea]); if (!distanceUtils.isWithinRange(region.parent, distance, config.maxRange)) { await documentUtils.deleteDocument(newRegion); return Logging.addMacroWarning('CPR', identifier, 'CHRISPREMADES.Macros.Generic.MoveRegion.TooFar', {notify: true, format: {maxRange: config.maxRange}}); } } const {shapes, elevation, levels} = newRegion.toObject(); await documentUtils.deleteDocument(newRegion); await documentUtils.update(region, {shapes, elevation, levels}); await syncRegionLights(region); } /** Moves the region an earlier activity placed to the area this activity places, then deletes the new area. Bound on an activity. Fires on `activityRollFinished`. Lights made dependent on the region follow it to its new centre.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceActivityId` | selectActivity | `''` | Activity that placed the region this activity moves. |
| `maxRange` | number | `0` | Furthest the region's centre can move from its old centre. 0 ignores distance. |

## `multiSingleTarget`

Splits a rolled number of single-target attacks among the selected targets. Bound on an item. Fires on `itemRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity |
| `formula` | formula | `@item.level` | Formula |
| `skipDeadAndUnconscious` | checkbox | `true` | Skip Dead And Unconscious |
| `attackActivityId` | selectActivity | `''` | Attack Activity |
| `animation` | selectAnimation | `[object Object]` | Animation |
| `reactionItemIdentifiers` | selectIdentifiers | `[]` | Reaction Item Identifiers |
| `reactionEffectIdentifiers` | selectIdentifiers | `[]` | Reaction Effect Identifiers |
| `utilityRollAsDamage` | checkbox | `false` | Utility Roll As Damage |
| `combineAttacks` | checkbox | `false` | Roll one attack per target. The attack's first damage part rolls one die per attack allocated to that target. |

## `negateDamageFromEffect`

Negates the item's damage to targets that carry one of the listed effects. Bound on an item. Fires on `itemDamageComplete`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `identifiers` | selectIdentifiers | `[]` | Identifiers |

## `nextHitRider`

Adds bonus damage to the next hit, then rolls a rider activity on the target and removes the effect. With no bonus, the next hit only triggers the rider. Bound on an effect. Fires on `actorOptionalBonusDamage` and `actorRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Played on the hit target when the rider is used. |
| `bonus` | formula | `''` | Extra damage added on the next hit. @scaling is the number of levels the spell was upcast. |
| `bonusDamageType` | select | `''` | Damage type of the bonus. None uses the attack's damage type. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `rollActivity` | selectActivity | `''` | Activity rolled on the hit target after the bonus damage. |
| `riderNearbyRange` | number | `0` | The rider activity also targets creatures within this distance of the hit target. 0 targets the hit target only. |
| `endSpell` | select | `never` | When the spell ends after the rider activity is rolled. |

## `packTactics`

Grants advantage on attack rolls if an ally is near the target. - `attackType`: Limit this feature to the selected attack type. - `range`: The target must be within this distance from any token that would grant advantage. - `benefit`: Which character gains advantage when conditions are met.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `attackType` | select | `attack` | Limit this feature by attack type. |
| `range` | number | `5` | Nearby Range |
| `benefit` | select | `self` | Who gains advantage when the conditions of this feature are met. |

## `preventDeath`

Offers to use this item when a hit would drop the actor to 0 hit points, keeping the actor alive. Bound on an item. Fires on `targetDamageComplete`.

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

Prompts for a skill or tool for each target and applies an effect built around the choice. Bound on an activity. Fires on `activityRollFinished`. With no targets, the user is prompted instead.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `effect` | selectEffect | `''` | Effect applied to each target. The {key} placeholder in its change keys becomes the chosen skill or tool path. |
| `traits` | select-many | `[skills]` | Offer skills, tools, or both. |
| `proficiency` | select | `''` | Limit the choices by the target's current proficiency. |

## `proneOnFail`

Knocks prone each target that failed the save. Bound on an activity. Fires on `activityPreItemRoll`, `activityPreambleComplete` and `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `skipProne` | checkbox | `false` | Targets that are already prone or immune to it do not roll the save. The use is cancelled when no target is left. |

## `proneOnHit`

Knocks prone each target that was hit. Bound on an activity. Fires on `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `maxSize` | select | `''` | Targets larger than this size are not knocked prone. |

## `pullOnFail`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | formula | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pullOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | formula | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pushOnFail`

Moves targets toward or away from the user once the roll finishes. Bound on an activity. Fires on `activityRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | formula | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `pushOnHit`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | formula | `5` | Maximum distance moved, in feet. Accepts a formula. |
| `choose` | checkbox | `false` | Prompt for the distance in 5 ft steps up to the maximum. When off, the target moves the full distance. |
| `stopAdjacent` | checkbox | `false` | A pull never moves the target closer than adjacent to the user. |
| `maxSize` | select | `''` | Targets larger than this size are not moved. |
| `animation` | selectAnimation | `[object Object]` | Animation played from the user to each target. The movement runs inside it. |

## `redirectAttack`

Offers to redirect an attack against the user to another nearby creature. Bound on an item. Fires on `targetTargeting`. Nothing is offered once the user's reaction is spent.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Activity rolled when the attack is redirected. Leave blank to use the item. |
| `range` | number | `5` | Maximum distance between the creature being attacked and the new target. |
| `disposition` | select | `''` | Disposition relative to the creature being attacked. |
| `sizes` | select-many | `[]` | Limit the new target to these sizes. |
| `swapPlaces` | checkbox | `false` | The creature being attacked and the new target swap places. |
| `requireCover` | checkbox | `false` | Only offer the redirect while the creature being attacked has cover from the attacker. |

## `reduceMaxHP`

Reduces the hit point maximum of targets by the damage dealt or by a rolled formula. Bound on an activity. Fires on `activityRollFinished`. Nothing happens when no target was hit. Repeat uses add to the existing reduction from the same activity. A target whose reduction reaches its hit point maximum is marked dead.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `reduceByRoll` | formula | `''` | Reduce By Roll |
| `halfDamage` | checkbox | `false` | Half Damage |
| `checkSaves` | checkbox | `true` | Check Saves |
| `removeOnSave` | checkbox | `false` | Remove On Save |
| `shortRestCures` | checkbox | `false` | Short Rest Cures |
| `longRestCures` | checkbox | `true` | Long Rest Cures |
| `damageTypes` | select-many | `[]` | Damage Types |

## `reflectOnHit`

Rolls an activity from the effect's source item, or the item a transferred effect sits on, against each creature that hits the effect's bearer with an attack. Bound on an effect. Fires on `targetAttackRollComplete`, so it runs before the attack's damage is applied. Each hit bearer reflects once, from its same-named effect with the highest cast level.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `rollActivity` | selectActivity | `''` | Activity on the effect's source item rolled against the attacker, at the level the effect was cast. |
| `attackType` | select | `''` | Limit this feature by attack type. |
| `range` | number | `0` | Only trigger when the attacker is within this distance. 0 ignores distance. |
| `requireTempHP` | checkbox | `false` | Only trigger while the effect's bearer has temporary hit points. |
| `oncePerTurn` | checkbox | `false` | Only trigger once per turn for each bearer. Outside combat it always triggers. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `rerollCheckWithBonus`

Rerolls a d20 roll with an added bonus and keeps the new result. Bound on an item. Fires on `actorBonus`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |

## `rerollSaveWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |

## `rerollSkillWithBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
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
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
| `ability` | select-many | `[]` | Limit this bonus to a list of abilities. |
| `failedOnly` | checkbox | `true` | This feature can be used on failed rolls only. |
| `oncePerRoll` | checkbox | `true` | This feature can be used once per roll. |
| `consume` | select | `false` | Only offer this bonus when its costs can be paid. |
| `rollActivity` | selectActivity | `''` | Roll this activity when used. |
| `rollItem` | checkbox | `true` | Roll this item when used. |
| `tool` | select-many | `[]` | Limit this bonus to a list of tools. |

## `restoreUses`

Controls when this item's restore activity can be used, and offers it when the item runs out of uses. Bound on an item. Fires on `itemPreTargeting`. The restore activity is blocked while no uses are spent. When the offered restore runs, the original activity is used again afterwards.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `restoreActivity` | selectActivity | `''` | Activity that restores this item's uses. Leave blank to use the first activity that restores a use of this item. |
| `requireEmpty` | checkbox | `true` | Block the restore activity while uses remain. |
| `offerRestore` | checkbox | `true` | When another activity needs a use and none remain, offer to run the restore activity first. |

## `rolledDuration`

Rolls the effect's duration when it is created. Bound on an effect. Fires on `created`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `formula` | formula | `1d4` | Formula |
| `units` | select | `hour` | Duration Units |

## `saveBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
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

Rolls a save at the end of the creature's turn while it is far from the effect's source. Bound on an effect. Fires on `actorTurnEnd`. A successful save removes the effect.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `distance` | number | `30` | The save is offered only when the creature ends its turn farther than this from the effect's source. |
| `rollActivity` | selectActivity | `''` | Save activity on the source item rolled at the end of the creature's turn. A success removes this effect. |

## `selectDamageType`

Prompts for a damage type and applies it to every damage roll. With `atCast`, the choice is made once when the spell is cast. Bound on an item. Fires on `itemPreambleComplete` and `itemDamageRoll`. No prompt is shown when fewer than two types are available. When a damage part has several types, the system's damage dialog is skipped so only this prompt asks.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `damageType` | select-many | `[]` | Prompt for a damage type when this item is rolled. |
| `rememberChoice` | checkbox | `false` | Offer "Don't ask again this combat" on the damage type prompt. |
| `atCast` | checkbox | `false` | Prompt once when the spell is cast and use that damage type for every later damage roll. |

## `skillBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
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

Uses an activity from another of the user's items once the roll finishes. Bound on an activity. Fires on `activityRollFinished`. The item and activity are prompted for when more than one qualifies. An `attackTypes` config on the item limits it to attack activities of those attack types.

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

Plays an animation at each target and an animation over the placed area once the roll finishes. Bound on an item. Fires on `itemRollFinished`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `animation` | selectAnimation | `[object Object]` | Plays from the caster to each target. |
| `includeSelf` | checkbox | `false` | Animate Self Utility |
| `areaAnimation` | selectAnimation | `[object Object]` | Plays on the area, or around the caster if there is none. |
| `areaOnly` | checkbox | `false` | Skip the area animation for activities without an area. |

## `summonModifier`

Modifies summons as they are created. Bound on an item. Fires on `actorPreCreate`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `sourceIdentifiers` | selectIdentifiers | `[]` | Only modify summons created by items with these identifiers. Leave empty for any summon. |
| `creatureTypes` | select-many | `[]` | Only modify summons of these creature types. Leave empty for any creature type. |
| `effect` | selectEffect | `''` | Effect from this item to add to the summon. |
| `magicalWeapons` | checkbox | `false` | The summon's items that deal damage count as magical. |
| `confirm` | checkbox | `false` | Prompt to Use |

## `targetCreatureTypes`

Removes targets that do not match the configured creature types. Bound on an item. Fires on `itemTargeting`. Targets without an actor are always removed.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `creatureTypes` | select-many | `[]` | Keep only targets of these creature types. Leave empty to skip the creature type check. |
| `invert` | checkbox | `false` | Remove targets of the selected creature types instead of keeping them. |
| `aliveOnly` | checkbox | `false` | Remove targets at 0 hit points. |
| `maxSize` | select | `''` | Remove targets larger than this size. |
| `maxCR` | number | `-1` | Remove targets above this challenge rating. -1 skips the check. |
| `chooseTargets` | checkbox | `false` | For area activities, show a checklist of the remaining targets after filtering and keep only the ones picked. |
| `excludeSelf` | checkbox | `true` | The user is removed from targets. |
| `limit` | formula | `''` | A checklist of remaining targets is shown if the filtered list includes more than this limit. |
| `canSee` | checkbox | `false` | Keep only targets visible to the attacker. |
| `minIntelligence` | number | `0` | Remove targets with a lower Intelligence score. 0 turns the check off. |
| `excludeSummoner` | checkbox | `false` | Remove the summoner when a summoned creature uses this item. |

## `teleport`

Teleports the user, or each target that failed its save, once the roll finishes. Bound on an activity. Fires on `activityRollFinished`. Provide preselected targets by setting the workflow property `chris-premades.teleportCompanions` to an array of token ids or token documents.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `targets` | select | `self` | Teleport the user, each target that failed its save, or the user to a space near one of the targets. Range is measured from the user, or from the chosen target for Near a Target. |
| `range` | formula | `''` | Maximum teleport distance. Leave blank to use the activity's own range. |
| `rangeFromRoll` | checkbox | `false` | Use the activity's utility roll total as the maximum teleport distance. Falls back to Range, then the activity's own range, when nothing was rolled. |
| `requireSight` | checkbox | `true` | Only allow spaces the user can see. |
| `companions` | number | `0` | How many allies within Companion Range the user may bring along. They keep their position relative to the user. |
| `companionRange` | number | `5` | Companion Range |
| `companionMaxSize` | checkbox | `false` | Companions No Larger Than User |
| `visitedThisTurn` | checkbox | `false` | On a self teleport, only allow spaces the user occupied earlier this turn. |
| `excludeUser` | checkbox | `false` | On a self teleport, remove the user from the activity's targets. Use for areas centred on the space the user leaves. |
| `animation` | selectAnimation | `[object Object]` | Animation |

## `toolBonus`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `bonus` | formula | `''` | Formula added to the roll when this bonus is taken. |
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
| `count` | formula | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `turnStartChoiceRemoveCondition`

| Setting | Type | Default | What it does |
|---|---|---|---|
| `conditions` | select-many | `[]` | Conditions |
| `affects` | select | `self` | Remove conditions from the user of the activity or from its target. |
| `count` | formula | `1` | Formula for how many conditions can be removed per use. @scaling reads the activity's consumption scaling. |
| `targetChooses` | checkbox | `false` | When removing from the target, the target's owner picks the conditions. |
| `autoSingle` | checkbox | `false` | Skip the prompt when no more qualifying conditions are present than can be removed. |
| `requireCondition` | checkbox | `true` | Cancel the use when the creature has none of the listed conditions. |
| `reactionConditions` | select-many | `[]` | Conditions the creature can end by using its reaction. Its owner is asked after the roll. |

## `unhideActivities`

Unhides activities on the effect's origin item while the effect exists. Bound on an effect. Fires on `preCreated`.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityIds` | selectActivities | `[]` | Activities |
| `favorite` | checkbox | `false` | Favorite Activities |

## `useOnEvent`

Uses this activity after a rest or at the start or end of its owner's turn. Bound on an activity. Fires on `actorShort`, `actorLong`, `actorTurnStart` and `actorTurnEnd`. Nothing happens when the activity's costs cannot be paid, and turn events skip an incapacitated owner.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `events` | select-many | `[]` | Use this activity after these events. Short Rest also fires after a long rest. |
| `poolCondition` | select | `''` | Only use this activity when the items whose uses it recovers are in this state. |
| `confirm` | checkbox | `false` | Prompt to Use |

## `weaponAnimation`

Plays an attack animation from the attacker to each target after the attack roll, or after the saves for a weapon's save activity such as a cone or burst of fire. Bound on an item. Fires on `itemAttackRollComplete` and `itemSavesComplete`. Set the workflow property `skipWeaponAnimation` to turn off.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `activityId` | selectActivity | `''` | Only animate this activity. Leave empty for all of them. |
| `advanced` | checkbox | `false` | Play the Advanced Animation instead. Its options add blood, screen shake and thrown attacks. |
| `animation` | selectAnimation | `[object Object]` | Animation |
| `advancedAnimation` | selectAnimation | `[object Object]` | Advanced Animation |

## Generics with no settings

Attached by `identifier` alone — they take no `genericConfig`:

### `immuneAutoSucceed`

Targets succeed on checks or saves from this activity if it would apply a condition to which they are immune. Bound on an activity. Fires on `activityPreambleComplete`.

### `inheritCastLevel`

Uses a follow-up activity at the level the concentration spell was cast at, without the configuration dialog. A number in the concentration effect's `flags.cat.castLevelBonus` raises that level. Bound on an activity. Fires on `activityPreTargeting`.

### `removeRegion`

Deletes the effect it is bound on at the next turn. Bound on an effect. Fires on `actorEveryTurn`.

### `storedItem`

Turns a patch or card into the item or creatures it stores when it is used. Bound on an item. Fires on `itemRollFinished`. The item stores its contents in `flags.cat.storedItem`: `uuid` of an item or actor, plus `quantity`, `updates` for an item, or `count` for creatures.

### `useOnDeath`

Uses this item when its owner gains the dead status. Bound on an item. Fires on `actorCreated`. Unequipped items are skipped.


---

## Deliberately not listed


The `options` for a `select` or `select-many` setting are **not** enumerated. They
are read at run time from CPR's own `constants` module — the condition list, damage
types, creature types and so on. A copy here would go stale against the system it
has to match, and a wrong condition name fails quietly. Read the current list from
the module, or copy one from a working example in a CPR compendium.

A generic whose settings could not be resolved is reported by the generator rather
than omitted silently, so a blank section means it genuinely takes none.
