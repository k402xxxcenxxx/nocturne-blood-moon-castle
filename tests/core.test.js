import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLOOR, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED } from '../core.js';

function arena(seed = 42) {
  const events = [];
  const game = new Game(event => events.push(event), seed);
  game.start();
  game.state = 'playing'; // skip the opening pick
  game.enemies = [];
  game.platforms = []; game.traps = []; game.obstacles = [];
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
  assert.equal(game.state, 'upgrade');
  assert.equal(game.chooseRelic(game.choices[0].id), true);

  for (let stage = 0; stage < 5; stage++) {
    assert.equal(game.stage, stage);
    assert.equal(game.portalOpen, false);
    assert.equal(game.enemies.some(e => e.type === 'boss'), stage === 4);

    game.player.x = game.portalX;
    game.update(1 / 60);
    assert.equal(game.state, 'playing', 'the exit stays locked while enemies survive');

    for (const target of game.enemies.filter(e => !e.elite)) game.damageEnemy(target, target.hp, 1, false, false); // the optional elite stays alive
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

  assert.equal(game.relics.length, 5, 'one opening pick plus four stage picks');
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
    const game = new Game(() => {}, seed); game.start(); game.state = 'playing'; game.loadStage(stage);
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

test('poise: damage doubles during the boss slam wind-up', () => {
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

function airborne(game, y = FLOOR - 150) { const p = game.player; p.y = y; p.vy = 0; p.grounded = false; p.jumps = 1; p.x = 400; p.dir = 1; }

test('plunge: only in the air; grounded attack stays a combo hit and the combo is untouched by a plunge', () => {
  const { game, player, events } = arena();
  game.attack();
  assert.equal(player.move, '');
  assert.equal(player.combo, 1);
  advance(game, .5);
  airborne(game); player.comboWindow = .8;
  game.attack();
  assert.equal(player.move, 'plunge');
  advance(game, 1);
  assert.equal(player.combo, 1);
  assert.equal(events.filter(e => e.type === 'plunge').length, 1);
});

test('plunge: falls through an enemy and hits it once, then the shockwave skips it and hits others', () => {
  const { game, player, events } = arena();
  player.crit = 0;
  const under = enemy(game, 400);
  const side = enemy(game, 400 + 80);
  const far = enemy(game, 400 + 120);
  const high = enemy(game, 400 - 60, { y: FLOOR - 120 });
  game.platforms = [{ x: 300, y: FLOOR - 120, w: 80, h: 18 }]; // ground enemies fall unless something holds them up
  airborne(game);
  game.attack();
  advance(game, 1);
  assert.equal(under.maxHp - under.hp, Math.round(player.damage * 1.25));
  assert.equal(side.maxHp - side.hp, player.damage);
  assert.equal(far.hp, far.maxHp, 'outside radius 90 + half width');
  assert.equal(high.hp, high.maxHp, 'above the vertical reach');
  const e = events.find(x => x.type === 'plunge');
  assert.deepEqual([e.radius, e.y], [90, FLOOR]);
  assert.equal(events.filter(x => x.type === 'hit').length, 2);
});

test('plunge: not blocked by a shield bearer facing the hero; poise 45', () => {
  const { game, player, events } = arena();
  player.crit = 0;
  const s = enemy(game, 400, { type: 'shield' }); s.dir = -1;
  const s2 = enemy(game, 450, { type: 'shield' }); s2.dir = -1;
  airborne(game); player.x = 360;
  game.attack(); advance(game, 1);
  assert.equal(events.some(x => x.type === 'block'), false);
  assert.ok(s.hp < s.maxHp && s2.hp < s2.maxHp);
  assert.equal(s2.maxPoise - s2.poise, 45);
});

test('plunge: no jump or dash during it; buffered dash fires after recovery', () => {
  const { game, player } = arena();
  airborne(game);
  game.attack();
  game.jump(); game.dash();
  assert.equal(player.dash, 0);
  assert.equal(player.jumps, 1);
  advance(game, 1);
  assert.equal(player.plunge, 0);
  assert.ok(player.grounded);
  game.jump();
  assert.equal(player.jumps, 1);
});

test('plunge: reach relic widens the shockwave up to 150, state cleared by loadStage', () => {
  const { game, player } = arena();
  const reach = RELICS.find(r => r.id === 'reach');
  reach.apply(player);
  assert.equal(player.plungeRadius, 102);
  for (let i = 0; i < 20; i++) reach.apply(player);
  assert.equal(player.plungeRadius, 150);
  airborne(game); game.attack();
  assert.equal(player.plunge, 1);
  game.loadStage(1);
  assert.deepEqual([player.plunge, player.move], [0, '']);
});

test('thrust auto-face prefers the facing side within 200, else the nearest', () => {
  const { game, player } = arena();
  player.x = 400; player.dir = 1; player.thrustWindow = .5;
  enemy(game, 590); enemy(game, 340);
  game.attack();
  assert.equal(player.dir, 1);
});

test('bat attack reaches 55 px', () => {
  const { game, player } = arena();
  const b = enemy(game, 400 + 52, { type: 'bat' });
  b.y = player.y; b.tell = .001; b.cd = 5;
  player.x = 400; player.invulnerable = 0;
  game.updateEnemy(b, 1 / 120);
  assert.ok(player.hp < player.maxHp);
});

// QA (#10): input pressed during a long fall (about 300 px, reachable from a platform with a double jump) must not vanish.
test('plunge QA: a dash tapped during a long fall (300 px) is buffered and fires on landing', () => {
  const { game, player, events } = arena();
  airborne(game, FLOOR - 300);
  game.attack();
  advance(game, .2, { dash: true }); // game.js holds an impulse tap for 200 ms
  let guard = 0;
  while (player.plunge && guard++ < 600) advance(game, 1 / 120);
  advance(game, .2);
  assert.equal(player.plunge, 0);
  assert.equal(events.filter(e => e.type === 'dash').length, 1, 'dash pressed mid-fall fires after landing');
});

test('plunge QA: an attack tapped during a long fall (300 px) is buffered and fires on landing', () => {
  const { game, events } = arena();
  airborne(game, FLOOR - 300);
  game.attack();
  advance(game, .08, { attack: true }); // a short tap, still held in game.js for a few frames
  let guard = 0;
  while (game.player.plunge && guard++ < 600) advance(game, 1 / 120);
  advance(game, .2);
  assert.ok(events.some(e => e.type === 'swing' && e.move === 'combo'), 'attack pressed mid-fall swings after landing');
});

test('plunge: a drop under 40 px still hits on the way down but emits radius 0 and no shockwave', () => {
  const { game, player, events } = arena();
  player.crit = 0;
  const under = enemy(game, 400);
  const side = enemy(game, 400 + 80);
  airborne(game, FLOOR - 20);
  game.attack();
  advance(game, 1);
  assert.equal(under.maxHp - under.hp, Math.round(player.damage * 1.25), 'fall hit still lands');
  assert.equal(side.hp, side.maxHp, 'no shockwave');
  assert.equal(events.find(x => x.type === 'plunge').radius, 0);
  assert.equal(player.plunge, 0);
});

// QA (#10 rework): the short-drop cutoff is 40 px; a plunge from exactly 40 px must still shockwave.
test('plunge QA: a plunge from 40 px up still makes a shockwave (the threshold is inclusive)', () => {
  const { game, player, events } = arena();
  const near = enemy(game, 430);
  airborne(game, FLOOR - 40);
  game.attack();
  advance(game, 1);
  assert.ok(events.find(e => e.type === 'plunge').radius > 0, 'radius is 90 at exactly 40 px');
  assert.ok(near.hp < near.maxHp, 'enemy 30 px away takes the shockwave');
});

// Fallen King (#18)
function boss(x = 500, heroX = 700) {
  const t = arena();
  const b = enemy(t.game, x, { type: 'boss', hp: 900 });
  Object.assign(t.player, { x: heroX, hp: 1e4, maxHp: 1e4 });
  b.cd = 99; b.dir = Math.sign(heroX - x) || 1;
  return { ...t, b };
}
// Starts a move, lets it fire, and reports whether the hero lost health.
function fires(game, player, b, move, tell = 1.4) {
  const hp = player.hp;
  game.bossStart(b, move);
  advance(game, tell);
  return hp - player.hp;
}

test('boss phases switch at 67% and 34% health with a 1.1 s pause and a poise refill', () => {
  const { game, events, b } = boss(500, 560);
  game.bossStart(b, 'slam'); b.poise = 10;
  game.damageEnemy(b, 100, 1, false, false, false, 0);
  assert.equal(b.bossPhase, 1);
  game.damageEnemy(b, 200, 1, false, false, false, 0); // 600/900 = 66.7%
  assert.equal(b.bossPhase, 2);
  assert.equal(events.filter(e => e.type === 'bossPhase').at(-1).phase, 2);
  assert.ok('x' in events.at(-1) || events.some(e => e.type === 'bossPhase' && 'y' in e));
  assert.equal(b.tell, 0); assert.equal(b.warn, null); assert.equal(b.poise, b.maxPoise);
  b.cd = 0; const hp = game.player.hp;
  for (let t = 0; t < 1.05; t += 1 / 120) { game.update(1 / 120); assert.equal(b.tell, 0); }
  assert.equal(game.player.hp, hp);
  advance(game, .3);
  assert.ok(b.tell > 0 || b.travel > 0 || game.player.hp < hp);
  game.damageEnemy(b, 300, 1, false, false, false, 0);
  assert.equal(b.bossPhase, 3);
  assert.ok(b.pause > 1);
});

test('boss never repeats a move twice in a row, and volley / ritual are phase gated', () => {
  const { game, b } = boss();
  for (const phase of [1, 2, 3]) for (const distance of [100, 160, 300]) {
    b.bossPhase = phase; b.lastMove = ''; b.action = 0;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      b.action = i % 3;
      const m = game.bossPick(b, distance);
      if (!(distance >= 145 && (phase === 1 || distance <= 170))) assert.notEqual(m, b.lastMove || null); // a lone legal move (charge) may repeat
      assert.ok(m, 'always picks a move');
      seen.add(m); b.lastMove = m;
    }
    assert.equal(seen.has('volley'), phase >= 2 && distance > 170);
    assert.equal(seen.has('ritual'), phase === 3);
    assert.equal(seen.has('charge'), distance >= 145);
  }
});

test('boss slash and slam hit exactly their exposed boxes', () => {
  for (const move of ['slash', 'slam']) {
    const { game, player, b } = boss(500, 700);
    game.bossStart(b, move);
    const box = b.warn.box, edge = box.x + box.w;
    assert.equal(box.w, move === 'slash' ? 146 : 112); assert.equal(box.h, move === 'slash' ? b.h : 123);
    player.x = edge + player.w / 2 + 2; // just outside
    advance(game, 1);
    assert.equal(player.hp, 1e4);
    b.recover = 0; player.invulnerable = 0;
    player.x = edge + player.w / 2 - 2; // just inside
    const dealt = fires(game, player, b, move);
    assert.equal(dealt, Math.round(22 * (move === 'slam' ? 1.3 : 1)));
  }
});

test('boss slam warning is punishable and phase 2 adds a ground wave that must be jumped', () => {
  const { game, player, b } = boss(500, 900);
  game.bossStart(b, 'slam');
  assert.equal(b.punishable, true); assert.equal(b.warn.wave, undefined);
  b.bossPhase = 2; b.warn = null; b.tell = 0; b.punishable = false;
  game.bossStart(b, 'slam');
  assert.ok(b.warn.wave); assert.equal(b.warn.wave.y1, FLOOR - 6);
  advance(game, 1.2); // wave spawned at the fire, hero 360 away
  assert.equal(game.projectiles.filter(q => q.ground).length, 1);
  assert.equal(player.hp, 1e4);
  advance(game, 1.2);
  assert.equal(player.hp, 1e4 - Math.round(22 * .7));
  // a jumping hero is passed over
  const t2 = boss(500, 900);
  t2.b.bossPhase = 2; t2.game.bossStart(t2.b, 'slam');
  for (let t = 0; t < 3; t += 1 / 120) { t2.player.y = FLOOR - 90; t2.player.vy = 0; t2.game.update(1 / 120); }
  assert.equal(t2.player.hp, 1e4);
});

test('boss charge follows its exposed line, hits once, and phase 2 adds a slash every other charge', () => {
  const { game, player, b } = boss(500, 700);
  game.bossStart(b, 'charge');
  assert.equal(b.warn.line.x2, 805); assert.equal(b.warn.box.w, 305 + b.w);
  while (b.tell > 0 || b.travel > 0 || b.move) game.update(1 / 120);
  assert.equal(b.x, 805);
  assert.equal(player.hp, 1e4 - Math.round(22 * 1.1));
  // beyond the line end the hero is safe
  const t2 = boss(500, 871);
  t2.game.bossStart(t2.b, 'charge'); advance(t2.game, 1.4);
  assert.equal(t2.player.hp, 1e4);
  // phase 2 follow-up on the second charge only
  const t3 = boss(500, 830);
  t3.b.bossPhase = 2;
  t3.game.bossStart(t3.b, 'charge'); advance(t3.game, 1.4);
  assert.notEqual(t3.b.move, 'slash');
  t3.b.x = 500; t3.b.cd = 99; t3.player.x = 830;
  t3.game.bossStart(t3.b, 'charge');
  let slash = false;
  for (let i = 0; i < 400 && !slash; i++) { t3.game.update(1 / 120); slash = t3.b.move === 'slash'; }
  assert.ok(slash); assert.ok(t3.b.tell <= .46 && t3.b.tell > .4); assert.ok(t3.b.warn.box);
});

test('boss volley fires five aimed bolts, ritual circles leave safe gaps and do not follow the hero', () => {
  const v = boss(500, 800);
  v.game.bossStart(v.b, 'volley');
  assert.equal(v.b.warn.lines.length, 5);
  advance(v.game, 1);
  assert.equal(v.game.projectiles.length, 5);

  const r = boss(500, 600);
  r.game.bossStart(r.b, 'ritual');
  const cs = r.b.warn.circles;
  assert.deepEqual(cs.map(c => c.x), [400, 600, 800]);
  assert.equal(r.b.punishable, true);
  r.player.x = 700; // centre of the gap
  advance(r.game, 1.5);
  assert.equal(r.player.hp, 1e4);

  const r2 = boss(500, 600);
  assert.equal(fires(r2.game, r2.player, r2.b, 'ritual'), Math.round(22 * 1.35));
});

// QA #18: the drawn volley lines end at 420 px, but the bolts live 4 s at speed 265, so a hero standing past 420 px is hit where nothing is drawn.
test('boss volley bolts hit only inside their warned lines (420 px)', () => {
  const near = boss(500, 800);
  near.b.bossPhase = 2;
  assert.ok(fires(near.game, near.player, near.b, 'volley', 3) > 0, 'a hero 300 px away is inside the lines');
  const far = boss(500, 940); // 440 px from the boss origin, beyond the drawn 420 px lines
  far.b.bossPhase = 2;
  far.game.bossStart(far.b, 'volley');
  while (far.b.tell > 0) far.game.update(1 / 120);
  far.b.cd = 99;
  advance(far.game, 3);
  assert.equal(far.player.hp, 1e4);
});

test('boss armor lasts 0.6 s after a stagger stun while other enemies keep 1.2 s', () => {
  const { game, player, b } = boss();
  const s = enemy(game, 900);
  for (const e of [b, s]) { e.poise = 1; game.damageEnemy(e, 1, 1, false, false, false, 17); }
  assert.ok(Math.abs(b.armor - b.stun - .6) < 1e-9);
  assert.ok(Math.abs(s.armor - s.stun - 1.2) < 1e-9);
});

test('the boss stage has two edge ledges and a flat centre', () => {
  const game = new Game(() => {}, 7);
  game.loadStage(4);
  assert.equal(game.platforms.length, 2);
  const [l, r] = game.platforms;
  assert.ok(l.x + l.w < 400 && r.x > game.worldWidth - 400 && l.y < FLOOR && r.y < FLOOR);
});

test('boss ledges need a double jump, and a hero on one is outside slash, charge, ritual and wave but not slam', () => {
  const stage = new Game(() => {}, 7); stage.loadStage(4);
  const ledge = stage.platforms[0];
  assert.ok(ledge.y === FLOOR - 110);
  const climb = n => {
    const g = new Game(() => {}, 7); g.start(); g.state = 'playing'; g.loadStage(4);
    Object.assign(g.player, { x: 150, y: FLOOR, vy: 0, grounded: true, jumps: 0 });
    g.jump();
    let top = FLOOR;
    for (let i = 0; i < 360; i++) {
      if (n === 2 && g.player.vy > 0 && g.player.jumps === 1) g.jump();
      g.update(1 / 120); top = Math.min(top, g.player.y);
    }
    return g.player.y;
  };
  assert.equal(climb(1), FLOOR, 'one jump falls back to the floor');
  assert.equal(climb(2), ledge.y, 'a double jump lands on the ledge');
  const hit = (move, phase = 1, far = 0) => {
    const t = boss(500, 150); t.game.platforms = [ledge];
    Object.assign(t.player, { y: ledge.y, grounded: true }); t.b.bossPhase = phase; t.b.x = 150 + 100 + far; t.b.dir = -1;
    t.game.bossStart(t.b, move);
    for (let i = 0; i < 400; i++) { t.player.y = ledge.y; t.player.vy = 0; t.b.cd = 99; t.game.update(1 / 120); }
    return t.player.hp < 1e4;
  };
  assert.equal(hit('slash'), false);
  assert.equal(hit('ritual', 3), false);
  assert.equal(hit('slam', 2, 450), false, 'the ground wave passes under a ledge');
  assert.equal(hit('slam', 2), true, 'slam box (123 px) still reaches a ledge');
  const c = boss(500, 150); c.game.platforms = [ledge]; c.b.x = 300; c.b.dir = -1; Object.assign(c.player, { y: ledge.y });
  c.game.bossStart(c.b, 'charge');
  for (let i = 0; i < 300; i++) { c.player.y = ledge.y; c.player.vy = 0; c.game.update(1 / 120); }
  assert.equal(c.player.hp, 1e4);
});

// ---- Elemental relics (#13) ----
function elem(...relics) {
  const ctx = arena();
  ctx.game.relics.push(...relics);
  return ctx;
}
const sword = (game, e, heavy = false) => game.damageEnemy(e, 24, 1, false, heavy, false, 0);

test('relic list has four stackable elemental relics', () => {
  for (const id of ['fire', 'frost', 'shock', 'bleed']) assert.ok(RELICS.some(r => r.id === id));
});

test('burn applies on hit and ticks every 0.5 s without hit-stop, stun or poise damage', () => {
  const { game, player } = elem('fire');
  const e = enemy(game, 600);
  sword(game, e);
  assert.equal(e.burn, 4);
  game.freeze = 0; e.stun = 0; e.flash = 0;
  const hp = e.hp, poise = e.poise;
  advance(game, 1.01);
  assert.equal(e.hp, hp - 2 * Math.round(e.burnDmg));
  assert.equal(game.freeze, 0); assert.equal(e.stun, 0); assert.equal(e.poise, poise);
  advance(game, 4);
  assert.equal(e.burn, 0);
});

test('bleed stacks per hit, refreshes, ticks per stack and expires', () => {
  const { game, player } = elem('bleed');
  const e = enemy(game, 600);
  sword(game, e); sword(game, e);
  assert.equal(e.bleedStacks, 2); assert.equal(e.bleed, 5);
  game.freeze = 0;
  const hp = e.hp;
  advance(game, .51);
  assert.equal(e.hp, hp - Math.round(.08 * player.damage * 2));
  advance(game, 5);
  assert.equal(e.bleedStacks, 0);
});

test('frost chills, freezes at 3 meter, freezing cancels warnings and blocks action', () => {
  const { game, player } = elem('frost');
  player.x = 100;
  const e = enemy(game, 140);
  e.tell = .5; e.cd = 0;
  sword(game, e); sword(game, e);
  assert.equal(e.frozen, 0); assert.equal(e.chill, 2.5);
  sword(game, e);
  assert.ok(e.frozen > .75 && e.frozen <= 1.5); assert.equal(e.tell, 0);
  const x = e.x, hp = player.hp;
  advance(game, .5);
  assert.equal(e.x, x); assert.equal(player.hp, hp);
});

test('chilled enemies move slower; the boss resists chill and freeze', () => {
  const { game, player } = elem('frost');
  player.x = 100;
  const a = enemy(game, 600), b = enemy(game, 800, { type: 'boss', hp: 9000 });
  const ax = a.x, bx = b.x;
  advance(game, .5); const free = ax - a.x, freeB = bx - b.x;
  a.x = ax; b.x = bx;
  sword(game, a); sword(game, b);
  game.freeze = 0; for (const o of [a, b]) { o.stun = 0; o.vx = 0; }
  advance(game, .5);
  assert.ok(ax - a.x < free * .8);
  assert.ok(bx - b.x > freeB * .8 && bx - b.x < freeB);
  sword(game, b); sword(game, b);
  assert.equal(b.frozen, .28); assert.ok(b.freezeImmune > 1.9);
  b.frozen = 0;
  for (let i = 0; i < 3; i++) sword(game, b);
  assert.equal(b.frozen, 0, 'immune to a second freeze');
});

test('shatter needs a frozen target and a heavy hit, unfreezes and hits everything in radius', () => {
  const { game, player } = elem('frost');
  const e = enemy(game, 600), near = enemy(game, 700), far = enemy(game, 760);
  e.frozen = 1;
  sword(game, e, false);
  assert.ok(e.frozen > 0, 'light hit does not shatter');
  const events = []; game.onEvent = ev => events.push(ev);
  const nh = near.hp, fh = far.hp, eh = e.hp;
  sword(game, e, true);
  const r = events.find(ev => ev.type === 'reaction');
  assert.equal(r.name, 'shatter'); assert.equal(r.radius, 140);
  assert.equal(e.frozen, 0);
  const dmg = Math.round(player.damage * 1.35);
  assert.equal(near.hp, nh - dmg); assert.equal(far.hp, fh);
  assert.ok(e.hp <= eh - 24 - dmg);
  const e2 = enemy(game, 900); sword(game, e2, true);
  assert.equal(events.filter(ev => ev.type === 'reaction').length, 1, 'unfrozen heavy hit does not shatter');
});

test('blood flame needs fire plus bleeding, consumes stacks and scales with them', () => {
  const noFire = elem('bleed');
  const a = enemy(noFire.game, 600); sword(noFire.game, a); sword(noFire.game, a, true);
  assert.equal(noFire.events.some(ev => ev.type === 'reaction'), false);
  const { game, player, events } = elem('fire', 'bleed');
  const e = enemy(game, 600), side = enemy(game, 690);
  sword(game, e); sword(game, e);
  const sh = side.hp; const eh = e.hp; sword(game, e, true);
  assert.equal(events.filter(ev => ev.type === 'reaction')[0].name, 'bloodFlame');
  assert.equal(e.bleedStacks, 1, 'stacks consumed, then the hit adds one');
  assert.equal(side.hp, sh - Math.round((.7 + .6) * player.damage * 1.3 * .5), 'others take half');
  assert.equal(e.hp, eh - 24 - Math.round((.7 + .6) * player.damage * 1.3), 'target takes full');
});

test('chain lightning arcs from a shocked enemy to the nearest others, shocking them', () => {
  const { game, player, events } = elem('shock');
  const e = enemy(game, 600), n1 = enemy(game, 700), n2 = enemy(game, 760), n3 = enemy(game, 780), far = enemy(game, 1000);
  sword(game, e);
  assert.equal(e.shock, 4); assert.equal(events.some(ev => ev.type === 'reaction'), false);
  const hp = [n1, n2, n3, far].map(o => o.hp);
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  const r = events.find(ev => ev.type === 'reaction');
  assert.equal(r.name, 'chain'); assert.equal(r.targets.length, 3);
  const dmg = Math.round(.35 * player.damage + .12 * 40);
  assert.deepEqual([n1, n2, n3].map(o => o.hp), [n1, n2, n3].map((o, i) => hp[i] - dmg));
  assert.equal(far.hp, hp[3]); assert.equal(n1.shock, 4);
  assert.equal(events.filter(ev => ev.type === 'reaction').length, 1, 'chained targets do not chain again');
});

test('shield bearer blocked frontal hits apply no status', () => {
  const { game, player } = elem('fire', 'frost', 'shock', 'bleed');
  player.x = 500; player.dir = 1;
  const s = enemy(game, 540, { type: 'shield' }); s.dir = -1;
  game.hitSet = new Set(); player.attack = .2; player.combo = 1;
  game.hitTargets();
  assert.equal(s.burn + s.chill + s.shock + s.bleed + s.frostMeter, 0);
});

test('statuses are cleared by loadStage; leech heals on a burn kill', () => {
  const { game, player } = elem('fire');
  const e = enemy(game, 600, { hp: 5 });
  e.hp = 50; sword(game, e);
  game.loadStage(1);
  assert.ok(game.enemies.every(o => o.burn === 0 && o.frozen === 0 && o.bleedStacks === 0 && o.shock === 0 && o.chill === 0));
  const g2 = elem('fire'); const v = enemy(g2.game, 600, { hp: 100 });
  g2.player.leech = 5; g2.player.hp = 50;
  v.hp = 60; v.burn = 4; v.burnDmg = 100;
  advance(g2.game, .51);
  assert.equal(v.hp, 0); assert.equal(g2.player.hp, 55); assert.equal(g2.game.kills, 1);
});

// QA #13: under sustained sword pressure a frozen normal enemy must get a window to act. Currently it is re-frozen the moment it thaws (frost x3, a stationary hero spamming attacks), so it never warns or attacks.
test('QA frost lock: under sustained attacks a frozen normal enemy gets a 0.5 s window to act before it refreezes', () => {
  const { game, player } = elem('frost', 'frost', 'frost');
  player.x = 100; player.dir = 1; player.maxHp = player.hp = 1e9; player.invulnerable = 1e9;
  const e = enemy(game, 140, { hp: 1e6 });
  let frozenBefore = false, open = 0, longestOpen = 0;
  for (let t = 0; t < 10; t += 1 / 120) {
    game.update(1 / 120, { attack: true });
    if (e.frozen > 0) frozenBefore = true;
    open = frozenBefore && e.frozen <= 0 ? open + 1 / 120 : 0;
    longestOpen = Math.max(longestOpen, open);
  }
  assert.ok(longestOpen >= .5, `longest unfrozen window after the first freeze was ${longestOpen.toFixed(2)} s`);
});

// QA #13: leech is applied on a DoT kill that lands on the same frame the hero dies, which heals a dead hero (hp 5 on the death screen).
test('QA leech: a DoT kill on the frame the hero dies does not heal the dead hero', () => {
  const { game, player } = elem('fire');
  player.hp = 1; player.leech = 5;
  const attacker = enemy(game, player.x + 20);
  attacker.tell = .001; attacker.cd = 0;
  const dying = enemy(game, player.x + 200, { hp: 1 });
  dying.burn = 4; dying.burnDmg = 50; dying.dotT = .4999;
  game.update(1 / 120);
  assert.equal(game.state, 'dead');
  assert.equal(player.hp, 0);
});

test('#13 rework: thaw grants normal enemies 2 s freeze immunity; frost meter decays after 3 s', () => {
  const { game } = elem('frost', 'frost', 'frost');
  const e = enemy(game, 600);
  sword(game, e);
  assert.equal(e.frozen > 0, true);
  sword(game, e); assert.equal(e.frostMeter, 0, 'no meter while frozen');
  advance(game, 1.6);
  assert.equal(e.frozen, 0); assert.ok(e.freezeImmune > 0);
  sword(game, e); assert.equal(e.frostMeter, 0, 'no meter while immune');
  const f = enemy(game, 800); f.frostMeter = 2; f.frostT = 3;
  advance(game, 3.1);
  assert.equal(f.frostMeter, 0);
});

test('#13 rework: Eclipse shocks but never chains; sword hits chain', () => {
  const { game, events } = elem('shock');
  const e = enemy(game, 600), n = enemy(game, 700);
  e.shock = 4;
  game.damageEnemy(e, 40, 1, false, true, false, 0, true);
  assert.equal(events.some(ev => ev.type === 'reaction'), false); assert.equal(n.shock, 0);
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  assert.equal(events.filter(ev => ev.type === 'reaction')[0].name, 'chain');
});

test('#13 rework: one Blood Flame per Eclipse cast; bleed cap is 10 per Blood Sigil', () => {
  const { game, player, events } = elem('fire', 'bleed');
  player.mp = player.maxMp;
  const es = Array.from({ length: 13 }, (_, i) => enemy(game, player.x + 10 + i * 8, { hp: 1e6 }));
  for (const e of es) { e.bleed = 5; e.bleedStacks = 3; }
  game.magic();
  assert.equal(events.filter(ev => ev.type === 'reaction' && ev.name === 'bloodFlame').length, 1);
  assert.ok(es.filter(e => e.bleedStacks >= 3).length >= 12, 'others keep their bleed');
  const x = enemy(game, 900); for (let i = 0; i < 15; i++) sword(game, x);
  assert.equal(x.bleedStacks, 10);
});

// ---- Attack-form relics (#14) ----
const combo3 = (game) => { game.player.combo = 2; game.player.comboWindow = .8; game.attack(); };
const hp = e => e.maxHp - e.hp;

test('#14 wave: crescent hits once on the way out and once on the way back, ignoring Eclipse', () => {
  const { game, player, events } = elem('wave');
  player.crit = 0; player.mp = player.maxMp;
  const a = enemy(game, 430); a.armor = 99; // no knockback, so it stays in the path
  const far = enemy(game, 1500);
  combo3(game);
  assert.equal(events.filter(e => e.type === 'shot' && e.kind === 'wave').length, 1);
  advance(game, .1);
  game.magic(); assert.equal(game.shots.length, 1, 'Eclipse does not clear player shots');
  advance(game, 2);
  assert.equal(game.shots.length, 0, 'disappears on reaching the hero');
  assert.equal(far.hp, far.maxHp);
  assert.equal(events.filter(e => e.type === 'hit' && e.amount === Math.round(player.damage * .85)).length, 2, 'once per pass');
});

test('#14 wave: +0.45 x base per extra stack', () => {
  const { game } = elem('wave', 'wave', 'wave');
  combo3(game);
  assert.ok(Math.abs(game.shots[0].mul - 1.75) < 1e-9);
});

test('#14 pierce: beam pierces several enemies once each; a thrust fires it too; reach +20/stack capped at +60', () => {
  const { game, player, events } = elem('pierce');
  player.crit = 0;
  const es = [430, 600, 640].map(x => enemy(game, x));
  combo3(game);
  advance(game, 1.2);
  const beam = Math.round(player.damage * .55);
  assert.equal(events.filter(e => e.type === 'hit' && e.amount === beam).length, 3);
  const t = elem('pierce', 'pierce', 'pierce', 'pierce', 'pierce');
  t.player.thrustWindow = 1; t.game.attack();
  assert.equal(t.events.filter(e => e.type === 'shot' && e.kind === 'beam').length, 1);
  assert.ok(Math.abs(t.game.shots[0].mul - 2.75) < 1e-9);
  t.player.crit = 0;
  const near = enemy(t.game, t.player.x + 155 + 60), out = enemy(t.game, t.player.x + 155 + 60 + 40);
  t.game.hitSet = new Set(); t.game.hitTargets();
  assert.ok(near.hp < near.maxHp && out.hp === out.maxHp);
});

test('#14 plunge vow: ground waves only on a >=40 px plunge; shockwave boosted; radius cap 190', () => {
  const run = (fall) => {
    const c = elem('plunge'); c.player.crit = 0;
    Object.assign(c.player, { x: 400, y: FLOOR - fall, grounded: false, vy: 0 });
    c.game.attack(); advance(c.game, .6); return c;
  };
  assert.equal(run(20).game.shots.length, 0);
  const c = run(120);
  assert.equal(c.events.filter(e => e.type === 'shot' && e.kind === 'ground').length, 2);
  assert.deepEqual(c.game.shots.map(s => s.dir).sort(), [-1, 1]);
  const stacked = new Game(() => {}, 1);
  for (let i = 0; i < 8; i++) { stacked.relics.push('plunge'); RELICS.find(r => r.id === 'plunge').apply(stacked.player); }
  assert.equal(stacked.player.plungeRadius, 190);
  RELICS.find(r => r.id === 'reach').apply(stacked.player);
  assert.equal(stacked.player.plungeRadius, 190, 'Phantom Glaive never lowers it');
  const w = elem('plunge'); w.player.crit = 0;
  const e = enemy(w.game, 400 + 80);
  Object.assign(w.player, { x: 400, y: FLOOR - 120, grounded: false, vy: 0 });
  w.game.attack(); advance(w.game, .5);
  assert.ok(hp(e) >= Math.round(w.player.damage * 1.5));
});

test('#14 vortex: pulls 78% (boss 10%), keeps y, stays in bounds, raises radius and damage', () => {
  const { game, player } = elem('vortex');
  player.mp = player.maxMp; player.x = 1000;
  const a = enemy(game, 1150), b = enemy(game, 850, { type: 'boss' }), plat = enemy(game, 1100, { y: FLOOR - 85 });
  const far = enemy(game, 1000 + 240);
  game.magic();
  assert.ok(Math.abs(a.x - (1150 - 150 * .78)) < 1e-6);
  assert.ok(Math.abs(b.x - (850 + 15)) < 1e-6);
  assert.equal(plat.y, FLOOR - 85);
  assert.ok(far.hp < far.maxHp, 'radius 245 reaches 240');
  assert.equal(a.maxHp - a.hp, Math.round(player.magicDamage * 1.35));
  const edge = elem('vortex'); edge.player.mp = 100; edge.player.x = 30;
  const e = enemy(edge.game, 100); edge.game.magic();
  assert.ok(e.x >= 30 && e.x <= edge.game.worldWidth - 40);
  const many = elem(...Array(9).fill('vortex')); many.player.mp = 100;
  const f = enemy(many.game, many.player.x + 319); many.game.magic();
  assert.ok(f.hp < f.maxHp);
  const g = enemy(many.game, many.player.x + 330); const before = g.hp; many.player.mp = 100; many.player.magicCd = 0; many.game.magic();
  assert.equal(g.hp, before, 'cap 320');
});

test('#14 shots: shield blocks from the front only; poise 8; no chain, not heavy; statuses apply', () => {
  const { game, player, events } = elem('shock', 'fire', 'bleed');
  player.crit = 0;
  const s = enemy(game, 600, { type: 'shield' }); s.dir = -1; s.guardBreak = 0; s.poise = 60;
  const o = enemy(game, 650);
  game.launchShot('beam', 1, 780, 1, 10, 500, FLOOR - 30, 1);
  o.shock = 4;
  advance(game, .3);
  assert.equal(events.filter(e => e.type === 'block').length, 1, 'frontal');
  assert.equal(s.poise, 60 - 8 * .25);
  assert.equal(events.filter(e => e.type === 'reaction').length, 0, 'no chain');
  assert.equal(events.filter(e => e.type === 'hit').every(e => !e.heavy), true);
  assert.ok(o.burn > 0 && o.bleedStacks > 0 && o.poise === o.maxPoise - 8);
  const back = elem(); const t = enemy(back.game, 600, { type: 'shield' }); t.dir = 1;
  back.game.launchShot('beam', 1, 780, 1, 10, 500, FLOOR - 30, 1);
  advance(back.game, .3);
  assert.equal(back.events.filter(e => e.type === 'block').length, 0, 'from behind');
  assert.ok(t.hp < t.maxHp - 5);
});

test('#14 relic list has four attack forms', () => {
  for (const id of ['wave', 'pierce', 'plunge', 'vortex']) assert.ok(RELICS.some(r => r.id === id));
  assert.equal(RELICS.length, 21);
});

test('#13 review: a DoT kill counts once and opens the portal; DoT can change boss phase; one Blood Flame per plunge', () => {
  const a = elem('fire'); const e = enemy(a.game, 600, { hp: 3 });
  e.burn = 4; e.burnDmg = 50;
  advance(a.game, 1);
  assert.equal(a.game.kills, 1); assert.equal(a.game.portalOpen, true);
  assert.equal(a.events.filter(x => x.type === 'kill').length, 1);
  const b = elem('fire'); const boss = enemy(b.game, 600, { type: 'boss', hp: 900 });
  boss.hp = 900 * .67 + 1; boss.burn = 4; boss.burnDmg = 20;
  advance(b.game, .6);
  assert.equal(boss.bossPhase, 2);
  const c = elem('fire', 'bleed'); c.player.crit = 0;
  const f = [enemy(c.game, 400), enemy(c.game, 460), enemy(c.game, 480)];
  for (const x of f) { x.bleed = 5; x.bleedStacks = 3; }
  Object.assign(c.player, { x: 400, y: FLOOR - 120, grounded: false, vy: 0 });
  c.game.attack(); advance(c.game, .5);
  assert.equal(c.events.filter(x => x.type === 'reaction' && x.name === 'bloodFlame').length, 1);
});

// QA (#14): the camera keeps the hero at ~37% of the narrowest 960 px view, so only ~605 px ahead is seen; the 819 px beam must not one-shot an unseen mage.
test('#14 QA: a four-stack beam does not kill a mage 620 px ahead, beyond the narrowest visible area', () => {
  const { game, player } = elem('pierce', 'pierce', 'pierce', 'pierce');
  player.crit = 0; player.x = 1000;
  const mage = enemy(game, 1620, { type: 'mage', hp: 43 });
  mage.speed = 0; mage.armor = 99;
  player.combo = 2; player.comboWindow = .8; game.attack();
  advance(game, 1.2);
  assert.equal(mage.hp, 43, 'an unseen mage takes no beam damage');
});

test('#14 plunge vow: ground wave stops at its reach, not beyond', () => {
  const c = elem('plunge'); c.player.crit = 0;
  Object.assign(c.player, { x: 400, y: FLOOR - 120, grounded: false, vy: 0 });
  const near = enemy(c.game, 400 + 300), far = enemy(c.game, 400 + 420);
  near.armor = far.armor = 99; near.speed = far.speed = 0;
  c.game.attack(); advance(c.game, 1.5);
  assert.ok(near.hp < near.maxHp, 'inside reach');
  assert.equal(far.hp, far.maxHp, 'outside the 340 px reach');
});

test('#14 wave + frost: only the outgoing pass adds frost meter', () => {
  const { game, player } = elem('wave', 'frost');
  player.crit = 0;
  const a = enemy(game, 430); a.armor = 99; a.speed = 0;
  combo3(game);
  game.hitSet = new Set(); // the sword swing itself must not count
  a.frostMeter = 0;
  advance(game, .5);
  assert.equal(a.frostMeter, 1, 'outgoing pass adds 1');
  advance(game, 2);
  assert.equal(a.frostMeter, 1, 'returning pass adds none');
  assert.ok(hp(a) > 0);
});

// ---- Opening pick and synergies (#15) ----
test('the opening pick offers only build relics, restores nothing and then starts stage 1', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const events = [];
    const game = new Game(e => events.push(e), seed);
    game.start();
    assert.equal(game.state, 'upgrade');
    assert.equal(events.find(e => e.type === 'upgrade').reason, 'start');
    assert.equal(game.choices.length, 3);
    assert.equal(new Set(game.choices.map(r => r.id)).size, 3);
    assert.ok(game.choices.every(r => BUILD_POOL.includes(r.id)));
    assert.equal(events.some(e => e.type === 'stage'), false, 'stage 1 has not started yet');
    game.player.hp = 50; game.player.mp = 10;
    assert.equal(game.chooseRelic(game.choices[0].id), true);
    assert.equal(game.state, 'playing');
    assert.equal(game.stage, 0);
    assert.deepEqual([game.player.hp, game.player.mp], [50, 10]);
    assert.equal(events.filter(e => e.type === 'stage').length, 1);
  }
});

test('stage picks carry reason "stage" and still restore HP and MP', () => {
  const { game, events } = arena();
  game.pickReason = 'stage'; game.player.hp = 50; game.player.mp = 0;
  game.finishStage();
  assert.equal(events.at(-1).reason, 'stage');
  game.chooseRelic(game.choices[0].id);
  assert.ok(game.player.hp >= 70);
  assert.equal(game.player.mp, game.player.maxMp);
});

test('synergy partners are favoured in offers, and offers stay distinct', () => {
  const count = owned => {
    const game = new Game(() => {}, 5), hits = {};
    game.relics = owned;
    for (let i = 0; i < 3000; i++) {
      game.rollChoices('stage');
      assert.equal(new Set(game.choices.map(r => r.id)).size, 3);
      for (const r of game.choices) hits[r.id] = (hits[r.id] || 0) + 1;
    }
    return hits;
  };
  const base = count([]), withWave = count(['wave']);
  for (const id of ['shock', 'vortex', 'bleed']) assert.ok(withWave[id] > base[id] * 1.15, `${id} is offered more often next to wave`);
  assert.ok(withWave.crit < base.crit * 1.05, 'non-partners are not boosted');
});

test('synergy helpers list owned partners and active pairs', () => {
  const { game } = arena();
  game.relics = ['wave', 'vortex', 'edge'];
  assert.deepEqual(game.synergyPartners('wave').map(s => s.with), ['vortex']);
  assert.deepEqual(game.synergyPartners('edge'), []);
  assert.deepEqual(game.activeSynergies(), [{ a: 'wave', b: 'vortex', key: 'synergy.wave-vortex' }]);
  for (const r of RELICS) for (const s of r.synergies) assert.ok(RELICS.find(o => o.id === s.with).synergies.some(b => b.with === r.id && b.key === s.key), 'pairs are symmetric');
});

test('the magic event reports the pull radius', () => {
  const { game, events } = arena();
  game.relics.push('vortex');
  game.magic();
  assert.equal(events.find(e => e.type === 'magic').radius, 245);
});

// ---- Stage hazards (#21) ----
function trapAt(game, x, { t = 0, kind = 'spikes', period = 4, active = 1.5, w = 70 } = {}) {
  return game.spawnTrap(kind, x, w, period, active, t, game.stage);
}

test('a trap warns for 0.7 s, then hurts only while active', () => {
  const { game, player, events } = arena();
  player.x = 600;
  const trap = trapAt(game, 600, { t: 4 - 0.7 - 0.05 }); // 0.05 s before the warning starts
  assert.equal(trap.state, 'idle');
  advance(game, 0.1);
  assert.equal(trap.state, 'warn');
  assert.ok(trap.warn && trap.progress > 0 && trap.progress < 1);
  assert.ok(events.some(e => e.type === 'trapWarn' && e.id === trap.id && e.w === 70));
  assert.equal(player.hp, 100);
  advance(game, 0.7); // warning over, trap active
  assert.equal(trap.state, 'active');
  assert.ok(events.some(e => e.type === 'trapActive'));
  assert.ok(player.hp < 100);
  assert.equal(events.filter(e => e.type === 'hurt').length, 1); // hurt invulnerability still applies
  player.hp = 100; player.invulnerable = 0;
  advance(game, 1.9); // idle again
  assert.equal(trap.state, 'idle');
  const hp = player.hp;
  player.invulnerable = 0; advance(game, 0.2);
  assert.equal(player.hp, hp);
});

test('trap damage scales with the stage and a jump clears spikes', () => {
  const { game, player } = arena();
  game.stage = 2;
  const trap = trapAt(game, 600, { t: 0.1 });
  assert.ok(Math.abs(trap.damage - 10 * 1.13 ** 2) < 1e-9);
  player.x = 600; player.y = FLOOR - 60; player.vy = 0; // above the 34 px spikes
  game.update(1 / 120);
  assert.equal(player.hp, 100);
});

test('a dash passes through an active trap without damage or a perfect dodge', () => {
  const { game, player, events } = arena();
  trapAt(game, 600, { t: 0.1 });
  player.x = 560; player.dir = 1;
  game.update(1 / 120, { dash: true });
  advance(game, 0.15, {});
  assert.ok(player.x > 560);
  assert.equal(player.hp, 100);
  assert.equal(events.some(e => e.type === 'perfectDash'), false);
  assert.equal(player.perfectUsed, false);
});

test('traps never hurt enemies', () => {
  const { game } = arena();
  trapAt(game, 600, { t: 0.1 });
  const e = enemy(game, 600, { hp: 50 });
  game.player.x = 100;
  advance(game, 0.5);
  assert.equal(e.hp, 50);
});

test('a barricade blocks the hero, can be stood on and breaks to sword hits', () => {
  const { game, player, events } = arena();
  const b = game.spawnObstacle('barricade', 600, 0);
  assert.equal(b.hp, 38); assert.equal(b.w, 40); assert.equal(b.h, 62);
  player.x = 500;
  advance(game, 1, { right: true });
  assert.ok(player.x < 600 - 20 - 14 + 0.01, 'hero stopped at the barricade');
  game.update(1 / 120, { jump: true });
  advance(game, 0.8, { right: true });
  assert.ok(player.x > 600 - 20, 'hero got over by jumping');
  // stand on top
  player.x = 600; player.y = FLOOR - 120; player.vy = 0;
  advance(game, 0.5);
  assert.equal(player.y, FLOOR - 62);
  assert.ok(player.grounded);
  // sword break: two combo hits at damage 24 break 38 hp
  player.x = 540; player.y = FLOOR; player.dir = 1; player.vy = 0;
  game.hitSet = new Set();
  game.attack(); advance(game, 0.4);
  game.attack(); advance(game, 0.4);
  assert.equal(game.obstacles.length, 0);
  const brk = events.find(e => e.type === 'break');
  assert.ok(brk && brk.kind === 'barricade' && brk.x === 600 && typeof brk.y === 'number');
  assert.ok(events.some(e => e.type === 'obstacleHit'));
  assert.equal(game.kills, 0); assert.equal(game.pickups.length, 0); // no drops
});

test('barricade health scales by stage', () => {
  const { game } = arena();
  assert.equal(game.spawnObstacle('barricade', 700, 3).hp, 38 + 36);
});

test('shots and Eclipse damage barricades; they take no statuses', () => {
  const { game, player, events } = arena();
  game.relics.push('fire', 'wave');
  const b = game.spawnObstacle('barricade', 700, 0);
  player.x = 500; player.dir = 1;
  game.launchShot('beam', 1, 780, 0.5, 10);
  advance(game, 0.4);
  assert.ok(b.hp < b.maxHp);
  assert.equal(b.burn, undefined);
  player.x = 650; player.mp = 100;
  const before = b.hp;
  game.magic();
  assert.ok(b.hp < before || game.obstacles.length === 0);
  assert.ok(events.some(e => e.type === 'obstacleHit'));
});

test('a ground enemy is blocked by a barricade and vaults over it', () => {
  const { game, player } = arena();
  const b = game.spawnObstacle('barricade', 600, 0);
  const e = enemy(game, 520, { hp: 500 });
  player.x = 900; player.invulnerable = 99;
  advance(game, 0.4);
  assert.ok(e.x <= 600 - 20 - 13.5 + 0.01, 'blocked on the near side');
  advance(game, 4);
  assert.ok(e.x > 600 + 20, 'vaulted to the far side');
  assert.equal(e.y, FLOOR);
  assert.ok(b.hp === b.maxHp);
});

test('a boss charge stops at a barricade', () => {
  const { game, player } = arena();
  game.spawnObstacle('barricade', 1100, 0);
  const boss = enemy(game, 1000, { type: 'boss', hp: 900 });
  player.x = 1500; player.invulnerable = 99;
  boss.dir = 1; game.bossStart(boss, 'charge');
  advance(game, 1.6);
  assert.ok(boss.x < 1100 - 20, 'boss did not pass the barricade');
  assert.equal(boss.travel, 0);
});

test('a vortex pull does not carry a ground enemy across a barricade (obstacles stay solid)', () => {
  const { game, player } = arena();
  game.relics = ['vortex'];
  game.spawnObstacle('barricade', 600, 0);
  const e = enemy(game, 540, { hp: 500 });
  player.x = 720; player.y = FLOOR; player.mp = 100; player.invulnerable = 99;
  game.magic();
  assert.ok(e.x < 600 - (27 + 40) / 2 + 0.01, `enemy pulled through the barricade to x=${e.x}`);
});

test('obstacles are not enemies: the Moon Gate rule and enemy logic ignore them', () => {
  const { game, player } = arena();
  game.spawnObstacle('barricade', 700, 0);
  game.spawnObstacle('altar', 800, 3);
  const e = enemy(game, 300, { hp: 1 }); e.required = true;
  game.update(1 / 120);
  assert.equal(game.portalOpen, false);
  e.hp = 0; game.update(1 / 120);
  assert.equal(game.portalOpen, true); // barricades left standing do not hold the gate shut
  assert.equal(game.enemies.length, 1);
  // vortex and auto-face only look at enemies
  game.relics.push('vortex'); player.mp = 100; game.magic();
  assert.ok(game.obstacles.every(o => o.x === 700 || o.x === 800));
});

test('breaking an altar permanently disables its linked pillars', () => {
  const { game, events } = arena();
  game.stage = 3;
  const a = game.spawnObstacle('altar', 800, 3), other = game.spawnObstacle('altar', 1200, 3);
  const p0 = trapAt(game, 500, { kind: 'pillar', t: 0.1 }), p1 = trapAt(game, 650, { kind: 'pillar' }), p2 = trapAt(game, 1000, { kind: 'pillar' });
  a.traps.push(p0.id, p1.id); p0.altar = p1.altar = a.id;
  other.traps.push(p2.id); p2.altar = other.id;
  assert.equal(a.w, 46); assert.equal(a.h, 74); assert.equal(a.hp, 64);
  game.damageObstacle(a, 64);
  const brk = events.find(e => e.type === 'break');
  assert.equal(brk.kind, 'altar'); assert.deepEqual(brk.traps, [p0.id, p1.id]);
  assert.ok(p0.disabled && p1.disabled && !p2.disabled);
  assert.equal(p0.state, 'off');
  game.player.x = 500; advance(game, 5);
  assert.equal(game.player.hp, 100); // the disabled pillar never fires again
  assert.equal(p0.state, 'off');
});

test('hazard placement obeys the spacing rules over many seeds and skips stages 1 and 4', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const game = new Game(() => {}, seed);
    for (let stage = 0; stage < 5; stage++) {
      game.loadStage(stage);
      const all = [...game.traps, ...game.obstacles];
      if (stage === 4) { assert.equal(all.length, 0); continue; }
      const expectTraps = { 0: 'spikes', 2: 'gears', 3: 'pillar' }[stage];
      if (expectTraps) { assert.ok(game.traps.length >= 2 && game.traps.length <= 3, `traps seed ${seed} stage ${stage}`); assert.ok(game.traps.every(t => t.kind === expectTraps)); }
      else assert.equal(game.traps.length, 0);
      const barricades = game.obstacles.filter(o => o.kind === 'barricade').length;
      assert.ok(barricades >= 1 && barricades <= 2);
      const altars = game.obstacles.filter(o => o.kind === 'altar');
      assert.equal(altars.length > 0, stage === 3);
      for (const a of altars) assert.ok(a.traps.length >= 1 && a.traps.length <= 2);
      for (const t of game.traps.filter(t => t.altar !== null)) assert.ok(Math.abs(t.x - game.obstacles.find(o => o.id === t.altar).x) <= 600, `pillar within 600 px of its altar, seed ${seed}`);
      for (const t of game.traps.filter(t => t.kind === 'pillar')) assert.ok(t.active >= 1.8 && t.active <= 2.15);
      for (const t of game.traps) { assert.ok(t.w >= 60 && t.w <= 90 && t.period >= 3.4 && t.period <= 4.5 && t.active >= 1.1 && t.active <= 2.15); assert.ok(t.period - t.active >= 0.7); }
      for (const [i, a] of all.entries()) {
        assert.ok(a.x - a.w / 2 >= 400 && a.x + a.w / 2 <= game.portalX - 250, 'clear of spawn and gate');
        for (const b of all.slice(i + 1)) assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2, 'no overlap');
      }
    }
  }
});

