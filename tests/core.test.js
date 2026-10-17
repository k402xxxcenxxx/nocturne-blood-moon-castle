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
test('a shield bearer blocks frontal sword hits: reduced damage, player pushed back, no stun', () => {
  const { game, player, events } = arena();
  player.x = 500; player.dir = 1; player.crit = 0;
  const shield = enemy(game, player.x + 55, { type: 'shield' });
  shield.dir = -1;
  game.attack();
  const blocked = shield.maxHp - shield.hp;
  assert.ok(blocked > 0 && blocked <= Math.ceil(player.damage * .15));
  assert.equal(shield.stun, 0);
  assert.equal(player.x, 460);
  assert.equal(events.at(-1).type, 'block');
  assert.equal(events.some(event => event.type === 'hit'), false);
});

test('a shield bearer takes full damage from behind and from Eclipse, which breaks its guard for 1.5 s', () => {
  const { game, player } = arena();
  player.x = 500; player.dir = 1; player.crit = 0;
  const shield = enemy(game, player.x + 55, { type: 'shield' });
  shield.dir = 1; // facing away from the player
  game.attack();
  assert.equal(shield.maxHp - shield.hp, player.damage);
  assert.ok(shield.stun > 0);

  const { game: g2, player: p2, events: e2 } = arena();
  p2.x = 500; p2.dir = 1; p2.crit = 0;
  const guard = enemy(g2, p2.x + 55, { type: 'shield' });
  guard.dir = -1; guard.poise = guard.maxPoise = 999; // keep poise out of this guard-timer test
  g2.magic();
  assert.equal(guard.maxHp - guard.hp, Math.round(p2.magicDamage));
  assert.equal(guard.guardBreak, 1.5);
  assert.ok(e2.some(event => event.type === 'guardBreak'));
  advance(g2, .7);
  guard.x = p2.x + 55; guard.dir = -1;
  let before = guard.hp;
  g2.attack();
  assert.equal(before - guard.hp, p2.damage, 'frontal hits land in full while the guard is broken');
  advance(g2, 1);
  guard.x = p2.x + 55; guard.dir = -1; p2.dir = 1; guard.tell = 0;
  before = guard.hp;
  g2.attack();
  assert.ok(before - guard.hp < p2.damage, 'the guard recovers after 1.5 s');
});

test('a shield bash has a tell, then the bearer keeps its facing for a turn delay', () => {
  const { game, player, events } = arena();
  player.x = 500;
  const shield = enemy(game, player.x + 60, { type: 'shield' });
  shield.cd = 0;
  game.update(1 / 120);
  assert.ok(shield.tell > 0, 'the bash is announced before it lands');
  assert.equal(player.hp, player.maxHp);
  advance(game, .6);
  assert.ok(events.some(event => event.type === 'enemySwing'));
  assert.ok(player.hp < player.maxHp);
  assert.ok(shield.turn > 0);
  const facing = shield.dir;
  player.x = shield.x + 60;
  game.update(1 / 120);
  assert.equal(shield.dir, facing, 'it does not re-face the player during the turn delay');
  advance(game, .7);
  assert.equal(shield.dir, -facing);
});

test('a dash passes through a bashing shield bearer unharmed', () => {
  const { game, player } = arena();
  player.x = 500; player.dir = 1;
  const shield = enemy(game, player.x + 50, { type: 'shield' });
  shield.tell = .05;
  game.dash();
  advance(game, .2);
  assert.ok(player.x > shield.x);
  assert.equal(player.hp, player.maxHp);
});

test('shield bearers appear from stage 2 and never in stage 1', () => {
  const game = new Game(() => {}, 9);
  const types = stage => { game.loadStage(stage); return game.enemies.map(e => e.type); };
  assert.equal(types(0).includes('shield'), false);
  let seen = false;
  for (let i = 0; i < 20 && !seen; i++) seen = types(1 + i % 4).includes('shield');
  assert.ok(seen);
});

