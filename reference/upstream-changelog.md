# Upstream changelog — what changed since the world was last swept

WHY THIS FILE EXISTS

The reference files (`cat-macro-flags.md`, `cat-embedded-macros.md`, `cpr-generic-config.md`,
`midi-reactions.md`, `dnd5e-6.0-fields.md`, `dae-effect-expiry.md`, `aura-effects.md`,
`gambits-premades.md`) describe CAT, CPR, midi-qol and DAE **as they are now**. They are current-state,
not history: once they are synced to the pinned versions, they already say how everything works.

This file is the other half — the upstream changes made **since the world's abilities were last
checked** against them, so a search can find what a bump might have broken.

HOW TO USE

- Each entry names the mechanism and a **Look for** line: the key to search the world for
  (`document_search` over items, or a scan of `flags.cat` / `flags.midi-qol`).
- **Overwritten at each sync, never appended — and cleared once a build is released.** The release
  carries this file and the world is swept straight away, so the local copy is reset to this header
  after publishing. Each sync writes only its own delta.

PINNED

- Reference synced to **CAT 0.1.8**, **CPR 2.1.8**, **midi-qol 14.6.13** and **DAE 14.6.10**
  (midi 14.6.13 requires DAE ≥**14.6.7** and is dnd5e **6.0.x only**, max 6.0.999 — 14.7.0 onward
  need dnd5e 6.1; CPR 2.1.8 requires CAT 0.1.8; `auraeffects` 2.3.0 and `gambits-premades` 3.0.5 are
  the second-class options). midi and DAE are on **GitHub** (`latest-dnd6`).

---

## Review checklist — the questions to ask the world

*(Nothing outstanding — cleared after the 0.7.15 release.)*
