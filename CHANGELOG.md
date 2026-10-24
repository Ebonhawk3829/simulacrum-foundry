# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.6] - 2026-10-24

Fixes the 0.6.5 popout change: a detached sidebar tab is now actually styled — full width, dark
surface — instead of only the in-page popout.

### Fixed

- **The popped-out tab carries its own stylesheet into the window.** A detached sidebar tab
  renders in its own document that loads only Foundry's and some other modules' CSS — not
  Simulacrum's — so the 0.6.5 rules never applied there: the tab stayed at the `.chat-sidebar`
  width another module (crlngn-ui) pins, and the light theme painted the message bubbles pale,
  leaving yellow text on a light surface. The tab now fetches its stylesheet once and writes
  it, together with the popout sizing and a dark surface for the bubbles, into the popped-out
  document when it opens or detaches. The document-level rules apply only to a genuinely
  detached window, so an in-page popout cannot affect the main UI.

## [0.6.5] - 2026-10-24

The sidebar tab, popped out into its own window, now fills that window and gets the module's
dark surface, so wide content — tables especially — is readable there.

### Fixed

- **A popped-out sidebar tab is full width and dark.** Foundry's right-click → Pop Out renders
  the tab outside the sidebar, but it kept the sidebar's `.chat-sidebar` width and landed on a
  window body with no theme of its own, so it sat at sidebar width on a light surface and wide
  tables were squeezed into a column of single characters. The popped-out tab is now tagged and
  stretched to the window width with the module background. The tag goes on the tab's own root,
  and on the window body only for a genuinely detached window, so an in-page popout cannot
  affect the main UI.

## [0.6.4] - 2026-10-24

Fixes the agent's answer appearing twice again — this time in the stored conversation, so it
came back whenever the log was rebuilt.

### Fixed

- **The final answer is no longer stored twice.** The loop requires `end_loop`, so a
  text-only answer is stored so it survives a reload, and the model is then asked to re-send
  it with `end_loop`. That re-send is the same answer, and it was stored too, so the
  conversation held two copies and any log rebuilt from it — a reload, or reopening the tab —
  showed the answer twice in one message. The re-send is now recognised as a restatement of
  the answer already stored this turn and is not stored again. The live display already
  suppressed the repeat, which is why 0.5.1 looked fixed and the duplicate only returned once
  the log was rebuilt. The synthetic correction turn that prompts the re-send is skipped when
  looking for the stored answer, and the search stops at your prompt, so a genuine repeat in a
  later turn is still kept.

## [0.6.3] - 2026-10-23

Fixes agent replies rendering as a wall of literal markdown again, and the stray tags that
came with it.

### Fixed

- **A supplied display is trusted only when it is already HTML.** A display that is not HTML
  is not a rendering of the content — it is a status line or a label — and trusting it put a
  one-line status where a page of prose belonged, with literal `##` and `\n\n` in the log.
  This was introduced in 0.4.2 to preserve a short "🛑 Process cancelled" label; that label
  now passes HTML instead.
- **A stray tag-shaped word no longer disables markdown for a whole chunk.** The HTML sniff
  was unanchored, so prose containing something like `</verb>` was treated as HTML and passed
  through raw — which is why a chunk could show both the stray tag and literal `##`. The sniff
  is now anchored to the start of the text, so it identifies HTML fragments rather than
  mentions of tags.
- An undefined chunk no longer appends the literal string `undefined` into a merged message.

## [0.6.2] - 2026-10-23

Fixes the edit control on your own prompts doing nothing.

### Fixed

- **Edit and resend now works on a freshly loaded session.** The chat handler is built
  lazily on the first send while the log is synced straight from core on load, so
  `app.chatHandler` is null until you have sent something. The index was built from that,
  found nothing, and the handler returned silently. It now builds the chat handler first,
  falling back to core's conversation manager, and resolves the conversation once so the
  editor and the resend both use it — the resend had the same dependency, so Save & resend
  would also have done nothing.
- A refused edit now logs the reason instead of returning silently.
- Editing is refused for anything that is not one of your prompts; previously an assistant
  message could have mapped onto an earlier prompt's index and rewound the wrong turn.

