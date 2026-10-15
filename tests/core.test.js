import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLOOR, RELICS, STAGES } from '../core.js';

function arena(seed = 42) {
  const events = [];
  const game = new Game(event => events.push(event), seed);
  game.start();
  game.enemies = [];
  game.platforms = [];
  game.player.invulnerable = 0;
  return { game, player: game.player, events };
}

function enemy(game, x, { y = FLOOR, hp = 500, type = 'skeleton' } = {}) {
  game.spawnEnemy(type, x, game.stage);
  const target = game.enemies.at(-1);
  Object.assign(target, { hp, maxHp: hp, y });
  return target;
}

function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds; time += 1 / 120) game.update(1 / 120, input);
}

test('a run requires all five cleared stages and one current relic choice between stages', () => {
  const events = [];
  const game = new Game(event => events.push(event), 123);
  assert.equal(STAGES.length, 5);
  assert.equal(game.chooseRelic('edge'), false);
  game.start();

  for (let stage = 0; stage < 5; stage++) {
    assert.equal(game.stage, stage);
    assert.equal(game.portalOpen, false);
    assert.equal(game.enemies.some(e => e.type === 'boss'), stage === 4);

    game.player.x = game.portalX;
    game.update(1 / 60);
    assert.equal(game.state, 'playing', 'the exit stays locked while enemies survive');

    for (const target of game.enemies) game.damageEnemy(target, target.hp, 1, false, false);
    advance(game, .2);

    if (stage === 4) {
      assert.equal(game.state, 'won');
      assert.equal(game.chooseRelic('edge'), false);
      break;
    }

    assert.equal(game.state, 'upgrade');
    assert.equal(game.choices.length, 3);
    assert.equal(new Set(game.choices.map(relic => relic.id)).size, 3);
    assert.equal(game.chooseRelic('missing-relic'), false);
    const unavailable = RELICS.find(relic => !game.choices.includes(relic));
    assert.equal(game.chooseRelic(unavailable.id), false, 'unoffered relics cannot be selected');
    assert.equal(game.stage, stage);

    const selected = game.choices[0].id;
    assert.equal(game.chooseRelic(selected), true);
    assert.equal(game.relics.at(-1), selected);
    assert.equal(game.state, 'playing');
    assert.equal(game.stage, stage + 1);
    assert.equal(game.chooseRelic(selected), false, 'a double tap cannot skip another stage');
  }

  assert.equal(game.relics.length, 4);
  assert.equal(events.filter(event => event.type === 'clear').length, 5);
  assert.equal(events.filter(event => event.type === 'win').length, 1);
});

test('later stages increase regular enemy health and damage, and the final stage adds a boss', () => {
  const game = new Game(() => {}, 77);
  let previousHealth = 0;
  let previousDamage = 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    game.loadStage(stage);
    game.spawnEnemy('skeleton', 600, stage);
    const target = game.enemies.at(-1);
    assert.ok(target.hp > previousHealth);
    assert.ok(target.damage > previousDamage);
    previousHealth = target.hp;
    previousDamage = target.damage;
  }
  const boss = game.enemies.find(target => target.type === 'boss');
  assert.ok(boss.hp > previousHealth * 4);
});

test('a sword swing hits each target once, then a later swing can hit again', () => {
  const { game, player, events } = arena();
  player.crit = 0;
  const target = enemy(game, player.x + 55);
  game.attack();
  const afterFirstHit = target.hp;
  assert.ok(afterFirstHit < target.maxHp);
  game.attack();
  advance(game, .2);
  assert.equal(target.hp, afterFirstHit);
  assert.equal(events.filter(event => event.type === 'hit').length, 1);

  advance(game, .2);
  target.x = player.x + 55;
  game.attack();
  assert.ok(target.hp < afterFirstHit);
  assert.equal(events.filter(event => event.type === 'hit').length, 2);
});

test('sword hits respect facing, horizontal reach, and vertical separation', () => {
  const { game, player } = arena();
  player.x = 500;
  player.dir = -1;
  player.crit = 0;
  const inFront = enemy(game, player.x - 70);
  const behind = enemy(game, player.x + 70);
  const farAway = enemy(game, player.x - player.reach - 40);
  const overhead = enemy(game, player.x - 50, { y: FLOOR - 160 });
  game.attack();
  assert.ok(inFront.hp < inFront.maxHp);
  for (const target of [behind, farAway, overhead]) assert.equal(target.hp, target.maxHp);
});

