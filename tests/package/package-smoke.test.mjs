import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildRelease,
  collectFiles,
  directoryEntries,
  parseManifest,
  findDuplicateTopLevelKeys,
  EXCLUDED_ROOTS,
  REQUIRED_FILES,
  WITHDRAWN_FILES,
} from '../../tools/lib/release-builder.mjs';
import { readZip, createZip } from '../../tools/lib/zip.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

/** Build the release once; every test below inspects the same artifact. */
const release = buildRelease({
  root: ROOT,
  version: '0.0.0',
  repoUrl: 'https://github.com/example/simulacrum-foundry',
  commit: 'test',
  date: '2026-01-01T00:00:00.000Z',
});
const names = release.entries.map(entry => entry.name);
const files = names.filter(name => !name.endsWith('/'));

test('the archive wraps everything in a folder named after the module id', () => {
  // Foundry extracts the archive straight into Data/modules/, so the manifest
  // must land inside a folder whose name matches the manifest id.
  assert.equal(release.folder, 'simulacrum');
  assert.ok(names.includes('simulacrum/'), 'the folder itself is an entry');
  assert.ok(files.every(name => name.startsWith('simulacrum/')), 'nothing sits outside the folder');
});

test('the archive contains the manifest at its expected path', () => {
  assert.ok(files.includes('simulacrum/module.json'));
});

test('the archive contains every file the module needs to load', () => {
  for (const required of REQUIRED_FILES) {
    assert.ok(names.includes(`simulacrum/${required}`), `missing ${required}`);
  }
});

test('the in-game tools ship, because they are the point of the module', () => {
  // Regression guard: excluding a top-level "tools/" directory by NAME also
  // swallowed "scripts/tools/", producing an archive that installed cleanly and
  // then failed on its first tool import.
  const toolFiles = files.filter(name => name.startsWith('simulacrum/scripts/tools/'));
  assert.ok(toolFiles.length >= 20, `expected the tool modules, found ${toolFiles.length}`);
  assert.ok(toolFiles.includes('simulacrum/scripts/tools/build-save-ability.js'));
  assert.ok(toolFiles.includes('simulacrum/scripts/tools/test-ability.js'));
  assert.ok(toolFiles.includes('simulacrum/scripts/tools/preview-spec.js'));
});

test('development paths never reach the archive', () => {
  for (const excluded of EXCLUDED_ROOTS) {
    const leaked = files.filter(name => name.startsWith(`simulacrum/${excluded}/`));
    assert.deepEqual(leaked, [], `${excluded}/ leaked into the release`);
  }
  assert.equal(files.some(name => name.startsWith('simulacrum/packs/_source/')), false);
});

test('the withdrawn demo asset is not shipped', () => {
  for (const withdrawn of WITHDRAWN_FILES) {
    assert.equal(files.includes(`simulacrum/${withdrawn}`), false, `${withdrawn} should be withdrawn`);
  }
});

test('no stray secrets or environment files are shipped', () => {
  const risky = files.filter(name =>
    /(?:^|\/)\.env(?:\.|$)|\.foundry\.env\.json$|credentials/i.test(name)
  );
  assert.deepEqual(risky, []);
});

test('the archive carries an explicit entry for each directory', () => {
  const directories = names.filter(name => name.endsWith('/'));
  assert.ok(directories.length > 0, 'released packages contain directory entries');
  assert.ok(directories.includes('simulacrum/scripts/'));
  assert.ok(directories.includes('simulacrum/scripts/core/'));

  // Every directory entry must be implied by a real file, or the archive is
  // carrying empty folders.
  for (const dir of directories) {
    const populated = files.some(name => name.startsWith(dir));
    assert.ok(populated, `${dir} is empty`);
  }
});

test('the stamped manifest points the download at this version', () => {
  const manifest = JSON.parse(
    release.entries.find(entry => entry.name === 'simulacrum/module.json').data.toString('utf8')
  );

  assert.equal(manifest.version, '0.0.0');
  assert.equal(
    manifest.download,
    'https://github.com/example/simulacrum-foundry/releases/download/0.0.0/simulacrum.zip'
  );
  // The manifest URL must stay on a stable address, or Foundry stops seeing
  // updates once a newer release exists.
  assert.equal(
    manifest.manifest,
    'https://github.com/example/simulacrum-foundry/releases/latest/download/module.json'
  );
});

