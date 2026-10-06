// The rules: what everything scores, the bonus, ball save, tilt, extra balls, and the flow of a game.
// It listens to what the physics reports (a bumper kicked, a rollover was crossed) and keeps the lamps
// that the renderer draws. The numbers follow early-80s solid-state games: points in thousands, a bonus
// counted down at the end of each ball and multiplied by the lanes you completed.

import { World, makeBall, BALL_R } from './physics.js';
import { buildTable, PF_RIGHT, W, H } from './table.js';

export const SCORES = {
  sling: 10, bumper: 100, bumperLit: 1000, lane: 1000, skill: 25000, spinner: 100, spinnerLit: 1000,
  standup: 1000, standupSet: 10000, drop: 1000, dropBank: 10000, dropSpecial: 25000, saucer: 5000,
  inlane: 1000, outlane: 5000, bonusUnit: 1000,
};
const BONUS_MAX = 39, MULT_MAX = 5;
const LANE_X = (PF_RIGHT + W) / 2;

export class Game {
  constructor(settings, out = {}) {
    this.settings = settings;
    this.out = out; // { sound(name, opts), show(text, secs), over(game) }
    this.mode = 'attract';
    this.reset();
  }

  reset() {
    this.table = buildTable();
    this.world = new World(this.table, this.settings);
    this.score = 0;
    this.ballNo = 0;
    this.extraBalls = 0;
    this.extraBallUsed = false;
    this.lamps = {
      lanes: [false, false, false], skillLane: -1, bumpersLit: false, spinnerLit: false,
      standups: [true, true, true], extraBallLit: false, shootAgain: false, bonus: 0, mult: 1, ballSave: false,
    };
    this.tiltMeter = 0;
    this.warnings = 0;
    this.tilted = false;
    this.state = 'idle'; // lane | live | bonus | idle
    this.saveUntil = 0;
    this.saveArmed = false;
    this.timers = [];
    this.spin = { angle: 0, rate: 0 };
    this.bumperFlash = [0, 0, 0];
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
    l.bonus = 0; l.mult = 1; l.lanes = [false, false, false]; l.bumpersLit = false; l.spinnerLit = false;
    l.standups = [true, true, true];
    for (const d of this.table.drops) d.off = false;
    this.tilted = false; this.warnings = 0; this.tiltMeter = 0;
    if (l.shootAgain) { l.shootAgain = false; this.extraBalls--; } else this.ballNo++;
    this.serve();
  }

  serve() {
    const b = makeBall(LANE_X, this.table.plunger.y - BALL_R);
    this.world.balls.push(b);
    this.state = 'lane';
    this.saveArmed = true;
    this.lamps.skillLane = Math.floor(Math.random() * 3);
    this.lamps.lanes = this.lamps.lanes.map((_, i) => i === this.lamps.skillLane ? false : this.lamps.lanes[i]);
    this.skillOn = true;
    if (this.mode === 'play') this.show('Ball ' + this.ballNo, 1.2);
  }

  ballInLane() {
    return this.world.balls.some(b => b.x > PF_RIGHT && b.y > this.table.plunger.y - 60);
  }

  // ---------- controls ----------
  flip(side, down) {
    const f = this.table.flippers[side === 'left' ? 0 : 1];
    if (this.tilted || this.state === 'bonus' || this.state === 'idle') down = false;
    if (f.pressed === down) return;
    f.pressed = down;
    this.sound(down ? 'flipUp' : 'flipDown', { side });
    // Lane change: the flippers rotate the lit top lanes (and the skill-shot lane) while a ball is live.
    if (down && (this.state === 'live' || this.state === 'lane')) this.laneChange(side === 'left' ? -1 : 1);
  }

  laneChange(dir) {
    const l = this.lamps, n = 3;
    l.lanes = l.lanes.map((_, i) => l.lanes[(i - dir + n) % n]);
    if (l.skillLane >= 0) l.skillLane = (l.skillLane + dir + n) % n;
  }

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

  bonus(n = 1) { if (!this.tilted) this.lamps.bonus = Math.min(BONUS_MAX, this.lamps.bonus + n); }

  // ---------- each frame ----------
  update(dt) {
    const l = this.lamps;
    this.tiltMeter = Math.max(0, this.tiltMeter - dt * 0.9);
    this.bumperFlash = this.bumperFlash.map(v => Math.max(0, v - dt * 6));
    for (const s of this.table.slings) s.flash = Math.max(0, (s.flash || 0) - dt * 8);
    this.spin.angle += this.spin.rate * dt;
    this.spin.rate *= Math.exp(-dt * 2.2);
    if (this.spin.rate < 2) this.spin.rate = 0;
    l.ballSave = this.saveUntil > this.time || (this.saveArmed && this.state === 'lane');

    const due = this.timers.filter(t => t.at <= this.time);
    this.timers = this.timers.filter(t => t.at > this.time);
    for (const t of due) t.fn();

    for (const e of this.world.events) this.event(e);
    this.world.events.length = 0;

    // Balls held in the saucer kick out when their time is up.
    for (const b of this.world.balls) {
      if (b.held && b.held.until <= this.time) {
        b.held = null;
        b.vx = (Math.random() - 0.5) * 300;
        b.vy = -1550 - Math.random() * 200;
        this.sound('saucerKick');
      }
    }

    // Drained balls.
    const gone = this.world.balls.filter(b => b.y > H + 30 || b.x < -50 || b.x > W + 50 || b.y < -80 || !Number.isFinite(b.x + b.y));
    if (gone.length) {
      this.world.balls = this.world.balls.filter(b => !gone.includes(b));
      if (!this.world.balls.length && this.state !== 'bonus' && this.state !== 'idle') this.drained();
    }
  }

