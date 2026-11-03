// QA for #53 (situational slow motion): regression checks found by the playtest. 
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// audio.js routes every cue that is not in DRY through the slow-motion low-pass (about 900 Hz during a full slow).
const dry = new Set([...readFileSync(new URL('../audio.js', import.meta.url), 'utf8').match(/const DRY = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

test('the bat crossover cue is dry: it is the bat telegraph, and slow motion must never filter a tell (#53 QA)', () => {
  assert.ok(dry.has('batWing'), 'batWing must be in DRY');
});
