import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition } from '../lib/game.mjs';
import { transact } from '../lib/store.mjs';

test('upgrading an established save preserves every existing field and its storage identity', async () => {
  const now = Date.parse('2026-11-14T03:00:00Z');
  const legacy = createState(now);
  Object.assign(legacy, { name: '오래된 친구', affection: 87, energy: 63, leashColor: 'blue', tricks: ['down', 'paw'], createdAt: now - 86400000 * 40 });
  Object.assign(legacy.progress, { biscuits: 527, pending: 9, owned: ['peach', 'mint', 'rocker'], equipped: 'rocker', ownedItems: ['shelf', 'speaker', 'duck'], placedItems: ['shelf', 'speaker'], claimed: ['first-care', 'first-walk'], dailyClaimed: ['daily-care'], totals: { feed: 22, pet: 68, practice: 19, walkSeconds: 1550, focusSeconds: 3700 } });
  legacy.exploration.found = { bone: { count: 3, firstAt: now - 500000, lastAt: now - 10000 } };
  legacy.logs = [{ message: '함께 모은 추억', at: now - 10000 }];
  delete legacy.study; delete legacy.progress.ownedHats; delete legacy.progress.hat;
  const snapshot = structuredClone(legacy);
  const key = 'existing-player-key';
  const store = {
    row: { state: legacy, revision: 154 },
    async read(actual) { assert.equal(actual, key); return structuredClone(this.row); },
    async create() { assert.fail('An existing save must never be recreated'); },
    async compareAndSwap(actual, revision, state) {
      assert.equal(actual, key); assert.equal(revision, this.row.revision);
      this.row = { state, revision: revision + 1 }; return true;
    },
  };
  const result = await transact(store, key, { type: 'refresh' }, () => now);
  assert.deepEqual(legacy, snapshot);
  const withoutNewFields = structuredClone(result.state);
  delete withoutNewFields.study; delete withoutNewFields.progress.ownedHats; delete withoutNewFields.progress.hat;
  assert.deepEqual(withoutNewFields, snapshot);
  assert.equal(store.row.revision, 155);
  assert.equal(result.state.study.knowledge, 0);
  assert.deepEqual(result.state.study.words, []);
  assert.deepEqual(transition(result.state, { type: 'refresh' }, now).state, result.state);
});
