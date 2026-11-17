import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { FileStore, transact } from '../lib/store.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const DAY = 86400000;
function fixture() {
  let now = Date.parse('2026-11-17T00:00:00Z'), state = createState(now); state.name = '두부';
  const f = { get state() { return state; }, get now() { return now; }, set now(n) { now = n; },
    step(type, extra = {}) { now += 1000; const action = { type, id: randomUUID(), sentAt: now, ...extra }; state = transition(state, action, now, () => .3).state; return action; } };
  f.step('vocab_upload', { text: 'apple\t사과\nbook\t책' });
  f.step('study_start', { target: 2 });
  const session = state.study.session;
  f.wrong = () => f.step('study_match', { sessionId: session.id, wordId: session.left[0], answerId: session.right.find(id => id !== session.left[0]) });
  f.stop = () => f.step('study_stop', { sessionId: state.study.session.id });
  f.grade = remembered => f.step('study_review_grade', { sessionId: state.study.session.id, wordId: state.study.session.left[0], remembered });
  return f;
}
test('mistakes persist once per request; old saves gain only an empty collection', async () => {
  const f = fixture(), old = structuredClone(f.state); delete old.study.wrongWords;
  const upgraded = transition(old, { type: 'refresh' }, f.now).state;
  assert.deepEqual(upgraded.study.wrongWords, []);
  delete upgraded.study.wrongWords; assert.deepEqual(upgraded, old);
  const action = f.wrong(); f.step(action.type, action);
  assert.equal(f.state.study.wrongWords.length, 1); assert.equal(f.state.study.wrongWords[0].mistakes, 1);
  const dir = await mkdtemp(join(tmpdir(), 'pug-review-'));
  try {
    const store = new FileStore(dir); await store.create('pug', f.state);
    const now = f.now + 1000, next = { ...action, id: randomUUID(), sentAt: now };
    await Promise.all([transact(store, 'pug', next, () => now), transact(store, 'pug', next, () => now)]);
    const row = await new FileStore(dir).read('pug');
    assert.equal(row.state.study.wrongWords[0].mistakes, 2);
    assert.deepEqual(publicState(row.state).study.wrongWords, row.state.study.wrongWords);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('due cards follow 1,3,7,14,30 day intervals and lapse resets to one day', () => {
  const f = fixture(); f.wrong();
  assert.equal(f.state.study.wrongWords[0].dueAt, f.now + DAY); f.stop();
  assert.throws(() => f.step('study_review_start'), /아직/);
  for (const days of [3, 7, 14, 30, 30]) {
    f.now = f.state.study.wrongWords[0].dueAt;
    f.step('study_review_start'); f.grade(true);
    assert.equal(f.state.study.wrongWords[0].dueAt, f.now + days * DAY);
    assert.equal(f.state.study.session.status, 'completed');
  }
  f.now = f.state.study.wrongWords[0].dueAt; f.step('study_review_start'); f.grade(false);
  assert.equal(f.state.study.wrongWords[0].stage, 0);
  assert.equal(f.state.study.wrongWords[0].dueAt, f.now + DAY);
  assert.equal(f.state.study.knowledge, 0);
});
test('review pause, restore, stale cards and grade validation preserve schedule', () => {
  const f = fixture(); f.wrong(); f.stop(); f.now += DAY; f.step('study_review_start');
  assert.throws(() => f.step('study_start', { target: 1 }), /이미/);
  const sessionId = f.state.study.session.id;
  f.step('study_pause', { sessionId }); assert.throws(() => f.grade(true), /현재/);
  f.step('study_resume', { sessionId });
  assert.throws(() => f.grade('yes'), /결과/);
  assert.throws(() => f.step('study_review_grade', { sessionId, wordId: 'forged', remembered: true }), /현재/);
  const action = f.grade(true), dueAt = f.state.study.wrongWords[0].dueAt;
  f.step(action.type, action); assert.equal(f.state.study.wrongWords[0].dueAt, dueAt);
});
test('editing synchronizes snapshots and deleting vocabulary retains review history', () => {
  const f = fixture(); f.wrong(); f.stop(); const id = f.state.study.wrongWords[0].id;
  f.step('vocab_edit', { wordId: id, term: 'new', answer: '새 뜻' });
  assert.equal(f.state.study.wrongWords[0].answer, '새 뜻');
  f.step('vocab_delete', { wordId: id });
  assert.equal(f.state.study.wrongWords.length, 1);
  f.now += DAY; f.step('study_review_start'); f.grade(true);
  assert.equal(f.state.study.session.status, 'completed');
});

test('matching can select only saved mistakes before their due date, including deleted vocabulary', () => {
  const f = fixture(); f.wrong(); f.stop();
  const word = structuredClone(f.state.study.wrongWords[0]);
  f.step('vocab_delete', { wordId: word.id });
  f.step('study_start', { source: 'wrong', target: 1 });
  const session = f.state.study.session;
  assert.equal(publicState(f.state).study.session.source, 'wrong');
  assert.deepEqual(session.left, [word.id]);
  assert.ok(word.dueAt > f.now);
  f.step('study_pause', { sessionId: session.id });
  f.step('study_resume', { sessionId: session.id });
  const action = f.step('study_match', { sessionId: session.id, wordId: word.id, answerId: word.id });
  f.step(action.type, action);
  assert.equal(f.state.study.session.status, 'completed');
  assert.equal(f.state.study.knowledge, .5);
  assert.deepEqual(f.state.study.wrongWords[0], word);
  f.step('study_start', { target: 1 });
  assert.equal(f.state.study.session.source, 'all');
  assert.ok(!f.state.study.session.left.includes(word.id));
});

test('source and target are validated against server data, with legacy sessions still playable', () => {
  const f = fixture(); f.stop();
  assert.throws(() => f.step('study_start', { source: 'wrong', target: 1 }), /오답/);
  assert.throws(() => f.step('study_start', { source: 'invented', target: 1 }), /선택/);
  f.step('study_start', { target: 2 });
  delete f.state.study.session.source;
  const session = f.state.study.session;
  f.step('study_match', { sessionId: session.id, wordId: session.left[0], answerId: session.right.find(id => id !== session.left[0]) });
  f.stop();
  assert.throws(() => f.step('study_start', { source: 'wrong', target: 2 }), /1~1/);
  assert.equal(f.state.study.wrongWords.length, 1);
});

test('wrong-only matching keeps batch boundaries and records further mistakes', () => {
  const f = fixture(); f.stop();
  f.step('vocab_upload', { text: 'sun\t해\nmoon\t달\ncat\t고양이' });
  f.step('study_start', { target: 5, batchSize: 5 });
  const session = f.state.study.session;
  for (const wordId of session.left) f.step('study_match', { sessionId: session.id, wordId, answerId: session.right.find(id => id !== wordId) });
  f.stop(); f.step('study_start', { source: 'wrong', target: 5, batchSize: 2 });
  const review = f.state.study.session;
  f.step('study_match', { sessionId: review.id, wordId: review.left[0], answerId: review.right.find(id => id !== review.left[0]) });
  assert.equal(f.state.study.wrongWords.find(w => w.id === review.left[0]).mistakes, 2);
  for (const remaining of [1, 2, 1, 1, 0]) {
    const current = f.state.study.session, wordId = current.left[0];
    f.step('study_match', { sessionId: current.id, wordId, answerId: wordId });
    assert.equal(f.state.study.session.left.length, remaining);
  }
  assert.equal(f.state.study.session.status, 'completed');
});
