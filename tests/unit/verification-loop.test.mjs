import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  VERIFICATION_FLAG,
  clearNeedsTesting,
  getVerificationState,
  markNeedsTesting,
  needsTesting,
  recordRun,
  shouldRecord,
} from '../../scripts/core/verification-state.js';

import { ConfirmAbilityTool } from '../../scripts/tools/confirm-ability.js';
import { ReadAbilityRunsTool } from '../../scripts/tools/read-ability-runs.js';

/** An item that behaves enough like a Foundry document for this lifecycle. */
function makeItem(name = 'Tanglefoot', system = {}) {
  const item = {
    name,
    uuid: `Actor.gm1.Item.${name.toLowerCase()}`,
    flags: {},
    system,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope][key] = value;
      return this;
    },
  };
  return item;
}

/** Install the globals these modules reach for. */
function withFoundry(items, run, { isGM = true } = {}) {
  const previous = { game: globalThis.game, foundry: globalThis.foundry };

  globalThis.game = { user: { id: 'gm1', isGM } };
  globalThis.foundry = {
    utils: {
      fromUuidSync: uuid => items.find(i => i.uuid === uuid) ?? null,
    },
  };

  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.game = previous.game;
      globalThis.foundry = previous.foundry;
    });
}

// ---------------------------------------------------------------------------
// The flag lifecycle
// ---------------------------------------------------------------------------

test('an untouched item has no verification state', () => {
  const item = makeItem();
  assert.equal(getVerificationState(item), null);
  assert.equal(needsTesting(item), false);
  assert.equal(shouldRecord(item), false);
});

test('marking an item writes the intent alongside the mark', async () => {
  // The intent is what the record is compared against later. A run without an
  // expectation is a number with no meaning.
  const item = makeItem('Tanglefoot', { identifier: 'tanglefoot' });
  const state = await withFoundry([item], () =>
    markNeedsTesting(item, { intent: 'Restrain the target', expect: { saveDC: 13 } })
  );

  assert.equal(state.status, 'pending');
  assert.equal(state.identifier, 'tanglefoot');
  assert.equal(state.intent, 'Restrain the target');
  assert.deepEqual(state.expect, { saveDC: 13 });
  assert.equal(state.markedBy, 'gm1');
  assert.deepEqual(state.runs, []);
  assert.ok(needsTesting(item));
  assert.ok(shouldRecord(item));
});

test('the flag lives in this module scope, so it cannot collide', () => {
  assert.equal(VERIFICATION_FLAG, 'simulacrum.verification');
});

test('recording a run appends and updates the last timestamp', async () => {
  const item = makeItem();
  await withFoundry([item], async () => {
    await markNeedsTesting(item, { intent: 'x' });
    await recordRun(item, { at: '2026-01-01T00:00:00Z', messages: ['hit'] });
    const state = await recordRun(item, { at: '2026-01-01T00:01:00Z', messages: ['miss'] });

    assert.equal(state.runs.length, 2);
    assert.equal(state.runs[1].messages[0], 'miss');
    assert.equal(state.lastRunAt, '2026-01-01T00:01:00Z');
  });
});

test('an untracked item is not recorded, so the log stays readable', async () => {
  const item = makeItem();
  const result = await withFoundry([item], () => recordRun(item, { at: 'now' }));
  assert.equal(result, null);
  assert.equal(getVerificationState(item), null);
});

test('the run history is capped so a long-lived item cannot grow forever', async () => {
  const item = makeItem();
  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    for (let i = 0; i < 25; i += 1) await recordRun(item, { at: `run-${i}` });

    const state = getVerificationState(item);
    assert.equal(state.runs.length, 20);
    assert.equal(state.runs[0].at, 'run-5', 'the oldest runs are dropped');
    assert.equal(state.runs.at(-1).at, 'run-24');
  });
});

test('confirming keeps the runs by default', async () => {
  // The runs are the evidence behind the decision. Discarding them would leave
  // nothing to read if the ability misbehaves later.
  const item = makeItem();
  await withFoundry([item], async () => {
    await markNeedsTesting(item, { intent: 'x' });
    await recordRun(item, { at: 'run-1' });
    const state = await clearNeedsTesting(item, { summary: 'worked on a goblin' });

    assert.equal(state.status, 'confirmed');
    assert.equal(state.runs.length, 1);
    assert.equal(state.summary, 'worked on a goblin');
    assert.ok(state.confirmedAt);
    assert.equal(needsTesting(item), false);
    assert.equal(shouldRecord(item), false, 'a confirmed ability stops being recorded');
  });
});

test('confirming can discard the runs when asked', async () => {
  const item = makeItem();
  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    await recordRun(item, { at: 'run-1' });
    const state = await clearNeedsTesting(item, { keepRuns: false });
    assert.deepEqual(state.runs, []);
  });
});

test('a rebuild reopens a confirmed ability', async () => {
  // Confirming must not be a dead end. Rebuilding the item is the natural way to
  // say "this changed, look at it again", and it should start recording.
  const item = makeItem();
  await withFoundry([item], async () => {
    await markNeedsTesting(item, { intent: 'first attempt' });
    await clearNeedsTesting(item, { summary: 'looked fine' });
    assert.equal(needsTesting(item), false);

    await markNeedsTesting(item, { intent: 'second attempt' });
    assert.ok(needsTesting(item));
    const state = getVerificationState(item);
    assert.equal(state.intent, 'second attempt');
    assert.deepEqual(state.runs, [], 'the counter starts clean, so the next run is unambiguous');
  });
});