test('an active pillar does not hit a hero standing on a FLOOR-85 platform above it', () => {
  const { game, player } = arena();
  const tr = trapAt(game, 500, { kind: 'pillar', t: 0.1 });
  assert.equal(tr.state, 'active');
  player.x = 500; player.y = FLOOR - 85; player.vy = 0; player.grounded = true; player.invulnerable = 0;
  game.updateTraps(1 / 120);
  assert.equal(player.hp, 100);
});

test('rollChoices honours a pool and BUILD_POOL ids are real relics', () => {
  const { game } = arena();
  game.rollChoices('stage', ['wave', 'fire']);
  assert.equal(game.choices.length, 2);
  assert.notEqual(game.choices[0].id, game.choices[1].id);
  assert.ok(BUILD_POOL.every(id => RELICS.some(r => r.id === id)));
});

// ---- Stage routes (#20): rooms, high routes, moving platforms, chests, required guards ----
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const lowest = p => p.move?.axis === 'y' ? p.y0 + p.move.amp : p.y0; // lowest top surface a platform reaches
const span = p => p.move?.axis === 'x' ? [p.x0 - p.move.amp, p.x0 + p.w + p.move.amp] : [p.x0, p.x0 + p.w];
const gapBetween = (a, b) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]));
function layouts(fn) {
  for (const seed of SEEDS) { const game = new Game(() => {}, seed); for (let stage = 0; stage < 5; stage++) { game.loadStage(stage); fn(game, stage, seed); } }
}

