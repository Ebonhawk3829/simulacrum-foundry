# Upstream changelog — CAT and CPR changes since this reference was last synced

WHY THIS FILE EXISTS

The reference files (`cat-macro-flags.md`, `cat-embedded-macros.md`, `cpr-generic-config.md`)
describe CAT and CPR at a **pinned version**. When those modules update, some existing abilities
may need review. This file is the yardstick for that: what changed, and — for each change — the
flag, generic or field that makes an item relevant, so a search of the world finds the candidates.

Read it when the user asks whether the world's abilities need updating after a CAT/CPR bump.

HOW TO USE

- Each entry names the mechanism and a **Look for** line: the key to search the world for
  (`document_search` over items, or a scan of `flags.cat` / `flags.cat.genericConfig`).
- A **Breaking** entry means an existing item may now behave differently, or not at all.
- This file is **rewritten at each sync**, not appended. It covers the delta back to the last
  reference regeneration, so older entries here are kept only while an item built before the
  current sync could still be affected by them.

PINNED

- Reference synced to **CAT 0.1.7**, **CPR 2.1.7**, **midi-qol 14.6.8** and **DAE 14.6.7**
  (CPR 2.1.7 requires CAT 0.1.7; midi 14.6.8 requires DAE ≥14.6.4 and is dnd5e **6.0.x only**, max
  6.0.999 — dnd5e 6.1 breaks midi's damage card). midi and DAE both **moved to GitHub** at 14.6.8 /
  14.6.6: the manifest is now a GitHub `latest-dnd6` release, and installing midi pulls DAE 6.
- Previous sync: **CAT 0.1.7 / CPR 2.1.7** (midi 14.6.6 / DAE 14.6.5). Everything below is CAT
  0.1.5–0.1.7, CPR 2.1.5–2.1.7, midi 14.6.5–14.6.8 and DAE 14.6.4–14.6.7. The change this sync is
  **midi 14.6.7 and 14.6.8, and DAE 14.6.6 and 14.6.7**; the older CAT/CPR entries and the
  midi 14.6.5 / DAE 14.6.4 ones are retained because an item built before this sync can still hit them.
- The full generic settings list for the current CPR is in `cpr-generic-config.md` (regenerated at
  **2.1.7** — **64 generics, 346 settings**; `contextAdvantage` and `firearm` are new, and
  `teleport` gained `visitedThisTurn`).

---

## Review checklist — the questions to ask the world

Run these searches, then read each hit's `flags.cat`:

- [ ] **CPR attack riders** — any item with `flags.cat.genericConfig['chris-premades'].attackRider`
      (or an attack-rider automation). As of CPR **2.1.7** a rider is offered **only while the item
      is equipped**, and attuned when it needs attunement. An unequipped or unattuned item no longer
      offers its rider — a rider that "stopped firing" is this, not a broken build.
- [ ] **`ignoreCover` and `damageBonusToOneRoll`** — the same **equip/attune gate** now applies
      (2.1.7). Additionally a cantrip-only `damageBonusToOneRoll` now also reaches the **weapon attack
      of a blade cantrip** (e.g. True Strike), where before it applied to the spell attack only.
- [ ] **CPR `teleport` generic** — 2.1.7 adds `visitedThisTurn` (a **self** teleport may only land on
      spaces the user occupied earlier this turn). Off by default; check any teleport generic that
      should adopt it.
- [ ] **CPR generics that are new or moved** — new: **`firearm`**, **`immuneAutoSucceed`**,
      **`contextAdvantage`**, **`storedItem`**. Gone: the legacy barbarian **`dangerSense`**, totem
      **`bearAspect`** and warlock **`unarguableWizardry`** macros, replaced by **`contextAdvantage`**.
      Anything referencing the removed identifiers is stale.
- [ ] **CAT summons** — CAT's `summon` generic gained a **One creature** choice (entry/profile with an
      optional label) and a **Dismiss Activity**. Check whether a summon item should adopt either.
- [ ] **Placed-region activities** — an activity's placed area can now carry **Adjust Darkness Level**,
      **Modify Movement Cost** and **Suppress Weather** behaviors (CatKit *Placed Region* tab).
