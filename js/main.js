// Tilt: wires the table, the rules, the drawing and the sound to the page, and runs the clock.
// The physics takes fixed thousandth-of-a-second steps, so it plays the same on a 60 Hz laptop and a 120 Hz phone.

import { STEP } from './physics.js';
import { Renderer } from './render.js';
import { NORMAL } from './settings.js';
import { play, unlock, setSound } from './sound.js';
import { TABLES } from './tables.js';

const $ = id => document.getElementById(id);
const KEY = 'tilt.v1';
const FIRST = Object.keys(TABLES)[0]; // the table a new player starts on
const store = load();
const renderer = new Renderer($('table'));
setSound(store.sound !== false);

// The table in the machine (see useTable below), its skin, and its rules running a game or the demo.
let table, skin, game;
let msgUntil = 0, msgText = '';
const out = {
  sound: (n, o) => play(n, o),
  show: (text, secs) => { msgText = text; msgUntil = performance.now() + secs * 1000; },
  over: g => gameOver(g),
};
let paused = false;

// ---------- saved things ----------
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: play on without saving */ }
}
const fmt = n => n.toLocaleString('en-US');

// Each table keeps its own top five.
function showBest() {
  const top = (store[table.scoresKey] || [])[0];
  $('bestLine').textContent = top ? `Best: ${fmt(top.score)}` : '';
}

// ---------- layout ----------
function resize() {
  const st = $('stage'), r = st.getBoundingClientRect();
  renderer.resize(r.width, r.height, Math.min(2.5, window.devicePixelRatio || 1), game.table);
  // The Launch button sits on the apron, just left of the shooter lane, so it never hides the ball.
  const b = $('launch'), s = renderer.scale;
  const edge = renderer.ox + game.table.plunger.x0 * s;
  b.style.right = Math.max(4, r.width - edge + 4) + 'px';
  b.style.bottom = Math.max(6, r.height - (renderer.oy + game.table.H * s) + 6) + 'px';
}
window.addEventListener('resize', resize);

// ---------- tables ----------
// The picker on the title card, and Change table at the end of a game, when there's more than one table.
for (const [id, t] of Object.entries(TABLES)) {
  $('tables').insertAdjacentHTML('beforeend', `<label><input type="radio" name="table" value="${id}"><span><b>${t.name}</b><small>${t.blurb}</small></span></label>`);
}
$('tables').hidden = $('tablesRow').hidden = Object.keys(TABLES).length < 2;
$('tables').addEventListener('change', e => useTable(e.target.value));

// Puts a table in the machine, with the demo playing on it: its drawing and rules, its How to play (under the
// controls, which are the same on every table) and its best score. The next visit starts on it too, and the
// address names it, so a link opens it.
function useTable(id) {
  table = TABLES[id];
  skin = table.skins[store.skin] || Object.values(table.skins)[0];
  renderer.setTable(table);
  renderer.setSkin(skin);
  game = new table.Game({ ...NORMAL }, out);
  game.start('attract');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', skin.theme);
  for (const li of $('howTo').querySelectorAll('li[data-table]')) li.remove();
  for (const h of table.howTo) $('howTo').insertAdjacentHTML('beforeend', `<li data-table>${h}</li>`);
  $('tables').querySelector(`input[value="${id}"]`).checked = true;
  if (store.table !== id) { store.table = id; save(); }
  // The first table needs no name in the address, and anything else there (?debug, say) stays as it was. The
  // single-file copy may be inside someone else's page, so it leaves the address alone.
  if (!window.TILT_SINGLE_FILE) {
    try {
      const keep = location.search.slice(1).split('&').filter(p => p && p.split('=')[0] !== 'table');
      const q = (id === FIRST ? keep : [...keep, 'table=' + id]).join('&'), search = q && '?' + q;
      if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash);
    } catch { /* an address it can't change: play on */ }
  }
  showBest();
  resize();
}

// The table a link names, else the one played last, else the first.
const asked = new URLSearchParams(location.search).get('table');
useTable([asked, store.table].find(id => id && Object.hasOwn(TABLES, id)) || FIRST);

