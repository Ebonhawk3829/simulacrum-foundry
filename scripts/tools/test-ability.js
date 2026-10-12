/**
 * Test Ability
 *
 * Runs a built ability against the token the user has targeted, twice — once
 * forced to fail and once forced to succeed — and reports WHAT HAPPENED.
 *
 * IT DOES NOT RETURN A VERDICT
 *
 * An earlier version scored the run against a fixed checklist of claim types
 * and returned pass/fail per claim. That was wrong in a way worth recording: the
 * evaluators were a closed set, so a check the caller invented was not merely
 * unsupported, it was reported as UNTESTED. The harness penalised thinking it had
 * not anticipated. An agent reading this data can judge it better than a switch
 * statement can, so the tool's job is to collect trustworthy evidence and stop.
 *
 * WHAT MAKES THE EVIDENCE TRUSTWORTHY
 *
 * 1. Outcomes are FORCED, not rolled. A test that depends on dice reports false
 *    failures roughly half the time. But forcing can silently FAIL to apply — a
 *    flag that was not read, an immunity, a workflow that aborted early — and
 *    then "no effect landed" looks identical to "the ability is broken". So the
 *    report states whether the forcing was actually observed in the run. That is
 *    a fact about the test, not a judgement about the ability.
 *
 * 2. The target is whatever the user has TARGETED, never a token created for the
 *    purpose. A dummy would quietly change what the test proves. When nothing is
 *    targeted the tool says so and stops — a normal pause, not an error.
 *
 * 3. Teardown is unconditional. A failed test must not leave the world altered.
 *    If teardown itself fails that is reported, because a test that leaves side
 *    effects is worse than no test.
 */