## [0.6.1] - 2026-10-23

Fixes conversation compaction running far more often than the model's context window
warrants.

### Fixed

- **Compaction now uses the model's real context window.** The conversation manager was
  constructed from the `fallbackContextLimit` setting (default 32,000) and compacted at
  roughly two-thirds of it, so a model with a 1M window was compacting at around 20k and the
  log filled with compaction notices. The window is now resolved the same way the sidebar
  displays it — manual override, then provider metadata, then the OpenRouter cross-reference,
  then the fallback setting — and pushed into the conversation whenever the model or the
  settings change, so the displayed limit and the enforced limit are the same number.
- A manually entered context limit still takes precedence, as before.

### Changed

- `ConversationManager` no longer reads settings; it takes the window it is given, via
  `setTokenLimit`. `DEFAULT_CONTEXT_LIMIT` is exported from `model-service` rather than
  repeated as a literal in four places.

## [0.6.0] - 2026-10-23

You can now edit one of your own prompts and re-run the turn from there.

### Added

- **Edit and resend.** Your prompts carry an edit control in the message header; clicking
  it turns the message into an inline editor with Save & resend and Cancel. Saving rewinds
  the conversation to that prompt, discards the turn it produced, and runs it again with
  the edited text. Only user messages are editable, and only while nothing is running.

### Changed

- `ConversationManager` gains `rewindFrom(index)`, which drops a message and everything
  after it, recalculates the token count and notifies auto-save. Cutting at a user message
  is safe by construction — that turn's tool calls and results all follow it — so nothing
  is left orphaned.
- The rewind is destructive by design: the branch it replaces is discarded rather than
  kept alongside the new one.
- `tests/baselines/file-sizes.json` records `scripts/ui/simulacrum-sidebar-tab.js` at 1687
  lines (was 1684), for the single action registration this needed.

## [0.5.1] - 2026-10-23

Fixes the agent's answer sometimes appearing twice in the chat log.

### Fixed

- **A reworded repeat of an answer is no longer shown or stored.** The loop requires the
  model to call `end_loop`, so a text-only reply is rejected and the model is asked again
  — and it almost always restates its answer in slightly different words. The only guard
  was an exact string comparison, so the second copy passed through and the answer
  appeared twice. The comparison is now content-based: a reply that merely restates the
  previous one is neither emitted nor stored, and the turn ends rather than asking for a
  third copy. The similarity check only applies to replies of 25 words or more at 75%
  shared words, so short answers are never suppressed.

## [0.5.0] - 2026-10-23

Stopping the agent now hands over the turn instead of discarding it.

### Added

- **Stop produces a handover.** Pressing Stop aborts the run, then immediately emits the
  facts of the turn — how many tool calls ran, how many failed, and each one with its
  outcome — and follows it with a short model-written wrap-up: what was established, what
  changed, what is still open, and the next step. The wrap-up is written with tools
  disabled, on its own abort signal so the stop that triggered it cannot kill it, and
  capped at 20 seconds. It is added to the conversation, so the next message continues
  from it rather than starting cold. If the wrap-up cannot be written, the facts stand
  alone — Stop always produces something.
- **A second press is a hard stop.** While the wrap-up is being written the status reads
  "Summarising…"; pressing Stop again aborts it and keeps the facts.

### Changed

- The cancellation path no longer discards the turn's work behind a bare
  "Process cancelled".

## [0.4.3] - 2026-10-23

Fixes assistant replies that sometimes rendered as raw markdown — a wall of literal `##`
and `**` instead of headings and emphasis.

### Fixed

- **A failed markdown render no longer reaches the log unrendered.** `MarkdownRenderer`
  looked showdown up on `window` at call time and, when it was missing or a conversion
  threw, returned the message text unchanged; because a message's display is computed
  once and cached, the raw `##`/`**` then stayed on screen for the rest of the session.
  It now waits briefly for showdown to load, retries, and on a genuine failure falls back
  to escaped text with line breaks kept, logging which path was taken.
- **A caller-supplied `display` that is still raw markdown is rendered** rather than shown
  verbatim (`resolveDisplay`). HTML displays such as tool cards, and plain results with
  nothing to render, are left untouched.

