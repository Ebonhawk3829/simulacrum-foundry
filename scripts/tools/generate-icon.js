/**
 * Generate Icon — make one square item icon with the image API and save it.
 *
 * WHAT THIS IS
 *
 * A BUILD-side helper. When the agent is creating an ability, it can also give it an
 * icon in the same breath: call this with a short subject, get back a Foundry path,
 * and pass that path as `img` to `build_ability` (or `document_update`).
 *
 * WHAT IT IS NOT
 *
 * It is not a search. For an icon that already exists on disk, use `search_assets`.
 * This generates a NEW image and writes it into `icons/simulacrum/`.
 *
 * COST AND CONSENT
 *
 * Image generation is billed per call and slow (seconds, not milliseconds), so this
 * tool requires confirmation like any other write. It reports the per-call `cost`
 * OpenRouter returned so the spend is visible rather than inferred.
 *
 * The style, size and framing are fixed in `icon-service.js` — this tool only names
 * the subject. That is deliberate: a set of icons only looks like a set if the
 * invariants are held in one place.
 */

import { BaseTool } from './base-tool.js';
import { deriveIdentifier } from '../core/automation-spec.js';
import { DEFAULT_ICON_MODEL, ICON_DIR, generateIcon } from '../core/icon-service.js';

const SCHEMA = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description:
        'What the icon depicts, as a SHORT concrete noun phrase — the ability or item subject, not the rules text. Good: "bladed braided hair", "cloud of biting flies", "glowing lightning bolt", "cracked stone shield". Bad: the whole ability description. This is the only thing that varies between icons.',
    },
    identifier: {
      type: 'string',
      description:
        'Optional filename stem for the saved image (lowercase-kebab). Defaults to a slug of the subject. Pass the ability identifier so the file sits beside its item and a rebuild reuses the same name.',
    },
  },
  required: ['subject'],
};

export class GenerateIconTool extends BaseTool {
  constructor() {
    super(
      'generate_icon',
      `Generate a square item icon from a short subject and save it to ${ICON_DIR}/, returning a Foundry path. Use when building an ability or item that should have art of its own: call this, then pass the returned "path" as the "img" field to build_ability. Style, size (512) and framing are fixed for set consistency; you supply only the subject. For an icon that already exists, use search_assets instead — this generates and bills a new image.`
    );
    this.requiresConfirmation = true;
    this.schema = SCHEMA;
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} params */
  async getConfirmationDetails(params) {
    const model = game.settings.get('simulacrum', 'iconModel') || DEFAULT_ICON_MODEL;
    return {
      type: 'build',
      title: `Generate icon: ${params.subject ?? '?'}`,
      details: `Creates one 512px square icon with ${model} and saves it to ${ICON_DIR}/. Billed per image.`,
    };
  }

  /**
   * Build a rejection result.
   * @param {object} body
   * @param {string} display
   * @param {string} type
   * @returns {object}
   */
  _reject(body, display, type) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      error: { message: body.error, type },
    };
  }

  /** A filename-safe stem. */
  _stem(identifier, subject) {
    const raw = identifier || deriveIdentifier(subject);
    const safe = String(raw ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || 'icon';
  }

  /**
   * Resolve and validate the inputs, or return a rejection to pass straight back.
   * @param {object} params
   * @returns {object} Either {error} or {apiKey, model, subject, identifier}
   */
  _prepare(params) {
    if (!game.user?.isGM) {
      return {
        error: this._reject(
          { ok: false, error: 'Only a GM can generate icons.' },
          'Icon generation requires GM permission',
          'PERMISSION_DENIED'
        ),
      };
    }

    const apiKey = game.settings.get('simulacrum', 'apiKey');
    if (!apiKey) {
      return {
        error: this._reject(
          {
            ok: false,
            error: 'No OpenRouter API key is set, so image generation cannot run.',
            next: 'Set the API key in Simulacrum settings, or use search_assets for an existing icon.',
          },
          'Icon generation unavailable: no API key',
          'NO_API_KEY'
        ),
      };
    }

    const subject = String(params.subject ?? '').trim();
    if (!subject) {
      return {
        error: this._reject(
          { ok: false, error: '"subject" is required; pass a short noun phrase for the icon.' },
          'generate_icon rejected: subject required',
          'VALIDATION_ERROR'
        ),
      };
    }

    const model = game.settings.get('simulacrum', 'iconModel') || DEFAULT_ICON_MODEL;
    return { apiKey, model, subject, identifier: this._stem(params.identifier, subject) };
  }

  /** @param {object} params */
  async execute(params) {
    const prepared = this._prepare(params);
    if (prepared.error) return prepared.error;

    try {
      const { path, bytes, cost } = await generateIcon(prepared);
      return {
        content: JSON.stringify(
          {
            ok: true,
            path,
            bytes,
            model: prepared.model,
            cost,
            next: `Pass "img": "${path}" to build_ability (or document_update) to put this icon on the item.`,
          },
          null,
          2
        ),
        display: `**Icon generated** \`${path}\``,
      };
    } catch (err) {
      this.logger.error('generate_icon failed', err);
      return this._reject(
        {
          ok: false,
          error: `Generating the icon failed: ${err.message}`,
          hint: 'This is an image-API or filesystem failure, not a data problem. Check the model name and the API key, then retry once. If it persists, fall back to search_assets for an existing icon.',
        },
        `Icon generation failed: ${err.message}`,
        'ICON_FAILED'
      );
    }
  }
}
