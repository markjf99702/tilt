// Space's rules: the ramp, the dock and its lock, two-ball multiball and its jackpot, the planets, the skill shot,
// the top lanes and the bonus. The numbers follow early-90s games: a ramp is worth ten times a 70s target, the
// jackpot is what you play for, and the bonus counts the shots you made, times the lanes' multiplier.

import { Game } from '../../game.js';
import { buildTable, HAIRPIN } from './layout.js';

export const SCORES = {
  sling: 10, bumper: 500, lane: 1000, inlane: 1000, outlane: 5000, orbit: 5000, ramp: 10000, dock: 5000,
  lock: 25000, multiball: 50000, skill: 25000, planets: 50000, jackpot: 100000, jackpotStep: 10000, jackpotMax: 250000,
  bonusRamp: 2000, bonusOrbit: 1000,
};
const MULT_MAX = 5, PLANETS = 8;
const fmt = n => n.toLocaleString('en-US');

export class Space extends Game {
  // Space's own adjustment, on top of the machine's: seconds of ball save when multiball starts.
  constructor(settings, out) { super({ multiballSave: 10, ...settings }, out); }

  build() { return buildTable(); }

  reset() {
    super.reset();
    this.extraBallUsed = false;
    this.jackpot = SCORES.jackpot; // what the next jackpot is worth; ramps raise it
    Object.assign(this.lamps, {
      lanes: [false, false, false], mult: 1, planets: 0, extraBallLit: false,
      lockLit: false, multiball: false, jackpotLit: false, skill: false,
    });
    this.counts = { ramps: 0, orbits: 0 }; // this ball's shots, for the bonus
    this.climbing = new Set();             // balls that went up the ramp's mouth (the dock's lift puts others on it)
    this.stats = { ramps: 0, orbits: 0, docks: 0, locks: 0, multiballs: 0, jackpots: 0, mbSecs: 0 }; // for tools/tune.mjs
    this.bumperFlash = [0, 0, 0];
    this.liftFlash = 0;
    this.flasher = 0;
  }

  // Each ball starts with no bonus and the lanes out. A locked ball, a lit lock, the planets and the jackpot's
  // value carry over.
  nextBall() {
    const l = this.lamps;
    this.counts = { ramps: 0, orbits: 0 };
    l.mult = 1; l.lanes = [false, false, false];
    super.nextBall();
  }

  // Skill shot: every ball served can be plunged softly onto the upper flipper and shot into the dock, until it
  // has been in play for a few seconds or anything else scores.
  serve() {
    super.serve();
    this.lamps.skill = true;
    this.skillUntil = Infinity;
  }

  // Lane change: the flippers rotate the lit top lanes while a ball is live.
  flipped(side) {
    const l = this.lamps, n = 3, dir = side === 'left' ? -1 : 1;
    l.lanes = l.lanes.map((_, i) => l.lanes[(i - dir + n) % n]);
  }

  // The bumpers, slingshots, lift and flasher fade after they fire. Multiball ends once its ball save is over
  // and only one ball is left in play, with none still to be plunged.
  update(dt) {
    const l = this.lamps;
    this.bumperFlash = this.bumperFlash.map(v => Math.max(0, v - dt * 6));
    for (const s of this.table.slings) s.flash = Math.max(0, (s.flash || 0) - dt * 8);
    this.liftFlash = Math.max(0, this.liftFlash - dt * 3);
    this.flasher = Math.max(0, this.flasher - dt * 1.5);
    if (l.skill && this.time > this.skillUntil) l.skill = false;
    if (l.multiball) {
      this.stats.mbSecs += dt;
      if (this.state === 'live' && this.inPlay() < 2 && this.saveUntil <= this.time && !this.launching) this.endMultiball();
    }
    super.update(dt);
  }

