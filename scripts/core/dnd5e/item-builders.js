/**
 * Item Builders — the item-level pieces of an ability.
 *
 * Which activities and effects an ability has is decided by the caller, not here.
 * What is decided here is the item's identity and its use limits, which are the
 * same whatever the ability turns out to be. Keeping that in one place means
 * "does this ability have a 3/day counter" is answered once.
 */

import { getSpecString, getSpecNumber } from '../automation-spec.js';

/**
 * Keys this module reads itself. Anything else in the spec is passed through to
 * the item's system data, so dnd5e fields and module flags the caller authored
 * are not silently dropped.
 *
 * Pass-through is the point: the caller may know a field this module has never
 * heard of, and discarding it would produce an item that looks built but is
 * missing the part that mattered.
 */
const CONSUMED_KEYS = new Set([
  'actor',
  'name',
  'identifier',
  'itemType',
  'notes',
  'uses.max',
  'uses.period',
  'uses.recovery',
  'uses.rechargeMin',
  'activities',
  'effects',
]);

/**
 * Build the item's `system` block.
 *
 * `system.uses` is created here and consumed by the activity's consumption
 * block; one without the other produces either a counter that never decrements
 * or a spend of a resource that does not exist.
 * @param {object} spec
 * @param {string} identifier
 * @returns {object}
 */
export function buildItemSystem(spec, identifier) {
  const system = {
    identifier,
    type: { value: getSpecString(spec, 'itemSubtype') ?? 'monster', subtype: '' },
    description: { value: '' },
    // Everything the caller authored that this module has no opinion about.
    ...passthroughSystem(spec),
  };

  const notes = getSpecString(spec, 'notes');
  if (notes) system.description.value = `<p>${notes}</p>`;

  const usesMax = getSpecNumber(spec, 'uses.max');
  if (usesMax !== undefined) {
    const rechargeMin = getSpecNumber(spec, 'uses.rechargeMin');
    system.uses = {
      max: String(usesMax),
      spent: 0,
      recovery: [
        {
          period: getSpecString(spec, 'uses.period') ?? 'day',
          type: getSpecString(spec, 'uses.recovery') ?? 'recoverAll',
          // A recharge ability spends its uses on a die roll rather than a rest,
          // and dnd5e keeps the threshold apart from the period.
          ...(rechargeMin !== undefined ? { formula: String(rechargeMin) } : {}),
        },
      ],
    };
  }

  return system;
}

/**
 * Collect the spec keys that become `system` fields directly.
 *
 * Dotted keys are excluded: they describe something this module or an activity
 * reads, not a system field, and writing "save.dc" into system data would put a
 * junk key on the document.
 * @param {object} spec
 * @returns {object}
 */
function passthroughSystem(spec) {
  const out = {};
  for (const [key, value] of Object.entries(spec ?? {})) {
    if (CONSUMED_KEYS.has(key)) continue;
    if (key.includes('.')) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
