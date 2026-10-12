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
 *
 * `flags` is listed because it must NOT pass through to `system`. It is written at
 * the item's top level by `buildItemUpdate`, and before that was handled a
 * `flags` key in the spec landed in `system.flags` — where nothing reads it. The
 * build reported success and the automation did nothing, which is the exact
 * failure this whole pass-through arrangement exists to prevent.
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
  'flags',
]);

/**
 * The item-level flags to write, from either the spec or an explicit parameter.
 *
 * Merged shallowly by scope rather than written whole, so a rebuild that supplies
 * only `cat` does not erase `midi-qol` set earlier. Merging one level deep is the
 * right depth because flags are namespaced by module: the scopes are independent,
 * and anything deeper would have to guess at a module's internal shape.
 * @param {object} spec
 * @param {object} [explicit]
 * @returns {object|null}
 */
export function buildItemFlags(spec, explicit) {
  const fromSpec = spec?.flags && typeof spec.flags === 'object' ? spec.flags : null;
  const source = explicit ?? fromSpec;
  if (!source || typeof source !== 'object') return null;

  const out = {};
  for (const [scope, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    out[scope] = value;
  }
  return Object.keys(out).length ? out : null;
}

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