// ---------- controls: touch ----------
const stage = $('stage');
const touches = new Map(); // pointerId -> { side, x0, y0, t0, nudged }
function held(side) { for (const t of touches.values()) if (t.side === side) return true; return false; }

stage.addEventListener('pointerdown', e => {
  unlock();
  if (e.target.closest('#launch')) return;
  if (game.mode !== 'play' || paused) return;
  e.preventDefault();
  const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
  touches.set(e.pointerId, { side, x0: e.clientX, y0: e.clientY, t0: performance.now(), nudged: false });
  try { stage.setPointerCapture(e.pointerId); } catch { }
  game.flip(side, true);
});
stage.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId);
  if (!t || t.nudged || e.pointerType === 'mouse') return;
  const dy = e.clientY - t.y0, dx = e.clientX - t.x0;
  // A quick upward swipe nudges the machine, the way you'd bump the cabinet.
  if (dy < -40 && performance.now() - t.t0 < 350) {
    t.nudged = true;
    doNudge(Math.sign(dx) * Math.min(1, Math.abs(dx) / 60));
  }
});
function lift(e) {
  const t = touches.get(e.pointerId);
  if (!t) return;
  touches.delete(e.pointerId);
  if (!held(t.side)) game.flip(t.side, false);
}
stage.addEventListener('pointerup', lift);
stage.addEventListener('pointercancel', lift);
stage.addEventListener('contextmenu', e => e.preventDefault());

const launch = $('launch');
launch.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); unlock();
  try { launch.setPointerCapture(e.pointerId); } catch { }
  if (game.mode === 'play' && !paused) game.plunge(true);
});
const launchUp = e => { e.preventDefault(); game.plunge(false); };
launch.addEventListener('pointerup', launchUp);
launch.addEventListener('pointercancel', launchUp);

function doNudge(side = 0) {
  game.nudge(side * 260, -360);
  stage.animate?.([{ transform: 'translateY(0)' }, { transform: `translate(${side * 2}px,-4px)` }, { transform: 'translateY(0)' }], { duration: 120 });
}

// ---------- controls: keyboard ----------
const LEFT = ['KeyZ', 'ShiftLeft', 'ArrowLeft'], RIGHT = ['Slash', 'ShiftRight', 'ArrowRight'], PLUNGE = ['Space', 'Enter', 'ArrowDown'];
document.addEventListener('keydown', e => {
  unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (game.mode === 'play') setPaused(!paused); return; }
  if (game.mode !== 'play' || paused) {
    // Enter or Space starts a game from the title card, but not while opening How to play or picking a table.
    const busy = document.activeElement?.tagName === 'SUMMARY' || document.activeElement?.closest('.tables');
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && !$('title').hidden && !busy) { e.preventDefault(); startGame(); }
    return;
  }
  if (e.repeat) { if ([...LEFT, ...RIGHT, ...PLUNGE, 'ArrowUp'].includes(e.code)) e.preventDefault(); return; }
  if (LEFT.includes(e.code)) { e.preventDefault(); game.flip('left', true); }
  else if (RIGHT.includes(e.code)) { e.preventDefault(); game.flip('right', true); }
  else if (PLUNGE.includes(e.code)) {
    e.preventDefault();
    if (game.state === 'lane' && game.ballInLane()) game.plunge(true);
    else if (e.code === 'Space') doNudge(0);
  } else if (e.code === 'ArrowUp') { e.preventDefault(); doNudge(0); }
});
document.addEventListener('keyup', e => {
  if (LEFT.includes(e.code)) game.flip('left', false);
  else if (RIGHT.includes(e.code)) game.flip('right', false);
  else if (PLUNGE.includes(e.code)) game.plunge(false);
});

