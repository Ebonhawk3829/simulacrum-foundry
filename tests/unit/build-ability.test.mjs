import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BuildAbilityTool } from '../../scripts/tools/build-ability.js';
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
  'uses.max': 1,
  'uses.period': 'day',
};

/**
 * The activity data a caller would author for Tanglefoot.
 *
 * Handed to the tool rather than derived by it, which is the whole point of the
 * current design: the tool writes documents, the caller decides what the ability
 * is. These are the dnd5e 5.3.3 fields, written the way the system reads them.
 */
const ACTIVITY = {
  activities: [
    {
      type: 'save',
      name: 'Tanglefoot',
      save: { ability: ['str'], dc: { calculation: '', formula: '14' } },
      range: { units: 'ft', value: '30', override: true },
      target: {
        affects: { count: '2', type: 'creature', choice: false, special: '' },
        template: { contiguous: false, stationary: false, units: 'ft', count: '', type: 'sphere', size: '5' },
        override: true,
        prompt: true,
      },
    },
  ],
  effects: [
    {
      name: 'Condition: restrained',
      system: { changes: [{ key: 'macro.StatusEffect', mode: 0, value: 'restrained', priority: 20 }] },
      flags: { 'midi-qol': { OverTime: 'turn=end, saveDC=14, saveAbility=str, saveCount=1-' } },
    },
  ],
};


test('creates an item when no item with the identifier exists', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY })
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
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY })
  );
  const first = actor.items.contents[0];

  const second = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id, 'save.dc': 16 }, ...ACTIVITY })
  );

  const body = JSON.parse(second.content);
  assert.equal(body.action, 'updated');
  assert.equal(actor.items.contents.length, 1, 'rebuilding must not duplicate the item');
  assert.equal(actor.items.contents[0].id, first.id, 'the same item is reused');
});

test('an update replaces the authored activities wholesale', async () => {
  // A narrowing rebuild must not leave a stale activity behind, because a saved
  // ability would then still be reachable from the sheet.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      activities: [{ type: 'save', name: 'First' }, { type: 'utility', name: 'Second' }],
    })
  );
  assert.equal(actor.items.contents[0].system.activities.contents.length, 2);

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      activities: [{ type: 'save', name: 'Only' }],
    })
  );

  const kept = actor.items.contents[0].system.activities.contents;
  assert.equal(kept.length, 1, 'the stale activity is gone');
  assert.equal(kept[0].name, 'Only');
});

test('replaceActivities false adds to the existing activities instead', async () => {
  // For giving a weapon that already has an attack an extra one, replacing
  // wholesale would destroy the weapon.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      activities: [{ type: 'attack', name: 'Slash' }],
    })
  );

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      activities: [{ type: 'damage', name: 'Bonus' }],
      replaceActivities: false,
    })
  );

  const names = actor.items.contents[0].system.activities.contents.map(a => a.name);
  assert.deepEqual(names, ['Slash', 'Bonus']);
});

test('passes activity data through unchanged, whatever it contains', async () => {
  // The tool has no schema of its own for activities. If it filtered or
  // rebuilt them, a field it had not heard of would be silently lost — which is
  // the class of bug this tool exists to avoid.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const activity = {
    type: 'save',
    name: 'Custom',
    save: { ability: ['wis'], dc: { calculation: '', formula: '17' } },
    range: { units: 'ft', value: '60', override: true },
    // Something no builder in this repository would have thought to emit.
    flags: { cat: { macros: { roll: [{ identifier: 'conditionAutoSave' }] } } },
    someFutureField: { nested: true },
  };

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, activities: [activity] })
  );

  const built = actor.items.contents[0].system.activities.contents[0];
  assert.deepEqual(built.save, activity.save);
  assert.deepEqual(built.flags, activity.flags);
  assert.deepEqual(built.someFutureField, activity.someFutureField);
});

test('infers an activity type from its payload when none is given', async () => {
  // dnd5e requires a type and its error does not say which activity was at
  // fault, so a missing one is filled in from the block that is present.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      activities: [
        { name: 'Save', save: { ability: ['dex'], dc: { formula: '12' } } },
        { name: 'Attack', attack: { bonus: '+5' } },
        { name: 'Plain' },
      ],
    })
  );

  const types = actor.items.contents[0].system.activities.contents.map(a => a.type);
  assert.deepEqual(types, ['save', 'attack', 'utility']);
});

