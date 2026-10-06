// Plays many seeded games with the demo autopilot and reports how balls drain and how fast they move,
// so a change to a table or the physics can be judged by numbers as well as by feel.
//   node tools/tune.mjs [games=60] [table=classic]
// The autopilot flips whenever the ball comes down to a flipper, a little late at random, like a fair player.
// Drains are told apart by the table's 'outlane' and 'inlane' rollovers (side 1 is the left). It follows every
// ball: in multiball each ball lost counts as a drain, and the ball's time runs until the last ball in play has
// gone. A table can add its own counts (checks.stats(game)), printed per game.
import { TABLES } from '../js/tables.js';
import { NORMAL } from '../js/settings.js';

const GAMES = Number(process.argv[2]) || 60;
const name = process.argv[3] || 'classic', table = Object.hasOwn(TABLES, name) ? TABLES[name] : null;
if (!table) { console.error(`No table "${name}". Tables: ${Object.keys(TABLES).join(', ')}`); process.exit(1); }
const FRAME = 1 / 60;

function seed(n) {
  let a = n;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const drains = { leftOutlane: 0, rightOutlane: 0, center: 0 };
let timeouts = 0; // balls still alive after two minutes: taken off the table and not counted as drains. The autopilot
                  // never tires, so these are mostly long rallies; the unit tests check that an unflipped ball always drains.
const speeds = [], ballTimes = [];
let liveSecs = 0, score = 0, sideWallSecs = 0;
const extra = {}; // the table's own counts, summed over the games

for (let gi = 0; gi < GAMES; gi++) {
  seed(1000 + gi);
  let over = false;
  const g = new table.Game({ ...NORMAL, ballSave: 0 }, { over: () => { over = true; } });
  g.start('play');
  const scale = g.settings.timeScale ?? 1;
  const lastOutlane = new Map(); // ball -> the outlane it last rolled through
  let ballStart = null;
  for (let f = 0; f < 60 * 60 * 20 && !over; f++) {
    const steps = Math.round(17 * scale);
    for (let i = 0; i < steps; i++) g.world.step();
    for (const e of g.world.events) {
      if (e.type === 'enter' && e.obj.id === 'outlane') lastOutlane.set(e.ball, e.obj.side === 1 ? 'leftOutlane' : 'rightOutlane');
      if (e.type === 'enter' && e.obj.id === 'inlane') lastOutlane.delete(e.ball);
      if (e.type === 'kick' || (e.type === 'hit' && e.obj.kind !== 'rail')) { if (e.ball.y < table.checks.outlaneTop) lastOutlane.delete(e.ball); }
    }
    if (ballStart != null && g.state === 'live' && g.time - ballStart > 120 * scale) {
      timeouts++;
      g.world.balls = g.world.balls.filter(b => b.locked); g.drained(); ballStart = null; lastOutlane.clear();
      continue;
    }
    const before = g.world.balls.filter(b => !b.locked), wasLive = g.state === 'live';
    g.autopilot();
    g.update(FRAME);
    if (wasLive) {
      for (const b of before) if (!g.world.balls.includes(b)) { drains[lastOutlane.get(b) || 'center']++; lastOutlane.delete(b); }
      if (before.length && !g.world.balls.some(b => !b.locked)) {
        if (ballStart != null) ballTimes.push((g.time - ballStart) / scale);
        ballStart = null;
      }
    }
    if (g.state === 'live' && ballStart == null) ballStart = g.time;
    const moving = g.world.balls.filter(b => !b.held);
    if (moving.length && g.state === 'live') {
      liveSecs += FRAME;
      for (const b of moving) {
        // Speed as the player sees it: table millimetres per second of real time.
        speeds.push(Math.hypot(b.vx, b.vy) * scale);
        if (table.checks.sideWall(b)) sideWallSecs += FRAME / moving.length;
      }
    }
  }
  score += g.score;
  for (const [k, v] of Object.entries(table.checks.stats?.(g) ?? {})) extra[k] = (extra[k] || 0) + v;
}

speeds.sort((a, b) => a - b);
const q = p => Math.round(speeds[Math.floor(speeds.length * p)]);
const total = drains.leftOutlane + drains.rightOutlane + drains.center;
const out = drains.leftOutlane + drains.rightOutlane;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const result = {
  games: GAMES,
  drains: total,
  timeouts,
  outlaneShare: +(out / total).toFixed(3),
  leftOutlane: drains.leftOutlane, rightOutlane: drains.rightOutlane, center: drains.center,
  outlanePerMinute: +(out / (liveSecs / 60)).toFixed(2),
  meanBallSecs: +mean(ballTimes).toFixed(1),
  speedMedian: q(0.5), speedP75: q(0.75), speedP90: q(0.9),
  sideWallShare: +(sideWallSecs / liveSecs).toFixed(3),
  meanScore: Math.round(score / GAMES),
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k + 'PerGame', +(v / GAMES).toFixed(2)])),
};
console.log(JSON.stringify(result, null, 1));
