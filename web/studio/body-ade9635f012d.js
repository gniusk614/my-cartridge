import { STATES } from './core-e9d461d88616.js';
import { quantize, removeEdgeBackground } from './pixel-f2ce3547589f.js';

export const BODY_FRAME = 96;
export const DEFAULT_RIG = { colors: 32, remove_background: true, head_cut: 24, hip_cut: 60, torso_width: 58, center_x: 50, facing: 'right' };
export const MOTION_NAMES = ['대기', '걷기', '공격', '점프', '앉기', '피격', '쓰러짐'];
export const BODY_LENGTHS = [4, 8, 6, 4, 2, 2, 4];
export function normalizeRig(raw = {}) {
  const out = { ...DEFAULT_RIG, ...raw }, clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : fallback;
  out.colors = [0, 8, 16, 32, 64].includes(Number(out.colors)) ? Number(out.colors) : 32;
  out.remove_background = out.remove_background === true; out.facing = out.facing === 'left' ? 'left' : 'right';
  out.head_cut = clamp(out.head_cut, 12, 38, 24); out.hip_cut = clamp(out.hip_cut, out.head_cut + 12, 78, 60);
  out.torso_width = clamp(out.torso_width, 30, 80, 58); out.center_x = clamp(out.center_x, 35, 65, 50);
  return out;
}
export function alphaBounds(rgba, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 16) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
export function cleanBodyBackground(rgba, width, height, enabled) {
  if (!enabled) return new Uint8ClampedArray(rgba);
  const corners = [0, width - 1, width * (height - 1), width * height - 1];
  // Transparent PNG margins must never erase dark clothes that share their RGB.
  if (corners.some(i => rgba[i * 4 + 3] <= 16)) return new Uint8ClampedArray(rgba);
  const rgb = corners.map(i => [...rgba.slice(i * 4, i * 4 + 3)]);
  if (rgb.some(c => Math.hypot(...c.map((v, i) => v - rgb[0][i])) > 35)) return new Uint8ClampedArray(rgba);
  return removeEdgeBackground(rgba, width, height, 30);
}
export function prepareBody(image, raw = {}) {
  const settings = normalizeRig(raw), working = document.createElement('canvas');
  const scale = Math.min(1, 256 / Math.max(image.width, image.height));
  working.width = Math.max(1, Math.round(image.width * scale)); working.height = Math.max(1, Math.round(image.height * scale));
  const ctx = working.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, working.width, working.height);
  const data = ctx.getImageData(0, 0, working.width, working.height); data.data.set(cleanBodyBackground(data.data, working.width, working.height, settings.remove_background)); ctx.putImageData(data, 0, 0);
  const bounds = alphaBounds(data.data, working.width, working.height);
  if (!bounds) throw new Error('이미지에 캐릭터가 남아 있지 않습니다. 배경 제거를 끄거나 다른 이미지를 선택해 주세요.');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = BODY_FRAME;
  const output = canvas.getContext('2d', { willReadFrequently: true }); output.imageSmoothingEnabled = false;
  const ratio = Math.min(44 / bounds.width, 84 / bounds.height), w = Math.max(1, Math.round(bounds.width * ratio)), h = Math.max(1, Math.round(bounds.height * ratio));
  output.save(); if (settings.facing === 'left') { output.translate(96, 0); output.scale(-1, 1); }
  output.drawImage(working, bounds.x, bounds.y, bounds.width, bounds.height, Math.round((96 - w) / 2), 94 - h, w, h); output.restore();
  const pixels = output.getImageData(0, 0, 96, 96);
  if (settings.colors) { pixels.data.set(quantize(pixels.data, settings.colors).data); output.putImageData(pixels, 0, 0); }
  return { canvas, bounds: alphaBounds(pixels.data, 96, 96), settings };
}
export function rigParts(bounds, raw = {}) {
  const s = normalizeRig(raw), x = bounds.x, y = bounds.y, w = bounds.width, h = bounds.height;
  const head = Math.round(y + h * s.head_cut / 100), hip = Math.round(y + h * s.hip_cut / 100), center = Math.round(x + w * s.center_x / 100);
  const l = Math.max(x + 1, Math.round(center - w * s.torso_width / 200)), r = Math.min(x + w - 1, Math.round(center + w * s.torso_width / 200));
  const part = (name, left, top, width, height, px, py) => ({ name, rect: [left, top, Math.max(1, width), Math.max(1, height)], pivot: [px, py] });
  return [part('leftLeg', x, hip - 1, center - x + 1, y + h - hip + 1, (x + center) / 2, hip), part('rightLeg', center - 1, hip - 1, x + w - center + 1, y + h - hip + 1, (center + x + w) / 2, hip),
    part('leftArm', x, head - 1, l - x + 1, hip - head + 2, l, head + 2), part('torso', l - 1, head - 1, r - l + 2, hip - head + 2, center, hip),
    part('head', x, y, w, head - y + 1, center, head), part('rightArm', r - 1, head - 1, x + w - r + 1, hip - head + 2, r, head + 2)];
}
export function suggestRig(image) {
  const prepared = prepareBody(image), b = prepared.bounds, ctx = prepared.canvas.getContext('2d'), pixels = ctx.getImageData(0, 0, 96, 96).data;
  const widths = [];
  for (let y = b.y; y < b.y + b.height; y++) { let left = 96, right = -1; for (let x = b.x; x < b.x + b.width; x++) if (pixels[(y * 96 + x) * 4 + 3] > 16) { left = Math.min(left, x); right = Math.max(right, x); } widths.push(Math.max(0, right - left + 1)); }
  const valley = (lo, hi, fallback) => {
    const options = widths.map((width, y) => ({ width, pct: y / b.height * 100 })).filter(o => o.pct >= lo && o.pct <= hi);
    const max = Math.max(...options.map(o => o.width));
    options.sort((a, z) => (a.width + Math.abs(a.pct - fallback) * 0.1) - (z.width + Math.abs(z.pct - fallback) * 0.1));
    return options[0].width < max * 0.85 ? Math.round(options[0].pct) : fallback;
  };
  return normalizeRig({ ...DEFAULT_RIG, head_cut: valley(15, 38, 24), hip_cut: valley(48, 75, 60) });
}
export function bodyPose(state, frame) {
  if (!STATES.includes(state)) throw new Error('알 수 없는 동작');
  const angles = { head: 0, torso: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 }, p = { angles, bob: 0, shift: 0, sx: 1, sy: 1, down: state === 'down' };
  if (state === 'idle') { p.sy = 1 + Math.sin(frame / 4 * Math.PI * 2) * 0.012; angles.leftArm = frame % 2 ? 1 : -1; }
  if (state === 'move') { const wave = Math.sin(frame / 8 * Math.PI * 2); angles.leftArm = wave * 20; angles.rightArm = -wave * 20; angles.leftLeg = -wave * 17; angles.rightLeg = wave * 17; p.bob = -Math.abs(wave) * 1.5; }
  if (state === 'attack') { angles.rightArm = [5, 25, -78, -82, -35, 0][frame % 6]; angles.leftArm = 10; angles.torso = [0, -4, 5, 5, 2, 0][frame % 6]; p.shift = frame === 2 || frame === 3 ? -2 : 0; }
  if (state === 'jump') { angles.leftArm = -25; angles.rightArm = 25; angles.leftLeg = 18 + frame * 2; angles.rightLeg = -20 - frame * 2; }
  if (state === 'crouch') { p.sy = 0.72; p.sx = 1.07; angles.leftArm = 12; angles.rightArm = -12; }
  if (state === 'hurt') { p.shift = frame % 2 ? 2 : -2; angles.torso = -7; angles.head = 5; }
  return p;
}
export function fullBodySheet(image, raw = {}, method = 'cutout_v1') {
  const prepared = prepareBody(image, raw), { canvas: body, bounds, settings } = prepared, parts = rigParts(bounds, settings);
  const canvas = document.createElement('canvas'); canvas.width = 96 * 8; canvas.height = 96 * 7;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; const animations = {};
  STATES.forEach((state, row) => {
    animations[state] = { row, frames: BODY_LENGTHS[row], fps: state === 'move' ? 12 : 8 };
    for (let f = 0; f < 8; f++) {
      const pose = bodyPose(state, f % BODY_LENGTHS[row]);
      ctx.save(); ctx.translate(f * 96, row * 96); ctx.beginPath(); ctx.rect(0, 0, 96, 96); ctx.clip();
      if (pose.down) {
        ctx.translate(48, 80); ctx.rotate(Math.PI / 2); ctx.scale(0.65, 0.65); ctx.translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2)); ctx.drawImage(body, 0, 0);
      } else {
        if (method === 'whole_v1') {
          // Animals and mascots stay in one piece. This is a simple fallback,
          // while AI/external sheets supply actual anatomy-aware poses.
          const wave = Math.sin(f / BODY_LENGTHS[row] * Math.PI * 2);
          ctx.translate(48, 94); ctx.rotate((state === 'move' ? wave * 3 : state === 'attack' ? [0, -6, 10, 8, 2, 0][f % 6] : state === 'hurt' ? -7 : 0) * Math.PI / 180);
          if (state === 'crouch') ctx.scale(1.04, 0.8);
          if (state === 'jump') ctx.rotate((-4 + f * 3) * Math.PI / 180);
          if (state === 'idle') ctx.scale(1, 1 + wave * 0.01);
          ctx.translate(-48 + (state === 'hurt' ? pose.shift : 0), -94 + (state === 'move' ? -Math.abs(wave) * 2 : 0));
          ctx.drawImage(body, 0, 0); ctx.restore(); continue;
        }
        ctx.translate(48 + pose.shift, 94 + pose.bob); ctx.scale(pose.sx, pose.sy); ctx.translate(-48, -94);
        for (const part of parts) {
          const [x, y, w, h] = part.rect, [px, py] = part.pivot;
          ctx.save(); ctx.translate(px, py); ctx.rotate(pose.angles[part.name] * Math.PI / 180); ctx.translate(-px, -py); ctx.drawImage(body, x, y, w, h, x, y, w, h); ctx.restore();
        }
      }
      ctx.restore();
    }
  });
  return { canvas, animations, frame_width: 96, frame_height: 96, prepared };
}
export function drawRigGuide(target, prepared) {
  const ctx = target.getContext('2d'); target.width = target.height = 192; ctx.clearRect(0, 0, 192, 192); ctx.imageSmoothingEnabled = false; ctx.drawImage(prepared.canvas, 0, 0, 192, 192);
  const parts = rigParts(prepared.bounds, prepared.settings), head = parts.find(p => p.name === 'head'), torso = parts.find(p => p.name === 'torso');
  ctx.strokeStyle = '#8bd1bf'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  for (const y of [head.pivot[1], torso.pivot[1]]) { ctx.beginPath(); ctx.moveTo(0, y * 2); ctx.lineTo(192, y * 2); ctx.stroke(); }
  for (const part of parts.filter(p => p.name.endsWith('Arm'))) { ctx.beginPath(); ctx.moveTo(part.pivot[0] * 2, head.pivot[1] * 2); ctx.lineTo(part.pivot[0] * 2, torso.pivot[1] * 2); ctx.stroke(); }
}
export function sampleBody() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 96; const c = canvas.getContext('2d');
  const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  rect(20, 11, 24, 24, '#dca982'); rect(17, 6, 30, 12, '#284f66'); rect(14, 15, 37, 4, '#3d7891'); rect(38, 23, 3, 3, '#203249');
  rect(19, 36, 26, 27, '#d2e4cf'); rect(27, 36, 10, 27, '#517f80'); rect(19, 58, 26, 5, '#855c47'); rect(30, 59, 6, 3, '#e3bb65');
  rect(11, 37, 8, 24, '#568a8b'); rect(45, 37, 8, 24, '#568a8b'); rect(11, 57, 8, 7, '#eedbc4'); rect(45, 57, 8, 7, '#eedbc4');
  rect(20, 64, 10, 17, '#334861'); rect(35, 64, 10, 17, '#334861'); rect(19, 79, 12, 11, '#a9584f'); rect(35, 79, 13, 11, '#a9584f');
  return canvas;
}
