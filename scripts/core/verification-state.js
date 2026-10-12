/**
 * Verification State — the "needs testing" lifecycle of a built ability.
 *
 * WHAT PROBLEM THIS SOLVES
 *
 * An ability written from a statblock is a hypothesis. It has never run. The only
 * way to know whether it behaves is to use it the way it will actually be used,
 * and the person best placed to do that is the GM in the live world, because they
 * can reproduce a real situation and notice a wrong outcome that a synthetic test
 * would not have thought to check.
 *
 * So a built ability is marked as needing testing, and the module records what
 * happens when it is used. The agent then reads that record and reasons about it
 * against what it intended. The module does not decide whether the ability is
 * correct — it never did that well, and it is not its place.
 *
 * WHY A FLAG AND NOT A SEPARATE REGISTER
 *
 * The mark lives in the item's own flags, so it travels with the item: copying it,
 * exporting it, or reading it back all carry the state. A side table keyed by id
 * would go stale the moment an item was duplicated or deleted.
 *
 * The same flag is also the recorder's trigger. An ability that does not need
 * testing is not recorded, so nothing is logged for items this module did not
 * build and the log stays readable.
 */

/** Flag scope: this module's own, so it cannot collide with dnd5e or another module. */
const SCOPE = 'simulacrum';

/**
 * Where verification data hangs off an item.
 *
 * `status` is the lifecycle: pending -> observed -> confirmed (or dismissed).
 * `runs` is what the recorder captured, newest last.
 */
const FLAG_KEY = 'verification';

/** How many runs to keep per item before dropping the oldest. */
const MAX_RUNS = 20;

/**
 * Read the verification state off an item.
 * @param {object} item
 * @returns {object|null} Null when the item was not built by this module
 */
export function getVerificationState(item) {
  const state = item?.getFlag?.(SCOPE, FLAG_KEY) ?? item?.flags?.[SCOPE]?.[FLAG_KEY];
  return state ?? null;
}

/**
 * Whether this item is flagged as needing testing.
 * @param {object} item
 * @returns {boolean}
 */
export function needsTesting(item) {
  const state = getVerificationState(item);
  return Boolean(state) && state.status === 'pending';
}

/**
 * Mark an item as needing testing.
 *
 * Records what the agent intended alongside the mark, because the recorder is
 * useless without something to compare against: "the target took 14 damage" means
 * nothing unless we know 14 was expected.
 * @param {object} item
 * @param {object} options
 * @param {string} [options.intent] - What the ability is supposed to do
 * @param {object} [options.expect] - Free-form expectations to check against
 * @param {string} [options.note] - Anything the agent wants surfaced later
 * @returns {Promise<object>} The state that was written
 */
export async function markNeedsTesting(item, { intent, expect, note } = {}) {
  const state = {
    status: 'pending',
    markedAt: new Date().toISOString(),
    markedBy: game?.user?.id ?? null,
    identifier: item?.system?.identifier ?? null,
    intent: intent ?? null,
    expect: expect ?? null,
    note: note ?? null,
    runs: [],
  };

  await item.setFlag(SCOPE, FLAG_KEY, state);
  return state;
}

/**
 * Record what happened during one use.
 *
 * Appends rather than replaces, so repeated use across a session accumulates, and
 * caps the list so a long-lived item cannot grow without bound.
 * @param {object} item
 * @param {object} run - The observation from the recorder
 * @returns {Promise<object|null>} The updated state, or null if not tracked
 */
export async function recordRun(item, run) {
  const state = getVerificationState(item);
  if (!state) return null;

  const runs = [...(state.runs ?? []), run].slice(-MAX_RUNS);
  const next = { ...state, runs, lastRunAt: run.at };
  await item.setFlag(SCOPE, FLAG_KEY, next);
  return next;
}

/**
 * Clear the mark, which is what "it works, stop logging" means.
 *
 * The recorded runs are kept by default. They are the evidence behind the
 * decision, and discarding them would leave nothing to revisit if the ability
 * turns out to misbehave later.
 * @param {object} item
 * @param {object} [options]
 * @param {boolean} [options.keepRuns=true] - Set false to discard the history too
 * @param {string} [options.summary] - One line on what was verified and how
 * @returns {Promise<object>} The resulting state
 */
export async function clearNeedsTesting(item, { keepRuns = true, summary } = {}) {
  const state = getVerificationState(item) ?? {};

  const next = {
    ...state,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    runs: keepRuns ? state.runs ?? [] : [],
    // Kept with the record so the decision is understandable later, which is the
    // difference between a flag and an audit trail.
    ...(summary ? { summary } : {}),
  };

  await item.setFlag(SCOPE, FLAG_KEY, next);
  return next;
}

/**
 * Whether the recorder should capture this item at all.
 *
 * Only pending items are recorded. Once confirmed, an ability stops writing to
 * the log, which is what makes "remove the debug output" a single flag change
 * rather than an edit to the item's data.
 * @param {object} item
 * @returns {boolean}
 */
export function shouldRecord(item) {
  return needsTesting(item);
}

/** The flag path, for tests and for reporting. */
export const VERIFICATION_FLAG = `${SCOPE}.${FLAG_KEY}`;
