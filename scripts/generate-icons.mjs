import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicDir = join(root, 'public');

const rounded = await readFile(join(publicDir, 'favicon.svg'));
const maskable = await readFile(join(here, 'icon-maskable.svg'));
const apple = await readFile(join(here, 'icon-apple.svg'));

const targets = [
  { source: rounded, size: 192, name: 'icon-192.png' },
  { source: rounded, size: 512, name: 'icon-512.png' },
  { source: maskable, size: 512, name: 'icon-512-maskable.png' },
  // iOS ignores alpha and rounds the icon itself, so this one is square.
  { source: apple, size: 180, name: 'apple-touch-icon.png', opaque: true },
  { source: apple, size: 152, name: 'apple-touch-icon-152.png', opaque: true },
  { source: apple, size: 167, name: 'apple-touch-icon-167.png', opaque: true },
];

for (const { source, size, name, opaque } of targets) {
  const pipeline = sharp(source, { density: 600 }).resize(size, size);
  if (opaque) pipeline.flatten({ background: '#7a5fef' });
  await pipeline.png({ compressionLevel: 9 }).toFile(join(publicDir, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}
