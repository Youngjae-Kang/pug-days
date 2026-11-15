import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import handler from '../api/game.js';

test('HTTP session, durable save, restore, cookie isolation, validation and origin protection', async () => {
  const original = process.cwd(), dir = await mkdtemp(join(tmpdir(), 'pug-test-'));
  process.chdir(dir); process.env.LOCAL_DEMO = '1';
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.VERCEL;
  const server = createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (body, options = {}) => {
    const res = await fetch(base + '/api/game', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, ...options.headers }, body: JSON.stringify(body) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return { res, data: await res.json() };
  };
  try {
    const init = await call({ type: 'init' }); assert.equal(init.res.status, 200); assert.equal(init.data.state.name, null); assert.match(init.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const denied = await call({ type: 'feed' }, { headers: { Origin: 'https://evil.example' } }); assert.equal(denied.res.status, 403);
    const name = await call({ type: 'name', name: '콩이', id: randomUUID(), sentAt: Date.now(), affection: 100 }); assert.equal(name.data.state.name, '콩이'); assert.equal(name.data.state.affection, 0);
    await new Promise(resolve => setTimeout(resolve, 360));
    const walk = await call({ type: 'walk', leashColor: 'blue', id: randomUUID(), sentAt: Date.now() });
    assert.equal(walk.res.status, 200); assert.equal(walk.data.state.leashColor, 'blue'); assert.equal(walk.data.state.daily.walk, 1);
    const backup = await call({ type: 'backup' }); assert.match(backup.data.recoveryCode, /^[a-f0-9]{64}$/);
    cookie = '';
    const another = await call({ type: 'init' }); assert.equal(another.data.state.name, null);
    const restore = await call({ type: 'restore', code: backup.data.recoveryCode }); assert.equal(restore.data.state.name, '콩이');
    assert.equal(restore.data.state.leashColor, 'blue'); assert.equal(restore.data.state.daily.walk, 1);
    assert.equal((await call({ type: 'init' })).data.state.name, '콩이');
    assert.equal((await call({ type: 'restore', code: 'f'.repeat(64) })).res.status, 404);
    assert.equal((await call({ type: 'name', name: 'x'.repeat(5000) })).res.status, 413);
    assert.equal((await fetch(base)).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve)); process.chdir(original); await rm(dir, { recursive: true, force: true });
  }
});
