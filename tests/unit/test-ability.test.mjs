import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TestAbilityTool } from '../../scripts/tools/test-ability.js';
import { stashSpec, clearSpecs } from '../../scripts/core/spec-store.js';

/**
 * A tool that does not wait for a workflow to settle. The real delay exists so
 * a chat card and its effects can land before the target's state is read; there
 * is no workflow here to wait for.
 * @returns {TestAbilityTool}
 */
function fastTool() {
  const tool = new TestAbilityTool();
  tool.settleMs = 0;
  return tool;
}

/**
 * A stand-in for a token's actor that records every update so the tests can
 * prove the forcing flags went on and came off again.
 *
 * Returns a TOKEN, because that is what game.user.targets holds; the actor hangs
 * off it. Keeping that shape means the tool's target resolution is exercised for
 * real rather than bypassed.
 */
function fakeTarget({ hp = 30, statuses = [] } = {}) {
  const state = {
    statuses: new Set(statuses),
    hp,
    effects: [],
    updates: [],
  };

  const actor = {
    id: 'target00000001',
    name: 'Test Dummy',
    uuid: 'Actor.target00000001',
    get statuses() {
      return state.statuses;
    },
    get effects() {
      return { contents: state.effects };
    },
    system: { attributes: { hp: { value: state.hp }, exhaustion: 0 } },
    flags: {},
    async update(changes) {
      state.updates.push(changes);
      if (changes['flags.midi-qol.fail.all'] !== undefined) {
        actor.flags['midi-qol'] = { ...(actor.flags['midi-qol'] ?? {}), 'fail.all': true };
        // The ability under test applies the condition when the forced failure
        // takes effect. This mimics what DAE does on a failed save.
        if (!state.statuses.has('restrained')) state.statuses.add('restrained');
      }
      if (changes['flags.midi-qol.success.all'] !== undefined) {
        actor.flags['midi-qol'] = { ...(actor.flags['midi-qol'] ?? {}), 'success.all': true };
        state.statuses.delete('restrained');
      }
      if (changes['system.attributes.hp.value'] !== undefined) {
        state.hp = changes['system.attributes.hp.value'];
        actor.system.attributes.hp.value = changes['system.attributes.hp.value'];
      }
      return actor;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      state.effects = state.effects.filter(e => !ids.includes(e.id));
    },
    async toggleStatusEffect(statusId, { active }) {
      if (active) state.statuses.add(statusId);
      else state.statuses.delete(statusId);
    },
  };

  const token = { id: 'tok1', actor, document: { id: 'tok1' } };
  actor.getActiveTokens = () => [token];
  actor._state = state;
  token._state = state;
  return token;
}

/** An item shaped like the one build_ability produces. */
function fakeItem(overrides = {}) {
  const activity = {
    id: 'act1',
    type: 'save',
    save: {
      ability: { first: () => 'str', [Symbol.iterator]: function* () { yield 'str'; } },
      dc: { formula: '14', value: 14 },
    },
    range: { value: '30', units: 'ft' },
  };

  const effect = {
    id: 'eff1',
    system: { changes: [{ key: 'macro.StatusEffect', mode: 0, value: 'restrained' }] },
    flags: { 'midi-qol': { OverTime: 'turn=end, saveDC=14, saveAbility=str, saveCount=1-' } },
  };

  return {
    id: 'item0000000001',
    name: 'Tanglefoot',
    uuid: 'Actor.target00000001.Item.item0000000001',
    system: {
      identifier: 'tanglefoot',
      uses: { max: '1' },
      activities: { contents: [activity] },
    },
    effects: { contents: [effect] },
    ...overrides,
  };
}

const SPEC = {
  name: 'Tanglefoot',
  identifier: 'tanglefoot',
  'save.ability': 'str',
  'save.dc': 14,
  'range.units': 'ft',
  'range.value': 30,
  condition: 'restrained',
  repeatSave: true,
  'repeatSaveTurn': 'end',
  'uses.max': 1,
};

