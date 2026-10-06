// How Haunted House looks: the house and the basement, each floor painted over its own layout in the skin's colours.
// Each frame only the floor asked for is drawn: its lamps, toys, balls and flippers.

import { W, H, PF_RIGHT, MID, SLING, BASEMENT } from './layout.js';
import { insert, arrow, glow, lit, drawWalls, drawBall, drawFlipper, drawPlunger } from '../../render.js';

const TAU = Math.PI * 2;

// Where the lamps sit on the house's playfield.
const LANE_LAMP_Y = 172;
const MULT_LAMPS = ['2×', '3×', '4×', '5×'].map((t, i) => ({ t, x: MID + (i - 1.5) * 40, y: 724 }));
const DOOR_ARROW = { x: MID, y: 540, a: -Math.PI / 2 };
// Each ghost's lamp, and where the ghost shows itself while it glows: in its window, or beside its target on the rails.
const GHOST_LAMPS = [[84, 393], [192, 462], [294, 462], [440, 490]];
const GHOST_AT = [[80, 393], [200, 413], [286, 413], [446, 490]];
// And in the basement: the arrow up the treads, pointing at the lamp at the top of the stairs.
const STAIRS_ARROW = { x: 404, y: 545, a: -1.29 };
const EXTRA_BALL = { x: 398, y: 610 };

const on = floor => o => (o.level || 0) === floor;

// ---------- the static layers ----------
export function paint(c, t, s, floor) {
  if (floor === BASEMENT) { paintBasement(c, t, s); return; }
  c.fillStyle = '#05070d';
  c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath();
  c.moveTo(0, H); c.lineTo(0, t.arc.y); c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0); c.lineTo(W, H); c.closePath();
  c.clip();
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.playfield[0]); g.addColorStop(0.55, s.playfield[1]); g.addColorStop(1, s.playfield[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  s.art(c, s);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(PF_RIGHT, 300, W - PF_RIGHT, H);
  // Tombstones over the top lanes, with their letters.
  c.textAlign = 'center'; c.textBaseline = 'middle';
  t.laneX.forEach((x, i) => {
    c.fillStyle = 'rgba(150,140,170,0.35)';
    c.beginPath(); c.moveTo(x - 14, 116); c.lineTo(x - 14, 92); c.arc(x, 92, 14, Math.PI, 0); c.lineTo(x + 14, 116); c.closePath(); c.fill();
    c.fillStyle = s.ink; c.font = `15px ${s.font}`; c.fillText(s.labels.lanes[i], x, 100);
    insert(c, x, LANE_LAMP_Y, 10, s.lamps.yellow);
  });
  // The hallway's runner and the trapdoor's hatch in it, then the house over them (its door is drawn each frame).
  c.fillStyle = '#5a1020'; c.fillRect(225, 395, 36, 47);
  hatch(c, t.trapdoor.x, t.trapdoor.y, 15, '#3a2412');
  house(c, s);
  arrow(c, DOOR_ARROW.x, DOOR_ARROW.y, DOOR_ARROW.a, 17, s.lamps.green);
  GHOST_LAMPS.forEach(([x, y]) => insert(c, x, y, 7, s.ghostGlow));
  MULT_LAMPS.forEach(m => insert(c, m.x, m.y, 14, s.lamps.orange, true));
  insert(c, MID, 880, 13, s.lamps.red);
  // The cellar door, in the right inlane: the ball comes back up here.
  hatch(c, t.cellar.x, t.cellar.y, 14, '#4a3018');
  c.fillStyle = s.ink; c.font = `9px ${s.font}`;
  c.fillText('CELLAR', t.cellar.x + 5, t.cellar.y - 30);
  c.font = `11px ${s.font}`; words(c, 'SHOOT AGAIN', MID, 902);
  c.restore();
  drawWalls(c, { walls: t.walls.filter(on(0)), circles: t.circles.filter(on(0)) }, s);
  c.strokeStyle = '#1a1030'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, t.arc.y); c.arc(t.arc.x, t.arc.y, t.arc.r, Math.PI, 0); c.lineTo(W, H); c.stroke();
}

