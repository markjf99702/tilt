// How Space looks: its playfield and artwork, its lamps, the dock, the pops and slingshots, the ramp and the apron,
// drawn over its layout in a skin's colours. Balls on the playfield are drawn before the ramp and balls up on it
// after, so its clear plastic passes over the one and under the other.

import { W, H, PF_RIGHT, MID, SLING } from './layout.js';
import { insert, arrow, glow, lit, drawWalls, drawBall, drawFlipper, drawPlunger } from '../../render.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;

// Where the lamps sit on the playfield. Each shot has its colour, and its lamps sit on the line it's shot along:
// the ramp's from the left flipper (cyan), the dock's from the upper flipper (pink), the orbit's from the right (green).
const LANE_LAMP_Y = 170;
const PLANETS = [[128, 634], [159, 651], [191, 663], [226, 669], [260, 669], [295, 663], [328, 651], [358, 634]];
const MULT_LAMPS = ['2×', '3×', '4×', '5×'].map((t, i) => ({ t, x: MID + (i - 1.5) * 40, y: 724 }));
const RAMP_ARROW = { x: 210, y: 528, a: -90 * DEG }, DOCK_ARROW = { x: 300, y: 398, a: -125 * DEG }, ORBIT_ARROW = { x: 124, y: 556, a: -133 * DEG };
// Inserts with their words printed on them.
const PLATES = {
  rampJackpot: { x: 210, y: 566, w: 64, lines: ['JACKPOT'], color: 'yellow' },
  lightLock: { x: 210, y: 598, w: 82, lines: ['LIGHT LOCK'], color: 'orange' },
  lock: { x: 322, y: 429, w: 42, lines: ['LOCK'], color: 'orange' },
  dockJackpot: { x: 344, y: 460, w: 64, lines: ['JACKPOT'], color: 'yellow' },
  skill: { x: 366, y: 491, w: 48, lines: ['SKILL'], color: 'white' },
  extraBall: { x: 132, y: 598, w: 48, lines: ['EXTRA', 'BALL'], color: 'red' },
};
const PLASTIC = 14; // the ramp is clear plastic up to here along its rails; from here on it's a wire

