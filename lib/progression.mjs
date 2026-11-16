import { randomBytes } from 'node:crypto';
import { ensureExploration, roll } from './exploration.mjs';
export const FOCUS_RULES = Object.freeze({ interval: 300, biscuits: 1, maxBiscuits: 2, maxSeconds: 14400, recovery: .05 });
export const HATS = Object.freeze([
  { id: 'graduate', name: '꼬마 학사모', source: '지식 30 달성', color: '#45414d', kind: 'hat', price: 0 },
]);
export function newFocusReward() { return { rewardMode: 'gentle', rewardSeed: randomBytes(16).toString('hex') }; }
export const ROOM_ITEMS = Object.freeze([
  { id: 'tennis', name: '통통 테니스공', kind: 'toy', price: 24, detail: '앞발로 굴리며 놀아요' },
  { id: 'duck', name: '삑삑 오리', kind: 'toy', price: 42, detail: '콕콕 누르면 삑!' },
  { id: 'rope', name: '꼬임 로프', kind: 'toy', price: 60, detail: '앞발로 당기며 놀아요' },
  { id: 'lamp', name: '버섯 조명', kind: 'furniture', price: 65, detail: '방 한쪽을 따뜻하게' },
  { id: 'bed', name: '푹신 구름 방석', kind: 'furniture', price: 80, detail: '퍼그 자리의 새 방석' },
  { id: 'speaker', name: '미니 록 스피커', kind: 'furniture', price: 95, detail: '동행 중 리듬을 타요' },
  { id: 'shelf', name: '작은 책장', kind: 'furniture', price: 110, detail: '좋아하는 책을 나란히' },
]);
export const OUTFITS = Object.freeze([
  { id: 'christmas', name: '크리스마스 니트', color: '#b85d55', mark: '❄', source: '크리스마스 3일 출석', price: 0 },
  { id: 'peach', name: '복숭아 조끼', color: '#e8a28f', mark: '♥', source: '첫 돌봄 퀘스트', price: 0 },
  { id: 'sailor', name: '바다 줄무늬', color: '#8bb5c8', mark: '≋', source: '산책 친구 퀘스트', price: 0 },
  { id: 'dream', name: '별빛 잠옷', color: '#a99bc7', mark: '✦', source: '작업 친구 퀘스트', price: 0 },
  { id: 'lavender', name: '라일락 니트', color: '#bc9fbe', mark: '❀', source: '재주둥이 퀘스트', price: 0 },
  { id: 'honey', name: '꿀벌 티셔츠', color: '#e5c36f', mark: '✿', source: '비스킷 상점', price: 80 },
  { id: 'mint', name: '새싹 조끼', color: '#97bca3', mark: '♡', source: '가벼운 첫 한 벌', price: 18 },
  { id: 'rose', name: '딸기우유 땡땡이', color: '#dfadbb', mark: '●', source: '포근한 데일리', price: 30 },
  { id: 'picnic', name: '피크닉 체크', color: '#d6ac78', mark: '▦', source: '소풍 가는 날', price: 45 },
  { id: 'cloud', name: '구름 산책복', color: '#a2c6db', mark: '☁', source: '산뜻한 오후', price: 60 },
  { id: 'berry', name: '딸기 정원', color: '#f0d9c0', mark: '♥', source: '달콤한 작은 정원', price: 95 },
  { id: 'forest', name: '숲속 탐험복', color: '#759a7f', mark: '♧', source: '초록빛 모험', price: 110 },
  { id: 'denim', name: '작은 청멜빵', color: '#7693b5', mark: '▣', source: '차곡차곡 모은 선물', price: 150 },
  { id: 'rocker', name: '퍼그 락커 조끼', color: '#414148', mark: 'ϟ', source: '지퍼와 실버 스터드', price: 130 },
  { id: 'royal', name: '밤하늘 별셔츠', color: '#606d96', mark: '✦', source: '오래 함께한 기념', price: 200 },
]);
export function ensureProgress(s) {
  s.progress ??= { biscuits: 0, pending: 0, owned: [], equipped: null, claimed: [], dailyClaimed: [],
    totals: { feed: s.daily.feed || 0, pet: s.daily.pet || 0, practice: s.daily.train || 0, walkSeconds: 0, focusSeconds: 0 } };
  s.daily.walkSeconds ??= 0; s.daily.focusSeconds ??= 0;
  s.progress.ownedItems ??= [];
  s.progress.placedItems ??= [...s.progress.ownedItems];
  s.progress.ownedHats ??= [];
  s.progress.hat ??= null;
  // Settle elapsed legacy time once before switching future intervals to the new rate.
  if (s.activity?.kind === 'focus' && s.activity.rewardMode !== 'gentle') s.activity.biscuitsPerInterval ??= 5;
  ensureExploration(s);
  s.version = 4;
}
const care = stats => Math.min(1, stats.feed) + Math.min(3, stats.pet);
export function quests(s) {
  const t = s.progress.totals;
  const definitions = [
    { id: 'first-care', title: '우리, 가족이 되자', detail: '밥 1번 + 쓰다듬기 3번', value: care(t), target: 4, reward: 10, outfit: 'peach' },
    { id: 'first-walk', title: '같이 걷는 길', detail: '누적 산책 2분 · 걷기와 달리기 모두 포함', value: t.walkSeconds, target: 120, reward: 15, outfit: 'sailor', unit: '초' },
    { id: 'first-focus', title: '너는 작업, 나는 응원', detail: '집중 동행 누적 5분', value: t.focusSeconds, target: 300, reward: 15, outfit: 'dream', unit: '초' },
    { id: 'practice', title: '우리 집 재주둥이', detail: '훈련 또는 배운 개인기 보여주기 10번', value: t.practice, target: 10, reward: 20, outfit: 'lavender' },
    { id: 'focus-friend', title: '든든한 작업 친구', detail: '집중 동행 누적 25분', value: t.focusSeconds, target: 1500, reward: 30, unit: '초' },
    { id: 'knowledge-10', category: 'study', title: '호기심 많은 퍼그', detail: '지식 10 달성', value: s.study?.peakKnowledge || 0, target: 10, reward: 10 },
    { id: 'knowledge-30', category: 'study', title: '꼬마 학자의 첫 졸업', detail: '지식 30 달성', value: s.study?.peakKnowledge || 0, target: 30, reward: 20, hat: 'graduate' },
    { id: 'knowledge-60', category: 'study', title: '척척박사로 한 걸음', detail: '지식 60 달성', value: s.study?.peakKnowledge || 0, target: 60, reward: 35 },
    { id: 'knowledge-100', category: 'study', title: '우리 집 퍼그 박사', detail: '지식 100 달성', value: s.study?.peakKnowledge || 0, target: 100, reward: 50 },
    { id: 'daily-care', title: '오늘의 다정한 돌봄', detail: '오늘 밥 1번 + 쓰다듬기 3번', value: care(s.daily), target: 4, reward: 10, daily: true },
    { id: 'daily-walk', title: '오늘도 바람 쐬기', detail: '오늘 산책 1분', value: s.daily.walkSeconds, target: 60, reward: 15, daily: true, unit: '초' },
    { id: 'daily-focus', title: '나란히 보내는 시간', detail: '오늘 집중 동행 10분', value: s.daily.focusSeconds, target: 600, reward: 20, daily: true, unit: '초' },
    {
      id: 'meal-lover-15',
      title: '밥그릇 설거지 담당',
      detail: '밥 누적 15번 · 오늘도 싹싹 비웠어요',
      value: t.feed,
      target: 15,
      reward: 10,
    },
    {
      id: 'pet-lover-50',
      title: '쓰담 중독 퍼그',
      detail: '쓰다듬기 누적 50번 · 손 멈추지 마!',
      value: t.pet,
      target: 50,
      reward: 10,
    },
    {
      id: 'walk-sniffer-1200',
      title: '동네 냄새 감별사',
      detail: '산책 누적 20분 · 이 나무는 내가 알아',
      value: t.walkSeconds,
      target: 1200,
      reward: 15,
      unit: '초',
    },
    {
      id: 'focus-companion-10800',
      title: '너 일해, 나 옆에 있을게',
      detail: '집중 동행 누적 3시간 · 같이 있으면 좋아',
      value: t.focusSeconds,
      target: 10800,
      reward: 20,
      unit: '초',
    },
    {
      id: 'study-snacker-100',
      category: 'study',
      title: '단어 먹는 퍼그',
      detail: '단어 누적 100개 정답 · 지식도 냠냠',
      value: s.study?.total || 0,
      target: 100,
      reward: 15,
    },
  ];
  return definitions.map(q => ({ ...q, value: Math.min(q.target, q.category === 'study' ? q.value : Math.floor(q.value)), claimed: (q.daily ? s.progress.dailyClaimed : s.progress.claimed).includes(q.id) }));
}
export function recordSeconds(s, kind, start, end) {
  const seconds = Math.max(0, end - start) / 1000;
  const key = `${kind}Seconds`;
  s.progress.totals[key] = Math.round((s.progress.totals[key] + seconds) * 1000) / 1000;
  const dayStart = s.day * 86400000 - 9 * 3600000;
  s.daily[key] = Math.round((s.daily[key] + Math.max(0, end - Math.max(start, dayStart)) / 1000) * 1000) / 1000;
}
export function settleFocus(s, now) {
  const a = s.activity;
  const end = Math.max(a.updatedAt, Math.min(now, a.endsAt));
  const before = Math.floor(s.progress.totals.focusSeconds / FOCUS_RULES.interval);
  recordSeconds(s, 'focus', a.updatedAt, end);
  const after = Math.floor(s.progress.totals.focusSeconds / FOCUS_RULES.interval);
  if (a.rewardMode === 'gentle') {
    for (let i = before + 1; i <= after; i++) s.progress.pending += 1 + Math.floor(roll(a.rewardSeed, i) * 2);
  } else {
    s.progress.pending += (after - before) * a.biscuitsPerInterval;
    Object.assign(a, newFocusReward());
    delete a.biscuitsPerInterval;
  }
  s.energy = Math.min(100, s.energy + (end - a.updatedAt) / 1000 * FOCUS_RULES.recovery);
  a.updatedAt = end;
  if (now >= a.endsAt) { s.activity = null; return true; }
  return false;
}
