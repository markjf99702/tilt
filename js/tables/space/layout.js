// The table: Space, an early-90s layout, in millimetres. Its rules and drawing go over this geometry.
//
//   - Classic's shooter lane up the right side, one-way gate and arch over the top of the table
//   - three top lanes and three pop bumpers up on the right, and beside them a feed lane: a plunge too soft to go
//     round the arch drops down it onto a third flipper, up the right side
//   - one ramp from the middle of the table: it climbs, turns a hairpin over the upper left of the playfield and
//     comes down a wire into the left inlane. Under the hairpin is the dock, a pocket that catches the ball and
//     lifts it up onto the ramp, or locks it for multiball
//   - a left orbit lane round the arch, under the ramp's wire
//   - Classic's slingshots, inlanes, outlanes and flippers

export const W = 520, H = 1060;
export const PF_RIGHT = 486; // the playfield's right edge; the shooter lane is beyond it
export const MID = PF_RIGHT / 2;
// The left slingshot's corners (top, bottom-left, bottom-right); the right one is its mirror image.
export const SLING = [[98, 735], [98, 835], [150, 862]];
// The ramp's hairpin turns round this point, at full height (z, mm above the playfield).
export const HAIRPIN = { x: 143, y: 300, r: 72, z: 70 };

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
  const DEG = Math.PI / 180;

  // ---- outer walls and the arch ----
  const ARC_C = { x: W / 2, y: 260 }, ARC_R = W / 2;
  const arch = [];
  for (let a = 0; a <= 180; a += 5) {
    const r = a * DEG;
    arch.push([ARC_C.x + Math.cos(r) * ARC_R, ARC_C.y - Math.sin(r) * ARC_R]);
  }
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

  // ---- top lanes and pop bumpers ----
  const laneX = [290, 345, 400];
  for (const gx of [262, 317, 372, 427]) {
    seg(gx, 110, gx, 160, { r: 4, e: 0.5, kind: 'guide' });
  }
  const lanes = laneX.map((x, i) => spot(x, 140, 14, { id: 'lane', i }));
  const bumpers = [[310, 215], [390, 205], [370, 285]].map(([x, y], i) =>
    post(x, y, 24, { e: 0.5, kind: 'bumper', i, kick: { speed: 1100, min: 0 } }));

  // ---- the feed lane and the upper flipper ----
  // The rail across the foot of the lane rolls the ball onto the upper flipper's face, not its pivot.
  chain([[444, 300], [428, 370], [428, 490]], { r: 4, e: 0.5, kind: 'guide' });
  seg(452, 528, PF_RIGHT, 494, { r: 4, e: 0.3, kind: 'rail' });

  // ---- left orbit ----
  seg(54, 300, 54, 470, { r: 5, e: 0.5, kind: 'guide' });
  // Across the top of the arch. A ball crossing it left to right (dir -1) has come up the left orbit; a plunge
  // crosses it the other way.
  const orbit = line(150, 24, 150, 80, { id: 'orbit' });
  seg(0, 560, 30, 612, { r: 4, e: 0.5, kind: 'rubber' });

  // ---- the ramp ----
  // Its centre line, with the height of each point: up from the mouth, round the hairpin and down the wire to the
  // left inlane. Up on it (level 1) a ball only meets the ramp's own rails, and passes over everything else.
  const path = [[210, 478, 0], [212, 420, 23]];
  for (let a = 0; a <= 180; a += 15) {
    path.push([HAIRPIN.x + Math.cos(a * DEG) * HAIRPIN.r, HAIRPIN.y - Math.sin(a * DEG) * HAIRPIN.r, HAIRPIN.z]);
  }
  path.push([71, 820, 0]);
  // The mouth's posts and funnel are on both levels: the playfield's side of them, and the ramp's.
  for (const level of [0, 1]) {
    post(160, 478, 6, { e: 0.5, kind: 'ramp', level });
    post(260, 478, 6, { e: 0.5, kind: 'ramp', level });
    seg(160, 478, 189, 420, { r: 3, e: 0.3, kind: 'ramp', level });
    seg(260, 478, 235, 420, { r: 3, e: 0.3, kind: 'ramp', level });
  }
  // Under the ramp the funnel is closed off here. Above this the ramp is high enough for a ball to roll under it.
  chain([[189, 420], [190, 389], [236, 389], [235, 420]], { r: 3, e: 0.3, kind: 'ramp' });
  // Its rails, 23 mm either side of the centre line from the top of the funnel on (right and left as the ball goes).
  const rail = side => path.slice(1).map((p, i, cl) => {
    const a = cl[Math.max(0, i - 1)], b = cl[Math.min(cl.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return [p[0] - dy / l * 23 * side, p[1] + dx / l * 23 * side];
  });
  const right = rail(1), left = rail(-1);
  chain(right, { r: 3, e: 0.3, kind: 'ramp', level: 1 });
  chain(left, { r: 3, e: 0.3, kind: 'ramp', level: 1 });
  // The rails rub, but like every friction here they never quite stop a ball (see World.climb).
  const ramps = [{ level: 1, path, drag: 400 }];
  // Lifts, drawn left to right (so dir -1 is up the table): up into the mouth; back out of it, for a shot too weak
  // to reach the top; and off the end of the wire, halfway down the left inlane.
  line(160, 478, 260, 478, { id: 'rampIn', to: 1, dir: -1 });
  line(160, 478, 260, 478, { id: 'rampBack', level: 1, to: 0, dir: 1 });
  line(48, 800, 94, 800, { id: 'rampOut', level: 1, to: 0, dir: 1 });

  // ---- the dock ----
  // A pocket under the hairpin, open down to the right, towards the upper flipper. It catches the ball at its
  // mouth; a locked ball waits at the back (lockSpot). Both are on the hairpin's centre line, so the lift puts a
  // ball straight up onto the ramp.
  seg(193, 215, 157, 241, { r: 3, e: 0.2, kind: 'dock' });
  seg(193, 215, 235, 267, { r: 3, e: 0.3, kind: 'dock' });
  seg(157, 241, 199, 293, { r: 3, e: 0.3, kind: 'dock' });
  seg(235, 267, 262, 280, { r: 3, e: 0.3, kind: 'dock' });
  seg(199, 293, 201, 323, { r: 3, e: 0.3, kind: 'dock' });
  const dock = spot(202, 259, 15, { id: 'dock', x: 202, y: 259 });
  const lockSpot = { x: 184, y: 241 };

  // ---- slingshots, inlanes, outlanes ----
  // Rubber shoulders above the outlanes, as on Classic. The right one starts under the upper flipper.
  chain([[0, 602], [35, 734]], { r: 4, e: 0.5, kind: 'rubber' });
  chain([[474, 560], [452, 620], [457, 738]], { r: 4, e: 0.5, kind: 'rubber' });
  const slings = [];
  for (const side of [1, -1]) {
    const X = x => (side === 1 ? x : mx(x));
    const [T, L, R] = SLING;
    const len = Math.hypot(R[0] - T[0], R[1] - T[1]), ux = (R[0] - T[0]) / len * 10, uy = (R[1] - T[1]) / len * 10;
    slings.push(seg(X(T[0] + ux), T[1] + uy, X(R[0] - ux), R[1] - uy, { r: 6, e: 0.6, kind: 'sling', side, kick: { speed: 1000, min: 260 } }));
    post(X(T[0]), T[1], 7, { e: 0.6, kind: 'post' });
    post(X(R[0]), R[1], 7, { e: 0.6, kind: 'post' });
    seg(X(T[0]), T[1], X(L[0]), L[1], { r: 4, e: 0.5, kind: 'rubber' });
    seg(X(L[0]), L[1], X(R[0]), R[1], { r: 4, e: 0.4, kind: 'rubber' });
    chain([[X(45), 778], [X(45), 880], [X(142), 912]], { r: 4, e: 0.35, kind: 'rail' });
    post(X(45), 778, 6, { e: 0.6, kind: 'post' });
    spot(X(72), 820, 13, { id: 'inlane', side });
    spot(X(23), 820, 13, { id: 'outlane', side });
  }

  // ---- flippers ----
  // The upper flipper works with the right button, and comes third: the lower two are always first.
  const flippers = [
    { side: 'left', x: 150, y: 925, len: 80, r0: 11, r1: 6, rest: 30 * DEG, up: -28 * DEG, e: 0.4 },
    { side: 'right', x: mx(150), y: 925, len: 80, r0: 11, r1: 6, rest: 150 * DEG, up: 208 * DEG, e: 0.4 },
    { side: 'right', x: 466, y: 548, len: 72, r0: 10, r1: 6, rest: 140 * DEG, up: 192 * DEG, e: 0.4 },
  ].map(f => ({ ...f, angle: f.rest, omega: 0, pressed: false }));

  return {
    W, H, walls, circles, sensors, flippers, plunger, gate, laneExit, lanes, laneX, bumpers, slings, ramps,
    ramp: { path, left, right }, dock, lockSpot, hairpin: HAIRPIN, orbit, arc: { ...ARC_C, r: ARC_R },
  };
}
