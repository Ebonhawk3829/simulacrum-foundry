import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  seedValuesFromForm,
  renderFieldsHtml,
  renderSpecFields,
  buildSpecPreviewContext,
  readSpecForm,
  specPreviewToFields,
  refreshVisibility,
} from '../../scripts/core/spec-preview-renderer.js';

/**
 * The renderer's DOM-dependent helpers are exercised against a small fake DOM.
 * A real jsdom dependency is not worth adding for a preview panel, and the parts
 * that matter (escaping, value seeding, showIf wiring) are all pure string work.
 */
class FakeElement {
  constructor(html = '') {
    this._html = html;
    this._attrs = new Map();
    this.dataset = {};
    this._fields = [];
    this._showIf = [];
    this._listeners = new Map();
    this.removed = false;
  }

  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }

  setAttribute(name, value) {
    this._attrs.set(name, value);
  }

  hasAttribute(name) {
    return this._attrs.has(name);
  }

  toggleAttribute(name, force) {
    if (force) this._attrs.set(name, '');
    else this._attrs.delete(name);
  }

  querySelectorAll(selector) {
    if (selector === '.spec-field[data-field-id]') return this._fields;
    if (selector === '[data-show-if]') return this._showIf;
    if (selector === '.spec-preview-actions button[data-action]') return this._buttons || [];
    return [];
  }

  querySelector() {
    return null;
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this._listeners.get(type) || [];
    this._listeners.set(
      type,
      list.filter(h => h !== handler)
    );
  }

  remove() {
    this.removed = true;
  }

  dispatch(type) {
    for (const handler of this._listeners.get(type) || []) {
      handler({ type, currentTarget: this, preventDefault() {} });
    }
  }
}

function fakeField(id, value, type = 'text') {
  const input = {
    value: String(value ?? ''),
    checked: value === true,
    type,
    getAttribute: name => (name === 'data-field-type' ? type : null),
  };
  const el = new FakeElement();
  el.setAttribute('data-field-id', id);
  el.querySelector = sel => (sel === 'input, select, textarea' ? input : null);
  return el;
}

function tanglefootForm() {
  return [
    { id: 'name', label: 'Name', type: 'text', value: 'Tanglefoot' },
    {
      id: 'saveAbility',
      label: 'Save',
      type: 'select',
      value: 'str',
      options: ['str', 'dex', 'con'],
    },
    { id: 'dc', label: 'DC', type: 'number', value: 14, min: 1, max: 30 },
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
          value: 'perDay',
          options: ['perDay', 'd6'],
        },
        {
          id: 'recharge.threshold',
          label: 'On a roll of',
          type: 'number',
          value: 5,
          showIf: 'recharge.mode == d6',
        },
      ],
    },
  ];
}

test('seeds values from the spec, falling back to descriptor defaults', () => {
  const values = seedValuesFromForm(tanglefootForm(), { dc: 16, name: 'Entangle' });
  assert.equal(values.dc, 16, 'spec value wins');
  assert.equal(values.name, 'Entangle');
  assert.equal(values.saveAbility, 'str', 'unset key falls back to descriptor default');
  assert.equal(values.repeatSave, true, 'checkbox default preserved');
  assert.equal(values['recharge.mode'], 'perDay');
  assert.equal(values['recharge.threshold'], 5);
});

test('seeds from a nested spec shape as well as flat dotted keys', () => {
  const nested = seedValuesFromForm(tanglefootForm(), { recharge: { mode: 'd6' } });
  assert.equal(nested['recharge.mode'], 'd6');
});

test('groups contribute no key of their own', () => {
  const values = seedValuesFromForm(tanglefootForm(), {});
  assert.equal(Object.prototype.hasOwnProperty.call(values, 'recharge'), false);
  assert.ok(Object.prototype.hasOwnProperty.call(values, 'recharge.mode'));
});

test('renders each field type with the right control and current value', () => {
  const html = renderFieldsHtml(tanglefootForm(), { dc: 16, repeatSave: false });
  assert.match(html, /<input type="text" name="name" id="spec-input-name"/);
  assert.match(html, /<select name="saveAbility"[^>]*><option value="str" selected>/);
  assert.match(html, /<input type="number" name="dc" id="spec-input-dc"[^>]*value="16"/);
  assert.match(html, /<input type="checkbox" name="repeatSave"[^>]*\/>/);
  assert.match(html, /<fieldset class="spec-field-group" data-field-id="recharge"/);
});

