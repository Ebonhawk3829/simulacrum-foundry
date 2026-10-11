import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateForm, validateShowIf, FIELD_TYPES } from '../../scripts/core/form-descriptors.js';
import { evaluateShowIf, flattenValues } from '../../scripts/core/form-values.js';

// A representative form: the Tanglefoot shape, plus a conditional group.
function tanglefootForm() {
  return [
    { id: 'actor', label: 'Actor', type: 'text', value: '' },
    { id: 'name', label: 'Name', type: 'text', value: 'Tanglefoot' },
    {
      id: 'saveAbility',
      label: 'Save',
      type: 'select',
      value: 'str',
      options: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    },
    { id: 'dc', label: 'DC', type: 'number', value: 14, min: 1, max: 30 },
    { id: 'range', label: 'Range (ft)', type: 'number', value: 30, min: 0 },
    {
      id: 'onFailCondition',
      label: 'On fail',
      type: 'select',
      value: 'restrained',
      options: ['restrained', 'prone', 'grappled'],
    },
    { id: 'repeatSave', label: 'Re-save', type: 'checkbox', value: true },
    {
      id: 'recharge',
      label: 'Recharge',
      type: 'group',
      fields: [
        {
          id: 'recharge.mode',
          label: 'Mode',
          type: 'select',
          value: 'd6',
          options: ['turnStart', 'turnEnd', 'd6', 'd6+start'],
        },
        {
          id: 'recharge.threshold',
          label: 'On a roll of',
          type: 'number',
          value: 5,
          min: 1,
          max: 6,
          showIf: 'recharge.mode in [d6, d6+start]',
        },
      ],
    },
  ];
}

test('accepts a well-formed form', () => {
  const result = validateForm(tanglefootForm());
  assert.equal(result.ok, true, result.errors.join('; '));
  // 8 top-level fields + 2 nested inside the recharge group.
  assert.equal(result.fieldCount, 10);
});

