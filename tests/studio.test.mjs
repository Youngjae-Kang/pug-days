import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { OUTFITS, ROOM_ITEMS, HATS, BUILTIN_SHOP_IDS, applyCustomShop } from '../lib/progression.mjs';
import { CUSTOM_SHOP } from '../lib/custom-shop.mjs';
import { normalizeStudioItem, decodeStudioImage, isSafeSvg, catalogSource } from '../lib/studio.mjs';

const T = Date.parse('2026-11-17T08:00:00Z');
let clock = T;
const act = (s, type, extra = {}) => { clock += 1000; return transition(s, { type, ...extra, id: randomUUID(), sentAt: clock }, clock); };
const pug = biscuits => { const s = createState(T); s.name = '모찌'; s.progress.biscuits = biscuits; return s; };
const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const shirt = normalizeStudioItem({ id: 'banana-vest', kind: 'outfit', style: 'pattern', name: '바나나 조끼', price: 70, tile: 24, seam: '#AA8800', collar: { type: 'ribbon', color: '#D9655B' } }, BUILTIN_SHOP_IDS, 'svg', 5);
const tee = normalizeStudioItem({ id: 'star-tee', kind: 'outfit', style: 'motif', name: '별 티셔츠', price: 30, motifSize: 60, base: '#a2c6db', collar: { type: 'custom' } }, BUILTIN_SHOP_IDS, 'svg', 7, 'svg');
const beret = normalizeStudioItem({ id: 'berry-beret', kind: 'hat', name: '딸기 베레모', price: 55 }, BUILTIN_SHOP_IDS, 'svg', 8);
const cushion = normalizeStudioItem({ id: 'moon-cushion', kind: 'furniture', name: '달 방석', price: 40, x: 60, bottom: 70, size: 90 }, BUILTIN_SHOP_IDS, 'svg', 6);

test.afterEach(() => applyCustomShop(CUSTOM_SHOP));

test('studio items are normalized with server-chosen image paths', () => {
  assert.equal(shirt.image, '/shop/banana-vest.svg'); assert.equal(shirt.seam, '#aa8800'); assert.equal(shirt.hidden, false);
  assert.deepEqual(shirt.collar, { type: 'ribbon', color: '#d9655b' });
  assert.equal(tee.collar.image, '/shop/star-tee-collar.svg'); assert.equal(tee.motifSize, 60);
  assert.equal(beret.image, '/shop/berry-beret.svg'); assert.equal(beret.x, undefined);
  assert.throws(() => normalizeStudioItem({ ...tee, collar: { type: 'custom' } }, BUILTIN_SHOP_IDS, 'svg', 1), /목 장식이 없어요/);
  assert.throws(() => normalizeStudioItem({ ...shirt, style: 'polka' }, BUILTIN_SHOP_IDS, 'svg', 1), /옷 스타일/);
  assert.throws(() => normalizeStudioItem({ ...shirt, collar: { type: 'cape' } }, BUILTIN_SHOP_IDS, 'svg', 1), /목 장식 종류/);
  assert.throws(() => normalizeStudioItem({ ...beret, id: 'graduate' }, BUILTIN_SHOP_IDS, 'svg', 1), /기본 상품/);
  assert.equal(cushion.image, '/shop/moon-cushion.svg'); assert.equal(cushion.size, 90);
  assert.throws(() => normalizeStudioItem({ ...shirt, id: 'mint' }, BUILTIN_SHOP_IDS, 'png', 1), /기본 상품/);
  assert.throws(() => normalizeStudioItem({ ...shirt, id: '../x' }, BUILTIN_SHOP_IDS, 'png', 1), /상품 코드/);
  assert.throws(() => normalizeStudioItem({ ...shirt, price: 0 }, BUILTIN_SHOP_IDS, 'png', 1), /가격/);
  assert.throws(() => normalizeStudioItem({ ...shirt, kind: 'scarf' }, BUILTIN_SHOP_IDS, 'png', 1), /종류/);
});

