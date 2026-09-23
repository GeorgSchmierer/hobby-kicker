/**
 * Erzeugt das App-Symbol (weißer Fußball auf grünem Grund) in allen benötigten Größen.
 * Aufruf: node scripts/make-icons.mjs
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const GREEN_LIGHT = '#27A74D';
const GREEN_DARK = '#17722F';
const INK = '#1C1F22';

const polar = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Klassischer Fußball in Draufsicht: Fünfeck in der Mitte, fünf angeschnittene am Rand */
function ball(cx, cy, R) {
  const inner = 0.3 * R;
  const outerDist = 0.9 * R;
  const outerSize = 0.3 * R;
  const parts = [];

  // Mittleres Fünfeck (Spitze nach oben)
  const center = [0, 72, 144, 216, 288].map((a) => polar(cx, cy, inner, a));
  parts.push(`<polygon points="${pts(center)}" fill="${INK}"/>`);

  const outers = [0, 72, 144, 216, 288].map((a) => {
    const [ox, oy] = polar(cx, cy, outerDist, a);
    // Fünfeck, das mit einer Spitze zur Mitte zeigt
    const corners = [0, 72, 144, 216, 288].map((b) => polar(ox, oy, outerSize, a + 180 + b));
    return { angle: a, corners };
  });

  for (const [i, o] of outers.entries()) {
    parts.push(`<polygon points="${pts(o.corners)}" fill="${INK}"/>`);
    // Naht von der Mitte zum Rand-Fünfeck
    const [x1, y1] = center[i];
    const [x2, y2] = o.corners[0];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    // Naht zwischen benachbarten Rand-Fünfecken (Sechseck-Kanten)
    const next = outers[(i + 1) % outers.length];
    const [x3, y3] = o.corners[4];
    const [x4, y4] = next.corners[1];
    parts.push(`<line x1="${x3}" y1="${y3}" x2="${x4}" y2="${y4}"/>`);
  }

  return `
    <defs>
      <clipPath id="ball"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
      <radialGradient id="shade" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="70%" stop-color="#F1F3F5"/>
        <stop offset="100%" stop-color="#C9CED3"/>
      </radialGradient>
    </defs>
    <ellipse cx="${cx}" cy="${cy + R * 1.04}" rx="${R * 0.8}" ry="${R * 0.12}" fill="#000" opacity="0.18"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#shade)"/>
    <g clip-path="url(#ball)" stroke="${INK}" stroke-width="${R * 0.035}" stroke-linecap="round">
      ${parts.join('\n      ')}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-width="${R * 0.04}"/>`;
}

/** @param rounded abgerundete Ecken (normales Symbol) oder randlos (für Android „maskable“) */
function iconSvg({ rounded, ballScale }) {
  const size = 1024;
  const R = (size * ballScale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${GREEN_LIGHT}"/>
        <stop offset="100%" stop-color="${GREEN_DARK}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${rounded ? 224 : 0}" fill="url(#bg)"/>
    ${ball(size / 2, size / 2 - R * 0.04, R)}
  </svg>`;
}

async function render(svg, file, px) {
  const target = join(ROOT, file);
  mkdirSync(join(target, '..'), { recursive: true });
  await sharp(Buffer.from(svg)).resize(px, px).png().toFile(target);
  console.log('✓', file);
}

const normal = iconSvg({ rounded: true, ballScale: 0.62 });
const fullBleed = iconSvg({ rounded: false, ballScale: 0.62 });
// Android schneidet „maskable“ Symbole rund/eckig zu – Ball kleiner, damit nichts abgeschnitten wird
const maskable = iconSvg({ rounded: false, ballScale: 0.5 });

await render(fullBleed, 'assets/images/icon.png', 1024);
await render(normal, 'public/icon-192.png', 192);
await render(normal, 'public/icon-512.png', 512);
await render(maskable, 'public/icon-maskable-512.png', 512);
// iPhone rundet selbst ab und mag keine Transparenz
await render(fullBleed, 'public/apple-touch-icon.png', 180);
await render(normal, 'assets/images/favicon.png', 48);
