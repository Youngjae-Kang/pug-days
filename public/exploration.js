let shownWalkEvent = '';
function renderCollection() {
  const found = state.exploration.found;
  $('collection-count').textContent = `${Object.keys(found).length}/${state.discoveries.length}`;
  $('collection-list').replaceChildren();
  for (const item of state.discoveries) {
    const record = found[item.id];
    const card = journeyElement('article', `discovery-card${record ? ' discovered' : ''}`);
    card.append(journeyElement('span', 'discovery-icon', record ? item.mark : '?'), journeyElement('h3', '', record ? item.name : '미발견'));
    if (record) {
      card.append(journeyElement('p', '', item.detail), journeyElement('small', '', `${record.count}번 발견 · ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(record.firstAt)}`));
    } else card.append(journeyElement('p', '', '산책에서 만나요'));
    $('collection-list').append(card);
  }
}
function updateWalkEvent(force = false) {
  if (!state) return;
  const room = document.querySelector('.room'), event = state.exploration.lastEvent;
  const live = walking && state.activity?.kind === 'walk' && event && Date.now() + clockOffset < event.until;
  const kind = live ? event.kind : '';
  room.classList.toggle('encounter-friend', kind === 'friend');
  room.classList.toggle('encounter-find', kind === 'find' || kind === 'biscuits');
  const key = live ? `${event.id}:${event.at}` : '';
  if (key === shownWalkEvent && !force) return;
  const previous = shownWalkEvent; shownWalkEvent = key;
  if (live) {
    $('speech').textContent = event.message;
    room.dataset.friend = event.friend || '';
    const item = state.discoveries.find(item => item.id === event.item);
    $('walk-find-icon').textContent = kind === 'biscuits' ? '🍪' : item?.mark || '';
    $('walk-find-name').textContent = kind === 'biscuits' ? `비스킷 +${event.amount}` : item?.name || '';
    $('friend-name').textContent = event.friend || '';
  } else if (previous && walking) $('speech').textContent = `${state.name}, 다시 걸어 볼까?`;
}
