// 퍼그 스튜디오: 옷(무늬/가운데 그림 + 목 장식) · 모자 · 장난감 · 가구를 벡터로 그려 퍼그에게 바로 적용하고 상점에 저장해요.
// 퍼그 그림체(부드러운 선 + 진한 외곽선)에 맞도록 모든 디자인은 SVG로 저장돼요.
const $ = id => document.getElementById(id);
const KIND_LABEL = { outfit: '옷', hat: '모자', toy: '장난감', furniture: '가구' };
const PALETTE = ['#fffaf0', '#f6e3c8', '#f3dbb4', '#e8a28f', '#dfadbb', '#cb7883', '#d9655b', '#e5c36f', '#d6ac78', '#c7d9a5', '#97bca3', '#759a7f', '#a2c6db', '#7693b5', '#a99bc7', '#606d96', '#9b7b62', '#786153', '#56453b', '#414148'];
const POSES = [['', '집'], ['walk', '산책'], ['down', '엎드려'], ['bang', '빵야'], ['stand', '일어서']];
const PREFIX = 'studio-preview';
const UNIT_BOX = { x: 0, y: 0, w: 100, h: 100 };
// 그리는 부분마다 캔버스 좌표계·기본 선 두께·안내가 달라요.
const SPACES = {
  tile: { box: UNIT_BOX, pad: 34, stroke: 4, tip: '점선 칸이 무늬 한 칸이에요. 칸 밖으로 그린 부분은 반대편에 이어 붙어서 이음새 없이 반복돼요.' },
  motif: { box: UNIT_BOX, pad: 6, stroke: 4, tip: '옷 가슴 한가운데에 들어갈 그림이에요. 오른쪽 ‘그림 크기’로 옷 위 크기를 조절해요.' },
  collar: { box: COLLAR_BOX, pad: 0, stroke: 3, tip: '흐린 퍼그의 목둘레에 맞춰 카라·리본 등을 그려요. ‘대칭 복사’로 반대쪽을 똑같이 만들 수 있어요.' },
  hat: { box: HAT_BOX, pad: 0, stroke: 3.5, tip: '흐린 퍼그 머리 위에 그대로 그려요. 그린 위치 그대로 다섯 자세 모두에 씌워져요.' },
  item: { box: UNIT_BOX, pad: 6, stroke: 3.5, tip: '아래쪽 굵은 선이 바닥이에요. 바닥에 닿는 부분을 선에 맞춰 주세요.' },
};
const KIND_HINT = {
  outfit: '무늬를 반복하거나 가슴에 그림 하나를 넣고, 카라·리본 같은 목 장식을 골라요. 다섯 자세의 몸 모양에 자동으로 입혀져요.',
  hat: '퍼그 머리 위에 직접 모자를 그려요. 집·산책·엎드려·빵야·일어서 모든 자세와 공부 친구에게 씌워져요.',
  toy: '장난감은 방 바닥에 놓이고, 집중 동행 놀이 시간에 퍼그가 굴리며 놀아요.',
  furniture: '가구는 방에 놓이는 장식이에요. 오른쪽에서 방 안 위치와 크기를 정해요.',
};
const SHAPE_TOOLS = ['ellipse', 'rect', 'heart', 'star', 'triangle'];

let catalog = [], builtinIds = new Set(), filter = 'all';
let selectedItemId = null, isNew = true, dirty = false;
let kind = 'outfit', outfitStyle = 'pattern', collarType = 'none', layer = 'main';
let doc = { main: [], collar: [] }, selected = null, tool = 'select';
let color = '#e8a28f', outline = true, strokeWidth = 3;
let undoStack = [], redoStack = [], drag = null, uid = 1;
let poseStages = [], roomObject = null, pugTemplate = null;
const editor = $('editor');

/* ---------- 공통 ---------- */
function toast(message) {
  const box = $('studio-toast'); box.textContent = message; box.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { box.hidden = true; }, 3800);
}
function setDirty(value = true) { dirty = value; $('dirty-mark').hidden = !value; }
function pressed(selector, test) { for (const b of document.querySelectorAll(selector)) b.setAttribute('aria-pressed', String(test(b))); }
function confirmLeave() { return !dirty || confirm('저장하지 않은 디자인이 있어요. 버리고 이동할까요?'); }
const randomId = () => `my-${Math.random().toString(36).slice(2, 7)}`;
const loadImage = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const round = n => Math.round(n * 100) / 100;
const svgDataUrl = markup => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
function readFileAsDataUrl(file) { return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); }); }
async function toDataUrl(url) { return readFileAsDataUrl(await (await fetch(url)).blob()); }

