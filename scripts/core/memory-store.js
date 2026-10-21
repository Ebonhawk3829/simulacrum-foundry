/**
 * Memory Store — the agent's durable notes.
 *
 * Two files, one place, deliberately outside the world tree:
 *
 * - `lessons.md` — durable guidance the agent has learned and the user has
 *   confirmed: "approach A looks obvious, but it fails because of X, so do B
 *   instead". This is what stops the same ground being re-covered after a world
 *   reset, which is the whole point of keeping it.
 * - `history.md` — an append-only log written at the agent's discretion: what was
 *   built, what was discovered, what is still outstanding.
 *
 * WHY OUTSIDE THE WORLD
 *
 * Foundry keeps a world's documents under `Data/worlds/<world>/`, and a world reset
 * replaces exactly that. Notes kept there would die with the world — the one thing
 * this store exists to survive. `Data/simulacrum/` is a plain folder in the user
 * data directory: not part of any world, so a reset does not touch it, and served
 * at the world's root route so the agent reads it back over the same fetch path
 * read_reference already uses. One store, shared across worlds, as asked.
 *
 * WHY FILES AND NOT A SETTING
 *
 * A world setting is also world-scoped, and it is opaque to the user. Plain
 * markdown can be read, edited, diffed and backed up by hand, and a lesson the user
 * disagrees with is corrected in a text editor rather than argued with.
 *
 * NOTHING IS WRITTEN UNTIL ASKED
 *
 * This module is only the mechanism. Lessons go through a tool that asks for
 * confirmation; history is written when the agent chooses to. A missing directory
 * or file reads as empty, never as an error, so first use is not a special case.
 */

/** The Foundry data source, i.e. the user data directory. */
const SOURCE = 'data';

/** Folder inside the data directory. Not inside `worlds/`, so resets miss it. */
const DIR = 'simulacrum';

/** The two files, and their route names. */
const LESSONS = 'lessons.md';
const HISTORY = 'history.md';

/** Cap a single read so one bloated log cannot flood the agent's context. */
const MAX_READ_CHARS = 200_000;

/** Cap a single written lesson and history entry. */
const MAX_LESSON_CHARS = 6_000;
const MAX_ENTRY_CHARS = 8_000;

/** A section heading: `## Title`. */
const HEADING = /^##\s+(.+?)\s*$/;

/** Get the FilePicker implementation, across the v13 namespacing change. */
function getFilePicker() {
  return (
    globalThis.foundry?.applications?.apps?.FilePicker?.implementation ??
    globalThis.FilePicker ??
    null
  );
}

/** Build a URL for a data-directory file using Foundry's own route resolution. */
function routeFor(name) {
  try {
    return globalThis.foundry.utils.getRoute(`${DIR}/${name}`);
  } catch {
    return `/${DIR}/${name}`;
  }
}

/** Split markdown into `## `-headed sections. Text before the first heading is dropped. */
function parseSections(text) {
  const sections = [];
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    const match = HEADING.exec(line);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map(s => ({ title: s.title, body: s.body.join('\n').trim() }));
}

/** Render one lesson section. */
function renderLesson(title, body) {
  return `## ${title}\n\n${body.trim()}\n`;
}

/** Render one history entry. */
function renderEntry(title, body, stamp) {
  return `## ${stamp} — ${title}\n\n${body.trim()}\n`;
}

export class MemoryStore {
  /** @returns {string} The folder, for reporting. */
  get folder() {
    return DIR;
  }

  /** @returns {string} The absolute-ish path, for reporting to the user. */
  get location() {
    return `Data/${DIR}/`;
  }

  /**
   * Read one memory file. Absent or unreadable is the normal result, not an error.
   * @param {string} name
   * @returns {Promise<string>} File text, or '' when there is none.
   */
  async _read(name) {
    try {
      const res = await fetch(routeFor(name), { redirect: 'follow' });
      if (!res.ok) return '';
      const text = await res.text();
      if (text.length > MAX_READ_CHARS) {
        return `${text.slice(0, MAX_READ_CHARS)}\n\n[truncated at ${MAX_READ_CHARS} characters]`;
      }
      return text;
    } catch {
      return ''; // a missing file is the empty case, not a failure
    }
  }

