import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, RELICS, STAGES, floorScale } from '../core.js';

function endless(seed = 7) {
  const events = [], game = new Game(e => events.push(e), seed, 'endless');
  game.start(); game.chooseRelic(game.choices[0].id);
  return { game, events };
}
// Clear the current floor the way a run does: finish it, take the first offered relic.
function nextFloor(game) { game.finishStage(); game.chooseRelic(game.choices[0].id); }

test('endless floors loop through the five stages and every 5th floor is the boss', () => {
  const { game, events } = endless();
  for (let floor = 1; floor <= 12; floor++) {
    assert.equal(game.floor, floor);
    assert.equal(game.stage, (floor - 1) % 5);
    assert.equal(game.enemies.some(e => e.type === 'boss'), floor % 5 === 0);
    nextFloor(game);
  }
  assert.ok(events.some(e => e.type === 'stage' && e.floor === 6 && e.stage === 0 && e.mode === 'endless'));
});

test('clearing the boss in endless continues to a relic pick and the next floor, never won', () => {
  const { game, events } = endless();
  while (game.floor < 5) nextFloor(game);
  game.finishStage();
  assert.equal(game.state, 'upgrade');
  assert.ok(!events.some(e => e.type === 'win'));
  game.chooseRelic(game.choices[0].id);
  assert.equal(game.state, 'playing');
  assert.equal(game.floor, 6);
  assert.equal(game.stage, 0);
});

test('normal mode is unchanged: no floor scaling, boss clear wins', () => {
  const game = new Game(() => {}, 7);
  assert.equal(game.mode, 'normal');
  const hp = game.enemies[0].maxHp;
  assert.equal(new Game(() => {}, 7, 'endless').enemies[0].maxHp, hp); // floor 1 is x1.0
  game.loadStage(4); game.finishStage();
  assert.equal(game.state, 'won');
});

test('floor multipliers compound from floor 1, grow monotonically and stay finite', () => {
  assert.deepEqual(floorScale(1), { hp: 1, damage: 1 });
  let prev = floorScale(1);
  for (let f = 2; f <= 200; f++) {
    const s = floorScale(f);
    assert.ok(Number.isFinite(s.hp) && Number.isFinite(s.damage));
    assert.ok(s.hp >= prev.hp && s.damage >= prev.damage);
    prev = s;
  }
  assert.ok(floorScale(2).hp > 1.2 && floorScale(2).damage > 1.1);
  // Spawned enemies multiply the per-stage value by the floor factor.
  const a = new Game(() => {}, 1, 'endless'), b = new Game(() => {}, 1, 'endless');
  b.floor = 8;
  a.spawnEnemy('knight', 0, 2); b.spawnEnemy('knight', 0, 2);
  const [x, y] = [a.enemies.at(-1), b.enemies.at(-1)];
  assert.equal(y.maxHp, Math.round(x.maxHp * floorScale(8).hp));
  assert.ok(Math.abs(y.damage - x.damage * floorScale(8).damage) < 1e-9);
  b.floor = 200; b.spawnEnemy('boss', 0, 4);
  assert.ok(Number.isFinite(b.enemies.at(-1).maxHp) && Number.isFinite(b.enemies.at(-1).damage));
});

test('from floor 6 about 20% of regular enemies are elite and grant no reward pick; earlier floors have only the chest guard', () => {
  const count = floor => { let elites = 0, total = 0, bonus = 0; for (let seed = 1; seed <= 60; seed++) { const g = new Game(() => {}, seed, 'endless'); g.floor = floor; g.loadStage((floor - 1) % 5); for (const e of g.enemies) if (!e.required && e.type !== 'boss' && !e.chest) { total++; if (e.elite) { elites++; if (e.bonus) bonus++; } } } return { elites, total, bonus }; };
  assert.equal(count(5).elites, 0);
  const c = count(6);
  assert.ok(c.elites / c.total > .1 && c.elites / c.total < .3, `ratio ${c.elites / c.total}`);
  assert.equal(c.bonus, c.elites);
  // Killing a bonus elite does not start the reward beat; the chest guard's elite still does.
  const g = new Game(() => {}, 3, 'endless'); g.floor = 6; g.state = 'playing';
  const e = g.spawnEnemy('skeleton', 500, 0); g.makeElite(e, 0).bonus = true;
  g.damageEnemy(e, 9999, 1);
  assert.equal(g.eliteBeat, 0);
});

test('endless is deterministic for a seed', () => {
  const sig = () => { const g = new Game(() => {}, 99, 'endless'); g.floor = 9; g.loadStage(3); return JSON.stringify(g.enemies.map(e => [e.type, e.x, e.maxHp, e.elite, e.affix])); };
  assert.equal(sig(), sig());
});

test('stacking 60 relics keeps every stat finite and existing caps hold', () => {
  const { game } = endless();
  const p = game.player;
  for (let i = 0; i < 60; i++) {
    game.rollChoices('chest');
    game.choices = [RELICS[i % RELICS.length]]; // offers cap cursed copies; force-stack to stress the maths
    assert.equal(game.chooseRelic(game.choices[0].id), true);
  }
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number') assert.ok(Number.isFinite(v), k);
  assert.ok(p.crit <= .8 && p.magicCost >= 15);
  // Honest stacking of one relic far past any run length is also finite.
  for (let i = 0; i < 2000; i++) { game.rollChoices('chest'); game.choices = [RELICS[0], RELICS[5]]; game.chooseRelic(i % 2 ? 'arcane' : 'edge'); }
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number') assert.ok(Number.isFinite(v), k);
  assert.ok(p.magicCost >= 15);
});
