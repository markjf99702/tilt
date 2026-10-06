// The physics and the rules, without a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBall, BALL_R } from '../js/physics.js';
import { Game } from '../js/game.js';
import { TABLES } from '../js/tables.js';
import { buildTable, H } from '../js/tables/classic/layout.js';
import { Classic, SCORES } from '../js/tables/classic/rules.js';
import { NORMAL } from '../js/settings.js';

const run = (w, ms, each) => { for (let i = 0; i < ms; i++) { w.step(); each?.(i); } };

// Seeded Math.random, so the long runs are the same every time.
function seed(n) {
  let a = n;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// The checks every table gets.
for (const table of Object.values(TABLES)) {
  // A new ball on the plunger, where the game serves it.
  const onPlunger = t => makeBall((t.plunger.x0 + t.plunger.x1) / 2, t.plunger.y - BALL_R);

  test(`${table.name}: a soft plunge falls back onto the plunger`, () => {
    const t = table.build(), w = new World(t, NORMAL);
    const b = onPlunger(t); w.balls.push(b);
    t.plunger.firing = true; t.plunger.fireSpeed = NORMAL.launchMin;
    run(w, 3000);
    assert.ok(b.x > t.plunger.x0 && Math.abs(b.y - (t.plunger.y - BALL_R)) < 2, `ball at ${b.x}, ${b.y}`);
  });

  test(`${table.name}: no ball ever leaves the table or sticks during a long demo`, () => {
    seed(3);
    const g = new table.Game({ ...NORMAL });
    g.start('attract');
    const still = new Map(), last = new Map(); // each ball's seconds sitting still, and where it was last frame
    let worst = 0;
    for (let f = 0; f < 60 * 60 * 5; f++) {
      for (let i = 0; i < 17; i++) g.world.step();
      g.autopilot(); g.update(1 / 60);
      for (const b of g.world.balls) {
        assert.ok(b.x > -1 && b.x < g.table.W + 1 && b.y > -1, `escaped at ${b.x}, ${b.y}`);
        if (g.state === 'live' && !b.held) {
          const l = last.get(b), s = l && Math.hypot(b.x - l.x, b.y - l.y) < 0.3 ? (still.get(b) || 0) + 1 / 60 : 0;
          still.set(b, s);
          worst = Math.max(worst, s);
        }
        last.set(b, { x: b.x, y: b.y });
      }
    }
    assert.ok(worst < 3, `a ball sat still for ${worst.toFixed(1)}s`);
  });

  test(`${table.name}: a ball nobody flips always drains: no bounce loops and nowhere to sit`, () => {
    // Thrown in from all over the playfield at random speeds, and plunged at every strength.
    seed(9);
    const area = table.checks.area, starts = [];
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * 2500;
      starts.push({ x: area.x + Math.random() * area.w, y: area.y + Math.random() * area.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
    for (let i = 0; i < 12; i++) starts.push({ plunge: NORMAL.launchMin + (NORMAL.launchMax - NORMAL.launchMin) * i / 11 });
    for (const s of starts) {
      const t = table.build(), w = new World(t, NORMAL), p = t.plunger;
      const b = s.plunge ? onPlunger(t) : makeBall(s.x, s.y); w.balls.push(b);
      if (s.plunge) { p.firing = true; p.fireSpeed = s.plunge; }
      else {
        const x = b.x, y = b.y; w.collide(b);
        if (Math.hypot(b.x - x, b.y - y) > 0.01 || b.x > p.x0 - 16) continue; // started inside something
        b.vx = s.vx; b.vy = s.vy;
      }
      let ms = 0;
      while (ms < 30000 && b.y < t.H + 30) { w.step(); w.events.length = 0; ms++; }
      if (s.plunge && b.x > p.x0 && b.y > p.y - 100) continue; // too soft: it fell back onto the plunger
      assert.ok(ms < 30000, `still in play after 30 s, at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
    }
  });

  test(`${table.name}: three nudges in a row tilt the machine; the flippers go dead`, () => {
    const g = new table.Game({ ...NORMAL });
    g.start('play');
    g.state = 'live';
    for (let i = 0; i < 6; i++) g.nudge(0, -300);
    assert.ok(g.tilted);
    g.flip('left', true); g.flip('right', true);
    assert.ok(g.table.flippers.every(f => !f.pressed));
  });
}

// The machine's own parts, on a small test table: a box with a shooter lane down the right, and a ramp straight up
// the middle that climbs 60 mm, over a short wall on the playfield. A lift line at the ramp's foot takes a ball
// going up the table onto it (level 1), and lets it back down when it rolls out the way it came.
function testTable() {
  const walls = [], sensors = [];
  const seg = (ax, ay, bx, by, o = {}) => { const w = { ax, ay, bx, by, r: 3, e: 0.3, ...o }; walls.push(w); return w; };
  const line = (ax, ay, bx, by, o) => {
    const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
    sensors.push({ kind: 'line', ax, ay, bx, by, len, tx, ty, nx: -ty, ny: tx, ...o });
  };
  seg(0, 0, 300, 0); seg(0, 0, 0, 680); seg(300, 0, 300, 680);
  seg(260, 200, 260, 680);
  line(260, 200, 300, 200, { id: 'laneExit' });
  const plunger = { x0: 260, x1: 300, y: 620, travel: 46, pull: 0, pulling: false, firing: false, fireSpeed: 0, pullTime: 0.9 };
  seg(100, 400, 100, 100, { level: 1 }); seg(150, 400, 150, 100, { level: 1 }); seg(100, 100, 150, 100, { level: 1 });
  seg(105, 250, 145, 250);
  line(100, 400, 150, 400, { id: 'up', to: 1, dir: -1 });
  line(100, 400, 150, 400, { id: 'down', level: 1, to: 0, dir: 1 });
  const ramps = [{ level: 1, path: [[125, 400, 0], [125, 100, 60]], drag: 400 }];
  return { W: 300, H: 680, walls, circles: [], sensors, flippers: [], plunger, ramps };
}
class TestGame extends Game { build() { return testTable(); } }

test('a ramp carries a ball over a wall on the playfield, and lets it back down', () => {
  // On the playfield, the wall stops it.
  let w = new World(testTable(), NORMAL), b = makeBall(125, 330);
  b.vy = b.wy = -900; w.balls.push(b);
  let top = Infinity;
  run(w, 600, () => { top = Math.min(top, b.y); w.events.length = 0; });
  assert.ok(top > 250, `the ball went through the wall, up to y ${top.toFixed(0)}`);
  // Up the ramp, it passes over the wall, then rolls back down and off.
  w = new World(testTable(), NORMAL); b = makeBall(125, 470);
  b.vy = b.wy = -1500; w.balls.push(b);
  const levels = [0];
  top = Infinity;
  run(w, 3000, () => { top = Math.min(top, b.y); if (b.level !== levels.at(-1)) levels.push(b.level); w.events.length = 0; });
  assert.ok(top < 230, `it only got up to y ${top.toFixed(0)}`);
  assert.deepEqual(levels, [0, 1, 0]);
  assert.ok(b.y > 400 && b.z === 0, `it ended at y ${b.y.toFixed(0)}, ${b.z} mm up`);
});

test('nothing holds a ball still on a ramp', () => {
  for (const y of [120, 200, 300, 380]) {
    const w = new World(testTable(), NORMAL), b = makeBall(125, y);
    b.level = 1; w.balls.push(b);
    let ms = 0;
    while (b.level && ms < 3000) { w.step(); w.events.length = 0; ms++; }
    assert.equal(b.level, 0, `a ball let go at y ${y} was still on the ramp after 3 s`);
  }
});

test('balls on different levels pass through each other', () => {
  const w = new World(testTable(), NORMAL), a = makeBall(125, 300), b = makeBall(130, 300);
  b.level = 1; w.balls.push(a, b);
  w.step();
  assert.ok(Math.abs(a.x - 125) < 0.01 && Math.abs(b.x - 130) < 0.01, 'they pushed each other apart');
});

test('a locked ball is not in play: the ball ends when the last one in play drains', () => {
  const g = new TestGame({ ...NORMAL, ballSave: 0 });
  g.start('play');
  const locked = g.world.balls[0];
  locked.x = 50; locked.y = 50; locked.held = { until: Infinity }; locked.locked = true;
  g.world.balls.push(makeBall(125, 720)); // already past the bottom of the table
  g.state = 'live';
  g.update(1 / 60);
  assert.equal(g.state, 'bonus');
  assert.ok(g.world.balls.includes(locked), 'the locked ball stays');
});

test('in multiball a ball lost in the ball save comes straight back, and after it the other plays on', () => {
  const g = new TestGame({ ...NORMAL });
  g.start('play');
  const a = g.world.balls[0];
  a.x = 60; a.y = 500;
  g.world.balls.push(makeBall(200, 720));
  g.state = 'live'; g.saveUntil = g.time + g.wsecs(10);
  g.update(1 / 60);
  assert.equal(g.inPlay(), 2, 'another ball is plunged');
  assert.ok(g.table.plunger.firing);
  for (let i = 0; i < 400; i++) g.world.step();
  const c = g.world.balls.find(b => b !== a);
  assert.ok(c.y < 200, `the new ball only got up to y ${c.y.toFixed(0)}`);
  // Out of the ball save, losing one leaves the other in play.
  g.saveUntil = 0; c.y = 720;
  g.update(1 / 60);
  assert.equal(g.inPlay(), 1);
  assert.equal(g.state, 'live');
});

// Classic's own tests.
test('a full plunge goes round the arch and down the left orbit through the spinner', () => {
  const t = buildTable(), w = new World(t, NORMAL);
  const b = makeBall(503, t.plunger.y - BALL_R); w.balls.push(b);
  t.plunger.firing = true; t.plunger.fireSpeed = NORMAL.launchMax;
  const seen = new Set();
  run(w, 3000, () => { for (const e of w.events) seen.add(e.obj.id); w.events.length = 0; });
  assert.ok(seen.has('laneExit'), 'left the shooter lane');
  assert.ok(seen.has('spinner'), 'came down the orbit through the spinner');
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

test('three balls, then game over; bonus is counted and multiplied', () => {
  seed(5);
  let over = false;
  const g = new Classic({ ...NORMAL, ballSave: 0 }, { over: () => { over = true; } });
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
  const g = new Classic({ ...NORMAL });
  g.start('play');
  const lane = i => g.event({ type: 'enter', obj: g.table.lanes[i], ball: g.world.balls[0], speed: 500 });
  g.skillOn = false;
  lane(0); lane(1); lane(2);
  assert.equal(g.lamps.mult, 2);
  assert.ok(g.lamps.bumpersLit);
});

test('the drop target bank lights the extra ball, and the saucer collects it', () => {
  const g = new Classic({ ...NORMAL });
  g.start('play');
  const b = g.world.balls[0];
  for (const d of g.table.drops) g.event({ type: 'hit', obj: d, ball: b, speed: 500 });
  assert.ok(g.lamps.extraBallLit);
  g.event({ type: 'enter', obj: g.table.saucer, ball: b, speed: 200 });
  assert.ok(g.lamps.shootAgain);
  assert.equal(g.extraBalls, 1);
});

test('a skill shot pays 25,000 only in the flashing lane', () => {
  const g = new Classic({ ...NORMAL });
  g.start('play');
  const lane = g.lamps.skillLane;
  const before = g.score;
  g.event({ type: 'enter', obj: g.table.lanes[lane], ball: g.world.balls[0], speed: 500 });
  assert.equal(g.score - before, SCORES.skill + SCORES.lane);
});
