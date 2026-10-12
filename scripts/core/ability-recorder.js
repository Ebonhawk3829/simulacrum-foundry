/**
 * Ability Recorder — record what happens when a flagged ability is used.
 *
 * WHY THIS EXISTS IN THIS SHAPE
 *
 * An earlier version of this module tried to TEST abilities itself: it forced
 * saves to fail and succeed, read the target's state before and after, and scored
 * the result against a checklist. That was the wrong instrument. It could only
 * check things it had thought of in advance, it could not reproduce a real table
 * situation, and the person running the game can do all of it better by simply
 * using the ability.
 *
 * So this does not test anything. It watches, and writes down what happened. The
 * GM uses the ability the way it will actually be used, the agent reads the
 * record, and the two of them work out whether it behaves.
 *
 * WHAT IT WATCHES, AND WHY THOSE THINGS
 *
 * dnd5e's own activity lifecycle hooks, plus core document hooks for the chat
 * that results. Not midi-qol's workflow hooks: midi generates its hook names from
 * an internal state table (`pre<State>` / `post<State>`, see `Workflow.stateHooks`),
 * so binding to them couples this to midi's internals and a version bump would
 * silently stop the recording. The dnd5e hooks are a stable public API and, because
 * midi routes its results through ordinary document updates, they capture what
 * actually happened regardless of which module produced it.
 *
 * All four hook names were read out of dnd5e's source rather than recalled, after
 * an earlier version of this file bound `dnd5e.useActivity` - a hook that does not
 * exist anywhere in dnd5e, midi-qol, DAE, CAT or Chris's Premades. It was a
 * garbled memory of `dnd5e.preUseActivity`, and because Hooks.on happily accepts
 * any string, nothing complained: the recorder was simply never called. The real
 * hooks are in `module/documents/activity/mixin.mjs` and are identical in
 * dnd5e 5.3.3 and 6.0.6.
 *
 * Nothing here decides whether an outcome is correct. It records facts and says
 * what it could not see, and the judgement happens in conversation.
 */

import { createLogger } from '../utils/logger.js';
import { shouldRecord, recordRun } from './verification-state.js';

const logger = createLogger('AbilityRecorder');

/**
 * How long to keep collecting after the workflow reports it has finished.
 *
 * Not zero, because dnd5e fires `postUseActivity` before every module has finished
 * posting to chat, and a record taken immediately would miss the last card.
 */
const SETTLE_MS = 800;

/**
 * Ceiling on a recording that never reports finishing.
 *
 * `postUseActivity` does not fire if the workflow throws, and a template that is
 * never placed leaves the use open indefinitely. Without a ceiling, one abandoned
 * template would block every later recording, since only one runs at a time. This
 * is long enough for a slow world to finish and short enough that the block is
 * recoverable by hand.
 */
const MAX_WAIT_MS = 20_000;

/** Cap on captured chat messages per run, so a chatty workflow cannot flood it. */
const MAX_MESSAGES = 12;

/**
 * The in-flight recording.
 *
 * One at a time is a deliberate simplification: an ability use is a user-driven
 * action, and tracking several concurrent workflows would add machinery for a
 * case that does not come up in practice.
 */
let active = null;

/**
 * A use that has been started but not yet confirmed.
 *
 * `dnd5e.preUseActivity` fires before the configuration dialog and before
 * consumption, and the user can cancel either. So it is the right moment to take
 * the before-snapshot - concentration is begun and uses are spent after it, and a
 * snapshot taken later would miss both - but the wrong moment to commit to
 * recording. The use is promoted to `active` once dnd5e says a usage card is
 * being created, which only happens if the use is genuinely going ahead.
 */
let pending = null;

/** Handle for the pending write, so a superseded use cannot write late. */
let settleTimer = null;

/** Handle for the ceiling on a workflow that never reports finishing. */
let maxWaitTimer = null;

