/**
 * Spec Preview Renderer
 *
 * Renders the model-authored form descriptor array into an editable preview.
 *
 * The form is DATA. This module is the only place descriptors become DOM, so it
 * is also the escaping boundary: labels, options and help text are escaped here
 * and never trusted as markup. Values are read back out of inputs, never out of
 * parsed HTML.
 *
 * Values are keyed FLAT by full field id. Field ids are globally unique
 * (form-descriptors.js enforces that), so a group is pure layout: it contributes
 * no key of its own and its children carry dotted ids. Flat keys round-trip
 * exactly, which is what makes the token flow lossless:
 *
 *   preview_spec(spec, form) -> form rendered -> user edits -> flat values
 *   build_*(previewToken)    -> takeSpec(token) -> spec is the flat values
 *
 * Kept free of Foundry globals so it can be unit tested in plain Node. Anything
 * needing `game` (the actor picker) degrades to a plain text input when absent.
 */

import { evaluateShowIf } from './form-values.js';

const ABSENT = Symbol('absent');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** DOM ids must not contain dots, but field ids may. */
function domSafe(id) {
  return String(id).replace(/[^\w-]/g, '_');
}

/**
 * Control hints. A descriptor may carry `control` to request a richer widget
 * than its `type` implies; unknown hints are ignored and the plain type renders.
 * `actor` becomes a searchable actor picker (decision: the target actor is
 * chosen in the preview panel rather than created for the user).
 */
export const CONTROL_HINTS = Object.freeze(['actor']);

/**
 * Look a value up in a spec by full field id, accepting either a flat dotted key
 * or a nested object path.
 * @param {object} spec
 * @param {string} id
 * @returns {*} The value, or ABSENT
 */
