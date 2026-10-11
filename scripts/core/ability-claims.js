/**
 * Ability Claims — turn a spec into a checklist the self-test can verify.
 *
 * The point of the self-test is not "did it error" but "does the automation do
 * what the description said". So the test is expressed as one assertion per
 * claim the spec makes, and the report is that checklist with observed values
 * filled in.
 *
 * Claims are DATA (a kind plus parameters) and evaluation is a pure function of
 * the observed world state. Two consequences, both deliberate:
 *   - the whole checklist is unit-testable without a Foundry instance;
 *   - the report can name the expected value alongside the actual one, which is
 *     what lets the agent diagnose a mismatch instead of guessing.
 *
 * A claim that could not be tested is reported as untested, never as passing.
 * Silently passing an unverified claim would make the report worse than useless.
 */

/**
 * Claims that hold regardless of how the ability was used.
 * @param {object} spec
 * @returns {Array<{id: string, kind: string, claim: string, params: object}>}
 */
function structuralClaims(spec) {
  const claims = [];
  const name = spec.name ?? 'the ability';
  const identifier = spec.identifier;

  claims.push({
    id: 'item-exists',
    kind: 'item-exists',
    claim: `An item for "${name}" exists on the actor`,
    params: { identifier },
  });

  claims.push({
    id: 'activity-is-save',
    kind: 'activity-is-save',
    claim: 'The item has a save activity',
    params: {},
  });

  if (spec['save.ability']) {
    claims.push({
      id: 'save-ability',
      kind: 'save-ability',
      claim: `The save uses ${spec['save.ability'].toUpperCase()}`,
      params: { ability: spec['save.ability'] },
    });
  }

  if (spec['save.dc'] !== undefined) {
    claims.push({
      id: 'save-dc',
      kind: 'save-dc',
      claim: `The save DC is ${spec['save.dc']}`,
      params: { dc: spec['save.dc'] },
    });
  }

  if (spec['range.units'] && spec['range.value'] !== undefined) {
    claims.push({
      id: 'range',
      kind: 'range',
      claim: `The activity's range is ${spec['range.value']} ${spec['range.units']}`,
      params: { value: spec['range.value'], units: spec['range.units'] },
    });
  }

  if (spec['uses.max'] !== undefined) {
    claims.push({
      id: 'uses-max',
      kind: 'uses-max',
      claim: `The ability has ${spec['uses.max']} use(s)`,
      params: { max: spec['uses.max'] },
    });
  }

  return claims;
}

/**
 * Claims about what happens to the target, per save outcome.
 * @param {object} spec
 * @returns {Array<{id: string, kind: string, claim: string, params: object}>}
 */
function outcomeClaims(spec) {
  const claims = [];

  if (spec.condition) {
    claims.push({
      id: 'condition-on-failure',
      kind: 'condition-on-failure',
      claim: `A failed save gives the target "${spec.condition}"`,
      params: { condition: spec.condition },
    });

    claims.push({
      id: 'no-condition-on-success',
      kind: 'no-condition-on-success',
      claim: `A successful save leaves the target without "${spec.condition}"`,
      params: { condition: spec.condition },
    });
  }

  if (spec['damage.formula']) {
    claims.push({
      id: 'damage-on-failure',
      kind: 'damage-on-failure',
      claim: `A failed save costs the target hit points (${spec['damage.formula']} ${spec['damage.type'] ?? 'untyped'})`,
      params: {},
    });

    if ((spec['damage.onSave'] ?? 'half') === 'half') {
      claims.push({
        id: 'half-damage-on-success',
        kind: 'half-damage-on-success',
        claim: 'A successful save costs the target hit points, but fewer than a failure',
        params: {},
      });
    } else if (spec['damage.onSave'] === 'none') {
      claims.push({
        id: 'no-damage-on-success',
        kind: 'no-damage-on-success',
        claim: 'A successful save costs the target no hit points',
        params: {},
      });
    }
  }

  if (spec.repeatSave) {
    claims.push({
      id: 'repeat-save-configured',
      kind: 'repeat-save-configured',
      claim: `The ability re-rolls the save at the ${spec['repeatSaveTurn'] ?? 'end'} of the target's turn`,
      params: {}
    });
  }

  return claims;
}

/**
 * Build the full checklist for a save-based ability.
 * @param {object} spec - The spec that was built
 * @returns {Array<{id: string, kind: string, claim: string, params: object}>}
 */
