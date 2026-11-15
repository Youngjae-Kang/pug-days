import { randomBytes, createHash, randomInt } from 'node:crypto';
import { getStore, createState, transact } from '../lib/store.mjs';
import { publicState, GameError } from '../lib/game.mjs';

const TOKEN = /^[a-f0-9]{64}$/;
const hash = token => createHash('sha256').update(token).digest('hex');
const cookieToken = req => {
  const value = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('pug_session='))?.slice(12);
  return value && TOKEN.test(value) ? value : null;
};
const setCookie = (res, token) => res.setHeader('Set-Cookie', `pug_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${process.env.VERCEL ? '; Secure' : ''}`);
async function readBody(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 524288) throw new GameError('요청이 너무 커요.', 413);
    const body = typeof req.body === 'string' ? JSON.parse(raw) : req.body;
    if (body?.type !== 'vocab_upload' && Buffer.byteLength(raw) > 4096) throw new GameError('요청이 너무 커요.', 413);
    return body;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 524288) throw new GameError('요청이 너무 커요.', 413);
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const body = JSON.parse(raw || '{}');
  if (body?.type !== 'vocab_upload' && Buffer.byteLength(raw) > 4096) throw new GameError('요청이 너무 커요.', 413);
  return body;
}
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new GameError('POST 요청만 사용할 수 있어요.', 405); }
    const origin = req.headers.origin;
    const expected = `${process.env.VERCEL ? 'https' : 'http'}://${req.headers.host}`;
    if (origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('이 게임 페이지에서 다시 요청해주세요.', 403);
    if (!req.headers['content-type']?.startsWith('application/json')) throw new GameError('JSON 요청이 필요해요.', 415);
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GameError('올바르지 않은 요청이에요.');
    const store = getStore();
    let token = cookieToken(req);
    if (body.type === 'restore') {
      if (typeof body.code !== 'string' || !TOKEN.test(body.code)) throw new GameError('복구 코드는 영문·숫자 64자리예요.');
      if (!await store.read(hash(body.code))) throw new GameError('이 코드의 저장 데이터를 찾지 못했어요.', 404);
      token = body.code;
    } else if (!token) {
      if (body.type !== 'init') throw new GameError('연결이 만료됐어요. 새로고침해주세요.', 401);
      token = randomBytes(32).toString('hex');
      await store.create(hash(token), createState());
    }
    const action = ['init', 'restore', 'backup'].includes(body.type) ? { type: 'refresh' } : body;
    const result = await transact(store, hash(token), action, Date.now, () => randomInt(1000000) / 1000000);
    setCookie(res, token);
    res.statusCode = 200;
    res.end(JSON.stringify({ state: publicState(result.state), message: result.message, animation: result.animation, storage: process.env.SUPABASE_URL ? 'cloud' : 'local', ...(body.type === 'backup' ? { recoveryCode: token } : {}) }));
  } catch (e) {
    const known = e instanceof GameError || e instanceof SyntaxError;
    res.statusCode = e instanceof SyntaxError ? 400 : e.status || 503;
    if (!known) console.error('Game storage unavailable:', e.name); // Never log keys or request bodies.
    res.end(JSON.stringify({ error: known ? (e instanceof SyntaxError ? '요청 형식이 올바르지 않아요.' : e.message) : '서버에 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.' }));
  }
}
