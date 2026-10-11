import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildSaveAbilityClaims,
  evaluateClaim,
  summariseResults,
  diffActorState,
  snapshotActorState,
  forceRollFlags,
} from '../../scripts/core/ability-claims.js';

/** A Tanglefoot-shaped spec, the reference ability. */
function tanglefootSpec() {
  return {
    name: 'Tanglefoot',
    identifier: 'tanglefoot',
    'save.ability': 'str',
    'save.dc': 14,
    'range.units': 'ft',
    'range.value': 30,
    'target.type': 'sphere',
    'target.size': 5,
    'target.count': 2,
    condition: 'restrained',
    repeatSave: true,
    'repeatSaveTurn': 'end',
    'uses.max': 1,
  };
}

/** The observation a successful run of that ability would produce. */
function goodObservation() {
  return {
    itemExists: true,
    activity: {
      type: 'save',
      saveAbility: ['str'],
      dc: 14,
      range: { value: '30', units: 'ft' },
    },
    uses: { max: '1' },
    overTime: 'turn=end, saveDC=14, saveAbility=str, label="Tanglefoot", saveCount=1-',
    fail: { hpSpent: 0, statuses: ['restrained'], exhaustionLevel: 0, effectsAdded: ['e1'] },
    success: { hpSpent: 0, statuses: [], exhaustionLevel: 0, effectsAdded: [] },
  };
}

test('builds a claim per spec assertion', () => {
  const claims = buildSaveAbilityClaims(tanglefootSpec());
  const ids = claims.map(c => c.id);

  assert.ok(ids.includes('item-exists'));
  assert.ok(ids.includes('activity-is-save'));
  assert.ok(ids.includes('save-ability'));
  assert.ok(ids.includes('save-dc'));
  assert.ok(ids.includes('range'));
  assert.ok(ids.includes('uses-max'));
  assert.ok(ids.includes('condition-on-failure'));
  assert.ok(ids.includes('no-condition-on-success'));
  assert.ok(ids.includes('repeat-save-configured'));
});

test('every claim reads as a sentence a user could check', () => {
  for (const claim of buildSaveAbilityClaims(tanglefootSpec())) {
    assert.equal(typeof claim.claim, 'string');
    assert.ok(claim.claim.length > 10, `claim text too short: "${claim.claim}"`);
    assert.match(claim.claim, /^[A-Z]/, `claim should read as a sentence: "${claim.claim}"`);
  }
});

test('omits claims the spec does not make', () => {
  const claims = buildSaveAbilityClaims({
    name: 'Plain',
    'save.ability': 'dex',
    'save.dc': 12,
  });
  const ids = claims.map(c => c.id);

  assert.equal(ids.includes('condition-on-failure'), false, 'no condition means no condition claim');
  assert.equal(ids.includes('damage-on-failure'), false);
  assert.equal(ids.includes('repeat-save-configured'), false);
  assert.equal(ids.includes('uses-max'), false);
});

test('a save-or-damage spec produces damage claims', () => {
  const claims = buildSaveAbilityClaims({
    name: 'Crushing Grip',
    'save.ability': 'con',
    'save.dc': 14,
    'damage.formula': '3d6',
    'damage.type': 'bludgeoning',
    'damage.onSave': 'half',
  });
  const ids = claims.map(c => c.id);

  assert.ok(ids.includes('damage-on-failure'));
  assert.ok(ids.includes('half-damage-on-success'));
  assert.equal(ids.includes('no-damage-on-success'), false);
});

test('damage that is negated on a save claims "no damage" instead of "half"', () => {
  const claims = buildSaveAbilityClaims({
    name: 'Zap',
    'damage.formula': '2d6',
    'damage.onSave': 'none',
  });
  const ids = claims.map(c => c.id);

  assert.ok(ids.includes('no-damage-on-success'));
  assert.equal(ids.includes('half-damage-on-success'), false);
});

