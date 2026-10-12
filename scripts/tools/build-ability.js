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
import { buildItemSystem } from '../core/dnd5e/item-builders.js';
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
 * What the agent is asked for.
 *
 * Held here rather than inline so the constructor stays short and the parameter
 * contract reads as one block.
 */
const ABILITY_PARAMS = Object.freeze({
  spec: {
    type: 'object',
    description:
      'The ability data. Recognised keys: "actor", "name", "identifier", "itemType", "notes", "uses" (max/period/recovery/rechargeMin). Any other key is passed through to the item\'s system data unchanged, so dnd5e fields and module flags you author are not lost.',
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
      details: `Creates or updates a ${type} item${
        kinds.length ? ` with ${kinds.length} activity (${kinds.join(', ')})` : ''
      }.`,
    };
  }

  /** @param {object} params */
  async execute(params) {
    if (!game.user?.isGM) {
      return this._reject('Only a GM can build automations.', 'GM required', 'PERMISSION_DENIED');
    }

    const prepared = this._prepare(params);
    if (prepared.error) return prepared.error;

    const { spec, actor, name, identifier, itemType, activities, effects, replace } = prepared;

    try {
      const result = await this._write(actor, {
        identifier,
        name,
        itemType,
        spec,
        activities,
        effects,
        replace,
      });

      // The build is a hypothesis until it has been used in play. Marking it here
      // is what turns the recorder on for this item, and clearing the mark later
      // is what turns it off again.
      await markNeedsTesting(result.item, {
        intent: params.intent ?? getSpecString(spec, 'notes') ?? null,
        expect: params.expect ?? null,
      });

      return this._success({ result, actor, identifier, itemType, replace });
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
    return {
      spec,
      actor,
      name,
      identifier: getSpecString(spec, 'identifier') || deriveIdentifier(name),
      itemType: params.itemType ?? getSpecString(spec, 'itemType') ?? 'feat',
      activities: this._normaliseActivities(params.activities ?? spec.activities ?? []),
      effects: params.effects ?? spec.effects ?? [],
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
   * Only the regions being authored are replaced, so anything the caller set on
   * the item separately survives a rebuild.
   * @param {object} actor
   * @param {object} payload
   * @returns {Promise<{created: boolean, item: object}>}
   */
  async _write(actor, { identifier, name, itemType, spec, activities, effects, replace }) {
    const existing = actor.items.find(
      i => i.system?.identifier === identifier && i.type === itemType
    );

    const update = { name, system: buildItemSystem(spec, identifier) };

    if (activities.length) {
      const current = existing?.system?.activities?.contents ?? [];
      update.activities = replace ? activities : [...current, ...activities];
    } else if (replace) {
      update.activities = [];
    }

    if (effects.length || replace) update.effects = effects;

    if (existing) {
      await existing.update(update);
      return { created: false, item: existing };
    }

    const [created] = await actor.createEmbeddedDocuments('Item', [{ ...update, type: itemType }]);
    return { created: true, item: created };
  }

  /**
   * Assemble a successful response.
   *
   * Activity and effect ids are returned because the agent needs them to author
   * flags that reference them, and reading them back would be an extra round
   * trip it should not have to make.
   * @param {object} options
   * @returns {object}
   */
  _success({ result, actor, identifier, itemType, replace }) {
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
          effects: (item.effects?.contents ?? []).map(e => ({ id: e.id, name: e.name })),
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
