/**
 * Read Reference
 *
 * The agent's route to the material that explains how these modules and this
 * system actually work, rather than to a guess from training data.
 *
 * THREE SOURCES, DELIBERATELY DIFFERENT
 *
 * 1. Documents shipped inside this module (`reference/`). Written by hand about
 *    dnd5e 6.x and the module combination this world runs. Small, and versioned
 *    with the code.
 * 2. Files belonging to the modules the world has INSTALLED. midi-qol alone ships
 *    a flag reference and a macro guide; Chris's Premades ships docs. Reading them
 *    where they live means the answer matches the version actually installed,
 *    which a bundled copy could not promise.
 * 3. Nothing is bundled and nothing is persisted. Both would be a second copy of
 *    something that already exists, free to disagree with it.
 *
 * FETCHED OVER FOUNDRY'S OWN ROUTE, NOT READ FROM DISK
 *
 * Reading files server-side is tempting and wrong here. A relative path resolves
 * against Foundry's install directory, while module files live under the user
 * data directory, and those are not the same place — worse, their relationship
 * differs between deployment layouts. Foundry already serves module files, and
 * `foundry.utils.getRoute()` produces the correct URL including any prefix the
 * world is deployed under. Fetching is also the only approach that works when
 * this code runs on a client.
 *
 * Read-only, so it costs no confirmation.
 */

import { BaseTool } from './base-tool.js';
import { markReferenceConsulted, recordReferenceRead } from '../core/reference-journal.js';

/**
 * Documentation to look for inside an installed module, by module id.
 *
 * Every entry here was checked against the modules actually installed in this
 * world, because the previous list described files that no release ships any more:
 * midi-qol's `FLAGS.md` and `MACROS.md` were dropped after v13, `chris-premades`
 * has no `docs/`, and DAE ships no local documentation at all. A listed file that
 * cannot be read is worse than an unlisted one — the agent spends turns on it and
 * then reports that the material is unavailable, which is evidence of this tool's
 * mistake rather than of a gap in the documentation.
 *
 * Documentation only. A module's source tree is mostly code, and searching code is
 * a different job with different output.
 */
const MODULE_DOCS = Object.freeze({
  'midi-qol': ['README.md'],
  // DAE is deliberately absent rather than listed empty: it ships no readable file,
  // so its documentation is bundled in this module's own reference instead. Listing
  // a module with nothing behind it would advertise material that does not exist.
  cat: ['README.md'],
  // Upstream CHANGELOGs are deliberately not listed. They are the bulk of the readable
  // module documentation (midi-qol alone is ~650 KB, Chris's Premades ~175 KB) and are
  // rarely what an answer needs, so listing them invites a context-filling read for a
  // question a search would have answered. A changelog can still be read by passing its
  // path (`file: "midi-qol/Changelog.md"`) — it is just not advertised.
});

/** Extensions worth treating as readable text. */
const TEXT_EXTENSIONS = ['.md', '.txt', '.html'];

/** Filenames worth probing inside an unlisted directory. */
const COMMON_DOCS = [
  'README.md',
  'README.MD',
  'CHANGELOG.md',
  'CHANGELOG.MD',
  'Readme.md',
  'index.md',
  'Home.md',
  'FLAGS.md',
  'MACROS.md',
  'Getting Started.md',
];

/** Cap on text a read returns, so one huge file cannot flood the context. */
const MAX_FILE_BYTES = 300_000;

/** Cap on probes per directory. */
const MAX_DIR_PROBES = 40;