/**
 * Install the globals the tool reads. `targets` is the live target set, and an
 * empty array is how "the user has targeted nothing" is expressed.
 */
function withFoundry({ item, targets = [], run }) {
  const previous = {
    game: globalThis.game,
    foundry: globalThis.foundry,
    CAT: globalThis.CAT,
    MidiQOL: globalThis.MidiQOL,
  };

  const usedItems = [];

  globalThis.game = {
    user: { isGM: true, targets: new Set(targets) },
    actors: { contents: targets.map(t => t.actor) },
  };
  globalThis.foundry = {
    utils: {
      fromUuidSync: uuid => (uuid === item?.uuid ? item : null),
      randomID: () => 'rnd',
    },
  };
  // CAT's helper is what the tool prefers; record the call rather than rolling.
  globalThis.CAT = {
    api: {
      workflowUtils: {
        syntheticItemRoll: async used => {
          usedItems.push(used);
        },
      },
    },
  };
  globalThis.MidiQOL = {};

  return Promise.resolve()
    .then(() => run({ usedItems }))
    .finally(() => {
      globalThis.game = previous.game;
      globalThis.foundry = previous.foundry;
      globalThis.CAT = previous.CAT;
      globalThis.MidiQOL = previous.MidiQOL;
    });
}

test('asks the user to target a token when nothing is targeted', async () => {
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });

  assert.equal(result.error.type, 'NO_TARGET');
  const body = JSON.parse(result.content);
  assert.match(body.error, /target the token/i);
  assert.equal(body.waitingFor, 'targeted-token');
  assert.match(body.hint, /Call test_ability again/, 'the agent is told how to resume');
});

test('tests against the targeted token, not a created one', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });

  const body = JSON.parse(result.content);
  assert.equal(body.target, 'Test Dummy');
  assert.equal(body.targetUuid, target.actor.uuid);
});

test('returns evidence for both forced outcomes rather than a verdict', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  // The tool reports what happened. It must not hand back a pass/fail judgement,
  // because a closed set of checks would report anything it did not foresee as
  // untested — which penalises the caller for thinking of a better check.
  assert.ok(body.runs, 'both runs are reported');
  assert.ok(body.runs.forcedFail, 'the forced-failure run is reported');
  assert.ok(body.runs.forcedSuccess, 'the forced-success run is reported');
  assert.equal(body.checklist, undefined, 'no checklist of verdicts');
  assert.equal(body.verdict, undefined, 'no overall verdict');
  assert.equal(body.ok, undefined, 'the tool does not declare success or failure');
});

test('states whether the forcing was actually observed', async () => {
  // The fact that makes the evidence usable: if the forcing did not apply, the
  // run was an ordinary roll and "nothing happened" means nothing at all.
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.equal(body.runs.forcedFail.forced, 'fail');
  assert.equal(body.runs.forcedFail.forcingApplied, true, 'the flag was read back off the actor');
  assert.equal(body.runs.forcedSuccess.forced, 'success');
  assert.equal(body.runs.forcedSuccess.forcingApplied, true);
});

test('warns when the outcome could not be forced', async () => {
  // A target that strips the flags stands in for any reason forcing fails to
  // apply. The report must say so rather than letting an unforced result be read
  // as a broken ability.
  const target = fakeTarget();
  const actor = target.actor;
  const realUpdate = actor.update.bind(actor);
  actor.update = async changes => {
    // Accept the update but never let the forcing flag stick.
    if (changes['flags.midi-qol.fail.all'] !== undefined) return actor;
    return realUpdate(changes);
  };

  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.equal(body.runs.forcedFail.forcingApplied, false);
  assert.match(body.caveat, /NOT forced/);
  assert.match(body.caveat, /ordinary dice rolls/);
});

