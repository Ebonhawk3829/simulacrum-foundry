/**
 * Automation Spec — the shared contract between the agent, the preview form and
 * the builder tools.
 *
 * The agent emits a spec whose keys are dotted paths ("save.dc", "target.count").
 * The preview form reuses those same ids, so the form is a view of the spec. The
 * builders read the same paths. One key space, three consumers - which is why an
 * agent that names fields clearly gets a correct build for free.
 *
 * Pure module: no Foundry globals, so every rule here is unit-testable. The
 * vocabulary lists mirror dnd5e 5.3.3's CONFIG, kept local so validation works
 * in plain Node and so a system update cannot silently widen what we accept.
 */

/** dnd5e 5.3.3 CONFIG.abilities */
export const ABILITIES = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);

/** dnd5e 5.3.3 CONFIG.distanceUnits (the subset useful for abilities) */
export const RANGE_UNITS = Object.freeze(['self', 'touch', 'spec', 'ft', 'mi', 'km', 'm']);

/** dnd5e 5.3.3 CONFIG.areaTargetTypes */
export const TEMPLATE_TYPES = Object.freeze([
  'circle',
  'cone',
  'cube',
  'cylinder',
  'line',
  'radius',
  'sphere',
  'square',
  'wall',
]);

/** dnd5e 5.3.3 CONFIG.damageTypes */
export const DAMAGE_TYPES = Object.freeze([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

/** dnd5e 5.3.3 CONFIG.abilityActivationTypes */
export const ACTIVATION_TYPES = Object.freeze([
  'action',
  'bonus',
  'reaction',
  'minute',
  'hour',
  'day',
  'legendary',
  'lair',
  'mythic',
  'special',
  'crew',
  'turn',
  'none',
]);

/** dnd5e 5.3.3 CONFIG.durationUnits */
export const DURATION_UNITS = Object.freeze([
  'inst',
  'turn',
  'round',
  'minute',
  'hour',
  'day',
  'month',
  'year',
  'perm',
  'spec',
  'disp',
]);

/** dnd5e 5.3.3 CONFIG.limitedUsePeriods, restricted to what a spell-like ability uses */
export const USE_PERIODS = Object.freeze(['lr', 'sr', 'day', 'charges', 'recharge', 'turn', 'round']);

/** dnd5e 5.3.3 CONFIG.limitedUseType */
export const RECOVERY_TYPES = Object.freeze(['recoverAll', 'loseAll', 'formula']);

/**
 * Condition ids from dnd5e 5.3.3's status effect list. These are the ones an
 * ability is likely to impose; the builder accepts others with a warning so an
 * unusual but valid id is not blocked.
 */
export const CONDITIONS = Object.freeze([
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);

/** How a save DC is determined. */
export const DC_MODES = Object.freeze(['fixed', 'formula', 'spellcasting', 'initial']);

/** Movement directions dnd5e's forced-movement helper understands. */
export const MOVEMENT_DIRECTIONS = Object.freeze(['push', 'pull', 'away', 'toward', 'up', 'down']);

/** What a triggered ability reacts to. */
export const TRIGGER_CONDITIONS = Object.freeze([
  'damage-taken',
  'attacked',
  'hit-by-attack',
  'fails-save',
  'turn-start',
  'turn-end',
  'enter-area',
  'leaves-area',
  'reduced-to-zero',
]);

/** What fires a marked target's extra damage. */
export const MARK_TRIGGERS = Object.freeze(['hit', 'any-attack', 'when-moved']);

/** Who controls a summoned creature. */
export const SUMMON_CONTROLS = Object.freeze(['source', 'gm', 'none']);

/** Extra damage applied when a save fails by this much or more. */
export const FAILS_BY_CONDITIONS = Object.freeze([
  'dazed',
  'prone',
  'restrained',
  'stunned',
  'incapacitated',
]);


/** Vocabulary registries referenced by the spec types above. */
export const VOCABULARIES = Object.freeze({
  ABILITIES,
  RANGE_UNITS,
  TEMPLATE_TYPES,
  DAMAGE_TYPES,
  ACTIVATION_TYPES,
  DURATION_UNITS,
  USE_PERIODS,
  RECOVERY_TYPES,
  CONDITIONS,
  DC_MODES,
  FAILS_BY_CONDITIONS,
  MOVEMENT_DIRECTIONS,
  TRIGGER_CONDITIONS,
  MARK_TRIGGERS,
  SUMMON_CONTROLS,
});

/** Dotted spec ids must stay safe to use as keys and as form field ids. */
const SPEC_ID_PATTERN = /^[A-Za-z_][\w.]*$/;

/**
 * Read a spec value by dotted path, accepting a flat key or a nested object.
 *
 * Both shapes exist in practice: the preview round-trip is flat (form ids are
 * dotted strings) while a literal spec written by the agent is often nested.
 * Accepting both means neither path needs converting, so nothing can be lost in
 * a conversion step.
 * @param {object} spec
 * @param {string} path
 * @returns {*} The value, or undefined when unset
 */
export function getSpecValue(spec, path) {
  if (!spec || typeof spec !== 'object') return undefined;

  if (Object.prototype.hasOwnProperty.call(spec, path)) return spec[path];

  if (!path.includes('.')) return undefined;

  let cursor = spec;
  for (const part of path.split('.')) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/** Coerce a spec value to a number, or return undefined when it is not one. */
export function getSpecNumber(spec, path) {
  const raw = getSpecValue(spec, path);
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Coerce a spec value to a boolean, treating omitted as the given default. */
export function getSpecBoolean(spec, path, fallback = false) {
  const raw = getSpecValue(spec, path);
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return Boolean(raw);
}

/** Coerce a spec value to a trimmed string, or undefined when empty. */
export function getSpecString(spec, path) {
  const raw = getSpecValue(spec, path);
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim();
  return value === '' ? undefined : value;
}

/**
 * Derive the identifier an automation is filed under.
 *
 * Identifiers are how an item, its effects and its rebuilds find one another, so
 * the derivation must be deterministic: the same ability name always produces
 * the same identifier, which is what makes rebuilding an update rather than a
 * duplicate.
 * @param {string} name
 * @returns {string} lowercase-kebab-case identifier
 */
export function deriveIdentifier(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Human-readable list for an error message. */
function _list(values) {
  return values.join(', ');
}

/**
 * Resolve a declared type into the values it accepts, if it is enumerable.
 * @param {string} type - e.g. "enum:ABILITIES" or "enum:none|half|full"
 * @returns {string[]|null} Accepted values, or null when not an enumeration
 */
function _resolveEnum(type) {
  return type.startsWith('enum:') ? _enumValues(type.slice(5)) : null;
}

/** Resolve the vocabulary after an "enum:" prefix. */
function _enumValues(spec) {
  // "none|half|full" is an inline list; anything else names a vocabulary.
  if (spec.includes('|')) return spec.split('|');
  return VOCABULARIES[spec] ?? null;
}

/**
 * Check one value against its declared spec type.
 * @param {string} path
 * @param {*} value
 * @param {string} type
 * @param {string[]} warnings - Accumulator
 * @returns {string|null} An error message, or null when acceptable
 */
function _checkType(path, value, type, warnings) {
  if (type.startsWith('enumOrString:')) {
    return _checkLooseEnum(path, value, type.slice(13), warnings);
  }

  const allowed = _resolveEnum(type);
  if (allowed) {
    if (!allowed.length) {
      const spec = type.slice(5);
      return `"${path}" declares an unknown vocabulary "${spec}" - this is a bug in the builder, please report it`;
    }
    if (!allowed.includes(String(value))) {
      return `"${path}" must be one of ${_list(allowed)}; you sent "${value}"`;
    }
    return null;
  }

  return _checkScalar(path, value, type);
}

/**
 * Accept a value that should be in a vocabulary but is allowed to fall outside
 * it, because a module can register additional ids (conditions especially).
 */
function _checkLooseEnum(path, value, vocabularyName, warnings) {
  const vocabulary = VOCABULARIES[vocabularyName];
  if (!vocabulary) {
    return `"${path}" declares an unknown vocabulary - this is a bug in the builder, please report it`;
  }
  if (!vocabulary.includes(String(value))) {
    warnings.push(
      `"${path}" is "${value}", which is not one of the core values (${_list(vocabulary)}). It was applied as given - check it exists in your world.`
    );
  }
  return null;
}

/** Check a value against a plain scalar type. */
function _checkScalar(path, value, type) {
  if (type === 'number' && !Number.isFinite(Number(value))) {
    return `"${path}" must be a number; you sent "${value}"`;
  }
  if (type === 'boolean' && typeof value !== 'boolean') {
    return `"${path}" must be true or false; you sent "${value}"`;
  }
  return null;
}

/**
 * Validate one spec entry against the contract.
 * @param {string} path
 * @param {*} value
 * @param {object} ctx - { contract, errors, warnings }
 */
function _checkEntry(path, value, ctx) {
  if (!Object.prototype.hasOwnProperty.call(ctx.contract, path)) {
    ctx.warnings.push(
      `"${path}" is not part of the contract this data was checked against. It was ignored. If it describes a real mechanic, note it in "notes" or tell the user it is not automated.`
    );
    return;
  }
  if (!SPEC_ID_PATTERN.test(path)) {
    ctx.errors.push(`"${path}" is not a valid spec key`);
    return;
  }
  const problem = _checkType(path, value, ctx.contract[path], ctx.warnings);
  if (problem) ctx.errors.push(problem);
}

/**
 * Validate a spec against a tool's key contract.
 *
 * Errors stop the build and name the field plus its accepted values, because the
 * agent's next move is to correct that field and retry. Warnings are reported
 * and passed through: the build still happens.
 * @param {object} spec - Flat or nested spec
 * @param {object} contract - Map of allowed path to expected type
 * @param {object} [options]
 * @param {string[]} [options.required] - Paths that must be present
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateSpec(spec, contract, { required = [] } = {}) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: ['spec must be an object'], warnings };
  }

  const ctx = { contract, errors, warnings };
  for (const [path, value] of _flattenSpec(spec)) {
    _checkEntry(path, value, ctx);
  }

  for (const path of required) {
    const value = getSpecValue(spec, path);
    if (value === undefined || value === null || value === '') {
      errors.push(`"${path}" is required by the contract this data was checked against and was not supplied`);
    }
  }

  errors.push(..._checkCrossFieldRules(spec, warnings));

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Rules that span more than one spec key. These live apart from per-key type
 * checks because they express gameplay constraints, not shapes.
 * @param {object} spec
 * @param {string[]} warnings - Accumulator
 * @returns {string[]} Errors
 */
function _checkCrossFieldRules(spec, warnings) {
  const errors = [];

  // A numeric save DC has a hard range: outside it the roll is meaningless.
  const dc = getSpecNumber(spec, 'save.dc');
  if (dc !== undefined && (dc < 1 || dc > 40)) {
    errors.push(`"save.dc" must be between 1 and 40; you sent ${dc}`);
  }

  // Damage without a type would be applied as untyped damage, which is almost
  // never what a statblock means. Warn so the agent can confirm.
  if (getSpecString(spec, 'damage.formula') && !getSpecString(spec, 'damage.type')) {
    warnings.push(
      '"damage.formula" was set without "damage.type"; the damage will be untyped. Set "damage.type" if the description names one.'
    );
  }

  // An area with no size produces a template that cannot be placed.
  if (getSpecString(spec, 'target.type') && getSpecNumber(spec, 'target.size') === undefined) {
    errors.push(
      `"target.type" is "${getSpecString(spec, 'target.type')}" but "target.size" is missing; give the area's size in feet`
    );
  }

  return errors;
}

/**
 * Flatten a spec into [dottedPath, value] pairs, stopping at arrays and values
 * that the contract addresses directly.
 * @param {object} spec
 * @param {string} [prefix]
 * @returns {Array<[string, *]>}
 */
function _flattenSpec(spec, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(spec)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(..._flattenSpec(value, path));
    } else {
      out.push([path, value]);
    }
  }
  return out;
}

/**
 * Identify the token the user currently has targeted, for the self-test.
 * Reads the live target set rather than creating anything, because the user
 * decides what the ability is tested against.
 * @returns {{ok: boolean, actor?: object, token?: object, error?: string, guidance?: string}}
 */
export function resolveTargetedActor() {
  const targeted = typeof game !== 'undefined' ? game?.user?.targets : null;
  if (!targeted) {
    return {
      ok: false,
      error: 'no-targeting-unavailable',
      guidance: 'Targeting is not available in this environment.',
    };
  }

  const tokens = Array.from(targeted);
  if (tokens.length === 0) {
    return {
      ok: false,
      error: 'no-target',
      guidance:
        'No token is targeted. Ask the user to target the token to test against on the active scene, then call test_ability again. This is a normal pause, not a failure.',
    };
  }

  const token = tokens[0];
  if (!token.actor) {
    return {
      ok: false,
      error: 'target-has-no-actor',
      guidance:
        'The targeted token has no actor (it may be a tile or a token whose actor was deleted). Ask the user to target a token with an actor.',
    };
  }

  return {
    ok: true,
    actor: token.actor,
    token,
    extraTargets: tokens.length - 1,
  };
}

/**
 * Resolve the actor an automation should be written to.
 *
 * The actor is chosen by the user in the preview panel, so this accepts an id, a
 * name, a UUID reference or an @UUID link and must fail with something the agent
 * can act on.
 * @param {string} ref
 * @returns {{ok: boolean, actor?: object, error?: string, guidance?: string}}
 */
export function resolveActor(ref) {
  if (typeof game === 'undefined' || !game?.actors) {
    return { ok: false, error: 'no-actor-registry', guidance: 'No actor registry is available.' };
  }

  if (!ref) {
    return {
      ok: false,
      error: 'actor-missing',
      guidance:
        'No "actor" was supplied. Ask the user which actor the ability belongs on (it is a field in the preview form), or pass an actor id.',
    };
  }

  const actors = game.actors.contents ?? [];

  // "Actor.abc123" / "@UUID[Actor.abc123]{Name}" / plain id
  const idMatch = String(ref).match(/Actor\.([A-Za-z0-9]{8,})/);
  const id = idMatch?.[1] ?? String(ref);

  const byId = actors.find(a => a.id === id);
  if (byId) return { ok: true, actor: byId };

  const lowered = String(ref).trim().toLowerCase();
  const byName = actors.filter(a => String(a.name).toLowerCase() === lowered);
  if (byName.length === 1) return { ok: true, actor: byName[0] };
  if (byName.length > 1) {
    return {
      ok: false,
      error: 'actor-ambiguous',
      guidance: `"${ref}" matches ${byName.length} actors. Ask the user which one, or use the actor's id.`,
    };
  }

  return {
    ok: false,
    error: 'actor-not-found',
    guidance: `No actor matched "${ref}". Ask the user which actor the ability belongs on.`,
  };
}
