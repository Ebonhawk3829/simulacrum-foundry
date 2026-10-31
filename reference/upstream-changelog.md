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
- This file is **rewritten at each sync**, not appended. It is the delta since the pinned version.

PINNED

- Reference synced to **CAT 0.1.6**, **CPR 2.1.6**, **midi-qol 14.6.6** and **DAE 14.6.5**
  (CPR 2.1.6 requires CAT 0.1.6; midi 14.6.5 requires DAE ≥14.6.4 and is dnd5e **6.0.x only**, max
  6.0.999 — dnd5e 6.1 breaks midi's damage card).
- Previous sync: CAT 0.1.4 / CPR 2.1.4; midi 14.6.4 / DAE 14.6.3. Everything below is CAT
  0.1.5–0.1.6, CPR 2.1.5–2.1.6, midi 14.6.5–14.6.6 and DAE 14.6.4–14.6.5.
- The full generic settings list for the current CPR is in `cpr-generic-config.md` (regenerated).

---

## Review checklist — the questions to ask the world

Run these searches, then read each hit's `flags.cat`:

- [ ] Any `flags.cat.genericConfig['chris-premades']` using **`areaAnimation`** or
      **`advancedMeleeAttack`** — both are BREAKING renames in CPR 2.1.5 (below).
- [ ] Any macro referencing **`constants.massApplyExcludeSources`** (→ `contentSources`),
      **`animationUtils.getModuleAnimations`** (→ `getModuleAnimationNotices`), or
      **`itemUtils.getBaseWeaponLabel`** (new).
- [ ] Any **weapon** whose mastery behaviour is a hand-built effect linked from its attack activity
      — CAT 0.1.6 now applies weapon mastery itself (setting: Weapon Mastery), so the hand-built
      effect may double up or become redundant.
- [ ] Any **movement** macro that could use the new `origin` field on move events.
- [ ] Any CPR item that should now use the new generics **`modifyNextDamage`**, **`rolledDuration`**
      or **`weaponAnimation`**.
- [ ] Any macro that splices text into a usage card's `content` — midi 14.6.5 turns that into a note
      at the bottom of the card (with a warning); use `MidiQOL.addCardNote` to place it deliberately.
- [ ] Any item relying on an effect applied "whatever the save" reaching **missed** creatures — it
      now goes only to targets that were hit; and anything hand-applying a status that
      **Statuses Applied** (`midiProperties.statuses`) now does directly.
- [ ] Any DAE item effect with **no Replacement** — 14.6.4 fills its workflow references from the
      caster; the *Effect application* dialog is replaced by *Convert changes to Origin replacement*.

---

## CAT 0.1.6

### Settings
- **Weapon Mastery** (new): CAT applies the mastery property chosen for a weapon attack, for player
  characters by default.
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

## midi-qol 14.6.6

- Hosting: updates are served from GitLab Pages. Sample items only otherwise (Flaming Sphere, and
  several NPC features). The *Move roll formula to tooltip* deprecation warning appears once, not
  several times per load.

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