test('the repository manifest has no duplicate keys', () => {
  const text = readFileSync(join(ROOT, 'module.json'), 'utf8');
  assert.deepEqual(findDuplicateTopLevelKeys(text), []);
  // A duplicate would silently keep the last value, so the guard must throw.
  assert.throws(() => parseManifest('{\n  "a": 1,\n  "a": 2\n}'), /more than once/);
});

test('the repository manifest declares its id, version and compatibility', () => {
  const manifest = parseManifest(readFileSync(join(ROOT, 'module.json'), 'utf8'));
  assert.equal(manifest.id, 'simulacrum');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.compatibility.minimum);
  assert.ok(manifest.compatibility.verified);
});

test('the declared entry points exist in the archive', () => {
  const manifest = parseManifest(readFileSync(join(ROOT, 'module.json'), 'utf8'));
  for (const script of manifest.esmodules) {
    assert.ok(files.includes(`simulacrum/${script}`), `esmodule ${script} is not in the archive`);
  }
  for (const style of manifest.styles) {
    assert.ok(files.includes(`simulacrum/${style}`), `style ${style} is not in the archive`);
  }
  for (const language of manifest.languages) {
    assert.ok(files.includes(`simulacrum/${language.path}`), `language ${language.path} is not in the archive`);
  }
});

test('the pack listed in the manifest is present', () => {
  const manifest = parseManifest(readFileSync(join(ROOT, 'module.json'), 'utf8'));
  for (const pack of manifest.packs) {
    const present = files.some(name => name.startsWith(`simulacrum/${pack.path}/`));
    assert.ok(present, `pack ${pack.name} has no files in the archive`);
  }
});

test('the archive is readable and each entry inflates to its declared size', () => {
  // readZip verifies the length of every entry against the directory as it
  // reads, so a clean read means the archive is internally consistent.
  const entries = readZip(release.zip);
  assert.equal(entries.length, names.length);
  const manifestEntry = entries.find(entry => entry.name === 'simulacrum/module.json');
  assert.ok(manifestEntry.data.length > 0);
});

test('an incoherent build is rejected rather than published', () => {
  assert.throws(
    () => buildRelease({ root: join(ROOT, 'tests'), version: '0.0.0' }),
    /module\.json|ENOENT|no "id"/i
  );
});

test('a version Foundry cannot parse is rejected', () => {
  // Foundry's version comparison does not support "-" pre-release notation, so
  // accepting one here would publish a module whose version reads oddly or
  // sorts wrongly against other releases.
  for (const bad of ['0.1.0-beta', 'v0.1.0', '0.1', 'next', '', undefined]) {
    assert.throws(
      () => buildRelease({ root: ROOT, version: bad }),
      /three-part version/,
      `version ${JSON.stringify(bad)} should be rejected`
    );
  }
});

test('collectFiles never walks an excluded root', () => {
  const collected = collectFiles(ROOT);
  for (const excluded of EXCLUDED_ROOTS) {
    assert.equal(
      collected.some(file => file.path === excluded || file.path.startsWith(`${excluded}/`)),
      false,
      `${excluded}/ was collected`
    );
  }
  assert.ok(collected.some(file => file.path.startsWith('scripts/tools/')));
});

test('directory entries are derived from the files, not invented', () => {
  const dirs = directoryEntries(['a/b/c.txt', 'a/d.txt', 'e.txt']);
  assert.deepEqual(dirs, ['a/', 'a/b/']);
});

test('the zip writer round-trips names, contents and directories', () => {
  const zip = createZip([
    { name: 'p/', data: '' },
    { name: 'p/module.json', data: '{"id":"p"}' },
    { name: 'p/deep/nested/file.js', data: 'export const x = 1;\n'.repeat(30) },
  ]);

  const entries = readZip(zip);
  assert.deepEqual(
    entries.map(entry => entry.name),
    ['p/', 'p/module.json', 'p/deep/nested/file.js']
  );
  assert.equal(entries[1].data.toString('utf8'), '{"id":"p"}');
  assert.equal(entries[0].isDirectory, true);
  assert.equal(entries[2].isDirectory, false);
});

test('the zip writer handles binary data and empty files', () => {
  const binary = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x7f]);
  const zip = createZip([
    { name: 'bin.dat', data: binary },
    { name: 'empty.txt', data: '' },
  ]);

  const entries = readZip(zip);
  assert.deepEqual(entries.find(e => e.name === 'bin.dat').data, binary);
  assert.equal(entries.find(e => e.name === 'empty.txt').data.length, 0);
});

test('the zip writer rejects an archive that is not a zip', () => {
  assert.throws(() => readZip(Buffer.from('this is not an archive')), /Not a ZIP archive/);
});
