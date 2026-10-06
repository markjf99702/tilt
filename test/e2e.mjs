// Plays Tilt in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Starts a game, launches with the Launch button, flips with touches on each half of the screen,
// pauses, drains every ball, checks the high score survives a reload, that a link to a table that isn't
// there opens the first, and loads once more offline (sw.js must keep every file the page loads).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
const loaded = new Set();
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); else loaded.add(new URL(r.url()).pathname.slice(1) || './'); });

await page.goto(base);
await page.evaluate(() => document.fonts.ready);

// Every file the page loads is in the offline copy (a new table's files are easy to forget there).
const shell = [...(await readFile(join(root, 'sw.js'), 'utf8')).match(/SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
assert.deepEqual([...loaded].filter(f => f !== 'sw.js' && !shell.includes(f)), [], 'files the page loads but sw.js does not keep');

const peek = () => page.evaluate(() => { const g = window.tilt.game; return { mode: g.mode, state: g.state, ball: g.ballNo, score: g.score, balls: g.world.balls.length, left: g.table.flippers[0].pressed, right: g.table.flippers[1].pressed, pull: g.table.plunger.pull }; });

// The title card, with the demo playing behind it. The table picker is there when there's more than one table.
assert.ok(await page.isVisible('#startBtn'));
assert.equal((await peek()).mode, 'attract');
assert.equal(await page.isVisible('#tables'), await page.locator('#tables input').count() > 1);

await page.tap('#startBtn');
await page.waitForFunction(() => window.tilt.game.mode === 'play');
assert.ok(await page.isHidden('#title'));
await page.waitForSelector('#launch:not([hidden])');
let p = await peek();
assert.equal(p.ball, 1);
assert.equal(p.state, 'lane');

// Hold Launch, let go: the ball goes up the shooter lane and into play.
const lb = await page.locator('#launch').boundingBox();
const cdp = await ctx.newCDPSession(page);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await touch('touchStart', [{ x: lb.x + lb.width / 2, y: lb.y + lb.height / 2, id: 1 }]);
await page.waitForTimeout(600);
assert.ok((await peek()).pull > 0.3, 'the plunger pulls back while held');
await touch('touchEnd', []);
await page.waitForFunction(() => window.tilt.game.state === 'live', null, { timeout: 5000 });
assert.ok(await page.isHidden('#launch'), 'Launch goes away once the ball is in play');

// Touches on each half work the flippers, both at once too.
await touch('touchStart', [{ x: 60, y: 600, id: 2 }]);
assert.ok((await peek()).left);
await touch('touchStart', [{ x: 60, y: 600, id: 2 }, { x: 330, y: 600, id: 3 }]);
p = await peek();
assert.ok(p.left && p.right, 'both flippers up');
await touch('touchEnd', [{ x: 330, y: 600, id: 3 }]); // the finger that lifted
p = await peek();
assert.ok(p.left && !p.right, 'lifting one finger drops only that flipper');
await touch('touchEnd', [{ x: 60, y: 600, id: 2 }]);
assert.ok(!(await peek()).left);

// The menu pauses everything.
await page.tap('#menuBtn');
assert.ok(await page.isVisible('#pause'));
const frozen = await page.evaluate(() => window.tilt.game.world.time);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => window.tilt.game.world.time), frozen, 'the clock stops while paused');
await page.tap('#resumeBtn');

// Drain every ball (straight down the middle) and the game ends with a score on the list.
await page.evaluate(() => { const g = window.tilt.game; g.settings.ballSave = 0; g.saveUntil = 0; g.score += 12340; });
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { const g = window.tilt.game; const b = g.world.balls[0]; if (b) { b.x = 243; b.y = 980; b.vx = 0; b.vy = 300; g.state = 'live'; } });
  await page.waitForFunction(n => { const g = window.tilt.game; return g.mode === 'over' || (g.ballNo > n && g.state === 'lane'); }, i + 1, { timeout: 15000 });
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const final = await page.textContent('#final');
assert.ok(Number(final.replace(/,/g, '')) >= 12340, 'final score shown');
assert.equal(await page.locator('#scores li').count(), 1);

await page.reload();
await page.waitForFunction(() => window.tilt);
assert.match(await page.textContent('#bestLine'), /Best: [\d,]+/, 'the best score is remembered');

// A link to a table that isn't there opens the first one, and the address stops naming it.
await page.goto(base + '?table=nope');
await page.waitForFunction(() => window.tilt);
assert.equal(await page.evaluate(() => window.tilt.table.name), 'Classic');
assert.ok(!new URL(page.url()).searchParams.has('table'), 'the address still names a table that is not there');

// Fits a phone: nothing scrolls sideways.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');

// Works offline once it has been opened.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
assert.ok(await page.title(), 'the page did not load offline');
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