test('spearmen appear from stage 2 and never in stage 1', () => {
  const types = (seed, stage) => { const g = new Game(() => {}, seed); g.loadStage(stage); return g.enemies.map(e => e.type); };
  let seen = false;
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(types(seed, 0).includes('spear'), false);
    for (let s = 1; s < 5; s++) seen = seen || types(seed, s).includes('spear');
  }
  assert.ok(seen);
});

test('a shield bearer cannot be beaten head-on by standing still and attacking (it gets to bash)', () => {
  // QA #2: in open floor, block pushback (40) plus reach (100) keeps the player outside bash range (70).
  const { game, player, events } = arena();
  Object.assign(player, { x: 900, dir: 1 }); // room to be pushed back, away from the wall
  const shield = enemy(game, player.x + 80, { type: 'shield', hp: 60 });
  shield.cd = 0;
  for (let time = 0; time < 20 && shield.hp > 0; time += 1 / 120) game.update(1 / 120, { attack: true });
  assert.ok(events.some(e => e.type === 'enemySwing'), 'the bearer bashes at least once before dying to frontal hits');
});

test('a blocked hit shoves the shield bearer forward with the player, never closer than 30', () => {
  const { game, player } = arena();
  player.x = 500; player.dir = 1; player.crit = 0;
  const shield = enemy(game, player.x + 55, { type: 'shield' });
  shield.dir = -1;
  game.attack();
  assert.equal(player.x, 460);
  assert.equal(shield.x, 515, 'it steps forward up to 40');

  const { game: g2, player: p2 } = arena();
  p2.x = 500; p2.dir = 1;
  const close = enemy(g2, p2.x + 20, { type: 'shield' });
  close.dir = -1;
  g2.attack();
  assert.equal(close.x - p2.x, 30, 'the shove stops 30 from the player');
});

test('a shield bearer keeps its facing during the bash warning, and the bash whiffs behind it', () => {
  const { game, player } = arena();
  player.x = 500;
  const shield = enemy(game, player.x + 60, { type: 'shield' });
  shield.cd = 0;
  game.update(1 / 120);
  assert.ok(shield.tell > 0);
  const facing = shield.dir;
  player.x = shield.x + 40; // crossed behind it during the wind-up
  advance(game, .6);
  assert.equal(shield.dir, facing, 'facing is locked during the warning');
  assert.ok(shield.turn > 0, 'the bash went off');
  assert.equal(player.hp, player.maxHp, 'the bash only hits its front');
});

test('a player behind a shield bearer gets a 0.25 s re-face delay before it turns', () => {
  const { game, player } = arena();
  player.x = 500;
  const shield = enemy(game, player.x + 200, { type: 'shield' });
  shield.dir = 1; // facing away from the player
  const x = shield.x;
  advance(game, .2);
  assert.equal(shield.dir, 1, 'it has not turned yet');
  assert.equal(shield.x, x, 'it stands still while turning');
  advance(game, .1);
  assert.equal(shield.dir, -1);
});

// Known gap (QA rework 2, P3): todo so it documents the rule without blocking CI; drop `todo` once fixed.
test('a shield bearer whose turn delay ends while stunned faces the player at once, with no re-face delay', { todo: 'turn delay expiring during stun falls back to the 0.25 s re-face' }, () => {
  const { game, player } = arena();
  player.x = 500;
  const shield = enemy(game, player.x - 100, { type: 'shield' });
  Object.assign(shield, { dir: -1, turn: .1, stun: .3 }); // player is behind it
  advance(game, .3 + 1 / 60);
  assert.equal(shield.dir, 1);
});

test('wind-ups are capped per stage and never start from far away', () => {
  for (const [stage, cap] of [[0, 2], [3, 3]]) {
    const { game, player } = arena();
    game.stage = stage;
    player.x = 500;
    const list = Array.from({ length: 8 }, (_, i) => enemy(game, 520 + i * 6));
    list.forEach(e => { e.cd = 0; });
    let max = 0;
    for (let t = 0; t < 120; t++) {
      game.update(1 / 120);
      max = Math.max(max, game.enemies.filter(e => e.tell > 0).length);
      player.hp = player.maxHp;
    }
    assert.equal(max, cap);
  }
  const { game, player } = arena();
  player.x = 500;
  assert.equal(game.canWindUp(enemy(game, 500 + 570)), false);
  assert.equal(game.canWindUp(enemy(game, 500 + 600, { type: 'boss', hp: 500 })), true);
});

