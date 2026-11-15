import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, rollDay, chance, publicState, dayNumber } from '../lib/game.mjs';
import { transact, SupabaseStore } from '../lib/store.mjs';
const T = Date.parse('2026-10-24T03:00:00Z');
function action(type, now = T, extra = {}) { return { type, id: randomUUID(), sentAt: now, ...extra }; }
// Existing, already cared-for pug fixture for progression and neglect cases.
function named() { const s = createState(T - 10000); s.name = '모찌'; s.affection = 20; s.leashColor = 'mint'; return s; }
test('new pug starts unnamed, ordinary affection 0 and 15% training chance', () => {
  const s = createState(T); assert.equal(s.name, null); assert.equal(s.affection, 0); assert.equal(chance(s), .15); assert.equal(s.cheat, false);
});
test('name stored and normalized; input not injected into HTML', () => {
  assert.equal(transition(createState(T), action('name', T, { name: '  두부  ' }), T).state.name, '두부');
  for (const name of ['', '  ', '<script>', 'a'.repeat(13), 'x\n']) {
    if (name === 'x\n') continue; // leading/trailing whitespace is intentionally trimmed
    assert.throws(() => transition(createState(T), action('name', T, { name }), T));
  }
});
test('cheat keyword restarts at name screen and persists across next naming', () => {
  const r = transition(createState(T), action('name', T, { name: '똥퍼그' }), T);
  assert.equal(r.state.name, null); assert.equal(r.state.cheat, true); assert.equal(r.state.affection, 100);
  const n = transition(r.state, action('name', T + 1000, { name: '감자' }), T + 1000);
  assert.equal(n.state.name, '감자'); assert.equal(chance(n.state), 1);
});
test('feed is limited to 3 on the server', () => {
  let s = named();
  for (let i = 0; i < 3; i++) s = transition(s, action('feed', T + i * 1000), T + i * 1000).state;
  assert.equal(s.daily.feed, 3); assert.equal(s.affection, 35);
  assert.throws(() => transition(s, action('feed', T + 4000), T + 4000), /세 번/);
});
test('walk and all pet variants have shared daily reward caps', () => {
  let s = named();
  for (let i = 0; i < 4; i++) {
    s = transition(s, action('walk', T + i * 2000), T + i * 2000).state;
    s = transition(s, action('end_walk', T + i * 2000 + 1000), T + i * 2000 + 1000).state;
  }
  assert.equal(s.affection, 36);
  for (let i = 4; i < 10; i++) s = transition(s, action(['pet', 'butt', 'belly'][i % 3], T + 10000 + i * 1000), T + 10000 + i * 1000).state;
  assert.equal(s.daily.pet, 6); assert.equal(s.affection, 51);
});
test('first walk requires a color before consuming rewards or a walk', () => {
  const s = named(); s.leashColor = null;
  assert.throws(() => transition(s, action('walk'), T), /목줄 색/);
  assert.equal(s.daily.walk, 0); assert.equal(s.affection, 20);
  const first = transition(s, action('walk', T, { leashColor: 'blue' }), T);
  assert.equal(first.state.leashColor, 'blue'); assert.equal(first.state.daily.walk, 1); assert.equal(first.state.affection, 28);
  assert.equal(publicState(first.state, T).leashColor, 'blue');
  const home = transition(first.state, action('end_walk', T + 500), T + 500);
  const next = transition(home.state, action('walk', T + 1000), T + 1000);
  assert.equal(next.state.leashColor, 'blue'); assert.equal(next.state.daily.walk, 2);
});
test('all five allowed leash colors save; arbitrary CSS and unknown colors fail', () => {
  for (const color of ['coral', 'mint', 'blue', 'lilac', 'yellow']) {
    assert.equal(transition(named(), action('walk', T, { leashColor: color }), T).state.leashColor, color);
  }
  for (const color of ['red', '#ffffff', 'url(https://example.com)', null, {}]) {
    assert.throws(() => transition(named(), action('walk', T, { leashColor: color }), T), /목줄 색/);
  }
});
test('old saves gain an empty leash choice without resetting progress', () => {
  const s = named(); delete s.leashColor; s.affection = 67; s.daily.walk = 2;
  const refreshed = transition(s, { type: 'refresh' }, T).state;
  assert.equal(refreshed.leashColor, null); assert.equal(refreshed.affection, 67); assert.equal(refreshed.daily.walk, 2);
});
test('replaying a walk cannot spend another reward or change saved color', () => {
  const a = action('walk', T, { leashColor: 'lilac' });
  const first = transition(named(), a, T).state;
  const again = transition(first, { ...a, leashColor: 'blue' }, T + 1000).state;
  assert.equal(again.leashColor, 'lilac'); assert.equal(again.daily.walk, 1); assert.equal(again.affection, 28);
});
test('muzzle gives an animation but does not count as daily pet care', () => {
  const r = transition(named(), action('muzzle'), T);
  assert.equal(r.animation, 'squish'); assert.equal(r.state.affection, 20); assert.equal(r.state.daily.pet, 0);
});
test('affection clamped at 100', () => {
  const s = named(); s.affection = 99;
  assert.equal(transition(s, action('walk'), T).state.affection, 100);
});
test('failed training consumes attempt and cannot exceed 5', () => {
  let s = named();
  for (let i = 0; i < 5; i++) s = transition(s, action('train', T + i * 1000, { trick: 'down' }), T + i * 1000, () => .999).state;
  assert.equal(s.tricks.length, 0); assert.equal(s.daily.train, 5);
  assert.throws(() => transition(s, action('train', T + 6000, { trick: 'down' }), T + 6000), /다 했어요/);
});
test('success uses affection probability and learns a selected trick once', () => {
  const s = named(); assert.equal(chance(s), .31);
  const r = transition(s, action('train', T, { trick: 'paw' }), T, () => .30);
  assert.deepEqual(r.state.tricks, ['paw']);
  assert.throws(() => transition(r.state, action('train', T + 1000, { trick: 'paw' }), T + 1000), /이미 배운/);
  assert.equal(transition(r.state, action('perform', T + 1000, { trick: 'paw' }), T + 1000).state.daily.train, 1);
  assert.equal(transition(s, action('train', T, { trick: 'paw' }), T, () => .31).state.tricks.length, 0);
});
test('malicious trick and client state payload are rejected/ignored', () => {
  assert.throws(() => transition(named(), action('train', T, { trick: '__proto__' }), T));
  const r = transition(named(), action('feed', T, { cheat: true, affection: 100, tricks: ['paw'] }), T);
  assert.equal(r.state.cheat, false); assert.equal(r.state.affection, 25); assert.deepEqual(r.state.tricks, []);
});
test('KST midnight resets counters at 15:00 UTC', () => {
  const before = Date.parse('2026-10-24T14:59:59Z'), after = before + 1000;
  assert.equal(dayNumber(after), dayNumber(before) + 1);
  const s = named(); s.day = dayNumber(before); s.daily = { feed: 3, walk: 2, pet: 5, train: 5, muzzle: 3 };
  rollDay(s, before); assert.equal(s.daily.feed, 3);
  rollDay(s, after); assert.equal(s.daily.feed, 0); assert.equal(s.daily.train, 0); assert.equal(s.affection, 20);
});
test('missing care deducts 3 per category, only once', () => {
  const s = named(); s.daily.feed = 1; const next = T + 86400000;
  rollDay(s, next); assert.equal(s.affection, 14);
  rollDay(s, next); assert.equal(s.affection, 14);
});
test('unvisited full days deduct 9 each; long absence never goes below zero', () => {
  const s = named(); s.affection = 100; s.daily = { feed: 1, walk: 1, pet: 1, train: 0, muzzle: 0 };
  rollDay(s, T + 3 * 86400000); assert.equal(s.affection, 82);
  rollDay(s, T + 1000 * 86400000); assert.equal(s.affection, 0);
});
test('unnamed and cheat saves are exempt from neglect', () => {
  const s = createState(T); rollDay(s, T + 10 * 86400000); assert.equal(s.affection, 0);
  const c = createState(T, true); c.name = '치트'; rollDay(c, T + 10 * 86400000); assert.equal(c.affection, 100);
});
test('cheat bypasses both daily limits and learns all four tricks', () => {
  let s = createState(T, true); s.name = '치트'; s.daily.feed = 3; s.daily.train = 5;
  s = transition(s, action('feed'), T).state; assert.equal(s.daily.feed, 4);
  for (const [i, trick] of ['down', 'bang', 'stand', 'paw'].entries()) s = transition(s, action('train', T + (i + 1) * 1000, { trick }), T + (i + 1) * 1000, () => .999).state;
  assert.equal(s.tricks.length, 4); assert.equal(s.daily.train, 9);
});
test('same request id replay does not spend another attempt', () => {
  const a = action('feed'); const first = transition(named(), a, T);
  const second = transition(first.state, a, T + 1000);
  assert.equal(second.state.daily.feed, 1); assert.equal(second.message, first.message);
});
test('future timestamp cannot outlive dedupe receipts', () => {
  const a = action('feed', T + 10000);
  let s = transition(named(), a, T).state;
  s = transition(s, action('walk', T + 305000), T + 305000).state;
  assert.equal(transition(s, a, T + 306000).state.daily.feed, 1);
  assert.throws(() => transition(s, a, T + 311000), /만료/);
  assert.throws(() => transition(named(), action('feed', T + 11000), T), /만료/);
});
test('rate limiting and expired requests fail before mutation', () => {
  const s = transition(named(), action('feed'), T).state;
  assert.throws(() => transition(s, action('walk', T + 100), T + 100), /반응할 시간/);
  assert.throws(() => transition(s, action('walk', T - 300001), T), /만료/);
});
test('public state excludes internal dedupe receipts', () => {
  const s = publicState(named(), T); assert.equal(s.receipts, undefined); assert.equal(s.lastActionAt, undefined); assert.equal(s.date, '2026-10-24');
});
class MemoryStore {
  row = { state: named(), revision: 0 };
  async read() { await Promise.resolve(); return structuredClone(this.row); }
  async compareAndSwap(key, rev, state) { if (this.row.revision !== rev) return false; this.row = { state: structuredClone(state), revision: rev + 1 }; return true; }
}
test('concurrent writes cannot exceed daily feeding limit', async () => {
  const store = new MemoryStore(); let now = T;
  const responses = await Promise.allSettled(Array.from({ length: 8 }, () => transact(store, 'key', action('feed'), () => now += 500)));
  assert.equal(responses.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(store.row.state.daily.feed, 3); assert.equal(store.row.state.affection, 35);
});
test('concurrent same request is applied once', async () => {
  const store = new MemoryStore(), a = action('feed'); let now = T;
  await Promise.all([transact(store, 'key', a, () => now += 500), transact(store, 'key', a, () => now += 500)]);
  assert.equal(store.row.state.daily.feed, 1);
});
test('Supabase adapter uses guarded revision PATCH and correct secret headers', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [{ revision: 3 }] }; });
  const db = new SupabaseStore('https://example.supabase.co', 'sb_secret_example');
  assert.equal(await db.compareAndSwap('a'.repeat(64), 2, named()), true);
  assert.match(calls[0].url, /revision=eq.2/); assert.equal(calls[0].options.headers.apikey, 'sb_secret_example');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].options.body).revision, 3);
});
