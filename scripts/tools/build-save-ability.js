/**
 * Build Save Ability
 *
 * Writes a save-based automation — "target rolls a save; on failure X happens,
 * on success Y happens" — onto an actor as a dnd5e Feature item.
 *
 * The shape it writes (all verified against dnd5e 5.3.3 source):
 *
 *   Item (type "feat")
 *     system.identifier .............. the upsert key
 *     system.activities.<id> ......... the save activity
 *     system.uses .................... per-day / recharge limits
 *     effects.<id> ................... the ActiveEffect this activity applies
 *     effect.system.changes[] ........ DAE changes; macro.StatusEffect applies a condition
 *     effect.flags.midi-qol.OverTime . the repeating save
 *     effect.flags.cat.identifier ..... how CAT finds the effect
 *
 * Two details are easy to get wrong and both are load-bearing:
 *
 * 1. A save activity only applies its effects to targets that FAILED, except for
 *    entries flagged `onSave: true` which apply to everyone. So `effect.onSave`
 *    is the "applies on failure only" switch, not the damage setting.
 *
 * 2. dnd5e computes the save DC from `activity.range` (the ability's own range),
 *    never from `activity.target`. A 30 ft ability with a 5 ft area puts 30 in
 *    range and 5 in target.template.size. Putting the range in `target` silently
 *    changes the DC for any token in play.
 *
 * The tool is idempotent: it finds the item by identifier and updates in place.
 * Rebuilding after a correction is therefore an update, not a duplicate — which
 * is what makes the build/test/rebuild loop safe to run unattended.
 */

import { BaseTool } from './base-tool.js';
import { takeSpec } from '../core/spec-store.js';
import {
  SAVE_ABILITY_SPEC,
  validateSpec,
  getSpecNumber,
  getSpecString,
  getSpecBoolean,
  deriveIdentifier,
  resolveActor,
} from '../core/automation-spec.js';

/**
 * Build the midi-qol OverTime string for a repeating save.
 *
 * This is how "repeat the save at the end of each turn, end on a success" is
 * expressed: midi rolls the save on the target's turn and removes the effect
 * once it succeeds.
 * @param {object} spec
 * @returns {string|undefined}
 */
function buildOverTimeFlag(spec) {
  if (!getSpecBoolean(spec, 'repeatSave')) return undefined;

  const parts = [
    `turn=${getSpecString(spec, 'repeatSaveTurn') ?? 'end'}`,
    `saveDC=${getSpecNumber(spec, 'repeatSaveDc') ?? getSpecNumber(spec, 'save.dc') ?? 10}`,
    `saveAbility=${getSpecString(spec, 'repeatSaveAbility') ?? getSpecString(spec, 'save.ability') ?? 'dex'}`,
    `label="${getSpecString(spec, 'name') ?? 'Repeating Save'}"`,
  ];

  // "N-" means: remove the overtime effect after N successful saves.
  if (getSpecBoolean(spec, 'repeatSaveRemoveOnSuccess', true)) parts.push('saveCount=1-');

  return parts.join(',');
}

/**
 * Assemble the item's system data.
 * @param {object} spec
 * @param {string} identifier
 * @returns {object}
 */
function buildItemSystem(spec, identifier) {
  const system = {
    identifier,
    type: { value: 'monster', subtype: '' },
    description: { value: '' },
  };

  const notes = getSpecString(spec, 'notes');
  if (notes) system.description.value = `<p>${notes}</p>`;

  const usesMax = getSpecNumber(spec, 'uses.max');
  if (usesMax !== undefined) {
    system.uses = {
      max: String(usesMax),
      spent: 0,
      recovery: [
        {
          period: getSpecString(spec, 'uses.period') ?? 'day',
          type: getSpecString(spec, 'uses.recovery') ?? 'recoverAll',
        },
      ],
    };
  }

  return system;
}

/**
 * Build the activity's `range`, which is where dnd5e also reads the ability's
 * own range for display and for DC computation.
 * @param {object} spec
 * @returns {object}
 */
function buildActivityRange(spec) {
  const value = getSpecNumber(spec, 'range.value');
  return {
    units: getSpecString(spec, 'range.units') ?? 'ft',
    // RangeField.value is a formula field, so a bare number is stringified.
    value: value !== undefined ? String(value) : '',
    override: true,
  };
}

