// Draws the table. The playfield, rails and anything that never changes are painted once into an
// offscreen canvas (again whenever the window or the skin changes); each frame adds the lamps, the moving
// parts and the ball on top.

import { W, H, PF_RIGHT, MID, SLING } from './table.js';
import { BALL_R, flipperEnds } from './physics.js';
import { star } from './skins.js';

const TAU = Math.PI * 2;

// Where the lamps sit on the playfield.
const BONUS_LAMPS = (() => {
  const out = [];
  const row = (y, labels, dx = 34) => labels.forEach((t, i) => out.push({ t, x: MID + (i - (labels.length - 1) / 2) * dx, y }));
  row(616, ['1', '2', '3', '4', '5']);
  row(650, ['6', '7', '8', '9', '10']);
  row(684, ['20', '30'], 50);
  return out;
})();
const MULT_LAMPS = ['2×', '3×', '4×', '5×'].map((t, i) => ({ t, x: MID + (i - 1.5) * 40, y: 724 }));
const LANE_LAMP_Y = 172;
const STANDUP_LAMPS = [340, 385, 430].map(y => ({ x: 84, y }));

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.skin = null;
    this.debug = /[?&]debug\b/.test(location.search);
  }

  // Fits the table into the canvas's box, centred, as large as it goes.
  resize(cssW, cssH, dpr) {
    this.dpr = dpr;
    this.cssW = cssW; this.cssH = cssH;
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.scale = Math.min(cssW / W, cssH / H);
    this.ox = (cssW - W * this.scale) / 2;
    this.oy = (cssH - H * this.scale) / 2;
    this.dirty = true;
  }

  // Screen point (CSS pixels, relative to the canvas) to table millimetres.
  toTable(px, py) { return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale }; }

  setSkin(skin) { this.skin = skin; this.dirty = true; }

  paintStatic(table) {
    const k = this.scale * this.dpr;
    this.layer.width = Math.ceil(W * k);
    this.layer.height = Math.ceil(H * k);
    const c = this.layer.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    drawPlayfield(c, table, this.skin);
    this.dirty = false;
  }

  draw(game, now) {
    const { ctx, skin } = this;
    const table = game.table;
    if (this.dirty) this.paintStatic(table);
    const k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    ctx.drawImage(this.layer, 0, 0, this.layer.width, this.layer.height, 0, 0, this.layer.width / k, this.layer.height / k);

    const blink = Math.floor(now / 160) % 2 === 0, slowBlink = Math.floor(now / 400) % 2 === 0;
    drawLamps(ctx, game, skin, blink, slowBlink);
    drawTargets(ctx, table, skin);
    drawSpinner(ctx, game, skin);
    drawSaucer(ctx, table, skin);
    for (const b of game.world.balls) drawBall(ctx, b);
    drawBumpers(ctx, table, game, skin);
    drawSlings(ctx, table, skin);
    for (const f of table.flippers) drawFlipper(ctx, f, skin);
    drawPlunger(ctx, table, skin);
    drawApron(ctx, game, skin);
    if (game.tilted) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.debug) drawDebug(ctx, table);
  }
}