test('stages 1-4 are five rooms that tile the world; the boss stage keeps its arena and two ledges', () => {
  layouts((game, stage) => {
    if (stage === 4) { assert.equal(game.rooms.length, 0); assert.equal(game.platforms.length, 2); assert.ok(game.platforms.every(p => p.y === FLOOR - 110)); assert.equal(game.chests.length, 0); return; }
    assert.equal(game.rooms.length, 5);
    assert.equal(game.worldWidth, STAGES[stage].width);
    let x = 0;
    for (const r of game.rooms) { assert.equal(r.x, x); assert.ok(Math.abs(r.w - game.worldWidth / 5) <= 65 && r.w >= 500 && r.w <= 705); x += r.w; }
    assert.equal(x, game.worldWidth);
    assert.ok(game.platforms.every(p => p.theme === ['gate', 'archive', 'belfry', 'cathedral'][stage] && typeof p.kind === 'string'));
  });
  assert.ok(STAGES.slice(0, 4).every(s => s.width >= 3000 && s.width <= 3500));
});

test('the floor is the low route: nothing solid sits at floor level but barricades and altars the hero can jump', () => {
  layouts((game, stage) => {
    assert.ok(game.platforms.every(p => p.y < FLOOR), 'platforms are one-way and above the floor');
    assert.ok(game.obstacles.every(o => o.h < 100), 'every obstacle is within a single jump');
  });
  // A bot that only holds right and keeps jumping gets from the spawn to the Moon Gate on every stage.
  for (const seed of [3, 9, 17]) for (let stage = 0; stage < 4; stage++) {
    const game = new Game(() => {}, seed); game.loadStage(stage); game.state = 'playing'; game.enemies = []; game.chests.forEach(c => { c.opened = true; });
    for (let t = 0; t < 90 && game.player.x < game.portalX - 60; t += 1 / 120) { game.player.invulnerable = 9; game.update(1 / 120, { right: true, jump: game.player.grounded }); }
    assert.ok(game.player.x >= game.portalX - 60, `seed ${seed} stage ${stage} reached x=${game.player.x}`);
  }
});

