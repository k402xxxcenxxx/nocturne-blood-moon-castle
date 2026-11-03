import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, createSpectacle, resetFloor, rowOf, crisisOf, curve, scaleAt, kAt, stepSlow, SPEC } from '../spectacle.js';

const calm = { castle: true, blood: 160, frenzyAgo: 99, others: 0 };
const ev = (type, extra = {}, ctx = calm, threat = Infinity) => ({ type, ctx, threat, ...extra });
const always = () => 0, never = () => .999;

test('triggers map to rows; blocked hits, parries, kills, hits taken and ripostes are never triggers', () => {
  assert.equal(rowOf({ type: 'stagger', cancelled: true }), 'breakCancel'); assert.equal(rowOf({ type: 'stagger', cancelled: false }), 'break'); assert.equal(rowOf({ type: 'stagger', boss: true }), 'bossBreak');
  assert.equal(rowOf({ type: 'armorBreak' }), 'bossBreak'); for (const t of ['bossPhase', 'wardenPhase', 'kingPhase']) assert.equal(rowOf({ type: t }), 'bossPhase');
  assert.equal(rowOf({ type: 'interrupt', heavy: true }), 'interruptHeavy'); assert.equal(rowOf({ type: 'interrupt', heavy: false }), 'interruptLight');
  assert.equal(rowOf({ type: 'perfectDash', heavy: true }), 'dodgeHeavy'); assert.equal(rowOf({ type: 'perfectDash', heavy: false }), 'dodgeLight'); assert.equal(rowOf({ type: 'guardBreak' }), 'guardBreak');
  for (const t of ['hit', 'parry', 'apexGuard', 'kill', 'hurt', 'riposte', 'trapActive', 'obstacleHit']) assert.equal(rowOf({ type: t }), null, t);
  assert.equal(decide(createSpectacle(), ev('hit'), 0, always), null);
});

test('boss moments are always full, ignore the budget and the cooldown, and still empty the budget', () => {
  const s = createSpectacle(); s.b = 0; s.endsAt = 100;
  for (const type of ['armorBreak', 'wardenPhase', 'kingPhase', 'bossPhase']) { const r = decide(s, ev(type), 10, never); assert.equal(r.kind, 'full', type); assert.equal(r.boss, true); s.endsAt = 100; }
  const t = createSpectacle(); decide(t, ev('stagger', { boss: true }), 5, never); assert.equal(t.b, 0);
});

test('never two full slow motions inside the cooldown (2.5 s, 1.5 s in crisis); the second is an accent', () => {
  const s = createSpectacle(); const a = decide(s, ev('stagger', { cancelled: true }), 0, always); assert.equal(a.kind, 'full');
  s.b = 1; const end = s.endsAt; assert.equal(decide(s, ev('stagger', { cancelled: true }), end + 2.4, always).reason, 'cooldown');
  s.b = 1; assert.equal(decide(s, ev('stagger', { cancelled: true }), end + 2.6, always).kind, 'full');
  const c = createSpectacle(), low = { castle: true, blood: 30, frenzyAgo: 99, others: 0 }; decide(c, ev('stagger', { cancelled: true }, low), 0, always); c.b = 1;
  assert.equal(decide(c, ev('stagger', { cancelled: true }, low), c.endsAt + 1.4, always).reason, 'cooldown'); c.b = 1; assert.equal(decide(c, ev('stagger', { cancelled: true }, low), c.endsAt + 1.6, always).kind, 'full');
});

test('the final chance scales with b squared, repeats are halved, a first of the floor is x1.5, the cap is 0.95', () => {
  const at = (b, row, rnd, ctx = calm, setup = s => {}) => { const s = createSpectacle(); s.b = b; s.t = 50; setup(s); return decide(s, ev(row, row === 'perfectDash' ? { heavy: true } : {}, ctx), 50, () => rnd).kind; };
  // dodgeHeavy weight .5, first of the floor x1.5 = .75 at b = 1; at b = .5 it is .75 * .25 = .1875
  assert.equal(at(1, 'perfectDash', .74), 'full'); assert.equal(at(1, 'perfectDash', .76), 'accent');
  assert.equal(at(.5, 'perfectDash', .18), 'full'); assert.equal(at(.5, 'perfectDash', .2), 'accent');
  const seen = s => s.seen.add('dodgeHeavy'); // not the first of the floor: weight .5
  assert.equal(at(1, 'perfectDash', .49, calm, seen), 'full'); assert.equal(at(1, 'perfectDash', .51, calm, seen), 'accent');
  const repeat = s => { s.seen.add('dodgeHeavy'); s.lastRow = 'dodgeHeavy'; }; // the same row as the last full one: x0.5
  assert.equal(at(1, 'perfectDash', .24, calm, repeat), 'full'); assert.equal(at(1, 'perfectDash', .26, calm, repeat), 'accent');
  const crisis = { castle: true, blood: 30, frenzyAgo: 1, others: 5, last: true, boss: true }; assert.equal(at(1, 'perfectDash', .94, crisis), 'full'); assert.equal(at(1, 'perfectDash', .96, crisis), 'accent', 'capped at 0.95');
});

