import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  registerArchetype,
  getArchetype,
  listArchetypes,
  archetypeIds,
  describeArchetypesForPrompt,
} from '../../scripts/core/archetypes/registry.js';
import { PreviewSpecTool } from '../../scripts/tools/preview-spec.js';
import { BuildAbilityTool } from '../../scripts/tools/build-ability.js';
import { getAutomationPromptBlocks } from '../../scripts/core/domain-prompt.js';

test('every registered archetype supplies what the system relies on', () => {
  const archetypes = listArchetypes();
  assert.ok(archetypes.length > 0, 'at least one archetype is registered');

  for (const archetype of archetypes) {
    assert.ok(archetype.id, 'has an id');
    assert.equal(typeof archetype.build, 'function', `${archetype.id} has build()`);
    assert.equal(typeof archetype.claims, 'function', `${archetype.id} has claims()`);
    assert.ok(archetype.spec, `${archetype.id} declares a spec contract`);
    assert.ok(Array.isArray(archetype.required), `${archetype.id} declares required paths`);
    assert.ok(archetype.activityType, `${archetype.id} names its activity type`);
  }
});

test('registering a duplicate or malformed archetype fails loudly', () => {
  // Silence is the failure mode that matters: an archetype that quietly fails to
  // register is one the prompt will not mention and the model will not use.
  assert.throws(() => registerArchetype({ id: 'save', build() {}, claims() {} }), /already registered/);
  assert.throws(() => registerArchetype({ build() {}, claims() {} }), /needs an "id"/);
  assert.throws(() => registerArchetype({ id: 'no-build', claims() {} }), /missing its build/);
  assert.throws(() => registerArchetype({ id: 'no-claims', build() {} }), /missing its claims/);
});

test('the prompt names only archetypes that can actually be built', () => {
  // This is the regression guard for the defect that shipped in 0.1.0: the
  // prompt named six archetypes while one builder existed, so the model was
  // told to call four tools that were never written. A prompt is only a string,
  // so nothing failed until a live session tried it.
  const prompt = getAutomationPromptBlocks().join('\n\n');
  const registered = new Set(archetypeIds());

  // Every "Archetype: "x"" the prompt advertises must exist in the registry.
  const advertised = [...prompt.matchAll(/Archetype: "([^"]+)"/g)].map(m => m[1]);
  assert.ok(advertised.length > 0, 'the prompt advertises archetypes');
  for (const id of advertised) {
    assert.ok(registered.has(id), `the prompt advertises "${id}", which is not registered`);
  }
  assert.equal(advertised.length, registered.size, 'the prompt lists every registered archetype');

  // And no archetype may be named as a tool that does not exist.
  for (const name of prompt.matchAll(/\bTool: (build_[a-z_]+)/g)) {
    assert.fail(`the prompt names tool "${name[1]}", which is not how building works now`);
  }
});

test('the builder tool offers exactly the registered archetypes', () => {
  // The enum is what the model can choose from, so it must not offer a value the
  // registry cannot resolve, and must not hide one that exists.
  const schema = new BuildAbilityTool().schema;
  assert.deepEqual([...schema.properties.archetype.enum].sort(), [...archetypeIds()].sort());
});

test('the preview tool offers exactly the registered archetypes', () => {
  const schema = new PreviewSpecTool().schema;
  assert.deepEqual([...schema.properties.archetype.enum].sort(), [...archetypeIds()].sort());
});

test('an unknown archetype is reported with the known ones listed', () => {
  const tool = new BuildAbilityTool();
  const error = tool._unknownArchetypeError({ archetype: 'not_real' }, {});

  const body = JSON.parse(error.content);
  assert.equal(body.ok, false);
  assert.match(body.error, /not_real/);
  // Listing what exists is what lets the model correct itself in one step.
  assert.equal(body.knownArchetypes.length, listArchetypes().length);
  assert.match(body.hint, /closest archetype/i);
});

test('a missing archetype is reported differently from a wrong one', () => {
  const tool = new BuildAbilityTool();
  const body = JSON.parse(tool._unknownArchetypeError({}, {}).content);
  assert.match(body.error, /No archetype was given/);
  assert.match(body.error, /preview_spec/);
});

test('the archetype description is generated, not written down', () => {
  const description = describeArchetypesForPrompt();
  for (const archetype of listArchetypes()) {
    assert.match(description, new RegExp(`Archetype: "${archetype.id}"`));
    assert.ok(description.includes(archetype.example), 'the example is shown');
  }
});

test('lookups are by exact id', () => {
  assert.equal(getArchetype('save')?.id, 'save');
  assert.equal(getArchetype('Save'), undefined);
  assert.equal(getArchetype(''), undefined);
});
