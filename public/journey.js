let journeyTab = 'story';
let shopCategory = 'outfit';
let rewardOutfit;
let rewardHat;
function showOutfitReward(questId) {
  const quest = state.quests.find(q => q.id === questId);
  const outfit = quest?.hat ? state.hats.find(h => h.id === quest.hat) : state.outfits.find(o => o.id === quest?.outfit);
  if (!outfit) return;
  openOutfitGift(outfit, `${quest.title} 완료!\n비스킷 ${quest.reward}개도 함께 받았어요.`);
}
function openOutfitGift(outfit, description) {
  rewardOutfit = outfit.kind === 'hat' ? null : outfit.id;
  rewardHat = outfit.kind === 'hat' ? outfit.id : null;
  $('reward-title').textContent = rewardHat ? '학사모 획득' : '새 옷 획득';
  $('reward-equip').textContent = rewardHat ? '씌워주기' : '입히기';
  $('reward-preview').replaceChildren(outfitIcon(outfit));
  $('reward-name').textContent = outfit.name;
  $('reward-description').textContent = description;
  if (!$('reward-dialog').open) $('reward-dialog').showModal();
}
// 퀘스트 하나가 어느 세부 탭(성장/공부/오늘의 미션)에 속하는지
function questTabOf(q) {
  return q.category === 'study' ? 'study' : q.daily ? 'daily' : 'story';
}
function journeyElement(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function outfitIcon(outfit) {
  const preview = journeyElement('div', `outfit-preview outfit-${outfit.id}`);
  preview.setAttribute('aria-hidden', 'true');
  if (outfit.kind === 'hat' && outfit.custom) { customHatIcon(outfit, preview); return preview; }
  if (outfit.kind === 'hat') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '90 24 220 140');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#graduation-cap-art'); svg.append(use); preview.append(svg);
    return preview;
  }
  const shirt = journeyElement('div', 'mini-shirt', outfit.mark);
  shirt.style.setProperty('--shirt', outfit.color); preview.append(shirt);
  if (outfit.custom) customShirtIcon(outfit, preview, shirt);
  return preview;
}
// 상점 '모자' 칸: 스튜디오에서 만든 모자를 사고 씌워요.
function renderHatShop(blocked) {
  const p = state.progress;
  for (const hat of state.hats.filter(h => h.price > 0 && (!h.hidden || p.ownedHats.includes(h.id))).sort((a, b) => a.price - b.price)) {
    const owned = p.ownedHats.includes(hat.id), equipped = p.hat === hat.id, missing = Math.max(0, hat.price - p.biscuits);
    const card = journeyElement('article', `wardrobe-card${owned ? ' owned' : ''}${equipped ? ' equipped' : ''}`);
    const button = journeyButton(equipped ? '모자 벗기' : owned ? '씌워주기' : `비스킷 ${hat.price}개`, `hat-${hat.id}`, () => {
      act(owned ? { type: 'equip_hat', hat: equipped ? null : hat.id } : { type: 'buy_hat', hat: hat.id });
    }, blocked || (!owned && hat.price > p.biscuits));
    card.append(journeyElement('span', 'wardrobe-status', equipped ? '착용 중' : owned ? '보유' : ''), outfitIcon(hat), journeyElement('h3', '', hat.name), journeyElement('p', 'price-hint', owned ? '' : missing ? `${missing}개 부족` : hat.source), button);
    $('wardrobe-list').append(card);
  }
  if (!$('wardrobe-list').children.length) $('wardrobe-list').append(journeyElement('p', 'empty-shop', '아직 상점에 모자가 없어요.'));
}
function journeyButton(text, key, onClick, disabled = false) {
  const button = journeyElement('button', 'quest-button', text);
  button.dataset.journeyKey = key; button.disabled = disabled;
  button.addEventListener('click', onClick); return button;
}
function renderJourney() {
  if (!state?.progress) return;
  const p = state.progress, blocked = busy || Boolean(pendingAction) || !state.name;
  const focusedKey = document.activeElement?.dataset.journeyKey;
  const readyQuests = state.quests.filter(q => !q.claimed && q.value >= q.target);
  const ready = readyQuests.length;
  for (const node of document.querySelectorAll('.biscuit-count')) node.textContent = p.biscuits;
  $('outfit-count').textContent = `${p.owned.length + p.ownedHats.length} / ${state.outfits.length + state.hats.length}`;
  $('journey-summary').textContent = ready ? String(ready) : '';
  $('journey-summary').setAttribute('aria-label', ready ? `받을 수 있는 보상 ${ready}개` : '');
  for (const badge of document.querySelectorAll('[data-quest-badge]')) {
    const count = readyQuests.filter(q => questTabOf(q) === badge.dataset.questBadge).length;
    badge.textContent = count ? String(count) : '';
    badge.setAttribute('aria-label', count ? `받을 수 있는 보상 ${count}개` : '');
  }
  $('pet-stage').dataset.outfit = p.equipped || 'none';
  customOutfitPatterns(); applyOutfitLook($('pet-stage'), state.outfits.find(o => o.id === p.equipped));
  const wornHat = state.hats.find(h => h.id === p.hat);
  applyHatLook($('pet-stage'), wornHat); applyHatLook(document.querySelector('.study-buddy'), wornHat);
  $('pet-stage').dataset.hat = p.hat || 'none';
  document.querySelector('.study-buddy').dataset.hat = p.hat || 'none';
  for (const button of document.querySelectorAll('[data-journey]')) button.setAttribute('aria-pressed', String(button.dataset.journey === journeyTab));
  for (const button of document.querySelectorAll('[data-shop-category]')) button.setAttribute('aria-pressed', String(button.dataset.shopCategory === shopCategory));
  $('quest-list').hidden = journeyTab === 'collection';
  $('collection-list').hidden = journeyTab !== 'collection'; renderCollection();
  $('journey-note').textContent = journeyTab === 'daily' ? '매일 자정 초기화 · 완료한 보상은 오늘 안에 받으세요 (한국 시간)' : journeyTab === 'collection' ? '산책에서만 발견해요 · 비스킷은 바로 지갑에 저장돼요' : '';
  $('quest-list').replaceChildren();
  for (const q of state.quests.filter(q => questTabOf(q) === journeyTab)) {
    const ready = q.value >= q.target;
    const card = journeyElement('article', `quest-card${ready && !q.claimed ? ' ready' : ''}${q.claimed ? ' claimed' : ''}`);
    const outfit = q.hat ? state.hats.find(h => h.id === q.hat) : state.outfits.find(o => o.id === q.outfit);
    const badge = journeyElement('div', 'quest-badge', q.claimed ? '수령 완료' : ready ? '보상 받기 가능' : '');
    const title = journeyElement('h3', '', q.title), detail = journeyElement('p', 'quest-detail', q.detail);
    const reward = journeyElement('div', 'quest-reward');
    if (outfit) reward.append(outfitIcon(outfit));
    else reward.append(journeyElement('span', 'biscuit-symbol', '✿'));
    const rewardText = journeyElement('div', '');
    if (outfit) rewardText.append(journeyElement('strong', '', outfit.name));
    rewardText.append(journeyElement('span', '', `비스킷 +${q.reward}`)); reward.append(rewardText);
    const progress = journeyElement('progress', ''); progress.max = q.target; progress.value = q.value; progress.setAttribute('aria-label', q.title);
    const formatTime = seconds => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
    const count = journeyElement('span', 'quest-count', q.unit ? `${formatTime(q.value)} / ${formatTime(q.target)}` : `${q.value} / ${q.target}`);
    const button = journeyButton(q.claimed ? '완료' : ready ? '보상 받기' : '하러 가기', q.id, () => {
      if (ready) act({ type: 'claim_quest', quest: q.id, day: state.day });
      else {
        if (q.category === 'study') { showMainTab('study'); return; }
        showMainTab('care');
        const selector = q.id.includes('focus') ? '.focus-card' : q.id === 'practice' ? '.training-section' : '.game-layout';
        document.querySelector(selector).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, blocked || q.claimed);
    card.append(badge, title, detail, reward, progress, count, button); $('quest-list').append(card);
  }
  $('wardrobe-list').replaceChildren();
  const showOutfits = ['outfit', 'wardrobe'].includes(shopCategory);
  const displayedOutfits = !showOutfits ? [] : state.outfits.filter(o => shopCategory === 'outfit' ? o.price > 0 && (!o.hidden || p.owned.includes(o.id)) : !o.price || p.owned.includes(o.id)).sort((a, b) => a.price - b.price);
  for (const outfit of displayedOutfits) {
    const owned = p.owned.includes(outfit.id), equipped = p.equipped === outfit.id;
    const card = journeyElement('article', `wardrobe-card${owned ? ' owned' : ''}${equipped ? ' equipped' : ''}`);
    const badge = journeyElement('span', 'wardrobe-status', equipped ? '착용 중' : owned ? '보유' : '');
    const title = journeyElement('h3', '', outfit.name);
    const label = equipped ? '옷 벗기' : owned ? '입히기' : outfit.price ? `비스킷 ${outfit.price}개` : '퀘스트에서 받기';
    const button = journeyButton(label, `outfit-${outfit.id}`, () => {
      if (owned) act({ type: 'equip', outfit: equipped ? null : outfit.id });
      else if (outfit.price) act({ type: 'buy_outfit', outfit: outfit.id });
      else if (outfit.id === 'christmas') showMainTab('christmas');
      else { journeyTab = 'story'; showMainTab('journey'); renderJourney(); }
    }, blocked || (!owned && outfit.price > p.biscuits));
    const missing = Math.max(0, outfit.price - p.biscuits);
    const hint = journeyElement('p', 'price-hint', owned ? '' : outfit.price ? (missing ? `${missing}개 부족` : '') : outfit.source);
    card.append(badge, outfitIcon(outfit), title, hint, button); $('wardrobe-list').append(card);
  }
  if (shopCategory === 'hat') renderHatShop(blocked);
  else if (!showOutfits) renderItemShop(blocked);
  if (shopCategory === 'wardrobe') {
    for (const hat of state.hats.filter(h => !h.price || p.ownedHats.includes(h.id))) {
      const owned = p.ownedHats.includes(hat.id), equipped = p.hat === hat.id;
      const card = journeyElement('article', `wardrobe-card${owned ? ' owned' : ''}${equipped ? ' equipped' : ''}`);
      const button = journeyButton(equipped ? '모자 벗기' : owned ? '씌워주기' : '공부 퀘스트 보기', `hat-${hat.id}`, () => {
        if (owned) act({ type: 'equip_hat', hat: equipped ? null : hat.id });
        else { journeyTab = 'study'; showMainTab('journey'); renderJourney(); }
      }, blocked);
      card.append(journeyElement('span', 'wardrobe-status', equipped ? '착용 중' : owned ? '보유' : ''), outfitIcon(hat), journeyElement('h3', '', hat.name), journeyElement('p', 'price-hint', owned ? '옷과 함께 착용할 수 있어요' : hat.source), button);
      $('wardrobe-list').append(card);
    }
  }
  if (focusedKey) Array.from(document.querySelectorAll('[data-journey-key]')).find(el => el.dataset.journeyKey === focusedKey)?.focus({ preventScroll: true });
  $('focus-toggle').textContent = focusing ? '동행 종료' : '동행 시작';
  $('focus-toggle').disabled = blocked || walking || sleeping || isStudying();
  $('focus-collect').textContent = p.pending ? `받기 · 비스킷 ${p.pending}개` : '적립된 보상 없음';
  $('focus-collect').disabled = blocked || !p.pending;
  document.querySelector('.focus-card').classList.toggle('active', focusing);
  updateFocusClock();
}
function focusElapsed() {
  if (!state?.progress || !focusing) return 0;
  return Math.max(0, Math.min(Date.now() + clockOffset, state.activity.endsAt) - state.serverTime) / 1000;
}
function updateFocusClock() {
  if (!state?.progress) return;
  const total = state.progress.totals.focusSeconds + focusElapsed();
  const fraction = total % state.focusRules.interval;
  const left = Math.ceil(state.focusRules.interval - fraction);
  $('focus-timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('focus-progress').value = fraction;
  $('focus-total').textContent = `누적 ${Math.floor(total / 60)}분`;
  const legacy = focusing && state.activity.rewardMode !== 'gentle';
  const reward = legacy ? state.activity.biscuitsPerInterval : '1~2';
  $('focus-description').textContent = `5분마다 비스킷 ${reward}개 · 체력 회복`;
  if (focusing) {
    const remaining = Math.max(0, Math.ceil((state.activity.endsAt - Date.now() - clockOffset) / 60000));
    $('focus-session').textContent = `${remaining}분 후 종료 · 창을 닫아도 적립${legacy ? ' · 이전 동행 보상률' : ''}`;
  } else $('focus-session').textContent = '창을 닫아도 최대 4시간 적립 · 중간 진행도 유지';
}
function initJourney() {
  for (const button of document.querySelectorAll('[data-shop-category]')) button.addEventListener('click', () => { shopCategory = button.dataset.shopCategory; renderJourney(); });
  for (const id of ['reward-close', 'reward-later']) $(id).addEventListener('click', () => $('reward-dialog').close());
  $('reward-equip').addEventListener('click', async () => {
    $('reward-equip').disabled = true;
    if (await act(rewardHat ? { type: 'equip_hat', hat: rewardHat } : { type: 'equip', outfit: rewardOutfit })) {
      $('reward-dialog').close(); showMainTab(rewardHat ? 'study' : 'care');
    }
    $('reward-equip').disabled = false;
  });
  for (const button of document.querySelectorAll('[data-journey]')) button.addEventListener('click', () => { journeyTab = button.dataset.journey; renderJourney(); });
  $('focus-toggle').addEventListener('click', () => act({ type: focusing ? 'end_focus' : 'start_focus' }));
  $('focus-collect').addEventListener('click', () => act({ type: 'collect_focus' }));
}
