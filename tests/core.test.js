import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';

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

// QA #62 PR 1 (P2): a posture-broken ally is never covered, even while the shield braces (0.9 s); the brace row used to skip the interpose reset.
test('shield brain: an interposing shield stops covering a posture-broken spear, even while it is bracing', () => {
  const { game } = castle(42, 5, true);
  const shield = enemy(game, 600, { type: 'shield' }), spear = enemy(game, 680, { type: 'spear' });
  Object.assign(shield, { dir: -1, interposing: true, interposeFor: spear, braceT: .6 });
  Object.assign(spear, { dir: -1, recover: 1, stun: 1.5 });
  game.player.x = 500;
  assert.equal(game.coverFor(spear), null, 'a stunned ally is not covered');
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
function castle(seed = 42, floor = 1, apex = false) { // apex off by default: the pre-#66 skeleton rules stay covered; apex tests pass true
  const events = [];
  const game = new Game(event => events.push(event), seed, 'castle');
  game.apex = apex;
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

test('castle heavy: an elite hits for a flat 100 (no x1.3), armor applies, and it rolls no affix', () => {
  const { game, player, e } = heavyFoe();
  game.makeElite(e, 0); player.blood = 200; player.armor = .8;
  assert.equal(e.affix, null); assert.equal(e.damage, game.spawnEnemy('skeleton', 900, 0).damage, 'no damage bonus');
  advance(game, 1.8);
  assert.equal(player.blood, 200 - Math.round(HEAVY_DAMAGE * .8));
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
  assert.equal(e.recover, 0, 'recovery over');
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
  { const n = lightFoe('shield', 50); Object.assign(n.player, { frenzy: true, weapon: 'heavy', blood: 150, x: 600 }); Object.assign(n.e, { x: 650, dir: -1, move: 'counter', warn: { box: { x: 500, y: FLOOR - 100, w: 200, h: 120 } } });
    const nx = n.player.x; n.game.enemyAttack(n.e); assert.ok(n.player.debt > 0, 'the hit landed'); assert.ok(Math.abs(n.player.x - nx) < 1, 'numb hero is not shoved'); }
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

test('castle poke: the answer to a poke from 90 px never hits a stationary hero without a readable tell', () => {
  // A provoked skeleton may answer with its heavy cleave (box 10-125 px). That is fine only when it is fully telegraphed: enemyHeavy at least 0.85 s
  // and enemyGlint 0.4 s before the hit. Seed 11 at 90 px reproduces the cleave answer.
  const events = [];
  let steps = 0;
  const game = new Game(event => events.push({ ...event, at: steps }), 11, 'castle'); game.apex = false;
  game.start(); game.setWeapon('spear'); game.descend(); game.loadFloor(1);
  game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = []; game.player.invulnerable = 0;
  const player = game.player; player.blood = 100;
  game.spawnEnemy('skeleton', player.x + 90, game.stage);
  const e = game.enemies.at(-1); e.dir = -1; e.cd = 0; e.poiseHit = 0;
  const tick = input => { steps++; game.update(1 / 120, input); };
  tick({ attack: true });
  for (let i = 0; i < 1.5 * 120; i++) { game.traps = []; tick({}); }
  const hits = events.filter(ev => ev.type === 'hurt');
  assert.ok(hits.every(h => h.heavy), 'no light hit on a stationary hero');
  for (const h of hits) {
    const heavy = events.filter(ev => ev.type === 'enemyHeavy' && ev.at <= h.at).at(-1), glint = events.filter(ev => ev.type === 'enemyGlint' && ev.at <= h.at).at(-1);
    assert.ok(heavy && (h.at - heavy.at) / 120 >= .85 - 1e-9, 'a heavy tell of at least 0.85 s came first');
    assert.ok(glint && Math.abs((h.at - glint.at) / 120 - .4) <= 1 / 120 + 1e-9, 'the glint came 0.4 s before the hit');
  }
});

test('castle poke: one answer per poke (a landing poke arms exactly one tell)', () => {
  const { game, player, events } = castle(42, 1);
  game.rand = () => .99; // no extra rolls
  const e = enemy(game, player.x + 130, { hp: 1e6 }); e.cd = 0; e.heavyCd = 99; e.dir = -1; e.maxPoise = e.poise = 1e6;
  const tells = () => events.filter(ev => ev.type === 'enemyTell' && ev.enemy === 'skeleton').length;
  game.update(1 / 120, { attack: true }); // one spear poke lands at 130 px
  assert.ok(e.provoke > 0, 'armed');
  advance(game, .3);
  assert.equal(tells(), 1); assert.equal(e.provoke, 0, 'the tell start spends the arming');
  advance(game, 1.2); assert.equal(tells(), 1, 'no second tell from the same poke');
  e.cd = 99; e.token = ''; player.x = e.x - 100; player.dir = 1; game.hitSet = new Set(); player.combo = 1; player.move = ''; game.hitTargets();
  advance(game, .3); assert.equal(tells(), 2, 'a second landing poke draws a second tell despite the cooldown');
});

// --- The Gate Warden (floor 10, #50 section 5) ---
function warden(wx = 1000, hx = 940) {
  const t = castle(42, WARDEN_FLOOR), b = t.game.spawnWarden(wx);
  Object.assign(t.player, { x: hx }); Object.assign(b, { engaged: true, cd: 99, dir: -1 }); // cd 99: it never picks a move by itself
  return { ...t, b };
}
const hit = (game, b, n = 10) => game.damageEnemy(b, n, 1, false, false, false, 17);

test('warden: floor 10 is the Warden alone in the boss arena, with its base stats and fresh fight stats', () => {
  const { game } = castle(42, 9);
  game.finishStage(); game.chooseRelic(game.choices[0].id);
  assert.equal(game.floor, WARDEN_FLOOR); assert.equal(game.state, 'playing');
  assert.equal(game.enemies.length, 1);
  const b = game.enemies[0];
  assert.ok(b.warden && b.required);
  assert.deepEqual([b.maxHp, b.speed, b.superArmor, b.superArmorMax], [520, 75, ARMOR_MAX, 100]);
  assert.equal(game.worldWidth, STAGES[4].width); assert.equal(game.platforms.length, 2);
  assert.deepEqual(game.fightStats, { gained: 0, taken: 0, time: 0, breaks: 0, frenzies: 0 });
  assert.equal(new Game(() => {}, 1).loadFloor(KING_FLOOR), false, 'only Castle Descent has the castle King floor');
});

test('warden: normal and endless runs never spawn it', () => {
  const g = new Game(() => {}, 7); g.loadStage(4);
  const king = g.enemies.find(e => e.type === 'boss');
  assert.ok(king && !king.warden && king.maxHp === 900);
  const { game } = castle(42, 3);
  assert.ok(!game.enemies.some(e => e.warden) && game.fightStats === null);
});

test('warden gauge: normal hits change nothing, Eclipse chips 25 and four break it, a frenzy hit breaks at once', () => {
  const { game, player, events, b } = warden();
  hit(game, b);
  assert.equal(b.superArmor, 100);
  for (let i = 0; i < 3; i++) { player.magicCd = 0; game.magic(); }
  assert.equal(b.superArmor, 25);
  assert.equal(events.filter(e => e.type === 'armorChip').length, 3);
  assert.equal(events.find(e => e.type === 'armorChip').value, 25);
  player.magicCd = 0; game.magic();
  assert.equal(b.superArmor, 0); assert.ok(events.some(e => e.type === 'armorBreak'));
  const t2 = warden(); t2.player.frenzy = true; t2.player.blood = 150;
  hit(t2.game, t2.b);
  assert.equal(t2.b.superArmor, 0); assert.ok(t2.events.some(e => e.type === 'armorBreak'));
  assert.equal(t2.game.fightStats.breaks, 1);
});

test('warden gauge, phase 2: a frenzy hit chips FRENZY_CHIP and only breaks at 0; Eclipse still chips 25; the lock still holds', () => {
  const { game, player, events, b } = warden();
  b.bossPhase = 2; player.frenzy = true; player.blood = 190;
  hit(game, b);
  assert.equal(b.superArmor, ARMOR_MAX - FRENZY_CHIP); assert.ok(!events.some(e => e.type === 'armorBreak'));
  assert.equal(events.filter(e => e.type === 'armorChip').at(-1).value, FRENZY_CHIP);
  player.frenzy = false; player.magicCd = 0; game.magic();
  assert.equal(b.superArmor, ARMOR_MAX - FRENZY_CHIP - 25, 'Eclipse out of frenzy still chips 25');
  player.frenzy = true; player.blood = 190; hit(game, b);
  assert.equal(b.superArmor, 7); assert.ok(!events.some(e => e.type === 'armorBreak'));
  hit(game, b);
  assert.equal(b.superArmor, 0); assert.equal(events.filter(e => e.type === 'armorBreak').length, 1);
  advance(game, BREAK_STUN + .2); b.cd = 99; // + the break's hit-stop
  assert.equal(b.superArmor, ARMOR_MAX); assert.ok(b.armorLock > 0);
  player.frenzy = true; player.blood = 190; hit(game, b);
  assert.equal(b.superArmor, ARMOR_MAX, 'no chip while locked');
});

test('warden break: cancels the move, knocks it 140 px back, stuns 1.8 s at x1.5 damage, then refills and locks for 2.5 s', () => {
  const { game, player, events, b } = warden(1000, 900);
  player.invulnerable = 99; // the Warden may act again between the stun and the lock
  game.wardenStart(b, 'slam');
  assert.ok(b.tell > 0 && b.warn);
  player.frenzy = true; player.blood = 150;
  const x0 = b.x, hp0 = b.hp;
  hit(game, b, 10);
  assert.equal(b.tell, 0); assert.equal(b.warn, null); assert.equal(b.move, ''); assert.equal(b.heavy, false);
  assert.equal(b.hp, hp0 - 10, 'the breaking hit is not yet x1.5');
  assert.ok(Math.abs(b.stun - BREAK_STUN) < 1e-9);
  advance(game, .01); hit(game, b, 10);
  assert.equal(b.hp, hp0 - 10 - 15, 'x1.5 during the stun');
  advance(game, .6);
  assert.ok(Math.abs(b.x - x0 - 140) < 10, `knocked back ~140 px (${b.x - x0})`);
  assert.equal(b.superArmor, 0);
  advance(game, BREAK_STUN); b.cd = 99;
  assert.equal(b.superArmor, ARMOR_MAX); assert.ok(b.armorLock > 0 && b.armorLock <= ARMOR_LOCK);
  assert.ok(events.some(e => e.type === 'armorRestore'));
  hit(game, b); // frenzy hit inside the lock
  assert.equal(b.superArmor, ARMOR_MAX, 'no break while locked');
  player.magicCd = 0; game.magic(); assert.equal(b.superArmor, ARMOR_MAX, 'no chip while locked');
  advance(game, ARMOR_LOCK + .1); player.frenzy = true;
  hit(game, b);
  assert.equal(b.superArmor, 0, 'breakable again after the lock');
});

test('warden: a hit never flinches, staggers or interrupts a tell, and gives no blood while armored', () => {
  const { game, player, b } = warden(1000, 940);
  b.dir = 1; game.wardenStart(b, 'sweep');
  const tell = b.tell; player.x = 960; player.dir = 1; player.blood = 100; player.attackCd = 0;
  game.attack(); // swing costs 2 and the hit pays nothing
  assert.ok(b.hp < 520); assert.equal(b.stun, 0); assert.ok(b.tell > 0 && b.tell <= tell); assert.equal(b.poise, 1);
  assert.equal(player.blood, 98);
});

test('warden blood: hits during a heavy recovery pay even while armored, and so do break-stun hits', () => {
  const { game, player, b } = warden(1000, 960);
  Object.assign(player, { dir: 1, blood: 100, attackCd: 0, x: 960 });
  Object.assign(b, { heavy: true, heavyKind: 'slam', recover: 1, punishable: true });
  game.attack();
  assert.ok(player.blood > 98, `paid during a heavy recovery (${player.blood})`);
  const t = warden(1000, 960);
  Object.assign(t.player, { dir: 1, blood: 100, attackCd: 0 });
  Object.assign(t.b, { recover: 1, punishable: true }); // a light recovery is not a heavy one
  t.game.attack();
  assert.equal(t.player.blood, 98);
  const s = warden(1000, 960);
  Object.assign(s.player, { dir: 1, blood: 100, attackCd: 0 }); s.game.armorBreak(s.b);
  s.game.attack();
  assert.ok(s.player.blood > 98, 'paid during the break stun');
});

// Known gap (QA #61 re-check, P3): a toll taken at fractional blood adds fractional debt, while the HUD shows Math.round(debt) and the lethal cue compares the raw value.
// Rule: debt is whole, so the number shown is the number paid.
test('greatsword debt stays whole: a Warden toll at fractional blood adds a whole amount', () => {
  const { game, player, b } = warden(1000, 1060);
  b.dir = 1; b.superArmor = 20; player.blood = 150.4; player.frenzy = true; player.weapon = 'heavy';
  game.wardenStart(b, 'seize'); advance(game, 1.2);
  assert.ok(player.debt > 0, 'the toll landed as debt');
  assert.equal(player.debt, Math.round(player.debt), `debt ${player.debt} is fractional`);
});

test('a lethal blood-debt payment emits death cause debt, not heavy', () => {
  const { game, player, events } = arena();
  Object.assign(player, { blood: 100, frenzy: true, weapon: 'heavy', debt: 100 });
  game.endFrenzy(true);
  const d = events.findLast(e => e.type === 'death');
  assert.equal(game.state, 'dead'); assert.equal(d.cause, 'debt'); assert.ok(!d.heavy);
});

test('warden toll: takes all blood above 100 (30 at 100 or less), refills the gauge by that amount and ends a frenzy', () => {
  const { game, player, events, b } = warden(1000, 1060);
  b.dir = 1; b.superArmor = 20; player.blood = 180; player.frenzy = true;
  game.wardenStart(b, 'seize');
  assert.ok(b.tell > 0 && b.heavy);
  advance(game, 1.2);
  assert.equal(player.blood, 100); assert.equal(player.frenzy, false);
  const toll = events.find(e => e.type === 'toll'); assert.ok(toll.amount > 60 && toll.amount <= 80, 'everything above 100 (some burned off first)');
  assert.ok(Math.abs(b.superArmor - (20 + toll.amount)) < 1e-9);
  assert.ok(player.x > 1060 && player.invulnerable > 0, 'thrown back and briefly invulnerable');
  const t2 = warden(1000, 1060); t2.b.dir = 1; t2.b.superArmor = 10; t2.player.blood = 100;
  t2.game.wardenStart(t2.b, 'seize'); advance(t2.game, 1.2);
  assert.equal(t2.player.blood, 70); assert.equal(t2.b.superArmor, 40);
  const t3 = warden(1000, 1060); t3.b.dir = 1; t3.player.blood = 150; t3.game.wardenStart(t3.b, 'seize'); advance(t3.game, 1.2);
  assert.equal(t3.b.superArmor, 100, 'the gauge caps at 100');
  assert.equal(t3.game.fightStats.taken, 50);
});

test('warden toll: a jump clears the seize, a dash avoids it, and a toll at low blood kills with its own cause', () => {
  const air = warden(1000, 1060); air.b.dir = 1; air.player.blood = 150;
  air.game.wardenStart(air.b, 'seize'); advance(air.game, .9);
  air.game.jump(); advance(air.game, .25); assert.equal(air.player.grounded, false);
  advance(air.game, .06); // contact while the hero is airborne
  assert.equal(air.player.blood, 150); assert.ok(!air.events.some(e => e.type === 'toll'));
  const low = warden(1000, 1060); low.b.dir = 1; low.player.blood = 20;
  low.game.wardenStart(low.b, 'seize'); advance(low.game, 1.2);
  assert.equal(low.game.state, 'dead');
  assert.equal(low.events.find(e => e.type === 'death').cause, 'toll');
  assert.equal(low.events.find(e => e.type === 'toll').amount, 20);
});

test('warden pools: a slam leaves two pools at +-200 (max 2, 4 s), taken by touch while grounded for an unhalved +14', () => {
  const { game, player, events, b } = warden(1000, 1300);
  b.dir = 1; game.wardenStart(b, 'slam'); advance(game, 1);
  const pools = events.filter(e => e.type === 'bloodPool');
  assert.deepEqual(pools.map(p => p.x).sort((a, c) => a - c), [800, 1200]);
  assert.equal(game.pools.length, 2);
  game.wardenStart(b, 'slam'); b.recover = 0; advance(game, 1);
  assert.equal(game.pools.length, 2, 'at most two on the field');
  player.frenzy = true; player.blood = 150; player.x = 1200; player.grounded = true;
  const before = player.blood; game.updatePools(0);
  assert.equal(player.blood, before + POOL_GAIN, 'frenzy does not halve pool blood');
  assert.ok(events.some(e => e.type === 'poolTaken' && e.amount === POOL_GAIN));
  game.pools = [{ x: 400, y: FLOOR, life: 4, max: 4 }]; player.x = 400; player.grounded = false;
  game.updatePools(0); assert.equal(game.pools.length, 1, 'not taken while airborne');
  game.updatePools(5); assert.equal(game.pools.length, 0, 'pools expire');
});

test('warden habit memory: two matching answers out of the last three pick the documented branch', () => {
  const { game, b } = warden(1000, 940);
  b.habit = ['jumped', 'crossed', 'jumped'];
  assert.equal(game.wardenPick(b, 100).move, 'slam'); assert.deepEqual(b.habit, [], 'a read is spent');
  b.habit = ['jumped', 'jumped'];
  const far = game.wardenPick(b, 250); assert.deepEqual([far.move, far.delay], ['charge', true]);
  b.habit = ['crossed', 'stood', 'crossed'];
  assert.equal(game.wardenPick(b, 100).move, 'sweep'); assert.equal(b.chain, 'backhand');
  b.habit = ['crossed', 'crossed']; assert.equal(game.wardenPick(b, 250).move, 'charge'); assert.equal(b.chain, 'backhand');
  b.habit = ['retreated', 'retreated', 'stood']; b.lastMove = 'charge';
  assert.equal(game.wardenPick(b, 100).move, 'charge');
  b.habit = ['jumped', 'crossed', 'retreated']; b.lastMove = '';
  assert.ok(['sweep', 'slam', 'seize'].includes(game.wardenPick(b, 100).move), 'no read: the band pool');
  assert.equal(b.read, '');
});

test('warden habit memory records how the hero answered each heavy, and a crossed read ends the sweep with a backhand', () => {
  const { game, player, b } = warden(1000, 940);
  for (let i = 0; i < 2; i++) {
    b.recover = 0; b.heavy = false; b.dir = 1; Object.assign(player, { x: 1060, y: FLOOR - 150, grounded: false, vy: 0 });
    game.wardenStart(b, 'slam'); game.wardenStrike(b);
  }
  assert.deepEqual(b.habit, ['jumped', 'jumped']);
  b.recover = 0; b.dir = 1; Object.assign(player, { x: 700, y: FLOOR, grounded: true });
  game.wardenStart(b, 'slam'); game.wardenStrike(b);
  assert.deepEqual(b.habit.slice(-1), ['crossed']);
  game.projectiles = []; b.recover = 0; b.habit = ['crossed', 'crossed']; b.cd = 0; b.dir = 1; player.x = 1100; player.grounded = true;
  game.moveWarden(b, 1 / 120);
  assert.equal(b.move, 'sweep'); assert.equal(b.chain, 'backhand');
  advance(game, .7);
  assert.equal(b.move, 'backhand'); assert.ok(b.tell > 0 && b.warn.box.x < b.x - 8 && b.warn.kind === 'backhand', 'the box is behind it');
});

test('warden phase 2 at 50% health: 1.1 s pause, an event, and pools move out to +-260', () => {
  const { game, events, b } = warden(1000, 940);
  hit(game, b, 259); assert.equal(b.bossPhase, 1);
  hit(game, b, 2);
  assert.equal(b.bossPhase, 2); assert.ok(Math.abs(b.pause - 1.1) < 1e-9);
  assert.equal(events.filter(e => e.type === 'wardenPhase').length, 1);
  b.dir = 1; game.wardenStart(b, 'slam'); game.wardenStrike(b);
  assert.deepEqual(game.pools.map(p => p.x).sort((a, c) => a - c), [740, 1260]);
});

test('warden: every attack shows a tell, and heavies glint 0.4 s before contact (delayed ones too)', () => {
  for (const [move, delay] of [['sweep'], ['backhand'], ['slam'], ['charge'], ['seize'], ['slam', true], ['charge', true]]) {
    const { game, events, b } = warden(1000, 700);
    b.dir = 1; game.wardenStart(b, move, delay);
    const tell = b.tell, heavy = b.heavy; // a follow-up may start in the contact frame
    assert.ok(tell > 0 && b.warn && b.warn.kind === move, `${move} has a tell and an exposed area`);
    assert.equal(events.some(e => e.type === (b.heavy ? 'enemyHeavy' : 'enemyTell')), true);
    let glintAt = null, swingAt = null;
    for (let t = 0; t < 3 && swingAt === null; t += 1 / 120) {
      game.update(1 / 120, {});
      for (const e of events) { if (e.type === 'enemyGlint' && glintAt === null) glintAt = game.time; if (e.type === 'enemySwing' && swingAt === null) swingAt = game.time; }
    }
    assert.ok(swingAt !== null, `${move} strikes`);
    if (heavy) assert.ok(glintAt !== null && Math.abs(swingAt - glintAt - GLINT_LEAD) < .02, `${move} glints ${GLINT_LEAD} s before contact`);
    else assert.equal(glintAt, null, `${move} is light: no glint`);
    if (delay) assert.ok(tell > (move === 'slam' ? .95 : .9), 'delayed tell is longer');
  }
});

// Strings (follow-ups), phase 2 escalation and the seize box height (Warden difficulty pass)
const wardenP2 = (wx, hx) => { const t = warden(wx, hx); t.b.bossPhase = 2; t.player.invulnerable = 99; return t; };
const runTo = (game, b, move, limit = 2) => { for (let t = 0; t < limit && !(b.move === move && b.tell > 0 && b.follow); t += 1 / 120) game.update(1 / 120, {}); };

test('warden return charge: a hero behind it when a charge ends draws a turned charge with a short tell that still glints, never delayed', () => {
  const { game, player, events, b } = wardenP2(1000, 1200);
  b.dir = 1; game.wardenStart(b, 'charge'); advance(game, .9); // contact: the charge runs 305 px to 1305
  player.x = 1200; // the hero ended up behind it (dashed or jumped through)
  runTo(game, b, 'charge');
  assert.equal(b.move, 'charge'); assert.ok(b.follow && !b.delayed && b.dir === -1, 'a turned follow-up, not delayed');
  assert.ok(Math.abs(b.tell - .5) < .02 && b.heavy && b.warn.line.x2 < b.x, 'its path runs back toward the hero');
  const n = events.length; let glintAt = null, swingAt = null;
  for (let t = 0; t < 1 && swingAt === null; t += 1 / 120) { game.update(1 / 120, {}); for (const e of events.slice(n)) { if (e.type === 'enemyGlint' && glintAt === null) glintAt = game.time; if (e.type === 'enemySwing' && swingAt === null) swingAt = game.time; } }
  assert.ok(glintAt !== null && Math.abs(swingAt - glintAt - GLINT_LEAD) < .02, 'the follow-up glints 0.4 s before contact');
  let charges = 2;
  for (let t = 0; t < 6 && !(b.recover > 0); t += 1 / 120) { const was = b.tell > 0 && b.move === 'charge'; game.update(1 / 120, {}); if (!was && b.tell > 0 && b.move === 'charge') charges++; }
  assert.equal(charges, 4, 'phase 2: a return may draw another, up to 3 follow-ups');
  assert.ok(b.recover > 0 && b.move === '', 'the string ends in the recovery of its last charge');
});

test('warden strings: a pick draws at most 2 follow-ups in phase 1 and 3 in phase 2', () => {
  for (const [phase, total] of [[1, 3], [2, 4]]) {
    const { game, player, b } = warden(1000, 1200); b.bossPhase = phase; player.invulnerable = 99;
    b.dir = 1; game.wardenStart(b, 'charge');
    let charges = 1;
    for (let t = 0; t < 8 && !(b.recover > 0); t += 1 / 120) { const was = b.tell > 0; game.update(1 / 120, {}); player.x = 1200; if (!was && b.tell > 0) charges++; }
    assert.equal(charges, total, `phase ${phase}`);
  }
});

test('warden strings: a slam is followed by the charge, and a jumped seize by the slam', () => {
  const s = warden(1000, 1250); s.player.invulnerable = 99;
  s.b.dir = 1; s.game.wardenStart(s.b, 'slam'); s.game.wardenStrike(s.b);
  assert.ok(s.b.follow && s.b.move === 'charge' && Math.abs(s.b.tell - .5) < 1e-9 && !s.b.delayed);
  const far = warden(1000, 1400); far.player.invulnerable = 99;
  far.b.dir = 1; far.game.wardenStart(far.b, 'slam'); far.game.wardenStrike(far.b);
  assert.ok(!far.b.follow && far.b.recover > 0, 'beyond 330 px: the slam ends in its recovery');
  const j = warden(1000, 1060); j.b.dir = 1;
  j.game.wardenStart(j.b, 'seize'); Object.assign(j.player, { y: FLOOR - 100, grounded: false, vy: 0 });
  j.game.wardenStrike(j.b);
  assert.ok(!j.events.some(e => e.type === 'toll'), 'cleared the box');
  assert.ok(j.b.follow && j.b.move === 'slam' && Math.abs(j.b.tell - .7) < 1e-9 && j.b.heavy, 'the slam meets the landing');
  const d = warden(1000, 920); d.b.dir = 1; d.player.invulnerable = 99; // dashed through the seize: grounded behind it
  d.game.wardenStart(d.b, 'seize'); d.game.wardenStrike(d.b);
  assert.ok(d.b.follow && d.b.move === 'backhand', 'behind within 140 px: the backhand');
  const t = warden(1000, 1060); t.b.dir = 1; t.player.blood = 150;
  t.game.wardenStart(t.b, 'seize'); t.game.wardenStrike(t.b);
  assert.ok(t.events.some(e => e.type === 'toll') && !t.b.follow && t.b.recover > 0, 'a landed Toll ends the string');
});

test('warden phase change: the roar ends a break stun and restores the gauge, locked through the 1.1 s pause; phase 2 seizes a frenzied hero again', () => {
  const { game, player, b } = warden(1000, 940);
  player.frenzy = true; player.blood = 190; hit(game, b); // phase 1: the frenzy hit breaks
  assert.ok(b.stun > 0 && b.superArmor === 0);
  hit(game, b, 250);
  assert.equal(b.bossPhase, 2); assert.equal(b.stun, 0); assert.equal(b.breakStun, 0);
  assert.equal(b.superArmor, ARMOR_MAX); assert.ok(Math.abs(b.armorLock - 1.1) < 1e-9);
  hit(game, b); assert.equal(b.superArmor, ARMOR_MAX, 'no chip during the roar');
  b.lastMove = 'seize'; b.habit = [];
  assert.equal(game.wardenPick(b, 100).move, 'seize', 'phase 2 repeats the seize against a frenzied hero');
  player.frenzy = false; player.blood = 160;
  assert.notEqual(game.wardenPick(b, 100).move, 'seize', 'otherwise never twice in a row');
});

test('warden sweep string: the follow-up depends on where the hero stands when the sweep ends', () => {
  for (const [hx, move] of [[1080, 'seize'], [1250, 'charge'], [940, 'backhand'], [1400, '']]) {
    const { game, player, b } = wardenP2(1000, 1300);
    b.dir = 1; game.wardenStart(b, 'sweep'); player.x = hx;
    advance(game, .62);
    assert.equal(b.follow ? b.move : '', move, `hero at ${hx - 1000}: ${move || 'no follow-up'}`);
    if (move === 'backhand') assert.ok(b.warn.box.x < b.x, 'the backhand box is behind it');
    if (move === 'seize') assert.equal(b.dir, 1);
  }
});

test('warden phase 2: the slam sends a second wave behind it and heavy recoveries are 0.3 s shorter (never under 0.9 s)', () => {
  const { game, b } = wardenP2(1000, 1400); // beyond 330 px: no charge follows the slam
  b.dir = 1; game.wardenStart(b, 'slam'); game.wardenStrike(b);
  assert.deepEqual(game.projectiles.filter(q => q.ground).map(q => Math.sign(q.vx)).sort(), [-1, 1]);
  assert.ok(Math.abs(b.recover - .9) < 1e-9, 'slam 1.2 - 0.3');
  const one = warden(1000, 1400); one.b.dir = 1; one.game.wardenStart(one.b, 'slam'); one.game.wardenStrike(one.b);
  assert.equal(one.game.projectiles.filter(q => q.ground).length, 1, 'phase 1: one wave, forward');
  assert.ok(Math.abs(one.b.recover - 1.2) < 1e-9);
  const c = wardenP2(1000, 1500); c.b.dir = 1; c.game.wardenStart(c.b, 'charge'); c.game.wardenStrike(c.b); advance(c.game, .51); // hero ahead of the path end: no return charge
  assert.ok(c.b.recover > .87 && c.b.recover <= .9, 'charge 1.0 floors at 0.9');
});

test('warden seize: the Toll takes a hero inside its 80 px box, so a late, low jump is still caught', () => {
  const late = warden(1000, 1060); late.b.dir = 1; late.player.blood = 150;
  late.game.wardenStart(late.b, 'seize'); advance(late.game, 1.06);
  late.game.jump(); advance(late.game, .06); // still under 80 px at contact
  assert.equal(late.player.grounded, false); assert.ok(late.events.some(e => e.type === 'toll'), 'caught in the air');
});

test('warden band pool: the mid range adds the slam, and phase 2 adds the charge up close', () => {
  const { game, b, player } = warden(1000, 1250); player.vx = 0;
  const mid = new Set(), close = new Set();
  for (let i = 0; i < 60; i++) { b.lastMove = ''; b.habit = []; mid.add(game.wardenPick(b, 250).move); }
  assert.deepEqual([...mid].sort(), ['charge', 'slam']);
  player.blood = 100; b.bossPhase = 2;
  for (let i = 0; i < 80; i++) { b.lastMove = ''; b.habit = []; close.add(game.wardenPick(b, 100).move); }
  assert.deepEqual([...close].sort(), ['charge', 'seize', 'slam', 'sweep']);
});

test('warden never starts an attack from off screen: it walks in first', () => {
  const { game, b } = warden(2000, 1200);
  b.cd = 0;
  advance(game, .2);
  assert.equal(b.tell, 0, 'hero 800 px away: no tell');
  assert.ok(b.x < 2000, 'it walks toward the hero');
});

test('warden: after the kill the second Vigil keeps relics, restores blood 100 and ends frenzy, then the slice ends', () => {
  const { game, player, events } = castle(42, 9);
  game.finishStage(); game.choices = RELICS.filter(r => r.id === 'edge'); game.chooseRelic('edge');
  const b = game.enemies[0], dmg = player.damage;
  Object.assign(player, { blood: 180, frenzy: true }); player.debt = 30;
  game.damageEnemy(b, 9999, 1, false, false);
  assert.equal(b.hp, 0);
  const stats = events.find(e => e.type === 'fightStats'); assert.ok(stats && stats.won === true);
  advance(game, 1.8);
  assert.equal(game.state, 'rest'); assert.equal(game.vigil, 2);
  assert.equal(player.blood, 100); assert.equal(player.frenzy, false); assert.equal(player.debt, 0);
  assert.deepEqual(game.relics, ['edge']);
  assert.equal(game.setWeapon('twin'), true);
  assert.equal(player.weapon, 'twin'); assert.equal(player.damage, 17 * 1.25, 'relics stack on the new weapon base'); assert.ok(dmg !== player.damage);
  assert.equal(game.descend(), true);
  assert.equal(game.state, 'sliceEnd'); assert.ok(events.some(e => e.type === 'sliceEnd'));
});

test('warden: dying on floor 10 emits the fight stats and returns to the first Vigil without relics', () => {
  const { game, player, events } = castle(42, WARDEN_FLOOR);
  game.relics.push('edge'); player.blood = 50;
  game.hurt(500, 1, false, true);
  assert.equal(game.state, 'dead');
  assert.equal(events.filter(e => e.type === 'fightStats').length, 1);
  assert.equal(events.find(e => e.type === 'fightStats').won, false);
  game.enterRest();
  assert.equal(game.state, 'rest'); assert.equal(game.vigil, 1); assert.deepEqual(game.relics, []);
  game.setWeapon('heavy'); game.descend(); assert.equal(game.floor, 1);
});

test('warden fight stats count blood gained and taken, time since it woke, breaks and frenzies', () => {
  const { game, player, b } = warden(1000, 940);
  advance(game, .5); assert.ok(Math.abs(game.fightStats.time - .5) < .02);
  player.blood = 190; game.gainBlood(10);
  assert.equal(game.fightStats.gained, 10); assert.equal(game.fightStats.frenzies, 1);
  game.hurt(20, 1); assert.equal(game.fightStats.taken, 20);
  game.armorBreak(b); assert.equal(game.fightStats.breaks, 1);
});

test('warden body blocks walking, but a dash passes through it', () => {
  const { game, player } = warden(1000, 900);
  advance(game, 1, { right: true });
  assert.ok(player.x <= 1000 - 50 + 1, `blocked at the body (${player.x})`);
  player.x = 940; player.dashCd = 0;
  advance(game, .5, { right: true, dash: true });
  assert.ok(player.x > 1050, `dashed through (${player.x})`);
});

test('warden: the body-block never leaves the hero outside the world, at either wall', () => {
  const { game, player, b } = warden(30, 25);
  player.invulnerable = 99; b.recover = 5;
  advance(game, .5);
  assert.ok(player.x >= 25 && player.x <= game.worldWidth - 30, `left wall (${player.x})`);
  b.x = game.worldWidth - 35; player.x = game.worldWidth - 30; advance(game, .5);
  assert.ok(player.x >= 25 && player.x <= game.worldWidth - 30, `right wall (${player.x})`);
});

test('warden: no follow-up starts once the hero is dead', () => {
  const { game, player, b } = warden(1000, 940);
  player.hp = 1; player.invulnerable = 0; game.wardenStart(b, 'sweep');
  advance(game, 2);
  assert.equal(game.state, 'dead');
  assert.equal(b.tell > 0 && b.follow, false);
});

test('warden: Vortex Eclipse does not pull it while armored, and its kill is the only way out of the fight floor', () => {
  const { game, player, b } = warden(1000, 800);
  game.relics.push(RELICS.find(r => r.id === 'vortex')); player.blood = 100; b.cd = 99;
  game.magic();
  assert.equal(b.x, 1000, 'armored: not pulled');
  game.portalX = player.x; advance(game, .1);
  assert.equal(game.portalOpen, false, 'no Moon Gate on the fight floor');
});

// --- The Fallen King, castle version (floor 50, #50 section 6) ---
function kingFight(kx = 1400, hx = 1300, phase = 1) {
  const t = castle(42, KING_FLOOR), b = t.game.spawnKing(kx);
  Object.assign(t.player, { x: hx }); Object.assign(b, { engaged: true, cd: 99, dir: -1, opened: true, bossPhase: phase }); // cd 99: it never picks a move by itself
  return { ...t, b };
}
const kHit = (game, b, n = 10) => game.damageEnemy(b, n, 1, false, false, false, 17);
const ledge = game => game.makePlatform(1000, FLOOR - 110, 190, 'cathedral', 'ledge');

test('king: floor 50 is the King alone in the boss arena with his stats, castle only; the normal-run King is unchanged', () => {
  const { game } = castle(42, KING_FLOOR), raw = new Game(() => {}, 3, 'castle'); raw.loadFloor(KING_FLOOR);
  assert.equal(game.floor, KING_FLOOR); assert.equal(raw.enemies.length, 1);
  const b = raw.enemies[0];
  assert.ok(b.king && b.armored && b.required && !b.warden);
  assert.deepEqual([b.maxHp, b.superArmor, b.superArmorMax, b.w, b.h], [KING_HP, 150, 150, 80, 128]);
  assert.equal(game.worldWidth, STAGES[4].width);
  assert.equal(raw.platforms.length, 2, 'two ledges'); assert.equal(raw.stage, 4);
  assert.deepEqual(game.fightStats, { gained: 0, taken: 0, time: 0, breaks: 0, frenzies: 0 });
  const normal = new Game(() => {}, 7); normal.loadStage(4);
  const old = normal.enemies.find(e => e.type === 'boss');
  assert.ok(old && !old.king && !old.armored && old.maxHp === 900 && old.superArmor === undefined);
  const gate = new Game(() => {}, 3, 'castle'); gate.loadFloor(WARDEN_FLOOR); assert.ok(gate.enemies[0].warden && !gate.enemies[0].king);
});

test('king gauge: 150, normal hits nothing, Eclipse -25, a phase 1 frenzy hit breaks; phases 2 and 3 chip 34', () => {
  const { game, player, events, b } = kingFight();
  kHit(game, b); assert.equal(b.superArmor, KING_ARMOR); player.blood = 190;
  for (let i = 0; i < 5; i++) { player.magicCd = 0; game.magic(); }
  assert.equal(b.superArmor, 25); assert.equal(events.find(e => e.type === 'armorChip').value, 25);
  player.magicCd = 0; game.magic(); assert.equal(b.superArmor, 0); assert.ok(events.some(e => e.type === 'armorBreak'));
  const f = kingFight(); f.player.frenzy = true; f.player.blood = 150; kHit(f.game, f.b);
  assert.equal(f.b.superArmor, 0); assert.ok(f.events.some(e => e.type === 'armorBreak'));
  for (const phase of [2, 3]) {
    const c = kingFight(1400, 1300, phase); c.player.frenzy = true; c.player.blood = 190;
    kHit(c.game, c.b);
    assert.equal(c.b.superArmor, KING_ARMOR - FRENZY_CHIP, `phase ${phase} chips`); assert.equal(c.events.filter(e => e.type === 'armorChip').at(-1).value, FRENZY_CHIP);
    for (let i = 0; i < 3; i++) kHit(c.game, c.b);
    assert.equal(c.b.superArmor, 150 - 34 * 4); assert.ok(!c.events.some(e => e.type === 'armorBreak'));
    kHit(c.game, c.b); assert.equal(c.b.superArmor, 0); assert.equal(c.events.filter(e => e.type === 'armorBreak').length, 1, 'five chips break it');
  }
});

test('king break: cancels the move, stuns 1.8 s at x1.5, never flinches or knocks back while armored, refills to 150 and locks', () => {
  const { game, player, b } = kingFight(1400, 1300);
  player.invulnerable = 99; game.kingStart(b, 'slam');
  const x0 = b.x; player.dir = 1; player.x = 1340; hit(game, b, 5); assert.equal(b.x, x0, 'no knockback'); assert.ok(b.tell > 0, 'no interrupted tell'); assert.equal(b.stun, 0);
  player.frenzy = true; player.blood = 150; hit(game, b, 10);
  assert.equal(b.tell, 0); assert.equal(b.warn, null); assert.ok(Math.abs(b.stun - BREAK_STUN) < 1e-9);
  const hp = b.hp; advance(game, .01); hit(game, b, 10); assert.equal(b.hp, hp - 15, 'x1.5 in the stun');
  advance(game, BREAK_STUN + .1); b.cd = 99;
  assert.equal(b.superArmor, KING_ARMOR); assert.ok(b.armorLock > 0 && b.armorLock <= ARMOR_LOCK);
});

test('king phases at 67% and 34%: kingPhase, a 1.1 s pause, the gauge refilled and locked; a big hit can skip to phase 3', () => {
  const { game, events, b } = kingFight();
  b.superArmor = 40;
  hit(game, b, Math.ceil(KING_HP * .33) - 1); assert.equal(b.bossPhase, 1);
  hit(game, b, 2);
  assert.equal(b.bossPhase, 2); assert.equal(events.filter(e => e.type === 'kingPhase').length, 1); assert.equal(events.find(e => e.type === 'kingPhase').phase, 2);
  assert.ok(Math.abs(b.pause - 1.1) < 1e-9 && b.superArmor === KING_ARMOR && b.armorLock > 0);
  hit(game, b, Math.ceil(KING_HP * .33)); assert.equal(b.bossPhase, 3); assert.equal(events.filter(e => e.type === 'kingPhase').at(-1).phase, 3);
  const skip = kingFight(); hit(skip.game, skip.b, Math.ceil(KING_HP * .7)); assert.equal(skip.b.bossPhase, 3); assert.equal(skip.events.filter(e => e.type === 'kingPhase').length, 1);
  assert.ok(!events.some(e => e.type === 'bossPhase' || e.type === 'wardenPhase'), 'its own event');
});

test('king Tithe: an untaken pool is drawn in after 3 s along a stream and restores 25 armor after 1 s more', () => {
  const { game, events, b } = kingFight();
  b.superArmor = 60; game.addPool(600, FLOOR, true);
  advance(game, 2.9); assert.ok(!events.some(e => e.type === 'tithe'));
  advance(game, .2);
  const start = events.find(e => e.type === 'tithe'); assert.equal(start.state, 'start'); assert.equal(start.x, 600); assert.ok(Math.abs(start.duration - 1) < 1e-9 && start.toX === b.x);
  assert.equal(b.superArmor, 60);
  advance(game, 1);
  const end = events.find(e => e.type === 'tithe' && e.state === 'end'); assert.ok(end); assert.equal(end.amount, TITHE_RESTORE);
  assert.equal(b.superArmor, 60 + TITHE_RESTORE); assert.equal(game.pools.length, 0);
  b.superArmor = 140; game.addPool(600, FLOOR, true); advance(game, 4.1); assert.equal(b.superArmor, KING_ARMOR, 'capped at the gauge');
});

test('king Tithe: taking the pool while it drains interrupts it (blood +14, no armor); a plain pool never drains', () => {
  const { game, player, events, b } = kingFight(1400, 700);
  b.superArmor = 60; player.blood = 100; game.addPool(1000, FLOOR, true); player.invulnerable = 99;
  advance(game, 3.3); assert.ok(events.some(e => e.type === 'tithe' && e.state === 'start'));
  player.x = 1000; advance(game, .05);
  assert.equal(player.blood, 100 + POOL_PAY); assert.ok(events.some(e => e.type === 'tithe' && e.state === 'broken')); assert.ok(!events.some(e => e.type === 'tithe' && e.state === 'end'));
  advance(game, 1.5); assert.equal(b.superArmor, 60);
  game.addPool(1000, FLOOR - 110, false); player.x = 300; advance(game, 4.2); assert.equal(events.filter(e => e.type === 'tithe').length, 2, 'only the first pool streamed (start, broken)');
  const w = warden(1000, 700); game.pools.length; w.game.spawnPools(w.b); advance(w.game, 3.5); assert.ok(!w.events.some(e => e.type === 'tithe'), 'the Warden has no Tithe');
});

test('king Tithe: a pool on a ledge is only taken from that ledge, never from the floor beneath it', () => {
  const { game, player } = kingFight(1400, 1095);
  game.addPool(1095, FLOOR - 110, true); player.invulnerable = 99;
  advance(game, .1); assert.equal(game.pools.length, 1, 'a hero on the floor below does not take it');
  game.platforms = [ledge(game)]; player.y = FLOOR - 110; advance(game, .1);
  assert.equal(game.pools.length, 0); assert.equal(player.blood, 100 + POOL_PAY);
});

test('king slam: phases 1 and 2 leave two pools (+-200, +-260) with a floor wave; Blood Moon makes none unless it misses', () => {
  for (const [phase, off] of [[1, 200], [2, 260]]) {
    const { game, b } = kingFight(1400, 1300, phase); b.dir = -1; game.kingStart(b, 'slam'); game.kingStrike(b);
    assert.deepEqual(game.pools.map(q => q.x).sort((a, c) => a - c), [1400 - off, 1400 + off]); assert.ok(game.pools.every(q => q.tithe));
    assert.equal(game.projectiles.filter(q => q.ground).length, 1);
  }
  const hit3 = kingFight(1400, 1340, 3); hit3.player.blood = 150; hit3.b.dir = -1; hit3.game.kingStart(hit3.b, 'slam'); hit3.game.kingStrike(hit3.b);
  assert.equal(hit3.player.blood, 50); assert.equal(hit3.game.pools.length, 0, 'a slam that hits sheds nothing');
  const miss = kingFight(1400, 1100, 3); miss.b.dir = -1; miss.game.kingStart(miss.b, 'slam'); miss.game.kingStrike(miss.b);
  assert.equal(miss.game.pools.length, 1, 'a missed slam sheds one pool'); assert.equal(miss.game.pools[0].x, 1400 - 100); assert.ok(miss.events.some(e => e.type === 'bloodPool'));
});

test('king Blood Moon: a charge that misses sheds a pool where it ends; one that hits does not; light moves never shed; phase 2 never sheds', () => {
  const miss = kingFight(1400, 1000, 3); miss.player.invulnerable = 99; miss.b.dir = -1; miss.game.kingStart(miss.b, 'charge'); advance(miss.game, 1.5);
  assert.equal(miss.game.pools.length, 1); assert.ok(Math.abs(miss.game.pools[0].x - miss.b.chargeTo) < 1);
  const hitIt = kingFight(1400, 1250, 3); hitIt.player.blood = 190; hitIt.b.dir = -1; hitIt.game.kingStart(hitIt.b, 'charge'); advance(hitIt.game, 1.5);
  assert.equal(hitIt.game.pools.length, 0, 'the charge hurt the hero');
  const slash = kingFight(1400, 1100, 3); slash.b.dir = -1; slash.game.kingStart(slash.b, 'slash'); slash.game.kingStrike(slash.b); assert.equal(slash.game.pools.length, 0);
  const p2 = kingFight(1400, 1000, 2); p2.player.invulnerable = 99; p2.b.dir = -1; p2.game.kingStart(p2.b, 'charge'); advance(p2.game, 1.5); assert.equal(p2.game.pools.length, 0);
});

test('king descent: only from phase 2, after the hero stood on a ledge for 2 s; lands on that ledge, shockwave r 120, long tell', () => {
  const { game, player, events, b } = kingFight(1500, 1095, 2);
  game.platforms = [ledge(game)]; player.y = FLOOR - 110; player.invulnerable = 99;
  advance(game, LEDGE_TIME - .3); assert.ok(b.ledgeT > 1.5 && b.ledgeT < LEDGE_TIME);
  assert.notEqual(game.kingPick(b, 400).move, 'descent', 'not before 2 s');
  advance(game, .4); assert.ok(b.ledgeT >= LEDGE_TIME);
  const p1 = kingFight(1500, 1095, 1); p1.game.platforms = [ledge(p1.game)]; p1.player.y = FLOOR - 110; advance(p1.game, 2.2);
  assert.notEqual(p1.game.kingPick(p1.b, 400).move, 'descent', 'phase 1 has no descent');
  b.cd = 0; advance(game, .02);
  assert.equal(b.move, 'descent'); assert.ok(b.tell >= 1.0 && b.heavy, `tell ${b.tell} is a heavy tell`);
  assert.deepEqual([b.warn.landing.x, b.warn.landing.y, b.warn.landing.r], [1095, FLOOR - 110, DESCENT_RADIUS]);
  assert.equal(b.warn.circles[0].r, DESCENT_RADIUS, 'the shadow ring');
  player.x = 1500; player.y = FLOOR; player.vy = 0; player.invulnerable = 0; // the hero leaves the ledge before the landing
  advance(game, 1.3);
  const land = events.find(e => e.type === 'descent'); assert.ok(land); assert.deepEqual([land.x, land.y, land.r, land.hit], [1095, FLOOR - 110, DESCENT_RADIUS, false]);
  assert.equal(player.blood, 100); assert.equal(b.y, FLOOR - 110, 'on the ledge'); assert.equal(b.ledgeT, 0);
  advance(game, 1.6); assert.equal(b.y, FLOOR, 'drops back to the floor');
});

test('king descent: the shockwave hits a hero still on the ledge; a dash, a high jump and the floor beneath are safe', () => {
  const land = (setup) => {
    const t = kingFight(1500, 1095, 2); t.game.platforms = [ledge(t.game)]; Object.assign(t.player, { y: FLOOR - 110, blood: 150 });
    t.b.ledge = t.game.platforms[0]; t.b.ledgeT = 5; t.game.kingStart(t.b, 'descent'); setup?.(t); t.game.kingStrike(t.b); return t;
  };
  const stay = land(); assert.equal(stay.player.blood, 150 - HEAVY_DAMAGE); assert.ok(stay.events.find(e => e.type === 'descent').hit);
  const dash = land(t => { t.player.invulnerable = .2; }); assert.equal(dash.player.blood, 150, 'i-frames');
  const jump = land(t => { t.player.y = FLOOR - 110 - 100; t.player.grounded = false; }); assert.equal(jump.player.blood, 150); assert.equal(jump.events.find(e => e.type === 'descent').hit, false);
  const below = land(t => { Object.assign(t.player, { x: 1095, y: FLOOR }); }); assert.equal(below.player.blood, 150);
  const edge = land(t => { t.player.x = 1095 + DESCENT_RADIUS + 5; }); assert.equal(edge.player.blood, 150, 'just outside the ring');
  const phase3 = land(t => { t.b.bossPhase = 3; t.player.x = 1600; }); assert.equal(phase3.game.pools.length, 1, 'Blood Moon: a missed landing sheds a pool'); assert.equal(phase3.game.pools[0].y, FLOOR - 110);
});

test('king slash string: the second glint branches by where the hero stands: front slash, behind turnslash, far charge', () => {
  const branch = (heroAfter, force = '') => {
    const t = kingFight(1400, 1300); t.player.invulnerable = 99; t.b.chain = 'string'; t.b.force = force;
    t.game.kingStart(t.b, 'slash'); advance(t.game, .7);
    assert.equal(t.b.move, 'string', 'the slash opens the string'); assert.ok(t.b.tell > .4 && t.b.tell <= .85);
    assert.equal(t.b.warn.box, undefined, 'no area before the glint');
    t.player.x = heroAfter;
    let at = null;
    for (let i = 0; i < 200 && t.b.move === 'string'; i++) t.game.update(1 / 120, {});
    at = t.b.tell;
    return { ...t, at };
  };
  const front = branch(1300); assert.equal(front.b.move, 'slash'); assert.ok(front.at <= GLINT_LEAD && front.at > GLINT_LEAD - .02, 'branches at the glint'); assert.ok(!front.b.heavy);
  assert.ok(front.events.some(e => e.type === 'enemyGlint' && e.branch && e.kind === 'slash'));
  const behind = branch(1480); assert.equal(behind.b.move, 'turnslash'); assert.ok(behind.b.warn.box.x > behind.b.x - 1, 'the box is behind it (it faces left)'); assert.ok(behind.events.some(e => e.type === 'enemyGlint' && e.kind === 'turnslash'));
  const far = branch(900); assert.equal(far.b.move, 'charge'); assert.ok(far.b.heavy && far.b.warn.line); assert.ok(far.events.some(e => e.type === 'enemyHeavy' && e.branch && e.kind === 'charge'));
  const forced = branch(1300, 'turnslash'); assert.equal(forced.b.move, 'turnslash', 'a crossed read forces the turnslash');
  const out = branch(1900); assert.equal(out.b.move, ''); assert.equal(out.b.tell, 0); assert.ok(out.b.recover > 0, 'out of reach behind it: the string ends');
  // the hit lands exactly where the branch was drawn: contact 0.4 s after the glint
  const t = branch(1300); const hp0 = t.player.blood; t.player.invulnerable = 0; advance(t.game, .45); assert.ok(t.player.blood < hp0 || t.player.invulnerable > 0, 'the slash lands');
});

test('king habit memory: two matching heavy answers pick the documented branch, a crossed read forces the turnslash', () => {
  const { game, b } = kingFight(1400, 1300); b.opened = true;
  b.habit = ['jumped', 'jumped']; assert.equal(game.kingPick(b, 100).move, 'slam'); assert.deepEqual(b.habit, []);
  b.habit = ['jumped', 'jumped']; const far = game.kingPick(b, 250); assert.deepEqual([far.move, far.delay], ['charge', true]);
  b.habit = ['crossed', 'stood', 'crossed']; const c = game.kingPick(b, 100); assert.equal(c.move, 'slash'); assert.equal(b.force, 'turnslash'); assert.equal(b.chain, 'string');
  b.habit = ['retreated', 'retreated']; assert.equal(game.kingPick(b, 100).move, 'charge');
  const s = kingFight(1400, 1300); s.player.invulnerable = 99; s.b.dir = -1;
  s.game.kingStart(s.b, 'slam'); s.game.kingStrike(s.b); s.game.kingStart(s.b, 'slam'); s.player.x = 1500; s.game.kingStrike(s.b);
  assert.deepEqual(s.b.habit.slice(0, 1), ['stood']); assert.equal(s.b.habit.length, 2, 'each slam records how it was answered');
});

test('king intelligence: above 150 blood he opens with a charge (once); a frenzied hero draws the volley and he backsteps', () => {
  const { game, player, b } = kingFight(1400, 1300, 1); b.opened = false; player.blood = 160;
  assert.equal(game.kingPick(b, 100).move, 'charge'); assert.equal(b.opened, true);
  b.lastMove = ''; for (let i = 0; i < 20; i++) assert.notEqual(game.kingPick(b, 100).move, 'charge', 'close phase 1 never rolls a charge, so only the opener was forced');
  const picks = (frenzy) => { const t = kingFight(1400, 1300, 2); t.player.frenzy = frenzy; t.player.blood = frenzy ? 150 : 100; let v = 0; for (let i = 0; i < 100; i++) { t.b.lastMove = ''; t.b.habit = []; if (t.game.kingPick(t.b, 250).move === 'volley') v++; } return v; };
  assert.ok(picks(true) >= 70, 'frenzy prefers the volley'); assert.ok(picks(false) < 50);
  const k = kingFight(1400, 1300, 1); k.player.frenzy = true; k.player.blood = 150; k.b.cd = 99; advance(k.game, .5);
  assert.ok(k.b.x > 1400, `backsteps away from the frenzied hero (${k.b.x})`);
  const w = kingFight(1400, 1300, 1); w.b.cd = 99; w.player.x = 1000; advance(w.game, .5); assert.ok(w.b.x < 1400, 'otherwise he walks in');
  const corner = kingFight(1400, 1300, 1); corner.b.x = corner.game.worldWidth - 90; corner.player.x = corner.b.x - 100; corner.player.frenzy = true; corner.player.blood = 150; corner.b.cd = 99; advance(corner.game, .5);
  assert.ok(corner.b.x <= corner.game.worldWidth - 90 + 1, 'cornered he stops backing off');
});

test('king: every move shows a tell and an exposed area; heavies glint 0.4 s before contact (delayed ones too); delays only on slam and charge in phase 2+', () => {
  for (const [move, delay] of [['slash'], ['turnslash'], ['slam'], ['charge'], ['volley'], ['ritual'], ['descent'], ['slam', true], ['charge', true]]) {
    const { game, player, events, b } = kingFight(1400, 1000, 2);
    player.invulnerable = 99; b.dir = -1; b.chain = ''; b.ledge = game.platforms[0] || game.makePlatform(1000, FLOOR - 110, 190, 'cathedral', 'ledge'); game.platforms = [b.ledge];
    game.kingStart(b, move, delay);
    const tell = b.tell, heavy = b.heavy;
    assert.ok(tell >= .45 && b.warn && b.warn.kind === move, `${move} has a tell (${tell}) and an exposed area`);
    if (heavy) assert.ok(tell >= .85, `${move} heavy tell is at least 0.85 s`);
    assert.ok(tell <= 2, 'never above 2 s');
    assert.equal(events.some(e => e.type === (heavy ? 'enemyHeavy' : 'enemyTell') && e.kind === move && e.enemy === 'king'), true);
    let glintAt = null, swingAt = null;
    for (let t = 0; t < 3 && swingAt === null; t += 1 / 120) {
      game.update(1 / 120, {});
      for (const e of events) { if (e.type === 'enemyGlint' && glintAt === null) glintAt = game.time; if (e.type === 'enemySwing' && swingAt === null) swingAt = game.time; }
    }
    assert.ok(swingAt !== null, `${move} strikes`);
    if (heavy) assert.ok(glintAt !== null && Math.abs(swingAt - glintAt - GLINT_LEAD) < .02, `${move} glints ${GLINT_LEAD} s before contact`);
    else assert.equal(glintAt, null, `${move} is light: no glint`);
    if (delay) assert.ok(tell > (move === 'slam' ? .95 : .9), 'delayed tell is longer');
  }
  const p1 = kingFight(1400, 1000, 1); let delayed = 0; for (let i = 0; i < 40; i++) { p1.b.recover = 0; p1.game.kingStart(p1.b, i % 2 ? 'slam' : 'charge'); if (p1.b.delayed) delayed++; } assert.equal(delayed, 0, 'no delays in phase 1');
  const p2 = kingFight(1400, 1000, 2); delayed = 0; for (let i = 0; i < 60; i++) { p2.game.kingStart(p2.b, 'slam'); if (p2.b.delayed) delayed++; } assert.ok(delayed > 15 && delayed < 45, 'about half in phase 2');
});

test('king strings: a slam is followed by a charge within 330 px, a charge by a return charge when the hero is behind; capped per pick', () => {
  const a = kingFight(1400, 1250, 1); a.player.invulnerable = 99; a.b.dir = -1; a.game.kingStart(a.b, 'slam'); a.game.kingStrike(a.b);
  assert.equal(a.b.move, 'charge'); assert.ok(a.b.follow && Math.abs(a.b.tell - .5) < 1e-9 && a.b.heavy);
  const far = kingFight(1400, 900, 1); far.player.invulnerable = 99; far.b.dir = -1; far.game.kingStart(far.b, 'slam'); far.game.kingStrike(far.b);
  assert.equal(far.b.move, '', 'out of 330 px: the slam ends the string');
  const r = kingFight(1400, 1200, 2); r.player.invulnerable = 99; r.b.dir = 1; r.player.x = 1100; // hero behind the end of a charge to the right
  r.player.x = 1300; r.b.x = 1500; r.b.dir = 1; r.b.follows = 0; r.game.kingRecover(r.b, 'charge'); assert.equal(r.b.move, 'charge', 'the return charge');
  r.b.follows = 9; r.b.move = ''; r.b.tell = 0; r.game.kingRecover(r.b, 'charge'); assert.equal(r.b.move, '', 'capped');
  const dead = kingFight(1400, 1340, 1); dead.player.blood = 10; dead.b.dir = -1; dead.game.kingStart(dead.b, 'slam'); dead.game.kingStrike(dead.b);
  assert.equal(dead.game.state, 'dead'); assert.equal(dead.b.tell > 0 && dead.b.follow, false, 'no follow-up once the hero is dead');
});

test('king: never starts a tell from off screen; engaged walking closes in; the body blocks walking but not from the floor under a ledge', () => {
  const { game, b } = kingFight(2400, 1200, 1); b.cd = 0; advance(game, .2);
  assert.equal(b.tell, 0, '1200 px away: no tell'); assert.ok(b.x < 2400);
  const w = kingFight(1000, 900, 1); advance(w.game, 1, { right: true }); assert.ok(w.player.x <= 1000 - 54 + 1, `blocked at the body (${w.player.x})`);
  const u = kingFight(1000, 900, 1); u.b.y = FLOOR - 110; u.b.recover = 5; u.player.x = 990; u.b.cd = 99; advance(u.game, .3); assert.equal(u.player.x, 990, 'a hero under the ledge is not pushed');
});

test('king kill: fightStats won, then 1.6 s later the slice-end screen; the floor is the slice again', () => {
  const { game, player, events, b } = kingFight(1400, 1300);
  Object.assign(player, { blood: 180, frenzy: true }); game.pools.push({ x: 600, y: FLOOR, life: 4, max: 4, tithe: true });
  game.damageEnemy(b, 99999, 1, false, false);
  assert.equal(b.hp, 0); assert.equal(events.find(e => e.type === 'kill').king, true);
  const stats = events.find(e => e.type === 'fightStats'); assert.ok(stats && stats.won === true); assert.equal(game.pools.length, 0);
  assert.equal(game.state, 'playing'); advance(game, 1.7);
  assert.equal(game.state, 'sliceEnd'); assert.equal(game.floor, WARDEN_FLOOR);
  assert.deepEqual(events.filter(e => e.type === 'sliceEnd').map(e => e.king), ['won']);
});

test('king flow: slice end -> Face the Fallen King (floor 50, 100 blood, same weapon and relics) -> death -> slice end -> again, no records', () => {
  const events = [];
  const game = new Game(e => events.push(e), 42, 'castle');
  game.start(); game.setWeapon('twin'); game.descend(); game.loadFloor(WARDEN_FLOOR);
  game.relics.push('edge'); RELICS.find(r => r.id === 'edge').apply(game.player); game.setWeapon('twin');
  assert.equal(game.challengeKing(), false, 'not before the slice end');
  game.state = 'playing'; game.damageEnemy(game.enemies[0], 99999, 1, false, false); advance(game, 1.7);
  assert.equal(game.state, 'rest'); assert.equal(game.vigil, 2); game.player.blood = 180; game.player.frenzy = true;
  assert.equal(game.setWeapon('spear'), true); game.descend(); assert.equal(game.state, 'sliceEnd');
  assert.equal(game.challengeKing(), true);
  assert.equal(game.state, 'playing'); assert.equal(game.floor, KING_FLOOR); assert.equal(game.player.blood, 100); assert.equal(game.player.frenzy, false);
  assert.equal(game.player.weapon, 'spear'); assert.deepEqual(game.relics, ['edge']);
  assert.ok(game.enemies[0].king); assert.equal(events.filter(e => e.type === 'stage').at(-1).floor, KING_FLOOR);
  game.player.invulnerable = 0; game.hurt(500, 1, false, true);
  assert.equal(game.state, 'dead'); assert.equal(events.filter(e => e.type === 'fightStats').at(-1).won, false);
  assert.equal(game.leaveKing(false), true);
  assert.equal(game.state, 'sliceEnd'); assert.equal(game.floor, WARDEN_FLOOR); assert.equal(events.filter(e => e.type === 'sliceEnd').at(-1).king, 'dead');
  assert.equal(game.challengeKing(), true); assert.equal(game.player.blood, 100); assert.equal(game.enemies[0].hp, KING_HP, 'a fresh King');
  assert.equal(game.leaveKing(true), true, 'leaving mid-fight is allowed from the playing state');
  assert.equal(game.leaveKing(true), false, 'only from the King floor');
});

test('king: loadFloor(50) jumps straight to him in castle mode (?test), the Moon Gate never opens, pause and picks freeze the new timers', () => {
  const { game, player, b } = kingFight(1400, 1300);
  game.addPool(600, FLOOR, true); game.pools[0].life = 3.5; b.superArmor = 100;
  game.state = 'paused'; advance(game, 3); assert.equal(game.pools[0].life, 3.5, 'paused: the Tithe waits');
  game.state = 'playing'; game.portalX = player.x; advance(game, .1); assert.equal(game.portalOpen, false);
});

// --- Weapon frenzies (#61) ---
function frenzied(weapon, blood = 195) {
  const t = castle(); t.game.setWeapon(weapon);
  Object.assign(t.player, { blood, frenzy: true, x: 600, invulnerable: 0 });
  return t;
}
const calm = (e, cd = 99) => Object.assign(e, { cd });

test('frenzy heavy: damage becomes debt (no blood loss, no knockback), paid in full when the frenzy ends; the event carries it', () => {
  const { game, player, events } = frenzied('heavy');
  game.hurt(12, 1); player.invulnerable = 0; game.hurt(15, 1);
  assert.equal(player.blood, 195); assert.equal(player.debt, 27); assert.equal(player.x, 600, 'no knockback');
  assert.equal(events.findLast(e => e.type === 'hurt').debt, 27);
  advance(game, 20); // burns down to 100, then the debt comes due
  assert.equal(player.frenzy, false); assert.equal(player.debt, 0); assert.equal(player.blood, 100 - 27);
  assert.deepEqual(events.find(e => e.type === 'debt').amount, 27);
  assert.deepEqual([events.findLast(e => e.type === 'frenzyEnd').weapon, events.findLast(e => e.type === 'frenzyEnd').debt], ['heavy', 27]);
});

test('frenzy heavy: a debt of 100 or more kills at the end; other weapons and normal blood loss are untouched', () => {
  const { game, player } = frenzied('heavy');
  game.hurt(HEAVY_DAMAGE, 1); assert.equal(game.state, 'playing', 'debt kills only when it is paid'); assert.equal(player.debt, 100);
  advance(game, 20); assert.equal(game.state, 'dead');
  const t = frenzied('spear'); t.game.hurt(20, 1);
  assert.equal(t.player.blood, 175); assert.equal(t.player.debt, 0); assert.notEqual(t.player.x, 600, 'knockback outside the Greatsword frenzy');
  const u = frenzied('heavy'); u.player.frenzy = false; u.game.hurt(20, 1);
  assert.equal(u.player.blood, 175, 'no frenzy, no debt'); assert.equal(u.player.debt, 0);
});

test('frenzy heavy: dash and Eclipse i-frames still avoid the hit (no debt); death and the Vigil clear debt unpaid', () => {
  const { game, player, events } = frenzied('heavy');
  game.dash(); game.hurt(30, 1); assert.equal(player.debt, 0);
  player.invulnerable = 0; player.dash = 0; player.magicCd = 0; game.magic(); game.hurt(30, 1); assert.equal(player.debt, 0);
  player.invulnerable = 0; game.hurt(30, 1); assert.equal(player.debt, 30);
  game.heroDown(false);
  assert.equal(player.debt, 0); assert.equal(events.findLast(e => e.type === 'frenzyEnd').debt, 0); assert.ok(!events.some(e => e.type === 'debt'));
  const t = frenzied('heavy'); t.game.hurt(40, 1); t.game.enterVigil(); assert.equal(t.player.debt, 0); assert.equal(t.player.blood, 100);
});

test('frenzy heavy: the Gate Toll becomes debt with no knockback, and the gauge still refills', () => {
  const { game, player, b, events } = warden();
  Object.assign(player, { blood: 160, frenzy: true, weapon: 'heavy' }); b.superArmor = 10;
  game.wardenToll(b);
  assert.equal(player.blood, 160); assert.equal(player.debt, 60); assert.equal(b.superArmor, 70); assert.equal(player.x, 940);
  assert.equal(events.find(e => e.type === 'toll').debt, true);
  const t = warden(); Object.assign(t.player, { blood: 160, frenzy: true, weapon: 'spear' }); t.game.wardenToll(t.b);
  assert.equal(t.player.blood, 100); assert.equal(t.player.debt, 0);
});

test('frenzy twin: grounded swings start on their own, ignoring input, and not in the air', () => {
  const { game, player, events } = frenzied('twin');
  enemy(game, 660); advance(game, 1);
  const swings = events.filter(e => e.type === 'swing' && e.move !== 'plunge').length;
  assert.ok(swings >= 3, 'attacks fired with no input');
  assert.ok(events.every(e => e.type !== 'swing' || e.cost === 0), 'free in frenzy');
  const air = frenzied('twin'); air.player.grounded = false; air.player.y = FLOOR - 200; air.player.vy = -1;
  air.game.update(1 / 120, {}); assert.equal(air.events.filter(e => e.type === 'swing').length, 0, 'nothing automatic in the air');
  const calmHero = frenzied('twin'); calmHero.player.frenzy = false; advance(calmHero.game, .5);
  assert.equal(calmHero.events.filter(e => e.type === 'swing').length, 0, 'normal play still needs the button');
});

test('frenzy twin: cooldown is x0.6 on top, full speed while attacking, facing turns to the nearest enemy within 260 and holds otherwise', () => {
  const normal = castle(); normal.game.setWeapon('twin'); normal.player.attackCd = 0; normal.game.attack();
  const { game, player } = frenzied('twin');
  player.attackCd = 0; player.dir = 1; calm(enemy(game, 450)); calm(enemy(game, 800)); game.attack();
  assert.equal(player.dir, -1, 'the nearest in range is behind');
  assert.ok(player.attackCd < normal.player.attackCd);
  game.update(1 / 120, { right: true });
  assert.equal(player.vx, player.speed, 'no 65% slow while swinging'); assert.equal(player.dir, -1, 'walking forward does not turn the facing mid-swing');
  const far = frenzied('twin'); far.player.dir = -1; calm(enemy(far.game, 1000)); far.player.attackCd = 0; far.game.attack();
  assert.equal(far.player.dir, -1, 'nothing within 260 keeps the facing');
});

test('frenzy twin: holding walk-back keeps facing and swings landing; with no enemy in range facing never changes', () => {
  const { game, player, events } = frenzied('twin');
  player.x = 600; player.dir = 1; const e = calm(enemy(game, 680)); e.hp = e.maxHp = 1e6;
  for (let i = 0; i < 240; i++) { game.update(1 / 120, { left: true }); player.x = 600; assert.equal(player.dir, 1); }
  assert.ok(events.filter(x => x.type === 'swing').length >= 3 && events.some(x => x.type === 'hit'), 'swings keep landing');
  const far = frenzied('twin'); far.player.dir = 1; advance(far.game, .5, { left: true });
  assert.equal(far.player.dir, 1, 'no enemy in range: walking does not turn the hero');
});

test('frenzy twin: dash is ignored and not buffered, jump and plunge still work', () => {
  const { game, player, events } = frenzied('twin');
  game.update(1 / 120, { dash: true }); assert.equal(player.dash, 0); assert.equal(player.dashBuf, 0); assert.ok(!events.some(e => e.type === 'dash'));
  advance(game, .5, {}); assert.ok(!events.some(e => e.type === 'dash'), 'no buffered dash fires later');
  game.update(1 / 120, { jump: true }); assert.ok(events.some(e => e.type === 'jump'));
  const n = castle(); n.game.setWeapon('twin'); n.game.dash(); assert.ok(n.events.some(e => e.type === 'dash'), 'dash works outside the frenzy');
  const t = frenzied('twin'); t.player.grounded = false; t.player.y = FLOOR - 150; t.player.attackCd = 0; t.game.attack();
  assert.equal(t.player.plunge, 1);
});

test('frenzy spear: dash cooldown is 0 but one dash at a time; no i-frames, no perfect dodge; +6 burn per dash; the thrust window follows', () => {
  const { game, player, events } = frenzied('spear');
  game.dash();
  assert.equal(player.dashCd, 0); assert.equal(player.invulnerable, 0); assert.equal(player.perfect, 0);
  assert.equal(player.blood, 195 - ASSAULT_BURN); assert.equal(events.find(e => e.type === 'dash').assault, true);
  game.dash(true); assert.equal(player.blood, 195 - ASSAULT_BURN, 'no second dash while one is running');
  game.hurt(15, 1); assert.equal(player.blood, 195 - ASSAULT_BURN - 15, 'a hit mid-dash lands');
  advance(game, .4); assert.ok(player.thrustWindow > 0);
  const blood = player.blood; game.dash(); assert.equal(events.filter(e => e.type === 'dash').length, 2, 'chained again at once'); assert.ok(player.blood <= blood - ASSAULT_BURN + 1e-9);
  const n = castle(); n.game.setWeapon('spear'); n.game.dash();
  assert.ok(n.player.dashCd > 0 && n.player.invulnerable > 0 && n.events.find(e => e.type === 'dash').assault === false, 'outside the frenzy a dash is unchanged');
});

test('frenzy spear: the extra burn can end the frenzy but never kills', () => {
  const { game, player } = frenzied('spear', 103);
  game.dash(); assert.equal(player.blood, 100); assert.equal(player.frenzy, false); assert.equal(game.state, 'playing');
});

test('frenzy spear: an assault dash hits every overlapped enemy once with heavy knockback, poise and blood; wide spacing is missed', () => {
  const { game, player, events } = frenzied('spear', 150);
  const a = calm(enemy(game, 640)), b = calm(enemy(game, 700)), c = calm(enemy(game, 1100));
  player.crit = 0; game.dash(); const poise = a.poise;
  advance(game, .25);
  for (const e of [a, b]) { assert.equal(e.hp, 500 - player.damage, '1.0 x damage, once'); assert.ok(e.poise < (e === a ? poise : e.maxPoise)); }
  assert.equal(c.hp, 500);
  assert.equal(events.filter(e => e.type === 'assaultHit').length, 2);
  assert.ok(player.blood > 150 - ASSAULT_BURN - 12 * .25, 'a sword hit pays blood (halved)');
  advance(game, .3); const before = a.hp; advance(game, .3); assert.equal(a.hp, before, 'no more hits without a new dash');
  player.x = 600; game.dash(); advance(game, .25); assert.equal(a.hp < before, true, 'a new dash hits again');
});

test('frenzy spear: a shield bearer blocks the assault from the front and the dash ends; from behind it lands', () => {
  const { game, player } = frenzied('spear', 150);
  const s = calm(enemy(game, 650, { type: 'shield' })); s.dir = -1;
  player.crit = 0; game.dash(); advance(game, .25);
  assert.ok(s.hp > 500 - player.damage, 'blocked: chip damage only'); assert.equal(player.dash, 0);
  const t = frenzied('spear', 150); const s2 = calm(enemy(t.game, 650, { type: 'shield' })); s2.dir = 1; t.player.crit = 0;
  t.game.dash(); advance(t.game, .25); assert.equal(s2.hp, 500 - t.player.damage);
});

test('frenzy spear: an assault dash breaks the Warden armor in phase 1 and chips FRENZY_CHIP in phase 2', () => {
  const { game, player, b } = warden(1000, 900);
  Object.assign(player, { blood: 190, frenzy: true }); player.crit = 0;
  game.dash(); advance(game, .2);
  assert.equal(b.superArmor, 0); assert.ok(game.fightStats.breaks === 1);
  const t = warden(1000, 900); Object.assign(t.player, { blood: 190, frenzy: true, crit: 0 }); t.b.bossPhase = 2;
  t.game.dash(); advance(t.game, .2); assert.equal(t.b.superArmor, ARMOR_MAX - FRENZY_CHIP);
});

test('weapon frenzies are castle only: normal and Endless runs ignore weapon and frenzy', () => {
  for (const mode of ['normal', 'endless']) {
    const game = new Game(() => {}, 42, mode); game.start(); game.state = 'playing'; game.enemies = [];
    Object.assign(game.player, { frenzy: true, weapon: 'twin', x: 600 });
    game.update(1 / 120, { dash: true }); assert.ok(game.player.dash > 0 || game.player.dashCd > 0, `${mode}: dash works`);
    const before = game.player.hp; game.player.invulnerable = 0; game.player.weapon = 'heavy'; game.hurt(10, 1);
    assert.equal(game.player.hp, before - 10); assert.equal(game.player.debt, 0);
  }
});

test('debtLethal: the cue counts Eclipse, which ends the frenzy below 100 and pays from the blood left', () => {
  const { game, player } = castle(42, 3);
  Object.assign(player, { frenzy: true, weapon: 'heavy', blood: 110, debt: 95 });
  assert.equal(game.debtLethal(), true, '110 - 18 = 92 <= 95');
  player.debt = 91; assert.equal(game.debtLethal(), false);
  player.blood = 150; player.debt = 99; assert.equal(game.debtLethal(), false, 'Eclipse leaves 132, the burn stops at 100');
  player.debt = 100; assert.equal(game.debtLethal(), true);
  player.blood = 30; player.debt = 30; assert.equal(game.debtLethal(), true, 'cannot cast below SKILL_MIN: plain blood');
  player.debt = 0; assert.equal(game.debtLethal(), false);
  Object.assign(player, { frenzy: true, blood: 110, debt: 95, magicCd: 0, dir: 1 }); game.magic();
  assert.equal(game.state, 'dead');
});

test('warden kill: the burn freezes and the debt is not paid in the 1.6 s window; the Vigil clears it', () => {
  const { game, player, b } = warden(1000, 940);
  Object.assign(player, { blood: 115, frenzy: true, weapon: 'heavy', debt: 120 });
  game.damageEnemy(b, 9999, 1, false, false);
  const k = player.blood; advance(game, 1.0);
  assert.equal(game.state, 'playing'); assert.ok(player.frenzy && player.blood === k && player.debt === 120, `frozen ${k} ${player.blood} ${player.debt}`);
  assert.equal(game.debtLethal(), false, 'the win forgives the debt');
  advance(game, 1.0);
  assert.equal(game.state, 'rest'); assert.equal(game.vigil, 2); assert.equal(player.debt, 0);
});

test('king kill: the burn freezes and the debt is not paid in the window; the slice end clears it', () => {
  const { game, player, b, events } = kingFight();
  Object.assign(player, { blood: 115, frenzy: true, weapon: 'heavy', debt: 120 });
  game.damageEnemy(b, 99999, 1, false, false);
  const k = player.blood; advance(game, 1.0);
  assert.equal(game.state, 'playing'); assert.ok(player.frenzy && player.blood === k && player.debt === 120, `frozen ${k} ${player.blood} ${player.debt}`);
  assert.equal(game.debtLethal(), false, 'the win forgives the debt');
  advance(game, 1.0);
  assert.equal(game.state, 'sliceEnd'); assert.ok(events.some(e => e.type === 'sliceEnd' && e.king === 'won'));
});

// ---- Castle kits, PR 2 (#50): spearman, bat and knight, and the floor table without priest and mage ----
const swings = (events, kind) => events.filter(ev => ev.type === 'enemySwing' && (kind === undefined || ev.kind === kind));
const tellsOf = (events, kind) => events.filter(ev => (ev.type === 'enemyTell' || ev.type === 'enemyHeavy') && ev.kind === kind);

test('castle floor table (PR 2): bats from floor 4, one knight on floor 7, floors 1-3 unchanged', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const game = new Game(() => {}, seed, 'castle'), types = floor => { game.floor = floor; return game.castlePlan(); };
    for (const floor of [1, 2, 3]) assert.ok(types(floor).every(t => t === 'skeleton' || t === 'shield' || t === 'spear'), `floor ${floor}: no bat or knight`);
    const four = types(4);
    assert.equal(four.length, 6); assert.deepEqual(four.map((t, i) => t === 'bat' ? i : -1).filter(i => i >= 0), [1, 3], 'two bats, both outside the two gate guards (the last two slots)');
    for (const floor of [5, 6]) { const plan = types(floor); assert.equal(plan.filter(t => t === 'bat').length, 1); assert.equal(plan[1], 'bat'); assert.ok(!plan.includes('knight'), `no knight on floor ${floor}`); }
    const seven = types(7); assert.equal(seven.filter(t => t === 'knight').length, 1, 'knight preview'); assert.equal(seven[1], 'bat');
    for (const floor of [8, 9]) assert.equal(types(floor).length, 7);
  }
  const g = new Game(() => {}, 5, 'castle'); g.loadFloor(4);
  assert.equal(g.enemies.filter(e => e.type === 'bat').length, 2, 'both floor-4 bats spawn (a bat in a guard slot would become a skeleton)');
  const n = new Game(() => {}, 5, 'normal'); n.loadStage(0); assert.ok(n.enemies.every(e => e.type === 'skeleton' || e.type === 'bat'), 'normal mode rolls its own types');
});

test('castle spearman: a hero inside the tip draws the low sweep (0.5 s tell, 30 px tall, jumpable, punishable recovery); outside it the thrust is unchanged', () => {
  const { game, player, e, events } = lightFoe('spear', 60);
  player.blood = 150; advance(game, .02);
  assert.equal(e.move, 'sweep'); assert.ok(e.tell > .45 && e.token === 'light' && !e.heavy);
  assert.equal(e.warn.box.h, 30); assert.equal(tellsOf(events, 'sweep').length, 1);
  const box = { ...e.warn.box }; player.x -= 20; advance(game, .2); assert.deepEqual(e.warn.box, box, 'the area is fixed at tell start');
  player.x += 20; game.damageEnemy(e, 5, 1, false, false, false, 10); assert.ok(e.tell > 0 && e.stun === 0, 'hyper armor from tell start');
  advance(game, .4);
  assert.ok(swings(events, 'sweep').length === 1 && player.blood < 150, 'a hero who stays is swept');
  assert.ok(e.recover > 0 && e.recover <= .5 && e.punishable && e.token === 'light', 'short punishable recovery that holds the token');
  // jumping clears the 30 px box
  const j = lightFoe('spear', 60); j.player.blood = 150; advance(j.game, .1); j.game.jump();
  advance(j.game, .5); assert.equal(swings(j.events, 'sweep').length, 1); assert.equal(j.player.blood, 150, 'jumped the sweep');
  // from outside 80 the spearman thrusts (0.64 s, 54 px tall), never sweeps
  const t = lightFoe('spear', 150); advance(t.game, .02);
  assert.ok(t.e.tell > .6 && t.e.warn.kind === 'thrust' && t.e.warn.box.h === 54 && !t.e.move, 'thrust from the tip');
});

test('castle spearman: with no token free a hero inside the tip makes it back off to 120 instead of sweeping; its lunge never starts inside the sweep range', () => {
  const { game, player, e } = lightFoe('spear', 60);
  const a = enemy(game, player.x + 300); const b = enemy(game, player.x + 330);
  Object.assign(a, { token: 'light', tell: 9, cd: 1e9 }); Object.assign(b, { token: 'light', tell: 9, cd: 1e9 }); // both tokens taken
  advance(game, .02); assert.equal(e.tell, 0, 'no token, no sweep');
  advance(game, 1); assert.ok(e.x - player.x >= 118 && e.tell === 0, `backed off to ${e.x - player.x}`);
  const l = heavyFoe('spear', 60); advance(l.game, .02); assert.notEqual(l.e.warn?.kind, 'lunge', 'inside 80 the sweep, not the lunge');
  const m = heavyFoe('spear', 150); advance(m.game, .02); assert.equal(m.e.warn.kind, 'lunge');
});

test('castle bat: swoop has a 0.45 s tell with hyper armor, then flutters up for a 0.5 s recovery that a sword can still hit', () => {
  const { game, player, e, events } = lightFoe('bat', 20);
  e.y = player.y - 30; player.blood = 150; player.dir = 1;
  advance(game, .02);
  assert.ok(e.tell > .4 && e.token === 'light' && tellsOf(events, 'swoop').length === 1, 'tell');
  game.damageEnemy(e, 3, 1, false, false, false, 3); assert.ok(e.tell > 0 && e.stun === 0, 'hyper armor');
  advance(game, .5);
  assert.equal(swings(events).length, 1); assert.ok(e.recover > 0 && e.punishable);
  advance(game, .3);
  const y0 = e.y; assert.ok(y0 <= player.y - 30, `flutters up (${player.y - y0})`);
  player.x = e.x - 40; player.dir = 1; player.combo = 1; player.move = ''; game.hitSet = new Set(); const hp = e.hp; game.hitTargets();
  assert.ok(e.hp < hp, 'a sword still reaches it in recovery');
  const n = new Game(() => {}, 3, 'normal'); n.state = 'playing'; n.enemies = []; const nb = enemy(n, n.player.x + 20, { type: 'bat' }); nb.y = n.player.y - 25; nb.cd = 0; n.update(1 / 120, {});
  assert.ok(Math.abs(nb.tell - .36) < .02, 'normal mode keeps the 0.36 s swoop');
});

test('castle bat: from up to 170 px the swoop first darts to 10 px of where the hero stood (0.25 s of a 0.7 s tell); walking out answers it; without a token it hovers 150-170 px out', () => {
  const { game, player, e, events } = lightFoe('bat', 120);
  e.y = player.y - 30; player.blood = 150; player.dir = -1; // facing away: no crossover
  const x0 = player.x; advance(game, .02);
  assert.ok(e.tell > .65 && e.tell < .7 && e.dartT > 0 && e.token === 'light' && tellsOf(events, 'swoop').length === 1, 'one tell covers the dart');
  advance(game, .25);
  assert.ok(Math.abs(e.x - (x0 + 10)) < 1 && e.dartT === 0 && e.tell > .4, `darted to a point fixed at tell start (${e.x - x0})`);
  player.x -= 60; advance(game, .5);
  assert.equal(swings(events).length, 1); assert.equal(player.blood, 150, 'walked out of the 55 px swoop');
  const r = lightFoe('bat', 60); r.e.y = r.player.y - 30; r.player.dir = -1;
  const a = enemy(r.game, r.player.x - 300), b = enemy(r.game, r.player.x - 330);
  Object.assign(a, { token: 'light', tell: 9, cd: 1e9 }); Object.assign(b, { token: 'light', tell: 9, cd: 1e9 }); // both tokens taken
  advance(r.game, 1.2); const gap = r.e.x - r.player.x;
  assert.ok(gap >= 148 && gap <= 172 && r.e.tell === 0, `no token: hovers outside sword reach (${gap})`);
});

test('castle bat: crossover flies over a hero who faces it within 140, ends behind them, takes no token and shows its end point', () => {
  const setup = (dir = 1, gap = 110) => { const c = castle(42, 4); c.game.rand = () => .5; c.player.dir = dir; const e = enemy(c.game, c.player.x + dir * gap, { type: 'bat' }); e.y = c.player.y - 40; e.dir = -dir; e.cd = 0; return { ...c, e }; };
  const { game, player, e, events } = setup();
  const side = Math.sign(e.x - player.x);
  advance(game, .02);
  assert.ok(e.crossT > 0 && e.token === '' && !game.attacking(e), 'a move, not an attack: no token, no tell');
  const cue = events.find(ev => ev.type === 'enemyCross'); assert.ok(cue && Math.sign(cue.toX - player.x) === -side && cue.duration === .5, 'the cue names the far side');
  game.damageEnemy(e, 2, -1, false, false, false, 5); assert.ok(e.crossT > 0 && e.stun === 0, 'a hit does not interrupt the flight');
  advance(game, .55);
  assert.equal(Math.sign(e.x - player.x), -side, 'behind the hero'); assert.ok(Math.abs(e.x - player.x) < 90 && e.crossT === 0 && e.dir === side, 'close, turned round');
  assert.ok(game.tokens.length <= 1);
  // not facing it, too far, or on cooldown: no crossover
  const away = setup(1, 110); away.player.dir = -1; advance(away.game, .1); assert.equal(away.e.crossT, 0, 'only against a hero who faces it');
  const far = setup(1, 200); advance(far.game, .02); assert.equal(far.e.crossT, 0, 'beyond 140');
  assert.ok(e.crossCd > 3, 'cooldown');
  // normal mode has no crossover
  const n = new Game(() => {}, 3, 'normal'); n.state = 'playing'; n.enemies = []; n.player.dir = 1; const nb = enemy(n, n.player.x + 110, { type: 'bat' }); n.rand = () => .3; advance(n, .3); assert.ok(!nb.crossT);
});

test('castle bat: a crossed bat may swoop from behind, with a normal tell', () => {
  const { game, player, e, events } = castle(42, 4);
  game.rand = () => .5; player.dir = 1; player.invulnerable = 9;
  const b = enemy(game, player.x + 110, { type: 'bat' }); b.y = player.y - 30; b.dir = -1; b.cd = 0;
  advance(game, 1.2);
  assert.ok(events.some(ev => ev.type === 'enemyCross') && tellsOf(events, 'swoop').length >= 1, 'swoop after the crossover');
  const cross = events.findIndex(ev => ev.type === 'enemyCross'), tell = events.findIndex(ev => ev.type === 'enemyTell' && ev.kind === 'swoop');
  assert.ok(tell > cross); assert.ok(Math.sign(b.x - player.x) !== 0);
});

test('castle knight: slash tell 0.6 s with a fixed box; hero in front within 150 draws the overhead (0.5 s tell, steps 40, box 10-120 x 110)', () => {
  const { game, player, e, events } = lightFoe('knight', 50, 7);
  player.blood = 150; player.dir = 1; advance(game, .02);
  assert.ok(e.tell > .55 && e.warn.kind === 'slash' && e.warn.box.h === 100 && e.token === 'light');
  const slashBox = { ...e.warn.box }; player.x -= 10; advance(game, .2); assert.deepEqual(e.warn.box, slashBox);
  player.x += 10; game.damageEnemy(e, 5, 1, false, false, false, 10); assert.ok(e.stun === 0 && e.tell > 0, 'hyper armor');
  advance(game, .42);
  assert.equal(e.move, 'overhead'); assert.ok(e.tell > .45 && e.tell <= .5, `branch tell ${e.tell}`); assert.equal(e.warn.box.h, 110);
  assert.equal(tellsOf(events, 'overhead').length, 1);
  const x0 = e.x, to = e.warn.to; assert.ok(Math.abs(Math.abs(to - x0) - 40) < 1e-6 && to > x0 === (e.dir > 0));
  player.invulnerable = 0; player.blood = 150; advance(game, .75);
  assert.ok(Math.abs(e.x - to) < 1, 'stepped 40 px forward'); assert.equal(swings(events, 'overhead').length, 1);
  assert.ok(e.recover > .5 && e.recover <= .8 && e.punishable && e.token === 'light', 'string recovery 0.8 s, same token all through');
  assert.equal(holders(game).length, 1);
});

test('castle knight: the branch is picked at slash contact from where the hero stands (behind: turnswipe, far: the string ends)', () => {
  const at = (dx, y = 0) => { const c = lightFoe('knight', 50, 7); c.player.dir = 1; c.player.invulnerable = 99; advance(c.game, .55); c.player.x = c.e.x + dx; c.player.y = FLOOR - y; advance(c.game, .1); return c; };
  const behind = at(70);
  assert.equal(behind.e.move, 'turnswipe'); assert.ok(behind.e.tell > .4 && behind.e.tell <= .5);
  const box = behind.e.warn.box; assert.ok((box.x + box.w / 2 - behind.e.x) * behind.e.dir < 0, 'the swipe box is behind the knight'); assert.notEqual(behind.e.warn.kind, 'overhead');
  const boxFixed = { ...box }; behind.player.x = behind.e.x - 60; advance(behind.game, .2); assert.deepEqual(behind.e.warn.box, boxFixed, 'a hero who walks round does not re-aim it');
  behind.player.invulnerable = 0; behind.player.blood = 150; behind.player.x = behind.e.x + 60; advance(behind.game, .4);
  assert.ok(swings(behind.events, 'turnswipe').length === 1 && behind.player.blood < 150, 'a hero who stays behind is hit');
  assert.ok(behind.e.recover > 0 && behind.e.recover <= .8);
  const far2 = lightFoe('knight', 50, 7); far2.player.invulnerable = 99; advance(far2.game, .55); far2.player.x = far2.e.x - 400; advance(far2.game, .1);
  assert.ok(far2.e.move === '' && far2.e.recover > 0 && far2.e.recover <= .5 && far2.e.punishable, 'no follow-up: plain slash recovery 0.5 s');
  assert.equal(far2.events.filter(ev => ev.type === 'enemyTell' && ev.follow).length, 0);
  const high = at(-60, 120); assert.equal(high.e.move, '', 'a hero on another level ends the string');
});

test('castle knight: greatswing recovers for 1.2 s and its posture is 140; a posture break ends a string and frees the token', () => {
  const { game, player, e } = heavyFoe('knight', 60, 42); assert.equal(e.maxPoise, 140);
  player.blood = 150; advance(game, .02); assert.equal(e.warn.kind, 'greatswing');
  advance(game, 1.05); assert.ok(e.recover > 1 && e.recover <= 1.2 && e.punishable);
  const s = lightFoe('knight', 50, 7); s.player.invulnerable = 99; advance(s.game, .62); assert.equal(s.e.move, 'overhead');
  s.game.damageEnemy(s.e, 1, 1, false, false, false, 1e4); s.game.freeze = 0;
  assert.ok(s.e.stun > 0 && s.e.tell === 0 && s.e.move === '' && s.e.warn === null, 'break cancels the follow-up');
  advance(s.game, .02); assert.equal(s.e.token, '');
});

test('castle kits: every new light move waits at least 0.45 s between its tell and its contact; heavies glint exactly 0.4 s before', () => {
  const probe = (type, floor, gapPx, setup, kind) => {
    const c = lightFoe(type, gapPx, floor); c.player.invulnerable = 99; c.player.dir = 1; setup?.(c);
    let tellAt = null, hitAt = null;
    for (let i = 0; i < 120 * 3 && hitAt === null; i++) {
      c.game.update(1 / 120, {});
      if (tellAt === null && tellsOf(c.events, kind).length) tellAt = c.game.time;
      if (hitAt === null && swings(c.events, kind === 'thrust' ? 'spear' : kind).length) hitAt = c.game.time;
    }
    return { tell: hitAt - tellAt, ok: tellAt !== null && hitAt !== null };
  };
  for (const [type, floor, px, kind, setup] of [['spear', 3, 150, 'thrust'], ['spear', 3, 60, 'sweep'], ['knight', 7, 50, 'slash'], ['knight', 7, 50, 'overhead'], ['bat', 4, 20, 'swoop', c => { c.e.y = c.player.y - 30; }]]) {
    const r = probe(type, floor, px, setup, kind);
    assert.ok(r.ok && r.tell >= .45 - 1 / 120, `${type} ${kind}: ${r.tell}`);
  }
  const turn = lightFoe('knight', 50, 7); turn.player.invulnerable = 99; advance(turn.game, .55); turn.player.x = turn.e.x + 70; advance(turn.game, .1);
  assert.ok(turn.e.move === 'turnswipe' && turn.e.tell > .39, 'turnswipe tell is 0.5 s');
  for (const [type, floor, px, kind] of [['spear', 5, 150, 'lunge'], ['bat', 4, 100, 'dive'], ['knight', 7, 60, 'greatswing']]) {
    const c = heavyFoe(type, px, 42); c.game.floor = floor; c.player.invulnerable = 99; if (type === 'bat') c.e.y = FLOOR - 95;
    let glintAt = null, hitAt = null;
    for (let i = 0; i < 120 * 3 && hitAt === null; i++) {
      c.game.update(1 / 120, {});
      if (glintAt === null && c.events.some(ev => ev.type === 'enemyGlint')) glintAt = c.game.time;
      if (hitAt === null && swings(c.events).some(ev => ev.heavy)) hitAt = c.game.time;
    }
    assert.ok(glintAt !== null && hitAt !== null && Math.abs(hitAt - glintAt - .4) <= 1 / 120 + 1e-9, `${kind}: glint ${hitAt - glintAt} before contact`);
  }
});

test('castle delayed variants (PR 2): dive after floor 4, lunge after floor 5, greatswing after floor 7; never on floors 1-4', () => {
  const tellOf = (floor, type, gapPx) => {
    const c = castle(42, floor); c.game.rand = () => 0;
    const e = enemy(c.game, c.player.x + gapPx, { type }); e.cd = 0; e.dir = -1; if (type === 'bat') e.y = FLOOR - 95;
    advance(c.game, .02); return e;
  };
  for (const floor of [1, 2, 3, 4]) for (const [type, px] of [['spear', 150], ['bat', 100], ['knight', 60]]) { const e = tellOf(floor, type, px); assert.ok(!e.delayed && e.tell < 1.05, `${type} floor ${floor}`); }
  assert.ok(tellOf(5, 'bat', 100).delayed, 'a dive met on floor 4 may be delayed from floor 5');
  assert.ok(!tellOf(5, 'spear', 150).delayed && tellOf(6, 'spear', 150).delayed);
  assert.ok(!tellOf(7, 'knight', 60).delayed, 'the knight is previewed on floor 7: no delayed greatswing there');
  assert.ok(tellOf(8, 'knight', 60).delayed && tellOf(8, 'knight', 60).tell > 1.3);
});

test('castle kits (PR 2): tokens, hyper armor and the on-screen rule hold for the new moves', () => {
  const { game, player, events } = castle(42, 7);
  game.enemies = []; game.rand = (r => () => { r = (r * 16807) % 2147483647; return r / 2147483647; })(11);
  player.invulnerable = 1e9; player.blood = 200;
  for (const [type, dx] of [['knight', 50], ['spear', 100], ['bat', 40], ['bat', -50], ['spear', -80], ['knight', -120]]) { const e = enemy(game, player.x + dx, { type, hp: 1e6 }); e.cd = 0; e.maxPoise = e.poise = 1e6; if (type === 'bat') e.y = player.y - 30; }
  let maxHolders = 0, maxHeavy = 0;
  for (let i = 0; i < 120 * 25; i++) {
    game.update(1 / 120, {}); player.blood = 200;
    maxHolders = Math.max(maxHolders, holders(game).length); maxHeavy = Math.max(maxHeavy, holders(game).filter(e => e.token === 'heavy').length);
    for (const e of game.enemies) if (e.crossT > 0) assert.equal(e.token, '', 'a crossover never holds a token');
  }
  assert.ok(maxHolders <= ATTACK_TOKENS && maxHeavy <= 1, `holders ${maxHolders}, heavy ${maxHeavy}`);
  assert.ok(events.some(ev => ev.type === 'enemyCross') && events.some(ev => ev.type === 'enemyTell' && ev.kind === 'swoop') && events.some(ev => ev.type === 'enemyTell' && ev.kind === 'thrust'), 'the kits ran');
  const far = castle(42, 7); far.player.x = 900; far.game.rand = () => .99;
  for (const [type, dx, ok] of [['spear', 561, false], ['spear', 540, true], ['knight', -321, false], ['knight', -300, true]]) { const e = enemy(far.game, far.player.x + dx, { type }); assert.equal(far.game.canWindUp(e), ok, `${type} ${dx}`); }
});

test('castle kits (PR 2): the normal run and Endless keep the old spearman, bat and knight', () => {
  for (const mode of ['normal', 'endless']) {
    const g = new Game(() => {}, 9, mode); g.state = 'playing'; g.enemies = [];
    const sp = enemy(g, g.player.x + 60, { type: 'spear' }), kn = enemy(g, g.player.x - 70, { type: 'knight' }); sp.cd = 0; kn.cd = 0; sp.dir = -1; kn.dir = 1; g.player.invulnerable = 99;
    advance(g, .05);
    assert.ok(sp.move === '' && !sp.warn && sp.thrustBox, `${mode}: the spearman thrusts, no sweep`);
    advance(g, 3);
    assert.ok(!('crossT' in sp) && !g.enemies.some(e => e.move === 'overhead' || e.move === 'turnswipe'), `${mode}: no new fields or moves`);
  }
});

test('castle knight: the overhead lands STRING_TELL after its branch, the step inside the tell', () => {
  const { game, player, e, events } = lightFoe('knight', 50, 7);
  player.blood = 150; player.dir = 1; player.invulnerable = 99;
  let t = 0; while (e.move !== 'overhead' && t < 2) { advance(game, 1 / 120); t += 1 / 120; }
  assert.equal(e.move, 'overhead');
  const x0 = e.x, to = e.warn.to; let n = 0;
  while (swings(events, 'overhead').length === 0 && n < 200) { advance(game, 1 / 120); n++; }
  assert.ok(Math.abs(n / 120 - .5) < .02, `contact ${n / 120} s after the branch`);
  assert.ok(Math.abs(e.x - to) < 1 && Math.abs(to - x0) > 39);
});

test('castle bat: a crossover never starts from the post-swoop flutter height', () => {
  const { game, player, events } = castle(42, 4);
  game.enemies = []; player.x = 600; player.dir = 1;
  game.spawnEnemy('bat', 750, 0); const b = game.enemies.at(-1);
  Object.assign(b, { dir: -1, cd: 0, heavyCd: 99, hp: 9999, maxHp: 9999, y: player.y - 34 });
  for (let i = 0; i < 260; i++) { player.invulnerable = 0; player.blood = 100; game.update(1 / 120, {}); assert.ok(player.y - b.y <= 100, `bat ${player.y - b.y} above the feet at ${i / 120} s`); }
});

test('castle: the spearman reads an approaching hero harder from floor 5 on; floors 1-4 keep the base read', () => {
  for (const [floor, chance] of [[4, .45], [5, 1]]) {
    const { game, player } = castle(42, floor);
    const spear = enemy(game, player.x + 150, { type: 'spear' });
    player.vx = 200; // walking toward it
    assert.equal(game.heavyChance(spear), chance);
  }
});

// ---- Castle kits, PR 3 (#50): priest and mage, their floor 5-9 placement, and the seven elite twists ----
function kit(type, gap, { floor = 5, rand = .99, elite = false } = {}) {
  const c = castle(42, floor); c.game.rand = () => rand;
  const e = enemy(c.game, c.player.x + gap, { type }); e.cd = 0; e.dir = -1;
  if (elite) c.game.makeElite(e, 0);
  return { ...c, e };
}
const ranged = t => t === 'priest' || t === 'mage';
const queue = (game, ...values) => { game.rand = () => values.length ? values.shift() : .99; }; // the next rolls in order, then 0.99
// Steps until `done()` is true (at most `limit` seconds) and returns the game time then.
function until(game, done, limit = 3) { for (let i = 0; i < limit * 120 && !done(); i++) game.update(1 / 120, {}); return game.time; }

test('castle floors (PR 3): no priest or mage on floors 1-4; the priest is taught on 5, the mage on 6; never more than 2 ranged or support per floor', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const game = new Game(() => {}, seed, 'castle'), plan = floor => { game.floor = floor; return game.castlePlan(); }, n = (p, t) => p.filter(x => x === t).length;
    for (let floor = 1; floor <= 4; floor++) assert.ok(!plan(floor).some(ranged), `floor ${floor}`);
    for (let floor = 5; floor <= 9; floor++) {
      const p = plan(floor);
      assert.ok(p.filter(ranged).length <= 2, `floor ${floor}: ${p}`);
      assert.ok(n(p, 'priest') <= 1 && n(p, 'mage') <= 1, `floor ${floor}: at most one of each`);
      if (floor === 7) assert.ok(p.filter(ranged).length <= 1, 'floor 7: at most one priest or mage');
    }
    const five = plan(5); assert.equal(n(five, 'priest'), 1); assert.equal(n(five, 'mage'), 0);
    assert.ok(!ranged(five.at(-1)) && !ranged(five.at(-2)), 'the lesson is a regular enemy, not a gate guard');
    const six = plan(6); assert.equal(n(six, 'mage'), 1);
    for (let floor = 5; floor <= 9; floor++) { const q = plan(floor); assert.ok(!ranged(q.at(-1)) && !ranged(q.at(-2)), `floor ${floor}: no priest or mage gate guard: ${q}`); }
    assert.equal(plan(5)[1], 'bat'); assert.ok(!plan(5).includes('mage') && !plan(5).includes('knight'));
  }
  const g = new Game(() => {}, 5, 'castle'); g.loadFloor(5);
  assert.equal(g.enemies.filter(e => e.type === 'priest').length, 1);
  g.loadFloor(6); assert.equal(g.enemies.filter(e => e.type === 'mage').length, 1);
  for (const floor of [8, 9]) { g.loadFloor(floor); assert.equal(g.enemies.length, 8); assert.ok(g.enemies.filter(e => ranged(e.type)).length <= 2); }
});

test('castle priest: bolt tell 0.7 s, hyper armor from tell start, aimed once at release', () => {
  const { game, player, e, events } = kit('priest', 300);
  advance(game, .02);
  assert.ok(e.tell > .65 && e.tell <= .7 && e.token === 'light' && !e.blessRadius && tellsOf(events, 'bolt').length === 1);
  game.damageEnemy(e, 3, 1, false, false, false, 5); assert.ok(e.tell > 0 && e.stun === 0, 'hits do not cancel a bolt');
  advance(game, .4); player.x = e.x + 200; // the hero crosses to the far side before release
  until(game, () => game.projectiles.length > 0);
  const b = game.projectiles.at(-1); assert.ok(b && b.vx > 0 && Math.abs(Math.hypot(b.vx, b.vy) - 250) < 1, 'aimed at the hero where it stood at release, speed 250');
});

test('castle priest: bless has no hyper armor, needs no token and any hit cancels it (cooldown 2.5 s)', () => {
  const { game, e, events } = kit('priest', 300);
  const ally = enemy(game, e.x + 40); ally.cd = 99;
  advance(game, .02);
  assert.ok(e.blessRadius === 250 && e.tell > .8 && e.token === '' && game.tokens.length === 0, 'support: no token');
  game.damageEnemy(e, 1, 1, false, false, false, 1);
  assert.ok(e.blessRadius === 0 && e.tell === 0 && e.blessCd > 2 && e.blessCd <= 2.5, 'a hit cancels it');
  assert.equal(events.filter(ev => ev.type === 'enemyBuff').length, 0);
});

test('castle priest: rite is a heavy ground circle (r 56) at the hero x from tell start, glints 0.4 s before contact, hits a hero who stays and misses one who walks out or jumps, then kneels 1.0 s', () => {
  const stay = kit('priest', 300, { rand: 0 }); stay.player.blood = 150;
  advance(stay.game, .02);
  const e = stay.e, c = e.warn.circles[0];
  assert.ok(e.heavy && e.heavyKind === 'rite' && e.token === 'heavy' && !e.delayed && e.tell > .95 && e.tell <= 1, 'floor 5: rite, never delayed');
  assert.deepEqual([c.x, c.y, c.r], [stay.player.x, FLOOR, 56]);
  assert.equal(tellsOf(stay.events, 'rite').length, 1);
  let glintAt = null;
  const hitAt = until(stay.game, () => { if (glintAt === null && stay.events.some(ev => ev.type === 'enemyGlint')) glintAt = stay.game.time; return swings(stay.events, 'rite').length > 0; });
  assert.ok(Math.abs(hitAt - glintAt - .4) <= 1 / 120 + 1e-9, `glint ${hitAt - glintAt} before contact`);
  assert.equal(stay.player.blood, 50, 'a flat 100');
  assert.ok(e.recover > .95 && e.recover <= 1 && e.punishable && e.token === 'heavy', 'kneeling recovery holds the token');
  until(stay.game, () => e.recover === 0, 2); assert.equal(e.token, '', 'released when the kneeling ends');
  const walk = kit('priest', 300, { rand: 0 }); walk.player.blood = 150; advance(walk.game, .02);
  walk.player.x -= 90; advance(walk.game, 1.1); // the circle stays where the hero stood at tell start
  assert.equal(walk.player.blood, 150, 'walking out of the circle avoids it'); assert.equal(swings(walk.events, 'rite').length, 1);
  const jump = kit('priest', 300, { rand: 0 }); jump.player.blood = 150; advance(jump.game, .02); advance(jump.game, .9);
  for (let i = 0; i < 30; i++) { jump.player.y = FLOOR - 90; jump.player.vy = 0; jump.game.update(1 / 120, {}); } // above the disc at contact
  assert.equal(swings(jump.events, 'rite').length, 1); assert.equal(jump.player.blood, 150, 'a high jump clears the disc');
});

test('castle priest: rite is never delayed on floor 5, may be from floor 6 (hold = tell + 0.4 s, glint still 0.4 s before contact)', () => {
  const five = kit('priest', 300, { floor: 5, rand: 0 }); advance(five.game, .02); assert.ok(!five.e.delayed && five.e.tell <= 1);
  const six = kit('priest', 300, { floor: 6, rand: 0 }); advance(six.game, .02);
  assert.ok(six.e.delayed && six.e.tell > 1.35 && six.e.tell <= 1.4, 'delayed rite');
  assert.equal(tellsOf(six.events, 'rite')[0].delayed, true);
  const glint = until(six.game, () => six.events.some(ev => ev.type === 'enemyGlint')), hit = until(six.game, () => swings(six.events, 'rite').length > 0);
  assert.ok(Math.abs(hit - glint - .4) <= 1 / 120 + 1e-9);
  for (const floor of [1, 2, 3, 4, 5]) { const g = new Game(() => {}, 1, 'castle'); g.floor = floor; g.rand = () => 0; assert.equal(g.delayHeavy({}, 'rite'), false, `floor ${floor}`); }
});

test('castle priest: recoil backsteps 100 px in 0.3 s when the hero is inside 120, takes no token, deals nothing, cools down 4 s', () => {
  const { game, player, e, events } = kit('priest', 90);
  player.blood = 150; const x0 = e.x;
  advance(game, .02);
  assert.ok(e.recoilT > 0 && e.token === '' && !game.attacking(e) && events.filter(ev => ev.type === 'enemyRecoil').length === 1);
  game.damageEnemy(e, 1, -1, false, false, false, 1); assert.ok(e.recoilT > 0 && e.stun === 0, 'a hit does not stop the backstep');
  advance(game, .35);
  assert.ok(Math.abs(e.x - x0 - 100) < 4, `moved ${e.x - x0}`); assert.equal(player.blood, 150);
  assert.ok(e.recoilCd > 3.5);
  player.x = e.x - 80; advance(game, .05); assert.equal(e.recoilT, 0, 'on cooldown');
  const far = kit('priest', 200); advance(far.game, .05); assert.equal(far.e.recoilT, 0, 'only inside 120');
});

test('castle mage: bolt tell 0.65 s with hyper armor, aimed at release', () => {
  const { game, player, e, events } = kit('mage', 350, { floor: 6 });
  advance(game, .02);
  assert.ok(e.tell > .6 && e.tell <= .65 && e.token === 'light' && tellsOf(events, 'bolt').length === 1);
  game.damageEnemy(e, 3, 1, false, false, false, 5); assert.ok(e.tell > 0 && e.stun === 0);
  advance(game, .4); player.x = e.x + 200; advance(game, .3);
  assert.ok(game.projectiles.at(-1).vx > 0, 'aimed at release');
});

test('castle mage: ray is a 16 px line at the hero chest height from tell start, 20-460 px in front; it hits a hero who stays, a jump or dash clears it, then 1.1 s recovery', () => {
  const stay = kit('mage', 300, { floor: 6, rand: 0 }); stay.player.blood = 150; advance(stay.game, .02);
  const e = stay.e, b = e.warn.box;
  assert.ok(e.heavy && e.heavyKind === 'ray' && e.token === 'heavy' && e.tell > .95 && !e.delayed);
  assert.deepEqual([b.h, b.w, Math.round(b.x + b.w - e.x), Math.round(b.x - e.x)], [16, 440, -20, -460], 'to the hero side, 20 to 460 px');
  assert.equal(b.y + b.h / 2, FLOOR - 30, 'chest height at tell start');
  const box = { ...b }; advance(stay.game, .5); assert.deepEqual(e.warn.box, box, 'fixed at tell start');
  until(stay.game, () => swings(stay.events, 'ray').length > 0);
  assert.ok(e.strikeT > .14 && e.strikeT <= .15, 'contact window 0.15 s');
  until(stay.game, () => e.recover > 0);
  assert.equal(stay.player.blood, 50, 'a flat 100');
  assert.ok(e.recover > 1.05 && e.recover <= 1.1 && e.punishable);
  const jump = kit('mage', 300, { floor: 6, rand: 0 }); jump.player.blood = 150; advance(jump.game, .02);
  advance(jump.game, .6); jump.game.jump(); advance(jump.game, .6);
  assert.equal(swings(jump.events, 'ray').length, 1); assert.equal(jump.player.blood, 150, 'jumped the ray');
  const dash = kit('mage', 300, { floor: 6, rand: 0 }); dash.player.blood = 150; advance(dash.game, .02);
  advance(dash.game, .85); dash.game.dash(); advance(dash.game, .4);
  assert.equal(swings(dash.events, 'ray').length, 1); assert.ok(dash.player.blood >= 150, 'a dash through the contact window (a perfect dodge pays blood)');
  const close = kit('mage', 15, { floor: 6, rand: 0 }); close.player.x = close.e.x - 10; advance(close.game, .05);
  assert.ok(close.e.heavyKind !== 'ray' && close.e.blinkT > 0, 'a hero closer than 20 px is blinked away from, not rayed');
});

test('castle mage: ray is never delayed on floors 5-6, may be from floor 7', () => {
  for (const floor of [1, 5, 6]) { const c = kit('mage', 300, { floor, rand: 0 }); advance(c.game, .02); assert.ok(c.e.heavyKind === 'ray' && !c.e.delayed && c.e.tell <= 1, `floor ${floor}`); }
  const seven = kit('mage', 300, { floor: 7, rand: 0 }); advance(seven.game, .02);
  assert.ok(seven.e.delayed && seven.e.tell > 1.35, 'delayed ray');
});

test('castle mage: blink shimmers 0.4 s on both spots, teleports 220 px from the hero onto the floor, takes no token, cooldown 6 s; a hit does not stop it, a posture break does', () => {
  const { game, player, e, events } = kit('mage', 100, { floor: 6 });
  advance(game, .02);
  const cue = events.find(ev => ev.type === 'enemyBlink');
  assert.ok(e.blinkT > .37 && e.token === '' && !game.attacking(e) && cue && cue.duration === .4, 'shimmer, no token');
  assert.ok(Math.abs(Math.abs(cue.toX - player.x) - 220) < 1 && cue.toY >= cue.y - 1, 'target 220 px from the hero');
  game.damageEnemy(e, 1, 1, false, false, false, 1); assert.ok(e.blinkT > 0 && e.stun === 0, 'hits do not interrupt');
  until(game, () => events.some(ev => ev.type === 'enemyBlinked'), 1);
  assert.ok(Math.abs(e.x - cue.toX) < 1e-6 && e.y === FLOOR && e.blinkT === 0, `landed ${e.x - player.x}`);
  assert.ok(e.blinkCd > 5.4 && events.some(ev => ev.type === 'enemyBlinked'));
  player.x = e.x - 60; advance(game, .05); assert.equal(e.blinkT, 0, 'cooldown');
  const b = kit('mage', 100, { floor: 6 }); advance(b.game, .1); assert.ok(b.e.blinkT > 0);
  b.game.stagger(b.e); assert.equal(b.e.blinkT, 0, 'a posture break cancels the blink');
  const far = kit('mage', 200, { floor: 6 }); advance(far.game, .05); assert.equal(far.e.blinkT, 0, 'only inside 120');
});

test('castle elites (PR 3): health x1.5, no affix, no damage bonus, one twist per type, delayed heavies on any floor', () => {
  const game = new Game(() => {}, 3, 'castle'); game.floor = 1;
  const twists = { skeleton: 'duelist', bat: 'shrieker', shield: 'phalanx', spear: 'impaler', knight: 'oathsworn', priest: 'hierophant', mage: 'prism' };
  for (const [type, twist] of Object.entries(twists)) {
    const plain = game.spawnEnemy(type, 900, 0), e = game.spawnEnemy(type, 900, 0);
    game.makeElite(e, 0);
    assert.ok(e.elite && e.twist === twist && e.affix === null, type);
    assert.equal(e.maxHp, Math.round(plain.maxHp * 1.5)); assert.equal(e.damage, plain.damage, 'no x1.3'); assert.equal(e.speed, plain.speed, 'no Swift');
  }
  game.rand = () => 0; const e = game.spawnEnemy('skeleton', 900, 0); assert.equal(game.delayHeavy(e, 'cleave'), false, 'a plain skeleton: never on floor 1');
  game.makeElite(e, 0); assert.equal(game.delayHeavy(e, 'cleave'), true, 'an elite: 50% on any floor');
  game.rand = () => .6; assert.equal(game.delayHeavy(e, 'cleave'), false);
  const events = [], g = new Game(ev => events.push(ev), 42, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.loadFloor(8);
  const o = g.enemies.find(x => x.elite && x.required === false && x.type === 'knight'); assert.ok(o.bonus && o.type === 'knight' && o.twist === 'oathsworn', 'the floors 8-9 bonus elite');
  g.player.x = o.x - 100; advance(g, .05); assert.equal(events.find(ev => ev.type === 'elite').twist, 'oathsworn');
});

test('castle elite placement: none on floors 1-6; floors 7-9 promote one regular (never a gate guard or the knight), priest and mage only from floor 8; floors 8-9 keep the Oathsworn bonus', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) for (let floor = 1; floor <= 9; floor++) {
    const g = new Game(() => {}, seed, 'castle'); g.start(); g.descend(); g.loadFloor(floor);
    const elites = g.enemies.filter(e => e.elite), promoted = elites.filter(e => e.twist !== 'oathsworn');
    if (floor <= 6) { assert.equal(elites.length, 0, `floor ${floor}`); continue; }
    assert.equal(promoted.length, 1, `floor ${floor} seed ${seed}`);
    const e = promoted[0]; seen.add(e.twist);
    assert.ok(e.bonus && !e.required && e.type !== 'knight', 'a regular, no reward pick');
    if (floor === 7) assert.ok(!['priest', 'mage'].includes(e.type), 'no Hierophant or Prism before floor 8');
    assert.equal(elites.length - promoted.length, floor >= 8 ? 1 : 0, 'the Oathsworn bonus');
  }
  assert.deepEqual([...seen].sort(), ['duelist', 'hierophant', 'impaler', 'phalanx', 'prism', 'shrieker'], 'every non-knight twist appears');
});