## [0.4.2] - 2026-10-22

Two fixes to the chat surface.

### Fixed

- **The user's own input is echoed verbatim.** A multi-line prompt was rendered through
  markdown, which treats a single newline as a soft break, so it came back as one
  squashed paragraph. The agent always received the original text with its newlines —
  only the echo was collapsed — but the echo is what you read back, so it now matches
  what you typed: plain text, line breaks and indentation preserved, and escaped, so a
  prompt containing `<` or `&` cannot inject markup. Queued prompts get the same
  treatment.
- **Assistant headings are legible again.** The heading font sizes were not `!important`,
  so a UI-overhaul module restyling `.chat-message` headings to the body size flattened
  the hierarchy — a `## Heading` rendered at exactly the paragraph size under it. The
  message body now has an explicit six-level scale, scoped so it wins, along with
  spacing for lists, blockquotes, rules, tables and links, which had been falling back
  to Foundry's chat-log defaults.

## [0.4.1] - 2026-10-22

Tracks midi-qol v14.6.4 and DAE v14.6.3 (they must move together — midi 14.6.4 requires
DAE ≥14.6.3). Both are fixes: no API, flag or vocabulary change, and the Foundry
(14.369) and dnd5e (6.0.6) floors are unchanged.

### Changed

- **`reference/dae-effect-expiry.md`:** corrected the effect **duration inheritance**
  rule — an applied effect with an expiry event but no duration no longer takes the
  activity's duration (it inherits only when it has neither), an effect with neither now
  takes the activity's expiry event, and an Elapsed-Time effect with no duration takes
  the activity's duration. Recorded the expiry-migration refinements (`combatEnd` yields
  the single expiry slot), the *Round End* off-by-one fix, the *Expiry Mode* fix under
  *Mark Expired*, and the `hasExpiry`/`hasDuration` corrections.
- **`reference/dnd5e-6.0-fields.md`:** noted that midi 14.6.3 shipped the auto-fail/
  success roll fields with three check-activity bugs, all fixed in 14.6.4 (a Stealth
  check ignoring `system.skills.ste.roll.success`, a multi-skill check rolling the first
  skill's ability, and tool checks reading the tool's default ability).

### Notes

- midi-qol 14.6.4 also changes behaviour, with no reference change needed: walls block
  an attack only if they block movement (total cover), a total-cover target can't be
  targeted by a direct-creature activity, and a new optional activity flag
  `flags.midi-qol.targetMustBeSeen` gates "a creature you can see" targeting.

## [0.4.0] - 2026-10-21

Two changes: the agent keeps durable notes that survive a world reset, and the prompt
stops prescribing how to work.

### Added

- **Persistent memory**, in `Data/simulacrum/` — outside the world tree, so a world
  reset does not erase it. Two files: `lessons.md`, durable guidance the agent has
  learned and the user has confirmed, and `history.md`, an append-only log of what was
  built and discovered. Three tools: `read_memory` (read-only), `append_history`
  (written at the agent's discretion) and `write_lesson` (saved only after the user
  confirms). The system prompt now carries a live index of lesson headings and the
  history size, so the agent knows what is retrievable without reading the files.

### Changed

- **The automation prompt is no longer procedural.** The numbered build protocol and
  the nine critical rules are replaced by a statement of what the agent can do and
  what it has to read; the preview → build → test loop survives as an example to
  adapt, not an order to follow. The agent may create and update documents directly,
  and run macros or JavaScript for any module. The one step that stays mandatory is
  explaining how it reads the ability — the dnd5e mechanic and its VTT translation —
  and getting the user's confirmation before writing anything.

### Fixed

- `toolPermissionManager.getPermission` ignored each tool's declared `defaultState`, so
  an unset permission always resolved to ASK. Read-only tools that declare ALLOW
  (`read_reference`, `read_ability_runs`) therefore prompted on every call despite
  being documented as costing no confirmation. It now falls back to `defaultState`.

## [0.3.1] - 2026-10-19

Repinned to the 2026-10-19 module set and refreshed the reference the agent reads.
Foundry minimum rises to **14.369** — midi-qol 14.6.3 and DAE 14.6.2 both require it.

### Changed

