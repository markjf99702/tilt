// The ball physics. Everything is in millimetres and seconds, laid out like a real playfield
// (about 52 cm by 106 cm), with y pointing down the table towards the player.
//
// It runs in small fixed steps (a thousandth of a second), so even the fastest ball moves less than half its
// own width per step and can't slip through a wall or a flipper. Walls, posts and bumpers are capsules and
// circles that never move; flippers are tapered capsules that swing about a pivot and push the ball with
// the speed of the point it touches. Things that only notice the ball (rollovers, the spinner, the saucer)
// report what happened as events for the rules to score.

export const BALL_R = 13.5;
export const STEP = 1 / 1000;
const MAX_SPEED = 7000;

export function makeBall(x, y) {
  return { x, y, vx: 0, vy: 0, held: null, inside: new Set(), id: Math.random().toString(36).slice(2, 8), lastHit: 0 };
}

export class World {
  constructor(table, settings) {
    this.t = table;
    this.s = settings;
    this.balls = [];
    this.events = [];
    this.time = 0;
    this.gy = 9810 * Math.sin(settings.slope * Math.PI / 180);
    this.cool = new Map(); // kicker -> time it can fire again
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  step() {
    const dt = STEP;
    this.time += dt;
    for (const f of this.t.flippers) moveFlipper(f, dt, this.s);
    if (this.t.plunger) movePlunger(this.t.plunger, dt);
    for (const b of this.balls) {
      if (b.held) continue;
      b.vy += this.gy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.collide(b);
      this.sense(b, px, py);
    }
    // Balls against each other (only matters once there's more than one).
    for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) ballBall(this.balls[i], this.balls[j]);
  }

  collide(b) {
    const t = this.t;
    for (const w of t.walls) {
      if (w.off) continue;
      const q = closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by);
      let dx = b.x - q.x, dy = b.y - q.y;
      const d2 = dx * dx + dy * dy, min = BALL_R + w.r;
      if (d2 >= min * min) continue;
      if (w.oneWay) {
        // A one-way gate only stops a ball on its closed side.
        if ((b.x - w.ax) * w.nx + (b.y - w.ay) * w.ny < 0) continue;
      }
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      b.x += nx * (min - d); b.y += ny * (min - d);
      const vn = bounce(b, nx, ny, 0, 0, w.e, w.mu ?? 0.08);
      if (w.kick) this.kick(b, w, nx, ny, vn);
      else if (vn > 60) this.emit('hit', { obj: w, ball: b, speed: vn });
    }
    for (const c of t.circles) {
      if (c.off) continue;
      const dx = b.x - c.x, dy = b.y - c.y, min = BALL_R + c.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      b.x = c.x + nx * min; b.y = c.y + ny * min;
      const vn = bounce(b, nx, ny, 0, 0, c.e, 0.08);
      if (c.kick) this.kick(b, c, nx, ny, vn);
      else if (vn > 250) this.emit('hit', { obj: c, ball: b, speed: vn });
    }
    for (const f of t.flippers) flipperContact(b, f, this);
    if (t.plunger) plungerContact(b, t.plunger);
  }

  // Slingshots and pop bumpers fire whenever the ball touches them hard enough, and throw it away.
  kick(b, obj, nx, ny, vn) {
    const ready = (this.cool.get(obj) || 0) <= this.time;
    if (!ready || vn < obj.kick.min) { if (vn > 250) this.emit('hit', { obj, ball: b, speed: vn }); return; }
    this.cool.set(obj, this.time + 0.09);
    const out = b.vx * nx + b.vy * ny;
    const want = obj.kick.speed;
    if (out < want) { b.vx += nx * (want - out); b.vy += ny * (want - out); }
    obj.flash = 1;
    this.emit('kick', { obj, ball: b });
  }

  sense(b, px, py) {
    for (const s of this.t.sensors) {
      if (s.off) continue;
      if (s.kind === 'line') {
        // Crossed the line between the last step and this one?
        const s0 = (px - s.ax) * s.nx + (py - s.ay) * s.ny, s1 = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny;
        if ((s0 < 0) === (s1 < 0)) continue;
        const along = ((b.x - s.ax) * s.tx + (b.y - s.ay) * s.ty);
        if (along < -2 || along > s.len + 2) continue;
        this.emit('cross', { obj: s, ball: b, dir: s1 < 0 ? -1 : 1, speed: Math.abs(b.vx * s.nx + b.vy * s.ny) });
      } else {
        const inside = (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;
        if (inside && !b.inside.has(s)) {
          b.inside.add(s);
          this.emit('enter', { obj: s, ball: b, speed: Math.hypot(b.vx, b.vy) });
        } else if (!inside && b.inside.has(s)) b.inside.delete(s);
      }
    }
  }

  nudge(dx, dy) {
    for (const b of this.balls) if (!b.held) { b.vx += dx; b.vy += dy; }
  }
}