// ---------- menus ----------
function startGame() {
  unlock();
  $('title').hidden = true; $('over').hidden = true; $('pause').hidden = true;
  paused = false;
  game.start('play');
  play('start');
}
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('tablesBtn').addEventListener('click', toTitle);
$('menuBtn').addEventListener('click', () => {
  unlock();
  if (game.mode === 'play') setPaused(!paused);
});
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', () => {
  $('pause').hidden = true; paused = false;
  if (game.score > 0) gameOver(game); else toTitle();
});
function soundLabel() { $('soundBtn').textContent = 'Sound: ' + (store.sound === false ? 'off' : 'on'); }
soundLabel();
$('soundBtn').addEventListener('click', () => {
  store.sound = store.sound === false; setSound(store.sound); save(); soundLabel();
});

function setPaused(p) {
  paused = p;
  $('pause').hidden = !p;
  for (const f of game.table.flippers) f.pressed = false;
  game.plunge(false);
  touches.clear();
  if (p) $('resumeBtn').focus();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play' && !paused) setPaused(true); });

function toTitle() {
  $('over').hidden = true;
  showBest();
  $('title').hidden = false;
  game.start('attract');
}

function gameOver(g) {
  const score = g.score;
  game.mode = 'over';
  const list = store[table.scoresKey] || [];
  const entry = { score, date: new Date().toISOString().slice(0, 10) };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  store[table.scoresKey] = list.slice(0, 5);
  save();
  const rank = store[table.scoresKey].indexOf(entry);
  $('final').textContent = fmt(score);
  $('overNote').textContent = rank === 0 && list.length > 1 ? 'A new high score.' : rank >= 0 ? `Number ${rank + 1} on your list.` : '';
  $('scores').innerHTML = '';
  store[table.scoresKey].forEach(s => {
    const li = document.createElement('li');
    if (s === entry) li.className = 'me';
    li.innerHTML = `<span>${fmt(s.score)}</span> <small>${s.date.slice(5).replace('-', '/')}</small>`;
    $('scores').appendChild(li);
  });
  setTimeout(() => { $('over').hidden = false; $('againBtn').focus(); }, 900);
  setTimeout(() => { if (!$('over').hidden && game.mode === 'over') game.start('attract'); }, 1600);
}

// ---------- the clock ----------
let last = performance.now(), acc = 0, shownScore = -1, shownMsg = '', shownBall = '';
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    // The ball's world runs timeScale times as fast as the clock (a touch of slow motion, see settings.js).
    acc += dt * (game.settings.timeScale ?? 1);
    while (acc >= STEP) { game.world.step(); acc -= STEP; }
    if (game.mode === 'attract' || game.mode === 'over') game.autopilot();
    game.update(dt);
  }
  renderer.draw(game, now);
  hud(now);
  requestAnimationFrame(frame);
}

function hud(now) {
  const d = $('display');
  const msg = now < msgUntil && game.mode === 'play' ? msgText : '';
  if (msg !== shownMsg) {
    shownMsg = msg;
    d.classList.toggle('msg', !!msg);
    if (msg) d.textContent = msg; else { d.innerHTML = '<span id="score"></span>'; shownScore = -1; }
  }
  if (!msg) {
    const s = game.mode === 'play' || game.mode === 'over' ? game.score : (store[table.scoresKey]?.[0]?.score ?? 0);
    if (s !== shownScore) { shownScore = s; $('score').textContent = fmt(s); }
  }
  const ball = game.mode === 'play' ? `Ball ${game.ballNo}` + (game.extraBalls > 0 ? '+' : '') : game.mode === 'over' ? 'Game over' : 'Best';
  if (ball !== shownBall) { shownBall = ball; $('ballNo').textContent = ball; }
  // Only while a ball waits to be plunged: not while the machine plunges another itself in multiball.
  const showLaunch = game.mode === 'play' && game.state === 'lane' && game.ballInLane() && !paused;
  if (launch.hidden === showLaunch) launch.hidden = !showLaunch;
  if (showLaunch) $('meter').style.height = (game.table.plunger.pull * 100) + '%';
}

document.fonts?.ready.then(() => { renderer.dirty = true; });
requestAnimationFrame(frame);

// For the tests and the screenshot tool.
window.tilt = { get game() { return game; }, get table() { return table; }, renderer, store, startGame, setPaused, useTable };

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.TILT_SINGLE_FILE) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