function lookupSpecValue(spec, id) {
  if (!spec || typeof spec !== 'object') return ABSENT;
  if (Object.prototype.hasOwnProperty.call(spec, id)) return spec[id];
  if (!id.includes('.')) return ABSENT;
  let cursor = spec;
  for (const part of id.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return ABSENT;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * Seed form values from the agent's spec, falling back to each descriptor's own
 * `value`. The spec is the agent's reading of the ability; descriptor values are
 * the layout defaults, so a spec value always wins when present.
 * @param {Array} form - Field descriptors
 * @param {object} [spec]
 * @returns {object} Flat values keyed by field id
 */
export function seedValuesFromForm(form, spec = {}) {
  const values = {};
  _seedInto(form, spec, values);
  return values;
}

/** Recursive worker for seedValuesFromForm. */
function _seedInto(fields, spec, values) {
  for (const field of fields || []) {
    if (!field || typeof field !== 'object') continue;
    if (field.type === 'group') {
      _seedInto(field.fields, spec, values);
      continue;
    }
    const fromSpec = lookupSpecValue(spec, field.id);
    if (fromSpec !== ABSENT && fromSpec !== undefined) {
      values[field.id] = fromSpec;
    } else {
      values[field.id] = _descriptorDefault(field);
    }
  }
}

/** The value a descriptor carries when the spec says nothing. */
function _descriptorDefault(field) {
  if (field.type === 'checkbox') return field.value === true;
  if (field.type === 'number') return Number(field.value) || 0;
  return field.value ?? '';
}

/**
 * Build the attribute string for an input, skipping anything absent.
 * @param {object} attrs
 * @returns {string}
 */
function attrString(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(' ');
}

/**
 * Render a `<select>` for the actor control hint, else null when `game` is
 * unavailable (unit tests, or a world with no actors loaded yet).
 * @param {object} field
 * @param {*} value
 * @returns {string|null}
 */
function renderActorSelect(field, value) {
  const actors =
    typeof game !== 'undefined' && Array.isArray(game?.actors?.contents) ? game.actors.contents : null;
  if (!actors) return null;

  const options = actors
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(a => {
      const selected = a.id === value ? ' selected' : '';
      return `<option value="${escapeHtml(a.id)}"${selected}>${escapeHtml(a.name)}</option>`;
    })
    .join('');

  return `<select name="${escapeHtml(field.id)}" id="spec-input-${domSafe(field.id)}" data-field-type="text" data-control="actor"${field.required ? ' required' : ''}><option value="">— choose —</option>${options}</select>`;
}

/**
 * Render the control for a `select` field.
 * @param {object} field
 * @param {*} value
 * @param {object} common - Shared name/id/data attributes
 * @returns {string}
 */
function renderSelect(field, value, common) {
  const options = (field.options || [])
    .map(opt => {
      const selected = String(opt) === String(value) ? ' selected' : '';
      return `<option value="${escapeHtml(opt)}"${selected}>${escapeHtml(opt)}</option>`;
    })
    .join('');
  return `<select ${attrString(common)}>${options}</select>`;
}

/**
 * Render the control for a `number` field.
 * @param {object} field
 * @param {*} value
 * @param {object} common
 * @returns {string}
 */
function renderNumber(field, value, common) {
  const attrs = { ...common, value: Number.isFinite(value) ? value : 0 };
  if (field.min !== undefined) attrs.min = field.min;
  if (field.max !== undefined) attrs.max = field.max;
  attrs.step = field.step !== undefined ? field.step : 1;
  return `<input type="number" ${attrString(attrs)} />`;
}

/** Control renderers by field type. Unknown types fall back to text. */
const CONTROL_RENDERERS = {
  select: renderSelect,
  number: renderNumber,
  checkbox: (field, value, common) =>
    `<input type="checkbox" ${attrString(common)}${value === true ? ' checked' : ''} />`,
  text: (field, value, common) => `<input type="text" ${attrString({ ...common, value })} />`,
};

/**
 * Render one leaf field's input control.
 * @param {object} field
 * @param {*} value
 * @returns {string}
 */
function renderInput(field, value) {
  const common = {
    name: field.id,
    id: `spec-input-${domSafe(field.id)}`,
    'data-field-type': field.type,
  };

  if (field.control === 'actor') {
    const actorSelect = renderActorSelect(field, value);
    if (actorSelect) return actorSelect;
    // No actor registry (or plain Node): fall back to a text input holding the
    // raw value so the spec still round-trips.
    const attrs = { ...common, 'data-control': 'actor', value };
    return `<input type="text" ${attrString(attrs)} placeholder="Actor name or id" />`;
  }

  const renderer = CONTROL_RENDERERS[field.type] || CONTROL_RENDERERS.text;
  return renderer(field, value, common);
}

/**
 * Render one field, leaf or group, as its own element.
 * @param {object} field
 * @param {object} values - Flat values keyed by field id
 * @returns {string}
 */
function renderField(field, values) {
  const visible = field.showIf ? evaluateShowIf(field.showIf, values) : true;
  const showIfAttr = field.showIf ? ` data-show-if="${escapeHtml(field.showIf)}"` : '';
  const help = field.help ? `<p class="spec-field-help">${escapeHtml(field.help)}</p>` : '';
  const close = visible ? '>' : ' hidden>';

  if (field.type === 'group') {
    return [
      `<fieldset class="spec-field-group" data-field-id="${escapeHtml(field.id)}" data-field-type="group"`,
      showIfAttr,
      close,
      `<legend>${escapeHtml(field.label || field.id)}</legend>`,
      help,
      renderFieldsHtml(field.fields, values),
      '</fieldset>',
    ].join('');
  }

  const value = Object.prototype.hasOwnProperty.call(values, field.id)
    ? values[field.id]
    : field.value;

  return [
    `<div class="spec-field" data-field-id="${escapeHtml(field.id)}"`,
    showIfAttr,
    close,
    `<label for="spec-input-${domSafe(field.id)}">${escapeHtml(field.label || field.id)}</label>`,
    renderInput(field, value),
    help,
    '</div>',
  ].join('');
}

/**
 * Render a flat list of fields (group children included) to HTML.
 * @param {Array} fields
 * @param {object} values - Flat values keyed by field id
 * @returns {string}
 */
export function renderFieldsHtml(fields, values = {}) {
  return (fields || [])
    .map(field => (field && typeof field === 'object' ? renderField(field, values) : ''))
    .join('');
}

/**
 * Render the whole preview body. The Handlebars template calls this for the
 * field area so nesting never has to be expressed in template syntax.
 * @param {object} preview - Payload from the preview_spec tool
 * @returns {string} Escaped HTML for the fields region
 */
export function renderSpecFields(preview) {
  const values = seedValuesFromForm(preview?.form, preview?.spec);
  return renderFieldsHtml(preview?.form, values);
}

/**
 * Data for the preview template. Rendering the fields here keeps the template
 * structural; the values are seeded from the agent's spec so the form opens on
 * the agent's reading of the ability.
 * @param {object} preview - Payload from the preview_spec tool
 * @returns {object} Template context
 */
export function buildSpecPreviewContext(preview) {
  return {
    token: preview?.token || '',
    abilityName: preview?.abilityName || 'Ability',
    archetype: preview?.archetype || '',
    summary: preview?.summary || '',
    fieldsHtml: renderSpecFields(preview),
  };
}

/**
 * Read edited values back out of a rendered preview.
 * @param {HTMLElement} root - The `.simulacrum-spec-preview` element
 * @returns {object} Flat values keyed by field id
 */
export function readSpecForm(root) {
  const values = {};
  if (!root || typeof root.querySelectorAll !== 'function') return values;

  const fields = root.querySelectorAll('.spec-field[data-field-id]');
  fields.forEach(el => {
    const id = el.getAttribute('data-field-id');
    if (!id) return;
    const input = el.querySelector('input, select, textarea');
    if (!input) return;

    const type = input.getAttribute('data-field-type') || input.type;
    if (type === 'checkbox') values[id] = input.checked === true;
    else if (type === 'number') {
      const raw = input.value;
      values[id] = raw === '' ? 0 : Number(raw);
    } else values[id] = input.value;
  });

  return values;
}

/**
 * Re-evaluate every showIf expression against current input values.
 * Called on any input change; visibility only ever toggles, so nothing is
 * destroyed and no value is lost while a field is hidden.
 * @param {HTMLElement} root
 */
export function refreshVisibility(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const values = readSpecForm(root);
  root.querySelectorAll('[data-show-if]').forEach(el => {
    const expr = el.getAttribute('data-show-if');
    let visible;
    try {
      visible = evaluateShowIf(expr, values);
    } catch (_e) {
      visible = true;
    }
    el.toggleAttribute('hidden', !visible);
  });
}

/**
 * Wire change/input handlers so conditional fields appear and disappear.
 * @param {HTMLElement} root
 * @returns {Function} Detach function
 */
export function attachVisibilityHandlers(root) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};

  const handler = () => refreshVisibility(root);
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
  refreshVisibility(root);

  return () => {
    root.removeEventListener('input', handler);
    root.removeEventListener('change', handler);
  };
}

