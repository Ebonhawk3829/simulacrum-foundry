import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConversationManager } from '../../scripts/core/conversation.js';
import { DEFAULT_CONTEXT_LIMIT, modelService } from '../../scripts/core/model-service.js';

/** Compaction threshold for a manager holding the given context window. */
const thresholdFor = window => new ConversationManager('u', 'w', window)._getCompactionThreshold(0);

test('compaction is driven by the context window it is given, not a fixed default', () => {
  const small = thresholdFor(DEFAULT_CONTEXT_LIMIT);
  const large = thresholdFor(1_050_000);

  assert.ok(small < 25_000, `a 32k window should compact under 25k, got ${small}`);
  assert.ok(large > 600_000, `a 1.05M window should compact past 600k, got ${large}`);
  assert.ok(large / small > 20, 'the window is what moves the threshold');
});

test('setTokenLimit moves the threshold and ignores nonsense', () => {
  const manager = new ConversationManager('u', 'w', DEFAULT_CONTEXT_LIMIT);
  const before = manager._getCompactionThreshold(0);

  manager.setTokenLimit(1_050_000);
  const after = manager._getCompactionThreshold(0);
  assert.ok(after > before * 20, 'a bigger window compacts much later');

  for (const bad of [0, -5, 'nonsense', undefined, null]) manager.setTokenLimit(bad);
  assert.equal(manager._getCompactionThreshold(0), after, 'invalid values leave it alone');
});

test('the system prompt still shrinks the usable room', () => {
  const manager = new ConversationManager('u', 'w', 1_050_000);

  assert.ok(manager._getCompactionThreshold(50_000) < manager._getCompactionThreshold(0));
});

test('resolveContextLimit goes through the model, not straight to the fallback setting', () => {
  const originalGet = modelService.getContextLimit;
  const originalGame = globalThis.game;

  globalThis.game = {
    settings: {
      get: (_id, key) => ({ model: 'big-model', fallbackContextLimit: DEFAULT_CONTEXT_LIMIT })[key],
    },
  };
  // Stand in for metadata/OpenRouter resolution: the point under test is that the model's
  // window is consulted at all, rather than the fallback setting being used directly.
  modelService.getContextLimit = (model, fallback) => ({
    limit: model === 'big-model' ? 1_050_000 : fallback,
    source: 'derived',
  });

  try {
    assert.equal(modelService.resolveContextLimit(), 1_050_000);
  } finally {
    modelService.getContextLimit = originalGet;
    globalThis.game = originalGame;
  }
});

test('resolveContextLimit falls back to the configured limit when nothing is known', () => {
  const originalGet = modelService.getContextLimit;
  const originalGame = globalThis.game;

  globalThis.game = {
    settings: {
      get: (_id, key) => ({ model: 'unknown', fallbackContextLimit: 64_000 })[key],
    },
  };
  modelService.getContextLimit = (_model, fallback) => ({ limit: fallback, source: 'fallback' });

  try {
    assert.equal(modelService.resolveContextLimit(), 64_000);
  } finally {
    modelService.getContextLimit = originalGet;
    globalThis.game = originalGame;
  }
});
