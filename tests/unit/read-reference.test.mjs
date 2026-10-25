import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ReadReferenceTool } from '../../scripts/tools/read-reference.js';

/**
 * Install a fake fetch and Foundry route, so the tool can be exercised without a
 * world. `files` maps a route to a body, or to null for a 404.
 */
function withFetch(files, run) {
  const previous = { fetch: globalThis.fetch, foundry: globalThis.foundry };
  const requested = [];

  globalThis.foundry = { utils: { getRoute: path => `/${path}` } };
  globalThis.fetch = async url => {
    const route = String(url).replace(/^\//, '');
    requested.push(route);
    if (!(route in files)) return { ok: false, status: 404, text: async () => '' };
    const body = files[route];
    return { ok: true, status: 200, text: async () => body };
  };

  return Promise.resolve()
    .then(() => run({ requested }))
    .finally(() => {
      globalThis.fetch = previous.fetch;
      globalThis.foundry = previous.foundry;
    });
}

const MANIFEST = JSON.stringify({ id: 'midi-qol', readme: 'README.md' });

// This module declares its reference files, so the probe needs no guessing.
const SIMULACRUM_MANIFEST = JSON.stringify({
  id: 'simulacrum',
  flags: { simulacrum: { reference: ['dnd5e-6.0-fields.md'] } },
});

test('lists the reference it can reach', async () => {
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md': '# Fields\n\nsave.dc is a formula.',
      'modules/midi-qol/module.json': MANIFEST,
      'modules/midi-qol/README.md': '# Flags\n\nfail.all fails every roll.',
    },
    () => tool.execute({})
  );

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.ok(body.fileCount >= 2);
  assert.ok(body.sources.some(s => s.source === 'module'));
  assert.ok(body.sources.some(s => s.source === 'midi-qol'));
});

test('a missing module costs nothing but itself', async () => {
  // One module without documentation must not hide the others, or an uninstalled
  // optional dependency would blind the agent entirely.
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md': '# Fields',
    },
    () => tool.execute({})
  );

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.equal(body.fileCount, 1);
  assert.equal(body.sources[0].source, 'module');
});

test('search returns passages with a line number', async () => {
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md':
        '# Fields\n\nsome prose\n\nthe DC is computed from range, never target\n\nmore prose',
    },
    () => tool.execute({ query: 'computed from range', context: 20 })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.matchCount, 1);
  assert.equal(body.matches[0].line, 5, 'the line number locates the passage');
  assert.match(body.matches[0].text, /computed from range/);
  assert.match(body.next, /Read the relevant file in full/);
});

test('a search with no match says how to look differently', async () => {
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md': '# Fields',
    },
    () => tool.execute({ query: 'nonexistent-term' })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.matchCount, 0);
  assert.match(body.next, /inspect_document_schema/);
});

test('reading one file returns it in full', async () => {
  const tool = new ReadReferenceTool();
  const text = '# Fields\n\nline two\n\nline three';
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md': text,
    },
    () => tool.execute({ file: 'module/dnd5e-6.0-fields.md' })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.equal(body.text, text);
});

test('an unreadable file is rejected with what is available', async () => {
  const tool = new ReadReferenceTool();
  const result = await withFetch({}, () => tool.execute({ file: 'nope/missing.md' }));

  assert.equal(result.error.type, 'NOT_FOUND');
  assert.ok(Array.isArray(JSON.parse(result.content).available));
});

test('reporting no reference names the routes it tried', async () => {
  // If this fires in play, the useful question is "where did it look", and the
  // answer belongs in the result rather than in a log the agent cannot read.
  const tool = new ReadReferenceTool();
  const result = await withFetch({}, () => tool.execute({}));

  assert.equal(result.error.type, 'NO_REFERENCE');
  const body = JSON.parse(result.content);
  assert.ok(body.searched.length > 0);
  assert.ok(body.searched.some(r => r.includes('modules/simulacrum/reference')));
  assert.match(body.hint, /inspect_document_schema/);
});

test('a source filter narrows the probe', async () => {
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    {
      'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
      'modules/simulacrum/reference/dnd5e-6.0-fields.md': '# Fields',
      'modules/midi-qol/module.json': MANIFEST,
      'modules/midi-qol/README.md': '# Flags',
    },
    () => tool.execute({ source: 'module' })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.sources.length, 1);
  assert.equal(body.sources[0].source, 'module');
});

test('a path from a listing can be read back without re-probing', async () => {
  const tool = new ReadReferenceTool();
  const files = {
    'modules/simulacrum/module.json': SIMULACRUM_MANIFEST,
    'modules/simulacrum/reference/dnd5e-6.0-fields.md': '# Fields\n\nbody text',
  };

  await withFetch(files, () => tool.execute({ source: 'module' }));
  const result = await withFetch(files, () => tool.execute({ file: 'module/dnd5e-6.0-fields.md' }));

  assert.equal(JSON.parse(result.content).ok, true);
});

test('a file name is not lower-cased into a route that does not exist', async () => {
  // The bug this exists for: a file that was not in the index had its path
  // lower-cased before a route was built from it, so `cat/README.md` was requested
  // as `modules/cat/readme.md`. Windows resolves that anyway and Linux does not,
  // which is exactly how it shipped: fine in development, broken in the world.
  const tool = new ReadReferenceTool();
  const result = await withFetch(
    { 'modules/cat/README.md': '# Coven automation toolkit' },
    () => tool.execute({ file: 'cat/README.md' })
  );

  assert.equal(JSON.parse(result.content).ok, true);
  assert.match(result.display, /README\.md/, 'the path is reported as it exists on disk');
});

test('a file named in mixed case still resolves', async () => {
  // The counterpart: the agent should not have to reproduce capitalisation to be
  // understood, so a lookup against what is already indexed stays case-insensitive.
  const tool = new ReadReferenceTool();
  const files = {
    'modules/midi-qol/module.json': MANIFEST,
    'modules/midi-qol/README.md': '# Flags',
  };

  await withFetch(files, () => tool.execute({ source: 'midi-qol' }));
  const result = await withFetch(files, () => tool.execute({ file: 'MIDI-QOL/README.MD' }));

  assert.equal(JSON.parse(result.content).ok, true);
});
