/**
 * Form Descriptor Validator
 *
 * The preview form is authored by the model, so it is untrusted input. This
 * module is the boundary: it accepts only a closed vocabulary of field
 * descriptors and rejects everything else with correction guidance the model can
 * act on.
 *
 * The form is DATA, never markup. Nothing here is ever passed to eval or
 * inserted as HTML by the renderer - values are read from inputs, labels are
 * escaped by the template layer.
 *
 * Validation is deliberately strict and returns actionable errors:
 *   { ok: false, errors: ["field 'save' has type 'dropdown'; valid types are ..."] }
 * because the model's next move is to fix the named field and resend.
 */

export const FIELD_TYPES = Object.freeze(['text', 'number', 'select', 'checkbox', 'group']);

export const MAX_FIELDS = 40;
export const MAX_DEPTH = 3;

/**
 * Validate showIf syntax. Accepted forms (kept intentionally tiny - no eval):
 *   "fieldId"
 *   "fieldId in [a, b]"
 *   "fieldId == value"
 *   "fieldId != value"
 *   combinations joined by ' and ' / ' or '
 *
 * We validate shape only; evaluation happens in form-values.js.
 * @param {string} expr
 * @returns {string|null} Error string, or null when valid
 */
export function validateShowIf(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return 'showIf must be a non-empty string';

  const clauses = expr.split(/\s+(?:and|or)\s+/i);
  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed) return `showIf has an empty clause in "${expr}"`;

    // "id in [a, b, c]"
    const inMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s+in\s*\[([^\]]*)\]$/);
    if (inMatch) continue;

    // "id == value" / "id != value"
    const cmpMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s*(?:==|!=)\s*.+$/);
    if (cmpMatch) continue;

    // Bare identifier (truthy check)
    const bareMatch = trimmed.match(/^[A-Za-z_][\w.]*$/);
    if (bareMatch) continue;

    return `showIf clause "${trimmed}" is not understood; use "id", "id == value", "id != value" or "id in [a, b]"`;
  }
  return null;
}

/**
 * Per-type validation, run only once id/label/type are known good.
 * Each entry pushes its own errors onto ctx.errors and may recurse.
 */
const FIELD_VALIDATORS = {
  select(field, ctx) {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      ctx.errors.push(
        `select field "${field.id}" requires a non-empty "options" array of strings`
      );
    } else if (!field.options.every(o => typeof o === 'string')) {
      ctx.errors.push(`select field "${field.id}" options must all be strings`);
    }
  },

  number(field, ctx) {
    for (const key of ['min', 'max', 'step']) {
      if (field[key] !== undefined && typeof field[key] !== 'number') {
        ctx.errors.push(`number field "${field.id}" has non-numeric "${key}"`);
      }
    }
    if (typeof field.value !== 'number') {
      ctx.errors.push(`number field "${field.id}" requires a numeric "value"`);
    }
  },

  checkbox(field, ctx) {
    if (typeof field.value !== 'boolean') {
      ctx.errors.push(`checkbox field "${field.id}" requires a boolean "value"`);
    }
  },

  group(field, ctx) {
    if (ctx.depth >= MAX_DEPTH) {
      ctx.errors.push(`group "${field.id}" exceeds the maximum nesting depth of ${MAX_DEPTH}`);
      return;
    }
    if (!Array.isArray(field.fields) || field.fields.length === 0) {
      ctx.errors.push(`group "${field.id}" requires a non-empty "fields" array`);
      return;
    }
    field.fields.forEach((child, i) =>
      validateField(child, `group "${field.id}" field ${i}`, { ...ctx, depth: ctx.depth + 1 })
    );
  },

  // text: no extra constraints. value may be any scalar; coerced by the form.
  text() {},
};

/**
 * Validate a field's `id` and claim it for duplicate detection.
 * @param {object} field
 * @param {string} path - Human-readable path, used when there is no id to name
 * @param {object} ctx - { errors, seenIds }
 * @returns {boolean} True when the id is usable
 */
function checkId(field, path, ctx) {
  const { id } = field;

  if (!id || typeof id !== 'string') {
    ctx.errors.push(`${path} is missing a string "id"`);
    return false;
  }
  // Ids become key paths in the spec, so restrict them to a safe character set.
  if (!/^[A-Za-z_][\w.]*$/.test(id)) {
    ctx.errors.push(
      `field id "${id}" is invalid; use letters, digits, underscore and dots only (e.g. recharge.threshold)`
    );
    return false;
  }
  if (ctx.seenIds.has(id)) {
    ctx.errors.push(`duplicate field id "${id}"; every field id must be unique`);
    return false;
  }
  ctx.seenIds.add(id);
  return true;
}

/**
 * Validate a field's identity and register its id.
 * @param {object} field
 * @param {string} path
 * @param {object} ctx - { depth, errors, seenIds }
 * @returns {boolean} True when the field is well-formed enough to continue
 */
function checkIdentity(field, path, ctx) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) {
    ctx.errors.push(`${path} must be an object`);
    return false;
  }
  if (!checkId(field, path, ctx)) return false;

  const { id, label, type } = field;

  if (!label || typeof label !== 'string') {
    ctx.errors.push(`field "${id}" is missing a string "label"`);
  }

  if (!FIELD_TYPES.includes(type)) {
    ctx.errors.push(
      `field "${id}" has type "${type}"; valid types are ${FIELD_TYPES.map(t => `"${t}"`).join(', ')}`
    );
    return false;
  }

  return true;
}

/**
 * Validate a single field descriptor.
 * @param {object} field
 * @param {string} path - Human-readable path for error messages
 * @param {object} ctx - { depth, errors, seenIds }
 */
function validateField(field, path, ctx) {
  if (!checkIdentity(field, path, ctx)) return;

  if (field.showIf !== undefined) {
    const showIfError = validateShowIf(field.showIf);
    if (showIfError) ctx.errors.push(`field "${field.id}": ${showIfError}`);
  }

  FIELD_VALIDATORS[field.type](field, ctx);
}

/**
 * Validate a whole form definition.
 * @param {Array} form - The descriptor array emitted by the model
 * @returns {{ok: boolean, errors: string[], fieldCount: number}}
 */
export function validateForm(form) {
  const errors = [];

  if (!Array.isArray(form)) {
    return { ok: false, errors: ['"form" must be an array of field descriptors'], fieldCount: 0 };
  }
  if (form.length === 0) {
    return { ok: false, errors: ['"form" is empty; emit at least one field'], fieldCount: 0 };
  }

  const ctx = { depth: 0, errors, seenIds: new Set() };
  form.forEach((field, i) => validateField(field, `field ${i}`, ctx));

  const fieldCount = ctx.seenIds.size;
  if (fieldCount > MAX_FIELDS) {
    errors.push(
      `form has ${fieldCount} fields; keep it under ${MAX_FIELDS} and rely on spec defaults`
    );
  }

  return { ok: errors.length === 0, errors, fieldCount };
}