test('crisis multipliers stack: blood 100 x1.5, blood 40 x2 (replaces it), last enemy x1.5, 3 others x1.4, frenzy just ended x1.3, boss fight x1.3; normal runs use HP', () => {
  const m = ctx => crisisOf(ctx).mult;
  assert.equal(m(calm), 1); assert.equal(m({ castle: true, blood: 100, frenzyAgo: 99 }), 1.5); assert.equal(m({ castle: true, blood: 40, frenzyAgo: 99 }), 2);
  assert.equal(m({ castle: true, blood: 160, last: true, frenzyAgo: 99 }), 1.5); assert.equal(m({ castle: true, blood: 160, others: 3, frenzyAgo: 99 }), 1.4); assert.equal(m({ castle: true, blood: 160, frenzyAgo: 2 }), 1.3); assert.equal(m({ castle: true, blood: 160, boss: true, frenzyAgo: 99 }), 1.3);
  assert.ok(Math.abs(m({ castle: true, blood: 60, others: 3, frenzyAgo: 99 }) - 1.5 * 1.4) < 1e-9); assert.equal(m({ castle: false, hp: 30, maxHp: 100, frenzyAgo: 99 }), 2); assert.equal(m({ castle: false, hp: 31, maxHp: 100, frenzyAgo: 99 }), 1);
  assert.equal(crisisOf(calm).crisis, false); assert.equal(crisisOf({ ...calm, blood: 80 }).crisis, true);
});

test('the budget refills 0 -> 1 over 12 s (7 s in crisis) and a new floor starts full', () => {
  const s = createSpectacle(); s.b = 0; s.t = 0; decide(s, ev('stagger', { cancelled: true }), 6, never); assert.ok(Math.abs(s.b - .5) < 1e-9);
  const c = createSpectacle(); c.b = 0; c.t = 0; decide(c, ev('stagger', { cancelled: true }, { castle: true, blood: 30, frenzyAgo: 99 }), 7, never); assert.equal(c.b, 1);
  resetFloor(s, 9); assert.equal(s.b, 1); assert.equal(s.seen.size, 0);
});

test('a threat inside 0.15 s makes it an accent and spends nothing; a short threat compresses the curve; no curve is longer than 0.8 s real', () => {
  const s = createSpectacle(); const r = decide(s, ev('stagger', { cancelled: true }, calm, .1), 0, always); assert.deepEqual([r.kind, r.reason, s.b, s.endsAt], ['accent', 'threat', 1, -Infinity]);
  const boss = decide(createSpectacle(), ev('wardenPhase', {}, calm, .1), 0, always); assert.equal(boss.kind, 'accent', 'the protection applies to boss moments too');
  const full = curve(false), bossC = curve(true), short = curve(false, .2); assert.ok(full.len <= SPEC.maxLen && bossC.len <= SPEC.maxLen && short.len < full.len); assert.equal(short.hold, 0);
  const ok = decide(createSpectacle(), ev('stagger', { cancelled: true }, calm, .2), 0, always); assert.equal(ok.kind, 'full'); assert.equal(ok.curve.hold, 0); assert.ok(ok.curve.len <= .8);
  assert.ok(Math.abs(full.len - .57) < 1e-9 && Math.abs(bossC.len - .75) < 1e-9);
});

test('the curve drops to the floor scale, holds, eases back to 1.0 and k follows it', () => {
  const c = curve(false);
  assert.equal(scaleAt(c, 0), .25); assert.equal(scaleAt(c, c.hold - .001), .25); assert.ok(scaleAt(c, c.hold + c.ease / 2) > .25 && scaleAt(c, c.hold + c.ease / 2) < 1); assert.equal(scaleAt(c, c.len), 1); assert.equal(scaleAt(c, 5), 1);
  assert.equal(kAt(c, 0), 1); assert.equal(kAt(c, c.len), 0); let prev = 1; for (let t = c.hold; t < c.len; t += .02) { const k = kAt(c, t); assert.ok(k <= prev + 1e-9); prev = k; }
  assert.equal(scaleAt(curve(true), 0), .2);
});

test('decide uses only the injected random (a deterministic source gives a deterministic answer) and the state it is given', () => {
  const run = () => { const s = createSpectacle(), out = []; let n = 0; const r = () => (n = (n * 7 + 3) % 10) / 10; for (let t = 0; t < 40; t += 1.3) out.push(decide(s, ev('perfectDash', { heavy: t % 2 > 1 }), t, r).kind); return out.join(); };
  assert.equal(run(), run());
});

test('a slow motion never outlives 0.8 s real, hit-stop plays at normal speed and pauses the curve, and a threat starts the 0.08 s fast exit', () => {
  const mk = boss => ({ c: curve(boss), t: 0, real: 0, fast: false, fastT: 0, from: 1 });
  for (const boss of [false, true]) { const s = mk(boss); let real = 0, done = false; for (let i = 0; i < 400 && !done; i++) { const frozen = i % 3 === 0; const r = stepSlow(s, 1 / 60, frozen, Infinity); real += 1 / 60; assert.ok(!frozen || r.scale === 1, 'hit-stop at normal speed'); done = r.done; }
    assert.ok(done && real <= SPEC.maxLen + 1 / 60 + 1e-9, `${boss ? 'boss' : 'normal'} ended after ${real.toFixed(2)} s real, constant hit-stop included`); }
  const s = mk(false); stepSlow(s, 1 / 60, false, Infinity); const r1 = stepSlow(s, 1 / 60, false, .05); assert.equal(s.fast, true); let n = 0, r; do { r = stepSlow(s, 1 / 60, false, .05); n++; } while (!r.done && n < 30); assert.ok(n <= Math.ceil(SPEC.fastExit * 60) + 1, 'fast exit in about 0.08 s'); assert.ok(r1.scale > 0 && r1.scale <= 1);
});
