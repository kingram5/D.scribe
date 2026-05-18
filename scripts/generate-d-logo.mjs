import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Download Playfair Display MediumItalic static TTF
const fontPath = 'C:/Windows/Temp/PlayfairItalic.ttf';
console.log('Using font at', fontPath);

// Build waveform bars — clear variation so stripes are visible through the D.
const numBars = 120, vw = 900, vh = 700;
const barWidth = vw / numBars, gap = 2;
let bars = '';
for (let i = 0; i < numBars; i++) {
  const nx = i / numBars;
  const slowWave = Math.sin(nx * Math.PI * 2.5);
  const fastWave  = Math.sin(nx * Math.PI * 10) * 0.5;
  const combined  = (slowWave + fastWave) / 1.5;
  // Range 0.55–0.95 — solid fill with visible waveform ripple
  const scaleY = 0.55 + (combined * 0.5 + 0.5) * 0.40;
  const barH = vh * Math.max(0.55, Math.min(scaleY, 0.95));
  const x = i * barWidth;
  const y = (vh - barH) / 2;
  bars += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(barWidth - gap).toFixed(2)}" height="${barH.toFixed(2)}" fill="#F0A878"/>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">
  <defs>
    <!-- Multi-layer glow: blur source, merge under original -->
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5"  result="b5"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="b18"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="45" result="b45"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="90" result="b90"/>
      <feMerge>
        <feMergeNode in="b90"/>
        <feMergeNode in="b45"/>
        <feMergeNode in="b18"/>
        <feMergeNode in="b5"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <clipPath id="dMask">
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="'Playfair Display', serif"
        font-style="italic" font-weight="500"
        font-size="520px" letter-spacing="-0.02em">D.</text>
    </clipPath>
  </defs>

  <!-- Dark background -->
  <rect width="${vw}" height="${vh}" fill="#1A140E"/>

  <!-- Bars clipped to D. shape, then glowed -->
  <g filter="url(#glow)">
    <g clip-path="url(#dMask)">
      ${bars}
    </g>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    loadSystemFonts: true,
    fontFiles: [fontPath],
  },
});
const png = resvg.render().asPng();
writeFileSync('C:/manuscript/public/dscribe-d-logo.png', png);
console.log('Saved dscribe-d-logo.png');