test('escapes labels, values, options and help text', () => {
  const hostile = [
    {
      id: 'name',
      label: '<img src=x onerror=alert(1)>',
      type: 'select',
      value: 'a"><script>alert(2)</script>',
      options: ['a"><script>alert(2)</script>', 'safe'],
      help: '</p><b>bold</b>',
    },
  ];
  const html = renderFieldsHtml(hostile, {});

  assert.equal(html.includes('<script>'), false, 'no raw script tag survives');
  assert.equal(html.includes('<img'), false, 'no raw img tag survives');
  assert.equal(html.includes('<b>bold</b>'), false, 'help markup is escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('DOM ids are safe even when field ids contain dots', () => {
  const html = renderFieldsHtml(tanglefootForm(), {});
  assert.match(html, /id="spec-input-recharge_mode"/);
  assert.equal(html.includes('id="spec-input-recharge.mode"'), false);
});

test('conditional fields are marked hidden at first render when showIf is false', () => {
  const html = renderFieldsHtml(tanglefootForm(), { 'recharge.mode': 'perDay' });
  const threshold = html.slice(html.indexOf('data-field-id="recharge.threshold"'));
  assert.match(threshold.slice(0, 200), / data-show-if="recharge\.mode == d6" hidden>/);
});

test('conditional fields render visible when showIf is satisfied', () => {
  const html = renderFieldsHtml(tanglefootForm(), { 'recharge.mode': 'd6' });
  const threshold = html.slice(html.indexOf('data-field-id="recharge.threshold"'));
  assert.equal(threshold.slice(0, 200).includes(' hidden>'), false);
});

test('template context carries the header data and pre-rendered fields', () => {
  const ctx = buildSpecPreviewContext({
    token: 'abc123',
    abilityName: 'Tanglefoot',
    archetype: 'save',
    summary: 'Restrains on a failed save.',
    spec: { dc: 14 },
    form: tanglefootForm(),
  });
  assert.equal(ctx.token, 'abc123');
  assert.equal(ctx.abilityName, 'Tanglefoot');
  assert.equal(ctx.archetype, 'save');
  assert.equal(ctx.summary, 'Restrains on a failed save.');
  assert.match(ctx.fieldsHtml, /data-field-id="dc"/);
});

test('renderSpecFields tolerates a missing preview', () => {
  assert.equal(renderSpecFields(undefined), '');
  assert.equal(renderFieldsHtml(undefined, {}), '');
});

test('reads edited values back out, coercing numbers and checkboxes', () => {
  const root = new FakeElement();
  root._fields = [fakeField('dc', '16', 'number'), fakeField('repeatSave', true, 'checkbox')];
  const values = readSpecForm(root);
  assert.equal(values.dc, 16);
  assert.equal(values.repeatSave, true);
});

test('an emptied number field reads as 0 rather than NaN', () => {
  const root = new FakeElement();
  root._fields = [fakeField('dc', '', 'number')];
  assert.equal(readSpecForm(root).dc, 0);
});

test('specPreviewToFields refreshes descriptor values and preserves shape', () => {
  const root = new FakeElement();
  root._fields = [fakeField('dc', '18', 'number'), fakeField('name', 'Entangle', 'text')];
  const fields = specPreviewToFields(root, tanglefootForm());

  const dc = fields.find(f => f.id === 'dc');
  assert.equal(dc.value, 18);
  assert.equal(dc.min, 1, 'other descriptor properties survive');

  const group = fields.find(f => f.id === 'recharge');
  assert.equal(group.type, 'group');
  assert.equal(group.fields.length, 2, 'group children are preserved');
  assert.equal(group.fields[0].value, 'perDay', 'untouched nested value keeps its default');
});

test('refreshVisibility toggles hidden from live values', () => {
  const root = new FakeElement();
  const modeField = fakeField('recharge.mode', 'd6', 'select');
  modeField.setAttribute('data-show-if', 'recharge.mode == d6');
  root._fields = [modeField];
  root._showIf = [modeField];

  refreshVisibility(root);
  assert.equal(modeField.hasAttribute('hidden'), false);
});

test('refreshVisibility hides a field once the controlling value changes', () => {
  const root = new FakeElement();
  const modeField = fakeField('recharge.mode', 'perDay', 'select');
  modeField.setAttribute('data-show-if', 'recharge.mode == d6');
  root._fields = [modeField];
  root._showIf = [modeField];

  refreshVisibility(root);
  assert.equal(modeField.hasAttribute('hidden'), true);
});

test('refreshVisibility keeps a field visible when the expression is unparseable', () => {
  const root = new FakeElement();
  const field = fakeField('x', '', 'text');
  field.setAttribute('data-show-if', 'this is not an expression');
  root._fields = [field];
  root._showIf = [field];

  refreshVisibility(root);
  assert.equal(field.hasAttribute('hidden'), false);
});

test('refreshVisibility is a no-op on a missing root', () => {
  assert.doesNotThrow(() => refreshVisibility(null));
});

test('an actor field becomes a searchable list of the world actors', () => {
  const previous = globalThis.game;
  globalThis.game = {
    actors: {
      contents: [
        { id: 'a1', name: 'Goblin Boss' },
        { id: 'a2', name: 'Ancient Red Dragon' },
      ],
    },
  };

  try {
    const html = renderFieldsHtml(
      [{ id: 'actor', label: 'Actor', type: 'text', control: 'actor' }],
      { actor: 'a2' }
    );

    assert.match(html, /<select name="actor"/, 'a known control renders a picker, not a text box');
    assert.match(html, /data-control="actor"/);
    assert.match(html, /value="a2" selected/, 'the current choice is preselected');
    assert.match(html, /Ancient Red Dragon/);
    assert.match(html, /Goblin Boss/);
  } finally {
    globalThis.game = previous;
  }
});

test('an actor field falls back to a text input so the value still round-trips', () => {
  const previous = globalThis.game;
  delete globalThis.game;

  try {
    const html = renderFieldsHtml(
      [{ id: 'actor', label: 'Actor', type: 'text', control: 'actor' }],
      { actor: 'Goblin Boss' }
    );

    assert.match(html, /<input type="text"/);
    assert.match(html, /data-control="actor"/);
    assert.match(html, /value="Goblin Boss"/, 'the value survives so a build can still resolve it');
  } finally {
    globalThis.game = previous;
  }
});
