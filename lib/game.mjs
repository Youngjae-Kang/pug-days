import { ensureChristmas, christmasView, christmasWalk, christmasAction } from './christmas.mjs';
import { FOCUS_RULES, OUTFITS, HATS, ROOM_ITEMS, ensureProgress, quests, recordSeconds, settleFocus, newFocusReward } from './progression.mjs';
import { DISCOVERIES, WALK_RULES, settleWalkEvents } from './exploration.mjs';
import { dailyFortune } from './fortune.mjs';
import { ensureStudy, studyView, studyAction } from './study.mjs';
export const TRICKS = { down: '엎드려', bang: '빵야', stand: '일어서', paw: '손' };
export const LEASH_COLORS = ['coral', 'mint', 'blue', 'lilac', 'yellow'];
export const RULES = Object.freeze({ feedLimit: 3, trainLimit: 5, feedGain: 5, walkGain: 8, petGain: 3, walkRewards: 2, petRewards: 5, neglectLoss: 3, maxEnergy: 100, feedEnergy: 20, petEnergy: 5, trainEnergy: 12, walkDrain: .2, runDrain: .5, sleepRecovery: 2 });
const PETS = new Set(['pet', 'butt', 'belly']);
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function dayNumber(now = Date.now()) { return Math.floor((now + 9 * 3600000) / 86400000); }
export function dayLabel(day) { return new Date(day * 86400000).toISOString().slice(0, 10); }
const emptyDaily = () => ({ feed: 0, walk: 0, pet: 0, train: 0, muzzle: 0, walkSeconds: 0, focusSeconds: 0 });
export function createState(now = Date.now(), cheat = false) {
  const state = { version: 3, name: null, cheat, leashColor: null, energy: 100, activity: null, affection: cheat ? 100 : 0, day: dayNumber(now), daily: emptyDaily(), tricks: [], logs: [], receipts: [], lastActionAt: 0, createdAt: now };
  ensureProgress(state); ensureStudy(state, now); ensureChristmas(state, now); return state;
}
function log(s, message, now) { s.logs.unshift({ message, at: now }); s.logs = s.logs.slice(0, 16); }
export function energyRate(s) {
  if (s.activity?.kind === 'focus') return FOCUS_RULES.recovery;
  if (s.activity?.kind === 'sleep') return RULES.sleepRecovery;
  if (s.activity?.kind !== 'walk' || s.cheat) return 0;
  return -(s.activity.mode === 'run' ? RULES.runDrain : RULES.walkDrain);
}
export function settleEnergy(s, now) {
  s.energy ??= RULES.maxEnergy; s.activity ??= null;
  if (!s.activity) return;
  if (s.activity.kind === 'focus') {
    const endedAt = s.activity.endsAt;
    if (settleFocus(s, now)) log(s, `${s.name}, 4시간 동안 함께했어요. 준비한 선물을 받아주세요!`, endedAt);
    return;
  }
  const elapsed = Math.max(0, now - s.activity.updatedAt) / 1000;
  const rate = energyRate(s), previous = s.energy;
  if (s.activity.kind === 'walk') {
    const seconds = rate < 0 ? Math.min(elapsed, previous / -rate) : elapsed;
    const before = s.progress.totals.walkSeconds;
    recordSeconds(s, 'walk', s.activity.updatedAt, s.activity.updatedAt + seconds * 1000);
    settleWalkEvents(s, before, s.activity.updatedAt);
    christmasWalk(s, before, s.activity.updatedAt);
  }
  s.energy = Math.round(Math.max(0, Math.min(RULES.maxEnergy, previous + elapsed * rate)) * 1000) / 1000;
  if (s.activity.kind === 'walk' && s.energy <= 0) {
    const endedAt = s.activity.updatedAt + previous / -rate * 1000;
    s.activity = null;
    log(s, `${s.name}, 체력이 다 떨어졌어요. 산책을 마치고 집으로 돌아왔어요.`, endedAt);
  } else if (s.activity.kind === 'sleep' && s.energy >= RULES.maxEnergy) {
    const endedAt = s.activity.updatedAt + (RULES.maxEnergy - previous) / rate * 1000;
    s.activity = null;
    log(s, `${s.name}, 푹 잤어요! 체력이 모두 회복돼서 일어났어요.`, endedAt);
  } else s.activity.updatedAt = Math.max(s.activity.updatedAt, now);
}
export function rollDay(s, now) {
  const today = dayNumber(now), days = today - s.day;
  if (days <= 0) return;
  if (s.name && !s.cheat) {
    const missing = ['feed', 'walk', 'pet'].filter(k => s.daily[k] === 0).length;
    const loss = Math.min(s.affection, RULES.neglectLoss * (missing + 3 * (days - 1)));
    s.affection -= loss;
    if (loss) log(s, `돌보지 못한 날의 친밀도 −${loss}. 오늘 다시 함께해요.`, now);
  }
  s.day = today; s.daily = emptyDaily();
  if (s.progress) s.progress.dailyClaimed = [];
}
export function chance(s) { return s.cheat ? 1 : (15 + 0.8 * s.affection) / 100; }
export function publicState(s, now = Date.now()) {
  const { receipts, lastActionAt, exploration, ...safe } = s;
  safe.exploration = exploration ? { found: exploration.found, lastEvent: exploration.lastEvent } : { found: {}, lastEvent: null };
  safe.discoveries = DISCOVERIES; safe.walkRules = WALK_RULES;
  safe.study = studyView(s.study);
  safe.christmas = christmasView(s, now);
  safe.hats = HATS;
  if (safe.activity?.rewardSeed) { safe.activity = { ...safe.activity }; delete safe.activity.rewardSeed; }
  return { ...safe, roomItems: ROOM_ITEMS, fortune: dailyFortune(s.day), quests: s.progress ? quests(s) : [], outfits: OUTFITS, focusRules: FOCUS_RULES, energyRate: energyRate(s), chance: Math.round(chance(s) * 100), rules: RULES, date: dayLabel(s.day), resetsAt: (s.day + 1) * 86400000 - 9 * 3600000, serverTime: now };
}
export function transition(original, action, now = Date.now(), random = Math.random) {
  let s = structuredClone(original);
  s.leashColor ??= null;
  ensureProgress(s);
  ensureStudy(s, now);
  ensureChristmas(s, now);
  rollDay(s, now);
  settleEnergy(s, now);
  let message = '', animation = '';
  if (action.type === 'refresh') return { state: s, message, animation };
  if (typeof action.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(action.id)) throw new GameError('요청 번호가 올바르지 않아요.');
  // Ignore requests older than the retry window instead of replaying expired IDs.
  if (!Number.isFinite(action.sentAt) || now - action.sentAt > 300000 || action.sentAt - now > 10000) throw new GameError('요청 시간이 만료됐어요. 새로고침 후 다시 해주세요.', 409);
  const receipt = s.receipts.find(r => r.id === action.id);
  if (receipt) return { state: s, message: receipt.message, animation: receipt.animation };
  if (now - s.lastActionAt < (action.type === 'study_match' ? 100 : 350)) throw new GameError('퍼그가 반응할 시간을 조금만 주세요.', 429);
  if (action.type === 'name') {
    if (s.name) throw new GameError('이미 이름이 있는 퍼그예요.');
    const name = typeof action.name === 'string' ? action.name.normalize('NFC').trim() : '';
    if (!name || Array.from(name).length > 12 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new GameError('이름은 공백만 빼고 1~12자로 지어주세요.');
    if (name === '똥퍼그' && !s.cheat) {
      s = createState(now, true);
      message = '비밀 문이 열렸어요! 치트모드로 처음부터 시작해요. 이름을 다시 지어주세요.';
    } else {
      s.name = name; s.affection = s.cheat ? 100 : 0; s.day = dayNumber(now); s.daily = emptyDaily();
      message = `${name}, 우리 오늘부터 가족이야!`; animation = 'love';
    }
  } else {
    if (!s.name) throw new GameError('먼저 퍼그 이름을 지어주세요.');
    const wardrobeAction = action.type.startsWith('christmas_') || ['claim_quest', 'collect_focus', 'equip', 'equip_hat', 'buy_outfit', 'buy_item', 'place_item'].includes(action.type);
    const studyRequest = ['vocab_upload', 'vocab_edit', 'vocab_delete', 'study_start', 'study_pause', 'study_resume', 'study_stop', 'study_match', 'study_review_start', 'study_review_grade'].includes(action.type);
    if (['active', 'paused'].includes(s.study.session?.status) && !studyRequest && !wardrobeAction) throw new GameError('공부를 마치거나 그만둔 뒤 함께 놀아요.');
    if (!wardrobeAction && s.activity?.kind === 'walk' && !['walk_mode', 'end_walk'].includes(action.type)) throw new GameError('산책을 마치고 집으로 돌아온 다음 해주세요.');
    if (!wardrobeAction && s.activity?.kind === 'sleep' && action.type !== 'wake') throw new GameError('지금은 자고 있어요. 먼저 깨워주세요.');
    if (!wardrobeAction && s.activity?.kind === 'focus' && action.type !== 'end_focus') throw new GameError('집중 동행을 마친 다음 함께 놀아요.');
    let gain = 0;
    if (action.type.startsWith('christmas_')) {
      message = christmasAction(s, action, now);
    } else if (studyRequest) {
      message = studyAction(s, action, now, random);
    } else if (action.type === 'claim_quest') {
      const quest = quests(s).find(q => q.id === action.quest);
      if (!quest) throw new GameError('퀘스트를 찾지 못했어요.');
      if (quest.daily && action.day !== s.day) throw new GameError('새 하루가 시작됐어요. 오늘의 퀘스트를 확인해주세요.', 409);
      if (quest.claimed) throw new GameError('이미 받은 보상이에요.');
      if (quest.value < quest.target) throw new GameError('아직 퀘스트를 완료하지 못했어요.');
      (quest.daily ? s.progress.dailyClaimed : s.progress.claimed).push(quest.id);
      s.progress.biscuits += quest.reward;
      if (quest.outfit && !s.progress.owned.includes(quest.outfit)) s.progress.owned.push(quest.outfit);
      if (quest.hat && !s.progress.ownedHats.includes(quest.hat)) s.progress.ownedHats.push(quest.hat);
      const gift = quest.hat ? HATS.find(h => h.id === quest.hat) : OUTFITS.find(o => o.id === quest.outfit);
      message = `${quest.title} 완료! 비스킷 ${quest.reward}개${gift ? `와 ${gift.name}` : ''}를 받았어요.`;
      animation = 'love';
    } else if (action.type === 'equip_hat') {
      if (action.hat !== null && (!HATS.some(h => h.id === action.hat) || !s.progress.ownedHats.includes(action.hat))) throw new GameError('아직 갖고 있지 않은 모자예요.');
      s.progress.hat = action.hat;
      message = action.hat ? `${s.name}, 학사모가 잘 어울려!` : '모자를 벗었어요.';
    } else if (action.type === 'equip') {
      if (action.outfit !== null && !s.progress.owned.includes(action.outfit)) throw new GameError('아직 갖고 있지 않은 옷이에요.');
      s.progress.equipped = action.outfit;
      message = action.outfit === null ? `${s.name}, 보송보송한 털도 예뻐!` : `${s.name}, ${OUTFITS.find(o => o.id === action.outfit).name} 정말 잘 어울려!`;
    } else if (action.type === 'buy_outfit') {
      const outfit = OUTFITS.find(o => o.id === action.outfit && o.price > 0);
      if (!outfit) throw new GameError('이 옷은 퀘스트 보상으로 받을 수 있어요.');
      if (s.progress.owned.includes(outfit.id)) throw new GameError('이미 가지고 있는 옷이에요.');
      if (s.progress.biscuits < outfit.price) throw new GameError('비스킷이 부족해요. 퀘스트나 집중 동행으로 모아주세요.');
      s.progress.biscuits -= outfit.price; s.progress.owned.push(outfit.id);
      message = `${outfit.name}를 샀어요! 옷장에서 입혀주세요.`;
    } else if (action.type === 'buy_item') {
      const item = ROOM_ITEMS.find(item => item.id === action.item);
      if (!item) throw new GameError('물건을 찾지 못했어요.');
      if (s.progress.ownedItems.includes(item.id)) throw new GameError('이미 가지고 있는 물건이에요.');
      if (s.progress.biscuits < item.price) throw new GameError('비스킷이 부족해요.');
      s.progress.biscuits -= item.price;
      s.progress.ownedItems.push(item.id); s.progress.placedItems.push(item.id);
      message = `${item.name} 구매 완료! 방에 놓았어요.`;
    } else if (action.type === 'place_item') {
      const item = ROOM_ITEMS.find(item => item.id === action.item);
      if (!item || !s.progress.ownedItems.includes(item.id)) throw new GameError('아직 가지고 있지 않은 물건이에요.');
      if (typeof action.placed !== 'boolean') throw new GameError('놓기 또는 치우기를 선택해주세요.');
      s.progress.placedItems = s.progress.placedItems.filter(id => id !== item.id);
      if (action.placed) s.progress.placedItems.push(item.id);
      message = `${item.name}${action.placed ? ' 배치 완료!' : ' 보관 완료! 다시 놓을 수 있어요.'}`;
    } else if (action.type === 'start_focus') {
      s.activity = { kind: 'focus', startedAt: now, updatedAt: now, endsAt: now + FOCUS_RULES.maxSeconds * 1000, ...newFocusReward() };
      message = `${s.name}, 옆에서 응원할게! 5분마다 비스킷 1~2개를 준비해요.`;
    } else if (action.type === 'end_focus') {
      if (s.activity?.kind === 'focus') s.activity = null;
      message = `${s.name}, 오늘도 함께해서 좋았어. 준비된 선물은 언제든 받을 수 있어요.`;
    } else if (action.type === 'collect_focus') {
      const reward = s.progress.pending;
      if (!reward) throw new GameError('아직 준비된 선물이 없어요. 5분만 함께 기다려요.');
      s.progress.biscuits += reward; s.progress.pending = 0;
      message = `${s.name}의 응원 선물! 비스킷 ${reward}개를 받았어요.`; animation = 'love';
    } else if (action.type === 'feed') {
      if (!s.cheat && s.daily.feed >= RULES.feedLimit) throw new GameError('오늘 밥은 세 번 모두 먹었어요. 내일 또 주세요!');
      s.daily.feed++; s.progress.totals.feed++; gain = RULES.feedGain; animation = 'eat'; message = `${s.name}, 맘마 먹자! 오독오독, 깨끗하게 비웠어요.`;
      s.energy = Math.min(RULES.maxEnergy, s.energy + RULES.feedEnergy);
    } else if (action.type === 'walk') {
      if (s.energy <= 0) throw new GameError('체력이 없어요. 잠자거나 밥을 먹고 다시 산책해요.');
      if (action.leashColor !== undefined) {
        if (!LEASH_COLORS.includes(action.leashColor)) throw new GameError('목줄 색을 골라주세요.');
        s.leashColor = action.leashColor;
      }
      if (!s.leashColor) throw new GameError('첫 산책이에요! 먼저 목줄 색을 골라주세요.');
      s.daily.walk++; gain = s.daily.walk <= RULES.walkRewards ? RULES.walkGain : 0;
      s.activity = { kind: 'walk', mode: 'walk', updatedAt: now };
      animation = 'walk'; message = `${s.name}, 산책 가자! 풀 냄새를 맡으며 신나게 걸어요.`;
    } else if (action.type === 'walk_mode') {
      if (s.activity?.kind !== 'walk') throw new GameError('먼저 산책을 시작해주세요.');
      if (!['walk', 'run'].includes(action.mode)) throw new GameError('걷기 또는 달리기를 골라주세요.');
      s.activity.mode = action.mode;
      message = action.mode === 'run' ? `${s.name}, 달려보자! 발걸음이 빨라졌어요.` : `${s.name}, 천천히 걷자! 여유롭게 산책해요.`;
    } else if (action.type === 'end_walk') {
      s.activity = null; message = s.energy <= 0 ? `${s.name}, 체력이 다 떨어져 집으로 돌아왔어요.` : `${s.name}, 다녀왔습니다! 이제 집에서 쉬어요.`;
    } else if (action.type === 'sleep') {
      if (s.energy >= RULES.maxEnergy) throw new GameError('체력이 가득해요. 아직은 잠이 오지 않아요!');
      s.activity = { kind: 'sleep', updatedAt: now }; message = `${s.name}, 잘 자. 쿨쿨 자면서 체력을 회복해요.`;
    } else if (action.type === 'wake') {
      s.activity = null; message = `${s.name}, 잘 잤어? 기지개를 쭉 켜요.`; animation = 'love';
    } else if (PETS.has(action.type)) {
      s.daily.pet++; s.progress.totals.pet++; gain = s.daily.pet <= RULES.petRewards ? RULES.petGain : 0;
      s.energy = Math.min(RULES.maxEnergy, s.energy + RULES.petEnergy);
      animation = action.type === 'belly' ? 'belly' : action.type === 'butt' ? 'wiggle' : 'love';
      message = action.type === 'belly' ? `${s.name}, 배가 간질간질! 발을 꼬물거려요.` : action.type === 'butt' ? `${s.name}, 엉덩이 토닥토닥! 꼬리가 씰룩씰룩.` : `${s.name}, 착하지! 손길에 눈을 사르르 감아요.`;
    } else if (action.type === 'muzzle') {
      s.daily.muzzle++; animation = 'squish'; message = `${s.name}, 말랑말랑! 보들보들한 주둥이가 쭈욱 늘어나요.`;
    } else if (action.type === 'train') {
      if (!Object.hasOwn(TRICKS, action.trick)) throw new GameError('배울 개인기를 골라주세요.');
      if (s.tricks.includes(action.trick)) throw new GameError('이미 배운 개인기예요. 개인기 카드에서 시켜보세요!');
      if (!s.cheat && s.daily.train >= RULES.trainLimit) throw new GameError('오늘 훈련은 다 했어요. 내일 다시 도전해요!');
      if (!s.cheat && s.energy < RULES.trainEnergy) throw new GameError('훈련하려면 체력이 12 이상 필요해요. 먼저 쉬어주세요.');
      if (!s.cheat) s.energy -= RULES.trainEnergy;
      s.daily.train++; s.progress.totals.practice++;
      if (random() < chance(s)) {
        s.tricks.push(action.trick); animation = action.trick;
        message = `${s.name}, ${TRICKS[action.trick]}! 성공! 새로운 개인기를 배웠어요.`;
      } else { animation = 'tilt'; message = `${s.name}, ${TRICKS[action.trick]}! ...갸우뚱? 아직 연습이 더 필요해요.`; }
    } else if (action.type === 'perform') {
      if (!s.tricks.includes(action.trick)) throw new GameError('아직 배우지 않은 개인기예요.');
      s.progress.totals.practice++;
      animation = action.trick; message = `${s.name}, ${TRICKS[action.trick]}! 아주 잘했어!`;
    } else throw new GameError('알 수 없는 행동이에요.');
    const actual = Math.min(100 - s.affection, gain);
    s.affection = s.cheat ? 100 : Math.min(100, s.affection + gain);
    if (actual > 0 && !s.cheat) message += ` 친밀도 +${actual}`;
  }
  log(s, message, now);
  s.lastActionAt = now;
  // Include the 10-second forward-clock tolerance in the deduplication window.
  s.receipts = s.receipts.filter(r => now - r.at <= 310000);
  s.receipts.push({ id: action.id, at: now, message, animation });
  return { state: s, message, animation };
}
