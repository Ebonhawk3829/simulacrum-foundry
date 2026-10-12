/**
 * Archetype Registry — the single source of truth for what can be built.
 *
 * An "archetype" is a category of ability: save-or-suffer, attack rider, aura,
 * and so on. Each registers one module here.
 *
 * WHY A REGISTRY, AND NOT A TOOL PER ARCHETYPE
 *
 * The first release named six archetypes in the system prompt and shipped one
 * builder. The prompt therefore instructed the model to call four tools that did
 * not exist, and nothing in the codebase connected the two lists. A registry
 * removes the possibility: the prompt's archetype list is GENERATED from this
 * registry, the preview's `archetype` enum is generated from it, and the dispatch
 * tool looks names up in it. A name that is not registered cannot be advertised.
 *
 * That failure was also invisible to testing, because a prompt is a string and a
 * missing tool raises no error until a model calls it in a live session. The
 * guard is structural precisely because it cannot be caught by assertion.
 *
 * WHAT A MODULE PROVIDES
 *
 *   id           - stable name, used in the prompt and the preview enum
 *   label        - human phrasing for the prompt
 *   example      - a concrete ability, so the model recognises the shape
 *   summary      - one line on when to choose this archetype
 *   activityType - the dnd5e activity this produces, for display and for tests
 *   spec         - the spec keys this archetype understands (see automation-spec)
 *   required     - spec paths that must be present
 *   build        - (spec, ctx) => { system, activities, effects }
 *   claims       - (spec) => claim checklist for the self-test
 *
 * `build` returns the AUTHORED regions only. dnd5e prepares everything else, and
 * a rebuild replaces these wholesale so a correction cannot leave a stale
 * activity or effect behind.
 */

import { SaveArchetype } from './save.js';

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Register an archetype module.
 * @param {object} module
 * @throws {Error} if the id is missing or already taken
 */
export function registerArchetype(module) {
  if (!module?.id) throw new Error('An archetype needs an "id".');
  if (registry.has(module.id)) {
    throw new Error(`Archetype "${module.id}" is already registered.`);
  }
  for (const fn of ['build', 'claims']) {
    if (typeof module[fn] !== 'function') {
      throw new Error(`Archetype "${module.id}" is missing its ${fn}() function.`);
    }
  }
  registry.set(module.id, Object.freeze(module));
}

/**
 * Look up an archetype.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getArchetype(id) {
  return registry.get(id);
}

/**
 * Every registered archetype, in a stable order.
 * @returns {object[]}
 */
export function listArchetypes() {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The registered ids, which is what the preview enum and the prompt use.
 * @returns {string[]}
 */
export function archetypeIds() {
  return listArchetypes().map(a => a.id);
}

/**
 * Render the archetype list for the system prompt.
 *
 * Generating this from the registry is the whole point: the prompt cannot
 * describe an archetype the builder cannot produce.
 * @returns {string}
 */
export function describeArchetypesForPrompt() {
  const lines = listArchetypes().map(
    a => `- ${a.label} (${a.example}): ${a.summary}. Archetype: "${a.id}".`
  );
  return [
    'Ability archetypes, and the "archetype" value that selects each:',
    '',
    ...lines,
    '',
    'If an ability spans more than one archetype, build the dominant one first and tell the user which part is not yet automated. Do not invent a hybrid.',
  ].join('\n');
}

/**
 * Register the built-in archetypes. Called once at module load.
 *
 * Kept as a function so tests can build a registry of their own without the
 * built-ins, and so the import order of the modules is irrelevant.
 */
function registerBuiltins() {
  registerArchetype(SaveArchetype);
}

registerBuiltins();