test('castle elite Duelist: the slash strikes again 0.45 s after the first contact, with its own tell; a plain skeleton strikes once', () => {
  const duel = lightFoe('skeleton', 40); duel.game.makeElite(duel.e, 0); duel.player.invulnerable = 99;
  const plain = lightFoe('skeleton', 40); plain.player.invulnerable = 99;
  const first = until(duel.game, () => swings(duel.events).length === 1);
  assert.ok(duel.e.tell > .44 && duel.e.tell <= .45 && duel.e.move === 'slash2' && duel.e.token === 'light' && duel.e.stun === 0, 'second tell, token kept');
  assert.equal(tellsOf(duel.events, 'slash2').length, 1);
  duel.player.invulnerable = 0; duel.player.blood = 150;
  const second = until(duel.game, () => swings(duel.events).length === 2);
  assert.ok(Math.abs(second - first - .45) <= 1 / 120 + 1e-9, `${second - first} s apart`);
  assert.ok(duel.player.blood < 150, 'the second strike hurts');
  advance(duel.game, .1); assert.ok(duel.e.recover > 0 && duel.e.punishable && duel.e.move === '');
  until(plain.game, () => swings(plain.events).length === 1); advance(plain.game, .8); assert.equal(swings(plain.events).length, 1);
});

test('castle elite Shrieker: a missed dive bounces once (tell 0.6 s, glint 0.4 s before contact, line aimed at tell start); a landed dive does not', () => {
  const dive = (elite, floor = 4) => { const c = heavyFoe('bat', 100); c.game.floor = floor; if (elite) c.game.makeElite(c.e, 0); c.e.y = FLOOR - 95; c.player.blood = 150; queue(c.game, 0, .9); advance(c.game, .02); return c; };
  const c = dive(true), line1 = { ...c.e.warn.line };
  assert.ok(c.e.heavy && c.e.heavyKind === 'dive' && !c.e.bounced && !c.e.delayed);
  c.player.x += 200; // steps aside: the first dive misses
  until(c.game, () => c.e.bounced, 2);
  assert.equal(c.events.filter(ev => ev.type === 'enemyHeavy' && ev.bounce).length, 1);
  assert.ok(c.e.tell > .58 && c.e.tell <= .6 && c.e.heavy && c.e.token === 'heavy' && !c.e.delayed, 'second dive tell 0.6 s, same token');
  assert.ok(Math.abs(c.e.warn.line.x2 - line1.x2) > 100 && Math.abs(c.e.warn.line.x2 - c.player.x) < 70, 'aimed at the hero where it stands when the bounce begins');
  const glints = () => c.events.filter(ev => ev.type === 'enemyGlint').length, before = glints();
  const g0 = until(c.game, () => glints() > before), hit = until(c.game, () => swings(c.events).filter(ev => ev.heavy).length === 2);
  assert.ok(Math.abs(hit - g0 - .4) <= 1 / 120 + 1e-9, `glint ${hit - g0} before contact`);
  advance(c.game, 1.5); assert.equal(swings(c.events).filter(ev => ev.heavy).length, 2, 'only one bounce');
  const plain = dive(false); plain.player.x += 200; advance(plain.game, 2.5); assert.equal(swings(plain.events).filter(ev => ev.heavy).length, 1, 'a plain bat dives once');
  const landed = dive(true); advance(landed.game, 1.5); assert.equal(swings(landed.events).filter(ev => ev.heavy).length, 1, 'a dive that lands does not bounce'); assert.equal(landed.player.blood, 50);
  const dodged = dive(true); dodged.player.invulnerable = 99; advance(dodged.game, 3); assert.equal(swings(dodged.events).filter(ev => ev.heavy).length, 2, 'a dive that deals no damage (i-frames) still bounces'); assert.equal(dodged.player.blood, 150);
});