/* ---------- 그리는 공간 ---------- */
function spaceKey(forLayer = layer) {
  if (kind === 'outfit') return forLayer === 'collar' ? 'collar' : outfitStyle === 'pattern' ? 'tile' : 'motif';
  return kind === 'hat' ? 'hat' : 'item';
}
const space = (forLayer) => SPACES[spaceKey(forLayer)];
const elements = () => doc[layer];

/* ---------- 도형 → SVG ---------- */
function bbox(el) {
  if (el.type !== 'path') return { x: el.x, y: el.y, w: el.w, h: el.h };
  const xs = el.pts.map(p => p[0]), ys = el.pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function smoothPath(pts) {
  if (pts.length === 1) return `M${round(pts[0][0])} ${round(pts[0][1])}h.01`;
  if (pts.length === 2) return `M${pts.map(p => `${round(p[0])} ${round(p[1])}`).join('L')}`;
  let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[i + 1];
    d += `Q${round(x)} ${round(y)} ${round((x + nx) / 2)} ${round((y + ny) / 2)}`;
  }
  const last = pts.at(-1); return `${d}L${round(last[0])} ${round(last[1])}`;
}
function shapePath(el) {
  const { x, y, w, h } = el, P = (u, v) => `${round(x + u * w)} ${round(y + v * h)}`;
  if (el.type === 'heart') return `M${P(.5, .96)}C${P(.18, .74)} ${P(0, .52)} ${P(0, .3)}C${P(0, .1)} ${P(.15, 0)} ${P(.3, 0)}C${P(.41, 0)} ${P(.48, .07)} ${P(.5, .16)}C${P(.52, .07)} ${P(.59, 0)} ${P(.7, 0)}C${P(.85, 0)} ${P(1, .1)} ${P(1, .3)}C${P(1, .52)} ${P(.82, .74)} ${P(.5, .96)}Z`;
  if (el.type === 'triangle') return `M${P(.5, 0)}L${P(1, 1)}L${P(0, 1)}Z`;
  if (el.type === 'star') {
    const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? .21 : .5, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(P(.5 + r * Math.cos(a), .52 + r * Math.sin(a))); }
    return `M${pts.join('L')}Z`;
  }
  return '';
}
function elementMarkup(el) {
  const b = bbox(el), cx = round(b.x + b.w / 2), cy = round(b.y + b.h / 2);
  const t = [el.rot ? `rotate(${el.rot} ${cx} ${cy})` : '', el.flip ? `translate(${cx} 0) scale(-1 1) translate(${-cx} 0)` : ''].join(' ').trim();
  const tr = t ? ` transform="${t}"` : '';
  if (el.type === 'path') return `<path d="${smoothPath(el.pts)}" fill="none" stroke="${el.color}" stroke-width="${el.sw}" stroke-linecap="round" stroke-linejoin="round"${tr}/>`;
  if (el.type === 'image') return `<image href="${esc(el.href)}" x="${round(el.x)}" y="${round(el.y)}" width="${round(el.w)}" height="${round(el.h)}" preserveAspectRatio="none"${tr}/>`;
  const paint = `fill="${el.color}" stroke="${el.outline ? shadeColor(el.color, -.3) : 'none'}" stroke-width="${el.sw}" stroke-linejoin="round"`;
  if (el.type === 'ellipse') return `<ellipse cx="${cx}" cy="${cy}" rx="${round(el.w / 2)}" ry="${round(el.h / 2)}" ${paint}${tr}/>`;
  if (el.type === 'rect') return `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.w)}" height="${round(el.h)}" rx="${round(Math.min(el.w, el.h) * .18)}" ${paint}${tr}/>`;
  return `<path d="${shapePath(el)}" ${paint}${tr}/>`;
}
// 완성 이미지(SVG data URL). 무늬는 3×3으로 이어 붙여 이음새 없는 한 칸을 만들어요.
function exportLayer(name) {
  const list = doc[name]; if (!list.length) return null;
  const { box } = space(name), body = list.map(elementMarkup).join('');
  const content = spaceKey(name) === 'tile'
    ? `<defs><g id="t">${body}</g></defs>${[-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => `<use href="#t" x="${i * box.w}" y="${j * box.h}"/>`)).join('')}`
    : body;
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w * 4}" height="${box.h * 4}">${content}</svg>`);
}