// The house: a purple plastic front with a pitched roof, a window either side of the door.
function house(c, s) {
  c.save();
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(176, 420); c.lineTo(176, 380); c.lineTo(MID, 330); c.lineTo(310, 380); c.lineTo(310, 420); c.lineTo(264, 440);
  c.lineTo(264, 392); c.lineTo(222, 392); c.lineTo(222, 440); c.closePath();
  c.fillStyle = s.house; c.fill();
  c.strokeStyle = s.houseEdge; c.lineWidth = 3; c.stroke();
  c.beginPath(); c.moveTo(168, 384); c.lineTo(MID, 326); c.lineTo(318, 384); c.strokeStyle = s.roof; c.lineWidth = 9; c.stroke();
  // A round attic window.
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(MID, 360, 9, 0, TAU); c.fill();
  c.strokeStyle = s.houseEdge; c.lineWidth = 1.5; c.stroke();
  // Window frames over the ghost targets.
  for (const sx of [1, -1]) {
    const X = x => (sx === 1 ? x : PF_RIGHT - x);
    c.fillStyle = 'rgba(5,0,15,0.7)';
    c.beginPath(); c.moveTo(X(186), 400); c.lineTo(X(210), 400); c.lineTo(X(210), 424); c.lineTo(X(186), 414); c.closePath(); c.fill();
    c.strokeStyle = s.houseEdge; c.lineWidth = 1.5; c.stroke();
  }
  c.restore();
}

// A square wooden hatch in the floor.
function hatch(c, x, y, r, wood) {
  c.save();
  c.fillStyle = wood; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.2;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - r, y - r + i * r / 2); c.lineTo(x + r, y - r + i * r / 2); c.stroke(); }
  c.strokeStyle = '#8a8a8a'; c.lineWidth = 2; c.strokeRect(x - r, y - r, r * 2, r * 2);
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

// A candle on its brass dish, burning or waiting to be lit.
function candle(c, x, y, burning, s) {
  c.save();
  c.fillStyle = '#9a7a3a'; c.fillRect(x - 7, y + 9, 14, 3);
  c.fillStyle = burning ? '#fff3d6' : 'rgba(255,243,214,0.7)'; c.fillRect(x - 4, y - 4, 8, 14);
  if (burning) { glow(c, x, y - 9, 6, s.lamps.candle); c.fillStyle = s.lamps.candle; c.beginPath(); c.ellipse(x, y - 9, 3, 5, 0, 0, TAU); c.fill(); }
  else {
    // A black wick with an ember on it.
    c.fillStyle = '#1a0e06'; c.fillRect(x - 0.8, y - 9, 1.6, 5);
    c.fillStyle = 'rgba(255,110,40,0.8)'; c.beginPath(); c.arc(x, y - 9, 1.3, 0, TAU); c.fill();
  }
  c.restore();
}

