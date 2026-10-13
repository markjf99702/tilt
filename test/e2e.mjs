// Plays Tilt in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Checks a link's preview says what the title card says, starts a game, launches with the Launch button, flips with
// touches on each half of the screen, nudges with Space as How to play says, pauses, drains every ball, checks the high
// score survives a reload, that a link to a table that isn't there opens the first, plays a game of Space and one of
// Haunted House (down to its basement and back) from the table picker, ends a game from the menu as its last ball
// counts its bonus (it's saved once), dates a high score in the player's own time zone, fits the backbox's longest
// messages on a 320 px phone, follows the title card's links from the keyboard, plays on over saved data it didn't
// write and in a window with no room for the table, covers the page with its message when JavaScript is off, checks the
// screen slides between a table's floors, and loads once more offline (sw.js must keep every file the page loads).
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
// A link to it says what the title card says, in the preview's line and on its picture (og.png, which
// tools/screenshots.mjs draws).
const lede = await page.textContent('.lede');
assert.equal(await page.getAttribute('meta[property="og:description"]', 'content'), lede, "the link preview's line says something else");
assert.ok((await readFile(join(root, 'tools/screenshots.mjs'), 'utf8')).includes(`<p>${lede}</p>`), 'the link preview picture says something else');

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

// With the ball in play, Space nudges (it launches only while a ball waits in the shooter lane), as How to play says.
await page.evaluate(() => { const g = window.tilt.game; g.state = 'live'; g.tiltMeter = 0; });
await page.keyboard.press('Space');
assert.ok(await page.evaluate(() => window.tilt.game.tiltMeter > 0.5), 'Space did not nudge');
assert.match(await page.textContent('#howTo'), /Nudge:[^.]*Space/, 'How to play does not say Space nudges');

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

// Space, from the picker: its own game, flippers, How to play and high scores, and the address names it.
assert.deepEqual(await page.$$eval('#tables input', els => els.map(e => [e.value, e.checked])), [['classic', true], ['space', false], ['haunted', false]]);
const classicScores = await page.evaluate(() => JSON.stringify(window.tilt.store.scores));
await page.tap('#tables label:has(input[value="space"])');
await page.waitForFunction(() => window.tilt.table.name === 'Space');
assert.equal(await page.evaluate(() => window.tilt.game.table.flippers.length), 3);
assert.match(await page.textContent('#howTo'), /the dock under the ramp/);
assert.equal(new URL(page.url()).searchParams.get('table'), 'space');
assert.equal(await page.evaluate(() => window.tilt.store.table), 'space');
// Enter starts it, though the tap left the picker holding the focus.
await page.keyboard.press('Enter');
await page.waitForSelector('#launch:not([hidden])');
await touch('touchStart', [{ x: lb.x + lb.width / 2, y: lb.y + lb.height / 2, id: 1 }]);
await page.waitForTimeout(600);
await touch('touchEnd', []);
await page.waitForFunction(() => window.tilt.game.state === 'live', null, { timeout: 5000 });
// The right half works both flippers on the right: the lower one and the one up the side.
await touch('touchStart', [{ x: 330, y: 600, id: 4 }]);
assert.deepEqual(await page.evaluate(() => window.tilt.game.table.flippers.map(f => f.pressed)), [false, true, true]);
await touch('touchEnd', []);
await page.evaluate(() => { const g = window.tilt.game; g.settings.ballSave = 0; g.saveUntil = 0; g.score += 23450; });
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { const g = window.tilt.game; const b = g.world.balls[0]; if (b) { b.x = 243; b.y = 980; b.vx = 0; b.vy = 300; g.state = 'live'; } });
  await page.waitForFunction(n => { const g = window.tilt.game; return g.mode === 'over' || (g.ballNo > n && g.state === 'lane'); }, i + 1, { timeout: 15000 });
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await page.evaluate(() => window.tilt.store.spaceScores.length), 1, 'Space keeps its own scores');
assert.equal(await page.evaluate(() => JSON.stringify(window.tilt.store.scores)), classicScores, "Classic's scores are left alone");
await page.tap('#tablesBtn');
assert.ok(await page.isVisible('#title'), 'Change table goes back to the picker');
await page.reload();
await page.waitForFunction(() => window.tilt);
assert.equal(await page.evaluate(() => window.tilt.table.name), 'Space', 'the table played last is still picked');
assert.ok(await page.isChecked('#tables input[value="space"]'));

