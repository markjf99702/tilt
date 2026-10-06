// The table: Haunted House, in millimetres. Two playfields in one cabinet, a level apart: the house, and under it the
// basement, a smaller playfield with flippers of its own. A ball only meets the walls, posts, sensors and flippers of
// the floor it's on, and the screen shows that floor.
//
//   - Classic's shooter lane, gate, arch and left orbit; three top lanes and two pop bumpers under them
//   - the house in the middle: a front door over a short hallway with the trapdoor in its floor, a ghost in each
//     window either side of the door, one on the orbit's rail and one on the right wall
//   - slingshots, inlanes and outlanes (wider than Classic's), and two flippers; the cellar door in the right inlane,
//     where the ball comes back up from the basement
//   - in the basement: a chute from the trapdoor down to the left flipper, a coffin whose lid is three drop targets,
//     the stairs in the top right corner, and two flippers over a drain of their own (no outlanes down there)

export const W = 520, H = 1060;
export const PF_RIGHT = 486;
export const MID = PF_RIGHT / 2;
export const SLING = [[98, 735], [98, 835], [150, 862]];
export const BASEMENT = 1; // the basement's level

export function buildTable() {
  const walls = [], circles = [], sensors = [];
  const seg = (ax, ay, bx, by, o = {}) => { const w = { ax, ay, bx, by, r: o.r ?? 0, e: o.e ?? 0.45, ...o }; walls.push(w); return w; };
  const chain = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o); };
  const post = (x, y, r = 6, o = {}) => { const c = { x, y, r, e: o.e ?? 0.6, ...o }; circles.push(c); return c; };
  const line = (ax, ay, bx, by, o) => {
    const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
    const s = { kind: 'line', ax, ay, bx, by, len, tx, ty, nx: -ty, ny: tx, ...o };
    sensors.push(s); return s;
  };
  const spot = (x, y, r, o) => { const s = { kind: 'spot', x, y, r, ...o }; sensors.push(s); return s; };
  const mx = x => PF_RIGHT - x;
  const DEG = Math.PI / 180;

  // ---- outer walls, arch, shooter lane (Classic's) ----
  const ARC_C = { x: W / 2, y: 260 }, ARC_R = W / 2, arch = [];
  for (let a = 0; a <= 180; a += 5) arch.push([ARC_C.x + Math.cos(a * DEG) * ARC_R, ARC_C.y - Math.sin(a * DEG) * ARC_R]);
  chain(arch, { e: 0.3, mu: 0.1, kind: 'rail' });
  seg(W, 260, W, H + 40, { e: 0.3, kind: 'rail' });
  seg(0, 260, 0, H + 40, { e: 0.3, kind: 'rail' });
  seg(PF_RIGHT, 330, PF_RIGHT, H + 40, { r: 2, e: 0.3, kind: 'rail' });
  post(PF_RIGHT, 330, 3, { e: 0.3, kind: 'rail' });
  const gate = seg(PF_RIGHT, 334, W, 300, { r: 2, e: 0.2, oneWay: true, kind: 'gate' });
  { const len = Math.hypot(gate.bx - gate.ax, gate.by - gate.ay); gate.nx = (gate.by - gate.ay) / len; gate.ny = -(gate.bx - gate.ax) / len; }
  const plunger = { x0: PF_RIGHT, x1: W, y: 1000, travel: 46, pull: 0, pulling: false, firing: false, fireSpeed: 0, pullTime: 0.9 };
  const laneExit = line(PF_RIGHT, 300, W, 300, { id: 'laneExit' });

  // ---- top lanes and two pops ----
  const laneX = [195, 255, 315];
  for (const gx of [165, 225, 285, 345]) seg(gx, 95, gx, 150, { r: 4, e: 0.5, kind: 'guide' });
  const lanes = laneX.map((x, i) => spot(x, 128, 14, { id: 'lane', i }));
  const bumpers = [[197, 248], [293, 248]].map(([x, y], i) => post(x, y, 24, { e: 0.5, kind: 'bumper', i, kick: { speed: 1100, min: 0 } }));

  // ---- left orbit, and a ghost on its rail ----
  seg(54, 300, 54, 470, { r: 5, e: 0.5, kind: 'guide' });
  seg(0, 560, 30, 612, { r: 4, e: 0.5, kind: 'rubber' });
  const ghosts = [seg(60, 380, 60, 406, { r: 3, e: 0.35, kind: 'ghost', i: 0 })];

  // ---- the house ----
  // Its outline: the roof, the sides, and the front either side of the hallway, whose walls run back to the trapdoor.
  chain([[176, 380], [MID, 330], [310, 380]], { r: 4, e: 0.4, kind: 'house' });
  seg(176, 380, 176, 420, { r: 4, e: 0.4, kind: 'house' });
  seg(310, 380, 310, 420, { r: 4, e: 0.4, kind: 'house' });
  seg(176, 420, 222, 440, { r: 4, e: 0.4, kind: 'house' });
  seg(310, 420, 264, 440, { r: 4, e: 0.4, kind: 'house' });
  ghosts.push(seg(186, 434, 210, 444, { r: 3, e: 0.35, kind: 'ghost', i: 1 }));
  ghosts.push(seg(mx(186), 434, mx(210), 444, { r: 3, e: 0.35, kind: 'ghost', i: 2 }));
  seg(222, 440, 222, 392, { r: 3, e: 0.3, kind: 'house' });
  seg(264, 440, 264, 392, { r: 3, e: 0.3, kind: 'house' });
  seg(222, 392, 264, 392, { r: 3, e: 0.2, kind: 'house' });
  post(222, 440, 5, { e: 0.5, kind: 'post' });
  post(264, 440, 5, { e: 0.5, kind: 'post' });
  // The front door: shut, a wall across the hallway; open (off), the way to the trapdoor.
  const door = seg(226, 444, 260, 444, { r: 3, e: 0.35, kind: 'door' });
  const trapdoor = spot(MID, 414, 14, { id: 'trapdoor', x: MID, y: 414 });
  // The house is hollow: these fill it (never drawn), so there's no room in there for a ball to sit.
  seg(199, 390, 199, 408, { r: 8, e: 0.3, kind: 'fill' });
  seg(mx(199), 390, mx(199), 408, { r: 8, e: 0.3, kind: 'fill' });
  seg(236, 372, 250, 372, { r: 10, e: 0.3, kind: 'fill' });

  // ---- the right wall, with a ghost on it, and a post guarding the right outlane ----
  chain([[PF_RIGHT, 405], [474, 415], [474, 565], [PF_RIGHT, 575]], { e: 0.35, kind: 'rail' });
  ghosts.push(seg(466, 477, 466, 503, { r: 3, e: 0.35, kind: 'ghost', i: 3 }));
  post(415, 700, 6, { e: 0.6, kind: 'post' });

  // ---- slingshots, inlanes, outlanes: the house's, then the basement's ----
  // Rubber shoulders lean in over the outlanes, as on Classic. The house's dividers stand further in than Classic's
  // (x 51 and 434 against 45 and 441), so its outlanes are wider.
  chain([[0, 602], [35, 734]], { r: 4, e: 0.5, kind: 'rubber' });
  chain([[474, 565], [452, 620], [457, 738]], { r: 4, e: 0.5, kind: 'rubber' });
  const slings = [];
  const lower = level => {
    for (const side of [1, -1]) {
      const X = x => (side === 1 ? x : mx(x));
      const [T, L, R] = SLING;
      const len = Math.hypot(R[0] - T[0], R[1] - T[1]), ux = (R[0] - T[0]) / len * 10, uy = (R[1] - T[1]) / len * 10;
      slings.push(seg(X(T[0] + ux), T[1] + uy, X(R[0] - ux), R[1] - uy, { r: 6, e: 0.6, kind: 'sling', side, level, kick: { speed: 1000, min: 260 } }));
      post(X(T[0]), T[1], 7, { e: 0.6, kind: 'post', level });
      post(X(R[0]), R[1], 7, { e: 0.6, kind: 'post', level });
      seg(X(T[0]), T[1], X(L[0]), L[1], { r: 4, e: 0.5, kind: 'rubber', level });
      seg(X(L[0]), L[1], X(R[0]), R[1], { r: 4, e: 0.4, kind: 'rubber', level });
      if (level === 0) {
        const d = side === 1 ? 51 : 52; // the divider's distance from the side wall
        chain([[X(d), 774], [X(d), 880], [X(142), 912]], { r: 4, e: 0.35, kind: 'rail' });
        post(X(d), 774, 6, { e: 0.6, kind: 'post' });
        spot(X((d + 98) / 2), 820, 13, { id: 'inlane', side });
        spot(X(d / 2), 820, 13, { id: 'outlane', side });
      } else {
        // Down there the side walls run straight into the inlanes: no outlanes.
        chain([[X(40), 760], [X(40), 880], [X(142), 912]], { r: 4, e: 0.35, kind: 'stone', level });
        spot(X(69), 820, 13, { id: 'inlane', side, level });
      }
    }
  };
  lower(0);
  const cellar = { x: 411, y: 762 }; // where the ball comes back up, in the right inlane

  // ---- the basement ----
  const B = { level: BASEMENT };
  // The chute: from the trapdoor's hatch down to the top left corner.
  seg(230, 226, 40, 449, { r: 3, e: 0.3, kind: 'chute', ...B });
  seg(256, 250, 100, 432, { r: 3, e: 0.3, kind: 'chute', ...B });
  seg(230, 226, 256, 250, { r: 3, e: 0.3, kind: 'chute', ...B });
  const entry = { x: 240, y: 244, vx: -100, vy: 120 }; // where the ball comes out of the hatch, and how
  // The stone walls.
  seg(40, 760, 40, 449, { r: 4, e: 0.35, kind: 'stone', ...B });
  chain([[100, 432], [412, 432], [446, 470], [446, 760]], { r: 4, e: 0.35, kind: 'stone', ...B });
  lower(BASEMENT);
  // The coffin, filled like the house, and its lid: three drop targets along its foot.
  chain([[220, 455], [266, 455], [300, 500], [290, 548], [196, 548], [186, 500], [220, 455]], { r: 3, e: 0.35, kind: 'coffin', ...B });
  seg(239, 500, 247, 500, { r: 17, e: 0.3, kind: 'fill', ...B });
  seg(223, 514, 263, 514, { r: 8, e: 0.3, kind: 'fill', ...B });
  const lids = [0, 1, 2].map(i => seg(200 + i * 30, 560, 226 + i * 30, 560, { r: 3, e: 0.3, kind: 'lid', i, ...B }));
  // The stairs, in the top right corner: the way back up.
  const stairs = spot(423, 478, 15, { id: 'stairs', x: 423, y: 478, ...B });

  // ---- flippers: the house's, then the basement's (a little longer), on the same pivots ----
  const pair = (len, level) => [
    { side: 'left', x: 150, y: 925, len, r0: 11, r1: 6, rest: 30 * DEG, up: -28 * DEG, e: 0.4, level },
    { side: 'right', x: mx(150), y: 925, len, r0: 11, r1: 6, rest: 150 * DEG, up: 208 * DEG, e: 0.4, level },
  ];
  const flippers = [...pair(76, 0), ...pair(80, BASEMENT)].map(f => ({ ...f, angle: f.rest, omega: 0, pressed: false }));

  return {
    W, H, walls, circles, sensors, flippers, plunger, gate, laneExit, lanes, laneX, bumpers, slings, ghosts, door, trapdoor,
    cellar, lids, stairs, entry, arc: { ...ARC_C, r: ARC_R },
  };
}
