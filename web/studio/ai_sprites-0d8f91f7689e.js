import { STATES } from './core-e9d461d88616.js';
import { MOTION_NAMES, alphaBounds, cleanBodyBackground } from './body-ade9635f012d.js';

export function spritePrompt(description = '') {
  return `Create a production sprite sheet using the attached character as the identity reference.
Character notes: ${description.trim().slice(0, 1200) || 'Infer the species, silhouette, proportions and costume from the reference.'}
Preserve the exact species, full-body silhouette, colors, markings, face and costume in every frame. Adapt movement to this character's actual anatomy. A penguin must keep its round continuous body, flippers, short feet and waddling motion; never turn it into a human or cut its body into separated pieces.
Draw new, coherent poses, rather than rotating rectangular pieces of the reference.
Layout: exactly 4 equal columns and 7 equal rows, 28 cells, no margins or gaps between cells. Use a transparent PNG canvas, ideally 1024 x 1792 pixels (square cells). No grid lines, labels, text, shadows on a floor, or extra objects.
Every cell contains exactly one complete character, with the same scale, camera and ground baseline. Keep at least 12% clear space inside every cell. Face right or right three-quarter view consistently. Keep all limbs, ears, tail and accessories inside the cell.
Rows from top to bottom, 4 sequential animation frames in each row:
1. idle: subtle breathing and blinking, seamless loop.
2. move: species-appropriate walk or waddle cycle, seamless loop.
3. attack: anticipation, strike appropriate to its anatomy, follow-through, recovery.
4. jump: anticipation, lift, airborne pose, landing; game physics supplies vertical travel.
5. crouch: species-appropriate low posture, no disconnected body parts.
6. hurt: readable flinch and recovery, identity unchanged.
7. down: a gentle knocked-down pose, no gore, whole character visible.
Style: crisp pixel art suitable for a small 2D action game, consistent pixel size, limited palette, clean outlines. Return only the sprite sheet image.`;
}

export function gridSpec(width, height, columns = 4) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 8 || width < columns * 8 || height < 56) throw new Error('1~8열·7행의 동작 시트를 선택해 주세요.');
  return { columns, rows: 7, width: columns * 96, height: 672 };
}

// Repack complete frames; never apply the human cutout rig to an AI sheet.
export function normalizeSpriteGrid(image, columns = 4, removeBackground = false) {
  const spec = gridSpec(image.width, image.height, columns), output = document.createElement('canvas');
  output.width = spec.width; output.height = spec.height;
  const ctx = output.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const frames = [], sizes = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < columns; col++) {
    const x = Math.round(col * image.width / columns), y = Math.round(row * image.height / 7);
    const w = Math.round((col + 1) * image.width / columns) - x, h = Math.round((row + 1) * image.height / 7) - y;
    const frame = document.createElement('canvas'); frame.width = w; frame.height = h;
    const c = frame.getContext('2d', { willReadFrequently: true }); c.drawImage(image, x, y, w, h, 0, 0, w, h);
    const pixels = c.getImageData(0, 0, w, h); pixels.data.set(cleanBodyBackground(pixels.data, w, h, removeBackground)); c.putImageData(pixels, 0, 0);
    const bounds = alphaBounds(pixels.data, w, h);
    if (!bounds) throw new Error(`${MOTION_NAMES[row]} ${col + 1}번째 칸이 비어 있습니다. 격자를 확인해 주세요.`);
    frames.push({ frame, bounds, col, row }); sizes.push(Math.min(80 / bounds.width, 84 / bounds.height));
  }
  const ratio = Math.min(...sizes);
  for (const { frame, bounds: b, col, row } of frames) {
    const w = Math.max(1, Math.round(b.width * ratio)), h = Math.max(1, Math.round(b.height * ratio));
    ctx.drawImage(frame, b.x, b.y, b.width, b.height, col * 96 + Math.round((96 - w) / 2), row * 96 + 94 - h, w, h);
  }
  return { canvas: output, animations: Object.fromEntries(STATES.map((k, row) => [k, { row, frames: columns, fps: k === 'move' ? 10 : 8 }])) };
}