// Haunted House, from the picker: four flippers (two on each floor), and a trip down the trapdoor takes the screen to
// the basement and the stairs bring it back up.
await page.tap('#tables label:has(input[value="haunted"])');
await page.waitForFunction(() => window.tilt.table.name === 'Haunted House');
assert.equal(await page.evaluate(() => window.tilt.game.table.flippers.length), 4);
assert.match(await page.textContent('#howTo'), /the stairs back up/);
assert.equal(new URL(page.url()).searchParams.get('table'), 'haunted');
await page.keyboard.press('Enter');
await page.waitForSelector('#launch:not([hidden])');
await touch('touchStart', [{ x: lb.x + lb.width / 2, y: lb.y + lb.height / 2, id: 1 }]);
await page.waitForTimeout(600);
await touch('touchEnd', []);
await page.waitForFunction(() => window.tilt.game.state === 'live', null, { timeout: 5000 });
await touch('touchStart', [{ x: 330, y: 600, id: 4 }]);
assert.deepEqual(await page.evaluate(() => window.tilt.game.table.flippers.map(f => f.pressed)), [false, true, false, true]);
await touch('touchEnd', []);
await page.evaluate(() => { const g = window.tilt.game, b = g.world.balls[0]; g.lamps.doorOpen = true; g.fall(b); });
await page.waitForFunction(() => window.tilt.game.floor === 1 && window.tilt.renderer.floor === 1, null, { timeout: 5000 });
await page.evaluate(() => { const g = window.tilt.game, b = g.world.balls[0]; b.held = null; g.climb(b); });
await page.waitForFunction(() => window.tilt.game.floor === 0 && window.tilt.game.world.balls[0].level === 0, null, { timeout: 5000 });
await page.evaluate(() => { const g = window.tilt.game; g.settings.ballSave = 0; g.saveUntil = 0; g.reached = true; });
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { const g = window.tilt.game; const b = g.world.balls[0]; if (b) { b.held = null; b.x = 243; b.y = 980; b.vx = 0; b.vy = 300; g.state = 'live'; } });
  await page.waitForFunction(n => { const g = window.tilt.game; return g.mode === 'over' || (g.ballNo > n && g.state === 'lane'); }, i + 1, { timeout: 15000 });
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await page.evaluate(() => window.tilt.store.hauntedScores.length), 1, 'Haunted House keeps its own scores');
assert.equal(await page.evaluate(() => JSON.stringify(window.tilt.store.scores)), classicScores, "Classic's scores are left alone");
await page.goto(base + '?table=classic');
await page.waitForFunction(() => window.tilt);
assert.equal(await page.evaluate(() => window.tilt.table.name), 'Classic');

// End game from the menu while the last ball's bonus counts: the game is saved once, at the score it had then. The
// rest of that ball never comes, however long the demo takes to start again (the clock is run on here at once).
await page.tap('#startBtn');
await page.waitForSelector('#launch:not([hidden])');
const listed = await page.evaluate(() => window.tilt.store.scores.length);
await page.evaluate(() => { const g = window.tilt.game, b = g.world.balls[0]; g.settings.ballSave = 0; g.saveUntil = 0; g.ballNo = 3; g.score += 40000; g.lamps.bonus = 10; b.x = 243; b.y = 980; b.vx = 0; b.vy = 300; g.state = 'live'; });
await page.waitForFunction(() => window.tilt.game.state === 'bonus', null, { timeout: 15000 });
await page.tap('#menuBtn');
const ended = await page.evaluate(() => {
  const g = window.tilt.game, score = g.score;
  document.getElementById('quitBtn').click();
  for (let i = 0; i < 60; i++) { g.world.time += 0.1; g.update(0); }
  return { score, after: g.score };
});
assert.equal(ended.after, ended.score, 'the bonus went on counting after End game');
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await page.textContent('#final'), ended.score.toLocaleString('en-US'));
assert.equal(await page.evaluate(() => window.tilt.store.scores.length), listed + 1, 'End game saved the game more than once');
assert.equal(await page.locator('#scores li').count(), listed + 1);

