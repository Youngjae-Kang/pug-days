// 퍼그 스튜디오 상품 검증. 서버(server.mjs)의 스튜디오 API와 테스트에서 함께 사용해요.
export const STUDIO_KINDS = Object.freeze(['outfit', 'hat', 'toy', 'furniture']);
export const OUTFIT_STYLES = Object.freeze(['pattern', 'motif']);
export const COLLAR_TYPES = Object.freeze(['none', 'round', 'pointed', 'sailor', 'ribbon', 'bowtie', 'tie', 'bell', 'custom']);
export const IMAGE_TYPES = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' });
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{1,30}$/;
const HEX = /^#[0-9a-f]{6}$/i;

export class StudioError extends Error {}
const fail = message => { throw new StudioError(message); };
const text = (value, label, min, max) => {
  if (typeof value !== 'string') fail(`${label}을(를) 입력해주세요.`);
  const v = value.trim();
  if (v.length < min || v.length > max) fail(`${label}은(는) ${min}~${max}자로 적어주세요.`);
  return v;
};
const number = (value, label, min, max, integer = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(`${label}은(는) ${min}~${max} 사이${integer ? ' 정수' : ''}로 적어주세요.`);
  return integer ? n : Math.round(n * 10) / 10;
};
const color = (value, label) => { if (typeof value !== 'string' || !HEX.test(value)) fail(`${label} 색을 다시 골라주세요.`); return value.toLowerCase(); };

// 스튜디오에서 받은 상품 정보를 안전한 형태로 정리해요. 이미지 경로는 서버가 정해요.
// ext: 대표 이미지 확장자, collarExt: 직접 그린 목 장식 이미지 확장자(없으면 null)
export function normalizeStudioItem(raw, builtinIds, ext, version, collarExt = null) {
  if (!raw || typeof raw !== 'object') fail('상품 정보가 없어요.');
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) fail('상품 코드는 영어 소문자·숫자·하이픈 2~31자예요.');
  if (builtinIds.has(raw.id)) fail('기본 상품과 같은 코드는 쓸 수 없어요.');
  if (!STUDIO_KINDS.includes(raw.kind)) fail('종류를 골라주세요.');
  if (!Object.values(IMAGE_TYPES).includes(ext)) fail('이미지 형식을 확인해주세요.');
  const item = {
    id: raw.id, kind: raw.kind,
    name: text(raw.name, '이름', 1, 16),
    price: number(raw.price, '가격', 1, 9999, true),
    detail: typeof raw.detail === 'string' ? raw.detail.trim().slice(0, 40) : '',
    background: color(raw.background ?? '#f4eadd', '아이콘 배경'),
    hidden: raw.hidden === true,
    image: `/shop/${raw.id}.${ext}`,
    version: number(version, '버전', 1, Number.MAX_SAFE_INTEGER, true),
  };
  if (item.kind === 'outfit') {
    item.style = OUTFIT_STYLES.includes(raw.style) ? raw.style : fail('옷 스타일(패턴/가운데 그림)을 골라주세요.');
    item.tile = number(raw.tile ?? 34, '무늬 크기', 8, 120, true);
    item.motifSize = number(raw.motifSize ?? 54, '그림 크기', 16, 140, true);
    item.base = color(raw.base ?? '#f6e3c8', '옷 바탕');
    item.seam = color(raw.seam ?? '#b6956e', '테두리');
    const collar = raw.collar && typeof raw.collar === 'object' ? raw.collar : { type: 'none' };
    if (!COLLAR_TYPES.includes(collar.type)) fail('목 장식 종류를 다시 골라주세요.');
    item.collar = { type: collar.type, color: color(collar.color ?? '#fffaf0', '목 장식') };
    if (collar.type === 'custom') {
      if (collarExt !== 'svg') fail('직접 그린 목 장식이 없어요.');
      item.collar.image = `/shop/${raw.id}-collar.svg`;
    }
  } else if (item.kind !== 'hat') {
    item.x = number(raw.x ?? 10, '가로 위치', 0, 95);
    item.bottom = number(raw.bottom ?? 85, '바닥에서 높이', 0, 460, true);
    item.size = number(raw.size ?? 60, '크기', 16, 280, true);
  }
  return item;
}

// data:image/...;base64,... 형식의 이미지를 확인하고 파일 내용으로 바꿔요.
export function decodeStudioImage(dataUrl) {
  if (typeof dataUrl !== 'string') fail('이미지가 없어요. 디자인을 먼저 그려주세요.');
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) fail('PNG·JPG·WEBP·GIF·SVG 이미지만 쓸 수 있어요.');
  const type = match[1].toLowerCase(), bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail('이미지는 3MB 이하로 만들어주세요.');
  const head = bytes.subarray(0, 12).toString('hex');
  const ok = type === 'image/png' ? head.startsWith('89504e47')
    : type === 'image/jpeg' ? head.startsWith('ffd8ff')
    : type === 'image/gif' ? head.startsWith('47494638')
    : type === 'image/webp' ? head.startsWith('52494646') && bytes.subarray(8, 12).toString() === 'WEBP'
    : isSafeSvg(bytes.toString('utf8'));
  if (!ok) fail('이미지 파일이 손상됐거나 허용되지 않는 내용이 있어요.');
  return { bytes, ext: IMAGE_TYPES[type] };
}
// 직접 만든 SVG라도 스크립트·외부 연결이 섞이지 않게 막아요. (안에 넣은 data: 이미지는 허용)
export function isSafeSvg(source) {
  return /<svg[\s>]/i.test(source) && !/<script|<foreignObject|<iframe|<object|<embed|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i.test(source);
}
export function catalogSource(items) {
  return `// 퍼그 스튜디오(http://localhost:3000/studio)가 자동으로 고쳐 쓰는 파일이에요.\n// 직접 수정해도 되지만, 스튜디오에서 편집하는 것을 추천해요.\nexport const CUSTOM_SHOP = ${JSON.stringify(items, null, 2)};\n`;
}
