// Original, code-drawn starter props. PNGs are embedded in the customer's pack.
import { canvasAsset } from './pixel.js';
export const PROP_PRESETS = [['tree', '나무'], ['bench', '벤치'], ['flowers', '화분'], ['lamp', '가로등'], ['sign', '표지판']];
const cache = new Map();
export function presetAsset(key) {
  if (cache.has(key)) return structuredClone(cache.get(key));
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 64;
  const c = canvas.getContext('2d'), rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  if (key === 'tree') {
    rect(21, 31, 7, 32, '#79513f'); rect(17, 59, 15, 4, '#634334');
    rect(11, 4, 25, 32, '#477d64'); rect(4, 13, 40, 24, '#477d64'); rect(9, 8, 29, 21, '#65a178'); rect(13, 5, 16, 13, '#82b583');
  } else if (key === 'bench') {
    rect(5, 27, 4, 34, '#3f4d53'); rect(39, 27, 4, 34, '#3f4d53');
    for (const y of [28, 36, 46]) rect(3, y, 43, 6, '#c49769'); rect(3, 52, 43, 4, '#876046');
  } else if (key === 'flowers') {
    rect(11, 43, 26, 5, '#d9a082'); rect(14, 48, 20, 15, '#ad715e'); rect(15, 48, 4, 12, '#c6886c');
    for (const x of [14, 24, 33]) { rect(x, 26, 2, 17, '#659464'); rect(x - 4, 34, 5, 3, '#82ab77'); rect(x - 4, 21, 10, 9, x === 24 ? '#e6b677' : '#d98b9c'); rect(x - 1, 24, 4, 4, '#ffdf9c'); }
  } else if (key === 'lamp') {
    rect(22, 16, 4, 46, '#454d60'); rect(15, 59, 18, 5, '#3b4356'); rect(13, 5, 22, 17, '#454d60'); rect(17, 8, 14, 11, '#f2d49a'); rect(20, 8, 3, 11, '#ffedbb'); rect(11, 3, 26, 4, '#556078');
  } else if (key === 'sign') {
    rect(22, 28, 5, 35, '#89654a'); rect(4, 15, 38, 20, '#bc956b'); rect(7, 18, 32, 13, '#e0bd86'); rect(13, 23, 18, 3, '#705540'); rect(27, 20, 4, 9, '#705540');
  } else throw new Error('알 수 없는 기본 소품');
  const asset = canvasAsset(canvas, `starter_${key}`, 'prop', { name: PROP_PRESETS.find(p => p[0] === key)[1] });
  cache.set(key, asset); return structuredClone(asset);
}
