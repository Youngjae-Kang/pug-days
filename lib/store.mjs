import { createState, transition, GameError } from './game.mjs';

export class SupabaseStore {
  constructor(url, secret) {
    this.url = new URL('/rest/v1/pug_saves', url).href;
    this.headers = { apikey: secret, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    // Modern sb_secret keys go in apikey, legacy service_role JWTs also need Bearer.
    if (!secret.startsWith('sb_secret_')) this.headers.Authorization = `Bearer ${secret}`;
  }
  async request(query, method = 'GET', body) {
    const r = await fetch(this.url + query, { method, headers: this.headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Database request failed (${r.status})`);
    return r.json();
  }
  async read(key) { return (await this.request(`?token_hash=eq.${key}&select=state,revision`))[0] ?? null; }
  async create(key, state) { await this.request('', 'POST', { token_hash: key, state }); }
  async compareAndSwap(key, revision, state) {
    const rows = await this.request(`?token_hash=eq.${key}&revision=eq.${revision}`, 'PATCH', { state, revision: revision + 1, updated_at: new Date().toISOString() });
    return rows.length === 1;
  }
}

// Used only by the local preview. Production refuses this fallback.
export class FileStore {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  async locked(callback) {
    const before = this.queue;
    let release; this.queue = new Promise(r => { release = r; });
    await before;
    try { return await callback(); } finally { release(); }
  }
  async read(key) {
    const { readFile } = await import('node:fs/promises');
    try { return JSON.parse(await readFile(`${this.directory}/${key}.json`, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  async write(key, row) {
    const { mkdir, writeFile, rename } = await import('node:fs/promises');
    await mkdir(this.directory, { recursive: true });
    const path = `${this.directory}/${key}.json`;
    await writeFile(path + '.tmp', JSON.stringify(row));
    await rename(path + '.tmp', path);
  }
  async create(key, state) { return this.locked(() => this.write(key, { state, revision: 0 })); }
  async compareAndSwap(key, revision, state) {
    return this.locked(async () => {
      const row = await this.read(key);
      if (!row || row.revision !== revision) return false;
      await this.write(key, { state, revision: revision + 1 }); return true;
    });
  }
}
let instance;
export function getStore() {
  if (instance) return instance;
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SECRET_KEY) return instance = new SupabaseStore(SUPABASE_URL, SUPABASE_SECRET_KEY);
  if (!process.env.VERCEL && process.env.LOCAL_DEMO === '1') return instance = new FileStore('.local/saves');
  throw new GameError('서버 저장소 설정이 필요해요. 배포 안내의 Supabase 환경변수를 확인해주세요.', 503);
}
export async function transact(store, key, action, now = Date.now, random) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await store.read(key);
    if (!row) throw new GameError('저장 데이터를 찾지 못했어요. 복구 코드를 확인해주세요.', 401);
    const result = transition(row.state, action, now(), random);
    if (JSON.stringify(result.state) === JSON.stringify(row.state)) return result;
    if (await store.compareAndSwap(key, row.revision, result.state)) return result;
  }
  throw new GameError('다른 창에서 저장 중이에요. 잠시 후 다시 해주세요.', 409);
}
export { createState };