test('reports effects and conditions the run applied', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  // The fake adds "restrained" when the forced failure lands, which is what DAE
  // does on a failed save. That is the observable outcome of the ability.
  assert.deepEqual(body.runs.forcedFail.statusesGained, ['restrained']);
  // The succeeding run must NOT gain the condition, and cannot be observed to
  // remove one either, because the restore between runs already cleared it.
  assert.equal(body.runs.forcedSuccess.statusesGained, undefined);
});

test('reports the item shape so the evidence stands alone', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.equal(body.item.type, 'save');
  assert.deepEqual(body.item.saveAbility, ['str']);
  assert.equal(body.item.dc, 14);
  assert.equal(body.effectsOnItem.length, 1);
  assert.equal(body.effectsOnItem[0].changes[0].key, 'macro.StatusEffect');
});

test('records what the caller expected beside the evidence, without judging it', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () =>
      tool.execute({
        itemUuid: item.uuid,
        expect: { 'target gains restrained': true, 'damage is dealt': 14 },
      }),
  });
  const body = JSON.parse(result.content);

  // Free-form and echoed back verbatim: the caller's own expectations are its
  // business, and validating them against a fixed schema would be the same
  // closed-vocabulary mistake in a different place.
  assert.deepEqual(body.expect, { 'target gains restrained': true, 'damage is dealt': 14 });
});

test('restores the target afterwards, leaving nothing changed', async () => {
  const target = fakeTarget({ hp: 30 });
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });

  const last = target._state.updates[target._state.updates.length - 1];
  assert.equal(last['flags.midi-qol.-=fail'], null, 'the forcing is cleared');
  assert.equal(last['flags.midi-qol.-=success'], null);
  assert.equal(target._state.hp, 30, 'hit points are restored');
  assert.equal(JSON.parse(result.content).teardownFailed, undefined, 'teardown succeeded');
});

test('reports a failed teardown instead of hiding it', async () => {
  // A test that leaves the world altered is worse than no test, so a teardown
  // failure has to surface even though the run itself succeeded.
  const target = fakeTarget({ hp: 30 });
  const actor = target.actor;
  actor.update = async changes => {
    if (changes['flags.midi-qol.-=fail'] !== undefined) throw new Error('update refused');
    return actor;
  };

  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.equal(body.teardownFailed, 'update refused');
  assert.match(body.caveat, /could NOT be fully restored/);
});

test('reports a use that errored rather than treating it as no effect', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const previous = globalThis.CAT;
  try {
    const result = await withFoundry({
      item,
      targets: [target],
      run: async () => {
        globalThis.CAT = {
          api: {
            workflowUtils: {
              syntheticItemRoll: async () => {
                throw new Error('workflow exploded');
              },
            },
          },
        };
        return tool.execute({ itemUuid: item.uuid });
      },
    });
    const body = JSON.parse(result.content);
    assert.equal(body.runs.forcedFail.useFailed, 'workflow exploded');
  } finally {
    globalThis.CAT = previous;
  }
});

test('tells the caller to compare the evidence and ask the user', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.match(body.next, /what you intended/);
  assert.match(body.next, /what they observed/, 'the user perception is part of the loop');
});

test('rejects a uuid that does not resolve', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: 'Actor.x.Item.y' }),
  });

  assert.equal(result.error.type, 'ITEM_NOT_FOUND');
  assert.match(JSON.parse(result.content).next, /build_ability again/);
});

test('rejects a missing uuid before doing anything else', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({}),
  });

  assert.equal(result.error.type, 'VALIDATION_ERROR');
});

test('refuses to run for a non-GM', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const previous = globalThis.game;
  globalThis.game = { user: { isGM: false, targets: new Set([target]) } };
  try {
    const result = await tool.execute({ itemUuid: item.uuid });
    assert.equal(result.error.type, 'PERMISSION_DENIED');
  } finally {
    globalThis.game = previous;
  }
});
