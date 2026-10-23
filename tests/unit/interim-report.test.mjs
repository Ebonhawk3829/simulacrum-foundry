import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFacts,
  writeSummary,
  runInterimReport,
  interimControl,
} from '../../scripts/core/interim-report.js';

/** A conversation holding one completed tool call and one that failed. */
function conversationWith(extra = []) {
  return {
    getMessages: () => [
      { role: 'user', content: 'do the thing' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'a', function: { name: 'read_reference' } },
          { id: 'b', function: { name: 'execute_macro' } },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: JSON.stringify({ display: 'Read FLAGS.md' }) },
      { role: 'tool', tool_call_id: 'b', content: JSON.stringify({ error: { message: 'boom' } }) },
      ...extra,
    ],
  };
}

test('facts list the turn’s tool calls and their outcomes, most recent first', () => {
  const facts = buildFacts(conversationWith());

  assert.match(facts, /2 tool calls this turn, 1 failed/);
  assert.match(facts, /`execute_macro` — \*\*failed\*\* — boom/);
  assert.match(facts, /`read_reference` — Read FLAGS\.md/);
  assert.ok(facts.indexOf('execute_macro') < facts.indexOf('read_reference'), 'newest first');
});

test('facts say so plainly when nothing had completed', () => {
  const conversation = { getMessages: () => [{ role: 'user', content: 'hi' }] };

  assert.match(buildFacts(conversation), /No tool calls had completed/);
});

test('facts only cover the current turn, not earlier ones', () => {
  const conversation = {
    getMessages: () => [
      { role: 'tool', tool_call_id: 'old', content: JSON.stringify({ display: 'earlier' }) },
      { role: 'user', content: 'second ask' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c', function: { name: 'search_documents' } }],
      },
      { role: 'tool', tool_call_id: 'c', content: JSON.stringify({ display: 'ok now' }) },
    ],
  };
  const facts = buildFacts(conversation);

  assert.match(facts, /1 tool calls this turn/);
  assert.doesNotMatch(facts, /earlier/);
});

test('the wrap-up is asked for with no tools, so it cannot start another loop', async () => {
  const seen = [];
  const aiClient = {
    chat: async (messages, tools, options) => {
      seen.push({ tools, options });
      return { content: 'Handover text' };
    },
  };

  const summary = await writeSummary({ conversationManager: conversationWith(), aiClient });

  assert.equal(summary, 'Handover text');
  assert.deepEqual(seen[0].tools, [], 'tools disabled');
  assert.ok(seen[0].options.signal, 'runs on its own signal');
});

test('the wrap-up is abandoned when it times out', async () => {
  const aiClient = {
    chat: (_messages, _tools, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  };

  const summary = await writeSummary({
    conversationManager: conversationWith(),
    aiClient,
    timeoutMs: 20,
  });

  assert.equal(summary, null);
});

test('an already-aborted signal short-circuits the wrap-up', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const aiClient = {
    chat: async (_messages, _tools, { signal }) => {
      called = true;
      assert.equal(signal.aborted, true, 'merged signal is already aborted');
      throw new Error('aborted');
    },
  };

  const summary = await writeSummary({
    conversationManager: conversationWith(),
    aiClient,
    signal: controller.signal,
  });

  assert.equal(summary, null);
  assert.equal(called, true);
});

test('a failing wrap-up leaves the facts intact', async () => {
  const parts = [];
  const aiClient = {
    chat: async () => {
      throw new Error('provider down');
    },
  };

  const result = await runInterimReport({
    conversationManager: conversationWith(),
    aiClient,
    onPart: async part => parts.push(part),
  });

  assert.equal(result.summary, null);
  assert.equal(parts.length, 1, 'only the facts were emitted');
  assert.match(parts[0], /Stopped — here is where it got to/);
});

test('the facts are emitted before the wrap-up', async () => {
  const parts = [];
  const aiClient = { chat: async () => ({ content: 'wrap-up' }) };

  await runInterimReport({
    conversationManager: conversationWith(),
    aiClient,
    onPart: async part => parts.push(part),
  });

  assert.equal(parts.length, 2);
  assert.match(parts[0], /Stopped — here is where it got to/);
  assert.equal(parts[1], 'wrap-up');
});

test('interimControl separates a first press from a second', () => {
  assert.equal(interimControl.isActive(), false);
  assert.equal(interimControl.abort(), false, 'nothing to abort yet');

  const signal = interimControl.begin();
  assert.equal(interimControl.isActive(), true);
  assert.equal(interimControl.signal(), signal);
  assert.equal(interimControl.begin(), signal, 'begin is idempotent while active');

  assert.equal(interimControl.abort(), true, 'second press stops it');
  assert.equal(signal.aborted, true);
  assert.equal(interimControl.isActive(), false);

  interimControl.begin();
  interimControl.reset();
  assert.equal(interimControl.isActive(), false, 'reset clears without aborting');
});