import { BaseTool } from './base-tool.js';
import {
  snapshotActorState,
  diffActorState,
  forceRollFlags,
} from '../core/test-observations.js';
import { resolveTargetedActor } from '../core/automation-spec.js';

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
      'Run a built ability against the token the user has targeted, twice — with the outcome forced to fail, then forced to succeed — and report what actually happened: rolls and their results, effects applied, conditions gained, damage, and whether the forcing was observed. It returns EVIDENCE, not a verdict; compare it against what you intended and decide for yourself. Restores everything it changed afterwards. If no token is targeted it asks the user to target one; that is a normal pause, not an error.'
    );
    this.requiresConfirmation = true;
    this.settleMs = DEFAULT_SETTLE_MS;
    this.schema = {
      type: 'object',
      properties: {
        itemUuid: {
          type: 'string',
          description:
            'The itemUuid returned by build_ability. Identifies the ability to run.',
        },
        expect: {
          type: 'object',
          description:
            'Optional. What you expect to happen, so the report can state plainly where the run differed. Free-form: keys are your own, values are what you expect (for example { "target gains restrained": true, "damage is dealt": 14 }). Nothing is validated against a fixed set; this is recorded beside the evidence for your own comparison.',
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

    const observed = await this._runBothOutcomes(item, target.actor);
    return this._report({ item, target, observed, expect: params.expect });
  }

  /**
   * Run the ability twice and gather what happened.
   *
   * The target's state is snapshotted before and after each run, and restored
   * between them, so the second run is not affected by the first.
   * @param {object} item
   * @param {object} targetActor
   * @returns {Promise<object>} The evidence
   */
  async _runBothOutcomes(item, targetActor) {
    const observed = {
      itemExists: true,
      activity: this._readActivity(item),
      uses: item.system?.uses ? { max: item.system.uses.max } : undefined,
      overTime: this._readOverTime(item),
      fail: null,
      success: null,
      teardownFailed: null,
    };

    const pristine = snapshotActorState(targetActor);

    // Each outcome is attempted independently and its error is captured rather
    // than thrown. A test tool must never crash the caller: a run that blew up is
    // itself the most useful thing to report, and losing the other run's
    // evidence because the first one threw would waste the pass.
    for (const outcome of ['fail', 'success']) {
      try {
        observed[outcome] = await this._runOne(item, targetActor, outcome);
      } catch (err) {
        this.logger.warn(`The ${outcome} run of the test failed: ${err.message}`);
        observed[outcome] = { forced: outcome, runError: err.message };
      }

      // Restore between runs so the second is unaffected by the first. A failed
      // restore is recorded but does not abandon the other outcome, because
      // knowing one result beats knowing none.
      try {
        await this._restore(targetActor, pristine);
      } catch (err) {
        this.logger.error('Failed to restore the target after the test', err);
        observed.teardownFailed = err.message;
      }
    }

    return observed;
  }

  /**
   * Run the ability once with the outcome forced, and report what happened.
   *
   * `forcingApplied` is the load-bearing field. If the forcing was not observed
   * then the run was effectively a normal roll, and "nothing happened" cannot be
   * read as a defect. Reporting it stops a silent no-op masquerading as a pass.
   *
   * Restoration is the caller's job, so one failure cannot abandon the other run.
   * @param {object} item
   * @param {object} targetActor
   * @param {'fail'|'success'} outcome
   * @returns {Promise<object>}
   */
  async _runOne(item, targetActor, outcome) {
    // Snapshot BEFORE the forcing is applied, so the diff covers everything the
    // run does. Taking it afterwards would record anything the setup itself
    // triggered as pre-existing and hide a real effect.
    const before = snapshotActorState(targetActor);

    await this._applyTargetFlags(targetActor, outcome);
    const forcingApplied = this._readForcingState(targetActor, outcome);

    const useResult = await this._useItem(item, targetActor);
    const after = snapshotActorState(targetActor);

    return {
      forced: outcome,
      forcingApplied,
      ...diffActorState(before, after, targetActor),
      ...useResult,
    };
  }

  /**
   * Confirm the forcing flags are actually readable on the actor.
   *
   * Read back rather than assumed: `fail.all` and `success.all` are how midi
   * decides, so their presence is the closest thing to proof that the run was
   * biased. A missing flag means the result was a real roll.
   * @param {object} actor
   * @param {'fail'|'success'} outcome
   * @returns {boolean}
   */
  _readForcingState(actor, outcome) {
    const flags = actor?.flags?.['midi-qol'] ?? {};
    // The flag names carry the scope: `fail.all` is the property midi reads for
    // "fail every action". Checking for a bare `fail` would always read false.
    return outcome === 'fail'
      ? flags['fail.all'] !== undefined
      : flags['success.all'] !== undefined;
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
          { ok: false, error: 'itemUuid is required; use the value returned by build_ability.' },
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
            next: 'Call build_ability again to rebuild it.',
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
  }

  /**
   * Assemble the report the agent reads.
   *
   * Facts, not findings. The tool states what happened and flags the two ways a
   * run can be uninformative — forcing that did not apply, and a use that
   * errored — because those change what the evidence is worth. It does not say
   * whether the ability is correct; that comparison belongs to the caller, which
   * knows what it intended and can reason about nuances this file cannot.
   * @param {object} run - { item, target, observed, expect }
   * @returns {object}
   */
  _report({ item, target, observed, expect }) {
    const content = {
      itemUuid: item.uuid,
      itemName: item.name,
      target: target.actor.name,
      targetUuid: target.actor.uuid,
      // The authored shape, so the report is self-contained even though the
      // caller has the item.
      item: this._readActivity(item),
      effectsOnItem: (item.effects?.contents ?? []).map(e => ({
        name: e.name,
        changes: e.system?.changes ?? [],
        flags: e.flags ?? {},
      })),
      runs: {
        forcedFail: observed.fail,
        forcedSuccess: observed.success,
      },
      expect: expect ?? undefined,
    };

    // A run whose forcing did not apply was a real roll, so its outcome says
    // nothing about the automation. Stated as a caveat on the evidence rather
    // than as a verdict, because the caller decides what it means.
    const unforced = [];
    for (const [label, run] of [
      ['forcedFail', observed.fail],
      ['forcedSuccess', observed.success],
    ]) {
      if (run && run.forcingApplied === false) unforced.push(label);
    }
    if (unforced.length) {
      content.caveat = `The outcome was NOT forced for ${unforced.join(' and ')}, so those results are ordinary dice rolls. Re-run, or check that the target can be affected at all, before drawing conclusions.`;
    }
    if (observed.teardownFailed) {
      content.teardownFailed = observed.teardownFailed;
      content.caveat = `${content.caveat ? `${content.caveat} ` : ''}The target could NOT be fully restored after the test; check it manually.`;
    }

    content.next =
      'Compare this evidence against what you intended and decide whether it behaves correctly. Ask the user what they observed as well; their perception and the log together are more informative than either alone.';

    const forcedFail = observed.fail;
    const display = forcedFail?.useFailed
      ? `**Test: ${item.name}** on ${target.actor.name} — the use errored`
      : `**Test: ${item.name}** on ${target.actor.name} — ran twice, evidence returned`;

    return { content: JSON.stringify(content, null, 2), display };
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
