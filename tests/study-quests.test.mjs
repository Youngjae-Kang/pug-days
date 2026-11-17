import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { transact } from '../lib/store.mjs';
const T = Date.parse('2026-11-14T03:00:00Z');
function named(knowledge = 0) { const s = createState(T); s.name = '모찌'; s.study.knowledge = knowledge; return s; }
function action(type, now, data = {}) { return { type, id: randomUUID(), sentAt: now, ...data }; }
function act(s, type, now = T + 1000, data = {}) { return transition(s, action(type, now, data), now).state; }
test('knowledge quests require server milestones, respect fractional progress and grant a hat at 30', () => {
  let s = named(29.5); s = transition(s, { type: 'refresh' }, T).state;
  const studyQuests = publicState(s, T).quests.filter(q => q.category === 'study');
  const q = studyQuests.filter(q => q.id.startsWith('knowledge-'));
  const snacker = studyQuests.find(q => q.id === 'study-snacker-100');
  assert.equal(snacker.target, 100); assert.equal(snacker.value, 0); assert.equal(snacker.reward, 15);
  assert.deepEqual(q.map(q => q.target), [10, 30, 60, 100]);
  assert.equal(q[1].value, 29.5);
  assert.throws(() => act(s, 'claim_quest', T + 1000, { quest: 'knowledge-30', knowledge: 100 }), /아직/);
  s = act(s, 'vocab_upload', T + 2000, { text: 'apple\t사과' });
  s = act(s, 'study_start', T + 3000, { target: 1 });
  const id = s.study.session.left[0];
  s = act(s, 'study_match', T + 4000, { sessionId: s.study.session.id, wordId: id, answerId: id });
  s = act(s, 'claim_quest', T + 5000, { quest: 'knowledge-30' });
  assert.equal(s.study.peakKnowledge, 30); assert.equal(s.progress.biscuits, 20);
  assert.deepEqual(s.progress.ownedHats, ['graduate']);
  assert.throws(() => act(s, 'claim_quest', T + 6000, { quest: 'knowledge-30' }), /이미/);
  assert.throws(() => act(s, 'buy_outfit', T + 6000, { outfit: 'graduate' }));
});
test('achieved milestones survive knowledge decay, and a hat can be worn with clothing', () => {
  let s = named(30); s = transition(s, { type: 'refresh' }, T + 86400000 * 2).state;
  assert.equal(s.study.knowledge, 24); assert.equal(s.study.peakKnowledge, 30);
  const now = T + 86400000 * 2 + 1000;
  s = act(s, 'claim_quest', now, { quest: 'knowledge-30' });
  s.progress.owned = ['mint']; s.progress.equipped = 'mint';
  s = act(s, 'equip_hat', now + 1000, { hat: 'graduate' });
  assert.equal(s.progress.hat, 'graduate'); assert.equal(s.progress.equipped, 'mint');
  s = act(s, 'equip_hat', now + 2000, { hat: null });
  assert.equal(s.progress.hat, null); assert.deepEqual(s.progress.ownedHats, ['graduate']);
  assert.throws(() => act(named(), 'equip_hat', T + 1000, { hat: 'graduate' }), /아직/);
  assert.throws(() => act(s, 'equip_hat', now + 3000, { hat: '<script>' }));
});
test('legacy wardrobe migration preserves existing outfits and adds empty accessories', () => {
  const s = named(30); s.progress.equipped = 'mint'; s.progress.owned = ['mint'];
  delete s.progress.hat; delete s.progress.ownedHats; delete s.study.peakKnowledge;
  const updated = transition(s, { type: 'refresh' }, T).state;
  assert.equal(updated.progress.equipped, 'mint'); assert.deepEqual(updated.progress.ownedHats, []);
  assert.equal(updated.study.peakKnowledge, 30);
});
test('concurrent claims and retries grant only one graduation reward', async () => {
  const store = { row: { state: named(30), revision: 0 }, async read() { return structuredClone(this.row); }, async compareAndSwap(key, revision, state) { if (revision !== this.row.revision) return false; this.row = { state, revision: revision + 1 }; return true; } };
  const claim = action('claim_quest', T + 1000, { quest: 'knowledge-30' });
  await Promise.all([transact(store, 'test', claim, () => T + 1000), transact(store, 'test', claim, () => T + 1000)]);
  assert.equal(store.row.state.progress.biscuits, 20); assert.deepEqual(store.row.state.progress.ownedHats, ['graduate']);
});