/* ---------- 그림판 화면 ---------- */
function setupEditor() {
  const s = space(), { box } = s, pad = s.pad;
  editor.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`);
  const key = spaceKey();
  const bg = key === 'tile' || key === 'motif' ? $('f-base').value : '#fbfaf5';
  let guide = '';
  if ((key === 'collar' || key === 'hat') && pugTemplate) guide = '<svg class="ed-pug" x="0" y="0" width="400" height="390" viewBox="0 0 400 390"></svg>';
  if (key === 'item') guide = `<path d="M-6 99.5H106" stroke="#c9b48f" stroke-width="1.6"/><text x="50" y="97" text-anchor="middle" font-size="4" fill="#b9a988">바닥</text>`;
  const ghost = key === 'tile' ? [-1, 0, 1].flatMap(i => [-1, 0, 1].filter(j => i || j).map(j => `<use href="#ed-content" x="${i * 100}" y="${j * 100}"/>`)).join('') : '';
  editor.innerHTML = `<rect class="ed-bg" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${bg}"/>`
    + `<g class="ed-guide">${guide}</g><g class="ed-ghost">${ghost}</g><g id="ed-content"></g>`
    + `<rect class="ed-frame" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/><g id="ed-select"></g>`;
  const pug = editor.querySelector('.ed-pug');
  if (pug) { for (const child of pugTemplate.children) pug.append(document.importNode(child, true)); pug.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); }
  $('canvas-tip').textContent = s.tip;
  $('stroke-width').max = String(Math.round(s.stroke * 4));
  renderEditor();
}
function renderEditor() {
  const content = $('ed-content'); if (!content) return;
  content.innerHTML = elements().map(el => `<g data-uid="${el.uid}">${elementMarkup(el)}</g>`).join('') + (drag?.preview ? `<g class="ed-live">${elementMarkup(drag.preview)}</g>` : '');
  const sel = $('ed-select'), el = elements().find(e => e.uid === selected);
  if (!el) { sel.innerHTML = ''; syncProps(); return; }
  const b = bbox(el), s = space().box.w * .016, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rot = el.rot ? ` transform="rotate(${el.rot} ${cx} ${cy})"` : '';
  const corners = [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]];
  sel.innerHTML = `<g${rot}><rect class="ed-sel" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>${corners.map(([c, x, y]) => `<rect class="ed-handle" data-handle="${c}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" rx="${s * .4}"/>`).join('')}</g>`;
  syncProps();
}
function syncProps() {
  const el = elements().find(e => e.uid === selected);
  for (const id of ['duplicate', 'mirror-copy', 'flip', 'forward', 'backward', 'remove-el']) $(id).disabled = !el;
  $('rotation').disabled = !el;
  if (!el) return;
  if (el.color) setColor(el.color, false);
  $('outline').checked = el.type === 'path' || el.type === 'image' ? outline : el.outline;
  if (el.sw) $('stroke-width').value = String(el.sw);
  $('rotation').value = String(el.rot || 0);
}
function toPoint(event) {
  const pt = editor.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY;
  const p = pt.matrixTransform(editor.getScreenCTM().inverse()); return [p.x, p.y];
}
function snapshot() { undoStack.push(JSON.stringify(doc)); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(doc)); doc = JSON.parse(from.pop()); selected = null; changed();
}
function changed() { setDirty(); renderEditor(); schedulePreview(); }
function newElement(type, extra) {
  const base = { uid: uid++, type, rot: 0, flip: false };
  if (type === 'path') return { ...base, color, sw: strokeWidth * 1.6, ...extra };
  if (type === 'image') return { ...base, ...extra };
  return { ...base, color, outline, sw: strokeWidth, ...extra };
}
function normalizeBox(a, b, square) {
  let w = b[0] - a[0], h = b[1] - a[1];
  if (square) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  return { x: Math.min(a[0], a[0] + w), y: Math.min(a[1], a[1] + h), w: Math.abs(w), h: Math.abs(h) };
}
editor.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); editor.setPointerCapture(event.pointerId);
  const p = toPoint(event), handle = event.target.closest('[data-handle]');
  if (tool === 'select') {
    const el = elements().find(e => e.uid === selected);
    if (handle && el) { snapshot(); drag = { mode: 'resize', corner: handle.dataset.handle, start: bbox(el), orig: structuredClone(el) }; return; }
    const hit = event.target.closest('[data-uid]');
    selected = hit ? Number(hit.dataset.uid) : null; renderEditor();
    if (hit) { snapshot(); drag = { mode: 'move', last: p, moved: false }; }
    return;
  }
  selected = null;
  if (tool === 'brush') drag = { mode: 'brush', preview: newElement('path', { pts: [p] }) };
  else if (tool === 'line') drag = { mode: 'line', preview: newElement('path', { pts: [p, p] }) };
  else drag = { mode: 'shape', start: p, preview: newElement(tool, { x: p[0], y: p[1], w: 0, h: 0 }) };
  renderEditor();
});
editor.addEventListener('pointermove', event => {
  if (!drag) return; const p = toPoint(event);
  if (drag.mode === 'move') {
    const el = elements().find(e => e.uid === selected), dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    if (el.type === 'path') el.pts = el.pts.map(([x, y]) => [x + dx, y + dy]); else { el.x += dx; el.y += dy; }
    drag.last = p; drag.moved = true; renderEditor(); schedulePreview(); return;
  }
  if (drag.mode === 'resize') {
    const el = elements().find(e => e.uid === selected), s = drag.start;
    const fixed = [drag.corner.includes('w') ? s.x + s.w : s.x, drag.corner.includes('n') ? s.y + s.h : s.y];
    const lockRatio = event.shiftKey || el.type === 'image';
    let nb = normalizeBox(fixed, p, false);
    if (lockRatio && s.w && s.h) { const k = Math.max(nb.w / s.w, nb.h / s.h); nb = normalizeBox(fixed, [fixed[0] + Math.sign(p[0] - fixed[0] || 1) * s.w * k, fixed[1] + Math.sign(p[1] - fixed[1] || 1) * s.h * k], false); }
    if (el.type === 'path') el.pts = drag.orig.pts.map(([x, y]) => [nb.x + (s.w ? (x - s.x) / s.w * nb.w : nb.w / 2), nb.y + (s.h ? (y - s.y) / s.h * nb.h : nb.h / 2)]);
    else Object.assign(el, nb);
    renderEditor(); schedulePreview(); return;
  }
  const el = drag.preview;
  if (drag.mode === 'brush') { const last = el.pts.at(-1); if (Math.hypot(p[0] - last[0], p[1] - last[1]) > space().box.w * .006) el.pts.push(p); }
  else if (drag.mode === 'line') el.pts[1] = p;
  else Object.assign(el, normalizeBox(drag.start, p, event.shiftKey));
  renderEditor();
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.mode === 'move' && !d.moved) undoStack.pop();
  if (d.mode === 'move' || d.mode === 'resize') { if (d.mode === 'resize' || d.moved) changed(); return; }
  const el = d.preview, min = space().box.w * .02;
  if (d.mode === 'shape' && el.w < min && el.h < min) { const size = space().box.w * .22; Object.assign(el, { x: el.x - size / 2, y: el.y - size / 2, w: size, h: size }); }
  snapshot(); elements().push(el); changed();
}
for (const type of ['pointerup', 'pointercancel']) editor.addEventListener(type, endDrag);
function setTool(name) {
  tool = name; pressed('[data-tool]', b => b.dataset.tool === name); editor.dataset.tool = name;
  if (name !== 'select') { selected = null; renderEditor(); }
}
function setColor(value, apply = true) {
  color = value; $('color').value = value; pressed('.palette button', b => b.dataset.color === value);
  const el = elements().find(e => e.uid === selected);
  if (apply && el && el.type !== 'image' && el.color !== value) { snapshot(); el.color = value; changed(); }
}
function editSelected(fn) { const el = elements().find(e => e.uid === selected); if (!el) return; snapshot(); fn(el); changed(); }
function mirrorElement(el, axis) {
  const b = bbox(el);
  if (el.type === 'path') el.pts = el.pts.map(([x, y]) => [2 * axis - x, y]); else el.x = 2 * axis - b.x - b.w;
  if (el.type === 'image') el.flip = !el.flip;
  el.rot = -(el.rot || 0);
}
async function addImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return toast('PNG·JPG·WEBP·GIF·SVG 파일만 넣을 수 있어요.');
  if (file.size > 2.5 * 1024 * 1024) return toast('2.5MB 이하 이미지로 줄여주세요.');
  const href = await readFileAsDataUrl(file), img = await loadImage(href);
  const { box } = space(), scale = Math.min(box.w * .6 / img.width, box.h * .6 / img.height), w = img.width * scale, h = img.height * scale;
  snapshot(); const el = newElement('image', { href, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h });
  elements().push(el); setTool('select'); selected = el.uid; changed();
}

