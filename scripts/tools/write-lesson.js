/**
 * Write Lesson
 *
 * Records one durable lesson: guidance the agent has learned and the user has
 * confirmed — "approach A looks obvious, but it fails because of X, so do B". This
 * is the material that stops a hard-won conclusion being re-learned after a world
 * reset, so it is worth getting exactly right.
 *
 * Because a lesson becomes guidance for every later session, it is NOT written
 * silently. The agent proposes it, and the user confirms through the normal
 * confirmation prompt before it lands. The user can also ask for a lesson directly;
 * that still passes through the same prompt, which is the point — nothing becomes a
 * standing rule without being seen first.
 *
 * Lessons are matched by title, so recording a refinement of an existing lesson
 * updates it rather than adding a near-duplicate.
 */

import { BaseTool } from './base-tool.js';
import { memoryStore } from '../core/memory-store.js';

export class WriteLessonTool extends BaseTool {
  constructor() {
    super(
      'write_lesson',
      'Record a durable lesson in the persistent memory: guidance such as "approach A fails because of X, do B instead", so it is not re-learned after a world reset. The user is asked to confirm before it is saved, so propose it in your message too. Recording a lesson with an existing title updates it. Use append_history for a record of what happened; use this for what should be done differently next time.'
    );
    this.requiresConfirmation = true; // a lesson becomes standing guidance
    this.schema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Short, stable heading for the lesson, e.g. "OverTime needs an explicit turn end". Reuse an existing heading to refine that lesson.',
        },
        body: {
          type: 'string',
          description:
            'The lesson itself: what was tried, why it failed, and what to do instead. Be specific about the mechanism (the field, the module, the flag), not just the symptom.',
        },
      },
      required: ['title', 'body'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} params */
  async getConfirmationDetails(params) {
    const body = String(params.body ?? '').trim();
    return {
      type: 'memory',
      title: `Record lesson: ${params.title ?? 'Untitled'}`,
      details: body.length > 400 ? `${body.slice(0, 400)}…` : body,
    };
  }

  /** @param {object} params */
  async execute(params) {
    try {
      const result = await memoryStore.writeLesson({
        title: params.title,
        body: params.body,
      });
      return {
        content: JSON.stringify(
          {
            ok: true,
            action: result.action,
            title: result.title,
            file: `${memoryStore.location}lessons.md`,
          },
          null,
          2
        ),
        display: `**Lesson ${result.action}:** ${result.title}`,
      };
    } catch (err) {
      this.logger.error('write_lesson failed', err);
      return {
        content: JSON.stringify({ ok: false, error: err.message }, null, 2),
        display: `Lesson write failed: ${err.message}`,
        error: { message: err.message, type: 'MEMORY_WRITE_FAILED' },
      };
    }
  }
}