// ---------------------------------------------------------------------------
// read_ability_runs
// ---------------------------------------------------------------------------

test('reading runs before the ability has been used says so plainly', async () => {
  const item = makeItem();
  const tool = new ReadAbilityRunsTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item, { intent: 'Restrain' });
    const result = await tool.execute({ itemUuid: item.uuid });
    const body = JSON.parse(result.content);

    assert.equal(body.ok, true);
    assert.equal(body.runCount, 0);
    assert.match(body.next, /Ask the user to use it in play/);
    assert.match(body.next, /Do not guess whether it works/);
  });
});

test('reading runs returns the intent to compare against', async () => {
  const item = makeItem();
  const tool = new ReadAbilityRunsTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item, { intent: 'Restrain', expect: { saveDC: 13 } });
    await recordRun(item, { at: 'now', messages: ['Goblin failed the save'] });

    const body = JSON.parse((await tool.execute({ itemUuid: item.uuid })).content);
    assert.equal(body.intent, 'Restrain');
    assert.deepEqual(body.expect, { saveDC: 13 });
    assert.equal(body.runCount, 1);
    assert.match(body.next, /Compare these runs against your intent/);
    assert.match(body.next, /call confirm_ability/);
  });
});

test('a confirmed ability reports its runs as history, not as live', async () => {
  const item = makeItem();
  const tool = new ReadAbilityRunsTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    await recordRun(item, { at: 'now' });
    await clearNeedsTesting(item, { summary: 'verified' });

    const body = JSON.parse((await tool.execute({ itemUuid: item.uuid })).content);
    assert.equal(body.status, 'confirmed');
    assert.match(body.next, /recording has stopped/);
    assert.match(body.next, /Rebuild it to start recording again/);
  });
});

test('an untracked item is reported as untracked', async () => {
  const item = makeItem();
  const tool = new ReadAbilityRunsTool();
  const result = await withFoundry([item], () => tool.execute({ itemUuid: item.uuid }));
  assert.equal(result.error.type, 'NOT_TRACKED');
});

test('a deleted item is reported rather than throwing', async () => {
  const tool = new ReadAbilityRunsTool();
  const result = await withFoundry([], () => tool.execute({ itemUuid: 'Actor.gone.Item.gone' }));
  assert.equal(result.error.type, 'ITEM_NOT_FOUND');
  assert.match(JSON.parse(result.content).next, /build_ability/);
});

test('limit returns only the most recent runs', async () => {
  const item = makeItem();
  const tool = new ReadAbilityRunsTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    for (let i = 0; i < 5; i += 1) await recordRun(item, { at: `run-${i}` });

    const body = JSON.parse((await tool.execute({ itemUuid: item.uuid, limit: 2 })).content);
    assert.equal(body.runCount, 5, 'the total is still reported');
    assert.equal(body.runs.length, 2);
    assert.equal(body.runs.at(-1).at, 'run-4');
  });
});

// ---------------------------------------------------------------------------
// confirm_ability
// ---------------------------------------------------------------------------

test('confirming stops recording and says what to tell the user', async () => {
  const item = makeItem();
  const tool = new ConfirmAbilityTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    await recordRun(item, { at: 'now' });

    const body = JSON.parse((await tool.execute({ itemUuid: item.uuid, summary: 'worked' })).content);
    assert.equal(body.status, 'confirmed');
    assert.equal(body.runsKept, 1);
    assert.match(body.next, /recording has stopped/);
    assert.equal(needsTesting(item), false);
    assert.equal(getVerificationState(item).summary, 'worked');
  });
});

test('confirming twice is a no-op rather than an error', async () => {
  // The agent may lose track of this across a long conversation, and answering
  // "already done" is more useful than failing.
  const item = makeItem();
  const tool = new ConfirmAbilityTool();

  await withFoundry([item], async () => {
    await markNeedsTesting(item);
    await tool.execute({ itemUuid: item.uuid });
    const body = JSON.parse((await tool.execute({ itemUuid: item.uuid })).content);

    assert.equal(body.ok, true);
    assert.equal(body.alreadyConfirmed, true);
    assert.match(body.next, /Nothing changed/);
  });
});

test('confirming requires a GM', async () => {
  const item = makeItem();
  const tool = new ConfirmAbilityTool();

  await withFoundry(
    [item],
    async () => {
      await markNeedsTesting(item);
      const result = await tool.execute({ itemUuid: item.uuid });
      assert.equal(result.error.type, 'PERMISSION_DENIED');
      assert.equal(needsTesting(item), true, 'the mark survives a refused confirmation');
    },
    { isGM: false }
  );
});

test('confirming an untracked item is refused', async () => {
  const item = makeItem();
  const tool = new ConfirmAbilityTool();
  const result = await withFoundry([item], () => tool.execute({ itemUuid: item.uuid }));
  assert.equal(result.error.type, 'NOT_TRACKED');
});

test('confirming warns when the history will be discarded', async () => {
  const tool = new ConfirmAbilityTool();
  const details = await tool.getConfirmationDetails({ discardRuns: true });
  assert.match(details.details, /will also be discarded/);

  const kept = await tool.getConfirmationDetails({});
  assert.match(kept.details, /history is kept/);
});