// A page of its own, in a new browser context (a time zone, a window size, storage of its own), whose errors count too.
async function freshPage(options = {}) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block', ...options });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  return p;
}

// A high score is dated the day it was played where the player is: 5:30 on an October evening in California is
// already the next day in UTC.
const west = await freshPage({ timezoneId: 'America/Los_Angeles' });
await west.clock.setFixedTime(new Date('2026-10-14T00:30:00Z'));
await west.goto(base);
await west.waitForFunction(() => window.tilt);
await west.tap('#startBtn');
await west.evaluate(() => { window.tilt.game.score += 4321; });
await west.tap('#menuBtn');
await west.tap('#quitBtn');
await west.waitForSelector('#over:not([hidden])');
assert.equal(await west.evaluate(() => window.tilt.store.scores[0].date), '2026-10-13');
assert.equal(await west.textContent('#scores li.me small'), '10/13');
await west.context().close();

// On a 320 px phone the backbox display still fits the longest messages and an eight-digit score, end to end.
const small = await freshPage({ viewport: { width: 320, height: 568 } });
await small.goto(base);
await small.waitForFunction(() => window.tilt);
await small.evaluate(() => document.fonts.ready);
await small.tap('#startBtn');
const cut = await small.evaluate(async () => {
  const d = document.getElementById('display'), g = window.tilt.game, cut = [];
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const fits = () => { const r = document.createRange(); r.selectNodeContents(d); return r.getBoundingClientRect().width <= d.clientWidth; };
  for (const m of ['Skill shot 25,000', 'Extra ball is lit', 'Ramp for 250,000', 'Orbits 28 × 1,000', 'Ghosts 12 × 2,000', 'Bonus 54,000 × 5']) {
    g.show(m, 30); await frames();
    if (d.textContent !== m || !fits()) cut.push(m);
  }
  g.show('', 0); g.score = 12345670; await frames();
  if (!fits()) cut.push(d.textContent);
  return cut;
});
assert.deepEqual(cut, [], 'cut off at the ends of the display on a 320 px phone');
await small.context().close();

// On a keyboard, Enter on one of the title card's links follows it, rather than starting a game.
for (const [i, to] of [[0, 'https://junkdrawer.works/'], [1, 'https://junkdrawer.works/privacy.html']]) {
  const desk = await freshPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await desk.route('https://junkdrawer.works/**', r => r.fulfill({ contentType: 'text/html', body: '<title>junkdrawer.works</title>' }));
  await desk.goto(base);
  await desk.waitForFunction(() => window.tilt);
  await desk.locator('#title .jd-foot a').nth(i).focus();
  await desk.keyboard.press('Enter');
  await desk.waitForURL(to, { timeout: 10000 });
  await desk.context().close();
}

// Saved data that isn't what Tilt saves (edited by hand, say) doesn't stop the machine: the demo plays, a game ends
// with its card and is saved, and any score that can be read is kept.
for (const junk of ['42', '[]', '{"scores":"lots"}', '{"scores":[null,{"score":5000}]}', '{"skin":"toString"}']) {
  const p = await freshPage();
  await p.addInitScript(v => localStorage.setItem('tilt.v1', v), junk);
  await p.goto(base);
  await p.waitForFunction(() => window.tilt?.game.world.time > 0.2, null, { timeout: 10000 });
  await p.evaluate(() => { window.tilt.startGame(); window.tilt.game.score += 4321; document.getElementById('menuBtn').click(); document.getElementById('quitBtn').click(); });
  await p.waitForSelector('#over:not([hidden])', { timeout: 5000 });
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('tilt.v1')).scores.map(s => s.score));
  assert.deepEqual(kept, junk.includes('5000') ? [5000, 4321] : [4321], `the scores saved over ${junk}`);
  await p.context().close();
}

