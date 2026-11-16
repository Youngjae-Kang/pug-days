import { randomUUID } from 'node:crypto';
import { roll } from './exploration.mjs';
import { GameError, dayNumber } from './game.mjs';
export const CHRISTMAS = { start: Date.parse('2026-11-16T00:00:00+09:00'), end: Date.parse('2027-01-01T00:00:00+09:00'), goals: [5, 15, 30], dailyDecorations: 6, giftLimit: 3 };
export const activeChristmas = now => now >= CHRISTMAS.start && now < CHRISTMAS.end;
export function ensureChristmas(s, now) {
  s.christmas ??= { joinedAt: now, days: [], claimed: [], decorations: 0, drops: {}, checks: Math.floor(s.progress.totals.walkSeconds / 30), installed: false, accessories: [], giftDays: {}, challenge: null };
  const c = s.christmas;
  if (s.name && activeChristmas(now) && !c.days.includes(dayNumber(now))) c.days.push(dayNumber(now));
}
export function christmasWalk(s, before, startedAt) {
  const c = s.christmas, completed = Math.floor(s.progress.totals.walkSeconds / 30);
  for (let i = Math.max(c.checks + 1, completed - 239); i <= completed; i++) {
    const at = startedAt + Math.max(0, i * 30 - before) * 1000, day = dayNumber(at);
    if (!activeChristmas(at) || at < c.joinedAt || c.decorations >= 30 || (c.drops[day] || 0) >= CHRISTMAS.dailyDecorations) continue;
    if (roll(s.exploration.seed, `christmas-2026:${i}`) < .35) {
      c.decorations++; c.drops[day] = (c.drops[day] || 0) + 1;
      s.logs.unshift({ message: '크리스마스 장식을 주워 왔어요! 트리가 조금 더 반짝여요.', at }); s.logs = s.logs.slice(0, 16);
    }
  }
  c.checks = completed;
}
export function christmasView(s, now) {
  const c = s.christmas;
  return { active: activeChristmas(now), end: CHRISTMAS.end, goals: CHRISTMAS.goals, attendance: c.days.length, attendedToday: c.days.includes(dayNumber(now)), claimed: c.claimed, decorations: c.decorations, dropsToday: c.drops[dayNumber(now)] || 0, dailyDecorations: CHRISTMAS.dailyDecorations, installed: c.installed, accessories: c.accessories, giftsToday: c.giftDays[dayNumber(now)] || 0, giftLimit: CHRISTMAS.giftLimit, challenge: c.challenge };
}
export function christmasAction(s, a, now) {
  const c = s.christmas;
  if (a.type === 'christmas_tree') {
    if (c.decorations < 30 || typeof a.placed !== 'boolean') throw new GameError('장식 30개로 트리를 먼저 완성해주세요.');
    c.installed = a.placed; return a.placed ? '완성한 트리를 방에 놓았어요!' : '트리를 보관했어요.';
  }
  if (a.type === 'christmas_wear') {
    const required = { santa: 1, rudolph: 5 }[a.item];
    if (!required || !c.claimed.includes(required)) throw new GameError('아직 받지 않은 선물이에요.');
    if (c.accessories.includes(a.item)) c.accessories = c.accessories.filter(x => x !== a.item);
    else c.accessories.push(a.item);
    return '크리스마스 단장을 바꿨어요!';
  }
  if (a.type === 'christmas_claim') {
    if (![1, 3, 5, 7].includes(a.day) || c.days.length < a.day || c.claimed.includes(a.day)) throw new GameError('아직 받을 수 없거나 이미 받은 선물이에요.');
    c.claimed.push(a.day);
    if (a.day === 3 && !s.progress.owned.includes('christmas')) s.progress.owned.push('christmas');
    if (a.day === 7) s.progress.biscuits += 15;
    return '출석 선물을 받았어요! 이벤트가 끝나도 계속 간직해요.';
  }
  if (!activeChristmas(now)) throw new GameError('크리스마스 이벤트가 종료됐어요.');
  const day = dayNumber(now);
  if (a.type === 'christmas_gift_start') {
    if ((c.giftDays[day] || 0) >= CHRISTMAS.giftLimit) throw new GameError('오늘의 선물 3개를 모두 던졌어요.');
    if (c.challenge && now < c.challenge.start + 20000) throw new GameError('진행 중인 선물을 먼저 던져주세요.');
    c.giftDays[day] = (c.giftDays[day] || 0) + 1;
    c.challenge = { id: randomUUID(), start: now + 1500, expires: now + 20000 };
    return '썰매가 가운데에 왔을 때 선물을 던져요!';
  }
  if (a.type === 'christmas_gift_throw') {
    const g = c.challenge;
    if (!g || a.challenge !== g.id) throw new GameError('먼저 선물 던지기를 시작해주세요.');
    if (now < g.start) throw new GameError('썰매가 출발하면 던져주세요.');
    const position = (Math.sin((now - g.start) / 1000 * Math.PI / 2) + 1) / 2;
    const hit = now <= g.expires && position >= .25 && position <= .75;
    c.challenge = null; s.progress.biscuits += hit ? 3 : 1;
    return hit ? '선물이 썰매에 쏙! 비스킷 3개를 받았어요.' : '아깝다! 참여 선물로 비스킷 1개를 받았어요.';
  }
  throw new GameError('알 수 없는 크리스마스 행동이에요.');
}
