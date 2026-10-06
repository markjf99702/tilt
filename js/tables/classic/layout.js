// The table: one classic solid-state layout, in millimetres. Every skin draws over this same geometry.
//
//   - a shooter lane up the right side, a one-way gate at its top, and an arch over the top of the table
//   - three top rollover lanes, three pop bumpers under them, and a saucer in the middle
//   - a left orbit lane with a spinner, three standup targets on its rail, four drop targets on the right
//   - slingshots, inlanes and outlanes, and two flippers

export const W = 520, H = 1060;
export const PF_RIGHT = 486; // the playfield's right edge; the shooter lane is beyond it
export const MID = PF_RIGHT / 2;
// The left slingshot's corners (top, bottom-left, bottom-right); the right one is its mirror image.
export const SLING = [[98, 735], [98, 835], [150, 862]];

export function buildTable() {
  const walls = [], circles = [], sensors = [];

  const seg = (ax, ay, bx, by, o = {}) => {
    const w = { ax, ay, bx, by, r: o.r ?? 0, e: o.e ?? 0.45, ...o };
    walls.push(w);
    return w;
  };
  const chain = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o); };
  const post = (x, y, r = 6, o = {}) => { const c = { x, y, r, e: o.e ?? 0.6, ...o }; circles.push(c); return c; };
  const line = (ax, ay, bx, by, o) => {
    const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
    const s = { kind: 'line', ax, ay, bx, by, len, tx, ty, nx: -ty, ny: tx, ...o };
    sensors.push(s);
    return s;
  };
  const spot = (x, y, r, o) => { const s = { kind: 'spot', x, y, r, ...o }; sensors.push(s); return s; };
  const mx = x => PF_RIGHT - x; // mirror across the middle of the playfield

  // ---- outer walls and the arch ----
  const ARC_C = { x: W / 2, y: 260 }, ARC_R = W / 2;
  const arch = [];
  for (let a = 0; a <= 180; a += 5) {
    const r = a * Math.PI / 180;
    arch.push([ARC_C.x + Math.cos(r) * ARC_R, ARC_C.y - Math.sin(r) * ARC_R]);
  }
  // The ball rides the arch pressed against it, so friction there takes real speed off orbit shots.
  chain(arch, { e: 0.3, mu: 0.1, kind: 'rail' });
  seg(W, 260, W, H + 40, { e: 0.3, kind: 'rail' });          // right outer wall
  seg(0, 260, 0, H + 40, { e: 0.3, kind: 'rail' });          // left outer wall

  // ---- shooter lane ----
  seg(PF_RIGHT, 330, PF_RIGHT, H + 40, { r: 2, e: 0.3, kind: 'rail' });
  post(PF_RIGHT, 330, 3, { e: 0.3, kind: 'rail' });
  const gate = seg(PF_RIGHT, 334, W, 300, { r: 2, e: 0.2, oneWay: true, kind: 'gate' });
  { const len = Math.hypot(gate.bx - gate.ax, gate.by - gate.ay); gate.nx = (gate.by - gate.ay) / len; gate.ny = -(gate.bx - gate.ax) / len; }
  const plunger = { x0: PF_RIGHT, x1: W, y: 1000, travel: 46, pull: 0, pulling: false, firing: false, fireSpeed: 0, pullTime: 0.9 };
  const laneExit = line(PF_RIGHT, 300, W, 300, { id: 'laneExit' });

  // ---- top lanes ----
  const laneX = [195, 255, 315];
  for (const gx of [165, 225, 285, 345]) {
    seg(gx, 95, gx, 150, { r: 4, e: 0.5, kind: 'guide' });
  }
  const lanes = laneX.map((x, i) => spot(x, 128, 14, { id: 'lane', i }));

  // ---- pop bumpers ----
  const bumpers = [[188, 250], [302, 250], [245, 338]].map(([x, y], i) =>
    post(x, y, 24, { e: 0.5, kind: 'bumper', i, kick: { speed: 1100, min: 0 } }));

  // ---- the saucer ----
  const saucer = spot(MID, 480, 15, { id: 'saucer', x: MID, y: 480 });

  // ---- left orbit lane: rail, spinner, deflector, standups ----
  seg(54, 300, 54, 470, { r: 5, e: 0.5, kind: 'guide' });
  const spinner = line(0, 400, 49, 400, { id: 'spinner' });
  seg(0, 560, 30, 612, { r: 4, e: 0.5, kind: 'rubber' });
  const standups = [340, 385, 430].map((y, i) =>
    seg(60, y - 13, 60, y + 13, { r: 3, e: 0.35, kind: 'standup', i }));

  // ---- drop targets on the right ----
  chain([[PF_RIGHT, 405], [474, 415], [474, 565], [PF_RIGHT, 575]], { e: 0.35, kind: 'rail' });
  const drops = [0, 1, 2, 3].map(i => {
    const y0 = 422 + i * 35;
    return seg(466, y0, 466, y0 + 31, { r: 3, e: 0.3, kind: 'drop', i });
  });

  // ---- slingshots, inlanes, outlanes ----
  // Above each outlane a rubber shoulder leans in from the side wall, so a ball coming down the side of the
  // table is steered towards the inlane, and the outlane opens only between the shoulder's end and the
  // post on top of the divider. The right one starts under the drop-target bank.
  chain([[0, 602], [35, 734]], { r: 4, e: 0.5, kind: 'rubber' });
  chain([[474, 565], [452, 620], [457, 738]], { r: 4, e: 0.5, kind: 'rubber' });
  const slings = [];
  for (const side of [1, -1]) {
    const X = x => (side === 1 ? x : mx(x));
    // Slingshot: a rubber band stretched between two posts kicks; the other two sides are plain rubber.
    const [T, L, R] = SLING;
    const len = Math.hypot(R[0] - T[0], R[1] - T[1]), ux = (R[0] - T[0]) / len * 10, uy = (R[1] - T[1]) / len * 10;
    slings.push(seg(X(T[0] + ux), T[1] + uy, X(R[0] - ux), R[1] - uy, { r: 6, e: 0.6, kind: 'sling', side, kick: { speed: 1000, min: 260 } }));
    post(X(T[0]), T[1], 7, { e: 0.6, kind: 'post' });
    post(X(R[0]), R[1], 7, { e: 0.6, kind: 'post' });
    seg(X(T[0]), T[1], X(L[0]), L[1], { r: 4, e: 0.5, kind: 'rubber' });
    seg(X(L[0]), L[1], X(R[0]), R[1], { r: 4, e: 0.4, kind: 'rubber' });
    // Divider between inlane and outlane, ending at the flipper.
    chain([[X(45), 778], [X(45), 880], [X(142), 912]], { r: 4, e: 0.35, kind: 'rail' });
    post(X(45), 778, 6, { e: 0.6, kind: 'post' });
    spot(X(72), 820, 13, { id: 'inlane', side });
    spot(X(23), 820, 13, { id: 'outlane', side });
  }

  // ---- flippers ----
  const DEG = Math.PI / 180;
  const flippers = [
    { side: 'left', x: 150, y: 925, len: 80, r0: 11, r1: 6, rest: 30 * DEG, up: -28 * DEG, e: 0.4 },
    { side: 'right', x: mx(150), y: 925, len: 80, r0: 11, r1: 6, rest: 150 * DEG, up: 208 * DEG, e: 0.4 },
  ].map(f => ({ ...f, angle: f.rest, omega: 0, pressed: false }));

  // ---- drain ----
  return {
    W, H, walls, circles, sensors, flippers, plunger, gate, laneExit, lanes, laneX, bumpers, saucer, spinner, standups, drops, slings,
    arc: { ...ARC_C, r: ARC_R },
  };
}
