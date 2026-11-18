import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { transact } from '../lib/store.mjs';
import { OUTFITS } from '../lib/progression.mjs';
const T = Date.parse('2026-10-26T03:00:00Z');
function pug(at = T) { const s = createState(at); s.name = '모찌'; s.leashColor = 'mint'; return s; }
function action(type, at, extra = {}) { return { type, id: randomUUID(), sentAt: at, ...extra }; }
function act(s, type, at = T, extra = {}) { return transition(s, action(type, at, extra), at, () => .999).state; }
const refresh = (s, at) => transition(s, { type: 'refresh' }, at).state;
const quest = (s, id) => publicState(s).quests.find(q => q.id === id);
function completedCare() { let s = act(pug(), 'feed'); for (let i = 1; i <= 3; i++) s = act(s, 'pet', T + i * 1000); return s; }

test('new and legacy saves gain collections without losing their pug; migration is idempotent', () => {
  const s = pug(); s.affection = 75; s.tricks = ['down']; s.daily.feed = 2; s.daily.pet = 4; delete s.progress;
  const upgraded = refresh(s, T);
  assert.equal(upgraded.affection, 75); assert.deepEqual(upgraded.tricks, ['down']); assert.equal(upgraded.leashColor, 'mint');
  assert.equal(quest(upgraded, 'first-care').value, 4); assert.equal(upgraded.progress.biscuits, 0);
  assert.deepEqual(refresh(upgraded, T + 1000).progress, upgraded.progress);
});
test('care quest grants currency and an outfit only after every task is complete', () => {
  assert.throws(() => act(pug(), 'claim_quest', T, { quest: 'first-care' }), /완료하지/);
  const s = act(completedCare(), 'claim_quest', T + 4000, { quest: 'first-care' });
  assert.equal(s.progress.biscuits, 10); assert.deepEqual(s.progress.owned, ['peach']);
  assert.equal(quest(s, 'first-care').claimed, true);
  assert.throws(() => act(s, 'claim_quest', T + 5000, { quest: 'first-care' }), /이미 받은/);
  assert.equal(act(s, 'equip', T + 5000, { outfit: 'peach' }).progress.equipped, 'peach');
  assert.throws(() => act(s, 'equip', T + 5000, { outfit: 'dream' }), /아직 갖고/);
});
test('quest replay cannot grant duplicate rewards, and client-supplied rewards are ignored', () => {
  const request = action('claim_quest', T + 4000, { quest: 'first-care', reward: 9999, outfit: 'honey' });
  const s = transition(completedCare(), request, T + 4000).state;
  const again = transition(s, request, T + 5000).state;
  assert.equal(again.progress.biscuits, 10); assert.deepEqual(again.progress.owned, ['peach']);
});
test('daily claims reset at KST midnight, while wardrobe, balance and story progress persist', () => {
  let s = act(completedCare(), 'claim_quest', T + 4000, { quest: 'daily-care', day: pug().day });
  s = act(s, 'claim_quest', T + 5000, { quest: 'first-care' });
  const later = refresh(s, Date.parse('2026-10-26T15:00:00Z'));
  assert.equal(later.progress.biscuits, 20); assert.deepEqual(later.progress.owned, ['peach']);
  assert.equal(quest(later, 'daily-care').value, 0); assert.equal(quest(later, 'daily-care').claimed, false);
  assert.equal(quest(later, 'first-care').claimed, true);
  assert.throws(() => act(later, 'claim_quest', Date.parse('2026-10-26T15:00:01Z'), { quest: 'daily-care', day: s.day }), /새 하루/);
});
test('walk quests count actual time, stop at exhaustion, and cannot be farmed by repeated starts', () => {
  let s = act(pug(), 'walk'); s = act(s, 'end_walk', T + 1000); s = act(s, 'walk', T + 2000);
  assert.equal(quest(s, 'first-walk').value, 1);
  s = refresh(s, T + 121000); assert.equal(quest(s, 'first-walk').value, 120);
  const tired = pug(); tired.energy = 1;
  const exhausted = refresh(act(tired, 'walk'), T + 100000);
  assert.equal(exhausted.progress.totals.walkSeconds, 5); assert.equal(exhausted.activity, null);
});
test('walk duration is split correctly at midnight even without refreshes', () => {
  const start = Date.parse('2026-10-26T14:59:30Z');
  const s = refresh(act(pug(start), 'walk', start), start + 60000);
  assert.equal(s.progress.totals.walkSeconds, 60); assert.equal(s.daily.walkSeconds, 30);
});
test('focus only generates gifts after an explicit start, uses server elapsed time and recovers energy', () => {
  assert.equal(refresh(pug(), T + 3600000).progress.pending, 0);
  const original = pug(); original.energy = 40;
  const s = act(original, 'start_focus', T, { endsAt: T + 999999999, biscuits: 9999 });
  assert.equal(refresh(s, T + 299000).progress.pending, 0);
  const later = refresh(s, T + 300000);
  assert.ok([1, 2].includes(later.progress.pending)); assert.equal(later.energy, 55);
  assert.equal(later.progress.biscuits, 0); assert.equal(quest(later, 'first-focus').value, 300);
  assert.equal(refresh(later, T + 300000).progress.pending, later.progress.pending);
});
test('focus caps at four hours offline and does not accrue while stopped', () => {
  const s = refresh(act(pug(), 'start_focus'), T + 86400000);
  assert.equal(s.activity, null); assert.ok(s.progress.pending >= 48 && s.progress.pending <= 96); assert.equal(s.energy, 100);
  assert.equal(s.progress.totals.focusSeconds, 14400);
  assert.equal(refresh(s, T + 2 * 86400000).progress.pending, s.progress.pending);
  assert.equal(s.daily.focusSeconds, 0);
});
test('focus carries partial gift progress between sessions and accounts across midnight', () => {
  let s = act(pug(), 'start_focus'); s = act(s, 'end_focus', T + 100000);
  assert.equal(refresh(s, T + 200000).progress.totals.focusSeconds, 100);
  s = act(s, 'start_focus', T + 200000); s = refresh(s, T + 400000);
  assert.ok([1, 2].includes(s.progress.pending));
  const start = Date.parse('2026-10-26T14:58:00Z');
  const overnight = refresh(act(pug(start), 'start_focus', start), start + 300000);
  assert.equal(overnight.daily.focusSeconds, 180); assert.ok([1, 2].includes(overnight.progress.pending));
});
test('many refreshes preserve the exact focus reward boundary without drift', () => {
  let s = act(pug(), 'start_focus'); const bulk = refresh(s, T + 300000);
  for (let ms = 777; ms < 300000; ms += 777) s = refresh(s, T + ms);
  s = refresh(s, T + 300000); assert.equal(s.progress.pending, bulk.progress.pending); assert.equal(s.progress.totals.focusSeconds, 300);
});
test('collecting focus gifts is idempotent, and collection does not stop focus', () => {
  const request = action('collect_focus', T + 300000);
  const s = transition(act(pug(), 'start_focus'), request, T + 300000).state;
  assert.equal(s.progress.pending, 0); assert.ok([1, 2].includes(s.progress.biscuits)); assert.equal(s.activity.kind, 'focus');
  assert.equal(transition(s, request, T + 301000).state.progress.biscuits, s.progress.biscuits);
  assert.throws(() => act(s, 'collect_focus', T + 301000), /まだ|아직/);
});
test('focus allows wardrobe and rewards but blocks care until stopped; full energy still permits focus', () => {
  let s = act(completedCare(), 'start_focus', T + 4000);
  assert.equal(s.activity.kind, 'focus');
  for (const type of ['feed', 'pet', 'walk', 'sleep', 'start_focus', 'train', 'wake', 'end_walk']) assert.throws(() => act(s, type, T + 5000), /집중 동행/);
  s = act(s, 'claim_quest', T + 5000, { quest: 'first-care' });
  s = act(s, 'equip', T + 6000, { outfit: 'peach' }); assert.equal(s.activity.kind, 'focus');
});
test('store purchases charge once, reject insufficient funds and quest-only items', () => {
  const p = pug(); p.progress.biscuits = 79;
  assert.throws(() => act(p, 'buy_outfit', T, { outfit: 'honey' }), /부족/);
  p.progress.biscuits = 80;
  const s = act(p, 'buy_outfit', T, { outfit: 'honey' });
  assert.equal(s.progress.biscuits, 0); assert.deepEqual(s.progress.owned, ['honey']);
  assert.throws(() => act(s, 'buy_outfit', T + 1000, { outfit: 'honey' }), /이미/);
  assert.throws(() => act(p, 'buy_outfit', T, { outfit: 'dream' }), /퀘스트/);
});
test('already learned tricks still advance practice quests', () => {
  let s = pug(); s.tricks = ['down'];
  for (let i = 0; i < 10; i++) s = act(s, 'perform', T + i * 1000, { trick: 'down' });
  assert.equal(quest(s, 'practice').value, 10); assert.equal(s.daily.train, 0);
});
test('concurrent claim requests grant the quest reward once', async () => {
  const store = { row: { state: completedCare(), revision: 0 },
    async read() { await Promise.resolve(); return structuredClone(this.row); },
    async compareAndSwap(key, rev, state) { if (this.row.revision !== rev) return false; this.row = { state, revision: rev + 1 }; return true; } };
  const request = action('claim_quest', T + 5000, { quest: 'first-care' });
  await Promise.all([transact(store, 'pug', request, () => T + 5000), transact(store, 'pug', request, () => T + 5000)]);
  assert.equal(store.row.state.progress.biscuits, 10); assert.deepEqual(store.row.state.progress.owned, ['peach']);
});

