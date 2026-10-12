# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