test('castle elite Phalanx: with its guard up, frontal sword hits on the nearest ally within 80 behind it are blocked; a broken guard, a far ally or a hero behind it are not', () => {
  const run = ({ elite = true, gap = 50, behind = false, broken = false } = {}) => {
    const { game, player } = castle(42, 2); game.rand = () => .99;
    const ally = enemy(game, 600 + (behind ? -gap : gap)); ally.cd = 99; ally.maxPoise = ally.poise = 1e6; // before the shield, so a block's pushback cannot move the hero before the ally is hit
    const s = enemy(game, 600, { type: 'shield' }); s.cd = 99; s.dir = -1; if (elite) game.makeElite(s, 0); if (broken) s.guardBreak = 5;
    Object.assign(player, behind ? { x: 660, dir: -1 } : { x: gap > 80 ? 560 : 530, dir: 1 }); player.combo = 0;
    const hp = ally.hp; game.attack();
    return hp - ally.hp;
  };
  const plain = run({ elite: false }), covered = run();
  assert.ok(plain >= 20, 'baseline: a plain shield bearer covers nobody');
  assert.ok(covered > 0 && covered <= Math.ceil(plain * .15), `blocked ${covered} of ${plain}`);
  assert.equal(run({ broken: true }), plain, 'guard broken: full damage');
  assert.equal(run({ behind: true }), plain, 'from behind the Phalanx: full damage');
  assert.equal(run({ gap: 90 }), plain, 'an ally 90 px behind is out of cover');
});