// ---------- the static layer ----------
function drawPlayfield(c, t, s) {
  // Cabinet wood around the arch, then the playfield.
  c.fillStyle = '#05070d';
  c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(0, t.arc.y);
  c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0);
  c.lineTo(W, H);
  c.closePath();
  c.clip();
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.playfield[0]); g.addColorStop(0.55, s.playfield[1]); g.addColorStop(1, s.playfield[2]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  s.art(c, s);

  // The shooter lane is plain wood-grain dark.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(PF_RIGHT, 300, W - PF_RIGHT, H);

  // Lane labels and lamp sockets (unlit inserts).
  c.font = `16px ${s.font}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  t.laneX.forEach((x, i) => {
    c.fillStyle = s.ink; c.globalAlpha = 0.9;
    c.fillText(s.labels.lanes[i], x, 100);
    c.globalAlpha = 1;
    insert(c, x, LANE_LAMP_Y, 10, s.lamps.yellow);
    // Rollover button.
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x - 3, 118, 6, 22);
  });
  BONUS_LAMPS.forEach(l => insert(c, l.x, l.y, 12, s.lamps.yellow));
  MULT_LAMPS.forEach(l => insert(c, l.x, l.y, 14, s.lamps.orange, true));
  STANDUP_LAMPS.forEach(l => insert(c, l.x, l.y, 7, s.lamps.red));
  arrow(c, 82, 540, -2.2, 17, s.lamps.green);         // left lane: spinner lit
  insert(c, MID, 535, 16, s.lamps.red);                // extra ball (below the saucer)
  arrow(c, 430, 494, 0, 15, s.lamps.blue);             // drop targets
  insert(c, MID, 880, 13, s.lamps.red);                // shoot again
  labels(c, s);
  c.restore();

  // Rails, guides and rubbers.
  for (const w of t.walls) {
    if (['drop', 'standup', 'sling', 'gate'].includes(w.kind)) continue;
    c.lineCap = 'round';
    if (w.kind === 'rail') {
      c.strokeStyle = s.railShade; c.lineWidth = Math.max(5, w.r * 2 + 4);
      line(c, w); c.strokeStyle = s.rail; c.lineWidth = Math.max(2.5, w.r * 2 + 1); line(c, w);
    } else if (w.kind === 'guide') {
      c.strokeStyle = s.railShade; c.lineWidth = w.r * 2 + 2; line(c, w);
      c.strokeStyle = s.guide; c.lineWidth = w.r * 2 - 1; line(c, w);
    } else {
      c.strokeStyle = s.rubber; c.lineWidth = w.r * 2; line(c, w);
    }
  }
  // Gate wire.
  c.strokeStyle = s.rail; c.lineWidth = 2; line(c, t.gate);
  // Posts.
  for (const p of t.circles) {
    if (p.kind === 'bumper') continue;
    c.fillStyle = s.rubber; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
    c.fillStyle = s.post; c.beginPath(); c.arc(p.x, p.y, p.r * 0.45, 0, TAU); c.fill();
  }
  // Wooden cabinet rails over the edge of the arch.
  c.strokeStyle = '#2a1a10'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, t.arc.y); c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0); c.lineTo(W, H); c.stroke();
}

function labels(c, s) {
  c.save();
  c.font = `11px ${s.font}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = s.ink;
  c.fillText('BONUS', MID, 590);
  c.font = `9px ${s.font}`;
  c.fillText(s.labels.drops.toUpperCase(), MID, 560);
  c.fillText('SHOOT AGAIN', MID, 902);
  c.save(); c.translate(26, 300); c.rotate(-Math.PI / 2); c.fillText(s.labels.spinner.toUpperCase(), 0, 0); c.restore();
  c.font = `30px ${s.font}`;
  c.globalAlpha = 0.18;
  c.fillText(s.labels.title, MID, 790);
  c.restore();
}

function insert(c, x, y, r, color, square) {
  c.save();
  c.fillStyle = color; c.globalAlpha = 0.22;
  c.beginPath();
  if (square) roundRect(c, x - r, y - r * 0.7, r * 2, r * 1.4, 4); else c.arc(x, y, r, 0, TAU);
  c.fill();
  c.globalAlpha = 0.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.2; c.stroke();
  c.restore();
}

function arrow(c, x, y, ang, r, color, lit) {
  c.save();
  c.translate(x, y); c.rotate(ang);
  c.beginPath(); c.moveTo(r, 0); c.lineTo(-r * 0.7, r * 0.75); c.lineTo(-r * 0.35, 0); c.lineTo(-r * 0.7, -r * 0.75); c.closePath();
  c.fillStyle = color; c.globalAlpha = lit ? 1 : 0.22; c.fill();
  if (!lit) { c.globalAlpha = 0.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.2; c.stroke(); }
  c.restore();
}

