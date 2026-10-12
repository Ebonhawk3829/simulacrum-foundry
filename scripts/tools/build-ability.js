/**
 * Build Ability — write an ability onto an actor.
 *
 * WHAT THIS TOOL IS, AND WHAT IT IS NOT
 *
 * It is a WRITE tool. The agent decides what the ability is; this tool decides
 * how to put it on the sheet safely. It has no opinion about kinds of ability,
 * holds no list of ability shapes, and knows no vocabulary beyond dnd5e's own
 * field names.
 *
 * It deliberately does not enumerate ability "archetypes". An earlier design
 * offered the model a closed list of seventeen, which turned out to be a worse
 * copy of a list the ecosystem already maintains: Coven's Automation Toolkit
 * ships generic macros (attackRider, contestedCheck, extraAttack, ...) and
 * Chris's Premades ships hundreds of configured ones. A hard-coded list would
 * also silently reject anything it had not foreseen, and an in-game agent is at
 * least as good at recognising a new shape as the person who wrote the list.
 *
 * So the interface is: give me the data. Everything else — which activities,
 * which flags, which effects, which CAT generic — is authored by the caller.
 *
 * WHY IT STILL EXISTS RATHER THAN USING document_create DIRECTLY
 *
 * Three things are fiddly enough to get wrong silently, and get wrong the same
 * way every time:
 *
 *   1. Idempotency. An ability is identified by `system.identifier`, not by
 *      name. Rebuilding must UPDATE the item it made last time, because the
 *      build/test/rebuild loop would otherwise litter the sheet with duplicates
 *      and the user could not tell which one their macro was pointing at.
 *   2. Wholesale replacement of authored regions. A narrowing rebuild must not
 *      leave a stale activity or effect from the previous attempt behind.
 *   3. Not clobbering what the caller did not author. A rebuild writes the
 *      activities and effects it was given and touches nothing else, so a
 *      weapon's damage or an effect's changes survive.
 *
 * Those are safety properties, not mechanics, and they belong in one place.
 */

import { BaseTool } from './base-tool.js';
import { getSpecString, deriveIdentifier, resolveActor } from '../core/automation-spec.js';
import { takeSpec } from '../core/spec-store.js';
import { buildItemSystem, buildItemFlags } from '../core/dnd5e/item-builders.js';
import { buildEmbeddedMacros } from '../core/dnd5e/script-authoring.js';
import { inferActivityType } from '../core/dnd5e/activity-builders.js';
import { markNeedsTesting } from '../core/verification-state.js';
/**
 * Document types an ability is normally written as, and what each is for.
 *
 * Offered as help, never enforced. dnd5e's item types are a fixed list the agent
 * can also discover with `list_document_schemas`, so this is a convenience for
 * the common cases rather than a gate.
 */
const ITEM_TYPES = Object.freeze([
  'feat',
  'weapon',
  'equipment',
  'consumable',
  'spell',
  'tool',
  'loot',
  'container',
]);

/**
 * The activity clause of a confirmation summary.
 * @param {string[]} kinds
 * @returns {string}
 */
function describeActivities(kinds) {
  return kinds.length ? ` with ${kinds.length} activity (${kinds.join(', ')})` : '';
}

/**
 * The script clause of a confirmation summary.
 *
 * Scripts are named because approving a build that stores code is a different
 * decision from approving one that sets flags, and the user is the one deciding.
 * @param {object[]} [scripts]
 * @returns {string}
 */
function describeScripts(scripts) {
  const list = Array.isArray(scripts) ? scripts : [];
  if (!list.length) return '';

  const points = list.map(s => `${s?.event ?? '?'}/${s?.pass ?? '?'}`).join(', ');
  const plural = list.length === 1 ? '' : 's';
  return `. Includes ${list.length} script${plural} (${points}) stored as embedded macros`;
}

/**
 * What the agent is asked for.
 *
 * Held here rather than inline so the constructor stays short and the parameter
 * contract reads as one block.
 */