test('every platform is reachable with a normal jump and none is lower than FLOOR-85', () => {
  layouts(game => {
    for (const p of game.platforms.filter(p => game.rooms.length)) {
      assert.ok(lowest(p) <= FLOOR - 85, 'lowest point stays clear of the 80 px pillar');
      const rise = FLOOR - lowest(p);
      if (rise <= 100) continue; // a single jump from the floor
      assert.ok(rise <= 175, 'a double jump from the floor');
      assert.ok(game.platforms.some(q => q !== p && !q.moving && FLOOR - q.y0 < rise && lowest(p) < q.y0 && q.y0 - lowest(p) <= 100 && gapBetween(span(p), span(q)) <= 120), 'and a lower step within a single jump');
    }
  });
});

test('traps are never under a platform where their box could reach a hero standing on it', () => {
  layouts(game => {
    for (const p of game.platforms) for (const tr of game.traps) assert.ok(lowest(p) <= tr.y - tr.h, 'a hero standing on any platform is above every trap box');
    for (const c of game.chests.filter(c => c.y === FLOOR)) for (const o of [...game.traps, ...game.obstacles]) assert.ok(Math.abs(c.x - o.x) >= (50 + o.w) / 2, 'no hazard on the floor chest');
  });
});

test('Belfry has one or two moving platforms that carry the hero', () => {
  const game = new Game(() => {}, 5); game.loadStage(2); game.state = 'playing'; game.enemies = [];
  const moving = game.platforms.filter(p => p.moving);
  assert.ok(moving.length >= 1 && moving.length <= 2);
  for (const stage of [0, 1, 3]) { game.loadStage(stage); assert.equal(game.platforms.filter(p => p.moving).length, 0); }
  game.loadStage(2); game.enemies = []; game.chests = [];
  const pl = game.platforms.find(p => p.moving && p.move.axis === 'y') || game.platforms.find(p => p.moving);
  Object.assign(game.player, { x: pl.x + pl.w / 2, y: pl.y, vy: 0, grounded: true, on: pl, invulnerable: 99 });
  for (let i = 0; i < 360; i++) { game.update(1 / 120); assert.equal(game.player.y, pl.y, 'rider stays on the surface'); assert.ok(game.player.grounded); }
  assert.ok(Math.abs(game.player.x - (pl.x + pl.w / 2)) < 1e-6, 'rider keeps its place on the platform');
  assert.ok(pl.x !== pl.x0 || pl.y !== pl.y0, 'it moved');
});

test('moving platform deltas are reproducible and bounded by the amplitude', () => {
  const a = new Game(() => {}, 11), b = new Game(() => {}, 11);
  a.loadStage(2); b.loadStage(2); a.state = b.state = 'playing';
  for (let i = 0; i < 300; i++) { a.update(1 / 60); b.update(1 / 60); }
  assert.deepEqual(a.platforms.map(p => [p.x, p.y]), b.platforms.map(p => [p.x, p.y]));
  for (const p of a.platforms.filter(p => p.moving)) assert.ok(Math.abs(p.x - p.x0) <= p.move.amp + 1e-9 && Math.abs(p.y - p.y0) <= p.move.amp + 1e-9);
});

test('the same seed builds the same stage', () => {
  const sig = seed => { const g = new Game(() => {}, seed); const out = []; for (let s = 0; s < 5; s++) { g.loadStage(s); out.push(JSON.stringify([g.rooms, g.platforms.map(p => [p.x, p.y, p.w, p.kind]), g.chests, g.enemies.map(e => [e.type, e.x, e.y, e.required]), g.traps.map(t => t.x), g.obstacles.map(o => o.x)])); } return out; };
  assert.deepEqual(sig(7), sig(7));
  assert.notDeepEqual(sig(7), sig(8));
});

test('rooms 2 and 4 can be mirrored by seed and the floor route is unaffected', () => {
  let mirrored = 0, plain = 0;
  for (const seed of SEEDS) {
    const g = new Game(() => {}, seed); g.loadStage(1);
    for (const i of [1, 3]) {
      const room = g.rooms[i];
      if (room.mirror) mirrored++; else plain++;
      const inRoom = g.platforms.filter(p => p.x0 >= room.x && p.x0 < room.x + room.w);
      assert.ok(inRoom.length > 0 && inRoom.every(p => p.x0 >= room.x && p.x0 + p.w <= room.x + room.w), 'mirrored platforms stay inside their room');
    }
    assert.equal(g.rooms[0].mirror || g.rooms[2].mirror || g.rooms[4].mirror, false);
  }
  assert.ok(mirrored > 0 && plain > 0);
});

test('each non-boss stage has one relic chest on the floor and one optional chest on a high route with a tougher guard', () => {
  layouts((game, stage) => {
    if (stage === 4) return;
    assert.equal(game.chests.length, 2);
    const [main, side] = game.chests;
    assert.deepEqual([main.kind, main.y, main.optional], ['relic', FLOOR, false]);
    assert.equal(side.optional, true); assert.ok(['relic', 'heal'].includes(side.kind));
    const plat = game.platforms.find(p => p.y === side.y && side.x >= p.x && side.x <= p.x + p.w);
    assert.ok(plat && side.y <= FLOOR - 160, 'on a high platform');
    const guard = game.enemies.find(e => e.plat === plat);
    assert.ok(guard && !guard.required && guard.y === plat.y);
    assert.ok(stage === 0 ? guard.type === 'skeleton' : ['knight', 'shield'].includes(guard.type));
  });
});

test('a relic chest opens a 3-relic pick with reason chest, no restore, and play resumes in place', () => {
  const { game, player, events } = arena();
  game.chests = [{ id: 0, x: 600, y: FLOOR, w: 34, h: 28, kind: 'relic', optional: false, opened: false }];
  player.x = 700; player.hp = 40; player.mp = 10; game.stage = 1;
  advance(game, .1);
  assert.equal(game.state, 'playing');
  player.x = 620; // next to the chest
  game.update(1 / 120);
  assert.equal(game.state, 'upgrade');
  const up = events.filter(e => e.type === 'upgrade').at(-1);
  assert.equal(up.reason, 'chest'); assert.equal(up.choices.length, 3);
  assert.deepEqual(events.find(e => e.type === 'chest'), { type: 'chest', x: 600, y: FLOOR, kind: 'relic', optional: false });
  assert.equal(game.chests[0].opened, true);
  assert.equal(game.chooseRelic(up.choices[0].id), true);
  assert.equal(game.state, 'playing'); assert.equal(game.stage, 1, 'not a stage load');
  assert.equal(player.x, 620);
  assert.equal(player.mp < 20, true, 'no MP refill'); assert.ok(player.hp <= 40 + (up.choices[0].id === 'vital' ? 40 : up.choices[0].id === 'armor' ? 20 : 0));
  assert.equal(events.filter(e => e.type === 'stage').length, 0);
  advance(game, 1); assert.equal(events.filter(e => e.type === 'chest').length, 1, 'opens once');
});

test('a heal chest restores max(25, 30% max HP) and fills MP; it needs a grounded hero on its own surface', () => {
  const { game, player, events } = arena();
  game.chests = [{ id: 0, x: 600, y: FLOOR - 90, w: 34, h: 28, kind: 'heal', optional: true, opened: false }];
  player.x = 600; player.hp = 10; player.mp = 0;
  game.update(1 / 120);
  assert.equal(game.chests[0].opened, false, 'standing under a raised chest does nothing');
  game.platforms = [{ x: 560, y: FLOOR - 90, w: 100, h: 18 }];
  Object.assign(player, { y: FLOOR - 90, vy: 0 });
  game.update(1 / 120);
  assert.equal(player.hp, 40); assert.equal(player.mp, player.maxMp); assert.equal(game.state, 'playing');
  assert.equal(events.find(e => e.type === 'heal').amount, 30);
  const g2 = arena(); g2.player.maxHp = 60; g2.player.hp = 1; g2.game.chests = [{ id: 0, x: 200, y: FLOOR, w: 34, h: 28, kind: 'heal', optional: false, opened: false }];
  g2.player.x = 200; g2.game.update(1 / 120);
  assert.equal(g2.player.hp, 26, 'minimum 25');
});

test('the Moon Gate opens when the required guards die, even with other enemies alive; the boss stage needs the boss', () => {
  const events = [];
  const game = new Game(e => events.push(e), 31); game.state = 'playing';
  const guards = game.enemies.filter(e => e.required), others = game.enemies.filter(e => !e.required);
  assert.equal(guards.length, 2); assert.ok(others.length >= 4);
  assert.ok(guards.every(g => g.type !== 'bat' && g.x > game.portalX - 450 && g.x < game.portalX), 'near the gate');
  assert.deepEqual(game.guardStatus(), { n: 0, total: 2 });
  game.damageEnemy(guards[0], 9999, 1, false, false);
  assert.deepEqual(events.filter(e => e.type === 'guards').at(-1), { type: 'guards', n: 1, total: 2 });
  advance(game, .1); assert.equal(game.portalOpen, false);
  game.damageEnemy(guards[1], 9999, 1, false, false);
  advance(game, .1);
  assert.equal(game.portalOpen, true); assert.ok(others.every(o => o.hp > 0));
  game.player.x = game.portalX; game.update(1 / 60);
  assert.equal(game.state, 'upgrade');
  game.loadStage(4); game.state = 'playing';
  assert.deepEqual(game.enemies.filter(e => e.required).map(e => e.type), ['boss']);
  for (const e of game.enemies) if (e.type !== 'boss') e.hp = 0;
  advance(game, .1); assert.equal(game.portalOpen, false);
  game.enemies.find(e => e.type === 'boss').hp = 0; advance(game, .1);
  assert.equal(game.portalOpen, true);
});

test('a room event fires when the hero enters a new room', () => {
  const { game, player, events } = arena();
  game.rooms = [{ x: 0, w: 600 }, { x: 600, w: 600 }]; game.roomIndex = -1; game.stage = 2;
  player.x = 100; game.update(1 / 120);
  player.x = 700; game.update(1 / 120); game.update(1 / 120);
  assert.deepEqual(events.filter(e => e.type === 'room'), [{ type: 'room', stage: 2, index: 0 }, { type: 'room', stage: 2, index: 1 }]);
});

test('a ground enemy jumps onto a platform toward a hero above and drops through toward a hero below', () => {
  const { game, player } = arena();
  game.platforms = [{ x: 500, y: FLOOR - 90, w: 200, h: 18 }];
  const e = enemy(game, 560, { hp: 9999 });
  Object.assign(player, { x: 640, y: FLOOR - 90, grounded: true, invulnerable: 99 });
  let up = false; for (let t = 0; t < 6; t += 1 / 120) { game.update(1 / 120); if (e.y === FLOOR - 90 && e.plat) up = true; }
  assert.ok(up, 'the enemy climbed onto the platform');
  Object.assign(player, { x: 560, y: FLOOR, vy: 0, grounded: true, on: null });
  for (let t = 0; t < 4; t += 1 / 120) { game.update(1 / 120); player.x = 560; player.y = FLOOR; player.vy = 0; }
  assert.equal(e.y, FLOOR); assert.equal(e.plat, null, 'dropped through to the floor');
});

test('enemies never end up stuck in the air or off the world over many seeded stages', () => {
  for (const seed of [2, 4, 6, 8, 10]) for (let stage = 0; stage < 4; stage++) {
    const game = new Game(() => {}, seed); game.loadStage(stage); game.state = 'playing';
    game.chests.forEach(c => { c.opened = true; });
    for (const top of game.platforms.filter(p => !p.moving)) { // park the hero on each platform in turn, then on the floor
      Object.assign(game.player, { x: top.x + top.w / 2, y: top.y, vy: 0, grounded: true, on: top, invulnerable: 99 });
      for (let t = 0; t < 1.5; t += 1 / 60) { game.player.x = top.x + top.w / 2; game.player.y = top.y; game.player.vy = 0; game.update(1 / 60); }
    }
    Object.assign(game.player, { x: game.rooms[2].x + 100, y: FLOOR, vy: 0, on: null });
    for (let t = 0; t < 8; t += 1 / 60) { game.player.x = game.rooms[2].x + 100; game.player.y = FLOOR; game.player.vy = 0; game.update(1 / 60); }
    for (const e of game.enemies.filter(e => e.type !== 'bat' && e.hp > 0)) {
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && e.x > 0 && e.x < game.worldWidth, 'finite and inside the world');
      assert.ok(e.y === FLOOR || e.plat || e.vault, `seed ${seed} stage ${stage} ${e.type} floats at ${e.y}`);
    }
  }
});