  /** Create the folder if it is not there yet. Harmless when it already exists. */
  async _ensureDir() {
    const picker = getFilePicker();
    if (!picker?.createDirectory) return;
    try {
      await picker.createDirectory(SOURCE, DIR, {});
    } catch {
      // already exists, or the source is read-only; the upload will report a real problem
    }
  }

  /**
   * Write one memory file, replacing it whole.
   * @param {string} name
   * @param {string} text
   * @returns {Promise<{path: string, bytes: number}>}
   */
  async _write(name, text) {
    const picker = getFilePicker();
    if (!picker?.upload) throw new Error('Foundry FilePicker is unavailable in this context.');

    await this._ensureDir();
    const file = new File([text], name, { type: 'text/markdown' });
    const result = await picker.upload(SOURCE, DIR, file, {}, false);
    return { path: result?.path ?? `${DIR}/${name}`, bytes: text.length };
  }

  /** @returns {Promise<string>} The lessons file. */
  async readLessons() {
    return this._read(LESSONS);
  }

  /** @returns {Promise<string>} The history file. */
  async readHistory() {
    return this._read(HISTORY);
  }

  /**
   * Lesson headings, for the always-visible index. Titles only: the agent needs to
   * know what is retrievable without paying for the whole file every turn.
   * @returns {Promise<Array<{title: string, lines: number}>>}
   */
  async lessonIndex() {
    return parseSections(await this.readLessons()).map(s => ({
      title: s.title,
      lines: s.body ? s.body.split('\n').length : 0,
    }));
  }

  /**
   * A compact description of the store for the system prompt.
   * @returns {Promise<{location: string, lessonTitles: string[], historyEntries: number, historyBytes: number}>}
   */
  async summary() {
    const [lessons, history] = await Promise.all([this.readLessons(), this.readHistory()]);
    return {
      location: this.location,
      lessonTitles: parseSections(lessons).map(s => s.title),
      historyEntries: parseSections(history).length,
      historyBytes: history.length,
    };
  }

  /**
   * Append one entry to the history. The log is never rewritten, so nothing that
   * was written is lost by a later entry.
   * @param {object} entry
   * @param {string} entry.title
   * @param {string} entry.body
   * @param {string} [entry.stamp] - ISO timestamp; defaults to now.
   * @returns {Promise<{path: string, bytes: number, entries: number}>}
   */
  async appendHistory({ title, body, stamp }) {
    const heading = String(title ?? '').trim();
    if (!heading) throw new Error('A history entry needs a title.');
    const text = String(body ?? '')
      .trim()
      .slice(0, MAX_ENTRY_CHARS);
    const at = stamp || new Date().toISOString().replace('T', ' ').slice(0, 16);

    const existing = await this.readHistory();
    const prefix = existing && !existing.endsWith('\n') ? `${existing}\n\n` : existing;
    const next = `${prefix}${renderEntry(heading, text, at)}`;
    const written = await this._write(HISTORY, next);
    return { ...written, entries: parseSections(next).length };
  }

  /**
   * Add or replace a lesson, matched by title so re-recording a lesson updates it
   * rather than duplicating it.
   * @param {object} lesson
   * @param {string} lesson.title
   * @param {string} lesson.body
   * @returns {Promise<{path: string, bytes: number, action: 'added'|'updated', title: string}>}
   */
  async writeLesson({ title, body }) {
    const heading = String(title ?? '').trim();
    if (!heading) throw new Error('A lesson needs a title.');
    const text = String(body ?? '')
      .trim()
      .slice(0, MAX_LESSON_CHARS);

    const existing = parseSections(await this.readLessons());
    const key = heading.toLowerCase();
    const at = existing.findIndex(s => s.title.toLowerCase() === key);
    const action = at === -1 ? 'added' : 'updated';
    if (at === -1) existing.push({ title: heading, body: text });
    else existing[at] = { title: heading, body: text };

    const next = `${existing.map(s => renderLesson(s.title, s.body)).join('\n')}`;
    const written = await this._write(LESSONS, next);
    return { ...written, action, title: heading };
  }
}

export const memoryStore = new MemoryStore();
export { parseSections };
export default memoryStore;