// The static layer: everything that never changes.
export function paint(c, t, s) {
  // Outside the arch, then the playfield.
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

  // The shooter lane is plain and dark.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(PF_RIGHT, 300, W - PF_RIGHT, H);

  // The ramp's shadow on the playfield.
  c.save();
  c.translate(8, 12);
  c.fillStyle = 'rgba(0,0,0,0.28)'; rampFloor(c, t.ramp); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 3; wire(c, t.ramp); c.stroke();
  c.restore();

  dockFloor(c, t, s);

  // Thin orbits round the planets' lamps, as if round a sun up under the ramp's mouth.
  c.strokeStyle = 'rgba(216,246,255,0.16)'; c.lineWidth = 1;
  for (const k of [0.82, 1, 1.18]) { c.beginPath(); c.ellipse(MID, 560, 128 * k, 110 * k, 0, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke(); }

  // Lane labels and lamp sockets (unlit inserts).
  c.font = `16px ${s.font}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  t.laneX.forEach((x, i) => {
    c.fillStyle = s.ink; c.globalAlpha = 0.9;
    c.fillText(s.labels.lanes[i], x, 124);
    c.globalAlpha = 1;
    insert(c, x, LANE_LAMP_Y, 9, s.lamps.yellow);
  });
  PLANETS.forEach(([x, y], i) => insert(c, x, y, 10, s.planets[i]));
  MULT_LAMPS.forEach(m => insert(c, m.x, m.y, 14, s.lamps.orange, true));
  arrow(c, RAMP_ARROW.x, RAMP_ARROW.y, RAMP_ARROW.a, 17, s.lamps.cyan);
  arrow(c, DOCK_ARROW.x, DOCK_ARROW.y, DOCK_ARROW.a, 17, s.lamps.pink);
  arrow(c, ORBIT_ARROW.x, ORBIT_ARROW.y, ORBIT_ARROW.a, 17, s.lamps.green);
  for (const p of Object.values(PLATES)) plate(c, p, s, false);
  insert(c, MID, 880, 13, s.lamps.red);                // shoot again
  labels(c, s);
  c.restore();

  drawWalls(c, t, s);
  dockWalls(c, t, s);
  // The cabinet's edge over the arch.
  c.strokeStyle = '#1a1030'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, t.arc.y); c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0); c.lineTo(W, H); c.stroke();
}

// Each frame, over the static layer: lamps and the dock, balls on the playfield, what stands on it, the ramp,
// balls up on the ramp, then flippers, plunger and apron.
export function draw(c, game, s, now) {
  const t = game.table;
  const blink = Math.floor(now / 160) % 2 === 0, slowBlink = Math.floor(now / 400) % 2 === 0;
  drawLamps(c, game, s, blink, slowBlink);
  drawDock(c, game, s);
  for (const b of game.world.balls) if (!b.level) drawBall(c, b);
  drawBumpers(c, t, game, s);
  drawSlings(c, t, s);
  drawRamp(c, game, s);
  for (const b of game.world.balls) if (b.level) drawBall(c, b);
  for (const f of t.flippers) drawFlipper(c, f, s);
  drawPlunger(c, t, s);
  drawApron(c, s);
}

function labels(c, s) {
  c.save();
  c.font = `11px ${s.font}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = s.ink;
  words(c, 'SHOOT AGAIN', MID, 902);
  c.restore();
}

// Bungee's space all but disappears at these small sizes, so the words are set one at a time with a clear gap.
function words(c, text, x, y) {
  const ws = text.split(' '), widths = ws.map(w => c.measureText(w).width), gap = 5;
  let at = x - (widths.reduce((a, b) => a + b) + gap * (ws.length - 1)) / 2;
  c.save(); c.textAlign = 'left';
  ws.forEach((w, i) => { c.fillText(w, at, y); at += widths[i] + gap; });
  c.restore();
}

// A labelled insert: a rounded plate with its words on it, faint until it's lit.
function plate(c, p, s, on) {
  const color = s.lamps[p.color], h = 7 + 11 * p.lines.length;
  if (on) glow(c, p.x, p.y, p.w * 0.3, color);
  c.save();
  roundRect(c, p.x - p.w / 2, p.y - h / 2, p.w, h, 7);
  c.fillStyle = color; c.globalAlpha = on ? 1 : 0.22; c.fill();
  if (!on) { c.globalAlpha = 0.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.2; c.stroke(); }
  c.globalAlpha = on ? 1 : 0.8;
  c.fillStyle = on ? 'rgba(20,10,0,0.85)' : color;
  c.font = `11px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  p.lines.forEach((line, i) => words(c, line, p.x, p.y + 1 + (i - (p.lines.length - 1) / 2) * 11));
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawLamps(c, game, s, blink, slowBlink) {
  const l = game.lamps, t = game.table, L = s.lamps;
  t.laneX.forEach((x, i) => { if (l.lanes[i]) lit(c, x, LANE_LAMP_Y, 9, L.yellow); });
  // All eight planets lit flash before they go out.
  PLANETS.forEach(([x, y], i) => { if (i < l.planets && (l.planets < PLANETS.length || blink)) lit(c, x, y, 10, s.planets[i]); });
  MULT_LAMPS.forEach((m, i) => {
    if (l.mult >= i + 2) lit(c, m.x, m.y, 14, L.orange, m.t, s, true);
    else { c.save(); c.fillStyle = 'rgba(255,200,140,0.4)'; c.font = `10px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.t, m.x, m.y + 1); c.restore(); }
  });
  // Steady: lit. A slow blink: the next shot there moves something on. A fast blink: multiball's jackpot, the skill shot.
  const lightLock = !l.multiball && !l.lockLit, relight = l.multiball && !l.jackpotLit;
  if ((l.jackpotLit && blink) || (lightLock && slowBlink)) litArrow(c, RAMP_ARROW, L.cyan);
  if (l.jackpotLit && blink) plate(c, PLATES.rampJackpot, s, true);
  if (lightLock) plate(c, PLATES.lightLock, s, true);
  if ((l.skill && blink) || ((l.lockLit || relight) && slowBlink)) litArrow(c, DOCK_ARROW, L.pink);
  if (l.lockLit) plate(c, PLATES.lock, s, true);
  if (relight && slowBlink) plate(c, PLATES.dockJackpot, s, true);
  if (l.skill && blink) plate(c, PLATES.skill, s, true);
  if (l.extraBallLit && slowBlink) litArrow(c, ORBIT_ARROW, L.green);
  if (l.extraBallLit && blink) plate(c, PLATES.extraBall, s, true);
  if (l.shootAgain || (l.ballSave && blink)) lit(c, MID, 880, 13, L.red);
}