/**
 * Build the activity's `target`, which carries the AREA, never the range.
 *
 * Mixing the two up changes the save DC for every token in play, because dnd5e
 * derives the DC from the ability's range rather than from this field. A 30 ft
 * ability with a 5 ft area is range 30 / template size 5.
 * @param {object} spec
 * @returns {object}
 */
function buildActivityTarget(spec) {
  const templateType = getSpecString(spec, 'target.type');
  const templateSize = getSpecNumber(spec, 'target.size');
  const targetCount = getSpecNumber(spec, 'target.count');

  const target = {
    affects: { count: '', type: '', choice: false, special: '' },
    template: {
      contiguous: false,
      stationary: false,
      units: 'ft',
      count: '',
      type: templateType ?? '',
      size: templateSize !== undefined ? String(templateSize) : '',
    },
    override: Boolean(templateType),
    prompt: true,
  };

  const width = getSpecNumber(spec, 'target.width');
  if (width !== undefined) target.template.width = String(width);

  // A plain "up to N targets" ability has no template, just a creature count.
  if (targetCount !== undefined && !templateType) {
    target.affects.count = String(targetCount);
    target.affects.type = 'creature';
  }

  return target;
}

/**
 * Build the activity's damage block, if the ability deals damage.
 * @param {object} spec
 * @returns {object}
 */
function buildActivityDamage(spec) {
  const formula = getSpecString(spec, 'damage.formula');
  if (!formula) return { onSave: 'half', parts: [] };

  const type = getSpecString(spec, 'damage.type');
  return {
    onSave: getSpecString(spec, 'damage.onSave') ?? 'half',
    parts: [
      {
        number: null,
        denomination: null,
        bonus: formula,
        types: type ? [type] : [],
        custom: { enabled: false, formula: '' },
      },
    ],
  };
}

/**
 * Build the activation and duration blocks.
 * @param {object} spec
 * @returns {{activation: object, duration: object}}
 */
function buildActivityTime(spec) {
  const activation = { type: getSpecString(spec, 'activation.type') ?? 'action' };
  const activationValue = getSpecNumber(spec, 'activation.value');
  if (activationValue !== undefined) activation.value = activationValue;

  const activationCondition = getSpecString(spec, 'activation.condition');
  if (activationCondition) activation.condition = activationCondition;

  const duration = { units: getSpecString(spec, 'duration.units') ?? 'inst' };
  const durationValue = getSpecNumber(spec, 'duration.value');
  if (durationValue !== undefined) duration.value = durationValue;
  if (getSpecBoolean(spec, 'duration.concentration')) duration.concentration = true;

  return { activation, duration };
}

/**
 * Assemble the save activity.
 * @param {object} spec
 * @param {string|null} effectId - The effect this activity applies
 * @returns {object}
 */
function buildSaveActivity(spec, effectId) {
  const { activation, duration } = buildActivityTime(spec);

  const activity = {
    type: 'save',
    name: getSpecString(spec, 'name') ?? 'Save',
    activation,
    consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
    description: { chatFlavor: '' },
    duration,
    effects: effectId
      ? [{ _id: effectId, onSave: false }] // false => failed saves only
      : [],
    range: buildActivityRange(spec),
    save: {
      ability: [getSpecString(spec, 'save.ability') ?? 'dex'],
      // An empty calculation means "use the literal formula", which is how a
      // fixed statblock DC is expressed.
      dc: {
        calculation: '',
        formula: String(getSpecNumber(spec, 'save.dc') ?? 10),
      },
    },
    target: buildActivityTarget(spec),
    damage: buildActivityDamage(spec),
  };

  return activity;
}

/**
 * Assemble the ActiveEffect the activity applies on failure.
 *
 * The effect carries two mechanisms:
 *   changes[macro.StatusEffect]  - DAE applies the condition id to the target
 *   flags.midi-qol.OverTime      - the repeating save
 * Damage is not stored here; it belongs to the activity.
 * @param {object} spec
 * @param {string} identifier
 * @param {string} effectId - Id the activity will reference
 * @returns {object} The effect data
 */