test('a direction pressed with attack or dash is used immediately', () => {
  const { game, player } = arena();
  player.x = 500;
  player.crit = 0;
  const left = enemy(game, player.x - 60);
  const right = enemy(game, player.x + 60);
  game.update(1 / 60, { left: true, attack: true });
  assert.ok(left.hp < left.maxHp);
  assert.equal(right.hp, right.maxHp, 'turning attack must not hit the old direction');

  const { game: dashGame, player: dashPlayer } = arena();
  const startX = dashPlayer.x;
  dashGame.update(1 / 60, { left: true, dash: true });
  assert.ok(dashPlayer.x < startX);
  dashGame.update(1 / 60, { right: true });
  assert.equal(dashPlayer.dir, -1, 'an active dash keeps its initial direction');
});

test('dash protects against contact and projectiles, then damage resumes after immunity', () => {
  const { game, player } = arena();
  game.dash();
  game.hurt(25, -1);
  assert.equal(player.hp, player.maxHp);
  game.projectiles.push({ x: player.x, y: player.y - 30, vx: 0, vy: 0, r: 9, life: 1, damage: 25 });
  game.update(1 / 120);
  assert.equal(player.hp, player.maxHp);
  const cooldown = player.dashCd;
  game.dash();
  assert.equal(player.dashCd, cooldown, 'dash cannot be repeated while cooling down');
  advance(game, .4);
  game.hurt(25, -1);
  assert.equal(player.hp, player.maxHp - 25);
});

test('double jump is limited to two jumps and landing on a raised platform restores jumps', () => {
  const { game, player, events } = arena();
  const platform = { x: player.x - 80, y: FLOOR - 90, w: 160, h: 18 };
  game.platforms = [platform];
  game.jump();
  advance(game, .12);
  game.jump();
  const secondJumpVelocity = player.vy;
  game.jump();
  assert.equal(player.vy, secondJumpVelocity);
  assert.equal(player.jumps, 2);
  assert.deepEqual(events.filter(event => event.type === 'jump').map(event => event.double), [false, true]);

  advance(game, 1.5);
  assert.equal(player.y, platform.y);
  assert.equal(player.grounded, true);
  assert.equal(player.jumps, 0);
  game.jump();
  assert.equal(player.jumps, 1);
  assert.ok(player.vy < 0);
});

test('moon magic spends mana, hits nearby enemies, and clears only nearby projectiles', () => {
  const { game, player, events } = arena();
  const nearby = enemy(game, player.x + 150);
  const distant = enemy(game, player.x + 300);
  const nearProjectile = { x: player.x + 100, y: player.y - 20 };
  const farProjectile = { x: player.x + 350, y: player.y - 20 };
  game.projectiles = [nearProjectile, farProjectile];
  const initialMana = player.mp;
  game.magic();
  assert.equal(player.mp, initialMana - player.magicCost);
  assert.ok(nearby.hp < nearby.maxHp);
  assert.equal(distant.hp, distant.maxHp);
  assert.deepEqual(game.projectiles, [farProjectile]);
  const healthAfterSpell = nearby.hp;
  game.magic();
  assert.equal(nearby.hp, healthAfterSpell, 'spell cooldown prevents repeat casting');

  player.magicCd = 0;
  player.mp = player.magicCost - 1;
  game.magic();
  assert.equal(nearby.hp, healthAfterSpell);
  assert.equal(player.mp, player.magicCost - 1);
  assert.equal(events.at(-1).type, 'noMana');
});

test('lethal damage ends the run once and subsequent updates cannot move the player', () => {
  const { game, player, events } = arena();
  game.hurt(1000, 1);
  assert.equal(player.hp, 0);
  assert.equal(game.state, 'dead');
  const deathPosition = player.x;
  advance(game, 1, { right: true, jump: true, attack: true });
  game.hurt(1000, 1);
  assert.equal(player.x, deathPosition);
  assert.equal(player.hp, 0);
  assert.equal(events.filter(event => event.type === 'death').length, 1);
  assert.equal(game.chooseRelic('vital'), false);
});

test('a pickup in the same frame as lethal damage cannot heal a defeated player', () => {
  const { game, player } = arena();
  game.projectiles = [{ x: player.x, y: player.y - 30, vx: 0, vy: 0, r: 9, life: 1, damage: 1000 }];
  game.pickups = [{ x: player.x, y: player.y - 25, age: 0 }];
  game.update(1 / 60);
  assert.equal(game.state, 'dead');
  assert.equal(player.hp, 0);
});

test('pause stops movement, enemy attacks, mana regeneration, and run time', () => {
  const { game, player } = arena();
  player.mp = 20;
  enemy(game, player.x + 30);
  game.state = 'paused';
  const before = { x: player.x, y: player.y, hp: player.hp, mp: player.mp, elapsed: game.elapsed };
  advance(game, 1, { right: true, attack: true, magic: true });
  assert.deepEqual({ x: player.x, y: player.y, hp: player.hp, mp: player.mp, elapsed: game.elapsed }, before);
});