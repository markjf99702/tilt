// Draws a table. Whatever never changes (the playfield, its art and rails) is painted once into an offscreen
// canvas, again whenever the window, the table or the skin changes; each frame the table draws its lamps,
// moving parts and balls on top. The helpers below are shared by every table's own drawing.

import { BALL_R, flipperEnds } from './physics.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.table = null; // the table's module (from tables.js); game.table is the layout it built
    this.skin = null;
    this.debug = /[?&]debug\b/.test(location.search);
  }

  // Fits the table into the canvas's box, centred, as large as it goes.
  resize(cssW, cssH, dpr) {
    const { W, H } = this.table;
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

  setTable(table) { this.table = table; this.dirty = true; }
  setSkin(skin) { this.skin = skin; this.dirty = true; }

  paintStatic(t) {
    const { W, H } = this.table;
    const k = this.scale * this.dpr;
    this.layer.width = Math.ceil(W * k);
    this.layer.height = Math.ceil(H * k);
    const c = this.layer.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    this.table.paint(c, t, this.skin);
    this.dirty = false;
  }

  draw(game, now) {
    const { ctx, skin } = this;
    const t = game.table;
    if (this.dirty) this.paintStatic(t);
    const k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    ctx.drawImage(this.layer, 0, 0, this.layer.width, this.layer.height, 0, 0, this.layer.width / k, this.layer.height / k);

    this.table.draw(ctx, game, skin, now);
    if (game.tilted) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, this.table.W, this.table.H);
    }
    if (this.debug) drawDebug(ctx, t);
  }
}

// ---------- the static layer ----------
// Rails, guides, rubbers, gate wires and posts: the parts of a layout that never move. They are told apart by
// kind ('rail', 'guide', 'rubber', 'gate'; circles 'post' or 'rail'); walls and circles of any other kind are
// left for the table to draw itself.
export function drawWalls(c, t, s) {
  // Rails, guides and rubbers.
  c.lineCap = 'round';
  for (const w of t.walls) {
    if (w.kind === 'rail') {
      c.strokeStyle = s.railShade; c.lineWidth = Math.max(5, w.r * 2 + 4);
      line(c, w); c.strokeStyle = s.rail; c.lineWidth = Math.max(2.5, w.r * 2 + 1); line(c, w);
    } else if (w.kind === 'guide') {
      c.strokeStyle = s.railShade; c.lineWidth = w.r * 2 + 2; line(c, w);
      c.strokeStyle = s.guide; c.lineWidth = w.r * 2 - 1; line(c, w);
    } else if (w.kind === 'rubber') {
      c.strokeStyle = s.rubber; c.lineWidth = w.r * 2; line(c, w);
    }
  }
  // Gate wires.
  for (const w of t.walls) if (w.kind === 'gate') { c.strokeStyle = s.rail; c.lineWidth = 2; line(c, w); }
  // Posts.
  for (const p of t.circles) {
    if (p.kind !== 'post' && p.kind !== 'rail') continue;
    c.fillStyle = s.rubber; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
    c.fillStyle = s.post; c.beginPath(); c.arc(p.x, p.y, p.r * 0.45, 0, TAU); c.fill();
  }
}

export function insert(c, x, y, r, color, square) {
  c.save();
  c.fillStyle = color; c.globalAlpha = 0.22;
  c.beginPath();
  if (square) roundRect(c, x - r, y - r * 0.7, r * 2, r * 1.4, 4); else c.arc(x, y, r, 0, TAU);
  c.fill();
  c.globalAlpha = 0.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.2; c.stroke();
  c.restore();
}

export function arrow(c, x, y, ang, r, color, lit) {
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
export function glow(c, x, y, r, color, a = 1) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.55 * a; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
  c.restore();
}

export function lit(c, x, y, r, color, label, s, square) {
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

export function drawFlipper(c, f, s) {
  c.save();
  c.translate(2, 4); flipperPath(c, f); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.translate(-2, -4);
  flipperPath(c, f); c.fillStyle = s.flipperRubber; c.fill();
  flipperPath(c, f, 3); c.fillStyle = s.flipperBody; c.fill();
  c.fillStyle = '#9aa1ab'; c.beginPath(); c.arc(f.x, f.y, 3, 0, TAU); c.fill();
  c.restore();
}

export function drawBall(c, b) {
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

export function drawPlunger(c, t, s) {
  const p = t.plunger, x = (p.x0 + p.x1) / 2, top = p.y + p.pull * p.travel;
  c.save();
  c.fillStyle = '#c9ced6'; c.fillRect(x - 3, top, 6, t.H - top);
  // Spring.
  c.strokeStyle = '#8a929e'; c.lineWidth = 1.5;
  c.beginPath();
  const coils = 7, y0 = top + 8, y1 = t.H - 6;
  for (let i = 0; i <= coils * 2; i++) c.lineTo(x + (i % 2 ? 9 : -9), y0 + (y1 - y0) * i / (coils * 2));
  c.stroke();
  c.fillStyle = s.flipperRubber; c.fillRect(x - 11, top, 22, 7);
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