/**
 * Convert the live form into a descriptor array carrying the user's values.
 * This is what gets shown in the sidebar transcript and what the user "builds",
 * so the descriptor shape is preserved and only `value` is refreshed.
 * @param {HTMLElement} root
 * @param {Array} form - Original descriptors
 * @returns {Array} Descriptors with current values
 */
export function specPreviewToFields(root, form) {
  const values = readSpecForm(root);

  const walk = fields =>
    (fields || []).map(field => {
      if (!field || typeof field !== 'object') return field;
      if (field.type === 'group') {
        return { ...field, fields: walk(field.fields) };
      }
      if (!Object.prototype.hasOwnProperty.call(values, field.id)) return { ...field };
      return { ...field, value: values[field.id] };
    });

  return walk(form);
}

/**
 * Attach Build / Discard button handlers to a rendered preview.
 * Both remove the panel first: a preview is a one-shot confirmation surface, and
 * leaving it on screen after a decision invites a second, stale build.
 * @param {HTMLElement} root - The `.simulacrum-spec-preview` element
 * @param {object} handlers
 * @param {Function} handlers.onBuild - Receives (values, fields, token)
 * @param {Function} [handlers.onDiscard] - Receives (token)
 * @returns {Function} Detach function
 */
export function attachSpecPreviewHandlers(root, { onBuild, onDiscard } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {};

  const token = root.dataset?.previewToken || null;
  let detached = false;

  const buttons = Array.from(root.querySelectorAll('.spec-preview-actions button[data-action]'));

  const onClick = event => {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const form = root._simulacrumSpecForm || [];

    if (action === 'build') {
      const values = readSpecForm(root);
      const fields = specPreviewToFields(root, form);
      if (typeof button.setAttribute === 'function') button.setAttribute('disabled', '');
      root.remove();
      onBuild?.(values, fields, token);
    } else if (action === 'discard') {
      root.remove();
      onDiscard?.(token);
    }
  };

  buttons.forEach(button => button.addEventListener('click', onClick));

  // Remember the descriptor array so capture is possible without the caller
  // having to thread it through every handler.
  return () => {
    if (detached) return;
    detached = true;
    buttons.forEach(button => button.removeEventListener('click', onClick));
  };
}

/**
 * Render the field markup for a preview and register its descriptors on the
 * element so button handlers can read them back.
 * @param {object} preview - Payload from the preview_spec tool
 * @param {HTMLElement} root - The `.simulacrum-spec-preview` element
 */
export function hydrateSpecPreview(root, preview) {
  if (!root || !preview) return;
  root._simulacrumSpecForm = preview.form || [];
  root.dataset.previewToken = preview.token || '';

  const target = root.querySelector('.spec-preview-fields');
  if (target) target.innerHTML = renderSpecFields(preview);

  attachVisibilityHandlers(root);
}
