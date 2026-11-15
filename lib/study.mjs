import { createHash, randomUUID } from 'node:crypto';
import { GameError, dayNumber } from './game.mjs';

export const STUDY_RULES = Object.freeze({ maxWords: 1000, maxFileBytes: 262144, gain: .5, neglectLoss: 3 });
const openSession = session => ['active', 'paused'].includes(session?.status);
const fingerprint = (term, answer) => createHash('sha256').update(JSON.stringify([term, answer])).digest('hex');
function field(value, limit, label) {
  const text = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  if (!text || Array.from(text).length > limit || /[\p{Cc}\p{Cf}]/u.test(text)) throw new GameError(`${label}은 1~${limit}자로 입력해주세요.`);
  return text;
}
function pair(term, answer) { return { term: field(term, 120, '단어'), answer: field(answer, 240, '뜻') }; }
export function parseVocabulary(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > STUDY_RULES.maxFileBytes) throw new GameError('TXT 파일은 256KB까지 올릴 수 있어요.');
  const words = [], seen = new Set();
  for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).entries()) {
    if (!raw.trim()) continue;
    try {
      const line = raw.trim();
      let term, answer;
      if (line.startsWith('"')) {
        // Quotes allow phrases such as "look up" followed by a whitespace separator.
        const match = line.match(/^"((?:[^"\r\n]|"")*)"(?:\s*,\s*|\s+)(.*)$/u);
        if (!match) throw new Error();
        term = match[1].replaceAll('""', '"'); answer = match[2];
      } else {
        // Only the first separator divides the word; spaces inside its meaning stay intact.
        // Keep previously supported comma files readable as well.
        const match = line.match(/^(\S+)\s+(.+)$/u) || line.match(/^([^,]+),(.+)$/u);
        if (!match) throw new Error();
        term = match[1].replace(/,$/, ''); answer = match[2];
      }
      if (answer.startsWith('"')) {
        if (!/^"(?:[^"\r\n]|"")*"$/u.test(answer)) throw new Error();
        answer = answer.slice(1, -1).replaceAll('""', '"');
      }
      const word = pair(term, answer), key = fingerprint(word.term, word.answer);
      if (!seen.has(key)) { seen.add(key); words.push({ id: key, ...word }); }
    } catch { throw new GameError(`${index + 1}번째 줄을 확인해주세요. 단어와 뜻을 띄어쓰기로 나눠주세요. 단어 120자·뜻 240자까지 가능해요.`); }
  }
  if (!words.length) throw new GameError('파일에 단어 뜻을 한 줄에 하나씩 넣어주세요. 예: apple 사과');
  if (words.length > STUDY_RULES.maxWords) throw new GameError('단어는 최대 1,000개까지 저장할 수 있어요.');
  return words;
}
export function ensureStudy(s, now) {
  s.study ??= { words: [], knowledge: 0, day: dayNumber(now), credited: [], total: 0, session: null };
  const study = s.study, days = dayNumber(now) - study.day;
  study.peakKnowledge = Math.max(study.peakKnowledge || 0, study.knowledge);
  if (days > 0) {
    const missed = days - (study.credited.length ? 1 : 0);
    study.knowledge = Math.max(0, study.knowledge - missed * STUDY_RULES.neglectLoss);
    study.day = dayNumber(now); study.credited = [];
  }
}
export function studyView(study) {
  if (!study) return undefined;
  const { credited, session, ...visible } = study;
  return { ...visible, todayCount: credited.length, rules: STUDY_RULES, session: session ? {
    id: session.id, status: session.status, target: session.target, completed: session.completed,
    mistakes: session.mistakes, left: session.left, right: session.right,
  } : null };
}
function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function studyAction(s, action, now, random) {
  const study = s.study;
  if (['vocab_upload', 'vocab_edit', 'vocab_delete'].includes(action.type)) {
    if (openSession(study.session)) throw new GameError('공부를 마치거나 그만둔 뒤 단어장을 수정해주세요.');
    if (action.type === 'vocab_upload') {
      const imported = parseVocabulary(action.text);
      const seen = new Set(study.words.map(w => fingerprint(w.term, w.answer)));
      const added = imported.filter(w => !seen.has(fingerprint(w.term, w.answer)));
      if (study.words.length + added.length > STUDY_RULES.maxWords) throw new GameError('단어장은 최대 1,000개예요. 기존 단어를 정리한 뒤 다시 올려주세요.');
      // Editing can retain an old ID; avoid collisions when the original pair is reimported.
      const ids = new Set(study.words.map(w => w.id));
      for (const w of added) { if (ids.has(w.id)) w.id = randomUUID(); ids.add(w.id); }
      study.words.push(...added);
      return `단어 ${added.length}개를 저장했어요. 같은 단어와 뜻은 한 번만 보관해요.`;
    }
    const word = study.words.find(w => w.id === action.wordId);
    if (!word) throw new GameError('단어를 찾지 못했어요. 새로고침해주세요.', 409);
    if (action.type === 'vocab_delete') {
      study.words = study.words.filter(w => w.id !== word.id);
      return '단어를 삭제했어요.';
    }
    const updated = pair(action.term, action.answer);
    if (study.words.some(w => w.id !== word.id && w.term === updated.term && w.answer === updated.answer)) throw new GameError('이미 같은 단어와 뜻이 있어요.');
    Object.assign(word, updated);
    return '단어와 뜻을 저장했어요.';
  }
  if (action.type === 'study_start') {
    if (openSession(study.session)) throw new GameError('이미 진행 중인 공부가 있어요.', 409);
    if (!Number.isInteger(action.target) || action.target < 1 || action.target > study.words.length) throw new GameError(`목표는 1~${study.words.length || 1}개예요. 먼저 충분한 단어를 올려주세요.`);
    const queue = shuffled(study.words.map(w => w.id), random).slice(0, action.target);
    const left = queue.splice(0, 4);
    study.session = { id: randomUUID(), status: 'active', target: action.target, completed: 0, mistakes: 0, queue, left, right: shuffled(left, random) };
    return `${s.name}와 ${action.target}개를 공부해요. 단어와 뜻을 하나씩 골라주세요!`;
  }
  const session = study.session;
  if (!openSession(session) || action.sessionId !== session.id) throw new GameError('공부 상태가 바뀌었어요. 현재 화면에서 다시 해주세요.', 409);
  if (action.type === 'study_pause') { session.status = 'paused'; return '잠깐 쉬어요. 맞힌 단어와 진행은 저장했어요.'; }
  if (action.type === 'study_resume') { session.status = 'active'; return `${s.name}, 다시 함께 공부하자!`; }
  if (action.type === 'study_stop') { session.status = 'stopped'; return `${session.completed}개를 공부했어요. 얻은 지식은 그대로 남아요.`; }
  if (action.type !== 'study_match') throw new GameError('알 수 없는 학습 요청이에요.');
  if (session.status !== 'active') throw new GameError('일시정지를 풀고 다시 시작해주세요.');
  let leftIndex = session.left.indexOf(action.wordId);
  const rightIndex = session.right.indexOf(action.answerId);
  if (leftIndex < 0 || rightIndex < 0) throw new GameError('이미 바뀐 카드예요. 지금 보이는 카드로 다시 골라주세요.', 409);
  let word = study.words.find(w => w.id === action.wordId);
  const answer = study.words.find(w => w.id === action.answerId);
  // A repeated spelling can have several meanings. Consume its matching visible card.
  if (word.answer !== answer.answer) {
    const equivalent = session.left.findIndex(id => {
      const other = study.words.find(w => w.id === id);
      return other.term === word.term && other.answer === answer.answer;
    });
    if (equivalent >= 0) { leftIndex = equivalent; word = study.words.find(w => w.id === session.left[equivalent]); }
  }
  if (word.answer !== answer.answer) { session.mistakes++; return '조금 달라요. 다시 짝을 찾아볼까요?'; }
  // Identical meanings are interchangeable, even when their source word IDs differ.
  const next = session.queue.shift();
  if (next) { session.left[leftIndex] = next; session.right[rightIndex] = next; }
  else { session.left.splice(leftIndex, 1); session.right.splice(rightIndex, 1); }
  session.completed++; study.total++;
  const key = fingerprint(word.term, word.answer);
  if (!study.credited.includes(key)) {
    study.credited.push(key);
    study.knowledge = Math.min(100, study.knowledge + STUDY_RULES.gain);
    study.peakKnowledge = Math.max(study.peakKnowledge, study.knowledge);
  }
  if (session.completed === session.target) { session.status = 'completed'; return `${s.name}와 목표 ${session.target}개 완료! 오늘도 한 뼘 똑똑해졌어요.`; }
  return '정답! 다음 단어도 함께해요.';
}
