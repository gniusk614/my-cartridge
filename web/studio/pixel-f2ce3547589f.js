import { STATES } from './core-e9d461d88616.js';

// Median-cut palette quantization. It changes raster style, not anatomy or poses.
export function quantize(rgba, colors = 16) {
  const histogram = new Map();
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 16) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    histogram.set(key, (histogram.get(key) || 0) + 1);
  }
  let boxes = [[...histogram].map(([key, count]) => ({ rgb: [key >> 16, (key >> 8) & 255, key & 255], count }))];
  const range = box => [0, 1, 2].map(c => box.length ? Math.max(...box.map(p => p.rgb[c])) - Math.min(...box.map(p => p.rgb[c])) : 0);
  while (boxes.length < colors) {
    const candidates = boxes.map((box, i) => ({ box, i, ranges: range(box) })).filter(b => b.box.length > 1).sort((a, b) => Math.max(...b.ranges) - Math.max(...a.ranges));
    if (!candidates.length) break;
    const { box, i, ranges } = candidates[0];
    const axis = ranges.indexOf(Math.max(...ranges));
    box.sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const total = box.reduce((sum, p) => sum + p.count, 0);
    let sum = 0, cut = 0;
    while (cut < box.length - 1 && sum < total / 2) sum += box[cut++].count;
    cut = Math.max(1, cut);
    boxes.splice(i, 1, box.slice(0, cut), box.slice(cut));
  }
  const palette = boxes.filter(b => b.length).map(box => {
    const total = box.reduce((s, p) => s + p.count, 0);
    return [0, 1, 2].map(c => Math.round(box.reduce((s, p) => s + p.rgb[c] * p.count, 0) / total));
  });
  const result = new Uint8ClampedArray(rgba);
  const cache = new Map();
  for (let i = 0; i < result.length; i += 4) {
    if (result[i + 3] <= 16) { result[i + 3] = 0; continue; }
    const key = (result[i] << 16) | (result[i + 1] << 8) | result[i + 2];
    let nearest = cache.get(key);
    if (!nearest) {
      let distance = Infinity;
      for (const p of palette) {
        const d = (result[i] - p[0]) ** 2 + (result[i + 1] - p[1]) ** 2 + (result[i + 2] - p[2]) ** 2;
        if (d < distance) { distance = d; nearest = p; }
      }
      cache.set(key, nearest);
    }
    result.set(nearest, i);
  }
  return { data: result, palette };
}
export function removeEdgeBackground(rgba, width, height, tolerance = 30) {
  const result = new Uint8ClampedArray(rgba), seen = new Uint8Array(width * height), queue = [];
  const seeds = [0, width - 1, width * (height - 1), width * height - 1];
  const colors = seeds.map(n => [...rgba.slice(n * 4, n * 4 + 3)]);
  for (const n of seeds) { queue.push(n); seen[n] = 1; }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const n = queue[cursor], i = n * 4;
    if (rgba[i + 3] > 16 && !colors.some(c => Math.hypot(rgba[i] - c[0], rgba[i + 1] - c[1], rgba[i + 2] - c[2]) <= tolerance)) continue;
    result[i + 3] = 0;
    const x = n % width, y = Math.floor(n / width);
    for (const next of [x > 0 ? n - 1 : -1, x < width - 1 ? n + 1 : -1, y > 0 ? n - width : -1, y < height - 1 ? n + width : -1]) {
      if (next >= 0 && !seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  return result;
}
export function convertPortrait(image, size, colors, transparent, cropX = 0.5, cropY = 0.5) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const side = Math.min(image.width, image.height);
  ctx.drawImage(image, (image.width - side) * cropX, (image.height - side) * cropY, side, side, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const base = transparent ? removeEdgeBackground(data.data, size, size) : data.data;
  const result = quantize(base, colors);
  data.data.set(result.data); ctx.putImageData(data, 0, 0);
  return canvas;
}
export function avatarSheet(appearance, portrait = null) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 336;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const p = { skin: '#f4cdb3', hair: '#272945', coat: '#6bb8c4', pants: '#252941', scarf: '#f6c77e', ...appearance };
  const animations = {};
  const lengths = [4, 8, 6, 4, 2, 2, 4];
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  STATES.forEach((state, row) => {
    animations[state] = { row, frames: lengths[row], fps: state === 'move' ? 12 : 8 };
    for (let f = 0; f < 8; f++) {
      ctx.save(); ctx.translate(f * 32, row * 48); ctx.beginPath(); ctx.rect(0, 0, 32, 48); ctx.clip();
      if (state === 'down') { rect(3, 38, 11, 8, p.hair); rect(4, 40, 9, 6, p.skin); rect(14, 39, 14, 7, p.coat); rect(26, 40, 5, 6, p.pants); ctx.restore(); continue; }
      const crouch = state === 'crouch' ? 8 : 0;
      const bob = state === 'move' ? (f % 2) : (state === 'idle' && f % 4 === 2 ? 1 : 0);
      const stride = state === 'move' ? Math.round(Math.sin(f / 8 * Math.PI * 2) * 3) : (state === 'jump' ? 2 : 0);
      rect(9 - stride, 37, 6, 9, p.pants); rect(18 + stride, 37, 6, 9, p.pants);
      rect(8 - stride, 44, 8, 3, p.hair); rect(18 + stride, 44, 8, 3, p.hair);
      rect(9, 23 + crouch + bob, 15, 16 - crouch, state === 'hurt' ? '#fff1cd' : p.coat);
      rect(8, 9 + crouch + bob, 17, 15, p.skin);
      rect(7, 6 + crouch + bob, 19, 7, p.hair); rect(7, 12 + crouch + bob, 4, p.hair_style === 'long' ? 16 : 8, p.hair);
      if (portrait) ctx.drawImage(portrait, 8, 8 + crouch + bob, 17, 17);
      else rect(21, 16 + crouch + bob, 2, 2, '#202334');
      rect(8, 23 + crouch + bob, 18, 4, p.scarf);
      const extension = state === 'attack' ? Math.round(Math.sin(Math.min(f, 5) / 5 * Math.PI) * 8) : 0;
      rect(22, 28 + crouch + bob, 4 + extension, 5, p.skin);
      rect(7, 28 + crouch + bob, 4, 7, p.coat);
      ctx.restore();
    }
  });
  return { canvas, animations, frame_width: 32, frame_height: 48 };
}
export function canvasAsset(canvas, id, kind, extra = {}) {
  return { id, kind, width: canvas.width, height: canvas.height, png_base64: canvas.toDataURL('image/png').split(',')[1], ...extra };
}
