// Haunted House's skin: an early-80s horror picture cut down to flat shapes that read on a phone. The house is a night
// of deep violet with a full moon, pumpkin-orange pops and a purple house whose windows glow mint when a ghost is in
// them; the basement is cold blue-grey stone under the house's floorboards.

import { PF_RIGHT } from './layout.js';

export const SKINS = {
  haunted: {
    id: 'haunted',
    name: 'Haunted House',
    theme: '#140c24',
    font: 'Bungee',
    playfield: ['#2b1c52', '#1b1036', '#0c0818'],
    cellar: ['#3a4250', '#262c37', '#171b22'],
    rail: '#cfc8dc', railShade: '#4a4458',
    guide: '#bdb6cc',
    rubber: '#e8e2d4',
    post: '#7dffb5',
    plastic: '#6a2fb0', plasticEdge: '#7dffb5',
    flipperBody: '#efe9df', flipperRubber: '#6a2fb0',
    bumper: { skirt: '#ff8a1c', cap: '#ff9f2e', capLit: '#ffe08a' }, // pumpkins: the skin, the glow when one fires, its face lit
    house: '#3d2266', houseEdge: '#a77bff', roof: '#24123f',
    ghost: '#c9ffe6', ghostGlow: '#7dffc4',
    lamps: { yellow: '#ffd23f', red: '#ff4d4d', green: '#7dffb5', orange: '#ff9f1c', candle: '#ffcf5a' },
    apron: ['#2a1d14', '#160f0a'], apronInk: '#7dffb5',
    ink: '#e9ddff',
    labels: { title: 'HAUNTED HOUSE', lanes: ['R', 'I', 'P'] },
    art: houseArt,
  },
};

// A full moon behind the top lanes, stars, a few bats, and faint damask wallpaper down the lower playfield.
function houseArt(c) {
  c.save();
  const g = c.createRadialGradient(410, 165, 10, 410, 165, 150);
  g.addColorStop(0, 'rgba(255,245,210,0.28)'); g.addColorStop(1, 'rgba(255,245,210,0)');
  c.fillStyle = g; c.fillRect(250, 0, 270, 330);
  c.fillStyle = '#f3ecd2'; c.beginPath(); c.arc(410, 165, 42, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(160,150,120,0.25)';
  for (const [x, y, r] of [[398, 152, 9], [424, 176, 6], [404, 186, 4]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  let seed = 13;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * PF_RIGHT, y = 20 + rnd() * 320, r = 0.5 + rnd() * 1.1;
    c.fillStyle = `rgba(235,230,255,${0.25 + rnd() * 0.5})`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = 'rgba(10,4,20,0.8)';
  for (const [x, y, k] of [[120, 120, 1], [345, 220, 0.8], [90, 230, 0.7]]) bat(c, x, y, k);
  // Wallpaper: rows of faint diamonds and dots.
  c.strokeStyle = 'rgba(200,170,255,0.06)'; c.lineWidth = 1.2;
  for (let y = 600; y < 1000; y += 34) for (let x = (y / 34) % 2 ? 17 : 0; x < PF_RIGHT; x += 34) {
    c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x + 9, y); c.lineTo(x, y + 12); c.lineTo(x - 9, y); c.closePath(); c.stroke();
  }
  c.restore();
}

function bat(c, x, y, k) {
  c.save(); c.translate(x, y); c.scale(k, k);
  c.beginPath();
  c.moveTo(0, 0); c.quadraticCurveTo(-8, -10, -24, -6); c.quadraticCurveTo(-18, -2, -20, 4); c.quadraticCurveTo(-12, 0, -8, 6);
  c.quadraticCurveTo(-4, 2, 0, 6); c.quadraticCurveTo(4, 2, 8, 6); c.quadraticCurveTo(12, 0, 20, 4); c.quadraticCurveTo(18, -2, 24, -6);
  c.quadraticCurveTo(8, -10, 0, 0); c.fill();
  c.restore();
}

