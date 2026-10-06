// Space: an early-90s table, with a ramp that carries the ball over the playfield, a lock for two-ball multiball
// and a third flipper up the right side. The machine around it is the one every table shares.

import { buildTable } from './layout.js';
import { Space } from './rules.js';
import { paint, draw } from './draw.js';
import { SKINS } from './skins.js';

export default {
  name: 'Space',
  blurb: 'Early-90s: a ramp, a lock and two-ball multiball.',
  build: buildTable,
  Game: Space,
  skins: SKINS,
  paint,
  draw,
  scoresKey: 'spaceScores',
  howTo: [
    '<b>Ramp:</b> shoot it with the left flipper. It lights the lock and brings the ball back to the left flipper for another go.',
    '<b>Lock:</b> the right side works the upper flipper too. Shoot the orbit with the right flipper and keep holding: the ball comes round onto the upper flipper. From there, shoot the dock under the ramp to lock it, then light the lock again for two-ball <b>multiball</b>. The ramp scores the <b>jackpot</b>, and the dock lights it again.',
    '<b>Skill shot:</b> launch softly onto the upper flipper and shoot the dock for 25,000. <b>Top lanes</b> raise the bonus multiplier, and each ramp lights a planet: all eight on one ball light an <b>extra ball</b> at the orbit.',
  ],
  checks: {
    area: { x: 20, y: 150, w: 446, h: 700 },
    // The ball is running along a side wall, low on the playfield (the feed lane up on the right is meant to be ridden).
    sideWall: b => !b.level && b.y > 560 && (b.x < 30 || (b.x > 456 && b.x < 486)),
    outlaneTop: 760,
    stats: g => g.stats, // the ramps, orbits, docks, locks, multiballs and jackpots of a game, for tools/tune.mjs
  },
};