- **Required modules moved as a set:** midi-qol v14.6.0 → **v14.6.3**, DAE v14.6.0 →
  **v14.6.2**, CAT 0.1.2 → **0.1.3**, recommended chris-premades 2.1.2 → **2.1.3**. They
  are mutually constrained — midi-qol 14.6.3 needs DAE ≥14.6.2; CAT 0.1.3 needs
  midi-qol ≥14.6.1 and DAE ≥14.6.1; CPR 2.1.3 needs CAT 0.1.3 — so a partial bump fails
  to load.
- **`reference/cpr-generic-config.md` regenerated** from CPR 2.1.3 (56 generics, 297
  settings, up from 51/275). CPR's `summon` generic is gone (moved to CAT) and
  `combatStartItemUses` was removed; several generics were added.
- **`reference/dnd5e-6.0-fields.md`:** documented two silent upstream changes — DAE
  14.6.2's effect sourcing (an applied effect's origin is now the caster's concentration
  effect or the activity, **not its item**; `flags.dae.itemData` is gone) and midi-qol
  14.6.3's auto-fail/success **roll fields**, which replace the deprecated
  `flags.midi-qol.fail/success/min/max.*` keys.
- **`reference/dae-effect-expiry.md`:** corrected the deprecated-special-duration map
  (14.6.2 preserves the source/target distinction and keeps a duration where dnd5e 6
  drops it) and added the 14.6.1/14.6.2 expiry changes (Elapsed Time retired,
  out-of-combat time expiry, `applicationMode`).
- **`reference/cat-macro-flags.md` / `cat-embedded-macros.md`:** CAT 0.1.3 collects
  item- and activity-level macros of the same pass separately, so they no longer replace
  one another; both run.
- module.json Foundry minimum/verified `14.367` → **`14.369`**, dnd5e minimum `6.0.0` →
  `6.0.6`; version and download URL bumped to 0.3.1.

### Fixed

- **`tests/unit/reference-integrity.test.mjs`** resolved `EXTRACTS.json` a fixed one
  level above the fork, which this workspace's layout never matched — so the "generated
  file matches the pinned CPR version" check silently never ran. It now searches upward.
- **`scripts/core/dnd5e/activity-builders.js`** no longer writes `flags.cat.conditionLevel`
  or `flags.cat.failsBy`. Neither key is read by any installed module (verified against
  CAT 0.1.3, CPR 2.1.3, midi-qol 14.6.3 and DAE 14.6.2), so an effect carrying them
  looked configured and did nothing. A "fails by N or more" rider needs a CAT embedded
  macro; a condition level means exhaustion, applied as a `system.attributes.exhaustion`
  change.

## [0.1.0] - 2026-10-12

First release of the Ebonhawk automation-builder fork. Upstream's generalist
campaign-assistant prompt is replaced with an automation-builder domain prompt,
the provider layer is reduced to OpenRouter, and the ability tools are added.

The design is deliberately thin. The module does not know what an ability is. It
writes the documents it is given, records what happens when they are used, and
leaves every judgement about correctness to the agent and the person at the
table. An earlier version enumerated ability shapes — a registry of seventeen
"archetypes", a spec vocabulary, and a scoring layer over eleven claim types —
and all of it is gone, because all of it was the module making decisions that
belong on the other end of the conversation.

### Added

