// Haunted House's rules: ghosts that glow now and then, the front door they open, the trapdoor behind it, the
// basement's coffin and stairs, the skill shot, the top lanes and the bonus.
import { Game } from '../../game.js';
import { buildTable, BASEMENT } from './layout.js';

export const SCORES = {
  sling: 10, bumper: 100, lane: 1000, skill: 25000, inlane: 1000, outlane: 5000,
  ghostDark: 100, ghost: 5000, ghostMax: 25000, knock: 1000, trapdoor: 10000, lid: 5000, coffin: 50000, stairs: 10000,
  bonusGhost: 2000, bonusTrip: 10000,
};
const MULT_MAX = 5;
const BALL_SAVE = 5;          // seconds: shorter than the machine's, but never over before the ball first reaches the flippers
const GLOW = 3;               // seconds a ghost glows
const DARK = [2, 6];          // seconds it's gone before it can glow again (somewhere between)
const MAX_LIT = 2;            // ghosts glowing at once, at most
const NEED = [2, 3, 4];       // ghosts to catch to open the door: the first time, the second, and every time after
const fmt = n => n.toLocaleString('en-US');

export class Haunted extends Game {
  constructor(settings, out) { super({ ...settings, ballSave: Math.min(BALL_SAVE, settings.ballSave) }, out); }

  build() { return buildTable(); }

  reset() {
    super.reset();
    this.extraBallUsed = false;
    this.opened = 0; // times the door has opened this game
    Object.assign(this.lamps, {
      lanes: [false, false, false], skillLane: -1, mult: 1, caught: 0, need: NEED[0], doorOpen: false, extraBallLit: false,
    });
    this.ghosts = this.table.ghosts.map(() => ({ lit: false, until: Infinity }));
    this.counts = { ghosts: 0, trips: 0 }; // this ball's, for the bonus
    this.stats = { ghosts: 0, knocks: 0, trips: 0, escapes: 0, lids: 0, coffins: 0, skills: 0, basementSecs: 0, doorSecs: 0 };
    this.bumperFlash = [0, 0];
  }

  // The door and the extra ball carry over from ball to ball; the multiplier and the lanes start again.
  nextBall() {
    const l = this.lamps;
    l.mult = 1; l.lanes = [false, false, false];
    this.counts = { ghosts: 0, trips: 0 };
    super.nextBall();
  }

  // Each ball is served with the ghosts gone (they wake once it's in play) and one top lane flashing for the skill shot.
  serve() {
    super.serve();
    this.reached = false;
    this.darken();
    this.lamps.skillLane = Math.floor(Math.random() * 3);
    this.skillOn = true;
  }

  darken() { for (const g of this.ghosts) { g.lit = false; g.until = Infinity; } }

  // The ghosts start to come and go in a moment.
  wake(secs) { for (const g of this.ghosts) g.until = this.time + this.wsecs(secs + Math.random() * 2); }

  flipped(side) {
    const l = this.lamps, n = 3, dir = side === 'left' ? -1 : 1;
    l.lanes = l.lanes.map((_, i) => l.lanes[(i - dir + n) % n]);
    if (l.skillLane >= 0) l.skillLane = (l.skillLane + dir + n) % n;
  }

  // Each ghost glows for a few seconds, then is gone for a few more; never more than two at once.
  haunt() {
    const now = this.time, n = this.ghosts.filter(g => g.lit).length;
    for (const g of this.ghosts) {
      if (g.until > now) continue;
      if (g.lit) { g.lit = false; g.until = now + this.wsecs(DARK[0] + Math.random() * (DARK[1] - DARK[0])); }
      else if (n < MAX_LIT) { g.lit = true; g.until = now + this.wsecs(GLOW); }
      else g.until = now + this.wsecs(1);
    }
  }

