# Simple Quest: the document model, the flags, the enrichers, and the script API

Simple Quest is a quest-management interface — quests and objectives, a campaign timeline,
achievements, party/personal journals, annotated maps, an investigation board, and structured
"codex" pages — built entirely out of ordinary Journal Entries and Pages, plus a `ui.simpleQuest`
script API, a `game.modules.get("simple-quest").api` module API, and a set of text enrichers.

There is **no new document type**. Everything is a `JournalEntry` / `JournalEntryPage`, tagged by a
page **type** of the form `simple-quest.<type>` and organised by **folder flags**. An automation
that writes a quest writes an ordinary Journal document with the `system`/`flags` shapes below.

**Provenance.** Read out of the module source at the version in the `simple-quest` clone
(**5.3.0**, Foundry compatibility 14, `socket: true`, `persistentStorage: true`), and cross-checked
against the module's wiki page (<https://wiki.theripper93.com/premium/simple-quest>). Where the two
disagree the source wins and the disagreement is called out. This file describes the module's
mechanisms; it does not claim which of its features a given world has enabled.

---

## 1. Page types (`simple-quest.<type>`)

Every page type is a `JournalEntryPage` data model registered as `simple-quest.<type>`. The type
string is what you write; the label is cosmetic.

| Type string | Label | What it is |
|---|---|---|
| `simple-quest.quest` | SQ Quest | A quest, with a status and an objectives checklist |
| `simple-quest.lore` | SQ Lore | A lore/codex entry |
| `simple-quest.map` | SQ Map | A map with markers and fog of war |
| `simple-quest.event` | SQ Event | A dated event for the Timeline |
| `simple-quest.era` | SQ Era | A dated span for the Timeline |
| `simple-quest.achievement` | SQ Achievement | An awardable achievement |
| `simple-quest.investigation` | SQ Investigation | An infinite investigation board |
| `simple-quest.character` | SQ Character | A structured character sheet |
| `simple-quest.creature` | SQ Creature | A structured bestiary entry |
| `simple-quest.location` | SQ Location | A structured place |
| `simple-quest.faction` | SQ Faction | A structured faction |
| `simple-quest.loot` | SQ Loot | An awardable item/currency cache |

All of them extend one generic sheet, whose base field is `system.src` (a `FilePathField`, image
category) — the page's image. The structured types add their own `system` blocks (statistics,
tags, tables, notes pills); the shapes are exposed live by `exportPageSchema` (§9).

Creating one by hand:

```js
await JournalEntryPage.create(
  { name: "Find the Ledger", type: "simple-quest.quest", text: { content: "<ul><li>Ask the innkeeper</li></ul>" } },
  { parent: journalEntry },
);
```

---

## 2. Folders: the special-directory flag, and what becomes a tab

The folder layout *is* the navigation.

- **Root** is a Journal Entry folder carrying the flag **`flags.simple-quest.simpleQuestDir: "root"`**.
  Simple Quest reads everything at or under Root.
- **Every folder directly inside Root becomes a tab.** No folder, no tab.
- A folder inside Root may itself carry `simpleQuestDir` set to one of the four **special
  directories** — **`"quests"`**, **`"party"`**, **`"timeline"`**, **`"achievements"`** — which
  gives it a dedicated built-in tab. The complete set of values is
  `none | root | quests | party | timeline | achievements`. A folder may also carry
  `flags.simple-quest.icon` (a Font Awesome class) for its tab icon.

Both are set in the **Folder config** (right-click the folder in the Journals sidebar → Edit) or in
code:

```js
await folder.setFlag("simple-quest", "simpleQuestDir", "root");
await folder.setFlag("simple-quest", "icon", "fas fa-scroll");
```

**Only one folder may hold each special value.** Setting `simpleQuestDir` on a second folder unsets
it from the first (`updateFolder` hook) — so the flag is authoritative and unique.

On the first GM's `ready`, a world with no Root gets a default tree: folder **"Simple Quest"**
(`root`) containing **Quests** (`quests`), **Party** (`party`), **Timeline** (`timeline`) and
**Achievements** (`achievements`); the Party folder gets one child folder per existing user name.

Membership test used throughout: a page "is in Simple Quest" when its journal is the Root folder or a
descendant of it (`StaticDirectories.isAncestor`). A **Journal pin** whose page passes that test opens
the page inside Simple Quest instead of the plain journal (`activateNote` hook).

