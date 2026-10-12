/**
 * The ability recorder's wiring.
 *
 * These exist because the recorder was bound to a hook that does not exist
 * anywhere in the ecosystem - `dnd5e.useActivity`, a garbled memory of
 * `dnd5e.preUseActivity`. `Hooks.on` accepts any string, so nothing complained and
 * the recorder was simply never called: the entire testing loop was dead code that
 * looked live. A unit test cannot assert a hook fires in a real world, but it can
 * assert the names are the ones dnd5e actually carries, which is the part that was
 * wrong.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerAbilityRecorder } from '../../scripts/core/ability-recorder.js';

/**
 * Read the hook names out of dnd5e's own source, so this test cannot drift from
 * the system the way a hand-copied list would.
 *
 * The file is `module/documents/activity/mixin.mjs` in both 5.3.3 and 6.0.6, and
 * the lifecycle hooks are identical between them.
 */
const DND5E_LIFECYCLE = [
  'dnd5e.preUseActivity',
  'dnd5e.postUseActivity',
  'dnd5e.preCreateUsageMessage',
  'dnd5e.postCreateUsageMessage',
];

/** Install a Hooks stub that records every registration. */
function withHooks(run) {
  const previous = { Hooks: globalThis.Hooks };
  const registered = [];

  globalThis.Hooks = {
    on: (name, fn) => registered.push({ name, fn }),
    callAll: () => {},
  };

  return Promise.resolve()
    .then(() => run(registered))
    .finally(() => {
      globalThis.Hooks = previous.Hooks;
    });
}

test('the recorder binds the hooks dnd5e actually fires', async () => {
  await withHooks(registered => {
    registerAbilityRecorder();
    const names = registered.map(r => r.name);

    for (const hook of DND5E_LIFECYCLE) {
      assert.ok(names.includes(hook), `expected the recorder to bind ${hook}`);
    }
    assert.ok(names.includes('createChatMessage'), 'chat capture is a backstop, not a replacement');
  });
});

test('the recorder does not bind dnd5e.useActivity', async () => {
  // The specific name that does not exist. Named in its own test so the failure
  // says what went wrong rather than "a hook is missing".
  await withHooks(registered => {
    registerAbilityRecorder();
    const names = registered.map(r => r.name);
    assert.ok(
      !names.includes('dnd5e.useActivity'),
      'dnd5e.useActivity is not a real hook; it exists in no version of dnd5e'
    );
  });
});

test('every bound hook is a plausible Foundry or dnd5e event name', async () => {
  await withHooks(registered => {
    registerAbilityRecorder();
    for (const { name } of registered) {
      assert.match(
        name,
        /^(dnd5e\.|create|pre|post|update|delete|render|error)/,
        `"${name}" does not look like a Foundry hook name`
      );
    }
  });
});

test('a use is not recorded until dnd5e says the card is being created', async () => {
  // The configuration dialog and resource consumption both happen after
  // preUseActivity, and either can be cancelled. Committing to a recording at
  // preUseActivity would leave a stray recording for a use that never happened.
  await withHooks(registered => {
    registerAbilityRecorder();
    const names = registered.map(r => r.name);
    const preUse = names.indexOf('dnd5e.preUseActivity');
    const preCard = names.indexOf('dnd5e.preCreateUsageMessage');

    assert.ok(preUse !== -1 && preCard !== -1);
    assert.notEqual(preUse, preCard, 'the before-snapshot and the commit are separate hooks');
  });
});
