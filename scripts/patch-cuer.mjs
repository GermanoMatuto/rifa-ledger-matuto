// cuer 0.0.3 requests a borderless matrix. qr now requires a positive quiet
// zone. Remove that padding from the raw matrix; cuer draws its own quiet zone.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const file = new URL('./QrCode.js', 'file:///' + require.resolve('cuer').replaceAll('\\', '/'));
const original = readFileSync(file, 'utf8');
const marker = '// matuto: qr positive-border compatibility';
if (!original.includes(marker)) {
  if (!original.includes('border: 0,') || !original.includes('const finderLength = 7;')) throw new Error('cuer changed: review QR compatibility patch.');
  const patched = original.replace('const grid = encodeQR', 'let grid = encodeQR').replace('border: 0,', 'border: 1,').replace('    const finderLength = 7;', `    ${marker}\n    grid = grid.slice(1, -1).map(row => row.slice(1, -1));\n    const finderLength = 7;`);
  writeFileSync(file, patched);
}
