import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderUserContent, createDisplayMessage } from '../../scripts/ui/sidebar-state-syncer.js';

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
