/**
 * Interim Report — what the agent hands over when you stop it.
 *
 * Stop used to abort the run and print "Process cancelled", discarding everything the
 * turn had established. The conversation still held it — every tool call and its
 * result — it was simply never surfaced. This turns that state into a handover, in two
 * parts:
 *
 * 1. FACTS, assembled synchronously from the conversation since your last message.
 *    No model call, so it cannot fail or hang, and Stop always produces something
 *    immediately.
 * 2. A WRAP-UP, one model call with tools disabled, on its own abort signal so the
 *    stop that triggered it cannot kill it. Capped by a timeout. If it fails, is
 *    stopped, or the provider is unreachable, the facts stand alone.
 *
 * The wrap-up is the part worth keeping, so the caller is expected to add it to the
 * conversation; this module only produces the text.
 */

/** How long the wrap-up model call may take before it is abandoned. */
const SUMMARY_TIMEOUT_MS = 20_000;

/** Cap the per-tool lines in the facts so a long turn cannot flood the log. */
const MAX_TOOL_LINES = 12;

/** What the model is asked for when writing the wrap-up. */
const SUMMARY_INSTRUCTION = [
  'The user stopped you mid-task.',
  'Write the handover in 3-6 short sentences: what you established, what you changed or',
  'created, what is still open, and the single next step you would take. Be concrete and',
  'name identifiers. Do not call tools, do not apologise, and do not explain that you were',
  'interrupted.',
].join(' ');

/**
 * The stop button's two-stage state, shared between the UI that presses it and the
 * report that has to be interruptible. Keeping it here means neither side has to know
 * about the other.
 */
class InterimControl {
  #controller = null;

  /** @returns {boolean} True while a wrap-up is being written. */
  isActive() {
    return this.#controller !== null;
  }

  /**
   * Open a wrap-up window. Idempotent while one is already open, so a second press can
   * be told apart from the first.
   * @returns {AbortSignal}
   */
  begin() {
    if (!this.#controller) this.#controller = new AbortController();
    return this.#controller.signal;
  }

  /** @returns {AbortSignal|null} The current wrap-up signal, if any. */
  signal() {
    return this.#controller?.signal ?? null;
  }

  /**
   * Hard-stop an in-flight wrap-up.
   * @returns {boolean} Whether one was running
   */
  abort() {
    if (!this.#controller) return false;
    this.#controller.abort();
    this.#controller = null;
    return true;
  }

  /** Clear the window without aborting (the wrap-up finished on its own). */
  reset() {
    this.#controller = null;
  }
}

export const interimControl = new InterimControl();

/** One-line outcome for a tool result message. */
function outcomeOf(content) {
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    if (parsed?.error) return `**failed** — ${parsed.error.message || parsed.error}`;
    if (parsed?.success === false) return '**failed**';
    if (typeof parsed?.display === 'string' && parsed.display.trim()) {
      return parsed.display.split('\n')[0].trim().slice(0, 80);
    }
    return 'ok';
  } catch {
    return 'ok';
  }
}

/** Map each tool call id in the turn to the tool's name. */
function toolNamesById(turn) {
  const names = new Map();
  for (const message of turn) {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      names.set(call.id, call.function?.name || call.name || 'tool');
    }
  }
  return names;
}

/** One entry per completed tool result, named and judged. */
function collectCalls(turn, names) {
  return turn
    .filter(message => message.role === 'tool')
    .map(message => ({
      name: names.get(message.tool_call_id) || 'tool',
      outcome: outcomeOf(message.content),
    }));
}

/**
 * The factual part: what was called this turn and how it went. Deterministic, and
 * safe to call when the turn is already unwinding.
 * @param {object} conversationManager
 * @returns {string} Markdown
 */
export function buildFacts(conversationManager) {
  const messages = conversationManager?.getMessages?.() ?? [];
  const turn = messages.slice(messages.map(message => message.role).lastIndexOf('user') + 1);
  const calls = collectCalls(turn, toolNamesById(turn));

  if (!calls.length) {
    return '🛑 **Stopped.** No tool calls had completed yet this turn.';
  }

  const failed = calls.filter(call => call.outcome.startsWith('**failed**')).length;
  const shown = calls.slice(-MAX_TOOL_LINES).reverse();
  const more =
    calls.length > MAX_TOOL_LINES ? `\n_(the last ${MAX_TOOL_LINES} of ${calls.length})_` : '';

  return [
    '🛑 **Stopped — here is where it got to.**',
    '',
    `${calls.length} tool calls this turn${failed ? `, ${failed} failed` : ''}. Most recent first:`,
    '',
    shown.map(call => `- \`${call.name}\` — ${call.outcome}`).join('\n') + more,
  ].join('\n');
}

/**
 * Merge abort signals without depending on AbortSignal.any.
 * @param {...(AbortSignal|null)} signals
 * @returns {{signal: AbortSignal, dispose: function(): void}}
 */
function combineSignals(...signals) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const live = signals.filter(Boolean);
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => live.forEach(signal => signal.removeEventListener('abort', onAbort)),
  };
}

/**
 * Ask the model for the wrap-up. One call, no tools, so it cannot start another loop.
 * @param {object} options
 * @param {object} options.conversationManager
 * @param {object} options.aiClient
 * @param {AbortSignal|null} [options.signal]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<string|null>} The wrap-up, or null if it could not be written
 */
export async function writeSummary({
  conversationManager,
  aiClient,
  signal = null,
  timeoutMs = SUMMARY_TIMEOUT_MS,
}) {
  if (!aiClient?.chat) return null;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const merged = combineSignals(signal, timeout.signal);

  try {
    const messages = [
      ...conversationManager.getMessages(),
      { role: 'system', content: SUMMARY_INSTRUCTION },
    ];
    const response = await aiClient.chat(messages, [], { signal: merged.signal });
    const text = typeof response?.content === 'string' ? response.content.trim() : '';
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    merged.dispose();
  }
}

/**
 * Produce the handover, emitting each part as soon as it is ready.
 * @param {object} options
 * @param {object} options.conversationManager
 * @param {object} options.aiClient
 * @param {AbortSignal|null} [options.signal]
 * @param {function(string): Promise<void>} options.onPart
 * @returns {Promise<{facts: string, summary: string|null}>}
 */
export async function runInterimReport({ conversationManager, aiClient, signal = null, onPart }) {
  const facts = buildFacts(conversationManager);
  if (onPart) await onPart(facts);

  const summary = await writeSummary({ conversationManager, aiClient, signal });
  if (summary && onPart) await onPart(summary);

  return { facts, summary };
}
