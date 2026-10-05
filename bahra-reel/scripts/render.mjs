// Render index.html frame by frame with headless Chromium.
//
//   node scripts/render.mjs                 -> build/frames/00000.jpg ... + build/sfx.json
//   node scripts/render.mjs --stills 3,14.5 -> build/stills/t03.00.png ... (quick previews)
//
// The page exposes window.renderFrame(t) which seeks the GSAP master timeline
// and every procedural loop, so any frame can be rendered independently and
// the work can be split across several browser pages.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30, DURATION = 60, W = 1080, H = 1920;
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
  return page;
}

async function main() {
  const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
  const stills = opt('stills');

  if (stills) {
    const dir = path.join(ROOT, 'build', 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser);
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate((t) => window.renderFrame(t), t);
      const file = path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    await browser.close();
    return;
  }

  const workers = Number(opt('workers', 4));
  const total = Math.round(FPS * DURATION);
  const from = Number(opt('from', 0)), to = Number(opt('to', total));
  const dir = path.join(ROOT, 'build', 'frames');
  fs.mkdirSync(dir, { recursive: true });

  const first = await openPage(browser);
  const sfx = await first.evaluate(() => window.SFX);
  fs.writeFileSync(path.join(ROOT, 'build', 'sfx.json'), JSON.stringify(sfx, null, 1));

  const pages = [first];
  for (let i = 1; i < workers; i++) pages.push(await openPage(browser));

  const chunk = Math.ceil((to - from) / workers);
  let done = 0;
  const t0 = Date.now();
  await Promise.all(pages.map(async (page, w) => {
    const a = from + w * chunk, b = Math.min(to, a + chunk);
    for (let f = a; f < b; f++) {
      await page.evaluate((t) => window.renderFrame(t), f / FPS);
      await page.screenshot({
        path: path.join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94,
      });
      if (++done % 150 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(`${done}/${to - from} frames (${rate.toFixed(1)} fps)`);
      }
    }
  }));
  await browser.close();
  console.log(`rendered ${to - from} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
