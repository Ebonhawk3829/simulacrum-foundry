import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  renderUserContent,
  createDisplayMessage,
  resolveDisplay,
} from '../../scripts/ui/sidebar-state-syncer.js';
import { MarkdownRenderer } from '../../scripts/lib/markdown-renderer.js';

test('the user input keeps its line breaks and blank lines', () => {
  const html = renderUserContent('Target: one creature\n\nOn a failed save:\n- 4d6 fire');

  assert.match(html, /Target: one creature\n\nOn a failed save:\n- 4d6 fire/);
});

test('the user input keeps its indentation', () => {
  const html = renderUserContent('if the save fails:\n    the target is prone\n    and takes 2d6');

  assert.match(html, /\n {4}the target is prone/);
});

test('the user input is escaped, so it cannot inject markup', () => {
  const html = renderUserContent('<img src=x onerror=alert(1)> & "quotes"');

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; "quotes"/);
  assert.doesNotMatch(html, /<img/);
});

test('CRLF is normalised to LF', () => {
  const html = renderUserContent('a\r\nb');

  assert.match(html, /a\nb/);
  assert.doesNotMatch(html, /\r/);
});

test('the user input is not run through markdown', () => {
  // A single newline is a soft break in markdown, which is what collapsed the prompt
  // into one paragraph. The echo must not depend on markdown at all.
  const html = renderUserContent('first line\nsecond line');

  assert.doesNotMatch(html, /<p>/);
  assert.doesNotMatch(html, /<br/);
  assert.match(html, /class="simulacrum-user-text"/);
});

test('createDisplayMessage renders a user message verbatim, and an assistant message otherwise', async () => {
  globalThis.foundry = { utils: { randomID: () => 'id' } };
  globalThis.game = { user: null };

  const user = await createDisplayMessage('user', 'line one\nline two');
  assert.match(user.display, /class="simulacrum-user-text"/);
  assert.match(user.display, /line one\nline two/);

  // An assistant message with no markdown still comes back as its raw text (the
  // markdown renderer is a no-op without markers), which is the existing behaviour.
  const assistant = await createDisplayMessage('assistant', 'plain reply');
  assert.equal(assistant.display, 'plain reply');
});

test('a caller-supplied HTML display is trusted as-is', async () => {
  const html = '<div class="simulacrum-tool-call tool-success">ok</div>';

  assert.equal(await resolveDisplay('assistant', 'ignored', html), html);
});

test('a plain-text display with nothing to render is trusted as-is', async () => {
  const display = '🛑 Process cancelled';

  assert.equal(await resolveDisplay('assistant', 'Process cancelled by user', display), display);
});

test('a caller-supplied raw-markdown display is re-rendered, not shown literally', async () => {
  const previous = globalThis.window;
  globalThis.window = {
    showdown: {
      Converter: class {
        makeHtml(text) {
          return String(text).replace(/^## (.+)$/gm, '<h2>$1</h2>');
        }
      },
      setOption() {},
    },
  };
  MarkdownRenderer.reset();

  try {
    const html = await resolveDisplay('assistant', '## Heading', '## Heading');
    assert.match(html, /<h2>Heading<\/h2>/);
    assert.doesNotMatch(html, /## Heading/);
  } finally {
    globalThis.window = previous;
    MarkdownRenderer.reset();
  }
});

test('a user message is rendered verbatim regardless of a supplied display', async () => {
  const html = await resolveDisplay('user', 'line one\nline two', '<p>ignored</p>');

  assert.match(html, /class="simulacrum-user-text"/);
  assert.match(html, /line one\nline two/);
  assert.doesNotMatch(html, /<p>ignored<\/p>/);
});
