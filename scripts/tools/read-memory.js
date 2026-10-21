/**
 * Read Memory
 *
 * The agent's route to its own durable notes — the lessons it has learned and the
 * session history it has kept (see core/memory-store.js for why they live outside
 * the world tree).
 *
 * Two things this tool is for:
 *
 * - AWARENESS. Called with no arguments it returns the index: the lesson headings
 *   and how much history exists. That is enough for the agent to know what is
 *   retrievable without paying for the whole file every turn.
 * - RECALL. Called with a section or a query it returns the material itself, so a
 *   lesson recorded weeks ago is available in the moment it matters.
 *
 * Read-only, so it costs no confirmation.
 */

import { BaseTool } from './base-tool.js';
import { memoryStore } from '../core/memory-store.js';

export class ReadMemoryTool extends BaseTool {
  constructor() {
    super(
      'read_memory',
      'Read the persistent memory: the lessons learned (durable guidance such as "approach A fails because of X, do B") and the session history (what was built and discovered). Call it with no arguments for the index of lesson headings, or pass a section or query to read the material. Use it at the start of a task and whenever a past decision is relevant, so hard-won lessons are not re-learned. Read-only.'
    );
    this.requiresConfirmation = false; // read-only
    this.schema = {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['lessons', 'history'],
          description:
            'Read one section in full: "lessons" for the durable guidance, "history" for the append-only log. Omit to get the index instead.',
        },
        query: {
          type: 'string',
          description:
            'Words to search for across both files, matched case-insensitively. Use this when you are looking for a specific past decision rather than reading everything.',
        },
        limit: {
          type: 'number',
          description:
            'Maximum history entries to return when reading history, newest first. Defaults to 20.',
        },
      },
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} _params */
  async getConfirmationDetails(_params) {
    return {
      type: 'read',
      title: 'Read memory',
      details: 'Reads the memory files. Nothing is changed.',
    };
  }

  /** @param {object} params */
  async execute(params) {
    try {
      if (params.query) return await this._search(String(params.query));
      if (params.section === 'lessons') return await this._section('lessons');
      if (params.section === 'history') return await this._section('history', params.limit);
      return await this._index();
    } catch (err) {
      this.logger.error('read_memory failed', err);
      return this._reject(`Reading memory failed: ${err.message}`);
    }
  }

  /**
   * The index: lesson headings plus how much history there is.
   * @returns {Promise<object>}
   */
  async _index() {
    const summary = await memoryStore.summary();
    const empty = !summary.lessonTitles.length && !summary.historyEntries;

    return this._ok({
      location: summary.location,
      lessons: summary.lessonTitles,
      history: { entries: summary.historyEntries, bytes: summary.historyBytes },
      next: empty
        ? 'Nothing has been recorded yet. Use append_history as you work, and propose a lesson with write_lesson when you learn something that should not be re-learned.'
        : 'Pass section "lessons" or "history" to read one in full, or a query to search both.',
    });
  }

  /**
   * Read one section in full.
   * @param {'lessons'|'history'} section
   * @param {number} [limit]
   * @returns {Promise<object>}
   */
  async _section(section, limit) {
    if (section === 'lessons') {
      const text = await memoryStore.readLessons();
      return this._ok({ section, bytes: text.length, text: text || '(no lessons recorded yet)' });
    }

    const text = await memoryStore.readHistory();
    const entries = parseHistory(text);
    const count = Number.isFinite(limit) && limit > 0 ? limit : 20;
    return this._ok({
      section,
      entries: entries.length,
      returned: Math.min(count, entries.length),
      text: entries.slice(-count).join('\n\n') || '(no history recorded yet)',
    });
  }

  /**
   * Search both files and return matching passages with line numbers.
   * @param {string} query
   * @returns {Promise<object>}
   */
  async _search(query) {
    const needle = query.toLowerCase();
    const files = [
      { path: 'lessons.md', text: await memoryStore.readLessons() },
      { path: 'history.md', text: await memoryStore.readHistory() },
    ];

    const matches = [];
    for (const file of files) {
      const haystack = file.text.toLowerCase();
      let at = haystack.indexOf(needle);
      while (at !== -1 && matches.length < 30) {
        matches.push({
          path: file.path,
          line: file.text.slice(0, at).split('\n').length,
          text: file.text.slice(Math.max(0, at - 200), at + needle.length + 200).trim(),
        });
        at = haystack.indexOf(needle, at + needle.length);
      }
    }

    const body = { query, matchCount: matches.length, matches };
    if (!matches.length) {
      body.next =
        'Nothing matched. Call read_memory with no arguments for the index of what exists.';
    }
    return this._ok(body);
  }

  /** Build a success result. */
  _ok(body) {
    return {
      content: JSON.stringify({ ok: true, ...body }, null, 2),
      display: '**Memory**',
    };
  }

  /** Build a rejection result. */
  _reject(message) {
    return {
      content: JSON.stringify({ ok: false, error: message }, null, 2),
      display: `Memory unavailable: ${message}`,
      error: { message, type: 'MEMORY_READ_FAILED' },
    };
  }
}

/** Split a history file into entries on `## ` headings. */
function parseHistory(text) {
  const parts = String(text ?? '').split(/\n(?=##\s)/);
  return parts.map(p => p.trim()).filter(Boolean);
}