- [ ] **CPR firearms** — firearms are now a base weapon type with the **Firearms** proficiency; the
      2014 Exandria firearms gained **Reload**/**Repair** activities. Check any hand-built reload or
      repair feature against what CPR now automates.
- [ ] **Weapon mastery** (from CAT 0.1.6) — a weapon whose mastery is a hand-built effect can double
      up with CAT's own application under the **Weapon Mastery** setting; this world sets it `none`.
      See `world-conventions.md` for the three-part test.
- [ ] **Animation renames** (CPR 2.1.5, still current) — any `flags.cat.genericConfig['chris-premades']`
      using **`areaAnimation`** or **`advancedMeleeAttack`**: both are BREAKING renames (→
      `spellAnimation` / `weaponAnimation`).
- [ ] **CAT API renames** (0.1.5, still current) — any macro referencing
      **`constants.massApplyExcludeSources`** (→ `contentSources`) or
      **`animationUtils.getModuleAnimations`** (→ `getModuleAnimationNotices`).
- [ ] **Movement macros** — move events now pass the token's **`origin`** (CAT 0.1.6).
- [ ] **Usage-card `content`** (midi 14.6.5) — any macro that spliced text into a card's `content`:
      it now becomes a note at the bottom of the card (with a warning). Use `MidiQOL.addCardNote`.
- [ ] **Statuses Applied** (midi 14.6.5) — anything hand-applying a status that
      `midiProperties.statuses` now does directly; and any effect applied "whatever the save" now
      reaches only **hit** targets.
- [ ] **DAE Replacement** (14.6.4) — any DAE item effect with **no Replacement**: its workflow
      references are now filled from the caster. See `dnd5e-6.0-fields.md` §7.
- [ ] **Optional-bonus AC key** (DAE 14.6.7, *not yet active*) — DAE's field mappings now accept a `*`
      for one path segment; the changelog's example is `flags.midi-qol.optional.*.ac` →
      `flags.midi-qol.optional.*.acOnAttack`. **No module registers that mapping yet and midi 14.6.8
      still reads `.ac`**, so nothing is renamed on this stack. Watch `flags.midi-qol.optional.<name>.ac`
      for when a midi that renames the key ships; it will then be auto-mapped to `.acOnAttack` (with a
      one-off deprecation warning). The other optional keys are unchanged.
- [ ] **Mounted creatures & distance** (midi 14.6.7) — a rider's range and reach, and distances to it,
      come from its **mount's** space (Mechanics, on by default). **Look for:** any ability that
      measures range/reach/distance to a creature that may be mounted (`flags.midi-qol.mount`, a
      Rideable rider).
- [ ] **`mx` critical-damage formulas** (midi 14.6.7) — *Double Rolled Damage* now doubles dice
      written with midi's `mx` modifier (`1d4mx2`), which previously mis-rolled as `1d4x2`. **Look
      for:** any damage formula using `mx`.

---

## CAT 0.1.7

### Update notes
- **Summons — One creature choice.** A summon activity can offer the user a single entry, or a single
  profile of the activity; entries can carry a **Label** for that choice. **Look for:** any item with
  `flags.cat.macros` containing `{ source: 'cat', identifier: 'summon' }`, or
  `flags.cat.genericConfig.cat.summon` — decide whether the *One creature* choice belongs on it.
- **Summons — Dismiss Activity.** Using it dismisses the item's summons. **Look for:** the same
  summon-generic items; a summon that should be dismissable may want it attached.
- **Placed-region behaviors.** An activity can add **Adjust Darkness Level**, **Modify Movement Cost**
  and **Suppress Weather** behaviors to its placed area; the activity CatKit's *Placed Region* tab
  lists and edits them. **Look for:** activities that place a region (their region-behavior data, or
  a CatKit region tab). Purely additive.
- **Mass apply — Switch All Sources / Switch All Rules.** UI only; *Switch All Rules* applies the
  2014 or 2024 automation where one exists.

### API additions (only relevant to macros we author)
- `tokenUtils.teleportToken` and `tokenUtils.aimDestination` take **`allowedPoints`** — a list of
  token centres the destination must match. **Look for:** macros calling either.
- `compendiumUtils.getDocumentByName` and `automationUtils.getCompendiumDocumentByName` take an
  optional **`rules`** option and match only documents with those rules. **Look for:** macros doing
  compendium lookups by name.
- New automation config type **`documentMap`** (rows of name → document, optional count;
  `documentType` to limit drops, `count: true` to show the count). **Look for:** macros with config UI.

### Bug fixes (no audit needed)
- Patch for a **dnd5e 6.0.x bug that 6.1.0 removes**: activities remember their range, activation,
  duration and target after the card is created. On 6.1 the system does this itself, so the patch is
  a no-op there.
- Pushed and pulled tokens stop short of a space another token occupies.

## CAT 0.1.6

### Settings
- **Weapon Mastery** (new): CAT applies the mastery property chosen for a weapon attack, for player
  characters by default. **Look for:** a weapon whose mastery is a hand-built effect linked from its
  attack activity — CAT can now apply it too, and the two can double up (see `world-conventions.md`).
- **Advanced Weapon Proficiency** (new): advanced weapon types only offer their masteries to
  characters with an Advanced Weapon Proficiency feature (Grim Hollow).
- Version warnings: the GM is warned when a dependency needs a newer version; the Troubleshooter
  lists required module versions and flags outdated ones.

### Behaviour / API
- Weapon attacks fire a **`weaponMastery` called event** before the mastery applies. Macros get
  `workflow`, `masteries`, `hit`, `missed` and can add or remove keys in `masteries`.
- A custom macro returning `{mastery, label, reference, macro}` adds a mastery; `cat.api.registerMastery`
  adds one; a mastery's `genericConfig` gives it per-weapon config.
- **Movement events now pass `origin`.**
- `applications.SettingsMenuBase` takes `namespace`/`langPrefix`/`subMenus`; `MenuApp` gains `number`
  and `multiSelect` inputs; `genericUtils.notify` takes `permanent`.
- **New utilities:** `workflowUtils.expandAttackCriticalRange`, `.addTargetAC`,
  `.removeAttackDisadvantage`, `.rerollDamageDice`; `actorUtils.setBonusActionUsed`,
  `.confirmBonusAction`, `.isMasteryEnabled`; `itemUtils.canUseMastery`, `.getMasteryLabel`.
- Bug: `workflowUtils.completeActivityUse` / `completeItemUse` follow midi's fast-forward settings
  again unless `fast` is set.

## CAT 0.1.5

- Animation Priority renamed **CAT Animations**, with a new **Off** choice; an effect's *Disable
  Animation* checkbox also stops its CAT apply/remove animations.
- Automation Sources: a **Use Recommended** button and a per-source **Mass Apply** checkbox (off by
  default for content sources: PHB, DDB Importer, DMG, dnd5e). Mass apply never replaces class items
  from a content source; CAT offers to search a compendium after mass applying it.
- **API renames:** `animationUtils.getModuleAnimations` → `getModuleAnimationNotices`;
  `constants.massApplyExcludeSources` → `constants.contentSources`.
  **Look for:** macros calling the old names.
- **Added:** `itemUtils.getBaseWeaponLabel`; `effectUtils.createItemEffect`; a summon `sourceItem`
  getter; and **hit-die roll passes** (`situational`, `bonus`, `post`) under descriptor key
  `hitDie` — `situational` can set `options.maximize`/`minimum`/`parts`/`multiplier`.

## CPR 2.1.7  (requires CAT 0.1.7)

### Changed behaviour — the audit items
- **Attack riders are offered only while the item is equipped**, and attuned when it needs attunement.
  **Look for:** `flags.cat.genericConfig['chris-premades'].attackRider` (and attack-rider automations)
  on weapons/gear that are not always equipped.
- **`ignoreCover` and `damageBonusToOneRoll` skip items that aren't equipped** (or attuned when they
  need attunement). **Look for:** those two generics in `flags.cat.genericConfig['chris-premades']`.
- **Cantrip-limited damage bonuses now also apply to a blade cantrip's weapon attack** (True Strike).
  **Look for:** a `damageBonusToOneRoll` config limited to cantrips.
- **`weaponAnimation` also animates a weapon's save activities** (a cone or burst of fire).
  **Look for:** `weaponAnimation` on weapons that have save activities.

### New generics
- **`firearm`** (settings: `misfire`, `unproficientPenalty`): a natural roll at or below the misfire
  score misses and damages the firearm; a damaged or broken firearm can't attack. Its Repair activity
  rolls a Tinker's Tools check, and a failure breaks the firearm. It also applies the Recoil, Blaring
  and Explosive properties.
- **`contextAdvantage`** (settings: `check`, `save`, `skill`, `tool`, `statuses`, `label`): before a
  chosen roll CAT asks whether to roll with advantage; chosen conditions stop the offer. This is what
  the removed `dangerSense` / `bearAspect` / `unarguableWizardry` macros use now.
- **`immuneAutoSucceed`** and **`storedItem`** — no settings; not listed in `cpr-generic-config.md`.

### Automated content (build templates, not audits)
- Firearms system: base weapon type + **Firearms** proficiency, eleven new weapon properties; 2014
  Exandria firearms gain **Reload**/**Repair** activities.
