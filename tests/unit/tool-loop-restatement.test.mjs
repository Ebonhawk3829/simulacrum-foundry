import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRestatement } from '../../scripts/core/tool-loop-handler.js';

/** A long answer, and the same answer with a few words changed. */
const ANSWER = [
  'Done and verified - the error is fixed.',
  'What the error meant: an ActiveEffect in a token delta had type auraeffects.aura, the',
  'Aura Effects subtype. That module is not installed, and dnd5e 6.0.6 accepts only base,',
  'condition and enchantment. Validation failed, so the effect was dropped on every load.',
  'What I did: deleted the token on Eastern Barricade. The bad effect existed only in that',
  'token delta, so removing the token removed both in one operation.',
].join(' ');

const RESTATED = [
  'Done and verified - the error is fixed.',
  'What the error meant: an ActiveEffect in a token delta had type auraeffects.aura, the',
  'Aura Effects subtype. That module is not installed, and dnd5e 6.0.6 accepts only base,',
  'condition and enchantment. Validation failed, so the effect was dropped on every load.',
  'What I did: deleted the token on Eastern Barricade. The bad effect existed only in that',
  'token delta, so removing the token removed both in a single operation.',
].join(' ');

const DIFFERENT = [
  'The save DC comes from the activity, not the item, so an effect that reads',
  'attributes.spell.dc will pick up the wrong number when the item is on a different actor.',
  'Separately, the recharge uses a d6 and the roll is made at the start of the turn rather',
  'than the end, which matters if the creature is removed from combat mid-round.',
].join(' ');

/** The same answer regrown at much greater length — the shape a reworded restatement takes. */
const EXPANDED = [
  ANSWER,
  'Separately, while I was in there I checked the other token deltas on the scene and they',
  'were clean, so this was the only one carrying the invalid subtype. Nothing else needs',
  'changing, and no other document references the effect by its id.',
].join(' ');

test('a reworded repeat of the same answer is a restatement', () => {
  assert.equal(isRestatement(RESTATED, ANSWER), true);
});

test('a longer restatement of the same answer is a restatement', () => {
  // The second copy is expanded, so set overlap falls well below the direct threshold while
  // containment stays high — the exact case a plain overlap check missed.
  assert.equal(isRestatement(EXPANDED, ANSWER), true);
  assert.equal(isRestatement(ANSWER, EXPANDED), true);
});

test('the identical answer is a restatement', () => {
  assert.equal(isRestatement(ANSWER, ANSWER), true);
});

test('a genuinely different answer is not a restatement', () => {
  assert.equal(isRestatement(DIFFERENT, ANSWER), false);
});

test('short replies are never treated as restatements', () => {
  // Below the token floor: overlap is meaningless and a real second answer must not be lost.
  assert.equal(isRestatement('Done.', 'Done - all set.'), false);
  assert.equal(isRestatement('Still working on it.', 'Working on it still.'), false);
});

test('empty or missing content is never a restatement', () => {
  assert.equal(isRestatement('', ANSWER), false);
  assert.equal(isRestatement(undefined, ANSWER), false);
  assert.equal(isRestatement(ANSWER, undefined), false);
});
