import test from 'node:test';
import assert from 'node:assert/strict';
import { bestLoop, isChroma, keepLargeShapes, medianCut, spritePixels } from '../tools/video-to-assets.mjs';
import { heroPose, HERO_HURT } from '../art.js';

test('the chroma key removes magenta and its fringe but keeps the cape, hair and outline', () => {
  for (const bg of [[255, 0, 255], [200, 20, 220], [150, 40, 160]]) assert.ok(isChroma(...bg), bg.join());
  for (const keep of [[170, 30, 30], [220, 225, 230], [20, 12, 22], [120, 80, 40]]) assert.ok(!isChroma(...keep), keep.join());
});

test('specks are dropped and large shapes kept', () => {
  const mask = new Uint8Array(25); mask[0] = 1; for (const i of [12, 13, 17, 18]) mask[i] = 1;
  const out = keepLargeShapes(mask, 5, 5, 4);
  assert.equal(out[0], 0); assert.equal(out[12], 1); assert.equal(out[18], 1);
});

test('shapes do not wrap around the right edge of the frame', () => {
  const mask = new Uint8Array(16); mask[3] = mask[4] = 1; // x=3,y=0 and x=0,y=1 touch only by index
  assert.equal(keepLargeShapes(mask, 4, 4, 2)[3], 0);
});

test('bestLoop finds the two frames that match', () => {
  const frame = v => new Uint8Array(64).fill(v), frames = [10, 40, 90, 200, 41, 90, 10].map(frame);
  assert.deepEqual([bestLoop(frames, 3).i, bestLoop(frames, 3).j], [0, 6]);
  assert.deepEqual([bestLoop(frames.slice(1, 6), 3).i, bestLoop(frames.slice(1, 6), 3).j], [1, 4]);
});

test('medianCut keeps distinct colors apart', () => {
  const palette = medianCut([[0, 0, 0], [2, 0, 0], [250, 0, 0], [252, 0, 0]], 2).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(palette, [[1, 0, 0], [251, 0, 0]]);
});

test('sprite pixels are placed around the feet at the requested scale', () => {
  const size = 4, frame = new Uint8Array(size * size * 3); frame.fill(255); // white square on a magenta background
  for (let i = 0; i < size * size; i++) if (i % size > 1 || i < 8) { frame[i * 3 + 1] = 0; }
  const out = spritePixels(frame, size, { scale: .5, feet: [0, 4], minArea: 1 });
  assert.deepEqual(out.map(p => [p.x, p.y]), [[0, -1]]);
});

test('hero poses follow the game state, and one-shot animations stop on their last frame', () => {
  const anims = Object.fromEntries(['idle', 'run', 'land', 'jump', 'flip', 'fall', 'dash', 'plunge', 'slash1', 'slash2', 'slash3', 'thrust', 'cast', 'hurt', 'death'].map(n => [n, { frames: 4, fps: 8, strike: 2 }]));
  const pose = (p, react) => heroPose({ grounded: true, magicCd: 0, magicCdMax: 10, ...p }, 0, react, anims);
  assert.equal(pose({}).name, 'idle');
  assert.equal(pose({ vx: 200 }).name, 'run');
  assert.equal(pose({ grounded: false, vy: -100, jumps: 1 }).name, 'jump');
  assert.equal(pose({ grounded: false, vy: -100, jumps: 2 }).name, 'flip');
  assert.equal(pose({ grounded: false, vy: 100 }).name, 'fall');
  for (const combo of [1, 2, 3]) assert.equal(pose({ attack: .1, attackLen: .24, combo }).name, `slash${combo}`);
  assert.equal(pose({ attack: .1, attackLen: .24, combo: 2, move: 'thrust' }).name, 'thrust');
  assert.equal(pose({ plunge: 2 }).name, 'plunge');
  assert.equal(pose({}, { land: .05 }).name, 'land');
  assert.deepEqual(pose({ combo: 1, attackLen: .24 }, { swing: .3 }), { name: 'slash1', frame: 2 });
  assert.equal(pose({ combo: 1, attackLen: .24, vx: 200 }, { swing: .3 }).name, 'run');
  assert.equal(pose({ dash: .1 }).name, 'dash');
  assert.equal(pose({ magicCd: 9.9 }).name, 'cast');
  assert.equal(pose({}, { hurt: .1 }).name, 'idle', 'a light hit leaves the pose alone');
  assert.equal(pose({}, { slam: .1, land: .1 }).name, 'plunge', 'a plunge holds its impact on the floor');
  assert.equal(pose({ vx: 200 }, { slam: .1 }).name, 'run', 'moving cuts the hold');
  assert.equal(pose({}, { hurt: .1, heavy: true }).name, 'hurt', 'only a heavy hit kneels');
  assert.equal(pose({ vx: 200 }, { hurt: .1, heavy: true }).name, 'run', 'moving gets the hero up');
  assert.equal(pose({ grounded: false, vy: 100 }, { hurt: .1, heavy: true }).name, 'fall', 'no kneeling in the air');
  assert.equal(pose({}, { hurt: HERO_HURT, heavy: true }).name, 'idle');
  anims.slash2 = { row: 0, frames: 8, fps: 16, strike: 6, windup: 3 };
  assert.equal(pose({ combo: 2, attack: .4, attackLen: .5, windup: .26, windupT: .13 }).frame, 1, 'wind-up frames last as long as the wind-up');
  assert.equal(pose({ combo: 2, attack: .2, attackLen: .5, windup: .26, windupT: 0 }).frame, 3, 'the strike frames follow them');
  assert.deepEqual(pose({ attack: .1, combo: 1 }, { dead: 99 }), { name: 'death', frame: 3 });
});
