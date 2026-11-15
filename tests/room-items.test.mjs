import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition } from '../lib/game.mjs';
import { ROOM_ITEMS } from '../lib/progression.mjs';
const T = Date.parse('2026-10-28T08:00:00Z');
const request = (type, extra = {}, at = T) => ({ type, ...extra, id: randomUUID(), sentAt: at });
function pug(biscuits = 200) { const s = createState(T); s.name = '모찌'; s.progress.biscuits = biscuits; return s; }
test('legacy saves retain biscuits and clothes while gaining an empty room inventory', () => {
  const s = pug(); s.progress.owned = ['mint']; delete s.progress.ownedItems; delete s.progress.placedItems;
  const next = transition(s, { type: 'refresh' }, T).state;
  assert.deepEqual(next.progress.ownedItems, []); assert.deepEqual(next.progress.placedItems, []);
  assert.equal(next.progress.biscuits, 200); assert.deepEqual(next.progress.owned, ['mint']);
});
test('all room purchases charge catalog prices, auto-place, and survive reload', () => {
  for (const item of ROOM_ITEMS) {
    const action = request('buy_item', { item: item.id, price: 0 });
    const bought = transition(pug(item.price), action, T).state;
    assert.equal(bought.progress.biscuits, 0);
    assert.deepEqual(bought.progress.ownedItems, [item.id]); assert.deepEqual(bought.progress.placedItems, [item.id]);
    const saved = transition(JSON.parse(JSON.stringify(bought)), { type: 'refresh' }, T + 1000).state;
    assert.deepEqual(saved.progress.placedItems, [item.id]);
    const replay = transition(saved, action, T + 2000).state;
    assert.equal(replay.progress.biscuits, 0); assert.deepEqual(replay.progress.ownedItems, [item.id]);
  }
});
test('invalid, unaffordable, duplicate and unowned item actions are rejected', () => {
  assert.throws(() => transition(pug(0), request('buy_item', { item: 'duck' }), T), /부족/);
  assert.throws(() => transition(pug(), request('buy_item', { item: '__proto__' }), T), /찾지/);
  assert.throws(() => transition(pug(), request('place_item', { item: 'duck', placed: true }), T), /아직/);
  const bought = transition(pug(), request('buy_item', { item: 'duck' }), T).state;
  assert.throws(() => transition(bought, request('buy_item', { item: 'duck' }, T + 1000), T + 1000), /이미/);
  assert.throws(() => transition(bought, request('place_item', { item: 'duck', placed: 'yes' }, T + 1000), T + 1000), /선택/);
});
test('putting away and placing during focus preserves ownership and reward rate', () => {
  let s = transition(pug(), request('buy_item', { item: 'rope' }), T).state;
  s = transition(s, request('start_focus', {}, T + 1000), T + 1000).state;
  s = transition(s, request('place_item', { item: 'rope', placed: false }, T + 2000), T + 2000).state;
  assert.deepEqual(s.progress.placedItems, []); assert.deepEqual(s.progress.ownedItems, ['rope']);
  s = transition(s, request('place_item', { item: 'rope', placed: true }, T + 3000), T + 3000).state;
  s = transition(s, { type: 'refresh' }, T + 301000).state;
  assert.deepEqual(s.progress.placedItems, ['rope']); assert.ok([1, 2].includes(s.progress.pending));
  assert.equal(s.progress.biscuits, 140);
});
