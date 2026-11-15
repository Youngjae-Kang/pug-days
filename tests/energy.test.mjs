import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { transact } from '../lib/store.mjs';
const T = Date.parse('2026-10-25T03:00:00Z');
function pug(energy = 100) { const s = createState(T); s.name = '모찌'; s.energy = energy; s.leashColor = 'lilac'; return s; }
function act(s, type, at = T, extra = {}) { return transition(s, { type, id: randomUUID(), sentAt: at, ...extra }, at, () => .999).state; }
function refresh(s, at) { return transition(s, { type: 'refresh' }, at).state; }

test('walking drains 1 energy per 5 seconds; repeated refresh does not double charge', () => {
  const walking = act(pug(), 'walk');
  const later = refresh(walking, T + 5000);
  assert.equal(later.energy, 99); assert.equal(later.activity.kind, 'walk');
  assert.equal(refresh(later, T + 5000).energy, 99);
});
test('speed switch settles old speed first, drains faster, and adds no walk reward', () => {
  const walking = act(pug(), 'walk');
  const running = act(walking, 'walk_mode', T + 5000, { mode: 'run' });
  assert.equal(running.energy, 99); assert.equal(running.daily.walk, 1); assert.equal(running.affection, 8);
  const later = refresh(running, T + 9000);
  assert.equal(later.energy, 97); assert.equal(publicState(later, T + 9000).energyRate, -.5);
  const slow = act(later, 'walk_mode', T + 10000, { mode: 'walk' });
  assert.equal(refresh(slow, T + 15000).energy, 95.5);
});
test('exhaustion automatically ends outing once, including while page is closed', () => {
  const s = act(pug(1), 'walk');
  const tired = refresh(s, T + 60000);
  assert.equal(tired.energy, 0); assert.equal(tired.activity, null);
  assert.match(tired.logs[0].message, /체력이 다 떨어/);
  assert.equal(tired.logs[0].at, T + 5000);
  assert.deepEqual(refresh(tired, T + 70000).logs, tired.logs);
});
test('returning home settles energy then stops drain', () => {
  const s = act(pug(), 'walk');
  const home = act(s, 'end_walk', T + 10000);
  assert.equal(home.energy, 98); assert.equal(home.activity, null);
  assert.equal(refresh(home, T + 500000).energy, 98);
});
test('zero energy blocks a new walk; low energy blocks training without spending an attempt', () => {
  assert.throws(() => act(pug(0), 'walk'), /체력이 없어요/);
  const s = pug(11.9);
  assert.throws(() => act(s, 'train', T, { trick: 'down' }), /12 이상/);
  assert.equal(s.daily.train, 0); assert.equal(s.energy, 11.9);
});
test('training costs 12 even when it fails, but replayed request costs nothing extra', () => {
  const s = pug(12), a = { type: 'train', trick: 'down', id: randomUUID(), sentAt: T };
  const trained = transition(s, a, T, () => .99).state;
  assert.equal(trained.energy, 0); assert.equal(trained.daily.train, 1); assert.equal(trained.tricks.length, 0);
  assert.equal(transition(trained, a, T + 1000).state.energy, 0);
  assert.equal(transition(trained, a, T + 1000).state.daily.train, 1);
});
test('food and every pet variant restore energy with a cap of 100', () => {
  assert.equal(act(pug(40), 'feed').energy, 60);
  assert.equal(act(pug(95), 'feed').energy, 100);
  for (const type of ['pet', 'belly', 'butt']) {
    const s = pug(20); s.daily.pet = 5;
    assert.equal(act(s, type).energy, 25); assert.equal(act(s, type).affection, 0);
  }
  assert.equal(act(pug(99), 'pet').energy, 100);
});
test('sleep restores 2 energy per second and waking stops recovery', () => {
  const asleep = act(pug(20), 'sleep');
  assert.equal(refresh(asleep, T + 10000).energy, 40);
  const awake = act(asleep, 'wake', T + 10000);
  assert.equal(awake.energy, 40); assert.equal(awake.activity, null);
  assert.equal(refresh(awake, T + 50000).energy, 40);
});
test('sleep ends automatically at full energy and its timestamp is exact', () => {
  const asleep = act(pug(20), 'sleep');
  const full = refresh(asleep, T + 60000);
  assert.equal(full.energy, 100); assert.equal(full.activity, null);
  assert.equal(full.logs[0].at, T + 40000);
  assert.throws(() => act(full, 'sleep', T + 61000), /가득/);
});
test('care and training cannot interrupt active walk/sleep behind the UI', () => {
  for (const state of [act(pug(50), 'walk'), act(pug(50), 'sleep')]) {
    for (const type of ['feed', 'pet', 'train']) assert.throws(() => act(state, type, T + 1000, { trick: 'down' }));
  }
  assert.throws(() => act(pug(), 'walk_mode', T, { mode: 'run' }), /먼저 산책/);
  assert.throws(() => act(act(pug(), 'walk'), 'walk_mode', T + 1000, { mode: 'teleport' }), /걷기 또는 달리기/);
});
test('legacy saves gain energy without changing existing progress or accepting client energy', () => {
  const s = pug(); delete s.energy; delete s.activity; s.affection = 61;
  const upgraded = refresh(s, T);
  assert.equal(upgraded.energy, 100); assert.equal(upgraded.activity, null); assert.equal(upgraded.affection, 61);
  assert.equal(act(pug(20), 'pet', T, { energy: 100, cheat: true }).energy, 25);
});
test('cheat mode keeps stamina unlimited while walking and training', () => {
  const s = pug(); s.cheat = true;
  const walking = refresh(act(s, 'walk'), T + 86400000);
  assert.equal(walking.energy, 100); assert.equal(walking.activity.kind, 'walk');
  assert.equal(publicState(walking).energyRate, 0);
  assert.equal(act(s, 'train', T, { trick: 'paw' }).energy, 100);
});
test('simultaneous refreshes settle elapsed energy only once', async () => {
  const store = {
    row: { state: act(pug(), 'walk'), revision: 0 },
    async read() { await Promise.resolve(); return structuredClone(this.row); },
    async compareAndSwap(key, rev, state) { if (this.row.revision !== rev) return false; this.row = { state, revision: rev + 1 }; return true; }
  };
  await Promise.all([transact(store, 'key', { type: 'refresh' }, () => T + 5000), transact(store, 'key', { type: 'refresh' }, () => T + 5000)]);
  assert.equal(store.row.state.energy, 99);
});
