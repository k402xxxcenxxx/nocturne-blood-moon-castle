#!/usr/bin/env node
// Turns chroma-key videos into a runtime sprite sheet and sound effects. See docs/art-pipeline.md.
// Usage: node tools/video-to-assets.mjs tools/hero-clips.json
// Only needs ffmpeg, on PATH or inside WSL; nothing here ships with the game.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const least = (list, pick) => list.reduce((low, item) => Math.min(low, pick(item)), Infinity); // a spread would overflow the call stack on a full sheet
export const isChroma = (r, g, b) => Math.min(r, b) - g > 48; // magenta and its video-compressed fringes; red cape and silver hair both have min(r, b) close to g

// Keeps only connected shapes of at least minArea, which drops the compression specks around the character.
export function keepLargeShapes(mask, w, h, minArea) {
  const seen = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const stack = [s], shape = []; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w; shape.push(i);
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (n >= 0 && n < mask.length && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
    }
    if (shape.length >= minArea) for (const i of shape) out[i] = 1;
  }
  return out;
}

// Finds the frame pair (i, j) inside the range that closes a loop with the smallest visual jump.
export function bestLoop(frames, minGap) {
  let best = { i: 0, j: frames.length - 1, score: Infinity };
  for (let i = 0; i < frames.length; i++) for (let j = i + minGap; j < frames.length; j++) {
    let score = 0; const a = frames[i], b = frames[j];
    for (let p = 0; p < a.length; p += 16) score += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]);
    if (score < best.score) best = { i, j, score };
  }
  return best;
}

// Median cut: a shared palette for the whole sheet, so colors cannot flicker between frames.
export function medianCut(pixels, count) {
  const boxes = [pixels];
  while (boxes.length < count) {
    let at = -1, axis = 0, widest = 0;
    boxes.forEach((box, n) => { if (box.length < 2) return; for (let c = 0; c < 3; c++) { const vals = box.map(p => p[c]), span = -least(vals, v => -v) - least(vals, v => v); if (span > widest) { widest = span; at = n; axis = c; } } });
    if (at < 0) break;
    const box = boxes[at].sort((a, b) => a[axis] - b[axis]), mid = box.length >> 1;
    boxes.splice(at, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(box => [0, 1, 2].map(c => Math.round(box.reduce((sum, p) => sum + p[c], 0) / box.length)));
}
const nearest = (palette, p) => palette.reduce((best, c) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; return d < best.d ? { c, d } : best; }, { c: palette[0], d: Infinity }).c;

const wslPath = p => '/mnt/' + resolve(p).replace(':', '').replace(/\\/g, '/').replace(/^./, c => c.toLowerCase());
function ffmpeg(args, input) {
  const opts = { input, maxBuffer: 2 ** 31 - 1 };
  let run = spawnSync('ffmpeg', args, opts);
  if (run.error?.code === 'ENOENT') run = spawnSync('wsl.exe', ['ffmpeg', ...args.map(a => /^[A-Za-z]:|[\\/]/.test(a) && !/^[a-z]+=|=/.test(a) ? wslPath(a) : a)], opts);
  if (run.status) throw new Error(`ffmpeg failed: ${String(run.stderr).slice(-600)}`);
  return run.stdout;
}

const FPS = 24;
function readClip(file, size) {
  const raw = ffmpeg(['-v', 'error', '-i', file, '-vf', `scale=${size}:${size}:flags=neighbor`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return Array.from({ length: Math.floor(raw.length / (size * size * 3)) }, (_, n) => raw.subarray(n * size * size * 3, (n + 1) * size * size * 3));
}

// Box-downscales one keyed frame into a list of opaque sprite pixels, in sprite coordinates around the feet.
export function spritePixels(frame, size, { scale, feet, minArea, minX = 0, clear = null }) {
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i++) {
    const x = i % size, y = Math.floor(i / size), cleared = clear && x >= clear[0] && y >= clear[1] && x < clear[2] && y < clear[3]; // `clear` masks a box, for dust the clip added
    mask[i] = x < minX || cleared || isChroma(frame[i * 3], frame[i * 3 + 1], frame[i * 3 + 2]) ? 0 : 1;
  }
  const solid = keepLargeShapes(mask, size, size, minArea), bins = new Map();
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i]) continue;
    const x = Math.floor((i % size - feet[0]) * scale), y = Math.floor((Math.floor(i / size) - feet[1]) * scale), key = `${x},${y}`, bin = bins.get(key) ?? { x, y, r: 0, g: 0, b: 0, n: 0 };
    bin.r += frame[i * 3]; bin.g += frame[i * 3 + 1]; bin.b += frame[i * 3 + 2]; bin.n++; bins.set(key, bin);
  }
  const need = .5 / (scale * scale); // a sprite pixel is opaque when at least half of its source pixels are
  return [...bins.values()].filter(b => b.n >= need).map(b => ({ x: b.x, y: b.y, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] }));
}

