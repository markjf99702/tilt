// Classic: a late-70s solid-state table, and everything that makes it itself. The machine around it
// (physics, flippers, plunger, controls, sound, menus and the clock) is shared by every table.

import { buildTable, W, H } from './layout.js';
import { Classic } from './rules.js';
import { paint, draw } from './draw.js';
import { SKINS } from './skins.js';

export default {
  name: 'Classic',
  W, H,                 // its size in millimetres: the renderer fits this box to the screen
  build: buildTable,    // a fresh layout: walls, posts, sensors, flippers (each with a side), plunger
  Game: Classic,        // its rules: new table.Game(settings, out)
  skins: SKINS,         // the first one is the default
  paint,                // paint(c, layout, skin): what never changes, into the static layer
  draw,                 // draw(c, game, skin, now): lamps, toys, balls, flippers, plunger and apron, each frame
  scoresKey: 'scores',  // where its top five are saved; Classic keeps the one from before there were tables
  // For the checks every table gets (test/unit.test.mjs and tools/tune.mjs).
  checks: {
    area: { x: 20, y: 150, w: 446, h: 700 },             // where the no-flip test throws balls in
    sideWall: b => b.x < 30 || (b.x > 456 && b.x < 486), // the ball is running along a side wall
    outlaneTop: 760,                                      // a ball hit above here isn't on its way into an outlane
  },
};
