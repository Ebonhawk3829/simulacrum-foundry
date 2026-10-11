import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BuildSaveAbilityTool } from '../../scripts/tools/build-save-ability.js';
import { stashSpec, clearSpecs } from '../../scripts/core/spec-store.js';

/**
 * The builder only touches Foundry through `game.user`, `game.actors`,
 * `foundry.utils.randomID` and the actor's embedded collections, so a small
 * stand-in lets the whole build path run in plain Node. That matters: the
 * validation and the data assembly are where the bugs live, not the write.
 */
function fakeActor(id = 'actor0000000001', name = 'Goblin Boss') {
  const items = [];
  const actor = {
    id,
    name,
    uuid: `Actor.${id}`,
    items: {
      contents: items,
      find: predicate => items.find(predicate),
    },
    createEmbeddedDocuments: async (type, data) => {
      const created = data.map((d, i) => makeItem(`item${i}${'0'.repeat(12)}`, d, actor));
      items.push(...created);
      return created;
    },
  };
  return actor;
}

function makeItem(id, data, actor) {
  const activities = (data.activities ?? []).map((a, i) => ({
    id: `act${i}${'0'.repeat(12)}`,
    ...a,
  }));
  const effects = (data.effects ?? []).map((e, i) => ({
    ...e,
    id: e._id ?? `eff${i}${'0'.repeat(12)}`,
  }));

  const item = {
    id,
    uuid: `Actor.${actor.id}.Item.${id}`,
    name: data.name,
    type: data.type,
    system: {
      ...data.system,
      activities: { contents: activities },
    },
    effects: { contents: effects },
    _updates: [],
    async update(changes) {
      this._updates.push(changes);
      if (changes.name) this.name = changes.name;
      if (changes.system) this.system = { ...this.system, ...changes.system };
      if (changes.activities) {
        this.system.activities.contents = changes.activities.map((a, i) => ({
          id: `act${i}${'0'.repeat(12)}`,
          ...a,
        }));
      }
      if (changes.effects) {
        this.effects.contents = changes.effects.map((e, i) => ({
          ...e,
          id: e._id ?? `eff${i}${'0'.repeat(12)}`,
        }));
      }
      return this;
    },
  };
  return item;
}

/** Install the Foundry globals the builder reads, and restore them afterwards. */
function withFoundry(actors, run) {
  const previous = {
    game: globalThis.game,
    foundry: globalThis.foundry,
  };

  globalThis.game = {
    user: { isGM: true },
    actors: { contents: actors },
  };
  globalThis.foundry = {
    utils: {
      randomID: () => `rnd${Math.random().toString(16).slice(2, 14)}`,
    },
  };

  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.game = previous.game;
      globalThis.foundry = previous.foundry;
    });
}

const TANGLEFOOT = {
  name: 'Tanglefoot',
  'save.ability': 'str',
  'save.dc': 14,
  'range.units': 'ft',
  'range.value': 30,
  'target.type': 'sphere',
  'target.size': 5,
  'target.count': 2,
  condition: 'restrained',
  repeatSave: true,
  'repeatSaveTurn': 'end',
  'repeatSaveAbility': 'str',
  'repeatSaveDc': 14,
  'uses.max': 1,
  'uses.period': 'day',
};

test('creates an item when no item with the identifier exists', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } })
  );

  assert.equal(result.error, undefined, JSON.stringify(result));
  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.equal(body.action, 'created');
  assert.equal(body.identifier, 'tanglefoot');
  assert.equal(actor.items.contents.length, 1);
});

test('updates in place when the identifier already exists, never duplicating', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const first = actor.items.contents[0];

  const second = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id, 'save.dc': 16 } })
  );

  const body = JSON.parse(second.content);
  assert.equal(body.action, 'updated');
  assert.equal(actor.items.contents.length, 1, 'rebuilding must not duplicate the item');
  assert.equal(actor.items.contents[0].id, first.id, 'the same item is reused');
  assert.equal(actor.items.contents[0].system.activities.contents[0].save.dc.formula, '16');
});

test('an update clears a stale activity from a previous build', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const item = actor.items.contents[0];
  // Simulate the previous build having left two activities behind.
  item.system.activities.contents.push({ id: 'stale', type: 'save' });

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));

  assert.equal(
    actor.items.contents[0].system.activities.contents.length,
    1,
    'activities are replaced wholesale so nothing stale survives'
  );
});

test('writes the range on the activity range, not on the area', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const activity = actor.items.contents[0].system.activities.contents[0];

  assert.equal(activity.range.value, '30', 'the ability distance belongs on range');
  assert.equal(activity.range.units, 'ft');
  assert.equal(activity.target.template.size, '5', 'the area size belongs on the target');
  assert.equal(activity.target.template.type, 'sphere');
  assert.equal(activity.target.affects.count, '', 'an area ability has no flat target count');
});

