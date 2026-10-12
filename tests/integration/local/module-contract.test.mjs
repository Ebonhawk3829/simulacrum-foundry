import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * The Foundry build the verified dnd5e release requires.
 *
 * dnd5e 6.0.6 declares `compatibility.minimum` of 14.367 in its own `system.json`,
 * so a module that claims to support dnd5e 6.0.6 while advertising a Foundry
 * floor below 14.367 is advertising a combination that cannot boot. The earlier
 * value here was `13`, which is wrong in exactly that way: it let Foundry 13
 * install this module and then fail on the system requirement.
 *
 * Bump this only together with `relationships.systems[0].compatibility.verified` in
 * module.json - they describe the same pairing from two directions.
 */
const DND5E_VERIFIED_FOUNDRY_FLOOR = '14.367';

/** Compare dotted Foundry version strings, which are not semver-shaped. */
function foundryVersionAtLeast(actual, required) {
  const a = String(actual).split('.').map(Number);
  const b = String(required).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

test('module manifest points to existing local entry points and assets', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'module.json'), 'utf8'));

  assert.equal(manifest.id, 'simulacrum');
  assert.equal(manifest.socket, false);

  const verifiedSystem = manifest.relationships.systems[0].compatibility.verified;

  // The module's own floor must be at least the floor the system it verifies
  // against imposes, or it will install on a Foundry version that cannot run it.
  assert.ok(
    foundryVersionAtLeast(manifest.compatibility.minimum, DND5E_VERIFIED_FOUNDRY_FLOOR),
    `compatibility.minimum is ${manifest.compatibility.minimum} but dnd5e `
      + `${verifiedSystem} requires Foundry ${DND5E_VERIFIED_FOUNDRY_FLOOR}`
  );
  assert.ok(
    foundryVersionAtLeast(manifest.compatibility.verified, manifest.compatibility.minimum),
    'verified must not be below minimum'
  );
  if (manifest.compatibility.maximum != null) {
    const { maximum, verified } = manifest.compatibility;
    assert.ok(foundryVersionAtLeast(maximum, verified), 'maximum must not be below verified');
  }

  for (const path of [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(x => x.path),
  ]) {
    await access(resolve(ROOT, path));
  }
});

test('all Handlebars partial paths referenced by the module exist', async () => {
  const entry = await readFile(resolve(ROOT, 'scripts/simulacrum.js'), 'utf8');
  const paths = [...entry.matchAll(/['"](templates\/[^'"]+\.hbs)['"]/gu)].map(match => match[1]);

  for (const path of paths) await access(resolve(ROOT, path));
});
