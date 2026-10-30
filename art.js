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
  if (c.sealed) { // purple chain band across the lid and body, pulsing rune at the centre
    const pulse = .6 + .4 * Math.sin(time * 5);
    rect(ctx, '#1b1030', x - 3, y + 5, c.w + 6, 7); rect(ctx, '#8f6be0', x - 2, y + 6, c.w + 4, 5);
    for (let i = 0; i < c.w + 4; i += 6) rect(ctx, '#1b1030', x - 2 + i, y + 8, 3, 2);
    ctx.globalAlpha = pulse; rect(ctx, '#e6d8ff', x + c.w / 2 - 4, y + 4, 8, 9); ctx.globalAlpha = 1;
    rect(ctx, '#3a1f78', x + c.w / 2 - 2, y + 6, 4, 5);
    return;
  }
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
  const apex = e.gT !== undefined, eye = white || (apex ? '#ffb04a' : '#de7665'); // apex (castle) skeletons: amber eyes and a gold circlet mark the x12 body
  rect(c, dark, -5, -55, 4, 4); rect(c, dark, 3, -55, 4, 4); rect(c, eye, -3, -54, 2, 2); rect(c, eye, 4, -54, 2, 2); rect(c, '#30313b', 0, -51, 2, 3);
  if (apex && !white) { c.globalAlpha = .35; rect(c, '#ffb04a', -4, -55, 4, 4); rect(c, '#ffb04a', 3, -55, 4, 4); c.globalAlpha = 1; rect(c, '#c9a24a', -8, -62, 17, 2); rect(c, '#c9a24a', -6, -65, 2, 3); rect(c, '#c9a24a', 0, -66, 2, 4); rect(c, '#c9a24a', 5, -65, 2, 3); }
  for (let x = -4; x < 6; x += 3) rect(c, '#394047', x, -46, 1, 3);
  line(c, shade, -9, -40, -14, -29, 4); line(c, bone, -14, -29, -7, -23, 3);
  const guard = apex && e.gT > 0, rise = e.move === 'rising' && (e.tell || 0) > 0, cocked = e.move === 'stepcut' && (e.tell || 0) > 0, raised = (e.tell || 0) > 0 && !cocked && !rise; // stepcut: blade drawn back low, a lunge not an overhead cut
  const ex = guard ? 14 : cocked ? 13 : rise ? 14 : 16, ey = guard ? -44 : raised ? -49 : cocked ? -37 : rise ? -24 : -31, hx = guard ? 12 : raised ? 10 : cocked ? 7 : rise ? 14 : 23, hy = guard ? -48 : raised ? -62 : cocked ? -38 : rise ? -14 : -32;
  line(c, bone, 9, -41, ex, ey, 4);
  line(c, bone, ex, ey, hx, hy, 3);
  if (guard) { line(c, '#a7aaa9', 6, -30, 26, -78, 4); line(c, '#eee3c5', 7, -31, 26, -78, 1); line(c, '#a18c5d', 8, -50, 20, -44, 3); } // front guard: the blade held up across the body
  else if (rise) { poly(c, shade, [[13, -15], [52, -2], [48, 2], [13, -11]]); line(c, '#e2ddc4', 13, -15, 52, -2, 1); rect(c, '#ad9260', 11, -20, 3, 12); } // rising: blade drawn low, ready to sweep up
  else if (cocked) { poly(c, shade, [[8, -40], [-26, -47], [-24, -42], [8, -35]]); line(c, '#e2ddc4', 8, -40, -26, -47, 1); rect(c, '#ad9260', 8, -44, 3, 12); }
  else if (raised) { line(c, e.move === 'counter' ? '#cfe3f2' : '#a7aaa9', 10, -62, 0, -85, 4); line(c, e.move === 'counter' ? '#ffffff' : '#eee3c5', 9, -63, -1, -85, 1); line(c, '#a18c5d', 5, -62, 14, -65, 3); }
  else { poly(c, shade, [[21, -34], [52, -39], [48, -34], [22, -31]]); line(c, '#e2ddc4', 22, -34, 52, -39); rect(c, '#ad9260', 20, -38, 3, 12); }
}
const PS = { pw: 0, k: 0, km: '', slump: false, calm: false }; // k: progress of the current tell, km: knight sword pose, pw: heavy wind-up
// Castle knight sword poses: grip x, grip y, tip x, tip y, two-handed. Tells ramp from idle to the pose; r* poses are the recoveries after that move.
const KN = {
  idle: [23, -34, 55, -59, 0], slash: [16, -60, -34, -94, 0], overhead: [26, -74, 32, -130, 1], turn: [4, -40, -58, -30, 0], great: [12, -54, -50, -72, 1],
  rslash: [28, -30, 56, -14, 0], roverhead: [30, -52, 36, -4, 1], rturn: [4, -40, -58, -30, 0], rgreat: [28, -30, 58, -8, 1],
}; // per-frame pose inputs shared with the body drawers (set by drawEnemy; no allocation)
const lastWarn = new WeakMap(); // the last light warning kind an enemy showed, so its recovery pose matches the move it just did
const knS = new WeakMap(); // knight string: the warn object last seen and when, to flash the follow-up commit
function bat(c, e, time, white) {
  const tl = e.tell > 0, dart = tl && e.dartT > 0, coil = tl && !e.heavy && !dart, cross = e.crossT > 0, flut = PS.slump && !e.heavy;
  let flap = Math.sin(time * 16 + (e.x || 0)) * 11;
  if (coil) flap = 17 + (PS.calm ? 0 : Math.sin(time * 50)); // swoop hold: wings thrown up and shivering, claws out
  else if (dart) flap = -10; // dart: wings swept back
  else if (cross) flap = -3; // crossover: wings spread flat, gliding
  else if (flut) flap = Math.sin(time * 34) * 15; // flutter recovery: a rapid, helpless flap
  if (flut) { c.save(); c.translate(0, -14); c.rotate(-.2); c.translate(0, 14); }
  if (dart) for (let i = 0; i < 3; i++) line(c, '#cdb8ff', -34 - i * 12, -22 + i * 5, -62 - i * 14, -22 + i * 5, 2); // speed lines behind the dart
  poly(c, '#080c19', [[-2, -17], [-16, -25 - flap], [-29, -26 - flap], [-22, -11], [-15, -14], [-10, -7], [-4, -9]]);
  poly(c, white || '#75566f', [[-3, -16], [-16, -23 - flap], [-26, -24 - flap], [-20, -13], [-15, -16], [-10, -9]]);
  line(c, white || '#b38e9d', -3, -16, -26, -24 - flap);
  poly(c, '#080c19', [[2, -17], [16, -25 - flap], [29, -26 - flap], [22, -11], [15, -14], [10, -7], [4, -9]]);
  poly(c, white || '#75566f', [[3, -16], [16, -23 - flap], [26, -24 - flap], [20, -13], [15, -16], [10, -9]]);
  line(c, white || '#b38e9d', 3, -16, 26, -24 - flap);
  poly(c, white || '#51424e', [[-6, -23], [-3, -20], [3, -20], [6, -23], [5, -10], [0, -6], [-5, -10]]);
  const eye = white || (coil || dart ? '#ffd0c0' : '#ec8b7c'); rect(c, eye, -4, -17, 2, 2); rect(c, eye, 2, -17, 2, 2); rect(c, '#e4cfbc', -2, -11, 1, 3); rect(c, '#e4cfbc', 2, -11, 1, 3);
  if (coil || dart) { line(c, '#e4cfbc', -5, -8, -7, 1, 2); line(c, '#e4cfbc', 5, -8, 7, 1, 2); } // talons
  if (flut) c.restore();
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
    const m = KN[PS.km] || KN.idle, k = PS.km && PS.km[0] !== 'r' ? PS.k : 1, I = KN.idle, hx = I[0] + (m[0] - I[0]) * k, hy = I[1] + (m[1] - I[1]) * k, tx = I[2] + (m[2] - I[2]) * k, ty = I[3] + (m[3] - I[3]) * k;
    if (m !== I) { line(c, shadowColor, 19, -45, hx, hy, 8); if (m[4]) line(c, shadowColor, -6, -48, hx, hy, 6); } // raised or swung: the arm follows the grip (two-handed for the overhead and the great swing)
    line(c, '#111522', hx, hy, tx, ty, 8); line(c, armor, hx, hy, tx, ty, 5); line(c, light, hx, hy, tx, ty, 1);
    const gl = Math.hypot(tx - hx, ty - hy) || 1; line(c, gold, hx - (ty - hy) / gl * 5, hy + (tx - hx) / gl * 5, hx + (ty - hy) / gl * 5, hy - (tx - hx) / gl * 5, 3); // crossguard
    if (PS.km === 'turn' || PS.km === 'rturn') { rect(c, '#111320', -12, -70, 6, 4); rect(c, white || '#e8776c', -11, -69, 4, 1); } // a second ember slit: the helm has turned to look behind
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
  // castle poses turn the staff round the hand: bolt = levelled forward with a growing orb, ray = raised high with a flat bright core, recovery = dropped and dull
  const cs = e.blinkT !== undefined, ray = cs && e.heavy && e.heavyKind === 'ray' && e.tell > 0, bolt = cs && e.tell > 0 && !e.heavy, down = cs && PS.slump;
  const rot = ray ? -.25 : bolt ? .9 : down ? 1.3 : 0, q = bolt ? 1 - e.tell / .65 : ray ? PS.pw : 0;
  c.save(); if (rot) { c.translate(26, -34); c.rotate(rot); c.translate(-26, 34); }
  line(c, '#ab9573', 26, -7, 25, -64, 3); line(c, '#5a4c46', 28, -7, 27, -63, 1);
  poly(c, '#b6a07a', [[20, -65], [22, -73], [28, -75], [32, -68], [28, -61], [22, -61]]);
  circle(c, down ? '#5c4a6e' : white || '#bfa0df', 26, -68, down ? 3 : 4 + Math.round(q * 3)); if (!down) rect(c, '#f3dfff', 24, -70, 2, 2);
  if (e.tell > 0) { c.strokeStyle = ray ? '#ffffffcc' : '#bca0df99'; c.lineWidth = ray ? 2 : 1; c.beginPath(); c.arc(26, -68, 10 + q * 6 + Math.sin(time * 16) * 2, 0, 7); c.stroke(); }
  c.restore();
}
function priest(c, e, time, white) {
  const robe = white || '#6b2a38', dark = white || '#2a1220', sway = Math.round(Math.sin(time * 2) * 1);
  poly(c, '#101423', [[-11, -56], [9, -56], [15, -5], [-16, -5]]);
  poly(c, robe, [[-9, -54], [7, -54], [12, -7], [-13, -7]]);
  poly(c, dark, [[-3, -54], [3, -54], [3, -7], [-3, -7]]);
  circle(c, white || '#d8c7b0', 0, -62, 6); poly(c, robe, [[-8, -60], [0, -72], [8, -60], [0, -56]]);
  // castle poses (hand, orb): bolt = arm thrust forward, bless = both hands raised, rite = staff high overhead, rite recovery = staff planted, orb dull
  const cs = e.recoilT !== undefined, tl = e.tell > 0, rite = cs && tl && e.heavy && e.heavyKind === 'rite', bless = cs && tl && e.blessRadius > 0, bolt = cs && tl && !e.heavy && !bless, down = cs && PS.slump;
  let hx = 20 + sway, hy = -32, ox = hx, oy = -22, or = 4, col = white || '#d4423a';
  if (rite) { hx = 10; hy = -80; ox = 10; oy = -90; or = 4 + Math.round(PS.pw * 4); }
  else if (bless) { hx = 12; hy = -68; ox = 12; oy = -78; or = 5; }
  else if (bolt) { hx = 24; hy = -48; ox = 36; oy = -48; or = 3 + Math.round((1 - e.tell / .7) * 4); }
  else if (down) { hx = 24; hy = -12; ox = 24; oy = -2; col = '#5a2a30'; }
  line(c, '#8b7a58', 8, -44, hx, hy, 2); line(c, '#8b7a58', hx, hy, ox, oy + (rite || bless ? 4 : -2), 1);
  circle(c, col, ox, oy, or);
  if (rite || bless || bolt) { c.strokeStyle = '#ff9a8acc'; c.lineWidth = 1; c.beginPath(); c.arc(ox, oy, or + 4 + Math.sin(time * 16) * 2, 0, 7); c.stroke(); }
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
  // Short mace held back; raised over the head while it calls a partner (#62).
  const rim = e.move === 'rimstrike' && (e.tell || 0) > 0, call = (e.callT || 0) > 0, brace = (e.braceT || 0) > 0, lunge = !!e.interposing || ((e.pushT || 0) > 0 && !call);
  if (call) { line(c, dark, -12, -46, -6, -70, 6); line(c, '#6b5a44', -6, -72, -4, -90, 2); rect(c, white || '#7d8590', -8, -98, 7, 7); rect(c, white || '#ff7a68', -7, -97, 4, 4); }
  else { line(c, dark, -12, -46, -21, -32, 6); line(c, '#6b5a44', -21, -30, -27, -46, 2); rect(c, white || '#7d8590', -30, -52, 7, 7); rect(c, light, -29, -51, 2, 2); }
  if (e.interposing && !white) for (let i = 0; i < 3; i++) rect(c, '#9aa5b8', -32 - i * 4, -56 + i * 14, 14, 2); // speed lines: it is stepping in front of an ally
  if (rim) { // the shield edge swings round behind the bearer without a turn: a bronze bar sweeping back over the box
    const rk = Math.max(0, Math.min(1, (.45 - e.tell) / .3));
    line(c, '#101522', 2, -42, -6 - (14 + 38 * rk), -44 + 14 * (1 - rk), 7); line(c, bronze, 2, -42, -6 - (14 + 38 * rk), -44 + 14 * (1 - rk), 4); rect(c, white || '#e9d29a', -8 - (14 + 38 * rk), -46 + 14 * (1 - rk), 4, 4);
  }
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
  const ctr = e.move === 'counter' && (e.tell || 0) > 0, k = !ctr && !rim && (e.tell || 0) > 0 ? Math.max(0, Math.min(1, (.55 - e.tell) / .15)) : 0, thrust = (e.turn || 0) > .45 ? 6 : 0;
  const pull = Math.round(-12 * k + thrust + (ctr ? 5 : 0) + (lunge ? 5 : 0) + (brace ? 3 : 0) - (rim ? 6 : 0) - ((e.reface || 0) > 0 ? 3 : 0));
  c.save(); c.translate(17 + pull, ctr ? -8 : brace ? -12 : -2); c.rotate(-.32 * k); c.translate(-17, 2); // counter: shield braced forward and lifted, not reared back like the bash
  poly(c, '#0c101b', [[8, -74], [27, -71], [28, -6], [17, 1], [7, -5]]);
  poly(c, bronze, [[10, -72], [26, -69], [26, -8], [17, -2], [9, -7]]);
  poly(c, white || '#3f4a58', [[12, -69], [24, -67], [24, -10], [17, -5], [11, -9]]);
  rect(c, white || '#d4dcea', 26, -68, 2, 58); line(c, white || '#7a3442', 18, -66, 18, -8, 3);
  circle(c, bronze, 18, -38, 4); rect(c, white || '#e9d29a', 17, -40, 2, 2);
  if (brace) { rect(c, white || '#ffffff', 11, -70, 14, 2); rect(c, white || '#ffffff', 25, -70, 2, 20); } // shield raised: bright top edge and rim
  c.restore();
}
function spearman(c, e, time, white) {
  const bone = white || '#d9d2bd', dark = white || '#5a5448', tl = (e.tell || 0) > 0, sweep = tl ? e.move === 'sweep' : lastWarn.get(e) === 'sweep', stride = Math.abs(e.vx || 0) > 5 ? Math.sin(time * 6) * 3 : 0;
  // Spear pose: butt x, butt y, tip x, tip y. Thrust tells (.64 s; the lunge ramps over its whole wind-up) draw back and the tip lands on the hitbox end (194 px); the sweep holds it low and back, then out flat on the floor.
  const k = tl ? PS.k : 0, lunge = tl && e.heavy, rec = !tl && (e.turn || 0) > 0, out = rec && e.turn > (sweep ? .3 : .45), drop = rec && !out && PS.slump;
  const mv = tl ? e.move : '', planted = (e.plantT || 0) > 0, whirl = (e.gT || 0) > 0 || (tl && e.heavy && e.heavyKind === 'spin'), bm = (e.bmT || 0) > 0 ? e.bmKind : '', bq = bm ? 1 - e.bmT / ({ vault: .3, pullback: .2, cower: .35 }[bm] || .3) : 0, hop = bm === 'vault' ? Math.round(Math.sin(Math.min(1, bq) * Math.PI) * 38) : 0;
  let bx = 8, by = -36, tx = 150, ty = -30;
  if (whirl) { const a = PS.calm ? .7 : time * (e.heavy ? 34 : 24), h = e.heavy ? 64 : 46; bx = 8 - Math.cos(a) * h; by = -46 - Math.sin(a) * h * .8; tx = 8 + Math.cos(a) * h; ty = -46 + Math.sin(a) * h * .8; } // spinning haft: guard (a short blur in front) and the spin heavy (a wide whirl)
  else if (bm === 'vault') { bx = 34; by = -2; tx = 46 + 10 * bq; ty = -118; } // pole planted ahead, the body swings over it
  else if (bm === 'cower') { tx = 58; ty = -8; }
  else if (planted) { bx = -14; by = -4; tx = 190; ty = -30; } // tip held out level, butt dug into the floor
  else if (mv === 'plant') { bx = 8 - 20 * k; by = -36 - 40 * k; tx = 150 - 60 * k; ty = -30 - 70 * k; }
  else if (mv === 'lift') { bx = 8; by = -16; tx = 96 - 40 * k; ty = -16 - 120 * k; }
  else if (mv === 'shove') { bx = 8 + 30 * k; by = -34; tx = 150 - 190 * k; ty = -34; } // reversed: the butt leads
  else if (tl && sweep) { bx = 8 - 34 * k; by = -36 + 20 * k; tx = 150 - 90 * k; ty = -30 + 16 * k; }
  else if (tl) { bx = 8 - (lunge ? 36 : 20) * k; by = -36 + (lunge ? 6 : 0) * k; tx = 150 - 40 * k; ty = -30 + (lunge ? 6 : 0) * k; }
  else if (out) { bx = sweep ? 14 : 8; by = sweep ? -14 : -36; tx = sweep ? 90 : 180; ty = sweep ? -12 : -30; }
  else if (drop) { tx = 66; ty = -2; } // recovery: the point drops to the floor and the spearman leans on it, open
  line(c, dark, -4, -28 - hop, -4 + stride, -2 - hop, 3); line(c, dark, 3, -28 - hop, 3 - stride, -2 - hop, 3);
  c.save(); c.translate(0, -hop); const lean = PS.slump ? .28 : bm === 'cower' ? -.3 : bm === 'pullback' ? -.18 : 0; if (lean) { c.translate(0, -28); c.rotate(lean); c.translate(0, 28); }
  rect(c, bone, -6, -54, 12, 26); circle(c, bone, 0, -62, 7); rect(c, '#111320', 1, -64, 5, 3);
  c.restore();
  line(c, white || '#d2ac75', bx, by, tx, ty, 2); poly(c, white || '#c2a4de', [[tx, ty - 5], [tx + 14, ty], [tx, ty + 5]]);
  poly(c, white || '#c2a4de', [[bx, by], [bx - 10, by - 6], [bx - 10, by + 4]]); // pennant at the butt silhouettes it from the knight
}
const WARN_DASH = [6, 5], NO_WARN_DASH = [];
function hopArrow(ctx, x, y, time) { const ay = Math.round(y - (PS.calm ? 0 : Math.sin(time * 9) * 3)); ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(x, ay - 9); ctx.lineTo(x + 8, ay + 3); ctx.lineTo(x - 8, ay + 3); ctx.fill(); ctx.fillRect(x - 2, ay + 3, 4, 7); } // "jump this" arrow
function flowChevrons(ctx, b, g, time) { // chevrons running along a box in direction g (1 right, -1 left): where the blow travels
  const my = Math.round(b.y + b.h / 2), off = PS.calm ? 0 : (time * 70) % 18; ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2;
  for (let cx = b.x + 6 + (g === 1 ? off : 18 - off); cx < b.x + b.w - 6; cx += 18) { ctx.beginPath(); ctx.moveTo(cx - 5 * g, my - 7); ctx.lineTo(cx + 3 * g, my); ctx.lineTo(cx - 5 * g, my + 7); ctx.stroke(); }
}
function turnArrow(ctx, e, d) { const ax = Math.round(e.x), ay = Math.round(e.y - 92); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 15, d === 1 ? 0 : Math.PI, d === 1 ? Math.PI : Math.PI * 2, d === 1); ctx.stroke(); ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(ax - d * 15, ay + 11); ctx.lineTo(ax - d * 22, ay + 1); ctx.lineTo(ax - d * 8, ay + 1); ctx.fill(); } // U-turn over the head
export function drawPairThread(ctx, pr, time, calm) { // #62: the red call thread between the two soldiers of a squad
  const a = pr.lead, b = pr.partner; if (!a || !b || a.hp <= 0 || b.hp <= 0) return;
  const x1 = Math.round(a.x), y1 = Math.round(a.y - a.h * .6), x2 = Math.round(b.x), y2 = Math.round(b.y - b.h * .6), sag = Math.round(Math.abs(x2 - x1) * .12 + 6);
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#ff4a3c44'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); ctx.stroke();
  ctx.strokeStyle = '#ff7a68'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = calm ? 0 : -time * 40; ctx.stroke(); ctx.setLineDash(NO_WARN_DASH);
  ctx.fillStyle = '#ffd0c0'; for (const [px, py] of [[x1, y1], [x2, y2]]) ctx.fillRect(px - 3, py - 3, 6, 6); ctx.restore();
}
const tellMax = new WeakMap(); // total warning time per e.warn object, remembered on the first frame it is seen
// Boss warnings draw the exact e.warn hit areas from core.js, filling as the warning counts down (gold when punishable).
// --- The Gate Warden (#50): a code-drawn stone gatekeeper (crenellated helm, portcullis chest, gate-bar maul). Local space: facing +x, feet at 0, about 112 tall. ---
const WC = { dark: '#171a25', rim: '#262a38', mid: '#585d69', stone: '#868b95', hi: '#b9bdc2', rust: '#7d5b3a', cloth: '#2a3042', ember: '#ff5a44', ice: '#c4e8ff', gold: '#e9c46a' };
// Pose fields: lean, squash, grip x, grip y, haft angle, haft length, off-hand x, off-hand y, shield in front, open gauntlet, look (1 ahead, -1 behind), has shield.
const WP = {
  idle: [0, 1, 18, -58, 1.05, 46, -30, -58, 0, 0, 1, 1], // maul resting ahead, buckler on the rear arm
  sweep: [-.14, 1, -6, -76, Math.PI, 62, -30, -60, 0, 0, 1, 1], // maul cocked horizontally behind the shoulder
  rSweep: [.18, .94, 22, -70, -.05, 62, -30, -60, 0, 0, 1, 1], // maul out at full reach
  slam: [-.1, 1, 14, -86, -1.15, 62, 6, -92, 0, 0, 1, 0], // both hands, maul overhead
  rSlam: [.3, .9, 36, -58, 1.35, 44, 10, -62, 0, 0, 1, 0], // maul stuck in the floor
  charge: [.3, .92, -14, -52, 2.9, 62, 44, -60, 1, 0, 1, 1], // shoulder down behind the tower shield, maul dragging
  run: [.38, .96, -14, -52, 2.9, 62, 46, -62, 1, 0, 1, 1],
  rCharge: [.1, .96, -10, -52, 2.7, 62, 40, -60, 1, 0, 1, 1],
  seize: [.12, 1, -12, -52, 2.4, 50, 60, -72, 0, 1, 1, 0], // maul trailing, one open gauntlet reaching
  rSeize: [.2, .95, -12, -50, 2.4, 50, 42, -66, 0, 0, 1, 0], // fist closed on the chain
  backhand: [.2, .96, -30, -76, Math.PI + .15, 62, -30, -60, 0, 0, -1, 1], // arm straight back, head turned over the shoulder
  rBack: [.22, .92, -30, -70, Math.PI + .15, 62, -30, -60, 0, 0, -1, 1],
  stun: [.35, .8, 8, -36, 1.4, 14, -10, -42, 0, 0, 1, 0], // armor broken: kneeling, maul dropped
  roar: [-.2, 1.02, 22, -96, -1.2, 62, -2, -100, 0, 0, 1, 0], // phase 2 roar: both arms raised
};
const REC = { sweep: 'rSweep', slam: 'rSlam', charge: 'rCharge', seize: 'rSeize', backhand: 'rBack' };
const wp = new Array(12).fill(0), wardenTip = [30, -60]; // wardenTip: where the glint star goes
const wState = new WeakMap();
function makeShell(cy, rx, ry, lock) { // faceted armor shell (decagon) with crack lines and a padlock spot, built once per boss
  const pts = [], cr = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pts.push([Math.round(Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)]); }
  [0, 4, 7, 2, 5, 9].forEach((vi, n) => { const [x, y] = pts[vi]; cr.push([[x, y], [Math.round(x * .72 + (n % 2 ? 6 : -6)), Math.round(cy + (y - cy) * .72 + (n % 3 - 1) * 6)], [Math.round(x * .45), Math.round(cy + (y - cy) * .45 + 5)]]); });
  return { pts, cr, cy, ry, lock, g: null, g2: null };
}
const WSHELL = makeShell(-56, 47, 67, [33, -78]), KSHELL = makeShell(-64, 58, 84, [42, -100]);
const BODY_CRACKS = [[[-10, -96], [-4, -82], [-12, -68], [-6, -52]], [[14, -98], [8, -84], [17, -70]], [[-24, -72], [-14, -62], [-19, -48]], [[23, -62], [12, -55], [18, -42]], [[-4, -110], [-1, -100]]]; // seams that glow ember in phase 2 and gold when the armor is broken
const LOCK_DASH = [5, 4], NO_DASH = [], DESC_DASH = [8, 8];
function wardenShield(c, x, y, white, p2) { // tower shield: pale stone face, rust rim and a portcullis cross, so it stands out from the torso
  poly(c, white || WC.dark, [[x - 14, y - 32], [x + 14, y - 32], [x + 15, y + 17], [x, y + 33], [x - 15, y + 17]]);
  poly(c, white || WC.rust, [[x - 12, y - 30], [x + 12, y - 30], [x + 13, y + 16], [x, y + 30], [x - 13, y + 16]]);
  poly(c, white || '#a3a7ad', [[x - 9, y - 27], [x + 9, y - 27], [x + 10, y + 14], [x, y + 25], [x - 10, y + 14]]);
  rect(c, white || WC.dark, x - 9, y - 14, 19, 3); rect(c, white || WC.dark, x - 9, y + 2, 19, 3); rect(c, white || WC.dark, x - 1, y - 27, 3, 50);
  circle(c, white || (p2 ? WC.ember : WC.gold), x + 1, y - 5, 4);
}
function wardenLeg(c, x, white) {
  poly(c, white || WC.dark, [[x - 13, -44], [x + 13, -44], [x + 14, -8], [x + 17, 0], [x - 15, 0], [x - 13, -8]]);
  poly(c, white || WC.mid, [[x - 10, -42], [x + 10, -42], [x + 11, -9], [x + 13, -3], [x - 12, -3], [x - 10, -9]]);
  rect(c, white || WC.hi, x - 9, -40, 3, 30); rect(c, white || WC.stone, x - 8, -27, 16, 5); rect(c, white || WC.rim, x - 14, -4, 30, 4);
}
function wardenSeams(c, color, alpha, width) {
  c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round';
  for (const s of BODY_CRACKS) { c.beginPath(); c.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) c.lineTo(s[i][0], s[i][1]); c.stroke(); }
  c.restore();
}
function wardenBody(c, e, time, white, pw, hold, calm, turn) {
  const key = e.stun > 0 && e.superArmor <= 0 ? 'stun' : e.pause > 0 ? 'roar' : e.travel > 0 ? 'run' : e.tell > 0 ? e.move : e.recover > 0 ? REC[e.lastMove] : '';
  const T = WP[key] || WP.idle, I = WP.idle, k = e.tell > 0 ? 1 - (1 - pw) * (1 - pw) : 1, d = k > .3 ? T : I;
  for (let i = 0; i < 8; i++) wp[i] = I[i] + (T[i] - I[i]) * k;
  const front = d[8], open = d[9], look = d[10], shield = d[11], gx = wp[2], gy = wp[3], ma = wp[4], L = wp[5], ox = wp[6], oy = wp[7];
  const p2 = e.bossPhase >= 2, exposed = e.superArmor <= 0;
  const stone = white || WC.stone, mid = white || WC.mid, dark = white || WC.dark, rim = white || WC.rim, hi = white || WC.hi, eye = white || (p2 ? WC.ember : WC.ice);
  const walk = key === '' && Math.abs(e.vx || 0) > 5 ? Math.sin(time * 6) * 6 : 0, run = key === 'run' ? 6 : 0;
  c.save();
  if (hold && !calm) c.translate(Math.round(Math.sin(time * 70) * 1.5), 0); // a held wind-up trembles
  c.scale(turn, 1); c.rotate(wp[0]); c.scale(1, wp[1]);
  if (shield && !front) wardenShield(c, ox, oy, white, p2); // buckler on the rear arm, behind the body
  // Legs and tabard.
  wardenLeg(c, -13 - run + walk, white); wardenLeg(c, 13 + run - walk, white);
  poly(c, white || WC.cloth, [[-17, -48], [17, -48], [13, -22], [0, -30], [-13, -22]]);
  // Torso: breastplate with a portcullis grid and a belt keystone.
  poly(c, dark, [[-26, -98], [-34, -86], [-28, -46], [-18, -38], [18, -38], [28, -46], [34, -86], [26, -98]]);
  poly(c, mid, [[-23, -95], [-30, -85], [-25, -48], [-16, -41], [16, -41], [25, -48], [30, -85], [23, -95]]);
  poly(c, white || '#454a56', [[6, -95], [23, -95], [30, -85], [25, -48], [16, -41], [6, -41]]);
  rect(c, hi, -22, -92, 3, 42);
  for (let i = 0; i < 4; i++) rect(c, rim, -14 + i * 8, -91, 3, 32);
  rect(c, rim, -17, -82, 31, 3); rect(c, rim, -17, -68, 31, 3);
  rect(c, white || WC.rust, -26, -47, 52, 6); circle(c, white || (p2 ? WC.ember : WC.gold), 0, -44, 4); circle(c, dark, 0, -44, 1.5);
  if (exposed) wardenSeams(c, '#ffd36e', .95, 3); else if (p2) wardenSeams(c, WC.ember, calm ? .8 : .55 + .35 * Math.sin(time * 5), 2);
  // Pauldrons with merlon notches, gorget and the crenellated great helm.
  poly(c, dark, [[-42, -100], [-22, -105], [-20, -84], [-38, -79]]); poly(c, mid, [[-39, -98], [-24, -102], [-23, -86], [-36, -82]]); rect(c, rim, -41, -104, 6, 4); rect(c, rim, -31, -106, 6, 4);
  rect(c, white || WC.rim, -9, -101, 18, 7);
  for (let i = 0; i < 3; i++) { const x = -11 + i * 8; rect(c, dark, x - 1, -118, 8, 8); rect(c, stone, x, -117, 6, 7); }
  poly(c, dark, [[-14, -112], [14, -112], [15, -90], [8, -85], [-8, -85], [-15, -90]]);
  poly(c, stone, [[-12, -110], [12, -110], [13, -91], [7, -87], [-7, -87], [-13, -91]]);
  rect(c, hi, -10, -108, 3, 17); rect(c, rim, look > 0 ? -1 : -13, -101, 14, 6); rect(c, eye, look > 0 ? 1 : -11, -100, 10, 2);
  rect(c, dark, look > 0 ? 3 : -9, -96, 1, 5); rect(c, dark, look > 0 ? 7 : -5, -96, 1, 5);
  // Maul arm: grip, haft and the gate-bar head.
  const sx = gx < 0 ? -22 : 22, ex = (sx + gx) / 2, ey = (-90 + gy) / 2 + 10;
  line(c, dark, sx, -90, ex, ey, 12); line(c, dark, ex, ey, gx, gy, 11); line(c, mid, sx, -90, ex, ey, 8); line(c, mid, ex, ey, gx, gy, 7);
  c.save(); c.translate(gx, gy); c.rotate(ma);
  rect(c, dark, -16, -4, L + 16, 8); rect(c, white || WC.rust, -15, -2, L + 14, 4);
  rect(c, dark, L - 10, -19, 34, 38); rect(c, mid, L - 8, -17, 30, 34); rect(c, hi, L - 8, -17, 30, 4); rect(c, rim, L - 8, 11, 30, 6); rect(c, rim, L + 6, -17, 4, 34);
  for (let i = 0; i < 3; i++) { const y = -12 + i * 10; c.fillStyle = stone; c.beginPath(); c.moveTo(L + 22, y - 4); c.lineTo(L + 35, y); c.lineTo(L + 22, y + 4); c.closePath(); c.fill(); }
  c.restore();
  rect(c, dark, gx - 6, gy - 6, 12, 12); rect(c, stone, gx - 4, gy - 4, 8, 8);
  // Off hand: tower shield in front (charge), open gauntlet with chain (seize), or a plain fist.
  if (shield && front) { line(c, dark, 14, -90, ox - 8, oy - 6, 11); line(c, mid, 14, -90, ox - 8, oy - 6, 7); wardenShield(c, ox, oy, white, p2); }
  else if (open || !shield) {
    const wx = open ? ox - 4 : ox, wy = open ? oy : oy, ax = ox > 0 ? 16 : -16, bx = (ax + wx) / 2, by = (-88 + wy) / 2 + 8;
    line(c, dark, ax, -88, bx, by, 11); line(c, dark, bx, by, wx, wy, 10); line(c, mid, ax, -88, bx, by, 7); line(c, mid, bx, by, wx, wy, 6);
    if (open) { // palm facing the hero with a glowing toll rune, fingers spread
      c.save(); c.globalAlpha = calm ? .6 : .4 + .25 * Math.sin(time * 14); circle(c, WC.ember, ox + 10, oy, 20); c.restore();
      rect(c, dark, ox - 6, oy - 10, 14, 21); rect(c, stone, ox - 4, oy - 8, 10, 17);
      for (let i = 0; i < 4; i++) { const a = -.6 + i * .4, fy = oy - 7 + i * 4.6; line(c, dark, ox + 6, fy, ox + 6 + Math.cos(a) * 22, fy + Math.sin(a) * 22, 6); line(c, stone, ox + 6, fy, ox + 6 + Math.cos(a) * 20, fy + Math.sin(a) * 20, 3); }
      circle(c, eye === WC.ice ? WC.gold : eye, ox + 2, oy, 3);
    } else { rect(c, dark, wx - 6, wy - 6, 13, 13); rect(c, stone, wx - 4, wy - 4, 9, 9); rect(c, hi, wx - 4, wy - 4, 9, 2); }
    if (open || key === 'rSeize') { // gate chain hanging from the wrist: bright links that rattle while the gauntlet is raised
      for (let n = 0; n < 9; n++) { const sw = open && !calm ? Math.sin(time * 18 + n * .9) * (1 + n * .5) : 0, x = wx - 2 + sw, y = wy + 8 + n * 6; rect(c, dark, x - 3, y - 3, 6, 6 - (n % 2)); rect(c, n % 2 ? '#fff0b0' : '#d9c27a', x - 2, y - 2, 4, 4 - (n % 2)); }
    }
  }
  if (key === 'seize') { wardenTip[0] = ox + 12; wardenTip[1] = oy; } else if (front) { wardenTip[0] = ox + 8; wardenTip[1] = oy - 14; } else { wardenTip[0] = Math.round(gx + Math.cos(ma) * (L + 12)); wardenTip[1] = Math.round(gy + Math.sin(ma) * (L + 12)); }
  c.restore();
}
function wardenShell(c, e, time, calm) { // the armor shell: whole when the gauge is full, cracks per 1/6 lost, gone when broken, dashed and dull while locked
  if (e.superArmor <= 0) return;
  const S = e.king ? KSHELL : WSHELL, pts = S.pts, frac = e.superArmor / e.superArmorMax, lock = e.armorLock > 0, p2 = e.bossPhase >= 2, p3 = e.king && e.bossPhase >= 3;
  if (!S.g) { const r = S.ry + 1; S.g = c.createRadialGradient(0, S.cy, 8, 0, S.cy, r); S.g.addColorStop(0, '#9fb4d800'); S.g.addColorStop(.7, '#9fb4d822'); S.g.addColorStop(1, '#cfe0ff77'); S.g2 = c.createRadialGradient(0, S.cy, 8, 0, S.cy, r); S.g2.addColorStop(0, '#ff6a5000'); S.g2.addColorStop(.7, '#ff6a5022'); S.g2.addColorStop(1, '#ffb0a077'); }
  c.save(); c.globalAlpha = lock ? .55 : .55 + .45 * frac;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 10; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath();
  c.fillStyle = p2 ? S.g2 : S.g; c.fill();
  c.strokeStyle = lock ? '#6b7385' : p3 ? '#ff9aa6' : p2 ? '#e8a8a0' : '#c5d0e6'; c.lineWidth = lock ? 2 : 2 + frac; if (lock) c.setLineDash(LOCK_DASH); c.stroke(); c.setLineDash(NO_DASH);
  if (!lock) { c.globalAlpha *= .35; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 9; i += 2.5) { const j = i | 0, k = (j + 4) % 10; c.moveTo(pts[j][0], pts[j][1]); c.lineTo(pts[k][0], pts[k][1]); } c.stroke(); }
  c.globalAlpha = 1;
  const n = Math.ceil((1 - frac) * 6 - 1e-6);
  for (let i = 0; i < n && i < 6; i++) { const s = S.cr[i]; c.beginPath(); c.moveTo(s[0][0], s[0][1]); c.lineTo(s[1][0], s[1][1]); c.lineTo(s[2][0], s[2][1]); c.strokeStyle = '#13111b'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#eef6ff'; c.lineWidth = 2; c.stroke(); }
  if (lock) { const lx = S.lock[0], ly = S.lock[1]; c.fillStyle = '#13111b'; c.fillRect(lx, ly, 14, 12); c.fillStyle = '#9aa3b5'; c.fillRect(lx + 2, ly + 2, 10, 8); c.strokeStyle = '#9aa3b5'; c.lineWidth = 2; c.beginPath(); c.arc(lx + 7, ly - 2, 4, Math.PI, 0); c.stroke(); } // padlock: the gauge cannot be chipped right now
  c.restore();
}
// --- The castle Fallen King (#50 section 6): a code-drawn 80 x 128 body (e.king, castle floor 50 only; the normal run's King keeps knight()). Violet-black plate, a broken tarnished crown, a torn crimson cape and a greatsword. Local space: facing +x, feet at 0. ---
const KC = { dark: '#10101a', rim: '#1d1c2b', plate: '#4a4661', mid: '#6c6987', hi: '#a9a7c0', gold: '#b88f3e', goldHi: '#efd58a', cape: '#5a1830', capeDk: '#2a0d1a', blade: '#ccd3e0', bladeDk: '#2b2d3c', eye1: '#9fd8ff', eye2: '#ffb04a', eye3: '#ff3a4c' };
// Pose fields: lean, squash, sword hand x, y, blade angle (the blade is 103 long), free hand x, y, cape streaming (0 hanging, 1 flat behind).
const KPOSE = {
  idle: [0, 1, 30, -60, .5, 14, -66, 0], // greatsword held low and forward in both hands (also the string's neutral pose)
  slash: [-.12, 1, 8, -106, -2.3, 2, -112, .3], // blade cocked high behind the shoulder
  rSlash: [.2, .95, 40, -54, .3, 20, -62, .6], // follow-through at full reach
  slam: [-.18, 1.03, 20, -142, 1.35, 12, -142, .2], // reverse grip, both arms overhead, point down
  rSlam: [.34, .88, 66, -90, 1.2, 50, -88, .5], // blade driven into the floor
  charge: [.3, .94, -22, -62, 2.7, 46, -78, 1], // shoulder down, blade trailing, cape flat behind
  rCharge: [.12, .96, -10, -60, 2.6, 34, -70, .7],
  volley: [-.06, 1, -12, -56, 2.55, 40, -100, .3], // blade grounded behind, free hand thrown out along the aim
  ritual: [.08, .98, 44, -96, 1.5, 36, -90, .2], // blade planted point-down before him, both hands on the pommel
  descent: [.22, .86, -6, -66, 3, 6, -70, .8], // crouched, blade drawn back low
  rDescent: [.3, .84, 62, -90, 1.3, 46, -88, .9], // kneeling on the ledge, blade in the stone
  leap: [-.1, .92, 14, -140, 1.35, 8, -138, 1], // airborne, plunging the blade down
  stun: [.3, .8, 36, -16, -.25, 22, -20, 0], // armor broken: kneeling, blade dropped on the floor
  roar: [-.2, 1.02, 10, -124, -1.1, 0, -128, .8], // phase change: blade and arm raised
};
KPOSE.turnslash = KPOSE.slash;
const KREC = { slash: 'rSlash', turnslash: 'rSlash', slam: 'rSlam', charge: 'rCharge', descent: 'rDescent', volley: 'volley', ritual: 'ritual' };
const KCRACK = [[[-8, -100], [-3, -86], [-10, -72], [-5, -58]], [[12, -98], [7, -84], [15, -70]], [[-22, -84], [-14, -72], [-18, -60]], [[24, -76], [14, -66], [19, -54]]];
const kp = new Array(8).fill(0), kingTip = [118, -12], kState = new WeakMap();
// Per-frame render state: the tell the pose started on, whether the string just committed to a branch, the turn-around, and the descent leap arc (the engine moves the King to the ledge in one tick, so the arc is drawn here).
function kingState(e, time) {
  let s = kState.get(e); if (!s) { s = { warn: null, t0: 0, pm: '', branch: false, lx: e.x, ly: e.y, lt: time, flip: 1, dir: e.dir, leap: -9, fx: 0, fy: 0, q: 1, ox: 0, oy: 0 }; kState.set(e, s); }
  const dt = Math.min(.1, Math.max(0, time - s.lt)); s.lt = time;
  if (e.tell > 0 && e.warn !== s.warn) { s.warn = e.warn; s.t0 = time; s.branch = s.pm === 'string' && e.move !== 'string'; }
  s.pm = e.tell > 0 ? e.move : '';
  if (e.dir !== s.dir) { s.flip = -s.flip; s.dir = e.dir; } // a re-face keeps the old look for a frame and then spins round through the side view
  const back = (e.tell > 0 ? e.move : e.recover > 0 ? e.lastMove : '') === 'turnslash', want = back ? -1 : 1; // the turnslash swings behind him, so the whole body turns to face it
  s.flip += Math.max(-dt * 14, Math.min(dt * 14, want - s.flip));
  if (e.lastMove === 'descent' && e.recover > 0 && (Math.abs(e.x - s.lx) > 120 || Math.abs(e.y - s.ly) > 30)) { s.leap = time; s.fx = s.lx; s.fy = s.ly; }
  s.lx = e.x; s.ly = e.y;
  const q = (time - s.leap) / .3; s.q = q;
  if (q < 1) { s.ox = (s.fx - e.x) * (1 - q); s.oy = (s.fy - e.y) * (1 - q) - Math.sin(q * Math.PI) * 90; } else { s.ox = 0; s.oy = 0; }
  return s;
}
function kingLeg(c, x, white) {
  poly(c, white || KC.dark, [[x - 12, -52], [x + 12, -52], [x + 12, -9], [x + 16, 0], [x - 15, 0], [x - 12, -9]]);
  poly(c, white || KC.plate, [[x - 9, -50], [x + 9, -50], [x + 9, -10], [x + 12, -3], [x - 11, -3], [x - 9, -10]]);
  rect(c, white || KC.hi, x - 8, -48, 2, 34); rect(c, white || KC.gold, x - 9, -32, 18, 3); rect(c, white || KC.rim, x - 13, -4, 29, 4);
}
function kingCape(c, f, time, calm, ph, white) { // torn cape: five hem points slide from hanging to streaming flat behind him
  c.beginPath(); c.moveTo(-8, -104);
  for (let i = 0; i < 5; i++) {
    const u = i / 4, odd = i & 1, hx = -34 + u * 40, hy = -5 - odd * 10, sx = -88 + odd * 12, sy = -116 + u * 62 + odd * 6, fl = calm ? 0 : Math.sin(time * 7 + i * 1.7) * 3 * (.4 + f);
    c.lineTo(Math.round(hx + (sx - hx) * f), Math.round(hy + (sy - hy) * f + fl));
  }
  c.lineTo(14, -100); c.closePath(); c.fillStyle = white || (ph >= 3 ? KC.capeDk : KC.cape); c.fill();
  c.strokeStyle = white || (ph >= 3 ? KC.eye3 : '#9a3b5a'); c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
}
function kingSeams(c, color, alpha, width) {
  c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round';
  for (const s of KCRACK) { c.beginPath(); c.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) c.lineTo(s[i][0], s[i][1]); c.stroke(); }
  c.restore();
}
function kingArm(c, white, x0, y0, x1, y1) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 8; line(c, white || KC.dark, x0, y0, mx, my, 12); line(c, white || KC.dark, mx, my, x1, y1, 11); line(c, white || KC.plate, x0, y0, mx, my, 7); line(c, white || KC.plate, mx, my, x1, y1, 6); }
function kingBody(c, e, time, white, pw, hold, calm, s) {
  const ph = e.bossPhase || 1, mv = e.move, d = e.dir === -1 ? -1 : 1, leaping = s.q < 1, exposed = e.superArmor <= 0;
  let key = '';
  if (leaping) key = 'leap'; else if (e.stun > 0 && exposed) key = 'stun'; else if (e.pause > 0) key = 'roar'; else if (e.travel > 0) key = 'charge';
  else if (e.tell > 0) key = mv === 'string' ? '' : mv; else if (e.recover > 0) key = KREC[e.lastMove] || ''; else if (e.y < FLOOR - 2) key = 'leap';
  const T = KPOSE[key] || KPOSE.idle, I = KPOSE.idle, k = e.tell > 0 && key && !leaping ? (s.branch ? Math.min(1, (time - s.t0) / .12) : 1 - (1 - pw) * (1 - pw)) : key ? 1 : 0; // a string's branch snaps into its pose in 0.12 s at the second glint
  for (let i = 0; i < 8; i++) kp[i] = I[i] + (T[i] - I[i]) * k;
  if (key === 'volley' && e.warn && e.warn.base !== undefined) { const a = d === 1 ? e.warn.base : Math.PI - e.warn.base; kp[5] = I[5] + (18 + Math.cos(a) * 46 - I[5]) * k; kp[6] = I[6] + (-96 + Math.sin(a) * 46 - I[6]) * k; } // the free hand points down the aim
  const gx = kp[2], gy = kp[3], ba = kp[4], ox = kp[5], oy = kp[6], fl = Math.abs(s.flip) < .06 ? .06 : s.flip;
  const eye = white || (ph >= 3 ? KC.eye3 : ph === 2 ? KC.eye2 : KC.eye1), walk = key === '' && Math.abs(e.vx || 0) > 5 ? Math.sin(time * 6) * 6 : 0, run = e.travel > 0 ? 7 : 0;
  c.save();
  if (hold && !calm) c.translate(Math.round(Math.sin(time * 70) * 1.5), 0); // a held wind-up trembles
  c.scale(fl, 1); c.rotate(kp[0]); c.scale(1, kp[1]);
  if (ph >= 3) { c.save(); c.globalAlpha = calm ? .8 : .65 + .15 * Math.sin(time * 3); circle(c, white || '#4a0a1c', 0, -106, 33); circle(c, white || '#9a1a34', 0, -106, 27); c.globalAlpha = 1; c.strokeStyle = white || '#ff5a6a'; c.lineWidth = 2; c.beginPath(); c.arc(0, -106, 27, 0, 7); c.stroke(); c.restore(); } // phase 3: a blood moon behind the crown
  kingCape(c, kp[7], time, calm, ph, white);
  kingLeg(c, -12 - run + walk, white); kingLeg(c, 12 + run - walk, white);
  poly(c, white || KC.cape, [[-17, -54], [17, -54], [13, -26], [0, -35], [-13, -26]]); // tabard
  // Torso: breastplate with a gold ridge and belt, the chest sigil that lights for the volley and the Tithe.
  poly(c, white || KC.dark, [[-25, -105], [-32, -92], [-24, -50], [-14, -43], [14, -43], [24, -50], [32, -92], [25, -105]]);
  poly(c, white || KC.plate, [[-22, -102], [-28, -91], [-21, -52], [-12, -46], [12, -46], [21, -52], [28, -91], [22, -102]]);
  poly(c, white || KC.rim, [[4, -102], [22, -102], [28, -91], [21, -52], [12, -46], [4, -46]]);
  rect(c, white || KC.hi, -20, -98, 3, 38); rect(c, white || KC.gold, -1, -100, 3, 52); rect(c, white || KC.gold, -24, -56, 48, 6); circle(c, white || KC.dark, 0, -53, 4);
  circle(c, eye, 0, -53, 2); circle(c, white || KC.gold, 0, -80, 6); circle(c, white || KC.dark, 0, -80, 4); circle(c, eye, 0, -80, key === 'volley' && !calm ? 3 + Math.sin(time * 30) : 2);
  if (exposed) kingSeams(c, '#ffd36e', .95, 3); else if (ph >= 2) kingSeams(c, ph >= 3 ? KC.eye3 : '#c58bff', calm ? .8 : .55 + .35 * Math.sin(time * 5), 2);
  // Head: gorget, great helm, eye slit and the broken crown.
  rect(c, white || KC.rim, -8, -108, 16, 8);
  poly(c, white || KC.dark, [[-14, -118], [14, -118], [16, -96], [9, -88], [-9, -88], [-16, -96]]);
  poly(c, white || KC.mid, [[-12, -116], [12, -116], [13, -97], [8, -91], [-8, -91], [-13, -97]]);
  rect(c, white || KC.hi, -10, -114, 3, 16); rect(c, white || KC.dark, -2, -108, 14, 6); rect(c, eye, 0, -106, 11, 2);
  rect(c, white || KC.gold, -14, -122, 28, 5); rect(c, white || KC.goldHi, -14, -122, 28, 1);
  const sp = [-12, -6, 0, 6, 12], sh = [9, 4, 11, 5, 8]; // two tines are snapped off
  for (let i = 0; i < 5; i++) poly(c, white || KC.gold, [[sp[i] - 3, -122], [sp[i], -122 - sh[i]], [sp[i] + 3, -122]]);
  if (ph >= 2 && !white) { const col = ph >= 3 ? '#ff3a4c' : '#ffb04a'; c.fillStyle = col; for (let i = 0; i < 3; i++) { const x = -9 + i * 9, h = calm ? 7 : 5 + (Math.sin(time * 11 + i * 2) + 1) * 3; c.beginPath(); c.moveTo(x - 3, -127); c.lineTo(x, -127 - h); c.lineTo(x + 3, -127); c.fill(); } } // phase 2+: the crown burns
  // Pauldrons with spikes.
  poly(c, white || KC.dark, [[-42, -108], [-22, -108], [-20, -88], [-38, -83]]); poly(c, white || KC.plate, [[-39, -105], [-24, -105], [-23, -90], [-36, -86]]); poly(c, white || KC.gold, [[-40, -108], [-36, -118], [-31, -108]]);
  poly(c, white || KC.dark, [[18, -111], [44, -106], [46, -84], [20, -86]]); poly(c, white || KC.plate, [[21, -108], [42, -103], [43, -87], [22, -89]]); rect(c, white || KC.hi, 23, -106, 17, 2);
  poly(c, white || KC.gold, [[26, -109], [29, -121], [33, -107]]); poly(c, white || KC.gold, [[36, -105], [43, -115], [42, -102]]);
  // Arms, then the greatsword on top.
  kingArm(c, white, -14, -96, ox, oy); kingArm(c, white, 17, -96, gx, gy);
  c.save(); c.translate(gx, gy); c.rotate(ba);
  rect(c, white || KC.dark, -19, -5, 19, 10); rect(c, white || '#5a3040', -16, -3, 14, 6); rect(c, white || KC.dark, -22, -6, 5, 12); rect(c, white || KC.dark, -2, -15, 8, 30); rect(c, white || KC.gold, -1, -13, 6, 26);
  poly(c, white || KC.bladeDk, [[4, -9], [86, -8], [104, 0], [86, 8], [4, 9]]); poly(c, white || KC.blade, [[5, -6], [85, -5], [99, 0], [85, 5], [5, 6]]); rect(c, white || '#8d95aa', 6, -1, 78, 2);
  if (ph >= 3 && !white) { c.globalAlpha = calm ? .9 : .7 + .25 * Math.sin(time * 6); rect(c, KC.eye3, 6, -6, 80, 1); rect(c, KC.eye3, 6, 5, 80, 1); c.globalAlpha = 1; } // phase 3: the edge runs red
  else if (key === '' && e.tell > 0 && !calm && !white) { c.globalAlpha = .5 + .5 * Math.sin(time * 14); rect(c, '#ffffff', 60, -1, 30, 2); c.globalAlpha = 1; } // the string's neutral pose: the edge shimmers while he decides
  c.restore();
  for (const [hx, hy] of [[gx, gy], [ox, oy]]) { rect(c, white || KC.dark, hx - 6, hy - 6, 12, 12); rect(c, white || KC.mid, hx - 4, hy - 4, 8, 8); rect(c, white || KC.gold, hx - 4, hy - 4, 8, 2); }
  const cs = Math.cos(ba) * 103, sn = Math.sin(ba) * 103; kingTip[0] = Math.round((gx + cs) * Math.sign(fl)); kingTip[1] = Math.round(gy + sn);
  c.restore();
}
function drawWaveWarn(ctx, v, p, rgb, edge, time) { // slam floor wave: dashed line along the floor with an arrow tip
  const s = v.x2 >= v.x1 ? 1 : -1; ctx.strokeStyle = `rgba(${rgb},${.3 + .4 * p})`; ctx.lineWidth = 3; ctx.setLineDash([14, 8]); ctx.lineDashOffset = -time * 60 * s;
  ctx.beginPath(); ctx.moveTo(Math.round(v.x1), Math.round(v.y1)); ctx.lineTo(Math.round(v.x2), Math.round(v.y2)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = edge; const tx = Math.round(v.x2), a = s * 10; ctx.beginPath(); ctx.moveTo(tx, v.y2); ctx.lineTo(tx - a, v.y2 - 7); ctx.lineTo(tx - a, v.y2 + 7); ctx.fill();
}
// One glyph per Warden move inside its hit box, so the five moves read apart at a glance: sweep = chevrons swinging out, slam = chevrons dropping, backhand = chevrons pointing backwards over hatching, seize = chain-link hatching with a jump arrow above.
function wardenWarnArt(ctx, w, p, rgb, edge, d, time) {
  const b = w.box; ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.lineJoin = 'miter';
  const cy = b.y + b.h / 2;
  if (w.kind === 'slash') { // the King's slash: three bright diagonal cuts sweeping forward across the box
    for (let i = 0; i < 3; i++) { const k = (time * 2 + i / 3) % 1, x = b.x + (d === 1 ? 6 + k * (b.w - 40) : b.w - 6 - k * (b.w - 40)), a = d * 30; ctx.globalAlpha = Math.sin(k * Math.PI) * (.5 + .5 * p); ctx.beginPath(); ctx.moveTo(x, b.y + 8); ctx.lineTo(x + a, b.y + b.h - 8); ctx.stroke(); }
  } else if (w.kind === 'sweep' || w.kind === 'backhand' || w.kind === 'turnslash') {
    const face = w.kind === 'sweep' ? d : -d; // chevrons point the way the weapon travels
    if (w.kind !== 'sweep') { ctx.globalAlpha = .5; for (let x = b.x - 10; x < b.x + b.w + 10; x += 14) { ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + 28, b.y); ctx.stroke(); } ctx.globalAlpha = 1; }
    for (let i = 0; i < 3; i++) { const k = (time * 1.6 + i / 3) % 1, x = face === 1 ? b.x + 10 + k * (b.w - 24) : b.x + b.w - 10 - k * (b.w - 24), a = face * 14; ctx.globalAlpha = Math.sin(k * Math.PI) * (.4 + .6 * p); ctx.beginPath(); ctx.moveTo(x - a, cy - 28); ctx.lineTo(x, cy); ctx.lineTo(x - a, cy + 28); ctx.stroke(); }
  } else if (w.kind === 'slam') {
    for (let i = 0; i < 3; i++) { const k = (time * 1.4 + i / 3) % 1, y = b.y + 10 + k * (b.h - 22), cx = b.x + b.w * (.25 + .25 * i); ctx.globalAlpha = Math.sin(k * Math.PI) * (.4 + .6 * p); ctx.beginPath(); ctx.moveTo(cx - 14, y - 12); ctx.lineTo(cx, y + 4); ctx.lineTo(cx + 14, y - 12); ctx.stroke(); }
    ctx.globalAlpha = .9; ctx.fillStyle = edge; ctx.fillRect(b.x, b.y + b.h - 5, b.w, 5); // the smash lands on the floor
  } else if (w.kind === 'seize') {
    ctx.globalAlpha = .5; ctx.lineWidth = 2; for (let x = b.x - b.h; x < b.x + b.w; x += 14) { ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); ctx.moveTo(x, b.y); ctx.lineTo(x + b.h, b.y + b.h); ctx.stroke(); }
  }
  ctx.restore();
  if (w.kind === 'turnslash') wardenTurnArrow(ctx, Math.round(b.x + b.w / 2), b.y + 8 + 140, 1, time); // the spin icon: he turns round to hit behind
  if (w.kind === 'seize') { // grounded heroes only: a jump above the box clears it, so mark the way out
    const ux = Math.round(b.x + b.w / 2), uy = Math.round(b.y - 12 - Math.sin(time * 8) * 2); ctx.save(); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ux, uy - 10); ctx.lineTo(ux + 9, uy + 2); ctx.lineTo(ux + 3, uy + 2); ctx.lineTo(ux + 3, uy + 9); ctx.lineTo(ux - 3, uy + 9); ctx.lineTo(ux - 3, uy + 2); ctx.lineTo(ux - 9, uy + 2); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  }
}
function warnCircles(ctx, circles, rgb, edge, p, time) {
  for (const c of circles) { // ground-centred disc: dome above the floor plus a ring on it; centre fill grows to the full radius
      const cx = Math.round(c.x), cy = Math.round(c.y), r = c.r;
      ctx.fillStyle = `rgba(${rgb},.12)`; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${.2 + .35 * p})`; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r * p), Math.PI, 0); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},.8)`; ctx.beginPath(); ctx.ellipse(cx, cy - 1, r, 8, 0, 0, 7); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = time * 1.5 + i * Math.PI / 3; ctx.fillStyle = edge; ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy - 1 + Math.sin(a) * 8) - 1, 3, 3); }
  }
}
function drawBossWarn(ctx, e, time) {
  const w = e.warn; if (!w || !(e.tell > 0)) return;
  if (!tellMax.has(w)) tellMax.set(w, e.tell);
  let rgb = e.punishable ? '255,211,110' : '231,92,80', edge = e.punishable ? '#ffd36e' : '#ff7a6a';
  const p = Math.max(0, Math.min(1, 1 - e.tell / tellMax.get(w))), d = e.dir === -1 ? -1 : 1;
  const fillBox = b => { // outline = full hit box, inner fill grows from the boss outward
    const fw = Math.round(b.w * p); const pu = e.punishable; ctx.fillStyle = `rgba(${rgb},${pu ? .3 : .14})`; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = `rgba(${rgb},${(pu ? .3 : .18) + .3 * p})`; ctx.fillRect(d === 1 ? b.x : b.x + b.w - fw, b.y, fw, b.h);
    ctx.strokeStyle = edge; ctx.lineWidth = pu ? 3 : 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  };
  ctx.save();
  if (w.kind === 'turnslash') { rgb = '176,120,255'; edge = '#c9a2ff'; } // the King's hit behind him: violet, so it never reads as the red slash in front
  if (w.kind === 'seize') { rgb = '214,74,138'; edge = '#ff7ab8'; } // the Toll: magenta, so it never reads as a plain hit
  if (w.kind === 'slash' || w.kind === 'slam' || w.kind === 'sweep' || w.kind === 'seize' || w.kind === 'backhand' || w.kind === 'turnslash') { fillBox(w.box); wardenWarnArt(ctx, w, p, rgb, edge, d, time); }
  if (w.kind === 'charge') {
    fillBox(w.box); const l = w.line; ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -time * 40 * d;
    ctx.beginPath(); ctx.moveTo(Math.round(l.x1), Math.round(l.y1)); ctx.lineTo(Math.round(l.x2), Math.round(l.y2)); ctx.stroke(); ctx.setLineDash([]);
    const tx = Math.round(l.x2), ty = Math.round(l.y2), a = d * 12; ctx.fillStyle = '#ffe0d0'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - a, ty - 8); ctx.lineTo(tx - a, ty + 8); ctx.fill();
  }
  if (w.wave) drawWaveWarn(ctx, w.wave, p, rgb, edge, time);
  if (w.wave2) drawWaveWarn(ctx, w.wave2, p, rgb, edge, time); // phase 2: the second wave behind the Warden is drawn like the first
  if (w.lines) for (const l of w.lines) { // faint band = orb width (r 9), bright line = flight path, dot = tip
    ctx.strokeStyle = `rgba(${rgb},${.1 + .14 * p})`; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},${.6 + .4 * p})`; ctx.lineWidth = 3; ctx.setLineDash([9, 6]); ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = edge; ctx.fillRect(Math.round(l.x2) - 3, Math.round(l.y2) - 3, 6, 6);
  }
  if (w.landing) { // descent: a shadow ring on the landing spot (the shockwave radius), a dashed leap arc from the King and chevrons dropping into the ring
    const L = w.landing, cx = Math.round(L.x), cy = Math.round(L.y), r = L.r;
    ctx.fillStyle = `rgba(16,8,28,${.35 + .4 * p})`; ctx.beginPath(); ctx.ellipse(cx, cy - 1, r, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},${.15 + .3 * p})`; ctx.beginPath(); ctx.ellipse(cx, cy - 1, Math.max(4, r * p), 16 * p, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy - 1, r, 16, 0, 0, 7); ctx.stroke();
    ctx.lineWidth = 2; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(cx - r, cy - 1); ctx.lineTo(cx - r, cy - 70); ctx.moveTo(cx + r, cy - 1); ctx.lineTo(cx + r, cy - 70); ctx.stroke(); ctx.globalAlpha = 1; // the shockwave reaches 70 px above the surface
    for (let i = 0; i < 3; i++) { const q = (time * 1.3 + i / 3) % 1, ux = cx + (i - 1) * 56, uy = cy - 64 + q * 54; ctx.globalAlpha = Math.sin(q * Math.PI) * (.5 + .5 * p); ctx.beginPath(); ctx.moveTo(ux - 12, uy - 10); ctx.lineTo(ux, uy + 4); ctx.lineTo(ux + 12, uy - 10); ctx.stroke(); }
    ctx.globalAlpha = .55; ctx.setLineDash(DESC_DASH); ctx.lineDashOffset = -time * 50; ctx.beginPath(); ctx.moveTo(Math.round(e.x), Math.round(e.y - e.h)); ctx.quadraticCurveTo(Math.round((e.x + cx) / 2), Math.min(e.y - e.h, cy) - 120, cx, cy - 20); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.globalAlpha = 1;
  }
  if (w.circles && !w.landing) warnCircles(ctx, w.circles, rgb, edge, p, time);
  ctx.restore();
}
// Castle heavy (#47): non-boss e.warn area. Outline = full hit area, inner fill grows from the enemy outward as the tell runs out; path stays lit through rush / dive travel.
function drawHeavyWarn(ctx, e, time) {
  const w = e.warn, tl = e.tell > 0, strike = e.strikeT > 0 || e.cutT > 0 || e.plantT > 0; if (!w || !(tl || strike)) return; // plantT: the planted tip box stays up while it is live
  if (tl && !tellMax.has(w)) tellMax.set(w, e.tell);
  const p = tl ? Math.max(0, Math.min(1, 1 - e.tell / tellMax.get(w))) : 1, d = e.dir === -1 ? -1 : 1, hot = .22 + .45 * p;
  ctx.save(); ctx.strokeStyle = '#ff4a3c'; ctx.lineWidth = e.heavy ? 3 : 2; // light moves (stepcut, counter) get a thinner outline than a heavy
  const b = w.box;
  if (w.kind === 'cleave' || w.kind === 'greatswing' || w.kind === 'lunge' || w.kind === 'rush' || w.kind === 'stepcut' || w.kind === 'counter' || w.kind === 'rising' || w.kind === 'sweep' || w.kind === 'slash' || w.kind === 'overhead' || w.kind === 'turnswipe' || w.kind === 'ray' || w.kind === 'skewer' || w.kind === 'rimstrike' || w.kind === 'lift' || w.kind === 'plant' || w.kind === 'shove' || w.kind === 'spin' || w.kind === 'pin') {
    const up = w.kind === 'lift', mid = w.kind === 'spin', fw = Math.round((up ? b.h : b.w) * p), g = w.kind === 'turnswipe' || w.kind === 'rimstrike' ? -d : w.kind === 'pin' ? (Math.sign(b.x + b.w / 2 - e.x) || d) : d; ctx.fillStyle = 'rgba(255,74,60,.14)'; ctx.fillRect(b.x, b.y, b.w, b.h); // turnswipe: the box is behind the knight, so the fill grows backwards
    ctx.fillStyle = `rgba(255,74,60,${e.plantT > 0 ? .5 : hot})`; if (up) ctx.fillRect(b.x, b.y + b.h - fw, b.w, fw); else if (mid) ctx.fillRect(b.x + Math.round((b.w - fw) / 2), b.y, fw, b.h); else ctx.fillRect(g === 1 ? b.x : b.x + b.w - fw, b.y, fw, b.h); ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (w.kind === 'sweep') { // low: a bright ground line, chevrons running along it and a hop arrow above, so "jump it" reads before "step back"
      const cy = Math.round(b.y + b.h - 4), off = PS.calm ? 0 : (time * 60) % 18; ctx.fillStyle = '#ffd0c0'; ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
      for (let cx = b.x + (g === 1 ? off : 18 - off); cx < b.x + b.w - 8; cx += 18) { ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7 * g, cy - 4); ctx.lineTo(cx, cy); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe0d0'; ctx.stroke(); }
      const ax = Math.round(b.x + b.w / 2), ay = Math.round(b.y - 16 - (PS.calm ? 0 : Math.sin(time * 9) * 3)); ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(ax, ay - 9); ctx.lineTo(ax + 8, ay + 3); ctx.lineTo(ax - 8, ay + 3); ctx.fill(); ctx.fillRect(ax - 2, ay + 3, 4, 7);
    } else if (w.kind === 'slash') { // one diagonal cut through the box
      ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2; ctx.setLineDash(WARN_DASH); ctx.beginPath(); ctx.moveTo(g === 1 ? b.x + 4 : b.x + b.w - 4, b.y + 8); ctx.lineTo(g === 1 ? b.x + b.w - 4 : b.x + 4, b.y + b.h - 8); ctx.stroke(); ctx.setLineDash(NO_WARN_DASH);
    } else if (w.kind === 'overhead') { // downward chevrons falling through the tall box: it comes from above
      const off = PS.calm ? 6 : (time * 50) % 24; ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const cx = Math.round(b.x + b.w * (i + .5) / 3), cy = Math.round(b.y + 12 + off + (i & 1) * 12); ctx.beginPath(); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 7, cy - 6); ctx.stroke(); }
    } else if (w.kind === 'ray') { // chest-height beam (the real 16 px hit band): dashed core, chevrons running out of the mage, hop arrows above it
      const my = Math.round(b.y + b.h / 2), x0 = g === 1 ? b.x : b.x + b.w, off = PS.calm ? 0 : (time * 160) % 40;
      ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 3; ctx.setLineDash(WARN_DASH); ctx.beginPath(); ctx.moveTo(b.x, my); ctx.lineTo(b.x + b.w, my); ctx.stroke(); ctx.setLineDash(NO_WARN_DASH); ctx.lineWidth = 2;
      for (let i = 0; i + 8 < b.w; i += 40) { const cx = Math.round(x0 + g * Math.min(b.w - 8, i + off)); ctx.beginPath(); ctx.moveTo(cx - g * 7, my - 6); ctx.lineTo(cx, my); ctx.lineTo(cx - g * 7, my + 6); ctx.stroke(); }
      for (const f of [.3, .65]) { const ax = Math.round(b.x + b.w * f), ay = Math.round(b.y - 18 - (PS.calm ? 0 : Math.sin(time * 9) * 3)); ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(ax, ay - 9); ctx.lineTo(ax + 8, ay + 3); ctx.lineTo(ax - 8, ay + 3); ctx.fill(); ctx.fillRect(ax - 2, ay + 3, 4, 7); }
    } else if (w.kind === 'rising') { // anti-air: only a hero whose feet are above the dashed line (the box bottom, 40 px up) is hit; the band below it is safe ground
      const ly = Math.round(b.y + b.h), off = PS.calm ? 0 : (time * 70) % 24; ctx.fillStyle = 'rgba(19,17,27,.55)'; ctx.fillRect(b.x, ly, b.w, 40);
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2; ctx.setLineDash(WARN_DASH); ctx.beginPath(); ctx.moveTo(b.x, ly); ctx.lineTo(b.x + b.w, ly); ctx.stroke(); ctx.setLineDash(NO_WARN_DASH);
      for (let i = 0; i < 3; i++) { const cx = Math.round(b.x + b.w * (i + .5) / 3), cy = Math.round(ly - 6 - ((off + i * 8) % 24)); ctx.beginPath(); ctx.moveTo(cx - 7, cy + 6); ctx.lineTo(cx, cy - 2); ctx.lineTo(cx + 7, cy + 6); ctx.stroke(); }
    } else if (w.kind === 'skewer') { // spikes rising through the zone: only a hero in the air is inside it
      const n = Math.max(2, Math.round(b.w / 24)); ctx.fillStyle = '#ffe0d0';
      for (let i = 0; i < n; i++) { const sx = Math.round(b.x + b.w * (i + .5) / n), sy = b.y + b.h; ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx, sy - 22); ctx.lineTo(sx + 6, sy); ctx.fill(); }
    } else if (w.kind === 'rimstrike' || w.kind === 'shove') { flowChevrons(ctx, b, g, time); // rim: the blow runs behind the shield; shove: the haft pushes forward
    } else if (w.kind === 'lift') { // the landing column: spear tips rising through it, so a hero in the air or just down is hit
      const off = PS.calm ? 6 : (time * 90) % 28; ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const cx = Math.round(b.x + b.w * (i + .5) / 2); for (let k = 0; k < 4; k++) { const cy = Math.round(b.y + b.h - 10 - ((off + k * 28) % 112)); ctx.beginPath(); ctx.moveTo(cx - 7, cy + 6); ctx.lineTo(cx, cy - 2); ctx.lineTo(cx + 7, cy + 6); ctx.stroke(); } }
    } else if (w.kind === 'plant') { // the planted tip: a bright stake at the far end and a hop arrow; dashing into it is what hurts
      const fx = Math.round(d === 1 ? b.x + b.w : b.x); ctx.fillStyle = '#ffe0d0'; ctx.fillRect(fx - 2, b.y - 6, 4, b.h + 6); ctx.fillRect(Math.round(b.x), b.y + b.h - 3, b.w, 3); hopArrow(ctx, Math.round(b.x + b.w / 2), b.y - 16, time);
    } else if (w.kind === 'spin') { // low whirl ring: dashed ellipse round the spearman on the floor line, hop arrow above (step out of 130 or jump 58)
      ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = 3; ctx.setLineDash(WARN_DASH); ctx.lineDashOffset = PS.calm ? 0 : -time * 50; ctx.beginPath(); ctx.ellipse(Math.round(e.x), Math.round(b.y + b.h - 6), b.w / 2 - 2, 12, 0, 0, 7); ctx.stroke(); ctx.setLineDash(NO_WARN_DASH);
      ctx.fillStyle = '#ffd0c0'; ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3); hopArrow(ctx, Math.round(e.x - b.w / 4), b.y - 16, time); hopArrow(ctx, Math.round(e.x + b.w / 4), b.y - 16, time);
    } else if (w.kind === 'pin') { // from where the hero stands to where it will stand: tips run in from the spearman, so stopping short is not enough; hop arrow above
      flowChevrons(ctx, b, -g, time); ctx.fillStyle = '#ffd0c0'; ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3); hopArrow(ctx, Math.round(b.x + b.w / 2), b.y - 16, time);
    } else if (w.kind === 'turnswipe') { // U-turn arrow over the head, pointing at the back: it swings round behind the knight
      const ax = Math.round(e.x), ay = Math.round(e.y - 92); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 15, d === 1 ? 0 : Math.PI, d === 1 ? Math.PI : Math.PI * 2, d === 1); ctx.stroke();
      ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(ax - d * 15, ay + 11); ctx.lineTo(ax - d * 22, ay + 1); ctx.lineTo(ax - d * 8, ay + 1); ctx.fill();
    }
  }
  if (w.kind === 'rush' || w.kind === 'dive' || w.kind === 'stepcut' || w.kind === 'overhead') { // path with an arrow tip
    const l = w.line, x2 = Math.round(w.to ?? l.x2), y2 = Math.round(l.y2), x1 = Math.round(l.x1), y1 = Math.round(l.y1), a = Math.sign(x2 - x1 || d) * 12;
    if (w.kind === 'dive') { if (e.bounced) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x2, y2, w.r + 9, 0, 7); ctx.stroke(); ctx.strokeStyle = '#ff4a3c'; } /* Shrieker second dive: extra white ring */ ctx.fillStyle = `rgba(255,74,60,${.35 + .4 * p})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x2, y2, w.r, 0, 7); ctx.fill(); ctx.stroke(); ctx.lineWidth = 2 * w.r; ctx.globalAlpha = .2 + .25 * p; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 3; }
    ctx.strokeStyle = '#ffe0d0'; ctx.lineWidth = w.kind === 'stepcut' || w.kind === 'overhead' ? 2 : 3; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -time * 40 * d; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffe0d0'; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - a, y2 - 8); ctx.lineTo(x2 - a, y2 + 8); ctx.fill();
  }
  if (w.variant === 'turnrush') turnArrow(ctx, e, d); // a rush out of a turn: the shield swings round first
  if (w.kind === 'rite' && w.circles) warnCircles(ctx, w.circles, '255,74,60', '#ff4a3c', p, time);
  ctx.restore();
}
function wardenTurn(e) { // render side: a follow-up charge that comes out of a flipped facing starts with a turnaround
  let s = wState.get(e); if (!s) { s = { dir: e.dir, warn: null, turn: false }; wState.set(e, s); }
  if (e.tell > 0 && e.warn !== s.warn) { s.warn = e.warn; s.turn = !!e.follow && e.move === 'charge' && s.dir !== e.dir; }
  s.dir = e.dir; return s.turn && e.tell > 0 && e.move === 'charge';
}
function wardenTurnArrow(ctx, x, y, k, time) { // U-turn arrow over the head while the Warden spins round for the return charge
  const cx = x, cy = y - 140; ctx.save(); ctx.strokeStyle = '#13111b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (const [w, col] of [[6, '#13111b'], [3, '#ffe0d0']]) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 14, Math.PI * 1.05, Math.PI * 2.0); ctx.stroke(); }
  ctx.fillStyle = '#ffe0d0'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 14, cy + 9); ctx.lineTo(cx + 22, cy - 3); ctx.lineTo(cx + 6, cy - 3); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
}
function wardenAura(ctx, e, x, y, time, calm, pw, hold) { // ground-level readouts around the boss: wind-up glow, gold shimmer on a payable recovery, break stun stars (sized from the body so the King's taller frame fits)
  const wind = e.heavy && e.tell > 0, rec = e.recover > 0 && !(e.tell > 0), stunned = e.stun > 0 && e.superArmor <= 0, hh = e.h / 2, hw = e.w / 2;
  if (wind) { ctx.save(); ctx.globalAlpha = hold && !calm ? .5 + .2 * Math.sin(time * 40) : .15 + .35 * pw; ctx.fillStyle = '#ff4a3c'; ctx.beginPath(); ctx.ellipse(x, y - hh, hw + 4 + 10 * pw, hh + 10, 0, 0, 7); ctx.fill(); ctx.restore(); }
  if (e.tell > 0 && e.glint <= 0 && !e.heavy) { ctx.save(); ctx.globalAlpha = .12 + .22 * pw; ctx.fillStyle = '#f4ae84'; ctx.beginPath(); ctx.ellipse(x, y - hh, hw + 2, hh + 6, 0, 0, 7); ctx.fill(); ctx.restore(); } // lights get a faint warm glow
  if (rec || stunned) { const pay = stunned || e.heavy; ctx.save(); ctx.globalAlpha = (stunned ? .6 : 1) * (calm ? .6 : .45 + .22 * Math.sin(time * 14)); ctx.fillStyle = pay ? '#ffd36e' : '#8e99a8'; ctx.strokeStyle = pay ? '#fff0b0' : '#aab4c8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - hh + 4, hw + 10, hh + 6, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ctx.restore(); } // gold: hits pay blood; grey: open, but a light recovery pays nothing
  if (stunned) { ctx.fillStyle = '#ffd36e'; for (let i = 0; i < 4; i++) { const a = time * 6 + i * Math.PI / 2; ctx.fillRect(Math.round(x + Math.cos(a) * 30) - 2, Math.round(y - e.h - 16 + Math.sin(a) * 5) - 2, 4, 4); } }
  if (e.bossPhase >= 2 && !calm) { ctx.fillStyle = e.king && e.bossPhase >= 3 ? '#ff4a5c' : '#ff7a52'; for (let i = 0; i < 5; i++) { const q = (time * .6 + i * .2) % 1; ctx.globalAlpha = 1 - q; ctx.fillRect(Math.round(x + Math.sin(i * 2.7 + time) * 30) - 1, Math.round(y - 30 - q * 100), 2, 2); } ctx.globalAlpha = 1; } // embers rising off the cracked armor (blood-red in the King's third phase)
}
export function drawPool(ctx, pool, time, calm) { // blood pool: puddle with sheen, ripples and a ring that drains over its 4 s life; blinks in the last second
  const f = Math.max(0, pool.life / pool.max), born = Math.min(1, (pool.max - pool.life) / .2), x = Math.round(pool.x), y = Math.round(pool.y - 2), s = pool.x * .013;
  const a = Math.min(1, pool.life) * (pool.life < 1 && !calm ? .6 + .4 * Math.sin(time * 18) : 1);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(born, born);
  ctx.fillStyle = '#2a0b16'; ctx.beginPath(); ctx.ellipse(0, 1, 40, 9, 0, 0, 7); ctx.ellipse(-27, 2, 16, 5, 0, 0, 7); ctx.ellipse(26, 0, 13, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#7d1f3a'; ctx.beginPath(); ctx.ellipse(0, 0, 36, 7, 0, 0, 7); ctx.ellipse(-26, 1, 13, 3.5, 0, 0, 7); ctx.ellipse(25, -1, 10, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c4405c'; ctx.beginPath(); ctx.ellipse(-6 + Math.sin(s) * 4, -1, 16, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb4bf'; ctx.fillRect(-12, -2, 7, 1);
  const r = (time * .8 + s) % 1; ctx.globalAlpha = a * (1 - r) * .7; ctx.strokeStyle = '#e0584c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 8 + 30 * r, 2 + 5 * r, 0, 0, 7); ctx.stroke();
  ctx.globalAlpha = a; ctx.strokeStyle = pool.draining ? '#f4e4ff' : f > .5 ? '#e0584c' : '#ffd36e'; ctx.lineWidth = pool.draining ? 3 : 2; ctx.beginPath(); ctx.ellipse(0, 0, 44, 11, 0, -Math.PI, -Math.PI + Math.PI * 2 * f); ctx.stroke(); // remaining time
  const by = -18 - (calm ? 0 : Math.sin(time * 5 + s) * 3); ctx.fillStyle = '#e0584c'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, by - 9); ctx.quadraticCurveTo(7, by + 1, 0, by + 6); ctx.quadraticCurveTo(-7, by + 1, 0, by - 9); ctx.stroke(); ctx.fill(); // blood drop: walk onto it
  ctx.restore();
}
function twistGlyph(ctx, twist, gx, gy) { // castle elite twist: a small pictogram beside the head, dark outline under a pale stroke
  ctx.save(); ctx.translate(gx, gy); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [w, col] of [[4, '#13111b'], [2, '#e6d4ff']]) {
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath();
    if (twist === 'duelist') { ctx.moveTo(-6, -6); ctx.lineTo(1, 6); ctx.moveTo(-1, -6); ctx.lineTo(6, 6); } // two slashes
    else if (twist === 'shrieker') { ctx.moveTo(-6, -7); ctx.lineTo(0, -1); ctx.lineTo(6, -7); ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0); } // double dive
    else if (twist === 'phalanx') { ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(6, 1); ctx.lineTo(0, 7); ctx.lineTo(-6, 1); ctx.closePath(); } // shield
    else if (twist === 'impaler') { ctx.moveTo(0, 7); ctx.lineTo(0, -7); ctx.moveTo(-4, -2); ctx.lineTo(0, -7); ctx.lineTo(4, -2); } // upward spike
    else if (twist === 'oathsworn') { ctx.rect(-5, -5, 10, 10); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); } // unmoving plate
    else if (twist === 'hierophant') { ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.moveTo(-5, -2); ctx.lineTo(5, -2); } // blessing cross
    else { ctx.moveTo(0, -7); ctx.lineTo(6, 5); ctx.lineTo(-6, 5); ctx.closePath(); } // prism
    ctx.stroke();
  }
  ctx.restore();
}
export function drawEnemy(ctx, e = {}, time = 0, calm = false) {
  const x = Math.round(e.x || 0), y = Math.round(e.y ?? FLOOR), boss = e.type === 'boss';
  const heavy = e.heavy && !boss, windup = heavy && e.tell > 0, slump = !boss && e.recover > 0 && e.punishable && !(e.tell > 0) && !(e.strikeT > 0) && !(e.cutT > 0); // heavy and castle light recoveries
  if (!boss && e.warn && e.tell > 0) { if (!tellMax.has(e.warn)) tellMax.set(e.warn, e.tell); lastWarn.set(e, e.warn.kind); }
  const lk = !boss && !heavy && e.warn ? e.warn.kind : '', lw = lk === 'sweep' || lk === 'slash' || lk === 'overhead' || lk === 'turnswipe' || lk === 'rimstrike' || lk === 'lift' || lk === 'plant' || lk === 'shove'; // castle light moves that draw their warn area through drawHeavyWarn
  const tm = tellMax.get(e.warn) || (e.type === 'spear' ? .64 : e.tell || 1), pw = windup ? Math.min(1, (tm - e.tell) / (e.delayed ? Math.max(.1, tm - .8) : tm)) : 0; // delayed: wind-up completes 0.8 s before contact (GLINT_LEAD + DELAY_EXTRA), then holds
  const hold = windup && e.delayed && pw >= 1 && !e.glinted, mv = !boss && !heavy && (e.move === 'stepcut' || e.move === 'counter' || e.move === 'overhead' || e.move === 'rising');
  PS.pw = pw; PS.calm = calm; PS.slump = slump; PS.k = windup ? pw : e.tell > 0 ? Math.min(1, (tm - e.tell) / .2) : 0; // pose inputs for the body drawers
  const kn = e.type === 'knight' && !boss, ov = lk === 'overhead';
  PS.km = !kn ? '' : windup ? 'great' : e.tell > 0 ? (lk === 'turnswipe' ? 'turn' : lw ? lk : '') : e.cutT > 0 && ov ? 'roverhead' : slump ? 'r' + (heavy ? 'great' : lastWarn.get(e) === 'turnswipe' ? 'turn' : lastWarn.get(e) === 'overhead' ? 'overhead' : 'slash') : '';
  if (kn && e.tell > 0 && lw) { let s = knS.get(e); if (!s) { s = { w: null, t0: -9, f: false, pk: '' }; knS.set(e, s); } if (s.w !== e.warn) { s.f = s.w !== null && s.pk === 'slash' && lk !== 'slash'; s.pk = lk; s.w = e.warn; s.t0 = time; } }
  if (heavy || ((mv || lw) && e.warn)) drawHeavyWarn(ctx, e, time);
  if (mv && e.cutT > 0 && e.cutFrom != null) { ctx.save(); ctx.globalAlpha = .3 + .4 * e.cutT / .15; ctx.strokeStyle = '#ffd0c0'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(Math.round(e.cutFrom), Math.round(y - e.h / 2)); ctx.lineTo(x, Math.round(y - e.h / 2)); ctx.stroke(); ctx.restore(); } // lunge streak
  if (heavy && e.strikeT > 0 && e.from) { // streak from the start of the rush / dive to the body
    ctx.save(); ctx.globalAlpha = .45 * (e.strikeT / (e.strikeMax || .35)) + .15; ctx.strokeStyle = '#ffd0c0'; ctx.lineWidth = e.heavyKind === 'dive' ? 16 : 22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(Math.round(e.from.x), Math.round(e.from.y - e.h / 2)); ctx.lineTo(x, Math.round(y - e.h / 2)); ctx.stroke(); ctx.restore();
  }
  if (windup) { ctx.save(); ctx.globalAlpha = hold && !calm ? .5 + .2 * Math.sin(time * 40) : .15 + .35 * pw; ctx.fillStyle = '#ff4a3c'; ctx.beginPath(); ctx.ellipse(x, y - e.h / 2, 24 + 6 * pw, e.h / 2 + 6, 0, 0, 7); ctx.fill(); ctx.restore(); } // red body glow grows with the tell
  if (windup && e.type === 'bat') { const ay = Math.round(y + 14 + (calm ? 0 : Math.sin(time * 12) * 3)); ctx.save(); ctx.fillStyle = '#ff4a3c'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, ay); ctx.lineTo(x + 10, ay); ctx.lineTo(x, ay + 14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } // down arrow under the bat: it is about to drop
  if (e.gT > 0 || e.braceT > 0) { ctx.save(); ctx.strokeStyle = '#cfe3f2'; ctx.lineWidth = 3; ctx.globalAlpha = calm ? .7 : .5 + .3 * Math.sin(time * 18); ctx.beginPath(); ctx.arc(x + (e.dir === -1 ? -1 : 1) * 16, y - 52, 30, e.dir === -1 ? Math.PI * .65 : -Math.PI * .35, e.dir === -1 ? Math.PI * 1.35 : Math.PI * .35); ctx.stroke(); ctx.restore(); } // apex guard: a pale arc in front, so a blocked hit reads as a block
  if (slump) { ctx.save(); ctx.globalAlpha = calm ? .7 : .55 + .25 * Math.sin(time * 14); ctx.fillStyle = '#ffd36e'; ctx.strokeStyle = '#fff0b0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - e.h / 2, 28, e.h / 2 + 5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ctx.restore(); } // gold shimmer: open to punish
  if (e.type !== 'bat') shadow(ctx, x, y, boss ? (e.king ? 96 : 72) : 33);
  if (e.tell > 0) { ctx.save(); ctx.strokeStyle = '#e7746666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 1, boss ? (e.king ? 84 : 70) : 29, boss ? 8 : 4, 0, 0, 7); ctx.stroke(); ctx.restore(); }
  if (e.tell > 0 && e.poiseHit > 0 && !e.warn && !e.thrustBox && !heavy && !boss && (e.type === 'skeleton' || e.type === 'shield')) { const rx = x + (e.dir === -1 ? -1 : 1) * (e.type === 'shield' ? 70 : 82); ctx.save(); ctx.fillStyle = '#ff6a5c'; ctx.fillRect(Math.min(x, rx), y - 3, Math.abs(rx - x), 3); ctx.fillRect(rx - 1, y - 16, 3, 16); ctx.restore(); } // provoked poke from afar: the slash's real reach on the floor, so a whiff reads as out of range
  if (boss) drawBossWarn(ctx, e, time);
  if (!boss && e.tell > 0 && e.warn?.lines) { // Prism: the three real bolt paths (band = orb width 14, dashed core, tip dot)
    const wl = e.warn, pp = Math.max(0, Math.min(1, 1 - e.tell / (tellMax.get(wl) || e.tell))); ctx.save();
    for (const l of wl.lines) { ctx.strokeStyle = `rgba(255,74,60,${.1 + .14 * pp})`; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,224,208,${.6 + .4 * pp})`; ctx.lineWidth = 2; ctx.setLineDash([9, 6]); ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke(); ctx.setLineDash(NO_WARN_DASH); ctx.fillStyle = '#ff4a3c'; ctx.fillRect(Math.round(l.x2) - 3, Math.round(l.y2) - 3, 6, 6); }
    ctx.restore();
  }
  if (e.blinkT > 0 && e.blinkTo != null) { // mage blink: a ghost and a rising light column on the spot it will take
    const q = 1 - e.blinkT / .4; ctx.save(); ctx.translate(Math.round(e.blinkTo), FLOOR); ctx.globalAlpha = .15 + .4 * q; ctx.strokeStyle = '#cdb8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -1, 26, 6, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#cdb8ff55'; ctx.fillRect(-12, -84 * q - 6, 24, 84 * q + 6); ctx.scale(e.dir === -1 ? -1 : 1, 1); mage(ctx, e, time, '#cdb8ff'); ctx.restore();
  }
  const wd = !!e.warden, kg = !!e.king, wb = wd || kg, wtm = wb ? tellMax.get(e.warn) || e.tell || 1 : 1, wpw = wb && e.tell > 0 ? Math.min(1, (wtm - e.tell) / (e.delayed ? Math.max(.1, wtm - .8) : wtm)) : 0, whold = wb && e.tell > 0 && e.delayed && wpw >= 1 && !e.glinted, wturn = wb && wardenTurn(e), wk = wb && e.tell > 0 ? Math.min(1, (wtm - e.tell) / (wtm * .5)) : 1;
  const ks = kg ? kingState(e, time) : null;
  if (wb && e.hp > 0) wardenAura(ctx, e, x, y, time, calm, wpw, whold);
  if (kg && ks.branch && e.tell > 0 && time - ks.t0 < .2) { ctx.save(); ctx.globalAlpha = (1 - (time - ks.t0) / .2) * .55; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y - 64, 52 + (time - ks.t0) * 120, 72, 0, 0, 7); ctx.stroke(); ctx.restore(); } // the string commits: a white ring flashes round him at the second glint
  if (e.tell > 0 && e.thrustBox && !lw) { const b = e.thrustBox; ctx.save(); ctx.fillStyle = '#e7746640'; ctx.strokeStyle = '#e7746699'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
    // dashed path along the box centre with a bright tip at the far end, so the whole reach reads as the weapon's path
    const fx = e.dir === -1 ? b.x : b.x + b.w, my = Math.round(b.y + b.h / 2); ctx.strokeStyle = '#ec8b7c'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(Math.round(e.x + (e.dir === -1 ? -10 : 10)), my); ctx.lineTo(Math.round(fx), my); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#e4cfbc'; ctx.fillRect(Math.round(fx) - (e.dir === -1 ? 0 : 6), my - 3, 6, 6); ctx.restore(); }
  if (kn && e.tell > 0 && lw) { const s = knS.get(e), q = (time - s.t0) / .2; if (s.f && q < 1) { ctx.save(); ctx.globalAlpha = (1 - q) * .6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - 40, 30 + q * 30, 52, 0, 0, 7); ctx.stroke(); ctx.restore(); } } // the string commits to its second hit: one white ring, the same cue as the King's
  if (e.type === 'bat' && e.tell > 0 && !e.heavy && e.dartT !== undefined) { // castle swoop. Dart: dashed path and a fixed target ring where the hero stood; then the claw zone (the real 55 px hit area) fills until contact
    const zy = Math.round(e.y), zt = zy - 58, zh = 116, pu = calm ? 1 : .75 + .25 * Math.sin(time * 30); // the real claw zone: |dx| < 55 and the hero's feet within 58 px of the bat
    const zone = (zx, a) => { ctx.save(); ctx.beginPath(); ctx.rect(zx - 55, zt, 110, zh); ctx.clip(); ctx.fillStyle = `rgba(255,74,60,${a})`; ctx.fillRect(zx - 55, zt, 110, zh); ctx.strokeStyle = '#ff4a3c'; ctx.globalAlpha = .55; ctx.lineWidth = 3; ctx.beginPath(); for (let i = -zh; i < 110; i += 14) { ctx.moveTo(zx - 55 + i, zt + zh); ctx.lineTo(zx - 55 + i + zh, zt); } ctx.stroke(); ctx.restore(); };
    const box = (zx, w) => { ctx.strokeStyle = '#13111b'; ctx.lineWidth = w + 3; ctx.strokeRect(zx - 55, zt, 110, zh); ctx.strokeStyle = '#ff7a68'; ctx.lineWidth = w; ctx.strokeRect(zx - 55, zt, 110, zh); }; // dark halo keeps the outline visible over the hero
    ctx.save(); ctx.lineCap = 'round';
    if (e.dartT > 0) {
      const ty = zy, fx = Math.round(e.dartFrom), tx = Math.round(e.dartTo), dx = tx > fx ? 1 : -1; ctx.setLineDash(WARN_DASH); zone(tx, .12 * pu); box(tx, 2); ctx.setLineDash(NO_WARN_DASH); // preview of where the claw zone will be
      ctx.strokeStyle = '#13111b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(fx, ty); ctx.lineTo(tx, ty); ctx.stroke(); ctx.strokeStyle = '#ffd0c0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, ty); ctx.lineTo(tx - dx * 12, ty); ctx.stroke(); // solid dart line, bat start to fixed target
      ctx.fillStyle = '#ffd0c0'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - dx * 18, ty - 10); ctx.lineTo(tx - dx * 18, ty + 10); ctx.closePath(); ctx.fill(); ctx.stroke(); // arrowhead at the target
    } else { const q = Math.min(1, 1 - e.tell / .45); zone(x, .12 + .3 * q); box(x, 3); ctx.fillStyle = '#ff4a3c'; ctx.strokeStyle = '#13111b'; ctx.lineWidth = 2; ctx.fillRect(x - 55, FLOOR - 6, 110, 6); ctx.strokeRect(x - 55, FLOOR - 6, 110, 6); } // hold: the box fills until contact; a floor bar shows its width so a jump over it reads
    ctx.restore();
  }
  if (e.blessRadius > 0 && e.tell > 0) { const p = Math.min(1, 1 - e.tell / .9); ctx.save(); ctx.fillStyle = `rgba(212,66,58,${.12 + .3 * p})`; ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - 2, e.blessRadius, 20, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); } // flat floor reach: fills as the warning ends
  if (e.blessed > 0) { const pu = Math.sin(time * 6) * .5 + .5, hy = Math.round(y - 88 - pu * 2); ctx.save(); ctx.fillStyle = `rgba(212,66,58,${.2 + pu * .1})`; ctx.strokeStyle = `rgba(255,106,92,${.6 + pu * .4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 29, 26, 40, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff6a5c'; ctx.beginPath(); ctx.moveTo(x, hy - 7); ctx.quadraticCurveTo(x + 7, hy + 1, x, hy + 5); ctx.quadraticCurveTo(x - 7, hy + 1, x, hy - 7); ctx.fill(); ctx.restore(); }
  if (e.elite) { // purple aura hugging the body (faint fill so the "!" and bars stay readable); ward ring shrinks and fades as the shield drains
    const pu = Math.sin(time * 4) * .5 + .5; ctx.save(); ctx.fillStyle = `rgba(150,90,220,${.1 + pu * .07})`; ctx.strokeStyle = `rgba(190,140,255,${.45 + pu * .3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 30, 30 + pu * 3, 44 + pu * 3, 0, 0, 7); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) { const p = (time * .7 + i / 3) % 1; ctx.fillStyle = `rgba(214,180,255,${1 - p})`; ctx.fillRect(Math.round(x + Math.sin(i * 2.4 + time) * 20) - 1, Math.round(y - 8 - p * 70), 3, 3); } // rising motes
    if (e.ward > 0) { const r = Math.min(1, e.ward / 30); ctx.strokeStyle = `rgba(159,216,255,${.35 + .65 * r})`; ctx.lineWidth = 1 + 2 * r; ctx.beginPath(); ctx.arc(x, y - 30, Math.round(40 + 10 * r), 0, 7); ctx.stroke(); }
    if (e.twist) twistGlyph(ctx, e.twist, x - 24, Math.round(y - e.h - 8));
    ctx.restore(); }
  ctx.save(); ctx.translate(x, y); ctx.scale(e.dir === -1 ? -1 : 1, 1); if (kg && ks.q < 1) ctx.translate(Math.round(ks.ox * (e.dir === -1 ? -1 : 1)), Math.round(ks.oy)); // descent leap arc
  if (hold && !calm) ctx.translate(Math.round(Math.sin(time * 70) * 1.5), 0); // held wind-up trembles
  if (windup) { ctx.rotate(-.14 * pw); ctx.scale(1 + .06 * pw, 1 + .06 * pw); } // rears back, swelling
  else if (slump && e.type !== 'spear' && e.type !== 'bat') { ctx.rotate(.3); ctx.scale(1, .85); } // slumped forward (the spearman leans in its own pose, the bat flutters)
  else if (e.recoilT > 0) ctx.rotate(-.28); // priest recoil: leans away from the hero
  else if (e.stepT > 0 || e.bsT > 0) ctx.rotate(-.22); // stepcut backstep: leans away
  else if (e.cutT > 0) ctx.rotate(.3); // stepcut lunge: all weight forward
  else if (mv && (e.move === 'stepcut' || e.move === 'rising') && e.tell > 0) { ctx.rotate(.1); ctx.scale(1, .94); } // crouched behind the cocked blade
  else if (e.tell > 0 && lk === 'sweep') { ctx.rotate(.1); ctx.scale(1, .94); } // low sweep: crouched, the spear held down by the shins
  else if (e.tell > 0 && ov) ctx.rotate(-.1); // overhead: leans back under the raised blade
  else if (e.tell > 0 && lk === 'turnswipe') ctx.rotate(-.06); // turnswipe: shoulders already coming round
  const white = e.flash > 0 ? '#fff0d0' : null;
  if (e.blinkT > 0) { const bq = 1 - e.blinkT / .4; ctx.globalAlpha = calm ? .5 : .25 + .45 * Math.abs(Math.sin(time * 30)); ctx.scale(1 - .35 * bq, 1 + .1 * bq); } // mage blink: flickers and thins out
  if (wd) wardenBody(ctx, e, time, white, wpw, whold, calm, wturn ? -Math.cos(Math.PI * wk) : 1);
  else if (kg) kingBody(ctx, e, time, white, wpw, whold, calm, ks);
  else if (boss) { if (e.travel > 0) ctx.rotate(.2); /* charge lean, forward in local x */ ctx.scale(1.35, 1.35); knight(ctx, e, time, white, true); }
  else if (e.type === 'bat') bat(ctx, e, time, white);
  else if (e.type === 'shield') shieldBearer(ctx, e, time, white);
  else if (e.type === 'spear') spearman(ctx, e, time, white);
  else if (e.type === 'knight') knight(ctx, e, time, white);
  else if (e.type === 'priest') priest(ctx, e, time, white);
  else if (e.type === 'mage') mage(ctx, e, time, white);
  else skeleton(ctx, e, time, white);
  if (e.riposte && e.stun > 0) { // posture broken: gold crack down the body and a pulsing outline until the riposte lands
    ctx.strokeStyle = '#fff0b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -e.h); ctx.lineTo(0, -e.h * .75); ctx.lineTo(-7, -e.h * .55); ctx.lineTo(3, -e.h * .35); ctx.lineTo(-3, -e.h * .1); ctx.stroke();
    ctx.globalAlpha = calm ? .8 : .5 + .4 * Math.sin(time * 16); ctx.strokeStyle = '#ffd36e'; ctx.beginPath(); ctx.ellipse(0, -e.h / 2, 24, e.h / 2 + 4, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (e.glint > 0) { const g = kg ? kingTip : wd ? wardenTip : kn && heavy ? KN_TIP : GLINT_TIP[e.type] || [10, -50], k = e.glint / .1, r = Math.round(10 + 16 * k); // release cue: one bright star on the weapon, 0.1 s
    rect(ctx, '#ffffff', g[0] - r, g[1] - 1, 2 * r, 2); rect(ctx, '#ffffff', g[0] - 1, g[1] - r, 2, 2 * r); line(ctx, '#ffffff', g[0] - r * .6, g[1] - r * .6, g[0] + r * .6, g[1] + r * .6, 1); line(ctx, '#ffffff', g[0] - r * .6, g[1] + r * .6, g[0] + r * .6, g[1] - r * .6, 1); circle(ctx, '#ffffff', g[0], g[1], 4); }
  ctx.restore();
  if (wb && e.hp > 0) { ctx.save(); ctx.translate(x, y); wardenShell(ctx, e, time, calm); ctx.restore(); if (wturn) wardenTurnArrow(ctx, x, y, wk, time); }
  if (e.move === 'counter' && e.tell > 0 && e.type !== 'skeleton') { const q = Math.min(1, 1 - e.tell / .45), r = Math.round(36 - 20 * q), rx = Math.round(x + (e.dir === -1 ? -1 : 1) * 24), ry = y - 40; ctx.save(); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 4; ctx.globalAlpha = .75 + .25 * q; ctx.beginPath(); ctx.arc(rx, ry, r, 0, 7); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, 20, 0, 7); ctx.stroke(); ctx.restore(); } // ring closes onto the raised shield: a pale-blue shove cue, unlike the red slash / bash
}
const KN_TIP = [-50, -72]; // the great swing's blade tip at the hold
const GLINT_TIP = { skeleton: [0, -85], shield: [24, -40], knight: [55, -59], spear: [110, -30], bat: [0, -14], priest: [10, -92], mage: [18, -70] }; // weapon tip in local (facing +x) coordinates
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

// Affix icon (swift arrow / splitting diamond / warded shield) at (x, y), about 10 px wide.
export function drawAffixIcon(ctx, affix, x, y) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.lineJoin = 'round';
  ctx.fillStyle = '#13111bcc'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#b48cf0'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle = '#efe2ff'; ctx.lineWidth = 1.5;
  if (affix === 'swift') { ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(0, -3); ctx.moveTo(-5, 0); ctx.lineTo(3, 0); ctx.moveTo(-5, 3); ctx.lineTo(0, 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(6, 0); ctx.lineTo(2, 4); ctx.fill(); }
  else if (affix === 'splitting') { ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke(); }
  else if (affix === 'warded') { ctx.strokeStyle = ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.stroke(); ctx.fillRect(-1, -2, 2, 3); }
  ctx.restore();
}
