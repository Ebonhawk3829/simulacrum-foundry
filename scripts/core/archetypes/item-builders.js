/**
 * Item Builders — the item-level pieces every archetype writes.
 *
 * An archetype decides which activities and effects an ability has. What it does
 * NOT decide is the item's own identity and use limits, which are identical for
 * every archetype. Keeping that here means "does this ability have a 3/day
 * counter" is answered in one place.
 */

import { getSpecString, getSpecNumber } from '../automation-spec.js';

/**
 * Build the `system` block of the item.
 *
 * `system.uses` is created here and consumed by the activity's consumption
 * block. Creating one without the other produces either a counter that never
 * decrements or a resource that does not exist, and both look like working
 * automation until someone runs out of uses mid-session.
 * @param {object} spec
 * @param {string} identifier
 * @returns {object}
 */
export function buildItemSystem(spec, identifier) {
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
          // A recharge ability spends its uses on a die roll rather than on a
          // rest, and dnd5e stores the threshold separately from the period.
          ...(getSpecNumber(spec, 'uses.rechargeMin') !== undefined
            ? { formula: String(getSpecNumber(spec, 'uses.rechargeMin')) }
            : {}),
        },
      ],
    };
  }

  return system;
}