export function buildSaveAbilityClaims(spec) {
  return [...structuralClaims(spec), ...outcomeClaims(spec)];
}

/**
 * Evaluate one claim against the observed world state.
 *
 * Returns `pass: null` when the observation needed is missing, which is reported
 * as untested. A claim we could not check is not a claim that holds.
 * @param {object} claim
 * @param {object} observed
 * @returns {{claim: string, expected: string, actual: string, pass: boolean|null, note?: string}}
 */
export function evaluateClaim(claim, observed) {
  const evaluator = EVALUATORS[claim.kind];
  if (!evaluator) {
    return {
      claim: claim.claim,
      expected: 'a known claim type',
      actual: claim.kind,
      pass: null,
      note: 'This claim type is not implemented, so it was not tested.',
    };
  }
  return evaluator(claim, observed);
}

/** Map a claim to a {expected, actual, pass} result. */
const EVALUATORS = {
  'item-exists': (claim, o) => ({
    claim: claim.claim,
    expected: 'an item is present',
    actual: o.itemExists ? 'present' : 'missing',
    pass: o.itemExists === true,
  }),

  'activity-is-save': (claim, o) => ({
    claim: claim.claim,
    expected: 'activity type "save"',
    actual: o.activity?.type ?? 'no activity',
    pass: o.activity?.type === 'save',
  }),

  'save-ability': (claim, o) => {
    const actual = o.activity?.saveAbility;
    return {
      claim: claim.claim,
      expected: claim.params.ability,
      actual: Array.isArray(actual) ? actual.join(', ') : (actual ?? 'unknown'),
      pass: Array.isArray(actual) && actual.includes(claim.params.ability),
    };
  },

  'save-dc': (claim, o) => {
    const actual = o.activity?.dc;
    return {
      claim: claim.claim,
      expected: String(claim.params.dc),
      actual: actual === undefined ? 'unknown' : String(actual),
      pass: Number(actual) === Number(claim.params.dc),
    };
  },

  range: (claim, o) => {
    const range = o.activity?.range ?? {};
    const sameValue = Number(range.value) === Number(claim.params.value);
    // Report both parts even when the distance is missing: "no distance, units
    // ft" is what identifies a range that was written to the wrong field.
    const described =
      range.value === undefined || range.value === ''
        ? `no distance, units ${range.units || 'none'}`
        : `${range.value} ${range.units ?? ''}`.trim();

    return {
      claim: claim.claim,
      expected: `${claim.params.value} ${claim.params.units}`,
      actual: described,
      pass: sameValue && range.units === claim.params.units,
    };
  },

  'uses-max': (claim, o) => {
    const actual = o.uses?.max;
    return {
      claim: claim.claim,
      expected: String(claim.params.max),
      actual: actual === undefined ? 'no uses' : String(actual),
      pass: Number(actual) === Number(claim.params.max),
    };
  },

  'condition-on-failure': (claim, o) => {
    const statuses = o.fail?.statuses;
    if (!statuses) return _untested(claim, 'the failing-save run did not report the target state');
    return {
      claim: claim.claim,
      expected: `"${claim.params.condition}" on the target`,
      actual: _describeStatuses(statuses),
      pass: statuses.includes(claim.params.condition),
    };
  },

  'no-condition-on-success': (claim, o) => {
    if (claim.params.condition === 'exhaustion') {
      // Exhaustion is a level, not a boolean, so "absent" is level 0.
      const level = o.success?.exhaustionLevel;
      if (level === undefined) return _untested(claim, 'the run did not report exhaustion');
      return {
        claim: claim.claim,
        expected: 'level 0',
        actual: `level ${level}`,
        pass: Number(level) === 0,
      };
    }
    const statuses = o.success?.statuses;
    if (!statuses) return _untested(claim, 'the succeeding run did not report the target state');
    return {
      claim: claim.claim,
      expected: `no "${claim.params.condition}"`,
      actual: _describeStatuses(statuses),
      pass: !statuses.includes(claim.params.condition),
    };
  },

  'damage-on-failure': (claim, o) => {
    const spent = o.fail?.hpSpent;
    if (spent === undefined) return _untested(claim, 'the failing-save run did not report hit points');
    return {
      claim: claim.claim,
      expected: 'hit points lost',
      actual: spent > 0 ? `${spent} lost` : 'none lost',
      pass: spent > 0,
    };
  },

  'half-damage-on-success': (claim, o) => {
    const failSpent = o.fail?.hpSpent;
    const successSpent = o.success?.hpSpent;
    if (failSpent === undefined || successSpent === undefined) {
      return _untested(claim, 'both runs must report hit points to compare them');
    }
    if (failSpent === 0) {
      return {
        claim: claim.claim,
        expected: 'fewer hit points than a failure',
        actual: 'no damage was taken on the failure either, so the comparison is meaningless',
        pass: null,
        note: 'Damage did not land on the failing save, so half-damage could not be checked.',
      };
    }
    return {
      claim: claim.claim,
      expected: `fewer than the failure (${failSpent})`,
      actual: `${successSpent}`,
      pass: successSpent < failSpent,
    };
  },

  'no-damage-on-success': (claim, o) => {
    const spent = o.success?.hpSpent;
    if (spent === undefined) return _untested(claim, 'the succeeding-save run did not report hit points');
    return {
      claim: claim.claim,
      expected: '0 lost',
      actual: `${spent} lost`,
      pass: spent === 0,
    };
  },

  'repeat-save-configured': (claim, o) => ({
    claim: claim.claim,
    expected: 'a midi-qol OverTime flag on the applied effect',
    actual: o.overTime ?? 'no OverTime flag',
    pass: typeof o.overTime === 'string' && o.overTime.length > 0,
  }),
};