  event(e) {
    const o = e.obj, l = this.lamps;
    const live = !this.tilted;
    if (e.type === 'kick') {
      if (o.kind === 'bumper') {
        this.bumperFlash[o.i] = 1;
        this.sound('bumper', { i: o.i });
        this.add(l.bumpersLit ? SCORES.bumperLit : SCORES.bumper);
      } else if (o.kind === 'sling') {
        this.sound('sling', { side: o.side });
        this.add(SCORES.sling);
      }
      this.skillOn = false;
      return;
    }
    if (e.type === 'hit') {
      if (o.kind === 'drop' && !o.off) {
        o.off = true;
        this.sound('drop');
        if (!live) return;
        this.add(SCORES.drop); this.bonus();
        if (this.table.drops.every(d => d.off)) {
          if (!l.extraBallLit && !this.extraBallUsed) {
            l.extraBallLit = true;
            this.add(SCORES.dropBank);
            this.show('Extra ball is lit', 2);
          } else {
            this.add(SCORES.dropSpecial);
            this.show('Targets 25,000', 1.6);
          }
          this.sound('award');
          this.after(1.2, () => { for (const d of this.table.drops) d.off = false; this.sound('reset'); });
        }
      } else if (o.kind === 'standup' && e.speed > 80) {
        this.sound('target');
        if (!live) return;
        this.add(SCORES.standup); this.bonus();
        if (l.standups[o.i]) {
          l.standups[o.i] = false;
          if (l.standups.every(x => !x)) {
            l.spinnerLit = true;
            this.add(SCORES.standupSet);
            this.bonus(3);
            this.show('Spinner is lit', 1.6);
            this.sound('award');
            this.after(0.6, () => { l.standups = [true, true, true]; });
          }
        }
      } else if (e.speed > 250) this.sound('thud', { speed: e.speed, kind: o.kind });
      return;
    }
    if (e.type === 'cross') {
      if (o.id === 'laneExit' && e.dir < 0 && this.state === 'lane') {
        this.state = 'live';
        if (this.saveArmed) { this.saveUntil = this.time + this.wsecs(this.settings.ballSave); this.saveArmed = false; }
      } else if (o.id === 'spinner') {
        const spins = Math.max(1, Math.round(e.speed / 160));
        this.spin.rate = Math.min(80, e.speed * (this.settings.timeScale ?? 1) / 18); // per real second
        this.sound('spinner', { spins });
        if (live) for (let i = 0; i < spins; i++) this.add(l.spinnerLit ? SCORES.spinnerLit : SCORES.spinner);
        this.skillOn = false;
      }
      return;
    }
    if (e.type === 'enter') {
      if (o.id === 'lane') {
        this.sound('rollover');
        if (!live) return;
        if (this.skillOn && o.i === l.skillLane) {
          this.add(SCORES.skill);
          this.show('Skill shot 25,000', 2);
          this.sound('award');
        }
        this.skillOn = false;
        l.skillLane = -1;
        this.add(SCORES.lane); this.bonus();
        l.lanes[o.i] = true;
        if (l.lanes.every(Boolean)) {
          l.mult = Math.min(MULT_MAX, l.mult + 1);
          l.bumpersLit = true;
          this.show(l.mult + 'x bonus', 1.6);
          this.sound('award');
          this.after(0.5, () => { l.lanes = [false, false, false]; });
        }
      } else if (o.id === 'saucer') {
        const b = e.ball;
        if (e.speed > this.settings.saucerGrab || b.held) return;
        b.held = { until: this.time + this.wsecs(1.1) };
        b.x = this.table.saucer.x; b.y = this.table.saucer.y; b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
        this.sound('saucer');
        this.skillOn = false;
        if (!live) return;
        this.add(SCORES.saucer); this.bonus(2);
        if (l.extraBallLit) {
          l.extraBallLit = false;
          this.extraBallUsed = true;
          this.extraBalls++;
          l.shootAgain = true;
          this.show('Extra ball', 2.4);
          this.sound('extraBall');
        }
      } else if (o.id === 'inlane') {
        this.sound('rollover');
        if (live) { this.add(SCORES.inlane); this.bonus(); }
      } else if (o.id === 'outlane') {
        this.sound('rollover');
        if (live) this.add(SCORES.outlane);
      }
    }
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
    const l = this.lamps;
    const units = this.tilted ? 0 : l.bonus;
    const mult = l.mult;
    // Count the bonus down a step at a time, like the lamps on a real machine.
    const tick = () => {
      if (l.bonus > 0 && !this.tilted) {
        l.bonus--;
        this.score += SCORES.bonusUnit * mult;
        this.sound('bonus', { mult });
        this.after(mult > 1 ? 0.07 : 0.1, tick);
      } else this.after(0.7, () => this.endOfBall());
    };
    if (units) this.show(`Bonus ${(units * SCORES.bonusUnit).toLocaleString('en-US')}` + (mult > 1 ? ` × ${mult}` : ''), 1 + units * 0.08);
    this.after(0.8, tick);
  }

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
        if (b.held) return false;
        const dx = b.x - f.x, dy = b.y - f.y;
        const along = f.side === 'left' ? dx : -dx;
        return along > 10 && along < 95 && dy > -70 && dy < 40 && b.vy > -200;
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

export { W, H };
