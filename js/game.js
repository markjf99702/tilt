// The machine every table shares: serving each ball to the plunger, the flippers, nudging and tilt, ball save,
// extra balls, multiball, the end of each ball and of the game, and the demo's autopilot. A table's rules extend
// Game: they build the table (build()), score what the physics reports (a bumper kicked, a rollover was crossed)
// and keep the lamps that the table draws. They can extend reset(), nextBall(), serve(), update(), event(),
// drained() and lost(), always calling the version here, and fill in flipped(), release() and countBonus() below.
// A lock holds a ball with held = { until: Infinity } and locked = true: it stays on the table but isn't in
// play (inPlay()). launchBall() puts another ball into play.
// A table with a floor under the playfield (a basement, on a level of its own) keeps game.floor, the level the ball is
// on, and lists its floors from the top down (floors in its index.js): the screen shows that floor, and slides from
// one to the next as it changes (render.js).

import { World, makeBall, BALL_R } from './physics.js';

export class Game {
  constructor(settings, out = {}) {
    this.settings = settings;
    this.out = out; // { sound(name, opts), show(text, secs), over(game) }
    this.mode = 'attract';
    this.reset();
  }

  reset() {
    this.table = this.build();
    this.world = new World(this.table, this.settings);
    this.score = 0;
    this.ballNo = 0;
    this.extraBalls = 0;
    this.lamps = { shootAgain: false, ballSave: false };
    this.tiltMeter = 0;
    this.warnings = 0;
    this.tilted = false;
    this.state = 'idle'; // lane | live | bonus | idle
    this.saveUntil = 0;
    this.saveArmed = false;
    this.launching = 0; // balls given back that are waiting for the shooter lane (see launchBall())
    this.timers = [];
    this.floor = 0; // the floor the screen shows
  }

  // The clock of the ball's world. It runs timeScale times as fast as real time; the rules' own waits
  // (ball save, the saucer, the bonus count, the demo's fingers) are given in real seconds and go through wsecs().
  get time() { return this.world.time; }
  wsecs(secs) { return secs * (this.settings.timeScale ?? 1); }
  sound(name, o) { this.out.sound?.(name, o); }
  show(text, secs = 1.6) { this.out.show?.(text, secs); }
  after(secs, fn) { this.timers.push({ at: this.time + this.wsecs(secs), fn }); }

  start(mode = 'play') {
    this.reset();
    this.mode = mode;
    this.nextBall();
  }

  // ---------- balls ----------
  nextBall() {
    const l = this.lamps;
    this.tilted = false; this.warnings = 0; this.tiltMeter = 0;
    if (l.shootAgain) { l.shootAgain = false; this.extraBalls--; } else this.ballNo++;
    this.serve();
  }

  serve() {
    const p = this.table.plunger;
    const b = makeBall((p.x0 + p.x1) / 2, p.y - BALL_R);
    this.world.balls.push(b);
    this.state = 'lane';
    this.saveArmed = true;
    this.floor = 0; // a table with a basement serves every ball upstairs
    if (this.mode === 'play') this.show('Ball ' + this.ballNo, 1.2);
  }

  // Balls in play: every ball on the table but any that a lock is holding.
  inPlay() { return this.world.balls.filter(b => !b.locked).length; }

  ballInLane() {
    const p = this.table.plunger;
    return this.world.balls.some(b => b.x > p.x0 && b.y > p.y - 60);
  }

  // ---------- controls ----------
  // Each button works every flipper on its side.
  flip(side, down) {
    const fs = this.table.flippers.filter(f => f.side === side);
    if (this.tilted || this.state === 'bonus' || this.state === 'idle') down = false;
    if (fs.every(f => f.pressed === down)) return;
    for (const f of fs) f.pressed = down;
    this.sound(down ? 'flipUp' : 'flipDown', { side });
    if (down && (this.state === 'live' || this.state === 'lane')) this.flipped(side);
  }

  // A flipper button went down with a ball on the table (to change lanes, say).
  flipped(side) { }

  plunge(down) {
    const p = this.table.plunger;
    if (down) { if (!p.firing) p.pulling = true; return; }
    if (!p.pulling) return;
    p.pulling = false;
    if (p.pull < 0.04) { p.pull = 0; return; }
    p.firing = true;
    const s = this.settings;
    p.fireSpeed = s.launchMin + (s.launchMax - s.launchMin) * Math.pow(p.pull, 0.9);
    this.sound('plunge', { power: p.pull });
  }

  nudge(dx, dy) {
    if (this.state !== 'live' || this.tilted) return;
    this.world.nudge(dx, dy);
    this.sound('nudge');
    this.tiltMeter += 1;
    if (this.tiltMeter > 1.6) {
      this.warnings++;
      this.tiltMeter = 0.8;
      if (this.warnings > this.settings.tiltWarnings) this.tilt();
      else { this.show('Danger', 1.2); this.sound('danger'); }
    }
  }

  tilt() {
    this.tilted = true;
    for (const f of this.table.flippers) f.pressed = false;
    this.show('Tilt', 3);
    this.sound('tilt');
  }