function buildAppliedEffect(spec, identifier, effectId) {
  const condition = getSpecString(spec, 'condition');
  const overTime = buildOverTimeFlag(spec);

  const changes = condition
    ? [{ key: 'macro.StatusEffect', mode: 0, value: condition, priority: 20 }]
    : [];

  const flags = { cat: { identifier, config: {} } };
  if (overTime) flags['midi-qol'] = { OverTime: overTime };

  const conditionLevel = getSpecNumber(spec, 'conditionLevel');
  if (condition && conditionLevel !== undefined) flags.cat.conditionLevel = conditionLevel;

  // A rider that only lands when the save fails badly, e.g. "fails by 5 or more".
  const failsBy = getSpecNumber(spec, 'damage.failsBy');
  const failsByCondition = getSpecString(spec, 'damage.failsByCondition');
  if (failsBy !== undefined && failsByCondition) {
    flags.cat.failsBy = { amount: failsBy, condition: failsByCondition };
  }

  return {
    _id: effectId,
    name: condition
      ? `Condition: ${condition}`
      : `${getSpecString(spec, 'name') ?? 'Effect'} (ongoing)`,
    img: 'icons/svg/aura.svg',
    transfer: false, // applied by the activity, not carried passively by the item
    disabled: false,
    // Duration left at defaults: the effect ends when the condition is removed
    // or the repeating save succeeds, both of which DAE and midi handle.
    duration: { startTime: null, seconds: null, rounds: null, turns: null },
    system: { changes },
    flags,
  };
}

/** The subset of the item we own. Everything else is left as dnd5e prepared it. */
function buildItemData(spec, identifier) {
  // The activity and its effect reference each other, so the effect id is
  // minted here and handed to both.
  const effectId = foundry.utils.randomID();
  const condition = getSpecString(spec, 'condition');
  const needsEffect = Boolean(condition) || getSpecBoolean(spec, 'repeatSave');

  const activity = buildSaveActivity(spec, needsEffect ? effectId : null);
  const effect = needsEffect ? buildAppliedEffect(spec, identifier, effectId) : null;

  return { system: buildItemSystem(spec, identifier), activity, effect };
}

