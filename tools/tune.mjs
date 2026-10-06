// Plays many seeded games with the demo autopilot and reports how balls drain and how fast they move,
// so a change to the table or the physics can be judged by numbers as well as by feel.
//   node tools/tune.mjs [games=60]
// The autopilot flips whenever the ball comes down to a flipper, a little late at random, like a fair player.
import { Game } from '../js/game.js';
import { NORMAL } from '../js/settings.js';

const GAMES = Number(process.argv[2]) || 60;
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

for (let gi = 0; gi < GAMES; gi++) {
  seed(1000 + gi);
  let over = false;
  const g = new Game({ ...NORMAL, ballSave: 0 }, { over: () => { over = true; } });
  g.start('play');
  const scale = g.settings.timeScale ?? 1;
  let lastOutlane = null, ballStart = null;
  for (let f = 0; f < 60 * 60 * 20 && !over; f++) {
    const steps = Math.round(17 * scale);
    for (let i = 0; i < steps; i++) g.world.step();
    for (const e of g.world.events) {
      if (e.type === 'enter' && e.obj.id === 'outlane') lastOutlane = e.obj.side === 1 ? 'leftOutlane' : 'rightOutlane';
      if (e.type === 'enter' && e.obj.id === 'inlane') lastOutlane = null;
      if (e.type === 'kick' || (e.type === 'hit' && e.obj.kind !== 'rail')) { if (e.ball.y < 760) lastOutlane = null; }
    }
    if (ballStart != null && g.state === 'live' && g.time - ballStart > 120 * scale) {
      timeouts++;
      g.world.balls.length = 0; g.drained(); ballStart = null; lastOutlane = null;
      continue;
    }
    const before = g.world.balls.length, wasLive = g.state === 'live';
    g.autopilot();
    g.update(FRAME);
    const b = g.world.balls[0];
    if (wasLive && g.world.balls.length < before) {
      drains[lastOutlane || 'center']++;
      if (ballStart != null) ballTimes.push((g.time - ballStart) / scale);
      lastOutlane = null; ballStart = null;
    }
    if (g.state === 'live' && ballStart == null) ballStart = g.time;
    if (b && g.state === 'live' && !b.held) {
      liveSecs += FRAME;
      // Speed as the player sees it: table millimetres per second of real time.
      speeds.push(Math.hypot(b.vx, b.vy) * scale);
      if (b.x < 30 || (b.x > 456 && b.x < 486)) sideWallSecs += FRAME;
    }
  }
  score += g.score;
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
};
console.log(JSON.stringify(result, null, 1));