// A window shorter than the backbox leaves the table no room. The machine runs on, and draws the table once it has room.
const tiny = await freshPage({ viewport: { width: 390, height: 50 } });
await tiny.goto(base);
await tiny.waitForFunction(() => window.tilt?.game.world.time > 0.3, null, { timeout: 10000 });
await tiny.setViewportSize({ width: 390, height: 844 });
await tiny.waitForFunction(() => window.tilt.renderer.scale > 0 && !window.tilt.renderer.dirty, null, { timeout: 10000 });
await tiny.context().close();

// With JavaScript off, the page says what it needs it for, over everything else and with nothing showing through.
const nojs = await freshPage({ javaScriptEnabled: false });
await nojs.goto(base);
assert.ok(await nojs.evaluate(() => {
  const n = document.querySelector('.noscript');
  const onTop = [...document.querySelectorAll('#title h1, #title p, #title button')].every(e => {
    const r = e.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === n;
  });
  return onTop && /^rgb\(/.test(getComputedStyle(n).backgroundColor);
}), 'the title card shows through the message for a browser with JavaScript off');
await nojs.context().close();

// The screen slides between a table's floors, down to the one the ball is on and back up: a made-up table with two,
// the top one red and the one under it blue. Someone who asks for less motion gets a cut instead.
const slide = () => page.evaluate(async () => {
  const { Renderer } = await import('./js/render.js');
  const r = new Renderer(document.createElement('canvas')), layout = { W: 100, H: 200, walls: [], circles: [], sensors: [] };
  r.setTable({ floors: [0, 1], paint: (c, t, s, floor) => { c.fillStyle = floor ? '#00f' : '#f00'; c.fillRect(0, 0, t.W, t.H); }, draw() {} });
  r.resize(100, 200, 1, layout);
  const game = { table: layout, floor: 0 };
  const at = (now, y) => { r.draw(game, now); const [red, , blue] = r.ctx.getImageData(50, y, 1, 1).data; return red > 200 ? 'top' : blue > 200 ? 'under' : '?'; };
  const seen = [at(0, 100)];
  game.floor = 1;
  seen.push(at(1000, 150), at(1225, 50), at(1225, 150), at(1500, 50));
  game.floor = 0;
  seen.push(at(2000, 50), at(2225, 50), at(2225, 150), at(2500, 150));
  return seen;
});
assert.deepEqual(await slide(), ['top', 'top', 'top', 'under', 'under', 'under', 'top', 'under', 'top']);
await page.emulateMedia({ reducedMotion: 'reduce' });
assert.deepEqual(await slide(), ['top', 'under', 'under', 'under', 'under', 'top', 'top', 'top', 'top']);
await page.emulateMedia({ reducedMotion: 'no-preference' });
// ?debug outlines only the floor on the screen: on the same made-up table, a wall up top and one under it.
const outlines = await page.evaluate(async () => {
  const { Renderer } = await import('./js/render.js');
  const r = new Renderer(document.createElement('canvas')), walls = [{ ax: 0, ay: 50.5, bx: 100, by: 50.5 }, { ax: 0, ay: 150.5, bx: 100, by: 150.5, level: 1 }];
  const layout = { W: 100, H: 200, walls, circles: [], sensors: [] }, game = { table: layout, floor: 0 }, seen = [];
  r.debug = true;
  r.setTable({ floors: [0, 1], paint() {}, draw() {} });
  r.resize(100, 200, 1, layout);
  for (const floor of [0, 1]) {
    game.floor = floor; r.draw(game, floor * 1000); r.draw(game, floor * 1000 + 500);
    seen.push([50, 150].filter(y => { const [red, green] = r.ctx.getImageData(50, y, 1, 1).data; return red + green > 200; }));
  }
  return seen;
});
assert.deepEqual(outlines, [[50], [150]], 'the outlines of the floor that is not on the screen show');

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
