// 카드 HTML(section#s1, #s2 …)을 1080×1350 PNG로 찍는다.
//   node render.mjs <cards.html> <out-dir> <장 수>
// → <out-dir>/1.png, 2.png …
//
// playwright-core가 필요하다. 이 폴더에서 `npm i --no-save playwright-core`.
// 브라우저는 내려받지 않는다 — 이 환경에 깔려 있는 Chromium을 찾아 쓴다.
import { chromium } from 'playwright-core';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , html, outDir, countArg] = process.argv;
if (!html || !outDir) {
  console.error('사용법: node render.mjs <cards.html> <out-dir> <장 수>');
  process.exit(1);
}
const count = Number(countArg) || 1;

function findChrome() {
  const root = '/opt/pw-browsers';
  for (const d of existsSync(root) ? readdirSync(root) : []) {
    const p = `${root}/${d}/chrome-linux/chrome`;
    if (d.startsWith('chromium') && existsSync(p)) return p;
  }
  return '/opt/pw-browsers/chromium';
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
for (let i = 1; i <= count; i++) {
  await page.goto(`file://${resolve(html)}?n=${i}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${i}.png` });
  console.log(`${outDir}/${i}.png`);
}
await browser.close();
