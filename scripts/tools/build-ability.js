/**
 * Build Ability
 *
 * The single builder the agent calls. It looks up the archetype in the registry
 * and writes whatever that archetype produces.
 *
 * WHY ONE TOOL INSTEAD OF ONE PER ARCHETYPE
 *
 * There are seventeen archetypes. Seventeen tools would mean seventeen schemas,
 * seventeen permission entries, and seventeen chances for the tool list and the
 * system prompt to disagree — which is exactly the defect that shipped in the
 * first release, where the prompt named four builders that did not exist. One
 * tool that dispatches into a registry cannot drift that way: the `archetype`
 * enum is generated from the registry, so the model is never offered a value
 * nothing can build.
 *
 * The write path is unchanged from the original save builder, because it was
 * already correct: upsert by identifier, replacing the authored regions
 * wholesale so a correction cannot leave a stale activity or effect behind.
 */

import { BaseTool } from './base-tool.js';
import {
  getArchetype,
  archetypeIds,
  listArchetypes,
} from '../core/archetypes/registry.js';
import {
  getSpecString,
  deriveIdentifier,
  validateSpec,
  resolveActor,
} from '../core/automation-spec.js';
import { takeSpec } from '../core/spec-store.js';

export class BuildAbilityTool extends BaseTool {
  constructor() {
    super(
      'build_ability',
      `Create or update an ability on an actor from a spec. The "archetype" chooses what is built: ${archetypeIds()
        .map(id => `"${id}"`)
        .join(', ')}. Prefer calling preview_spec first and passing the previewToken; the user's edited values are then used verbatim. Rebuilding the same identifier updates the existing item instead of duplicating it.`
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        archetype: {
          type: 'string',
          description:
            'Which kind of ability to build. Determines which spec keys are understood and what the item does.',
          enum: archetypeIds(),
        },
        spec: {
          type: 'object',
          description:
            'The ability spec, used only when no previewToken is given. Keys are dotted paths such as "save.ability", "save.dc", "condition", "range.units". Unrecognised keys are reported as warnings rather than rejected.',
        },
        previewToken: {
          type: 'string',
          description:
            "A token from preview_spec carrying the user's edited values. Supply this or spec, never both, and never re-ask the user for values the preview already collected.",
        },
        actor: {
          type: 'string',
          description:
            'The actor to write to, by name or id. Optional when the spec carries "actor".',
        },
      },
      // "archetype" is deliberately not required: preview_spec stamps it into the
      // stashed spec, so it can arrive through previewToken instead. Omitting it
      // both ways is reported by _unknownArchetypeError, naming what exists.
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} params */
  async getConfirmationDetails(params) {
    const spec = params.spec ?? {};
    const name = spec.name ?? 'Ability';
    const archetype = params.archetype ?? spec.archetype;
    return {
      type: 'build',
      title: `Build: ${name}`,
      details: `Creates or updates a Feature item (${archetype ?? 'unknown'} archetype)${
        spec.condition ? ` that applies "${spec.condition}" on a failed save` : ''
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

    const { spec, actor, name, identifier, archetype, warnings } = prepared;

    try {
      const regions = archetype.build(spec, {
        identifier,
        mintId: () => foundry.utils.randomID(),
      });
      const result = await this._upsert(actor, { identifier, name, ...regions });
      return this._success({ result, warnings, actor, identifier, archetype });
    } catch (err) {
      this.logger.error('build_ability failed', err);
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
   * Resolve the spec, the archetype, the actor, and validate.
   * @param {object} params
   * @returns {object} Either {error} or the prepared values
   */
  _prepare(params) {
    const { spec, error: specError } = this._resolveSpec(params);
    if (specError) return { error: specError };

    const archetype = getArchetype(params.archetype ?? getSpecString(spec, 'archetype'));
    if (!archetype) return { error: this._unknownArchetypeError(params, spec) };

    // The actor is a spec value so it survives the preview round-trip, but a
    // direct argument is accepted for the case where the agent already knows it.
    if (params.actor && getSpecString(spec, 'actor') === undefined) spec.actor = params.actor;

    const actorResult = resolveActor(getSpecString(spec, 'actor'));
    if (!actorResult.ok) {
      return { error: this._reject(actorResult.guidance, actorResult.error, 'ACTOR_UNRESOLVED') };
    }

    const validation = validateSpec(spec, archetype.spec, { required: archetype.required });
    if (!validation.ok) {
      return {
        error: this._reject(
          {
            ok: false,
            error: 'The spec was rejected. Fix the named fields and call build_ability again.',
            errors: validation.errors,
          },
          `build_ability rejected: ${validation.errors.length} spec error(s)`,
          'SPEC_VALIDATION_ERROR'
        ),
      };
    }

    const name = getSpecString(spec, 'name');
    return {
      spec,
      archetype,
      actor: actorResult.actor,
      name,
      identifier: getSpecString(spec, 'identifier') || deriveIdentifier(name),
      warnings: validation.warnings,
    };
  }

  /**
   * Build the error for an unregistered archetype, listing what does exist.
   *
   * The list is read from the registry rather than written out, so this message
   * cannot go stale as archetypes are added.
   * @param {object} params
   * @param {object} spec
   * @returns {object}
   */
  _unknownArchetypeError(params, spec) {
    const named = params.archetype ?? getSpecString(spec, 'archetype');
    const known = listArchetypes().map(a => `${a.id} (${a.label})`);
    return this._reject(
      {
        ok: false,
        error: named
          ? `"${named}" is not an archetype this build supports.`
          : 'No archetype was given. Supply one, or call preview_spec first and pass its previewToken.',
        knownArchetypes: known,
        hint: 'Choose the closest archetype and tell the user which part is not automated. Do not guess further.',
      },
      `build_ability rejected: unknown archetype "${named ?? ''}"`,
      'ARCHETYPE_UNKNOWN'
    );
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
   * Find an existing item by identifier and update it, else create one.
   *
   * Upsert-by-identifier is what makes the build/test/rebuild loop safe: a
   * correction produces one item, not one per attempt.
   * @param {object} actor
   * @param {object} payload - { identifier, name, system, activities, effects }
   * @returns {Promise<{created: boolean, item: object}>}
   */
  async _upsert(actor, { identifier, name, system, activities, effects }) {
    const existing = actor.items.find(
      i => i.type === 'feat' && i.system?.identifier === identifier
    );

    // The authored regions are replaced wholesale so a rebuild cannot leave a
    // stale activity or effect behind from a previous attempt.
    const update = { name, system, activities, effects };

    if (existing) {
      await existing.update(update);
      return { created: false, item: existing };
    }

    const [created] = await actor.createEmbeddedDocuments('Item', [{ ...update, type: 'feat' }]);
    return { created: true, item: created };
  }

  /**
   * Assemble a successful response.
   * @param {object} options
   * @returns {object}
   */
  _success({ result, warnings, actor, identifier, archetype }) {
    const { created, item } = result;
    const activityId = item.system.activities.contents[0]?.id ?? '';
    const effectId = item.effects.contents[0]?.id ?? null;

    return {
      content: JSON.stringify(
        {
          ok: true,
          action: created ? 'created' : 'updated',
          archetype: archetype.id,
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
      content: JSON.stringify(typeof body === 'string' ? { ok: false, error: body } : body, null, 2),
      display,
      error: { message, type },
    };
  }
}