test('spearman thrusts a long box, locks facing, recovers, and keeps its spacing', () => {
  const { game, player } = arena();
  const e = enemy(game, 500, { type: 'spear' });
  Object.assign(player, { x: 320, y: FLOOR }); e.cd = 0; e.dir = -1;
  game.update(1 / 120, {});
  assert.ok(e.tell > 0 && e.thrustBox);
  assert.deepEqual([e.thrustBox.x, e.thrustBox.w, e.thrustBox.h, e.thrustBox.y], [500 - 194, 184, 54, FLOOR - 54]);
  player.x = 800; advance(game, .3); assert.equal(e.dir, -1); // facing locked while the hero passes behind
  player.x = 340; const hp = player.hp; advance(game, .4);
  assert.ok(player.hp < hp, 'hero inside the box is hit');
  assert.ok(e.turn > 0 && e.tell <= 0);
  e.cd = 0; const x = e.x; advance(game, .5);
  assert.ok(e.tell <= 0); assert.equal(e.x, x); // recovery: no warning, no movement
  advance(game, .3); assert.ok(e.tell > 0);
});

test('spearman thrust misses a hero above or behind the box', () => {
  for (const [px, py] of [[330, FLOOR - 70], [700, FLOOR]]) {
    const { game, player } = arena();
    const e = enemy(game, 500, { type: 'spear' });
    Object.assign(player, { x: px, y: py, grounded: false, vy: 0 }); e.cd = 0; e.dir = -1;
    e.tell = .01; e.thrustBox = { x: 306, y: FLOOR - 54, w: 184, h: 54 };
    const hp = player.hp; game.enemyAttack(e); assert.equal(player.hp, hp);
  }
});

test('spearman retreats when the hero is closer than 80', () => {
  const { game, player } = arena();
  const e = enemy(game, 500, { type: 'spear' });
  Object.assign(player, { x: 440, y: FLOOR }); e.cd = 5;
  advance(game, .3); assert.ok(e.x > 500);
});

test('priest bless buffs allies in range, not far ones or itself, and blessed allies hit harder', () => {
  const { game, player } = arena();
  player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  const near = enemy(game, 1150), far = enemy(game, 1400);
  priest.cd = 0; near.cd = far.cd = 99;
  advance(game, .1);
  assert.equal(priest.blessRadius, 250);
  advance(game, 1);
  assert.equal(priest.blessRadius, 0);
  assert.ok(near.blessed > 0);
  assert.equal(far.blessed, 0);
  assert.equal(priest.blessed, 0);
  Object.assign(near, { x: player.x + 30, tell: .01, cd: 99, dir: -1 });
  const hp = player.hp; advance(game, .05);
  assert.equal(hp - player.hp, Math.round(near.damage * 1.25 * player.armor));
});

test('hitting the priest during the bless warning cancels the bless', () => {
  const { game, player } = arena();
  player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  const ally = enemy(game, 1150); ally.cd = 99;
  advance(game, .2);
  assert.ok(priest.tell > 0 && priest.blessRadius);
  game.damageEnemy(priest, 1, 1, false, false);
  assert.equal(priest.blessRadius, 0);
  advance(game, 1);
  assert.equal(ally.blessed, 0);
});

test('a cancelled bless puts the priest on a bless cooldown', () => {
  const { game, player } = arena();
  player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  const ally = enemy(game, 1150); ally.cd = 99;
  advance(game, .2);
  assert.ok(priest.blessRadius);
  game.damageEnemy(priest, 1, 1, false, false);
  assert.ok(priest.blessCd > 2);
  advance(game, .5);
  assert.equal(priest.blessRadius, 0);
});

