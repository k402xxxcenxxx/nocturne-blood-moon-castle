// Original, asset-free pixel artwork. Static stonework is painted once per stage.
const palettes = [
  { sky: '#10101e', glow: '#42304d', stone: '#34323a', mortar: '#1d1b26', trim: '#847461', light: '#c9ad7b', accent: '#a24043' },
  { sky: '#111b20', glow: '#314039', stone: '#2c3030', mortar: '#1a2225', trim: '#84754e', light: '#c4aa66', accent: '#567a73' },
  { sky: '#10121e', glow: '#36354a', stone: '#303039', mortar: '#1c1c28', trim: '#7b7466', light: '#b9aa82', accent: '#797196' },
  { sky: '#120f1b', glow: '#452536', stone: '#34282e', mortar: '#21191f', trim: '#827064', light: '#c7a67a', accent: '#8e3447' },
  { sky: '#1b101c', glow: '#492838', stone: '#30242f', mortar: '#1c1721', trim: '#877367', light: '#d1b58c', accent: '#ad4558' },
];
const cache = new Map();
const W = 1440, H = 540, FLOOR = 438;
const rect = (c, color, x, y, w, h) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function poly(c, color, points) {
  c.fillStyle = color; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
  c.closePath(); c.fill();
}
function line(c, color, x, y, x2, y2, width = 1) {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
}
function circle(c, color, x, y, r) { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function random(seed) { return () => ((seed = Math.imul(1664525, seed) + 1013904223 | 0) >>> 0) / 4294967296; }
function canvas(w = W, h = H) { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; }
function archPath(c, x, y, w, h) {
  c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * .5);
  c.bezierCurveTo(x, y + w * .25, x + w * .3, y + w * .08, x + w * .5, y);
  c.bezierCurveTo(x + w * .7, y + w * .08, x + w, y + w * .25, x + w, y + w * .5);
  c.lineTo(x + w, y + h); c.closePath();
}
function stonework(c, x, y, w, h, p, rng, bw = 64, bh = 26) {
  rect(c, p.mortar, x, y, w, h);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  for (let row = 0; row < h / bh; row++) {
    for (let bx = -(row % 2) * bw / 2; bx < w; bx += bw) {
      const xx = x + bx, yy = y + row * bh;
      rect(c, p.stone, xx + 2, yy + 2, bw - 3, bh - 3);
      rect(c, `rgba(202,186,160,${.03 + rng() * .07})`, xx + 2, yy + 2, bw - 4, bh - 4);
      rect(c, '#bdb4a012', xx + 3, yy + 2, bw - 5, 1);
      rect(c, '#09091344', xx + 3, yy + bh - 3, bw - 4, 2);
      for (let i = 0; i < 11; i++) rect(c, rng() > .5 ? '#c1b3a01c' : '#070a1733', xx + 4 + rng() * (bw - 10), yy + 4 + rng() * (bh - 9), 1 + rng() * 7, 1 + rng() * 2);
      if (rng() < .15) {
        const cx = xx + 8 + rng() * (bw - 15);
        line(c, '#0c0e1970', cx, yy + 2, cx - 4, yy + 9);
        line(c, '#0c0e1970', cx - 4, yy + 9, cx - 1, yy + 14);
      }
    }
  }
  c.restore();
}
function ledge(c, x, y, w, p) {
  rect(c, '#0d101b', x - 3, y + 12, w + 6, 9);
  rect(c, p.trim, x, y, w, 10);
  rect(c, p.light, x, y, w, 2);
  rect(c, '#a89a7d', x + 1, y + 3, w - 2, 2);
  rect(c, '#3a3331', x + 2, y + 9, w - 4, 4);
  rect(c, '#665b4b', x + 5, y + 13, w - 10, 3);
  for (let xx = x + 36; xx < x + w; xx += 46) rect(c, '#2b2630', xx, y + 1, 2, 9);
}
function pillar(c, x, y, h, p, rng) {
  rect(c, '#0b0c1759', x + 34, y + 8, 24, h);
  stonework(c, x, y, 42, h, { ...p, stone: '#4a4443' }, rng, 42, 30);
  rect(c, '#b5a28628', x + 3, y, 5, h);
  rect(c, '#15152180', x + 33, y, 8, h);
  rect(c, '#736559', x + 10, y + 20, 3, h - 37);
  rect(c, '#16182380', x + 14, y + 20, 3, h - 37);
  ledge(c, x - 10, y - 8, 62, p);
  ledge(c, x - 5, y + h - 14, 52, p);
  rect(c, '#827261', x - 2, y + 11, 46, 6);
  for (let k = 0; k < 5; k++) rect(c, '#25232c', x + k * 9 + 1, y + 11, 3, 6);
}
function gothicWindow(c, x, y, w, h, p, stage, rng) {
  archPath(c, x - 10, y - 10, w + 20, h + 13); c.fillStyle = '#121421'; c.fill();
  archPath(c, x - 5, y - 5, w + 10, h + 7); c.strokeStyle = p.trim; c.lineWidth = 7; c.stroke();
  archPath(c, x, y, w, h); c.fillStyle = '#0b1120'; c.fill();
  c.save(); archPath(c, x + 3, y + 3, w - 6, h - 3); c.clip();
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#101725'); g.addColorStop(1, stage === 4 ? '#382136' : '#22273c'); c.fillStyle = g; c.fillRect(x, y, w, h);
  if (stage === 4) {
    circle(c, '#a95d65', x + w * .5, y + 95, 46);
    circle(c, '#c4807380', x + w * .5 - 4, y + 90, 38);
    for (let i = 0; i < 34; i++) rect(c, '#6e3e5a24', x + w * .5 - 30 + rng() * 58, y + 62 + rng() * 58, 4 + rng() * 10, 2 + rng() * 3);
  }
  // Distant towers are visible through the pointed windows.
  for (let i = 0; i < 5; i++) {
    const tx = x + i * w / 4 - 9, th = 25 + rng() * 75;
    rect(c, '#0b101e', tx, y + h - th, 21, th);
    poly(c, '#0b101e', [[tx - 3, y + h - th], [tx + 10, y + h - th - 33], [tx + 24, y + h - th]]);
    rect(c, '#bd79593b', tx + 9, y + h - th + 15, 3, 8);
  }
  for (let i = 0; i < 17; i++) rect(c, '#ddd8cb55', x + rng() * w, y + rng() * h * .6, 1, 1);
  const beam = c.createLinearGradient(x, 0, x + w, 0); beam.addColorStop(0, '#708baa00'); beam.addColorStop(.5, '#8198af19'); beam.addColorStop(1, '#708baa00'); c.fillStyle = beam; c.fillRect(x, y, w, h);
  if (stage === 3) {
    // Leaded scarlet and amber glass makes the cathedral distinct from the gate.
    for (let row = 0; row < 8; row++) for (let col = 0; col < 7; col++) {
      const xx = x + col * 28 - 10 + (row % 2) * 14, yy = y + row * 34 + 2;
      poly(c, (row + col) % 3 ? '#932e4b40' : '#c1955445', [[xx, yy + 17], [xx + 14, yy], [xx + 28, yy + 17], [xx + 14, yy + 34]]);
      line(c, '#b3996a36', xx, yy + 17, xx + 14, yy, 1);
      line(c, '#b3996a36', xx + 14, yy, xx + 28, yy + 17, 1);
    }
  }
  c.restore();
  rect(c, '#746d66', x + w / 2 - 3, y + 25, 6, h - 23);
  rect(c, '#b09c7b', x + w / 2 - 3, y + 25, 1, h - 23);
  rect(c, '#746d66', x, y + h * .61, w, 5);
  // Branching tracery and its central diamond.
  line(c, '#776e62', x + w / 2, y + 75, x + 12, y + 40, 4);
  line(c, '#776e62', x + w / 2, y + 75, x + w - 12, y + 40, 4);
  poly(c, '#b3a184', [[x + w / 2, y + 29], [x + w / 2 + 7, y + 42], [x + w / 2, y + 55], [x + w / 2 - 7, y + 42]]);
  poly(c, '#222437', [[x + w / 2, y + 34], [x + w / 2 + 3, y + 42], [x + w / 2, y + 49], [x + w / 2 - 3, y + 42]]);
  ledge(c, x - 14, y + h, w + 28, p);
}
function banner(c, x, y, h, p) {
  rect(c, '#af9767', x - 5, y - 3, 48, 3); circle(c, '#b9a279', x - 6, y - 2, 3); circle(c, '#b9a279', x + 44, y - 2, 3);
  poly(c, '#2c1828', [[x + 2, y + 1], [x + 39, y + 1], [x + 39, y + h - 17], [x + 21, y + h], [x + 2, y + h - 17]]);
  poly(c, p.accent, [[x, y], [x + 35, y], [x + 35, y + h - 21], [x + 17, y + h - 7], [x, y + h - 21]]);
  rect(c, '#e3b77747', x + 3, y, 1, h - 23); rect(c, '#100e2066', x + 26, y, 5, h - 20);
  poly(c, '#c7a476', [[x + 17, y + 25], [x + 24, y + 38], [x + 17, y + 52], [x + 10, y + 38]]);
  rect(c, '#d2ac75', x + 16, y + 20, 2, 45); rect(c, '#d2ac75', x + 7, y + 37, 21, 2);
  poly(c, '#66283a', [[x + 17, y + 31], [x + 20, y + 38], [x + 17, y + 44], [x + 14, y + 38]]);
}
function shelves(c, x, y, w, h, rng) {
  rect(c, '#101b1e', x, y, w, h);
  const colors = ['#67423e', '#4e5350', '#7a6842', '#3b4d4e', '#6c503f', '#555d4d', '#4b3741'];
  for (let yy = y + 11; yy < y + h - 12; yy += 45) {
    for (let xx = x + 7; xx < x + w - 8;) {
      const bw = 4 + Math.floor(rng() * 6), bh = 19 + Math.floor(rng() * 14);
      rect(c, colors[Math.floor(rng() * colors.length)], xx, yy + 32 - bh, bw, bh);
      rect(c, '#d4b27145', xx + 1, yy + 35 - bh, bw - 2, 1);
      rect(c, '#d4b27145', xx + 1, yy + 27, bw - 2, 1);
      rect(c, '#0e17284a', xx + bw - 2, yy + 32 - bh, 2, bh); xx += bw + 1;
    }
    rect(c, '#80704a', x, yy + 33, w, 3); rect(c, '#292a28', x, yy + 36, w, 5);
  }
  rect(c, '#6d5e40', x, y, 7, h); rect(c, '#81704a', x, y, 2, h);
  rect(c, '#5e5038', x + w - 7, y, 7, h); rect(c, '#988053', x + w - 7, y, 2, h);
}
function clockFace(c, x, y, r, p) {
  circle(c, '#0b0d16', x + 4, y + 6, r + 19); circle(c, '#776d57', x, y, r + 13); circle(c, '#ada082', x, y, r + 10);
  circle(c, '#393b35', x, y, r + 6); circle(c, '#766f58', x, y, r + 1); circle(c, '#363a35', x, y, r - 4);
  const grad = c.createRadialGradient(x - r / 3, y - r / 3, 2, x, y, r); grad.addColorStop(0, '#575b47'); grad.addColorStop(1, '#252b2b'); c.fillStyle = grad; c.beginPath(); c.arc(x, y, r - 10, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#a0957350'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r - 19, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    line(c, i % 5 ? '#9c957166' : '#cab68c', x + Math.sin(a) * (r - 13), y + Math.cos(a) * (r - 13), x + Math.sin(a) * (r - (i % 5 ? 17 : 22)), y + Math.cos(a) * (r - (i % 5 ? 17 : 22)), i % 5 ? 1 : 2);
  }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '18px Georgia';
  ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((label, i) => {
    const a = i / 12 * Math.PI * 2; c.fillStyle = '#b8ae8a'; c.fillText(label, x + Math.sin(a) * (r - 36), y - Math.cos(a) * (r - 36));
  });
  circle(c, '#7b78503f', x, y, 43); circle(c, '#22272c', x, y, 30); circle(c, '#665e42', x, y, 26);
  poly(c, '#131a20', [[x - 7, y + 3], [x - 81, y - 87], [x - 65, y - 84], [x + 8, y - 3]]);
  poly(c, '#b5b5aa', [[x - 3, y + 1], [x - 77, y - 86], [x - 67, y - 79], [x + 4, y - 3]]);
  poly(c, '#979b91', [[x - 4, y - 3], [x + 44, y - 58], [x + 47, y - 73], [x + 50, y - 55], [x + 4, y + 3]]);
  circle(c, '#be9b53', x, y, 10); circle(c, '#393027', x, y, 5);
}