---

## 3. Quests, the objective state, and permissions

### Objectives are list items, and their state is keyed by content

A quest's body is the page's **`text.content`** (the view renders `text.enriched`). **Every `<li>`
in it becomes an objective**, and its key is derived from its own text:

```js
key = li.textContent.trim().slice(0, 50).slugify({ strict: true });
```

State lives on the page, keyed by that slug:

- **`system.objectiveState`** — `{ [key]: 0 | 1 | 2 }` where **0 = unchecked, 1 = checked,
  2 = failed**.
- **`system.objectiveSecrets`** — `{ [key]: true }` marks an objective **secret**. A non-owner never
  sees a secret `<li>` at all; the owner sees it highlighted.
- **`system.observerObjectivePermission`** — `"default" | "allow" | "deny"`. Combined with the world
  setting `allowObserverCheckboxToggle`, this decides whether an **Observer** may click objectives
  (an Owner always may).

Click behaviour: **left click** toggles checked; **right click** toggles failed; **`Alt` + left
click** toggles the secret. Checking a parent cascades to its children; a parent is auto-set to
checked when all its child `<li>` are checked or failed. A non-owner's toggle is sent over the
module's `updateQuestObjective` socket to be applied by a GM — so a player's objective change is a
GM-side update.

### Quest fields

| Field | Meaning |
|---|---|
| `system.status` | `-1` undiscovered, `0` in-progress, `1` completed, `2` failed (drives the Quest Recap grouping) |
| `system.questGiver` / `system.location` / `system.difficulty` / `system.deadline` | Free-text sidebar fields |
| `system.aspectRatio` | `"auto" \| "3 / 2" \| "2 / 3" \| "1"` for the sidebar image |
| `system.imageFilter` | Boolean, applies the sepia/border filter to the image |
| `system.html` | The **reward** block: `{ content, hidden, order }` — `content` is HTML, `hidden` hides it from non-owners |

### Permissions

Give players **Observer**, never **Owner**, on the quest pages. An Owner can edit the page — and can
therefore see hidden objectives. The wiki's guidance is unchanged by the source. (The wiki documents a
"Simple Quest Permission Handling" setting; the settings 5.3.0 actually registers are listed in §7 and
none is named that.)

---

## 4. Maps: markers, measure, pins, and fog of war

A `simple-quest.map` page draws an interactive map from `system.src` (one image) or, if `system.src`
is empty, from the `<img>` elements in `text.content` (an ordered multi-image map — put a
low-resolution image first for huge maps). `system.subtitle` and `system.tags` are cosmetic.

Board data lives in **page flags**, not `system`:

| Flag | Shape | Meaning |
|---|---|---|
| `flags.simple-quest.markers` | `{ [id]: { title, icon, journal, x, y, hidden, color, … } }` | Markers. `x`/`y` are **0–1 relative to the map**, not pixels. `journal` is a document UUID. |
| `flags.simple-quest.measure` | `"1mi"` (default) | Scale, `<number><unit>` |
| `flags.simple-quest.pinsLocked` | Boolean | Locks marker positions |
| `flags.simple-quest.fowMask` | image path | The fog-of-war mask image |

Marker interaction (from the wiki): right-click the map adds a marker, right-click a marker edits it,
hold right-click and drag moves it, left-click opens it (viewing its Scene if one is linked),
**`Alt` + left click** toggles hidden. Fog of war: `Shift` + left-click hides, `Shift` + right-click
reveals, a slider or `Shift` + wheel sets the brush. **Markers are visible through the fog** — hide
them explicitly.

**`ui.simpleQuest.sceneToMap()`** converts the currently viewed Scene: it creates a
`simple-quest.map` page (named after the scene) in a journal named **"Imported Maps"** under Root, and
turns the Scene's **notes into markers** — `title` from the note label, `icon` from its texture,
`journal` from the note's page/entry UUID, `x`/`y` normalised 0–1, `hidden: false`, `color` from the
texture tint (default `#ff0000`). It also records the scene's scale in `flags.simple-quest.measure`.

---

## 5. Timeline, achievements, and loot

### Timeline (`simple-quest.era`, `simple-quest.event`)

