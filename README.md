# Simulacrum: AI Automation Builder (Ebonhawk fork)

A private fork of [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry),
narrowed to one job: **turn natural-language ability text into working dnd5e
automations, then help you verify them.**

The upstream project is a generalist campaign copilot. This fork throws that away
and does one thing: you describe an ability, the agent builds it as real document
data on an actor's sheet, and then you use it in play while the module records
what happened, so the two of you can work out whether it behaves.

Not listed in the Foundry package directory — it is installed by manifest URL.

## How it works

1. You paste an ability's text — a statblock entry, a class feature, a magic item.
2. You open the Simulacrum tab and ask for it on a specific actor.
3. The agent says how it reads the ability — which activity, which flags, what lands
   on whom — and you confirm or correct that reading **before anything is written**.
   This check-in is the one step that always happens.
4. It builds the item: activities, applied effects, and the midi-qol / DAE / CAT
   flags behind them, or a script where flags cannot express the behaviour.
5. You use the ability in play the way you normally would.
6. You tell it what you saw. It compares that against the recorded run and against
   what it intended, and either fixes the build or calls it confirmed.

The agent is given the tools and the reference material, not a fixed procedure. How
it gets from the text to the item is its call — this fork does not dictate the route,
and it may build through the editable preview or by writing documents and scripts
directly. What it keeps is the habit of checking its reading of the ability with you
first, because an ability built from a statblock is a hypothesis until it has actually
been used.

Steps 3 and 6 are what this fork is for: catching a misreading before the build, and
catching a wrong build before it is trusted.

## What the agent can read

It does not guess field names. It has tools for:

- **`read_reference`** — the dnd5e 6.x field guide shipped with this module, plus
  the documentation belonging to modules *installed in your world* (midi-qol's
  flag reference and macro guide, DAE, CAT, Chris's Premades).
- **`inspect_document_schema`** / **`list_document_schemas`** — the live shape of
  any document, straight from the system.
- **`search_documents`** — working examples in compendiums. A similar spell that
  already works is the best template there is.
- **`read_memory`** — its own persistent notes: the **lessons** it has learned and
  the **session history** of what it built and discovered. These live outside the
  world (`Data/simulacrum/`), so they survive a world reset. It records history as it
  works and proposes lessons for you to confirm before they are saved.

## Requirements

| | |
|---|---|
| **Foundry VTT** | 14.369 or higher (verified on 14) |
| **dnd5e** | **6.x** (verified on 6.0.6) |
| **Required modules** | `midi-qol` (v14.6.3), `dae` (v14.6.2), `cat` (Coven's Automation Toolkit, 0.1.3) |
| **Recommended** | `chris-premades` (2.1.3), `dfreds-convenient-effects` |
| **Model access** | An [OpenRouter](https://openrouter.ai/keys) API key, and a model that supports tool calling |

> [!IMPORTANT]
> The model **must** support tool/function calling — that is how the agent touches
> your world. A model without it will error or stall. On OpenRouter, filter by
> [models with tool support](https://openrouter.ai/models?supported_parameters=tools).

## Install

Paste this into **Setup → Install Module → Manifest URL**:

```
https://github.com/Ebonhawk3829/simulacrum-foundry/releases/latest/download/module.json
```

To update, install the same manifest URL again — Foundry will offer the new
version. There is no package-browser entry and no automatic update check.

**Manual install:** download `simulacrum.zip` from
[Releases](https://github.com/Ebonhawk3829/simulacrum-foundry/releases) and
extract it into `Data/modules/`.

## Configuration

1. Enable the module in your world.
2. Open **Module Settings → Simulacrum** and set the OpenRouter API key. Only
   OpenRouter is supported in this fork.
3. Open the Simulacrum sidebar tab and pick a model from the header dropdown.

The world must be running the dnd5e system, and you must be a GM — the agent is
GM-only.

## Writing automations by hand

The **Cat Shield** integration sheet is where automations actually live, and both
the agent and you write to the same place. Two conventions are worth knowing
because they fail quietly when wrong:

- **Identity is `system.identifier`** on the item, and `flags.cat.identifier` on
  effects (falling back to `name.slugify()`). Automation looks items up by
  identifier, never by display name, so a rename does not orphan anything.
- **Where things live.** Activities go inside the item's system data as
  `system.activities`, keyed by id — an id-keyed object, not an array. Effects go
  at the item's top level as an embedded `ActiveEffect` collection. Put either in
  the wrong place and Foundry accepts the write and then ignores it.

`reference/dnd5e-6.0-fields.md` in this repository is the guide the agent reads,
and it is written for a human too. It is the fastest route to the shapes that are
easy to get wrong.

## Extending the tool set

The agent's tools are discovered from world macros. Add a `const tool`
configuration object to a macro and Simulacrum exposes it:

```javascript
const tool = {
    name: "my_custom_tool",
    description: "A description of what this tool does",
    parameters: {
        type: "object",
        properties: {
            parameterName: {
                type: "string",
                description: "Description of the parameter"
            }
        },
        required: ["parameterName"]
    },
    enabled: true
};

// Access parameters via: this.args.parameterName
return `Processed: ${this.args.parameterName}`;
```

Return a value to send output back to the agent; returning nothing shows as
"No output". A `response` parameter is added automatically so the agent can
explain itself as it goes.

## Support

- **Issues**: [GitHub Issues](https://github.com/Ebonhawk3829/simulacrum-foundry/issues)
- **Changes**: [CHANGELOG.md](CHANGELOG.md)
- **Upstream**: [Daxiongmao87/simulacrum-foundry](https://github.com/Daxiongmao87/simulacrum-foundry)

## License

MIT — see [LICENSE](LICENSE).

Fork of [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry) by
[Daxiongmao87](https://github.com/Daxiongmao87), used under the MIT License.
