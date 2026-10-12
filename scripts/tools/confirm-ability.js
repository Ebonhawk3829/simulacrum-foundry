/**
 * Confirm Ability
 *
 * Marks a built ability as behaving correctly and stops recording it.
 *
 * This is the end of the loop: the user is satisfied, so the debug output goes
 * away. The recorded runs are KEPT rather than discarded, because they are the
 * evidence behind the decision — if the ability misbehaves in a month, that
 * history is the first thing worth reading, and it would be gone.
 *
 * Reversing is intentional and cheap: a rebuild marks the item for testing again,
 * so confirming is never a dead end.
 */

import { BaseTool } from './base-tool.js';
import { getVerificationState, clearNeedsTesting } from '../core/verification-state.js';

export class ConfirmAbilityTool extends BaseTool {
  constructor() {
    super(
      'confirm_ability',
      'Mark a built ability as confirmed working, which stops recording its uses and removes the debug output. Call this only after the user has told you it behaves correctly in play. The recorded runs are kept as history. This is reversible: rebuilding the ability with build_ability starts recording again.'
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        itemUuid: {
          type: 'string',
          description: 'The itemUuid of the ability the user has confirmed.',
        },
        summary: {
          type: 'string',
          description:
            'One line on what was verified and how, stored with the record so the decision is understandable later. e.g. "Used on a goblin; restrained applied and the re-save fired at end of turn."',
        },
        discardRuns: {
          type: 'boolean',
          description:
            'Set true to also discard the recorded runs. Defaults to false; keeping them costs nothing and they are the only evidence if this ability later misbehaves.',
        },
      },
      required: ['itemUuid'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /** @param {object} params */
  async getConfirmationDetails(params) {
    return {
      type: 'build',
      title: 'Confirm ability',
      details: `Stops recording uses of this ability and clears its needs-testing mark.${
        params.discardRuns ? ' The recorded history will also be discarded.' : ' The recorded history is kept.'
      }`,
    };
  }

  /** @param {object} params */
  async execute(params) {
    if (!game.user?.isGM) {
      return this._reject('Only a GM can confirm an ability.', 'GM required', 'PERMISSION_DENIED');
    }

    const item = foundry.utils.fromUuidSync(params.itemUuid);
    if (!item) {
      return this._reject(
        {
          ok: false,
          error: `No item found for "${params.itemUuid}".`,
          next: 'Check the uuid, or use document_list to find the item.',
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
          error: `"${item.name}" was not built by this module, so there is nothing to confirm.`,
        },
        'Not a tracked ability',
        'NOT_TRACKED'
      );
    }

    if (state.status === 'confirmed') {
      // Idempotent: confirming twice is a no-op rather than an error, because the
      // agent may reasonably lose track across a long conversation.
      return {
        content: JSON.stringify(
          {
            ok: true,
            alreadyConfirmed: true,
            itemUuid: item.uuid,
            itemName: item.name,
            confirmedAt: state.confirmedAt,
            runCount: (state.runs ?? []).length,
            next: 'This ability was already confirmed. Nothing changed.',
          },
          null,
          2
        ),
        display: `**Already confirmed:** ${item.name}`,
      };
    }

    const runCount = (state.runs ?? []).length;
    await clearNeedsTesting(item, { keepRuns: !params.discardRuns, summary: params.summary });

    return {
      content: JSON.stringify(
        {
          ok: true,
          itemUuid: item.uuid,
          itemName: item.name,
          status: 'confirmed',
          runsKept: !params.discardRuns ? runCount : 0,
          next:
            'Tell the user recording has stopped and the debug output is gone. If they need to change the ability, rebuild it with build_ability and it will be marked for testing again.',
        },
        null,
        2
      ),
      display: `**Confirmed:** ${item.name} — recording stopped`,
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