The Timeline tab renders `era` and `event` pages ordered by their date fields:

- **Era**: `system.eraStart`, `system.eraEnd` (integers, required), `system.color`, `system.banner`,
  `system.label`.
- **Event**: `system.year` (required), `system.duration`, `system.icon`, `system.flipped`,
  `system.offset`, `system.banner`, `system.label`.

### Achievements (`simple-quest.achievement`)

- **`system.awardedTo`** is a **Set of user ids** — an achievement is awarded by adding a user id to
  it. `system.color`, and `showColor` / `showTitle` / `showContent` / `showImage` control what a
  not-yet-awarded user sees (the page is **redacted** for anyone not in `awardedTo` and not an
  owner). Toggling an award is a plain `page.update({ system: { awardedTo } })`.

### Loot (`simple-quest.loot`)

- **`system.items`** — array of `{ item: <Item UUID>, quantity, hidden, awarded }`.
- **`system.currency`** — array of `{ denomination, amount, hidden, awarded }`. The currency rows are
  only shown/edited when **`ripper-system-abstraction`** (RSA) is installed and active; without it the
  loot page is items-only. Both lists mark rows `awarded` as they are distributed to players.

---

## 6. Structured "codex" types

`character`, `creature`, `location`, `faction` and `lore` are richer pages assembled from reusable
blocks: **statistics**, **tables**, **icon lists** (facts/members/equipment), **colour tags**
(traits/relations/regions), **resource pools**, and coloured **wisdom/lore pills** —
`character`/`creature` carry `firstWisdomPill`/`secondWisdomPill`; `location`/`faction`/`lore` carry
`firstLorePill`/`secondLorePill` (lore adds a third), plus `lore`'s `primary/secondary/tertiary`
fact, statistic, property, tag and note blocks. These blocks store HTML in `system.html<N>` with
`{ content, hidden, order }`; a `hidden` block renders only to owners.

`simple-quest.investigation` is the infinite board (clues, people, connections, stamps). Its content
is stored on the page itself and is edited through its own canvas UI; the wiki's section describes the
interactions (`Right Click` for the preset menu, `Ctrl` + left-drag to connect, `Alt` + click to hide,
the bottom-right action menu for viewport and stamps).

---

## 7. Settings

5.3.0 registers these **world**, config-visible settings — the ones an automation might read:
`showHistory`, `showJournalOwnership`, `allowObserverCheckboxToggle`, `showTutorialTips`,
`hideFolderFromPlayers`, `showQuestNotifications`, `newQuestSoundEffect`, `updateQuestSoundEffect`,
`openJournalPinsAsModals`, `betterOwnership`, and the theme (`backgroundColor`, `backgroundImage`,
`textColor`, `secretColor`, `failedColor`, `labelColor`, plus `fontFamily` / `headerOnlyFont` /
`secondaryFontSize` registered on ready).

Keybindings: **`J`** toggles the interface; **`Ctrl` + `Tab`** is history back
(`ui.simpleQuest.back()`); **`Ctrl` + `Shift` + `F`** opens the global search palette
(`ui.simpleQuest.search.openPalette()`). A button is also injected into the Journals sidebar.

Notifications: **`showQuestNotifications`** toasts every Observer+ user when a **non-secret** quest,
objective or lore page is updated. A page whose flag `flags.simple-quest.hidden` is set never fires a
toast. Revealing a page (granting a user Observer) fires the "new quest" toast and plays
`newQuestSoundEffect`; `shareToChat` posts a chat message carrying
`flags.simple-quest.simpleQuestMessage` (the page UUID) whose button opens the page in Simple Quest.

---

## 8. Enrichers

Registered into `CONFIG.TextEditor.enrichers`.

| Enricher | Syntax | Notes |
|---|---|---|
| `@time` | `@time[1430/02/05, 03:29]` or `@time[<worldSeconds>]`, optional `, reverse` | Requires **Simple Timekeeping** (`ui.simpleTimekeeping`); without it renders "Simple Timekeeping & Calendar Not Installed". Shows the time *remaining*; `reverse` swaps the timestamp and the remaining-time text between the label and the tooltip. |
| `@QUEST` | `@QUEST[uuid]{Name}` | Opens the Simple Quest interface at that page instead of the plain page. |
| `@LORE` / `@MAP` | `@LORE[uuid]{Name}` / `@MAP[uuid]{Name}` | Same, for a lore or map page. |
| `@COUNT` | `@COUNT[counterId]{maxValue}` | Left-click `+1`, right-click `−1`, wrapping at `maxValue + 1`. |
| `@REPUTATION` | `@REPUTATION[id,color,icon]{maxValue}` or `…{min,max}` | Pips, or a bar with the `$bar` prefix (below). |
| `@TTM` | `@TTM[src]{Title}` or `@TTM[src]{Title\|Visible title}` | Theater-of-the-Mind button; GM clicks to show a fullscreen image to all users. |