function paintBasement(c, t, s) {
  // The underside of the house's floor: joists and boards, lit by a bare bulb.
  c.fillStyle = '#1a120c'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#2c1e14'; for (let x = 0; x < W; x += 26) c.fillRect(x, 0, 18, 440);
  c.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = 18; x < W; x += 26) c.fillRect(x, 0, 8, 440);
  c.fillStyle = '#3a2818'; for (const y of [60, 190, 320]) c.fillRect(0, y, W, 22);
  const g = c.createRadialGradient(330, 300, 5, 330, 300, 240);
  g.addColorStop(0, 'rgba(255,200,120,0.35)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, 600);
  c.fillStyle = '#ffe9b0'; c.beginPath(); c.arc(330, 300, 7, 0, TAU); c.fill();
  c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(330, 293); c.lineTo(330, 240); c.stroke();
  // The chute: a wooden trough from the trapdoor down to the corner.
  c.save();
  c.beginPath(); c.moveTo(230, 226); c.lineTo(256, 250); c.lineTo(100, 432); c.lineTo(40, 449); c.closePath();
  c.fillStyle = '#4a3220'; c.fill();
  c.restore();
  hatch(c, 243, 238, 16, '#120a06');
  // The basement's floor: flagstones.
  c.save();
  c.beginPath();
  c.moveTo(40, 449); c.lineTo(100, 432); c.lineTo(412, 432); c.lineTo(446, 470); c.lineTo(446, 880); c.lineTo(344, 912);
  c.lineTo(344, H); c.lineTo(142, H); c.lineTo(142, 912); c.lineTo(40, 880); c.closePath();
  const f = c.createLinearGradient(0, 432, 0, H);
  f.addColorStop(0, s.cellar[0]); f.addColorStop(0.5, s.cellar[1]); f.addColorStop(1, s.cellar[2]);
  c.fillStyle = f; c.fill();
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2;
  for (let y = 432, row = 0; y < H; y += 44, row++) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    for (let x = (row % 2) * 35; x < W; x += 70) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 44); c.stroke(); }
  }
  // The stairs: wooden treads rising into the top right corner.
  c.fillStyle = '#5a3a20';
  for (let i = 0; i < 6; i++) { const y = 470 + i * 16, x0 = 384 - i * 6; c.fillRect(x0, y, 446 - x0, 9); }
  c.restore();
  arrow(c, STAIRS_ARROW.x, STAIRS_ARROW.y, STAIRS_ARROW.a, 16, s.lamps.green);
  insert(c, t.stairs.x, t.stairs.y, 9, s.lamps.green);
  // The coffin, a brass cross on its lid.
  c.save();
  c.beginPath(); c.moveTo(220, 455); c.lineTo(266, 455); c.lineTo(300, 500); c.lineTo(290, 548); c.lineTo(196, 548); c.lineTo(186, 500); c.closePath();
  c.fillStyle = '#4a2a18'; c.fill(); c.strokeStyle = '#2a160a'; c.lineWidth = 6; c.stroke();
  c.strokeStyle = '#8a5a30'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#c9a050'; c.fillRect(239, 470, 8, 36); c.fillRect(227, 480, 32, 8);
  c.restore();
  insert(c, MID, 880, 13, s.lamps.red);
  insert(c, EXTRA_BALL.x, EXTRA_BALL.y, 8, s.lamps.red);
  c.fillStyle = s.ink; c.font = `11px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  words(c, 'SHOOT AGAIN', MID, 902);
  words(c, 'EXTRA BALL', EXTRA_BALL.x, EXTRA_BALL.y - 18);
  drawWalls(c, { walls: t.walls.filter(on(BASEMENT)), circles: t.circles.filter(on(BASEMENT)) }, s);
  // The chute's sides and the stone walls.
  c.save(); c.lineCap = 'round';
  for (const w of t.walls) if (w.level === BASEMENT && (w.kind === 'chute' || w.kind === 'stone')) {
    c.strokeStyle = w.kind === 'chute' ? '#7a5532' : '#8a8f9a'; c.lineWidth = w.r * 2 + 2;
    c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke();
  }
  c.restore();
}

// ---------- each frame ----------
export function draw(c, game, s, now, floor) {
  const t = game.table;
  const blink = Math.floor(now / 160) % 2 === 0, slowBlink = Math.floor(now / 400) % 2 === 0;
  if (floor === BASEMENT) {
    drawLids(c, t, s);
    if (game.lamps.extraBallLit && blink) lit(c, EXTRA_BALL.x, EXTRA_BALL.y, 8, s.lamps.red);
    if (slowBlink || game.lamps.extraBallLit) {
      glow(c, STAIRS_ARROW.x, STAIRS_ARROW.y, 12, s.lamps.green); arrow(c, STAIRS_ARROW.x, STAIRS_ARROW.y, STAIRS_ARROW.a, 16, s.lamps.green, true);
      lit(c, t.stairs.x, t.stairs.y, 9, s.lamps.green);
    }
    if (game.lamps.shootAgain || (game.lamps.ballSave && blink)) lit(c, MID, 880, 13, s.lamps.red);
    for (const b of game.world.balls) if (b.level === BASEMENT) heldBall(c, b, game);
    drawSlings(c, t, s, BASEMENT);
    for (const f of t.flippers) if (f.level === BASEMENT) drawFlipper(c, f, s);
    drawApron(c, s, 'BASEMENT');
    return;
  }
  drawLamps(c, game, s, blink, slowBlink);
  drawDoor(c, game, s, slowBlink);
  drawGhosts(c, game, s, now);
  for (const b of game.world.balls) if (!b.level) heldBall(c, b, game);
  drawBumpers(c, t, game, s);
  drawSlings(c, t, s, 0);
  for (const f of t.flippers) if (!f.level) drawFlipper(c, f, s);
  drawPlunger(c, t, s);
  drawApron(c, s, s.labels.title);
}

// A ball going down through the trapdoor shrinks into it.
function heldBall(c, b, game) {
  const left = b.held ? (b.held.until - game.time) : 0;
  if (b.trip === 'down') {
    const k = Math.max(0.15, Math.min(1, left / game.wsecs(0.4)));
    c.save(); c.translate(b.x, b.y); c.scale(k, k); c.translate(-b.x, -b.y); drawBall(c, b); c.restore();
  } else drawBall(c, b);
}

function drawLamps(c, game, s, blink, slowBlink) {
  const l = game.lamps, t = game.table, L = s.lamps;
  t.laneX.forEach((x, i) => { if (l.lanes[i] || (l.skillLane === i && blink)) lit(c, x, LANE_LAMP_Y, 10, L.yellow); });
  MULT_LAMPS.forEach((m, i) => {
    if (l.mult >= i + 2) lit(c, m.x, m.y, 14, L.orange, m.t, s, true);
    else { c.save(); c.fillStyle = 'rgba(255,200,140,0.4)'; c.font = `10px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.t, m.x, m.y + 1); c.restore(); }
  });
  // The candles under the door: one for each ghost it needs, lit as they're caught; all lit while it's open.
  for (let i = 0; i < l.need; i++) {
    const k = i - (l.need - 1) / 2;
    candle(c, MID + k * 22, 488 - Math.abs(k) * 4, l.doorOpen || i < l.caught, s);
  }
  if (l.doorOpen && slowBlink) { glow(c, DOOR_ARROW.x, DOOR_ARROW.y, 13, L.green); arrow(c, DOOR_ARROW.x, DOOR_ARROW.y, DOOR_ARROW.a, 17, L.green, true); }
  game.ghosts.forEach((g, i) => { if (g.lit) lit(c, GHOST_LAMPS[i][0], GHOST_LAMPS[i][1], 7, s.ghostGlow); });
  if (l.shootAgain || (l.ballSave && blink)) lit(c, MID, 880, 13, L.red);
}

