import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

import { PreviewSpecTool } from '../../scripts/tools/preview-spec.js';
import { takeSpec, peekSpec, stashSpec, clearSpecs, specCount } from '../../scripts/core/spec-store.js';

const VALID_FORM = [
  { id: 'name', label: 'Name', type: 'text', value: 'Tanglefoot' },
  { id: 'dc', label: 'DC', type: 'number', value: 14, min: 1, max: 30 },
];

const VALID_SPEC = { name: 'Tanglefoot', dc: 14, saveAbility: 'str' };

function makeTool() {
  return new PreviewSpecTool();
}

function parseResult(result) {
  return JSON.parse(result.content);
}

beforeEach(() => {
  clearSpecs();
});

test('preview_spec is read-only (no confirmation required)', () => {
  assert.equal(makeTool().requiresConfirmation, false);
});

test('preview_spec returns a token and stashes the spec', async () => {
  const tool = makeTool();
  const result = await tool.execute({
    spec: VALID_SPEC,
    form: VALID_FORM,
    abilityName: 'Tanglefoot',
    archetype: 'save',
  });

  const payload = parseResult(result);
  assert.equal(payload.ok, true);
  assert.equal(payload.abilityName, 'Tanglefoot');
  assert.equal(payload.archetype, 'save');
  assert.ok(payload.previewToken, 'a token is returned');
  assert.equal(payload.fieldCount, 2);

  // The token must resolve to the exact spec we passed in - this is what makes
  // the user's edits lossless.
  const stashed = peekSpec(payload.previewToken);
  assert.deepEqual(stashed.spec, VALID_SPEC);
});

test('preview_spec attaches the render payload for the sidebar', async () => {
  const tool = makeTool();
  const result = await tool.execute({
    spec: VALID_SPEC,
    form: VALID_FORM,
    abilityName: 'Tanglefoot',
    archetype: 'save',
    summary: 'A sticky bag that restrains.',
  });

  assert.ok(result.preview, 'preview payload present');
  assert.equal(result.preview.abilityName, 'Tanglefoot');
  assert.equal(result.preview.summary, 'A sticky bag that restrains.');
  assert.deepEqual(result.preview.form, VALID_FORM);
  assert.equal(result.preview.token, parseResult(result).previewToken);
});

test('preview_spec rejects a malformed form and reports every error', async () => {
  const tool = makeTool();
  const result = await tool.execute({
    spec: VALID_SPEC,
    form: [
      { id: 'a', label: 'A', type: 'dropdown', value: 'x' },
      { id: 'b', label: 'B', type: 'select', value: 'x' },
    ],
    abilityName: 'Tanglefoot',
    archetype: 'save',
  });

  const payload = parseResult(result);
  assert.equal(payload.ok, false);
  assert.equal(payload.errors.length, 2);
  // Correction guidance must be present, since the model acts on this text.
  assert.ok(payload.validTypes.includes('select'));
  assert.equal(result.error.type, 'FORM_VALIDATION_ERROR');
  // Nothing should have been stashed on a rejected preview.
  assert.equal(specCount(), 0);
});

test('preview_spec rejects a non-object spec', async () => {
  const tool = makeTool();
  const result = await tool.execute({
    spec: 'Tanglefoot',
    form: VALID_FORM,
    abilityName: 'Tanglefoot',
    archetype: 'save',
  });
  assert.equal(parseResult(result).ok, false);
  assert.match(parseResult(result).error, /must be a plain object/);
});

test('preview_spec rejects a missing abilityName', async () => {
  const tool = makeTool();
  const result = await tool.execute({
    spec: VALID_SPEC,
    form: VALID_FORM,
    archetype: 'save',
  });
  assert.equal(parseResult(result).ok, false);
  assert.match(parseResult(result).error, /abilityName/);
});

test('preview_spec preserves unknown spec keys', async () => {
  // Nuance that has no dedicated field must survive the round trip.
  const tool = makeTool();
  const spec = { ...VALID_SPEC, notes: 'Fails by 5 or more -> also dazed', customThing: 42 };
  const result = await tool.execute({
    spec,
    form: VALID_FORM,
    abilityName: 'Tanglefoot',
    archetype: 'save',
  });
  const stashed = peekSpec(parseResult(result).previewToken);
  assert.equal(stashed.spec.notes, 'Fails by 5 or more -> also dazed');
  assert.equal(stashed.spec.customThing, 42);
});

// --- spec store -------------------------------------------------------------

test('stashSpec returns distinct tokens', () => {
  const a = stashSpec({ x: 1 });
  const b = stashSpec({ x: 1 });
  assert.notEqual(a, b);
  assert.equal(specCount(), 2);
});

test('takeSpec consumes the entry (single use)', () => {
  const token = stashSpec({ x: 1 });
  assert.deepEqual(takeSpec(token).spec, { x: 1 });
  assert.equal(takeSpec(token), null, 'second take returns null');
});

test('peekSpec does not consume', () => {
  const token = stashSpec({ x: 1 });
  assert.ok(peekSpec(token));
  assert.ok(peekSpec(token));
  assert.equal(specCount(), 1);
});

test('peekSpec returns null for an unknown token', () => {
  assert.equal(peekSpec('deadbeef'), null);
  assert.equal(takeSpec('deadbeef'), null);
});

test('clearSpecs empties the store', () => {
  stashSpec({ x: 1 });
  stashSpec({ x: 2 });
  clearSpecs();
  assert.equal(specCount(), 0);
});

test('stashed metadata round-trips', () => {
  const token = stashSpec({ x: 1 }, { form: VALID_FORM, abilityName: 'Tanglefoot', archetype: 'save' });
  const entry = takeSpec(token);
  assert.equal(entry.abilityName, 'Tanglefoot');
  assert.equal(entry.archetype, 'save');
  assert.deepEqual(entry.form, VALID_FORM);
});
