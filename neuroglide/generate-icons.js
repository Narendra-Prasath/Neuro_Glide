#!/usr/bin/env node
/**
 * NeuroGlide Icon Generator
 * Creates PNG icons at 16x16, 48x48, and 128x128 using pure SVG → data URI approach.
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

function createSVG(size) {
  const r = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.48);
  const strokeWidth = Math.max(1, Math.round(size * 0.02));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0D9488"/>
      <stop offset="100%" style="stop-color:#06B6D4"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        fill="white" font-family="system-ui, -apple-system, sans-serif"
        font-weight="700" font-size="${fontSize}" letter-spacing="-1">N</text>
</svg>`;
}

for (const size of [16, 48, 128]) {
  const svg = createSVG(size);
  const filePath = path.join(ICON_DIR, `icon-${size}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`✓ Created ${filePath} (${size}×${size})`);
}

console.log('\nIcons generated as SVG files.');
console.log('Note: For Chrome Web Store, convert to PNG. For development, SVG works fine.');
