/**
 * Activity Builders — the pieces an ability's activities are assembled from.
 *
 * An "activity" in dnd5e is the roll the user triggers: a save, an attack, a
 * heal, a damage roll. Different abilities choose different activities and
 * different payloads, but they assemble them from the same parts, so those parts
 * live here: one implementation of each, and one place to be right about dnd5e
 * 6.x.
 *
 * The comments that matter most are the ones explaining a field that is easy to
 * get wrong, because those mistakes are silent: the item still saves and still
 * rolls, it just behaves differently from the statblock.
 */

import {
  getSpecString,
  getSpecNumber,
  getSpecBoolean,
} from '../automation-spec.js';

/**
 * Infer an activity type from the payload that is present.
 *
 * dnd5e requires `type` on every activity, and an activity authored without one
 * throws a validation error that does not name which activity was at fault. The
 * blocks are mutually exclusive in practice — a `save` block means a save, an
 * `attack` block means an attack — so inferring is unambiguous rather than a
 * guess about what the ability does.
 *
 * `utility` is the fallback because it is the one dnd5e type that rolls nothing
 * and expects no particular payload, so an activity with only activation and
 * description data lands as a usable button rather than an error.
 * @param {object} activity
 * @returns {string}
 */
export function inferActivityType(activity) {
  if (!activity || typeof activity !== 'object') return 'utility';
  if (activity.save) return 'save';
  if (activity.attack) return 'attack';
  if (activity.healing) return 'heal';
  if (activity.damage) return 'damage';
  if (activity.check) return 'check';
  if (activity.spell) return 'cast';
  return 'utility';
}

/**
 * Build the activity's `range`, which is ALSO where dnd5e reads the ability's
 * own range when computing a save DC or a spell attack's reach.
 *
 * A 30 ft ability with a 5 ft area is range 30, template size 5. Putting the 5
 * in here is the single most damaging mistake available in this file: every
 * token's DC shifts.
 * @param {object} spec
 * @returns {object}
 */
export function buildActivityRange(spec) {
  const value = getSpecNumber(spec, 'range.value');
  return {
    units: getSpecString(spec, 'range.units') ?? 'ft',
    // RangeField.value is a formula field, so a bare number is stringified.
    value: value !== undefined ? String(value) : '',
    override: true,
  };
}

/**
 * Build the activity's `target`, which carries the AREA and the creature count,
 * never the range.
 * @param {object} spec
 * @returns {object}
 */
