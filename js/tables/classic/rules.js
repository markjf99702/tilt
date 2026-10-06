// Classic's rules: what everything scores, the bonus and its multiplier, the skill shot, the top lanes,
// standups, drop targets, spinner and saucer. The numbers follow early-80s solid-state games: points in
// thousands, a bonus counted down at the end of each ball and multiplied by the lanes you completed.

import { Game } from '../../game.js';
import { buildTable } from './layout.js';

export const SCORES = {
  sling: 10, bumper: 100, bumperLit: 1000, lane: 1000, skill: 25000, spinner: 100, spinnerLit: 1000,
  standup: 1000, standupSet: 10000, drop: 1000, dropBank: 10000, dropSpecial: 25000, saucer: 5000,
  inlane: 1000, outlane: 5000, bonusUnit: 1000,
};
const BONUS_MAX = 39, MULT_MAX = 5;

export class Classic extends Game {
  // Classic's own adjustment, on top of the machine's: the saucer catches a ball going no faster than this (mm/s).
  constructor(settings, out) { super({ saucerGrab: 1700, ...settings }, out); }

  build() { return buildTable(); }

  reset() {
    super.reset();
    this.extraBallUsed = false;
    Object.assign(this.lamps, {
      lanes: [false, false, false], skillLane: -1, bumpersLit: false, spinnerLit: false,
      standups: [true, true, true], extraBallLit: false, bonus: 0, mult: 1,
    });
    this.spin = { angle: 0, rate: 0 };
    this.bumperFlash = [0, 0, 0];
  }

  // Each ball starts with no bonus, the lanes and standups reset and the drop targets up.
  nextBall() {
    const l = this.lamps;
    l.bonus = 0; l.mult = 1; l.lanes = [false, false, false]; l.bumpersLit = false; l.spinnerLit = false;
    l.standups = [true, true, true];
    for (const d of this.table.drops) d.off = false;
    super.nextBall();
  }

  // Skill shot: one top lane flashes for each ball served.
  serve() {
    super.serve();
    this.lamps.skillLane = Math.floor(Math.random() * 3);
    this.lamps.lanes = this.lamps.lanes.map((_, i) => i === this.lamps.skillLane ? false : this.lamps.lanes[i]);
    this.skillOn = true;
  }

  // Lane change: the flippers rotate the lit top lanes (and the skill-shot lane) while a ball is live.
  flipped(side) {
    const l = this.lamps, n = 3, dir = side === 'left' ? -1 : 1;
    l.lanes = l.lanes.map((_, i) => l.lanes[(i - dir + n) % n]);
    if (l.skillLane >= 0) l.skillLane = (l.skillLane + dir + n) % n;
  }

  bonus(n = 1) { if (!this.tilted) this.lamps.bonus = Math.min(BONUS_MAX, this.lamps.bonus + n); }

  // The bumpers and slingshots fade after a hit, and the spinner winds down.
  update(dt) {
    this.bumperFlash = this.bumperFlash.map(v => Math.max(0, v - dt * 6));
    for (const s of this.table.slings) s.flash = Math.max(0, (s.flash || 0) - dt * 8);
    this.spin.angle += this.spin.rate * dt;
    this.spin.rate *= Math.exp(-dt * 2.2);
    if (this.spin.rate < 2) this.spin.rate = 0;
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
      if (o.id === 'spinner') {
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

  // The saucer kicks its ball back up the table, a little to one side or the other.
  release(b) {
    b.vx = (Math.random() - 0.5) * 300;
    b.vy = -1550 - Math.random() * 200;
    this.sound('saucerKick');
  }

  // Count the bonus down a step at a time, like the lamps on a real machine.
  countBonus() {
    const l = this.lamps;
    const units = this.tilted ? 0 : l.bonus;
    const mult = l.mult;
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
}