function line(c, w) { c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke(); }

function roundRect(c, x, y, w, h, r) {
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------- each frame ----------
function glow(c, x, y, r, color, a = 1) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.55 * a; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
  c.restore();
}

function lit(c, x, y, r, color, label, s, square) {
  glow(c, x, y, r, color);
  c.save();
  c.fillStyle = color;
  c.beginPath();
  if (square) roundRect(c, x - r, y - r * 0.7, r * 2, r * 1.4, 4); else c.arc(x, y, r, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); c.fill();
  c.restore();
  if (label) { c.save(); c.fillStyle = 'rgba(20,10,0,0.85)'; c.font = `${r >= 13 ? 11 : 9}px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x, y + 1); c.restore(); }
}

function drawLamps(c, game, s, blink, slowBlink) {
  const l = game.lamps, t = game.table;
  t.laneX.forEach((x, i) => {
    if (l.lanes[i] || (l.skillLane === i && blink)) lit(c, x, LANE_LAMP_Y, 10, s.lamps.yellow);
  });
  const ones = l.bonus % 10, tens = Math.floor(l.bonus / 10);
  BONUS_LAMPS.forEach((b, i) => {
    const on = i < 9 ? ones === i + 1 : i === 9 ? tens === 1 : i === 10 ? tens === 2 : tens === 3;
    if (on) lit(c, b.x, b.y, 12, s.lamps.yellow, b.t, s);
    else { c.save(); c.fillStyle = 'rgba(255,230,160,0.35)'; c.font = `9px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.t, b.x, b.y + 1); c.restore(); }
  });
  MULT_LAMPS.forEach((m, i) => {
    if (l.mult >= i + 2) lit(c, m.x, m.y, 14, s.lamps.orange, m.t, s, true);
    else { c.save(); c.fillStyle = 'rgba(255,200,140,0.4)'; c.font = `10px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.t, m.x, m.y + 1); c.restore(); }
  });
  STANDUP_LAMPS.forEach((p, i) => { if (l.standups[i]) lit(c, p.x, p.y, 7, s.lamps.red); });
  if (l.spinnerLit) { glow(c, 82, 540, 14, s.lamps.green); arrow(c, 82, 540, -2.2, 17, s.lamps.green, true); }
  if (l.extraBallLit && blink) lit(c, MID, 535, 16, s.lamps.red);
  if (!game.extraBallUsed && !l.extraBallLit && slowBlink && game.state !== 'idle') { glow(c, 430, 494, 12, s.lamps.blue, 0.7); arrow(c, 430, 494, 0, 15, s.lamps.blue, true); }
  if (l.shootAgain || (l.ballSave && blink)) lit(c, MID, 880, 13, s.lamps.red);
}

function drawTargets(c, t, s) {
  c.save();
  c.lineCap = 'butt';
  for (const d of t.drops) {
    if (d.off) {
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(d.ax + 2, d.ay + 2); c.lineTo(d.bx + 2, d.by - 2); c.stroke();
      continue;
    }
    c.fillStyle = s.dropEdge; c.fillRect(d.ax - 3, d.ay, 9, d.by - d.ay);
    c.fillStyle = s.drop; c.fillRect(d.ax - 3, d.ay + 1, 6, d.by - d.ay - 2);
  }
  for (const u of t.standups) {
    c.fillStyle = '#222'; c.fillRect(u.ax - 3, u.ay, 6, u.by - u.ay);
    c.fillStyle = s.standup; c.fillRect(u.ax, u.ay + 1, 4, u.by - u.ay - 2);
  }
  c.restore();
}

function drawSpinner(c, game, s) {
  const sp = game.table.spinner, a = game.spin.angle;
  const h = Math.abs(Math.cos(a)) * 9 + 1.5;
  c.save();
  c.fillStyle = s.railShade; c.fillRect(sp.ax, sp.ay - 2, sp.len, 4);
  c.fillStyle = s.spinner;
  c.fillRect(sp.ax + 4, sp.ay - h / 2, sp.len - 8, h);
  c.restore();
}

function drawSaucer(c, t, s) {
  const { x, y } = t.saucer;
  c.save();
  const g = c.createRadialGradient(x, y, 2, x, y, 17);
  g.addColorStop(0, '#000'); g.addColorStop(0.75, '#111'); g.addColorStop(1, '#666');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 17, 0, TAU); c.fill();
  c.strokeStyle = s.rail; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 17, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
  c.restore();
}

function drawBumpers(c, t, game, s) {
  t.bumpers.forEach((b, i) => {
    const f = game.bumperFlash[i], litCap = game.lamps.bumpersLit;
    c.save();
    // Shadow, skirt, body, cap.
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(b.x + 3, b.y + 4, b.r + 3, 0, TAU); c.fill();
    c.fillStyle = s.bumper.skirt; c.beginPath(); c.arc(b.x, b.y, b.r + 2 - f * 2, 0, TAU); c.fill();
    c.fillStyle = s.bumper.body; c.beginPath(); c.arc(b.x, b.y, b.r - 4, 0, TAU); c.fill();
    if (litCap || f > 0) glow(c, b.x, b.y, b.r * 0.8, s.bumper.cap, Math.max(litCap ? 0.6 : 0, f));
    const g = c.createRadialGradient(b.x - 5, b.y - 6, 2, b.x, b.y, b.r - 6);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.35, f > 0.3 || litCap ? s.bumper.capLit : s.bumper.cap);
    g.addColorStop(1, s.bumper.ring);
    c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r - 7, 0, TAU); c.fill();
    if (s.bumper.mark) s.bumper.mark(c, b, s);
    else { c.fillStyle = 'rgba(0,0,0,0.5)'; star(c, b.x, b.y, 7, 3); }
    c.restore();
  });
}

function drawSlings(c, t, s) {
  for (const sl of t.slings) {
    const side = sl.side, X = x => (side === 1 ? x : PF_RIGHT - x);
    const kick = sl.flash || 0;
    c.save();
    // Rubber band: bowed out when it fires.
    c.strokeStyle = s.rubber; c.lineWidth = 6; c.lineCap = 'round';
    const mx = (sl.ax + sl.bx) / 2, my = (sl.ay + sl.by) / 2;
    const len = Math.hypot(sl.bx - sl.ax, sl.by - sl.ay);
    const nx = (sl.by - sl.ay) / len * side, ny = -Math.abs(sl.bx - sl.ax) / len;
    c.beginPath(); c.moveTo(sl.ax, sl.ay); c.quadraticCurveTo(mx + nx * kick * 10, my + ny * kick * 10, sl.bx, sl.by); c.stroke();
    // Plastic cover.
    c.beginPath();
    // Inset the triangle a little so the rubber shows around it.
    const [T, L, R] = SLING, cx = (T[0] + L[0] + R[0]) / 3, cy = (T[1] + L[1] + R[1]) / 3;
    const pt = p => [X(cx + (p[0] - cx) * 0.8), cy + (p[1] - cy) * 0.8];
    c.moveTo(...pt(T)); c.lineTo(...pt(L)); c.lineTo(...pt(R)); c.closePath();
    c.fillStyle = s.plastic; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = s.plasticEdge; c.lineWidth = 1.5; c.stroke();
    if (kick > 0) glow(c, X(cx), cy, 12, '#fff', kick);
    c.restore();
  }
}

function flipperPath(c, f, inset = 0) {
  const { px, py, tx, ty } = flipperEnds(f);
  const r0 = f.r0 - inset, r1 = f.r1 - inset;
  const a = Math.atan2(ty - py, tx - px);
  const off = Math.asin((r0 - r1) / f.len);
  c.beginPath();
  c.arc(px, py, r0, a + Math.PI / 2 + off, a - Math.PI / 2 - off);
  c.arc(tx, ty, r1, a - Math.PI / 2 - off, a + Math.PI / 2 + off);
  c.closePath();
}

function drawFlipper(c, f, s) {
  c.save();
  c.translate(2, 4); flipperPath(c, f); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.translate(-2, -4);
  flipperPath(c, f); c.fillStyle = s.flipperRubber; c.fill();
  flipperPath(c, f, 3); c.fillStyle = s.flipperBody; c.fill();
  c.fillStyle = '#9aa1ab'; c.beginPath(); c.arc(f.x, f.y, 3, 0, TAU); c.fill();
  c.restore();
}

function drawBall(c, b) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath(); c.arc(b.x + 3, b.y + 5, BALL_R, 0, TAU); c.fill();
  const g = c.createRadialGradient(b.x - 4.5, b.y - 5, 1, b.x, b.y, BALL_R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#e6e9ee'); g.addColorStop(0.7, '#8b929c'); g.addColorStop(1, '#3d434c');
  c.fillStyle = g;
  c.beginPath(); c.arc(b.x, b.y, BALL_R, 0, TAU); c.fill();
  // Reflections of the playfield lamps.
  c.fillStyle = 'rgba(255,200,120,0.35)';
  c.beginPath(); c.ellipse(b.x + 3, b.y + 6, 5, 2.2, 0, 0, TAU); c.fill();
  c.restore();
}

function drawPlunger(c, t, s) {
  const p = t.plunger, x = (p.x0 + p.x1) / 2, top = p.y + p.pull * p.travel;
  c.save();
  c.fillStyle = '#c9ced6'; c.fillRect(x - 3, top, 6, H - top);
  // Spring.
  c.strokeStyle = '#8a929e'; c.lineWidth = 1.5;
  c.beginPath();
  const coils = 7, y0 = top + 8, y1 = H - 6;
  for (let i = 0; i <= coils * 2; i++) c.lineTo(x + (i % 2 ? 9 : -9), y0 + (y1 - y0) * i / (coils * 2));
  c.stroke();
  c.fillStyle = s.flipperRubber; c.fillRect(x - 11, top, 22, 7);
  c.restore();
}

function drawApron(c, game, s) {
  c.save();
  c.beginPath();
  c.moveTo(0, 940); c.lineTo(108, 962); c.quadraticCurveTo(MID, 1000, PF_RIGHT - 108, 962); c.lineTo(PF_RIGHT, 940);
  c.lineTo(PF_RIGHT, H); c.lineTo(0, H); c.closePath();
  const g = c.createLinearGradient(0, 940, 0, H);
  g.addColorStop(0, s.apron[0]); g.addColorStop(1, s.apron[1]);
  c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2; c.stroke();
  c.fillStyle = s.apronInk;
  c.font = `34px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s.labels.title, MID, 1026);
  c.fillStyle = s.apronAccent;
  c.fillRect(MID - 120, 1005, 50, 4); c.fillRect(MID + 70, 1005, 50, 4);
  c.fillRect(MID - 120, 1046, 50, 4); c.fillRect(MID + 70, 1046, 50, 4);
  c.restore();
}

function drawDebug(c, t) {
  c.save();
  c.strokeStyle = 'lime'; c.lineWidth = 1;
  for (const w of t.walls) { if (w.off) continue; c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke(); }
  for (const p of t.circles) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.stroke(); }
  c.strokeStyle = 'magenta';
  for (const s of t.sensors) {
    c.beginPath();
    if (s.kind === 'line') { c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); } else c.arc(s.x, s.y, s.r, 0, TAU);
    c.stroke();
  }
  c.restore();
}