/** Cancel both timers, if either is running. */
function clearTimers() {
  if (settleTimer) clearTimeout(settleTimer);
  if (maxWaitTimer) clearTimeout(maxWaitTimer);
  settleTimer = null;
  maxWaitTimer = null;
}

/**
 * Snapshot the bits of an actor a use can plausibly change.
 * @param {object} actor
 * @returns {object}
 */
function snapshotActor(actor) {
  return {
    uuid: actor.uuid,
    name: actor.name,
    hp: actor.system?.attributes?.hp?.value ?? null,
    temp: actor.system?.attributes?.hp?.temp ?? null,
    exhaustion: actor.system?.attributes?.exhaustion ?? null,
    effects: (actor.effects?.contents ?? []).map(e => ({
      name: e.name,
      statuses: Array.from(e.statuses ?? []),
    })),
    statuses: Array.from(actor.statuses ?? []),
  };
}

/**
 * Describe the difference between two actor snapshots.
 *
 * Only differences are reported. A full dump would be unreadable and would bury
 * the one line that matters.
 * @param {object} before
 * @param {object} after
 * @returns {object}
 */
function diffActor(before, after) {
  const diff = {};

  if (before.hp !== after.hp) {
    diff.hp = { before: before.hp, after: after.hp, change: (after.hp ?? 0) - (before.hp ?? 0) };
  }
  if (before.temp !== after.temp) diff.tempHp = { before: before.temp, after: after.temp };
  if (before.exhaustion !== after.exhaustion) {
    diff.exhaustion = { before: before.exhaustion, after: after.exhaustion };
  }

  const gained = after.statuses.filter(s => !before.statuses.includes(s));
  if (gained.length) diff.conditionsGained = gained;

  const lost = before.statuses.filter(s => !after.statuses.includes(s));
  if (lost.length) diff.conditionsLost = lost;

  const beforeNames = before.effects.map(e => e.name);
  const addedEffects = after.effects.filter(e => !beforeNames.includes(e.name));
  if (addedEffects.length) diff.effectsAdded = addedEffects;

  return diff;
}

/**
 * Describe the use being recorded.
 *
 * Split out of the hook so the hook body stays legible and its branching stays
 * small; this is a description, not a decision.
 * @param {object} activity
 * @param {object} [usageConfig]
 * @returns {object}
 */
function describeUse(activity, usageConfig) {
  const item = activity?.item ?? {};
  return {
    activityType: activity?.type ?? null,
    activityName: activity?.name ?? null,
    itemType: item.type ?? null,
    actorId: item.actor?.id ?? null,
    actorUuid: item.actor?.uuid ?? null,
    tokenId: item.actor?.token?.id ?? null,
    // Whether something was targeted changes what the result means, so it is
    // part of the record rather than an assumption.
    targeted: game.user?.targets?.size ?? 0,
    consumeResources: usageConfig?.consumeResources ?? null,
  };
}

/**
 * Begin recording a use.
 * @param {object} item
 * @param {object} context - Whatever is already known about the use
 * @param {string} [startedAt] - When the use started, from the pre-use hook
 */
function begin(item, context, startedAt) {
  const actor = item.actor ?? null;
  const targets = Array.from(game.user?.targets ?? [])
    .map(t => t.actor)
    .filter(Boolean);

  active = {
    itemUuid: item.uuid,
    itemName: item.name,
    // The pre-use timestamp, so the record's clock matches when the user acted
    // rather than when the card happened to be created.
    startedAt: startedAt ?? new Date().toISOString(),
    completed: false,
    context,
    actor: actor ? snapshotActor(actor) : null,
    targets: targets.map(snapshotActor),
    targetNames: targets.map(t => t.name),
    messages: [],
    errors: [],
  };
}

/**
 * Attach a chat message to the in-flight recording.
 *
 * Only messages from the acting actor's speaker are kept, so unrelated table
 * chatter that happens during the settle window does not end up attributed to the
 * ability.
 * @param {ChatMessage} message
 */
