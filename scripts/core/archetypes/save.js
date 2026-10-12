/**
 * Save Archetype — "the target rolls a save".
 *
 * Covers both named save shapes:
 *   save-or-suffer (Tanglefoot): failed save gains a condition, may repeat.
 *   save-or-damage (Crushing Grip): failed save takes damage, success halves it.
 *
 * They are one archetype, not two, because dnd5e expresses both with a single
 * `save` activity and the difference is only whether the payload is a condition,
 * damage, or both. Splitting them would duplicate the range/DC/duration handling
 * that is most of the work and most of the risk.
 *
 * ONE ACTIVITY, AND WHY
 *
 * The result here is one authored `save` activity. dnd5e 5.3.3 computes a
 * save activity's DC from its own `range`, and applies the activity to the
 * targets that failed — so "the DC is correct" and "the effect lands only on
 * failure" are properties of this one object rather than things we orchestrate.
 * A hidden apply/damage activity would introduce ordering questions the system
 * does not have.
 */

import {
  getSpecString,
  getSpecNumber,
  getSpecBoolean,
  SAVE_ABILITY_SPEC,
} from '../automation-spec.js';
import { buildSaveAbilityClaims } from '../ability-claims.js';
import { buildItemSystem } from './item-builders.js';
import {
  buildActivityRange,
  buildActivityTarget,
  buildActivityTime,
  buildActivityDamage,
  buildConsumption,
  buildAppliedEffect,
} from './activity-builders.js';

/**
 * Assemble the save activity.
 * @param {object} spec
 * @param {string|null} effectId - The effect this activity applies
 * @returns {object}
 */
function buildSaveActivity(spec, effectId) {
  const { activation, duration } = buildActivityTime(spec);

  return {
    type: 'save',
    name: getSpecString(spec, 'name') ?? 'Save',
    activation,
    consumption: buildConsumption(spec),
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
}

/**
 * Build the save archetype's authored regions.
 * @param {object} spec
 * @param {object} context
 * @param {string} context.identifier - The resolved, derived identifier
 * @param {Function} context.mintId - Supplies a new document id
 * @returns {{system: object, activities: object[], effects: object[]}}
 */
function build(spec, { identifier, mintId }) {
  const condition = getSpecString(spec, 'condition');
  // A repeating save has nowhere to live without an effect: midi-qol reads the
  // OverTime flag from the effect on the target, never from the item.
  const needsEffect = Boolean(condition) || getSpecBoolean(spec, 'repeatSave');

  const effectId = needsEffect ? mintId() : null;
  const activities = [buildSaveActivity(spec, effectId)];
  const effects = effectId ? [buildAppliedEffect({ spec, identifier, effectId })] : [];

  return { system: buildItemSystem(spec, identifier), activities, effects };
}

export const SaveArchetype = {
  id: 'save',
  label: 'Save-or-suffer / save-or-damage',
  example: 'Tanglefoot, Crushing Grip',
  summary:
    'the target rolls a saving throw; on a failure it gains a condition, takes damage, or both, and may repeat the save at the start or end of its turn',
  activityType: 'save',
  spec: SAVE_ABILITY_SPEC,
  required: ['save.ability', 'save.dc', 'name'],
  build,
  // Reuses the claim builder the existing tests already pin, so generalising the
  // registry does not fork the definition of "what this ability promises".
  claims: spec => buildSaveAbilityClaims(spec),
};
