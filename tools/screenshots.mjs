// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random is seeded and the demo runs for a fixed time, so the pictures come out the same each run.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await pw.chromium.launch();
const UPNG = require('upng-js');

// Saves with a 256-colour palette, which keeps the pictures a fraction of the size.
async function save(png, path) {
  const img = UPNG.decode(png);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}

async function open(viewport, scale, query = '') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let a = 11; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    localStorage.setItem('tilt.v1', JSON.stringify({ scores: [{ score: 1284650, date: '2026-10-05' }] }));
  });
  await page.goto(base + query);
  await page.waitForFunction(() => window.tilt);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// A game in progress: some lanes and lamps lit, a ball in the bumpers.
async function midGame(page) {
  await page.evaluate(() => {
    const t = window.tilt;
    t.startGame();
    const g = t.game, l = g.lamps;
    g.score = 486210; l.bonus = 14; l.mult = 3; l.lanes = [true, false, true]; l.bumpersLit = true;
    l.standups = [false, true, false]; l.spinnerLit = true; l.skillLane = -1;
    g.table.drops[1].off = true; g.table.drops[2].off = true;
    const b = g.world.balls[0]; b.x = 228; b.y = 296; b.vx = 0; b.vy = 0; g.state = 'live'; g.saveUntil = 0; g.saveArmed = false;
    g.bumperFlash[0] = 1;
    window.tilt.setPaused(true);
    document.getElementById('pause').hidden = true;
  });
  await page.waitForTimeout(300);
}

const phone = await open({ width: 390, height: 844 }, 2);
await page2(phone);
async function page2(page) {
  await page.waitForTimeout(1500);
  await save(await page.screenshot(), 'docs/phone-title.png');
  await midGame(page);
  await save(await page.screenshot(), 'docs/phone-play.png');
}

// The link preview: the name and one line on the left, the real table on the right.
const og = await open({ width: 390, height: 844 }, 2);
await midGame(og);
const shot = (await og.locator('#table').screenshot()).toString('base64');
const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.setContent(`<style>
  @font-face { font-family: Bungee; src: url(data:font/woff2;base64,${await font('bungee.woff2')}); }
  @font-face { font-family: Figtree; src: url(data:font/woff2;base64,${await font('figtree.woff2')}); font-weight: 300 900; }
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(circle at 30% 40%, #1d3c80, #0a1636 70%); display: flex; }
  .l { flex: 1; padding: 0 0 0 90px; display: flex; flex-direction: column; justify-content: center; }
  h1 { margin: 0; font: 170px/0.9 Bungee; color: #ffa53a; text-shadow: 0 0 24px rgba(255,140,30,.5), 0 8px 0 #a33a10; }
  p { margin: 34px 0 0; font: 500 40px/1.2 Figtree; color: #f6efe0; max-width: 520px; }
  .r { width: 470px; position: relative; overflow: hidden; }
  .r img { position: absolute; left: 20px; top: -40px; width: 440px; transform: rotate(4deg); box-shadow: 0 20px 60px rgba(0,0,0,.6); border-radius: 14px; }
</style><div class="l"><h1>Tilt</h1><p>A classic pinball table, in your pocket.</p></div><div class="r"><img src="data:image/png;base64,${shot}"></div>`);
await card.evaluate(() => document.fonts.ready);
await save(await card.screenshot(), 'og.png');

// Space in a game: a ball locked in the dock under the ramp, the lock lit again, and the ball in play riding the
// ramp's hairpin over it.
const space = await open({ width: 390, height: 844 }, 2, '?table=space');
await space.evaluate(async () => {
  const { makeBall } = await import('./js/physics.js');
  const t = window.tilt;
  t.startGame();
  const g = t.game, l = g.lamps, L = g.table.lockSpot, H = g.table.hairpin;
  g.score = 362840; l.mult = 2; l.lanes = [true, false, false]; l.lockLit = true; l.planets = 3; l.skill = false;
  const locked = g.world.balls[0];
  locked.x = L.x; locked.y = L.y; locked.held = { until: Infinity }; locked.locked = true;
  const a = 120 * Math.PI / 180, b = makeBall(H.x + Math.cos(a) * H.r, H.y - Math.sin(a) * H.r);
  b.level = 1; b.z = H.z; g.world.balls.push(b);
  g.state = 'live'; g.saveUntil = 0; g.saveArmed = false;
  window.tilt.setPaused(true);
  document.getElementById('pause').hidden = true;
});
// Let "Ball 1" go from the display so it shows the score. The arrows blink with the clock: take the picture while
// they're lit, so it comes out the same each run.
await space.waitForTimeout(1300);
await space.waitForFunction(() => performance.now() % 800 < 200);
await save(await space.screenshot(), 'docs/phone-space.png');

// Haunted House in a game: a ghost glowing in the left window and another on the right wall, the door open with the
// trapdoor glowing behind it; then the same game down in the basement, the coffin's lid half off.
const haunted = await open({ width: 390, height: 844 }, 2, '?table=haunted');
await haunted.evaluate(() => {
  const t = window.tilt;
  t.startGame();
  const g = t.game, l = g.lamps;
  g.score = 284650; l.mult = 2; l.lanes = [true, false, false]; l.skillLane = -1; l.doorOpen = true;
  for (const i of [1, 3]) { g.ghosts[i].lit = true; g.ghosts[i].until = Infinity; }
  const b = g.world.balls[0]; b.x = 300; b.y = 610; b.vx = 0; b.vy = 0; g.state = 'live'; g.saveUntil = 0; g.saveArmed = false;
  window.tilt.setPaused(true);
  document.getElementById('pause').hidden = true;
});
await haunted.waitForTimeout(1300);
await haunted.waitForFunction(() => performance.now() % 800 < 200);
await save(await haunted.screenshot(), 'docs/phone-haunted.png');
await haunted.evaluate(() => {
  const g = window.tilt.game, b = g.world.balls[0];
  g.floor = 1; b.level = 1; b.x = 330; b.y = 700;
  g.table.lids[0].off = true; g.table.lids[1].off = true;
});
await haunted.waitForTimeout(1300);
await haunted.waitForFunction(() => performance.now() % 800 < 200);
await save(await haunted.screenshot(), 'docs/phone-basement.png');

await browser.close();
server.close();
console.log('screenshots written');