function throne(c, x, y, p) {
  // A carved, high-backed throne with a blood-red velvet seat and gilt antlers.
  c.save(); c.translate(x, y);
  poly(c, '#11121d', [[-61, 0], [-55, -64], [-39, -69], [-34, -135], [0, -166], [34, -135], [39, -69], [55, -64], [61, 0]]);
  poly(c, '#84705b', [[-38, -32], [-33, -132], [0, -160], [33, -132], [38, -32]]);
  poly(c, '#352531', [[-31, -37], [-27, -127], [0, -151], [27, -127], [31, -37]]);
  poly(c, '#683144', [[-26, -39], [-23, -123], [0, -143], [23, -123], [26, -39]]);
  poly(c, '#7c3b4b', [[-23, -40], [-20, -122], [0, -139], [0, -40]]);
  line(c, '#bd9c6e', -31, -128, 0, -155, 2); line(c, '#bd9c6e', 0, -155, 31, -128, 2);
  for (let row = 0; row < 5; row++) for (let col = -1; col <= 1; col++) {
    const xx = col * 15, yy = -119 + row * 18;
    poly(c, '#281c2b55', [[xx, yy - 7], [xx + 7, yy], [xx, yy + 7], [xx - 7, yy]]);
    rect(c, '#c6a36d', xx - 1, yy - 1, 2, 2);
  }
  for (const side of [-1, 1]) {
    poly(c, '#948066', [[side * 34, -111], [side * 47, -141], [side * 55, -153], [side * 51, -132], [side * 43, -114], [side * 42, -76]]);
    line(c, '#d0b487', side * 37, -113, side * 51, -144, 2);
    poly(c, '#6f6153', [[side * 35, -86], [side * 55, -72], [side * 58, -29], [side * 40, -31]]);
    rect(c, '#ac916a', side < 0 ? -57 : 39, -70, 18, 5);
    rect(c, '#a78a62', side < 0 ? -52 : 47, -29, 5, 27);
    rect(c, '#45404a', side < 0 ? -49 : 41, -60, 8, 28);
    circle(c, '#a98e69', side * 48, -80, 9);
    rect(c, '#272330', side * 48 - 5, -82, 3, 3); rect(c, '#272330', side * 48 + 2, -82, 3, 3);
    rect(c, '#d4b78a', side * 48 - 4, -75, 8, 2);
  }
  rect(c, '#a18362', -43, -39, 86, 8); rect(c, '#82394c', -34, -44, 68, 7); rect(c, '#b75a5b', -32, -44, 64, 2);
  ledge(c, -70, -3, 140, p);
  c.restore();
}

