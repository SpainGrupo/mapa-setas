// Render prototype artboards to PNG.
// usage: NODE_PATH=$(npm root -g) node render.mjs <html> <outPrefix> [--sheet]
// Each <section class="screen" data-shot="NN-name"> is rendered alone at 430x932 CSS px (@2x).
// Optional data-scroll="N" on the section scrolls its .scroll child before capture.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || ''] }));
import path from 'node:path';
const [,, html, outPrefix, flag] = process.argv;
const browser = await chromium.launch();
const url = 'file://' + path.resolve(html);
if (flag === '--sheet') {
  const p = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(url); await p.waitForTimeout(400);
  await p.screenshot({ path: outPrefix + '.png', fullPage: true });
} else {
  const p = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
  const shots = await p.$$eval('section.screen[data-shot]', (els) => els.map((e) => e.dataset.shot));
  for (const s of shots) {
    await p.evaluate((s) => {
      document.documentElement.classList.add('shooting');
      document.querySelectorAll('section.screen').forEach((e) => { e.style.display = e.dataset.shot === s ? '' : 'none'; });
      const sec = document.querySelector(`section.screen[data-shot="${s}"]`);
      const sc = sec.querySelector('.scroll'); if (sc && sec.dataset.scroll) sc.scrollTop = +sec.dataset.scroll;
      window.scrollTo(0, 0);
    }, s);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${outPrefix}-${s}.png`, clip: { x: 0, y: 0, width: 430, height: 932 } });
    console.log('wrote', `${outPrefix}-${s}.png`);
  }
  if (errors.length) { console.error('PAGE ERRORS:', errors); process.exitCode = 1; }
}
await browser.close();