export class ReadReferenceTool extends BaseTool {
  constructor() {
    super(
      'read_reference',
      'List or search the reference material available for writing these automations: the dnd5e 6.x field guide shipped with this module, the CAT macro flag shapes, the CPR generic settings (every generic and every setting it accepts, with defaults), the DAE effect expiry vocabulary, and the upstream changelog of CAT/CPR changes since the last sync (read it when asked whether existing abilities need updating). Use this BEFORE authoring an activity or setting a flag, so the field names and shapes come from the actual system rather than from memory. This is the ONLY route to the documentation: run_javascript, document_search and asset_search read the world\'s documents, never these. A "how does this work" or "does this exist" question is answered here, by reading the owning file - not by searching the world and reporting that nothing was found. Read-only.'
    );
    this.requiresConfirmation = false; // read-only
    this._index = null; // in-memory only, for the life of the page
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Words to search for, matched case-insensitively against the reference text. Omit to list what reference exists instead of searching.',
        },
        source: {
          type: 'string',
          description:
            'Restrict to one source: "module" for this module\'s own reference, or an installed module id such as "midi-qol". Omit to search everything.',
        },
        context: {
          type: 'number',
          description: 'Characters of context to show around each match. Defaults to 240.',
        },
        limit: {
          type: 'number',
          description: 'Maximum matches to return. Defaults to 20.',
        },
        file: {
          type: 'string',
          description:
            'Read one reference file in full, by the path a listing returned (e.g. "module/dnd5e-6.0-fields.md"). Use this after a search shows you which file is worth reading properly.',
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
      title: 'Read reference',
      details: 'Reads documentation files. Nothing is changed.',
    };
  }

  /** @param {object} params */
  async execute(params) {
    try {
      if (params.file) return await this._readOneFile(params.file);

      const files = await this._collect(params.source);
      this._index = files;

      if (!files.length) return this._nothingFound(params.source);
      if (params.query) return this._search(files, params);
      return this._list(files);
    } catch (err) {
      this.logger.error('read_reference failed', err);
      return this._reject(
        {
          ok: false,
          error: `Reading the reference failed: ${err.message}`,
          hint:
            'Fall back to inspect_document_schema for field shapes, and to search_documents with a "pack" argument for working examples in compendiums.',
        },
        `Reference unavailable: ${err.message}`,
        'READ_FAILED'
      );
    }
  }

  /**
   * Report that nothing was readable, and what was tried.
   *
   * Naming the routes matters: if this ever fires, the useful next question is
   * "where did it look", and the answer belongs in the result rather than in a
   * log the agent cannot read.
   * @param {string} [source]
   * @returns {object}
   */
  _nothingFound(source) {
    return this._reject(
      {
        ok: false,
        error: 'No reference files could be read.',
        searched: this._routes(source),
        hint:
          'The installed modules may not ship documentation, or this world may not serve module files at the expected path. You can still use inspect_document_schema for live field shapes, and search_documents with a "pack" argument for working examples in compendiums.',
      },
      'No reference files',
      'NO_REFERENCE'
    );
  }

  /**
   * The routes that will be probed, for reporting when nothing is found.
   * @param {string} [source]
   * @returns {string[]}
   */
  _routes(source) {
    const routes = [];
    for (const target of this._targets(source)) {
      routes.push(target.isDir ? `${target.route}/ (probing ${MAX_DIR_PROBES} names)` : target.route);
    }
    return routes;
  }

  /**
   * Everything to probe, resolved once.
   *
   * `source` is the label the agent sees; `moduleId` is the directory on disk.
   * They differ for this module, which sits under `simulacrum` but is reported as
   * `module`, so the manifest lookup must not be built from the label.
   * @param {string} [source]
   * @returns {Array<{source: string, moduleId: string, route: string, isDir: boolean, label: string}>}
   */
  _targets(source) {
    const out = [];

    if (!source || source === 'module' || source === 'simulacrum') {
      out.push({
        source: 'module',
        moduleId: 'simulacrum',
        route: 'modules/simulacrum/reference',
        isDir: true,
        label: 'module',
      });
    }

    for (const [id, docs] of Object.entries(MODULE_DOCS)) {
      if (source && source !== id) continue;
      for (const doc of docs) {
        const isDir = doc.endsWith('/');
        const clean = doc.replace(/\/$/, '');
        out.push({
          source: id,
          moduleId: id,
          route: `modules/${id}/${clean}`,
          isDir,
          label: isDir ? id : `${id}/${clean}`,
        });
      }
    }

    return out;
  }

  /**
   * Gather readable reference files.
   *
   * A probe that misses is skipped rather than failing the request, so one module
   * without documentation does not cost the others.
   * @param {string} [source]
   * @returns {Promise<Array<{source: string, path: string, text: string}>>}
   */
  async _collect(source) {
    const out = [];

    for (const target of this._targets(source)) {
      if (target.isDir) out.push(...(await this._probeDir(target)));
      else {
        const text = await this._fetchText(target.route);
        if (text !== null) out.push({ source: target.source, path: target.label, text });
      }
    }

    return out;
  }

  /**
   * Probe plausible documentation filenames inside a directory.
   *
   * Foundry does not serve directory listings, so names have to be tried. A miss
   * costs one request and returns quickly, and the manifest declares a few of the
   * names outright, so this is cheap enough to prefer over a listing the server
   * will refuse anyway.
   * @param {object} target
   * @returns {Promise<Array<{source: string, path: string, text: string}>>}
   */
  async _probeDir(target) {
    const out = [];
    const names = await this._candidateNames(target);

    for (const name of names.slice(0, MAX_DIR_PROBES)) {
      if (!TEXT_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext))) continue;
      const text = await this._fetchText(`${target.route}/${name}`);
      if (text !== null) out.push({ source: target.source, path: `${target.source}/${name}`, text });
    }

    return out;
  }

  /**
   * Names worth trying in a directory.
   *
   * The declared list first — this module names its own reference files in
   * `module.json` under `flags.simulacrum.reference`, which is exact and needs no
   * guessing and no code change when a file is added. The module's own readme and
   * changelog come next, then a conventional list. A wrong guess costs one failed
   * request, so the fallback is cheap enough to keep.
   * @param {object} target
   * @returns {Promise<string[]>}
   */
  async _candidateNames(target) {
    const names = new Set();

    const manifest = await this._fetchJson(`modules/${target.moduleId}/module.json`);

    // An explicit declaration is authoritative, so it is used alone when present.
    const declared = manifest?.flags?.simulacrum?.reference;
    if (Array.isArray(declared) && declared.length) {
      for (const entry of declared) {
        if (typeof entry !== 'string') continue;
        names.add(entry.replace(/^reference\//, '').replace(/^\.\//, ''));
      }
      return [...names];
    }

    for (const key of ['readme', 'changelog']) {
      const value = manifest?.[key];
      if (typeof value === 'string' && !value.includes('://')) {
        names.add(value.replace(/^\.\//, '').replace(/^\//, ''));
      }
    }

    for (const common of COMMON_DOCS) names.add(common);
    return [...names];
  }

  /**
   * Fetch a text file, returning null rather than throwing when it is absent.
   * @param {string} route
   * @returns {Promise<string|null>}
   */
  async _fetchText(route) {
    try {
      const res = await fetch(this._route(route), { redirect: 'follow' });
      if (!res.ok) return null;
      // Returned whole. The cap applies where text LEAVES the tool (a read), not here, so the
      // index can report a file's real size rather than the size it was cut to.
      return await res.text();
    } catch {
      return null; // absent or unreadable is the normal result of a probe
    }
  }

  /**
   * Cap text on its way out of the tool, so one huge file cannot flood the context.
   * @param {string} text
   * @returns {string}
   */
  _truncateForOutput(text) {
    if (text.length > MAX_FILE_BYTES) {
      return `${text.slice(0, MAX_FILE_BYTES)}\n\n[truncated at ${MAX_FILE_BYTES} characters]`;
    }
    return text;
  }

  /**
   * Fetch and parse JSON, returning null when absent or malformed.
   * @param {string} route
   * @returns {Promise<object|null>}
   */
  async _fetchJson(route) {
    const text = await this._fetchText(route);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Turn a path into a URL using Foundry's own route resolution.
   *
   * Not string concatenation: a world deployed under a sub-path needs the prefix,
   * and only Foundry knows what it is.
   * @param {string} path
   * @returns {string}
   */
  _route(path) {
    try {
      return foundry.utils.getRoute(path);
    } catch {
      return `/${path}`;
    }
  }

  /**
   * Report what reference exists, with enough shape to choose from.
   * @param {Array<object>} files
   * @returns {object}
   */
  _list(files) {
    const bySource = new Map();
    for (const file of files) {
      if (!bySource.has(file.source)) bySource.set(file.source, []);
      bySource.get(file.source).push({ path: file.path, bytes: file.text.length });
    }

    return {
      content: JSON.stringify(
        {
          ok: true,
          fileCount: files.length,
          sources: [...bySource].map(([source, list]) => ({ source, files: list })),
          next: 'Search with a query, or pass "file" to read one in full. Check the dnd5e field guide before authoring an activity, and read a working example from a compendium for ability shapes.',
        },
        null,
        2
      ),
      display: `**Reference:** ${files.length} files across ${bySource.size} source(s)`,
    };
  }

  /**
   * Find a query in the reference and return matching passages.
   *
   * Passages rather than whole files: a flag reference is tens of thousands of
   * characters, and returning it whole for every question would spend the context
   * needed to act on the answer.
   * @param {Array<object>} files
   * @param {object} params
   * @returns {object}
   */
  _search(files, params) {
    const needle = String(params.query).toLowerCase();
    const width = Number.isFinite(params.context) && params.context > 0 ? params.context : 240;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 20;

    const matches = [];
    for (const file of files) {
      const haystack = file.text.toLowerCase();
      let at = haystack.indexOf(needle);
      while (at !== -1 && matches.length < limit) {
        matches.push({
          source: file.source,
          path: file.path,
          // The line number is what makes a match actionable: it is what you need
          // in order to go and read the surrounding section.
          line: file.text.slice(0, at).split('\n').length,
          text: file.text
            .slice(Math.max(0, at - width), Math.min(file.text.length, at + needle.length + width))
            .trim(),
        });
        at = haystack.indexOf(needle, at + needle.length);
      }
      if (matches.length >= limit) break;
    }

    const content = { ok: true, query: params.query, matchCount: matches.length, matches };
    if (!matches.length) {
      content.next = `Nothing matched "${params.query}" in the reference. That is not evidence the mechanism does not exist - try a shorter or different term, read the file that owns it in full, or use inspect_document_schema for live field shapes.`;
      content.caution =
        'A REFERENCE search that finds nothing is the absence of a match, not evidence of absence. Do not report a mechanism as absent, missing, not installed or broken on the strength of this.';
    } else {
      markReferenceConsulted();
      content.next =
        'Read the relevant file in full with the "file" argument before authoring anything. A match shows one passage, and the shape you need is often a little further up.';
    }

    return {
      content: JSON.stringify(content, null, 2),
      display: `**Reference: "${params.query}"** — ${matches.length} match(es)`,
    };
  }

  /**
   * Return one file in full.
   *
   * Accepts the path a listing returned, or a bare filename, because the agent
   * will reasonably do either.
   *
   * The comparison is case-insensitive because the agent should not have to
   * reproduce a path's capitalisation, but the ROUTE built from a name that was not
   * found in the index uses the caller's own spelling. Lower-casing it first would
   * send `cat/README.md` to `modules/cat/readme.md`, which is a 404 on any
   * case-sensitive filesystem — Linux, which is where this world is deployed. It
   * happened to work on Windows and failed in the world, which is the worst way for
   * a bug like this to behave.
   * @param {string} wanted
   * @returns {Promise<object>}
   */
  async _readOneFile(wanted) {
    const wantedPath = String(wanted).trim();
    const key = wantedPath.toLowerCase();

    const known = (this._index ?? []).find(
      f => f.path.toLowerCase() === key || f.path.toLowerCase().endsWith(key)
    );
    if (known) {
      recordReferenceRead(known.path);
      return {
        content: JSON.stringify(
          {
            ok: true,
            path: known.path,
            bytes: known.text.length,
            text: this._truncateForOutput(known.text),
          },
          null,
          2
        ),
        display: `**Reference:** ${known.path}`,
      };
    }

    // Not indexed yet, so treat it as a route and try directly. The original
    // spelling is kept for the path itself; only the prefix matches are lowered,
    // because the directory names on disk are lower-case by convention.
    const route = key.startsWith('module/')
      ? `modules/simulacrum/reference/${wantedPath.replace(/^module\//i, '')}`
      : wantedPath.includes('/')
        ? `modules/${wantedPath}`
        : wantedPath;

    const text = await this._fetchText(route);
    if (text === null) {
      return this._reject(
        {
          ok: false,
          error: `No reference file could be read for "${wanted}".`,
          available: (this._index ?? []).map(f => f.path),
          hint: 'Call read_reference with no arguments to list what exists.',
        },
        `No such reference file: ${wanted}`,
        'NOT_FOUND'
      );
    }

    recordReferenceRead(route);
    return {
      content: JSON.stringify(
        { ok: true, path: route, bytes: text.length, text: this._truncateForOutput(text) },
        null,
        2
      ),
      display: `**Reference:** ${route}`,
    };
  }

  /** Build a rejection result. */
  _reject(body, display, type) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      error: { message: String(body.error ?? display), type },
    };
  }
}