test('gentler focus takes 45–90 minutes for the entry outfit and cannot buy the premium set in one session', () => {
  let s = act(pug(), 'start_focus');
  s = act(s, 'collect_focus', T + 1800000);
  assert.ok(s.progress.biscuits >= 6 && s.progress.biscuits <= 12);
  assert.throws(() => act(s, 'buy_outfit', T + 1801000, { outfit: 'mint' }), /부족/);
  s = act(s, 'collect_focus', T + 5400000); const balance = s.progress.biscuits;
  assert.ok(balance >= 18 && balance <= 36);
  s = act(s, 'buy_outfit', T + 5401000, { outfit: 'mint' });
  assert.equal(s.progress.biscuits, balance - 18); assert.ok(s.progress.owned.includes('mint'));
  const cap = act(act(pug(), 'start_focus'), 'collect_focus', T + 14400000);
  assert.ok(cap.progress.biscuits >= 48 && cap.progress.biscuits <= 96);
  assert.throws(() => act(cap, 'buy_outfit', T + 14401000, { outfit: 'royal' }), /부족/);
});

test('earned savings survive migration and an ongoing legacy session switches future rewards', () => {
  let old = act(pug(), 'start_focus'); delete old.activity.biscuitsPerInterval; old.version = 3;
  delete old.activity.rewardMode; delete old.activity.rewardSeed;
  old.progress.biscuits = 123; old.progress.pending = 15; old.progress.owned = ['honey']; old.progress.equipped = 'honey';
  old = refresh(old, T + 600000);
  assert.equal(old.version, 4); assert.equal(old.progress.pending, 25); assert.equal(old.progress.biscuits, 123);
  assert.equal(old.progress.equipped, 'honey'); assert.deepEqual(old.progress.owned, ['honey']);
  assert.equal(old.activity.rewardMode, 'gentle');
  assert.ok([26, 27].includes(refresh(old, T + 900000).progress.pending));
  old = act(old, 'end_focus', T + 601000);
  const next = act(old, 'start_focus', T + 602000);
  assert.equal(next.activity.rewardMode, 'gentle');
});

test('every one of the ten store outfits can be purchased and worn without granting quest outfits', () => {
  const shop = OUTFITS.filter(o => o.price > 0 && !o.custom); assert.equal(shop.length, 10);
  for (const outfit of shop) {
    const s = pug(); s.progress.biscuits = outfit.price;
    const bought = act(s, 'buy_outfit', T, { outfit: outfit.id });
    assert.equal(bought.progress.biscuits, 0); assert.deepEqual(bought.progress.owned, [outfit.id]);
    const dressed = act(bought, 'equip', T + 1000, { outfit: outfit.id });
    assert.equal(refresh(dressed, T + 2000).progress.equipped, outfit.id);
  }
});