// The front door: shut, a plank door across the hallway; open, swung back against the wall, with the trapdoor open in
// the floor behind it, glowing green.
function drawDoor(c, game, s, slowBlink) {
  const t = game.table;
  c.save();
  if (game.lamps.doorOpen || game.world.balls.some(b => b.trip === 'down')) {
    c.fillStyle = '#05010a'; c.beginPath(); c.arc(t.trapdoor.x, t.trapdoor.y, 15, 0, TAU); c.fill();
    glow(c, t.trapdoor.x, t.trapdoor.y, 12, s.lamps.green, slowBlink ? 0.9 : 0.5);
    c.strokeStyle = s.lamps.green; c.globalAlpha = slowBlink ? 1 : 0.5; c.lineWidth = 2.5;
    c.beginPath(); c.arc(t.trapdoor.x, t.trapdoor.y, 15, 0, TAU); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = '#6a3f1e'; c.fillRect(225, 396, 5, 40);
  } else {
    c.fillStyle = '#6a3f1e'; c.fillRect(226, 395, 34, 52);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.2;
    c.beginPath();
    for (const x of [234.5, 243, 251.5]) { c.moveTo(x, 395); c.lineTo(x, 447); }
    c.stroke();
    c.fillStyle = '#c9a050'; c.beginPath(); c.arc(255, 424, 2.2, 0, TAU); c.fill();
  }
  c.restore();
}

// The ghost targets: faint while they're dark; while one glows its target lights up and the ghost shows itself, and it
// flickers in its last moments.
function drawGhosts(c, game, s, now) {
  game.table.ghosts.forEach((w, i) => {
    const g = game.ghosts[i], [x, y] = GHOST_AT[i];
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = g.lit ? s.ghost : 'rgba(201,255,230,0.4)'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(w.ax, w.ay); c.lineTo(w.bx, w.by); c.stroke();
    c.restore();
    const going = g.until - game.time < game.wsecs(0.8);
    if (g.lit && !(going && Math.floor(now / 70) % 2 === 0)) {
      glow(c, x, y, 12, s.ghostGlow);
      sheet(c, x, y, 10, s);
    }
  });
}

// A ghost: a sheet with a round head, a ragged hem and two eyes.
function sheet(c, x, y, r, s) {
  c.fillStyle = s.ghost;
  c.beginPath();
  c.arc(x, y - r * 0.2, r, Math.PI, 0);
  c.lineTo(x + r, y + r);
  for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + r * (0.75 - i * 0.5), y + r * (i % 2 ? 0.6 : 1.3), x + r * (0.5 - i * 0.5), y + r);
  c.closePath(); c.fill();
  c.fillStyle = '#1b1036';
  c.beginPath(); c.arc(x - r * 0.35, y - r * 0.15, r * 0.16, 0, TAU); c.arc(x + r * 0.35, y - r * 0.15, r * 0.16, 0, TAU); c.fill();
}