test('rejects a non-array form', () => {
  const result = validateForm({ id: 'oops' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /must be an array/);
});

test('rejects an empty form', () => {
  const result = validateForm([]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /empty/);
});

test('rejects an unknown field type with correction guidance', () => {
  const result = validateForm([{ id: 'x', label: 'X', type: 'dropdown', value: 'a' }]);
  assert.equal(result.ok, false);
  // The message must name the offending type and list the valid ones - the model
  // acts on this text, so its wording is part of the contract.
  assert.match(result.errors[0], /"dropdown"/);
  for (const type of FIELD_TYPES) assert.match(result.errors[0], new RegExp(type));
});

test('rejects a select with no options', () => {
  const result = validateForm([{ id: 's', label: 'S', type: 'select', value: 'a' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /non-empty "options"/);
});

test('rejects non-string select options', () => {
  const result = validateForm([
    { id: 's', label: 'S', type: 'select', value: 'a', options: ['a', 2] },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /must all be strings/);
});

test('rejects a number field with a non-numeric value', () => {
  const result = validateForm([{ id: 'n', label: 'N', type: 'number', value: '14' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /numeric "value"/);
});

test('rejects a checkbox with a non-boolean value', () => {
  const result = validateForm([{ id: 'c', label: 'C', type: 'checkbox', value: 'yes' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /boolean "value"/);
});

test('rejects duplicate field ids', () => {
  const result = validateForm([
    { id: 'a', label: 'A', type: 'text', value: '' },
    { id: 'a', label: 'A again', type: 'text', value: '' },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /duplicate field id/);
});

test('rejects an unsafe field id', () => {
  const result = validateForm([{ id: 'bad id!', label: 'B', type: 'text', value: '' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /is invalid/);
});

test('rejects a group with no fields', () => {
  const result = validateForm([{ id: 'g', label: 'G', type: 'group', fields: [] }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /non-empty "fields"/);
});

test('rejects nesting beyond the depth limit', () => {
  // MAX_DEPTH is 3, so a group may contain up to three levels of nested groups.
  const leaf = { id: 'e', label: 'E', type: 'text', value: '' };
  const l4 = { id: 'd', label: 'D', type: 'group', fields: [leaf] };
  const l3 = { id: 'c', label: 'C', type: 'group', fields: [l4] };
  const l2 = { id: 'b', label: 'B', type: 'group', fields: [l3] };
  const l1 = { id: 'a', label: 'A', type: 'group', fields: [l2] };
  const result = validateForm([l1]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /nesting depth/);
});

test('accepts nesting at the depth limit', () => {
  const leaf = { id: 'e', label: 'E', type: 'text', value: '' };
  const l3 = { id: 'c', label: 'C', type: 'group', fields: [leaf] };
  const l2 = { id: 'b', label: 'B', type: 'group', fields: [l3] };
  const l1 = { id: 'a', label: 'A', type: 'group', fields: [l2] };
  const result = validateForm([l1]);
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('validateShowIf accepts the supported syntaxes', () => {
  assert.equal(validateShowIf('flag'), null);
  assert.equal(validateShowIf('mode in [a, b]'), null);
  assert.equal(validateShowIf('dc == 14'), null);
  assert.equal(validateShowIf('dc != 14'), null);
  assert.equal(validateShowIf('a == 1 and b in [x, y]'), null);
  assert.equal(validateShowIf('a == 1 or b'), null);
});

test('validateShowIf rejects nonsense', () => {
  assert.match(validateShowIf(''), /non-empty string/);
  assert.match(validateShowIf(42), /non-empty string/);
  assert.match(validateShowIf('a > 3'), /not understood/);
  assert.match(validateShowIf('a == 1 and '), /empty clause/);
});

test('showIf rejects a bad expression via validateForm', () => {
  const result = validateForm([
    { id: 'a', label: 'A', type: 'text', value: '', showIf: 'a >> 1' },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /not understood/);
});

test('enforces the field cap', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    id: `f${i}`,
    label: `F${i}`,
    type: 'text',
    value: '',
  }));
  const result = validateForm(many);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /keep it under/);
});

// --- evaluation -------------------------------------------------------------

test('evaluateShowIf: in-list', () => {
  assert.equal(evaluateShowIf('mode in [d6, d6+start]', { mode: 'd6' }), true);
  assert.equal(evaluateShowIf('mode in [d6, d6+start]', { mode: 'turnStart' }), false);
});

test('evaluateShowIf: equality and inequality', () => {
  assert.equal(evaluateShowIf('dc == 14', { dc: 14 }), true);
  assert.equal(evaluateShowIf('dc == 14', { dc: 16 }), false);
  assert.equal(evaluateShowIf('dc != 14', { dc: 16 }), true);
});

test('evaluateShowIf: bare identifier is a truthy check', () => {
  assert.equal(evaluateShowIf('repeatSave', { repeatSave: true }), true);
  assert.equal(evaluateShowIf('repeatSave', { repeatSave: false }), false);
  assert.equal(evaluateShowIf('missing', {}), false);
});

test('evaluateShowIf: and / or precedence', () => {
  const values = { a: 1, b: 'x' };
  assert.equal(evaluateShowIf('a == 1 and b in [x, y]', values), true);
  assert.equal(evaluateShowIf('a == 2 and b in [x, y]', values), false);
  assert.equal(evaluateShowIf('a == 2 or b in [x, y]', values), true);
});

test('evaluateShowIf: resolves a dotted id directly', () => {
  assert.equal(
    evaluateShowIf('recharge.mode in [d6]', { recharge: { mode: 'd6' } }),
    true
  );
});

test('evaluateShowIf: resolves a leaf id inside a group', () => {
  // The Tanglefoot case: the field says "recharge.mode" but a model may write
  // "mode"; both should work.
  assert.equal(evaluateShowIf('mode in [d6]', { recharge: { mode: 'd6' } }), true);
});

test('evaluateShowIf: unparseable expressions default to visible', () => {
  // Never hide a field the user might need because we could not parse a condition.
  assert.equal(evaluateShowIf('total nonsense here', {}), true);
});

test('evaluateShowIf: missing expression is visible', () => {
  assert.equal(evaluateShowIf(undefined, {}), true);
  assert.equal(evaluateShowIf('', {}), true);
});

test('flattenValues indexes nested groups by path and leaf', () => {
  const flat = flattenValues({ recharge: { mode: 'd6' }, dc: 14 });
  assert.equal(flat['recharge.mode'], 'd6');
  assert.equal(flat.dc, 14);
});
