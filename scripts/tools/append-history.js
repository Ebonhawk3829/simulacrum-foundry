/**
 * Append History
 *
 * Adds one entry to the append-only session log. The agent uses this at its own
 * discretion — what it built, what it discovered, what is still outstanding — so a
 * later session (or a later world) can see how the current state was reached.
 *
 * Append-only by design: an entry is added, never rewritten, so nothing recorded
 * earlier is lost by something recorded later. Writing history is cheap and low
 * risk, so it carries no confirmation; lessons do, because they become guidance.
 */

import { BaseTool } from './base-tool.js';
import { memoryStore } from '../core/memory-store.js';

export class AppendHistoryTool extends BaseTool {
  constructor() {
    super(
      'append_history',
      'Append an entry to the persistent session history: what you built, what you discovered, what is still outstanding. Written at your discretion and never rewritten, so it survives a world reset. Use it as you work; use write_lesson instead when the point is durable guidance rather than a record of what happened.'
    );
    this.requiresConfirmation = false; // append-only, low risk; history is written at the agent's discretion
    this.schema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short heading for the entry, e.g. "Built Tanglefoot, needs a live test".',
        },
        body: {
          type: 'string',
          description:
            'What happened, in plain prose. State facts: what was built or changed, what the result was, and what remains.',
        },
      },
      required: ['title', 'body'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} _params */
  async getConfirmationDetails(_params) {
    return {
      type: 'memory',
      title: 'Append to history',
      details: 'Adds an entry to the session history. Nothing else is changed.',
    };
  }

  /** @param {object} params */
  async execute(params) {
    try {
      const result = await memoryStore.appendHistory({
        title: params.title,
        body: params.body,
      });
      return {
        content: JSON.stringify(
          { ok: true, file: `${memoryStore.location}history.md`, entries: result.entries },
          null,
          2
        ),
        display: `**History:** ${params.title}`,
      };
    } catch (err) {
      this.logger.error('append_history failed', err);
      return {
        content: JSON.stringify({ ok: false, error: err.message }, null, 2),
        display: `History write failed: ${err.message}`,
        error: { message: err.message, type: 'MEMORY_WRITE_FAILED' },
      };
    }
  }
}