- **editable spec preview**: `preview_spec` returns the parsed ability as a form, drawn from a closed vocabulary (text, number, select, checkbox, group) so a misreading is corrected before any document is written. The form is data, never markup, and `showIf` is evaluated without `eval`. Edited values never round-trip through the model: the spec is stashed under a single-use token and the builder reads it verbatim.
- **`build_ability`**: a write tool. The agent authors the activities and effects as dnd5e data and hands them over; the tool enforces the three properties that are fiddly to get right and get wrong the same way every time — identity by `system.identifier` so a rebuild updates rather than duplicates, wholesale replacement of the authored regions so a narrowing rebuild cannot leave a stale activity behind, and pass-through of spec keys the tool has never heard of so a field the agent knows about is not silently dropped. The item is then marked as needing testing.
- **the testing loop**, which runs in the live world rather than in a harness: `ability-recorder.js` watches a flagged item's use through dnd5e's activity lifecycle hooks (chat output and its rolls, hit point and condition changes on the actor and its targets, errors) and writes what it saw to the item's own flags. `read_ability_runs` returns it for comparison against the stated intent. `confirm_ability` stops the recording. The recorder never judges: it reports facts and says plainly what it could not see.
- **`read_reference`**: the agent's route to material explaining how these modules and this system work — the dnd5e 6.x field guide shipped with this module, and the documentation belonging to modules installed in this world (midi-qol's flag reference and macro guide, DAE, CAT). Read over Foundry's own route rather than from disk, so the answer matches the installed version and works under a sub-path deployment.
- **`reference/dnd5e-6.0-fields.md`**, written by hand against dnd5e 6.x: activity-type and payload pairing, where activities and effects actually live, the fact that a save DC is computed from the activity's `range` and never its `target`, a fixed DC as `dc.formula` with an empty `calculation`, effects landing on failures by default, which bonus paths moved in 6.x, DAE's per-change Replacement setting, where the ecosystem's conventions live, and an explicit list of what was not confirmed.
- `preview_spec`, `build_ability` and `confirm_ability` as permission-gated destructive tools, so "Always Allow" is available after first use.
- shared spec contract (`automation-spec.js`) accepting both flat and nested specs, with correction-guidance errors and warnings for unrecognised keys.
- `scripts/core/dnd5e/` holds the field shapes and the version-specific details that are easy to get wrong silently, in one place rather than rediscovered per request.

### Changed

- **target is dnd5e 6.x** (verified 6.0.6), requiring Foundry 14.367+.
- system prompt replaced with automation-domain blocks (identity, rules, domain model, protocol, feedback, communication); the generalist prompt is retained as a fallback behind the `automationMode` setting. The domain model ends by naming the tools to consult before a field is written.
- provider layer reduced to OpenRouter only.
- packaging rewritten to be dependency-free: the release is built by `tools/build-release.mjs` instead of shelling out to the `zip` binary, which is absent on Windows.

### Fixed

- **activities are written where dnd5e reads them.** dnd5e stores them inside the item's system data as `system.activities`, keyed by id (`ActivitiesField extends MappingField`). The builder was writing a top-level `activities` key as a plain array. Foundry accepts that update and ignores it, so the write succeeded, the array stayed empty, and nothing reported it. Activities are now added with dnd5e's own `item.createActivity(type, data)`, which builds the right class per type, assigns the id and sets sort — and which throws `"<type> not found in CONFIG.DND5E.activityTypes"` for an unknown type, the only loud failure available in this area.
- **a build that lands nothing now fails instead of reporting ok.** An authored region that comes back empty returns `ACTIVITIES_NOT_WRITTEN`, naming what was wanted and what landed. An item that looks built and does nothing was previously indistinguishable from a successful build.
- **the recorder was bound to a hook that does not exist.** `dnd5e.useActivity` appears in no version of dnd5e, midi-qol, DAE, CAT or Chris's Premades — only here, where it was a garbled memory of `dnd5e.preUseActivity`. `Hooks.on` accepts any string, so nothing complained and the recorder was never called: building worked, the item was marked for testing, and nothing was ever recorded. It now binds dnd5e's real activity lifecycle — `preUseActivity` for the before-snapshot (concentration and resource consumption happen right after it), `preCreateUsageMessage` to start recording only once the use is genuinely going ahead, `postCreateUsageMessage` to capture the usage card directly, and `postUseActivity` to note completion.
- **the record was written before the workflow finished.** dnd5e creates the usage card, then runs `_finalizeUsage` — which places measured templates and **awaits the user** — and only then fires `postUseActivity`. The recording was on a fixed 800 ms timer started when the card appeared, so for anything with an area it fired while a template was still being placed: the save, the damage and the applied effect all happened afterwards and were recorded as absent. The record is now written when the workflow reports completing, with the timer demoted to a 20 s ceiling so an abandoned template cannot block every later recording.
- `module.json` defined `description` twice; the first value was dead. Duplicate keys are now rejected at build time.
- `module.json`'s readme, changelog and license URLs pointed at `blob/main`, which is the pristine upstream tracking branch, so they showed upstream's documents rather than this fork's.
- `reference/` was excluded by upstream's `.gitignore` as "reference materials, not part of project". That was right for upstream and wrong here: the release ships the directory and `module.json` advertises the guide by name, so the file was present in the working tree, shipped in every archive, and in no commit.
- a release could be tagged with an archive built before its own changelog was edited. `publish-release.mjs` now refuses to tag when the archive disagrees with the working tree.
- the `package` test tier failed on any machine without `unzip`. It now reads the archive with the bundled reader and verifies the module contract directly.