test('priest without allies fires a bolt', () => {
  const { game, player } = arena();
  player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  priest.cd = 0;
  advance(game, 1.2);
  assert.equal(game.projectiles.length, 1);
});

test('priests never spawn on stages 0 and 1', () => {
  for (let seed = 1; seed <= 30; seed++) for (const stage of [0, 1]) {
    const game = new Game(() => {}, seed); game.start(); game.loadStage(stage);
    assert.ok(!game.enemies.some(e => e.type === 'priest'));
  }
});

test('a priest bless warning counts down while the hero is out of range', () => {
  const { game, player } = arena();
  player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  const ally = enemy(game, 1150); ally.cd = 99;
  priest.cd = 0;
  advance(game, .05);
  assert.ok(priest.blessRadius > 0 && priest.tell > 0);
  const before = priest.tell;
  player.x = 60; // 940 px away: beyond the idle range, the warning must still tick down
  advance(game, .5);
  assert.ok(priest.tell < before - .4, `tell stayed at ${priest.tell.toFixed(2)}`);
});

test('a priest blocked by the wind-up limiter fires neither a bless nor a bolt', () => {
  const { game, player } = arena();
  game.stage = 2; player.x = 600;
  const priest = enemy(game, 1000, { type: 'priest' });
  const ally = enemy(game, 1150); ally.cd = 99;
  priest.cd = 0;
  for (const x of [700, 650]) { const mage = enemy(game, x, { type: 'mage' }); mage.tell = 5; mage.cd = 99; }
  advance(game, .3);
  assert.equal(priest.tell, 0);
  assert.equal(priest.blessRadius, 0);
  assert.equal(game.projectiles.length, 0);
});

test('poise: one full combo breaks a skeleton, stagger stuns 1 s and refills poise', () => {
  const { game, player, events } = arena();
  const e = enemy(game, 100 + 40);
  player.x = 100; player.dir = 1;
  const swing = () => { player.attackCd = 0; game.attack(); };
  swing(); swing(); swing();
  assert.equal(events.filter(ev => ev.type === 'stagger').length, 1);
  assert.equal(e.poise, e.maxPoise);
  assert.ok(e.stun >= .99 && e.stun <= 1);
  assert.ok(game.freeze >= .055, 'stagger hit-stop');
});

test('poise: combo hit 3 uses a 1.8 damage multiplier', () => {
  const { game, player } = arena();
  const e = enemy(game, 140);
  player.x = 100; player.dir = 1; player.crit = 0;
  player.attackCd = 0; game.attack(); player.attackCd = 0; game.attack(); player.attackCd = 0; game.attack();
  assert.equal(e.hp, 500 - Math.round(player.damage) - Math.round(player.damage * 1.15) - Math.round(player.damage * 1.8));
});

test('poise: light hits keep a knight tell, a break cancels it', () => {
  const { game, player } = arena();
  const e = enemy(game, 140, { type: 'knight' });
  player.x = 100; player.dir = 1; player.crit = 0;
  e.tell = .5; e.cd = 5;
  game.damageEnemy(e, 1, 1, false, false, false, 17);
  assert.ok(e.tell > 0 && e.stun === 0);
  game.damageEnemy(e, 1, 1, false, false, false, 110);
  assert.equal(e.tell, 0);
  assert.ok(e.stun > 0);
});

test('poise: a staggered shield bearer drops its guard', () => {
  const { game, player } = arena();
  const e = enemy(game, 140, { type: 'shield' });
  player.x = 100; player.dir = 1; e.dir = -1;
  game.damageEnemy(e, 1, 1, false, false, true, 17);
  assert.equal(e.poise, e.maxPoise - 17 * .25);
  e.poise = 1;
  game.damageEnemy(e, 1, 1, false, false, true, 17);
  assert.ok(e.guardBreak >= .99);
  assert.equal(e.poise, e.maxPoise);
});