/** A claim whose observation was not available. */
function _untested(claim, reason) {
  return {
    claim: claim.claim,
    expected: 'an observation',
    actual: 'not measured',
    pass: null,
    note: reason,
  };
}

/** Readable summary of a status set, for the report. */
function _describeStatuses(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return 'no conditions';
  return statuses.join(', ');
}

/**
 * Summarise a checklist for the agent.
 * @param {Array<{pass: boolean|null}>} results
 * @returns {{passed: number, failed: number, untested: number, total: number, verdict: string}}
 */
export function summariseResults(results) {
  const passed = results.filter(r => r.pass === true).length;
  const failed = results.filter(r => r.pass === false).length;
  const untested = results.filter(r => r.pass === null).length;
  const total = results.length;

  let verdict;
  if (failed > 0) verdict = `${failed} of ${total} claims failed`;
  else if (untested > 0) verdict = `${passed} of ${total} claims passed, ${untested} could not be tested`;
  else verdict = `all ${total} claims passed`;

  return { passed, failed, untested, total, verdict };
}

/**
 * The actor state the test compares against, captured so it can be restored.
 * @param {object} actor
 * @returns {object}
 */
export function snapshotActorState(actor) {
  return {
    hp: actor?.system?.attributes?.hp?.value,
    exhaustion: actor?.system?.attributes?.exhaustion,
    effectIds: (actor?.effects?.contents ?? []).map(e => e.id),
    statuses: Array.from(actor?.statuses ?? []),
    midiFailAll: actor?.flags?.['midi-qol']?.['fail.all'],
    midiSuccessAll: actor?.flags?.['midi-qol']?.['success.all'],
  };
}

/**
 * Work out what the two runs tell us about the target.
 * @param {object} before - snapshotActorState output
 * @param {object} after - snapshotActorState output
 * @returns {object} Observation for one run
 */
export function diffActorState(before, after) {
  const spent =
    typeof before.hp === 'number' && typeof after.hp === 'number' ? before.hp - after.hp : undefined;

  return {
    hpBefore: before.hp,
    hpAfter: after.hp,
    hpSpent: spent === undefined ? undefined : Math.max(0, spent),
    statuses: after.statuses,
    exhaustionLevel: after.exhaustion,
    effectsAdded: after.effectIds.filter(id => !before.effectIds.includes(id)),
  };
}

/**
 * The midi-qol flags that force a deterministic outcome.
 *
 * Forcing the roll is what makes the test independent of dice. Without it the
 * test would be a coin flip that reports false failures about half the time,
 * which is worse than no test.
 * @param {'fail'|'success'} outcome
 * @returns {object} Flag updates to apply to the target
 */
export function forceRollFlags(outcome) {
  return outcome === 'fail'
    ? { 'flags.midi-qol.fail.all': true }
    : { 'flags.midi-qol.success.all': true };
}

/** Flag updates that clear the forcing, restoring whatever was there before. */
export function clearForceRollFlags() {
  return {
    'flags.midi-qol.fail.all': null,
    'flags.midi-qol.success.all': null,
  };
}