test('a shield shove cannot push the hero or the bearer through a barricade', () => {
  const { game, player } = arena();
  game.spawnObstacle('barricade', 560, 0);
  const s = enemy(game, 600, { type: 'shield' }); s.dir = -1;
  player.x = 585; s.x = 585 + 40;
  game.damageEnemy(s, 10, 1, false, false, true, 0);
  assert.ok(player.x >= 560 + (28 + 40) / 2 - 1e-9, `hero at ${player.x} must stay on the right of the barricade`);
  const b = enemy(game, 700, { type: 'shield' }); b.dir = 1; player.x = 690; game.spawnObstacle('barricade', 720, 0);
  game.damageEnemy(b, 10, -1, false, false, true, 0);
  assert.ok(b.x <= 720 - (27 + 40) / 2 + 1e-9 || b.x > 720, 'bearer is not inside the barricade');
});

test('a blocked enemy facing away from the obstacle stops instead of vaulting; a vault is not carried through a warning', () => {
  const { game, player } = arena();
  game.spawnObstacle('barricade', 600, 0);
  const e = enemy(game, 560, { hp: 500 });
  e.dir = -1; player.x = 100; player.invulnerable = 99;
  e.x = 585; // overlapping the near face while facing away from it
  game.collideEnemy(e, 560, 1 / 120);
  assert.equal(e.vault, false);
  const v = enemy(game, 530, { hp: 500 }); v.dir = 1; v.vault = true; v.vy = -520; v.tell = .3;
  const x0 = v.x; game.collideEnemy(v, x0, 1 / 120);
  assert.equal(v.x, x0, 'no forward vault motion while winding up');
});

test('an altar always keeps at least one pillar', () => {
  layouts((game, stage) => { if (stage === 3) for (const a of game.obstacles.filter(o => o.kind === 'altar')) assert.ok(a.traps.length >= 1); });
});

// QA #20: docs/game-design.md says an enemy on a 90 step can still reach an adjacent 160 step with the hero on it. Today it walks off the
// 90 step's edge during its 1.6 s jump cooldown, falls, and never climbs. Expected to fail until the enemy waits or stops at the edge.
test('a ground enemy on a 90 step climbs to an adjacent 160 step with the hero on it, even while its jump cooldown runs', () => {
  const { game, player } = arena();
  const low = { x: 500, y: FLOOR - 90, w: 140, h: 18, theme: 'gate', kind: 'stone', moving: false, move: null };
  const high = { x: 640, y: FLOOR - 160, w: 140, h: 18, theme: 'gate', kind: 'stone', moving: false, move: null };
  game.platforms = [low, high];
  const e = enemy(game, 600, { hp: 9999, y: FLOOR - 90 });
  e.plat = low; e.jumpCd = 1;
  let reached = false;
  for (let t = 0; t < 6 && !reached; t += 1 / 120) {
    Object.assign(player, { x: 720, y: FLOOR - 160, vy: 0, grounded: true, on: high, invulnerable: 99 });
    game.update(1 / 120);
    reached = e.plat === high;
  }
  assert.ok(reached, `the enemy should reach the 160 step; it stands at x ${e.x.toFixed(0)}, y ${e.y.toFixed(0)}`);
});

test('floor chests keep 60 px clear of platform spans and altars are never under a platform', () => {
  for (let seed = 1; seed <= 200; seed++) for (const stage of [0, 1, 2, 3]) {
    const g = new Game(() => {}, seed); g.start(); g.state = 'playing'; g.loadStage(stage);
    assert.equal(g.chests.filter(c => c.y === FLOOR).length, 1, 'one floor chest');
    for (const c of g.chests.filter(c => c.y === FLOOR)) for (const p of g.platforms) assert.ok(c.x < p.x - 60 || c.x > p.x + p.w + 60, `chest ${c.x} near platform ${p.x}-${p.x + p.w}, stage ${stage} seed ${seed}`);
    for (const o of g.obstacles.filter(o => o.kind === 'altar')) for (const p of g.platforms) assert.ok(o.x + o.w / 2 < p.x || o.x - o.w / 2 > p.x + p.w, `altar ${o.x} under platform ${p.x}-${p.x + p.w}, stage ${stage} seed ${seed}`);
  }
});

// ---- Elites (#3): the optional chest's guard, one random affix, an extra relic pick ----
function eliteOf(game) { return game.enemies.find(e => e.elite); }
function withAffix(affix, { type = 'skeleton', hp = 300 } = {}) {
  const { game, player, events } = arena();
  const e = enemy(game, 800, { hp, type });
  Object.assign(e, { elite: true, affix, maxHp: hp, ward: affix === 'warded' ? 30 : 0, wardT: 6, required: false });
  player.x = 200;
  return { game, player, events, e };
}

test('stages I-IV each have exactly one elite: the optional chest guard, never required; none on the boss stage', () => {
  layouts((game, stage) => {
    const elites = game.enemies.filter(e => e.elite);
    if (stage === 4) { assert.equal(elites.length, 0); return; }
    assert.equal(elites.length, 1);
    const [e] = elites, side = game.chests.find(c => c.optional);
    assert.ok(!e.required && e.plat && e.y === side.y && side.x >= e.plat.x && side.x <= e.plat.x + e.plat.w);
    assert.ok(['swift', 'splitting', 'warded'].includes(e.affix));
    assert.equal(game.enemies.filter(o => o.required).length, 2);
  });
});

test('elites have 2.6x health on stage I, 1.8x for shield bearers, 2.2x otherwise, and 1.3x damage', () => {
  layouts((game, stage) => {
    if (stage === 4) return;
    const e = eliteOf(game), base = game.spawnEnemy(e.type, 100, stage), mult = stage === 0 ? 2.6 : e.type === 'shield' ? 1.8 : 2.2;
    assert.equal(e.maxHp, Math.round(base.maxHp * mult)); assert.equal(e.hp, e.maxHp);
    assert.ok(Math.abs(e.damage - base.damage * 1.3) < 1e-9);
  });
});

test('the elite stands within 40 px of its optional chest on the same platform, to the chest\'s right', () => {
  layouts((game, stage) => {
    if (stage === 4) return;
    const e = eliteOf(game), c = game.chests.find(o => o.optional);
    assert.ok(e.plat && e.y === c.y && Math.abs(e.x - c.x) <= 40 && e.x >= c.x, `elite ${e.x} chest ${c.x}`);
    assert.ok(e.x >= e.plat.x && e.x <= e.plat.x + e.plat.w);
  });
});

test('Swift moves 1.5x faster and shortens warnings by 20%, never below 0.3 s', () => {
  const game = new Game(() => {}, 5);
  for (let seed = 1, found = false; !found && seed < 200; seed++) { const g = new Game(() => {}, seed); g.loadStage(1); if (eliteOf(g).affix === 'swift') { const e = eliteOf(g), base = g.spawnEnemy(e.type, 100, 1); assert.ok(Math.abs(e.speed - base.speed * 1.5) < 1e-9); found = true; } }
  const { game: g, player, e } = withAffix('swift');
  Object.assign(e, { type: 'knight', x: 230, cd: 0 }); player.x = 200; player.invulnerable = 9;
  advance(g, .05);
  assert.ok(e.tell > 0 && e.tell >= .3 && e.tell <= .6 * .8 + .001, `tell ${e.tell}`);
});

test('Splitting spawns two 0.4x-health copies beside it on death; copies are plain and never split', () => {
  const { game, e, events } = withAffix('splitting', { hp: 100 });
  game.obstacles = [{ x: 840, y: FLOOR, w: 40, h: 40, hp: 99, maxHp: 99, flash: 0, kind: 'barricade', id: 9 }];
  game.damageEnemy(e, 999, 1, false, false);
  const copies = game.enemies.filter(o => o !== e);
  assert.equal(copies.length, 2);
  for (const c of copies) {
    assert.deepEqual([c.type, c.maxHp, c.hp, c.elite, c.required, c.affix], [e.type, 40, 40, false, false, null]);
    assert.ok(game.obstacles.every(o => Math.abs(c.x - o.x) >= (c.w + o.w) / 2), 'not inside the barricade');
  }
  assert.ok(copies[0].x < e.x && copies[1].x > e.x);
  advance(game, .9);
  assert.equal(game.state, 'upgrade');
  game.chooseRelic(game.choices[0].id);
  for (const c of copies) game.damageEnemy(c, 999, 1, false, false);
  assert.equal(game.enemies.length, 3, 'no chain');
  assert.equal(game.state, 'playing', 'copies grant no pick');
  assert.equal(events.filter(x => x.type === 'eliteKill').length, 1);
});

test('Splitting copies stay on the elite platform', () => {
  const { game, e } = withAffix('splitting', { hp: 50 });
  const plat = { x: 790, y: FLOOR - 170, w: 120, h: 18, theme: 'x', kind: 'x', moving: false, dx: 0, dy: 0 };
  game.platforms = [plat]; Object.assign(e, { plat, y: plat.y });
  game.damageEnemy(e, 999, 1, false, false);
  for (const c of game.enemies.filter(o => o !== e)) assert.ok(c.x >= plat.x && c.x <= plat.x + plat.w && c.y === plat.y);
});

test('Warded absorbs 30 damage (also DoT) before HP and recharges every 6 s without stacking above 30', () => {
  const { game, e } = withAffix('warded', { hp: 300 });
  game.damageEnemy(e, 20, 1, false, false);
  assert.equal(e.hp, 300); assert.equal(e.ward, 10);
  game.damageEnemy(e, 25, 1, false, false);
  assert.deepEqual([e.hp, e.ward], [285, 0]);
  game.elemDamage(e, 10, 'burn'); assert.equal(e.hp, 275);
  e.ward = 30; game.elemDamage(e, 10, 'burn'); assert.deepEqual([e.hp, e.ward], [275, 20]);
  advance(game, 6.2);
  assert.equal(e.ward, 30);
  advance(game, 6);
  assert.equal(e.ward, 30, 'does not stack');
});

test('the optional chest is sealed while its elite lives: contact does nothing, then it unseals on death and opens (QA #3)', () => {
  layouts((game, stage, seed) => {
    if (stage === 4) return;
    const events = []; game.emit = (type, data) => events.push({ type, ...data });
    const c = game.chests.find(o => o.optional), e = eliteOf(game);
    assert.equal(c.sealed, true);
    game.state = 'playing'; game.enemies = [e];
    Object.assign(game.player, { x: c.x - 20, y: c.y, vx: 0, vy: 0, grounded: true, invulnerable: 9 });
    game.updateChests(); assert.equal(c.opened, false, `seed ${seed} stage ${stage}`); assert.equal(c.sealed, true);
    game.damageEnemy(e, e.hp + e.ward, 1, false, false); // elite dies (through any ward)
    game.updateChests();
    assert.equal(c.sealed, false); assert.equal(events.filter(x => x.type === 'unseal').length, 1);
    assert.equal(c.opened, true, 'opens on contact once unsealed');
  });
});

test('a sealed chest unseals if its elite is removed, and a chest without a guard never seals', () => {
  const { game, player, events } = arena();
  game.chests = [{ id: 1, x: 600, y: FLOOR, w: 34, h: 28, kind: 'heal', optional: true, opened: false, sealed: true }];
  player.x = 700; game.updateChests(); // no enemy linked to chest 1 any more
  assert.equal(game.chests[0].sealed, false); assert.deepEqual(events.find(x => x.type === 'unseal'), { type: 'unseal', x: 600, y: FLOOR });
  const g = new Game(() => {}, 5); g.loadStage(4); assert.equal(g.chests.length, 0);
});

test('shield-bearer elites are never Warded, deterministically per seed', () => {
  let shields = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = new Game(() => {}, seed), h = new Game(() => {}, seed);
    for (let s = 1; s < 4; s++) {
      g.loadStage(s); h.loadStage(s);
      const e = eliteOf(g); assert.equal(eliteOf(h).affix, e.affix);
      if (e.type === 'shield') { shields++; assert.ok(e.affix === 'swift' || e.affix === 'splitting'); }
    }
  }
  assert.ok(shields > 50);
});

test('the elite is announced once when the hero comes within 600 px', () => {
  const { game, player, e, events } = withAffix('swift');
  Object.assign(e, { x: 1400 }); player.x = 200; advance(game, .1);
  assert.equal(events.filter(x => x.type === 'elite').length, 0);
  player.x = 900; advance(game, .1); player.x = 1000; advance(game, .1);
  const seen = events.filter(x => x.type === 'elite');
  assert.equal(seen.length, 1); assert.equal(seen[0].affix, 'swift');
});

test('killing an elite opens a pick with reason elite, restores 20 HP and full MP, and play resumes in place', () => {
  const { game, player, e, events } = withAffix('swift', { hp: 10 });
  player.hp = 50; player.mp = 0; const stage = game.stage;
  game.damageEnemy(e, 99, 1, false, false);
  advance(game, .9);
  const up = events.findLast(x => x.type === 'upgrade');
  assert.equal(up.reason, 'elite'); assert.equal(up.choices.length, 3);
  assert.equal(events.find(x => x.type === 'eliteKill').affix, 'swift');
  assert.equal(game.chooseRelic(up.choices[0].id), true);
  assert.deepEqual([game.state, game.stage, player.hp, player.mp], ['playing', stage, 70, player.maxMp]);
  assert.equal(events.filter(x => x.type === 'stage').length, 0);
});

test('the Moon Gate opens when the required guards fall, without killing the elite', () => {
  const game = new Game(() => {}, 11); game.loadStage(1); game.state = 'playing';
  for (const e of game.enemies) if (e.required) e.hp = 0;
  game.update(1 / 120);
  assert.equal(game.portalOpen, true);
  assert.ok(eliteOf(game).hp > 0);
});

test('Splitting puts one copy on each side of the elite even when it stands near one end of its platform (QA #3)', () => {
  const { game, e } = withAffix('splitting', { hp: 50 });
  const plat = { x: 790, y: FLOOR - 170, w: 150, h: 18, theme: 'x', kind: 'x', moving: false, dx: 0, dy: 0 };
  game.platforms = [plat]; Object.assign(e, { x: plat.x + plat.w * .72, y: plat.y, plat });
  game.damageEnemy(e, 999, 1, false, false);
  const [left, right] = game.enemies.filter(o => o !== e).sort((a, b) => a.x - b.x);
  assert.ok(left && right && left.x < e.x && right.x > e.x, `copies at ${left?.x} and ${right?.x}, elite died at ${e.x}`);
  for (const c of [left, right]) assert.ok(c.x >= plat.x && c.x <= plat.x + plat.w, 'both copies stay on the platform');
});

test('a hit reports the damage that reached HP, so a fully warded hit shows no damage number (QA #3)', () => {
  const { game, e, events } = withAffix('warded', { hp: 300 });
  const hpBefore = e.hp;
  game.damageEnemy(e, 20, 1, false, false);
  assert.equal(events.findLast(x => x.type === 'hit').amount, hpBefore - e.hp, 'ward soaked the whole hit');
  const hpMid = e.hp;
  game.damageEnemy(e, 25, 1, false, false);
  assert.equal(events.findLast(x => x.type === 'hit').amount, hpMid - e.hp, 'only the part past the ward is reported');
});

test('an elite death freezes the world for 0.8 s before the pick; nothing interleaves (QA #3)', () => {
  const { game, player, e, events } = withAffix('swift', { hp: 10 });
  const other = enemy(game, 300, { hp: 99 }); other.cd = 0; other.tell = 0;
  player.hp = 50; player.invulnerable = 0;
  const picks = events.filter(x => x.type === 'upgrade').length;
  game.damageEnemy(e, 99, 1, false, false);
  assert.equal(game.state, 'playing'); assert.equal(events.filter(x => x.type === 'upgrade').length, picks);
  const ox = other.x, php = player.hp;
  advance(game, .7);
  assert.deepEqual([game.state, other.x, player.hp], ['playing', ox, php], 'frozen: no enemy movement or damage');
  advance(game, .2);
  assert.equal(game.state, 'upgrade'); assert.equal(game.pickReason, 'elite');
  assert.equal(events.filter(x => x.type === 'upgrade').length, picks + 1);
  game.chooseRelic(game.choices[0].id);
  assert.equal(game.state, 'playing');
});