  update(dt) {
    const t = this.table;
    this.bumperFlash = this.bumperFlash.map(v => Math.max(0, v - dt * 6));
    for (const s of t.slings) s.flash = Math.max(0, (s.flash || 0) - dt * 8);
    if (this.state === 'live' && this.floor === 0) this.haunt();
    t.door.off = this.lamps.doorOpen;
    // The ball save doesn't run out before the ball has first come down to the flippers.
    if (!this.reached && this.world.balls.some(b => b.y > 870 && b.x > 100 && b.x < 386)) this.reached = true;
    if (!this.reached && this.saveUntil > this.time) this.saveUntil = Math.max(this.saveUntil, this.time + this.wsecs(0.5));
    if (this.floor === BASEMENT) this.stats.basementSecs += dt;
    if (this.lamps.doorOpen && this.state === 'live') this.stats.doorSecs += dt;
    super.update(dt);
  }

  event(e) {
    super.event(e);
    const o = e.obj, l = this.lamps, live = !this.tilted;
    if (e.type === 'cross' && o.id === 'laneExit' && e.dir < 0) this.wake(1);
    if (e.type === 'kick') {
      if (o.kind === 'bumper') { this.bumperFlash[o.i] = 1; this.sound('bumper', { i: o.i }); this.add(SCORES.bumper); }
      else if (o.kind === 'sling') { this.sound('sling', { side: o.side }); this.add(SCORES.sling); }
      this.skillOn = false;
      return;
    }
    if (e.type === 'hit') {
      if (o.kind === 'ghost' && e.speed > 80) this.ghost(o.i);
      else if (o.kind === 'door' && !o.off && e.speed > 150) this.knock();
      else if (o.kind === 'lid' && !o.off) this.lid(o);
      else if (e.speed > 250) this.sound('thud', { speed: e.speed, kind: o.kind });
      return;
    }
    if (e.type === 'enter') {
      if (o.id === 'lane') {
        this.sound('rollover');
        if (!live) return;
        if (this.skillOn && o.i === l.skillLane) {
          this.add(SCORES.skill); this.stats.skills++;
          this.show('Skill shot 25,000', 2);
          this.sound('award');
        }
        this.skillOn = false; l.skillLane = -1;
        this.add(SCORES.lane);
        l.lanes[o.i] = true;
        if (l.lanes.every(Boolean)) {
          l.mult = Math.min(MULT_MAX, l.mult + 1);
          this.show(l.mult + 'x bonus', 1.6);
          this.sound('award');
          this.after(0.5, () => { l.lanes = [false, false, false]; });
        }
      } else if (o.id === 'trapdoor') {
        if (!e.ball.held && l.doorOpen) this.fall(e.ball);
      } else if (o.id === 'stairs') {
        if (!e.ball.held) this.climb(e.ball);
      } else if (o.id === 'inlane' || o.id === 'outlane') {
        this.sound('rollover');
        if (live) this.add(SCORES[o.id]);
      }
    }
  }

  // A ghost hit while it glows is caught: each one caught on a ball is worth more, and enough of them open the door.
  ghost(i) {
    const g = this.ghosts[i], l = this.lamps;
    this.skillOn = false;
    this.sound('target');
    if (this.tilted) return;
    if (!g.lit) { this.add(SCORES.ghostDark); return; }
    g.lit = false; g.until = this.time + this.wsecs(DARK[0] + Math.random() * (DARK[1] - DARK[0]));
    this.counts.ghosts++; this.stats.ghosts++;
    const points = Math.min(SCORES.ghostMax, SCORES.ghost * this.counts.ghosts);
    this.add(points);
    this.sound('ghost');
    if (!l.doorOpen && ++l.caught >= l.need) {
      l.doorOpen = true; l.caught = 0;
      this.show('The door is open', 2);
      this.sound('award');
    } else this.show('Ghost ' + fmt(points), 1.2);
  }

