import { canvasAsset } from './pixel-f2ce3547589f.js';
import { uid, assetReferences } from './core-e9d461d88616.js';
export const ASSET_KINDS = { prop: '장식', background: '배경', portrait: '초상화', sprite_sheet: '캐릭터 동작', character_source: '전신 원본 (자동 생성용)', story_photo: '이야기 사진 (엔딩·기억)' };
export async function importAsset(file, kind, readImage) {
  if (!ASSET_KINDS[kind]) throw new Error('에셋 종류를 선택해 주세요.');
  if (kind === 'sprite_sheet' && file.type !== 'image/png') throw new Error('캐릭터 시트는 PNG를 선택해 주세요.');
  const image = await readImage(file);
  try {
    if (kind === 'sprite_sheet' && (image.width > 2048 || image.height > 2048 || image.width < 8 || image.height < 8)) throw new Error('캐릭터 시트는 8~2048 픽셀이어야 합니다.');
    const ratio = kind === 'sprite_sheet' ? 1 : Math.min(1, (kind === 'character_source' ? 384 : kind === 'prop' ? 512 : kind === 'story_photo' ? 1024 : 2048) / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const asset = canvasAsset(canvas, uid('image'), kind, { name: (file.name.replace(/\.[^.]+$/, '') || '새 이미지').slice(0, 80) });
    if (kind === 'sprite_sheet') {
      asset.frame_width = Math.min(32, canvas.width); asset.frame_height = Math.min(48, canvas.height);
      if (canvas.width % asset.frame_width || canvas.height % asset.frame_height) throw new Error('기본 32×48 칸에 맞는 시트를 선택하거나 캐릭터 공방에서 등록해 주세요.');
      asset.animations = Object.fromEntries(['idle', 'move', 'attack', 'jump', 'crouch', 'hurt', 'down'].map((name, i) => [name, { row: Math.min(i, canvas.height / asset.frame_height - 1), frames: Math.min(8, canvas.width / asset.frame_width), fps: 8 }]));
    }
    if (asset.png_base64.length > 2_000_000) throw new Error(`${file.name}: 이미지 용량을 줄여 주세요.`);
    return asset;
  } finally { image.close(); }
}
export function assetCard(asset, pack, esc, compact = false, targetName = '') {
  const used = assetReferences(pack, asset.id), label = ASSET_KINDS[asset.kind];
  const action = asset.kind === 'prop' ? '맵에 추가' : asset.kind === 'background' ? '현재 장면 배경으로' : asset.kind === 'portrait' ? '선택한 인물 초상화로' : asset.kind === 'story_photo' ? '스토리에서 연결하기' : asset.kind === 'character_source' ? '전신 동작 자동 생성' : '선택한 인물 동작으로';
  const index = pack.assets.indexOf(asset);
  return `<article class="asset-card" ${asset.kind === 'prop' ? `draggable="true" data-drag-asset="${esc(asset.id)}"` : ''}>
    <div class="asset-thumb checker"><img src="data:image/png;base64,${asset.png_base64}" alt="${esc(asset.name || label)}"></div>
    ${compact ? `<strong>${esc(asset.name || label)}</strong>` : `<label class="asset-name">이름<input aria-label="에셋 이름 ${esc(asset.id)}" data-path="assets.${index}.name" value="${esc(asset.name || label)}" maxlength="80"></label>`}
    <small>${label} · ${asset.width}×${asset.height}${compact ? '' : ` · ${used}곳에 사용`}</small>
    ${asset.kind === 'prop' && targetName ? `<button class="primary" data-apply-asset="${esc(asset.id)}">선택한 박스에 적용</button>` : ''}<button data-use-asset="${esc(asset.id)}">${action}</button>
    ${compact ? '' : `<button class="small danger" data-delete-asset="${esc(asset.id)}" ${used ? 'disabled' : ''}>${used ? '사용 중' : '에셋 삭제'}</button>`}
  </article>`;
}
