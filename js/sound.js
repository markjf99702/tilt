// Every sound is made in the browser with Web Audio: no sound files. Solenoids are short filtered noise
// bursts, the scoring chimes are three bells (10s, 100s and 1000s) like an electromechanical machine.

let ac = null, master = null, noiseBuf = null;
let enabled = true;
const lastAt = {};

export function setSound(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.6 : 0;
}

// Browsers only allow sound after the person has touched or pressed something.
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = enabled ? 0.6 : 0;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

function noise(t, dur, freq, q, gain, type = 'bandpass', pan = 0) {
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); out(g, pan);
  src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
}

function tone(t, freq, dur, gain, type = 'sine', slideTo, pan = 0) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(g, pan);
  o.start(t); o.stop(t + dur + 0.02);
}

function out(node, pan) {
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); }
  else node.connect(master);
}

// A struck bell: a few inharmonic partials that ring and fade.
function bell(t, f, gain) {
  [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.9, 0.08]].forEach(([m, a]) => tone(t, f * m, 1.2 / Math.sqrt(m), gain * a));
}

// Some sounds would stack into a roar if they fired every frame; space them out.
function ok(name, gap) {
  const now = ac.currentTime;
  if (lastAt[name] && now - lastAt[name] < gap) return false;
  lastAt[name] = now;
  return true;
}

export function play(name, o = {}) {
  if (!ac || !enabled || ac.state !== 'running') return;
  const t = ac.currentTime + 0.005;
  const pan = o.side === 'left' || o.side === 1 ? -0.4 : o.side === 'right' || o.side === -1 ? 0.4 : 0;
  switch (name) {
    case 'flipUp': noise(t, 0.06, 900, 1.2, 0.9, 'bandpass', pan); tone(t, 110, 0.05, 0.4, 'square', 60, pan); break;
    case 'flipDown': noise(t, 0.04, 600, 1.5, 0.35, 'bandpass', pan); break;
    case 'bumper': noise(t, 0.09, 1400, 0.9, 0.9); tone(t, 180 + (o.i || 0) * 30, 0.12, 0.6, 'triangle', 70); break;
    case 'sling': noise(t, 0.07, 1800, 1, 0.8, 'bandpass', pan); tone(t, 140, 0.06, 0.35, 'square', 80, pan); break;
    case 'rollover': tone(t, 1250, 0.07, 0.18, 'square'); break;
    case 'target': noise(t, 0.05, 2500, 2, 0.6); break;
    case 'drop': noise(t, 0.08, 700, 1.5, 0.8); tone(t, 220, 0.08, 0.3, 'square', 110); break;
    case 'reset': noise(t, 0.12, 500, 1, 0.9); noise(t + 0.03, 0.1, 900, 1, 0.5); break;
    case 'spinner':
      for (let i = 0; i < Math.min(o.spins, 24); i++) noise(t + i * (0.03 + i * 0.004), 0.02, 3200, 4, 0.35);
      break;
    case 'saucer': noise(t, 0.15, 300, 1, 0.8, 'lowpass'); break;
    case 'saucerKick': noise(t, 0.1, 800, 1, 1); tone(t, 120, 0.1, 0.5, 'square', 50); break;
    case 'ramp': tone(t, 220, 0.4, 0.12, 'sawtooth', 880); noise(t, 0.35, 1800, 0.7, 0.35); bell(t + 0.32, 1047, 0.18); break;
    case 'lock': noise(t, 0.16, 260, 0.8, 1, 'lowpass'); [98, 147, 196].forEach(f => tone(t + 0.05, f, 0.7, 0.22, 'triangle')); break;
    case 'lift': noise(t, 0.1, 160, 0.8, 0.9, 'lowpass'); tone(t, 90, 0.14, 0.45, 'sine', 45); break;
    case 'multiball': [0, 0.09, 0.18, 0.27, 0.36, 0.5].forEach((d, i) => bell(t + d, [392, 523, 659, 784, 1047, 1319][i], 0.2)); break;
    case 'jackpot':
      [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.84].forEach((d, i) => bell(t + d, [523, 659, 784, 1047, 784, 1047, 1568][i], 0.22));
      tone(t, 131, 1.1, 0.25, 'sawtooth', 262);
      break;
    case 'ghost': tone(t, 660, 0.5, 0.16, 'sine', 440); tone(t + 0.08, 990, 0.45, 0.07, 'sine', 620); break;
    case 'knock': noise(t, 0.06, 240, 1, 0.9, 'lowpass'); noise(t + 0.14, 0.06, 240, 1, 0.9, 'lowpass'); break;
    case 'trapdoor': noise(t, 0.12, 300, 0.8, 0.9, 'lowpass'); tone(t + 0.05, 330, 0.6, 0.2, 'triangle', 82); break;
    case 'stairs': [0, 0.09, 0.18, 0.27].forEach((d, i) => noise(t + d, 0.05, 400 + i * 160, 1.5, 0.5, 'lowpass')); break;
    case 'plunge': noise(t, 0.12, 500 + o.power * 900, 0.8, 0.5 + o.power * 0.5); break;
    case 'thud': if (ok('thud', 0.05)) noise(t, 0.05, 400, 1, Math.min(0.6, o.speed / 3000), 'lowpass'); break;
    case 'nudge': noise(t, 0.12, 120, 0.7, 1, 'lowpass'); break;
    case 'chime': {
      if (!ok('chime' + o.points, 0.06)) break;
      const f = o.points >= 1000 ? 523 : o.points >= 100 ? 784 : 1175;
      bell(t, f, 0.22);
      break;
    }
    case 'bonus': if (ok('bonus', 0.05)) bell(t, 523, 0.16); break;
    case 'award': [0, 0.09, 0.18].forEach((d, i) => bell(t + d, [523, 659, 784][i], 0.2)); break;
    case 'extraBall': [0, 0.12, 0.24, 0.36, 0.6].forEach((d, i) => bell(t + d, [523, 659, 784, 1047, 1047][i], 0.22)); break;
    case 'saved': [0, 0.1].forEach((d, i) => bell(t + d, [784, 1047][i], 0.2)); break;
    case 'drain': tone(t, 300, 0.6, 0.25, 'triangle', 90); break;
    case 'danger': tone(t, 140, 0.25, 0.4, 'sawtooth'); tone(t + 0.3, 140, 0.25, 0.4, 'sawtooth'); break;
    case 'tilt': tone(t, 90, 1.2, 0.5, 'sawtooth', 60); noise(t, 0.4, 200, 0.6, 0.8, 'lowpass'); break;
    case 'gameOver': [0, 0.25, 0.5].forEach((d, i) => bell(t + d, [523, 392, 262][i], 0.22)); break;
    case 'start': [0, 0.08, 0.16, 0.24].forEach((d, i) => bell(t + d, [392, 523, 659, 784][i], 0.18)); break;
  }
}
