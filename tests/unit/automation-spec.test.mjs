import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getSpecValue,
  getSpecNumber,
  getSpecBoolean,
  getSpecString,
  deriveIdentifier,
  validateSpec,
  ABILITIES,
  CONDITIONS,
  DAMAGE_TYPES,
} from '../../scripts/core/automation-spec.js';

/**
 * A contract of the test's own.
 *
 * Deliberately local: the module no longer ships a contract describing what an
 * ability may contain, because that would be this repository's opinion about
 * ability shape rather than a dnd5e fact. validateSpec remains useful to any
 * caller checking its own data against its own contract, and this is that.
 */
const TEST_CONTRACT = Object.freeze({
  'name': 'string',
  'identifier': 'string',
  'notes': 'string',
  'save.ability': 'enum:ABILITIES',
  'save.dc': 'number',
  'damage.formula': 'string',
  'damage.type': 'enum:DAMAGE_TYPES',
  'damage.onSave': 'enum:none|half|full',
  'condition': 'enumOrString:CONDITIONS',
  'target.count': 'number',
  'target.type': 'enum:range|sphere|cone|cube|cylinder|line|square|circle|rect|radius',
  'target.size': 'number',
  'range.units': 'string',
  'range.value': 'number',
  'repeatSave': 'boolean',
  'repeatSaveTurn': 'enum:start|end',
});

test('reads values from a flat spec keyed by dotted path', () => {
  const spec = { 'save.ability': 'str', 'save.dc': 14 };
  assert.equal(getSpecValue(spec, 'save.ability'), 'str');
  assert.equal(getSpecValue(spec, 'save.dc'), 14);
});

test('reads values from the same paths in a nested spec', () => {
  const spec = { save: { ability: 'str', dc: 14 } };
  assert.equal(getSpecValue(spec, 'save.ability'), 'str');
  assert.equal(getSpecValue(spec, 'save.dc'), 14);
});

test('a flat key wins over a nested one, so a round-tripped spec is authoritative', () => {
  const spec = { 'save.dc': 16, save: { dc: 14 } };
  assert.equal(getSpecValue(spec, 'save.dc'), 16);
});

test('returns undefined for absent paths rather than throwing', () => {
  assert.equal(getSpecValue({}, 'save.dc'), undefined);
  assert.equal(getSpecValue({ save: {} }, 'save.dc'), undefined);
  assert.equal(getSpecValue({ save: null }, 'save.dc'), undefined);
  assert.equal(getSpecValue({ save: 5 }, 'save.dc'), undefined);
  assert.equal(getSpecValue(null, 'save.dc'), undefined);
});

test('coerces numbers from strings, as a form always supplies strings', () => {
  assert.equal(getSpecNumber({ 'save.dc': '14' }, 'save.dc'), 14);
  assert.equal(getSpecNumber({ 'save.dc': 14 }, 'save.dc'), 14);
  assert.equal(getSpecNumber({ 'save.dc': 'nope' }, 'save.dc'), undefined);
  assert.equal(getSpecNumber({ 'save.dc': '' }, 'save.dc'), undefined);
});

test('coerces booleans from the strings a checkbox form supplies', () => {
  assert.equal(getSpecBoolean({ repeatSave: 'true' }, 'repeatSave'), true);
  assert.equal(getSpecBoolean({ repeatSave: 'false' }, 'repeatSave'), false);
  assert.equal(getSpecBoolean({ repeatSave: true }, 'repeatSave'), true);
  assert.equal(getSpecBoolean({}, 'repeatSave'), false);
  assert.equal(getSpecBoolean({}, 'repeatSave', true), true);
});

test('treats an empty string as absent, so a cleared form field falls back', () => {
  assert.equal(getSpecString({ identifier: '   ' }, 'identifier'), undefined);
  assert.equal(getSpecString({ identifier: ' ok ' }, 'identifier'), 'ok');
});

test('derives a stable kebab-case identifier from an ability name', () => {
  assert.equal(deriveIdentifier('Tanglefoot'), 'tanglefoot');
  assert.equal(deriveIdentifier('Crushing Grip'), 'crushing-grip');
  assert.equal(deriveIdentifier('Hand of Death!'), 'hand-of-death');
  assert.equal(deriveIdentifier("Thief's Reflexes"), 'thief-s-reflexes');
  assert.equal(deriveIdentifier('Vampiric Touch (Greater)'), 'vampiric-touch-greater');
});

test('derivation is stable, because it is the upsert key', () => {
  const first = deriveIdentifier('Tanglefoot');
  const second = deriveIdentifier('Tanglefoot');
  assert.equal(first, second);
});

test('derivation handles names with accents and stray punctuation', () => {
  assert.equal(deriveIdentifier('Café — Ability'), 'cafe-ability');
  assert.equal(deriveIdentifier('...'), '');
  assert.equal(deriveIdentifier(''), '');
  assert.equal(deriveIdentifier(undefined), '');
});

