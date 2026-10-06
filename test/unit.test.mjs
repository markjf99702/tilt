// The physics and the rules, without a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBall, BALL_R, flipperEnds, closestOnSeg } from '../js/physics.js';
import { Game } from '../js/game.js';
import { TABLES } from '../js/tables.js';
import { buildTable, H } from '../js/tables/classic/layout.js';
import { Classic, SCORES } from '../js/tables/classic/rules.js';
import { buildTable as buildSpace, HAIRPIN } from '../js/tables/space/layout.js';
import { Space, SCORES as SPACE } from '../js/tables/space/rules.js';
import { buildTable as buildHaunted, MID as HMID } from '../js/tables/haunted/layout.js';
import { Haunted, SCORES as HAUNTED } from '../js/tables/haunted/rules.js';
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
      assert.ok((table.floors || [0]).includes(g.floor), `the screen is on floor ${g.floor}`);
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

test('a flipper only meets balls on its own level, and the demo only flips for those', () => {
  // A flipper on the playfield under the ramp: it catches a ball dropped on it, and one rolling down the ramp
  // above passes over it.
  const flipper = () => ({ side: 'left', x: 105, y: 330, len: 40, r0: 8, r1: 6, rest: 0, up: 0, angle: 0, omega: 0, pressed: false, e: 0.4 });
  const t = testTable(), w = new World(t, NORMAL), on = makeBall(125, 300), over = makeBall(125, 300);
  t.flippers.push(flipper());
  over.level = 1; w.balls.push(on, over);
  run(w, 400, () => { w.events.length = 0; });
  assert.ok(on.y < 330, `the ball on the playfield fell through the flipper, to y ${on.y.toFixed(0)}`);
  assert.ok(over.y > 400, `the ball on the ramp stopped at y ${over.y.toFixed(0)}`);
  for (const level of [1, 0]) {
    const g = new TestGame({ ...NORMAL });
    g.start('play');
    const f = flipper(), b = makeBall(130, 300);
    g.table.flippers.push(f);
    b.level = level; g.world.balls.push(b); g.state = 'live';
    g.autopilot();
    assert.equal(!!f.cool, level === 0, `the demo ${f.cool ? 'flipped' : "didn't flip"} for a ball on level ${level}`);
  }
});

// A table with a floor under it: the same box on both levels (a shooter lane down the right), with a wall across the
// lower one that the playfield doesn't have.
function twoFloors() {
  const walls = [], sensors = [];
  const seg = (ax, ay, bx, by, o = {}) => walls.push({ ax, ay, bx, by, r: 3, e: 0.3, ...o });
  for (const level of [0, 1]) { seg(0, 0, 300, 0, { level }); seg(0, 0, 0, 680, { level }); seg(260, 200, 260, 680, { level }); }
  seg(300, 0, 300, 680);
  seg(0, 400, 260, 400, { level: 1 });
  sensors.push({ kind: 'line', ax: 260, ay: 200, bx: 300, by: 200, len: 40, tx: 1, ty: 0, nx: 0, ny: 1, id: 'laneExit' });
  const plunger = { x0: 260, x1: 300, y: 620, travel: 46, pull: 0, pulling: false, firing: false, fireSpeed: 0, pullTime: 0.9 };
  return { W: 300, H: 680, walls, circles: [], sensors, flippers: [], plunger };
}
class TwoFloorGame extends Game { build() { return twoFloors(); } }

test('a floor under the playfield: a ball down there falls just as one up top does, and meets only its own walls', () => {
  const w = new World(twoFloors(), NORMAL), up = makeBall(130, 100), down = makeBall(130, 100);
  down.level = 1; w.balls.push(up, down);
  let parted = null; // where the two first went different ways
  run(w, 2000, () => { if (parted === null && (up.x !== down.x || up.y !== down.y)) parted = down.y; w.events.length = 0; });
  assert.ok(parted > 380, `they parted at y ${parted?.toFixed(0)}, above the wall`);
  assert.ok(up.y > 420, `the ball up top stopped at y ${up.y.toFixed(0)}`);
  assert.ok(down.y < 400, `the ball below went through its floor's wall, to y ${down.y.toFixed(0)}`);
});

