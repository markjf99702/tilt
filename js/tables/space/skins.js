// Space's skins: the same table, painted differently. A skin sets the colours, the names printed on the playfield
// and the artwork behind everything; the geometry never changes. The first is early-90s airbrushed space opera, cut
// down to flat shapes that still read on a phone: deep violet, stars, nebulae and a ringed planet, neon plastics.

import { PF_RIGHT, MID, SLING } from './layout.js';

export const SKINS = {
  space: {
    id: 'space',
    name: 'Space',
    blurb: 'An early-90s table: deep space, a ringed planet and neon plastics.',
    theme: '#0a0824',
    font: 'Bungee',
    playfield: ['#120b33', '#0a0824', '#06051a'],
    rail: '#d6dbe3', railShade: '#5d6675',
    guide: '#c9ced6',
    rubber: '#f3efe6',
    post: '#2de2e6',
    plastic: '#ff3fa4', plasticEdge: '#9ff6ff',
    flipperBody: '#f7f3ea', flipperRubber: '#ff3fa4',
    bumper: { body: '#e9ecf5', skirt: '#2de2e6', cap: '#b48cff', capLit: '#efe3ff', ring: '#1a1a2a', mark: ringedPlanet },
    lamps: { yellow: '#ffd23f', red: '#ff4d4d', blue: '#53c8ff', green: '#5be37d', orange: '#ff9f1c', white: '#fff6dc', pink: '#ff3fa4', cyan: '#2de2e6' },
    // The planets' lamps, nearest the sun first.
    planets: ['#c9c2b8', '#ffd98a', '#4fa3ff', '#ff6a3d', '#ffb36b', '#f3d27a', '#8ff0f0', '#5b7cff'],
    apron: ['#1c1f2e', '#10121c'], apronInk: '#2de2e6', apronAccent: '#ff3fa4',
    ink: '#d8f6ff',
    labels: { title: 'SPACE', lanes: ['U', 'F', 'O'] },
    art: spaceArt,
  },
};

// A small ringed planet on each pop bumper's cap.
function ringedPlanet(c, b) {
  c.save();
  c.translate(b.x, b.y); c.rotate(-0.4);
  c.fillStyle = 'rgba(26,10,60,0.75)';
  c.beginPath(); c.arc(0, 0, 4.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(26,10,60,0.75)'; c.lineWidth = 1.6;
  c.beginPath(); c.ellipse(0, 0, 9, 2.6, 0, 0, Math.PI * 2); c.stroke();
  c.restore();
}

// Nebulae, stars, a ringed gas giant behind the pops (so they read as its moons) and a grid running away to the
// horizon between the slingshots.
function spaceArt(c) {
  c.save();
  // Nebulae: soft clouds of colour, magenta low on the left, teal on the right and violet under the ramp.
  for (const [x, y, r, col] of [[150, 620, 240, '255,63,164'], [360, 420, 200, '45,226,230'], [110, 300, 150, '120,70,255']]) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},0.22)`); g.addColorStop(0.5, `rgba(${col},0.08)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Stars, and a few bright ones that twinkle with four points.
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) {
    const x = rnd() * PF_RIGHT, y = 10 + rnd() * 920, r = 0.5 + rnd() * 1.3;
    c.fillStyle = `rgba(230,240,255,${0.3 + rnd() * 0.6})`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 10; i++) {
    const x = 20 + rnd() * (PF_RIGHT - 40), y = 40 + rnd() * 860, r = 4 + rnd() * 4;
    c.fillStyle = 'rgba(220,250,255,0.7)';
    c.beginPath();
    c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r * 0.6, y); c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r * 0.6, y); c.quadraticCurveTo(x, y, x, y - r);
    c.fill();
  }
  // The gas giant: banded orange to pink, its ring tilted across it, the back half of the ring behind it.
  const P = { x: 395, y: 250, r: 70 };
  c.save();
  c.translate(P.x, P.y); c.rotate(-0.35);
  c.strokeStyle = 'rgba(255,214,170,0.35)'; c.lineWidth = 7;
  c.beginPath(); c.ellipse(0, 0, P.r * 1.6, P.r * 0.42, 0, Math.PI, Math.PI * 2); c.stroke();
  const g = c.createLinearGradient(0, -P.r, 0, P.r);
  g.addColorStop(0, '#ffb35c'); g.addColorStop(0.45, '#ff6f7d'); g.addColorStop(1, '#a8307a');
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, P.r, 0, Math.PI * 2); c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  for (const [y, h] of [[-38, 9], [-14, 6], [8, 12], [34, 7]]) c.fillRect(-P.r, y, P.r * 2, h);
  const shade = c.createRadialGradient(-P.r * 0.35, -P.r * 0.4, P.r * 0.2, 0, 0, P.r * 1.1);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(10,0,40,0.55)');
  c.fillStyle = shade; c.fillRect(-P.r, -P.r, P.r * 2, P.r * 2);
  c.restore();
  c.strokeStyle = 'rgba(255,224,190,0.6)'; c.lineWidth = 7;
  c.beginPath(); c.ellipse(0, 0, P.r * 1.6, P.r * 0.42, 0, 0, Math.PI); c.stroke();
  c.restore();
  // A floor grid running away to a horizon between the slingshots.
  const [T, , R] = SLING, top = 760, vy = 600, x0 = T[0] + (R[0] - T[0]) * (top - T[1]) / (R[1] - T[1]);
  c.save();
  c.beginPath();
  c.moveTo(x0, top); c.lineTo(R[0], R[1]); c.lineTo(R[0], 1000);
  c.lineTo(PF_RIGHT - R[0], 1000); c.lineTo(PF_RIGHT - R[0], R[1]); c.lineTo(PF_RIGHT - x0, top);
  c.clip();
  c.strokeStyle = 'rgba(45,226,230,0.16)'; c.lineWidth = 1.2;
  c.beginPath();
  for (let i = -8; i <= 8; i++) { c.moveTo(MID + i * 40 * (top - vy) / (1000 - vy), top); c.lineTo(MID + i * 40, 1000); }
  for (let i = 1; i <= 7; i++) { const y = top + 240 * (1 - Math.pow(0.75, i)); c.moveTo(0, y); c.lineTo(PF_RIGHT, y); }
  c.stroke();
  c.restore();
  c.restore();
}
