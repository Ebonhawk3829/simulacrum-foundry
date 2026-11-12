# Aura Effects — the second-class aura option

WHY THIS FILE EXISTS

This world has **two** ways to do an aura. **CAT's own `aura` generic is the first, and takes
precedence** — `source: 'cat'`, `identifier: 'aura'`, config at `flags.cat.genericConfig.cat.aura.<key>`
(see `cat-macro-flags.md`); CPR's old `passiveAura` was removed in CAT's favour. This file covers the
**other** one — the `auraeffects` module — so it can be reached when CAT's aura cannot express what is
needed, and so the two are **never** used on the same aura.

Reach for Aura Effects only when CAT's `aura` generic cannot do it: an aura on a plain Active Effect
you are configuring by hand (not on a CAT item), or one whose recipient set / stacking / source-relative
values do not fit CAT's descriptor model. When both could apply the same aura, **CAT wins**.

WHAT IT IS

Aura Effects (`auraeffects`, by roth-michael; source at `git.gay/roth-michael/Aura-Effects`) turns an
Active Effect of its new subtype **`auraeffects.aura`** into an aura that applies copies to tokens in
range.

- The aura effect itself holds **no** changes: it stashes them (`stashedChanges` / `stashedStatuses`),
  and each token in range gets a **copy** carrying that token's matching changes, flagged
  **`flags.auraeffects.fromAura`** = the source effect's uuid.
- Range is a **token-attached Region per aura**: the Region is flagged `flags.auraeffects.origin` = the
  source effect's uuid, and a recipient is a token within it. A token's aura regions are the
  `auraeffects`-flagged regions it is inside.
- The writes (creating/updating/deleting the Regions and the applied effects) are done by the **active
  GM** (`game.users.activeGM.query(...)`), so it settles on one client.

CONFIG — the aura effect's `system`

| Key | Type / default | What it does |
|---|---|---|
| `distanceFormula` | string, `"0"` | The aura's radius, rolled with the **source** document's roll data (e.g. a class scale value). |
| `disposition` | Hostile / Any / Friendly | Recipient filter, relative to the source token's disposition. A Neutral or Secret token is **never** Friendly or Hostile — only Any. |
| `applyToSelf` | bool, `true` | Whether the source token is also a recipient. |
| `canStack` | bool, `false` | If false, only the "best" aura applies; `bestFormula` decides which. |
| `bestFormula` | string | The value compared for "best" when `canStack` is false. |
| `evaluatePreApply` | bool, `false` | Evaluate the changes with the **source's** roll data rather than the recipient's — for source-relative bonuses (Aura of Protection). |
| `collisionType` | none / light / move / sight / sound, `move` | The wall type that blocks the aura. An older `collisionTypes` array migrates to its first entry. |
| `combatOnly` | bool, `false` | Suppress unless the source actor is in combat. |
| `disableOnHidden` | bool, `true` | Suppress while the source token is hidden. |
| `overrideName`, `color`, `showRadius` | | The applied effect's name, the visualisation colour, and whether to draw the radius. |
| `script` | JS | A script run for the aura. |

RELATION TO THE REST OF THE STACK

- **midi-qol knows it.** midi recommends `auraeffects` by name (and warns against the legacy
  ActiveAuras), and special-cases aura effects — for example it will not apply an OverTime effect when
  the effect is an aura with "ignore self". midi's shipped *Spirit Guardians* is an example.
- **It is Region-backed**, so it presses on the same region system as CAT 0.1.8's region behaviors and
  midi 14.6.11's area-height rules. Mind the interaction where an aura's area and a placed area overlap.
- **Never do one aura with both systems.** If a CAT item can carry the aura, use CAT's `aura`; do not
  also make it an `auraeffects.aura`.

VERSION

Pinned at **2.3.0** (git.gay; the GitHub mirror lags behind). Foundry `14`–`14` (verified 14.366). It
has no other dependency. Gambit's Premades requires ≥2.2.0.