- 2014/2024 **Bard** subclasses; 2014/2024 **Healer** feat; ~80 items; *Stabilize* action; Shield
  Guardian *Bound*; *Eldritch Eddy* summon.

### Other generic/teleport changes
- `teleport` gains **`visitedThisTurn`** (self teleport only to spaces occupied earlier this turn).

## CPR 2.1.6  (requires CAT 0.1.6)

- Weapon Mastery is applied by **CAT**; Battering Roots offers Push or Topple through it.
- New 2024 Fighter feature: Tactical Master.
- New **Homebrew Options** settings menu: DMG Cleave, BG3 Weapon Actions.
- New weapon masteries: Valda's Gunslinger, Grim Hollow, Northlands.
- Bug: Metamagic rerolled damage dice update the roll's total.

## CPR 2.1.5  (requires CAT 0.1.5)

### Breaking
- **`areaAnimation` is merged into `spellAnimation`** as its Area Animation; both of
  `spellAnimation`'s animations now default to none.
- **`advancedMeleeAttack` is replaced by `weaponAnimation`** with Advanced on. An empty Activity now
  animates every activity.
  **Look for:** `flags.cat.genericConfig['chris-premades']` entries using `areaAnimation` or
  `advancedMeleeAttack` — migrate them to `spellAnimation` / `weaponAnimation`.

