// 퍼그 스튜디오에서 만든 옷·모자·장난감·가구를 게임 화면에 그려요.
// 보안 설정(CSP) 때문에 <style> 대신 요소의 style 속성(CSSOM)만 사용해요.
// 좌표 기준: 가슴 그림은 (0,0) 중심, 목 장식은 '집' 자세 몸 좌표, 모자는 얼굴(pug-face-art) 좌표예요.
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLLAR_BOX = Object.freeze({ x: 100, y: 200, w: 200, h: 200 });
const HAT_BOX = Object.freeze({ x: 40, y: -60, w: 320, h: 320 });
const COLLAR_LABELS = Object.freeze({ none: '없음', round: '둥근 카라', pointed: '뾰족 카라', sailor: '세일러 카라', ribbon: '리본', bowtie: '나비넥타이', tie: '넥타이', bell: '방울', custom: '직접 그리기' });

function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16), mix = c => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map(c => mix(c).toString(16).padStart(2, '0')).join('')}`;
}
// 목 장식 기본 모양들. 왼쪽 절반을 그리고 오른쪽은 좌우 반전으로 만들어요.
const COLLAR_SHAPES = {
  round: { half: ['M200 287C184 286 160 283 146 280C139 297 152 313 172 313C188 313 198 301 200 287Z'] },
  pointed: { half: ['M200 288C181 286 160 283 143 279L166 320C182 310 194 299 200 288Z'] },
  sailor: { half: ['M200 330L151 280L134 283C131 302 136 320 150 334Z'], lines: ['M194 318L152 288'] },
  ribbon: { half: ['M200 296C187 279 163 281 165 298C167 313 188 309 200 296Z', 'M197 301L186 325L195 321L199 303Z'], center: '<ellipse cx="200" cy="297" rx="7.5" ry="8.5"/>' },
  bowtie: { half: ['M200 297L175 284C170 294 170 302 175 311Z'], center: '<rect x="193" y="290" width="14" height="14" rx="4"/>' },
  tie: { center: '<path d="M192 286H208L205 299H195Z"/><path d="M195 299H205L212 337L200 350L188 337Z"/>' },
  bell: { band: true, center: '<circle cx="200" cy="303" r="11"/><path d="M193 307Q200 311 207 307" fill="none"/><circle cx="200" cy="292" r="3"/>' },
};
function collarMarkup(type, fill) {
  const shape = COLLAR_SHAPES[type]; if (!shape) return '';
  const stroke = shadeColor(fill, -.32), light = shadeColor(fill, .55);
  const half = (shape.half ?? []).map(d => `<path d="${d}"/>`).join('');
  const lines = (shape.lines ?? []).map(d => `<path d="${d}" fill="none" stroke="${light}" stroke-width="4"/>`).join('');
  const band = shape.band ? `<path d="M140 281Q200 301 260 281" fill="none" stroke="${fill}" stroke-width="8"/><path d="M140 281Q200 301 260 281" fill="none" stroke="${stroke}" stroke-width="1.5" opacity=".6"/>` : '';
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${band}<g>${half}${lines}</g><g transform="matrix(-1 0 0 1 400 0)">${half}${lines}</g>${shape.center ?? ''}</g>`;
}
function svgImage(href, x, y, w, h) {
  const image = document.createElementNS(SVG_NS, 'image');
  image.setAttribute('href', href); image.setAttribute('x', x); image.setAttribute('y', y);
  image.setAttribute('width', w); image.setAttribute('height', h); image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return image;
}
function defGroup(defs, id, tag = 'g') {
  let node = defs.querySelector(`[id="${id}"]`);
  if (!node || node.tagName !== tag) { node?.remove(); node = document.createElementNS(SVG_NS, tag); node.id = id; defs.append(node); }
  return node;
}
// 옷 하나에 필요한 <pattern>, 가슴 그림, 목 장식을 공용 SVG <defs>에 만들어요. prefix는 문서 안에서 겹치지 않는 이름이에요.
function upsertOutfitDefs(defs, prefix, custom) {
  if (custom.style === 'pattern') {
    const pattern = defGroup(defs, `${prefix}-pattern`, 'pattern');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse'); pattern.setAttribute('width', custom.tile); pattern.setAttribute('height', custom.tile);
    const base = document.createElementNS(SVG_NS, 'rect'); base.setAttribute('width', custom.tile); base.setAttribute('height', custom.tile); base.setAttribute('fill', custom.base);
    pattern.replaceChildren(base, ...(custom.image ? [svgImage(custom.image, 0, 0, custom.tile, custom.tile)] : []));
  } else {
    const s = custom.motifSize;
    defGroup(defs, `${prefix}-motif`).replaceChildren(...(custom.image ? [svgImage(custom.image, -s / 2, -s / 2, s, s)] : []));
  }
  const collar = defGroup(defs, `${prefix}-collar`);
  if (custom.collar.type === 'custom' && custom.collar.image) collar.replaceChildren(svgImage(custom.collar.image, COLLAR_BOX.x, COLLAR_BOX.y, COLLAR_BOX.w, COLLAR_BOX.h));
  else collar.innerHTML = collarMarkup(custom.collar.type, custom.collar.color);
}
function upsertHatDefs(defs, prefix, custom) {
  defGroup(defs, `${prefix}-hat`).replaceChildren(svgImage(custom.image, HAT_BOX.x, HAT_BOX.y, HAT_BOX.w, HAT_BOX.h));
}
function sharedDefs() { return document.querySelector('.shared-svg defs'); }
function customOutfitPatterns() {
  const defs = sharedDefs(); if (!defs || !state) return;
  for (const outfit of state.outfits ?? []) if (outfit.custom) upsertOutfitDefs(defs, `custom-${outfit.id}`, outfit.custom);
  for (const hat of state.hats ?? []) if (hat.custom) upsertHatDefs(defs, `custom-${hat.id}`, hat.custom);
}
function setSlots(stage, selector, href) { for (const use of stage.querySelectorAll(selector)) use.setAttribute('href', href); }
// 퍼그(pet-stage)에 입힌 옷이 스튜디오 옷이면 원단·가슴 그림·목 장식을 지정해요.
function applyOutfitLook(stage, outfit, prefix = outfit ? `custom-${outfit.id}` : '') {
  const custom = outfit?.custom;
  if (custom) {
    stage.style.setProperty('--fabric', custom.style === 'pattern' ? `url(#${prefix}-pattern)` : custom.base);
    stage.style.setProperty('--seam', custom.seam);
    setSlots(stage, '.custom-motif-slot', `#${prefix}-motif`); setSlots(stage, '.custom-collar-slot', `#${prefix}-collar`);
  } else { stage.style.removeProperty('--fabric'); stage.style.removeProperty('--seam'); }
  stage.toggleAttribute('data-custom-motif', custom?.style === 'motif');
  stage.toggleAttribute('data-custom-collar', Boolean(custom && custom.collar.type !== 'none'));
}
function applyHatLook(stage, hat, prefix = hat ? `custom-${hat.id}` : '') {
  if (hat?.custom) setSlots(stage, '.custom-hat-slot', `#${prefix}-hat`);
  stage.toggleAttribute('data-custom-hat', Boolean(hat?.custom));
}
// 상점·옷장 아이콘
function customShirtIcon(outfit, preview, shirt) {
  const c = outfit.custom;
  preview.style.background = c.background;
  if (c.style === 'pattern') {
    const size = Math.max(10, Math.round(c.tile * .55));
    shirt.style.background = c.image ? `url("${c.image}") 0 0 / ${size}px ${size}px, ${c.base}` : c.base;
  } else {
    shirt.style.background = c.base;
    if (c.image) { const motif = document.createElement('img'); motif.className = 'mini-motif'; motif.src = c.image; motif.alt = ''; shirt.append(motif); }
  }
}
function customHatIcon(hat, preview) {
  preview.style.background = hat.custom.background;
  const img = document.createElement('img'); img.className = 'mini-hat'; img.src = hat.custom.image; img.alt = '';
  preview.append(img);
}
// 방 소품: 가로 위치(%) · 바닥에서 높이(px) · 크기(px)
function placeCustomRoomObject(object, item) {
  object.style.left = `${item.custom.x}%`;
  object.style.bottom = `${item.custom.bottom}px`;
  object.style.width = `${item.custom.size}px`;
  object.style.height = `${item.custom.size}px`;
}
function customItemSvg(item) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
  const image = svgImage(item.custom.image, 0, 0, 100, 100); image.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.append(image); return svg;
}