function captureMessage(message) {
  if (active.messages.length >= MAX_MESSAGES) return;

  const speaker = message.speaker ?? {};
  const sameActor = (message.actor?.uuid ?? '') === active.context.actorUuid;
  const sameSpeaker =
    speaker.actor === active.context.actorId || speaker.token === active.context.tokenId;
  if (!sameActor && !sameSpeaker) return;

  active.messages.push({
    speaker: message.speaker?.alias ?? null,
    // The rendered HTML is stripped to text: the agent reasons about the
    // numbers and the wording, and raw markup is noise that inflates the log.
    text: stripHtml(message.content ?? ''),
    rolls: (message.rolls ?? []).map(r => ({
      formula: r.formula,
      total: r.total,
      // Individual die faces matter when a result looks wrong: a total of 3 from
      // 1d20+5 is a very different problem from a total of 3 from 4d6.
      dice: (r.dice ?? []).flatMap(d => (d.results ?? []).map(res => res.result)),
    })),
  });
}

/**
 * Strip HTML to readable text.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Capture the usage card itself as evidence.
 *
 * The card is the message dnd5e built for this specific activity use, so it is
 * stronger evidence than anything scraped from the chat log: it cannot be the
 * wrong message, and its rolls are the ones this activity just made. Core chat
 * capture still runs as a backstop, because a module may post additional cards
 * that matter.
 * @param {object} card
 */
function captureCard(card) {
  if (!active || !card) return;
  const rolls = card.rolls ?? [];
  const text = rolls.length
    ? rolls.map(r => `${r.formula} = ${r.total}`).join('; ')
    : stripHtml(card.content ?? '').slice(0, 400);

  active.messages.push({ speaker: card.speaker?.alias ?? null, text, rolls: [], fromCard: true });
}

/**
 * Finish the recording and write it to the item.
 * @returns {Promise<object|null>}
 */
async function finish() {
  const run = active;
  active = null;
  clearTimers();
  if (!run) return null;

  const item = await fromUuid(run.itemUuid).catch(() => null);
  if (!item) {
    logger.warn(`Could not record a run: item ${run.itemUuid} no longer resolves`);
    return null;
  }

  const actorAfter = item.actor ? snapshotActor(item.actor) : null;

  const observed = {
    at: run.startedAt,
    // Who and what, so a record is readable without cross-referencing ids.
    item: { uuid: run.itemUuid, name: run.itemName },
    actor: run.actor
      ? { name: run.actor.name, changes: diffActor(run.actor, actorAfter ?? run.actor) }
      : null,
    targets: run.targets.map(before => {
      const after = resolveTarget(before.uuid);
      return {
        name: before.name,
        changes: after ? diffActor(before, after) : null,
        // A target that cannot be re-read is reported rather than silently
        // shown as unchanged, because "we could not look" is not "nothing
        // happened".
        note: after ? undefined : 'the target could not be re-read after the use',
      };
    }),
    chat: run.messages,
    errors: run.errors.length ? run.errors : undefined,
    ...caveatsFor(run),
  };

  try {
    await recordRun(item, observed);
    logger.info(`Recorded a run of ${run.itemName}`);
  } catch (err) {
    logger.error(`Failed to write the record for ${run.itemName}`, err);
  }

  return observed;
}

/**
 * What this record could not see.
 *
 * Stated plainly, because an incomplete record must not be read as evidence that
 * nothing happened. Two different gaps are worth naming separately: no chat at
 * all, and a workflow that never reported finishing - the latter usually means it
 * threw, or is still running on a slow world, so the after-snapshot is early.
 * @param {object} run
 * @returns {object}
 */
function caveatsFor(run) {
  const caveats = [];
  if (!run.messages.length) caveats.push('no chat output was captured for this use');
  if (!run.completed) {
    caveats.push(
      'the use did not report completing before the record was written, so changes made after this point are missing'
    );
  }
  return caveats.length ? { caveat: caveats.join('; ') } : {};
}

