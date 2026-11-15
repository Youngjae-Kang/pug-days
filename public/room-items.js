const itemArt = {
  speaker: '<rect x="20" y="11" width="60" height="80" rx="9" fill="#42434b" stroke="#282931" stroke-width="3"/><rect x="27" y="18" width="46" height="66" rx="5" fill="#30323a" stroke="#656771" stroke-width="1.5"/><circle cx="50" cy="32" r="9" fill="#22232a" stroke="#95979c" stroke-width="2"/><g class="speaker-cone"><circle cx="50" cy="61" r="18" fill="#555761" stroke="#a2a1a4" stroke-width="2"/><circle cx="50" cy="61" r="11" fill="#30323a" stroke="#777982" stroke-width="2"/><circle cx="50" cy="61" r="5" fill="#a1a4ac"/></g><circle cx="66" cy="83" r="2" fill="#c4d98a"/><path d="M28 92v4m44-4v4" stroke="#2b2d33" stroke-width="5"/><g class="music-notes" fill="#b1808e"><path d="M7 17v20c-12-3-12 9-4 9 5 0 8-3 8-7V23l7-2v-8Z"/><path d="M84 2v15c-10-3-11 8-4 8 5 0 8-2 8-6V8l7-2V0Z"/></g>',
  tennis: '<circle cx="50" cy="50" r="32" fill="#bfd37e" stroke="#849e5d" stroke-width="3"/><path d="M26 29q34 5 47 43M26 72q34-5 47-43" fill="none" stroke="#fff8dd" stroke-width="6"/>',
  duck: '<path d="M23 55q-10 24 24 26 34 2 34-27l-16 2c14-7 16-30 0-34-20-6-31 16-17 29Z" fill="#f2cc72" stroke="#bf9b53" stroke-width="3"/><path d="m72 38 16 5-16 6" fill="#df9470" stroke="#bc7a58" stroke-width="2"/><circle cx="64" cy="34" r="3" fill="#493e32"/><path d="M35 61q17-12 24 3-9 12-24-3Z" fill="#e9b858"/><circle cx="57" cy="44" r="4" fill="#e7a17b"/>',
  rope: '<path d="M19 31q31 44 62 31M19 60q31-30 62-28" fill="none" stroke="#bf846e" stroke-width="13" stroke-linecap="round"/><path d="M19 31q31 44 62 31M19 60q31-30 62-28" fill="none" stroke="#f8d7b4" stroke-width="5" stroke-dasharray="5 6"/><path d="m18 23-9-8m9 13-13-2m13 8L7 40m74-17 8-9m-8 14 14-4m-14 38 13 3m-14 2 10 10M19 60 7 64m13 1-8 11" stroke="#94b4aa" stroke-width="5" stroke-linecap="round"/>',
  lamp: '<ellipse cx="50" cy="89" rx="24" ry="6" fill="#c5a787"/><path d="M43 42h14l5 46H38Z" fill="#f8edd0" stroke="#c6b493" stroke-width="2"/><path d="M12 46C17 1 83 1 88 46q-37 14-76 0Z" fill="#da9d87" stroke="#b9826d" stroke-width="2"/><circle cx="36" cy="29" r="7" fill="#fff0d4"/><circle cx="64" cy="25" r="5" fill="#fff0d4"/><circle cx="61" cy="43" r="4" fill="#fff0d4"/>',
  bed: '<path d="M12 54q-4-17 13-17 0-21 20-14 11-17 27-1 21-3 19 19 14 13-1 28H15Z" fill="#b8c9d3" stroke="#90a7b5" stroke-width="3"/><ellipse cx="50" cy="65" rx="43" ry="24" fill="#bbced7" stroke="#90a7b5" stroke-width="3"/><ellipse cx="50" cy="63" rx="32" ry="15" fill="#eef0e5"/>',
  shelf: '<path d="M14 8h72v130H14Z" fill="#d9bc91" stroke="#aa8964" stroke-width="3"/><path d="M21 16h58v31H21Zm0 38h58v33H21Zm0 40h58v36H21Z" fill="#f0dec0"/><path d="M12 50h76M12 90h76M18 138v8m64-8v8" fill="none" stroke="#aa8964" stroke-width="5"/><path d="M26 25h10v22H26Z" fill="#a1b89e"/><path d="M38 21h9v26h-9Z" fill="#d49b89"/><path d="m52 28 9-2 5 21h-9Z" fill="#97b3c6"/><path d="M28 67h32v8H28Zm3 10h32v9H31Z" fill="#b7a5bf"/><path d="M64 61h10v25H64Z" fill="#d7bc78"/><path d="M26 103h10v26H26Zm13 4h9v22h-9Z" fill="#97b3c6"/><path d="m54 107 10-3 7 25H60Z" fill="#a1b89e"/>',
};
function itemSvg(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', id === 'shelf' ? '0 0 100 150' : '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = itemArt[id] || ''; // Only bundled artwork, never user input.
  return svg;
}
function roomItemIcon(item) {
  const preview = journeyElement('div', 'item-preview'); preview.append(itemSvg(item.id)); return preview;
}
function renderRoomItems() {
  if (!state?.roomItems) return;
  const room = document.querySelector('.room'), placed = state.progress.placedItems;
  for (const item of state.roomItems) {
    let object = document.getElementById(`room-${item.id}`);
    if (!object) {
      object = document.createElement('div'); object.id = `room-${item.id}`;
      object.className = `room-object room-${item.id}`; object.setAttribute('aria-hidden', 'true');
      const art = itemSvg(item.id);
      if (item.id === 'bed') art.setAttribute('preserveAspectRatio', 'none');
      object.append(art); room.append(object);
    }
    object.hidden = !placed.includes(item.id);
    room.classList.toggle(`has-${item.id}`, placed.includes(item.id));
  }
  syncParkedToys();
}
function syncParkedToys() {
  const stage = $('pet-stage');
  for (const id of ['tennis', 'duck', 'rope']) {
    const object = document.getElementById(`room-${id}`);
    if (object) object.classList.toggle('in-use', focusing && stage.dataset.focusMood === 'play' && stage.dataset.focusToy === id);
  }
}
function renderItemShop(blocked) {
  const p = state.progress;
  for (const item of state.roomItems.filter(item => item.kind === shopCategory)) {
    const owned = p.ownedItems.includes(item.id), placed = p.placedItems.includes(item.id);
    const card = journeyElement('article', `wardrobe-card${placed ? ' equipped' : ''}`);
    const badge = journeyElement('span', 'wardrobe-status', placed ? '배치 중' : owned ? '보관 중' : '');
    const title = journeyElement('h3', '', item.name);
    const detail = journeyElement('p', 'price-hint', item.detail);
    const missing = Math.max(0, item.price - p.biscuits);
    const hint = journeyElement('p', 'price-hint', !owned && missing ? `${missing}개 부족` : '');
    const button = journeyButton(owned ? placed ? '치우기' : '놓기' : `비스킷 ${item.price}개`, `item-${item.id}`, () => act(owned ? { type: 'place_item', item: item.id, placed: !placed } : { type: 'buy_item', item: item.id }), blocked || (!owned && missing > 0));
    card.append(badge, roomItemIcon(item), title, detail, hint, button); $('wardrobe-list').append(card);
  }
}