test('an explicitly typed activity keeps the type it declared', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      // A healing activity also carries a save block; the declared type wins.
      activities: [{ type: 'heal', healing: { bonus: '2d8' }, save: { ability: ['con'] } }],
    })
  );

  assert.equal(actor.items.contents[0].system.activities.contents[0].type, 'heal');
});

test('writes an effect through unchanged, including its flags', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const effect = {
    name: 'Restrained',
    system: { changes: [{ key: 'macro.StatusEffect', mode: 0, value: 'restrained' }] },
    flags: { 'midi-qol': { OverTime: 'turn=end, saveDC=14, saveAbility=str, saveCount=1-' } },
  };

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY, effects: [effect] })
  );

  const built = actor.items.contents[0].effects.contents[0];
  assert.deepEqual(built.flags, effect.flags);
  assert.deepEqual(built.system.changes, effect.system.changes);
});

test('replaces effects wholesale so a stale one cannot survive', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      ...ACTIVITY,
      effects: [{ name: 'One' }, { name: 'Two' }],
    })
  );
  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      ...ACTIVITY,
      effects: [{ name: 'Only' }],
    })
  );

  const names = actor.items.contents[0].effects.contents.map(e => e.name);
  assert.deepEqual(names, ['Only']);
});

test('passes unknown spec keys through to the system data', async () => {
  // The caller may know a dnd5e field this tool has never heard of. Dropping it
  // would produce an item that looks built but is missing what mattered.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: {
        ...TANGLEFOOT,
        actor: actor.id,
        properties: ['mgc'],
        weight: { value: 2 },
      },
      ...ACTIVITY,
    })
  );

  const system = actor.items.contents[0].system;
  assert.deepEqual(system.properties, ['mgc']);
  assert.deepEqual(system.weight, { value: 2 });
});

test('does not write dotted keys into the system data', async () => {
  // Dotted keys describe something a builder reads, not a system field. Writing
  // them verbatim would put junk keys like "save.dc" on the document.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY })
  );

  const system = actor.items.contents[0].system;
  assert.equal(system.save, undefined);
  assert.equal(system['range.units'], undefined);
});

test('creates the requested item type', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id },
      ...ACTIVITY,
      itemType: 'weapon',
    })
  );

  assert.equal(actor.items.contents[0].type, 'weapon');
});

test('defaults to a feat when no item type is given', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY })
  );

  assert.equal(actor.items.contents[0].type, 'feat');
});

test('writes uses, and a recharge threshold, when the ability is limited', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id, 'uses.max': 3, 'uses.period': 'recharge', 'uses.rechargeMin': 5 },
      ...ACTIVITY,
    })
  );

  const uses = actor.items.contents[0].system.uses;
  assert.equal(uses.max, '3');
  assert.equal(uses.recovery[0].period, 'recharge');
  assert.equal(uses.recovery[0].formula, '5');
});

test('omits uses entirely when the ability is not limited', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { name: 'At Will', actor: actor.id },
      activities: [{ type: 'utility', name: 'Use' }],
    })
  );

  assert.equal(actor.items.contents[0].system.uses, undefined);
});

test('records the notes field on the item description', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, actor: actor.id, notes: 'Cannot target a creature already restrained.' },
      ...ACTIVITY,
    })
  );

  assert.match(actor.items.contents[0].system.description.value, /already restrained/);
});

test('returns the ids the next step needs', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY, effects: [{ name: 'E' }] })
  );

  const body = JSON.parse(result.content);
  assert.ok(body.itemUuid);
  assert.ok(body.actorUuid);
  assert.equal(body.activities.length, 1);
  assert.equal(body.activities[0].type, 'save');
  assert.equal(body.effects.length, 1);
  assert.match(body.next, /test_ability/);
});

test('derives the identifier from the name when none is given', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({ spec: { name: 'Crushing Grip', actor: actor.id }, ...ACTIVITY })
  );

  assert.equal(actor.items.contents[0].system.identifier, 'crushing-grip');
});

