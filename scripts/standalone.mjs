import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
for (const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const code = await readFile(resolve(dist, match[1].replace(/^\//, '')), 'utf8');
  html = html.replace(match[0], () => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const match of [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(resolve(dist, match[1].replace(/^\//, '')), 'utf8');
  html = html.replace(match[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}
if (/<(?:script|link)\b[^>]*(?:src|href)="(?:\/assets\/|https?:)/.test(html)) {
  throw new Error('Standalone file still references external assets');
}
const notices = await readFile(resolve(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
html = html.replace('</head>', () => `<!-- Embedded font license and copyright:\n${notices.replaceAll('--', '—')}\n--></head>`);
await writeFile(resolve(root, 'Roulette.html'), html);
console.log(`Standalone: Roulette.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);
