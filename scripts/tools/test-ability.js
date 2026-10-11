/**
 * Test Ability
 *
 * Runs a built ability against the token the user has targeted, twice — once
 * with the save forced to fail and once forced to succeed — and reports one line
 * per claim from the spec.
 *
 * Two design choices matter more than the mechanics:
 *
 * 1. Outcomes are FORCED, not rolled. midi-qol's `flags.midi-qol.fail.all` and
 *    `success.all` make the result deterministic. A test that depends on dice
 *    reports false failures roughly half the time, and a report the agent cannot
 *    trust is worse than no report.
 *
 * 2. The target is whatever the user has TARGETED, never a token created for the
 *    purpose. The user decides what the ability is tested against; a dummy would
 *    quietly change what the test proves. When nothing is targeted the tool says
 *    so and stops — a normal pause, not an error.
 *
 * Teardown is unconditional. The forcing flags and any effect/HP change the test
 * caused are restored in a finally block, so a failed test cannot leave the world
 * altered.
 */

import { BaseTool } from './base-tool.js';
import {
  buildSaveAbilityClaims,
  evaluateClaim,
  summariseResults,
  snapshotActorState,
  diffActorState,
  forceRollFlags,
} from '../core/ability-claims.js';
import { resolveTargetedActor } from '../core/automation-spec.js';
import { peekSpec } from '../core/spec-store.js';

/**
 * How long to wait for a workflow the ability may trigger before reading results.
 * Configurable so tests need not wait; the default is tuned for a real world
 * where the chat card and effect application are asynchronous.
 */
const DEFAULT_SETTLE_MS = 500;

/**
 * The DC in play. `dc.value` is prepared data; `dc.formula` is what a fixed DC
 * was written as. The formula is only meaningful when it parses as a number,
 * because it can hold an expression like "@abilities.cha.mod + 8".
 * @param {object} activity
 * @returns {number|undefined}
 */