test('studio images are checked by type and content', () => {
  assert.equal(decodeStudioImage(PNG).ext, 'png');
  assert.throws(() => decodeStudioImage('data:image/png;base64,' + Buffer.from('not a png').toString('base64')), /손상/);
  assert.throws(() => decodeStudioImage('data:text/html;base64,PGh0bWw+'), /이미지만/);
  assert.equal(isSafeSvg('<svg viewBox="0 0 10 10"><circle r="4"/></svg>'), true);
  assert.equal(isSafeSvg('<svg><script>alert(1)</script></svg>'), false);
  assert.equal(isSafeSvg('<svg><rect onload="x()"/></svg>'), false);
  assert.equal(isSafeSvg('<svg><image href="https://evil.example/a.png"/></svg>'), false);
});

test('custom items join the shop live, can be bought, and appear in public state', () => {
  applyCustomShop([shirt, cushion]);
  assert.ok(OUTFITS.some(o => o.id === 'banana-vest' && o.custom.image === '/shop/banana-vest.svg?v=5' && o.custom.collar.type === 'ribbon'));
  assert.ok(ROOM_ITEMS.some(i => i.id === 'moon-cushion' && i.kind === 'furniture'));
  let s = act(pug(200), 'buy_outfit', { outfit: 'banana-vest' }).state;
  s = act(s, 'equip', { outfit: 'banana-vest' }).state;
  s = act(s, 'buy_item', { item: 'moon-cushion' }).state;
  assert.equal(s.progress.biscuits, 90); assert.equal(s.progress.equipped, 'banana-vest');
  assert.deepEqual(s.progress.placedItems, ['moon-cushion']);
  const view = publicState(s, clock);
  assert.ok(view.outfits.some(o => o.id === 'banana-vest')); assert.ok(view.roomItems.some(i => i.id === 'moon-cushion'));
});

test('hidden custom items cannot be bought but owners keep them', () => {
  applyCustomShop([shirt]);
  const owned = act(pug(200), 'buy_outfit', { outfit: 'banana-vest' }).state;
  applyCustomShop([{ ...shirt, hidden: true }, { ...cushion, hidden: true }]);
  assert.throws(() => act(pug(200), 'buy_outfit', { outfit: 'banana-vest' }), /퀘스트/);
  assert.throws(() => act(pug(200), 'buy_item', { item: 'moon-cushion' }), /판매하지/);
  const worn = act(owned, 'equip', { outfit: 'banana-vest' }).state;
  assert.equal(worn.progress.equipped, 'banana-vest');
  applyCustomShop([]);
  assert.match(act(owned, 'equip', { outfit: 'banana-vest' }).message, /새 옷/);
});

test('catalog source is a loadable module', async () => {
  const url = 'data:text/javascript;base64,' + Buffer.from(catalogSource([shirt])).toString('base64');
  const { CUSTOM_SHOP: loaded } = await import(url);
  assert.deepEqual(loaded, [shirt]);
});

test('studio hats can be bought, worn and hidden', () => {
  applyCustomShop([beret, tee]);
  assert.ok(HATS.some(h => h.id === 'graduate')); assert.ok(HATS.some(h => h.id === 'berry-beret' && h.custom.image === '/shop/berry-beret.svg?v=8'));
  assert.equal(OUTFITS.find(o => o.id === 'star-tee').custom.collar.image, '/shop/star-tee-collar.svg?v=7');
  let s = act(pug(100), 'buy_hat', { hat: 'berry-beret' }).state;
  assert.equal(s.progress.biscuits, 45); assert.ok(s.progress.ownedHats.includes('berry-beret'));
  const worn = act(s, 'equip_hat', { hat: 'berry-beret' });
  assert.equal(worn.state.progress.hat, 'berry-beret'); assert.match(worn.message, /딸기 베레모 잘 어울려/);
  assert.throws(() => act(s, 'buy_hat', { hat: 'berry-beret' }), /이미 가지고/);
  assert.throws(() => act(pug(100), 'buy_hat', { hat: 'graduate' }), /팔지 않는/);
  assert.throws(() => act(pug(10), 'buy_hat', { hat: 'berry-beret' }), /부족/);
  applyCustomShop([{ ...beret, hidden: true }]);
  assert.throws(() => act(pug(100), 'buy_hat', { hat: 'berry-beret' }), /팔지 않는/);
  assert.equal(act(s, 'equip_hat', { hat: 'berry-beret' }).state.progress.hat, 'berry-beret');
  assert.ok(publicState(s, clock).hats.some(h => h.id === 'berry-beret'));
});