test('an ability with only a target count writes no template', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: {
        name: 'Gaze',
        actor: actor.id,
        'save.ability': 'wis',
        'save.dc': 13,
        'range.units': 'ft',
        'range.value': 60,
        'target.count': 3,
      },
    })
  );

  const activity = actor.items.contents[0].system.activities.contents[0];
  assert.equal(activity.target.affects.count, '3');
  assert.equal(activity.target.affects.type, 'creature');
  assert.equal(activity.target.template.type, '');
});

test('a fixed DC is written as a formula with no calculation, which is what dnd5e reads', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const { save } = actor.items.contents[0].system.activities.contents[0];

  assert.equal(save.dc.formula, '14');
  assert.equal(save.dc.calculation, '');
  assert.deepEqual(save.ability, ['str']);
});

test('writes the save ability as an array, as SetField on 5.3.3 expects', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const { save } = actor.items.contents[0].system.activities.contents[0];
  assert.ok(Array.isArray(save.ability), 'a bare string here would be silently dropped');
});

test('the applied effect is marked onSave false so it only lands on a failed save', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const activity = actor.items.contents[0].system.activities.contents[0];

  assert.equal(activity.effects.length, 1);
  assert.equal(
    activity.effects[0].onSave,
    false,
    'onSave is the applies-on-success switch, not the damage setting'
  );
});

test('the activity effect id matches the effect document id', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const item = actor.items.contents[0];
  const activity = item.system.activities.contents[0];

  assert.equal(
    activity.effects[0]._id,
    item.effects.contents[0].id,
    'a mismatched id means the effect is never applied'
  );
});

test('writes the condition through a DAE macro.StatusEffect change', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const effect = actor.items.contents[0].effects.contents[0];

  const change = effect.system.changes.find(c => c.key === 'macro.StatusEffect');
  assert.ok(change, 'conditions are applied with macro.StatusEffect, not a statuses.* key');
  assert.equal(change.value, 'restrained');
  assert.equal(change.mode, 0, 'the CUSTOM mode');
});

test('writes the repeating save as a midi-qol OverTime flag on the effect', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const effect = actor.items.contents[0].effects.contents[0];

  const overTime = effect.flags['midi-qol'].OverTime;
  assert.ok(overTime, 'the repeat-save lives on the effect as a flag');
  assert.match(overTime, /turn=end/, 'the ability re-saves at the end of the turn');
  assert.match(overTime, /saveDC=14/);
  assert.match(overTime, /saveAbility=str/);
  assert.match(overTime, /saveCount=1-/, 'a success must remove the effect');
});

test('omits the repeating save when the spec does not ask for one', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: {
        name: 'Simple Hex',
        actor: actor.id,
        'save.ability': 'wis',
        'save.dc': 12,
        condition: 'frightened',
      },
    })
  );

  const effect = actor.items.contents[0].effects.contents[0];
  assert.equal(effect.flags['midi-qol'], undefined);
  assert.equal(effect.flags.cat.identifier, 'simple-hex', 'CAT needs an identifier to find it');
});

test('creates no effect when there is neither a condition nor a repeat save', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: {
        name: 'Pure Damage',
        actor: actor.id,
        'save.ability': 'dex',
        'save.dc': 15,
        'damage.formula': '8d6',
        'damage.type': 'fire',
        'damage.onSave': 'half',
      },
    })
  );

  const item = actor.items.contents[0];
  assert.equal(item.effects.contents.length, 0);
  assert.equal(item.system.activities.contents[0].effects.length, 0);

  const damage = item.system.activities.contents[0].damage;
  assert.equal(damage.onSave, 'half');
  assert.equal(damage.parts[0].bonus, '8d6');
  assert.deepEqual(damage.parts[0].types, ['fire']);
});

test('damage on a save uses the activity vocabulary, not "full"', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({
      spec: {
        name: 'Zap',
        actor: actor.id,
        'save.ability': 'dex',
        'save.dc': 12,
        'damage.formula': '2d6',
        'damage.type': 'lightning',
      },
    })
  );

  assert.equal(result.error, undefined, JSON.stringify(result));
  const damage = actor.items.contents[0].system.activities.contents[0].damage;
  assert.equal(damage.onSave, 'half', 'the default when the description does not say');
});

test('writes limited uses and their recovery', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () => tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } }));
  const { uses } = actor.items.contents[0].system;

  assert.equal(uses.max, '1');
  assert.deepEqual(uses.recovery, [{ period: 'day', type: 'recoverAll' }]);
});