function _readDc(activity) {
  const parsed = Number(activity?.save?.dc?.formula);
  if (Number.isFinite(parsed)) return parsed;
  const value = activity?.save?.dc?.value;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

export class TestAbilityTool extends BaseTool {
  constructor() {
    super(
      'test_ability',
      'Run a built ability against the token the user has targeted and report whether it behaves as described. Forces the save to fail and then to succeed, so the result never depends on dice, and restores everything it changed afterwards. Call this after build_save_ability and report the checklist it returns. If no token is targeted it asks the user to target one; that is a normal pause, not an error.'
    );
    this.requiresConfirmation = true;
    this.settleMs = DEFAULT_SETTLE_MS;
    this.schema = {
      type: 'object',
      properties: {
        itemUuid: {
          type: 'string',
          description:
            'The itemUuid returned by build_save_ability. Identifies the ability to run.',
        },
        spec: {
          type: 'object',
          description:
            'The spec that was built, used to derive the claims to check. Optional: when the build used a previewToken the spec is recovered automatically.',
        },
        previewToken: {
          type: 'string',
          description:
            'The previewToken the build used, if any. Lets the spec be recovered so the claims match what the user confirmed.',
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
      type: 'test',
      title: 'Test ability',
      details:
        'Runs the ability against your targeted token twice with forced outcomes, then restores the target. Nothing is left changed.',
    };
  }

  /** @param {object} params */
  async execute(params) {
    if (!game.user?.isGM) {
      return this._reject('Only a GM can run an ability test.', 'GM required', 'PERMISSION_DENIED');
    }

    const itemResult = this._resolveItem(params.itemUuid);
    if (itemResult.error) return itemResult.error;
    const { item } = itemResult;

    const target = resolveTargetedActor();
    if (!target.ok) {
      return this._reject(
        {
          ok: false,
          error: target.guidance,
          waitingFor: 'targeted-token',
          hint: 'Call test_ability again once the user confirms a token is targeted.',
        },
        'Waiting for a targeted token',
        'NO_TARGET'
      );
    }

    const spec = this._resolveSpec(params, item);
    const claims = buildSaveAbilityClaims(spec);

    const observed = await this._runClaimObservations(item, target.actor);

    const results = claims.map(claim => evaluateClaim(claim, observed));
    const summary = summariseResults(results);

    return this._report({ item, target, results, summary, observed });
  }

  /**
   * Run the ability twice and gather what the claims need.
   *
   * The target's state is snapshotted before and after each run, and restored
   * between them, so the second run is not affected by the first.
   * @param {object} item
   * @param {object} targetActor
   * @returns {Promise<object>} Observations for evaluateClaim
   */
  async _runClaimObservations(item, targetActor) {
    const observed = {
      itemExists: true,
      activity: this._readActivity(item),
      uses: item.system?.uses ? { max: item.system.uses.max } : undefined,
      overTime: this._readOverTime(item),
      fail: null,
      success: null,
    };

    const pristine = snapshotActorState(targetActor);

    try {
      // Run one: forced failure.
      await this._applyTargetFlags(targetActor, 'fail');
      const failBefore = snapshotActorState(targetActor);
      const failOutcome = await this._useItem(item, targetActor);
      const failAfter = snapshotActorState(targetActor);
      observed.fail = { ...diffActorState(failBefore, failAfter), ...failOutcome };
      await this._restore(targetActor, pristine);

      // Run two: forced success.
      await this._applyTargetFlags(targetActor, 'success');
      const successBefore = snapshotActorState(targetActor);
      const successOutcome = await this._useItem(item, targetActor);
      const successAfter = snapshotActorState(targetActor);
      observed.success = { ...diffActorState(successBefore, successAfter), ...successOutcome };
      await this._restore(targetActor, pristine);
    } finally {
      // Unconditional: a failed test must not leave the world altered.
      await this._restore(targetActor, pristine);
    }

    return observed;
  }

  /**
   * Read the built activity into the shape the claim evaluators expect.
   * @param {object} item
   * @returns {object|undefined}
   */
  _readActivity(item) {
    const activity = item.system?.activities?.contents?.[0];
    if (!activity) return undefined;

    return {
      type: activity.type,
      saveAbility: Array.from(activity.save?.ability ?? []),
      dc: _readDc(activity),
      range: {
        value: activity.range?.value,
        units: activity.range?.units,
      },
    };
  }

  /** Read the OverTime flag off the first applied effect, if present. */
  _readOverTime(item) {
    const effect = item.effects?.contents?.[0];
    return effect?.flags?.['midi-qol']?.OverTime;
  }

  /** Resolve the item to test from its uuid. */
  _resolveItem(uuid) {
    if (!uuid || typeof uuid !== 'string') {
      return {
        error: this._reject(
          { ok: false, error: 'itemUuid is required; use the value returned by build_save_ability.' },
          'Missing itemUuid',
          'VALIDATION_ERROR'
        ),
      };
    }

    const item = foundry.utils.fromUuidSync(uuid);
    if (!item) {
      return {
        error: this._reject(
          {
            ok: false,
            error: `No item found for "${uuid}". It may have been deleted or rebuilt since the build step.`,
            next: 'Call build_save_ability again to rebuild it.',
          },
          'Item not found',
          'ITEM_NOT_FOUND'
        ),
      };
    }

    if (!item.system?.activities) {
      return {
        error: this._reject(
          { ok: false, error: `"${item.name}" is not an ability with activities.` },
          'Not an ability',
          'WRONG_DOCUMENT'
        ),
      };
    }

    return { item };
  }

  /**
   * Recover the spec the claims are derived from.
   *
   * A peek rather than a take: the same preview can be tested more than once
   * while the agent iterates, and the token is still needed by the builder.
   * @param {object} params
   * @param {object} item
   * @returns {object}
   */
  _resolveSpec(params, item) {
    if (params.spec && typeof params.spec === 'object') return params.spec;

    if (params.previewToken) {
      const entry = peekSpec(params.previewToken);
      if (entry?.spec) return entry.spec;
    }

    // Fall back to what the item itself records, so a test still produces a
    // meaningful checklist even without the original spec.
    const activity = item.system.activities.contents[0];
    const effect = item.effects.contents[0];
    return {
      name: item.name,
      identifier: item.system?.identifier,
      'save.ability': activity?.save?.ability?.first?.() ?? undefined,
      'save.dc': _readDc(activity),
      'range.value': activity?.range?.value,
      'range.units': activity?.range?.units,
      'uses.max': item.system?.uses?.max,
      condition: effect?.system?.changes?.find(c => c.key === 'macro.StatusEffect')?.value,
      repeatSave: Boolean(effect?.flags?.['midi-qol']?.OverTime),
    };
  }

  /** Apply the forcing flags to the target for one run. */
  async _applyTargetFlags(targetActor, outcome) {
    await targetActor.update(forceRollFlags(outcome));
  }

  /**
   * Use the item against the target and wait for the workflow to settle.
   * @param {object} item
   * @param {object} targetActor
   * @returns {Promise<object>} Anything the use itself reports
   */
  async _useItem(item, targetActor) {
    const targetToken = targetActor.getActiveTokens?.()[0] ?? null;

    const workflowUtils = globalThis.CAT?.api?.workflowUtils;
    const MidiQOL = globalThis.MidiQOL;

    try {
      if (workflowUtils?.syntheticItemRoll) {
        // Prefers CAT's helper: no dialog, damage rolled, no consumption.
        await workflowUtils.syntheticItemRoll(item, targetToken ? [targetToken] : [], {
          consumeUsage: false,
          consumeResources: false,
          spellSlot: false,
        });
      } else if (MidiQOL?.completeItemUse) {
        await MidiQOL.completeItemUse(item, { consumeUsage: false }, {}, {});
      } else {
        await item.use({ consume: false }, { configureDialog: false });
      }
    } catch (err) {
      this.logger.warn(`Ability use failed during test: ${err.message}`);
      return { useFailed: err.message };
    }

    await new Promise(resolve => setTimeout(resolve, this.settleMs));
    return {};
  }

  /**
   * Put the target back the way it was.
   * @param {object} actor
   * @param {object} pristine - snapshotActorState output
   */
  async _restore(actor, pristine) {
    try {
      const updates = {};

      // Clear the forcing flags.
      updates['flags.midi-qol.-=fail'] = null;
      updates['flags.midi-qol.-=success'] = null;

      if (typeof pristine.hp === 'number') {
        updates['system.attributes.hp.value'] = pristine.hp;
      }
      if (typeof pristine.exhaustion === 'number') {
        updates['system.attributes.exhaustion'] = pristine.exhaustion;
      }

      await actor.update(updates);

      // Delete any effects the test applied. Conditions are separate documents,
      // so they need their own cleanup.
      const current = (actor.effects?.contents ?? []).map(e => e.id);
      const added = current.filter(id => !pristine.effectIds.includes(id));
      if (added.length) await actor.deleteEmbeddedDocuments('ActiveEffect', added);

      for (const status of Array.from(actor.statuses ?? [])) {
        if (!pristine.statuses.includes(status)) {
          await actor.toggleStatusEffect(status, { active: false });
        }
      }
    } catch (err) {
      // Restoration failing is worth surfacing, but it must not mask the report.
      this.logger.error('Failed to restore the target after the test', err);
    }
  }

  /**
   * Assemble the report the agent reads.
   * @param {object} run - { item, target, results, summary, observed }
   * @returns {object}
   */
  _report({ item, target, results, summary, observed }) {
    const failures = results.filter(r => r.pass === false);

    const content = {
      ok: summary.failed === 0,
      itemUuid: item.uuid,
      itemName: item.name,
      target: target.actor.name,
      targetUuid: target.actor.uuid,
      verdict: summary.verdict,
      summary: {
        passed: summary.passed,
        failed: summary.failed,
        untested: summary.untested,
        total: summary.total,
      },
      checklist: results,
      observed: {
        failingSave: observed.fail,
        succeedingSave: observed.success,
      },
    };

    if (failures.length) {
      content.next =
        'Fix the spec fields behind the failing claims and call build_save_ability again with the corrected spec, then re-test. If the same claim fails twice, stop and report it to the user instead of rebuilding a third time.';
      content.failingClaims = failures.map(f => ({
        claim: f.claim,
        expected: f.expected,
        actual: f.actual,
      }));
    } else if (summary.untested > 0) {
      content.next =
        'All testable claims passed. Tell the user which claims could not be tested and why, rather than reporting full success.';
    } else {
      content.next = 'Report success to the user, then ask if they want anything adjusted.';
    }

    return {
      content: JSON.stringify(content, null, 2),
      display: `**Test: ${item.name}** on ${target.actor.name} — ${summary.verdict}`,
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
