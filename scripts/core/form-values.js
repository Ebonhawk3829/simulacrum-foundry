/**
 * ShowIf Evaluator
 *
 * Evaluates the conditional-visibility expressions the model may attach to form
 * fields, for example: "rechargeMode in [d6, d6+start]".
 *
 * Deliberately not eval(). The grammar is parsed with regexes and evaluated
 * against a flat map of current form values, so a hostile or malformed
 * expression can only produce a wrong boolean - never execute anything.
 *
 * Grammar (matches validateShowIf in form-descriptors.js):
 *   expr     := clause ((' and ' | ' or ') clause)*
 *   clause   := id ' in ' '[' val (',' val)* ']'
 *             | id ('==' | '!=') val
 *             | id
 */

/**
 * Flatten nested form values into a lookup map keyed by field id.
 * Group fields nest their children under the group id, so we index both the
 * full dotted path and the bare leaf id for convenience.
 * @param {object} values - Values keyed by field id (may be nested)
 * @param {object} [target]
 * @param {string} [prefix]
 * @returns {object} Flat lookup
 */
export function flattenValues(values, target = {}, prefix = '') {
  if (!values || typeof values !== 'object') return target;
  for (const [key, value] of Object.entries(values)) {
    const path = prefix ? `${prefix}.${key}` : key;
    target[path] = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenValues(value, target, path);
    }
  }
  return target;
}

function _lookup(flat, id) {
  if (Object.prototype.hasOwnProperty.call(flat, id)) return flat[id];
  // Fall back to a leaf match so "threshold" resolves inside a group.
  const leaf = id.includes('.') ? id.split('.').pop() : id;
  for (const [key, value] of Object.entries(flat)) {
    if (key === leaf || key.endsWith(`.${leaf}`)) return value;
  }
  return undefined;
}

function _coerce(raw) {
  const value = String(raw).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function _equals(actual, expected) {
  const a = typeof actual === 'string' ? _coerce(actual) : actual;
  return a === expected;
}

function _evalClause(clause, flat) {
  const trimmed = clause.trim();

  const inMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s+in\s*\[([^\]]*)\]$/);
  if (inMatch) {
    const actual = _lookup(flat, inMatch[1]);
    const list = inMatch[2]
      .split(',')
      .map(v => _coerce(v))
      .filter(v => v !== '');
    return list.some(candidate => _equals(actual, candidate));
  }

  const cmpMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s*(==|!=)\s*(.+)$/);
  if (cmpMatch) {
    const actual = _lookup(flat, cmpMatch[1]);
    const expected = _coerce(cmpMatch[3]);
    const equal = _equals(actual, expected);
    return cmpMatch[2] === '==' ? equal : !equal;
  }

  const bareMatch = trimmed.match(/^[A-Za-z_][\w.]*$/);
  if (bareMatch) {
    const actual = _lookup(flat, trimmed);
    return Boolean(actual);
  }

  // Unparseable: treat as visible rather than hiding a field the user may need.
  return true;
}

/**
 * Evaluate a showIf expression against current values.
 * @param {string} expr
 * @param {object} values - Form values (nested or flat)
 * @returns {boolean} True when the field should be visible
 */
export function evaluateShowIf(expr, values) {
  if (!expr || typeof expr !== 'string') return true;
  const flat = flattenValues(values);

  // Split on ' or ' first (lowest precedence), then ' and ' within each part.
  const orParts = expr.split(/\s+or\s+/i);
  return orParts.some(orPart => {
    const andParts = orPart.split(/\s+and\s+/i);
    return andParts.every(andPart => _evalClause(andPart, flat));
  });
}