- **`@QUEST` / `@LORE` / `@MAP`** accept a `#heading` anchor in the uuid
  (`@QUEST[uuid#anchor]{Name}`), and clicking one calls `ui.simpleQuest.openToPage`. The easy way to
  author one is to drag the page into the text and replace the `UUID` inside the link with `QUEST`
  (or `LORE` / `MAP`).
- **`@COUNT` and `@REPUTATION` share storage**: the value lives in the page flag
  **`flags.simple-quest.counters`** (`{ [id]: number }`), so the same id on **different pages does
  not share**. Only an Owner can click. `@REPUTATION` accepts **one or two bounds** — `{maxValue}`
  means `min 0`; `{-20,20}` sets both; a single-word icon argument is expanded to `fas fa-<word>`.
  The **`$bar`** prefix must be exact (`$barid`, not `$something`); `@REPUTATION[$barid,color,color2]`
  draws a gradient bar.
- **`@TTM` path rule**: if the **first path segment contains a dot** it is treated as a remote host
  and `https://` is prepended. So `@TTM[example.com/x.png]` → `https://example.com/x.png`, while a
  bare filename (`@TTM[myImage.png]`) becomes `https://myImage.png` and fails — **put local images in
  a subfolder** (`@TTM[images/myImage.png]`), and strip `https://` from remote URLs.

Editor elements (not enrichers): the ProseMirror **Format** menu gains **Callouts**
(lore/creature/npc/location/magic/item/event/time), **page inserts** (parchment note/book/scroll) and
an inline **initial** (a large first letter).

---

## 9. Script API

`ui.simpleQuest` (an instance of the app):

```js
ui.simpleQuest.toggle();                                  // open/close
ui.simpleQuest.back();                                    // history back
ui.simpleQuest.openToPage(uuid, { history: true, modal: false });
ui.simpleQuest.openToTab("quests");
ui.simpleQuest.sceneToMap();
ui.simpleQuest.isSimpleQuestPage(uuid);                   // in Root or a descendant?
```

- **`openToPage(uuid, options)`** accepts a `JournalEntry` or `JournalEntryPage` uuid, with an
  optional `#anchor`. `modal: true` (for a page) opens it as a modal. If the target is not under Root
  it falls back to rendering the journal normally.
- **`openToTab(tab)`** accepts the built-in keys `quests`, `timeline`, `partyJournal` (or
  `party-journal`), `myJournal` (or `my-journal`), `achievements`, **or the name (case-insensitive) or
  id of any folder directly inside Root**.

Module API, on `game.modules.get("simple-quest").api`:

| Method | Purpose |
|---|---|
| `exportPageSchema(type, { toFile })` | Serialises the live field model of `simple-quest.<type>` (labels, choices, defaults, nested fields; `hideInConfig` fields skipped) |
| `exportAllSchemas({ toFile, singleFile })` | Every `simple-quest.*` schema at once |
| `createPageFromJSON(journalEntry)` | Interactive file-picker prompt that imports a page from JSON |
| `migrate` / `migrateQuestJournal` | The module's own world migrations |

`createPageFromJSON` is interactive; the underlying function `createPageFromObject(journalEntry,
json)` takes `{ type, name, text, system }` and creates the page — use that shape (or a plain
`JournalEntryPage.create`) when an automation needs to write one directly.

---

## What this file is not

- **Not a UI tour.** Layout, dialog markup and styling are not reproduced.
- **Not the investigation board's internals.** The board is large and self-contained; §6 covers what
  it is and the wiki covers how to use it.
- **A usage and data-model reference, not an automation hook.** Simple Quest's page types, flags and
  enrichers are its own — they do not participate in midi-qol / DAE / CAT workflows.
