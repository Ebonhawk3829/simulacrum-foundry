/**
 * Preview Spec Tool
 *
 * The agent calls this after parsing an ability description. It validates the
 * model-authored form definition, stashes the spec under a token, and returns a
 * structured payload the sidebar renders as an editable form.
 *
 * This tool writes nothing to the world. It is the cheap correction point: a
 * misread statblock is fixed by one field edit here, before any document exists.
 *
 * Flow:
 *   preview_spec(spec, form) -> { previewToken, spec, form, ok }
 *   sidebar renders form -> user edits -> emits the edited spec
 *   build_ability({ previewToken, spec? }) -> uses stashed spec verbatim
 */

import { BaseTool } from './base-tool.js';
import { validateForm } from '../core/form-descriptors.js';
import { stashSpec } from '../core/spec-store.js';

const SCHEMA = {
  type: 'object',
  properties: {
    spec: {
      type: 'object',
      description:
        'The ability data, authored by you. Keys are the contract between this spec, the form you emit, and the builder that consumes it. Key paths must match field ids exactly. Include everything the builder needs; include only what the description justifies.',
    },
    form: {
      type: 'array',
      description:
        'Field descriptors describing an editable form, drawn only from the closed vocabulary: text, number, select, checkbox, group. Each descriptor needs a unique string "id" (letters, digits, underscore, dots) and a "label". Any field may carry "showIf". Emit data, never markup or code. Include a "notes" text field when the ability has a nuance no other field expresses.',
      items: { type: 'object' },
    },
    abilityName: {
      type: 'string',
      description:
        'The ability name as written, e.g. "Tanglefoot". Used for the preview header and to derive the identifier if the spec does not carry one.',
    },
    summary: {
      type: 'string',
      description:
        'One or two sentences describing what you understood the ability to do, shown above the form so the user can judge your reading before editing.',
    },
  },
  required: ['spec', 'form', 'abilityName'],
};

export class PreviewSpecTool extends BaseTool {
  constructor() {
    super(
      'preview_spec',
      'Present a parsed ability as an editable form for the user to confirm or correct before anything is built. Call this after parsing a description and before calling any builder tool. Writes nothing to the world. Returns a previewToken that the builder tool accepts in place of a spec, so the user\'s edits are used verbatim rather than being routed back through you.'
    );
    this.requiresConfirmation = false; // read-only: writes nothing
    this.schema = SCHEMA;
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /**
   * Get confirmation metadata (shown in the generic confirmation card if a world
   * has opted into confirming read-only tools).
   */
  async getConfirmationDetails(params) {
    return {
      type: 'preview',
      title: `Preview: ${params.abilityName || 'Ability'}`,
      details: 'Builds an editable form. Nothing is written until you press Build.',
    };
  }

  /**
   * Build a rejection result. Every guard in execute() returns this shape, so a
   * rejection always names what was wrong and what to do instead.
   * @param {object} body - JSON body describing the failure
   * @param {string} display - One-line summary for the chat card
   * @param {string} type - Machine-readable error type
   * @returns {object}
   */
  _reject(body, display, type) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      error: { message: body.error, type },
    };
  }

  /**
   * Validate the incoming parameters.
   * @param {object} params
   * @returns {{rejection: object}|{fieldCount: number}} Either a rejection to
   *   return as-is, or the validated field count
   */
  _validateParams({ spec, form, abilityName }) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return {
        rejection: this._reject(
          {
            ok: false,
            error: '"spec" must be a plain object. Rebuild it from the ability description.',
          },
          'preview_spec rejected: spec must be an object',
          'VALIDATION_ERROR'
        ),
      };
    }

    const validation = validateForm(form);
    if (!validation.ok) {
      return {
        rejection: this._reject(
          {
            ok: false,
            error:
              'The form definition was rejected. Fix the named descriptors and call preview_spec again.',
            errors: validation.errors,
            validTypes: ['text', 'number', 'select', 'checkbox', 'group'],
          },
          `preview_spec rejected: ${validation.errors.length} form error(s)`,
          'FORM_VALIDATION_ERROR'
        ),
      };
    }

    if (!abilityName || typeof abilityName !== 'string') {
      return {
        rejection: this._reject(
          {
            ok: false,
            error: '"abilityName" is required; pass the ability name as written.',
          },
          'preview_spec rejected: abilityName required',
          'VALIDATION_ERROR'
        ),
      };
    }

    return { fieldCount: validation.fieldCount };
  }

  /**
   * @param {object} params
   * @returns {Promise<object>} Structured preview payload
   */
  async execute(params) {
    const { spec, form, abilityName, summary } = params;

    const check = this._validateParams(params);
    if (check.rejection) return check.rejection;
    const { fieldCount } = check;

    const previewToken = stashSpec(spec, { form, abilityName, summary });

    return {
      content: JSON.stringify(
        {
          ok: true,
          message:
            'Preview shown. Wait for the user to edit and press Build; do not call build_ability until you receive the returned spec or its token.',
          previewToken,
          abilityName,
          fieldCount,
        },
        null,
        2
      ),
      display: `**Preview: ${abilityName}** (${fieldCount} fields) - edit and press Build`,
      // Consumed by the sidebar to render the editable form. Not shown as text.
      preview: {
        token: previewToken,
        spec,
        form,
        abilityName,
        summary: summary || '',
      },
    };
  }
}