export class BuildSaveAbilityTool extends BaseTool {
  constructor() {
    super(
      'build_save_ability',
      'Create or update a save-based ability on an actor: a dnd5e Feature with a save activity, optional damage, an applied effect (usually a condition) and optional repeating save. Use this for "save or suffer" and "save or take damage" abilities. Prefer calling preview_spec first and passing the previewToken; the user\'s edited values are then used verbatim. Rebuilding the same identifier updates the existing item instead of duplicating it.'
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        previewToken: {
          type: 'string',
          description:
            'Token returned by preview_spec. When supplied, the user\'s edited spec is read from it and the "spec" argument is ignored. Preferred over passing a spec, because it uses exactly what the user confirmed.',
        },
        spec: {
          type: 'object',
          description:
            'The ability spec, used only when no previewToken is given. Keys are dotted paths such as "save.ability", "save.dc", "condition", "range.units". Unrecognised keys are reported as warnings rather than rejected.',
        },
        actor: {
          type: 'string',
          description:
            'Actor id, name or UUID reference to receive the ability. Only needed when the spec does not already carry an "actor" value.',
        },
      },
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async getConfirmationDetails(params) {
    const spec = params.previewToken ? null : params.spec;
    const name = spec?.name || (params.previewToken ? 'edited preview' : 'ability');
    return {
      type: 'build',
      title: `Build: ${name}`,
      details: `Creates or updates a Feature item with a save activity${
        spec?.condition ? ` that applies "${spec.condition}" on a failed save` : ''
      }.`,
    };
  }

  /**
   * Resolve the spec, attach the actor, and validate.
   * @param {object} params
   * @returns {{spec?: object, actor?: object, name?: string, identifier?: string,
   *   warnings?: string[], error?: object}}
   */
  _prepare(params) {
    const { spec, error: specError } = this._resolveSpec(params);
    if (specError) return { error: specError };

    // The actor is a spec value so it survives the preview round-trip, but a
    // direct argument is accepted for the case where the agent already knows it.
    if (params.actor && getSpecString(spec, 'actor') === undefined) spec.actor = params.actor;

    const actorResult = resolveActor(getSpecString(spec, 'actor'));
    if (!actorResult.ok) {
      return {
        error: this._reject(actorResult.guidance, actorResult.error, 'ACTOR_UNRESOLVED'),
      };
    }

    const validation = validateSpec(spec, SAVE_ABILITY_SPEC, {
      required: ['save.ability', 'save.dc', 'name'],
    });
    if (!validation.ok) {
      return {
        error: this._reject(
          {
            ok: false,
            error: 'The spec was rejected. Fix the named fields and call build_save_ability again.',
            errors: validation.errors,
          },
          `build_save_ability rejected: ${validation.errors.length} spec error(s)`,
          'SPEC_VALIDATION_ERROR'
        ),
      };
    }

    const name = getSpecString(spec, 'name');
    return {
      spec,
      actor: actorResult.actor,
      name,
      identifier: getSpecString(spec, 'identifier') || deriveIdentifier(name),
      warnings: validation.warnings,
    };
  }

  /** @param {object} params */
  async execute(params) {
    if (!game.user?.isGM) {
      return this._reject('Only a GM can build automations.', 'GM required', 'PERMISSION_DENIED');
    }

    const prepared = this._prepare(params);
    if (prepared.error) return prepared.error;

    const { spec, actor, name, identifier, warnings } = prepared;
    const { system, activity, effect } = buildItemData(spec, identifier);

    try {
      const result = await this._upsert(actor, { identifier, name, system, activity, effect });
      return this._success(result, warnings, actor, identifier);
    } catch (err) {
      this.logger.error('build_save_ability failed', err);
      return this._reject(
        {
          ok: false,
          error: `Writing the item failed: ${err.message}`,
          hint:
            'This is a world-write failure, not a spec problem. Check that the actor is editable and still exists, then retry once.',
        },
        `Build failed: ${err.message}`,
        'WRITE_FAILED'
      );
    }
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
          {
            ok: false,
            error: 'Supply either "previewToken" (preferred) or a "spec" object.',
          },
          'Missing spec',
          'VALIDATION_ERROR'
        ),
      };
    }

    return { spec: params.spec, error: null };
  }

  /**
   * Find an existing item by identifier and update it, else create one.
   *
   * Upsert-by-identifier is what makes the build/test/rebuild loop safe: a
   * correction produces one item, not one per attempt.
   * @param {object} actor
   * @param {object} payload - { identifier, name, system, activity, effect }
   * @returns {Promise<{created: boolean, item: object, activityId: string, effectId: string|null}>}
   */
  async _upsert(actor, { identifier, name, system, activity, effect }) {
    const existing = actor.items.find(
      i => i.type === 'feat' && i.system?.identifier === identifier
    );

    // The authored regions are replaced wholesale so a rebuild cannot leave a
    // stale activity or effect behind from a previous attempt.
    const update = {
      name,
      system,
      activities: [activity],
      effects: effect ? [effect] : [],
    };

    if (existing) {
      await existing.update(update);
      return {
        created: false,
        item: existing,
        activityId: existing.system.activities.contents[0]?.id ?? '',
        effectId: effect ? existing.effects.contents[0]?.id ?? null : null,
      };
    }

    const [created] = await actor.createEmbeddedDocuments('Item', [
      { ...update, type: 'feat' },
    ]);
    return {
      created: true,
      item: created,
      activityId: created.system.activities.contents[0]?.id ?? '',
      effectId: effect ? created.effects.contents[0]?.id ?? null : null,
    };
  }

  /** Assemble a successful response. */
  _success(result, warnings, actor, identifier) {
    const { created, item, activityId, effectId } = result;

    return {
      content: JSON.stringify(
        {
          ok: true,
          action: created ? 'created' : 'updated',
          itemUuid: item.uuid,
          itemId: item.id,
          activityUuid: activityId ? `${item.uuid}.Activity.${activityId}` : null,
          effectUuid: effectId ? `${item.uuid}.ActiveEffect.${effectId}` : null,
          actorUuid: actor.uuid,
          identifier,
          warnings: warnings.length ? warnings : undefined,
          next: `Run test_ability with itemUuid "${item.uuid}" to verify the build against the token you have targeted.`,
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
      content: JSON.stringify(
        typeof body === 'string' ? { ok: false, error: body } : body,
        null,
        2
      ),
      display,
      error: { message: String(message ?? display), type },
    };
  }
}
