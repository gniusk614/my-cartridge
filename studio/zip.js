const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, i) => { let n = i; for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes) { let n = 0xffffffff; for (const byte of bytes) n = table[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
export function zipFiles(files) {
  const chunks = [], directory = []; let offset = 0, centralSize = 0;
  for (const file of files) {
    if (!/^[a-zA-Z0-9_.\/-]+$/.test(file.name) || file.name.includes('..') || file.name.startsWith('/')) throw new Error('잘못된 내보내기 파일명');
    const name = encoder.encode(file.name), data = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(file.data), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
    chunks.push(local, data); directory.push(central); centralSize += central.length; offset += local.length + data.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
