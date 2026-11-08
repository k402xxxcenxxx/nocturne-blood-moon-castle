import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';
import { advance, airborne, arena, boss, castle, enemy, fires, frenzied, heavyFoe, heavyStrikes, hit, holders, hp, kHit, kingFight, ledge, lightFoe, runTo, swings, sword, tellOf, toll, warden, wardenP2 } from './helpers.js';

// ---- Castle Descent (#44 step 1) ----
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
  assert.equal(player.damage, 34, 'relic damage is gone');
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
test('warden: floor 10 is the Warden alone in the boss arena, with its base stats and fresh fight stats', () => {
  const { game } = castle(42, 9);
  game.finishStage(); game.chooseRelic(game.choices[0].id);
  assert.equal(game.floor, WARDEN_FLOOR); assert.equal(game.state, 'playing');
  assert.equal(game.enemies.length, 1);
  const b = game.enemies[0];
  assert.ok(b.warden && b.required);
  assert.deepEqual([b.maxHp, b.speed, b.superArmor, b.superArmorMax], [WARDEN_HP, 75, ARMOR_MAX, 100]);
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
  assert.ok(b.hp < WARDEN_HP); assert.equal(b.stun, 0); assert.ok(b.tell > 0 && b.tell <= tell); assert.equal(b.poise, 1);
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
  hit(game, b, WARDEN_HP / 2 - 1); assert.equal(b.bossPhase, 1);
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
  hit(game, b, WARDEN_HP / 2);
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
  assert.equal(game.state, 'playing'); assert.equal(game.floor, 11, 'the second Vigil descends to the Belfry (#69)'); assert.equal(game.stage, 2);
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
  assert.equal(game.state, 'sliceEnd'); assert.equal(game.floor, KEEPER_FLOOR);
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
  assert.equal(game.setWeapon('spear'), true); game.floor = KEEPER_FLOOR; game.enterVigil(); assert.equal(game.vigil, 3); game.descend(); assert.equal(game.state, 'sliceEnd'); // the slice ends after the third Vigil
  assert.equal(game.challengeKing(), true);
  assert.equal(game.state, 'playing'); assert.equal(game.floor, KING_FLOOR); assert.equal(game.player.blood, 100); assert.equal(game.player.frenzy, false);
  assert.equal(game.player.weapon, 'spear'); assert.deepEqual(game.relics, ['edge']);
  assert.ok(game.enemies[0].king); assert.equal(events.filter(e => e.type === 'stage').at(-1).floor, KING_FLOOR);
  game.player.invulnerable = 0; game.hurt(500, 1, false, true);
  assert.equal(game.state, 'dead'); assert.equal(events.filter(e => e.type === 'fightStats').at(-1).won, false);
  assert.equal(game.leaveKing(false), true);
  assert.equal(game.state, 'sliceEnd'); assert.equal(game.floor, KEEPER_FLOOR); assert.equal(events.filter(e => e.type === 'sliceEnd').at(-1).king, 'dead');
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
