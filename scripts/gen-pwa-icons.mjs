import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')
mkdirSync(publicDir, { recursive: true })

const brand = '#6366f1'
const fg = '#ffffff'

function roundedIcon(size, radiusRatio = 0.18, symbolRatio = 0.62) {
  const r = Math.round(size * radiusRatio)
  const fontSize = Math.round(size * symbolRatio)
  const cy = Math.round(size * 0.54)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${brand}"/>
  <text x="${size / 2}" y="${cy}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">₪</text>
</svg>`
}

function flatIcon(size, symbolRatio = 0.6) {
  const fontSize = Math.round(size * symbolRatio)
  const cy = Math.round(size * 0.54)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${brand}"/>
  <text x="${size / 2}" y="${cy}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">₪</text>
</svg>`
}

function maskableIcon(size) {
  const fontSize = Math.round(size * 0.42)
  const cy = Math.round(size * 0.54)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${brand}"/>
  <text x="${size / 2}" y="${cy}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">₪</text>
</svg>`
}

async function svgToPng(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(outPath)
  console.log('wrote', outPath)
}

await svgToPng(roundedIcon(192), resolve(publicDir, 'pwa-192x192.png'), 192)
await svgToPng(roundedIcon(512), resolve(publicDir, 'pwa-512x512.png'), 512)
await svgToPng(maskableIcon(512), resolve(publicDir, 'pwa-maskable-512x512.png'), 512)
await svgToPng(flatIcon(180), resolve(publicDir, 'apple-touch-icon.png'), 180)

writeFileSync(resolve(publicDir, 'icon-source.svg'), roundedIcon(512))
console.log('done')
