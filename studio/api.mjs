// 퍼그 스튜디오 저장 API. 로컬 서버(server.mjs)에서만 쓰며 Vercel에는 배포되지 않아요.
// 저장하면 public/shop/<코드>.svg(+ -collar.svg) 이미지, lib/custom-shop.mjs 목록, studio/designs/<코드>.json 도안을 고쳐 써요.
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { CUSTOM_SHOP } from '../lib/custom-shop.mjs';
import { applyCustomShop, BUILTIN_SHOP_IDS } from '../lib/progression.mjs';
import { normalizeStudioItem, decodeStudioImage, catalogSource, StudioError } from '../lib/studio.mjs';

const catalogFile = new URL('../lib/custom-shop.mjs', import.meta.url);
const shopDir = new URL('../public/shop/', import.meta.url);
const designDir = new URL('./designs/', import.meta.url); // 다시 편집하기 위한 원본 도안(배포 안 됨)
const MAX_BODY = 9 * 1024 * 1024;
let items = structuredClone(CUSTOM_SHOP);

// 서버가 켜진 뒤 목록 파일을 손으로 고쳤어도 최신 내용을 읽어요.
async function loadItems() {
  try {
    const source = await readFile(catalogFile, 'utf8');
    const start = source.indexOf('['), end = source.lastIndexOf(']');
    const parsed = JSON.parse(source.slice(start, end + 1));
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* 읽지 못하면 마지막으로 저장한 목록을 사용해요. */ }
  return items;
}
async function saveItems(next) {
  const temp = new URL('../lib/custom-shop.mjs.tmp', import.meta.url);
  await writeFile(temp, catalogSource(next)); await rename(temp, catalogFile);
  items = next; applyCustomShop(items);
}
const imageFile = image => new URL(image.replace(/^\/shop\//, ''), shopDir);
async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new StudioError('요청이 너무 커요. 이미지를 3MB 이하로 줄여주세요.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const ID = /^[a-z0-9][a-z0-9-]{1,30}$/;
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

export async function handleStudio(req, res, path) {
  try {
    if (req.method === 'GET' && path === '/studio-api/catalog') {
      await loadItems();
      return send(res, 200, { items, builtinIds: [...BUILTIN_SHOP_IDS] });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 사용할 수 있어요.' });
    if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: '스튜디오 페이지에서 다시 시도해주세요.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON 요청이 필요해요.' });
    const body = await readJson(req);
    await loadItems();
    if (path === '/studio-api/design' ) {
      if (!ID.test(body.id ?? '')) throw new StudioError('상품 코드를 확인해주세요.');
      const design = await readFile(new URL(`${body.id}.json`, designDir), 'utf8').then(JSON.parse).catch(() => null);
      return send(res, 200, { design });
    }
    if (path === '/studio-api/save') {
      const current = items.find(item => item.id === body.item?.id);
      if (body.isNew && current) throw new StudioError('같은 코드의 상품이 이미 있어요. 다른 코드를 정해주세요.');
      const images = body.images ?? {};
      let main, collar, ext, collarExt = null, version = current?.version ?? Date.now();
      if (images.main) ({ bytes: main, ext } = decodeStudioImage(images.main));
      else if (current) ext = current.image.split('.').pop();
      else throw new StudioError('이미지가 없어요. 디자인을 먼저 그려주세요.');
      if (body.item?.kind === 'outfit' && body.item.collar?.type === 'custom') {
        if (images.collar) ({ bytes: collar, ext: collarExt } = decodeStudioImage(images.collar));
        else if (current?.collar?.image) collarExt = 'svg';
      }
      if (main || collar) version = Date.now();
      const item = normalizeStudioItem(body.item, BUILTIN_SHOP_IDS, ext, version, collarExt);
      if (current && current.kind !== item.kind) throw new StudioError('저장한 상품의 종류는 바꿀 수 없어요.');
      await mkdir(shopDir, { recursive: true });
      if (main) await writeFile(imageFile(item.image), main);
      if (collar) await writeFile(imageFile(item.collar.image), collar);
      if (current && current.image !== item.image) await unlink(imageFile(current.image)).catch(() => {});
      if (current?.collar?.image && !item.collar?.image) await unlink(imageFile(current.collar.image)).catch(() => {});
      if (body.design && typeof body.design === 'object') {
        await mkdir(designDir, { recursive: true });
        await writeFile(new URL(`${item.id}.json`, designDir), JSON.stringify(body.design));
      }
      const next = current ? items.map(old => old.id === item.id ? item : old) : [...items, item];
      await saveItems(next);
      return send(res, 200, { items, saved: item.id });
    }
    if (path === '/studio-api/delete') {
      const current = items.find(item => item.id === body.id);
      if (!current) throw new StudioError('삭제할 상품을 찾지 못했어요.');
      await saveItems(items.filter(item => item.id !== current.id));
      await unlink(imageFile(current.image)).catch(() => {});
      if (current.collar?.image) await unlink(imageFile(current.collar.image)).catch(() => {});
      await unlink(new URL(`${current.id}.json`, designDir)).catch(() => {});
      return send(res, 200, { items });
    }
    return send(res, 404, { error: '없는 스튜디오 기능이에요.' });
  } catch (e) {
    const known = e instanceof StudioError || e instanceof SyntaxError;
    if (!known) console.error('Studio error:', e);
    return send(res, known ? 400 : 500, { error: known ? (e instanceof SyntaxError ? '요청 형식이 올바르지 않아요.' : e.message) : '파일을 저장하지 못했어요. 터미널 메시지를 확인해주세요.' });
  }
}