### New generics
- `modifyNextDamage`, `rolledDuration` and `weaponAnimation` (`weaponAnimation` plays a weapon
  animation after each attack roll). `spellAnimation` gains an **Animate Self Utility** option;
  `extraAttack` now skips `weaponAnimation` when it plays its own animation.

### Automated content
- Haste (2014 and 2024), with Lethargy following each version's rules when the spell ends.
- Many potions and oils (2014 and 2024); Maximize Damage / Double Damage for crit and fumble tables.
- New animation: **Weapon Attack** (a swing/throw/shot from the base weapon and ammunition, tinted
  for non-physical damage).

---

## dnd5e 6.1.0 (pre-release) — NOT adopted; the gate is midi-qol

- **Do not load the live world on 6.1.0.** midi-qol (through 14.6.7) caps dnd5e at **6.0.999**, and
  its own 14.6.5 notes say 6.1 "changes damage application in ways that break midi's damage card."
  CAT/CPR/DAE already allow 6.1 on paper; midi is the only blocker.
- **Nothing to audit yet.** CAT 0.1.7's 6.0.x range/activation/duration patch is a no-op on 6.1, and
  no item behaviour changes until the system is actually adopted.
- **When 6.1 *is* adopted**, these are the audit targets (derived from the 6.0.6…6.1.0 diff):
  - **Damage application rework** (`#4874`/`#7612`): new ignore/downgrade rules for immunity,
    resistance and vulnerability; `applicationOptions` on the damage message; "ALL" now decomposes per
    damage type. **Look for:** anything reading or writing `workflow.damageDetail`/`damageList`, the
    damage application tray, or traits via `system.traits.dr/di/dv`.
  - **Enchantment riders** (`#6357`/`#6592`): riders can sit on an enchantment active effect
    (`rider.effects`/`items`/`activities`, `system.collectRiders`); nested riders flatten under the
    root activity. **Look for:** enchantment automations and rider effects.
  - **Activity `like`/`isLike`** (`#7523`): `getByType` also returns "like" activities. **Look for:**
    workflows branching on `activity.type`.
  - **Summon origin/target replacement** (`#7425`) and activity-type-conditional summon damage rules
    (`#7652`). **Look for:** CAT/CPR summon generics and DAE Replacement.
  - **Falling-damage resistance** (`#7334`): a new `damageResistanceTypes` category and special trait
    sub-categories. **Look for:** damage-trait automations.
  - **Antimagic region behavior** (`#5874`); `magicAvailable` moved to `ItemDataModel`. **Look for:**
    region automations and `magicAvailable` checks.
  - The legacy `system.bonuses.*` shim (`ActiveEffect5e.SHIM_FIELDS`) is still present in 6.1 and is
    due for removal at **6.2**, not here.

---

## midi-qol 14.6.8

