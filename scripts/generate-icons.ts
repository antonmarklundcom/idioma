/**
 * PLAN.md §7.1 / §8 Phase 6 — generate the PWA icon set.
 *
 *   npm run icons
 *
 * Source of truth is `public/icon-source.png` (a square image the owner provides,
 * §9 Q6). If that file is missing, this script falls back to a built-in geometric
 * PLACEHOLDER mark so the manifest is still valid and the app is still installable —
 * drop the real artwork in and re-run to replace every output.
 *
 * Outputs (all into `public/icons/`):
 *   icon-192.png            192x192  purpose "any"
 *   icon-512.png            512x512  purpose "any"
 *   icon-maskable-192.png   192x192  purpose "maskable" (mark inside the 80% safe zone)
 *   icon-maskable-512.png   512x512  purpose "maskable"
 *   apple-touch-icon.png    180x180  iOS home screen (no transparency, no mask)
 *
 * Maskable icons are padded deliberately: Android crops them to a platform-chosen
 * shape (circle, squircle, teardrop), and anything outside the central 80% circle
 * can be cut off. See https://w3c.github.io/manifest/#purpose-member
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SOURCE_FILE = path.join(PUBLIC_DIR, 'icon-source.png');
const OUT_DIR = path.join(PUBLIC_DIR, 'icons');

/** Brand colours — kept in sync with manifest.webmanifest and the landing page. */
const BRAND_BG = '#0f172a'; // slate-900
const BRAND_FG = '#ffffff';
const BRAND_ACCENT = '#38bdf8'; // sky-400

/**
 * The placeholder mark: a speech bubble (the app is about speaking) with three
 * "still talking" dots, on the brand slate background. Pure geometry — no text,
 * no emoji — so it renders identically everywhere without depending on the fonts
 * installed on the build machine.
 */
function placeholderSvg(size: number): string {
  // Drawn on a 1024 grid and scaled, so the proportions are resolution-independent.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BRAND_BG}"/>
  <path
    d="M 232 236 h 560 a 96 96 0 0 1 96 96 v 320 a 96 96 0 0 1 -96 96 H 520 L 336 892 V 748 h -104 a 96 96 0 0 1 -96 -96 V 332 a 96 96 0 0 1 96 -96 z"
    fill="${BRAND_FG}"/>
  <circle cx="392" cy="492" r="46" fill="${BRAND_BG}"/>
  <circle cx="512" cy="492" r="46" fill="${BRAND_ACCENT}"/>
  <circle cx="632" cy="492" r="46" fill="${BRAND_BG}"/>
</svg>`;
}

/**
 * Produce a `size`x`size` PNG buffer.
 *
 * `inset` is the fraction of the canvas left as padding around the mark; maskable
 * icons use 0.1 on each side (mark occupies the central 80%), "any" icons use 0.
 * The padding is filled with the brand background, never transparency — iOS in
 * particular composites transparent icons onto black.
 */
async function render(source: Buffer | string, size: number, inset: number): Promise<Buffer> {
  const markSize = Math.round(size * (1 - inset * 2));
  const mark = await sharp(source, { density: 512 })
    .resize(markSize, markSize, { fit: 'cover' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const usingRealSource = existsSync(SOURCE_FILE);
  const source: Buffer | string = usingRealSource
    ? await readFile(SOURCE_FILE)
    : Buffer.from(placeholderSvg(1024));

  if (usingRealSource) {
    const meta = await sharp(source).metadata();
    if (meta.width !== meta.height) {
      console.warn(
        `[icons] WARNING: ${path.relative(process.cwd(), SOURCE_FILE)} is ${meta.width}x${meta.height}, ` +
          'not square. It will be centre-cropped.',
      );
    }
    if ((meta.width ?? 0) < 512) {
      console.warn(
        `[icons] WARNING: source is only ${meta.width}px wide; 1024px or larger is recommended.`,
      );
    }
  } else {
    console.warn(
      `[icons] ${path.relative(process.cwd(), SOURCE_FILE)} not found — generating PLACEHOLDER icons.\n` +
        '[icons] These are NOT final artwork. Add the real square source image and re-run `npm run icons`.',
    );
  }

  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: 'icon-192.png', size: 192, inset: 0 },
    { file: 'icon-512.png', size: 512, inset: 0 },
    { file: 'icon-maskable-192.png', size: 192, inset: 0.1 },
    { file: 'icon-maskable-512.png', size: 512, inset: 0.1 },
    // iOS applies its own rounded-rect mask and does not honour `purpose`, so the
    // apple-touch icon is full-bleed like the "any" variants.
    { file: 'apple-touch-icon.png', size: 180, inset: 0 },
  ] as const;

  for (const { file, size, inset } of targets) {
    const png = await render(source, size, inset);
    await writeFile(path.join(OUT_DIR, file), png);
    const digest = createHash('sha256').update(png).digest('hex').slice(0, 8);
    console.log(`[icons] ${file.padEnd(24)} ${String(png.length).padStart(7)} bytes  sha256:${digest}`);
  }

  console.log(
    `[icons] done — ${targets.length} icons written to public/icons/ ` +
      `(${usingRealSource ? 'from icon-source.png' : 'PLACEHOLDER artwork'}).`,
  );
}

main().catch((error: unknown) => {
  console.error('[icons] failed:', error);
  process.exit(1);
});