// Names the video edges a frame's art runs into (top, left, right): what the video cut off there cannot be restored.
export function cutEdges(frame, size, band = 4, limit = 60) {
  const count = inside => { let n = 0; for (let i = 0; i < size * size; i++) if (inside(i % size, Math.floor(i / size)) && !isChroma(frame[i * 3], frame[i * 3 + 1], frame[i * 3 + 2])) n++; return n; };
  return [['top', (x, y) => y < band], ['left', x => x < band], ['right', x => x >= size - band]].filter(([, inside]) => count(inside) > limit).map(([side]) => side);
}

function build(specFile) {
  const spec = JSON.parse(readFileSync(specFile, 'utf8')), raw = resolve(dirname(specFile), spec.raw), rows = [], colors = [], decoded = {};
  for (const [name, a] of Object.entries(spec.anims)) {
    const clip = spec.clips[a.clip], frames = decoded[a.clip] ??= readClip(resolve(raw, clip.file), clip.size);
    let picks = a.times?.map(t => Math.round((Array.isArray(t) ? t[1] : t) * FPS));
    if (a.loop) {
      const start = Math.round(a.from * FPS), { i, j } = bestLoop(frames.slice(start, Math.round(a.to * FPS)), a.minGap ?? 6), span = j - i;
      picks = Array.from({ length: a.frames }, (_, n) => start + i + Math.round(n * span / a.frames));
      console.log(`${name}: loop ${((start + i) / FPS).toFixed(2)}s to ${((start + j) / FPS).toFixed(2)}s`);
    }
    const options = { scale: (a.scale ?? 1) * spec.height / clip.heroHeight, minArea: 40, minX: a.minX, clear: a.clear };
    const each = (value, n) => (Array.isArray(value) ? value[n] : value ?? 0); // an array gives each frame its own offset, for airborne poses
    const feet = n => [clip.feet[0] + each(a.dx, n), clip.feet[1] + each(a.dy, n)];
    const source = n => Array.isArray(a.times?.[n]) ? (decoded[a.times[n][0]] ??= readClip(resolve(raw, spec.clips[a.times[n][0]].file), clip.size))[picks[n]] : frames[picks[n]];
    picks.forEach((at, n) => { const cut = a.clear || a.minX ? [] : cutEdges(source(n), clip.size); if (cut.length) console.warn(`WARNING ${name} frame ${n} (${(at / FPS).toFixed(3)}s): art cut by the video's ${cut.join(', ')} edge; pick another frame`); });
    rows.push({ name, fps: a.fps, loop: !!a.loop, strike: a.strike ?? picks.length, windup: a.windup, cells: picks.map((at, n) => spritePixels(source(n), clip.size, { ...options, feet: feet(n) })) });
    for (const cell of rows.at(-1).cells) for (const p of cell) colors.push(p.rgb);
    console.log(`${name}: ${picks.length} frames`);
  }
  const every = rows.flatMap(r => r.cells.flat()), left = least(every, p => p.x), right = -least(every, p => -p.x), top = least(every, p => p.y), bottom = -least(every, p => -p.y);
  const w = right - left + 1, h = bottom - top + 1, cols = Math.max(...rows.map(r => r.cells.length)), sheet = Buffer.alloc(cols * w * rows.length * h * 4);
  const palette = medianCut(colors.filter((_, n) => n % 7 === 0), spec.colors), cache = new Map();
  rows.forEach((row, r) => row.cells.forEach((cell, c) => { for (const p of cell) {
    const key = p.rgb.map(v => v >> 2).join(), rgb = cache.get(key) ?? nearest(palette, p.rgb); cache.set(key, rgb);
    const at = ((r * h + p.y - top) * cols * w + c * w + p.x - left) * 4;
    sheet[at] = rgb[0]; sheet[at + 1] = rgb[1]; sheet[at + 2] = rgb[2]; sheet[at + 3] = 255;
  } }));
  const out = resolve(dirname(specFile), spec.out), png = resolve(out, `${spec.name}.png`); mkdirSync(out, { recursive: true });
  ffmpeg(['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${cols * w}x${rows.length * h}`, '-i', '-', '-frames:v', '1', png], sheet);
  const sounds = Object.entries(spec.sfx ?? {}).map(([name, s]) => {
    const fade = Math.min(.02, (s.to - s.from) / 4);
    ffmpeg(['-v', 'error', '-y', '-ss', String(s.from), '-to', String(s.to), '-i', resolve(raw, spec.clips[s.clip].file), '-vn', '-ac', '1', '-af', `afade=t=in:d=0.004,afade=t=out:st=${(s.to - s.from - fade).toFixed(3)}:d=${fade},dynaudnorm=f=100:g=5`, '-b:a', '64k', resolve(out, `sfx-${name}.m4a`)]);
    return name;
  });
  const meta = { src: `assets/${spec.name}.png`, cell: [w, h], origin: [-left, -top], anims: Object.fromEntries(rows.map((r, n) => [r.name, { row: n, frames: r.cells.length, fps: r.fps, loop: r.loop, strike: r.strike, windup: r.windup }])), sfx: sounds };
  writeFileSync(resolve(out, `${spec.name}-sheet.js`), `// Generated by tools/video-to-assets.mjs. Do not edit.\nexport default ${JSON.stringify(meta)};\n`);
  console.log(`${png}: ${cols * w}x${rows.length * h}, cell ${w}x${h}, origin ${-left},${-top}, ${sounds.length} sounds`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build(process.argv[2]);
