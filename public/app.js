const $ = id => document.getElementById(id);
const trickNames = { down: '엎드려', bang: '빵야', stand: '일어서', paw: '손' };
const doodles = { down: '⌒', bang: '↶', stand: '↟', paw: '♧' };
let state, busy = false, walking = false, sleeping = false, focusing = false, refreshing = false, lastActivityPoll = 0, storage = 'cloud', clockOffset = 0, animationTimer, toastTimer, pendingAction;
const nameDialog = $('name-dialog'), saveDialog = $('save-dialog');
const leashDialog = $('leash-dialog');

// Follow the device preference until the player chooses a setting for this browser.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPreference;
try {
  const saved = localStorage.getItem('pug-motion');
  if (saved === 'full' || saved === 'reduced') motionPreference = saved;
} catch { /* Private browsing can make local storage unavailable. */ }
function renderMotionPreference() {
  const enabled = motionPreference ? motionPreference === 'full' : !motionQuery.matches;
  document.documentElement.dataset.motion = enabled ? 'full' : 'reduced';
  $('motion-toggle').textContent = enabled ? '모션 켜짐' : '모션 꺼짐';
  $('motion-toggle').setAttribute('aria-pressed', String(enabled));
}
$('motion-toggle').addEventListener('click', () => {
  motionPreference = document.documentElement.dataset.motion === 'full' ? 'reduced' : 'full';
  try { localStorage.setItem('pug-motion', motionPreference); } catch { /* Keep the choice for this visit. */ }
  renderMotionPreference();
});
motionQuery.addEventListener('change', renderMotionPreference);
renderMotionPreference();

class RequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(body) {
  let response;
  try {
    response = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch { throw new RequestError('연결이 끊겼어요. 같은 요청으로 저장을 확인해주세요.', 0); }
  let data;
  try { data = await response.json(); } catch { throw new RequestError('서버 응답을 확인하지 못했어요. 다시 연결해주세요.', 503); }
  if (!response.ok) throw new RequestError(data.error || '요청을 처리하지 못했어요.', response.status);
  return data;
}
function toast(message, error = false, persistent = false) {
  clearTimeout(toastTimer);
  $('toast-message').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  $('retry-action').hidden = !pendingAction;
  if (!persistent) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function savedStatus(text) { $('save-status').replaceChildren(); const dot = document.createElement('i'); $('save-status').append(dot, text); }
function accept(data) {
  if (!data.state.progress || !data.state.discoveries || !data.state.study || !data.state.hats || data.state.version < 4) throw new RequestError('새 버전 적용을 위해 게임 서버를 다시 시작해주세요.', 503);
  if (state && data.state.serverTime < state.serverTime) return;
  const previousActivity = state?.activity?.kind;
  const previousName = state?.name;
  state = data.state; clockOffset = state.serverTime - Date.now(); storage = data.storage;
  $('connection-error').hidden = true;
  savedStatus(storage === 'cloud' ? '서버에 저장됨' : '로컬 데모 저장');
  render();
  if (state.name && previousName !== state.name) {
    $('speech').textContent = state.activity?.kind === 'walk' ? `${state.name}, 산책을 이어서 해요!` : state.activity?.kind === 'sleep' ? `${state.name}, 쿨쿨 자고 있어요.` : state.activity?.kind === 'focus' ? `${state.name}, 오늘도 네 곁에서 응원할게!` : `${state.name}, 오늘도 함께 놀자!`;
    if (focusing) updateFocusScene(true);
    if (walking) updateWalkEvent(true);
  }
  if (previousActivity === 'walk' && !state.activity && state.energy === 0) {
    $('speech').textContent = `${state.name}, 체력이 다 떨어져 집으로 돌아왔어요. 푹 쉬자!`;
    toast('체력이 0이 되어 산책을 마쳤어요. 잠자기·밥·쓰다듬기로 회복해요.');
  } else if (previousActivity === 'sleep' && !state.activity && state.energy >= 100) {
    $('speech').textContent = `${state.name}, 푹 잤어요! 다시 놀 준비 완료!`;
    toast('체력이 모두 회복돼서 일어났어요.');
  } else if (previousActivity === 'focus' && !state.activity) {
    $('speech').textContent = `${state.name}, 함께한 시간만큼 선물을 준비했어요!`;
  }
}
function render() {
  if (!state) return;
  syncActivity();
  $('pet-name').textContent = state.name || '나의 퍼그';
  $('fortune-message').textContent = state.fortune || '';
  $('fortune-from').textContent = state.name ? `${state.name}의 한마디` : '퍼그의 한마디';
  $('pet-stage').dataset.leash = state.leashColor || 'coral';
  $('affection').textContent = state.affection;
  $('bond-bar').value = state.affection;
  $('cheat-badge').hidden = !state.cheat;
  $('feed-count').textContent = `${state.daily.feed} / ${state.cheat ? '∞' : '3'}`;
  $('walk-count').textContent = state.daily.walk ? `${state.daily.walk}회` : '0회';
  $('pet-count').textContent = state.daily.pet ? `${state.daily.pet}회` : '0회';
  $('train-count').textContent = `${state.daily.train} / ${state.cheat ? '∞' : '5'}`;
  $('chance').textContent = `${state.chance}%`;
  $('feed-help').textContent = state.cheat ? '마음껏 먹어요 · 무제한' : state.daily.feed >= 3 ? '오늘은 배불러요 · 내일 또 만나요' : `친밀도 +5 · 체력 +20`;
  $('walk-help').textContent = state.cheat ? '걷기 / 달리기 · 체력 무제한' : '걷기 / 달리기 · 체력 소모';
  $('pet-help').textContent = state.daily.pet < 5 && !state.cheat ? '친밀도 +3 · 체력 +5' : '다정한 손길 · 체력 +5';
  for (const button of document.querySelectorAll('[data-action]')) {
    const type = button.dataset.action;
    button.disabled = busy || isStudying() || walking || sleeping || focusing || Boolean(pendingAction) || !state.name || (type === 'feed' && !state.cheat && state.daily.feed >= 3) || (type === 'sleep' && state.energy >= 100);
  }
  for (const [key, name] of Object.entries(trickNames)) {
    const button = document.querySelector(`[data-trick="${key}"]`), learned = state.tricks.includes(key);
    button.classList.toggle('learned', learned);
    button.querySelector('small').textContent = learned ? '시켜보기' : '훈련하기';
    button.querySelector('.trick-arrow').textContent = learned ? '✓' : '↗';
    button.setAttribute('aria-label', `${name} ${learned ? '시켜보기' : '훈련하기'}`);
    button.disabled = busy || isStudying() || walking || sleeping || focusing || Boolean(pendingAction) || !state.name || (!learned && !state.cheat && (state.daily.train >= 5 || state.energy < 12));
    if (!learned && !state.cheat && state.energy < 12) button.querySelector('small').textContent = '체력 12 필요';
  }
  $('log-list').replaceChildren();
  for (const entry of state.logs) {
    const li = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span');
    time.dateTime = new Date(entry.at).toISOString();
    time.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(entry.at);
    text.textContent = entry.message; li.append(time, text); $('log-list').append(li);
  }
  if (!state.logs.length) { const li = document.createElement('li'); li.textContent = '우리의 첫 번째 추억을 기다리고 있어요.'; $('log-list').append(li); }
  $('name-title').textContent = state.cheat ? '치트 모드' : '퍼그 이름';
  $('name-description').textContent = state.cheat ? '친밀도 100 · 횟수 무제한 · 훈련 100%. 처음부터 다시, 퍼그 이름을 지어주세요.' : '이름을 지어주세요.';
  if (!state.name && !nameDialog.open && !saveDialog.open) nameDialog.showModal();
  if (state.name && nameDialog.open) nameDialog.close();
  $('name-form').querySelector('button').disabled = busy;
  $('name-form').querySelector('button').textContent = pendingAction ? '저장 확인 / 다시 시도' : '시작하기';
  $('name-input').disabled = busy || Boolean(pendingAction);
  $('return-home').hidden = !walking;
  $('return-home').disabled = busy || Boolean(pendingAction);
  $('walk-controls').hidden = !walking;
  $('wake-up').hidden = !sleeping;
  $('wake-up').disabled = busy || Boolean(pendingAction);
  for (const mode of ['walk', 'run']) {
    $(`${mode}-mode`).disabled = busy || Boolean(pendingAction);
    $(`${mode}-mode`).setAttribute('aria-pressed', String(state.activity?.mode === mode));
  }
  $('start-walk').disabled = busy;
  $('start-walk').textContent = pendingAction?.type === 'walk' ? '저장 확인 / 다시 시도' : '산책 시작';
  $('close-leash').disabled = busy || Boolean(pendingAction);
  for (const radio of leashDialog.querySelectorAll('input')) radio.disabled = busy || Boolean(pendingAction);
  updateCountdown();
  updateEnergy();
  renderRoomItems();
  renderJourney();
  renderStudy();
  updateWalkEvent();
}
function estimatedEnergy() {
  if (!state) return 0;
  const elapsed = Math.max(0, (focusing ? Math.min(Date.now() + clockOffset, state.activity.endsAt) : Date.now() + clockOffset) - state.serverTime) / 1000;
  return Math.max(0, Math.min(100, state.energy + elapsed * state.energyRate));
}
function updateEnergy() {
  if (!state) return;
  const energy = estimatedEnergy(), shown = Math.ceil(energy);
  $('energy-value').textContent = `${shown} / 100`;
  $('energy-bar').value = energy;
  $('walk-energy').textContent = `체력 ${shown}`;
  $('energy-bar').classList.toggle('low-energy', energy <= 20);
  $('pet-stage').classList.toggle('exhausted', walking && energy <= 0);
  $('energy-hint').textContent = focusing ? '곁에서 쉬는 중 · 20초마다 체력 +1' : sleeping ? '쿨쿨… 초당 체력 +2' : walking ? (state.cheat ? '치트모드 · 체력 무제한' : state.activity.mode === 'run' ? '달리는 중 · 2초마다 −1' : '걷는 중 · 5초마다 −1') : energy <= 20 ? '졸려요. 잠깐 쉬어갈까요?' : '산책할 준비 완료!';
}
function updateCountdown() {
  if (!state) return;
  const seconds = Math.max(0, Math.ceil((state.resetsAt - Date.now() - clockOffset) / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  $('reset-time').textContent = `새 하루까지 ${hours}시간 ${minutes}분 · 한국 시간 자정`;
}
function setHomeScene() {
  clearTimeout(animationTimer);
  walking = false; sleeping = false; focusing = false;
  $('pet-stage').dataset.animation = '';
  delete $('pet-stage').dataset.focusMood;
  $('pet-stage').classList.remove('exhausted');
  const room = document.querySelector('.room');
  room.classList.remove('walking', 'running', 'sleeping', 'focusing'); room.setAttribute('aria-label', '내 퍼그의 방');
  document.querySelector('.room-hint').textContent = '볼·배를 눌러 쓰다듬기';
  document.querySelector('.room-label').textContent = '집';
  document.querySelector('.pug').setAttribute('aria-label', '동그란 눈과 말랑한 볼을 가진 귀여운 퍼그');
}
function resetScene() { setHomeScene(); render(); }
function syncActivity() {
  const kind = state?.activity?.kind;
  const room = document.querySelector('.room');
  room.classList.toggle('studying', isStudying());
  room.classList.toggle('study-pausing', state?.study?.session?.status === 'paused');
  if (isStudying()) {
    clearTimeout(animationTimer); walking = false; sleeping = false; focusing = false;
    room.classList.remove('walking', 'running', 'sleeping', 'focusing', 'music-playing');
    $('pet-stage').dataset.animation = 'focus';
    $('pet-stage').dataset.focusMood = 'study';
    delete $('pet-stage').dataset.focusToy;
    document.querySelector('.room-label').textContent = '함께 공부 중';
    document.querySelector('.room-hint').textContent = '네가 외우면 나도 똑똑해져!';
    room.setAttribute('aria-label', '함께 단어를 공부하는 퍼그의 방');
    document.querySelector('.pug').setAttribute('aria-label', '안경을 쓰고 책장을 넘기며 함께 공부하는 퍼그');
    return;
  }
  focusing = kind === 'focus';
  room.classList.toggle('focusing', focusing);
  if (focusing) {
    clearTimeout(animationTimer); walking = false; sleeping = false;
    $('pet-stage').dataset.animation = 'focus';
    room.classList.remove('walking', 'running', 'sleeping');
    room.setAttribute('aria-label', '혼자 놀고 공부하는 퍼그의 방');
    document.querySelector('.room-label').textContent = '집중 동행';
    updateFocusScene();
    return;
  }
  if (kind === 'walk') {
    clearTimeout(animationTimer);
    walking = true; sleeping = false;
    const running = state.activity.mode === 'run';
    $('pet-stage').dataset.animation = 'walk';
    $('pet-stage').dataset.movement = running ? 'run' : 'walk';
    room.classList.add('walking'); room.classList.remove('sleeping'); room.classList.toggle('running', running);
    room.setAttribute('aria-label', '퍼그와 산책하는 공원');
    document.querySelector('.room-label').textContent = running ? '공원 · 달리기' : '공원 · 걷기';
    document.querySelector('.pug').setAttribute('aria-label', `선택한 목줄을 차고 ${running ? '빠르게 달리는' : '네 다리를 번갈아 움직이며 걷는'} 퍼그`);
  } else if (kind === 'sleep') {
    clearTimeout(animationTimer);
    walking = false; sleeping = true;
    $('pet-stage').dataset.animation = 'sleep';
    room.classList.remove('walking', 'running'); room.classList.add('sleeping');
    room.setAttribute('aria-label', '퍼그가 잠자는 방');
    document.querySelector('.room-label').textContent = '자는 중';
    document.querySelector('.pug').setAttribute('aria-label', '눈을 감고 쿨쿨 자는 퍼그');
  } else if (walking || sleeping || $('pet-stage').dataset.animation === 'focus') setHomeScene();
}
function animate(name) {
  if (state.activity || isStudying()) { syncActivity(); render(); return; }
  if (name === 'walk') return; // An old receipt must not restart an exhausted outing.
  resetScene();
  // Restart a repeated trick from its first frame.
  void $('pet-stage').getBoundingClientRect();
  $('pet-stage').dataset.animation = name;
  walking = name === 'walk';
  const room = document.querySelector('.room');
  room.classList.toggle('walking', walking);
  if (walking) {
    room.setAttribute('aria-label', '퍼그와 산책하는 공원');
    document.querySelector('.room-label').textContent = '공원 · 걷기';
    document.querySelector('.pug').setAttribute('aria-label', '목줄을 차고 네 다리를 번갈아 움직이며 걷는 퍼그');
  } else {
    if (trickNames[name]) document.querySelector('.pug').setAttribute('aria-label', `${trickNames[name]} 개인기를 하는 퍼그`);
    animationTimer = setTimeout(resetScene, trickNames[name] ? 6000 : 3200);
  }
  render();
}
async function act(action) {
  if (busy) return;
  busy = true;
  const request = pendingAction || { ...action, id: crypto.randomUUID(), sentAt: Date.now() + clockOffset };
  pendingAction = request;
  render(); savedStatus('저장하는 중…');
  try {
    const data = await api(request);
    pendingAction = null; accept(data);
    if (data.message) { $('speech').textContent = data.message.split(' 친밀도')[0]; toast(data.message); }
    animate(data.animation);
    if (request.type === 'start_focus' && focusing) updateFocusScene(true);
    if (walking) updateWalkEvent(true);
    $('name-error').textContent = '';
    if (request.type === 'name') $('name-input').value = '';
    if (request.type === 'claim_quest') showOutfitReward(request.quest);
    if (request.type === 'buy_outfit') openOutfitGift(state.outfits.find(o => o.id === request.outfit), '옷장에 저장했어요.');
    return true;
  } catch (e) {
    if (e.status > 0 && e.status < 500) pendingAction = null;
    if (nameDialog.open) $('name-error').textContent = e.message;
    if (leashDialog.open) $('leash-error').textContent = e.message;
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      const error = dialog.querySelector('.study-dialog-error');
      if (error) error.textContent = e.message;
    }
    toast(e.message, true, Boolean(pendingAction));
    savedStatus(pendingAction ? '저장 확인 필요' : '서버 연결됨');
    if (!pendingAction) {
      try { accept(await api({ type: 'init' })); } catch { /* keep the last confirmed state */ }
    }
    return false;
  } finally { busy = false; render(); }
}
async function boot() {
  if (busy) return;
  busy = true;
  try { accept(await api({ type: 'init' })); }
  catch (e) { savedStatus('연결 확인 필요'); $('connection-message').textContent = e.message; $('connection-error').hidden = false; }
  finally { busy = false; render(); }
}
for (const [key, name] of Object.entries(trickNames)) {
  const button = document.createElement('button'); button.className = 'trick-card'; button.dataset.trick = key;
  const doodle = document.createElement('span'); doodle.className = 'trick-doodle'; doodle.textContent = doodles[key]; doodle.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'), title = document.createElement('strong'), small = document.createElement('small'), arrow = document.createElement('span');
  title.textContent = name; arrow.className = 'trick-arrow'; text.append(title, small); button.append(doodle, text, arrow);
  button.disabled = true; button.addEventListener('click', () => act({ type: state.tricks.includes(key) ? 'perform' : 'train', trick: key })); $('tricks').append(button);
}
function beginWalk() {
  if (busy || walking || sleeping || focusing || pendingAction) return;
  if (state.energy <= 0) { toast('체력이 없어요. 잠자기·밥·쓰다듬기로 먼저 회복해요.', true); return; }
  if (!state.leashColor) {
    $('leash-error').textContent = '';
    leashDialog.showModal();
  } else act({ type: 'walk' });
}
for (const button of document.querySelectorAll('[data-action]')) { button.disabled = true; button.addEventListener('click', () => button.dataset.action === 'walk' ? beginWalk() : act({ type: button.dataset.action })); }
$('leash-form').addEventListener('submit', async e => {
  e.preventDefault();
  const color = new FormData(e.currentTarget).get('leash');
  if (await act({ type: 'walk', leashColor: color })) leashDialog.close();
});
$('close-leash').addEventListener('click', () => leashDialog.close());
leashDialog.addEventListener('cancel', e => { if (busy || pendingAction) e.preventDefault(); });
$('return-home').addEventListener('click', () => act({ type: 'end_walk' }));
$('walk-mode').addEventListener('click', () => act({ type: 'walk_mode', mode: 'walk' }));
$('run-mode').addEventListener('click', () => act({ type: 'walk_mode', mode: 'run' }));
$('wake-up').addEventListener('click', () => act({ type: 'wake' }));
$('name-form').addEventListener('submit', e => { e.preventDefault(); act({ type: 'name', name: $('name-input').value }); });
nameDialog.addEventListener('cancel', e => e.preventDefault());
function openSave() {
  if (nameDialog.open) nameDialog.close();
  $('connection-error').hidden = true;
  $('storage-explanation').textContent = storage === 'local' ? '지금은 로컬 데모예요. 이 컴퓨터의 서버 파일에 저장돼요.' : '진행은 서버에 자동으로 저장돼요.';
  $('show-code').disabled = !state || busy || Boolean(pendingAction);
  if (!saveDialog.open) saveDialog.showModal();
}
$('save-menu').addEventListener('click', openSave);
$('restore-first').addEventListener('click', openSave);
$('restore-offline').addEventListener('click', openSave);
saveDialog.querySelector('.close-dialog').addEventListener('click', () => saveDialog.close());
saveDialog.addEventListener('close', () => { $('code-box').hidden = true; $('recovery-code').value = ''; $('restore-code').value = ''; $('restore-error').textContent = ''; if (state) render(); else $('connection-error').hidden = false; });
$('show-code').addEventListener('click', async () => {
  $('show-code').disabled = true;
  try { const data = await api({ type: 'backup' }); accept(data); $('recovery-code').value = data.recoveryCode; $('code-box').hidden = false; }
  catch (e) { $('restore-error').textContent = e.message; }
  finally { $('show-code').disabled = false; }
});
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('recovery-code').value); $('copy-code').textContent = '복사했어요 ✓'; }
  catch { $('recovery-code').select(); $('copy-code').textContent = '코드를 선택했어요. 직접 복사해주세요.'; }
});
$('restore-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy || pendingAction) { $('restore-error').textContent = '진행 중인 저장부터 확인해주세요.'; return; }
  busy = true; $('restore-form').querySelector('button').disabled = true;
  try { const data = await api({ type: 'restore', code: $('restore-code').value.trim() }); resetScene(); accept(data); saveDialog.close(); toast('우리 다시 만났네! 저장한 퍼그를 불러왔어요.'); }
  catch (err) { $('restore-error').textContent = err.message; }
  finally { busy = false; $('restore-form').querySelector('button').disabled = false; render(); }
});
$('retry-action').addEventListener('click', () => act(pendingAction));
$('retry-connect').addEventListener('click', boot);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy && !pendingAction) boot(); });
setInterval(() => { updateCountdown(); if (state && Date.now() + clockOffset >= state.resetsAt && !busy && !pendingAction) boot(); }, 30000);
async function refreshActivity() {
  if (busy || pendingAction || refreshing) return;
  refreshing = true; lastActivityPoll = Date.now();
  try { accept(await api({ type: 'init' })); }
  catch { savedStatus('체력 동기화 재시도 중'); }
  finally { refreshing = false; }
}
setInterval(() => {
  updateEnergy();
  updateFocusClock();
  updateFocusScene();
  updateWalkEvent();
  if (state?.activity && Date.now() - lastActivityPoll >= 1000) {
    const energy = estimatedEnergy();
    const focusDue = focusing && (Date.now() + clockOffset >= state.activity.endsAt || Math.floor((state.progress.totals.focusSeconds + focusElapsed()) / 300) > Math.floor(state.progress.totals.focusSeconds / 300));
    if (focusDue || (!focusing && energy <= 0) || (sleeping && energy >= 100) || Date.now() - lastActivityPoll >= (focusing ? 30000 : 5000)) refreshActivity();
  }
}, 1000);
initNavigation();
initJourney();
initStudy();
boot();
