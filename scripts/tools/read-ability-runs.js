/**
 * Read Ability Runs
 *
 * Returns the recorded runs for an item, so the agent can compare what actually
 * happened against what it intended. This is the whole troubleshooting input: the
 * agent does not need the module to judge the ability, it needs an accurate
 * account of what occurred and the user's description of what they saw.
 *
 * Read-only, so it costs no confirmation.
 */

import { BaseTool } from './base-tool.js';
import { getVerificationState } from '../core/verification-state.js';

export class ReadAbilityRunsTool extends BaseTool {
  constructor() {
    super(
      'read_ability_runs',
      'Read what was recorded when a built ability was used in play: the chat output and its rolls, hit point and condition changes on the actor and its targets, and any errors. Read-only. Compare this against what you intended and against what the user tells you they saw, then decide what to change. If nothing has been recorded yet, the user has not used the ability — ask them to.'
    );
    this.requiresConfirmation = false; // read-only
    this.schema = {
      type: 'object',
      properties: {
        itemUuid: {
          type: 'string',
          description: 'The itemUuid returned by build_ability.',
        },
        limit: {
          type: 'number',
          description:
            'How many of the most recent runs to return. Defaults to all of them (up to the 20 kept per item).',
        },
      },
      required: ['itemUuid'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async getConfirmationDetails(_params) {
    return {
      type: 'read',
      title: 'Read recorded runs',
      details: 'Reads the recorded uses of the ability. Nothing is changed.',
    };
  }

  /** @param {object} params */
  async execute(params) {
    const item = foundry.utils.fromUuidSync(params.itemUuid);
    if (!item) {
      return this._reject(
        {
          ok: false,
          error: `No item found for "${params.itemUuid}". It may have been deleted since the build.`,
          next: 'Call build_ability again to rebuild it.',
        },
        'Item not found',
        'ITEM_NOT_FOUND'
      );
    }

    const state = getVerificationState(item);
    if (!state) {
      return this._reject(
        {
          ok: false,
          error: `"${item.name}" was not built by this module, or was built before the record existed, so nothing is being recorded for it.`,
          next: 'Rebuild it with build_ability if you want its use recorded.',
        },
        'Not a tracked ability',
        'NOT_TRACKED'
      );
    }

    const runs = state.runs ?? [];
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : runs.length;
    const selected = runs.slice(-limit);

    const content = {
      ok: true,
      itemUuid: item.uuid,
      itemName: item.name,
      status: state.status,
      intent: state.intent ?? undefined,
      expect: state.expect ?? undefined,
      markedAt: state.markedAt,
      runCount: runs.length,
      runs: selected,
    };

    if (!runs.length) {
      content.next =
        'Nothing has been recorded yet, so the ability has not been used since it was built. Ask the user to use it in play the way they normally would, then call this again. Do not guess whether it works.';
    } else if (state.status === 'confirmed') {
      content.next =
        'This ability was confirmed working, so recording has stopped. These runs are the history behind that decision. Rebuild it to start recording again.';
    } else {
      content.next =
        'Compare these runs against your intent and against what the user reported. State plainly which expectations the evidence supports and which it does not, and say what you could not tell from the record. Then either correct the build or ask the user to use it again. When the user confirms it behaves correctly, call confirm_ability.';
    }

    return {
      content: JSON.stringify(content, null, 2),
      display: `**Runs: ${item.name}** — ${runs.length} recorded`,
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
