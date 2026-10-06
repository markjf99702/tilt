// Skins: the same table, painted differently. A skin sets the colours, the names printed on the playfield,
// the artwork behind everything and the sounds' character. The geometry never changes, so every skin
// plays the same.

import { W, PF_RIGHT, MID } from './layout.js';

export const SKINS = {
  classic: {
    id: 'classic',
    name: 'Classic',
    blurb: 'A late-70s solid-state table: midnight blue, sunbursts and chrome.',
    theme: '#0b1838',
    font: 'Bungee',
    playfield: ['#1a3a7a', '#0e2152', '#0a1636'],
    rail: '#d6dbe3', railShade: '#5d6675',
    guide: '#c9ced6',
    rubber: '#f3efe6',
    post: '#e9b949',
    plastic: '#e63946', plasticEdge: '#ffd6a5',
    flipperBody: '#f7f3ea', flipperRubber: '#d62828',
    bumper: { body: '#f7f3ea', skirt: '#d62828', cap: '#ffcf3f', capLit: '#fff3b0', ring: '#2a2a2a' },
    drop: '#ffcf3f', dropEdge: '#9a6c00',
    standup: '#ff5a5a',
    spinner: '#e8ecf2',
    lamps: { yellow: '#ffd23f', red: '#ff4d4d', blue: '#53c8ff', green: '#5be37d', orange: '#ff9f1c', white: '#fff6dc' },
    apron: ['#e9e2d0', '#cfc6af'], apronInk: '#1a3a7a', apronAccent: '#d62828',
    ink: '#ffe9b0',
    labels: { title: 'TILT', lanes: ['A', 'B', 'C'], saucer: 'Kickout', drops: 'Extra ball', spinner: 'Spinner' },
    art: classicArt,
  },
};

// Sunbursts behind the bumpers, a band of stripes and stars: the kind of art a 1978 table had.
function classicArt(ctx, s) {
  ctx.save();
  // Rays from behind the bumpers.
  const cx = MID, cy = 300;
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2, a1 = a0 + Math.PI / 36;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 900, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fill();
  }
  // A warm glow under the bumpers.
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
  g.addColorStop(0, 'rgba(255,190,80,0.32)');
  g.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 700);
  // Stripes sweeping across the lower playfield.
  const stripes = ['#d62828', '#f77f00', '#fcbf49'];
  stripes.forEach((c, i) => {
    ctx.beginPath();
    ctx.moveTo(0, 590 + i * 16);
    ctx.bezierCurveTo(160, 540 + i * 16, 330, 640 + i * 16, PF_RIGHT, 575 + i * 16);
    ctx.lineTo(PF_RIGHT, 585 + i * 16);
    ctx.bezierCurveTo(330, 650 + i * 16, 160, 550 + i * 16, 0, 600 + i * 16);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.55;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  // Stars.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * PF_RIGHT, y = 40 + rnd() * 860, r = 0.6 + rnd() * 1.6;
    ctx.fillStyle = `rgba(255,240,200,${0.25 + rnd() * 0.5})`;
    star(ctx, x, y, r * 2.2, r * 0.8);
  }
  ctx.restore();
}

export function star(ctx, x, y, R, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / points, rr = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