  // Scores what the physics reports (the machine sees each event first).
  event(e) {
    super.event(e);
    const o = e.obj, l = this.lamps;
    const live = !this.tilted;
    if (e.type === 'kick') {
      if (o.kind === 'bumper') {
        this.bumperFlash[o.i] = 1;
        this.sound('bumper', { i: o.i });
        this.add(SCORES.bumper);
      } else if (o.kind === 'sling') {
        this.sound('sling', { side: o.side });
        this.add(SCORES.sling);
      }
      l.skill = false;
      return;
    }
    if (e.type === 'hit') {
      if (e.speed > 250) this.sound('thud', { speed: e.speed, kind: o.kind });
      return;
    }
    if (e.type === 'cross') {
      // The skill shot's few seconds start as the ball leaves the shooter lane.
      if (o.id === 'laneExit' && e.dir < 0) this.skillUntil = Math.min(this.skillUntil, this.time + this.wsecs(8));
      else if (o.id === 'rampIn') this.climbing.add(e.ball);
      else if (o.id === 'rampBack') this.climbing.delete(e.ball);
      else if (o.id === 'rampOut' && this.climbing.delete(e.ball)) this.ramp();
      else if (o.id === 'orbit' && e.dir < 0) this.orbit();
      return;
    }
    if (e.type === 'enter') {
      if (o.id === 'lane') {
        this.sound('rollover');
        l.skill = false;
        if (!live) return;
        this.add(SCORES.lane);
        l.lanes[o.i] = true;
        if (l.lanes.every(Boolean)) {
          l.mult = Math.min(MULT_MAX, l.mult + 1);
          this.show(l.mult + 'x bonus', 1.6);
          this.sound('award');
          this.after(0.5, () => { l.lanes = [false, false, false]; });
        }
      } else if (o.id === 'dock') {
        if (!e.ball.held) this.dock(e.ball);
      } else if (o.id === 'inlane' || o.id === 'outlane') {
        this.sound('rollover');
        l.skill = false;
        if (live) this.add(SCORES[o.id]);
      }
    }
  }

  // A ramp made: it lights the next planet, and raises the jackpot and lights the lock, or in multiball scores
  // the jackpot.
  ramp() {
    const l = this.lamps;
    this.counts.ramps++;
    this.stats.ramps++;
    l.skill = false;
    this.sound('ramp');
    if (this.tilted) return;
    this.add(SCORES.ramp);
    if (!l.multiball) {
      this.jackpot = Math.min(SCORES.jackpotMax, this.jackpot + SCORES.jackpotStep);
      if (!l.lockLit) {
        l.lockLit = true;
        // With a ball already locked, the dock now starts multiball.
        this.show(this.world.balls.some(b => b.locked) ? 'Multiball is lit' : 'Lock is lit', 1.6);
        this.sound('award');
      }
    }
    // All eight planets light an extra ball at the orbit, once a game; after that they're worth 50,000. They go
    // out a moment later, and a ramp made in that moment lights the first of the next eight.
    if (++l.planets === PLANETS) {
      if (!l.extraBallLit && !this.extraBallUsed) {
        l.extraBallLit = true;
        this.show('Extra ball is lit', 2);
      } else {
        this.add(SCORES.planets);
        this.show('Planets 50,000', 1.6);
      }
      this.sound('award');
      this.after(1, () => { l.planets -= PLANETS; });
    }
    if (l.multiball && l.jackpotLit) {
      l.jackpotLit = false;
      this.add(this.jackpot);
      this.show('Jackpot ' + fmt(this.jackpot), 2);
      this.sound('jackpot');
      this.flasher = 1;
      this.stats.jackpots++;
    }
  }

  // Round the left orbit: it collects a lit extra ball.
  orbit() {
    const l = this.lamps;
    this.counts.orbits++;
    this.stats.orbits++;
    l.skill = false;
    if (this.tilted) return;
    this.add(SCORES.orbit);
    if (l.extraBallLit) {
      l.extraBallLit = false;
      this.extraBallUsed = true;
      this.extraBalls++;
      l.shootAgain = true;
      this.show('Extra ball', 2.4);
      this.sound('extraBall');
    }
  }