function makeScene(stage) {
  const p = palettes[stage], rng = random(1297 + stage * 197), far = canvas(), fc = far.getContext('2d'), architecture = canvas(), c = architecture.getContext('2d');
  const sky = fc.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, p.sky); sky.addColorStop(.7, p.glow); sky.addColorStop(1, '#0d1320'); fc.fillStyle = sky; fc.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) rect(fc, i % 4 ? '#b8b6c72b' : '#c3bdc36b', rng() * W, rng() * 330, i % 9 ? 1 : 2, 1);
  const moonX = stage === 4 ? 715 : 920, moonY = stage === 4 ? 150 : 120, moonR = stage === 4 ? 90 : 58;
  const halo = fc.createRadialGradient(moonX, moonY, moonR * .7, moonX, moonY, moonR * 2.8); halo.addColorStop(0, stage === 0 || stage === 4 ? '#c66a5a48' : '#c4766b1c'); halo.addColorStop(1, '#c4766b00'); fc.fillStyle = halo; fc.fillRect(moonX - moonR * 3, moonY - moonR * 3, moonR * 6, moonR * 6);
  circle(fc, stage === 0 || stage === 4 ? '#b46563' : '#b2aba6', moonX, moonY, moonR);
  circle(fc, stage === 0 || stage === 4 ? '#c77c6a' : '#c5beb0', moonX - 3, moonY - 3, moonR - 4);
  fc.save(); fc.beginPath(); fc.arc(moonX, moonY, moonR, 0, Math.PI * 2); fc.clip();
  for (let i = 0; i < 85; i++) rect(fc, i % 2 ? '#34344613' : '#e8d5c212', moonX - moonR + rng() * moonR * 2, moonY - moonR + rng() * moonR * 2, 4 + rng() * 20, 2 + rng() * 7);
  fc.restore();
  if (stage === 4) circle(fc, '#311b2bc9', moonX + 18, moonY - 7, moonR - 13);
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 17; i++) {
      const x = i * 94 + layer * 21, base = 402 + layer * 28, tall = 62 + rng() * 108, color = layer ? '#111421' : '#191c2c';
      rect(fc, color, x, base - tall, 44, tall + 60); poly(fc, color, [[x - 10, base - tall], [x + 22, base - tall - 66], [x + 54, base - tall]]);
      rect(fc, color, x + 20, base - tall - 80, 3, 23); rect(fc, color, x + 11, base - tall - 72, 21, 2);
      rect(fc, color, x + 42, base - 50, 54, 90);
      for (let k = 0; k < 3; k++) { rect(fc, color, x + 44 + k * 18, base - 57, 9, 9); rect(fc, '#ae86512a', x + 18, base - tall + 20 + k * 30, 6, 11); }
      rect(fc, '#a6a4b015', x + 2, base - tall + 2, 2, tall - 4);
      rect(fc, '#b2a58c10', x - 2, base - tall + 8, 47, 2);
      poly(fc, color, [[x + 44, base - 93], [x + 83, base - 48], [x + 78, base - 43], [x + 43, base - 81]]);
      for (let j = 0; j < 16; j++) rect(fc, '#bcac9d08', x + rng() * 40, base - tall + rng() * tall, 2 + rng() * 5, 1);
    }
  }
  // Long horizontal, hard-edged wisps preserve the old console silhouette.
  for (let i = 0; i < 37; i++) {
    const x = rng() * W, y = 35 + rng() * 250, w = 70 + rng() * 270;
    rect(fc, '#0c101d38', x, y, w, 5 + rng() * 9); rect(fc, '#8e87900b', x - 20, y + 2, w + 20, 3);
  }
  if (stage !== 0) stonework(c, 0, 55, W, 383, p, rng);
  else { stonework(c, 0, 354, W, 84, p, rng); ledge(c, 0, 350, W, p); }
  for (let bay = 0; bay < 4; bay++) {
    const x = bay * 360;
    if (stage === 1) {
      shelves(c, x + 63, 97, 235, 286, rng);
      archPath(c, x + 50, 66, 260, 325); c.strokeStyle = '#574e39'; c.lineWidth = 10; c.stroke();
      ledge(c, x + 44, 384, 272, p);
      if (bay % 2) {
        line(c, '#92774e', x + 240, 175, x + 210, 430, 5); line(c, '#5f503a', x + 265, 175, x + 235, 430, 5);
        for (let y = 192; y < 424; y += 23) line(c, '#97805a', x + 238 - (y - 175) * .117, y, x + 263 - (y - 175) * .117, y, 3);
      }
    } else if (stage === 2 && bay % 2 === 1) {
      stonework(c, x + 39, 81, 284, 338, { ...p, stone: '#3f3030' }, rng, 49, 22);
      clockFace(c, x + 180, 253, 130, p); ledge(c, x + 32, 399, 296, p);
    } else if (stage === 0) {
      archPath(c, x + 61, 90, 240, 262); c.strokeStyle = '#252630'; c.lineWidth = 20; c.stroke();
      archPath(c, x + 61, 90, 240, 262); c.strokeStyle = '#6b635c'; c.lineWidth = 3; c.stroke();
      rect(c, '#252731', x + 177, 162, 7, 191); rect(c, '#6b6258', x + 176, 161, 2, 189);
      banner(c, x + 17, 131, 139, p);
    } else {
      gothicWindow(c, x + 88, 89, 182, 243, p, stage, rng);
      banner(c, x + 30, 132, 159, p);
      banner(c, x + 287, 132, 159, p);
      // Recessed lower masonry and narrow stone buttresses.
      rect(c, '#10121c5c', x + 82, 359, 194, 57); rect(c, '#77665755', x + 82, 358, 194, 2);
      for (let n = 0; n < 6; n++) { archPath(c, x + 91 + n * 30, 366, 20, 45); c.strokeStyle = '#66574b'; c.lineWidth = 2; c.stroke(); }
    }
    if (stage === 4 && bay % 2 === 1) throne(c, x + 180, 432, p);
    pillar(c, x + 3, 77, 361, p, rng);
    // Cornice includes little projecting stone teeth.
    rect(c, '#171822', x, 57, 360, 24); rect(c, '#867562', x, 58, 360, 3); rect(c, '#3d3738', x, 64, 360, 8);
    for (let n = 0; n < 15; n++) { rect(c, '#6c6052', x + n * 24 + 4, 74, 13, 9); rect(c, '#a18b6844', x + n * 24 + 4, 74, 12, 2); }
    if (stage !== 0) {
      const light = c.createRadialGradient(x + 49, 298, 3, x + 49, 298, 105); light.addColorStop(0, '#c47e3837'); light.addColorStop(1, '#c47e3800'); c.fillStyle = light; c.fillRect(x - 55, 193, 210, 210);
    }
  }
  // Faint irregular grain gives the masonry, cloth, and clock a worn pixel surface.
  c.save(); c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 21000; i++) rect(c, i % 2 ? '#d7c6a410' : '#070b1b16', rng() * W, 57 + rng() * 381, 1 + rng() * 3, 1 + rng() * 2);
  c.restore();
  // Ground gets its own repeatable cache so camera movement stays crisp.
  const ground = canvas(480, 102), gc = ground.getContext('2d');
  stonework(gc, 0, 10, 480, 92, { ...p, stone: '#3d3839', mortar: '#14151e' }, rng, 78, 25);
  rect(gc, '#11111d', 0, 0, 480, 4); rect(gc, p.light, 0, 3, 480, 3); rect(gc, p.trim, 0, 6, 480, 11); rect(gc, '#e1c5992b', 0, 7, 480, 2); rect(gc, '#191721', 0, 17, 480, 4);
  for (let x = 0; x < 480; x += 48) { rect(gc, '#302d32', x, 4, 2, 13); rect(gc, '#c3ad832f', x + 6, 7, 19 + rng() * 15, 2); }
  for (let i = 0; i < 22; i++) { const x = rng() * 480; rect(gc, '#68705a45', x, 20 + rng() * 35, 2 + rng() * 11, 2); }
  const dark = gc.createLinearGradient(0, 28, 0, 102); dark.addColorStop(0, '#0d0d1800'); dark.addColorStop(1, '#080b14e0'); gc.fillStyle = dark; gc.fillRect(0, 28, 480, 74);
  return { far, architecture, ground };
}
function torch(c, x, y, t) {
  const f = Math.sin(t * 15 + x) * 2;
  rect(c, '#151520', x - 5, y + 5, 10, 28); rect(c, '#89744f', x - 3, y + 5, 6, 22); rect(c, '#b39a64', x - 7, y + 6, 14, 4);
  poly(c, '#a64b34', [[x - 7, y + 5], [x - 6, y - 7], [x - 2, y - 12 - f], [x + 1, y - 3], [x + 5, y - 17 + f], [x + 7, y], [x + 4, y + 6]]);
  poly(c, '#e9a34f', [[x - 4, y + 5], [x - 3, y - 4], [x, y - 9 - f], [x + 4, y + 2], [x + 2, y + 7]]);
  rect(c, '#ffe5a1', x - 2, y, 4, 6);
  rect(c, '#eab36199', x + Math.sin(t * 3 + x) * 5, y - 22 - (t * 12 + x) % 18, 2, 2);
}
// Chest: relic = violet gem and glow, heal = green cross, optional = gold lid band and corner caps; opened chests sit dim with the lid flipped back.
const chestOpen = new WeakMap(); // chest -> time it was first seen open, drives the lid flip
export function drawChest(ctx, c, time = 0) {
  const x = Math.round(c.x - c.w / 2), y = Math.round(c.y - c.h), heal = c.kind === 'heal', tint = heal ? '#82c9a3' : '#c5b6f4', gold = c.optional ? '#e0bd6a' : '#8a6a3c';
  if (c.opened && !chestOpen.has(c)) chestOpen.set(c, time);
  const t = c.opened ? Math.min(1, (time - chestOpen.get(c)) / .35) : 0; // 0 closed .. 1 fully open
  shadow(ctx, c.x, c.y, c.w + 8);
  if (!c.opened) { ctx.globalAlpha = .3 + .15 * Math.sin(time * 4); ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(c.x, c.y - c.h / 2, 26, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  else if (t < 1) { ctx.globalAlpha = .5 * (1 - t); ctx.fillStyle = tint; ctx.fillRect(x + 4, y - 30 * t, c.w - 8, 30 * t); ctx.globalAlpha = 1; }
  rect(ctx, '#2b1f17', x, y + 8, c.w, c.h - 8); rect(ctx, c.opened ? '#4f3720' : '#6b4a2b', x + 2, y + 10, c.w - 4, c.h - 12);
  if (c.optional) { rect(ctx, gold, x, y + 8, 4, c.h - 8); rect(ctx, gold, x + c.w - 4, y + 8, 4, c.h - 8); }
  if (c.opened) {
    rect(ctx, '#1b1410', x + 2, y + 8, c.w - 4, 5); rect(ctx, tint + (t < 1 ? 'ff' : '55'), x + 6, y + 8, c.w - 12, 2);
    const lh = Math.round(10 * (1 - t) + 3 * t); // lid squashes toward the back edge as it flips
    rect(ctx, '#2b1f17', x, y + 8 - lh - 1, c.w, lh + 1); rect(ctx, c.optional ? '#a98b4c' : '#5a3f24', x + 1, y + 8 - lh, c.w - 2, Math.max(1, lh - 1));
    return;
  }
  rect(ctx, '#2b1f17', x, y, c.w, 10); rect(ctx, '#7a5632', x + 1, y + 1, c.w - 2, 8);
  rect(ctx, gold, x + 1, y + 3, c.w - 2, c.optional ? 4 : 2); // optional chests: wide gold lid band
  rect(ctx, '#d6b46a', x + c.w / 2 - 3, y + 7, 6, 8);
  const mx = x + c.w / 2, sy = y + 11; // shape symbol on a dark plate: heart = heal, diamond = relic (readable without colour)
  rect(ctx, '#140f0c', mx - 7, sy - 6, 14, 12);
  if (heal) { rect(ctx, '#e9fff1', mx - 5, sy - 4, 4, 3); rect(ctx, '#e9fff1', mx + 1, sy - 4, 4, 3); rect(ctx, '#e9fff1', mx - 5, sy - 1, 10, 2); rect(ctx, '#e9fff1', mx - 3, sy + 1, 6, 2); rect(ctx, '#e9fff1', mx - 1, sy + 3, 2, 1); }
  else { poly(ctx, '#f1ebff', [[mx, sy - 6], [mx + 5, sy], [mx, sy + 6], [mx - 5, sy]]); poly(ctx, tint, [[mx, sy - 3], [mx + 2, sy], [mx, sy + 3], [mx - 2, sy]]); }
}
// Platforms are drawn live every frame (never in the scene cache). The top edge is exactly y and spans x..x+w, matching collision.
function drawPlatform(c, pl, x, y, w, p, time, camera) {
  if (pl.moving && pl.move) { // amber track + end stops show the whole motion path
    const a = pl.move.amp, h = pl.move.axis === 'x';
    if (h) { const tx = Math.round(pl.x0 - camera - a), len = Math.round(w + a * 2); rect(c, '#c9a24a55', tx, y + 8, len, 2); rect(c, '#c9a24a', tx, y + 5, 3, 8); rect(c, '#c9a24a', tx + len - 3, y + 5, 3, 8); }
    else { const cx = x + (w >> 1), ty = Math.round(pl.y0 - a); rect(c, '#c9a24a55', cx - 1, ty, 2, a * 2 + 18); rect(c, '#c9a24a', cx - 5, ty, 10, 3); rect(c, '#c9a24a', cx - 5, ty + a * 2 + 15, 10, 3); }
  }
  const k = pl.kind;
  rect(c, '#05061155', x + 3, y + 18, w, 5);
  if (k === 'bridge') { // broken planks with gaps, rope rails
    let i = 0;
    for (let px = 0; px < w; px += 15, i++) {
      const pw = Math.min(13, w - px), gap = i % 4 === 2 && pw > 8; // a notch breaks one plank
      rect(c, '#2a1d14', x + px, y, pw, 18); rect(c, i % 2 ? '#7a5a38' : '#6b4d30', x + px, y, pw, 5);
      rect(c, '#a98355', x + px, y, pw, 1);
      if (gap) rect(c, '#0b0d15', x + px + 4, y + 1, 5, 17);
    }
    rect(c, '#a99060', x, y + 6, w, 2); rect(c, '#53402a', x, y + 8, w, 2);
    rect(c, '#a99060', x, y - 9, 2, 9); rect(c, '#a99060', x + w - 2, y - 9, 2, 9);
    line(c, '#a9906088', x, y - 8, x + w, y - 2, 1);
    line(c, '#a9906066', x + 4, y + 18, x + 7, y + 30, 1); line(c, '#a9906066', x + w - 5, y + 18, x + w - 8, y + 28, 1);
  } else if (k === 'shelf') { // wooden shelf with book spines
    rect(c, '#2a1b12', x, y, w, 18); rect(c, '#7a4f2d', x, y, w, 4); rect(c, '#b28556', x, y, w, 1); rect(c, '#4a2f1b', x, y + 4, w, 3); rect(c, '#1a1210', x, y + 14, w, 4);
    const cols = ['#6b2f3a', '#355a55', '#7d6a35', '#3d3b6b', '#7a4a2a'];
    for (let bx = 3, i = 0; bx < w - 5; bx += 6 + (i % 3), i++) { const bh = 6 + (i * 5) % 5; rect(c, cols[Math.abs(i + (pl.x0 | 0)) % 5], x + bx, y + 7, 5, bh > 7 ? 7 : bh); rect(c, '#d9c18f66', x + bx + 1, y + 8, 1, 4); }
  } else if (k === 'gear') { // iron slab with teeth, cog spins when it moves
    rect(c, '#1b1d24', x, y, w, 18); rect(c, '#6e7482', x, y, w, 3); rect(c, '#a4abb8', x, y, w, 1); rect(c, '#3d424e', x, y + 3, w, 11);
    for (let tx = 1; tx < w - 3; tx += 8) rect(c, '#555b69', x + tx, y + 14, 5, 4);
    for (let rx = 10; rx < w - 6; rx += 26) { rect(c, '#1b1d24', x + rx, y + 6, 3, 3); rect(c, '#8c93a1', x + rx, y + 6, 1, 1); }
    if (pl.moving) {
      const cx = x + (w >> 1), cy = y + 9, a = time * 3 * (pl.move && pl.move.axis === 'y' ? -1 : 1);
      c.save(); c.translate(cx, cy); c.rotate(a);
      for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); rect(c, '#c9a24a', -2, -9, 4, 4); }
      c.restore(); circle(c, '#c9a24a', cx, cy, 6); circle(c, '#2a2418', cx, cy, 3); rect(c, '#e6c877', cx - 1, cy - 1, 2, 2);
    }
  } else if (k === 'ledge') { // cathedral ledge with gothic trim
    rect(c, '#2a2432', x, y, w, 18); rect(c, p.light, x, y, w, 3); rect(c, '#4d4358', x, y + 3, w, 6); rect(c, '#1c1722', x, y + 14, w, 4);
    for (let ax = 4; ax + 10 <= w - 2; ax += 14) { poly(c, '#17121c', [[x + ax, y + 14], [x + ax, y + 11], [x + ax + 5, y + 6], [x + ax + 10, y + 11], [x + ax + 10, y + 14]]); rect(c, p.accent, x + ax + 4, y + 8, 2, 2); }
    poly(c, '#4d4358', [[x, y + 18], [x + 10, y + 18], [x + 5, y + 28]]); poly(c, '#4d4358', [[x + w - 10, y + 18], [x + w, y + 18], [x + w - 5, y + 28]]);
  } else { // stone slab
    rect(c, '#403b3b', x, y, w, 18); rect(c, p.light, x, y, w, 3); rect(c, p.trim, x, y + 3, w, 7); rect(c, '#27252e', x, y + 12, w, 6);
    rect(c, '#c8b28c44', x + 1, y + 4, w - 2, 1);
    for (let bx = 35; bx < w; bx += 38) rect(c, '#292731', x + bx, y + 3, 2, 9);
    poly(c, '#4f4640', [[x + 8, y + 18], [x + 28, y + 18], [x + 14, y + 32], [x + 8, y + 32]]);
    poly(c, '#4f4640', [[x + w - 28, y + 18], [x + w - 8, y + 18], [x + w - 8, y + 32], [x + w - 14, y + 32]]);
  }
}
export function drawScene(ctx, { camera = 0, width = 960, height = 540, time = 0, stage = 0, platforms = [], worldWidth = 4000 } = {}) {
  stage = Math.max(0, Math.min(4, Math.floor(stage) || 0));
  if (!cache.has(stage)) cache.set(stage, makeScene(stage));
  const scene = cache.get(stage), p = palettes[stage];
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const farOffset = Math.floor(camera * .13) % W, wallOffset = Math.floor(camera * .43) % W;
  for (let x = -farOffset; x < width; x += W) ctx.drawImage(scene.far, x, 0);
  for (let x = -wallOffset; x < width; x += W) ctx.drawImage(scene.architecture, x, 0);
  // Low moonlight shafts sit behind the characters.
  ctx.globalAlpha = .025;
  for (let x = -wallOffset + 180; x < width + 250; x += 360) poly(ctx, '#c7c1df', [[x, 155], [x + 52, 155], [x + 195, FLOOR], [x + 15, FLOOR]]);
  ctx.globalAlpha = 1;
  for (let x = -wallOffset + 49; x < width; x += 360) if (x > -30) torch(ctx, x, 298, time);
  for (let x = -(Math.floor(camera) % 480); x < width; x += 480) ctx.drawImage(scene.ground, x, FLOOR);
  for (const platform of platforms) {
    const x = Math.round((platform.x || 0) - camera), y = Math.round(platform.y ?? FLOOR), w = Math.round(platform.w || platform.width || 90);
    if (y >= FLOOR || x + w < -20 || x > width + 20) continue;
    drawPlatform(ctx, platform, x, y, w, p, time, camera);
  }
  // Sparse rain and embers are animated without allocating particle objects.
  if (stage === 0 || stage === 2) {
    for (let i = 0; i < 38; i++) {
      const x = ((i * 89.3 - camera * .7 - time * 26) % (width + 100) + width + 100) % (width + 100) - 30;
      const y = (i * 67 + time * 160) % FLOOR;
      line(ctx, '#b6bac91c', x, y, x - 3, y + 14, 1);
    }
  }
  for (let i = 0; i < 13; i++) {
    const x = ((i * 113 - camera * .65 + Math.sin(time + i) * 8) % width + width) % width;
    const y = 330 - ((i * 37 + time * 9) % 230);
    rect(ctx, i % 3 ? '#b6a88a3b' : '#d7a07070', x, y, 1, 1);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, height); shade.addColorStop(0, '#05071183'); shade.addColorStop(.25, '#060a1200'); shade.addColorStop(.8, '#060a1200'); shade.addColorStop(1, '#06081070'); ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
function shadow(c, x, y, w = 32) { c.fillStyle = '#05061177'; c.beginPath(); c.ellipse(x, y - 1, w / 2, 3, 0, 0, Math.PI * 2); c.fill(); }
function boot(c, x, y, color = '#303340') { rect(c, '#090e19', x - 3, y - 13, 8, 14); rect(c, color, x - 2, y - 12, 5, 9); rect(c, '#999990', x - 2, y - 12, 2, 8); rect(c, '#111923', x - 3, y - 4, 11, 4); rect(c, '#6d7379', x - 2, y - 2, 10, 2); }
export function drawHero(ctx, p = {}, time = 0) {
  const x = Math.round(p.x || 0), y = Math.round(p.y ?? FLOOR), dir = p.dir === -1 ? -1 : 1, moving = Math.abs(p.vx || 0) > 12, phase = time * 13, stride = moving && p.grounded !== false ? Math.sin(phase) * 5 : 0;
  shadow(ctx, x, y, p.dash > 0 ? 44 : 33);
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (p.invulnerable > 0 && Math.floor(time * 18) % 3 === 0) ctx.globalAlpha = .64;
  const bob = moving && p.grounded !== false ? Math.round(Math.cos(phase * 2)) : 0;
  ctx.translate(0, bob);
  if (p.move === 'thrust' && p.attack > 0) { ctx.translate(5, 0); ctx.transform(1, 0, -.16, 1, 0, 0); } // lunge lean: head leads, feet planted
  // Cape silhouette, burgundy lining, and its moving torn hem.
  const wind = p.dash > 0 ? 14 : moving ? 7 : 2, wave = Math.round(Math.sin(time * 5) * 2);
  poly(ctx, '#0c101c', [[-6, -49], [-16, -46], [-21 - wind, -18 + wave], [-27 - wind, -7], [-14, -11], [-10, -7], [-4, -17], [7, -47]]);
  poly(ctx, '#662839', [[-8, -47], [-14, -43], [-17 - wind, -20 + wave], [-23 - wind, -10], [-15, -14], [-10, -12], [-5, -22], [3, -44]]);
  poly(ctx, '#9c414b', [[-9, -45], [-13, -40], [-15 - wind, -23 + wave], [-19 - wind, -14], [-13, -19], [-9, -33]]);
  line(ctx, '#c56e61', -14, -42, -19 - wind, -15, 1);
  // Legs remain independent of torso animation.
  poly(ctx, '#080d17', [[-9, -27], [1, -25], [2 + stride, -11], [-4 + stride, -4], [-9 + stride, -10]]);
  poly(ctx, '#333845', [[-7, -25], [-2, -25], [-1 + stride, -11], [-5 + stride, -10]]);
  boot(ctx, -5 + stride, 0, '#353b44');
  poly(ctx, '#0c111c', [[1, -28], [10, -26], [8 - stride, -10], [3 - stride, -5], [-1 - stride, -12]]);
  poly(ctx, '#535763', [[4, -25], [8, -24], [6 - stride, -12], [3 - stride, -11]]);
  boot(ctx, 5 - stride, 0, '#444b54');
  // Fitted coat and long split tails.
  poly(ctx, '#0a0f1b', [[-9, -48], [8, -48], [13, -41], [8, -27], [12, -14], [4, -20], [0, -27], [-4, -18], [-12, -14], [-10, -31], [-13, -39]]);
  poly(ctx, '#303340', [[-7, -45], [5, -46], [9, -40], [4, -31], [7, -22], [2, -25], [-2, -29], [-5, -21], [-8, -20], [-6, -34]]);
  rect(ctx, '#626370', -5, -43, 3, 13); rect(ctx, '#1b202e', 0, -44, 5, 13);
  line(ctx, '#c5a76a', -7, -45, -3, -32, 2); line(ctx, '#af8a56', 6, -45, 2, -31, 2);
  rect(ctx, '#ac8950', -8, -30, 17, 3); rect(ctx, '#e1c887', -1, -31, 4, 4); rect(ctx, '#442f36', 0, -30, 2, 2);
  line(ctx, '#997b52', -7, -27, -10, -17, 1); line(ctx, '#b19863', 6, -27, 9, -18, 1);
  // Back gauntlet and ornate shoulder plate.
  poly(ctx, '#131b29', [[-10, -44], [-15, -41], [-13, -30], [-9, -28], [-7, -33]]);
  rect(ctx, '#858589', -15, -39, 4, 8); rect(ctx, '#d3b67d', -14, -42, 6, 2); rect(ctx, '#454553', -13, -29, 5, 5);
  // Front arm changes pose during a slash; engine supplies the animated blade arc.
  const diving = p.plunge === 1 || p.plunge === 2, attacking = (p.attack || 0) > 0 && !diving, armX = diving ? 12 : attacking ? 14 : 10, armY = diving ? -26 : attacking ? -37 : -32;
  poly(ctx, '#111825', [[5, -45], [11, -43], [armX + 4, armY], [armX - 1, armY + 5], [5, -36]]);
  poly(ctx, '#76777f', [[8, -42], [11, -41], [armX + 3, armY], [armX, armY + 2]]);
  rect(ctx, '#d0bb8d', 6, -45, 8, 3); rect(ctx, '#a09c94', armX - 1, armY + 1, 6, 5);
  if (diving) { // plunge pose: rapier held point-down in front of the body
    rect(ctx, '#c6a76b', armX - 3, armY + 4, 10, 3); rect(ctx, '#7b8797', armX + 1, armY + 7, 3, 30); rect(ctx, '#e0e2da', armX + 2, armY + 7, 1, 30); rect(ctx, '#d9bd7a', armX, armY + 1, 5, 3);
  } else if (!attacking) {
    // Idle rapier has a crisp silver edge and gilt crossguard.
    poly(ctx, '#7b8797', [[armX + 3, armY + 3], [armX + 28, armY - 19], [armX + 26, armY - 14], [armX + 5, armY + 6]]);
    line(ctx, '#e0e2da', armX + 4, armY + 3, armX + 28, armY - 19, 1);
    line(ctx, '#c6a76b', armX - 1, armY, armX + 8, armY + 9, 3); rect(ctx, '#d9bd7a', armX + 2, armY + 4, 3, 3);
  }
  // Pale face, red collar, and layered silver hair.
  rect(ctx, '#090d18', -7, -60, 16, 16); rect(ctx, '#c6b9a0', -3, -57, 10, 12); rect(ctx, '#eee0ba', 2, -56, 5, 7);
  rect(ctx, '#726d74', 5, -51, 3, 2); rect(ctx, '#131726', 6, -53, 3, 2); rect(ctx, '#d1c19c', 6, -48, 3, 2);
  poly(ctx, '#9a3444', [[-6, -48], [0, -44], [7, -48], [8, -44], [2, -41], [-6, -44]]);
  poly(ctx, '#646b7c', [[-8, -61], [3, -64], [9, -59], [7, -55], [2, -56], [-1, -52], [-3, -44], [-7, -36], [-12 - wind / 2, -31], [-10, -44], [-12, -51]]);
  poly(ctx, '#bbc2c5', [[-7, -60], [2, -62], [7, -59], [4, -57], [-1, -57], [-3, -50], [-5, -43], [-9 - wind / 2, -36], [-7, -47], [-9, -52]]);
  poly(ctx, '#e6e4d2', [[-5, -60], [2, -61], [5, -59], [-2, -58], [-5, -51], [-6, -45], [-7, -50]]);
  rect(ctx, '#e9e4d1', -3, -56, 2, 9); rect(ctx, '#949da9', -9, -41, 2, 6);
  ctx.restore();
}
function skeleton(c, e, time, white) {
  const bone = white || '#b9b5a1', shade = white || '#777d7b', dark = '#171f2a', step = Math.abs(e.vx || 0) > 5 ? Math.sin(time * 10) * 5 : 0;
  line(c, dark, -5, -25, -7 + step, -3, 7); line(c, shade, -5, -25, -7 + step, -3, 4);
  line(c, dark, 5, -25, 6 - step, -3, 7); line(c, bone, 5, -25, 6 - step, -3, 3);
  rect(c, shade, -10 + step, -3, 10, 3); rect(c, bone, 3 - step, -3, 10, 3);
  poly(c, dark, [[-9, -44], [8, -44], [11, -37], [6, -26], [-6, -26], [-11, -36]]);
  rect(c, shade, -8, -42, 16, 17); rect(c, dark, -6, -40, 12, 14); rect(c, bone, -1, -43, 3, 22);
  for (let y = -40; y < -27; y += 4) { rect(c, bone, -7, y, 14, 2); rect(c, shade, -8, y, 2, 3); }
  poly(c, shade, [[-8, -26], [-1, -23], [6, -26], [8, -22], [2, -18], [-6, -20]]);
  rect(c, '#161c26', -9, -61, 18, 18); rect(c, shade, -8, -59, 15, 14); rect(c, bone, -6, -60, 13, 11); rect(c, bone, -5, -49, 11, 6);
  rect(c, dark, -5, -55, 4, 4); rect(c, dark, 3, -55, 4, 4); rect(c, white || '#de7665', -3, -54, 2, 2); rect(c, white || '#de7665', 4, -54, 2, 2); rect(c, '#30313b', 0, -51, 2, 3);
  for (let x = -4; x < 6; x += 3) rect(c, '#394047', x, -46, 1, 3);
  line(c, shade, -9, -40, -14, -29, 4); line(c, bone, -14, -29, -7, -23, 3);
  const raised = (e.tell || 0) > 0;
  line(c, bone, 9, -41, 16, raised ? -49 : -31, 4);
  line(c, bone, 16, raised ? -49 : -31, raised ? 10 : 23, raised ? -62 : -32, 3);
  if (raised) { line(c, '#a7aaa9', 10, -62, 0, -85, 4); line(c, '#eee3c5', 9, -63, -1, -85, 1); line(c, '#a18c5d', 5, -62, 14, -65, 3); }
  else { poly(c, shade, [[21, -34], [52, -39], [48, -34], [22, -31]]); line(c, '#e2ddc4', 22, -34, 52, -39); rect(c, '#ad9260', 20, -38, 3, 12); }
}
function bat(c, e, time, white) {
  const flap = Math.sin(time * 16 + (e.x || 0)) * 11;
  poly(c, '#080c19', [[-2, -17], [-16, -25 - flap], [-29, -26 - flap], [-22, -11], [-15, -14], [-10, -7], [-4, -9]]);
  poly(c, white || '#75566f', [[-3, -16], [-16, -23 - flap], [-26, -24 - flap], [-20, -13], [-15, -16], [-10, -9]]);
  line(c, white || '#b38e9d', -3, -16, -26, -24 - flap);
  poly(c, '#080c19', [[2, -17], [16, -25 - flap], [29, -26 - flap], [22, -11], [15, -14], [10, -7], [4, -9]]);
  poly(c, white || '#75566f', [[3, -16], [16, -23 - flap], [26, -24 - flap], [20, -13], [15, -16], [10, -9]]);
  line(c, white || '#b38e9d', 3, -16, 26, -24 - flap);
  poly(c, white || '#51424e', [[-6, -23], [-3, -20], [3, -20], [6, -23], [5, -10], [0, -6], [-5, -10]]);
  rect(c, white || '#ec8b7c', -4, -17, 2, 2); rect(c, white || '#ec8b7c', 2, -17, 2, 2); rect(c, '#e4cfbc', -2, -11, 1, 3); rect(c, '#e4cfbc', 2, -11, 1, 3);
}
function knight(c, e, time, white, boss = false) {
  const armor = white || (boss ? '#79727d' : '#66727b'), light = white || '#aeb2a6', shadowColor = white || '#363c4c', gold = white || '#b99a63', stride = Math.abs(e.vx || 0) > 5 ? Math.sin(time * 7) * 4 : 0;
  poly(c, '#111320', [[-15, -59], [-23, -48], [-26, -5], [-13, -10], [0, -3], [11, -9], [20, -7], [16, -57]]);
  poly(c, white || '#512d40', [[-14, -58], [-19, -45], [-22, -10], [-14, -14], [-3, -8], [10, -12], [15, -10], [12, -55]]);
  boot(c, -8 + stride, 0, armor); boot(c, 7 - stride, 0, armor);
  poly(c, shadowColor, [[-13, -33], [12, -33], [15, -17], [5, -14], [0, -20], [-7, -15], [-16, -19]]);
  line(c, gold, -12, -31, -14, -19, 2); line(c, gold, 10, -31, 12, -18, 2);
  poly(c, '#111522', [[-17, -56], [-10, -62], [10, -62], [18, -55], [13, -33], [-12, -33]]);
  poly(c, armor, [[-14, -55], [-8, -59], [9, -59], [15, -54], [10, -35], [-10, -35]]);
  poly(c, shadowColor, [[0, -58], [10, -56], [10, -36], [0, -35], [-3, -47]]);
  line(c, light, -10, -55, -11, -43, 2); line(c, gold, -11, -39, 10, -39, 2);
  poly(c, gold, [[0, -54], [5, -47], [0, -41], [-5, -47]]); rect(c, white || '#763c50', -1, -50, 2, 7);
  // Segmented pauldrons.
  poly(c, '#111523', [[-17, -61], [-25, -56], [-25, -47], [-15, -45], [-10, -54]]);
  poly(c, armor, [[-18, -59], [-23, -55], [-23, -49], [-16, -48], [-12, -54]]); line(c, gold, -23, -51, -15, -49, 2);
  poly(c, armor, [[14, -59], [22, -55], [23, -47], [14, -46], [10, -53]]); line(c, gold, 14, -49, 22, -50, 2);
  line(c, shadowColor, 19, -45, 23, -32, 8); line(c, light, 19, -45, 22, -36, 2); rect(c, armor, 20, -34, 8, 6);
  // Helmet with narrow ember slit and crown/crest.
  poly(c, '#101523', [[-11, -78], [8, -80], [13, -70], [9, -61], [-8, -61], [-13, -68]]);
  poly(c, armor, [[-9, -76], [7, -78], [10, -70], [7, -63], [-7, -63], [-10, -68]]);
  rect(c, shadowColor, 0, -77, 8, 14); rect(c, light, -8, -73, 2, 8);
  rect(c, '#111320', -7, -70, 16, 4); rect(c, white || '#e8776c', -5, -69, 12, 1); rect(c, gold, -1, -78, 3, 16);
  if (boss) {
    poly(c, gold, [[-10, -78], [-16, -91], [-8, -86], [-4, -94], [1, -84], [7, -94], [11, -83], [18, -89], [12, -76]]);
    rect(c, white || '#e3cc94', -9, -80, 21, 2);
    // Heavy jagged executioner's blade.
    const raised = (e.tell || 0) > 0;
    if (raised) { poly(c, armor, [[23, -34], [21, -94], [28, -108], [35, -94], [30, -34]]); line(c, light, 22, -91, 24, -37, 2); rect(c, gold, 16, -37, 23, 4); }
    else { poly(c, shadowColor, [[23, -34], [68, -23], [76, -14], [62, -12], [23, -27]]); poly(c, armor, [[25, -33], [66, -22], [71, -16], [60, -16], [25, -29]]); line(c, light, 27, -30, 69, -17, 2); line(c, gold, 24, -39, 20, -23, 4); }
  } else {
    poly(c, white || '#753744', [[-6, -79], [-12, -88], [-23, -89], [-27, -84], [-15, -84], [-10, -76]]);
    poly(c, armor, [[23, -34], [55, -59], [54, -51], [26, -30]]); line(c, light, 25, -34, 55, -59, 1); line(c, gold, 20, -38, 29, -27, 3);
  }
  // Tarnished tower shield.
  poly(c, '#101522', [[-29, -49], [-12, -49], [-10, -25], [-21, -16], [-31, -26]]);
  poly(c, gold, [[-28, -47], [-14, -47], [-12, -26], [-21, -19], [-29, -27]]);
  poly(c, white || '#384350', [[-26, -45], [-16, -45], [-14, -27], [-21, -22], [-27, -28]]);
  line(c, light, -21, -44, -21, -27, 2); line(c, light, -26, -37, -16, -37, 2);
}
function mage(c, e, time, white) {
  const drift = Math.round(Math.sin(time * 3) * 2), violet = white || '#67567c', pale = white || '#b29caa';
  c.translate(0, drift);
  poly(c, '#101423', [[-10, -58], [8, -58], [17, -40], [12, -31], [22, -3], [10, -6], [1, -2], [-8, -6], [-19, -3], [-14, -33], [-19, -42]]);
  poly(c, violet, [[-7, -55], [7, -54], [12, -40], [7, -29], [16, -7], [6, -10], [0, -6], [-8, -10], [-14, -7], [-9, -30], [-13, -41]]);
  poly(c, white || '#342a4c', [[0, -51], [8, -43], [5, -29], [10, -9], [0, -6], [-4, -27]]);
  line(c, pale, -8, -42, -13, -9, 1); line(c, '#b59b67', -1, -41, 3, -9, 2);
  rect(c, '#ae9566', -10, -31, 19, 3); rect(c, '#d8bd81', -1, -32, 4, 5);
  poly(c, violet, [[-12, -55], [-6, -67], [1, -72], [9, -62], [13, -52], [8, -43], [-9, -43]]);
  poly(c, '#101424', [[-7, -56], [0, -65], [7, -56], [6, -47], [-6, -47]]);
  rect(c, white || '#c2a4de', -5, -54, 3, 2); rect(c, white || '#c2a4de', 3, -54, 3, 2);
  line(c, pale, -10, -53, -6, -62, 2); line(c, '#a08362', 9, -48, 12, -53, 2);
  line(c, violet, 11, -43, 22, -32, 7); rect(c, pale, 20, -34, 7, 5);
  line(c, '#ab9573', 26, -7, 25, -64, 3); line(c, '#5a4c46', 28, -7, 27, -63, 1);
  poly(c, '#b6a07a', [[20, -65], [22, -73], [28, -75], [32, -68], [28, -61], [22, -61]]);
  circle(c, white || '#bfa0df', 26, -68, 4); rect(c, '#f3dfff', 24, -70, 2, 2);
  if (e.tell > 0) { c.strokeStyle = '#bca0df99'; c.lineWidth = 1; c.beginPath(); c.arc(26, -68, 10 + Math.sin(time * 16) * 2, 0, 7); c.stroke(); }
}
function priest(c, e, time, white) {
  const robe = white || '#6b2a38', dark = white || '#2a1220', sway = Math.round(Math.sin(time * 2) * 1);
  poly(c, '#101423', [[-11, -56], [9, -56], [15, -5], [-16, -5]]);
  poly(c, robe, [[-9, -54], [7, -54], [12, -7], [-13, -7]]);
  poly(c, dark, [[-3, -54], [3, -54], [3, -7], [-3, -7]]);
  circle(c, white || '#d8c7b0', 0, -62, 6); poly(c, robe, [[-8, -60], [0, -72], [8, -60], [0, -56]]);
  line(c, '#8b7a58', 8, -44, 20 + sway, -32, 2); line(c, '#8b7a58', 20 + sway, -32, 20 + sway, -24, 1);
  circle(c, white || '#d4423a', 20 + sway, -22, 4);
}
function shieldBearer(c, e, time, white) {
  const armor = white || '#5d6670', dark = white || '#2f3542', light = white || '#aeb2a6', bronze = white || '#9c7a4a', broken = (e.guardBreak || 0) > 0, stride = Math.abs(e.vx || 0) > 5 ? Math.sin(time * 5) * 3 : 0;
  // Hunched, wide body behind the shield; front is +x.
  poly(c, '#111320', [[-17, -54], [-20, -6], [-6, -4], [8, -6], [10, -52]]);
  poly(c, white || '#4a2a38', [[-15, -52], [-18, -9], [-6, -7], [6, -10], [7, -50]]);
  boot(c, -9 + stride, 0, armor); boot(c, 3 - stride, 0, armor);
  poly(c, '#101522', [[-16, -55], [9, -57], [13, -26], [-15, -24]]);
  poly(c, armor, [[-14, -53], [7, -55], [10, -28], [-13, -26]]);
  poly(c, dark, [[-3, -54], [7, -55], [10, -28], [-2, -27]]); line(c, light, -12, -51, -12, -30, 2); line(c, bronze, -13, -32, 9, -33, 3);
  // Short mace held back.
  line(c, dark, -12, -46, -21, -32, 6); line(c, '#6b5a44', -21, -30, -27, -46, 2); rect(c, white || '#7d8590', -30, -52, 7, 7); rect(c, light, -29, -51, 2, 2);
  // Brimmed kettle helm: flat, wide top distinguishes it from the crested knight.
  poly(c, '#101523', [[-12, -71], [-6, -76], [5, -76], [10, -70], [10, -58], [-11, -58]]);
  poly(c, armor, [[-10, -70], [-5, -74], [4, -74], [8, -69], [8, -60], [-9, -60]]);
  rect(c, '#111320', -18, -67, 32, 4); rect(c, bronze, -17, -66, 30, 2);
  // Visor slit slides to the back while the bearer is about to turn round (e.reface).
  const look = (e.reface || 0) > 0 ? -8 : 0;
  rect(c, '#111320', -2 + look, -63, 10, 3); rect(c, white || '#e8776c', look, -62, 7, 1);
  if (broken) {
    // Guard broken: shield split, lowered, front exposed.
    poly(c, '#101522', [[6, -38], [13, -44], [17, -36], [22, -41], [26, -30], [24, -4], [12, 0], [5, -6]]);
    poly(c, white || '#3f4a58', [[8, -36], [13, -41], [17, -33], [22, -38], [24, -29], [22, -6], [12, -3], [7, -8]]);
    line(c, '#e2d3a7', 15, -32, 12, -18, 1); line(c, '#e2d3a7', 12, -18, 17, -8, 1); line(c, bronze, 8, -8, 22, -6, 2);
    rect(c, light, 19 + Math.round(Math.sin(time * 9) * 2), -52, 3, 3); rect(c, light, 26, -47 + Math.round(Math.cos(time * 9) * 2), 2, 2);
    return;
  }
  // Tower shield on the facing side: tall slab, cold rim light on the front edge.
  // Bash wind-up rears the shield back and tilts it within 0.15 s; the bash itself thrusts it forward.
  const k = (e.tell || 0) > 0 ? Math.min(1, (.55 - e.tell) / .15) : 0, thrust = (e.turn || 0) > .45 ? 6 : 0;
  const pull = Math.round(-12 * k + thrust - ((e.reface || 0) > 0 ? 3 : 0));
  c.save(); c.translate(17 + pull, -2); c.rotate(-.32 * k); c.translate(-17, 2);
  poly(c, '#0c101b', [[8, -74], [27, -71], [28, -6], [17, 1], [7, -5]]);
  poly(c, bronze, [[10, -72], [26, -69], [26, -8], [17, -2], [9, -7]]);
  poly(c, white || '#3f4a58', [[12, -69], [24, -67], [24, -10], [17, -5], [11, -9]]);
  rect(c, white || '#d4dcea', 26, -68, 2, 58); line(c, white || '#7a3442', 18, -66, 18, -8, 3);
  circle(c, bronze, 18, -38, 4); rect(c, white || '#e9d29a', 17, -40, 2, 2);
  c.restore();
}
function spearman(c, e, time, white) {
  // .64 = spearman warning time (e.tell = .64 in core.js updateEnemy)
  const bone = white || '#d9d2bd', dark = white || '#5a5448', k = (e.tell || 0) > 0 ? Math.min(1, (.64 - e.tell) / .2) : 0, stride = Math.abs(e.vx || 0) > 5 ? Math.sin(time * 6) * 3 : 0;
  line(c, dark, -4, -28, -4 + stride, -2, 3); line(c, dark, 3, -28, 3 - stride, -2, 3);
  rect(c, bone, -6, -54, 12, 26); circle(c, bone, 0, -62, 7); rect(c, '#111320', 1, -64, 5, 3);
  // Placeholder: spear reaches back during the warning, then out to the thrust length.
  const sx = e.turn > .4 ? 180 : 150 - 40 * k; // thrust tip lands on the hitbox end (194 px)
  line(c, white || '#d2ac75', 8 - 20 * k, -36, sx, -30, 2); poly(c, white || '#c2a4de', [[sx, -35], [sx + 14, -30], [sx, -25]]);
  poly(c, white || '#c2a4de', [[8 - 20 * k, -36], [-2 - 20 * k, -42], [-2 - 20 * k, -32]]); // pennant at the butt silhouettes it from the knight
}
const tellMax = new WeakMap(); // total warning time per e.warn object, remembered on the first frame it is seen
// Boss warnings draw the exact e.warn hit areas from core.js, filling as the warning counts down (gold when punishable).
function drawBossWarn(ctx, e, time) {
  const w = e.warn; if (!w || !(e.tell > 0)) return;
  if (!tellMax.has(w)) tellMax.set(w, e.tell);
  const p = Math.max(0, Math.min(1, 1 - e.tell / tellMax.get(w))), rgb = e.punishable ? '255,211,110' : '231,92,80', edge = e.punishable ? '#ffd36e' : '#ff7a6a', d = e.dir === -1 ? -1 : 1;
  const fillBox = b => { // outline = full hit box, inner fill grows from the boss outward
    const fw = Math.round(b.w * p); const pu = e.punishable; ctx.fillStyle = `rgba(${rgb},${pu ? .3 : .14})`; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = `rgba(${rgb},${(pu ? .3 : .18) + .3 * p})`; ctx.fillRect(d === 1 ? b.x : b.x + b.w - fw, b.y, fw, b.h);
    ctx.strokeStyle = edge; ctx.lineWidth = pu ? 3 : 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  };
  ctx.save();
  if (w.kind === 'slash' || w.kind === 'slam') fillBox(w.box);
  if (w.kind === 'charge') {
    fillBox(w.box); const l = w.line; ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -time * 40 * d;
    ctx.beginPath(); ctx.moveTo(Math.round(l.x1), Math.round(l.y1)); ctx.lineTo(Math.round(l.x2), Math.round(l.y2)); ctx.stroke(); ctx.setLineDash([]);
    const tx = Math.round(l.x2), ty = Math.round(l.y2), a = d * 12; ctx.fillStyle = '#ffe0d0'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - a, ty - 8); ctx.lineTo(tx - a, ty + 8); ctx.fill();
  }
  if (w.wave) { // phase 2+ slam: the ground wave runs along the floor line
    const v = w.wave; ctx.strokeStyle = `rgba(${rgb},${.3 + .4 * p})`; ctx.lineWidth = 3; ctx.setLineDash([14, 8]); ctx.lineDashOffset = -time * 60 * d;
    ctx.beginPath(); ctx.moveTo(Math.round(v.x1), Math.round(v.y1)); ctx.lineTo(Math.round(v.x2), Math.round(v.y2)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = edge; const tx = Math.round(v.x2), a = d * 10; ctx.beginPath(); ctx.moveTo(tx, v.y2); ctx.lineTo(tx - a, v.y2 - 7); ctx.lineTo(tx - a, v.y2 + 7); ctx.fill();
  }
  if (w.lines) for (const l of w.lines) { // faint band = orb width (r 9), bright line = flight path, dot = tip
    ctx.strokeStyle = `rgba(${rgb},${.1 + .14 * p})`; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},${.6 + .4 * p})`; ctx.lineWidth = 3; ctx.setLineDash([9, 6]); ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = edge; ctx.fillRect(Math.round(l.x2) - 3, Math.round(l.y2) - 3, 6, 6);
  }
  if (w.circles) for (const c of w.circles) { // ground-centred disc: dome above the floor plus a ring on it; centre fill grows to the full radius
    const cx = Math.round(c.x), cy = Math.round(c.y), r = c.r;
    ctx.fillStyle = `rgba(${rgb},.12)`; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},${.2 + .35 * p})`; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r * p), Math.PI, 0); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},.8)`; ctx.beginPath(); ctx.ellipse(cx, cy - 1, r, 8, 0, 0, 7); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = time * 1.5 + i * Math.PI / 3; ctx.fillStyle = edge; ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy - 1 + Math.sin(a) * 8) - 1, 3, 3); }
  }
  ctx.restore();
}
export function drawEnemy(ctx, e = {}, time = 0) {
  const x = Math.round(e.x || 0), y = Math.round(e.y ?? FLOOR), boss = e.type === 'boss';
  if (e.type !== 'bat') shadow(ctx, x, y, boss ? 72 : 33);
  if (e.tell > 0) { ctx.save(); ctx.strokeStyle = '#e7746666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 1, boss ? 70 : 29, boss ? 8 : 4, 0, 0, 7); ctx.stroke(); ctx.restore(); }
  if (boss) drawBossWarn(ctx, e, time);
  if (e.tell > 0 && e.thrustBox) { const b = e.thrustBox; ctx.save(); ctx.fillStyle = '#e7746640'; ctx.strokeStyle = '#e7746699'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
    // dashed path along the box centre with a bright tip at the far end, so the whole reach reads as the weapon's path
    const fx = e.dir === -1 ? b.x : b.x + b.w, my = Math.round(b.y + b.h / 2); ctx.strokeStyle = '#ec8b7c'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(Math.round(e.x + (e.dir === -1 ? -10 : 10)), my); ctx.lineTo(Math.round(fx), my); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#e4cfbc'; ctx.fillRect(Math.round(fx) - (e.dir === -1 ? 0 : 6), my - 3, 6, 6); ctx.restore(); }
  if (e.blessRadius > 0 && e.tell > 0) { const p = Math.min(1, 1 - e.tell / .9); ctx.save(); ctx.fillStyle = `rgba(212,66,58,${.12 + .3 * p})`; ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - 2, e.blessRadius, 20, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); } // flat floor reach: fills as the warning ends
  if (e.blessed > 0) { const pu = Math.sin(time * 6) * .5 + .5, hy = Math.round(y - 88 - pu * 2); ctx.save(); ctx.fillStyle = `rgba(212,66,58,${.2 + pu * .1})`; ctx.strokeStyle = `rgba(255,106,92,${.6 + pu * .4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 29, 26, 40, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff6a5c'; ctx.beginPath(); ctx.moveTo(x, hy - 7); ctx.quadraticCurveTo(x + 7, hy + 1, x, hy + 5); ctx.quadraticCurveTo(x - 7, hy + 1, x, hy - 7); ctx.fill(); ctx.restore(); }
  if (e.elite) { const pu = Math.sin(time * 4) * .5 + .5; ctx.save(); ctx.fillStyle = `rgba(150,90,220,${.16 + pu * .1})`; ctx.strokeStyle = `rgba(190,140,255,${.5 + pu * .3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 30, 30 + pu * 3, 44 + pu * 3, 0, 0, 7); ctx.fill(); ctx.stroke(); if (e.ward > 0) { ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 30, 50, 0, 7); ctx.stroke(); } ctx.restore(); } // placeholder elite aura + ward ring
  ctx.save(); ctx.translate(x, y); ctx.scale(e.dir === -1 ? -1 : 1, 1);
  const white = e.flash > 0 ? '#fff0d0' : null;
  if (boss) { if (e.travel > 0) ctx.rotate(.2); /* charge lean, forward in local x */ ctx.scale(1.35, 1.35); knight(ctx, e, time, white, true); }
  else if (e.type === 'bat') bat(ctx, e, time, white);
  else if (e.type === 'shield') shieldBearer(ctx, e, time, white);
  else if (e.type === 'spear') spearman(ctx, e, time, white);
  else if (e.type === 'knight') knight(ctx, e, time, white);
  else if (e.type === 'priest') priest(ctx, e, time, white);
  else if (e.type === 'mage') mage(ctx, e, time, white);
  else skeleton(ctx, e, time, white);
  ctx.restore();
}
export function drawPortal(ctx, x = 0, y = FLOOR, time = 0, open = false) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  const p = palettes[4];
  archPath(ctx, -35, -112, 70, 112); ctx.fillStyle = '#080c16'; ctx.fill(); ctx.strokeStyle = '#7d7166'; ctx.lineWidth = 11; ctx.stroke();
  archPath(ctx, -35, -112, 70, 112); ctx.strokeStyle = '#c8ac7c'; ctx.lineWidth = 2; ctx.stroke();
  for (let yy = -70; yy < 0; yy += 18) { rect(ctx, '#b19a72', -42, yy, 11, 2); rect(ctx, '#b19a72', 31, yy, 11, 2); }
  if (open) {
    ctx.save(); archPath(ctx, -29, -104, 58, 104); ctx.clip();
    const glow = ctx.createRadialGradient(0, -47, 2, 0, -47, 68); glow.addColorStop(0, '#d8ccbf'); glow.addColorStop(.2, '#aaa7bf'); glow.addColorStop(.6, '#625074'); glow.addColorStop(1, '#25273c'); ctx.fillStyle = glow; ctx.fillRect(-30, -108, 60, 110);
    for (let i = 0; i < 12; i++) { const yy = -((time * 28 + i * 19) % 109), xx = Math.sin(i * 5 + time) * 22; rect(ctx, '#f4e9c681', xx, yy, 2, 5); }
    ctx.restore();
    const groundGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 65); groundGlow.addColorStop(0, '#b4a3da55'); groundGlow.addColorStop(1, '#9f85c700'); ctx.fillStyle = groundGlow; ctx.fillRect(-65, -60, 130, 70);
  } else {
    for (let bx = -23; bx < 30; bx += 11) { rect(ctx, '#3d414c', bx, -93 + Math.abs(bx) * .65, 4, 95 - Math.abs(bx) * .65); rect(ctx, '#8b8173', bx, -91 + Math.abs(bx) * .65, 1, 91 - Math.abs(bx) * .65); }
    rect(ctx, '#7d6e5d', -29, -57, 58, 4); rect(ctx, '#7d6e5d', -29, -22, 58, 4); rect(ctx, '#a18d65', -6, -44, 12, 12); rect(ctx, '#242431', -1, -40, 3, 6);
  }
  poly(ctx, '#c5ab7c', [[0, -126], [7, -116], [0, -109], [-7, -116]]); circle(ctx, open ? '#e6d1b0' : '#784a55', 0, -116, 3);
  ledge(ctx, -44, -1, 88, p); ctx.restore();
}

// Code-drawn hazards. Geometry is exactly the core hit area (x centre, y base, w x h); the ACTIVE drawing fills that box edge to edge.
const TRAP_STAGE = { spikes: 0, gears: 2, pillar: 3 };
export function drawTrap(ctx, tr, time = 0) {
  const p = palettes[TRAP_STAGE[tr.kind] ?? 0], x = Math.round(tr.x - tr.w / 2), w = tr.w, h = tr.h, y = FLOOR, st = tr.state, pr = tr.progress || 0;
  const off = st === 'off', act = st === 'active', warn = st === 'warn';
  ctx.save();
  rect(ctx, off ? '#25242b' : p.mortar, x - 2, y - 5, w + 4, 5); rect(ctx, off ? '#3a3940' : p.trim, x - 2, y - 5, w + 4, 1); // base plate (kept inside the stage palette)
  if (warn) { // red tint + outline growing over the whole hit area, so the danger zone reads before it bites
    ctx.globalAlpha = .1 + .3 * pr * (.75 + .25 * Math.sin(time * 30)); ctx.fillStyle = '#e0484e'; ctx.fillRect(x, y - h, w, h);
    ctx.globalAlpha = .45 + .4 * pr; ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(x + .5, y - h + .5, w - 1, h - 1); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const k = act ? 1 : warn ? Math.min(.45, .08 + .4 * pr) : 0; // how far the hazard has risen
  if (tr.kind === 'spikes') {
    const n = Math.max(2, Math.round(w / 12)), sw = w / n, top = off ? 7 : 3 + (h - 3) * k;
    for (let i = 0; i < n; i++) {
      const sx = x + i * sw, tip = off && i % 3 === 1 ? 3 : top; // disabled: snapped stubs
      rect(ctx, off ? '#2a2a31' : p.mortar, sx, y - 5 - 3, sw, 3);
      poly(ctx, off ? '#4a4a52' : '#aeb4c2', [[sx, y - 5], [sx + sw / 2, y - 5 - Math.min(tip, h - 5)], [sx + sw, y - 5]]);
      if (!off) poly(ctx, act ? '#e9eefc' : '#cfd6e6', [[sx + sw / 2, y - 5 - Math.min(tip, h - 5)], [sx + sw * .6, y - 5], [sx + sw / 2, y - 5]]);
      if (act) rect(ctx, '#c4283a', sx + sw / 2 - 1, y - 5 - 6, 2, 3);
    }
    if (act) rect(ctx, '#e9eefc', x, y - h, 1, 1); // marks the exact box top-left
  } else if (tr.kind === 'gears') {
    ctx.beginPath(); ctx.rect(x, y - h, w, h - 5); ctx.clip(); // wheels live inside the hit box only
    const n = Math.max(2, Math.round(w / 40)), sp = w / n, R = Math.round(h * .6), rise = off ? .22 : act ? 1 : k;
    for (let i = 0; i < n; i++) {
      const cx = x + sp * (i + .5), ang = off ? i : time * (i % 2 ? -5 : 5) * (act ? 1 : .4 + pr);
      const wy = Math.round(act ? y - h + R : y - 5 + R - (h - 5) * rise); // risen wheels have their top exactly at the box top
      ctx.save(); ctx.translate(Math.round(cx), wy); ctx.rotate(ang);
      for (let t = 0; t < 10; t++) { ctx.save(); ctx.rotate(t * Math.PI / 5); rect(ctx, off ? '#4a4a52' : '#8a8f99', -3, -R, 6, 7); ctx.restore(); }
      circle(ctx, off ? '#33333b' : '#5c616c', 0, 0, R - 4); circle(ctx, off ? '#25242b' : p.mortar, 0, 0, R - 11);
      for (let t = 0; t < 4; t++) { ctx.save(); ctx.rotate(t * Math.PI / 2); rect(ctx, off ? '#3a3940' : p.trim, -1, -R + 6, 3, R - 12); ctx.restore(); }
      circle(ctx, off ? '#44444c' : p.light, 0, 0, 3);
      ctx.restore();
    }
    if (off) { ctx.globalAlpha = .5; rect(ctx, '#0d0c12', x, y - h, w, h); }
  } else { // pillar: a blood geyser
    const rh = act ? h : h * (warn ? .08 + .22 * pr : 0), cx = x + w / 2;
    if (!off) {
      ctx.strokeStyle = warn ? `rgba(255,106,122,${.4 + .5 * pr})` : '#5a2a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, y - 4, w / 2 - 2, 4, 0, 0, 7); ctx.stroke(); // floor rune
      if (!act && !warn) for (let i = 0; i < 3; i++) rect(ctx, '#7a2236', cx - 12 + i * 10, y - 7, 2, 2); // idle: faint seepage
    } else { ctx.strokeStyle = '#2c2128'; ctx.beginPath(); ctx.moveTo(x + 6, y - 4); ctx.lineTo(cx, y - 7); ctx.lineTo(x + w - 8, y - 3); ctx.stroke(); rect(ctx, '#3a2a30', cx - 4, y - 8, 8, 3); } // dried, cracked
    if (rh > 1) {
      const g = ctx.createLinearGradient(0, y - rh, 0, y); g.addColorStop(0, act ? '#d8506a' : '#7a2236'); g.addColorStop(1, '#6b1a2c'); ctx.fillStyle = g; ctx.globalAlpha = act ? 1 : .7;
      ctx.fillRect(x, y - rh, w, rh - 4); ctx.fillStyle = '#ff6a7a'; ctx.fillRect(Math.round(cx - w * .22), y - rh, Math.round(w * .44), rh - 4);
      ctx.fillStyle = '#ffd0d6'; ctx.fillRect(Math.round(cx - 2), y - rh, 4, rh - 4);
      ctx.globalAlpha = 1; ctx.fillStyle = '#ff9aa6'; for (let i = 0; i < 3; i++) { const ph = (time * 1.6 + i * .33) % 1; ctx.fillRect(Math.round(x + w * (.2 + .3 * i)), Math.round(y - rh + ph * (rh - 8)), 2, 4); } // droplets running down
    }
  }
  ctx.restore();
}

export function drawObstacle(ctx, o, time = 0, stage = 0, traps = null) {
  const p = palettes[stage] || palettes[0], x = Math.round(o.x - o.w / 2), y = o.y, w = o.w, h = o.h, hit = o.flash > 0, r = o.hp / o.maxHp;
  ctx.save();
  if (o.kind === 'altar') {
    if (traps) for (const id of o.traps) { // faint blood line along the floor to each trap still linked; it is gone once the trap is disabled or the altar breaks
      const tr = traps[id]; if (!tr || tr.disabled) continue;
      const ex = Math.round(tr.x), fy = y - 2, dir = ex < o.x ? -1 : 1, sx = Math.round(o.x + dir * (w / 2));
      ctx.globalAlpha = .28 + .1 * Math.sin(time * 4); ctx.strokeStyle = '#c9627f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, fy); ctx.lineTo(ex, fy); ctx.stroke();
      ctx.globalAlpha = .9; const ph = (time * .6) % 1; rect(ctx, '#ff8a9a', sx + (ex - sx) * ph, fy - 1, 3, 3); ctx.globalAlpha = 1;
    }
    const bodyC = hit ? '#e8dcc8' : '#5e4a55', dark = '#2a1d26', lit = hit ? '#fff' : '#a38a86', pulse = .55 + .25 * Math.sin(time * 4);
    rect(ctx, dark, x - 2, y - 10, w + 4, 10); rect(ctx, lit, x - 2, y - 10, w + 4, 1); // plinth
    rect(ctx, bodyC, x + 5, y - h + 14, w - 10, h - 24); rect(ctx, dark, x + 5, y - h + 14, 3, h - 24); rect(ctx, lit, x + w - 8, y - h + 14, 2, h - 24);
    rect(ctx, bodyC, x - 2, y - h + 6, w + 4, 10); rect(ctx, lit, x - 2, y - h + 6, w + 4, 1); // slab top
    rect(ctx, dark, x + 8, y - h, w - 16, 7); rect(ctx, '#6b1a2c', x + 10, y - h + 1, w - 20, 5); // blood basin
    if (r > .25) { const gl = ctx.createRadialGradient(x + w / 2, y - h + 3, 1, x + w / 2, y - h + 3, 26); ctx.globalAlpha = pulse * (r > .6 ? 1 : .6); gl.addColorStop(0, '#ff6a8a'); gl.addColorStop(1, 'rgba(201,98,127,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 6, y - h - 22, w + 12, 50); ctx.globalAlpha = 1; rect(ctx, '#e8708c', x + 11, y - h + 2, w - 22, 2); }
    rect(ctx, '#c9627f', x + w / 2 - 3, y - h + 28, 6, 8); rect(ctx, '#ffb0c0', x + w / 2 - 1, y - h + 30, 2, 4); // sigil
    if (r < .66) { ctx.strokeStyle = '#0c0a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 14, y - h + 14); ctx.lineTo(x + 20, y - h + 30); ctx.lineTo(x + 15, y - h + 44); ctx.stroke(); }
    if (r < .33) { ctx.beginPath(); ctx.moveTo(x + w - 12, y - h + 16); ctx.lineTo(x + w - 20, y - h + 36); ctx.lineTo(x + w - 14, y - h + 56); ctx.stroke(); rect(ctx, p.mortar, x + w - 14, y - h, 10, 6); rect(ctx, '#0c0a10', x + w - 4, y - h + 6, 2, 2); } // chipped corner
  } else { // barricade: planks bound by iron; cracks and gaps from hp ratio
    const wood = hit ? '#f0dcb4' : '#7a5a38', gap = r < .34;
    for (let i = 0; i < 4; i++) { const px = x + i * (w / 4); if (gap && i === 2) { rect(ctx, '#2a1f14', px + 1, y - h + 12, w / 4 - 2, 12); rect(ctx, wood, px + 1, y - 8, w / 4 - 2, 8); rect(ctx, wood, px + 1, y - h + 4, w / 4 - 2, 8); continue; } rect(ctx, wood, px + 1, y - h + (i % 2 ? 3 : 0), w / 4 - 2, h - (i % 2 ? 3 : 0)); rect(ctx, hit ? '#fff' : '#a8814f', px + 1, y - h + (i % 2 ? 3 : 0), 1, h); }
    for (const by of [10, 31, 52]) { rect(ctx, '#2d2d34', x - 1, y - h + by, w + 2, 4); rect(ctx, p.trim, x - 1, y - h + by, w + 2, 1); }
    rect(ctx, '#a8b0bd', x + 3, y - h + 11, 2, 2); rect(ctx, '#a8b0bd', x + w - 5, y - h + 32, 2, 2);
    ctx.strokeStyle = '#1f150d'; ctx.lineWidth = 2;
    if (r < .67) { ctx.beginPath(); ctx.moveTo(x + 12, y - h + 2); ctx.lineTo(x + 17, y - h + 16); ctx.lineTo(x + 13, y - h + 28); ctx.stroke(); }
    if (r < .34) { ctx.beginPath(); ctx.moveTo(x + w - 10, y - h + 24); ctx.lineTo(x + w - 18, y - h + 40); ctx.lineTo(x + w - 12, y - h + 58); ctx.stroke(); rect(ctx, wood, x - 4, y - 4, 5, 3); rect(ctx, wood, x + w - 2, y - 6, 6, 3); } // splinters spill out
  }
  if (r < 1) { ctx.globalAlpha = 1; rect(ctx, '#13111b', x, y - h - 8, w, 4); rect(ctx, '#b75a66', x + 1, y - h - 7, (w - 2) * r, 2); }
  ctx.restore();
}

// Elemental status overlays: plain fillRects only (no shadows/gradients/allocations) so crowds stay cheap. `calm` = steady instead of flickering.
export function drawStatus(ctx, e, time = 0, calm = false) {
  const burn = e.burn > 0, chill = e.chill > 0 || e.frozen > 0, frozen = e.frozen > 0, shock = e.shock > 0, bleed = e.bleed > 0;
  if (!(burn || chill || shock || bleed || e.frostMeter > 0)) return;
  const x = Math.round(e.x), y = Math.round(e.y), w = Math.round(e.w || 27), h = Math.round(e.h || 58), top = y - h, l = x - (w >> 1), t = calm ? 0 : time;
  ctx.save();
  if (chill) {
    ctx.fillStyle = frozen ? '#cdeeff' : '#7fc4f0'; ctx.globalAlpha = frozen ? .5 : .24; ctx.fillRect(l - 2, top, w + 4, h);
    if (frozen) { // ice crust: slab edges, jagged top spikes, glints
      ctx.globalAlpha = .9; ctx.fillStyle = '#e9f8ff'; ctx.fillRect(l - 3, top, 3, h); ctx.fillRect(l + w, top, 3, h);
      for (let i = 0; i < 4; i++) { const sx = l + 2 + i * Math.round(w / 4), sh = 7 + (i * 5 % 4) * 2; ctx.fillRect(sx, top - sh + 3, 3, sh); ctx.fillStyle = '#9fd8ff'; ctx.fillRect(sx + 1, top - sh + 5, 1, sh - 2); ctx.fillStyle = '#e9f8ff'; }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(l + 3, top + 8, 2, 2); ctx.fillRect(l + w - 6, top + (h >> 1), 2, 2);
    }
  }
  if (burn) {
    ctx.globalAlpha = .16; ctx.fillStyle = '#ff7a2a'; ctx.fillRect(l, top + (h >> 2), w, h * .75);
    for (let i = 0; i < 4; i++) {
      const ph = (t * 2.2 + i * .27) % 1, fx = l + 3 + (i * 7919 % Math.max(1, w - 6)) + Math.round(Math.sin(t * 9 + i) * 2), fy = y - 6 - ph * (h * .8);
      ctx.globalAlpha = 1 - ph; ctx.fillStyle = ph < .5 ? '#ff9a3a' : '#e0481f'; ctx.fillRect(fx, Math.round(fy), 3, 4);
      if (ph < .4) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(fx + 1, Math.round(fy) + 1, 1, 2); }
    }
  }
  if (shock) {
    const k = Math.floor(t * 14);
    for (let i = 0; i < 3; i++) {
      const hsh = Math.imul(k + i * 131, 2654435761) >>> 0, sx = l - 3 + hsh % (w + 6), sy = top + 4 + (hsh >> 8) % Math.max(1, h - 8), d = (hsh >> 4 & 1) ? 1 : -1;
      ctx.globalAlpha = .95; ctx.fillStyle = '#ffe97a'; ctx.fillRect(sx, sy, 2, 2); ctx.fillRect(sx + d * 2, sy + 2, 2, 2); ctx.fillRect(sx, sy + 4, 2, 2);
      ctx.fillStyle = '#fffbd0'; ctx.fillRect(sx, sy, 1, 1);
    }
  }
  if (bleed) {
    const n = 1 + Math.min(3, (e.bleedStacks || 1) / 3 | 0);
    ctx.fillStyle = '#c4283a';
    for (let i = 0; i < n; i++) { const ph = (t * 1.3 + i * .31) % 1; ctx.globalAlpha = 1 - ph * .6; ctx.fillRect(l + 3 + (i * 6143 % Math.max(1, w - 6)), Math.round(top + h * .3 + ph * h * .6), 2, 3 + (ph > .5 ? 1 : 0)); }
  }
  if (e.frostMeter > 0 && !frozen) { ctx.globalAlpha = .9; for (let i = 0; i < 3; i++) { ctx.fillStyle = i < e.frostMeter ? '#bfe8ff' : '#2b3a52'; ctx.fillRect(x - 8 + i * 6, y + 3, 4, 3); } }
  ctx.restore();
}