const ABILITY_PARAMS = Object.freeze({
  spec: {
    type: 'object',
    description:
      'The ability data. Recognised keys: "actor", "name", "identifier", "itemType", "notes", "uses" (max/period/recovery/rechargeMin), "flags" (written at the item\'s top level). Any other key is passed through to the item\'s system data unchanged, so dnd5e fields you author are not lost.',
  },
  flags: {
    type: 'object',
    description:
      'Module flags to write at the item\'s TOP LEVEL, keyed by scope: `{ "midi-qol": {...}, dae: {...}, cat: {...}, dnd5e: {...} }`. Use this for behaviour the modules act on rather than anything the item\'s system data holds. `cat.macros` is how an automation is attached (see cat-macro-flags.md), and the generic settings for it are in cpr-generic-config.md.',
  },
  scripts: {
    type: 'array',
    description:
      'JavaScript automations to store ON the item, as CAT embedded macros (flags.cat.embeddedMacros). Use this when the ability needs logic that flags cannot express — reading game state, branching, or calling midi/CPR utilities. Each entry needs "event" and "pass"; see cat-embedded-macros.md for the shape and the rules. Every script is syntax-checked before it is written.',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique on this item. Used in console errors, so name it after the ability.' },
        event: {
          type: 'string',
          description: 'When the script runs. CAT events: roll, save, effect, move, combat, rest, time, aura, summon, check, skill, tool, hitDie, region, token, actor.',
        },
        pass: {
          type: 'string',
          description: 'The point within the event, e.g. "itemRollFinished", "actorTurnStart", "actorMoved". The pass decides what the script can change and what is already decided.',
        },
        macro: { type: 'string', description: 'The script body. Runs as an async function body: `await` works, and `return` is ignored. Variables are provided by scope (see cat-embedded-macros.md). The script may read anything, call utilities, and change the documents in play. Only collection-level writes (Actor.updateDocuments and the like) are refused.' },
        priority: { type: 'number', description: 'Order among scripts on the same pass. Default 0; lower runs first.' },
      },
      required: ['event', 'pass', 'macro'],
    },
  },
  activities: {
    type: 'array',
    description:
      'Activity data to author, one object per activity, keyed by dnd5e\'s activity field names ("type", "name", "activation", "range", "target", "duration", "consumption", "damage", "healing", "save", "attack", "effects", ...). Pass these through in full; nothing here is validated against a fixed shape, because you know the ability and this tool does not.',
    items: { type: 'object' },
  },
  effects: {
    type: 'array',
    description:
      'ActiveEffect data to author on the item. Use "flags" for module configuration (midi-qol, dae, cat) and "system.changes" for DAE change keys such as macro.StatusEffect. Effects are replaced wholesale on rebuild, so include every one the ability needs.',
    items: { type: 'object' },
  },
  itemType: {
    type: 'string',
    description:
      'The dnd5e item type to create. Defaults to "feat". Use "weapon" for an attack that belongs on a weapon, "consumable" for a potion, "spell" for a cast activity, "equipment" for something worn.',
    enum: ITEM_TYPES,
  },
  previewToken: {
    type: 'string',
    description:
      "A token from preview_spec carrying the user's edited values. Supply this or spec, never both, and never re-ask the user for values the preview already collected.",
  },
  replaceActivities: {
    type: 'boolean',
    description:
      "Whether to replace the item's existing activities. Defaults to true, which is what a rebuild wants. Set false to ADD activities to an item that already has some, such as giving an existing weapon an extra attack.",
  },
  intent: {
    type: 'string',
    description:
      'One or two sentences on what the ability is supposed to do, in plain terms. Recorded with the item and shown back when the recorded runs are read, so you can compare what happened against what you meant.',
  },
  expect: {
    type: 'object',
    description:
      'Free-form expectations to check the first runs against, e.g. { "target gains restrained": true, "damage is 4d6 fire": true }. Nothing is validated against a fixed set; this is your own yardstick, stored beside the recorded runs.',
  },
});

export class BuildAbilityTool extends BaseTool {
  constructor() {
    super(
      'build_ability',
      'Create or update an ability on an actor from document data you author yourself. Give the activity data and any effects; this tool handles identity, replacement and the dnd5e system fields. Rebuilding the same identifier updates the existing item instead of duplicating it. Prefer calling preview_spec first and passing the previewToken so the user\'s edited values are used verbatim. To copy an existing automation instead of authoring one, read it with document_read first.'
    );
    this.requiresConfirmation = true;
    this.schema = { type: 'object', properties: ABILITY_PARAMS };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} params */
  async getConfirmationDetails(params) {
    const spec = params.spec ?? {};
    const name = spec.name ?? spec.abilityName ?? 'Ability';
    const type = params.itemType ?? spec.itemType ?? 'feat';
    const list = Array.isArray(params.activities) ? params.activities : [];
    const kinds = list.map(a => a?.type).filter(Boolean);

    return {
      type: 'build',
      title: `Build: ${name}`,
      details: `Creates or updates a ${type} item${describeActivities(kinds)}${describeScripts(params.scripts)}.`,
    };
  }