/* ---------- 미리보기 ---------- */
let previewQueued = false;
function schedulePreview() { if (!previewQueued) { previewQueued = true; requestAnimationFrame(() => { previewQueued = false; renderPreview(); }); } }
function draftCustom() {
  const main = exportLayer('main');
  if (kind === 'outfit') return {
    style: outfitStyle, image: main, tile: Number($('f-tile').value), motifSize: Number($('f-motif').value), base: $('f-base').value, seam: $('f-seam').value, background: $('f-background').value,
    collar: { type: collarType, color: $('f-collar-color').value, image: collarType === 'custom' ? exportLayer('collar') : null },
  };
  if (kind === 'hat') return { image: main, background: $('f-background').value };
  return { image: main, x: Number($('f-x').value), bottom: Number($('f-bottom').value), size: Number($('f-size').value), background: $('f-background').value };
}
function renderPreview() {
  $('o-tile').textContent = $('f-tile').value; $('o-motif').textContent = $('f-motif').value;
  $('o-x').textContent = `${$('f-x').value}%`; $('o-bottom').textContent = `${$('f-bottom').value}px`; $('o-size').textContent = `${$('f-size').value}px`;
  const room = kind === 'toy' || kind === 'furniture';
  $('pose-preview').hidden = room; $('room-preview').hidden = !room;
  const bg = editor.querySelector('.ed-bg'); if (bg && ['tile', 'motif'].includes(spaceKey())) bg.setAttribute('fill', $('f-base').value);
  const custom = draftCustom();
  if (pugTemplate) {
    const defs = document.querySelector('.shared-svg defs');
    if (kind === 'outfit') upsertOutfitDefs(defs, PREFIX, custom);
    if (kind === 'hat' && custom.image) upsertHatDefs(defs, PREFIX, custom);
    for (const stage of poseStages) {
      stage.dataset.outfit = kind === 'outfit' ? 'studio' : 'none';
      applyOutfitLook(stage, kind === 'outfit' ? { custom } : null, PREFIX);
      applyHatLook(stage, kind === 'hat' && custom.image ? { custom } : null, PREFIX);
    }
    if (room) {
      roomObject.replaceChildren(); roomObject.hidden = !custom.image;
      if (custom.image) { roomObject.append(customItemSvg({ custom })); placeCustomRoomObject(roomObject, { custom }); }
    }
  }
  renderShopCard(custom);
}
function renderShopCard(custom) {
  const card = document.createElement('article'); card.className = 'wardrobe-card';
  const icon = document.createElement('div'); icon.className = room() ? 'item-preview' : 'outfit-preview';
  if (kind === 'outfit') { const shirt = document.createElement('div'); shirt.className = 'mini-shirt'; icon.append(shirt); customShirtIcon({ custom }, icon, shirt); }
  else if (kind === 'hat') { if (custom.image) customHatIcon({ custom }, icon); else icon.style.background = custom.background; }
  else { icon.style.background = custom.background; if (custom.image) icon.append(customItemSvg({ custom })); }
  const title = document.createElement('h3'); title.textContent = $('f-name').value.trim() || '이름 없는 상품';
  const hint = document.createElement('p'); hint.className = 'price-hint'; hint.textContent = $('f-detail').value.trim() || '스튜디오 신상';
  const button = document.createElement('button'); button.className = 'quest-button'; button.type = 'button'; button.tabIndex = -1;
  button.textContent = `비스킷 ${Number($('f-price').value) || 0}개`;
  card.append(icon, title, hint, button); $('shop-card').replaceChildren(card);
}
const room = () => kind === 'toy' || kind === 'furniture';
async function buildPreviewStages() {
  try {
    const page = new DOMParser().parseFromString(await (await fetch('/')).text(), 'text/html');
    document.body.prepend(document.importNode(page.querySelector('.shared-svg'), true));
    pugTemplate = page.querySelector('#pet-stage .pug');
    for (const [pose, label] of POSES) {
      const box = document.createElement('figure'); box.className = 'pose-box';
      const stage = document.createElement('div'); stage.className = 'pet-stage';
      if (pose) stage.dataset.animation = pose;
      stage.dataset.hat = 'none'; stage.append(document.importNode(pugTemplate, true));
      const caption = document.createElement('figcaption'); caption.textContent = label;
      box.append(stage, caption); $('pose-preview').append(box); poseStages.push(stage);
    }
    const roomNode = document.importNode(page.querySelector('.room'), true);
    roomNode.querySelectorAll('button, .walk-controls, .walk-friend, .walk-find, .room-hint').forEach(node => node.remove());
    roomNode.querySelector('.speech').textContent = '새 물건이다! 킁킁';
    roomNode.querySelector('#pet-name').textContent = '미리보기';
    roomNode.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    roomNode.querySelector('.pet-stage').dataset.outfit = 'none';
    roomObject = document.createElement('div'); roomObject.className = 'room-object studio-object'; roomNode.append(roomObject);
    $('room-preview').append(roomNode);
    setupEditor();
  } catch {
    $('pose-preview').textContent = '게임 화면을 불러오지 못했어요. 로컬 서버가 켜져 있는지 확인해주세요.';
  }
}