test('castle elite Phalanx: one swing hitting the Phalanx and its covered ally counts one block and one pushback', () => {
  const { game, player, events } = castle(42, 2); game.rand = () => .99;
  const ally = enemy(game, 640); ally.cd = 99; ally.maxPoise = ally.poise = 1e6;
  const s = enemy(game, 600, { type: 'shield' }); s.cd = 99; s.dir = -1; game.makeElite(s, 0);
  Object.assign(player, { x: 540, dir: 1, combo: 0 }); const hp = ally.hp; game.attack();
  assert.ok(ally.hp < hp && ally.hp > hp - 20, 'both were hit, the ally through the shield');
  assert.equal(events.filter(ev => ev.type === 'block').length, 1);
  assert.equal(s.blocks.length, 1); assert.ok(!(s.counterT > 0), 'no counter from one swing');
  assert.equal(player.x, 540 - 40, 'pushed once');
});

test('castle elite Phalanx: a swing that reaches its covered ally on a later frame still counts one block', () => {
  for (const thrustWindow of [0, .5]) {
    const { game, player, events } = castle(42, 2); game.setWeapon('spear'); game.rand = () => .99;
    const s = enemy(game, 600, { type: 'shield' }); s.cd = 99; s.dir = -1; game.makeElite(s, 0);
    const ally = enemy(game, 640); ally.cd = 99; ally.maxPoise = ally.poise = 1e6;
    Object.assign(player, { x: thrustWindow ? 460 : 540, dir: 1, combo: 0, thrustWindow });
    game.attack(); advance(game, .3);
    assert.equal(events.filter(ev => ev.type === 'block').length, 1, `thrustWindow ${thrustWindow}`);
    assert.ok(!(s.counterT > 0), 'no counter from one swing');
  }
});