/**
 * Re-read a target actor by uuid, for the after-snapshot.
 * @param {string} uuid
 * @returns {object|null}
 */
function resolveTarget(uuid) {
  const actor = globalThis.game?.actors?.contents?.find(a => a.uuid === uuid);
  return actor ? snapshotActor(actor) : null;
}

/**
 * Register the hooks that drive recording.
 *
 * FOUR HOOKS, EACH DOING ONE JOB
 *
 * `preUseActivity` takes the before-snapshot, because concentration and resource
 * consumption happen immediately after it. `preCreateUsageMessage` promotes the
 * pending use to active, and is the point of no return: dnd5e only builds a usage
 * card when the use is actually going ahead, so a cancelled dialog never starts a
 * recording. `postCreateUsageMessage` captures the card as direct evidence.
 * `postUseActivity` notes that the workflow finished, which is what lets `finish`
 * say whether it waited or settled.
 *
 * `createChatMessage` and `error` remain, because a module posting an extra card
 * or an error mid-workflow is exactly the thing a bare record would miss.
 *
 * Called once at module load. Kept as a function rather than top-level side
 * effects so a test can load this module without wiring hooks into a world.
 */
export function registerAbilityRecorder() {
  Hooks.on('dnd5e.preUseActivity', (activity, _usageConfig, _dialogConfig, _messageConfig) => {
    const item = activity?.item;
    if (!item || !shouldRecord(item)) return;

    pending = {
      item,
      context: describeUse(activity, _usageConfig),
      startedAt: new Date().toISOString(),
    };
  });

  Hooks.on('dnd5e.preCreateUsageMessage', activity => {
    const item = activity?.item;
    // Only promote the pending use if it is this item's, so an unrelated activity
    // firing concurrently cannot hijack the recording.
    if (!pending || !item || pending.item.uuid !== item.uuid) return;

    begin(pending.item, pending.context, pending.startedAt);
    pending = null;

    // NOT a fixed timer from here. dnd5e creates the card, then runs
    // `_finalizeUsage` - which places measured templates and AWAITS the user - and
    // only then fires `postUseActivity`. So the workflow is still in progress at
    // this point for anything with an area: the effect, the damage and the save all
    // land after the template is placed. Recording on a timer from here captured a
    // half-finished workflow and reported the rest as "did not report completing".
    //
    // The record is written when `dnd5e.postUseActivity` says the workflow is done.
    // This timer is only the ceiling for a workflow that never reports finishing.
    clearTimers();
    maxWaitTimer = setTimeout(() => {
      logger.warn(`A use of ${active?.itemName ?? 'an item'} never reported finishing; recording anyway`);
      void finish();
    }, MAX_WAIT_MS);
  });

  // The card dnd5e built for this use. Captured directly rather than scraped,
  // because it cannot be the wrong message.
  Hooks.on('dnd5e.postCreateUsageMessage', (_activity, card) => captureCard(card));

  // The workflow finished - templates placed, effects applied. Give the remaining
  // modules a moment to post their chat cards, then write the record.
  Hooks.on('dnd5e.postUseActivity', () => {
    if (!active) return;
    active.completed = true;
    clearTimers();
    settleTimer = setTimeout(() => void finish(), SETTLE_MS);
  });

  // Chat output during the window is the primary evidence: it holds the rolls and
  // the wording the user will describe back.
  Hooks.on('createChatMessage', message => {
    if (active) captureMessage(message);
  });

  // An error mid-workflow is worth capturing: it explains an empty result far
  // better than "nothing happened".
  Hooks.on('error', (location, error) => {
    if (!active) return;
    active.errors.push({
      location: String(location).slice(0, 200),
      message: String(error?.message ?? error).slice(0, 500),
    });
  });

  logger.info('Ability recorder registered');
}