test('poise: damage doubles during the boss cleave wind-up', () => {
  const { game, player } = arena();
  const b = enemy(game, 140, { type: 'boss' });
  player.x = 100;
  game.damageEnemy(b, 1, 1, false, false, false, 17);
  assert.equal(b.poise, b.maxPoise - 17);
  b.poise = b.maxPoise; b.tell = .5; b.punishable = true;
  game.damageEnemy(b, 1, 1, false, false, false, 17);
  assert.equal(b.poise, b.maxPoise - 34);
  assert.ok(b.tell > 0);
});

test('poise: a light hit during a stagger stun does not shorten the 1 s stun', () => {
  const { game, player } = arena();
  const e = enemy(game, 140);
  player.x = 100; player.dir = 1;
  e.poise = 1;
  game.damageEnemy(e, 1, 1, false, false, false, 17);
  assert.ok(e.stun >= .99);
  advance(game, .3);
  const remaining = e.stun;
  game.damageEnemy(e, 1, 1, false, false, false, 17);
  assert.ok(e.stun >= remaining, `stun dropped from ${remaining.toFixed(2)} to ${e.stun.toFixed(2)}`);
});

test('poise: after a stagger the enemy takes damage but no poise damage, flinch or knockback for 1.2 s', () => {
  const { game, player } = arena();
  const e = enemy(game, 140);
  player.x = 100; player.dir = 1;
  e.poise = 1;
  game.damageEnemy(e, 1, 1, false, false, false, 17);
  advance(game, 1.05);
  game.enemies[0].stun = 0;
  assert.ok(e.armor > 0);
  e.tell = .5; e.vx = 0;
  game.damageEnemy(e, 5, 1, false, true, false, 62);
  assert.equal(e.hp, 500 - 1 - 5);
  assert.equal(e.poise, e.maxPoise);
  assert.ok(e.tell > 0 && e.stun === 0 && e.vx === 0);
  game.damageEnemy(e, 1, 1, false, false, false, 17, true);
  assert.equal(e.tell, 0);
  assert.ok(e.stun > 0, 'Eclipse still interrupts');
  advance(game, 1.4);
  assert.equal(e.armor, 0);
});

test('poise: a skeleton under a 0.9 s tap rhythm still lands swings', () => {
  const { game, player } = arena();
  player.x = 300; player.invulnerable = 0;
  const e = enemy(game, 340);
  let hits = 0, last = player.hp;
  for (let t = 0; t < 12; t += .9) {
    player.attackCd = 0; player.dir = 1; game.attack();
    for (let s = 0; s < .9; s += 1 / 120) {
      e.hp = e.maxHp; player.hp = player.maxHp; player.x = 300; game.update(1 / 120, {});
      if (player.hp < last) hits++;
      last = player.hp;
    }
  }
  assert.ok(hits >= 2, `landed ${hits}`);
});

test('poise: a knight keeping its warning still takes 40% knockback', () => {
  const { game, player } = arena();
  const e = enemy(game, 140, { type: 'knight' });
  player.x = 100; e.tell = .5; e.vx = 0;
  game.damageEnemy(e, 1, 1, false, false, false, 17);
  assert.ok(e.tell > 0 && e.stun === 0);
  assert.equal(e.vx, player.knockback * .4);
  assert.equal(e.maxPoise, 110);
});

test('dash thrust: only within 0.65 s after a dash, longer reach, does not touch the combo', () => {
  const { game, player, events } = arena();
  player.crit = 0; player.x = 300; player.dir = 1;
  const far = enemy(game, 300 + 140);
  game.attack();
  assert.equal(far.hp, far.maxHp, 'a plain swing does not reach 140');
  assert.equal(events.findLast(e => e.type === 'swing').move, 'combo');
  advance(game, 1);
  player.combo = 2; player.comboWindow = 5; game.hitSet = new Set();
  game.dash(); advance(game, .18 + .6);
  player.x = 300; far.x = 440; far.cd = 99; far.stun = 0;
  game.attack();
  assert.equal(events.findLast(e => e.type === 'swing').move, 'thrust');
  assert.ok(far.hp < far.maxHp, 'thrust reaches 140');
  assert.equal(player.combo, 2, 'combo is not advanced');
  assert.ok(player.comboWindow > 0, 'combo window is not reset');
  advance(game, 1);
  player.x = 300; player.dir = 1; game.dash(); advance(game, .18 + .7);
  game.attack();
  assert.equal(events.findLast(e => e.type === 'swing').move, 'combo', 'window expired');
});