/* ---------- 상품 편집 ---------- */
function updateKindUi() {
  pressed('[data-kind]', b => b.dataset.kind === kind); pressed('[data-style]', b => b.dataset.style === outfitStyle);
  pressed('[data-collar]', b => b.dataset.collar === collarType);
  $('kind-hint').textContent = KIND_HINT[kind];
  $('style-row').hidden = kind !== 'outfit';
  $('outfit-fields').hidden = kind !== 'outfit'; $('room-fields').hidden = !room();
  $('tile-field').hidden = outfitStyle !== 'pattern'; $('motif-field').hidden = outfitStyle !== 'motif';
  $('collar-color-field').hidden = ['none', 'custom'].includes(collarType);
  const collarTab = document.querySelector('[data-layer=collar]'); collarTab.hidden = !(kind === 'outfit' && collarType === 'custom');
  if (collarTab.hidden && layer === 'collar') layer = 'main';
  const mainTab = document.querySelector('[data-layer=main]');
  mainTab.textContent = kind === 'outfit' ? (outfitStyle === 'pattern' ? '무늬 한 칸' : '가운데 그림') : kind === 'hat' ? '모자' : KIND_LABEL[kind];
  for (const b of document.querySelectorAll('[data-layer]')) b.setAttribute('aria-selected', String(b.dataset.layer === layer));
}
function setLayer(next) { layer = next; selected = null; updateKindUi(); setupEditor(); }
function roomDefaults(item) {
  $('f-x').value = item?.x ?? (kind === 'toy' ? 12 : 64); $('f-bottom').value = item?.bottom ?? (kind === 'toy' ? 86 : 120);
  $('f-size').value = item?.size ?? (kind === 'toy' ? 48 : 110);
}
function fillForm(item) {
  $('f-name').value = item?.name ?? ''; $('f-price').value = item?.price ?? 50;
  $('f-id').value = item?.id ?? randomId(); $('f-id').readOnly = Boolean(item);
  $('f-detail').value = item?.detail ?? '';
  $('f-base').value = item?.base ?? '#f6e3c8'; $('f-seam').value = item?.seam ?? '#b6956e';
  $('f-tile').value = item?.tile ?? 34; $('f-motif').value = item?.motifSize ?? 54;
  $('f-collar-color').value = item?.collar?.color ?? '#fffaf0';
  roomDefaults(item);
  $('f-background').value = item?.background ?? '#f4eadd'; $('f-onsale').checked = !item?.hidden;
  $('delete').hidden = !item; $('form-error').textContent = '';
}
function resetDesign() { doc = { main: [], collar: [] }; selected = null; undoStack = []; redoStack = []; layer = 'main'; }
function newItem(nextKind = kind) {
  if (!confirmLeave()) return;
  selectedItemId = null; isNew = true; kind = nextKind; outfitStyle = 'pattern'; collarType = 'none';
  resetDesign(); fillForm(null); updateKindUi(); setupEditor(); setDirty(false); renderList(); schedulePreview();
}
async function openItem(item) {
  if (!confirmLeave()) return;
  selectedItemId = item.id; isNew = false; kind = item.kind;
  outfitStyle = item.style ?? 'pattern'; collarType = item.collar?.type ?? 'none';
  resetDesign(); fillForm(item);
  const { design } = await api('/studio-api/design', { id: item.id }).catch(() => ({}));
  if (design?.layers) doc = { main: design.layers.main ?? [], collar: design.layers.collar ?? [] };
  else {
    // 도안 파일이 없으면 저장된 이미지를 그림판에 한 장 깔아 두고 이어서 편집해요.
    const { box } = space('main');
    doc.main = [newElement('image', { href: await toDataUrl(`${item.image}?v=${item.version}`), ...box })];
    if (item.collar?.image) doc.collar = [newElement('image', { href: await toDataUrl(`${item.collar.image}?v=${item.version}`), ...COLLAR_BOX })];
  }
  uid = Math.max(uid, ...doc.main.map(e => e.uid + 1), ...doc.collar.map(e => e.uid + 1));
  updateKindUi(); setupEditor(); setDirty(false); renderList(); schedulePreview();
}
function renderList() {
  const shown = catalog.filter(item => filter === 'all' || item.kind === filter);
  $('list-empty').hidden = shown.length > 0;
  $('item-list').replaceChildren(...shown.map(item => {
    const li = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'item-row';
    button.setAttribute('aria-current', String(item.id === selectedItemId));
    const thumb = document.createElement('span'); thumb.className = 'item-thumb'; thumb.style.background = item.kind === 'outfit' ? item.base : item.background;
    const img = document.createElement('img'); img.src = `${item.image}?v=${item.version}`; img.alt = ''; thumb.append(img);
    const text = document.createElement('span'); text.className = 'item-text';
    const name = document.createElement('strong'); name.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${KIND_LABEL[item.kind]} · 비스킷 ${item.price}${item.hidden ? ' · 진열 안 함' : ''}`;
    text.append(name, meta); button.append(thumb, text);
    button.addEventListener('click', () => openItem(item));
    li.append(button); return li;
  }));
}
async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '스튜디오 서버에 연결하지 못했어요.');
  return data;
}
async function loadCatalog() { const data = await api('/studio-api/catalog'); catalog = data.items; builtinIds = new Set(data.builtinIds); renderList(); }
async function save(event) {
  event.preventDefault(); $('form-error').textContent = '';
  const id = $('f-id').value.trim();
  if (isNew && builtinIds.has(id)) { $('form-error').textContent = '기본 상품과 같은 코드예요. 다른 코드를 정해주세요.'; return; }
  const main = exportLayer('main');
  if (!main) { $('form-error').textContent = kind === 'outfit' && outfitStyle === 'pattern' ? '무늬 한 칸을 먼저 그려주세요.' : '먼저 디자인을 그려주세요.'; return; }
  const collar = kind === 'outfit' && collarType === 'custom' ? exportLayer('collar') : null;
  if (kind === 'outfit' && collarType === 'custom' && !collar) { $('form-error').textContent = '‘목 장식’ 칸에 장식을 그리거나 다른 목 장식을 골라주세요.'; return; }
  const item = {
    id, kind, name: $('f-name').value, price: Number($('f-price').value), detail: $('f-detail').value,
    background: $('f-background').value, hidden: !$('f-onsale').checked,
    style: outfitStyle, tile: Number($('f-tile').value), motifSize: Number($('f-motif').value), base: $('f-base').value, seam: $('f-seam').value,
    collar: { type: collarType, color: $('f-collar-color').value },
    x: Number($('f-x').value), bottom: Number($('f-bottom').value), size: Number($('f-size').value),
  };
  $('save').disabled = true;
  try {
    const data = await api('/studio-api/save', { isNew, item, images: { main, ...(collar ? { collar } : {}) }, design: { v: 2, layers: doc } });
    catalog = data.items; selectedItemId = id; isNew = false;
    $('f-id').readOnly = true; $('delete').hidden = false; setDirty(false); renderList();
    toast(`저장했어요! 게임을 새로고침하면 상점 ‘${KIND_LABEL[kind]}’ 칸에 보여요.`);
  } catch (e) { $('form-error').textContent = e.message; }
  $('save').disabled = false;
}
async function remove() {
  const item = catalog.find(c => c.id === selectedItemId); if (!item) return;
  if (!confirm(`‘${item.name}’을(를) 삭제할까요?\n이미 산 플레이어에게서도 사라져요. 판매만 멈추려면 ‘상점에 진열하기’를 끄고 저장하세요.`)) return;
  try {
    const data = await api('/studio-api/delete', { id: item.id }); catalog = data.items;
    setDirty(false); newItem(item.kind); toast('삭제했어요.');
  } catch (e) { $('form-error').textContent = e.message; }
}

/* ---------- 시작 ---------- */
function init() {
  $('palette').replaceChildren(...PALETTE.map(value => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.color = value; b.title = value; b.setAttribute('aria-label', `색 ${value}`);
    b.style.background = value; b.addEventListener('click', () => setColor(value)); return b;
  }));
  $('collar-types').replaceChildren(...Object.entries(COLLAR_LABELS).map(([type, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.collar = type; b.textContent = label;
    b.addEventListener('click', () => {
      collarType = type; setDirty(); updateKindUi();
      if (type === 'custom') setLayer('collar'); else { if (layer === 'collar') setLayer('main'); }
      schedulePreview();
    });
    return b;
  }));
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
  for (const b of document.querySelectorAll('[data-kind]')) b.addEventListener('click', () => {
    if (b.dataset.kind === kind) return;
    if (!isNew) return toast('저장한 상품의 종류는 바꿀 수 없어요. ‘+ 새 상품’으로 만들어주세요.');
    if ((doc.main.length || doc.collar.length) && !confirm('종류를 바꾸면 지금 그림이 지워져요. 바꿀까요?')) return;
    kind = b.dataset.kind; resetDesign(); roomDefaults(); updateKindUi(); setupEditor(); schedulePreview();
  });
  for (const b of document.querySelectorAll('[data-style]')) b.addEventListener('click', () => { outfitStyle = b.dataset.style; setDirty(); updateKindUi(); setupEditor(); schedulePreview(); });
  for (const b of document.querySelectorAll('[data-layer]')) b.addEventListener('click', () => setLayer(b.dataset.layer));
  for (const b of document.querySelectorAll('[data-filter]')) b.addEventListener('click', () => { filter = b.dataset.filter; pressed('[data-filter]', x => x.dataset.filter === filter); renderList(); });
  $('color').addEventListener('input', () => setColor($('color').value));
  $('outline').addEventListener('change', () => { outline = $('outline').checked; editSelected(el => { if ('outline' in el) el.outline = outline; }); });
  $('stroke-width').addEventListener('input', () => { strokeWidth = Number($('stroke-width').value); const el = elements().find(e => e.uid === selected); if (el?.sw !== undefined) { el.sw = strokeWidth; changed(); } });
  $('stroke-width').addEventListener('pointerdown', () => { if (selected) snapshot(); });
  $('rotation').addEventListener('pointerdown', () => { if (selected) snapshot(); });
  $('rotation').addEventListener('input', () => { const el = elements().find(e => e.uid === selected); if (el) { el.rot = Number($('rotation').value); changed(); } });
  $('duplicate').addEventListener('click', duplicate);
  $('mirror-copy').addEventListener('click', () => {
    const el = elements().find(e => e.uid === selected); if (!el) return;
    const { box } = space(), copy = { ...structuredClone(el), uid: uid++ };
    snapshot(); mirrorElement(copy, box.x + box.w / 2); elements().push(copy); selected = copy.uid; changed();
  });
  $('flip').addEventListener('click', () => editSelected(el => { const b = bbox(el); if (el.type === 'path') el.pts = el.pts.map(([x, y]) => [2 * (b.x + b.w / 2) - x, y]); else el.flip = !el.flip; el.rot = -(el.rot || 0); }));
  $('forward').addEventListener('click', () => editSelected(el => { const list = elements(), i = list.indexOf(el); if (i < list.length - 1) [list[i], list[i + 1]] = [list[i + 1], list[i]]; }));
  $('backward').addEventListener('click', () => editSelected(el => { const list = elements(), i = list.indexOf(el); if (i > 0) [list[i], list[i - 1]] = [list[i - 1], list[i]]; }));
  $('remove-el').addEventListener('click', removeSelected);
  $('undo').addEventListener('click', () => restore(undoStack, redoStack));
  $('redo').addEventListener('click', () => restore(redoStack, undoStack));
  $('clear').addEventListener('click', () => { if (!elements().length) return; snapshot(); doc[layer] = []; selected = null; changed(); });
  $('image-input').addEventListener('change', () => { addImage($('image-input').files[0]); $('image-input').value = ''; });
  editor.addEventListener('dragover', e => e.preventDefault());
  editor.addEventListener('drop', e => { e.preventDefault(); addImage(e.dataTransfer.files[0]); });
  $('new-item').addEventListener('click', () => newItem());
  $('item-form').addEventListener('input', () => { setDirty(); schedulePreview(); });
  $('item-form').addEventListener('submit', save);
  $('delete').addEventListener('click', remove);
  window.addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); restore(e.shiftKey ? redoStack : undoStack, e.shiftKey ? undoStack : redoStack); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'd') { e.preventDefault(); duplicate(); return; }
    if (key === 'delete' || key === 'backspace') { if (selected) { e.preventDefault(); removeSelected(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tools = { v: 'select', b: 'brush', l: 'line', o: 'ellipse', r: 'rect', h: 'heart', s: 'star', t: 'triangle' };
    if (tools[key]) setTool(tools[key]);
  });
  setTool('select'); setColor(color, false);
  newItem('outfit');
  buildPreviewStages().then(schedulePreview);
  loadCatalog().catch(e => toast(e.message));
}
function duplicate() {
  const el = elements().find(e => e.uid === selected); if (!el) return;
  const copy = { ...structuredClone(el), uid: uid++ }, off = space().box.w * .05;
  if (copy.type === 'path') copy.pts = copy.pts.map(([x, y]) => [x + off, y + off]); else { copy.x += off; copy.y += off; }
  snapshot(); elements().push(copy); selected = copy.uid; changed();
}
function removeSelected() {
  const i = elements().findIndex(e => e.uid === selected); if (i < 0) return;
  snapshot(); elements().splice(i, 1); selected = null; changed();
}
init();