  /** @param {object} params */
  /**
   * Validate the scripts before anything is written.
   *
   * Kept ahead of the write so a build that cannot be authored in full does not
   * half-land: a broken script is a mistake in the source the agent just produced,
   * and reporting it now costs one retry rather than leaving it on a live item.
   * @param {object[]} scripts
   * @param {string} name
   * @param {string} identifier
   * @returns {{entries: object[], error?: object}}
   */
  _authorScripts(scripts, name, identifier) {
    const authored = buildEmbeddedMacros(scripts, name, identifier);
    if (!authored.errors.length) return { entries: authored.entries };

    return {
      entries: [],
      error: this._reject(
        {
          ok: false,
          error: `The scripts could not be written:\n${authored.errors.map(e => `  - ${e}`).join('\n')}`,
          received: scripts.length,
          hint:
            'Fix the script and retry. A syntax error means the code does not parse; an unsafe-write error means it '
            + 'used a collection-level write. See cat-embedded-macros.md for the shape, the scope variables, and what '
            + 'a script may change.',
        },
        `Script rejected: ${authored.errors[0]}`,
        'SCRIPT_INVALID'
      ),
    };
  }

  /** @param {object} params */
  async execute(params) {
    if (!game.user?.isGM) {
      return this._reject('Only a GM can build automations.', 'GM required', 'PERMISSION_DENIED');
    }

    const prepared = this._prepare(params);
    if (prepared.error) return prepared.error;

    const authored = this._authorScripts(prepared.scripts, prepared.name, prepared.identifier);
    if (authored.error) return authored.error;

    try {
      const result = await this._write(prepared.actor, {
        ...prepared,
        scripts: authored.entries,
      });

      // A write that silently accomplished nothing is worse than a failure: the
      // item looks built and does nothing, and the reason is invisible.
      const empty = this._emptyWrite(result, {
        activities: prepared.activities,
        effects: prepared.effects,
      });
      if (empty) return empty;

      // The build is a hypothesis until it has been used in play. Marking it here
      // is what turns the recorder on for this item, and clearing the mark later
      // is what turns it off again.
      await markNeedsTesting(result.item, {
        intent: params.intent ?? getSpecString(prepared.spec, 'notes') ?? null,
        expect: params.expect ?? null,
      });

      return this._success({
        result,
        actor: prepared.actor,
        identifier: prepared.identifier,
        itemType: prepared.itemType,
        replace: prepared.replace,
        activityErrors: result.activityErrors,
      });
    } catch (err) {
      this.logger.error('build_ability failed', err);
      return this._reject(
        {
          ok: false,
          error: `Writing the item failed: ${err.message}`,
          hint:
            'This is a world-write failure, not a data problem. Check that the actor is editable and still exists, then retry once. If it persists, read the item back with document_read to see what actually landed.',
        },
        `Build failed: ${err.message}`,
        'WRITE_FAILED'
      );
    }
  }

  /**
   * Detect a write that reported success but landed nothing.
   *
   * This exists because it happened. Two builds in a live world returned `ok`
   * with an empty activities array, and the reason was that the data was going
   * somewhere dnd5e does not read. An authored region that comes back empty is
   * now a failure with an explanation rather than a success with a zero in it.
   * @param {object} result
   * @param {object} authored - What the caller asked for
   * @returns {object|null} A rejection, or null when the write landed
   */
  _emptyWrite(result, { activities, effects }) {
    const written = result.item.system?.activities?.contents ?? [];
    const writtenEffects = result.item.effects?.contents ?? [];
    if (!(activities.length && !written.length) && !(effects.length && !writtenEffects.length)) {
      return null;
    }

    return this._reject(
      {
        ok: false,
        error:
          "The item was written but the activities or effects did not land. dnd5e stores activities inside the item's system data, keyed by id, and the effects as an embedded collection. Data placed anywhere else is accepted and then ignored.",
        wanted: {
          activities: activities.map(a => a.type ?? null),
          effects: effects.map(e => e.name ?? null),
        },
        landed: { activityIds: written.map(a => a.id), effectIds: writtenEffects.map(e => e.id) },
        itemUuid: result.item.uuid,
      },
      'Activities or effects did not land',
      'ACTIVITIES_NOT_WRITTEN'
    );
  }

