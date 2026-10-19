/**
 * The generated references stay honest.
 *
 * Two of the reference files are generated rather than written: the CPR generic
 * settings, extracted from CPR's source. A generated file rots in a specific way —
 * it does not become wrong, it becomes *incomplete*, describing the version it was
 * generated from while the module moves on. That is worse than absent, because the
 * agent reads a confident table and does not know settings are missing from it.
 *
 * These tests cannot re-run the generator (it needs a CPR clone and a network), so
 * they check the properties that would break silently: that the file is present,
 * declared to the probe, and carries the provenance needed to notice it is old.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const REFERENCE = resolve(ROOT, 'reference');

/** The id and version of the module the generated file describes. */
function pinnedExtracts() {
  // EXTRACTS.json sits beside the workspace tooling, which is not always the fork's
  // direct parent: in this workspace the fork lives at resources/_clones/simulacrum-foundry
  // while the manifest is at resources/EXTRACTS.json. Search upward rather than assuming
  // one level, or the version check below silently never runs.
  let dir = ROOT;
  for (let i = 0; i < 4; i++) {
    dir = resolve(dir, '..');
    const candidate = resolve(dir, 'EXTRACTS.json');
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf8'));
  }
  return null; // the workspace tooling is not always beside us
}

test('every declared reference file exists', () => {
  // The declaration is what the probe trusts INSTEAD of guessing filenames, so a
  // name here that has no file behind it makes the source unusable while still
  // being advertised — the failure the doc list was just fixed for.
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'module.json'), 'utf8'));
  const declared = manifest.flags?.simulacrum?.reference ?? [];

  assert.ok(declared.length > 0, 'the reference list must not be empty');
  for (const name of declared) {
    assert.ok(
      existsSync(resolve(REFERENCE, name)),
      `module.json declares reference/${name}, which does not exist`
    );
  }
});

test('the generated CPR settings carry their provenance', () => {
  const path = resolve(REFERENCE, 'cpr-generic-config.md');
  assert.ok(existsSync(path), 'the generated CPR settings file is required');

  const text = readFileSync(path, 'utf8');

  // A generated file must name the version it came from, or nobody can tell whether
  // it is stale. The tag is what the extract manifest pins.
  assert.match(
    text,
    /Generated from CPR source at \*\*\d+\.\d+\.\d+\*\*/,
    'the file must state the CPR version it was generated from'
  );
  assert.match(
    text,
    /generate-cpr-config\.mjs/,
    'the file must name its generator, so it can be regenerated'
  );
  assert.match(text, /do not hand-edit/i, 'a generated file must say so');

  // Sanity on size: a run that resolved nothing would still write a plausible header.
  const rows = text.split('\n').filter(line => /^\| `/.test(line));
  assert.ok(rows.length > 100, `expected many settings, found ${rows.length}`);
});

test('the generated file names the same CPR version the extracts are pinned to', () => {
  const extracts = pinnedExtracts();
  if (!extracts) return; // nothing to compare against outside the workspace

  const pinned = extracts.modules?.['chris-premades']?.tag ?? extracts['chris-premades']?.tag;
  if (!pinned) return;

  const text = readFileSync(resolve(REFERENCE, 'cpr-generic-config.md'), 'utf8');
  assert.match(
    text,
    new RegExp(`Generated from CPR source at \\*\\*${pinned.replace(/\./g, '\\.')}\\*\\*`),
    `the generated settings say they came from a different CPR build than the pinned ${pinned}; regenerate`
  );
});

test('the attachment and configuration halves reference each other', () => {
  // They are read together and are useless apart: the flag shape says a generic is
  // attached by identifier, and the settings table says what that identifier accepts.
  const flags = readFileSync(resolve(REFERENCE, 'cat-macro-flags.md'), 'utf8');
  const config = readFileSync(resolve(REFERENCE, 'cpr-generic-config.md'), 'utf8');

  assert.match(flags, /cpr-generic-config\.md/, 'the flag guide must point at the settings');
  assert.match(config, /cat-macro-flags\.md/, 'the settings must point at the flag guide');
});