test('the elite beat is dropped if the hero dies in it, and a pause holds it', () => {
  const a = withAffix('swift', { hp: 10 });
  a.game.damageEnemy(a.e, 99, 1, false, false);
  a.game.state = 'paused'; advance(a.game, 2); assert.equal(a.game.state, 'paused');
  a.game.state = 'playing'; advance(a.game, .9); assert.equal(a.game.state, 'upgrade');
  const b = withAffix('swift', { hp: 10 });
  b.game.damageEnemy(b.e, 99, 1, false, false);
  b.game.state = 'dead'; advance(b.game, 2); assert.equal(b.game.state, 'dead');
  b.game.loadStage(1); b.game.state = 'playing'; advance(b.game, 2); assert.equal(b.game.state, 'playing', 'a new stage clears the beat');
});

test('statusTick reports the damage that reached HP and the amount the ward absorbed', () => {
  const { game, e, events } = withAffix('warded', { hp: 300 });
  game.elemDamage(e, 40, 'burn');
  const t = events.findLast(x => x.type === 'statusTick');
  assert.deepEqual([t.amount, t.absorbed, e.hp], [10, 30, 290]);
  game.damageEnemy(e, 5, 1, false, false); // ward is empty; later hits report absorbed 0
  assert.equal(events.findLast(x => x.type === 'hit').absorbed, 0);
});

test('an elite killed inside update holds the chest until the beat ends (no same-frame chest pick)', () => {
  const { game, player, events } = arena();
  const e = enemy(game, player.x + 40, { hp: 1 });
  Object.assign(e, { elite: true, affix: 'swift', required: false });
  game.chests = [{ id: 9, x: player.x, y: FLOOR, w: 34, h: 28, kind: 'relic', optional: true, opened: false }];
  game.update(1 / 120, { attack: true });
  assert.ok(events.some(x => x.type === 'eliteKill'));
  assert.equal(game.chests[0].opened, false); assert.equal(game.state, 'playing');
  advance(game, .9);
  assert.equal(game.pickReason, 'elite'); // the elite reward comes first; the chest opens after it
});

// ---- Cursed relics (#1) ----
const cursed = RELICS.filter(r => r.cursed);
const grant = (game, id) => { game.choices = [RELICS.find(r => r.id === id)]; game.state = 'upgrade'; game.pickReason = 'chest'; assert.ok(game.chooseRelic(id)); };

test('cursed relics: three exist, never in the opening pick, at most one per offer', () => {
  assert.deepEqual(cursed.map(r => r.id).sort(), ['bloodOath', 'lunaticMoon', 'nightwalk']);
  assert.ok(BUILD_POOL.every(id => !cursed.some(r => r.id === id)));
  let seen = 0;
  for (let seed = 1; seed <= 300; seed++) for (const reason of ['start', 'stage', 'chest', 'elite']) {
    const g = new Game(() => {}, seed);
    g.rollChoices(reason, reason === 'start' ? BUILD_POOL : undefined);
    const n = g.choices.filter(r => r.cursed).length;
    if (reason === 'start') assert.equal(n, 0);
    assert.ok(n <= 1); seen += n;
  }
  assert.ok(seen > 0);
});

test('cursed relics stop being offered at their copy cap', () => {
  const { game } = arena();
  const offered = id => { for (let i = 0; i < 200; i++) { game.rollChoices('chest'); if (game.choices.some(r => r.id === id)) return true; } return false; };
  for (const [id, max] of [['bloodOath', 2], ['lunaticMoon', 1], ['nightwalk', 2]]) {
    for (let n = 0; n < max; n++) { assert.ok(offered(id), `${id} offered at ${n} copies`); grant(game, id); }
    assert.equal(offered(id), false, `${id} capped at ${max}`);
  }
});

test('Blood Oath Blade multiplies sword damage, stacks, and damage taken applies after armor', () => {
  const { game, player } = arena();
  const e = enemy(game, player.x + 50, { hp: 9999 });
  player.crit = 0; game.hitSet = new Set(); player.combo = 1; player.move = ''; player.attack = .2;
  game.hitTargets(); const base = 9999 - e.hp;
  grant(game, 'bloodOath'); e.hp = 9999; game.hitSet = new Set(); game.hitTargets();
  assert.equal(9999 - e.hp, Math.round(24 * 1.6));
  assert.ok(9999 - e.hp > base);
  grant(game, 'armor'); player.hp = player.maxHp; player.invulnerable = 0;
  game.hurt(20, 1);
  assert.equal(player.maxHp - player.hp, Math.round(20 * .8 * 1.25));
  assert.ok(Math.abs(player.swordMul - 1.6) < 1e-9);
  grant(game, 'bloodOath'); assert.ok(Math.abs(player.takenMul - 1.5625) < 1e-9);
});

test('Lunatic Moon: free Eclipse on a 6 s cooldown, no noMana, no passive MP, hit MP still works', () => {
  const { game, player, events } = arena();
  grant(game, 'lunaticMoon');
  player.mp = 0; enemy(game, player.x + 50, { hp: 9999 }).damage = 0;
  game.magic();
  assert.equal(events.some(x => x.type === 'magic'), true); assert.equal(player.mp, 0);
  advance(game, 5.5, { magic: true });
  assert.equal(events.filter(x => x.type === 'magic').length, 1); assert.equal(events.some(x => x.type === 'noMana'), false);
  advance(game, 1, { magic: true });
  assert.equal(events.filter(x => x.type === 'magic').length, 2);
  player.mp = 0; advance(game, 2); assert.equal(player.mp, 0, 'no passive regeneration');
  game.hitSet = new Set(); player.combo = 1; player.attack = .2; game.hitTargets();
  assert.ok(player.mp > 0, 'hits still pay MP');
});

test('Endless Nightwalk: speed up, dash cooldown floor, max HP floor of 40 and current HP clamped', () => {
  const { game, player } = arena();
  const speed = player.speed;
  grant(game, 'nightwalk');
  assert.ok(Math.abs(player.speed - speed * 1.2) < 1e-9);
  assert.ok(Math.abs(player.dashCooldown - .85 * .6) < 1e-9);
  assert.deepEqual([player.maxHp, player.hp], [75, 75]);
  grant(game, 'nightwalk'); assert.equal(player.maxHp, 50);
  player.maxHp = 60; grant(game, 'dash'); player.dashCooldown = .4; player.maxHp = 50;
  RELICS.find(r => r.id === 'nightwalk').apply(player);
  assert.equal(player.dashCooldown, .35); assert.equal(player.maxHp, 40); assert.ok(player.hp <= 40);
});

test('cursed offers are deterministic per seed', () => {
  const roll = seed => { const g = new Game(() => {}, seed); g.rollChoices('stage'); return g.choices.map(r => r.id).join(); };
  for (let s = 1; s < 20; s++) assert.equal(roll(s), roll(s));
});

// QA regressions for Endless Trial stacking (#22). Written as rules.
function stackedEndless(relicId, count, seed = 5) {
  const events = [], game = new Game(event => events.push(event), seed, 'endless');
  game.start(); game.chooseRelic(game.choices[0].id);
  game.state = 'playing'; game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = []; game.player.invulnerable = 0;
  for (let i = 0; i < count; i++) { game.rollChoices('chest'); game.choices = [RELICS.find(r => r.id === relicId)]; game.chooseRelic(relicId); }
  return { game, player: game.player, events };
}

test('regression: stacked armor never reduces a landed hit to zero damage', () => {
  const { game, player } = stackedEndless('armor', 30);
  const before = player.hp;
  game.hurt(20, 1);
  assert.ok(player.hp < before, `hero took no damage at armor ${player.armor}`);
});

test('regression: repeated dashing cannot keep the hero invulnerable forever after many dash picks', () => {
  const { game, player } = stackedEndless('dash', 30);
  let exposed = 0;
  for (let frame = 0; frame < 20 * 120; frame++) {
    game.update(1 / 120, { dash: frame % 42 === 0 }); // a dash every 0.35 s, the minimum cooldown
    if (player.invulnerable <= 0) exposed++;
  }
  assert.ok(exposed > 0, `hero was invulnerable on every frame (dash shield ${player.dashShield})`);
});

test('regression: stacked haste keeps at least one swing animation (0.24 s) between swings', () => {
  const { game, events } = stackedEndless('haste', 20);
  let last = -Infinity, time = 0, minGap = Infinity;
  for (let frame = 0; frame < 4 * 120; frame++) {
    time = frame / 120;
    const before = events.length;
    game.update(1 / 120, { attack: true });
    if (events.slice(before).some(e => e.type === 'swing')) { minGap = Math.min(minGap, time - last); last = time; }
  }
  assert.ok(minGap >= .24 - 1e-9, `swings ${(minGap * 1000).toFixed(1)} ms apart at attackSpeed ${game.player.attackSpeed}`);
});

test('regression: the elite sighting event says when an elite is a bonus elite (no reward pick)', () => {
  const { game, events } = stackedEndless('edge', 0, 3);
  game.floor = 6;
  const elite = game.spawnEnemy('skeleton', 300, 0);
  game.makeElite(elite, 0).bonus = true;
  game.enemies = [elite];
  game.update(1 / 120, {});
  const notice = events.find(e => e.type === 'elite');
  assert.ok(notice, 'no elite sighting event');
  assert.equal(notice.bonus, true, 'bonus elite sighting must not promise a relic pick');
});

test('regression: dashing while falling cancels the downward velocity again (bc58cca comment swallowed the clamp)', () => {
  const { game, player } = stackedEndless('edge', 0);
  player.dashCd = 0; player.attack = 0; player.grounded = false; player.y = 300; player.vy = 500;
  game.dash();
  assert.equal(player.vy, 0);
});

test('#30 chain lightning: at most one chain per attack, then it rearms', () => {
  const { game, events } = elem('shock');
  const e = enemy(game, 600), n = enemy(game, 700);
  e.shock = 4; n.shock = 4;
  game.chainUsed = false;
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  game.damageEnemy(n, 40, 1, false, false, false, 0);
  assert.equal(events.filter(ev => ev.type === 'reaction' && ev.name === 'chain').length, 1);
  game.chainUsed = false; // next attack
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  assert.equal(events.filter(ev => ev.type === 'reaction' && ev.name === 'chain').length, 2);
});

test('#30 chain gate: a swing re-arms it, an Eclipse cast mid-swing does not', () => {
  const { game, player } = elem('shock');
  player.mp = player.maxMp; player.magicCd = 0;
  game.chainUsed = true;
  game.attack();
  assert.equal(game.chainUsed, false, 'a new swing re-arms the chain');
  game.chainUsed = true; // the swing chained
  game.magic();
  assert.equal(game.chainUsed, true, 'Eclipse must not give the same swing a second chain');
});

test('#30 shock 1v1: with no chain target the shocked enemy takes half the chain damage, once per attack', () => {
  const { game, player, events } = elem('shock');
  const e = enemy(game, 600);
  e.shock = 4; game.chainUsed = false;
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  const zap = Math.round((.35 * player.damage + .12 * 40) * .5);
  assert.equal(e.maxHp - e.hp, 40 + zap);
  const r = events.find(ev => ev.type === 'reaction');
  assert.equal(r.name, 'chain'); assert.equal(r.solo, true);
  const hp0 = e.hp;
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  assert.equal(hp0 - e.hp, 40, 'the solo zap used the attack\'s chain');
});

test('#30 frost: post-thaw immunity shrinks 0.2 s per extra stack, floor 1.2 s', () => {
  const imm = n => elem(...Array(n).fill('frost')).game.thawImmunity();
  assert.equal(imm(1), 2);
  assert.ok(Math.abs(imm(2) - 1.8) < 1e-9);
  assert.equal(imm(5), 1.2); assert.equal(imm(9), 1.2);
});

test('#30 wave + frost: a throw lands one frost hit per enemy across both passes', () => {
  const { game, player, events } = elem('wave', 'frost');
  player.crit = 0;
  const a = enemy(game, 430); a.armor = 99; a.speed = 0;
  combo3(game);
  game.hitSet = new Set();
  advance(game, 3);
  assert.equal(events.filter(ev => ev.type === 'statusTick' && ev.source === 'frost').length, 1);
});

// QA #30: a sword blow that kills a lone shocked enemy runs the solo zap on the corpse, which settles the death a second time.
test('#30 QA regression: a killing blow on a lone shocked enemy credits one kill and emits one kill event', () => {
  const { game, events } = elem('shock');
  const e = enemy(game, 600, { hp: 10 });
  e.shock = 4; game.chainUsed = false;
  const kills = game.kills;
  game.damageEnemy(e, 40, 1, false, false, false, 0);
  assert.equal(e.hp, 0);
  assert.equal(game.kills - kills, 1, 'one kill, not two');
  assert.equal(events.filter(ev => ev.type === 'kill').length, 1);
});

// ---- Castle Descent (#44 step 1) ----
function castle(seed = 42, floor = 1) {
  const events = [];
  const game = new Game(event => events.push(event), seed, 'castle');
  game.start();
  assert.equal(game.state, 'rest');
  game.setWeapon('spear');
  game.descend();
  if (floor > 1) game.loadFloor(floor);
  if (floor === 0) return { game };
  game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = [];
  game.player.invulnerable = 0;
  return { game, player: game.player, events };
}

test('castle: the Vigil asks for a weapon, base stats replace the hero stats, then floor 1 starts', () => {
  const game = new Game(() => {}, 7, 'castle');
  game.start();
  assert.equal(game.state, 'rest');
  assert.equal(game.descend(), false, 'no weapon, no descent');
  assert.equal(game.setWeapon('nope'), false);
  game.setWeapon('twin');
  assert.equal(game.player.reach, 88);
  assert.equal(game.descend(), true);
  assert.equal(game.state, 'playing');
  assert.equal(game.player.blood, 100);
  assert.equal(game.floor, 1);
});

test('castle: floors follow the table, with no chests and tier-based scaling', () => {
  const { game } = castle(42, 0);
  assert.equal(game.enemies.length, 5);
  assert.ok(game.enemies.every(e => e.type === 'skeleton') && game.chests.length === 0);
  game.loadFloor(2);
  assert.equal(game.enemies.length, 5);
  assert.equal(game.enemies.filter(e => e.type === 'shield').length, 2);
  game.loadFloor(3);
  assert.equal(game.enemies.length, 5);
  assert.equal(game.enemies.filter(e => e.type === 'spear').length, 2);
  game.loadFloor(5);
  assert.equal(game.enemies.length, 6);
  assert.equal(game.enemies.filter(e => e.type === 'bat').length, 1);
  assert.ok(game.enemies.filter(e => e.required).length === 2);
  game.loadFloor(8);
  assert.equal(game.enemies.length, 8, '7 plus the bonus elite');
  game.loadFloor(9);
  assert.equal(game.enemies.length, 8, '7 plus the bonus elite');
  assert.ok(game.enemies.some(e => e.elite && e.bonus));
  const e9 = game.enemies.find(e => !e.elite);
  assert.ok(e9.maxHp > game.spawnEnemy(e9.type, 900, 0).maxHp, 'floor 9 uses tier 4');
});

test('castle: sword hits and kills give blood, the skill gives none and costs 18 above 40', () => {
  const { game, player } = castle();
  const target = enemy(game, player.x + 50, { hp: 500 });
  game.attack(); // combo hit 1: -2 swing cost, +3
  assert.equal(player.blood, 101);
  target.hp = 1; target.x = player.x + 50; game.hitSet = new Set(); game.hitTargets();
  assert.equal(player.blood, 101 + 3 + 8, 'hit plus kill');
  player.blood = 100; player.magicCd = 0;
  enemy(game, player.x + 60, { hp: 5 });
  game.magic();
  assert.equal(player.blood, 82, 'skill costs 18 and its hits and kills give nothing');
  player.blood = 39; player.magicCd = 0;
  game.magic();
  assert.equal(player.blood, 39, 'below 40 the skill cannot be cast');
});

test('castle: a swing pays 2 blood as it starts, never below 1, free in frenzy', () => {
  const { game, player, events } = castle();
  game.attack();
  assert.equal(player.blood, 98);
  assert.equal(events.findLast(ev => ev.type === 'swing').cost, 2);
  player.blood = 2; player.attackCd = 0; game.attack();
  assert.equal(player.blood, 1);
  player.attackCd = 0; game.attack();
  assert.equal(player.blood, 1, 'the clamp never kills');
  player.blood = 150; player.frenzy = true; player.attackCd = 0; game.attack();
  assert.equal(player.blood, 150);
  assert.equal(events.findLast(ev => ev.type === 'swing').cost, 0);
});

test('castle: a buffered swing pays only when it fires; the air plunge pays at its press', () => {
  const { game, player } = castle();
  player.attackCd = .1; game.attack();
  assert.equal(player.blood, 100, 'buffered, not swung');
  advance(game, .15);
  assert.equal(player.blood, 98, 'paid when the buffer fires');
  player.grounded = false; player.attackCd = 0; player.plunge = 0; game.attack();
  assert.equal(player.blood, 96);
});