  /**
   * Resolve the spec, actor and authored regions.
   * @param {object} params
   * @returns {object} Either {error} or the prepared values
   */
  _prepare(params) {
    const { spec, error: specError } = this._resolveSpec(params);
    if (specError) return { error: specError };

    if (params.actor && getSpecString(spec, 'actor') === undefined) spec.actor = params.actor;

    const actorResult = resolveActor(getSpecString(spec, 'actor'));
    if (!actorResult.ok) {
      return { error: this._reject(actorResult.guidance, actorResult.error, 'ACTOR_UNRESOLVED') };
    }

    const name = getSpecString(spec, 'name');
    if (!name) {
      return {
        error: this._reject(
          {
            ok: false,
            error: 'The spec needs a "name"; it becomes the item name and derives the identifier.',
          },
          'Missing name',
          'VALIDATION_ERROR'
        ),
      };
    }

    return this._assemble(params, spec, actorResult.actor, name);
  }

  /**
   * Everything the write needs, with defaults applied.
   *
   * Identity is the identifier, never the name: the name is what the user sees
   * and may change, and a rename must not orphan the automation.
   * @param {object} params
   * @param {object} spec
   * @param {object} actor
   * @param {string} name
   * @returns {object}
   */
  _assemble(params, spec, actor, name) {
    // Each `??` chain is one branch, and there are enough of them to cross the
    // complexity cap. Reading them as a block is clearer anyway: this is the list of
    // what the write needs, and every entry has the same "parameter, then spec,
    // then default" shape.
    const firstOf = (...values) => values.find(v => v !== undefined && v !== null);

    return {
      spec,
      actor,
      name,
      identifier: getSpecString(spec, 'identifier') || deriveIdentifier(name),
      itemType: firstOf(params.itemType, getSpecString(spec, 'itemType')) ?? 'feat',
      activities: this._normaliseActivities(firstOf(params.activities, spec.activities) ?? []),
      effects: firstOf(params.effects, spec.effects) ?? [],
      scripts: firstOf(params.scripts, spec.scripts) ?? [],
      flags: params.flags,
      replace: params.replaceActivities ?? true,
    };
  }

  /**
   * Fill in a type for each activity that did not name one.
   *
   * dnd5e requires `type`, and an activity authored without one fails to
   * construct with a message that does not say which activity was at fault.
   * Inferring it from the payload is unambiguous — a save block means a save, an
   * attack block means an attack — so this is a convenience, not a guess about
   * what the ability does.
   * @param {object[]} activities
   * @returns {object[]}
   */
  _normaliseActivities(activities) {
    if (!Array.isArray(activities)) return [];
    return activities.map(activity => {
      if (!activity || typeof activity !== 'object') return activity;
      if (activity.type) return activity;
      return { ...activity, type: inferActivityType(activity) };
    });
  }

  /**
   * Resolve the spec from a preview token or a literal argument.
   * @param {object} params
   * @returns {{spec: object|null, error: object|null}}
   */
  _resolveSpec(params) {
    if (params.previewToken) {
      const entry = takeSpec(params.previewToken);
      if (!entry) {
        return {
          spec: null,
          error: this._reject(
            {
              ok: false,
              error:
                'That previewToken is unknown, expired, or was already used. Previews are single-use so that a build always reflects something the user actually saw.',
              next: 'Call preview_spec again to show a fresh form.',
            },
            'Unknown or used preview token',
            'TOKEN_INVALID'
          ),
        };
      }
      return { spec: entry.spec ?? {}, error: null };
    }

    if (!params.spec || typeof params.spec !== 'object' || Array.isArray(params.spec)) {
      return {
        spec: null,
        error: this._reject(
          { ok: false, error: 'Supply either "previewToken" (preferred) or a "spec" object.' },
          'Missing spec',
          'VALIDATION_ERROR'
        ),
      };
    }

    return { spec: params.spec, error: null };
  }

  /**
   * Create or update the item.
   *
   * WHERE THESE TWO REGIONS ACTUALLY LIVE
   *
   * dnd5e reads an item's activities from `system.activities`, not from a
   * top-level `activities`. The field is `ActivitiesField extends MappingField`,
   * so it is an id-keyed object, and dnd5e's own helpers write it the same way:
   * `item.createActivity()` and `item.updateActivity(id)` both go through
   * `this.update({ [`system.activities.${id}`]: ... })`. Data written to a
   * top-level `activities` key is accepted by the update and then ignored, which
   * is exactly how a build can report success and leave the item inert.
   *
   * Effects are the opposite: they are an embedded ActiveEffect collection, so
   * they go at the top level and each needs an `_id`.
   *
   * Only the regions being authored are replaced, so anything the caller set on
   * the item separately survives a rebuild.
   * @param {object} actor
   * @param {object} payload
   * @returns {Promise<{created: boolean, item: object, activityErrors: string[]}>}
   */
  /**
   * The item-level `flags` to write, or null.
   *
   * Flags belong at the ITEM's top level, not inside `system`. Writing them into
   * system data is how a `flags` key in the spec used to disappear: the document
   * saved, and nothing in midi-qol, DAE or CAT ever saw it.
   * @param {object} spec
   * @param {object} [flags]
   * @param {object[]} [scripts]
   * @returns {object|null}
   */
  _itemFlags(spec, flags, scripts) {
    const out = buildItemFlags(spec, flags) ?? {};

    // Embedded scripts are a flag, so they are merged rather than assigned: a caller
    // passing both `flags.cat` and `scripts` must not have one erase the other.
    if (scripts?.length) out.cat = { ...(out.cat ?? {}), embeddedMacros: scripts };
    return Object.keys(out).length ? out : null;
  }

