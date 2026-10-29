import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildIconPrompt } from '../../scripts/core/icon-service.js';
import { buildItemSystem } from '../../scripts/core/dnd5e/item-builders.js';
import { GenerateIconTool } from '../../scripts/tools/generate-icon.js';

/**
 * The icon path runs in plain Node with a small stand-in for the three Foundry
 * surfaces it touches: `game` (user + settings), the FilePicker, and `fetch`.
 * What matters is the request body and the bytes that land, so the fake fetch
 * records what was sent and the fake FilePicker returns the path it was given.
 */

function withGlobals({ isGM = true, settings = {}, fetchImpl, finder }, run) {
  const previous = {
    game: globalThis.game,
    foundry: globalThis.foundry,
    fetch: globalThis.fetch,
    File: globalThis.File,
  };

  globalThis.game = {
    user: { id: 'gm1', isGM },
    settings: { get: (_module, key) => settings[key] },
  };
  globalThis.foundry = {
    applications: { apps: { FilePicker: { implementation: finder } } },
  };
  globalThis.fetch = fetchImpl;
  // Node has no `File` before v20; the service only needs it to name the upload.
  globalThis.File = class {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options?.type;
    }
  };

  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.game = previous.game;
      globalThis.foundry = previous.foundry;
      globalThis.fetch = previous.fetch;
      globalThis.File = previous.File;
    });
}

function okFetch(capture = {}) {
  return async (url, options) => {
    capture.url = url;
    capture.body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'AAEC', media_type: 'image/png' }],
        usage: { cost: 0.012 },
      }),
    };
  };
}

function fakeFinder(capture = {}) {
  return {
    createDirectory: async () => {},
    upload: async (source, dir, file) => {
      capture.source = source;
      capture.dir = dir;
      capture.filename = file.name;
      capture.type = file.type;
      return { path: `${dir}/${file.name}` };
    },
  };
}

test('the prompt carries the subject and the fixed tile invariants', () => {
  const prompt = buildIconPrompt('cloud of biting flies');
  assert.match(prompt, /cloud of biting flies/);
  assert.match(prompt, /full-bleed/i);
  assert.match(prompt, /no text/i);
});

test('img never passes through into system data', () => {
  const system = buildItemSystem({ img: 'icons/simulacrum/x.png', name: 'X' }, 'x');
  assert.equal(system.img, undefined);
});

test('a non-GM cannot generate icons', async () => {
  const tool = new GenerateIconTool();
  const result = await withGlobals({ isGM: false }, () => tool.execute({ subject: 'x' }));
  assert.equal(JSON.parse(result.content).ok, false);
  assert.equal(result.error.type, 'PERMISSION_DENIED');
});

test('a missing API key is reported, not thrown', async () => {
  const tool = new GenerateIconTool();
  const result = await withGlobals({ settings: {} }, () => tool.execute({ subject: 'x' }));
  assert.equal(result.error.type, 'NO_API_KEY');
});

test('an empty subject is rejected before any request is made', async () => {
  const tool = new GenerateIconTool();
  let called = false;
  const result = await withGlobals(
    {
      settings: { apiKey: 'k' },
      fetchImpl: async () => {
        called = true;
      },
    },
    () => tool.execute({ subject: '   ' })
  );
  assert.equal(result.error.type, 'VALIDATION_ERROR');
  assert.equal(called, false);
});

test('generates, uploads, and returns the foundry path', async () => {
  const fetchCapture = {};
  const fileCapture = {};
  const tool = new GenerateIconTool();
  const settings = { apiKey: 'sk-test', iconModel: 'google/gemini-3.1-flash-image' };

  const result = await withGlobals(
    { settings, fetchImpl: okFetch(fetchCapture), finder: fakeFinder(fileCapture) },
    () => tool.execute({ subject: 'lightning', identifier: 'glowing-lightning-bolt' })
  );

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.equal(body.path, 'icons/simulacrum/glowing-lightning-bolt.png');
  assert.equal(body.cost, 0.012);

  assert.equal(fetchCapture.url, 'https://openrouter.ai/api/v1/images');
  assert.equal(fetchCapture.body.model, 'google/gemini-3.1-flash-image');
  assert.equal(fetchCapture.body.resolution, '512');
  assert.equal(fetchCapture.body.aspect_ratio, '1:1');
  assert.equal(fetchCapture.body.background, undefined);

  assert.equal(fileCapture.source, 'data');
  assert.equal(fileCapture.dir, 'icons/simulacrum');
  assert.equal(fileCapture.filename, 'glowing-lightning-bolt.png');
});

test('a default filename stem is derived when none is given', async () => {
  const tool = new GenerateIconTool();
  const settings = { apiKey: 'sk-test' };

  const result = await withGlobals({ settings, fetchImpl: okFetch(), finder: fakeFinder() }, () =>
    tool.execute({ subject: 'Cloud of Biting Flies' })
  );

  const body = JSON.parse(result.content);
  assert.match(body.path, /^icons\/simulacrum\/[a-z0-9-]+\.png$/);
});