test('castle elite Impaler: a hero in the air within 240 draws the skewer (tell 0.9 s, box 10-160 in front, 54-180 above its feet); walking out answers it; a grounded hero does not draw it', () => {
  const air = (elite = true) => { const c = heavyFoe('spear', 120); if (elite) c.game.makeElite(c.e, 0); c.game.rand = () => .99; Object.assign(c.player, { y: FLOOR - 100, vy: 0, grounded: false, jumps: 1, blood: 150 }); c.game.update(1 / 120, {}); return c; };
  const c = air(), e = c.e;
  assert.ok(e.heavy && e.heavyKind === 'skewer' && e.token === 'heavy' && !e.delayed && e.tell > .88 && e.tell <= .9);
  const b = e.warn.box; assert.deepEqual([b.x - e.x, b.w, b.y - e.y, b.h], [-160, 150, -180, 126], 'x 10-160 in front, 54-180 above the feet');
  Object.assign(c.player, { x: e.x - 100, y: FLOOR, vy: 0, grounded: true }); // it lands inside the box
  advance(c.game, 1); assert.equal(c.player.blood, 50, 'skewers a hero who stays in the box');
  const w = air(); Object.assign(w.player, { x: w.e.x - 220, y: FLOOR, vy: 0, grounded: true }); advance(w.game, 1.2);
  assert.equal(w.player.blood, 150, 'walking out answers it');
  assert.notEqual(air(false).e.heavyKind, 'skewer', 'a plain spearman has no skewer');
  const ground = heavyFoe('spear', 120); ground.game.makeElite(ground.e, 0); ground.game.rand = () => .99; advance(ground.game, .05); assert.notEqual(ground.e.heavyKind, 'skewer');
});

test('castle elite Oathsworn: never flinches outside attacks (a posture break still stuns it); its string adds a delayed greatswing as a third hit', () => {
  const o = lightFoe('knight', 300, 8); o.game.makeElite(o.e, 0);
  o.game.damageEnemy(o.e, 5, 1, false, false, false, 5);
  assert.ok(o.e.stun === 0 && o.e.vx === 0, 'no flinch, no knockback');
  const k = lightFoe('knight', 300, 8); k.game.damageEnemy(k.e, 5, 1, false, false, false, 5); assert.ok(k.e.stun > 0, 'a plain knight flinches');
  o.game.damageEnemy(o.e, 5, 1, false, true, false, 1e6); assert.ok(o.e.stun >= 1.4, 'a posture break stuns it');
  const s = lightFoe('knight', 50, 8); s.game.makeElite(s.e, 0); s.player.invulnerable = 99; s.player.dir = 1;
  until(s.game, () => s.e.move === 'overhead', 2);
  until(s.game, () => swings(s.events, 'overhead').length > 0, 2);
  const e = s.e; assert.ok(e.heavy && e.heavyKind === 'greatswing' && e.delayed && e.tell > 1.35 && e.token === 'heavy', `third hit ${e.heavyKind} tell ${e.tell}`);
  const third = s.events.filter(ev => ev.type === 'enemyHeavy' && ev.follow); assert.equal(third.length, 1); assert.equal(third[0].delayed, true);
  const glint = until(s.game, () => s.events.some(ev => ev.type === 'enemyGlint')), hit = until(s.game, () => swings(s.events).some(ev => ev.heavy));
  assert.ok(Math.abs(hit - glint - .4) <= 1 / 120 + 1e-9, 'glint 0.4 s before contact');
  const plain = lightFoe('knight', 50, 8); plain.player.invulnerable = 99; plain.player.dir = 1;
  advance(plain.game, 4); assert.ok(!plain.events.some(ev => ev.type === 'enemyHeavy' && ev.follow), 'a plain knight ends its string after the second hit');
  const behind = lightFoe('knight', 50, 8); behind.game.makeElite(behind.e, 0); behind.player.invulnerable = 99; behind.player.dir = 1;
  until(behind.game, () => behind.e.move === 'overhead', 2); behind.player.x = behind.e.x + 120; advance(behind.game, 2);
  assert.ok(!behind.events.some(ev => ev.type === 'enemyHeavy' && ev.follow), 'no third hit when the hero left the front');
});

test('castle elite Hierophant: its blessing also refills the blessed allies posture; a plain priest does not', () => {
  const run = elite => {
    const { game, e, events } = kit('priest', 300, { elite }); const ally = enemy(game, e.x + 40); ally.cd = 99; ally.poise = 5;
    advance(game, 1); return { ally, events };
  };
  const h = run(true), p = run(false);
  assert.ok(h.ally.blessed > 0 && h.ally.poise === h.ally.maxPoise, 'refilled');
  assert.ok(p.ally.blessed > 0 && p.ally.poise < p.ally.maxPoise, 'a plain bless only buffs');
  assert.equal(h.events.find(ev => ev.type === 'enemyBuff').posture, true);
});

test('castle elite Prism: the bolt is a 3-bolt fan whose aim lines are drawn during the tell; a plain mage fires one', () => {
  const prism = kit('mage', 350, { floor: 6, elite: true }); advance(prism.game, .02);
  const lines = prism.e.warn.lines; assert.equal(lines.length, 3); assert.ok(prism.e.tell > 0 && prism.e.token === 'light');
  prism.player.x = prism.e.x + 250; // the lines were fixed at tell start: the fan does not follow
  until(prism.game, () => prism.game.projectiles.length >= 3);
  const shots = prism.game.projectiles.filter(b => b.r === 7); assert.equal(shots.length, 3);
  for (const l of lines) assert.ok(shots.some(b => Math.abs(b.vx - Math.cos(l.angle) * 250) < 1 && Math.abs(b.vy - Math.sin(l.angle) * 250) < 1), 'every shot follows a drawn line');
  const plain = kit('mage', 350, { floor: 6 }); advance(plain.game, .75); assert.equal(plain.game.projectiles.filter(b => b.r === 7).length, 1);
});

test('castle leftovers (PR 2 review): cancelAttack clears the bat dart; a barricade stopping the knight overhead step rebuilds its drawn line and box', () => {
  const { game, e } = lightFoe('bat', 120); e.y = FLOOR - 30; game.player.dir = -1;
  advance(game, .02); assert.ok(e.dartT > 0); game.cancelAttack(e); assert.equal(e.dartT, 0);
  const k = lightFoe('knight', 50, 7); k.player.invulnerable = 99; k.player.dir = 1;
  until(k.game, () => k.e.move === 'overhead', 2);
  k.game.spawnObstacle('barricade', k.e.x + k.e.dir * 70, 0); // stands in the way of the 40 px step
  const to0 = k.e.warn.to; until(k.game, () => k.e.warn.to !== to0, 1);
  const w = k.e.warn; assert.ok(Math.abs(w.to - k.e.x) < 1 && Math.abs(w.line.x2 - k.e.x) < 1, 'the line ends where it stopped');
  assert.ok(Math.abs(w.box.x - Math.min(k.e.x + 10 * k.e.dir, k.e.x + 120 * k.e.dir)) < 1, 'the box follows');
});