test('accepts a well-formed Tanglefoot spec', () => {
  const spec = {
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
  };

  const result = validateSpec(spec, TEST_CONTRACT, {
    required: ['save.ability', 'save.dc', 'name'],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(result.warnings, []);
});

test('accepts the same spec in nested form', () => {
  const spec = {
    name: 'Crushing Grip',
    save: { ability: 'con', dc: 14 },
    damage: { formula: '3d6', type: 'bludgeoning', onSave: 'half' },
  };
  const result = validateSpec(spec, TEST_CONTRACT, {
    required: ['save.ability', 'save.dc', 'name'],
  });
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('rejects an invalid enum and names the accepted values', () => {
  const spec = { name: 'X', 'save.ability': 'strength', 'save.dc': 14 };
  const result = validateSpec(spec, TEST_CONTRACT, { required: ['save.ability'] });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /"save\.ability" must be one of/);
  assert.match(result.errors[0], /str, dex, con, int, wis, cha/);
  assert.match(result.errors[0], /you sent "strength"/, 'the error quotes what was sent');
});

test('rejects an out-of-range save DC', () => {
  const low = validateSpec({ 'save.dc': 0, name: 'X' }, TEST_CONTRACT);
  assert.equal(low.ok, false);
  assert.match(low.errors[0], /between 1 and 40/);

  const high = validateSpec({ 'save.dc': 99, name: 'X' }, TEST_CONTRACT);
  assert.equal(high.ok, false);
});

test('rejects a non-numeric value where a number is required', () => {
  const result = validateSpec({ 'save.dc': 'lots', name: 'X' }, TEST_CONTRACT);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /must be a number/);
});

test('rejects an area template with no size', () => {
  const result = validateSpec(
    { name: 'X', 'target.type': 'sphere' },
    TEST_CONTRACT
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /"target\.size" is missing/);
});

test('reports unknown spec keys as warnings, not errors', () => {
  const spec = {
    name: 'X',
    'save.ability': 'dex',
    'save.dc': 12,
    'some.nuance': 'the text mentions a secondary effect we cannot automate',
  };
  const result = validateSpec(spec, TEST_CONTRACT);

  assert.equal(result.ok, true, 'an unrecognised key must not block the build');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /"some\.nuance" is not part of the contract/);
  assert.match(result.warnings[0], /notes/, 'the warning suggests where to record it');
});

test('warns when damage has no type', () => {
  const result = validateSpec(
    { name: 'X', 'damage.formula': '3d6' },
    TEST_CONTRACT
  );
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /untyped/);
});

test('accepts a non-core condition with a warning rather than rejecting', () => {
  const result = validateSpec(
    { name: 'X', condition: 'hexed' },
    TEST_CONTRACT
  );
  assert.equal(result.ok, true, 'a module may register extra conditions');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /"hexed"/);
});

test('accepts core conditions silently', () => {
  for (const condition of CONDITIONS) {
    const result = validateSpec({ name: 'X', condition }, TEST_CONTRACT);
    assert.equal(result.ok, true, `${condition} should validate`);
    assert.equal(result.warnings.length, 0, `${condition} should not warn`);
  }
});

test('names every missing required path', () => {
  const result = validateSpec({}, TEST_CONTRACT, {
    required: ['save.ability', 'save.dc', 'name'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some(e => /"save\.ability" is required/.test(e)));
  assert.ok(result.errors.some(e => /"save\.dc" is required/.test(e)));
  assert.ok(result.errors.some(e => /"name" is required/.test(e)));
});

test('rejects a non-object spec', () => {
  for (const bad of [null, undefined, 'x', 5, []]) {
    const result = validateSpec(bad, TEST_CONTRACT);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ['spec must be an object']);
  }
});

test('every declared vocabulary referenced by the contract exists', () => {
  for (const [path, type] of Object.entries(TEST_CONTRACT)) {
    if (!type.startsWith('enum:') || type.includes('|')) continue;
    const name = type.slice(5);
    // Resolving through a probe value proves the vocabulary is registered.
    const probe = validateSpec({ [path]: '\u0000impossible' }, TEST_CONTRACT);
    const unknownVocabulary = probe.errors.some(e => /unknown vocabulary/.test(e));
    assert.equal(unknownVocabulary, false, `${path} references missing vocabulary ${name}`);
  }
});

test('spec vocabularies match what we verified against dnd5e 6.0.6', () => {
  assert.deepEqual(ABILITIES, ['str', 'dex', 'con', 'int', 'wis', 'cha']);
  assert.ok(DAMAGE_TYPES.includes('bludgeoning'));
  assert.ok(DAMAGE_TYPES.includes('necrotic'));
  assert.ok(CONDITIONS.includes('restrained'));
  assert.ok(CONDITIONS.includes('grappled'));
});