// Reflects the ball's velocity off a surface moving at (sx, sy). Returns how hard it hit.
// Friction only takes away as much sideways speed as the push it got, so a rolling ball keeps rolling.
function bounce(b, nx, ny, sx, sy, e, mu) {
  const rx = b.vx - sx, ry = b.vy - sy;
  const vn = rx * nx + ry * ny;
  if (vn >= 0) return 0;
  // Gentle touches don't bounce, so a ball can roll along a wall or settle on a flipper.
  const ee = -vn < 120 ? 0 : -vn < 400 ? e * (-vn - 120) / 280 : e;
  let tx = rx - vn * nx, ty = ry - vn * ny;
  const tl = Math.hypot(tx, ty);
  if (tl > 0) {
    const k = Math.max(0, tl - mu * (1 + ee) * -vn) / tl;
    tx *= k; ty *= k;
  }
  b.vx = tx - ee * vn * nx + sx; b.vy = ty - ee * vn * ny + sy;
  return -vn;
}

function ballBall(a, b) {
  if (a.held || b.held) return;
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = BALL_R * 2;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
  a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return;
  const j = -(1 + 0.9) * vn / 2;
  a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
}

export function closestOnSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  let t = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + ex * t, y: ay + ey * t, t };
}

// ---------- flippers ----------
// A flipper swings between its rest angle and its up angle. Held, it accelerates to full speed in a few
// milliseconds, like a solenoid; let go, a spring brings it back more slowly.
function moveFlipper(f, dt, s) {
  const target = f.pressed ? f.up : f.rest;
  const dir = Math.sign(target - f.angle);
  if (!dir) { f.omega = 0; return; }
  const top = f.pressed ? s.flipUp : s.flipDown;
  const want = dir * top;
  const acc = top / 0.005;
  f.omega += Math.max(-acc * dt, Math.min(acc * dt, want - f.omega));
  if (Math.sign(f.omega) !== dir) f.omega = dir * acc * dt;
  f.angle += f.omega * dt;
  if ((dir > 0 && f.angle >= target) || (dir < 0 && f.angle <= target)) { f.angle = target; f.omega = 0; }
}

export function flipperEnds(f) {
  return { px: f.x, py: f.y, tx: f.x + Math.cos(f.angle) * f.len, ty: f.y + Math.sin(f.angle) * f.len };
}

function flipperContact(b, f, world) {
  const { px, py, tx, ty } = flipperEnds(f);
  const q = closestOnSeg(b.x, b.y, px, py, tx, ty);
  const rad = f.r0 + (f.r1 - f.r0) * q.t;
  const dx = b.x - q.x, dy = b.y - q.y, min = BALL_R + rad;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d, ny = dy / d;
  b.x = q.x + nx * min; b.y = q.y + ny * min;
  // The flipper's own speed at the point the ball touches it.
  const cx = q.x + nx * rad - px, cy = q.y + ny * rad - py;
  const sx = -f.omega * cy, sy = f.omega * cx;
  const vn = bounce(b, nx, ny, sx, sy, f.e, 0.15);
  if (vn > 300) world.emit('hit', { obj: f, ball: b, speed: vn });
}

// ---------- plunger ----------
// The ball sits on the plunger's tip. Pulled back, the tip (and the ball) go down with it; let go, it
// springs up and hands the ball its speed.
function movePlunger(p, dt) {
  p.vel = 0;
  if (p.firing) {
    p.vel = -p.fireSpeed;
    p.pull -= p.fireSpeed * dt / p.travel;
    if (p.pull <= 0) { p.pull = 0; p.firing = false; }
  } else if (p.pulling) {
    p.pull = Math.min(1, p.pull + dt / p.pullTime);
    p.vel = p.travel / p.pullTime;
  }
}

function plungerContact(b, p) {
  if (b.x < p.x0 || b.x > p.x1) return;
  const top = p.y + p.pull * p.travel;
  if (b.y + BALL_R <= top) return;
  if (b.y - BALL_R > top + 40) return;
  b.y = top - BALL_R;
  const sy = p.vel || 0;
  if (b.vy > sy) b.vy = sy < 0 ? sy : b.vy - sy > 150 ? sy - (b.vy - sy) * 0.15 : sy;
  b.vx *= 0.9;
}
