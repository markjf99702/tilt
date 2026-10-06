// Tilt: wires the table, the rules, the drawing and the sound to the page, and runs the clock.
// The physics takes fixed thousandth-of-a-second steps, so it plays the same on a 60 Hz laptop and a 120 Hz phone.

import { Game } from './game.js';
import { STEP } from './physics.js';
import { Renderer } from './render.js';
import { SKINS } from './skins.js';
import { NORMAL } from './settings.js';
import { play, unlock, setSound } from './sound.js';
import { PF_RIGHT, H } from './table.js';

const $ = id => document.getElementById(id);
const KEY = 'tilt.v1';
const store = load();
const renderer = new Renderer($('table'));
const skin = SKINS[store.skin] || SKINS.classic;
renderer.setSkin(skin);
setSound(store.sound !== false);

let msgUntil = 0, msgText = '';
const game = new Game({ ...NORMAL }, {
  sound: (n, o) => play(n, o),
  show: (text, secs) => { msgText = text; msgUntil = performance.now() + secs * 1000; },
  over: g => gameOver(g),
});
let paused = false;
game.start('attract');

// ---------- saved things ----------
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: play on without saving */ }
}
const fmt = n => n.toLocaleString('en-US');

function showBest() {
  const top = (store.scores || [])[0];
  $('bestLine').textContent = top ? `Best: ${fmt(top.score)}` : '';
}
showBest();

// ---------- layout ----------
function resize() {
  const st = $('stage'), r = st.getBoundingClientRect();
  renderer.resize(r.width, r.height, Math.min(2.5, window.devicePixelRatio || 1));
  // The Launch button sits on the apron, just left of the shooter lane, so it never hides the ball.
  const b = $('launch'), s = renderer.scale;
  const edge = renderer.ox + PF_RIGHT * s;
  b.style.right = Math.max(4, r.width - edge + 4) + 'px';
  b.style.bottom = Math.max(6, r.height - (renderer.oy + H * s) + 6) + 'px';
}
window.addEventListener('resize', resize);
resize();

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
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && !$('title').hidden && document.activeElement?.tagName !== 'SUMMARY') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.repeat) { if ([...LEFT, ...RIGHT, ...PLUNGE, 'ArrowUp'].includes(e.code)) e.preventDefault(); return; }
  if (LEFT.includes(e.code)) { e.preventDefault(); game.flip('left', true); }
  else if (RIGHT.includes(e.code)) { e.preventDefault(); game.flip('right', true); }
  else if (PLUNGE.includes(e.code)) {
    e.preventDefault();
    if (game.ballInLane()) game.plunge(true);
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
  const list = store.scores || [];
  const entry = { score, date: new Date().toISOString().slice(0, 10) };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  store.scores = list.slice(0, 5);
  save();
  const rank = store.scores.indexOf(entry);
  $('final').textContent = fmt(score);
  $('overNote').textContent = rank === 0 && list.length > 1 ? 'A new high score.' : rank >= 0 ? `Number ${rank + 1} on your list.` : '';
  $('scores').innerHTML = '';
  store.scores.forEach(s => {
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
    acc += dt;
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
    const s = game.mode === 'play' || game.mode === 'over' ? game.score : (store.scores?.[0]?.score ?? 0);
    if (s !== shownScore) { shownScore = s; $('score').textContent = fmt(s); }
  }
  const ball = game.mode === 'play' ? `Ball ${game.ballNo}` + (game.extraBalls > 0 ? '+' : '') : game.mode === 'over' ? 'Game over' : 'Best';
  if (ball !== shownBall) { shownBall = ball; $('ballNo').textContent = ball; }
  const showLaunch = game.mode === 'play' && game.ballInLane() && !paused;
  if (launch.hidden === showLaunch) launch.hidden = !showLaunch;
  if (showLaunch) $('meter').style.height = (game.table.plunger.pull * 100) + '%';
}

document.fonts?.ready.then(() => { renderer.dirty = true; });
requestAnimationFrame(frame);

// For the tests and the screenshot tool.
window.tilt = { game, renderer, store, startGame, setPaused };

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.TILT_SINGLE_FILE) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
