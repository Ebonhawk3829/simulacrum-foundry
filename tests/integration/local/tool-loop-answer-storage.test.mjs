// Integration test: the final answer is stored in the conversation once.
//
// The loop requires `end_loop`, so a text-only answer is stored (to survive a reload) and
// the model is then asked to re-send it with `end_loop`. That re-send is the same answer.
// The live display suppressed the repeat, but both copies were written to the conversation,
// so a log rebuilt from it showed the answer twice. Exercises processToolCallLoop
// end-to-end with fakes and counts the stored assistant answers.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// --- Foundry globals, stubbed before the module-under-test is imported. ---
globalThis.foundry = { utils: { randomID: () => 'test-id' } };
globalThis.Hooks = { callAll: () => {}, call: () => {} };
globalThis.game = {
  world: { id: 'test-world' },
  user: { getFlag: async () => null, setFlag: async () => {} },
  settings: {
    get: (scope, key) => (key === 'toolLoopLimit' ? 10 : key === 'legacyMode' ? false : undefined),
  },
  i18n: { localize: key => key },
};
globalThis.FormApplication = class {
  static get defaultOptions() {
    return {};
  }

  render() {}
};
globalThis.ui = { notifications: { error: () => {} } };
globalThis.CONFIG = { debug: {} };

const { processToolCallLoop, isRestatement } =
  await import('../../../scripts/core/tool-loop-handler.js');
const { toolRegistry } = await import('../../../scripts/core/tool-registry.js');
const { COMPACTION_STATUS } = await import('../../../scripts/core/conversation.js');
const { normalizeAIResponse } = await import('../../../scripts/utils/ai-normalization.js');

before(() => {
  toolRegistry.registerDefaults();
  // Bypass real tool implementations; the loop only inspects `execution.result`.
  toolRegistry.executeTool = async name =>
    name === 'end_loop'
      ? { result: { _endLoop: true } }
      : { result: { success: true, toolName: name, data: 'ok' } };
});

// The answer the model gives, and the same answer it re-sends with `end_loop`.
const ANSWER = [
  'Read both files in full and here is where the world stands.',
  'Regeneration was rebuilt on all thirty two creatures and proven in play on Mathilda:',
  'heal went from fifty to sixty, the suppressed turn was skipped, and the marker cleared.',
  'The concentration effects still never expire, which is the largest untouched item.',
].join(' ');

// OpenAI-style raw response normalizing to a single tool call.
function rawToolCall(id, name, args) {
  return {
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

// OpenAI-style raw text response (no tool calls).
function rawText(content) {
  return {
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  };
}

function createAiClient(steps) {
  let index = 0;
  return {
    async chatWithSystem() {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return step;
    },
  };
}

// Mirror ConversationManager.addMessage(role, content, toolCalls, toolCallId, metadata).
// `_internal` is preserved because the loop uses it to tell a real answer from the
// synthetic correction turn it stores when a text-only reply is rejected.
function createConversationManager() {
  return {
    messages: [],
    // Mirrors ConversationManager.addMessage(role, content, toolCalls, toolCallId,
    // metadata); the trailing arguments are taken via rest to stay within max-params.
    addMessage(role, content, ...rest) {
      const [toolCalls = null, toolCallId = null, metadata = null] = rest;
      const message = { role, content, toolCalls, tool_call_id: toolCallId };
      if (metadata?._internal === true) message._internal = true;
      this.messages.push(message);
    },
    save: async () => {},
    getMessages() {
      return this.messages;
    },
    estimatePromptOverhead: () => 0,
    compactHistory: async () => COMPACTION_STATUS.WITHIN_BUDGET,
    toolOutputBuffer: new Map(),
  };
}

async function runLoop(initialResponse, steps) {
  const conversation = createConversationManager();
  const liveEmissions = [];
  const result = await processToolCallLoop({
    initialResponse,
    conversationManager: conversation,
    aiClient: createAiClient(steps),
    getSystemPrompt: async () => 'test system prompt',
    tools: [],
    currentToolSupport: true,
    signal: new AbortController().signal,
    onToolResult: payload => {
      if (payload?.role === 'assistant') liveEmissions.push(payload.content ?? '');
    },
  });
  return { conversation, liveEmissions, result };
}

// How many stored assistant messages restate the answer - i.e. how many copies a log
// rebuilt from the conversation would render.
function storedCopies(conversation, answer) {
  return conversation.messages.filter(
    m => m.role === 'assistant' && isRestatement(m.content, answer)
  ).length;
}

test('a text-only answer the model re-sends with end_loop is stored once', async () => {
  const { conversation, liveEmissions } = await runLoop(
    normalizeAIResponse(rawToolCall('call_1', 'list_documents', { justification: 'test' })),
    [rawText(ANSWER), rawToolCall('call_2', 'end_loop', { response: ANSWER })]
  );

  assert.equal(
    storedCopies(conversation, ANSWER),
    1,
    'the answer must be stored once, not once per send'
  );
  assert.equal(
    liveEmissions.filter(c => isRestatement(c, ANSWER)).length,
    1,
    'the answer must also be shown live once'
  );
});

test('an answer sent only through end_loop is still stored', async () => {
  const { conversation } = await runLoop(
    normalizeAIResponse(rawToolCall('call_1', 'list_documents', { justification: 'test' })),
    [rawToolCall('call_2', 'end_loop', { response: ANSWER })]
  );

  assert.equal(
    storedCopies(conversation, ANSWER),
    1,
    'an answer that was never sent as text must survive a reload'
  );
});

test('a text-only answer is stored even when more tools follow before end_loop', async () => {
  const { conversation } = await runLoop(
    normalizeAIResponse(rawToolCall('call_1', 'list_documents', { justification: 'test' })),
    [
      rawText(ANSWER),
      rawToolCall('call_2', 'list_documents', { justification: 'test' }),
      rawToolCall('call_3', 'end_loop', {}),
    ]
  );

  assert.equal(storedCopies(conversation, ANSWER), 1, 'the text-only answer is kept exactly once');
});