  // ---------- scoring ----------
  add(points) {
    if (this.tilted || this.mode !== 'play') { if (this.mode === 'attract') this.score += points; return; }
    this.score += points;
    this.sound('chime', { points });
  }

  // ---------- each frame ----------
  update(dt) {
    const l = this.lamps;
    this.tiltMeter = Math.max(0, this.tiltMeter - dt * 0.9);
    l.ballSave = this.saveUntil > this.time || (this.saveArmed && this.state === 'lane');

    const due = this.timers.filter(t => t.at <= this.time);
    this.timers = this.timers.filter(t => t.at > this.time);
    for (const t of due) t.fn();

    for (const e of this.world.events) this.event(e);
    this.world.events.length = 0;

    // Held balls (in a saucer, say) are let go when their time is up.
    for (const b of this.world.balls) if (b.held && b.held.until <= this.time) { b.held = null; this.release(b); }

    // Drained balls. The ball is over once the last ball in play has gone (a ball in a lock doesn't count), unless
    // the last ones went together in the ball save's time, which gives each one back.
    const { W, H } = this.table;
    const gone = this.world.balls.filter(b => b.y > H + 30 || b.x < -50 || b.x > W + 50 || b.y < -80 || !Number.isFinite(b.x + b.y));
    if (gone.length) {
      this.world.balls = this.world.balls.filter(b => !gone.includes(b));
      if (this.inPlay() || (gone.length > 1 && !this.tilted && this.saveUntil > this.time)) for (const b of gone) this.lost(b);
      else if (this.state !== 'bonus' && this.state !== 'idle') this.drained();
    }
  }

  // What the physics reports. The machine's own part: a ball leaving the shooter lane is in play and the
  // ball save starts. A table's rules score everything else, calling this first.
  event(e) {
    if (e.type === 'cross' && e.obj.id === 'laneExit' && e.dir < 0 && this.state === 'lane') {
      this.state = 'live';
      if (this.saveArmed) { this.saveUntil = this.time + this.wsecs(this.settings.ballSave); this.saveArmed = false; }
    }
  }

  // A held ball's time is up: it goes as it is unless the table kicks it out.
  release(b) { }

  // ---------- multiball ----------
  // A ball drained while others are still in play. In the ball save's time the machine plunges another at once.
  lost(b) {
    if (this.tilted || this.saveUntil <= this.time) return;
    this.show('Ball saved', 1.6);
    this.sound('saved');
    this.launchBall();
  }

  // One more ball into play, plunged hard by the machine itself. If the shooter lane is busy it waits its turn
  // (counted in this.launching, so a table doesn't end its multiball while a ball is still to come).
  launchBall() {
    if (this.state !== 'live' || this.tilted) return;
    if (this.ballInLane()) {
      this.launching++;
      this.after(0.5, () => { this.launching--; this.launchBall(); });
      return;
    }
    const p = this.table.plunger;
    this.world.balls.push(makeBall((p.x0 + p.x1) / 2, p.y - BALL_R));
    p.pulling = false; p.pull = 1; p.firing = true; p.fireSpeed = this.settings.launchMax;
    this.sound('plunge', { power: 1 });
  }

  // ---------- end of a ball ----------
  drained() {
    for (const f of this.table.flippers) f.pressed = false;
    if (this.mode === 'attract') { this.after(1, () => { this.serve(); }); this.state = 'idle'; return; }
    if (!this.tilted && (this.saveUntil > this.time || this.state === 'lane')) {
      this.show('Ball saved', 1.6);
      this.sound('saved');
      this.saveUntil = 0;
      this.after(0.8, () => this.serve());
      this.state = 'idle';
      return;
    }
    this.sound('drain');
    this.state = 'bonus';
    this.countBonus();
  }

  // After a drain: a table with a bonus counts it here. With none, on to the next ball after a moment.
  countBonus() { this.after(1, () => this.endOfBall()); }

  endOfBall() {
    if (this.lamps.shootAgain) { this.show('Shoot again', 1.6); this.nextBall(); return; }
    if (this.ballNo >= this.settings.balls) {
      this.state = 'idle';
      this.mode = 'over';
      this.sound('gameOver');
      this.out.over?.(this);
      return;
    }
    this.nextBall();
  }

  // For the attract-mode demo: a little autopilot that flips when the ball comes down to a flipper.
  autopilot() {
    const p = this.table.plunger;
    if (this.state === 'lane' && !p.pulling && !p.firing) {
      p.pulling = true;
      const want = 0.35 + Math.random() * 0.65;
      this.after(want * p.pullTime, () => this.plunge(false));
    }
    for (const f of this.table.flippers) {
      const near = this.world.balls.some(b => {
        if (b.held || b.level !== (f.level || 0)) return false;
        const dx = b.x - f.x, dy = b.y - f.y;
        const along = f.side === 'left' ? dx : -dx;
        return along > 10 && along < f.len + 15 && dy > -70 && dy < 40 && b.vy > -200;
      });
      if (near && !f.cool) {
        f.cool = true;
        const wait = Math.random() * 0.1;
        this.after(wait, () => { f.pressed = true; });
        this.after(wait + 0.22, () => { f.pressed = false; });
        this.after(wait + 0.45, () => { f.cool = false; });
      }
    }
  }
}
