import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const sizes = [16, 32, 48, 128];
const iconsDir = resolve('public/icons');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Draw gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#1877f2');
  gradient.addColorStop(1, '#0d65d9');
  ctx.fillStyle = gradient;
  
  // Rounded rect
  const radius = size * 0.1875; // 24/128 ratio
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();
  
  // Draw upload icon (white)
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(1, size * 0.023);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const scale = size / 128;
  
  // Box
  ctx.beginPath();
  ctx.roundRect(25 * scale, 10 * scale, 48 * scale, 24 * scale, 3 * scale);
  ctx.fill();
  
  // Arrow up
  ctx.beginPath();
  ctx.moveTo(49 * scale, 22 * scale);
  ctx.lineTo(64 * scale, 7 * scale);
  ctx.lineTo(79 * scale, 22 * scale);
  ctx.stroke();
  
  // Horizontal lines
  ctx.beginPath();
  ctx.moveTo(30 * scale, 45 * scale);
  ctx.lineTo(98 * scale, 45 * scale);
  ctx.moveTo(30 * scale, 60 * scale);
  ctx.lineTo(86 * scale, 60 * scale);
  ctx.moveTo(30 * scale, 75 * scale);
  ctx.lineTo(74 * scale, 75 * scale);
  ctx.stroke();
  
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(resolve(iconsDir, `icon${size}.png`), buffer);
  console.log(`Generated icon${size}.png`);
}

console.log('All icons generated!');