  /**
   * Clear the parts of an existing item that are being rewritten.
   *
   * Removing by key is how dnd5e deletes an activity: `-=${id}` for the pre-v14 path,
   * the delete sentinel on 14+, and `updateActivity` is the only supported way to
   * change one.
   * @param {object} existing
   * @param {object} update
   */
  _clearForRebuild(existing, update) {
    for (const activity of existing.system?.activities?.contents ?? []) {
      update[`system.activities.-=${activity.id}`] = null;
    }
    update.effects = [];
  }

  async _write(actor, payload) {
    const { identifier, name, itemType, spec, activities, effects, scripts, flags, replace } =
      payload;

    const existing = actor.items.find(
      i => i.system?.identifier === identifier && i.type === itemType
    );

    const update = { name, system: buildItemSystem(spec, identifier) };

    const itemFlags = this._itemFlags(spec, flags, scripts);
    if (itemFlags) update.flags = itemFlags;

    if (existing && replace) this._clearForRebuild(existing, update);

    let item;
    if (existing) {
      await existing.update(update);
      item = existing;
    } else {
      [item] = await actor.createEmbeddedDocuments('Item', [{ ...update, type: itemType }]);
    }

    // Through the document's own API, not by reaching into the data. `createActivity`
    // builds the right class per type and assigns sort for us, and a failure is
    // reported per activity rather than swallowed into a silent empty result.
    const activityErrors = [];
    for (const activity of activities) {
      const { type, ...data } = activity;
      try {
        await item.createActivity(type, data, { renderSheet: false });
      } catch (err) {
        activityErrors.push(`${type}: ${err.message}`);
      }
    }

    if (effects.length) {
      await item.createEmbeddedDocuments(
        'ActiveEffect',
        effects.map(e => ({ ...e, origin: e.origin ?? item.uuid }))
      );
    }

    return { created: !existing, item, activityErrors };
  }

  /**
   * Assemble a successful response.
   *
   * Activity and effect ids are returned because the agent needs them to author
   * flags that reference them, and reading them back would be an extra round
   * trip it should not have to make. Their types and names come back too: an id
   * on its own tells you nothing about whether the right thing landed.
   * @param {object} options
   * @returns {object}
   */
  _success({ result, actor, identifier, itemType, replace, activityErrors }) {
    const { created, item } = result;

    return {
      content: JSON.stringify(
        {
          ok: true,
          action: created ? 'created' : 'updated',
          itemUuid: item.uuid,
          itemId: item.id,
          itemType,
          actorUuid: actor.uuid,
          identifier,
          replacedActivities: replace,
          needsTesting: true,
          activities: (item.system.activities?.contents ?? []).map(a => ({
            id: a.id,
            type: a.type,
            name: a.name,
          })),
          effects: (item.effects?.contents ?? []).map(e => ({
            id: e.id,
            name: e.name,
            disabled: e.disabled ?? false,
          })),
          ...(activityErrors?.length ? { activityErrors } : {}),
          next: `Tell the user the ability is built and marked for testing, and ask them to use it in play the way they normally would. Everything that happens will be recorded. Once they have used it and told you what they saw, call read_ability_runs with itemUuid "${item.uuid}" to see the record, and compare it against what you intended. When the user confirms it behaves correctly, call confirm_ability to stop recording.`,
        },
        null,
        2
      ),
      display: created
        ? `**Built** @UUID[${item.uuid}]{${item.name}} on ${actor.name}`
        : `**Updated** @UUID[${item.uuid}]{${item.name}} on ${actor.name}`,
    };
  }

  /** Build a rejection result. */
  _reject(body, display, type) {
    const message = typeof body === 'string' ? body : body.error;
    return {
      content: JSON.stringify(typeof body === 'string' ? { ok: false, error: body } : body, null, 2),
      display,
      error: { message, type },
    };
  }
}