- **midi-qol has moved to GitHub** (`github.com/tposney/midi-qol`): updates and downloads come from
  its releases, and the manifest is `…/releases/download/latest-dnd6/module.json`. An installed copy
  moves over on update. **Look for:** any world or deploy tooling that still pins the old GitLab
  manifest URL.
- **Installing midi-qol now installs DAE 6** (its GitHub `dnd6` release) rather than DAE for dnd5e
  5.x from foundryvtt.com. pt-BR translation updated.

## midi-qol 14.6.7

Seen in play before the release; the notes below are the release notes.

- **Mounted creatures use their mount's space** (Mechanics, on by default): a rider's range and
  reach, and distances to it, are measured from its **mount's** space. A rider is a token with
  `flags.midi-qol.mount` set to its mount's token id, or a Rideable rider (familiars included);
  grappled tokens and riders moving within their mount keep their own space. **Relevant to the
  perimeter-distance convention** (`midi-reactions.md` §6): a distance to a mounted rider now comes
  from the mount. **Look for:** abilities that measure range/reach/distance to a creature that may be
  mounted.
- **The Midi Condition Editor** (the button and window are now named that) no longer fills an empty
  condition with `true`, shows the flag key only for effect changes, and no longer offers Macro
  Autocomplete's visual block editor (which rewrote a condition as a statement, `true;`). CAT's
  quick-conditions button sits between the condition field and midi's editor button. Activity
  condition fields (*Use Condition*, *Active Effect Condition*) are plain text fields again — the
  Foundry dice Formula Editor button (λ) no longer shows. **Look for:** activities whose condition was
  written through the old editor (a `true;`-style statement).
- **Over Time editor — Saves remaining / Fails remaining.** For an over-time effect on an actor the
  editor shows the progress of `saveCount` (*Saves required* / *Fails required*) and lets a GM correct
  it. The configured counts are unchanged; consecutive counts still reset to them.
- **Dice So Nice.** midi passes the actor on its rolls, so a player-owned actor's own dice appearance
  is used (with DSN's *Force character owner appearance* = All), as DSN does for its own rolls;
  previously every midi roll used the rolling user's dice and no actor. Cosmetic.
- **Fixed: *Double Rolled Damage* critical damage** never doubled the dice — dnd5e rolled its own die
  class, which didn't know midi's `mx` modifier, so `1d4mx2` was read as `1d4x2` (explode on 2).
  **Look for:** critical-damage formulas using `mx`.
- Fixed: the *Secret Squirrel* quick setup and the hints for *Hide NPC names* / *Auto apply item
  effects* no longer name modules with no Foundry 14 release.

## midi-qol 14.6.6

- Hosting only (updates served from GitLab Pages, before the GitHub move). Sample items: *Flaming
  Sphere* and several NPC features.

## midi-qol 14.6.5  (requires DAE ≥14.6.4; dnd5e 6.0.x only — max 6.0.999)

### Breaking / removed
- **Text written to a usage card's `content` no longer replaces the card** — it becomes a note at
  the bottom (with a console warning). Use `MidiQOL.addCardNote(card|uuid|workflow, html, { anchor,
  position, key, visibility | whisper })` / `removeCardNote`, and `MidiQOL.registerCardNoteRenderer`,
  `MidiQOL.cardNoteMessageData`, `MidiQOL.renderLinkedMessage`.
  **Look for:** any macro that spliced into `card.content`.
- **Removed the optional rule *Attacking removes hidden/invisible*.** Invisibility and hiding end by
  their own durations (so Greater Invisibility survives an attack). A hiding creature is Invisible
  to whoever doesn't perceive it, under the rebuilt *Hidden attackers have adv/disadv on attacks*
  options. New status *Invisible (until it attacks, casts a spell or deals damage)*.
- **Removed** setting *Show damage after each save*, and setting `useDamageDetail` (via
  `configSettings()` it reads true with a deprecation warning).
- *Move roll formula to tooltip*'s advantage attribution options are deprecated (due for removal in
  14.8).

### Added
- **`midiProperties.statuses` — *Statuses Applied*** on the activity sheet: statuses put on targets
  **directly** (as the token HUD does) rather than via an effect, each with extra special durations
  and an *On Save* choice. See `dnd5e-6.0-fields.md` §4.
- **Card notes** and token-name markup: `@MidiTokenName[uuid]{name}`, `{{midi-token-name uuid name}}`,
  `MidiQOL.tokenName(uuid)`.
