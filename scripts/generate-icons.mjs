import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicDir = join(root, 'public');

const rounded = await readFile(join(publicDir, 'favicon.svg'));
const maskable = await readFile(join(here, 'icon-maskable.svg'));

const targets = [
  { source: rounded, size: 192, name: 'icon-192.png' },
  { source: rounded, size: 512, name: 'icon-512.png' },
  { source: rounded, size: 180, name: 'apple-touch-icon.png' },
  { source: maskable, size: 512, name: 'icon-512-maskable.png' },
];

for (const { source, size, name } of targets) {
  await sharp(source, { density: 600 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}
