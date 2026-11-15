import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { parseVocabulary, STUDY_RULES } from '../lib/study.mjs';
import { FileStore, transact } from '../lib/store.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const T = Date.parse('2026-11-14T14:00:00Z');
const sample = 'apple, 사과\nbook, 책\nsun, 해\nmoon, 달\nありがとう, 고마워\nbonjour, 안녕하세요\nperro, 개\n사랑, love';
function fixture(text = sample) {
  let now = T;
  let state = createState(now); state.name = '모찌';
  function step(type, data = {}) {
    now += 1000;
    const result = transition(state, { type, id: randomUUID(), sentAt: now, ...data }, now, () => .3);
    state = result.state; return result;
  }
  step('vocab_upload', { text });
  return { step, get state() { return state; }, get now() { return now; }, set now(value) { now = value; } };
}
function correct(f) {
  const session = f.state.study.session, wordId = session.left[0];
  const word = f.state.study.words.find(w => w.id === wordId);
  const answerId = session.right.find(id => f.state.study.words.find(w => w.id === id).answer === word.answer);
  return f.step('study_match', { sessionId: session.id, wordId, answerId });
}
test('TXT supports BOM, CRLF, multilingual words, quoted commas, tabs and deduplication', () => {
  const words = parseVocabulary('\uFEFFapple, 사과\r\nありがとう, 고마워\r\n"hello, world", "안녕, 세상"\r\ncat\t고양이\r\napple, 사과\n\n');
  assert.equal(words.length, 4); assert.equal(words[2].term, 'hello, world'); assert.equal(words[2].answer, '안녕, 세상');
  assert.equal(parseVocabulary('run, 달리다, 운영하다')[0].answer, '달리다, 운영하다');
});
test('malformed or oversized uploads fail atomically, preserving earlier vocabulary', () => {
  const f = fixture();
  assert.throws(() => f.step('vocab_upload', { text: 'new 새\n잘못된줄' }), /2번째/);
  assert.equal(f.state.study.words.length, 8);
  for (const text of ['', 'apple,', ',사과', 'x'.repeat(262145), 'x, bad\u0000']) assert.throws(() => parseVocabulary(text));
  assert.throws(() => parseVocabulary(Array.from({ length: 1001 }, (_, i) => `w${i},a${i}`).join('\n')), /1,000/);
});
test('whitespace splits only word from meaning and preserves multiword definitions', () => {
  const words = parseVocabulary('apple 사과\nrun    달리다, 빠르게 움직이다\nありがとう\t정말 고마워\n"look up" 찾아보다\n"take care of"    돌봐 주다\n你好　안녕하세요');
  assert.equal(words.length, 6);
  assert.deepEqual(words.map(w => [w.term, w.answer]), [['apple', '사과'], ['run', '달리다, 빠르게 움직이다'], ['ありがとう', '정말 고마워'], ['look up', '찾아보다'], ['take care of', '돌봐 주다'], ['你好', '안녕하세요']]);
  assert.equal(parseVocabulary('apple 사과\napple, 사과').length, 1);
  assert.throws(() => parseVocabulary('word_without_meaning'), /띄어쓰기/);
});
test('append skips duplicates; editing and deleting persist with no ID collision on reimport', () => {
  const f = fixture(), id = f.state.study.words[0].id;
  f.step('vocab_upload', { text: sample }); assert.equal(f.state.study.words.length, 8);
  f.step('vocab_edit', { wordId: id, term: 'pomme', answer: '사과' });
  f.step('vocab_upload', { text: 'apple, 사과' });
  assert.equal(f.state.study.words.length, 9); assert.equal(new Set(f.state.study.words.map(w => w.id)).size, 9);
  f.step('vocab_delete', { wordId: id }); assert.equal(f.state.study.words.length, 8);
  assert.ok(!f.state.study.words.some(w => w.term === 'pomme'));
});
test('four pairs refill until the exact distinct-word goal, with no credit for wrong answers', () => {
  const f = fixture(); f.step('study_start', { target: 7 });
  const session = f.state.study.session;
  assert.equal(session.left.length, 4); assert.equal(session.right.length, 4);
  const wrongId = session.right.find(id => id !== session.left[0]);
  f.step('study_match', { sessionId: session.id, wordId: session.left[0], answerId: wrongId });
  assert.equal(f.state.study.knowledge, 0); assert.equal(f.state.study.session.mistakes, 1);
  const seen = new Set();
  for (let i = 0; i < 7; i++) {
    seen.add(f.state.study.session.left[0]); correct(f);
    assert.equal(f.state.study.session.left.length, Math.min(4, 6 - i));
    assert.equal(f.state.study.session.right.length, Math.min(4, 6 - i));
  }
  assert.equal(seen.size, 7); assert.equal(f.state.study.knowledge, 3.5);
  assert.equal(f.state.study.session.status, 'completed');
});
test('identical meanings are interchangeable and leave a solvable board', () => {
  const f = fixture('hi, 안녕\nhello, 안녕\nsun, 해\nmoon, 달'); f.step('study_start', { target: 4 });
  const hi = f.state.study.words[0], hello = f.state.study.words[1];
  f.step('study_match', { sessionId: f.state.study.session.id, wordId: hi.id, answerId: hello.id });
  while (f.state.study.session.status === 'active') correct(f);
  assert.equal(f.state.study.session.completed, 4); assert.equal(f.state.study.knowledge, 2);
});
test('small goals, invalid goals, stale sessions and forged cards are handled server-side', () => {
  const f = fixture();
  for (const target of [0, -1, 9, 1.5, '4', NaN]) assert.throws(() => f.step('study_start', { target }));
  f.step('study_start', { target: 1 }); assert.equal(f.state.study.session.left.length, 1);
  assert.throws(() => f.step('study_match', { sessionId: 'stale', wordId: 'x', answerId: 'y' }), /상태/);
  assert.throws(() => f.step('study_match', { sessionId: f.state.study.session.id, wordId: 'x', answerId: 'y' }), /카드/);
  correct(f); assert.equal(f.state.study.session.status, 'completed');
});
test('identical spellings with different meanings accept either visibly valid meaning', () => {
  const f = fixture('bank, 은행\nbank, 강둑\nriver, 강'); f.step('study_start', { target: 3 });
  const first = f.state.study.words[0], second = f.state.study.words[1];
  f.step('study_match', { sessionId: f.state.study.session.id, wordId: first.id, answerId: second.id });
  assert.equal(f.state.study.session.completed, 1);
  while (f.state.study.session.status === 'active') correct(f);
  assert.equal(f.state.study.knowledge, 1.5);
});
test('pause blocks matching, edits and conflicting activities; resume and stop retain rewards', () => {
  const f = fixture(); f.step('study_start', { target: 6 }); correct(f);
  const sessionId = f.state.study.session.id;
  f.step('study_pause', { sessionId }); assert.throws(() => correct(f), /일시정지/);
  assert.throws(() => f.step('vocab_delete', { wordId: f.state.study.words[0].id }), /그만둔/);
  assert.throws(() => f.step('start_focus'), /공부/);
  f.step('study_resume', { sessionId }); correct(f); f.step('study_stop', { sessionId });
  assert.equal(f.state.study.knowledge, 1); assert.equal(f.state.study.session.completed, 2);
  f.step('vocab_delete', { wordId: f.state.study.words[0].id });
  f.step('start_focus'); assert.throws(() => f.step('study_start', { target: 1 }), /집중 동행/);
});
test('retries cannot double-credit, repeated words credit once a day, midnight resets eligibility', () => {
  const f = fixture('one, 하나'); f.step('study_start', { target: 1 });
  const session = f.state.study.session, id = randomUUID();
  const data = { id, sessionId: session.id, wordId: session.left[0], answerId: session.right[0] };
  f.step('study_match', data); f.step('study_match', data); assert.equal(f.state.study.knowledge, .5);
  f.step('study_start', { target: 1 }); correct(f); assert.equal(f.state.study.knowledge, .5);
  f.now = T + 3600000;
  f.step('study_start', { target: 1 }); correct(f); assert.equal(f.state.study.knowledge, 1);
});
test('knowledge starts at zero, caps at 100, decays only for completed missed KST days', () => {
  const f = fixture('one, 하나'); f.state.study.knowledge = 99.8;
  f.step('study_start', { target: 1 }); correct(f); assert.equal(f.state.study.knowledge, 100);
  f.now = T + 86400000; f.step('study_start', { target: 1 });
  assert.equal(f.state.study.knowledge, 100);
  f.now += 3 * 86400000; f.step('study_stop', { sessionId: f.state.study.session.id });
  assert.equal(f.state.study.knowledge, 91);
  f.now += 100 * 86400000; f.step('study_start', { target: 1 }); assert.equal(f.state.study.knowledge, 0);
});
test('old saves gain study data without losing progress or applying retroactive neglect', () => {
  const original = createState(T); original.name = '두부'; original.study = undefined;
  const migrated = transition(original, { type: 'refresh' }, T + 86400000 * 30).state;
  assert.equal(migrated.study.knowledge, 0); assert.deepEqual(migrated.study.words, []);
  assert.equal(migrated.name, '두부');
  const view = publicState(migrated, T); assert.equal(view.study.credited, undefined); assert.equal(view.study.rules.gain, STUDY_RULES.gain);
});
test('wordbook and paused board survive FileStore reopen; concurrent identical matches credit once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pug-study-'));
  try {
    const f = fixture(); f.step('study_start', { target: 6 }); correct(f);
    f.step('study_pause', { sessionId: f.state.study.session.id });
    await new FileStore(dir).create('test', f.state);
    const store = new FileStore(dir), saved = await store.read('test');
    assert.deepEqual(saved.state.study, f.state.study);
    const now = f.now + 1000;
    await transact(store, 'test', { type: 'study_resume', sessionId: saved.state.study.session.id, id: randomUUID(), sentAt: now }, () => now);
    const current = (await store.read('test')).state.study.session;
    const wordId = current.left[0], word = f.state.study.words.find(w => w.id === wordId);
    const answerId = current.right.find(id => f.state.study.words.find(w => w.id === id).answer === word.answer);
    const action = { type: 'study_match', sessionId: current.id, wordId, answerId, id: randomUUID(), sentAt: now + 1000 };
    await Promise.all([transact(store, 'test', action, () => now + 1000), transact(store, 'test', action, () => now + 1000)]);
    assert.equal((await store.read('test')).state.study.session.completed, 2);
    assert.equal((await store.read('test')).state.study.knowledge, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
