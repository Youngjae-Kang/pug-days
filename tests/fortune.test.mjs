import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFortune } from '../lib/fortune.mjs';
import { createState, dayNumber, publicState } from '../lib/game.mjs';

test('fortune is fixed within a Korean calendar day and changes at midnight', () => {
  const morning = Date.parse('2026-10-27T00:00:00+09:00');
  const evening = Date.parse('2026-10-27T23:59:59+09:00');
  const midnight = evening + 1000;
  assert.equal(dailyFortune(dayNumber(morning)), dailyFortune(dayNumber(evening)));
  assert.notEqual(dailyFortune(dayNumber(evening)), dailyFortune(dayNumber(midnight)));
  assert.equal(publicState(createState(morning), morning).fortune, dailyFortune(dayNumber(morning)));
});
test('fortune rotation has 31 distinct days, including the cycle boundary', () => {
  const messages = Array.from({ length: 31 }, (_, day) => dailyFortune(day));
  assert.equal(new Set(messages).size, 31);
  assert.notEqual(dailyFortune(30), dailyFortune(31));
  assert.equal(dailyFortune(0), dailyFortune(31));
});
