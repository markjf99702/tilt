// The physics and the rules, without a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBall, BALL_R } from '../js/physics.js';
import { buildTable, W, H, PF_RIGHT } from '../js/table.js';
import { Game, SCORES } from '../js/game.js';
import { NORMAL } from '../js/settings.js';

const run = (w, ms, each) => { for (let i = 0; i < ms; i++) { w.step(); each?.(i); } };

// Seeded Math.random, so the long runs are the same every time.
function seed(n) {
  let a = n;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

test('a full plunge goes round the arch and down the left orbit through the spinner', () => {
  const t = buildTable(), w = new World(t, NORMAL);
  const b = makeBall(503, t.plunger.y - BALL_R); w.balls.push(b);
  t.plunger.firing = true; t.plunger.fireSpeed = NORMAL.launchMax;
  const seen = new Set();
  run(w, 3000, () => { for (const e of w.events) seen.add(e.obj.id); w.events.length = 0; });
  assert.ok(seen.has('laneExit'), 'left the shooter lane');
  assert.ok(seen.has('spinner'), 'came down the orbit through the spinner');
});

test('a soft plunge falls back onto the plunger', () => {
  const t = buildTable(), w = new World(t, NORMAL);
  const b = makeBall(503, t.plunger.y - BALL_R); w.balls.push(b);
  t.plunger.firing = true; t.plunger.fireSpeed = NORMAL.launchMin;
  run(w, 3000);
  assert.ok(b.x > PF_RIGHT && Math.abs(b.y - (t.plunger.y - BALL_R)) < 2, `ball at ${b.x}, ${b.y}`);
});

test('a medium plunge can drop into a top lane', () => {
  const lanes = new Set();
  // (The ball skids up the shooter lane, so these are 200 mm/s above the old range, like launchMin/launchMax.)
  for (let v = 1500; v <= 1900; v += 25) {
    const t = buildTable(), w = new World(t, NORMAL);
    w.balls.push(makeBall(503, t.plunger.y - BALL_R));
    t.plunger.firing = true; t.plunger.fireSpeed = v;
    run(w, 2500, () => { for (const e of w.events) if (e.obj.id === 'lane') lanes.add(e.obj.i); w.events.length = 0; });
  }
  assert.ok(lanes.size >= 2, `reached lanes ${[...lanes]}`);
});

test('a cradled ball rests on the raised flipper, and a ball rolling down a flipper can be shot up the table', () => {
  for (const side of [0, 1]) {
    const t = buildTable(), w = new World(t, NORMAL);
    const f = t.flippers[side];
    f.pressed = true; f.angle = f.up;
    const b = makeBall(side ? 286 : 200, 860); w.balls.push(b);
    run(w, 1500);
    const x0 = b.x; run(w, 300);
    assert.ok(Math.abs(b.x - x0) < 0.5, 'the ball settles');
    // Let it go and catch it at different moments as it rolls down the flipper. (A rolling ball speeds up at
    // 5/7 of g sin(slope), so it takes about 600 ms, not 300, to roll from the cradle to the tip.)
    let best = H;
    for (let wait = 60; wait <= 600; wait += 20) {
      const t2 = buildTable(), w2 = new World(t2, NORMAL), f2 = t2.flippers[side];
      f2.pressed = true; f2.angle = f2.up;
      const b2 = makeBall(side ? 286 : 200, 860); w2.balls.push(b2);
      run(w2, 1500);
      f2.pressed = false; run(w2, wait); f2.pressed = true;
      run(w2, 800, () => { best = Math.min(best, b2.y); });
    }
    assert.ok(best < 200, `the best shot only reached y=${best.toFixed(0)}`);
  }
});

test('the ball never leaves the table or sticks during a long demo', () => {
  seed(3);
  const g = new Game({ ...NORMAL });
  g.start('attract');
  let still = 0, worst = 0, last = null;
  for (let f = 0; f < 60 * 60 * 5; f++) {
    for (let i = 0; i < 17; i++) g.world.step();
    g.autopilot(); g.update(1 / 60);
    const b = g.world.balls[0];
    if (!b) continue;
    assert.ok(b.x > -1 && b.x < W + 1 && b.y > -1, `escaped at ${b.x}, ${b.y}`);
    if (g.state === 'live' && !b.held) {
      still = last && Math.hypot(b.x - last.x, b.y - last.y) < 0.3 ? still + 1 / 60 : 0;
      worst = Math.max(worst, still);
    }
    last = { x: b.x, y: b.y };
  }
  assert.ok(worst < 3, `ball sat still for ${worst.toFixed(1)}s`);
});

test('a ball nobody flips always drains: no bounce loops and nowhere to sit', () => {
  // Thrown in from all over the playfield at random speeds, and plunged at every strength.
  seed(9);
  const starts = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * 2500;
    starts.push({ x: 20 + Math.random() * 446, y: 150 + Math.random() * 700, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  for (let i = 0; i < 12; i++) starts.push({ plunge: NORMAL.launchMin + (NORMAL.launchMax - NORMAL.launchMin) * i / 11 });
  for (const s of starts) {
    const t = buildTable(), w = new World(t, NORMAL);
    const b = makeBall(s.plunge ? 503 : s.x, s.plunge ? t.plunger.y - BALL_R : s.y); w.balls.push(b);
    if (s.plunge) { t.plunger.firing = true; t.plunger.fireSpeed = s.plunge; }
    else {
      const x = b.x, y = b.y; w.collide(b);
      if (Math.hypot(b.x - x, b.y - y) > 0.01 || b.x > PF_RIGHT - 16) continue; // started inside something
      b.vx = s.vx; b.vy = s.vy;
    }
    let ms = 0;
    while (ms < 30000 && b.y < H + 30) { w.step(); w.events.length = 0; ms++; }
    if (s.plunge && b.x > PF_RIGHT && b.y > 900) continue; // too soft: it fell back onto the plunger
    assert.ok(ms < 30000, `still in play after 30 s, at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
  }
});

test('three balls, then game over; bonus is counted and multiplied', () => {
  seed(5);
  let over = false;
  const g = new Game({ ...NORMAL, ballSave: 0 }, { over: () => { over = true; } });
  g.start('play');
  g.lamps.bonus = 4; g.lamps.mult = 3;
  const before = g.score;
  // Drop the ball straight down the middle.
  g.world.balls[0].x = 243; g.world.balls[0].y = 900; g.state = 'live';
  for (let f = 0; f < 60 * 4; f++) { for (let i = 0; i < 17; i++) g.world.step(); g.update(1 / 60); }
  assert.equal(g.score - before, 4 * 3 * SCORES.bonusUnit);
  assert.equal(g.ballNo, 2);
  for (let n = 0; n < 2; n++) {
    g.world.balls[0].x = 243; g.world.balls[0].y = 900; g.state = 'live';
    for (let f = 0; f < 60 * 4; f++) { for (let i = 0; i < 17; i++) g.world.step(); g.update(1 / 60); }
  }
  assert.ok(over, 'the game ended after the third ball');
});

test('completing the top lanes raises the multiplier and lights the bumpers', () => {
  const g = new Game({ ...NORMAL });
  g.start('play');
  const lane = i => g.event({ type: 'enter', obj: g.table.lanes[i], ball: g.world.balls[0], speed: 500 });
  g.skillOn = false;
  lane(0); lane(1); lane(2);
  assert.equal(g.lamps.mult, 2);
  assert.ok(g.lamps.bumpersLit);
});

test('the drop target bank lights the extra ball, and the saucer collects it', () => {
  const g = new Game({ ...NORMAL });
  g.start('play');
  const b = g.world.balls[0];
  for (const d of g.table.drops) g.event({ type: 'hit', obj: d, ball: b, speed: 500 });
  assert.ok(g.lamps.extraBallLit);
  g.event({ type: 'enter', obj: g.table.saucer, ball: b, speed: 200 });
  assert.ok(g.lamps.shootAgain);
  assert.equal(g.extraBalls, 1);
});

test('three nudges in a row tilt the machine; the flippers go dead', () => {
  const g = new Game({ ...NORMAL });
  g.start('play');
  g.state = 'live';
  for (let i = 0; i < 6; i++) g.nudge(0, -300);
  assert.ok(g.tilted);
  g.flip('left', true);
  assert.equal(g.table.flippers[0].pressed, false);
});

test('a skill shot pays 25,000 only in the flashing lane', () => {
  const g = new Game({ ...NORMAL });
  g.start('play');
  const lane = g.lamps.skillLane;
  const before = g.score;
  g.event({ type: 'enter', obj: g.table.lanes[lane], ball: g.world.balls[0], speed: 500 });
  assert.equal(g.score - before, SCORES.skill + SCORES.lane);
});
