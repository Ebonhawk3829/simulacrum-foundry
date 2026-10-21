import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryStore, parseSections } from '../../scripts/core/memory-store.js';
import { ReadMemoryTool } from '../../scripts/tools/read-memory.js';
import { AppendHistoryTool } from '../../scripts/tools/append-history.js';
import { WriteLessonTool } from '../../scripts/tools/write-lesson.js';

/**
 * Install a fake Foundry route, fetch and FilePicker over an in-memory map, so the
 * store can be exercised without a world. Reads go through fetch; writes go through
 * FilePicker.upload, and land in the same map, so a write can be read back.
 */
function withMemory(files, run) {
  const previous = { fetch: globalThis.fetch, foundry: globalThis.foundry };
  const store = new Map(Object.entries(files));
  const uploads = [];

  const implementation = {
    createDirectory: async () => ({}),
    upload: async (source, path, file) => {
      const route = `${path}/${file.name}`;
      store.set(route, await file.text());
      uploads.push({ source, route });
      return { path: route };
    },
  };

  globalThis.foundry = {
    utils: { getRoute: path => `/${path}` },
    applications: { apps: { FilePicker: { implementation } } },
  };
  globalThis.fetch = async url => {
    const route = String(url).replace(/^\//, '');
    if (!store.has(route)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => store.get(route) };
  };

  return Promise.resolve()
    .then(() => run({ uploads, store }))
    .finally(() => {
      globalThis.fetch = previous.fetch;
      globalThis.foundry = previous.foundry;
    });
}

test('an empty store reads as empty, not as an error', async () => {
  const summary = await withMemory({}, () => new MemoryStore().summary());

  assert.deepEqual(summary.lessonTitles, []);
  assert.equal(summary.historyEntries, 0);
  assert.match(summary.location, /Data\/simulacrum/);
});

test('a lesson is written, indexed, and read back', async () => {
  await withMemory({}, async () => {
    const store = new MemoryStore();
    const result = await store.writeLesson({ title: 'OverTime needs a turn end', body: 'Set turn=end or it never expires.' });

    assert.equal(result.action, 'added');
    assert.deepEqual(await store.lessonIndex(), [{ title: 'OverTime needs a turn end', lines: 1 }]);
    assert.match(await store.readLessons(), /turn=end/);
  });
});

test('re-recording a lesson updates it instead of duplicating it', async () => {
  await withMemory({}, async () => {
    const store = new MemoryStore();
    await store.writeLesson({ title: 'Grapple', body: 'first' });
    const second = await store.writeLesson({ title: 'grapple', body: 'second' });

    assert.equal(second.action, 'updated');
    const index = await store.lessonIndex();
    assert.equal(index.length, 1, 'matched case-insensitively, so only one lesson');
    assert.match(await store.readLessons(), /second/);
  });
});

test('history is append-only: a later entry keeps the earlier one', async () => {
  await withMemory({}, async () => {
    const store = new MemoryStore();
    await store.appendHistory({ title: 'Built Tanglefoot', body: 'waiting on a live test', stamp: '2026-10-22 09:00' });
    await store.appendHistory({ title: 'Tested Tanglefoot', body: 'save DC was wrong', stamp: '2026-10-22 09:30' });

    const history = await store.readHistory();
    assert.match(history, /Built Tanglefoot/);
    assert.match(history, /Tested Tanglefoot/);
    assert.equal(parseSections(history).length, 2);
  });
});

test('parseSections drops any preamble before the first heading', () => {
  const sections = parseSections('intro text\n## One\na\n## Two\nb\n');
  assert.deepEqual(
    sections.map(s => s.title),
    ['One', 'Two']
  );
});

test('read_memory with no arguments returns the index of headings', async () => {
  const files = {
    'simulacrum/lessons.md': '## Use sourceStart\n\nnot turnStart\n',
    'simulacrum/history.md': '## 2026-10-22 09:00 — Did a thing\n\nbody\n',
  };
  const result = await withMemory(files, () => new ReadMemoryTool().execute({}));

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.deepEqual(body.lessons, ['Use sourceStart']);
  assert.equal(body.history.entries, 1);
});

test('read_memory search finds a passage with a line number', async () => {
  const files = { 'simulacrum/lessons.md': '## Use sourceStart\n\nnot turnStart, which loses the distinction\n' };
  const result = await withMemory(files, () => new ReadMemoryTool().execute({ query: 'loses the distinction' }));

  const body = JSON.parse(result.content);
  assert.equal(body.matchCount, 1);
  assert.equal(body.matches[0].path, 'lessons.md');
  assert.equal(body.matches[0].line, 3);
});

test('the memory tools declare the right confirmation behaviour', () => {
  assert.equal(new ReadMemoryTool().requiresConfirmation, false);
  assert.equal(new AppendHistoryTool().requiresConfirmation, false);
  assert.equal(new WriteLessonTool().requiresConfirmation, true, 'a lesson becomes standing guidance');
});

test('append_history writes an entry the agent can read back', async () => {
  const result = await withMemory({}, () => new AppendHistoryTool().execute({ title: 'Built X', body: 'needs a test' }));

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.equal(body.entries, 1);
  assert.match(body.file, /history\.md/);
});

test('write_lesson reports whether it added or updated', async () => {
  const result = await withMemory({}, () => new WriteLessonTool().execute({ title: 'Rule', body: 'body' }));

  const body = JSON.parse(result.content);
  assert.equal(body.ok, true);
  assert.equal(body.action, 'added');
  assert.match(body.file, /lessons\.md/);
});
