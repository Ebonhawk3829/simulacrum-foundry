# Upstream changelog — what changed since the world was last swept

WHY THIS FILE EXISTS

The reference files describe CAT, CPR, midi-qol, DAE and dnd5e **as they are now**. They are
current-state, not history. This file is the other half — the upstream changes made **since the world's
abilities were last checked**, so a search can find what a bump might have broken.

HOW TO USE

- Each entry names the mechanism and a **Look for** line: the key to search the world for.
- **Overwritten at each sync, never appended — and cleared once a build is released.** The release
  carries this file and the world is swept straight away, so the local copy is reset to this header
  after publishing.

PINNED

- Reference synced to **dnd5e 6.1.1**, **midi-qol 14.7.0**, **DAE 14.6.10**, **CAT 0.1.10** and
  **CPR 2.1.10** (`auraeffects` 2.3.0 and `gambits-premades` 3.0.5 are the second-class options).
- **This delta:** CAT **0.1.9 → 0.1.10** and CPR **2.1.9 → 2.1.10**.

---

## Review checklist — the questions to ask the world

- [ ] **CAT Third-Party Reactions** (CAT 0.1.10) — a new setting. When it is **off**, a reaction or
      optional bonus offered **on behalf of another creature** is skipped; a pass entry opts back in
      with **`thirdParty: true`**. CPR's Protection, Interception, Chronal Shift, Projected Ward,
      Spirit Shield, Pariah's Shield, Pack Hunter, Tireless Reveler and `preventDeath`-for-others
      follow it. **Look for:** an ability that offers a reaction/optional bonus for a creature other
      than its owner — decide whether it should be marked `thirdParty`, or left to the setting.
- [ ] **CPR `attackRider`** (CPR 2.1.10) — can now limit a rider to **attack modes** and to targets no
      more than a set number of **sizes** larger than the attacker; with **no damage type set** it uses
      the type chosen with `selectDamageType`. **Look for:** an `attackRider` config in
      `flags.cat.genericConfig['chris-premades'].attackRider` — re-check it.
- [ ] **CPR `preventDeath` / `reduceDamageTaken`** (CPR 2.1.10) — `preventDeath` can protect **allies
      within a range** of its owner, or only creatures other than its owner; `reduceDamageTaken` can
      require its owner to **see** the creature dealing the damage. **Look for:** those generics.
- [ ] **New CPR generics** (2.1.10) — **`languageChoice`** (pick languages to learn; a later use can
      swap a limited number), **`willingFail`** (each non-hostile target may choose to fail a save it
      succeeded on), **`moveTargets`** (each target moves part of its speed without provoking), and
      **`touchDelivery`** (deliver the user's next touch spell through one of their summons, spending
      its reaction). **Look for:** a hand-rolled version of any of these.

---

## CAT 0.1.10  (from 0.1.9)

- **Third-Party Reactions** (checklist) is the notable change — a setting plus a per-pass `thirdParty`
  opt-in.
- `tokenUtils.displaceToken` takes a **`userId`**, so another user aims the destination crosshair.
  Alternate-attribute restrictions gain a **Base Weapon** option that matches the attacking weapon's
  base item. Summon entries gain **Token Scale**, **Lock Rotation** and **Token Ring** options.
- The **Troubleshooter** requires midi-qol's condition rules, unless *Automated Conditions 5e* is
  active. Dialog configs accept **`timer: false`** (the prompt timer no longer runs on Medkit, Mass
  Apply, Troubleshooter and export dialogs).
- **Fixed:** a summon cast by a player is now known to every client (dropping it to 0 HP prompts the GM,
  a recast is no longer blocked by a summon that no longer exists, and deleting a dismiss-at-0 summon's
  token dismisses it); mass apply no longer fails on a compendium with more than 99 updatable items.

## CPR 2.1.10  (from 2.1.9; requires CAT 0.1.10)

- **Generic changes** (checklist): `attackRider`, `preventDeath`, `reduceDamageTaken`.
- **New generics** (checklist): `languageChoice`, `willingFail`, `moveTargets`, `touchDelivery`. See
  `cpr-generic-config.md` (80 generics, 415 settings).
- Several automations now **follow CAT's Third-Party Reactions** setting (checklist), and Heat Metal,
  Mirror Image, Sanctuary, Teleport, Spell-Storing Item, Insightful Manipulator and firearm misfires add
  their messages to the roll's chat card instead of a separate message. Command activities (Animate
  Objects, Danse Macabre, Summon Wildfire Spirit, …) open the summons' sheets.
- **Content:** the **Illrigger** base class and **Painkiller** subclass; 2014 Shadar-kai *Blessing of
  the Raven Queen*.
- **Fixed:** True Strike / Green-Flame Blade play the weapon animation at the hit; Potion of
  Invulnerability grants resistance to all damage; `preventDeath` no longer triggers on a creature
  already at 0 HP; a familiar carrying a touch spell can use its own attacks and spells.