- Optional rule ***Apply condition rules*** (off by default) — the condition rules dnd5e doesn't
  apply, however a condition is set; replaces CPR 1's *Apply Midi-QOL Condition Effects*.
- **Attack per target** with area templates and emanations; activity *Ammunition* (one per attack /
  use / target).
- `MidiQOL.hasUsedAction` / `setActionUsed`; hook `midi-qol.conditionData`.
- Teleport: *During the Use* option; *Who Teleports: Swap Caster and Target*; macros can pass
  `midiOptions.teleport` to `completeActivityUse`; `MidiQOL.moveToken` takes a `level`.

### Changed
- Flanking applies only to a **melee** attack roll against a **single** target; a fixed flanking
  bonus is added to the attack roll (labelled) instead of lowering the target's AC;
  `flags.midi-qol.grants.attack.bonus` is part of the roll against a single target.
- Absorbed damage (Damage Absorption) shows as healing; immunity/resistance no longer reduce what an
  absorber heals (an immune absorber heals the full damage); `MidiQOL.modifyDamageBy` now changes the
  whole damage entry.
- New worlds default to *Temporary HP Concentration Check* and *Remove concentration when
  incapacitated status applied* on, and GM critical damage to *DND5e Settings Only*. A
  `flags.midi-qol.optional.*` change set to `ItemMacro` no longer throws `DAE is not defined` at load.
- Attack roll breakdown is dnd5e's (dice then labelled modifiers); the sources of advantage/
  disadvantage are named rather than shown as internal keys.
- *When an Incapacitated actor takes an action*: *Do nothing* → *Allow it*. Saves/checks shown on the
  use card no longer also pop up as chat notifications.

## DAE 14.6.7

- **A field-mapping key may carry `*` for one path segment**, and the new key takes that segment, so
  one mapping can cover a whole family of deprecated keys (the changelog's example is
  `flags.midi-qol.optional.*.ac` → `flags.midi-qol.optional.*.acOnAttack`). This only changes how a
  mapping **matches** — it does nothing on its own.
  **Not active on this stack:** no module registers that `.ac` mapping as of midi **14.6.8** — midi
  still reads `flags.midi-qol.optional.<name>.ac` (`src/module/utils.ts`), and its
  `dae.addFieldMappings` list (`src/midi-qol.ts`) has no optional entry. So on midi 14.6.8 + DAE
  14.6.7 **nothing is renamed and `.ac` still works**. An effect using `.ac` becomes an audit target
  only once a midi that renames the key (and registers the mapping) is installed — then it is
  auto-mapped to `.acOnAttack` with a one-off deprecation warning. See the review checklist.
- (Also in this range, and benign: DAE dropped its duplicate `flags.midi-qol.itemCondition` /
  `reactionCondition` / `otherCondition` / `effectCondition` field specs from the effect editor,
  because midi now supplies those itself.)

## DAE 14.6.6

- **DAE has moved to GitHub** (`github.com/tposney/dae`): updates and downloads come from its
  releases, manifest `…/releases/download/latest-dnd6/module.json`. pt-BR translation updated.

## DAE 14.6.5

- Hosting only: updates are served from GitLab Pages.

## DAE 14.6.4

- **`flags.dae.conditionFlags.<statusId>`** lets an effect give the conditions its statuses cause
  values (merged from every active effect carrying that status), e.g.
  `{ hiding: { "my-module": { dc: 17 } } }`.
- The compendium menu's effect-application entries and the item *Effect application* dialog are
  replaced by ***DAE: Convert changes to Origin replacement***; API
  `DAE.convertToOriginReplacement(document, { dryRun })`.
- **A change with no Replacement is filled from the caster** in dnd5e application: `@itemUuid`,
  `@tokenUuid`, `@actorUuid` are the caster's; `##tokenUuid`/`##actorUuid` are the target's; every
  `@target*` reference is replaced; `##` is converted to `@` only when an effect is applied. See
  `dnd5e-6.0-fields.md` §7.
- A `system.traits.size` change can now be **Add/Subtract/Upgrade/Downgrade** (size steps), not only
  Override; vehicle tool proficiency likewise.
- DAE's API is set in `init` (fixes `DAE is not defined` at load); passive skills no longer
  double-count advantage; the effect editor no longer flags DAE's own workflow references as unknown.
- `expiry-reason` refinements (see `dae-effect-expiry.md` §7): an effect expiring under
  *Mark Expired*/Suppress passes the expiry's own reason; time passing outside combat reports
  `duration-expired:updateWorldTime`.