test('each ball is served upstairs, so the screen goes back up there', () => {
  const g = new TwoFloorGame({ ...NORMAL, ballSave: 0 });
  g.start('play');
  assert.equal(g.floor, 0);
  const b = g.world.balls[0];
  b.level = 1; b.x = 130; b.y = 720; g.state = 'live'; g.floor = 1;
  for (let f = 0; f < 3 * 60; f++) { for (let i = 0; i < 13; i++) g.world.step(); g.update(1 / 60); }
  assert.equal(g.ballNo, 2);
  assert.equal(g.floor, 0);
  assert.equal(g.world.balls[0].level, 0);
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

test('two balls lost at once in the ball save both come back, the second once the shooter lane is clear', () => {
  const g = new TestGame({ ...NORMAL });
  g.start('play');
  g.world.balls[0].y = 720;
  g.world.balls.push(makeBall(200, 720));
  g.state = 'live'; g.saveUntil = g.time + g.wsecs(10);
  g.update(1 / 60);
  assert.equal(g.state, 'live');
  assert.equal(g.inPlay(), 1, 'one is plunged at once');
  assert.equal(g.launching, 1, 'and the other waits its turn');
  for (let f = 0; f < 60; f++) { for (let i = 0; i < 13; i++) g.world.step(); g.update(1 / 60); }
  assert.equal(g.inPlay(), 2);
  assert.equal(g.launching, 0);
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

// Space's own tests. A shot's window is how much of the flip timing makes it: world milliseconds, trying a flip
// every 5 ms with the flipper held up for 200.

// Flips flipper fi on Space's table t at the ball b, wherever it is. Returns what the ball crossed, rolled over and was
// kicked by, in order ('rampIn', 'orbit-1', 'inlane1', 'bumper'...), until the shot has made the ramp or the orbit or
// missed them both (the flip is over and the ball is on its way back down the playfield), or the ball has drained.
function spaceShot(t, b, fi) {
  const w = new World(t, NORMAL), f = t.flippers[fi];
  f.pressed = true; w.balls.push(b);
  const seen = [];
  for (let i = 0; i < 4000 && b.y < t.H + 30; i++) {
    if (i === 200) f.pressed = false;
    w.step();
    for (const e of w.events) {
      if (e.type === 'cross') seen.push(e.obj.id + (e.obj.id === 'orbit' ? e.dir : ''));
      else if (e.type === 'enter') seen.push(e.obj.id + (e.obj.side ?? ''));
      else if (e.type === 'kick') seen.push(e.obj.kind);
    }
    w.events.length = 0;
    if (madeRamp(seen) || seen.some(e => ['orbit1', 'orbit-1', 'rampBack', 'bumper', 'lane', 'dock'].includes(e))) break;
    if (i > 200 && !b.level && b.vy > 0 && b.y > 750 && !seen.includes('rampOut')) break;
  }
  Object.assign(f, { pressed: false, angle: f.rest, omega: 0 });
  return seen;
}
// Up the ramp, off the end of its wire and into the left inlane, in that order.
function madeRamp(seen) {
  const i = seen.indexOf('rampIn'), j = seen.indexOf('rampOut', i);
  return i >= 0 && j > i && seen.indexOf('inlane1', j) > j;
}
// A ball let go at (x, y) rolling down the table at vy, flipped at every timing from `from` to `to` ms. Until its flip
// every try is the same ball rolling down, so each one starts from where that ball had got to.
function sweep(x, y, vy, fi, from = 0, to = 1300) {
  const t = buildSpace(), w = new World(t, NORMAL), b = makeBall(x, y), shots = [];
  b.vy = b.wy = vy; w.balls.push(b);
  for (let ms = 0; ms <= to && b.y < t.H + 30; ms++) {
    if (ms >= from && ms % 5 === 0) shots.push(spaceShot(t, { ...b, inside: new Set(b.inside) }, fi));
    w.step(); w.events.length = 0;
  }
  return shots;
}
// How many milliseconds of flip timing make the shot.
const shotWindow = (shots, made) => shots.filter(made).length * 5;

test('Space: the left flipper makes the ramp, which brings the ball back to it; the right one makes the orbit', () => {
  for (const v of [300, 700]) {
    const ms = shotWindow(sweep(72, 790, v, 0), madeRamp);
    assert.ok(ms >= 40, `rolling down the left inlane at ${v} mm/s, the ramp's window is only ${ms} ms`);
  }
  let ramp = 0;
  for (const v of [300, 700]) {
    const shots = sweep(414, 790, v, 1);
    ramp += shotWindow(shots, madeRamp);
    const orbit = shotWindow(shots, s => s.includes('orbit-1'));
    assert.ok(orbit >= 25, `rolling down the right inlane at ${v} mm/s, the orbit's window is only ${orbit} ms`);
  }
  assert.ok(ramp > 0, 'the right flipper never makes the ramp');
});

test('Space: a ball coming off the ramp can be shot straight back up it', () => {
  const ms = shotWindow(sweep(71, 801, 1250, 0, 0, 1000), madeRamp);
  assert.ok(ms >= 40, `the window is only ${ms} ms`);
});

test('Space: a ramp shot too weak to reach the top rolls back out onto the left flipper', () => {
  const t = buildSpace(), w = new World(t, NORMAL), b = makeBall(210, 500);
  b.vy = b.wy = -1000; w.balls.push(b);
  const seen = [];
  let x900 = null;
  for (let i = 0; i < 4000 && x900 === null; i++) {
    const py = b.y;
    w.step();
    for (const e of w.events) if (e.type === 'cross') seen.push(e.obj.id);
    w.events.length = 0;
    if (py < 900 && b.y >= 900) x900 = b.x;
  }
  assert.deepEqual(seen, ['rampIn', 'rampBack']);
  assert.equal(b.level, 0);
  assert.ok(x900 > 150 && x900 < 219, `it came down at x ${x900?.toFixed(0)}, not on the left flipper`);
});

test('Space: the dock lifts a ball onto the ramp, which carries it to the left inlane', () => {
  for (const at of ['dock', 'lockSpot']) {
    const g = new Space({ ...NORMAL }), t = g.table, b = makeBall(t[at].x, t[at].y);
    g.world.balls.push(b);
    g.release(b);
    let ms = 0, inlane = false;
    while (!inlane && ms < 1500) {
      g.world.step(); ms++;
      inlane = g.world.events.some(e => e.obj.id === 'inlane' && e.obj.side === 1);
      g.world.events.length = 0;
    }
    assert.ok(inlane, `lifted from ${at === 'dock' ? 'the catch' : 'the lock'}, it wasn't in the left inlane after 1.5 s`);
  }
});

test('Space: nothing holds a ball still anywhere on the ramp', () => {
  // The incline, the hairpin (all but its very top, where a ball balanced exactly would stay) and the wire.
  const { x, y, r } = HAIRPIN, spots = [[211, 460], [212, 420], [213, 380], [214, 340], [71, 320], [71, 450], [71, 600], [71, 780]];
  for (let a = 0; a <= 180; a += 5) if (Math.abs(a - 90) > 2) spots.push([x + Math.cos(a * Math.PI / 180) * r, y - Math.sin(a * Math.PI / 180) * r]);
  for (const [bx, by] of spots) {
    const w = new World(buildSpace(), NORMAL), b = makeBall(bx, by);
    b.level = 1; w.balls.push(b);
    let ms = 0;
    while (b.level && ms < 4000) { w.step(); w.events.length = 0; ms++; }
    assert.equal(b.level, 0, `a ball let go at ${bx.toFixed(0)}, ${by.toFixed(0)} was still on the ramp after 4 s`);
  }
});

test('Space: a ball that drops onto the foot of the ramp from above rolls off it', () => {
  // Under the ramp's incline the funnel is closed off, and nothing sits on top of it.
  for (let x = 186; x <= 240; x += 3) {
    const w = new World(buildSpace(), NORMAL), b = makeBall(x, 340);
    w.balls.push(b);
    let ms = 0;
    while (b.y < 400 && ms < 2000) { w.step(); w.events.length = 0; ms++; }
    assert.ok(b.y >= 400, `a ball let go at ${x}, 340 was still up at ${b.x.toFixed(0)}, ${b.y.toFixed(0)} after 2 s`);
  }
});

test('Space: from a cradle, the upper flipper has a clear shot at the dock', () => {
  // The ball settles on the raised flipper; then it's let go and flipped again at every moment from there.
  const t0 = buildSpace(), w0 = new World(t0, NORMAL), cradled = makeBall(455, 470);
  t0.flippers[2].pressed = true; t0.flippers[2].angle = t0.flippers[2].up; w0.balls.push(cradled);
  run(w0, 1500, () => { w0.events.length = 0; });
  let ms = 0;
  for (let flip = 0; flip <= 800; flip += 5) {
    const t = buildSpace(), w = new World(t, NORMAL), f = t.flippers[2], b = { ...cradled, inside: new Set(cradled.inside) };
    f.angle = f.up; w.balls.push(b);
    let docked = false;
    for (let i = 0; i < 3000 && !docked && b.y < t.H + 30; i++) {
      if (i === flip) f.pressed = true;
      if (i === flip + 200) f.pressed = false;
      w.step();
      docked = w.events.some(e => e.obj.id === 'dock');
      w.events.length = 0;
    }
    if (docked) ms += 5;
  }
  assert.ok(ms >= 40, `the dock's window is only ${ms} ms`);
});

// The ball is resting on flipper f.
function cradled(f, b) {
  const { px, py, tx, ty } = flipperEnds(f), q = closestOnSeg(b.x, b.y, px, py, tx, ty);
  return Math.hypot(b.x - q.x, b.y - q.y) < BALL_R + f.r0 + (f.r1 - f.r0) * q.t + 0.5 && Math.hypot(b.vx, b.vy) < 5;
}

test('Space: held up, the upper flipper catches a ball coming down the feed lane', () => {
  for (const vy of [100, 400, 800]) for (const x of [446, 457, 469]) {
    const t = buildSpace(), w = new World(t, NORMAL), f = t.flippers[2], b = makeBall(x, 380);
    b.vy = b.wy = vy; f.pressed = true; w.balls.push(b);
    run(w, 3000, () => { w.events.length = 0; });
    assert.ok(cradled(f, b), `a ball down the feed lane at ${vy} mm/s from x ${x} ended up at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
  }
});

test('Space: two balls in the feed lane don\'t wedge each other at its foot', () => {
  // In multiball: one comes down against the guide onto another lower in the lane, with nobody flipping.
  for (const [ay, by] of [[360, 420], [400, 460], [440, 480]]) {
    const w = new World(buildSpace(), NORMAL), a = makeBall(446, ay), b = makeBall(470, by);
    a.vy = a.wy = 600; w.balls.push(a, b);
    run(w, 3000, () => { w.events.length = 0; });
    assert.ok(a.y > 560 && b.y > 560, `they stuck at ${a.x.toFixed(0)}, ${a.y.toFixed(0)} and ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
  }
});

test('Space: a soft launch comes down onto the upper flipper; a full one goes round the arch the other way from the orbit', () => {
  // The skill shot: launched softly with the right button held, the ball comes down the feed lane and stays on the
  // raised flipper.
  const launch = (pull, held) => {
    const t = buildSpace(), w = new World(t, NORMAL), p = t.plunger, f = t.flippers[2];
    const b = makeBall((p.x0 + p.x1) / 2, p.y - BALL_R); w.balls.push(b);
    p.pull = pull; p.firing = true; p.fireSpeed = NORMAL.launchMin + (NORMAL.launchMax - NORMAL.launchMin) * Math.pow(pull, 0.9);
    f.pressed = held;
    const orbit = [];
    run(w, 4000, () => {
      for (const e of w.events) if (e.obj.id === 'orbit') orbit.push(e.dir);
      w.events.length = 0;
    });
    return { cradled: cradled(f, b), orbit };
  };
  assert.ok(launch(0.25, true).cradled, 'a soft launch didn\'t end up on the upper flipper');
  const { orbit } = launch(1, false);
  assert.ok(orbit.length && orbit.every(d => d === 1), `a full launch crossed the orbit ${orbit}`);
});

test('Space: a ball coming down the wire passes over a ball on the playfield under it', () => {
  const play = both => {
    const w = new World(buildSpace(), NORMAL), under = makeBall(71, 560), over = makeBall(71, 420);
    over.level = 1; over.vy = over.wy = 1000;
    w.balls.push(under);
    if (both) w.balls.push(over);
    let closest = Infinity;
    run(w, 400, () => { closest = Math.min(closest, Math.hypot(over.x - under.x, over.y - under.y)); w.events.length = 0; });
    return { under, over, closest };
  };
  const both = play(true), alone = play(false);
  assert.ok(both.closest < BALL_R, 'the ball on the wire never passed over the other');
  assert.equal(both.over.level, 0, 'it came off the end of the wire');
  assert.deepEqual([both.under.x, both.under.y], [alone.under.x, alone.under.y], 'the ball on the playfield was knocked');
});

test('Space: balls glancing off the outside of the ramp\'s mouth are kept out of the right outlane', () => {
  // Thrown down to the left from under the pops, as the bumpers throw them, with nobody flipping.
  let glanced = 0, outlane = 0;
  for (const [x, y] of [[310, 300], [330, 330], [350, 320]]) for (let deg = 105; deg <= 150; deg += 3) for (const v of [600, 800, 1000]) {
    const w = new World(buildSpace(), NORMAL), b = makeBall(x, y);
    b.vx = b.wx = Math.cos(deg * Math.PI / 180) * v; b.vy = b.wy = Math.sin(deg * Math.PI / 180) * v;
    w.balls.push(b);
    let mouth = false, out = false;
    run(w, 4000, () => {
      for (const e of w.events) {
        if (e.type === 'hit' && e.obj.kind === 'ramp' && !b.level) mouth = true;
        if (e.type === 'enter' && e.obj.id === 'outlane' && e.obj.side === -1) out = true;
      }
      w.events.length = 0;
    });
    if (mouth) { glanced++; if (out) outlane++; }
  }
  assert.ok(glanced > 50 && outlane <= 2, `${outlane} of the ${glanced} balls off the ramp's mouth went down the right outlane`);
});

// Space's rules, fed the events the physics would send.
function spaceGame(settings = {}) {
  const g = new Space({ ...NORMAL, ...settings });
  g.start('play');
  g.state = 'live';
  return g;
}
const cross = (g, id, ball, dir = -1) => g.event({ type: 'cross', obj: g.table.sensors.find(s => s.id === id), ball, dir, speed: 1000 });
const rampShot = (g, ball) => { cross(g, 'rampIn', ball); cross(g, 'rampOut', ball, 1); };
const intoDock = (g, ball) => g.event({ type: 'enter', obj: g.table.dock, ball, speed: 600 });
// A ramp and the dock lock the first ball; another ramp and the dock start multiball with the second.
function startMultiball(g) {
  const first = g.world.balls[0];
  rampShot(g, first); intoDock(g, first);
  const second = g.world.balls.find(b => b !== first);
  g.state = 'live';
  rampShot(g, second); intoDock(g, second);
  return [first, second];
}
// Plays on for a few seconds of real time.
const playOn = (g, secs) => { for (let f = 0; f < secs * 60; f++) { for (let i = 0; i < 13; i++) g.world.step(); g.update(1 / 60); } };

test('Space: a ramp lights the lock, the dock locks the ball and serves another, and a second lock starts multiball', () => {
  const g = spaceGame(), l = g.lamps, first = g.world.balls[0], shown = [];
  g.out.show = text => shown.push(text);
  g.lamps.skill = false;
  const before = g.score;
  rampShot(g, first);
  assert.ok(l.lockLit, 'the lock is lit');
  assert.equal(shown.at(-1), 'Lock is lit');
  assert.equal(g.score - before, SPACE.ramp);
  intoDock(g, first);
  assert.ok(first.locked && first.held.until === Infinity, 'the ball is locked');
  assert.deepEqual([first.x, first.y], [g.table.lockSpot.x, g.table.lockSpot.y]);
  assert.equal(g.state, 'lane', 'another ball is served');
  assert.equal(g.inPlay(), 1);
  const second = g.world.balls.find(b => b !== first);
  g.state = 'live';
  rampShot(g, second);
  assert.equal(shown.at(-1), 'Multiball is lit', 'with a ball locked, the next lock starts multiball');
  intoDock(g, second);
  assert.ok(l.multiball && l.jackpotLit, 'multiball, with the jackpot lit');
  assert.ok(!first.locked && first.level === 1, 'the locked ball goes up onto the ramp');
  assert.equal(g.inPlay(), 2);
  assert.ok(Math.abs(g.saveUntil - (g.time + g.wsecs(10))) < 1e-9, 'ten seconds of ball save');
});

test('Space: in multiball the ramp scores the jackpot and the dock lights it again; it ends with one ball left after the ball save', () => {
  const g = spaceGame(), l = g.lamps, [first] = startMultiball(g);
  const before = g.score, jackpot = g.jackpot;
  assert.equal(jackpot, SPACE.jackpot + 2 * SPACE.jackpotStep, 'each ramp before multiball raised it');
  rampShot(g, first);
  assert.equal(g.score - before, SPACE.ramp + jackpot);
  assert.ok(!l.jackpotLit);
  intoDock(g, first);
  assert.ok(l.jackpotLit, 'the dock lights it again');
  // A ball lost in the ball save comes straight back.
  first.held = null; first.y = g.table.H + 100;
  g.update(1 / 60);
  assert.equal(g.inPlay(), 2);
  assert.ok(g.table.plunger.firing, 'the machine plunges another');
  // After it, losing one ends multiball and the jackpot goes back to where it started.
  g.saveUntil = 0;
  g.world.balls.find(b => !b.held).y = g.table.H + 100;
  g.update(1 / 60); g.update(1 / 60);
  assert.equal(g.inPlay(), 1);
  assert.equal(g.state, 'live');
  assert.ok(!l.multiball && !l.jackpotLit);
  assert.equal(g.jackpot, SPACE.jackpot);
});

test('Space: both balls lost at once in multiball\'s ball save come back, and multiball waits for the second', () => {
  const g = spaceGame(), [a, b] = startMultiball(g);
  a.held = b.held = null;
  a.y = b.y = g.table.H + 100;
  g.update(1 / 60);
  assert.equal(g.state, 'live');
  assert.ok(g.lamps.multiball);
  g.saveUntil = g.time; // the ball save runs out while the second ball waits for the shooter lane
  playOn(g, 1);
  assert.equal(g.inPlay(), 2);
  assert.ok(g.lamps.multiball, 'multiball ended with a ball still to come');
});

test('Space: a locked ball stays locked when the ball in play drains', () => {
  const g = spaceGame({ ballSave: 0 }), first = g.world.balls[0];
  rampShot(g, first); intoDock(g, first);
  const second = g.world.balls.find(b => b !== first);
  g.state = 'live'; second.x = 243; second.y = 1100;
  playOn(g, 5);
  assert.equal(g.ballNo, 2);
  assert.equal(g.state, 'lane');
  assert.ok(g.world.balls.includes(first) && first.locked, 'the locked ball is still there');
});

test('Space: a ball the dock lifts onto the ramp is not a ramp shot', () => {
  const g = spaceGame(), b = g.world.balls[0];
  intoDock(g, b);
  let off = false;
  for (let f = 0; f < 3 * 60 && !off; f++) {
    for (let i = 0; i < 13; i++) g.world.step();
    g.update(1 / 60);
    off = !b.level && b.y > 800;
  }
  assert.ok(off, 'the ball came down the wire');
  assert.equal(g.stats.ramps, 0);
  assert.equal(g.counts.ramps, 0);
});

test('Space: the skill shot pays only before anything else scores', () => {
  let g = spaceGame(), before = g.score;
  intoDock(g, g.world.balls[0]);
  assert.equal(g.score - before, SPACE.skill + SPACE.dock);
  g = spaceGame();
  g.event({ type: 'kick', obj: g.table.bumpers[0], ball: g.world.balls[0] });
  before = g.score;
  intoDock(g, g.world.balls[0]);
  assert.equal(g.score - before, SPACE.dock);
});

test('Space: eight ramps light the extra ball, and the orbit collects it', () => {
  const g = spaceGame(), b = g.world.balls[0];
  for (let i = 0; i < 8; i++) rampShot(g, b);
  assert.ok(g.lamps.extraBallLit);
  cross(g, 'orbit', b, 1); // a plunge, going round the other way
  assert.ok(g.lamps.extraBallLit);
  cross(g, 'orbit', b, -1);
  assert.ok(g.lamps.shootAgain && !g.lamps.extraBallLit);
  assert.equal(g.extraBalls, 1);
});

test('Space: a ramp made as the eight planets go out lights the first of the next eight', () => {
  const g = spaceGame(), b = g.world.balls[0];
  for (let i = 0; i < 9; i++) rampShot(g, b);
  playOn(g, 1.5);
  assert.equal(g.lamps.planets, 1);
});

test('Space: the bonus counts the ramps and orbits of the ball, times the multiplier', () => {
  const g = spaceGame({ ballSave: 0 }), b = g.world.balls[0];
  g.counts = { ramps: 3, orbits: 2 }; g.lamps.mult = 3;
  const before = g.score;
  b.x = 243; b.y = 1100;
  playOn(g, 5);
  assert.equal(g.score - before, (3 * SPACE.bonusRamp + 2 * SPACE.bonusOrbit) * 3);
  assert.equal(g.ballNo, 2);
});

test('Space: a tilt ends the ball with no bonus: in multiball no ball comes back, and a locked ball stays locked', () => {
  let g = spaceGame({ ballSave: 0 });
  const [a, b] = startMultiball(g);
  g.counts.ramps = 4;
  g.tilt();
  const before = g.score;
  a.held = b.held = null;
  a.y = g.table.H + 100;
  g.update(1 / 60);
  assert.equal(g.inPlay(), 1, 'a ball lost in the ball save after a tilt is not given back');
  b.y = g.table.H + 100;
  playOn(g, 5);
  assert.equal(g.score, before);
  assert.equal(g.ballNo, 2);
  assert.ok(!g.lamps.multiball);
  g = spaceGame({ ballSave: 0 });
  const first = g.world.balls[0];
  rampShot(g, first); intoDock(g, first);
  const second = g.world.balls.find(x => x !== first);
  g.state = 'live'; g.counts.ramps = 4;
  g.tilt();
  const score = g.score;
  second.y = g.table.H + 100;
  playOn(g, 5);
  assert.equal(g.score, score);
  assert.equal(g.ballNo, 2);
  assert.ok(g.world.balls.includes(first) && first.locked, 'the locked ball is still there');
});

// ---------- Haunted House ----------

// A game of Haunted House in play, its ball held still in the middle of the house's playfield.
function hauntedGame(settings = {}) {
  const g = new Haunted({ ...NORMAL, ...settings });
  g.start('play');
  const b = g.world.balls[0];
  g.event({ type: 'cross', obj: g.table.laneExit, ball: b, dir: -1, speed: 1000 });
  Object.assign(b, { x: HMID, y: 600, held: { until: Infinity } });
  return [g, b];
}
const glow = (g, i) => { g.ghosts[i].lit = true; g.ghosts[i].until = Infinity; };
const hitGhost = (g, i, ball) => g.event({ type: 'hit', obj: g.table.ghosts[i], ball, speed: 500 });
const enter = (g, obj, ball) => g.event({ type: 'enter', obj, ball, speed: 500 });

// What a shot on Haunted House makes first: the trapdoor, the door, a ghost, the stairs, a lid (or nothing, 'miss').
function hauntedShot(t, b, fi, ms = 2500) {
  const w = new World(t, NORMAL), f = t.flippers[fi];
  f.pressed = true; w.balls.push(b);
  for (let i = 0; i < ms && b.y < t.H + 30; i++) {
    if (i === 200) f.pressed = false;
    w.step();
    for (const e of w.events) {
      if (e.type === 'enter' && ['trapdoor', 'stairs', 'lane', 'outlane'].includes(e.obj.id)) return e.obj.id;
      if (e.type === 'hit' && e.obj.kind === 'lid') return 'lid';
      if ((e.type === 'hit' || e.type === 'kick') && ['ghost', 'door', 'bumper', 'coffin'].includes(e.obj.kind) && e.speed > 80) return e.obj.kind;
    }
    w.events.length = 0;
    if (i > 200 && b.vy > 0 && b.y > 750) return 'miss';
  }
  return 'miss';
}
// A ball settled on raised flipper fi, let go and flipped again at every moment up to 800 ms later: how many
// milliseconds of that timing make `want` first. open: the front door is open.
function hauntedCradle(fi, want, open = false) {
  const build = () => { const t = buildHaunted(); t.door.off = open; return t; };
  const t0 = build(), w0 = new World(t0, NORMAL), f0 = t0.flippers[fi], b0 = makeBall(f0.side === 'left' ? 200 : 286, 860);
  b0.level = f0.level; f0.pressed = true; f0.angle = f0.up; w0.balls.push(b0);
  run(w0, 1500, () => { w0.events.length = 0; });
  let ms = 0;
  for (let flip = 0; flip <= 800; flip += 5) {
    const t = build(), w = new World(t, NORMAL), f = t.flippers[fi], b = { ...b0, inside: new Set() };
    f.angle = f.up; w.balls.push(b);
    run(w, flip, () => { w.events.length = 0; });
    if (hauntedShot(t, b, fi) === want) ms += 5;
  }
  return ms;
}

test('Haunted: the ghosts glow some of the time, never more than two at once, and not while the ball is downstairs', () => {
  seed(5);
  const [g, b] = hauntedGame(), lit = [0, 0, 0, 0];
  let frames = 0, most = 0;
  for (let f = 0; f < 120 * 60; f++) {
    for (let i = 0; i < 13; i++) g.world.step();
    g.update(1 / 60);
    frames++;
    g.ghosts.forEach((x, i) => { if (x.lit) lit[i]++; });
    most = Math.max(most, g.ghosts.filter(x => x.lit).length);
  }
  for (const n of lit) assert.ok(n / frames > 0.25 && n / frames < 0.55, `a ghost glowed ${(100 * n / frames).toFixed(0)}% of the time`);
  assert.equal(most, 2);
  g.lamps.doorOpen = true; b.held = null;
  enter(g, g.table.trapdoor, b);
  playOn(g, 0.6);
  assert.equal(g.floor, 1);
  b.held = { until: Infinity };
  for (let f = 0; f < 10 * 60; f++) { for (let i = 0; i < 13; i++) g.world.step(); g.update(1 / 60); assert.ok(g.ghosts.every(x => !x.lit)); }
});

test('Haunted: two ghosts caught open the front door, then three, then four; a dark ghost catches nothing', () => {
  const [g, b] = hauntedGame(), l = g.lamps;
  let score = g.score;
  hitGhost(g, 0, b);
  assert.equal(g.score - score, HAUNTED.ghostDark);
  assert.equal(l.caught, 0);
  const paid = [];
  for (const need of [2, 3, 4, 4]) {
    for (let k = 0; k < need; k++) {
      assert.ok(!l.doorOpen, `the door opened after ${k} of ${need}`);
      glow(g, k); score = g.score; hitGhost(g, k, b); paid.push(g.score - score);
    }
    assert.ok(l.doorOpen);
    g.update(0);
    assert.ok(g.table.door.off, 'the door is open but still in the way');
    b.held = null;
    enter(g, g.table.trapdoor, b);
    assert.ok(!l.doorOpen && b.held, 'the trapdoor did not take the ball');
  }
  // Each ghost caught on a ball is worth 5,000 more than the last, up to 25,000.
  assert.deepEqual(paid.slice(0, 6), [5000, 10000, 15000, 20000, 25000, 25000]);
});

test('Haunted: a hard shot at the shut door knocks on it and wakes a ghost; a soft one does nothing', () => {
  const [g, b] = hauntedGame();
  const door = speed => g.event({ type: 'hit', obj: g.table.door, ball: b, speed });
  let score = g.score;
  door(100);
  assert.equal(g.score, score);
  assert.ok(g.ghosts.every(x => !x.lit));
  door(400);
  assert.equal(g.score - score, HAUNTED.knock);
  assert.equal(g.ghosts.filter(x => x.lit).length, 1);
});

test('Haunted: from a cradle, each flipper can shoot through the open door, or knock on it while it is shut', () => {
  for (const fi of [0, 1]) {
    const trap = hauntedCradle(fi, 'trapdoor', true), knock = hauntedCradle(fi, 'door');
    assert.ok(trap >= 30, `the trapdoor's window from the ${['left', 'right'][fi]} flipper is only ${trap} ms`);
    assert.ok(knock >= 60, `the door's window from the ${['left', 'right'][fi]} flipper is only ${knock} ms`);
  }
});

test('Haunted: the trapdoor takes the ball only while the door is open, down the chute to the left flipper', () => {
  for (const flip of [true, false]) {
    const [g, b] = hauntedGame();
    b.held = null;
    enter(g, g.table.trapdoor, b);
    assert.ok(!b.held, 'the shut door let the ball through');
    g.lamps.doorOpen = true;
    enter(g, g.table.trapdoor, b);
    assert.ok(b.held);
    playOn(g, 0.6);
    assert.equal(g.floor, 1);
    assert.equal(b.level, 1);
    if (flip) {
      g.flip('left', true);
      playOn(g, 6);
      assert.ok(cradled(g.table.flippers[2], b), `the ball came down the chute to ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
    } else {
      let secs = 0;
      while (g.ballNo === 1 && g.state === 'live' && secs < 10) { playOn(g, 0.1); secs += 0.1; }
      assert.ok(secs < 6, `an unflipped ball from the chute was still in play after ${secs.toFixed(1)} s`);
    }
  }
});

test('Haunted: in the basement, the left flipper has a shot at the stairs and both have shots at the coffin lid', () => {
  const stairs = hauntedCradle(2, 'stairs');
  assert.ok(stairs >= 60, `the stairs' window is only ${stairs} ms`);
  for (const fi of [2, 3]) {
    const lid = hauntedCradle(fi, 'lid');
    assert.ok(lid >= 80, `the lid's window from the ${['left', 'right'][fi - 2]} flipper is only ${lid} ms`);
  }
});

test('Haunted: the stairs bring the ball back up, out of the cellar door to the right flipper, and the ghosts wake', () => {
  for (const flip of [true, false]) {
    const [g, b] = hauntedGame();
    g.lamps.doorOpen = true; b.held = null;
    enter(g, g.table.trapdoor, b);
    playOn(g, 0.6);
    b.held = null;
    enter(g, g.table.stairs, b);
    playOn(g, 0.6);
    assert.equal(g.floor, 0);
    assert.equal(b.level, 0);
    if (flip) {
      g.flip('right', true);
      playOn(g, 4);
      assert.ok(cradled(g.table.flippers[1], b), `the ball came out of the cellar to ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
      assert.ok(g.ghosts.some(x => x.lit) || g.ghosts.some(x => x.until < g.time + g.wsecs(1)), 'the ghosts stayed asleep');
    } else {
      let secs = 0;
      while (g.ballNo === 1 && g.state === 'live' && secs < 10) { playOn(g, 0.1); secs += 0.1; }
      assert.ok(secs < 4, `an unflipped ball from the cellar was still in play after ${secs.toFixed(1)} s`);
    }
  }
});

test('Haunted: the coffin lid lights an extra ball at the stairs once a game; after that it is worth 50,000', () => {
  const [g, b] = hauntedGame(), l = g.lamps;
  const lids = () => { for (const d of g.table.lids) g.event({ type: 'hit', obj: d, ball: b, speed: 500 }); };
  lids();
  assert.ok(l.extraBallLit);
  playOn(g, 1.5);
  assert.ok(g.table.lids.every(d => !d.off), 'the lid did not come back');
  let score = g.score;
  lids();
  assert.equal(g.score - score, 3 * HAUNTED.lid + HAUNTED.coffin, 'a lit extra ball is not lit again');
  b.held = null;
  enter(g, g.table.stairs, b);
  assert.ok(!l.extraBallLit && l.shootAgain && g.extraBalls === 1);
  playOn(g, 1.5);
  score = g.score;
  lids();
  assert.ok(!l.extraBallLit);
  assert.equal(g.score - score, 3 * HAUNTED.lid + HAUNTED.coffin);
});

test('Haunted: a ball nobody flips in the basement always drains', () => {
  seed(9);
  for (let n = 0; n < 150; n++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * 2500;
    const t = buildHaunted(), w = new World(t, NORMAL), b = makeBall(50 + Math.random() * 386, 450 + Math.random() * 410);
    b.level = 1; w.balls.push(b);
    const x = b.x, y = b.y; w.collide(b);
    if (Math.hypot(b.x - x, b.y - y) > 0.01) continue; // started inside something
    b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
    let ms = 0;
    while (ms < 30000 && b.y < t.H + 30) { w.step(); w.events.length = 0; ms++; }
    assert.ok(ms < 30000, `still in the basement after 30 s, at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
  }
});

test('Haunted: the ball save lasts until the ball first comes down to the flippers', () => {
  const [g, b] = hauntedGame();
  playOn(g, 10);
  assert.ok(g.lamps.ballSave, 'the ball save ran out before the ball came down');
  Object.assign(b, { held: null, x: 25, y: 800, vx: 0, vy: 300 });
  playOn(g, 2);
  assert.equal(g.ballNo, 1);
  assert.equal(g.state, 'lane', 'a ball down the outlane before it reached the flippers was not given back');
  const c = g.world.balls[0];
  g.event({ type: 'cross', obj: g.table.laneExit, ball: c, dir: -1, speed: 1000 });
  Object.assign(c, { x: HMID, y: 900, vx: 0, vy: 0 });
  playOn(g, 0.1);
  Object.assign(c, { x: HMID, y: 600, held: { until: Infinity } });
  playOn(g, 6);
  assert.ok(!g.lamps.ballSave, 'the ball save went on after the ball had reached the flippers');
});

test('Haunted: the bonus counts the ghosts and trips of the ball, times the multiplier', () => {
  const [g, b] = hauntedGame({ ballSave: 0 });
  g.counts = { ghosts: 3, trips: 1 }; g.lamps.mult = 2;
  const score = g.score;
  Object.assign(b, { held: null, y: g.table.H + 40 });
  playOn(g, 5);
  assert.equal(g.ballNo, 2);
  assert.equal(g.score - score, (3 * HAUNTED.bonusGhost + HAUNTED.bonusTrip) * 2);
});

test('Haunted: a tilt in the basement ends the ball with no bonus, and the next ball is served upstairs', () => {
  const [g, b] = hauntedGame();
  g.lamps.doorOpen = true; b.held = null;
  enter(g, g.table.trapdoor, b);
  playOn(g, 0.6);
  for (let i = 0; i < 6; i++) g.nudge(0, -300);
  assert.ok(g.tilted);
  const score = g.score;
  Object.assign(b, { held: null, y: g.table.H + 40 });
  playOn(g, 4);
  assert.equal(g.ballNo, 2);
  assert.equal(g.floor, 0);
  assert.equal(g.score, score);
});