  // The dock catches the ball, and in a moment lifts it up onto the ramp (release()). The first ball shot in with
  // the lock lit stays locked there and another is served; the second starts multiball. In multiball the dock
  // lights the jackpot again.
  dock(b) {
    const t = this.table, l = this.lamps;
    b.x = t.dock.x; b.y = t.dock.y; b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
    b.held = { until: this.time + this.wsecs(0.8) };
    this.stats.docks++;
    this.sound('saucer');
    if (this.tilted) return;
    if (l.skill) {
      l.skill = false;
      this.add(SCORES.skill);
      this.show('Skill shot 25,000', 2);
      this.sound('award');
    }
    const locked = this.world.balls.find(x => x.locked);
    if (l.multiball) {
      this.add(SCORES.dock);
      if (!l.jackpotLit) {
        l.jackpotLit = true;
        this.show('Jackpot is lit', 1.6);
        this.sound('award');
      }
    } else if (l.lockLit && !locked) {
      l.lockLit = false;
      this.add(SCORES.lock);
      b.x = t.lockSpot.x; b.y = t.lockSpot.y;
      b.held = { until: Infinity };
      b.locked = true;
      this.stats.locks++;
      this.sound('lock');
      this.serve();
      this.show('Ball locked', 2);
    } else if (l.lockLit) {
      // Multiball. The locked ball goes up onto the ramp at once and this one follows a little later, so the two
      // don't come down to the left flipper together.
      l.lockLit = false;
      l.multiball = true;
      l.jackpotLit = true;
      this.add(SCORES.multiball);
      locked.locked = false; locked.held = null;
      this.release(locked);
      b.held = { until: this.time + this.wsecs(2) };
      this.saveUntil = Math.max(this.saveUntil, this.time + this.wsecs(this.settings.multiballSave));
      this.stats.multiballs++;
      this.show('Multiball', 2);
      this.after(2, () => { if (l.jackpotLit) this.show('Ramp for ' + fmt(this.jackpot), 1.6); });
      this.sound('multiball');
    } else this.add(SCORES.dock);
  }

  // The dock's hold is up: it lifts the ball onto the ramp, rolling round the hairpin towards its top, and the ramp
  // carries it down the wire to the left inlane.
  release(b) {
    const a = Math.atan2(b.y - HAIRPIN.y, b.x - HAIRPIN.x);
    b.level = 1;
    b.vx = b.wx = Math.sin(a) * 700;
    b.vy = b.wy = -Math.cos(a) * 700;
    this.liftFlash = 1;
    this.sound('lift');
  }

  endMultiball() {
    const l = this.lamps;
    if (!l.multiball) return;
    l.multiball = false;
    l.jackpotLit = false;
    this.jackpot = SCORES.jackpot;
  }

  drained() {
    this.endMultiball();
    super.drained();
  }

  // The bonus: each kind of shot made this ball, a line at a time, then the total times the multiplier.
  countBonus() {
    const l = this.lamps, c = this.counts, mult = l.mult;
    const lines = this.tilted ? [] : [['Ramps', c.ramps, SCORES.bonusRamp], ['Orbits', c.orbits, SCORES.bonusOrbit]].filter(([, n]) => n);
    const total = lines.reduce((sum, [, n, v]) => sum + n * v, 0);
    let at = 0.6;
    for (const [name, n, v] of lines) {
      this.after(at, () => { this.show(`${name} ${n} × ${fmt(v)}`, 0.9); this.sound('bonus', { mult }); });
      at += 0.9;
    }
    if (total) {
      this.after(at, () => {
        this.show(`Bonus ${fmt(total)}` + (mult > 1 ? ` × ${mult}` : ''), 1.2);
        this.score += total * mult;
        this.sound('bonus', { mult });
      });
      at += 0.9;
    }
    this.after(at + 0.4, () => this.endOfBall());
  }
}
