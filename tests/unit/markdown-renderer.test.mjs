import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MarkdownRenderer } from '../../scripts/lib/markdown-renderer.js';

/** Minimal stand-in for Showdown, enough to prove the render path is wired up. */
class FakeConverter {
  makeHtml(text) {
    return String(text)
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}

/** Install (or remove) a fake showdown on window and reset the renderer's cache. */
function withShowdown(present, run) {
  const previous = globalThis.window;
  globalThis.window = present ? { showdown: { Converter: FakeConverter, setOption() {} } } : {};
  MarkdownRenderer.reset();
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.window = previous;
      MarkdownRenderer.reset();
    });
}

test('HTML is only HTML when it opens with a tag', () => {
  assert.equal(MarkdownRenderer.looksLikeHtml('<div class="x">y</div>'), true);
  assert.equal(MarkdownRenderer.looksLikeHtml('\n  <p>hi</p>'), true, 'leading whitespace is fine');
  assert.equal(MarkdownRenderer.looksLikeHtml('a sentence with </verb> in it'), false);
  assert.equal(MarkdownRenderer.looksLikeHtml('3 < 4 and 5 > 2'), false);
});

test('a stray tag-shaped word does not stop a chunk being rendered as markdown', async () => {
  await withShowdown(true, async () => {
    const html = await MarkdownRenderer.render('## Heading\n\nHe said </verb> and left.');

    assert.match(html, /<h2>Heading<\/h2>/, 'the markdown is still rendered');
    assert.doesNotMatch(html, /(^|\n)#{1,6}\s/, 'no literal heading marker survives');
  });
});

test('renders markdown when showdown is available', async () => {
  await withShowdown(true, async () => {
    const html = await MarkdownRenderer.render('## Heading\n\n**bold**');

    assert.match(html, /<h2>Heading<\/h2>/);
    assert.match(html, /<strong>bold<\/strong>/);
  });
});

test('a missing converter yields readable text, not a collapsed line of markers', async () => {
  await withShowdown(false, async () => {
    const html = await MarkdownRenderer.render('## Heading\n\n**bold**\n\nlast line');

    assert.match(html, /<br>/, 'line breaks are preserved');
    assert.doesNotMatch(html, /<h2>/, 'not rendered');
    assert.equal(html.includes('## Heading'), true, 'markers stay, as plain text');
  });
});

test('the fallback escapes markup so it cannot inject into the log', async () => {
  await withShowdown(false, async () => {
    // No closing '>', so this is not HTML-shaped and reaches the markdown path.
    const html = await MarkdownRenderer.render('## Heading\n\n**bold** & <script');

    assert.match(html, /&amp;/);
    assert.match(html, /&lt;script/);
    assert.doesNotMatch(html, /<script/);
  });
});

test('waits for showdown to appear instead of emitting unrendered text', async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  MarkdownRenderer.reset();
  setTimeout(() => {
    globalThis.window.showdown = { Converter: FakeConverter, setOption() {} };
  }, 120);

  try {
    const html = await MarkdownRenderer.render('## Late');
    assert.match(html, /<h2>Late<\/h2>/);
  } finally {
    globalThis.window = previous;
    MarkdownRenderer.reset();
  }
});

test('HTML is passed through untouched, as before', async () => {
  await withShowdown(true, async () => {
    const html = await MarkdownRenderer.render('<p>already html</p>');

    assert.equal(html, '<p>already html</p>');
  });
});

test('plain prose with no markdown markers is returned unchanged', async () => {
  await withShowdown(true, async () => {
    const html = await MarkdownRenderer.render('just a sentence');

    assert.equal(html, 'just a sentence');
  });
});