test('reports a correct build as passing every claim', () => {
  const results = buildSaveAbilityClaims(tanglefootSpec()).map(c =>
    evaluateClaim(c, goodObservation())
  );
  const summary = summariseResults(results);

  assert.equal(summary.failed, 0, JSON.stringify(results.filter(r => r.pass === false), null, 2));
  assert.equal(summary.untested, 0);
  assert.match(summary.verdict, /all \d+ claims passed/);
});

test('a wrong save ability fails that claim and names both values', () => {
  const claims = buildSaveAbilityClaims(tanglefootSpec());
  const claim = claims.find(c => c.id === 'save-ability');

  const result = evaluateClaim(claim, {
    ...goodObservation(),
    activity: { ...goodObservation().activity, saveAbility: ['dex'] },
  });

  assert.equal(result.pass, false);
  assert.equal(result.expected, 'str');
  assert.equal(result.actual, 'dex');
});

test('a wrong DC fails and shows the difference as a number, not a string', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(c => c.id === 'save-dc');
  const result = evaluateClaim(claim, {
    ...goodObservation(),
    activity: { ...goodObservation().activity, dc: '16' },
  });

  assert.equal(result.pass, false);
  assert.equal(result.expected, '14');
  assert.equal(result.actual, '16');
});

test('a range written to the wrong field fails the range claim', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(c => c.id === 'range');
  const result = evaluateClaim(claim, {
    ...goodObservation(),
    activity: { ...goodObservation().activity, range: { value: undefined, units: 'self' } },
  });

  assert.equal(result.pass, false);
  assert.match(result.actual, /self/);
});

test('a condition that does not land on a failed save fails the claim', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(
    c => c.id === 'condition-on-failure'
  );
  const result = evaluateClaim(claim, {
    ...goodObservation(),
    fail: { ...goodObservation().fail, statuses: ['prone'] },
  });

  assert.equal(result.pass, false);
  assert.equal(result.actual, 'prone');
  assert.match(result.expected, /restrained/);
});

test('a condition that wrongly lands on a successful save fails the claim', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(
    c => c.id === 'no-condition-on-success'
  );
  const result = evaluateClaim(claim, {
    ...goodObservation(),
    success: { ...goodObservation().success, statuses: ['restrained'] },
  });

  assert.equal(result.pass, false);
  assert.equal(result.actual, 'restrained');
});

test('exhaustion on a successful save is judged by level, not presence', () => {
  const spec = { name: 'Wither', condition: 'exhaustion', 'save.ability': 'con', 'save.dc': 13 };
  const claim = buildSaveAbilityClaims(spec).find(c => c.id === 'no-condition-on-success');

  const atZero = evaluateClaim(claim, {
    success: { statuses: [], exhaustionLevel: 0 },
  });
  assert.equal(atZero.pass, true, 'exhaustion level 0 is not exhaustion');

  const atOne = evaluateClaim(claim, {
    success: { statuses: ['exhaustion'], exhaustionLevel: 1 },
  });
  assert.equal(atOne.pass, false);
});

test('an untested claim is reported as untested, never as passing', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(
    c => c.id === 'condition-on-failure'
  );
  const result = evaluateClaim(claim, { ...goodObservation(), fail: {} });

  assert.equal(result.pass, null, 'a claim we could not check must not report success');
  assert.match(result.note, /did not report/);
});

test('half damage cannot be verified when nothing was dealt on the failure', () => {
  const spec = { name: 'Zap', 'damage.formula': '2d6', 'damage.onSave': 'half' };
  const claim = buildSaveAbilityClaims(spec).find(c => c.id === 'half-damage-on-success');

  const result = evaluateClaim(claim, {
    fail: { hpSpent: 0 },
    success: { hpSpent: 0 },
  });

  assert.equal(result.pass, null);
  assert.match(result.note, /did not land on the failing save/);
});

test('half damage passes when the success costs fewer hit points than the failure', () => {
  const spec = { name: 'Zap', 'damage.formula': '2d6', 'damage.onSave': 'half' };
  const claim = buildSaveAbilityClaims(spec).find(c => c.id === 'half-damage-on-success');

  assert.equal(evaluateClaim(claim, { fail: { hpSpent: 10 }, success: { hpSpent: 5 } }).pass, true);
  assert.equal(
    evaluateClaim(claim, { fail: { hpSpent: 10 }, success: { hpSpent: 10 } }).pass,
    false
  );
  assert.equal(evaluateClaim(claim, { fail: { hpSpent: 10 }, success: { hpSpent: 0 } }).pass, true);
});