function litArrow(c, a, color) {
  glow(c, a.x, a.y, 13, color);
  arrow(c, a.x, a.y, a.a, 17, color, true);
}

// ---------- the dock ----------
// Its floor: a dark pit inside the U, a hexagonal docking pad under the catch and the lock, and arrowheads leading in.
function dockFloor(c, t, s) {
  const { dock: K, lockSpot: L } = t, x = (K.x + L.x) / 2, y = (K.y + L.y) / 2, a = Math.atan2(L.y - K.y, L.x - K.x);
  const [back, side1, side2] = t.walls.filter(w => w.kind === 'dock');
  c.save();
  c.beginPath();
  c.moveTo(side1.bx, side1.by); c.lineTo(back.ax, back.ay); c.lineTo(back.bx, back.by); c.lineTo(side2.bx, side2.by);
  c.fillStyle = 'rgba(2,0,10,0.7)'; c.fill();
  c.translate(x, y); c.rotate(a);
  c.beginPath();
  for (let i = 0; i < 6; i++) c.lineTo(Math.cos(i * TAU / 6) * 19, Math.sin(i * TAU / 6) * 19);
  c.closePath();
  c.strokeStyle = s.lamps.cyan; c.globalAlpha = 0.55; c.lineWidth = 1.5; c.stroke();
  c.globalAlpha = 0.7; c.fillStyle = s.lamps.pink;
  for (const [d, k] of [[-76, 1], [-94, 0.8]]) {
    c.beginPath(); c.moveTo(d, 0); c.lineTo(d - 14 * k, -8 * k); c.lineTo(d - 10 * k, 0); c.lineTo(d - 14 * k, 8 * k); c.closePath(); c.fill();
  }
  c.restore();
}

// Its walls: a chrome U, flared at the mouth.
function dockWalls(c, t, s) {
  c.save();
  c.lineCap = 'round';
  for (const [col, wid] of [[s.railShade, 9], [s.rail, 5]]) {
    c.strokeStyle = col; c.lineWidth = wid;
    for (const w of t.walls) if (w.kind === 'dock') { c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke(); }
  }
  c.restore();
}

// A ring round the dock while a ball is locked there, and a flash as the lift fires.
function drawDock(c, game, s) {
  const { dock: K, lockSpot: L } = game.table;
  if (game.world.balls.some(b => b.locked)) {
    c.save();
    glow(c, L.x, L.y, 14, s.lamps.cyan, 0.8);
    c.strokeStyle = s.lamps.cyan; c.lineWidth = 2.5;
    c.beginPath(); c.arc(L.x, L.y, 19, 0, TAU); c.stroke();
    c.restore();
  }
  if (game.liftFlash > 0) glow(c, K.x, K.y, 16, '#ffffff', game.liftFlash);
}

// ---------- the ramp ----------
// The outline of its plastic: from the mouth up one rail, round the hairpin and back down the other.
function rampFloor(c, r) {
  c.beginPath();
  c.moveTo(160, 478);
  for (let i = 0; i < PLASTIC; i++) c.lineTo(...r.left[i]);
  for (let i = PLASTIC - 1; i >= 0; i--) c.lineTo(...r.right[i]);
  c.lineTo(260, 478);
  c.closePath();
}

// The wire's two rails, from the end of the plastic down to the inlane.
function wire(c, r) {
  c.beginPath();
  for (const side of [r.left, r.right]) { c.moveTo(...side[PLASTIC - 1]); c.lineTo(...side[PLASTIC]); }
}

