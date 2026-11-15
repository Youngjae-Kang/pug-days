import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { DISCOVERIES, roll } from '../lib/exploration.mjs';
import { transact } from '../lib/store.mjs';
const T = Date.parse('2026-10-28T03:00:00Z');
const refresh = (s, at) => transition(s, { type: 'refresh' }, at).state;
const act = (s, type, at = T, extra = {}) => transition(s, { type, id: randomUUID(), sentAt: at, ...extra }, at).state;
function seedFor(predicate) { for (let i = 0; i < 10000; i++) if (predicate(String(i))) return String(i); throw new Error('fixture seed not found'); }
const itemSeed = seedFor(s => roll(s, 'encounter:1') < .35 && Math.floor(roll(s, 'find:1') * 7) === 0);
const coinsSeed = seedFor(s => roll(s, 'encounter:1') < .35 && Math.floor(roll(s, 'find:1') * 7) === 6);
function pug(seed = itemSeed) { const s = createState(T); s.name = '모찌'; s.leashColor = 'mint'; s.exploration.seed = seed; return s; }

test('walk discovery starts at 30 seconds, persists and cannot be rerolled by refresh', () => {
  const start = act(pug(), 'walk');
  assert.deepEqual(refresh(start, T + 29999).exploration.found, {});
  const found = refresh(start, T + 30000);
  assert.equal(found.exploration.found.hedgehog.count, 1);
  assert.equal(found.exploration.lastEvent.until, T + 42000);
  assert.deepEqual(refresh(JSON.parse(JSON.stringify(found)), T + 31000).exploration, found.exploration);
});
test('bulk elapsed time and frequent polling grant identical walk finds and money', () => {
  const start = act(pug(), 'walk'); const bulk = refresh(start, T + 480000);
  let frequent = start;
  for (let i = 1000; i <= 480000; i += 1000) frequent = refresh(frequent, T + i);
  assert.deepEqual(frequent.exploration, bulk.exploration);
  assert.equal(frequent.progress.biscuits, bulk.progress.biscuits);
});
test('walk boundaries carry across outings and old walks are not rewarded retroactively', () => {
  let s = act(act(pug(), 'walk'), 'end_walk', T + 20000);
  s = act(s, 'walk', T + 21000); s = refresh(s, T + 31000);
  assert.equal(s.exploration.found.hedgehog.count, 1);
  const old = pug(); delete old.exploration; old.progress.totals.walkSeconds = 600;
  const upgraded = refresh(old, T); assert.equal(upgraded.exploration.checks, 20);
  assert.deepEqual(upgraded.exploration.found, {});
});
test('exhaustion limits events to actual walking time', () => {
  const p = pug(); p.energy = 7;
  const s = refresh(act(p, 'walk'), T + 3600000);
  assert.equal(s.activity, null); assert.equal(s.exploration.checks, 1);
  assert.equal(s.progress.totals.walkSeconds, 35); assert.equal(s.exploration.found.hedgehog.count, 1);
});
test('biscuits go to wallet, collectibles cannot be purchased, friends do not grant items', () => {
  const coins = refresh(act(pug(coinsSeed), 'walk'), T + 30000);
  assert.ok(coins.progress.biscuits >= 1 && coins.progress.biscuits <= 3);
  assert.deepEqual(coins.exploration.found, {});
  const friendSeed = seedFor(s => roll(s, 'encounter:1') >= .35 && roll(s, 'encounter:1') < .60);
  const friend = refresh(act(pug(friendSeed), 'walk'), T + 30000);
  assert.equal(friend.exploration.lastEvent.kind, 'friend'); assert.deepEqual(friend.exploration.found, {});
  for (const item of DISCOVERIES) {
    const p = pug(); p.progress.biscuits = 10000;
    assert.throws(() => act(p, 'buy_item', T, { item: item.id }), /찾지/);
    assert.throws(() => act(p, 'buy_outfit', T, { outfit: item.id }));
  }
});
test('simultaneous refreshes pay a find once', async () => {
  const start = act(pug(coinsSeed), 'walk');
  const expected = refresh(start, T + 30000).progress.biscuits;
  const store = { row: { state: start, revision: 0 },
    async read() { await Promise.resolve(); return structuredClone(this.row); },
    async compareAndSwap(key, revision, state) { if (revision !== this.row.revision) return false; this.row = { state, revision: revision + 1 }; return true; } };
  await Promise.all(Array.from({ length: 5 }, () => transact(store, 'pug', { type: 'refresh' }, () => T + 30000)));
  assert.equal(store.row.state.progress.biscuits, expected);
});
test('every five-minute focus reward is 1–2, unaffected by polling, and random seeds stay private', () => {
  const start = act(pug(), 'start_focus');
  let s = start, previous = 0;
  for (let i = 1; i <= 48; i++) {
    s = refresh(s, T + i * 300000);
    assert.ok([1, 2].includes(s.progress.pending - previous)); previous = s.progress.pending;
  }
  assert.equal(s.progress.pending, refresh(start, T + 14400000).progress.pending);
  const safe = publicState(start, T);
  assert.equal(safe.activity.rewardSeed, undefined); assert.equal(safe.exploration.seed, undefined);
  assert.ok(start.activity.rewardSeed); assert.ok(start.exploration.seed);
});