test('dash thrust: shield bearer blocks it from the front', () => {
  const { game, player } = arena();
  player.crit = 0; player.x = 300; player.dir = 1;
  const s = enemy(game, 380, { type: 'shield' });
  s.dir = -1; player.thrustWindow = .5;
  game.attack();
  assert.ok(s.hp > s.maxHp - 10, 'blocked damage is reduced');
});

test('perfect dodge: once per dash, grants MP, refreshes the thrust window, only in the first 0.15 s', () => {
  const { game, player, events } = arena();
  player.mp = 20;
  game.dash();
  game.hurt(10, 1); game.hurt(10, 1);
  assert.equal(player.hp, player.maxHp);
  assert.equal(events.filter(e => e.type === 'perfectDash').length, 1);
  assert.ok(player.mp >= 30 && player.mp < 31);
  assert.ok(player.thrustWindow >= .9);
  assert.ok(game.freeze >= .05, 'perfect dodge hit-stop');
  const late = arena().game;
  late.dash(); advance(late, .16);
  late.hurt(10, 1);
  assert.equal(late.player.hp, late.player.maxHp, 'still invulnerable');
  assert.equal(late.player.perfectUsed, false, 'no perfect dodge after 0.15 s');
});

test('perfect dodge: a projectile during the window counts', () => {
  const { game, player, events } = arena();
  game.dash();
  game.projectiles.push({ x: player.x, y: player.y - 30, vx: 0, vy: 0, r: 9, life: 1, damage: 25 });
  game.update(1 / 120);
  assert.equal(events.filter(e => e.type === 'perfectDash').length, 1);
});

test('input buffer: an attack pressed during cooldown fires when allowed, and a thrust pressed in a dash fires after it', () => {
  const { game, player, events } = arena();
  game.attack();
  advance(game, .2);
  game.attack(); // pressed while cooling down
  const swings = () => events.filter(e => e.type === 'swing').length;
  assert.equal(swings(), 1);
  advance(game, .12);
  assert.equal(swings(), 2, 'buffered attack fired');
  advance(game, 1);
  game.attack(); advance(game, .5); // let it finish
  player.attackCd = 0; player.attack = 0;
  game.dash(); game.attack();
  const before = swings();
  advance(game, .3);
  assert.equal(swings(), before + 1);
  assert.equal(events.findLast(e => e.type === 'swing').move, 'thrust');
});

test('input buffer: expires after 0.16 s', () => {
  const { game, player, events } = arena();
  player.attackCd = .5; game.attack();
  advance(game, .6);
  assert.equal(events.filter(e => e.type === 'swing').length, 0);
});

test('dash cannot cancel an attack before 74% of it has played', () => {
  const { game, player } = arena();
  game.attack();
  game.dash();
  assert.equal(player.dash, 0);
  advance(game, .24 * .75);
  game.dash();
  assert.ok(player.dash > 0);
});

test('relic dash stacks thrust damage and perfect-dodge MP', () => {
  const { game, player } = arena();
  const dash = RELICS.find(r => r.id === 'dash');
  dash.apply(player);
  assert.ok(Math.abs(player.thrustMul - 1.7) < 1e-9);
  assert.equal(player.perfectMp, 18);
  for (let i = 0; i < 20; i++) dash.apply(player);
  assert.ok(player.thrustMul <= 2.4 && player.perfectMp <= 30);
});

test('poise: blocked hits deal 25% poise damage', () => {
  const { game, player } = arena();
  player.crit = 0; player.x = 300; player.dir = 1;
  const s = enemy(game, 340, { type: 'shield' }); s.dir = -1;
  game.attack();
  assert.equal(s.poise, s.maxPoise - 17 * .25);
});

