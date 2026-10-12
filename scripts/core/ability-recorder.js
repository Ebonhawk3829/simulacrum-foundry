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
 * Core Foundry document hooks rather than midi-qol's workflow hooks. midi
 * generates its hook names from an internal state table (`pre<State>` /
 * `post<State>`, see `Workflow.stateHooks`), so binding to them couples this to
 * midi's internals and a version bump would silently stop the recording. The
 * core hooks are a stable public API and, because midi routes its results
 * through ordinary document updates, they capture what actually happened
 * regardless of which module produced it.
 *
 * Nothing here decides whether an outcome is correct. It records facts and says
 * what it could not see, and the judgement happens in conversation.
 */

import { createLogger } from '../utils/logger.js';
import { shouldRecord, recordRun } from './verification-state.js';

const logger = createLogger('AbilityRecorder');

/** How long to keep collecting after a use before writing the record. */
const SETTLE_MS = 800;

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
 * Resolve the actor the recorder should watch for a given chat message.
 *
 * Uses the message's speaker, which is where Foundry already records who acted.
 * An unlinked token's actor is preferred over the base actor because an unlinked
 * token's changes do not touch the base actor and would otherwise look like
 * nothing happened.
 * @param {ChatMessage} message
 * @returns {object|null}
 */
function speakerActor(message) {
  const speaker = message?.speaker;
  if (!speaker) return null;

  if (speaker.token && speaker.scene) {
    const scene = game.scenes?.get(speaker.scene);
    const token = scene?.tokens?.get(speaker.token);
    if (token?.actor) return token.actor;
  }

  return game.actors?.get(speaker.actor) ?? null;
}

/**
 * Begin recording a use.
 * @param {object} item
 * @param {object} context - Whatever is already known about the use
 */
function begin(item, context) {
  const actor = item.actor ?? null;
  const targets = Array.from(game.user?.targets ?? [])
    .map(t => t.actor)
    .filter(Boolean);

  active = {
    itemUuid: item.uuid,
    itemName: item.name,
    startedAt: new Date().toISOString(),
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
 * Finish the recording and write it to the item.
 * @returns {Promise<object|null>}
 */
async function finish() {
  const run = active;
  active = null;
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
    actor: run.actor ? { name: run.actor.name, changes: diffActor(run.actor, actorAfter ?? run.actor) } : null,
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
    // Stated plainly so an empty result is not mistaken for a broken ability.
    caveat: run.messages.length ? undefined : 'no chat output was captured for this use',
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
 * Called once at module load. Kept as a function rather than top-level side
 * effects so a test can load this module without wiring hooks into a world.
 */
export function registerAbilityRecorder() {
  // dnd5e fires this for a roll initiated from a sheet. midi-qol routes item uses
  // through the same activity path, so this catches both entry points.
  Hooks.on('dnd5e.useActivity', (activity, usageConfig, dialogConfig, messageConfig) => {
    const item = activity?.item;
    if (!item || !shouldRecord(item)) return;

    begin(item, {
      activityType: activity?.type ?? null,
      activityName: activity?.name ?? null,
      itemType: item.type ?? null,
      actorId: item.actor?.id ?? null,
      actorUuid: item.actor?.uuid ?? null,
      tokenId: item.actor?.token?.id ?? null,
      // Whether the user had something targeted changes what the result means,
      // so it is part of the record rather than an assumption.
      targeted: game.user?.targets?.size ?? 0,
      consumeResources: usageConfig?.consumeResources ?? null,
    });

    // The settle window exists because effects are applied asynchronously and a
    // record read immediately would show nothing. Its length is a guess tuned for
    // a normal world; a very slow workflow would under-record, which is why a
    // missing chat record is called out in the output.
    setTimeout(() => void finish(), SETTLE_MS);
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