test('castle: light attack damage uses the castle table plus 2 per tier; other modes keep 8 + 2.5 per stage', () => {
  const { game } = castle();
  assert.deepEqual(['skeleton', 'bat', 'shield', 'spear', 'knight'].map(t => game.spawnEnemy(t, 900, 0).damage), [10, 8, 12, 12, 14]);
  assert.equal(game.spawnEnemy('knight', 900, 4).damage, 22);
  assert.equal(new Game(() => {}, 1).spawnEnemy('knight', 900, 2).damage, 13);
});

test('castle: swings are free outside castle mode', () => {
  const game = new Game(() => {}, 5);
  arena(game); game.player.invulnerable = 0;
  const blood = game.player.blood;
  game.attack();
  assert.equal(game.player.blood, blood);
});

test('castle: noMana fires when the skill is refused for low blood', () => {
  const { game, player, events } = castle();
  player.blood = 39;
  game.magic();
  assert.ok(events.some(e => e.type === 'noMana'));
});

test('castle: no healing from drops, and damage comes off blood', () => {
  const { game, player } = castle();
  for (let i = 0; i < 40; i++) game.settle(Object.assign(enemy(game, player.x + 50, { hp: 1 }), { hp: 0 })); // a normal run drops a heal on about 1 in 4
  assert.equal(game.pickups.length, 0);
  player.blood = 100;
  game.hurt(10, 1);
  assert.equal(player.blood, 90);
  assert.equal(player.hp, 100, 'hp is unused');
});

test('castle: blood reaching 200 starts a frenzy that burns to 100 and then ends', () => {
  const { game, player, events } = castle();
  player.blood = 198;
  game.gainBlood(3);
  assert.equal(player.blood, BLOOD_MAX);
  assert.equal(player.frenzy, true);
  assert.equal(events.filter(e => e.type === 'frenzy').length, 1);
  advance(game, 4);
  assert.ok(player.blood < 160 && player.blood > 140, 'about 12 per second');
  assert.equal(player.frenzy, true);
  advance(game, 5);
  assert.equal(player.frenzy, false);
  assert.equal(player.blood, 100);
  assert.equal(events.filter(e => e.type === 'frenzyEnd').length, 1);
});

test('castle: frenzy gains are halved (minimum 1) and damage can end it', () => {
  const { game, player } = castle();
  player.blood = 150; player.frenzy = true;
  game.gainBlood(8); assert.equal(player.blood, 154);
  game.gainBlood(1); assert.equal(player.blood, 155);
  game.hurt(60, 1);
  assert.equal(player.frenzy, false, 'blood fell to 100 or below');
});

test('castle: burn does not advance while paused or choosing a relic', () => {
  const { game, player } = castle();
  player.blood = 200; player.frenzy = true;
  game.state = 'paused'; advance(game, 2);
  game.state = 'upgrade'; advance(game, 2);
  assert.equal(player.blood, 200);
});

test('castle: frenzy carries across a floor change', () => {
  const { game, player } = castle();
  player.blood = 180; player.frenzy = true;
  game.loadFloor(2);
  assert.equal(player.frenzy, true);
  assert.equal(player.blood, 180);
});

test('castle: relic picks come after floors 3, 6 and 9 only, from the slice pool, and restore nothing', () => {
  assert.ok(!SLICE_POOL.includes('vital') && !SLICE_POOL.includes('arcane') && SLICE_POOL.includes('edge'));
  const { game, player } = castle(42, 2);
  game.finishStage();
  assert.equal(game.state, 'playing');
  assert.equal(game.floor, 3, 'floor 2 goes straight on');
  player.blood = 120;
  game.finishStage();
  assert.equal(game.state, 'upgrade');
  assert.ok(game.choices.every(r => SLICE_POOL.includes(r.id)));
  game.chooseRelic(game.choices[0].id);
  assert.equal(game.floor, 4);
  assert.equal(game.state, 'playing');
  assert.equal(player.blood, 120);
});

test('castle: after floor 9 the run ends at the slice-end placeholder', () => {
  const { game, events } = castle(42, 9);
  game.finishStage();
  assert.equal(game.state, 'upgrade');
  game.chooseRelic(game.choices[0].id);
  assert.equal(game.state, 'sliceEnd');
  assert.ok(events.some(e => e.type === 'sliceEnd'));
});

test('castle: dying returns to the Vigil at 100 blood with no relics, then floor 1 again', () => {
  const { game, player, events } = castle(42, 5);
  game.relics.push('edge'); player.damage *= 1.25;
  player.blood = 150; player.frenzy = true;
  game.hurt(500, 1);
  assert.equal(game.state, 'dead');
  assert.equal(player.frenzy, false);
  assert.ok(events.some(e => e.type === 'death'));
  game.enterRest();
  assert.equal(game.state, 'rest');
  assert.equal(player.blood, 100);
  assert.deepEqual(game.relics, []);
  game.setWeapon('heavy');
  game.descend();
  assert.equal(game.floor, 1);
  assert.equal(player.damage, 30, 'relic damage is gone');
});

test('castle: normal mode is untouched by blood rules', () => {
  const { game, player } = arena();
  game.gainBlood(50);
  assert.equal(player.blood, 100);
  game.hurt(10, 1);
  assert.equal(player.hp, 90);
});

test('castle: a dash thrust pays the swing cost, and splitting copies use the floor tier', () => {
  const { game, player } = castle(42, 9);
  player.thrustWindow = .5; player.blood = 100; game.attack();
  assert.equal(player.move, 'thrust'); assert.equal(player.blood, 98);
  const elite = game.spawnEnemy('skeleton', 400, 4); Object.assign(elite, { affix: 'splitting', elite: true });
  const before = game.enemies.length; game.damageEnemy(elite, 1e6, 1, false, false);
  assert.equal(game.enemies.length, before + 2);
  assert.equal(game.enemies.at(-1).damage, game.spawnEnemy(elite.type, 0, 4).damage, 'copies carry tier 4 damage');
});

// ---- Castle heavy attacks (#47 PR B) ----
function heavyFoe(type = 'skeleton', gap = 50, seed = 42) {
  const c = castle(seed);
  c.game.rand = () => 0; // every heavy roll succeeds
  const e = enemy(c.game, c.player.x + gap, { type });
  e.cd = 0; e.dir = -1;
  return { ...c, e };
}
const heavyStrikes = events => events.filter(ev => ev.type === 'enemySwing' && ev.heavy);

test('castle heavy: a cleave kills from 100 blood and is survived at 101, with a long tell and a fixed area', () => {
  for (const [blood, dead] of [[100, true], [101, false]]) {
    const { game, player, events, e } = heavyFoe();
    player.blood = blood;
    advance(game, .02);
    assert.ok(e.heavy && e.tell > .7 && e.warn.kind === 'cleave', 'red tell with a stored area');
    assert.equal(events.filter(ev => ev.type === 'enemyHeavy').length, 1);
    const box = { ...e.warn.box };
    advance(game, .3); assert.deepEqual(e.warn.box, box, 'the area never moves');
    advance(game, .8);
    assert.equal(heavyStrikes(events).length, 1);
    assert.equal(game.state === 'dead', dead);
    if (dead) assert.equal(events.findLast(ev => ev.type === 'death').heavy, true);
    else assert.equal(player.blood, 1);
  }
});

test('castle heavy: elites hit for 130, armor applies, Swift keeps the tell at 0.7 s or more', () => {
  const { game, player, e } = heavyFoe();
  e.elite = true; e.affix = 'swift'; player.blood = 200; player.armor = .8;
  advance(game, .02);
  assert.ok(e.tell >= .65 && e.tell <= .7, 'swift floor 0.7 s');
  advance(game, .8);
  assert.equal(player.blood, 200 - Math.round(HEAVY_DAMAGE * 1.3 * .8));
});

test('castle heavy: sword hits and shots do not cancel the wind-up, Eclipse does', () => {
  const { game, player, e } = heavyFoe();
  player.blood = 150; advance(game, .02);
  const poise = e.poise; game.attack(); advance(game, .1);
  assert.ok(e.heavy && e.tell > 0 && e.poise < poise && e.stun === 0, 'hyper armor: posture still drops, no flinch');
  assert.ok(e.hp < 500, 'damage still lands');
  player.magicCd = 0; game.magic();
  assert.ok(!e.heavy && e.tell === 0 && e.warn === null, 'Eclipse cancels');
});

test('castle heavy: an Eclipse-cancelled heavy still starts the cooldown and the gap, during the tell and during travel', () => {
  for (const [type, wait] of [['skeleton', .02], ['bat', null]]) {
    const { game, player, e } = heavyFoe(type, 50);
    if (type === 'bat') e.y = FLOOR - 95;
    player.blood = 200; player.invulnerable = 99; advance(game, .02);
    assert.ok(e.heavy, type + ' winds up');
    if (wait === null) { for (let i = 0; i < 240 && !(e.strikeT > 0); i++) advance(game, 1 / 120); advance(game, .1); assert.ok(e.strikeT > 0, 'mid-travel'); }
    player.magicCd = 0; game.magic();
    advance(game, .1);
    assert.ok(!e.heavy && e.heavyCd >= HEAVY_CD - .2 && e.token === '' && game.gaps.length > 0, type + ' cooldown set and token in its retake gap on cancel');
  }
});

test('castle heavy: hit events carry punish only while the enemy recovers from its heavy', () => {
  const { game, player, events, e } = heavyFoe();
  player.blood = 200; player.invulnerable = 99; advance(game, .02); e.cd = 1e9; // no light attacks after the heavy
  game.damageEnemy(e, 1, 1, false, false); // during the tell
  advance(game, .9);
  game.damageEnemy(e, 1, 1, false, false); // recovering
  advance(game, 2);
  game.damageEnemy(e, 1, 1, false, false); // recovered
  assert.deepEqual(events.filter(ev => ev.type === 'hit').map(ev => ev.punish), [false, true, false]);
});

test('castle heavy: recovery lasts about a second, punish hits pay +2 and double poise damage, heavy cooldown is 3 s', () => {
  const { game, player, events, e } = heavyFoe();
  player.blood = 200; player.invulnerable = 99; advance(game, .02);
  advance(game, .9);
  assert.equal(heavyStrikes(events).length, 1);
  assert.ok(e.recover > 0 && e.punishable && e.heavyCd > 2.5, 'recovering with the cooldown running');
  player.blood = 100; player.frenzy = false; const poise = e.poise;
  game.hitSet = new Set(); player.combo = 1; player.move = ''; game.hitTargets();
  assert.equal(player.blood, 105, '+3 hit +2 punish');
  assert.equal(poise - e.poise, 34, 'poise damage doubled (17 x 2)');
  advance(game, 2); // recovery over, heavy cooldown still running
  assert.ok(!e.heavy);
  advance(game, 1.5);
  assert.equal(heavyStrikes(events).length, 1, 'still on cooldown (light attacks only)');
  advance(game, 2.5);
  assert.equal(heavyStrikes(events).length, 2, 'the next heavy comes only after the 3 s cooldown');
  const { game: n, player: np, events: ne, e: ne1 } = (() => { const c = castle(); c.game.rand = () => 0; const x = enemy(c.game, c.player.x + 50); x.cd = 0; x.heavyCd = 0; return { ...c, e: x }; })();
  np.blood = 100; n.hitSet = new Set(); np.combo = 1; n.hitTargets();
  assert.equal(np.blood, 103, 'no bonus on a normal hit');
});

test('castle heavy: at most one live heavy near the hero and strikes are at least 1.1 s apart', () => {
  const { game, player, events } = castle();
  game.rand = () => 0; player.invulnerable = 1e9; player.blood = 200;
  for (const dx of [45, 55, 65]) { const e = enemy(game, player.x + dx, { hp: 1e6 }); e.cd = 0; e.dir = -1; }
  const times = []; let seen = 0, maxLive = 0;
  for (let i = 0; i < 120 * 14; i++) {
    game.update(1 / 120, {}); player.blood = 200;
    maxLive = Math.max(maxLive, game.enemies.filter(e => e.heavy && (e.tell > 0 || e.strikeT > 0)).length);
    const n = heavyStrikes(events).length; if (n > seen) { seen = n; times.push(game.time); }
  }
  assert.ok(times.length >= 3, 'all three get a turn');
  assert.equal(maxLive, 1);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1.1 - 1e-6, 'strikes are spaced');
});

test('castle heavy: a visible whiff raises the chance, and the roll uses game.rand()', () => {
  for (const [whiff, heavy] of [[0, false], [.4, true]]) {
    const { game, player, e } = heavyFoe();
    game.rand = () => .3; player.whiff = whiff;
    game.update(1 / 120, {});
    assert.equal(e.heavy, heavy, `skeleton heavy chance with whiff=${whiff}`);
  }
  const { game, player, e } = heavyFoe('knight', 60);
  game.rand = () => .3; player.frenzy = true; player.blood = 150;
  game.update(1 / 120, {});
  assert.ok(e.heavy, 'knight reads frenzy');
  const c = heavyFoe('skeleton'); c.player.whiff = 0; c.player.dashCd = .5; c.game.rand = () => .45; c.game.update(1 / 120, {});
  assert.ok(c.e.heavy, 'a spent dash is read');
  const f = heavyFoe(); f.player.dashCd = .5; f.player.dash = .1; f.game.rand = () => .45; f.game.update(1 / 120, {});
  assert.ok(!f.e.heavy, 'a dash in progress is not "spent"');
});

test('castle heavy: a swing that connects clears the whiff flag, a miss leaves it', () => {
  const { game, player } = castle();
  game.attack(); assert.ok(player.whiff > 0);
  const { game: g2, player: p2 } = castle(); enemy(g2, p2.x + 50); g2.attack();
  assert.equal(p2.whiff, 0);
});

test('castle heavy: lunge reaches 230 px and a jump clears it; dive and rush hit a hero who stays and miss one who moves or jumps', () => {
  let c = heavyFoe('spear', 230); c.player.blood = 150; advance(c.game, .02); assert.equal(c.e.warn.kind, 'lunge');
  advance(c.game, .95); assert.equal(c.player.blood, 50, 'the old safe distance is hit');
  c = heavyFoe('spear', 230); c.player.blood = 150; advance(c.game, .02);
  for (let i = 0; i < 120; i++) { c.player.y = FLOOR - 70; c.player.vy = 0; c.game.update(1 / 120, {}); }
  assert.equal(c.player.blood, 150, 'jumping clears it');
  c = heavyFoe('bat', 100); c.e.y = FLOOR - 95; c.player.blood = 150; advance(c.game, .02); assert.equal(c.e.warn.kind, 'dive');
  advance(c.game, 1.4); assert.equal(c.player.blood, 50);
  c = heavyFoe('bat', 100); c.e.y = FLOOR - 95; c.player.blood = 150; advance(c.game, .02); c.player.x += 200;
  advance(c.game, 1.4); assert.equal(c.player.blood, 150, 'stepping aside dodges the dive');
  c = heavyFoe('shield', 150); c.player.blood = 150; advance(c.game, .02); assert.equal(c.e.warn.kind, 'rush');
  advance(c.game, 1.4); assert.equal(c.player.blood, 50);
  c = heavyFoe('shield', 150); c.player.blood = 150; advance(c.game, .02);
  for (let i = 0; i < 160; i++) { c.player.y = FLOOR - 80; c.player.vy = 0; c.game.update(1 / 120, {}); }
  assert.equal(c.player.blood, 150, 'jumping over the rush');
});

test('castle heavy: a dash through the strike avoids it and pays the perfect dodge', () => {
  const { game, player, events } = heavyFoe();
  player.blood = 100; advance(game, .02); advance(game, .83);
  game.dash(); advance(game, .1);
  assert.ok(heavyStrikes(events).length === 1 && game.state === 'playing');
  assert.ok(events.some(ev => ev.type === 'perfectDash'));
});

test('castle heavy: normal runs and Endless Trial never start heavies', () => {
  for (const mode of ['normal', 'endless']) {
    const events = [];
    const game = new Game(ev => events.push(ev), 42, mode);
    game.start(); game.state = 'playing'; game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = [];
    game.rand = () => 0;
    const e = enemy(game, game.player.x + 50); e.cd = 0; e.dir = -1; game.player.invulnerable = 99; game.player.hp = game.player.maxHp = 1e6;
    advance(game, 3);
    assert.ok(!events.some(ev => ev.type === 'enemyHeavy' || ev.heavy), mode);
  }
});

test('castle heavy: a rush stopped by a barricade stands still through recovery (no vault)', () => {
  const { game, player, e } = heavyFoe('shield', 170);
  player.blood = 200; player.invulnerable = 99; player.x = 380; player.y = FLOOR;
  game.obstacles = [{ type: 'barricade', x: 440, y: FLOOR, w: 24, h: 40, hp: 50 }];
  e.x = 550; e.y = FLOOR;
  while (!(e.heavy && e.recover > 0)) advance(game, .01);
  const { x, y } = e;
  advance(game, .5);
  assert.ok(e.heavy && e.recover > 0, 'still recovering');
  assert.equal(e.x, x); assert.equal(e.y, y); assert.ok(!e.vault);
});

