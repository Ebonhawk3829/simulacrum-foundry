# dnd5e text enrichers and inline rolls

The shipped reference did not document these. A `read_reference` search for "enricher" returns only
Simple Quest's own set (unrelated — its enrichers do not participate in midi-qol/DAE/CAT), and
"[[/r" returns nothing at all. **Do not conclude from that silence that a format is unsupported.**
This file is where the dnd5e enrichers live now.

## Where the grounds actually are

1. dnd5e's own bundled code — `systems/dnd5e/dnd5e.mjs`, function `parseDamageConfig`. Authoritative
   for the config keys.
2. The live registry `CONFIG.TextEditor.enrichers` (16 entries in this world). Read it rather than
   guessing a syntax.
3. Working shipped documents. Read these for real syntax, not a paraphrase — the 2024 packs are full
   of them.

## The trap that cost a wrong diagnosis: roll enrichers need DOCUMENT CONTEXT

`[[/attack]]`, `[[/damage]]`, `[[/save]]`, `[[/healing]]` resolve **relative to a document**.
Enriching a bare string with no context reports every one of them as UNENRICHED — a literal token
left in the output — which is indistinguishable from a broken enricher. This produced a false "7
items have unenriched tokens" reading that was entirely the harness.

The working call passes the item, as a sheet does:

```js
await foundry.applications.ux.TextEditor.implementation.enrichHTML(text, {
  async: false,
  relativeTo: item,
  rollData: item.getRollData?.() ?? {}
});
```

With that, leftover tokens go to ZERO and the numbers resolve. Same family as the world-conventions
rule: **a probe that reports a known-working mechanism as dead is reporting on the harness — fix the
instrument before reading any negative from it.**

## `[[/damage]]` / `[[/attack]]` config keys

Read out of `parseDamageConfig`: `activity`, `attackMode`, `average`, `format`, `formula`; plus the
slugs `average`, `extended`, `temp`. Damage types resolve through `CONFIG.DND5E.enrichmentLookup`.
And `if (config.format === "extended") config.average ??= true;` — so **`extended` implies
`average`**.

### `extended` is the one to prefer on statblock attacks

`[[/attack extended]]` and `[[/damage extended]]` generate the numbers **from the activity**. A
hand-written "+8 to hit … 4d8 radiant" is a snapshot that goes stale the moment the activity changes
— and it still LOOKS correct, which is worse than an empty field. Verified on Ithuriel's Mace: after
switching, the text produced `data-formula="9"` (the +9 to hit) and damage
`data-formulas="1d6 + 4&1d8"` with `data-damage-types="bludgeoning&radiant"`.

**The ampersand IS the multi-part separator** in the rendered output. One enricher covers every
damage part of the activity.

### The escaped ampersand is harmless — tested, not assumed

Writing `&Reference[prone]` stores as `&amp;Reference[prone]`, because the text goes through entity
encoding on write. That looks like it must break the enricher (the registered pattern begins
`&(?<type>Reference)\[...`). **It does not.** Verified by enriching both forms: escaped, raw and
lowercase all produce an identical `<enriched-content enricher="dnd5e-reference">` link to the rule
page. Matching happens after entity decoding, and the pattern is registered case-insensitively. So
write `&Reference[condition]` naturally and do not try to defend the ampersand. Condition names used:
blinded, charmed, grappled, paralyzed, prone, restrained, stunned, invisible — all resolved.

## Working shipped dialects to copy

```
[[/attack extended]]. [[/damage extended]].               (Gargoyle bite/claws, Spy shortsword)
[[/save activity=<activityId>]]                            (Drow hand crossbow, Bulette deadly leap)
[[/damage average activity=<activityId>]]                  (Bulette)
[[/healing average]] / [[/healing activity=<activityId>]]  (Will-o'-wisp, Vampire Regeneration)
[[/item .<itemId>]]{label}                                 (Gargoyle Multiattack, Drider Innate Spellcasting)
&Reference[prone]                                          (everywhere)
```

`[[/item .<id>]]` takes a **leading dot** = a sibling item on the SAME actor. Verified: Multiattack's
link resolved to `Actor.<id>.Item.<rayOfLightId>`.

## The write path

```js
item.update({ "system.description.value": html });
```

Assert the readback length changed AND that every enricher token is gone from the enriched output — a
description full of literal `[[/...]]` renders as visible clutter and is the failure mode this whole
file exists to prevent.

## A note on `[[/r ]]`

Plain inline rolls work in descriptions and are the right tool for a number that is NOT an activity's
own output (Descend's 1d6/1d4 per-distance damage), where an activity enricher has nothing to point
at.

## What this file is not

- **Not a full enricher registry.** Read `CONFIG.TextEditor.enrichers` for the live set.
- **Not a substitute for a working example.** The shipped packs carry real syntax; copy from them.
