// How the machine is set up. Real games have operator adjustments like these; difficulty levels will be
// presets of them. Slope is the table's tilt in degrees; flipper speeds are in radians per second;
// launch speeds in millimetres per second. These are the same on every table; a table's rules add any
// adjustments for its own toys (see Classic's saucerGrab).
//
// timeScale runs the ball's world a little slower than the clock: on a phone-sized table a real machine's
// pace is hard to follow, so everything the ball does plays at three quarters of real speed. The player's
// side doesn't slow down: flipper speeds (and the ball save, the saucer's hold and so on) are real-time,
// so a flipper still snaps up in about a thirtieth of a second. The plunger hands the ball speed but no spin,
// so it skids up the shooter lane and needs a slightly harder hit than a rolling ball would.
export const NORMAL = {
  slope: 6.5,
  timeScale: 0.75,
  flipUp: 33,
  flipDown: 18,
  launchMin: 1100,
  launchMax: 2500,
  ballSave: 8,
  tiltWarnings: 2,
  balls: 3,
};