  // Knocking on the shut door wakes a ghost.
  knock() {
    this.stats.knocks++;
    this.sound('knock');
    if (this.tilted) return;
    this.add(SCORES.knock);
    const dark = this.ghosts.filter(g => !g.lit);
    if (dark.length) { const g = dark[Math.floor(Math.random() * dark.length)]; g.lit = true; g.until = this.time + this.wsecs(GLOW); }
  }

  // Holds the ball still at (x, y) for a moment, on its way somewhere (release() says where).
  hold(b, x, y, secs, trip) {
    b.x = x; b.y = y; b.vx = b.vy = b.wx = b.wy = 0;
    b.held = { until: this.time + this.wsecs(secs) };
    b.trip = trip;
  }

  // Through the open door the ball drops through the trapdoor: it sinks out of sight, then the screen goes down to
  // the basement (release()). The door shuts behind it, and takes another ghost to open next time.
  fall(b) {
    const l = this.lamps;
    l.doorOpen = false; this.opened++; l.need = NEED[Math.min(this.opened, NEED.length - 1)];
    this.counts.trips++; this.stats.trips++;
    this.skillOn = false;
    this.hold(b, this.table.trapdoor.x, this.table.trapdoor.y, 0.4, 'down');
    this.sound('trapdoor');
    if (this.tilted) return;
    this.add(SCORES.trapdoor);
    this.show('To the basement', 1.6);
  }

  // Up the stairs: back to the house, collecting a lit extra ball.
  climb(b) {
    const s = this.table.stairs, l = this.lamps;
    this.stats.escapes++;
    this.hold(b, s.x, s.y, 0.4, 'up');
    this.sound('stairs');
    if (this.tilted) return;
    this.add(SCORES.stairs);
    if (l.extraBallLit) {
      l.extraBallLit = false; this.extraBallUsed = true; this.extraBalls++; l.shootAgain = true;
      this.show('Extra ball', 2.4);
      this.sound('extraBall');
    } else this.show('Back upstairs', 1.4);
  }

  // The coffin's lid: all three knocked off light the extra ball at the stairs, once a game; after that, 50,000.
  lid(o) {
    o.off = true;
    this.stats.lids++;
    this.sound('drop');
    if (this.tilted) return;
    this.add(SCORES.lid);
    if (this.table.lids.every(d => d.off)) {
      this.stats.coffins++;
      if (!this.lamps.extraBallLit && !this.extraBallUsed) { this.lamps.extraBallLit = true; this.show('Extra ball is lit', 2); }
      else { this.add(SCORES.coffin); this.show('Coffin 50,000', 1.6); }
      this.sound('award');
      this.after(1.2, () => { for (const d of this.table.lids) d.off = false; this.sound('reset'); });
    }
  }

  // The trips between floors, a held moment at a time: into the trapdoor, out of the hatch at the top of the chute;
  // into the stairs, out of the cellar door. Each floor change waits out the screen's slide (render.js).
  release(b) {
    const t = this.table;
    if (b.trip === 'down') {
      b.level = BASEMENT; b.inside.clear(); this.floor = BASEMENT; this.darken();
      for (const d of t.lids) d.off = false;
      this.hold(b, t.entry.x, t.entry.y, 0.7, 'chute');
    } else if (b.trip === 'chute') {
      b.trip = null; b.vx = b.wx = t.entry.vx; b.vy = b.wy = t.entry.vy;
    } else if (b.trip === 'up') {
      b.level = 0; b.inside.clear(); this.floor = 0;
      this.hold(b, t.cellar.x, t.cellar.y, 0.7, 'cellar');
      this.wake(1.7);
    } else if (b.trip === 'cellar') {
      b.trip = null; b.vy = b.wy = 300;
    }
  }

  // The bonus: the ghosts caught and the trips to the basement on this ball, a line at a time, then the total times
  // the multiplier.
  countBonus() {
    const c = this.counts, mult = this.lamps.mult;
    const lines = this.tilted ? [] : [['Ghosts', c.ghosts, SCORES.bonusGhost], ['Trips', c.trips, SCORES.bonusTrip]].filter(([, n]) => n);
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
