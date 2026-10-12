/**
 * Test Observations — take a picture of an actor, and bias its rolls.
 *
 * These are the mechanics a self-test needs and nothing more. There is
 * deliberately no scoring, no claim vocabulary, and no notion of pass or fail:
 * those were removed because a closed list of checkable statements silently
 * reported anything it had not anticipated as untested, which punishes the
 * caller for thinking of a better check than the harness did. What a test can
 * honestly offer is an accurate record of what happened, and an accurate record
 * is what is here.
 */

/**
 * Capture the parts of an actor a test can disturb.
 *
 * Deliberately narrow. A full document snapshot would be enormous and would
 * mostly record things no test touches; these are the fields an ability run can
 * actually change, plus the effect and status lists so teardown can find what
 * the run added.
 * @param {object} actor
 * @returns {object}
 */
export function snapshotActorState(actor) {
  return {
    hp: actor?.system?.attributes?.hp?.value,
    temp: actor?.system?.attributes?.hp?.temp,
    exhaustion: actor?.system?.attributes?.exhaustion,
    effectIds: (actor?.effects?.contents ?? []).map(e => e.id),
    statuses: Array.from(actor?.statuses ?? []),
  };
}

/**
 * Describe what changed between two snapshots.
 *
 * Reports only differences, so the evidence is readable at a glance rather than
 * a wall of unchanged fields. `effectsAdded` and `statusesAdded` are named
 * rather than diffed by id because the agent reasons about names.
 * @param {object} before
 * @param {object} after
 * @param {object} [actor] - Used to resolve effect names
 * @returns {object}
 */
export function diffActorState(before, after, actor) {
  return {
    ...diffNumbers(before, after),
    ...diffEffects(before, after, actor),
    ...diffStatuses(before, after),
  };
}

/**
 * Numeric fields, reported as before/after plus the delta.
 * @param {object} before
 * @param {object} after
 * @returns {object}
 */
function diffNumbers(before, after) {
  const diff = {};
  if (before.hp !== after.hp) {
    diff.hp = { before: before.hp, after: after.hp, change: (after.hp ?? 0) - (before.hp ?? 0) };
  }
  if (before.temp !== after.temp) diff.tempHp = { before: before.temp, after: after.temp };
  if (before.exhaustion !== after.exhaustion) {
    diff.exhaustion = { before: before.exhaustion, after: after.exhaustion };
  }
  return diff;
}

/**
 * Effects gained and lost, named rather than identified.
 *
 * The status ids are read out too: "the condition landed" usually means the
 * status changed, and resolving it separately would be a round trip the caller
 * should not have to make.
 * @param {object} before
 * @param {object} after
 * @param {object} [actor]
 * @returns {object}
 */
function diffEffects(before, after, actor) {
  const diff = {};
  const byId = new Map((actor?.effects?.contents ?? []).map(e => [e.id, e]));

  const added = after.effectIds.filter(id => !before.effectIds.includes(id));
  if (added.length) {
    diff.effectsAdded = added.map(id => ({
      id,
      name: byId.get(id)?.name ?? '(unknown)',
      statuses: Array.from(byId.get(id)?.statuses ?? []),
    }));
  }

  const removed = before.effectIds.filter(id => !after.effectIds.includes(id));
  if (removed.length) diff.effectsRemoved = removed;

  return diff;
}

/**
 * Conditions gained and lost.
 * @param {object} before
 * @param {object} after
 * @returns {object}
 */
function diffStatuses(before, after) {
  const diff = {};

  const gained = after.statuses.filter(s => !before.statuses.includes(s));
  if (gained.length) diff.statusesGained = gained;

  const lost = before.statuses.filter(s => !after.statuses.includes(s));
  if (lost.length) diff.statusesLost = lost;

  return diff;
}

/**
 * The flags that bias every roll a creature makes.
 *
 * `fail.all` is documented as failing ALL actions, and `success.all` as
 * succeeding on all rolls, so one pair covers every kind of roll rather than
 * needing a per-roll-type variant. That matters because the alternative reading
 * — that each activity type needs its own flag — would mean a build could pass
 * its tests through a path a real use never takes.
 *
 * Whether midi actually reads these is not assumed: the test reads them back off
 * the actor afterwards and reports it, so an unforced run is visible rather than
 * being mistaken for a broken ability.
 * @param {'fail'|'success'} outcome
 * @returns {object} An update payload
 */
export function forceRollFlags(outcome) {
  return outcome === 'fail'
    ? { 'flags.midi-qol.fail.all': true }
    : { 'flags.midi-qol.success.all': true };
}

/** The update that removes the forcing. */
export function clearForceRollFlags() {
  return { 'flags.midi-qol.-=fail': null, 'flags.midi-qol.-=success': null };
}
