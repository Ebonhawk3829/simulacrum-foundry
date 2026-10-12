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

test('reports every claim from the spec as a checklist entry', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });
  const body = JSON.parse(result.content);

  assert.ok(Array.isArray(body.checklist));
  assert.ok(body.checklist.length >= 6);
  for (const entry of body.checklist) {
    assert.equal(typeof entry.claim, 'string');
    assert.ok('pass' in entry, 'every entry states pass, fail or untested');
  }
});

test('a correct build passes its claims', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });
  const body = JSON.parse(result.content);

  const failed = body.checklist.filter(c => c.pass === false);
  assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
  assert.equal(body.summary.passed, body.summary.total);
});

test('the failing-save run actually had the failure forced', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });

  const forced = target._state.updates.filter(u => u['flags.midi-qol.fail.all'] !== undefined);
  assert.ok(forced.length >= 1, 'the test must force the outcome or it depends on dice');
});

test('restores the target afterwards, leaving nothing changed', async () => {
  const target = fakeTarget({ hp: 30 });
  const item = fakeItem();
  const tool = fastTool();

  await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });

  // The last update must clear the forcing flags.
  const last = target._state.updates[target._state.updates.length - 1];
  assert.equal(last['flags.midi-qol.-=fail'], null);
  assert.equal(last['flags.midi-qol.-=success'], null);
  assert.equal(target._state.hp, 30, 'hit points are restored');

  const stillRestrained = target._state.updates.some(
    u => u['system.attributes.hp.value'] === 30
  );
  assert.ok(stillRestrained, 'hp is written back');
});

test('restores the target even when the ability use throws', async () => {
  const target = fakeTarget();
  const item = fakeItem({
    system: {
      identifier: 'tanglefoot',
      uses: { max: '1' },
      activities: {
        contents: [
          {
            id: 'act1',
            type: 'save',
            save: { ability: { first: () => 'str' }, dc: { formula: '14' } },
            range: { value: '30', units: 'ft' },
          },
        ],
      },
    },
  });
  const tool = fastTool();

  const previous = globalThis.CAT;
  try {
    await withFoundry({
      item,
      targets: [target],
      run: async () => {
        // Break the use path, then act as if it had thrown mid-test.
        globalThis.CAT = {
          api: {
            workflowUtils: {
              syntheticItemRoll: async () => {
                throw new Error('workflow exploded');
              },
            },
          },
        };
        return tool.execute({ itemUuid: item.uuid, spec: SPEC });
      },
    });
  } finally {
    globalThis.CAT = previous;
  }

  const last = target._state.updates[target._state.updates.length - 1];
  assert.equal(last['flags.midi-qol.-=fail'], null, 'teardown is unconditional');
});

test('half damage is untested when the successful save cost nothing but the failure never landed either', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  // The spec claims damage but the built item deals none, so neither run spends
  // hit points and the comparison cannot be made.
  const result = await withFoundry({
    item,
    targets: [target],
    run: () =>
      tool.execute({
        itemUuid: item.uuid,
        spec: {
          ...SPEC,
          'damage.formula': '3d6',
          'damage.type': 'bludgeoning',
          'damage.onSave': 'half',
        },
      }),
  });
  const body = JSON.parse(result.content);

  const damageClaim = body.checklist.find(c => c.claim.includes('fewer'));
  assert.ok(damageClaim, 'the half-damage claim should be present');
  assert.equal(damageClaim.pass, null, 'unverified must never read as passing');
  assert.ok(damageClaim.note);
});

test('damage taken on a failed save is measured against the target hit points', async () => {
  const target = fakeTarget({ hp: 30 });
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () =>
      tool.execute({
        itemUuid: item.uuid,
        spec: { ...SPEC, 'damage.formula': '3d6', 'damage.type': 'bludgeoning' },
      }),
  });
  const body = JSON.parse(result.content);

  const damageClaim = body.checklist.find(c => c.claim.includes('costs the target hit points'));
  assert.ok(damageClaim);
  assert.equal(damageClaim.pass, false, 'the built ability deals no damage, so the claim fails');
  assert.equal(damageClaim.actual, 'none lost');
});

test('a failed claim tells the agent to fix the spec and retry once', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: { ...SPEC, 'save.dc': 20 } }),
  });
  const body = JSON.parse(result.content);

  assert.equal(body.ok, false);
  assert.ok(body.failingClaims.length >= 1);
  const dcClaim = body.failingClaims.find(c => c.claim.includes('DC'));
  assert.equal(dcClaim.expected, '20');
  assert.equal(dcClaim.actual, '14');
  assert.match(body.next, /build_ability again/);
  assert.match(body.next, /same claim fails twice/, 'the two-attempt rule is restated');
});

test('a build with a missing activity fails that claim rather than throwing', async () => {
  const target = fakeTarget();
  const item = fakeItem({
    system: { identifier: 'tanglefoot', activities: { contents: [] } },
  });
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });
  const body = JSON.parse(result.content);

  const claim = body.checklist.find(c => c.claim.includes('save activity'));
  assert.ok(claim, 'the activity claim should be present');
  assert.equal(claim.pass, false);
  assert.match(claim.actual, /no activity/);
});

test('rejects a uuid that does not resolve', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: 'Actor.x.Item.y', spec: SPEC }),
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
    run: () => tool.execute({ spec: SPEC }),
  });

  assert.equal(result.error.type, 'VALIDATION_ERROR');
});

test('recovers the spec from a preview token so claims match what was confirmed', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();
  clearSpecs();

  // What the user confirmed differs from the item as built, so the DC claim fails.
  const token = stashSpec({ ...SPEC, 'save.dc': 22 });

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, previewToken: token }),
  });
  const body = JSON.parse(result.content);

  const dcClaim = body.checklist.find(c => c.claim.includes('DC'));
  assert.equal(dcClaim.expected, '22');
  assert.equal(dcClaim.pass, false);
});

test('the preview token survives a test, because the builder still needs it', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const token = stashSpec({ ...SPEC, 'save.dc': 22 });

  const first = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, previewToken: token }),
  });
  const second = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, previewToken: token }),
  });

  const firstBody = JSON.parse(first.content);
  const secondBody = JSON.parse(second.content);
  assert.equal(firstBody.checklist.length, secondBody.checklist.length);
  const dcClaim = secondBody.checklist.find(c => c.claim.includes('DC'));
  assert.equal(dcClaim.expected, '22', 'peeking does not consume the token');
});

test('falls back to the item itself when no spec is supplied', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid }),
  });
  const body = JSON.parse(result.content);

  assert.ok(body.checklist.length > 0, 'a test is still useful without the original spec');
  assert.ok(body.checklist.some(c => c.claim.includes('str')), 'the ability is read off the item');
  assert.ok(body.checklist.some(c => c.claim.includes('restrained')), 'the condition is read off the effect');
});

test('the report names the next step for the agent', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const result = await withFoundry({
    item,
    targets: [target],
    run: () => tool.execute({ itemUuid: item.uuid, spec: SPEC }),
  });
  const body = JSON.parse(result.content);

  assert.ok(body.next, 'every report tells the agent what to do next');
  assert.ok(body.verdict);
});

test('refuses to run for a non-GM', async () => {
  const target = fakeTarget();
  const item = fakeItem();
  const tool = fastTool();

  const previous = globalThis.game;
  globalThis.game = { user: { isGM: false, targets: new Set([target]) } };
  try {
    const result = await tool.execute({ itemUuid: item.uuid, spec: SPEC });
    assert.equal(result.error.type, 'PERMISSION_DENIED');
  } finally {
    globalThis.game = previous;
  }
});
