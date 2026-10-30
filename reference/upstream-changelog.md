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

- Reference synced to **CAT 0.1.6** and **CPR 2.1.6** (CPR 2.1.6 requires CAT 0.1.6).
- Previous sync: CAT 0.1.4 / CPR 2.1.4. Everything below is CAT 0.1.5–0.1.6 and CPR 2.1.5–2.1.6.
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
