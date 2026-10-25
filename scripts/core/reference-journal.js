/**
 * Reference Journal — what the agent has actually CONSULTED from the shipped reference.
 *
 * The REFERENCE FIRST rule says a claim about how a mechanism works, or that something is
 * absent, needs the reference that owns it to have been read — not searched in the world, and
 * not recalled. A prompt can state that but cannot enforce it. This is the small piece of
 * session state that lets a tool enforce it: `read_reference` records here, and the tools that
 * PUBLISH a claim (a lesson, a history entry) check here before writing.
 *
 * In memory, per session. A fresh page starts empty, which is correct — nothing has been read
 * yet, so nothing may be asserted.
 */

/** Reference files read in full this session, by path. */
const readFiles = new Set();

/** Whether the reference has been consulted at all this session (a read, or a search match). */
let consulted = false;

/**
 * Record that a reference file was read in full.
 * @param {string} path
 */
export function recordReferenceRead(path) {
  if (path) readFiles.add(String(path));
  consulted = true;
}

/** Record that the reference was consulted by a search that matched something. */
export function markReferenceConsulted() {
  consulted = true;
}

/** Whether the reference has been consulted at all this session. */
export function hasConsultedReference() {
  return consulted;
}

/** The reference files read in full this session. */
export function referencedFiles() {
  return [...readFiles];
}

/** Clear the journal. For tests only. */
export function resetReferenceJournal() {
  readFiles.clear();
  consulted = false;
}

/**
 * Markers of a NEGATIVE claim about the world — the whole error class, because it is exactly
 * what a world search cannot establish and what the reference that owns the mechanism can.
 */
const NEGATION =
  // eslint-disable-next-line max-len
  /\b(absent|missing|not installed|does not exist|doesn't exist|no such|never built|never actioned|not present|unsupported|does not work|doesn't work|doesn't drive|nothing found|not implemented|no automation|no reference|broken|dead)\b/i;

/**
 * Whether `text` asserts something negative about the world while the reference has not been
 * consulted this session. Identifiable BEFORE the claim is written, which is what makes it
 * worth gating rather than only reviewing in hindsight.
 * @param {string} text
 * @returns {boolean}
 */
export function negativeClaimWithoutReference(text) {
  return NEGATION.test(String(text ?? '')) && !consulted;
}