function drawBumpers(c, t, game, s) {
  t.bumpers.forEach((b, i) => {
    const f = game.bumperFlash[i];
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(b.x + 3, b.y + 4, b.r + 3, 0, TAU); c.fill();
    if (f > 0) glow(c, b.x, b.y, b.r * 0.9, s.bumper.cap, f);
    c.fillStyle = s.bumper.skirt; c.beginPath(); c.ellipse(b.x, b.y, b.r + 1 - f * 2, b.r - 2 - f * 2, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(120,50,0,0.6)'; c.lineWidth = 1.5;
    for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(b.x + k * b.r, b.y, b.r * 0.35, b.r - 3, 0, 0, TAU); c.stroke(); }
    c.fillStyle = '#3a7a1a'; c.fillRect(b.x - 2.5, b.y - b.r - 2, 5, 7);
    // The face, lit from inside when it fires.
    c.fillStyle = f > 0.3 ? s.bumper.capLit : '#3a1600';
    c.beginPath(); c.moveTo(b.x - 11, b.y - 3); c.lineTo(b.x - 5, b.y - 9); c.lineTo(b.x - 3, b.y - 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(b.x + 11, b.y - 3); c.lineTo(b.x + 5, b.y - 9); c.lineTo(b.x + 3, b.y - 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(b.x - 12, b.y + 4); c.quadraticCurveTo(b.x, b.y + 16, b.x + 12, b.y + 4); c.quadraticCurveTo(b.x, b.y + 9, b.x - 12, b.y + 4); c.fill();
    c.restore();
  });
}

function drawSlings(c, t, s, floor) {
  for (const sl of t.slings) {
    if ((sl.level || 0) !== floor) continue;
    const side = sl.side, X = x => (side === 1 ? x : PF_RIGHT - x);
    const kick = sl.flash || 0;
    c.save();
    c.strokeStyle = s.rubber; c.lineWidth = 6; c.lineCap = 'round';
    const mx = (sl.ax + sl.bx) / 2, my = (sl.ay + sl.by) / 2;
    const len = Math.hypot(sl.bx - sl.ax, sl.by - sl.ay);
    const nx = (sl.by - sl.ay) / len * side, ny = -Math.abs(sl.bx - sl.ax) / len;
    c.beginPath(); c.moveTo(sl.ax, sl.ay); c.quadraticCurveTo(mx + nx * kick * 10, my + ny * kick * 10, sl.bx, sl.by); c.stroke();
    c.beginPath();
    const [T, L, R] = SLING, cx = (T[0] + L[0] + R[0]) / 3, cy = (T[1] + L[1] + R[1]) / 3;
    const pt = p => [X(cx + (p[0] - cx) * 0.8), cy + (p[1] - cy) * 0.8];
    c.moveTo(...pt(T)); c.lineTo(...pt(L)); c.lineTo(...pt(R)); c.closePath();
    c.fillStyle = floor ? '#5a4a3a' : s.plastic; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = floor ? '#a08060' : s.plasticEdge; c.lineWidth = 1.5; c.stroke();
    if (kick > 0) glow(c, X(cx), cy, 12, '#fff', kick);
    c.restore();
  }
}

function drawLids(c, t, s) {
  c.save();
  for (const d of t.lids) {
    if (d.off) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(d.ax, d.ay - 2, d.bx - d.ax, 4); continue; }
    c.fillStyle = '#7a4a24'; c.fillRect(d.ax - 1, d.ay - 5, d.bx - d.ax + 2, 10);
    c.fillStyle = '#e0b860'; c.fillRect((d.ax + d.bx) / 2 - 4, d.ay - 1.5, 8, 3);
  }
  c.restore();
}

function drawApron(c, s, title) {
  c.save();
  c.beginPath();
  c.moveTo(0, 940); c.lineTo(108, 962); c.quadraticCurveTo(MID, 1000, PF_RIGHT - 108, 962); c.lineTo(PF_RIGHT, 940);
  c.lineTo(PF_RIGHT, H); c.lineTo(0, H); c.closePath();
  const g = c.createLinearGradient(0, 940, 0, H);
  g.addColorStop(0, s.apron[0]); g.addColorStop(1, s.apron[1]);
  c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2; c.stroke();
  c.fillStyle = s.apronInk;
  c.font = `30px ${s.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(title, MID, 1026);
  c.restore();
}