test('castle PR 3: tokens and the single heavy hold with priests, mages and elites on the field; Normal and Endless keep their priests and mages', () => {
  for (const seed of [1, 2, 3]) {
    const { game, player } = castle(seed, 8);
    game.enemies = []; game.rand = (r => () => { r = (r * 16807) % 2147483647; return r / 2147483647; })(seed * 13);
    player.x = 1200; player.invulnerable = 1e9; player.blood = 200;
    for (const [type, dx, elite] of [['priest', 250, false], ['mage', -300, false], ['priest', 330, true], ['mage', 350, true], ['skeleton', 60, true], ['spear', -90, true], ['knight', 50, true], ['bat', 40, true]]) {
      const e = enemy(game, player.x + dx, { type, hp: 1e6 }); e.cd = 0; e.maxPoise = e.poise = 1e6; if (type === 'bat') e.y = player.y - 30; if (elite) game.makeElite(e, 0);
    }
    let maxHolders = 0, maxHeavy = 0;
    for (let i = 0; i < 120 * 25; i++) {
      game.update(1 / 120, {}); player.blood = 200;
      const h = game.enemies.filter(e => e.hp > 0 && e.token); maxHolders = Math.max(maxHolders, h.length); maxHeavy = Math.max(maxHeavy, h.filter(e => e.token === 'heavy').length);
      for (const e of game.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.type} position`);
    }
    assert.ok(maxHolders <= ATTACK_TOKENS && maxHeavy <= 1, `seed ${seed}: ${maxHolders} holders, ${maxHeavy} heavy`);
  }
  for (const mode of ['normal', 'endless']) {
    const g = new Game(() => {}, 4, mode); g.state = 'playing'; g.enemies = [];
    const p = enemy(g, g.player.x + 300, { type: 'priest' }), m = enemy(g, g.player.x + 700, { type: 'mage' }); p.cd = m.cd = 0; p.dir = m.dir = -1; g.player.invulnerable = 99;
    advance(g, .02); assert.ok(p.tell > .85 && p.tell <= .9, `${mode}: old priest tell`); assert.ok(!('blinkT' in m) && !('recoilT' in p), `${mode}: no castle fields`);
  }
});

// ---- Apex skeleton (#66): castle skeletons read a 0.12 s old snapshot and answer with backstep, guard, counter, rising and chain ----
function apexFoe(gap = 100, { floor = 1, hp = 1e5 } = {}) {
  const c = castle(42, floor, true);
  c.game.rand = () => .99; // no mixed-strategy baits, no heavy rolls
  c.player.x = 700; c.player.invulnerable = 0;
  const e = enemy(c.game, c.player.x + gap, { hp }); e.dir = -1; e.maxPoise = e.poise = 500;
  return { ...c, e };
}
const apexSwings = events => events.filter(ev => ev.type === 'enemySwing');

test('apex: the skeleton decides from a snapshot 0.12 s old and never sees input or buffers', () => {
  const { game, player } = castle(42, 1, true);
  player.x = 300; advance(game, .3);
  player.x = 900; game.update(1 / 120, {});
  assert.equal(game.snap().x, 300, 'the move to 900 is not visible yet');
  advance(game, APEX_REACT + .02);
  assert.equal(game.snap().x, 900, 'visible once 0.12 s have passed');
  for (const key of ['buffer', 'dashBuf', 'heldDir']) assert.ok(!(key in game.snap()), `${key} is not in the snapshot`);
  assert.ok(APEX_REACT >= .1 && APEX_REACT < .18, 'faster than the expert bot, never zero');
  const { game: g2, e } = apexFoe(300); e.cd = 0;
  g2.player.x = 700; advance(g2, .3); const x0 = e.x; g2.player.x = e.x + 400; // teleport behind it: for 0.1 s it still walks toward where the hero was
  for (let i = 0; i < 12; i++) g2.update(1 / 120, {});
  assert.ok(e.x <= x0, 'no reaction inside the 0.12 s');
});

test('apex: a hero on combo hit 3 is met by a backstep: no tell, no token, 80 px in 0.22 s, once per 0.9 s', () => {
  const { game, player, e, events } = apexFoe(100);
  const x0 = e.x; let first = -1;
  for (let i = 0; i < 120 * .6; i++) { player.combo = 2; player.comboWindow = .8; game.update(1 / 120, {}); if (first < 0 && e.bsT > 0) { first = i; assert.equal(e.tell, 0, 'not an attack: no tell'); assert.equal(e.token, '', 'no token'); } }
  const steps = events.filter(ev => ev.type === 'apexStep');
  assert.equal(steps.length, 1, 'cooldown 0.9 s: one step in 0.6 s'); assert.equal(steps[0].dir, 1, 'away from a hero on its left');
  assert.ok(first >= 0 && e.x - x0 >= 70, `moved ${e.x - x0} px away`);
  assert.ok(!events.some(ev => ev.type === 'hurt'), 'a backstep never hurts');
  const { game: g2, e: w, player: p2 } = apexFoe(100); w.x = g2.worldWidth - 45; p2.x = w.x - 100; // against the wall it guards instead
  for (let i = 0; i < 60; i++) { p2.combo = 2; p2.comboWindow = .8; g2.update(1 / 120, {}); }
  assert.ok(w.gT > 0 || w.gCd > 0, 'wall: guard instead of a backstep');
});

test('apex guard: front sword hits cost x0.25 damage and x0.5 posture, no flinch, +1 blood; hits from behind land normally', () => {
  const { game, player, e, events } = apexFoe(60);
  e.gT = .6; e.poise = e.maxPoise = 60; const hp = e.hp;
  game.damageEnemy(e, 30, 1, false, false, false, 17);
  assert.equal(hp - e.hp, Math.round(30 * .25)); assert.equal(e.poise, 60 - 17 * .5); assert.equal(e.stun, 0, 'no flinch');
  assert.ok(events.some(ev => ev.type === 'apexGuard' && ev.blocked === 1));
  game.damageEnemy(e, 30, -1, false, false, false, 17);
  assert.equal(hp - e.hp, 8 + 30, 'from behind: full damage'); assert.ok(e.stun > 0, 'and it flinches');
  const gain = guarded => { const c = apexFoe(60); c.e.gT = guarded ? .6 : 0; c.player.dir = 1; c.player.blood = 100; const b = c.player.blood; c.game.attack(); return c.player.blood - b; };
  assert.equal(gain(false) - gain(true), 2, 'a guarded hit pays 1 blood instead of 3');
  const c = apexFoe(60); c.e.gT = .6; c.player.dir = 1; c.player.blood = 100; c.game.shots = []; const hp0 = c.e.hp;
  c.game.damageEnemy(c.e, 8, 1, false, false, false, 8, false, 1, true);
  assert.equal(hp0 - c.e.hp, 8, 'a projectile is not a sword hit: the guard ignores it');
});

test('apex guard break: combo hit 3 (front), a plunge, and Eclipse break it into a 0.6 s punishable recovery; a thrust does not', () => {
  const crush = (hit, label) => {
    const { game, e, events } = apexFoe(60); e.gT = .6; e.gHit = 1;
    hit(game, e);
    assert.equal(e.gT, 0, label); assert.equal(e.recover, .6, label); assert.ok(e.punishable, label);
    assert.ok(e.gCd >= 1.5, 'guard cooldown'); assert.ok(events.some(ev => ev.type === 'apexCrush'), label);
    const poise = e.poise; game.damageEnemy(e, 1, 1, false, false, false, 17); assert.equal(poise - e.poise, 34, 'punishable: posture x2');
  };
  crush((g, e) => g.damageEnemy(e, 54, 1, false, true, false, 62), 'hit 3');
  crush((g, e) => g.damageEnemy(e, 38, -1, false, true, false, 45), 'plunge, even from behind');
  crush((g, e) => g.damageEnemy(e, 58, 1, false, true, false, 55, true), 'Eclipse');
  const { game, e } = apexFoe(60); e.gT = .6;
  game.damageEnemy(e, 40, 1, false, true, false, 35); assert.ok(e.gT > 0, 'a thrust is blocked, not breaking');
  game.damageEnemy(e, 54, -1, false, true, false, 62); assert.ok(e.stun > 0 || e.gT === 0, 'hit 3 from behind is a plain hit (it ends the guard by flinching)');
  const { game: g2, e: e2, events } = apexFoe(60); e2.gT = .6;
  g2.damageEnemy(e2, 1, 1, false, false, false, 17); g2.damageEnemy(e2, 1, 1, false, false, false, 17);
  assert.ok(e2.gT > 0 && !events.some(ev => ev.type === 'apexCrush'), 'combo hits 1-2 never break it');
});

test('apex counter: a guard that blocked a hit ends in a 0.45 s counter with a fixed 10-82 box; no block, no counter', () => {
  const { game, player, e, events } = apexFoe(60);
  e.gT = .3; e.gHit = 1; advance(game, .4);
  assert.equal(e.move, 'counter'); assert.ok(e.tell > .3 && e.tell <= .45, 'tell 0.45 s'); assert.equal(e.token, 'light');
  const b = e.warn.box; assert.equal(b.x, e.x - 82); assert.equal(b.w, 72); assert.equal(b.h, 70); assert.equal(b.y, e.y - 70);
  assert.ok(events.some(ev => ev.type === 'enemyTell' && ev.kind === 'counter'));
  advance(game, .5);
  assert.ok(events.some(ev => ev.type === 'hurt'), 'a hero inside the box is hit'); assert.ok(e.recover > 0 && e.punishable, 'punishable recovery');
  const far = apexFoe(60); far.player.x = far.e.x - 120; far.e.gT = .3; far.e.gHit = 1; advance(far.game, .4);
  assert.notEqual(far.e.move, 'counter', 'a hero out of the 82 px box draws no counter');
  const calm = apexFoe(60); calm.e.gT = .3; calm.e.gHit = 0; advance(calm.game, .4);
  assert.notEqual(calm.e.move, 'counter');
  const miss = apexFoe(60); miss.e.gT = .3; miss.e.gHit = 1; advance(miss.game, .4); miss.player.x -= 90; advance(miss.game, .5);
  assert.ok(!miss.events.some(ev => ev.type === 'hurt'), 'outside 82 px the counter misses');
});

test('apex rising: a hero in the air within 90 px draws a 0.45 s anti-air slash with a fixed box; it never meets a grounded hero', () => {
  const { game, player, e, events } = apexFoe(60);
  const air = () => { player.y = FLOOR - 100; player.vy = 0; player.invulnerable = 0; game.update(1 / 120, {}); };
  for (let i = 0; i < 6; i++) air();
  assert.equal(e.move, 'rising'); assert.ok(e.tell > .3 && e.tell <= .45); assert.equal(e.token, 'light');
  assert.deepEqual(e.warn.box, { x: e.x - 70, y: e.y - 150, w: 70, h: 110 });
  assert.ok(events.some(ev => ev.type === 'enemyTell' && ev.kind === 'rising'));
  const dir = e.dir; for (let i = 0; i < 120 * .6; i++) air();
  assert.equal(e.dir, dir, 'facing locked'); assert.ok(events.some(ev => ev.type === 'hurt'), 'an airborne hero in the box is hit');
  assert.ok(apexSwings(events).some(ev => ev.kind === 'rising'));
  const g = apexFoe(60); const ev0 = g.e; Object.assign(ev0, { move: 'rising', tell: .01, token: 'light', warn: { kind: 'rising', box: { x: ev0.x - 70, y: ev0.y - 150, w: 70, h: 110 } } });
  advance(g.game, .1); assert.ok(!g.events.some(ev => ev.type === 'hurt'), 'a hero standing on the floor is not hit');
});

test('apex chain: a hero whose dash is cooling draws a lunge 0.45 s after contact whose box covers a dash landing, at most two per string', () => {
  const { game, player, e, events } = apexFoe(60); e.tell = .02; // the hero dodged each lunge: no i-frames in view, blood kept topped up
  for (let i = 0; i < 120 * 2.4; i++) { Object.assign(player, { dashCd: .8, invulnerable: 0, blood: 1e6 }); game.update(1 / 120, {}); }
  const chains = events.filter(ev => ev.type === 'enemyTell' && ev.kind === 'chain');
  assert.equal(chains.length, 2, 'two chained lunges, never a third'); assert.ok(chains.every(c => c.follow));
  assert.equal(apexSwings(events).filter(ev => ev.kind === 'stepcut').length, 2, 'each strikes once (the first slash opens the string)');
  const w = apexFoe(60); w.e.tell = .02; const dodge = () => Object.assign(w.player, { dashCd: .8, invulnerable: 0, blood: 1e6 });
  for (let i = 0; i < 6; i++) { dodge(); w.game.update(1 / 120, {}); }
  for (let i = 0; i < 4; i++) { dodge(); w.game.update(1 / 120, {}); } for (let i = 0; i < 60 && !(w.e.move === 'stepcut' && w.e.tell > .3); i++) { dodge(); w.game.update(1 / 120, {}); }
  assert.ok(w.e.tell > .3 && w.e.tell <= .45 && w.e.follows === 1, 'tell 0.45 s');
  const b = w.e.warn.box; assert.ok(Math.abs(b.w + 10 - w.e.warn.reach) < 1e-6 && w.e.warn.reach >= 131 + 80, 'the box reaches a 131 px dash landing');
  const none = apexFoe(60); none.player.invulnerable = 99; none.e.tell = .02; advance(none.game, .3);
  assert.ok(!none.events.some(ev => ev.type === 'enemyTell' && ev.kind === 'chain') && none.e.follows === 0, 'no dash on cooldown, no chain');
});

test('apex chain: no lunge starts when its contact would fall inside the hero\'s remaining invulnerability (a wasted tell)', () => {
  const hit = apexFoe(60); hit.player.invulnerable = .8; hit.player.dashCd = .8; advance(hit.game, .2); // a hit just landed: about 0.6 s of i-frames left, seen in the snapshot
  hit.e.move = ''; hit.e.tell = 0; hit.e.warn = null; hit.e.follows = 0;
  assert.equal(hit.game.apexChain(hit.e), false, 'the 0.45 s contact would fall inside the i-frames');
  const clear = apexFoe(60); clear.player.dashCd = .8; advance(clear.game, .2); clear.e.move = ''; clear.e.tell = 0; clear.e.warn = null; clear.e.follows = 0;
  assert.equal(clear.game.apexChain(clear.e), true, 'control: with no i-frames the same chain starts');
});

test('apex group play: a peer\'s tell about to land draws a second contact 0.45-0.6 s later (dash trap); the 1.2 s post-stun armor answers at once', () => {
  const { game, player, e } = apexFoe(140); player.invulnerable = 0;
  const lead = enemy(game, player.x - 60, { hp: 1e5 }); lead.dir = 1; lead.maxPoise = lead.poise = 500; lead.tell = .05; lead.cd = 5;
  advance(game, .04);
  assert.ok(e.tell > .3 && e.tell <= .45 && e.token === 'light', 'the second skeleton starts its own tell as the first lands');
  const alone = apexFoe(140); advance(alone.game, .05); assert.equal(alone.e.tell, 0, 'without a lead there is no trap');
  const armor = apexFoe(60); armor.e.armor = 1; advance(armor.game, .05); assert.ok(armor.e.tell > 0, 'post-stun armor starts a slash at once');
});

test('apex: every contact follows a tell of at least 0.45 s (light) or 0.85 s (heavy)', () => {
  let contacts = 0;
  for (const seed of [1, 2, 3]) {
    const { game, player, events } = castle(seed, 1, true); player.x = 800; player.blood = 200;
    for (const dx of [260, 380, -250]) { const e = enemy(game, player.x + dx, { hp: 1e6 }); e.maxPoise = e.poise = 1e6; }
    const seen = new Map();
    for (let i = 0; i < 120 * 40; i++) {
      player.blood = 200; const n = events.length;
      game.update(1 / 120, { right: Math.floor(i / 240) % 2 === 0, left: Math.floor(i / 240) % 2 === 1, jump: i % 400 === 0 });
      const swung = apexSwings(events.slice(n)).length;
      for (const e of game.enemies) {
        const r = seen.get(e) || { tell: 0, start: 0, heavy: false }; seen.set(e, r);
        if (r.tell > 0 && (e.tell <= 0 || e.tell > r.tell + 1e-9) && swung) { const len = game.time - r.start; contacts++; assert.ok(len >= (r.heavy ? .84 : .44), `${r.heavy ? 'heavy' : 'light'} tell of ${len.toFixed(2)} s`); }
        if (e.tell > 0 && (r.tell <= 0 || e.tell > r.tell + 1e-9)) { r.start = game.time - (0); r.heavy = e.heavy; }
        r.tell = e.tell;
      }
    }
  }
  assert.ok(contacts >= 3, `only ${contacts} contacts seen`);
});

test('apex is castle only: Normal, Endless, other enemy types and the apex switch leave the old skeleton alone', () => {
  for (const mode of ['normal', 'endless']) {
    const g = new Game(() => {}, 4, mode); g.state = 'playing'; g.enemies = []; g.player.invulnerable = 99;
    const e = enemy(g, g.player.x + 100); e.dir = -1; e.cd = 0;
    for (let i = 0; i < 120; i++) { g.player.combo = 2; g.player.comboWindow = .8; g.update(1 / 120, {}); }
    assert.ok(!g.apexOn(e) && g.snaps.length === 0 && !('bsT' in e), `${mode}: no snapshot, no apex fields`);
  }
  const c = castle(42, 1, true); const sh = enemy(c.game, c.player.x + 100, { type: 'shield' }), kn = enemy(c.game, c.player.x - 100, { type: 'knight' });
  assert.ok(!c.game.apexOn(sh) && !c.game.apexOn(kn));
  const off = castle(42, 1, false), e = enemy(off.game, off.player.x + 100); e.dir = -1;
  for (let i = 0; i < 120; i++) { off.player.combo = 2; off.player.comboWindow = .8; off.game.update(1 / 120, {}); }
  assert.ok(!off.events.some(ev => ev.type === 'apexStep'), 'apex off: the old skeleton');
});

test('apex review: a forced cleave judges the hero by its snapshot; a guard cut short starts its cooldown; 3 tokens with at most 1 heavy', () => {
  const a = apexFoe(100); a.e.heavyCd = 0; a.game.rand = () => .99;
  for (let i = 0; i < 60; i++) { a.player.invulnerable = 99; a.game.update(1 / 120, {}); }
  a.e.cd = 0; a.e.heavy = false; a.e.tell = 0; a.e.recover = 0; a.e.token = ''; a.e.move = ''; a.e.warn = null; a.e.armor = 0; a.e.mixT = 0;
  a.player.y = FLOOR - 120; a.player.vy = -300; // jumped this frame: the live dy is 120, the snapshot still has the hero on the floor
  assert.equal(a.game.startHeavy(a.e, 100, true), true, 'forced: the live height is not read');
  const b = apexFoe(100); b.e.heavyCd = 0; b.player.y = FLOOR - 120;
  assert.equal(b.game.startHeavy(b.e, 100, false), false, 'unforced: the old live check stays');
  const g = apexFoe(60); g.e.gT = .5; g.e.gCd = 0; g.game.damageEnemy(g.e, 30, -1, false, false, false, 17); // from behind: flinch
  advance(g.game, .1);
  assert.equal(g.e.gT, 0); assert.ok(g.e.gCd >= 1.4, 'guard cooldown after the cut'); assert.equal(g.game.apexGuard(g.e), false);
  const c = castle(42, 1, true), off = castle(42, 1, false);
  assert.equal(c.game.tokenCap(), 3); assert.equal(off.game.tokenCap(), ATTACK_TOKENS);
  for (const k of [0, 1, 2, 3]) { const e = enemy(c.game, c.player.x + 100 + k * 40, { hp: 1e5 }); e.dir = -1; }
  let heavy = 0, holders = 0;
  for (let i = 0; i < 120 * 6; i++) { Object.assign(c.player, { invulnerable: 0, blood: 150 }); c.game.update(1 / 120, {}); const h = c.game.enemies.filter(e => e.token); holders = Math.max(holders, h.length); heavy = Math.max(heavy, h.filter(e => e.token === 'heavy').length); }
  assert.ok(holders >= 2 && holders <= 3 && heavy <= 1, `${holders} holders, ${heavy} heavy`);
  assert.equal(off.game.snaps.length, 0, 'no snapshots with apex off');
});

// ---- Brains (#62 PR 1): shield bearer and spearman read a 0.12 s old snapshot of the hero and answer it ----
function brainFoe(type, gap = 100, { floor = 1, hp = 1e5 } = {}) {
  const c = castle(42, floor, true);
  c.game.rand = () => .99;
  c.player.x = 700; c.player.invulnerable = 0;
  const e = enemy(c.game, c.player.x + gap, { type, hp }); e.dir = -1; e.maxPoise = e.poise = 500; e.armor = 0; e.action = 1; e.braceCd = 99; // brace off unless a test turns it on; // action 1: a brain has already acted, so cooldowns hold (no spawn cooldown override)
  return { ...c, e };
}
const evs = (events, type) => events.filter(ev => ev.type === type);
const lull = (game, s = .3) => { const keep = game.enemies.map(e => [e.cd, e.mixT]); for (const e of game.enemies) Object.assign(e, { cd: 99, mixT: 99 }); advance(game, s); game.enemies.forEach((e, i) => Object.assign(e, { cd: keep[i][0], mixT: keep[i][1] })); }; // let the snapshot ring fill with the foes holding still
const noSwing = e => Object.assign(e, { cd: 99, mixT: 99 }); // keep a foe from picking an attack while a test sets the scene

function skeletonHash() { // the refactor guard: a skeleton-only castle floor, scripted hero
  const h = createHash('sha1');
  for (const seed of [3, 7, 11]) {
    const ev = []; const g = new Game(e => ev.push(e.type), seed, 'castle');
    g.start(); g.setWeapon('spear'); g.descend(); g.state = 'playing';
    const p = g.player; p.blood = 150;
    for (let step = 0; step < 2400 && g.state === 'playing'; step++) {
      const f = g.enemies.filter(e => e.hp > 0).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0], d = f ? f.x - p.x : 1, close = f && Math.abs(d) < p.reach - 20;
      g.update(1 / 60, { attack: step % 200 < 120, right: !close && d > 0, left: !close && d < 0, jump: step % 97 === 0, dash: step % 131 === 0, magic: step % 400 === 0 });
      if (step % 20 === 0) h.update(JSON.stringify([g.state, Math.round(p.x), Math.round(p.blood), g.enemies.map(e => [Math.round(e.x), Math.round(e.y), Math.round(e.hp), +e.tell.toFixed(2), e.move, e.token, e.type])]));
    }
    h.update(ev.join(','));
  }
  return h.digest('hex').slice(0, 16);
}

test('brains: a skeleton-only castle floor replays bit-for-bit (hash updated for the halved stat profile)', () => {
  assert.equal(skeletonHash(), 'c3aaaae865e8d907', 'hash of the scripted skeleton floor with the halved stat profile (user decision 2026-10-31; the PR 1 refactor hash 0edbaf3fe1ff4c49 was taken with the old x9.6 profile)');
});

test('brains: every castle regular type has one (the bosses do not); brainOff switches a type back to the #50 rules', () => {
  const { game, player } = castle(42, 1, true);
  const types = ['skeleton', 'shield', 'spear', 'bat', 'knight', 'priest', 'mage'], foes = types.map((type, i) => enemy(game, player.x + 100 + i * 40, { type }));
  assert.deepEqual(foes.map(e => game.brainOn(e)), [true, true, true, true, true, true, true]);
  game.brainOff = new Set(['shield']);
  assert.equal(game.brainOn(foes[1]), false); assert.equal(game.brainOn(foes[2]), true);
  assert.equal(game.apexOn(foes[0]), true);
  game.brainOff = new Set(['skeleton']); assert.equal(game.apexOn(foes[0]), false, 'the skeleton entry obeys brainOff too');
  const off = castle(42, 1, false), s = enemy(off.game, off.player.x + 100, { type: 'shield' }); assert.equal(off.game.brainOn(s), false, 'apex off: no brains');
  for (const mode of ['normal', 'endless']) { const g = new Game(() => {}, 4, mode); g.state = 'playing'; g.enemies = []; const e = enemy(g, g.player.x + 100, { type: 'shield' }); assert.equal(g.brainOn(e), false, mode); assert.ok(!('bmT' in e) && !('plantT' in e), `${mode}: no brain fields`); }
});

test('brains: a shield bearer or spearman decides from the snapshot, not the live hero', () => {
  const a = brainFoe('shield', 300, { floor: 2 }); a.e.dir = -1; lull(a.game); noSwing(a.e); a.e.cd = 0; a.e.mixT = 99;
  a.player.x = a.e.x + 40; // behind it this frame (the shield faces left): the snapshot still has the hero 300 px in front
  a.game.update(1 / 120, {});
  assert.equal(a.e.move, '', 'no rimstrike from a hero it has not seen yet');
  advance(a.game, APEX_REACT + .03);
  assert.equal(a.e.move, 'rimstrike', 'seen 0.12 s later');
  const b = brainFoe('spear', 160, { floor: 3 }); lull(b.game); b.e.cd = 0;
  b.player.y = FLOOR - 200; b.game.update(1 / 120, {}); // a leap the snapshot has not seen: the thrust box is still judged at the floor
  assert.ok(b.e.tell > 0 && b.e.warn.kind === 'thrust', 'the spearman answers the hero it saw');
});

test('shield rimstrike: a hero behind within 80 draws a 0.45 s rim swing, a box 10-70 behind fixed at tell start, no turn, 0.6 s punishable recovery', () => {
  const { game, player, e, events } = brainFoe('shield', 50, { floor: 2 }); e.dir = 1; // the shield faces away: the hero is at its back
  lull(game); e.cd = 0; e.dir = 1; e.reface = 0; // it had turned to the hero during the lull: set the back to the hero again
  advance(game, .02);
  assert.equal(e.move, 'rimstrike'); assert.ok(e.tell >= .43 && e.tell <= .45, `tell ${e.tell}`);
  const box = { ...e.warn.box }, dir0 = e.dir, x0 = e.x;
  assert.ok(box.x <= x0 - 10 - 59 && box.w === 60 && box.x + box.w <= x0 - 10 + 1, 'box 10-70 px behind');
  player.x = e.x - 200; advance(game, .2);
  assert.deepEqual(e.warn.box, box, 'the box never follows the hero'); assert.equal(e.dir, dir0, 'it does not turn to strike');
  advance(game, .3);
  assert.equal(e.recover > 0 && e.punishable, true); assert.ok(!evs(events, 'hurt').length, 'a hero who stepped out is not hit');
  assert.ok(evs(events, 'enemySwing').some(ev => ev.kind === 'rimstrike'));
  const hit = brainFoe('shield', 50, { floor: 2 }); lull(hit.game); hit.e.dir = 1; hit.e.cd = 0; advance(hit.game, .6);
  assert.ok(evs(hit.events, 'hurt').length >= 1, 'a hero who stays is hit');
  assert.ok(evs(hit.events, 'enemyTell').some(ev => ev.kind === 'rimstrike'));
  hit.player.blood = 150; advance(hit.game, 2.5); assert.equal(evs(hit.events, 'enemyTell').filter(ev => ev.kind === 'rimstrike').length, 1, 'the recovery brings the shield round: no second rim strike chains'); assert.equal(hit.e.dir, -1, 'facing the hero again');
  const far = brainFoe('shield', 110, { floor: 2 }); lull(far.game); far.e.dir = 1; far.e.cd = 0; advance(far.game, .1);
  assert.equal(far.e.move, '', 'beyond 80 px there is no rimstrike');
  const block = brainFoe('shield', 40, { floor: 2 }); block.e.dir = 1; block.e.guardBreak = 0; block.player.dir = 1;
  assert.equal((block.player.x - block.e.x) * block.e.dir >= 0, false, 'from behind the shield does not block');
});

test('shield turnrush: a hero dashed through, behind it with the dash cooling, draws a rush with a 0.9 s tell that holds the turn; never delayed', () => {
  const { game, player, e, events } = brainFoe('shield', 160, { floor: 6 }); e.heavyCd = 0; // faces away after the lull, the hero is behind on its left
  lull(game); e.dir = 1; e.reface = 0; player.dashCd = 5; e.cd = 0; e.mixT = 99;
  game.rand = () => 0; // a delay roll would pass here: turnrush must ignore it
  advance(game, APEX_REACT + .05);
  const heavy = evs(events, 'enemyHeavy').find(ev => ev.variant === 'turnrush');
  assert.ok(heavy, 'turnrush announced'); assert.equal(heavy.kind, 'rush'); assert.equal(heavy.delayed, false);
  assert.equal(e.dir, -1, 'it turned to face the hero'); assert.ok(e.tell >= .85 && e.tell <= .9, `heavy tell ${e.tell}`);
  const to = e.warn.to; advance(game, .3); assert.equal(e.warn.to, to, 'path fixed at tell start');
  const ready = brainFoe('shield', 160, { floor: 6 }); ready.e.heavyCd = 0; lull(ready.game); ready.e.dir = 1; ready.e.reface = 0; ready.player.dashCd = 0; ready.e.cd = 0; ready.e.mixT = 99; advance(ready.game, .25);
  assert.ok(!evs(ready.events, 'enemyHeavy').length, 'with the dash ready it stays put');
});

test('shield brace: a plunge coming down on its front meets a raised shield (x0.25, +1 blood, the hero bounces); from behind the plunge lands as before', () => {
  const run = fromFront => {
    const { game, player, e, events } = brainFoe('shield', fromFront ? 30 : -30, { floor: 2 }); e.hp = e.maxHp = 1000; e.guardBreak = 0; player.blood = 30; // no Eclipse to brace against
    lull(game); e.braceCd = 0; e.dir = -1; e.reface = 0; if (!fromFront) e.turn = 9; // a shield bearer that cannot turn yet keeps its back to the hero
    noSwing(e); player.blood = 100; player.dir = fromFront ? 1 : -1;
    Object.assign(player, { y: FLOOR - 190, vy: 0, grounded: false, jumps: 1 }); game.attack(); // a tall plunge: the snapshot sees it before it lands
    advance(game, .17);
    return { game, player, e, events };
  };
  const f = run(true);
  assert.ok(f.e.braceT > 0, 'braced while the plunge falls'); assert.ok(evs(f.events, 'brainStep').some(ev => ev.kind === 'brace'));
  advance(f.game, .5);
  assert.ok(evs(f.events, 'block').length >= 1, 'blocked'); assert.ok(f.e.hp > 990, `hp ${f.e.hp}: x0.25 of a ~25 hit`); assert.ok(f.player.blood <= 101.5, `only +1 blood (${f.player.blood})`);
  const b = run(false);
  assert.equal(b.e.braceT > 0, false, 'no brace for a plunge behind it'); advance(b.game, .5);
  assert.ok(b.e.hp < 985, `a plunge from behind lands in full (${b.e.hp})`);
});

test('shield interpose: it covers an ally in recovery being hit from its side, never one in a posture-break stun', () => {
  const mk = stunned => {
    const c = brainFoe('shield', 90, { floor: 3 }); c.e.dir = -1; const ally = enemy(c.game, c.e.x + 60, { type: 'skeleton', hp: 1e5 }); ally.dir = -1; noSwing(c.e); noSwing(ally);
    c.game.brainOff = new Set(['skeleton']); // keep the ally still
    ally.recover = 1.2; ally.punishable = true; if (stunned) { ally.stun = 1.5; ally.riposte = true; }
    lull(c.game); c.player.dir = 1;
    for (let i = 0; i < 60; i++) { c.player.attackCd = .5; ally.stun = stunned ? 1.5 : 0; ally.recover = 1.2; advance(c.game, .01); }
    return { ...c, ally };
  };
  const c = mk(false);
  assert.ok(evs(c.events, 'brainStep').some(ev => ev.kind === 'interpose'), 'interpose announced');
  assert.ok(Math.abs(c.e.x - (c.ally.x - 60)) < 10 || Math.abs(c.e.x - c.ally.x) <= 70, `shield ${c.e.x} ally ${c.ally.x}`);
  assert.equal(c.e.interposing, true); assert.equal(c.game.coverFor(c.ally), c.e, 'the shield covers the ally');
  const s = mk(true);
  assert.ok(!evs(s.events, 'brainStep').some(ev => ev.kind === 'interpose'), 'never during a posture-break stun'); assert.equal(s.e.interposing, false);
});

// steps until e starts a tell and returns the tell's full length (the first frame it exists)
const tellOf = (game, e, input = {}, max = 600) => { for (let i = 0; i < max && !(e.tell > 0); i++) game.update(1 / 120, input); return e.tell > 0 ? e.tell + 1 / 120 : 0; };
const stamped = c => { c.game.onEvent = ev => c.events.push({ ...ev, t: c.game.time }); return c; }; // events carry the game time they fired at

test('spearman spacing: it holds at the hero\'s reach + 50 px (inside its own tip) and backs off at x1.2 when the hero closes in', () => {
  const { game, player, e } = brainFoe('spear', 300, { floor: 3 }); noSwing(e);
  advance(game, 5);
  const hold = Math.abs(e.x - player.x), reach = player.reach + 50;
  assert.ok(Math.abs(hold - Math.min(190, Math.max(90, reach))) <= 12, `holds ${hold}`); assert.ok(hold < 194, 'inside its own tip');
  player.x = e.x - 50; const before = e.x - player.x; advance(game, .5);
  assert.ok(e.x - player.x > before + 30, 'it backs away from a hero inside its tip');
});

test('spearman thrust: tell 0.64 s, a box fixed at tell start; a hero walking in faster than 100 px/s draws the same box centred where it will stand', () => {
  const still = brainFoe('spear', 170, { floor: 3 }); lull(still.game); still.e.cd = 0; advance(still.game, APEX_REACT + .03);
  assert.ok(still.e.tell > .4 && still.e.tell <= .64 && still.e.warn.kind === 'thrust', 'thrust tell'); assert.ok(!still.e.warn.aimed, 'a still hero is not aimed at');
  const w = still.e.warn.box, d = still.e.dir; assert.equal(w.w, 184); assert.ok(Math.abs(w.x - Math.min(still.e.x + d * 10, still.e.x + d * 194)) < 1);
  still.player.x -= 150; advance(still.game, .2); assert.deepEqual(still.e.warn.box, w, 'the box does not follow a hero that moves away');
  const walk = brainFoe('spear', 300, { floor: 3 }); walk.e.speed = 0; lull(walk.game); walk.e.cd = 0; walk.e.mixT = 99; walk.e.heavyCd = 99; // no lunge or pin
  for (let i = 0; i < 120 && !(walk.e.tell > 0); i++) walk.game.update(1 / 120, { right: true });
  assert.ok(walk.e.tell > 0 && walk.e.warn.aimed, 'a walking-in hero is aimed at');
  const box = { ...walk.e.warn.box }, px = walk.game.landing(walk.game.snap(), .64);
  assert.equal(box.w, 184, 'length unchanged'); assert.ok(box.x + 1 >= Math.min(walk.e.x + walk.e.dir * 10, walk.e.x + walk.e.dir * 330), 'starts 10 px or more in front of the tip');
  advance(walk.game, .2, { right: true }); assert.deepEqual(walk.e.warn.box, box, 'fixed at tell start');
  assert.ok(px > walk.player.x - 100, 'the prediction is where the hero is heading');
  const stop = brainFoe('spear', 300, { floor: 3 }); stop.e.speed = 0; lull(stop.game); stop.e.cd = 0; stop.e.mixT = 99; stop.e.heavyCd = 99;
  for (let i = 0; i < 120 && !(stop.e.tell > 0); i++) stop.game.update(1 / 120, { right: true });
  const hp = stop.player.blood; advance(stop.game, .66); assert.equal(stop.player.blood, hp, 'a hero that stops short of the aimed box is not hit by the first thrust (the chained second one is aimed at where it stopped)');
  advance(stop.game, .6); assert.ok(stop.e.follows >= 1 || stop.e.tell > 0 || stop.player.blood < hp, 'a dodged thrust chains an aimed follow-up');
});

test('spearman lift: at a sweep\'s contact a hero in the air within 120 px draws a 0.45 s lift (a 110 px wide column, 0-170 above its feet, centred on the landing); a hero that did not jump is never lifted', () => {
  const mk = airborne => {
    const c = stamped(brainFoe('spear', 60, { floor: 3 })); c.e.speed = 0; lull(c.game); c.player.x = c.e.x - 60; lull(c.game, .2); c.e.cd = 0; c.player.blood = 150;
    for (let i = 0; i < 400 && c.e.move !== 'sweep'; i++) c.game.update(1 / 120, {});
    assert.equal(c.e.move, 'sweep'); assert.ok(c.e.tell >= .45, 'sweep tell');
    while (c.e.tell > .3) c.game.update(1 / 120, {});
    if (airborne) { c.game.jump(); c.player.invulnerable = 0; }
    while (c.e.move === 'sweep') c.game.update(1 / 120, {});
    return c;
  };
  const a = mk(true);
  assert.equal(a.e.move, 'lift'); assert.ok(a.e.tell >= .43 && a.e.tell <= .45, `lift tell ${a.e.tell}`);
  const box = { ...a.e.warn.box }; assert.equal(box.w, 110); assert.equal(box.y, a.e.y - 170); assert.equal(box.h, 170);
  assert.ok(evs(a.events, 'enemyTell').some(ev => ev.kind === 'lift' && ev.follow), 'announced');
  const hp = a.player.blood; a.player.x = a.e.x - 50; const hang = () => Object.assign(a.player, { y: FLOOR - 90, vy: 0, grounded: false, invulnerable: 0 }); // held in the air
  for (let i = 0; i < 12; i++) { hang(); a.game.update(1 / 120, {}); } assert.deepEqual(a.e.warn.box, box);
  while (a.e.move === 'lift') { hang(); a.game.update(1 / 120, {}); }
  assert.ok(a.player.blood < hp, 'a hero still in the air is lifted'); assert.ok(a.e.recover > 0 && a.e.punishable, 'punishable recovery');
  const g = mk(false); assert.notEqual(g.e.move, 'lift', 'no lift for a hero that did not jump');
  const landed = mk(true); const hp2 = landed.player.blood; Object.assign(landed.player, { y: FLOOR, vy: 0, grounded: true, invulnerable: 0 }); landed.player.x = landed.e.x - 50; advance(landed.game, .6);
  assert.ok(landed.player.blood < hp2, 'the column also takes a hero who has just landed in it');
});

test('spearman pullback: a hero who dashes in to within 80 draws a 70 px hop back in 0.2 s, then a normal thrust; no hitbox during the hop', () => {
  const { game, player, e, events } = brainFoe('spear', 60, { floor: 3 }); e.speed = 0; lull(game); player.x = e.x - 60; lull(game, .2); e.pbCd = 0;
  player.dashCd = .85; lull(game, APEX_REACT + .02); e.cd = 0; const x0 = e.x; game.update(1 / 120, {}); // the snapshot now shows the dash
  const step = evs(events, 'brainStep').find(ev => ev.kind === 'pullback'); assert.ok(step, 'pullback announced'); assert.ok(e.bmT > 0 && !(e.tell > 0), 'a hop, not an attack');
  advance(game, .25); assert.ok(Math.abs(e.x - (x0 + 70)) < 4, `hopped 70 px (${e.x - x0})`);
  advance(game, .05);
  assert.ok(e.tell > 0 && e.warn.kind === 'thrust' && e.tell >= .45, 'then a thrust with its full tell'); assert.ok(e.pbCd > 1, 'cooldown 1.6 s');
  const calmHero = brainFoe('spear', 60, { floor: 3 }); calmHero.e.speed = 0; lull(calmHero.game); calmHero.player.x = calmHero.e.x - 60; lull(calmHero.game, .2); calmHero.e.cd = 0; advance(calmHero.game, .2);
  assert.ok(!evs(calmHero.events, 'brainStep').length, 'no dash, no pullback');
});

test('spearman plant: only against a Spear frenzy; 0.5 s tell, the tip box stays live 1.2 s, hurts once and stops an assault dash; 4 s cooldown', () => {
  const frenzied = on => { const c = stamped(brainFoe('spear', 200, { floor: 3 })); if (on) Object.assign(c.player, { frenzy: true, weapon: 'spear', blood: 190 }); c.e.plantCd = 99; lull(c.game); c.e.plantCd = 0; c.e.cd = 0; return c; };
  const off = frenzied(false); advance(off.game, .3); assert.ok(!off.e.warn || off.e.warn.kind !== 'plant', 'no plant outside a Spear frenzy');
  const c = frenzied(true); const plantTell = tellOf(c.game, c.e);
  assert.equal(c.e.move, 'plant'); assert.ok(plantTell >= .45 && plantTell <= .51, `plant tell ${plantTell}`); assert.ok(evs(c.events, 'enemyTell').some(ev => ev.kind === 'plant'));
  const box = { ...c.e.warn.box }; assert.equal(box.w, 184);
  c.player.x = c.e.x - 400; advance(c.game, .55); assert.ok(c.e.plantT > 0, 'live after the tell'); assert.deepEqual(c.e.warn.box, box);
  const t0 = c.game.time; c.player.x = c.e.x - 120; c.player.invulnerable = 0; const blood0 = c.player.blood; Object.assign(c.player, { dash: .18, dir: 1 }); advance(c.game, .1);
  assert.ok(c.player.blood < blood0, 'walking or dashing into the tip is hurt'); assert.equal(c.player.dash, 0, 'and stopped');
  const hurts = evs(c.events, 'hurt').length; c.player.invulnerable = 0; advance(c.game, .3); assert.equal(evs(c.events, 'hurt').length, hurts, 'once per plant');
  advance(c.game, 1.2); assert.equal(c.e.plantT, 0); assert.ok(c.e.recover > 0 || c.e.recover === 0); assert.ok(c.e.plantCd > 0, 'cooldown');
  assert.ok(c.game.time - t0 < 4 && c.e.plantCd > 0, 'the next plant waits out its 4 s cooldown');
});

test('cower: from floor 5 an idle minion within 220 px steps back 50 px in 0.35 s as the hero\'s frenzy starts, once per frenzy, with no tell while it moves', () => {
  for (const type of ['shield', 'spear']) {
    const c = brainFoe(type, 120, { floor: 5 }); noSwing(c.e); lull(c.game); const x0 = c.e.x; c.player.blood = 190;
    c.player.frenzy = true; c.player.weapon = 'heavy'; c.game.update(1 / 120, {}); // frenzy begins
    advance(c.game, APEX_REACT + .03);
    assert.ok(evs(c.events, 'cower').length === 1, `${type}: cower announced`); assert.ok(!(c.e.tell > 0), 'no tell while it moves');
    let far = 0; for (let i = 0; i < 60; i++) { c.game.update(1 / 120, {}); far = Math.max(far, Math.abs(c.e.x - x0)); }
    assert.ok(far >= 40 && far <= 80, `${type}: stepped back ${far} px`);
    advance(c.game, 1); assert.equal(evs(c.events, 'cower').length, 1, 'once per frenzy');
    c.player.frenzy = false; advance(c.game, .3); c.player.blood = 190; c.player.frenzy = true; c.game.update(1 / 120, {}); advance(c.game, .3);
    assert.equal(evs(c.events, 'cower').length, 2, 'a new frenzy cowers again');
  }
  const early = brainFoe('spear', 120, { floor: 4 }); noSwing(early.e); lull(early.game); early.player.blood = 190; early.player.frenzy = true; early.game.update(1 / 120, {}); advance(early.game, .3);
  assert.equal(evs(early.events, 'cower').length, 0, 'floor 4: no cower');
  const busy = brainFoe('spear', 120, { floor: 5 }); lull(busy.game); busy.e.cd = 0; advance(busy.game, .3); busy.player.blood = 190; busy.player.frenzy = true; busy.game.update(1 / 120, {}); advance(busy.game, .3);
  assert.equal(evs(busy.events, 'cower').length, 0, 'a minion already in a tell does not cower');
});

test('no contact into i-frames: a brain does not start a strike whose contact would fall inside the hero\'s remaining invulnerability', () => {
  const { game, player, e } = brainFoe('spear', 170, { floor: 3 }); lull(game); e.cd = 0;
  player.invulnerable = .9; let started = -1;
  for (let i = 0; i < 240 && started < 0; i++) { game.update(1 / 120, {}); if (e.tell > 0) started = player.invulnerable; }
  assert.ok(started >= 0, 'it strikes once the i-frames run low'); assert.ok(started < SPEAR_TELL, `contact (${SPEAR_TELL} s away) comes after the i-frames end (${started} s left)`);
  const s = brainFoe('shield', 50, { floor: 2 }); lull(s.game); s.e.dir = 1; s.e.cd = 0; s.player.invulnerable = .7; s.game.update(1 / 120, {});
  advance(s.game, .01); assert.equal(s.e.move, '', 'no rimstrike (0.45 s) into 0.7 s of i-frames');
});
const SPEAR_TELL = .64;

function screenScene(floor = 4) {
  const c = stamped(castle(42, floor, true)); const { game, player } = c;
  game.rand = () => .99; player.x = 700; player.blood = 150; player.invulnerable = 0;
  const shield = enemy(game, 810, { type: 'shield', hp: 1e5 }), spear = enemy(game, 940, { type: 'spear', hp: 1e5 });
  for (const e of [shield, spear]) Object.assign(e, { dir: -1, action: 1, maxPoise: 500, poise: 500, cd: 0 });
  shield.mixT = 99; shield.braceCd = 99; // no rush and no brace: the screen is the move under test
  return { ...c, shield, spear };
}
const runUntil = (c, done, max = 20) => { const t1 = c.game.time + max; while (c.game.time < t1 && !done() && c.game.state === 'playing') { c.player.blood = c.player.frenzy ? 190 : Math.min(c.player.blood, 190); c.game.update(1 / 120, {}); } };

test('screen pair: the shield calls and pushes, then its bash and the spearman\'s thrust land 0.5-0.8 s apart, the thrust tell starting no later than the bash contact', () => {
  const c = screenScene(4);
  runUntil(c, () => c.events.some(ev => ev.type === 'enemySwing' && ev.kind === 'spear'));
  const call = c.events.find(ev => ev.type === 'squadCall'); assert.ok(call, 'the call thread'); assert.equal(call.tactic, 'screen'); assert.equal(call.lead, 'shield'); assert.equal(call.partner, 'spear');
  const bash = c.events.find(ev => ev.type === 'enemySwing' && ev.kind === undefined), thrust = c.events.find(ev => ev.type === 'enemySwing' && ev.kind === 'spear'), tell = c.events.find(ev => ev.type === 'enemyTell' && ev.enemy === 'spear' && ev.kind === 'thrust');
  assert.ok(bash && thrust && tell, 'both contacts and the second tell');
  assert.ok(thrust.t - bash.t >= .5 - .02 && thrust.t - bash.t <= .8, `gap ${thrust.t - bash.t}`); assert.ok(tell.t <= bash.t + 1e-6, 'the second tell starts no later than the first contact');
  assert.ok(call.t < c.events.find(ev => ev.type === 'enemyTell' && ev.enemy === 'shield').t, 'the call comes before the lead\'s first tell');
  assert.ok(c.events.some(ev => ev.type === 'squadEnd'));
  assert.ok(c.game.pairCd > 2.5 && c.game.pairCd <= 4, 'cooldown 4 s');
  assert.equal(c.game.pair, null);
});

test('pair limits: not before floor 4, not in a frenzy, not within 1 s of a hurt, not on cooldown, never without a non-dash escape; a stunned partner or a hit ends it', () => {
  const quiet = (floor, prep) => { const c = screenScene(floor); prep?.(c); runUntil(c, () => c.events.some(ev => ev.type === 'squadCall'), 12); return c; };
  assert.ok(!quiet(3).events.some(ev => ev.type === 'squadCall'), 'floor 3: the spearman only joins pairs from floor 4');
  assert.ok(!quiet(4, c => { c.player.frenzy = true; c.player.blood = 190; }).events.some(ev => ev.type === 'squadCall'), 'no screen in a frenzy');
  assert.ok(!quiet(4, c => { c.game.pairCd = 99; }).events.some(ev => ev.type === 'squadCall'), 'cooldown');
  const late = screenScene(9); late.game.endPair('done'); late.game.pair = { lead: late.shield }; late.game.endPair('done'); assert.equal(late.game.pairCd, 3, 'floors 8-9: 3 s');
  const hurt = screenScene(4); let calledAfter = -1; hurt.game.lastHurt = hurt.game.time; // hurt again every 0.5 s: no pair ever opens
  for (let i = 0; i < 120 * 6; i++) { if (i % 60 === 0) hurt.game.lastHurt = hurt.game.time; hurt.player.blood = 150; hurt.game.update(1 / 120, {}); if (hurt.events.some(ev => ev.type === 'squadCall')) { calledAfter = i; break; } }
  assert.equal(calledAfter, -1, 'no pair within 1.0 s of a hurt');
  const ok = screenScene(4); assert.equal(ok.game.pairOk(ok.shield, ok.spear), true); ok.game.lastHurt = ok.game.time - .5; assert.equal(ok.game.pairOk(ok.shield, ok.spear), false); ok.game.lastHurt = -9;
  const open = { x: 0, y: FLOOR - 58, w: 10, h: 58 }, plan = (t1, t2, tell2) => ({ areas: [{ t: t1, box: open }, { t: t2, box: open }], tell2 });
  assert.equal(ok.game.pairOk(ok.shield, ok.spear, plan(.55, 1.15, .64)), true, 'a 0.6 s gap with the second tell starting at the first contact');
  assert.equal(ok.game.pairOk(ok.shield, ok.spear, plan(.55, 1.0, .45)), false, 'a 0.45 s gap is too tight');
  assert.equal(ok.game.pairOk(ok.shield, ok.spear, plan(.55, 1.5, .64)), false, 'a 0.95 s gap is too loose');
  assert.equal(ok.game.pairOk(ok.shield, ok.spear, plan(.55, 1.15, .3)), false, 'the second tell must start no later than the first contact');
  const s = ok.game.snap();
  assert.equal(ok.game.escapes(s, [{ t: .55, box: { x: 0, y: 0, w: 4000, h: 4000 } }]), false, 'a hero boxed in on every side has no escape');
  assert.equal(ok.game.escapes(s, [{ t: .55, box: { x: s.x - 60, y: FLOOR - 58, w: 100, h: 58 } }]), true, 'a low box can be walked or jumped out of');
  const wall = screenScene(4); wall.player.x = 30; wall.game.update(1 / 120, {}); const ws = wall.game.snap();
  assert.equal(wall.game.escapes(ws, [{ t: .55, box: { x: 0, y: FLOOR - 58, w: 140, h: 58 } }, { t: 1.15, box: { x: 0, y: FLOOR - 200, w: 260, h: 200 } }]), false, 'in a corner under a tall second box: no non-dash escape, so no pair');
  const stun = screenScene(4); runUntil(stun, () => stun.game.pair, 12); assert.ok(stun.game.pair, 'a pair opened');
  stun.spear.stun = 1; stun.game.update(1 / 120, {}); assert.equal(stun.game.pair, null); assert.ok(stun.events.some(ev => ev.type === 'squadEnd' && ev.reason === 'broken'));
  const hit = screenScene(4); runUntil(hit, () => hit.game.pair, 12); hit.game.hurt(5, 1);
  assert.ok(hit.events.some(ev => ev.type === 'squadEnd' && ev.reason === 'hit'));
});

test('habit memory: two of the last three answers to a type\'s moves that match are a habit; it widens the rim strike and the lift', () => {
  const { game, e } = brainFoe('spear', 100, { floor: 3 });
  assert.equal(game.habit('spear'), '');
  const p = game.player; Object.assign(p, { grounded: false });
  game.noteHabit('spear', e, false); game.noteHabit('spear', e, false); assert.equal(game.habit('spear'), 'jumped');
  p.grounded = true; game.noteHabit('spear', e, true); game.noteHabit('spear', e, true); assert.equal(game.habit('spear'), 'stood', 'only the last three count'); assert.equal(game.habits.spear.length, 3);
  const lift = habit => { const c = brainFoe('spear', 135, { floor: 3 }); c.e.speed = 0; lull(c.game); if (habit) c.game.habits.spear = ['jumped', 'jumped']; c.player.vy = -100; c.player.grounded = false; c.player.y = FLOOR - 40; c.game.snaps.length = 0; c.game.update(1 / 120, {}); advance(c.game, .15); return c.game.spearLift(c.e); };
  assert.equal(lift(false), false, 'a hero in the air 135 px out is beyond the 120 px lift');
  assert.equal(lift(true), true, 'a jump habit widens it to 150');
  const rim = habit => { const c = brainFoe('shield', 95, { floor: 2 }); lull(c.game); c.e.dir = 1; c.e.reface = 0; if (habit) c.game.habits.shield = ['crossed', 'crossed']; c.e.cd = 0; advance(c.game, .2); return c.e.move === 'rimstrike' || c.e.recover > 0; };
  assert.equal(rim(false), false); assert.equal(rim(true), true);
});

test('brains: every light tell is at least 0.45 s and every heavy at least 0.85 s, over a mixed fight with the screen, lift, pullback, plant and turnrush in play', () => {
  const lights = [], heavies = [];
  for (const [floor, frenzy] of [[4, false], [5, false], [9, true], [6, false]]) {
    const c = screenScene(floor); const { game, player } = c; c.shield.mixT = 0; player.dashCd = 0;
    if (frenzy) Object.assign(player, { frenzy: true, weapon: 'spear' });
    const seen = new Map();
    for (let i = 0; i < 120 * 40; i++) {
      const t = i / 120; player.blood = Math.min(190, player.blood + .3); if (!frenzy) player.frenzy = false;
      const input = { right: Math.sin(t * .9) > .3, left: Math.sin(t * .9) < -.5, jump: i % 170 === 0, dash: i % 233 === 0 };
      game.update(1 / 120, input);
      for (const e of game.enemies) { const prev = seen.get(e) || 0; if (e.tell > prev + .05 && e.hp > 0) (e.heavy ? heavies : lights).push(e.tell + 1 / 120); seen.set(e, e.tell); }
    }
  }
  assert.ok(lights.length > 20, `${lights.length} light tells observed`); assert.ok(Math.min(...lights) >= .45 - 1e-6, `shortest light tell ${Math.min(...lights)}`);
  if (heavies.length) assert.ok(Math.min(...heavies) >= .85 - 1e-6, `shortest heavy tell ${Math.min(...heavies)}`);
});

test('spearman haft guard: a hero swinging at it from the front inside its tip meets the raised haft (x0.25, +1 blood, no flinch); hit 3 does not break it, a plunge or Eclipse does; the guard ends in a shove or a jab', () => {
  const mk = () => { const c = brainFoe('spear', 110, { floor: 3 }); c.e.speed = 0; c.e.cd = 99; c.e.jabCd = 99; c.e.heavyCd = 99; lull(c.game); c.player.dir = 1; c.player.blood = 100; return c; };
  const a = mk(); a.player.attackCd = .3; advance(a.game, APEX_REACT + .05);
  assert.ok(a.e.gT > 0, 'the haft is up'); const hp = a.e.hp; a.game.damageEnemy(a.e, 20, 1, false, false, false, 17);
  assert.ok(evs(a.events, 'apexGuard').length === 1 && hp - a.e.hp <= 5 && a.e.stun === 0, 'hit 1 is blocked: x0.25, no flinch');
  const third = mk(); third.player.attackCd = .3; advance(third.game, APEX_REACT + .05); third.game.damageEnemy(third.e, 20, 1, false, true, false, 62);
  assert.ok(evs(third.events, 'apexCrush').length === 0 && third.e.gT > 0, 'the spinning haft shrugs off hit 3');
  const plunge = mk(); plunge.player.attackCd = .3; advance(plunge.game, APEX_REACT + .05); plunge.game.damageEnemy(plunge.e, 20, 1, false, true, false, 45);
  assert.ok(evs(plunge.events, 'apexCrush').length === 1 && plunge.e.gT === 0, 'a plunge breaks it');
  const ecl = mk(); ecl.player.attackCd = .3; advance(ecl.game, APEX_REACT + .05); ecl.game.damageEnemy(ecl.e, 20, 1, false, true, false, 55, true);
  assert.ok(evs(ecl.events, 'apexCrush').length === 1, 'Eclipse breaks it');
  const behind = mk(); behind.player.attackCd = .3; advance(behind.game, APEX_REACT + .05); const hpb = behind.e.hp; behind.game.damageEnemy(behind.e, 20, -1, false, false, false, 17);
  assert.ok(hpb - behind.e.hp >= 15, 'from behind it lands in full');
  const ans = mk(); ans.player.x = ans.e.x - 60; lull(ans.game, .2); Object.assign(ans.e, { cd: 0, gT: .005, gHit: 1 }); ans.game.update(1 / 120, {});
  assert.ok(ans.e.move === 'shove' && ans.e.tell >= .44, 'a blocked hero still inside 80 px draws the shove, with its full tell');
  const idle = mk(); advance(idle.game, .5); assert.equal(idle.e.gT, 0, 'no guard for a hero that is not swinging');
});

test('shield interpose also covers a spearman that is being hit (not one in a posture-break stun)', () => {
  const mkc = stunned => {
    const c = brainFoe('shield', 90, { floor: 4 }); const sp = enemy(c.game, c.e.x + 60, { type: 'spear', hp: 1e5 }); Object.assign(sp, { dir: -1, action: 1, cd: 99, speed: 0 }); noSwing(c.e);
    lull(c.game); c.player.dir = 1; sp.poiseHit = 1.5; sp.stun = stunned ? 1 : 0;
    for (let i = 0; i < 40; i++) { c.player.attackCd = .5; sp.poiseHit = 1.5; sp.stun = stunned ? 1 : 0; advance(c.game, .01); }
    return c;
  };
  assert.equal(mkc(false).e.interposing, true, 'it steps in front of a spearman being hit');
  assert.equal(mkc(true).e.interposing, false, 'never for a stunned one');
});

test('spearman vault, spin and pin: a vault is a 160 px move with no hitbox, spin and pin are flat-100 heavies with a 0.9 s tell, a fixed box and a glint', () => {
  const v = brainFoe('spear', 60, { floor: 4 }); v.e.speed = 0; v.e.cd = 99; v.e.jabCd = 99; lull(v.game); v.e.poiseHit = 1.5; v.e.vaultCd = 0; const x0 = v.e.x; v.player.x = v.e.x - 60; lull(v.game, 0); v.e.poiseHit = 1.5; v.game.update(1 / 120, {});
  assert.ok(evs(v.events, 'brainStep').some(ev => ev.kind === 'vault') && v.e.bmT > 0 && !(v.e.tell > 0), 'a vault, not an attack'); advance(v.game, .35); assert.ok(Math.abs(v.e.x - x0) >= 150, `vaulted ${Math.abs(v.e.x - x0)} px`);
  const sp = brainFoe('spear', 90, { floor: 4 }); sp.e.speed = 0; sp.e.cd = 99; sp.e.jabCd = 99; sp.e.mixT = 99; lull(sp.game);
  sp.e.tipHits = [sp.game.time - .3, sp.game.time - .1]; sp.game.update(1 / 120, {});
  const heavy = evs(sp.events, 'enemyHeavy').find(ev => ev.kind === 'spin'); assert.ok(heavy, 'two hits inside the tip within 1 s draw the spin');
  assert.ok(sp.e.tell >= .85 && sp.e.heavy, `spin tell ${sp.e.tell}`); const box = { ...sp.e.warn.box }; assert.equal(box.w, 260); advance(sp.game, .3); assert.deepEqual(sp.e.warn.box, box, 'fixed at tell start');
  advance(sp.game, .5); assert.ok(evs(sp.events, 'enemyGlint').some(ev => ev.kind === 'spin'), 'glint');
  const one = brainFoe('spear', 90, { floor: 4 }); one.e.speed = 0; one.e.cd = 99; one.e.jabCd = 99; one.e.mixT = 99; lull(one.game); one.e.tipHits = [one.game.time - .1]; one.game.update(1 / 120, {});
  assert.ok(!evs(one.events, 'enemyHeavy').length, 'one hit is not enough');
  const jump = brainFoe('spear', 90, { floor: 4 }); jump.e.speed = 0; jump.e.cd = 99; jump.e.jabCd = 99; jump.e.mixT = 99; lull(jump.game); jump.e.tipHits = [jump.game.time - .3, jump.game.time - .1]; jump.game.update(1 / 120, {});
  const hp = jump.player.blood; Object.assign(jump.player, { y: FLOOR - 80, vy: 0, grounded: false }); while (jump.e.heavy && jump.e.tell > .02) { Object.assign(jump.player, { y: FLOOR - 80, vy: 0, grounded: false, invulnerable: 0 }); jump.game.update(1 / 120, {}); }
  advance(jump.game, .02); assert.equal(jump.player.blood, hp, 'a hero in the air clears the low whirl');
  const pin = brainFoe('spear', 220, { floor: 4 }); pin.e.speed = 0; pin.e.cd = 99; pin.e.jabCd = 99; lull(pin.game, .1);
  for (let i = 0; i < 80 && !pin.e.heavy; i++) pin.game.update(1 / 120, { right: true });
  assert.ok(pin.e.heavy && pin.e.heavyKind === 'pin' && pin.e.tell >= .85, 'a hero walking straight in draws the pin'); const pbox = { ...pin.e.warn.box }; advance(pin.game, .2, { right: true }); assert.deepEqual(pin.e.warn.box, pbox);
});

test('review fixes: the fired screen thrust re-checks the non-dash escape, a landed shove only pushes, coverFor skips stunned or cowering parties, the brace gap is 1.2 s, the jab tell is named jab', () => {
  const run = escapes => { const c = screenScene(4); const real = c.game.escapes.bind(c.game); c.game.escapes = (s, a) => (a.length === 1 && a[0].t > .5 && a[0].t < .7 ? escapes : real(s, a)); runUntil(c, () => c.events.some(ev => ev.type === 'squadEnd' || (ev.type === 'enemySwing' && ev.kind === 'spear')), 14); return c; };
  const ok = run(true), bad = run(false);
  assert.ok(ok.events.some(ev => ev.type === 'enemyTell' && ev.enemy === 'spear' && ev.kind === 'thrust'), 'a box that leaves an escape is fired');
  assert.ok(bad.events.some(ev => ev.type === 'squadEnd' && ev.reason === 'broken') && !bad.events.some(ev => ev.type === 'enemyTell' && ev.enemy === 'spear' && ev.kind === 'thrust'), 'a fired box with no escape breaks the pair instead');
  const sv = brainFoe('spear', 50, { floor: 3 }); sv.e.speed = 0; sv.e.cd = 99; sv.e.jabCd = 99; sv.e.heavyCd = 99; lull(sv.game);
  Object.assign(sv.e, { tell: .001, move: 'shove', token: 'light', warn: { kind: 'shove', box: { x: sv.e.x - 60, y: sv.e.y - 58, w: 60, h: 58 } } }); sv.player.blood = 150; const x0 = sv.player.x; advance(sv.game, .05);
  assert.ok(Math.abs(sv.player.x - x0) >= 60, 'the shove pushes the hero back'); assert.ok(!sv.events.some(ev => ev.type === 'enemyTell' && ev.follow), 'no follow-up tell (the i-frames make it unreachable)');
  const cv = (setup) => { const c = brainFoe('shield', 90, { floor: 4 }); const sp = enemy(c.game, c.e.x + 60, { type: 'spear', hp: 1e5 }); Object.assign(c.e, { interposing: true, interposeFor: sp, dir: -1, guardBreak: 0 }); c.player.dir = 1; setup(c.e, sp); return c.game.coverFor(sp); };
  assert.ok(cv(() => {}) , 'baseline: the shield covers');
  assert.equal(cv((sh, sp) => { sp.stun = 1; }), null, 'not an ally in a posture-break stun'); assert.equal(cv(sh => { sh.stun = .3; }), null, 'not while the shield is stunned');
  assert.equal(cv(sh => { sh.frozen = 1; }), null, 'not while frozen'); assert.equal(cv(sh => { sh.bmT = .3; }), null, 'not while cowering');
  const br = brainFoe('shield', 40, { floor: 2 }); br.e.braceCd = 0; lull(br.game); br.player.blood = 100; br.e.dir = -1; br.e.reface = 0; br.player.attack = 0;
  br.game.update(1 / 120, {}); advance(br.game, APEX_REACT + .05); assert.ok(br.e.braceT > 0 && br.e.braceCd - br.e.braceT >= 1.1, `the next brace waits 1.2 s after this one ends (${br.e.braceCd} vs ${br.e.braceT})`);
  const jb = brainFoe('spear', 110, { floor: 3 }); jb.e.speed = 0; jb.e.cd = 99; jb.e.heavyCd = 99; jb.e.gCd = 99; lull(jb.game); jb.e.jabCd = 0; jb.player.attackCd = .5; advance(jb.game, APEX_REACT + .1);
  assert.ok(jb.events.some(ev => ev.type === 'enemyTell' && ev.kind === 'jab'), 'the jab announces itself as a jab');
});

// ---- Brains (#62 PR 2): bat and knight ----
test('knight parry: hit 1 swinging inside 110 px with posture above 70 raises the pose; the first frontal sword hit is deflected (no damage, no blood, pushed back 40) and a riposte follows; plunge and Eclipse are not deflected', () => {
  const mk = (poise = 140) => { const c = brainFoe('knight', 90, { floor: 7 }); c.e.speed = 0; c.e.cd = 99; c.e.heavyCd = 99; c.e.maxPoise = 140; c.e.poise = poise; lull(c.game); c.player.dir = 1; c.player.blood = 100; return c; };
  const raise = c => { for (let i = 0; i < 20; i++) { Object.assign(c.player, { combo: 1, attack: .03, comboWindow: .8 }); c.game.update(1 / 120, {}); } c.player.attack = 0; }; // a swing that does not itself reach (attack stays under the hit threshold)
  const a = mk(); raise(a); assert.ok(a.e.parryT > 0 && !(a.e.tell > 0), 'the pose, not an attack'); assert.ok(evs(a.events, 'brainStep').some(ev => ev.kind === 'parry'));
  const hp = a.e.hp, x0 = a.player.x; a.game.damageEnemy(a.e, 30, 1, false, false, false, 17);
  assert.equal(a.e.hp, hp, 'no damage'); assert.ok(a.player.x <= x0 - 35, 'pushed back'); assert.equal(a.game.bloodOk(a.e), false, 'no blood from a deflected hit'); assert.ok(evs(a.events, 'parry').length === 1);
  advance(a.game, .1); assert.equal(a.e.move, 'riposte'); assert.ok(a.e.tell > .3 && a.e.tell <= .45 && a.e.warn.box.w === 90, 'riposte: a light with its tell and a fixed box');
  const none = mk(); raise(none); advance(none.game, .45); assert.ok(none.e.recover > 0 && none.e.punishable, 'a parry that nothing hits ends in a punishable recovery');
  const pl = mk(); raise(pl); const hp2 = pl.e.hp; pl.game.inPlunge = true; pl.game.damageEnemy(pl.e, 30, 1, false, true, false, POISE_PLUNGE); pl.game.inPlunge = false; assert.ok(pl.e.hp < hp2 && pl.e.parryT > 0 === false || pl.e.hp < hp2, 'a plunge lands');
  const ec = mk(); raise(ec); const hp3 = ec.e.hp; ec.game.damageEnemy(ec.e, 30, 1, false, true, false, 55, true); assert.ok(ec.e.hp < hp3, 'Eclipse lands');
  const back = mk(); raise(back); const hp4 = back.e.hp; back.game.damageEnemy(back.e, 30, -1, false, false, false, 17); assert.ok(back.e.hp < hp4, 'from behind it lands');
  const weak = mk(60); for (let i = 0; i < 20; i++) { weak.e.poise = 60; Object.assign(weak.player, { combo: 1, attack: .03, comboWindow: .8 }); weak.game.update(1 / 120, {}); } assert.equal(weak.e.parryT, 0, 'posture 70 or lower: no parry');
});
const POISE_PLUNGE = 45;

test('knight string: a hero in the air in front within 150 at the slash draws the upcut (0.5 s tell, 10-100 box, 50-170 above its feet); greatswing at the landing; a dash habit delays it on floors 7+', () => {
  const k = brainFoe('knight', 55, { floor: 7 }); k.e.speed = 0; k.e.heavyCd = 99; lull(k.game); k.e.cd = 0;
  for (let i = 0; i < 300 && k.e.move !== 'slash' && !(k.e.tell > 0); i++) k.game.update(1 / 120, {});
  assert.ok(k.e.tell > 0, 'slash tell'); while (k.e.tell > .3) k.game.update(1 / 120, {});
  Object.assign(k.player, { y: FLOOR - 120, vy: -50, grounded: false }); advance(k.game, .15); k.player.y = FLOOR - 120; k.player.vy = 0; // over the slash: it misses, so the string goes on (a hit would end it: the overhead would land in the i-frames)
  while (k.e.tell > 0 && k.e.move !== 'upcut') { Object.assign(k.player, { y: FLOOR - 120, vy: 0, grounded: false }); k.game.update(1 / 120, {}); }
  const up = k.e.move === 'upcut'; assert.ok(up || evs(k.events, 'enemyTell').some(ev => ev.kind === 'upcut'), 'upcut branch'); 
  const g = brainFoe('knight', 120, { floor: 7 }); g.e.speed = 0; g.e.cd = 99; lull(g.game); g.player.dashCd = .8; g.e.mixT = 0; g.e.heavyCd = 0; advance(g.game, APEX_REACT + .05);
  const h = evs(g.events, 'enemyHeavy').find(ev => ev.kind === 'greatswing'); assert.ok(h && h.variant === 'landing' && h.delayed === false, 'greatswing at the landing, not delayed without a habit');
  const d = brainFoe('knight', 120, { floor: 7 }); d.e.speed = 0; d.e.cd = 99; lull(d.game); d.game.habits.knight = ['dashed', 'dashed']; d.player.dashCd = .8; d.e.mixT = 0; d.e.heavyCd = 0; advance(d.game, APEX_REACT + .05);
  const dh = evs(d.events, 'enemyHeavy').find(ev => ev.kind === 'greatswing'); assert.ok(dh && dh.delayed === true && d.e.tell > 1.2, 'a dash habit delays it (glint still 0.4 s before contact)');
  const low = brainFoe('knight', 120, { floor: 5 }); low.e.speed = 0; low.e.cd = 99; lull(low.game); low.game.habits.knight = ['dashed', 'dashed']; low.player.dashCd = .8; low.e.mixT = 0; low.e.heavyCd = 0; advance(low.game, APEX_REACT + .05);
  const lh = evs(low.events, 'enemyHeavy').find(ev => ev.kind === 'greatswing'); assert.ok(!lh || lh.delayed === false, 'no delayed swing below floor 7 for a plain knight');
});

test('bat: swoop picks its moment, orbit crosses a hero who faces it, flutter away from a plunge, dive aimed at the landing; a dodged swoop chains a second one', () => {
  const mk = (gap = 100) => { const c = brainFoe('bat', gap, { floor: 6 }); c.e.speed = 0; c.e.y = c.player.y - 34; c.e.upT = 0; c.e.crossCd = 99; return c; };
  const settle = c => { lull(c.game); c.e.y = c.player.y - 34; c.e.crossCd = 99; };
  const away = mk(100); away.e.cd = 99; settle(away); away.e.cd = 0; away.e.mixT = 99; away.player.dir = -1; advance(away.game, APEX_REACT + .05);
  assert.ok(away.e.tell > 0 || evs(away.events, 'enemyTell').some(ev => ev.kind === 'swoop'), 'the hero looks away: it swoops');
  const face = mk(100); face.e.cd = 99; settle(face); face.e.crossCd = 0; face.e.cd = 0; face.e.mixT = 99; face.player.dir = 1; advance(face.game, APEX_REACT + .05);
  assert.ok(evs(face.events, 'enemyCross').length === 1 && !(face.e.tell > 0), 'the hero looks at it: no swoop, it orbits to the back (no hitbox)');
  const pl = mk(60); pl.e.cd = 99; settle(pl); pl.e.fluttCd = 0; Object.assign(pl.player, { plunge: 1, plungeT: .3, y: FLOOR - 100, grounded: false }); advance(pl.game, APEX_REACT + .05);
  assert.ok(evs(pl.events, 'brainStep').some(ev => ev.kind === 'flutter') && !(pl.e.tell > 0), 'a plunge sends it fluttering');
  const dv = mk(150); dv.e.cd = 99; settle(dv); dv.e.heavyCd = 0; dv.e.mixT = 0; dv.player.dashCd = .8; advance(dv.game, APEX_REACT + .05);
  const hv = evs(dv.events, 'enemyHeavy').find(ev => ev.kind === 'dive'); assert.ok(hv && hv.variant === 'landing' && dv.e.tell >= .85, 'a spent dash draws the dive'); const line = { ...dv.e.warn.line }; advance(dv.game, .3); assert.deepEqual(dv.e.warn.line, line, 'its line is fixed at tell start');
  const ch = mk(60); ch.e.cd = 99; ch.player.dashCd = .8; settle(ch); ch.player.dashCd = .8; lull(ch.game, .15); Object.assign(ch.e, { cd: 0, mixT: 99, tell: .001, token: 'light', dartT: 0 }); ch.player.x -= 200; advance(ch.game, .05);
  assert.ok(ch.e.follows === 1 && ch.e.tell > .6, 'a dodged swoop chains a second one into the dash cooldown');
});

test('herd and pincer pairs: the second contact lands 0.5-0.8 s after the first and obeys the pair limits', () => {
  const hd = brainFoe('bat', 200, { floor: 8 }); const sp = enemy(hd.game, hd.player.x + 130, { type: 'spear', hp: 1e5 }); Object.assign(sp, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); hd.e.speed = 0; hd.e.cd = 99; lull(hd.game);
  Object.assign(sp, { tell: .3, token: 'light', thrustBox: { x: sp.x - 194, y: sp.y - 54, w: 184, h: 54 }, warn: { kind: 'thrust', box: { x: sp.x - 194, y: sp.y - 54, w: 184, h: 54 } } }); hd.e.heavyCd = 0; hd.game.pairCd = 0;
  hd.game.update(1 / 120, {});
  assert.ok(hd.game.pair?.tactic === 'herd' && hd.e.heavy && hd.e.heavyKind === 'dive', 'the bat dives onto the landing');
  const gap = hd.e.tell - sp.tell; assert.ok(gap >= .5 && gap <= .8, `contacts ${gap} s apart`); assert.ok(hd.e.tell >= .85);
  const hurt = brainFoe('bat', 200, { floor: 8 }); const sp2 = enemy(hurt.game, hurt.player.x + 130, { type: 'spear', hp: 1e5 }); Object.assign(sp2, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); hurt.e.speed = 0; hurt.e.cd = 99; lull(hurt.game);
  Object.assign(sp2, { tell: .3, token: 'light', warn: { kind: 'thrust', box: { x: sp2.x - 194, y: sp2.y - 54, w: 184, h: 54 } } }); hurt.e.heavyCd = 0; hurt.game.lastHurt = hurt.game.time - .3; hurt.game.update(1 / 120, {});
  assert.ok(!hurt.game.pair, 'none within 1 s of a hurt');
  const pn = brainFoe('knight', 40, { floor: 9 }); const sp3 = enemy(pn.game, pn.player.x - 150, { type: 'spear', hp: 1e5 }); Object.assign(sp3, { dir: 1, action: 1, cd: 0, speed: 0 }); pn.e.speed = 0; pn.e.cd = 0; pn.e.mixT = 99; lull(pn.game); pn.e.cd = 0; sp3.cd = 0;
  for (let i = 0; i < 40 && !pn.game.pair; i++) pn.game.update(1 / 120, {});
  assert.ok(pn.game.pair?.tactic === 'pincer' && pn.e.tell >= .59, 'the knight anchors a pincer with the spearman behind the hero'); assert.ok(pn.game.pair.gap >= .5 && pn.game.pair.gap <= .8);
});

test('knight charge: a hero standing and swinging 160-380 px away draws a flat-100 rush (variant charge) with a 0.9 s tell, a glint and a path fixed at tell start; a jump clears it; a bat does not dive at the hero it is being hit by', () => {
  const k = brainFoe('knight', 300, { floor: 8 }); k.e.speed = 0; k.e.cd = 99; lull(k.game); k.e.chargeCd = 0; k.e.heavyCd = 0; k.e.mixT = 99;
  for (let i = 0; i < 20; i++) { k.player.attackCd = .3; k.game.update(1 / 120, {}); }
  const ev = evs(k.events, 'enemyHeavy').find(e => e.kind === 'rush'); assert.ok(ev && ev.variant === 'charge' && ev.enemy === 'knight', 'the charge is announced'); assert.ok(k.e.tell > .7 && k.e.heavy);
  const to = k.e.warn.to; advance(k.game, .2); assert.equal(k.e.warn.to, to, 'path fixed at tell start');
  const hp = k.player.blood; k.player.blood = 150; const stay = k.player.blood; Object.assign(k.player, { invulnerable: 0 }); advance(k.game, 1.4); assert.ok(k.player.blood < stay, 'a hero that stands is hit');
  const j = brainFoe('knight', 300, { floor: 8 }); j.e.speed = 0; j.e.cd = 99; lull(j.game); j.e.chargeCd = 0; j.e.heavyCd = 0; j.e.mixT = 99;
  for (let i = 0; i < 20; i++) { j.player.attackCd = .3; j.game.update(1 / 120, {}); }
  j.player.blood = 150; const stay2 = j.player.blood; for (let i = 0; i < 170; i++) { Object.assign(j.player, { y: FLOOR - 120, vy: 0, grounded: false, invulnerable: 0 }); j.game.update(1 / 120, {}); } assert.equal(j.player.blood, stay2, 'a jump clears the charge');
  const b = brainFoe('bat', 60, { floor: 8 }); b.e.speed = 0; b.e.cd = 99; b.e.crossCd = 99; lull(b.game); b.e.y = b.player.y - 34; b.e.heavyCd = 0; b.e.mixT = 99; b.player.dir = 1; b.player.x = b.e.x - 60;
  for (let i = 0; i < 30; i++) { b.player.attackCd = .3; b.e.y = b.player.y - 34; b.game.update(1 / 120, {}); }
  assert.ok(!evs(b.events, 'enemyHeavy').some(e => e.kind === 'dive'), 'a bat being swung at does not start a dive it would not survive');
});

test('knight upcut (QA #62 PR 2): the drawn band under the dashed line (50 px above the floor) is safe, so a hero whose feet are 30 px up is not hit; 60 px up is hit', () => {
  // art.js draws the upcut's dashed line at the box bottom (50 px above the knight's feet) and fills the band below it as safe ground
  for (const [feetUp, hit] of [[30, false], [60, true]]) {
    const game = new Game(() => {}, 42, 'castle'); game.start(); game.state = 'playing'; game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = []; game.player.invulnerable = 0;
    const player = game.player, e = enemy(game, 400, { type: 'knight' });
    Object.assign(e, { dir: 1, cd: 99, heavyCd: 99, tell: 0, recover: 0, move: 'upcut', punishable: false, warn: { kind: 'upcut', box: { x: 410, y: FLOOR - 170, w: 90, h: 120 } } });
    Object.assign(player, { x: 440, y: FLOOR - feetUp, grounded: false, vy: 0, invulnerable: 0, blood: 100 });
    game.knightStrike(e, 20);
    assert.equal(player.blood < 100, hit, `feet ${feetUp} px up: ${hit ? 'hit' : 'safe'}`);
  }
});

test('finisher and i-frame shadow: a bat swoops at a hero left on little blood whatever the moment; a light does not land in the i-frames just before another enemy\'s heavy, nor a heavy just after a light', () => {
  const mk = blood => { const c = brainFoe('bat', 100, { floor: 6 }); c.e.speed = 0; c.e.cd = 99; c.e.crossCd = 99; lull(c.game); c.e.y = c.player.y - 34; c.e.cd = 0; c.e.mixT = 99; c.player.dir = 1; c.player.blood = blood; return c; };
  const low = mk(30); advance(low.game, APEX_REACT + .1); assert.ok(low.e.tell > 0 || evs(low.events, 'enemyTell').some(ev => ev.kind === 'swoop'), 'a wounded hero is swooped at though it faces the bat');
  const high = mk(120); advance(high.game, APEX_REACT + .1); assert.ok(!(high.e.tell > 0), 'a healthy hero facing the bat is not');
  const c = brainFoe('spear', 200, { floor: 4 }); const kn = enemy(c.game, c.player.x + 260, { type: 'knight', hp: 1e5 }); Object.assign(kn, { heavy: true, heavyKind: 'greatswing', tell: .5 });
  assert.equal(c.game.canStrike(c.e, .6), false, 'a light landing in the 0.8 s before the heavy\'s contact waits');
  assert.equal(c.game.canStrike(c.e, 1.5), true, 'a light that lands well after the heavy is fine');
  const h = brainFoe('knight', 200, { floor: 8 }); const sp = enemy(h.game, h.player.x + 260, { type: 'spear', hp: 1e5 }); Object.assign(sp, { tell: .3, warn: { kind: 'thrust', box: { x: 0, y: 0, w: 1, h: 1 } } });
  assert.equal(h.game.canStrike(h.e, .85, 'heavy'), false, 'a heavy whose contact falls within 0.8 s after a light\'s contact waits');
});

test('PR 2 review fixes: a herd never overwrites a pincer, a knight charge is not a shield habit, a deflected swing gives no MP, the riposte and the bat read the snapshot, the bot notices the parry pose after its reaction delay', () => {
  const hd = brainFoe('bat', 200, { floor: 8 }); const sp = enemy(hd.game, hd.player.x + 130, { type: 'spear', hp: 1e5 }); Object.assign(sp, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); hd.e.speed = 0; hd.e.cd = 99; lull(hd.game);
  Object.assign(sp, { tell: .3, token: 'light', warn: { kind: 'thrust', box: { x: sp.x - 194, y: sp.y - 54, w: 184, h: 54 } } }); hd.e.heavyCd = 0; const keep = { tactic: 'pincer', lead: sp, partner: sp, armed: true, fired: false };
  hd.game.pair = keep; hd.game.update(1 / 120, {}); assert.equal(hd.game.pair, keep, 'a running pincer is not replaced'); assert.ok(!hd.e.heavy, 'and the bat does not dive into it');
  const kc = brainFoe('knight', 300, { floor: 8 }); kc.game.habits.shield = []; Object.assign(kc.e, { heavy: true, heavyKind: 'rush', warn: { kind: 'rush', box: { x: 0, y: 0, w: 1, h: 1 }, to: 0 }, tell: .001 }); advance(kc.game, .05);
  assert.deepEqual(kc.game.habits.shield, [], 'the knight charge does not teach the shield habit');
  const dm = brainFoe('knight', 90, { floor: 7 }); dm.e.speed = 0; dm.e.cd = 99; dm.e.heavyCd = 99; lull(dm.game); dm.player.dir = 1;
  for (let i = 0; i < 20; i++) { Object.assign(dm.player, { combo: 1, attack: .03, comboWindow: .8 }); dm.game.update(1 / 120, {}); } dm.player.attack = 0; assert.ok(dm.e.parryT > 0);
  dm.player.mp = 10; dm.player.attackCd = 0; dm.game.attack(); assert.ok(evs(dm.events, 'parry').length >= 1, 'the swing was deflected'); assert.equal(dm.player.mp, 10, 'and gave no MP');
  const sn = brainFoe('knight', 300, { floor: 7 }); sn.e.speed = 0; sn.e.cd = 0; sn.e.heavyCd = 99; lull(sn.game); sn.e.cd = 0; sn.player.x = sn.e.x - 40; sn.game.update(1 / 120, {});
  assert.ok(!(sn.e.tell > 0), 'a hero that teleported next to the knight this frame is not yet seen'); advance(sn.game, APEX_REACT + .1); assert.ok(sn.e.tell > 0, 'seen 0.12 s later');
  const bt = brainFoe('bat', 100, { floor: 6 }); bt.e.speed = 0; bt.e.cd = 99; bt.e.crossCd = 99; lull(bt.game); bt.e.y = bt.player.y - 34; bt.e.cd = 0; bt.e.mixT = 99; bt.player.dir = 1; bt.game.update(1 / 120, {}); bt.player.dir = -1; bt.game.update(1 / 120, {});
  assert.ok(!(bt.e.tell > 0), 'the hero turning its back this frame is not yet seen'); advance(bt.game, APEX_REACT + .1); assert.ok(bt.e.tell > 0 || evs(bt.events, 'enemyTell').some(ev => ev.kind === 'swoop'), 'seen 0.12 s later');
});

// ---- Brains (#62 PR 3): priest, mage and the seven elite rows ----
test('priest: recoil + bolt at a hero closing within 160 px, the bolt aim fixed at tell start; bless goes to the ally being hit (Hierophant: the lowest posture); rite at the landing', () => {
  const r = brainFoe('priest', 140, { floor: 6 }); r.e.speed = 0; r.e.cd = 99; r.e.recoilCd = 0; lull(r.game, .3); r.e.cd = 99; r.e.recoilCd = 0; r.e.mixT = 99;
  const x0 = r.e.x; advance(r.game, .3, { right: true });
  assert.ok(evs(r.events, 'enemyRecoil').length >= 1, 'a backstep (no hitbox)'); advance(r.game, .5, { right: true });
  assert.ok(r.e.x - x0 >= 60, 'it moved away');
  const b = brainFoe('priest', 300, { floor: 6 }); b.e.speed = 0; b.e.cd = 99; lull(b.game); b.e.cd = 0; advance(b.game, APEX_REACT + .05);
  assert.ok(b.e.tell >= .5 && typeof b.e.aim === 'number', 'a bolt with a fixed aim'); const aim = b.e.aim; b.player.x -= 150; advance(b.game, .3); assert.equal(b.e.aim, aim, 'the aim does not follow the hero');
  const bl = brainFoe('priest', 200, { floor: 6 }); const ally = enemy(bl.game, bl.e.x + 60, { type: 'skeleton', hp: 1e5 }), other = enemy(bl.game, bl.e.x - 60, { type: 'skeleton', hp: 1e5 }); bl.game.brainOff = new Set(['skeleton']);
  Object.assign(ally, { cd: 99, action: 1, poiseHit: 1.5 }); Object.assign(other, { cd: 99, action: 1 }); bl.e.speed = 0; bl.e.cd = 99; bl.e.blessCd = 0; lull(bl.game); ally.poiseHit = 1.5; bl.e.blessCd = 0; advance(bl.game, APEX_REACT + .05);
  assert.ok(bl.e.blessRadius > 0 && bl.e.blessTarget === ally, 'the ally being hit is the target');
  const hi = brainFoe('priest', 200, { floor: 6 }); hi.e.twist = 'hierophant'; const a2 = enemy(hi.game, hi.e.x + 60, { type: 'skeleton', hp: 1e5 }), a3 = enemy(hi.game, hi.e.x - 60, { type: 'skeleton', hp: 1e5 }); hi.game.brainOff = new Set(['skeleton']);
  Object.assign(a2, { cd: 99, action: 1, maxPoise: 100, poise: 90 }); Object.assign(a3, { cd: 99, action: 1, maxPoise: 100, poise: 20 }); hi.e.speed = 0; hi.e.cd = 99; hi.e.blessCd = 0; lull(hi.game); a2.poise = 90; a3.poise = 20; hi.e.blessCd = 0; hi.game.update(1 / 120, {});
  assert.equal(hi.e.blessTarget, a3, 'the Hierophant blesses the ally closest to a posture break');
  const rt = brainFoe('priest', 300, { floor: 6 }); rt.e.speed = 0; rt.e.cd = 99; rt.e.heavyCd = 0; rt.e.mixT = 0; rt.player.dashCd = .8; lull(rt.game, .2); rt.player.dashCd = .8; rt.e.cd = 99; advance(rt.game, APEX_REACT + .05);
  const rh = evs(rt.events, 'enemyHeavy').find(ev => ev.kind === 'rite'); assert.ok(rh && rh.variant === 'landing' && rt.e.tell >= .8, 'rite at the landing'); const c = { ...rt.e.warn.circles[0] }; advance(rt.game, .3); assert.deepEqual(rt.e.warn.circles[0], c, 'fixed at tell start');
});

test('mage: highray after a jump habit (80-96 px line), blink + bolt, no bolt while Eclipse is ready within 230 px, crossfire pair obeys the pair limits', () => {
  const hr = brainFoe('mage', 300, { floor: 7 }); hr.e.speed = 0; hr.e.cd = 99; hr.e.heavyCd = 99; lull(hr.game); hr.game.habits.mage = ['jumped', 'jumped']; hr.e.heavyCd = 0; advance(hr.game, APEX_REACT + .05);
  const hv = evs(hr.events, 'enemyHeavy').find(ev => ev.kind === 'ray'); assert.ok(hv && hv.variant === 'high', 'high ray'); const y = hr.e.warn.line.y1; assert.ok(FLOOR - y >= 80 && FLOOR - y <= 96, `line ${FLOOR - y} px above the floor`); assert.ok(hr.e.tell >= .8);
  const hp = hr.player.blood; hr.player.invulnerable = 0; advance(hr.game, 1.4); assert.equal(hr.player.blood, hp, 'a standing hero (58 tall) is under it');
  const bk = brainFoe('mage', 100, { floor: 7 }); bk.e.speed = 0; bk.e.cd = 99; bk.e.blinkCd = 99; bk.player.blood = 10; lull(bk.game, .2); bk.e.cd = 99; bk.e.blinkCd = 0; const bx = bk.e.x; advance(bk.game, APEX_REACT + .6);
  assert.ok(evs(bk.events, 'enemyBlink').length >= 1 && Math.abs(bk.e.x - bx) > 100, 'blinked away'); assert.ok(evs(bk.events, 'enemyBlinked').length >= 1 && (bk.e.tell > 0 || bk.e.cd > 0), 'the blink ends in a bolt (its cooldown is running)');
  const ec = brainFoe('mage', 200, { floor: 7 }); ec.e.speed = 0; ec.e.cd = 0; ec.e.heavyCd = 99; ec.e.blinkCd = 99; ec.player.blood = 150; lull(ec.game, .2); ec.e.cd = 0; advance(ec.game, APEX_REACT + .1);
  assert.ok(!(ec.e.tell > 0), 'Eclipse ready within 230: no bolt');
  const cf = brainFoe('mage', 300, { floor: 8 }); const sp = enemy(cf.game, cf.player.x + 140, { type: 'spear', hp: 1e5 }); Object.assign(sp, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); cf.e.speed = 0; cf.e.cd = 99; lull(cf.game);
  Object.assign(sp, { tell: .35, token: 'light', warn: { kind: 'thrust', box: { x: sp.x - 194, y: sp.y - 54, w: 184, h: 54 } } }); cf.e.heavyCd = 0; cf.game.pairCd = 0; cf.e.mixT = 99; cf.e.blinkCd = 99; cf.game.update(1 / 120, {});
  assert.ok(cf.game.pair?.tactic === 'crossfire' && cf.e.heavy, 'crossfire'); const gap = cf.e.tell - sp.tell; assert.ok(gap >= .5 && gap <= .8, `gap ${gap}`);
  const no = brainFoe('mage', 300, { floor: 8 }); const sp2 = enemy(no.game, no.player.x + 140, { type: 'spear', hp: 1e5 }); Object.assign(sp2, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); no.e.speed = 0; no.e.cd = 99; lull(no.game);
  Object.assign(sp2, { tell: .35, token: 'light', warn: { kind: 'thrust', box: { x: sp2.x - 194, y: sp2.y - 54, w: 184, h: 54 } } }); no.e.heavyCd = 0; no.e.mixT = 99; no.e.blinkCd = 99; no.game.lastHurt = no.game.time - .2; no.game.update(1 / 120, {});
  assert.ok(!no.game.pair, 'none within 1 s of a hurt');
});

test('prism fan keeps its gaps at least the hero width; shrieker bounce, phalanx, impaler, oathsworn and the i-frame shadow of a flying heavy', () => {
  const pr = brainFoe('mage', 60, { floor: 9 }); pr.e.twist = 'prism'; pr.e.speed = 0; pr.e.cd = 99; pr.e.blinkCd = 99; lull(pr.game, .2); pr.e.cd = 0; pr.player.blood = 10; advance(pr.game, APEX_REACT + .1);
  const ln = pr.e.warn?.lines; assert.ok(ln && ln.length === 3, 'a fan'); const hx = pr.player.x, dist = Math.hypot(hx - ln[0].x1, 0), gap = Math.abs(Math.sin(ln[1].angle - ln[0].angle)) * Math.max(dist, 1);
  assert.ok(gap >= 28, `adjacent lines ${gap.toFixed(0)} px apart at the hero`);
  const ph = brainFoe('shield', 90, { floor: 7 }); ph.e.twist = 'phalanx'; ph.e.braceCd = 99; const al = enemy(ph.game, ph.e.x + 60, { type: 'skeleton', hp: 1e5 }); ph.game.brainOff = new Set(['skeleton']); Object.assign(al, { cd: 99, action: 1 });
  noSwing(ph.e); lull(ph.game); ph.player.dir = 1; for (let i = 0; i < 40; i++) { ph.player.attackCd = .5; advance(ph.game, .01); }
  assert.equal(ph.e.interposing, true, 'the Phalanx steps in front of the nearest ally even when it is not in recovery');
  const ov = brainFoe('knight', 55, { floor: 7 }); ov.e.speed = 0; ov.e.heavyCd = 99; lull(ov.game); ov.e.cd = 0; ov.player.blood = 150;
  for (let i = 0; i < 400 && !(ov.e.tell > 0); i++) ov.game.update(1 / 120, {}); while (ov.e.tell > .02) ov.game.update(1 / 120, {}); advance(ov.game, .03);
  assert.ok(!(ov.e.tell > 0 && ov.e.move === 'overhead'), 'a slash that hurt the hero ends the string (the overhead would land in the i-frames)');
  const fl = brainFoe('spear', 200, { floor: 5 }); const kn = enemy(fl.game, fl.player.x + 260, { type: 'knight', hp: 1e5 }); Object.assign(kn, { heavy: true, heavyKind: 'rush', tell: 0, strikeT: .2 });
  assert.equal(fl.game.canStrike(fl.e, .1), false, 'a light landing in the 0.8 s before a flying heavy\'s hit waits');
  const bs = brainFoe('spear', 200, { floor: 5 }); lull(bs.game); bs.game.projectiles.push({ x: bs.player.x - 250, y: bs.player.y - 30, vx: 250, vy: 0, r: 7, life: 3, damage: 16 });
  assert.equal(bs.game.canStrike(bs.e, 1.3), false, 'a strike landing in the i-frames of a bolt already flying at the hero waits'); assert.equal(bs.game.canStrike(bs.e, 2.5), true, 'one landing after them does not');
});

test('blood curse: a hero hurt by a priest rite or bolt or a mage ray earns no blood for 3 s; a dodged hit curses nothing; it wears off', () => {
  const rite = () => { const c = brainFoe('priest', 200, { floor: 6 }); c.e.speed = 0; c.e.cd = 99; lull(c.game); c.player.blood = 150; Object.assign(c.e, { heavy: true, heavyKind: 'rite', tell: .001, token: 'heavy', warn: { kind: 'rite', circles: [{ x: c.player.x, y: c.player.y, r: 56 }] } }); return c; };
  const a = rite(); advance(a.game, .05); assert.ok(a.game.curseT > 2.5, 'cursed'); assert.ok(evs(a.events, 'curse').length === 1 && evs(a.events, 'curse')[0].enemy === 'priest');
  const b0 = a.player.blood; a.game.gainBlood(10); assert.equal(a.player.blood, b0, 'hits and kills pay nothing while cursed'); advance(a.game, 3.2); a.game.gainBlood(3); assert.ok(a.player.blood > b0 && a.game.curseT === 0, 'and it wears off: blood is paid again');
  const pd = rite(); pd.player.perfect = 1; pd.game.hex('priest'); const pb = pd.player.blood; pd.player.invulnerable = 1; pd.game.perfectDodge(); assert.ok(pd.player.blood > pb && pd.game.curseT > 0, 'a perfect dodge pays its blood through the curse');
  const nm = rite(); nm.player.frenzy = 5; nm.player.weapon = 'heavy'; const d0 = nm.player.debt || 0; advance(nm.game, .05); assert.ok(nm.player.debt > d0 && nm.game.curseT > 0, 'a numb hero (damage goes to debt) is cursed too');
  const d = rite(); d.player.invulnerable = 5; advance(d.game, .05); assert.equal(d.game.curseT, 0, 'a dodged rite curses nothing');
  const bolt = brainFoe('priest', 300, { floor: 6 }); bolt.e.speed = 0; bolt.e.cd = 99; lull(bolt.game); bolt.player.blood = 150; bolt.game.projectiles.push({ x: bolt.player.x - 5, y: bolt.player.y - 30, vx: 250, vy: 0, r: 7, life: 1, damage: 16, hex: true }); advance(bolt.game, .05);
  assert.ok(bolt.game.curseT > 0, 'a priest bolt curses');
  const plain = brainFoe('mage', 300, { floor: 7 }); plain.e.speed = 0; plain.e.cd = 99; lull(plain.game); plain.player.blood = 150; plain.game.projectiles.push({ x: plain.player.x - 5, y: plain.player.y - 30, vx: 250, vy: 0, r: 7, life: 1, damage: 16 }); advance(plain.game, .05); assert.equal(plain.game.curseT, 0, 'a mage bolt does not');
  const ray = brainFoe('mage', 300, { floor: 7 }); ray.e.speed = 0; ray.e.cd = 99; lull(ray.game); ray.player.blood = 150; ray.player.x = ray.e.x - 200; ray.player.y = FLOOR;
  Object.assign(ray.e, { heavy: true, heavyKind: 'ray', strikeT: .1, strikeMax: .15, struck: false, dmg: 100, token: 'heavy', warn: { kind: 'ray', box: { x: ray.e.x - 460, y: FLOOR - 40, w: 440, h: 16 } } }); advance(ray.game, .05);
  assert.ok(ray.game.curseT > 0, 'a mage ray curses');
  const n = new Game(() => {}, 4, 'normal'); n.hex('priest'); assert.equal(n.curseT, 0, 'never in Normal');
});

// QA #62 PR 3 (after 04538f7): the curse gate reads lastHurt === time, which an earlier landed hit in the same frame also satisfies
test('blood curse ends when the hero dies (the death screen shows no curse)', { todo: 'heroDown freezes curseT instead of clearing it, so a cursed death screen keeps the greyed bar and the countdown' }, () => {
  const c = brainFoe('priest', 200, { floor: 6 }); c.e.speed = 0; c.e.cd = 99; lull(c.game); c.player.blood = 150;
  c.game.hex('priest'); assert.ok(c.game.curseT > 2.5, 'cursed');
  c.player.invulnerable = 0; c.player.blood = 1; c.game.hurt(50, 1);
  assert.equal(c.game.state, 'dead', 'the hit killed the hero');
  assert.equal(c.game.curseT, 0, 'the curse ends with the hero');
});

test('blood curse: a rite blocked by i-frames in the same frame as an earlier landed hit starts no curse', { todo: 'hex gate checks lastHurt === time, which a hit that landed earlier in the frame also satisfies; a blocked rite then cursed' }, () => {
  const c = brainFoe('priest', 200, { floor: 6 }); c.e.speed = 0; c.e.cd = 99; lull(c.game); c.player.blood = 150;
  c.game.hurt(10, 1); // a landed hit this frame: the i-frames now cover the rite
  assert.equal(c.game.curseT, 0, 'the plain hit itself does not curse');
  Object.assign(c.e, { heavy: true, heavyKind: 'rite', tell: 0, token: 'heavy', dmg: 100, warn: { kind: 'rite', circles: [{ x: c.player.x, y: c.player.y, r: 56 }] } });
  c.game.heavyStrike(c.e);
  assert.equal(c.game.curseT, 0, 'a rite the i-frames block curses nothing');
});

test('a cover rite is a ground circle and a crossfire ray aims at the landing height, even for an airborne snapshot', () => {
  const mk = type => { const c = brainFoe(type, 300, { floor: 8 }); c.game.escapes = () => true; const sp = enemy(c.game, c.player.x + 140, { type: 'spear', hp: 1e5 }); Object.assign(sp, { dir: -1, action: 1, cd: 99, speed: 0, jabCd: 99 }); c.e.speed = 0; c.e.cd = 99; lull(c.game); c.e.mixT = 99; c.e.blinkCd = 99;
    Object.assign(c.player, { y: FLOOR - 120, vy: 0, grounded: false }); for (let i = 0; i < 20; i++) { Object.assign(c.player, { y: FLOOR - 120, vy: 0, grounded: false }); c.game.update(1 / 120, {}); }
    Object.assign(sp, { tell: .35, token: '', warn: { kind: 'thrust', box: { x: sp.x - 194, y: sp.y - 54, w: 184, h: 54 } } }); c.e.heavyCd = 0; c.game.pairCd = 0; Object.assign(c.player, { y: FLOOR - 120, vy: 0, grounded: false }); c.game.update(1 / 120, {}); return c; };
  const pr = mk('priest'); assert.ok(pr.game.pair, 'cover opened'); assert.equal(pr.e.warn.circles[0].y, FLOOR, 'the circle sits on the floor, not in the air');
  const mg = mk('mage'); assert.ok(mg.game.pair, 'crossfire opened'); assert.ok(Math.abs(mg.e.warn.line.y1 - (FLOOR - 30)) < 1, 'the ray aims at the landing height');
  assert.ok(pr.game.pair || mg.game.pair, 'at least one of the pairs opened for the airborne hero');
});

test('skeleton stat profiles: the normal profile (halved) from floor 1, the old numbers as the enraged profile above floor 100; every other castle regular has 5.3x health; Normal and Endless are untouched', () => {
  const stats = (type, floor) => { const g = new Game(() => {}, 5, 'castle'); g.apex = true; g.floor = floor; g.enemies = []; const e = g.spawnEnemy(type, 900, 0); return { hp: e.hp, dmg: e.damage, poise: e.maxPoise, speed: e.speed }; };
  const n = stats('skeleton', 1), r = stats('skeleton', 101), edge = stats('skeleton', 100);
  assert.deepEqual(edge, n, 'floor 100 is still the normal profile'); assert.equal(apexProfile(100), APEX_PROFILES.normal); assert.equal(apexProfile(101), APEX_PROFILES.enraged);
  assert.deepEqual(r, { hp: 528, dmg: 80, poise: 720, speed: 180 }, 'the enraged profile reproduces the old x9.6 / x8 / x12 / x2.5 numbers');
  assert.deepEqual(n, { hp: Math.round(55 * 4.8), dmg: 40, poise: 360, speed: 90 }, 'normal: hp x4.8, light damage x4, posture x6, speed x1.25');
  const base = { shield: 60, spear: 53, bat: 27, knight: 65, priest: 54, mage: 55 };
  for (const [type, hp] of Object.entries(base)) { const got = stats(type, 1).hp; assert.ok(Math.abs(got - hp * CASTLE_HP_MUL) <= 1.5, `${type}: ${got} vs ${hp * CASTLE_HP_MUL}`); }
  assert.ok(stats('bat', 1).hp < stats('priest', 1).hp && stats('priest', 1).hp < stats('knight', 1).hp, 'identity kept: bat most fragile, knight toughest');
  const off = new Game(() => {}, 5, 'castle'); off.apex = false; off.enemies = []; assert.equal(off.spawnEnemy('knight', 900, 0).hp, 65, 'apex off: the #50 numbers');
  for (const mode of ['normal', 'endless']) { const g = new Game(() => {}, 5, mode); g.enemies = []; assert.equal(g.spawnEnemy('knight', 900, 0).hp, Math.round(65 * (mode === 'endless' ? floorScale(g.floor).hp : 1)), `${mode}: unchanged`); }
  const w = new Game(() => {}, 5, 'castle'); w.apex = true; w.enemies = []; const wd = w.spawnWarden(1400); assert.equal(wd.hp, 520, 'the Warden is unchanged');
  const k = new Game(() => {}, 5, 'castle'); k.apex = true; k.enemies = []; const kg = k.spawnKing(1400); assert.equal(kg.hp, KING_HP, 'the King is unchanged');
});
