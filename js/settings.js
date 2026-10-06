// How the machine is set up. Real games have operator adjustments like these; difficulty levels will be
// presets of them. Slope is the table's tilt in degrees; flipper speeds are in radians per second;
// launch speeds in millimetres per second.
export const NORMAL = {
  slope: 6.5,
  flipUp: 38,
  flipDown: 18,
  launchMin: 900,
  launchMax: 2300,
  ballSave: 8,
  tiltWarnings: 2,
  balls: 3,
  saucerGrab: 1700,
};