export function buildActivityTarget(spec) {
  const templateType = getSpecString(spec, 'target.type');
  const templateSize = getSpecNumber(spec, 'target.size');
  const targetCount = getSpecNumber(spec, 'target.count');

  const target = {
    affects: {
      count: '',
      type: '',
      choice: false,
      special: '',
      // Auras and heals reason about allies versus enemies. dnd5e uses this for
      // the target prompt's highlight, so leaving it blank is cosmetic, not broken.
      disposition: getSpecString(spec, 'target.disposition') ?? undefined,
    },
    template: {
      contiguous: false,
      stationary: false,
      units: getSpecString(spec, 'target.units') ?? 'ft',
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
 * Build the activation and duration blocks, shared by every activity type.
 * @param {object} spec
 * @returns {{activation: object, duration: object}}
 */
export function buildActivityTime(spec) {
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
 * The consumption block, which is how an ability spends a use.
 *
 * `itemUses` is what ties the activity to `system.uses` on the item. Omitting it
 * leaves the uses counter displayed but never decremented, so a "3/day" ability
 * can be used forever.
 * @param {object} spec
 * @returns {object}
 */
export function buildConsumption(spec) {
  const consumption = { targets: [], scaling: { allowed: false }, spellSlot: false };
  if (getSpecNumber(spec, 'uses.max') === undefined) return consumption;

  consumption.targets = [{ type: 'itemUses', target: '', value: '1' }];
  return consumption;
}

/**
 * One damage part, which is the shape both `damage.parts` and a heal's healing
 * accept. `bonus` holds the whole formula because the statblock gives us a
 * complete expression ("4d6") rather than number/denomination separately.
 * @param {object} spec
 * @param {string} path - Spec path holding the formula
 * @param {string} typePath - Spec path holding the damage type
 * @returns {object|null}
 */
export function buildDamagePart(formula, type) {
  if (!formula) return null;

  return {
    number: null,
    denomination: null,
    bonus: formula,
    types: type ? [type] : [],
    custom: { enabled: false, formula: '' },
  };
}

/**
 * Build the activity's damage block.
 *
 * `onSave` is what makes "half damage on a successful save" work. Note the
 * asymmetry with effects: damage is visible to the saver, but an effect applied
 * by a save activity only lands on failures unless it is flagged `onSave`.
 * @param {object} spec
 * @returns {object}
 */
export function buildActivityDamage(spec) {
  const part = buildDamagePart(
    getSpecString(spec, 'damage.formula'),
    getSpecString(spec, 'damage.type')
  );
  if (!part) return { onSave: getSpecString(spec, 'damage.onSave') ?? 'none', parts: [] };

  return {
    onSave: getSpecString(spec, 'damage.onSave') ?? 'half',
    parts: [part],
  };
}

/**
 * Build a heal activity's healing block. Same shape as damage, different field.
 * @param {object} spec
 * @returns {object}
 */
export function buildActivityHealing(spec) {
  const part = buildDamagePart(
    getSpecString(spec, 'heal.formula'),
    getSpecString(spec, 'heal.type')
  );
  if (!part) return { types: [], custom: { enabled: false, formula: '' } };

  return { types: part.types, custom: { enabled: false, formula: '' }, bonus: part.bonus };
}

/**
 * Build the midi-qol OverTime string for a repeating save.
 *
 * This is how "repeat the save at the end of each turn, end on a success" is
 * expressed: midi rolls the save on the target's turn and removes the effect
 * once it succeeds.
 * @param {object} spec
 * @returns {string|undefined}
 */
export function buildOverTimeFlag(spec) {
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
 * Assemble the ActiveEffect an activity applies.
 *
 * The effect carries mechanisms rather than outcomes:
 *   changes[macro.StatusEffect]  - DAE applies the condition id to the target
 *   flags.midi-qol.OverTime      - the repeating save
 *   flags.cat.*                  - CAT's identifier and rider config
 * Damage is never stored here; it belongs to the activity.
 * @param {object} options
 * @param {object} options.spec
 * @param {string} options.identifier
 * @param {string} options.effectId - Id the activity will reference
 * @param {string[]} [options.extraChanges] - Additional change entries
 * @returns {object} The effect data
 */
export function buildAppliedEffect({ spec, identifier, effectId, extraChanges = [] }) {
  const condition = getSpecString(spec, 'condition');
  const overTime = buildOverTimeFlag(spec);

  const changes = condition
    ? [{ key: 'macro.StatusEffect', mode: 0, value: condition, priority: 20 }]
    : [];

  const flags = { cat: { identifier, config: {} } };
  if (overTime) flags['midi-qol'] = { OverTime: overTime };

  // Two keys used to be written here and are deliberately gone (0.3.1):
  //   flags.cat.conditionLevel  and  flags.cat.failsBy
  // Neither is read by any installed module — checked against CAT 0.1.3, CPR 2.1.3,
  // midi-qol 14.6.3 and DAE 14.6.2 — so writing them only produced an effect that
  // looked configured and did nothing. A condition *level* means exhaustion, which is
  // a `system.attributes.exhaustion` change (or CAT's `actorUtils.addExhaustion`);
  // a "fails by N or more" rider has no flag form and needs a CAT embedded macro on
  // the save (see reference/cat-embedded-macros.md).

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
    system: { changes: [...changes, ...extraChanges] },
    flags,
  };
}
