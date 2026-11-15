import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/game.js';

test('HTTP upload → match → pause → restore persists vocabulary and knowledge with player isolation', async () => {
  const cwd = process.cwd(), dir = await mkdtemp(join(tmpdir(), 'pug-study-api-'));
  process.chdir(dir); process.env.LOCAL_DEMO = '1';
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.VERCEL;
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(type, extra = {}) {
    if (!['init', 'backup', 'restore'].includes(type)) await new Promise(resolve => setTimeout(resolve, 360));
    const response = await fetch(base, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ type, id: randomUUID(), sentAt: Date.now(), ...extra }) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, ...await response.json() };
  }
  try {
    await call('init'); await call('name', { name: '책모찌' });
    const text = Array.from({ length: 300 }, (_, i) => `단어${i}, 의미${i}`).join('\n');
    assert.ok(Buffer.byteLength(text) > 4096);
    const upload = await call('vocab_upload', { text });
    assert.equal(upload.status, 200); assert.equal(upload.state.study.words.length, 300);
    const started = await call('study_start', { target: 6 });
    const session = started.state.study.session, wordId = session.left[0];
    const match = await call('study_match', { sessionId: session.id, wordId, answerId: wordId });
    assert.equal(match.state.study.knowledge, .5); assert.equal(match.state.study.session.left.length, 4);
    await call('study_pause', { sessionId: session.id });
    const { recoveryCode } = await call('backup');
    cookie = '';
    const another = await call('init'); assert.equal(another.state.study.words.length, 0);
    const restored = await call('restore', { code: recoveryCode });
    assert.equal(restored.state.study.words.length, 300);
    assert.equal(restored.state.study.words[0].term, '단어0');
    assert.equal(restored.state.study.knowledge, .5);
    assert.equal(restored.state.study.session.status, 'paused');
    assert.equal(restored.state.study.session.completed, 1);
    assert.equal((await call('vocab_upload', { text: 'x'.repeat(262145) })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve)); process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});
