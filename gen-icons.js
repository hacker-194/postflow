const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('public/icons/icon.svg');

async function gen() {
  await sharp(svg).resize(16, 16).png().toFile('public/icons/icon16.png');
  await sharp(svg).resize(32, 32).png().toFile('public/icons/icon32.png');
  await sharp(svg).resize(48, 48).png().toFile('public/icons/icon48.png');
  await sharp(svg).resize(128, 128).png().toFile('public/icons/icon128.png');
  console.log('PNG icons generated via sharp');
}
gen().catch(e => console.error(e));
