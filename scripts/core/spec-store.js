/**
 * Spec Store — short-lived stash for user-edited automation specs
 *
 * The preview flow is: agent parses -> user edits a form -> build. Routing the
 * edited values back through the model is lossy and costs a round trip, so edits
 * are stashed here and referenced by an opaque token instead. The builder tool
 * accepts either a literal spec or a token; a token is used verbatim.
 *
 * Entries expire so a stale preview cannot silently build something from an old
 * screen. A token is single-use: consuming it removes it, so a rebuild must come
 * from a fresh preview (which is what we want - the user sees what they confirm).
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** @type {Map<string, {spec: object, form: Array, createdAt: number, archive: object}>} */
const entries = new Map();

function _now() {
  return Date.now();
}

function _randomToken() {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function _prune() {
  const cutoff = _now() - DEFAULT_TTL_MS;
  for (const [token, entry] of entries) {
    if (entry.createdAt < cutoff) entries.delete(token);
  }
}

/**
 * Store a spec and return its token.
 * @param {object} spec - The (possibly user-edited) spec
 * @param {object} [meta] - Extra context (form definition, original text, actor)
 * @returns {string} Opaque token
 */
export function stashSpec(spec, meta = {}) {
  _prune();
  const token = _randomToken();
  entries.set(token, { spec, createdAt: _now(), ...meta });
  return token;
}

/**
 * Retrieve a stored spec without consuming it.
 * @param {string} token
 * @returns {object|null} The entry, or null if missing/expired
 */
export function peekSpec(token) {
  _prune();
  return entries.get(token) ?? null;
}

/**
 * Consume a stored spec (single-use).
 * @param {string} token
 * @returns {object|null} The entry, or null if missing/expired/already used
 */
export function takeSpec(token) {
  const entry = peekSpec(token);
  if (entry) entries.delete(token);
  return entry ?? null;
}

/**
 * Drop all entries. Exposed for tests and for a world-level "clear previews".
 */
export function clearSpecs() {
  entries.clear();
}

/**
 * Number of live entries. Diagnostics only.
 * @returns {number}
 */
export function specCount() {
  _prune();
  return entries.size;
}