test('castle heavy: recovery keeps counting down while hit-stunned', () => {
  const { game, player, e } = heavyFoe('knight', 50);
  player.blood = 200; player.invulnerable = 99;
  e.hp = e.maxHp = 1e6; e.maxPoise = e.poise = 1e6;
  while (!(e.recover > 0)) advance(game, .01);
  let t = 0;
  while (e.heavy && t < 5) { game.damageEnemy(e, 1, 1, false, false, false, 1); game.freeze = 0; advance(game, .05); t += .05; }
  assert.ok(!e.heavy && t < 2.5, 'recovery ends on time despite repeated hits');
});

// ---- Castle combat systems (#50 PR 1): hyper armor, posture, steady, tokens, glint, delayed heavies, skeleton and shield kits ----
function lightFoe(type = 'skeleton', gap = 40, floor = 1) {
  const c = castle(42, floor);
  c.game.rand = () => .99; // heavy and read rolls fail: only light attacks
  const e = enemy(c.game, c.player.x + gap, { type });
  e.cd = 0; e.dir = -1;
  return { ...c, e };
}
const holders = game => game.enemies.filter(e => e.hp > 0 && e.token);

test('castle hyper armor: a hit during a light tell lowers posture by half but does not cancel, flinch or knock back', () => {
  const { game, player, e, events } = lightFoe();
  player.blood = 150; advance(game, .02);
  assert.ok(e.tell > 0 && !e.heavy, 'a light tell started');
  const tell = e.tell, poise = e.poise;
  game.damageEnemy(e, 5, 1, false, false, false, 10);
  assert.ok(e.tell > 0 && e.tell <= tell && e.stun === 0 && e.vx === 0 && e.steady === 0, 'no cancel, stun, knockback or steady');
  assert.equal(poise - e.poise, 5, 'posture damage x0.5 during a tell');
  advance(game, .6);
  assert.ok(events.some(ev => ev.type === 'enemySwing') && player.blood < 150, 'the attack still lands');
});

test('castle posture: a break cancels the attack, frees the token and stuns; the first sword hit in the stun is a riposte', () => {
  const { game, player, e, events } = lightFoe();
  player.blood = 150; player.combo = 0; advance(game, .02);
  assert.equal(e.token, 'light'); assert.equal(holders(game).length, 1);
  e.poise = 1; game.damageEnemy(e, 1, 1, false, false, false, 10);
  assert.ok(e.tell === 0 && e.warn === null && e.stun === STAGGER_STUN && e.riposte, 'cancelled and stunned');
  const st = events.find(ev => ev.type === 'stagger');
  assert.ok(st.cancelled === true && st.enemy === 'skeleton');
  game.freeze = 0; advance(game, .02);
  assert.equal(e.token, ''); assert.ok(game.gaps.length > 0, 'token freed, retake gap running');
  player.blood = 100; const hp = e.hp; player.combo = 1; player.move = ''; player.dir = 1; game.hitSet = new Set(); game.hitTargets();
  assert.equal(hp - e.hp, Math.round(player.damage * 1.5), 'riposte damage x1.5');
  assert.equal(player.blood, 100 + 3 + 5, 'hit plus riposte blood');
  assert.equal(events.filter(ev => ev.type === 'riposte').length, 1);
  const hp2 = e.hp; game.hitSet = new Set(); game.hitTargets();
  assert.equal(hp2 - e.hp, player.damage, 'only the first hit is a riposte');
  assert.equal(events.filter(ev => ev.type === 'riposte').length, 1);
});

test('castle posture: refills only after 1.5 s without posture damage, 25% of max per second', () => {
  const { game, e } = lightFoe('skeleton', 300);
  e.cd = 1e9;
  game.damageEnemy(e, 1, 1, false, false, false, 20);
  const low = e.poise; assert.ok(low < e.maxPoise);
  advance(game, 1.4); assert.equal(e.poise, low, 'no regeneration before 1.5 s');
  advance(game, .6); assert.ok(e.poise > low, 'regenerating');
  const mid = e.poise; advance(game, 1);
  assert.ok(e.poise - mid > e.maxPoise * .2, 'about a quarter of max per second');
  game.damageEnemy(e, 1, 1, false, false, false, 5); const hit = e.poise; advance(game, 1);
  assert.equal(e.poise, hit, 'a new hit restarts the wait');
});

test('castle flinch budget: a hit flinches only while steady is 0, and each flinch sets steady', () => {
  const { game, e } = lightFoe('skeleton', 300);
  e.cd = 1e9;
  game.damageEnemy(e, 1, 1, false, false, false, 1);
  assert.ok(e.stun > 0 && e.steady > e.stun, 'first hit flinches and sets steady');
  advance(game, .3); assert.equal(e.stun, 0); assert.ok(e.steady > 0);
  const vx = e.vx, poise = e.poise;
  game.damageEnemy(e, 1, 1, false, false, false, 4);
  assert.ok(e.stun === 0 && e.vx === vx && e.poise < poise, 'steady: damage and posture, no stun or knockback');
  advance(game, 1);
  assert.equal(e.steady, 0);
  game.damageEnemy(e, 1, 1, false, false, false, 1);
  assert.ok(e.stun > 0, 'flinches again once steady has run out');
  const { game: g, e: r } = lightFoe(); // recovery hits never flinch
  advance(g, .02 + .5 + .05); assert.ok(r.recover > 0 && r.punishable, 'light recovery');
  g.damageEnemy(r, 1, 1, false, false, false, 1);
  assert.equal(r.stun, 0);
});

test('castle tokens: never more than 2 holders or 1 heavy holder, and enemies keep taking turns', () => {
  const { game, player, events } = castle(42, 2);
  game.enemies = [];
  game.rand = (r => () => { r = (r * 16807) % 2147483647; return r / 2147483647; })(7);
  player.invulnerable = 1e9; player.blood = 200;
  for (const [type, dx] of [['skeleton', 50], ['skeleton', 70], ['shield', 90], ['skeleton', -60], ['shield', -90]]) { const e = enemy(game, player.x + dx, { type, hp: 1e6 }); e.cd = 0; e.maxPoise = e.poise = 1e6; }
  let maxHolders = 0, maxHeavy = 0, maxBusy = 0;
  for (let i = 0; i < 120 * 25; i++) {
    game.update(1 / 120, {}); player.blood = 200;
    maxHolders = Math.max(maxHolders, holders(game).length);
    maxHeavy = Math.max(maxHeavy, holders(game).filter(e => e.token === 'heavy').length);
    maxBusy = Math.max(maxBusy, game.enemies.filter(e => game.attacking(e) || e.recover > 0).length);
  }
  assert.ok(maxHolders === ATTACK_TOKENS && maxHeavy <= 1 && maxBusy <= ATTACK_TOKENS, `holders ${maxHolders}, heavy ${maxHeavy}, busy ${maxBusy}`);
  assert.ok(events.filter(ev => ev.type === 'enemyTell' || ev.type === 'enemyHeavy').length >= 6, 'attacks keep coming');
  assert.ok(events.some(ev => ev.type === 'enemyHeavy'), 'a heavy was rolled');
});

test('castle tokens: a starved enemy outranks one in front of the hero', () => {
  for (const [wait, winner] of [[0, 'front'], [STARVED + 1, 'behind']]) {
    const { game, player } = castle();
    game.rand = () => .99; player.dir = 1;
    const hold = enemy(game, player.x + 300); Object.assign(hold, { token: 'light', tell: 5, cd: 1e9 }); // one of the two tokens is taken
    const front = enemy(game, player.x + 40), behind = enemy(game, player.x - 40);
    Object.assign(front, { cd: 0, dir: -1 }); Object.assign(behind, { cd: 0, dir: 1, wait });
    game.update(1 / 120, {});
    assert.equal(front.token === 'light', winner === 'front');
    assert.equal(behind.token === 'light', winner === 'behind');
    assert.ok(holders(game).length <= ATTACK_TOKENS);
  }
});

test('castle on-screen rule: no tell starts beyond 320 px left or 560 px right of the hero', () => {
  const { game, player } = castle();
  player.x = 800; game.rand = () => .99;
  for (const [dx, ok] of [[559, true], [561, false], [-319, true], [-321, false]]) assert.equal(game.canWindUp(enemy(game, player.x + dx)), ok, `dx ${dx}`);
  const mage = enemy(game, player.x - 455, { type: 'mage' }); mage.cd = 0;
  const near = enemy(game, player.x + 330, { type: 'mage' }); near.cd = 0;
  advance(game, 1);
  assert.equal(mage.tell, 0, 'a mage off screen to the left never starts a tell');
  assert.ok(near.tell > 0 || near.cd > 0, 'on screen to the right it does');
});

test('castle heavies: never delayed on floors 1-4, delayed only after the heavy was met on an earlier floor (floors 5+)', () => {
  const tellOf = (floor, type) => {
    const c = castle(42, floor); c.game.rand = () => 0;
    const e = enemy(c.game, c.player.x + (type === 'spear' ? 150 : 50), { type }); e.cd = 0; e.dir = -1;
    advance(c.game, .02);
    return { e, heavyEvent: c.events.find(ev => ev.type === 'enemyHeavy') };
  };
  for (const floor of [1, 2, 3, 4]) { const { e, heavyEvent } = tellOf(floor, 'skeleton'); assert.ok(e.heavy && !e.delayed && heavyEvent.delayed === false && e.tell < .9, `floor ${floor}`); }
  const five = tellOf(5, 'skeleton');
  assert.ok(five.e.delayed && five.heavyEvent.delayed === true && five.e.tell > 1.2, 'floor 5: a cleave met on floor 1 may be delayed (rolled with game.rand())');
  assert.ok(!tellOf(5, 'spear').e.delayed, 'a lunge is first met on floor 5, so it is never delayed there');
  assert.ok(tellOf(6, 'spear').e.delayed);
  assert.ok(tellOf(8, 'skeleton').e.delayed);
});

test('castle glint: every heavy flashes exactly 0.4 s before contact, delayed or not', () => {
  for (const floor of [1, 5]) {
    const c = castle(42, floor); c.game.rand = () => 0; c.player.invulnerable = 99;
    const e = enemy(c.game, c.player.x + 50); e.cd = 0; e.dir = -1;
    let glintAt = null, strikeAt = null;
    for (let i = 0; i < 120 * 3 && strikeAt === null; i++) {
      c.game.update(1 / 120, {});
      if (glintAt === null && c.events.some(ev => ev.type === 'enemyGlint')) { glintAt = c.game.time; assert.ok(e.glint > 0); }
      if (c.events.some(ev => ev.type === 'enemySwing' && ev.heavy)) strikeAt = c.game.time;
    }
    assert.ok(Math.abs(strikeAt - glintAt - .4) <= 1 / 120 + 1e-9, `floor ${floor}: ${strikeAt - glintAt}`);
    assert.equal(c.events.filter(ev => ev.type === 'enemyGlint').length, 1);
    assert.equal(c.game.floor >= 5, c.events.find(ev => ev.type === 'enemyHeavy').delayed);
  }
});

test('castle skeleton: slash ends in a punishable recovery that holds the token; a recovery hit gives +2 and x2 posture, with no flinch', () => {
  const { game, player, e } = lightFoe();
  player.blood = 150; advance(game, .02 + .5 + .05);
  assert.ok(e.recover > 0 && e.punishable && e.token === 'light' && e.tell <= 0);
  player.blood = 100; const poise = e.poise; player.combo = 1; player.move = ''; player.dir = 1; game.hitSet = new Set(); game.hitTargets();
  assert.equal(player.blood, 105); assert.equal(poise - e.poise, 34); assert.equal(e.stun, 0);
  e.cd = 9; advance(game, .6); // no next slash, so the release is visible
  assert.ok(e.recover === 0 && !e.punishable);
  advance(game, .02); assert.equal(e.token, '');
});

test('castle skeleton: stepcut backsteps with armor, then lunges along a path fixed at tell start', () => {
  const { game, player, e, events } = lightFoe('skeleton', 95);
  game.rand = () => 0; e.dir = -1; player.blood = 150; e.heavyCd = HEAVY_CD; // cleave cooling down: rolls first at this distance
  game.update(1 / 120, { right: true });
  assert.equal(e.move, 'stepcut'); assert.ok(e.stepT > 0 && e.token === 'light');
  advance(game, .05);
  const x = e.x; game.damageEnemy(e, 1, 1, false, false, false, 2);
  assert.ok(e.stun === 0 && e.stepT > 0, 'hyper armor in the backstep');
  advance(game, .3); assert.ok(e.x > x, 'steps away from the hero');
  assert.ok(e.tell > 0 && e.warn.kind === 'stepcut', 'then the tell');
  const box = { ...e.warn.box }, to = e.warn.to; player.x -= 60; advance(game, .2);
  assert.deepEqual(e.warn.box, box); assert.equal(e.warn.to, to);
  player.x += 60; player.invulnerable = 0; advance(game, .7);
  assert.ok(events.some(ev => ev.type === 'enemySwing' && ev.kind === 'stepcut'));
  assert.ok(player.blood < 150, 'a hero who stays in the box is cut');
});

test('castle shield: two blocked hits within 1 s trigger a counter shove (tell, 120 px push, recovery)', () => {
  const { game, player, e, events } = lightFoe('shield', 50);
  player.blood = 150; player.dir = 1; player.x = 600; e.x = 650;
  game.damageEnemy(e, 5, 1, false, false, true, 5);
  assert.equal(e.counterT, 0, 'one block is not enough');
  game.freeze = 0; game.damageEnemy(e, 5, 1, false, false, true, 5);
  assert.ok(e.counterT > 0);
  game.freeze = 0; e.x = player.x + 50; e.dir = -1; e.cd = 0; game.update(1 / 120, {});
  assert.ok(e.move === 'counter' && e.tell > .4 && e.token === 'light', 'counter tell');
  const x = player.x; advance(game, .5);
  assert.ok(events.some(ev => ev.type === 'enemySwing' && ev.kind === 'counter'));
  assert.ok(player.blood < 150 && x - player.x >= 110, `hero shoved ${x - player.x}`);
  assert.ok(e.recover > 0 && e.punishable);
  const { game: g, e: s } = lightFoe('shield', 50);
  g.damageEnemy(s, 5, 1, false, false, true, 5); advance(g, 1.2); g.damageEnemy(s, 5, 1, false, false, true, 5);
  assert.equal(s.counterT, 0, 'blocks more than 1 s apart do not count');
});

test('castle spacing: without a token a melee enemy backs off to just outside its probe range and never walks into the hero', () => {
  const { game, player, e } = lightFoe('skeleton', 50);
  e.cd = 1e9; player.x = 600; e.x = 650;
  advance(game, 1.5);
  const d = e.x - player.x;
  assert.ok(d >= 100 && d <= 140 && e.tell === 0, `holds at ${d}`);
  player.x = e.x - 330; advance(game, 3);
  assert.ok(e.x - player.x >= 100 && e.x - player.x <= 140, 'steps in when the hero backs off');
});

test('castle facing: a minion locked in a tell does not turn; outside attacks it turns after its re-face delay', () => {
  const { game, player, e } = lightFoe('skeleton', 100);
  e.cd = 1e9; e.dir = 1; advance(game, .1);
  assert.equal(e.dir, 1, 'still facing away inside the 0.15 s delay');
  advance(game, .1); assert.equal(e.dir, -1);
  const c = lightFoe(); advance(c.game, .02); assert.ok(c.e.tell > 0);
  c.player.x = c.e.x + 100; advance(c.game, .1);
  assert.equal(c.e.dir, -1, 'facing locked at tell start');
});

test('castle skeleton: a failed cleave roll does not block the stepcut roll', () => {
  const { game, player, e } = lightFoe('skeleton', 95);
  let n = 0; game.rand = () => [.99, 0][n++] ?? 0; // cleave roll fails, stepcut roll succeeds
  e.dir = -1; player.blood = 150;
  game.update(1 / 120, { right: true });
  assert.ok(e.rollT > 0, 'the cleave roll failed');
  assert.equal(e.move, 'stepcut');
});

test('castle mash (QA 50 PR 1): a fresh skeleton in spear reach starts a tell or hits back before a stationary hold-attack kills it', () => {
  // Regression: spawn cooldown (1-2 s) keeps a fresh skeleton in the hold ring (112-132 px), inside spear reach (~141 px), so it dies to pokes with no tell.
  const { game, player, events } = castle(42, 1);
  game.spawnEnemy('skeleton', player.x + 120, game.stage);
  const e = game.enemies.at(-1); e.dir = -1;
  for (let time = 0; time < 3 && e.hp > 0; time += 1 / 120) game.update(1 / 120, { attack: true });
  const tells = events.filter(ev => ev.type === 'enemyTell' && ev.enemy === 'skeleton').length;
  assert.ok(tells > 0 || player.blood < 100, `no tell and no damage taken (hp ${Math.round(e.hp)}, blood ${Math.round(player.blood)})`);
});