test('a missing OverTime flag fails the repeat-save claim', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(
    c => c.id === 'repeat-save-configured'
  );
  const result = evaluateClaim(claim, { ...goodObservation(), overTime: undefined });

  assert.equal(result.pass, false);
  assert.match(result.actual, /no OverTime flag/);
});

test('a missing item fails the item claim', () => {
  const claim = buildSaveAbilityClaims(tanglefootSpec()).find(c => c.id === 'item-exists');
  assert.equal(evaluateClaim(claim, { itemExists: false }).pass, false);
  assert.equal(evaluateClaim(claim, { itemExists: true }).pass, true);
});

test('an unimplemented claim type reports untested rather than throwing', () => {
  const result = evaluateClaim(
    { id: 'x', kind: 'not-implemented', claim: 'Something new', params: {} },
    {}
  );
  assert.equal(result.pass, null);
  assert.match(result.note, /not implemented/);
});

test('summarises a mixed result honestly', () => {
  const summary = summariseResults([{ pass: true }, { pass: false }, { pass: null }]);

  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.untested, 1);
  assert.equal(summary.total, 3);
  assert.match(summary.verdict, /1 of 3 claims failed/, 'a failure is never hidden by untested ones');
});

test('an all-passing summary says so plainly', () => {
  const summary = summariseResults([{ pass: true }, { pass: true }]);
  assert.equal(summary.verdict, 'all 2 claims passed');
});

test('a summary with only untested entries does not claim success', () => {
  const summary = summariseResults([{ pass: null }]);
  assert.match(summary.verdict, /could not be tested/);
  assert.equal(summary.passed, 0);
});

test('forcing the roll is what makes the test deterministic', () => {
  assert.deepEqual(forceRollFlags('fail'), { 'flags.midi-qol.fail.all': true });
  assert.deepEqual(forceRollFlags('success'), { 'flags.midi-qol.success.all': true });
});

test('diffs hit points spent between two snapshots', () => {
  const before = { hp: 30, effectIds: [], statuses: [], exhaustion: 0 };
  const after = { hp: 18, effectIds: ['e1'], statuses: ['restrained'], exhaustion: 0 };
  const diff = diffActorState(before, after);

  assert.equal(diff.hpSpent, 12);
  assert.deepEqual(diff.statuses, ['restrained']);
  assert.deepEqual(diff.effectsAdded, ['e1']);
});

test('healing is not reported as negative damage', () => {
  const diff = diffActorState({ hp: 10, effectIds: [] }, { hp: 20, effectIds: [] });
  assert.equal(diff.hpSpent, 0);
});

test('a diff with no hit points reports undefined rather than zero', () => {
  const diff = diffActorState({ effectIds: [] }, { effectIds: [] });
  assert.equal(diff.hpSpent, undefined, 'zero would read as "no damage taken"');
});

test('snapshot captures what must be restored', () => {
  const actor = {
    system: { attributes: { hp: { value: 22 }, exhaustion: 1 } },
    effects: { contents: [{ id: 'e1' }] },
    statuses: new Set(['poisoned']),
    flags: { 'midi-qol': { 'fail.all': true } },
  };

  const snapshot = snapshotActorState(actor);
  assert.equal(snapshot.hp, 22);
  assert.equal(snapshot.exhaustion, 1);
  assert.deepEqual(snapshot.effectIds, ['e1']);
  assert.deepEqual(snapshot.statuses, ['poisoned']);
  assert.equal(snapshot.midiFailAll, true);
});

test('snapshot tolerates a bare object', () => {
  const snapshot = snapshotActorState({});
  assert.equal(snapshot.hp, undefined);
  assert.deepEqual(snapshot.effectIds, []);
  assert.deepEqual(snapshot.statuses, []);
});