test('poise: the boss refills poise when it drops below half health', () => {
  const { game } = arena();
  const b = enemy(game, 500, { type: 'boss', hp: 640 });
  b.poise = 10;
  game.damageEnemy(b, 330, 1, false, false, false, 5);
  assert.equal(b.poise, b.maxPoise);
});

test('poise: Eclipse still cancels a non-boss warning on an armored enemy', () => {
  const { game, player } = arena();
  const k = enemy(game, player.x + 60, { type: 'knight' });
  k.armor = 1; k.tell = .5;
  game.damageEnemy(k, 5, 1, false, true, false, 55, true);
  assert.equal(k.tell, 0);
  assert.ok(k.stun > 0);
});

// QA (Issue #11 playtest): the three tests below fail on purpose until the engineer fixes the rule.
test('dash never shortens invulnerability from an earlier hit', () => {
  const { game, player } = arena();
  game.hurt(10, 1); // 0.8 s of immunity
  advance(game, .1);
  game.dash();
  assert.ok(player.invulnerable >= .6, `dash cut immunity to ${player.invulnerable.toFixed(2)} s`);
});

test('perfect dodge pays only for a hit that the dash itself stopped', () => {
  const { game, player, events } = arena();
  game.hurt(10, 1); // earlier hit: immunity without any dash
  advance(game, .1);
  player.mp = 20;
  game.dash();
  game.hurt(10, 1); // would have been ignored anyway
  assert.equal(events.filter(e => e.type === 'perfectDash').length, 0);
  assert.equal(player.mp, 20);
  // partial overlap: earlier immunity is shorter than the dash's 0.23 s but still running
  const { game: g2, player: p2, events: e2 } = arena();
  g2.hurt(10, 1);
  advance(g2, .7); // leaves ~0.10 s of immunity
  p2.mp = 20;
  g2.dash();
  g2.hurt(10, 1);
  assert.equal(e2.filter(e => e.type === 'perfectDash').length, 0);
  assert.equal(p2.mp, 20);
});

test('a buffered dash does not carry into the next stage', () => {
  const { game, player } = arena();
  player.dashCd = 1;
  game.dash();
  assert.ok(player.dashBuf > 0);
  game.loadStage(1);
  assert.equal(player.dashBuf, 0);
  assert.equal(player.otherInv, 0);
});

test('a projectile that meets a dashing hero is consumed and cannot hit after the dash', () => {
  const { game, player } = arena();
  player.x = 300;
  player.dir = -1;
  game.projectiles.push({ x: player.x - 30, y: player.y - 30, vx: -250, vy: 0, r: 7, life: 4, damage: 25 });
  game.dash();
  advance(game, .6);
  assert.equal(player.hp, player.maxHp, 'the shot hit the hero from behind after the dash');
});

test('a dash pressed too early is buffered for 0.16 s and fires when allowed', () => {
  const { game, player, events } = arena();
  game.attack();
  advance(game, .1);
  game.dash();
  assert.equal(player.dash, 0);
  advance(game, .1);
  assert.equal(events.filter(e => e.type === 'dash').length, 1, 'buffered dash fired');
  const { game: g2, player: p2 } = arena();
  p2.dashCd = .5; g2.dash();
  advance(g2, .4);
  assert.equal(p2.dash, 0, 'buffer expired');
});

test('a thrust faces the nearest living enemy within 200 when no direction is held', () => {
  const { game, player } = arena();
  player.x = 400; player.dir = 1; player.thrustWindow = .5;
  enemy(game, 700);
  enemy(game, 330);
  enemy(game, 250, { hp: 0 });
  game.attack();
  assert.equal(player.dir, -1);
});

test('dash cooldown never drops below 0.35 s', () => {
  const { player } = arena();
  const dash = RELICS.find(r => r.id === 'dash');
  for (let i = 0; i < 20; i++) dash.apply(player);
  assert.equal(player.dashCooldown, .35);
});
