import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConversationManager } from '../../scripts/core/conversation.js';

/** A manager with a small, known history and a change counter. */
function withHistory() {
  let changes = 0;
  const manager = new ConversationManager('user', 'world', 32000, null, () => {
    changes++;
  });
  manager.addMessage('system', 'sys');
  manager.addMessage('user', 'first prompt');
  manager.addMessage('assistant', 'first answer');
  manager.addMessage('user', 'second prompt');
  manager.addMessage('assistant', 'second answer');
  return { manager, changes: () => changes };
}

const shape = manager => manager.getMessages().map(message => `${message.role}:${message.content}`);

/** Capture Hooks.callAll calls made while `run` executes, then restore the global. */
function captureHooks(run) {
  const previous = globalThis.Hooks;
  const calls = [];
  globalThis.Hooks = { callAll: (name, payload) => calls.push({ name, payload }) };
  try {
    run();
  } finally {
    globalThis.Hooks = previous;
  }
  return calls;
}

test('rewindFrom drops the prompt and the turn it produced', () => {
  const { manager } = withHistory();

  assert.equal(manager.rewindFrom(3), true);
  assert.deepEqual(shape(manager), ['system:sys', 'user:first prompt', 'assistant:first answer']);
});

test('rewindFrom drops everything from the index onward', () => {
  const { manager } = withHistory();

  manager.rewindFrom(1);
  assert.deepEqual(shape(manager), ['system:sys']);
});

test('rewindFrom drops a single trailing message', () => {
  const { manager } = withHistory();

  assert.equal(manager.rewindFrom(4), true);
  assert.equal(shape(manager).length, 4);
});

test('rewindFrom refuses an index that is not a message', () => {
  const { manager } = withHistory();
  const before = shape(manager);

  assert.equal(manager.rewindFrom(-1), false);
  assert.equal(manager.rewindFrom(99), false);
  assert.equal(manager.rewindFrom(1.5), false);
  assert.equal(manager.rewindFrom(undefined), false);
  assert.deepEqual(shape(manager), before);
});

test('rewindFrom recalculates the token count and notifies the auto-save', () => {
  const { manager, changes } = withHistory();
  const before = manager.getSessionTokens();
  const notifiedBefore = changes();

  manager.rewindFrom(3);

  assert.ok(manager.getSessionTokens() < before, 'tokens drop with the discarded turn');
  assert.ok(changes() > notifiedBefore, 'state change fired');
});

test('rewindLastUserMessage drops the trailing prompt and its turn', () => {
  const { manager } = withHistory();

  assert.equal(manager.rewindLastUserMessage(), true);
  assert.deepEqual(shape(manager), ['system:sys', 'user:first prompt', 'assistant:first answer']);
});

test('rewindLastUserMessage does nothing when there is no prompt', () => {
  const manager = new ConversationManager('user', 'world', 32000, null, null);
  manager.addMessage('system', 'sys');

  assert.equal(manager.rewindLastUserMessage(), false);
  assert.deepEqual(shape(manager), ['system:sys']);
});

test('a structural change is announced so every view can rebuild', () => {
  const calls = captureHooks(() => {
    const { manager } = withHistory();
    manager.rewindFrom(3);
    manager.clear();
  });

  assert.equal(
    calls.filter(call => call.name === 'simulacrum:messagesChanged').length,
    2,
    'one per structural change (rewind, clear)'
  );
  assert.equal(
    calls.filter(call => call.name === 'simulacrum:conversationCleared').length,
    1,
    'clear also drops context-dependent queued prompts'
  );
});