test('omits uses entirely when the ability is not limited', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { name: 'At Will', actor: actor.id, 'save.ability': 'dex', 'save.dc': 11 },
    })
  );

  assert.equal(actor.items.contents[0].system.uses, undefined);
});

test('rejects an unknown actor with guidance rather than throwing', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'Nobody' } })
  );

  assert.ok(result.error);
  assert.equal(result.error.type, 'ACTOR_UNRESOLVED');
  const body = JSON.parse(result.content);
  assert.match(body.error, /No actor matched "Nobody"/);
  assert.match(body.error, /Ask the user/, 'the guidance says what to do next');
});

test('resolves the actor by name when given one', async () => {
  const actor = fakeActor('actor0000000001', 'Goblin Boss');
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'goblin boss' } })
  );

  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(actor.items.contents.length, 1);
});

test('reports an ambiguous actor name instead of guessing', async () => {
  const a = fakeActor('actor0000000001', 'Goblin');
  const b = fakeActor('actor0000000002', 'Goblin');
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([a, b], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'Goblin' } })
  );

  assert.equal(result.error.type, 'ACTOR_UNRESOLVED');
  assert.match(JSON.parse(result.content).error, /matches 2 actors/);
});

test('rejects a spec with a bad enum and names the field', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id, 'save.ability': 'strength' } })
  );

  assert.equal(result.error.type, 'SPEC_VALIDATION_ERROR');
  const body = JSON.parse(result.content);
  assert.match(body.errors[0], /"save\.ability" must be one of/);
});

test('rejects a missing spec and a missing token with the same named error', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () => tool.execute({}));
  assert.equal(result.error.type, 'VALIDATION_ERROR');
});

test('accepts a previewToken and uses the stashed spec verbatim', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();
  clearSpecs();

  // What the user actually confirmed in the preview panel differs from the
  // agent's original reading: the DC was corrected to 16.
  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id, 'save.dc': 16 });

  const result = await withFoundry([actor], () => tool.execute({ previewToken: token }));

  assert.equal(result.error, undefined, JSON.stringify(result));
  const activity = actor.items.contents[0].system.activities.contents[0];
  assert.equal(activity.save.dc.formula, '16', 'the user correction is what gets built');
});

test('a preview token is single-use, so a rebuild needs a fresh preview', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();
  clearSpecs();

  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id });

  await withFoundry([actor], () => tool.execute({ previewToken: token }));
  const second = await withFoundry([actor], () => tool.execute({ previewToken: token }));

  assert.equal(second.error.type, 'TOKEN_INVALID');
  assert.match(JSON.parse(second.content).next, /preview_spec again/);
});

test('an unknown token is rejected with the same guidance', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();
  clearSpecs();

  const result = await withFoundry([actor], () => tool.execute({ previewToken: 'nosuchtoken' }));
  assert.equal(result.error.type, 'TOKEN_INVALID');
});

test('a previewToken takes precedence over a spec argument', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();
  clearSpecs();

  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id, 'save.dc': 18 });

  await withFoundry([actor], () =>
    tool.execute({ previewToken: token, spec: { ...TANGLEFOOT, actor: actor.id, 'save.dc': 5 } })
  );

  assert.equal(
    actor.items.contents[0].system.activities.contents[0].save.dc.formula,
    '18',
    'the confirmed values win over a discarded spec'
  );
});

test('refuses to build for a non-GM', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const previous = globalThis.game;
  globalThis.game = { user: { isGM: false }, actors: { contents: [actor] } };
  try {
    const result = await tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } });
    assert.equal(result.error.type, 'PERMISSION_DENIED');
  } finally {
    globalThis.game = previous;
  }
});

test('reports warnings alongside a successful build', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id, 'weird.nuance': 'not automated' },
    })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true, 'a warning must not block the build');
  assert.equal(body.warnings.length, 1);
  assert.match(body.warnings[0], /weird\.nuance/);
});

test('records the notes field on the item description', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id, notes: 'Cannot target a creature already restrained.' },
    })
  );

  assert.match(
    actor.items.contents[0].system.description.value,
    /Cannot target a creature already restrained\./,
    'notes are the escape hatch for a nuance with no field'
  );
});

test('returns the uuids the next step needs', async () => {
  const actor = fakeActor();
  const tool = new BuildSaveAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id } })
  );
  const body = JSON.parse(result.content);

  assert.ok(body.itemUuid);
  assert.match(body.activityUuid, /\.Activity\./);
  assert.match(body.effectUuid, /\.ActiveEffect\./);
  assert.match(body.next, /test_ability/, 'the result tells the agent what to do next');
});
