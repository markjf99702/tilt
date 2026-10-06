// Haunted House: the hard one. Ghosts that glow only now and then open the front door of a house in the middle of the
// playfield; behind it a trapdoor drops the ball into the basement, a little table of its own with its own flippers.
// The machine around it is the one every table shares.

import { buildTable, BASEMENT } from './layout.js';
import { Haunted } from './rules.js';
import { paint, draw } from './draw.js';
import { SKINS } from './skins.js';

export default {
  name: 'Haunted House',
  blurb: 'The hard one: ghosts, a trapdoor and a basement.',
  build: buildTable,
  Game: Haunted,
  skins: SKINS,
  paint,
  draw,
  floors: [0, BASEMENT], // the house, then the basement under it: the screen shows the one the ball is on
  scoresKey: 'hauntedScores',
  howTo: [
    '<b>Ghosts</b> glow now and then, in the windows and on the walls. Hit one while it glows to catch it. Each one lights a candle under the house, and once they\'re all lit the <b>front door</b> opens. While it\'s shut, a hard shot knocks on it and wakes a ghost.',
    '<b>Trapdoor:</b> shoot through the open door and the ball drops into the <b>basement</b>, a little table of its own. Knock the lid off the coffin to light an <b>extra ball</b>, then take the stairs back up.',
    '<b>Skill shot:</b> launch into the flashing top lane for 25,000. The flippers move it. <b>Top lanes</b> raise the bonus multiplier.',
  ],
  checks: {
    area: { x: 20, y: 150, w: 446, h: 700 },
    sideWall: b => !b.level && b.y > 560 && (b.x < 30 || (b.x > 456 && b.x < 486)),
    outlaneTop: 760,
    stats: g => g.stats, // the ghosts, knocks, trips down and back up, lids and coffins of a game, for tools/tune.mjs
  },
};
