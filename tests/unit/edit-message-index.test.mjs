import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SidebarEventHandlers } from '../../scripts/ui/sidebar-event-handlers.js';

/** A conversation holding the given roles, in order. */
const conversationOf = roles => ({
  getMessages: () => roles.map(role => ({ role, content: role })),
});

/** A UI log holding the given messages. */
const logOf = messages => ({ messages });

test('a prompt maps to its conversation index by user-message ordinal', () => {
  const conversation = conversationOf(['system', 'user', 'assistant', 'user', 'assistant']);
  const app = logOf([
    { id: 'first', role: 'user' },
    { id: 'reply', role: 'assistant' },
    { id: 'second', role: 'user' },
  ]);

  assert.equal(SidebarEventHandlers._conversationIndexOf(app, conversation, 'first'), 1);
  assert.equal(SidebarEventHandlers._conversationIndexOf(app, conversation, 'second'), 3);
});

test('an unknown message id maps to nothing', () => {
  const conversation = conversationOf(['system', 'user']);
  const app = logOf([{ id: 'first', role: 'user' }]);

  assert.equal(SidebarEventHandlers._conversationIndexOf(app, conversation, 'missing'), -1);
});

test('an assistant message never maps, however many prompts surround it', () => {
  // The edit control is only rendered on prompts; an assistant message has no prompt
  // position, and silently mapping it to some earlier user message would rewind the
  // wrong turn.
  const conversation = conversationOf(['system', 'user', 'assistant', 'user', 'assistant']);
  const app = logOf([
    { id: 'first', role: 'user' },
    { id: 'reply', role: 'assistant' },
    { id: 'second', role: 'user' },
  ]);

  assert.equal(SidebarEventHandlers._conversationIndexOf(app, conversation, 'reply'), -1);
});

test('a prompt with no counterpart in the conversation maps to nothing', () => {
  // e.g. the log holds a prompt the conversation has already dropped.
  const conversation = conversationOf(['system', 'user', 'assistant']);
  const app = logOf([
    { id: 'first', role: 'user' },
    { id: 'second', role: 'user' },
  ]);

  assert.equal(SidebarEventHandlers._conversationIndexOf(app, conversation, 'second'), -1);
});
