# Simulacrum Automation Builder — {{version}}

A private fork of [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry), narrowed to one job: **turn natural-language ability text into working dnd5e automations, then verify them.**

This is the first release of that fork. The upstream generalist campaign-assistant prompt has been replaced with an automation-builder domain prompt, the provider layer has been reduced to OpenRouter, and three tools have been added.

## How it works

Paste an ability description into the sidebar. The agent:

1. **Parses** it into a spec — trigger, save ability, DC, range, targets, outcomes, duration, uses.
2. **Previews** it as an editable form so you can correct a misreading before anything is written.
3. **Builds** the item: a dnd5e Feature with its save activity, damage, applied effect and the midi-qol/DAE/CAT flags behind them.
4. **Tests** it against the token you have targeted, forcing the save to fail and then to succeed, and reports one line per claim from the spec.

## Tools

| Tool | Purpose |
|---|---|
| `preview_spec` | Presents the parsed ability as an editable form. Writes nothing. |
| `build_save_ability` | Creates or updates the Feature. Idempotent by `system.identifier`, so rebuilding corrects rather than duplicates. |
| `test_ability` | Runs the ability twice with forced outcomes against your targeted token and reports a checklist. |

## Design notes

**Edits never round-trip through the model.** The preview stashes the spec under a token and the builder reads it verbatim, so what you confirm is what gets built. Tokens are single-use.

**The preview form is authored by the agent, not templated.** Templates only cover abilities someone anticipated; a form drawn from a closed vocabulary can describe a fails-by-5 clause or a repeat save without new UI code. The form is data, never markup, and `showIf` is evaluated without `eval`.

**Tests force the outcome.** midi-qol's `fail.all` / `success.all` make the run deterministic. A test that depends on dice reports false failures about half the time, and a report you cannot trust is worse than none.

**A claim that could not be observed reports as untested**, never as passing.

**The test target is the token you targeted** — never a token created for the purpose, which would quietly change what the test proves. Teardown is unconditional, so a failed test leaves nothing altered.

## Requirements

Foundry VTT 13+ (verified on 14), and the **dnd5e** system at **5.3.3**. This release targets the 5.3.3 API specifically; it is not written against dnd5e 6.x.

Requires `midi-qol`, `dae` and `cat`. Recommends `chris-premades` and `dfreds-convenient-effects`.

An **OpenRouter API key** is required. Add it in the module settings; the model is chosen there too.

## Install

Paste this into **Setup → Install Module → Manifest URL**:

```
https://github.com/{{repo}}/releases/latest/download/module.json
```

The module is a private fork and is not listed in the Foundry package directory. It will not appear in the module browser, and automatic update checks only work if Foundry can reach this repository.