function drawRamp(c, game, s) {
  const r = game.table.ramp, l = game.lamps;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Where the ramp's underside meets the playfield: above this a ball rolls under it.
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 6;
  for (const w of game.table.walls) if (w.kind === 'ramp' && !w.level) { c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke(); }
  // Clear, faintly blue plastic, so what's under it shows through.
  rampFloor(c, r);
  c.fillStyle = 'rgba(110,220,255,0.18)'; c.fill();
  // Chevrons up the incline, lit while the jackpot is.
  c.strokeStyle = s.lamps.pink; c.lineWidth = 3.5; c.globalAlpha = l.jackpotLit ? 1 : 0.35;
  for (const y of [455, 425, 395, 365]) { c.beginPath(); c.moveTo(200, y + 9); c.lineTo(212, y); c.lineTo(224, y + 9); c.stroke(); }
  if (l.jackpotLit) glow(c, 212, 410, 22, s.lamps.pink, 0.6);
  c.globalAlpha = 1;
  // Chrome rails along both edges.
  for (const [col, wid] of [[s.railShade, 6], [s.rail, 3.6]]) {
    c.strokeStyle = col; c.lineWidth = wid;
    for (const [side, foot] of [[r.left, [160, 478]], [r.right, [260, 478]]]) {
      c.beginPath(); c.moveTo(...foot);
      for (let i = 0; i < PLASTIC; i++) c.lineTo(...side[i]);
      c.stroke();
    }
  }
  // The wire: two thin rails and their ties.
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.save(); c.translate(1, 2); wire(c, r); c.stroke(); c.restore();
  c.strokeStyle = s.rail; c.lineWidth = 2.2; wire(c, r); c.stroke();
  const [x0, top] = r.right[PLASTIC - 1], [x1] = r.left[PLASTIC - 1], end = r.right[PLASTIC][1];
  c.strokeStyle = s.railShade; c.lineWidth = 1.4;
  c.beginPath();
  for (let y = top + 25; y < end; y += 25) { c.moveTo(x0, y); c.lineTo(x1, y); }
  c.stroke();
  // The ramp's feet, at the mouth.
  for (const x of [160, 260]) {
    c.fillStyle = s.railShade; c.beginPath(); c.arc(x, 478, 7, 0, TAU); c.fill();
    c.fillStyle = s.rail; c.beginPath(); c.arc(x, 478, 4.5, 0, TAU); c.fill();
  }
  // The flasher on the hairpin, a dome on a chrome base: it fires with the jackpot.
  const f = game.flasher;
  if (f > 0) glow(c, 143, 196, 40, s.lamps.pink, f);
  c.fillStyle = s.railShade; roundRect(c, 131, 189, 24, 14, 4); c.fill();
  c.fillStyle = f > 0.2 ? '#ffe0f2' : 'rgba(255,63,164,0.75)';
  c.beginPath(); c.ellipse(143, 196, 9, 6, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(140, 193.5, 3.5, 1.6, 0, 0, TAU); c.fill();
  c.restore();
}

// ---------- pops, slingshots, apron ----------
function drawBumpers(c, t, game, s) {
  t.bumpers.forEach((b, i) => {
    const f = game.bumperFlash[i];
    c.save();
    // Shadow, skirt, body, cap.
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(b.x + 3, b.y + 4, b.r + 3, 0, TAU); c.fill();
    c.fillStyle = s.bumper.skirt; c.beginPath(); c.arc(b.x, b.y, b.r + 2 - f * 2, 0, TAU); c.fill();
    c.fillStyle = s.bumper.body; c.beginPath(); c.arc(b.x, b.y, b.r - 4, 0, TAU); c.fill();
    if (f > 0) glow(c, b.x, b.y, b.r * 0.8, s.bumper.cap, f);
    const g = c.createRadialGradient(b.x - 5, b.y - 6, 2, b.x, b.y, b.r - 6);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.35, f > 0.3 ? s.bumper.capLit : s.bumper.cap);
    g.addColorStop(1, s.bumper.ring);
    c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r - 7, 0, TAU); c.fill();
    s.bumper.mark(c, b, s);
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
    // Plastic cover, inset a little so the rubber shows round it.
    c.beginPath();
    const [T, L, R] = SLING, cx = (T[0] + L[0] + R[0]) / 3, cy = (T[1] + L[1] + R[1]) / 3;
    const pt = p => [X(cx + (p[0] - cx) * 0.8), cy + (p[1] - cy) * 0.8];
    c.moveTo(...pt(T)); c.lineTo(...pt(L)); c.lineTo(...pt(R)); c.closePath();
    c.fillStyle = s.plastic; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = s.plasticEdge; c.lineWidth = 1.5; c.stroke();
    if (kick > 0) glow(c, X(cx), cy, 12, '#fff', kick);
    c.restore();
  }
}

function drawApron(c, s) {
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
