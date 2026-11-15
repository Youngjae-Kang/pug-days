import { createHash, randomBytes } from 'node:crypto';
export const WALK_RULES = { interval: 30, findChance: .35, friendChance: .25, eventSeconds: 12 };
export const DISCOVERIES = [
  { id: 'hedgehog', name: '고슴도치 인형', mark: '🦔', detail: '풀숲에 숨어 있던 동글동글 친구.' },
  { id: 'bone', name: '뼈다구', mark: '🦴', detail: '퍼그가 제일 뿌듯하게 물고 온 보물.' },
  { id: 'pinecone', name: '솔방울', mark: '🌰', detail: '나무 아래에서 찾은 작은 숲의 선물.' },
  { id: 'feather', name: '깃털', mark: '🪶', detail: '바람을 따라 사뿐히 내려앉았어요.' },
  { id: 'clover', name: '네잎클로버', mark: '🍀', detail: '네 잎을 하나씩 세어 봤어요.' },
  { id: 'heartstone', name: '하트 돌멩이', mark: '♥', detail: '조약돌 사이에서 찾은 작은 하트.' },
];
export function roll(seed, key) { return createHash('sha256').update(`${seed}:${key}`).digest().readUInt32BE(0) / 4294967296; }
export function ensureExploration(s) {
  s.exploration ??= { seed: randomBytes(16).toString('hex'), checks: Math.floor(s.progress.totals.walkSeconds / WALK_RULES.interval), found: {}, lastEvent: null };
}
export function settleWalkEvents(s, before, startedAt) {
  const e = s.exploration, completed = Math.floor(s.progress.totals.walkSeconds / WALK_RULES.interval);
  // Normal walks have at most 17 checks before exhaustion. Bound long cheat-mode absences too.
  for (let i = Math.max(e.checks + 1, completed - 239); i <= completed; i++) {
    const at = startedAt + Math.max(0, i * WALK_RULES.interval - before) * 1000;
    const chance = roll(e.seed, `encounter:${i}`);
    if (chance < WALK_RULES.findChance) {
      const pick = Math.floor(roll(e.seed, `find:${i}`) * (DISCOVERIES.length + 1));
      if (pick === DISCOVERIES.length) {
        const amount = 1 + Math.floor(roll(e.seed, `coins:${i}`) * 3);
        s.progress.biscuits += amount;
        e.lastEvent = { id: i, kind: 'biscuits', amount, at, until: at + 12000, message: `비스킷 ${amount}개를 주워 왔어요!` };
      } else {
        const item = DISCOVERIES[pick];
        const found = e.found[item.id] ??= { count: 0, firstAt: at };
        found.count++; found.lastAt = at;
        e.lastEvent = { id: i, kind: 'find', item: item.id, at, until: at + 12000, message: `${item.name} 발견! 도감에 기록했어요.` };
      }
    } else if (chance < WALK_RULES.findChance + WALK_RULES.friendChance) {
      const friend = roll(e.seed, `friend:${i}`) < .5 ? '두부' : '밤이';
      e.lastEvent = { id: i, kind: 'friend', friend, at, until: at + 12000, message: `${friend}와 만났어요! 잠깐 같이 놀아요.` };
    } else continue;
    s.logs.unshift({ message: e.lastEvent.message, at }); s.logs = s.logs.slice(0, 16);
  }
  e.checks = completed;
}
