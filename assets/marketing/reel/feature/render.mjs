// reel.html을 한 장씩 그려 frames/<테마>-<길이>/ 에 JPG로 떨군다.
// node render.mjs a 30
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [theme = 'a', V = '30'] = process.argv.slice(2);
const out = path.join(HERE, 'frames', `${theme}-${V}`);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto(`file://${HERE}/reel.html?theme=${theme}&v=${V}`);
await p.waitForTimeout(600);
const N = Math.round((await p.evaluate(() => TOTAL)) * 30);
for (let i = 0; i < N; i++) {
  await p.evaluate(async (t) => { await render(t); }, i / 30);
  await p.screenshot({ path: `${out}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
}
await b.close(); console.log(theme, V, N);
