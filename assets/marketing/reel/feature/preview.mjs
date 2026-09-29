// 몇 시점만 정지 화면으로 뽑아 본다. node preview.mjs a 30 "3,9.5,20"
import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [theme = 'a', V = '30', list = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 0.4 });
await p.goto(`file://${HERE}/reel.html?theme=${theme}&v=${V}`);
await p.waitForTimeout(600);
for (const t of list.split(',').map(Number)) {
  await p.evaluate(async (t) => { await render(t); }, t);
  await p.screenshot({ path: path.join(HERE, `preview-${theme}-${t}.png`) });
}
await b.close();