test('an explicit identifier survives a rename, so a rename does not orphan it', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, identifier: 'tanglefoot', actor: actor.id },
      ...ACTIVITY,
    })
  );
  const firstId = actor.items.contents[0].id;

  await withFoundry([actor], () =>
    tool.execute({
      spec: { ...TANGLEFOOT, identifier: 'tanglefoot', name: 'Renamed', actor: actor.id },
      ...ACTIVITY,
    })
  );

  assert.equal(actor.items.contents.length, 1);
  assert.equal(actor.items.contents[0].id, firstId);
  assert.equal(actor.items.contents[0].name, 'Renamed');
});

test('a different item type with the same identifier is a separate item', async () => {
  // A weapon and a feat are different documents; upserting across types would
  // silently rewrite the wrong one.
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY, itemType: 'feat' })
  );
  await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY, itemType: 'weapon' })
  );

  assert.equal(actor.items.contents.length, 2);
});

test('rejects an unknown actor with guidance rather than throwing', async () => {
  const tool = new BuildAbilityTool();
  const result = await withFoundry([fakeActor()], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'Nobody' }, ...ACTIVITY })
  );

  assert.equal(result.error.type, 'ACTOR_UNRESOLVED');
});

test('resolves the actor by name when given one', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'Goblin Boss' }, ...ACTIVITY })
  );

  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(actor.items.contents.length, 1);
});

test('reports an ambiguous actor name instead of guessing', async () => {
  const a = fakeActor('actor0000000001', 'Goblin');
  const b = fakeActor('actor0000000002', 'Goblin');
  const tool = new BuildAbilityTool();

  const result = await withFoundry([a, b], () =>
    tool.execute({ spec: { ...TANGLEFOOT, actor: 'Goblin' }, ...ACTIVITY })
  );

  assert.equal(result.error.type, 'ACTOR_UNRESOLVED');
  assert.match(JSON.parse(result.content).error, /matches 2 actors/);
});

test('rejects a missing spec and a missing token with the same named error', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () => tool.execute({}));
  assert.equal(result.error.type, 'VALIDATION_ERROR');
  assert.match(JSON.parse(result.content).error, /previewToken/);
});

test('rejects a spec with no name', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () => tool.execute({ spec: { actor: actor.id } }));
  assert.equal(result.error.type, 'VALIDATION_ERROR');
  assert.match(JSON.parse(result.content).error, /name/);
});

test('accepts a previewToken and uses the stashed spec verbatim', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();
  clearSpecs();

  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id });

  const result = await withFoundry([actor], () => tool.execute({ previewToken: token, ...ACTIVITY }));
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(actor.items.contents[0].name, 'Tanglefoot');
});

test('a preview token is single-use, so a rebuild needs a fresh preview', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();
  clearSpecs();

  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id });
  await withFoundry([actor], () => tool.execute({ previewToken: token, ...ACTIVITY }));

  const second = await withFoundry([actor], () => tool.execute({ previewToken: token, ...ACTIVITY }));
  assert.equal(second.error.type, 'TOKEN_INVALID');
});

test('an unknown token is rejected with the same guidance', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const result = await withFoundry([actor], () =>
    tool.execute({ previewToken: 'nosuchtoken', ...ACTIVITY })
  );

  assert.equal(result.error.type, 'TOKEN_INVALID');
  assert.match(JSON.parse(result.content).next, /preview_spec again/);
});

test('a previewToken takes precedence over a spec argument', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();
  clearSpecs();

  const token = stashSpec({ ...TANGLEFOOT, actor: actor.id });
  await withFoundry([actor], () =>
    tool.execute({
      previewToken: token,
      spec: { name: 'Ignored', actor: actor.id },
      ...ACTIVITY,
    })
  );

  assert.equal(actor.items.contents[0].name, 'Tanglefoot');
});

test('refuses to build for a non-GM', async () => {
  const actor = fakeActor();
  const tool = new BuildAbilityTool();

  const previous = globalThis.game;
  globalThis.game = { user: { isGM: false }, actors: { contents: [actor] }, settings: { get: () => true } };
  try {
    const result = await tool.execute({ spec: { ...TANGLEFOOT, actor: actor.id }, ...ACTIVITY });
    assert.equal(result.error.type, 'PERMISSION_DENIED');
  } finally {
    globalThis.game = previous;
  }
});
