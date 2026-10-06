// How Classic looks: its playfield and artwork, its lamps, targets, spinner, saucer, bumpers, slingshots and
// apron, drawn over its layout in a skin's colours.

import { W, H, PF_RIGHT, MID, SLING } from './layout.js';
import { star } from './skins.js';
import { insert, arrow, glow, lit, drawWalls, drawBall, drawFlipper, drawPlunger } from '../../render.js';

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

// The static layer: everything that never changes.
export function paint(c, t, s) {
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

  drawWalls(c, t, s);
  // Wooden cabinet rails over the edge of the arch.
  c.strokeStyle = '#2a1a10'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, t.arc.y); c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0); c.lineTo(W, H); c.stroke();
}

// Each frame, over the static layer: lamps and toys, the balls, then what stands above them.
export function draw(c, game, s, now) {
  const t = game.table;
  const blink = Math.floor(now / 160) % 2 === 0, slowBlink = Math.floor(now / 400) % 2 === 0;
  drawLamps(c, game, s, blink, slowBlink);
  drawTargets(c, t, s);
  drawSpinner(c, game, s);
  drawSaucer(c, t, s);
  for (const b of game.world.balls) drawBall(c, b);
  drawBumpers(c, t, game, s);
  drawSlings(c, t, s);
  for (const f of t.flippers) drawFlipper(c, f, s);
  drawPlunger(c, t, s);
  drawApron(c, game, s);
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