---

## Upstream history

Everything below this line is inherited from
[Daxiongmao87/simulacrum-foundry](https://github.com/Daxiongmao87/simulacrum-foundry),
which this project is a fork of. It is kept because the fork is built on that work
and the entries record what was fixed on the way here. Upstream's version numbers
are not this project's.

## [1.1.0] - 2026-06-20

### Added

- queue user messages submitted while the agent is processing: prompts are kept in submission order with a visible queued block, run sequentially after each response, and can be discarded individually or all before they run (Fixes #174)

### Fixed

- bound AI requests with a cancellable request timeout so a wedged endpoint cannot stall the tool loop forever; user cancellation now also reaches the compaction summarization call (Fixes #178)
- preserve manual context limit across refresh for the selected model (Fixes #184) (#208)
- preserve composer draft across sidebar re-renders (Fixes #206) (#207)
- derive context-limit from primary meta.n_ctx not OpenRouter basename cross-reference (Fixes #185) (#203)
- typed terminal reasons and correlated loop timeline (#178) (#202)

## [1.1.0] - 2026-06-20

### Fixed

- Fix Foundry v14 sidebar rendering regression
- ui: prevent race condition cascade on message cancellation
- core: fix context compaction overflow and context limit honoring (Fixes #150)
- core: ensure outgoing tool call arguments are valid JSON (Fixes #145)
- persist hasEverIndexed flag to unblock search_assets on reload (#126)

## [1.0.9] - 2026-03-18

### Changed

- refactor: remove maxResults caps and merge compendium management into document tools
- feat: add document copy and move tools
- feat: add compendium create action and rename pack_id to packId
- refactor: move rolling summary injection from getMessages to system prompt
- refactor: migrate correction messages from system to developer role
- style: format codebase with prettier
- fix: sanitize innerHTML usage in sidebar tab (Fixes #112)
- fix: resolve null derefs, dead code, API key leak, and game.packs guards

## [1.0.8] - 2026-02-08

### Changed

- refactor(benchmark): replace webhook with guided Discord sharing flow
- chore(benchmark): switch webhook to public channel, drop review language
- fix(benchmark): note that Discord submissions are reviewed
- chore(benchmark): rotate Discord webhook to private verification channel
- fix(benchmark): increase failure penalty, hide bonus, add Discord link
- docs(tools): rewrite all 16 tool descriptions and parameter descriptions
- refactor(tools): align BaseTool helpers with {content, display} contract
- fix(tools): remove 50-result cap from asset search and browse folders
- fix(prompts): correct pack name in macro list builder
- refactor(ui): simplify sidebar tool display rendering
- fix(settings): invalidate model list on API key/URL change
- fix(tools): add API retry loop with backoff, soften justification enforcement
- feat(logger): human-readable interaction log export
- fix(documents): preserve uuid through toObject() serialization
- refactor(ai): remove max_tokens and temperature from AI client
- feat(tools): split schema tool, add subtype support, fix benchmark scoring
- feat(benchmark): add Grunk Benchmark macro
- chore(build): add JS injection to pack builds, exclude source from zips
- fix(tools): make end_loop response optional, auto-close task tracker
- fix(tools): auto-correct invalid document IDs on creation retry
- fix(tools): validate image URLs and UUIDs non-destructively
- fix(tools): prevent schema mutation, enforce justification, fix parameter ordering
- refactor(tokens): strip transient fields from history, trim prompts, fix UUID-as-documentId
- refactor(ui): rename thinking to processing, fix renderTemplate calls
- refactor(chat): handle cancellation before error logging
- feat(macro-tools): add response parameter and structured result wrapping
- fix(search): guard against null fields parameter in searchDocuments

## [1.0.7] - 2026-02-06

### Changed

- fix: Ollama integration - race conditions, non-blocking validation, token limit consolidation

## [1.0.6] - 2026-02-05

### Changed

- fix(ui): Restore status bar styling and task tracker regressions
- fix(ui): Remove leftover \_monitorStatus call causing crash
- fix(ui): Restore status bar and indexing status logic
- feat: Add context limit handling and sidebar UI refinements
- fix: restore tool justification expand/collapse functionality
- fix: restore model selector logic lost in commit 169670fb
- fix(chat): holistic architecture audit and serialization hardening
- Fix: Synchronize Chat UI and persistence logic
- fix: wrap merged message content in div to prevent text running together
- fix: await async onToolResult callbacks to prevent race conditions in message display
- fix: reset task-tracker to inactive state when stop button pressed
- fix: show truncation notice with release link in Discord announcements

## [1.0.5] - 2026-02-03

### Changed

- fix: preserve textarea content and status area on thinking state change
- fix: extract proper content summary for direct display tools
- fix: prevent raw JSON from rendering for direct display tools
- fix: clear task tracker on process cancel, fix blank card race condition
- fix: swap content/display in document-search for consistency
- feat: migrate asset index to IndexedDB with UI status indicator
- fix: show pending tool cards during execution, update in place with result
- fix: prevent duplicate step separators in task management
- fix: render input part when thinking state changes
- feat: add response parameter to all tools for Gemini compatibility
- feat: add model selector combobox to sidebar header
- refactor: remove Gemini provider, use OpenAI-compatible endpoints only

## [1.0.4] - 2026-02-03

### Changed

- fix: make disabled sidebar tab properly inert and V12 compatibility
- style: refine Discord link appearance in settings
- fix: add Discord link to Foundry settings config, remove dead code
- feat: gray out sidebar tab when AI endpoint not configured or invalid
- Revert "fix: improve endpoint configuration validation logic"
- fix: improve endpoint configuration validation logic
- fix: hide sidebar tab for non-GMs and show config prompt when unconfigured
- feat: add Discord community link to module and settings UI

## [1.0.3] - 2026-01-31

### Changed

- fix: restore system-agnostic CSS for Carolingian UX compatibility

## [1.0.2] - 2026-01-31

### Changed

- docs: add CONTRIBUTING.md with commit conventions
- fix: correct content/display pattern in list_documents tool
- feat: collapse tool justifications by default for completed tools (Ref #105)
- fix: update read registry after successful document update
- docs: suggest 200-line default chunk size for read_tool_output
- docs: reorganize README badges with prominent Discord and FoundryVTT links
- chore: update build info
- feat: show task name in task tracker header
- feat: add step separators and skip justification for self-explanatory tools
- docs: add badges to README
- chore: remove DETERMINISM_THESIS.md
- fix: ensure live and reload chat display are consistent
- fix: improve validation error capture and propagation to AI agent
- fix: restore task summary display in chat
- feat: add dynamic CONFIG-based enum lookup for schema validation
- feat: Add task tracker UI with scroll fade effects
- feat: add indexed asset search with background sync
- fix: correct YAML syntax in changelog generation heredoc
- fix: add explicit tag check to prevent workflow file parsing failures
- fix: prevent duplication of tool loop thoughts in conversation history
- feat: implement schema normalization for document inspection to resolve context overflow issues
- fix: prevent context overflow from large tool outputs
- fix: remove oneOf from execute_macro schema for Anthropic compatibility
- feat: auto-update CHANGELOG.md on release

## [1.0.0] - 2026-01-12

### Added

- Initial public release of Simulacrum: AI Campaign Copilot
- Natural language document management (create, read, update, delete)
- Multi-provider AI support (OpenAI, Google Gemini, Anthropic, and OpenAI-compatible APIs)
- Intelligent tool system for interacting with Foundry VTT documents
- Task tracking and multi-step operation support
- Conversation history with context compaction
- Custom macro-based tool extensions
- JavaScript execution tool for advanced automation
- Comprehensive system prompt for strategic AI behavior
- GM-only access controls
