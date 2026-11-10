import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';
import { SEEDS, advance, boss, castle, castleFloorsHash, enemy, evs, hit, hourTypes, hp, kingBrainArena, modesHash, ranged, toll, until, warden, wardenBrainArena } from './helpers.js';

// --- Situational slow motion (#53): the events and the read-only threat query ---
test('slow motion events: stagger.cancelled is true only when a tell or a contact was cancelled (not in a walk or a recovery)', () => {
  const run = prep => { const { game, player, events } = castle(42, 1); const e = enemy(game, player.x + 60); Object.assign(e, { maxPoise: 50, poise: 1, cd: 99 }); prep(e); game.damageEnemy(e, 1, 1, false, false, false, 10); return events.find(ev => ev.type === 'stagger'); };
  assert.equal(run(e => { e.tell = .4; e.warn = { kind: 'slash' }; }).cancelled, true, 'a tell');
  assert.equal(run(e => { e.strikeT = .1; }).cancelled, true, 'a contact in progress');
  assert.equal(run(e => {}).cancelled, false, 'walking');
  assert.equal(run(e => { e.recover = .5; e.punishable = true; }).cancelled, false, 'a recovery');
});

test('slow motion events: Eclipse emits one interrupt per cancelled wind-up with heavy set right, none for an idle enemy', () => {
  const cast = prep => { const { game, player, events } = castle(42, 1); player.blood = 150; player.magicCd = 0; const e = enemy(game, player.x + 80); Object.assign(e, { cd: 99 }); prep(e); game.magic(); return evs(events, 'interrupt'); };
  const light = cast(e => { e.tell = .4; e.warn = { kind: 'slash' }; }); assert.equal(light.length, 1); assert.equal(light[0].heavy, false); assert.equal(light[0].enemy, 'skeleton');
  const heavy = cast(e => { e.tell = .6; e.heavy = true; e.heavyKind = 'cleave'; e.warn = { kind: 'cleave' }; }); assert.equal(heavy.length, 1); assert.equal(heavy[0].heavy, true);
  assert.equal(cast(e => {}).length, 0, 'an idle enemy is not interrupted');
});

test('slow motion events: perfectDash carries heavy when the dodged hit was a heavy', () => {
  const dodge = heavy => { const { game, player, events } = castle(42, 1); Object.assign(player, { perfect: .15, perfectUsed: false, otherInv: 0, invulnerable: .2 }); game.hurt(heavy ? 100 : 10, 1, false, heavy); return evs(events, 'perfectDash'); };
  assert.equal(dodge(true)[0].heavy, true); assert.equal(dodge(false)[0].heavy, false);
  const toll = castle(42, 10), w = toll.game.spawnWarden(1200); Object.assign(toll.player, { perfect: .15, perfectUsed: false, otherInv: 0, invulnerable: .2 }); toll.game.wardenToll(w); assert.equal(evs(toll.events, 'perfectDash')[0].heavy, true, 'the Gate Toll is a heavy');
});

test('threatIn: Infinity with nothing coming; 0.4 s before an attack\'s contact; 0 once one is in progress; projectiles, rings and a flood count; it reads and changes nothing', () => {
  const { game, player } = castle(42, 1); assert.equal(game.threatIn(), Infinity);
  const e = enemy(game, player.x + 80); e.cd = 99; e.tell = 1; assert.ok(Math.abs(game.threatIn() - .6) < 1e-9, 'tell 1.0 -> 0.6 s');
  e.tell = .3; assert.equal(game.threatIn(), 0, 'inside the last 0.4 s'); e.tell = 0; e.strikeT = .1; assert.equal(game.threatIn(), 0, 'a contact in progress'); e.strikeT = 0;
  game.projectiles.push({ x: player.x - 414, y: player.y - 30, vx: 200, vy: 0, r: 7, life: 5, damage: 10 }); assert.ok(Math.abs(game.threatIn() - ((414 - 7 - player.w / 2) / 200 - .4)) < 1e-9, 'a bolt 0.4 s before it arrives');
  game.projectiles[0].vx = -200; assert.equal(game.threatIn(), Infinity, 'a bolt flying away'); game.projectiles = [];
  game.rings.push({ x: player.x - 420 - 29, dir: 1, kind: 'low', wait: 0, dist: 0, hit: false, top: 0, bottom: 0 }); assert.ok(Math.abs(game.threatIn() - (1 - .4)) < 1e-9, 'a ring 1.0 s away'); game.rings = [];
  game.flood = { tell: 1.2, life: 4, live: false }; assert.ok(Math.abs(game.threatIn() - .8) < 1e-9); game.flood.live = true; assert.equal(game.threatIn(), 0); game.flood = null;
  const a = castle(7, 1), b = castle(7, 1); for (const t of [a, b]) { const x = enemy(t.game, t.player.x + 80); x.tell = .9; x.cd = 99; t.game.projectiles.push({ x: t.player.x - 300, y: 0, vx: 100, vy: 0, r: 5, life: 9, damage: 1 }); }
  const snap = JSON.stringify([a.game.enemies, a.game.projectiles, a.game.player, a.game.time]); for (let i = 0; i < 5; i++) a.game.threatIn();
  assert.equal(JSON.stringify([a.game.enemies, a.game.projectiles, a.game.player, a.game.time]), snap, 'no state changes'); assert.equal(a.game.rand(), b.game.rand(), 'the seeded stream is untouched');
});

test('threatIn counts the brain heavies, the Warden\'s tell and a husk or guard tell', () => {
  const w = wardenBrainArena(1100, 1300); w.game.wardenStart(w.b, 'greatToll'); assert.ok(Math.abs(w.game.threatIn() - (w.b.tell - .4)) < 1e-9);
  const k = kingBrainArena(1500, 1700); k.game.kingStart(k.k, 'judgement'); assert.ok(Math.abs(k.game.threatIn() - (k.k.tell - .4)) < 1e-9);
  const { game, player } = castle(42, 8, true); const g = enemy(game, player.x + 90, { type: 'knight' }); Object.assign(g, { heavy: true, heavyKind: 'greatswing', tell: 1, cd: 99 }); assert.ok(Math.abs(game.threatIn() - .6) < 1e-9);
});

test('threatIn ignores a single-hit attack whose contact is over (struck), but still counts a charge that can hit and an unstruck contact', () => {
  const { game, player } = castle(42, 1); const e = enemy(game, player.x + 80); e.cd = 99;
  e.strikeT = .2; e.struck = false; assert.equal(game.threatIn(), 0, 'a live contact'); e.struck = true; assert.equal(game.threatIn(), Infinity, 'a dodged contact is over');
  e.strikeT = 0; e.travel = .3; assert.equal(game.threatIn(), 0, 'a charge in flight can still hit');
});

// --- The Timeless Belfry frame (#69 PR 1) ---
test('belfry frame: castle floors 1-10 replay bit-for-bit (the golden is from main before #69)', () => {
  assert.equal(castleFloorsHash(), '271f98ecc1bfcfce'); // re-recorded when the greatsword got its wind-up: the hash replays one heavy run
});

test('belfry frame: floors 1-20 in order, rooms, required guards, portals, relic picks, the Vigils and the slice end', () => {
  const events = [], game = new Game(e => events.push(e), 42, 'castle'); game.start(); assert.equal(game.vigil, 1); game.setWeapon('spear'); assert.equal(game.descend(), true);
  const picks = [], vigils = [];
  const clear = () => { for (const e of game.enemies) if (e.required) e.hp = 0; game.update(1 / 60, {}); };
  assert.equal(SLICE_FLOORS, 20); assert.deepEqual(CASTLE_PICKS, [3, 6, 9, 13, 16, 19]); assert.equal(KEEPER_FLOOR, 20); assert.equal(BELFRY_FROM, 11); assert.equal(KING_FLOOR, 50);
  for (let f = 1; f <= 20; f++) {
    assert.equal(game.state, 'playing', `floor ${f}`); assert.equal(game.floor, f); assert.ok(game.tier <= 4 && game.tier === Math.min(4, (f - 1) >> 1), `tier ${game.tier} on ${f}`);
    if (f === WARDEN_FLOOR || f === KEEPER_FLOOR) { // the boss slot: the Warden's gate until the Keeper lands
      assert.equal(game.enemies.length, 1); assert.ok(game.enemies[0].warden && game.enemies[0].required, `boss floor ${f}`); assert.equal(game.worldWidth, 2800);
      assert.equal(game.stage, f === KEEPER_FLOOR ? 2 : 0, 'the Keeper slot has Belfry art');
      assert.equal(game.portalOpen, false); game.damageEnemy(game.enemies[0], 99999, 1, false, false); advance(game, 1.8);
      assert.equal(game.state, 'rest'); vigils.push(game.vigil); assert.equal(game.vigil, f === KEEPER_FLOOR ? 3 : 2); assert.deepEqual(game.relics.length, picks.length, 'relics stay'); assert.equal(game.player.blood, 100);
      if (f === WARDEN_FLOOR) { assert.equal(game.setWeapon('twin'), true); assert.equal(game.descend(), true); continue; }
      assert.equal(game.descend(), true); assert.equal(game.state, 'sliceEnd'); assert.equal(evs(events, 'sliceEnd').length, 1); break;
    }
    const belfry = f >= BELFRY_FROM; assert.equal(game.stage, belfry ? 2 : 0, `stage index on ${f}`);
    assert.equal(game.enemies.filter(e => e.required).length, 2, 'the last two are the required guards'); assert.equal(game.chests.length, 0, 'no chests');
    const expected = f <= 3 ? 5 : f >= 17 ? 7 : f >= BELFRY_FROM ? 6 : f >= 8 ? 7 : 6; assert.equal(game.enemies.length, expected + (f >= 8 && f !== 12 && f !== 13 ? 1 : 0), `floor ${f}: the plan plus the bonus elite from floor 8 (none on the Gargoyle and Pendulum teaching floors 12-13)`);
    assert.equal(game.portalOpen, false); clear(); assert.equal(game.portalOpen, true, `the portal opens on ${f}`);
    game.finishStage();
    if (CASTLE_PICKS.includes(f)) { assert.equal(game.state, 'upgrade', `a relic pick after ${f}`); picks.push(f); game.chooseRelic(game.choices[0].id); } else assert.equal(game.state, 'playing', `no pick after ${f}`);
  }
  assert.deepEqual(picks, [3, 6, 9, 13, 16, 19]); assert.deepEqual(vigils, [2, 3]); assert.equal(game.relics.length, 6);
});

test('belfry frame: a death on floors 11-20 returns to the second Vigil with the relics from floor 11; floors 1-10 and 50 are unchanged', () => {
  const mk = () => { const g = new Game(() => {}, 7, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.relics = ['edge', 'reach']; g.floor = WARDEN_FLOOR; g.enterVigil(); assert.equal(g.vigil, 2); g.descend(); return g; };
  for (const f of [11, 13, 19, 20]) {
    const g = mk(); g.relics.push('haste'); g.loadFloor(f); g.state = 'dead'; g.player.blood = 0; assert.equal(g.returnToVigil2(), true, `death on ${f}`);
    assert.equal(g.state, 'rest'); assert.equal(g.vigil, 2); assert.deepEqual(g.relics, ['edge', 'reach'], 'relics from when floor 11 began'); assert.equal(g.player.blood, 100); assert.equal(g.player.debt, 0);
    assert.equal(g.setWeapon('twin'), true); assert.equal(g.descend(), true); assert.equal(g.floor, 11); assert.equal(g.state, 'playing');
  }
  for (const f of [1, 5, WARDEN_FLOOR, KING_FLOOR]) { const g = mk(); g.loadFloor(f); g.state = 'dead'; assert.equal(g.returnToVigil2(), false, `floor ${f} keeps its old return`); }
  const alive = mk(); alive.loadFloor(12); assert.equal(alive.returnToVigil2(), false, 'only a dead hero');
  const normal = new Game(() => {}, 1, 'normal'); normal.state = 'dead'; normal.floor = 12; assert.equal(normal.returnToVigil2(), false);
  const first = new Game(() => {}, 3, 'castle'); first.start(); first.setWeapon('spear'); first.descend(); first.relics = ['edge']; first.loadFloor(5); first.state = 'dead'; first.enterRest(); assert.deepEqual(first.relics, [], 'the first Vigil still clears relics');
});

test('belfry frame: leaveKing returns to floor 20, the Belfry placeholder cast is built from existing enemies with brains, and Normal and Endless never see any of it', () => {
  const g = new Game(() => {}, 4, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.challengeKing = Game.prototype.challengeKing; g.state = 'sliceEnd'; assert.equal(g.challengeKing(), true); g.state = 'dead'; assert.equal(g.leaveKing(false), true); assert.equal(g.floor, KEEPER_FLOOR); assert.equal(g.state, 'sliceEnd');
  const types = new Set(); for (let seed = 1; seed <= 12; seed++) for (const f of [11, 14, 17, 19]) { const b = new Game(() => {}, seed, 'castle'); b.start(); b.setWeapon('spear'); b.descend(); b.loadFloor(f); for (const e of b.enemies) types.add(e.type); const ranged = b.enemies.filter(e => e.type === 'priest' || e.type === 'mage').length; assert.ok(ranged <= 2, `at most 2 ranged on ${f}`); assert.ok(b.enemies.some(e => e.type === 'bat')); }
  assert.ok([...types].every(t => ['skeleton', 'shield', 'spear', 'knight', 'bat', 'priest', 'mage'].includes(t)), [...types].join());
  assert.equal(modesHash(), '51cf5fb532e28223', 'Normal and Endless replay bit-for-bit (golden from main before #69)');
});

test('belfry frame: floor 11 scales nothing that floor 9 does not (trap damage, barricade HP, cooldown fallbacks), while Normal keeps its stage scaling', () => {
  const at = f => { const g = new Game(() => {}, 5, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.loadFloor(f); g.brainOff = new Set(['spear', 'skeleton']); return g; };
  const nine = at(9), eleven = at(11), nineteen = at(19);
  for (const g of [eleven, nineteen]) {
    assert.equal(g.stage, 2); assert.equal(g.scaleStage, 0, 'the Belfry art index scales nothing'); assert.equal(g.tier, nine.tier);
    assert.ok(g.traps.length > 0 && g.traps.every(t => t.damage === 10), 'trap damage like floor 9 (10)'); assert.ok(g.obstacles.filter(o => o.kind === 'barricade').every(o => o.hp === 38), 'barricade HP like floor 9');
    assert.equal(g.lightCd({ type: 'orc' }), nine.lightCd({ type: 'orc' })); assert.equal(g.spearCd(), nine.spearCd());
  }
  assert.ok(nine.traps.every(t => t.damage === 10));
  const normal = new Game(() => {}, 5, 'normal'); normal.loadStage(2); assert.equal(normal.scaleStage, 2); assert.ok(normal.traps.every(t => t.damage > 10), 'Normal still scales by stage');
});

// ---- The Stopped Hour and the Echo (#69 PR 2) ----
test('the Hour runs only on castle floors 11-19: warn, toll and resume on the clock', () => {
  const { game, events } = castle(7, BELFRY_FROM);
  game.player.blood = 60;
  advance(game, HOUR_PERIOD - HOUR_WARN - .1);
  assert.deepEqual(hourTypes(events), []);
  advance(game, .2);
  assert.deepEqual(hourTypes(events), ['warn']);
  advance(game, HOUR_WARN + .05);
  assert.deepEqual(hourTypes(events), ['warn', 'stop']);
  assert.equal(game.hour.awake, false);
  advance(game, STILL + .05);
  assert.deepEqual(hourTypes(events), ['warn', 'stop', 'resume']);
  assert.equal(game.hour.still, 0);
  for (const floor of [1, 10, KEEPER_FLOOR]) {
    const c = castle(7, floor); c.game.player.blood = 60; advance(c.game, HOUR_PERIOD + 2);
    assert.equal(c.game.hour.on, false); assert.deepEqual(hourTypes(c.events), []);
  }
  for (const mode of ['normal', 'endless']) {
    const events2 = []; const g = new Game(e => events2.push(e), 3, mode); g.start(); g.state = 'playing';
    advance(g, HOUR_PERIOD + 2); assert.equal(g.hour.on, false); assert.deepEqual(hourTypes(events2), []);
  }
});

test('the Hour clock waits during hit-stop and picks; a stilled hero ignores input and nothing hurts it', () => {
  const { game, player } = castle(7, BELFRY_FROM);
  game.hour.t = 5; game.freeze = .5; advance(game, .3);
  assert.equal(game.hour.t, 5);
  game.freeze = 0;
  const e = enemy(game, player.x + 30); e.tell = .2; e.cd = 5;
  toll(game, 60);
  const t0 = e.tell, x0 = player.x, blood = player.blood, time = game.time;
  advance(game, .6, { right: true, attack: true, jump: true });
  assert.equal(e.tell, t0); assert.equal(player.x, x0); assert.equal(player.attack, 0); assert.equal(player.jumps, 0);
  assert.equal(player.blood, blood); assert.equal(game.time, time);
  advance(game, STILL);
  assert.equal(game.hour.still, 0);
});

test('the resume grace pushes an imminent contact back to STILL_GRACE', () => {
  const { game, player } = castle(7, BELFRY_FROM);
  const e = enemy(game, player.x + 30); e.tell = .1; e.cd = 5;
  const far = enemy(game, player.x + 400); far.tell = 1.2; far.cd = 5;
  toll(game, 60); while (game.hour.still > 0) game.update(1 / 120, {}); // stop on the resume frame
  assert.ok(e.tell >= STILL_GRACE - 1 / 120 - 1e-9, `tell ${e.tell}`);
  assert.ok(far.tell > 1.1);
});

test('an awake hero acts, the field stays frozen, and every swing is replayed as a box that hurts only the hero once', () => {
  const { game, player, events } = castle(7, BELFRY_FROM);
  const target = enemy(game, player.x + 60, { hp: 900 }); target.cd = 5; target.tell = 0;
  toll(game, 150);
  assert.equal(game.hour.awake, true);
  const hp = target.hp, ex = target.x, gx = player.x, cd = target.cd;
  advance(game, .1, { attack: true });
  assert.ok(target.hp < hp, 'the hit lands in the Hour'); assert.equal(target.x, ex); assert.equal(target.cd, cd);
  const rec = events.filter(e => e.type === 'echo' && e.state === 'record');
  assert.ok(rec.length >= 1);
  const box = game.echo.list[0].boxes[0], snapshot = JSON.stringify(box);
  advance(game, STILL);
  assert.equal(game.hour.still, 0); assert.ok(game.echo.armed);
  assert.equal(JSON.stringify(game.echo.list[0].boxes[0]), snapshot, 'the box stays where it was swung');
  target.hp = 0; // keep the field quiet
  game.enemies = [];
  player.x = gx; player.invulnerable = 0; const before = player.blood;
  advance(game, ECHO_DELAY - .3);
  assert.equal(player.blood, before, 'nothing before the delay');
  advance(game, .6);
  assert.ok(player.blood < before, 'the Echo struck');
  const hurts = events.filter(e => e.type === 'hurt' && e.amount === ECHO_DAMAGE).length;
  assert.ok(hurts >= 1 && hurts <= rec.length, 'at most one hit per recorded swing');
  advance(game, 3);
  assert.ok(events.some(e => e.type === 'echo' && e.state === 'end')); assert.equal(game.echo.list.length, 0);
});

test('i-frames avoid the Echo, a lethal Echo reports death cause echo', () => {
  const a = castle(7, BELFRY_FROM); a.game.enemies = [];
  toll(a.game, 150); advance(a.game, .05, { attack: true }); advance(a.game, STILL);
  a.player.invulnerable = 5; const blood = a.player.blood;
  advance(a.game, ECHO_DELAY + 1);
  assert.equal(a.player.blood, blood);
  const b = castle(7, BELFRY_FROM); b.game.enemies = [];
  toll(b.game, 150); advance(b.game, .05, { attack: true }); advance(b.game, STILL);
  b.player.blood = 5; advance(b.game, ECHO_DELAY + 1);
  assert.equal(b.game.state, 'dead');
  assert.equal(b.events.find(e => e.type === 'death').cause, 'echo');
});

test('the Hour and the Echo are deterministic for a seed', () => {
  const run = () => {
    const { game, player } = castle(11, BELFRY_FROM); const e = enemy(game, player.x + 60, { hp: 900 });
    toll(game, 150); advance(game, .5, { attack: true }); advance(game, STILL + 3);
    return JSON.stringify([game.echo, game.hour, player.blood, e.hp, game.time]);
  };
  assert.equal(run(), run());
});

test('the resume grace: a frozen projectile and a live strike cannot hurt the hero for STILL_GRACE s', () => {
  const { game, player } = castle(7, BELFRY_FROM);
  toll(game, 60);
  game.projectiles.push({ x: player.x + 5, y: player.y - 20, vx: 0, vy: 0, r: 8, damage: 10, life: 9 });
  const e = enemy(game, player.x + 20); e.cd = 99; e.strikeT = 1; e.strikeMax = 1; e.struck = false; e.heavy = true; e.heavyKind = 'rush'; e.from = { x: e.x, y: e.y }; e.warn = { to: e.x }; e.dmg = 10;
  while (game.hour.still > 0) game.update(1 / 120, {});
  const blood = player.blood;
  game.hurt(10, 1); // a direct enemy hit inside the grace is refused
  advance(game, STILL_GRACE - .06);
  assert.equal(player.blood, blood); assert.ok(game.projectiles.length >= 1, 'the projectile is not consumed');
  advance(game, .3);
  assert.ok(player.blood < blood || game.projectiles.length === 0, 'it can hit after the grace');
});

test('a strike pushed back by the resume grace still hurts a hero in range afterwards', () => {
  const { game, player } = castle(7, BELFRY_FROM);
  const e = enemy(game, player.x + 30); e.tell = .1; e.cd = 5;
  toll(game, 60); while (game.hour.still > 0) game.update(1 / 120, {});
  const blood = player.blood;
  advance(game, .3); assert.equal(player.blood, blood, 'nothing inside the grace');
  advance(game, .4); assert.ok(player.blood < blood, 'the pushed strike lands');
});

test('the first Echo replay comes ECHO_DELAY after the resume, however late in the Hour it was swung', () => {
  const { game, player, events } = castle(7, BELFRY_FROM);
  game.enemies = [];
  toll(game, 150);
  advance(game, .8); // swing late in the Hour
  advance(game, .1, { attack: true });
  assert.ok(game.echo.list.length >= 1);
  advance(game, STILL); // past the resume
  const resumeAt = events.findIndex(e => e.type === 'hour' && e.state === 'resume');
  assert.ok(resumeAt >= 0);
  assert.equal(game.echo.list[0].off, 0, 'the first recorded swing is rebased to the resume');
  assert.ok(game.echo.list.every((g, i, a) => i === 0 || g.off >= a[i - 1].off), 'recorded order and spacing kept');
});

// --- Gargoyle and Pendulum Blade (#69 PR 3) ---
const bel = (type, hx, ex, floor = 12, o = {}) => { const t = castle(42, floor, true); const e = enemy(t.game, ex, { type, hp: 5000, ...o }); Object.assign(t.player, { x: hx, dir: 1, hp: 1e5, maxHp: 1e5, blood: 150 }); e.cd = 99; t.game.snaps = []; return { ...t, e }; };
const perch = (game, e, rise = 100) => { const pl = game.makePlatform(e.x - 100, FLOOR - rise, 200, 'x', 'y'); game.platforms.push(pl); Object.assign(e, { plat: pl, y: pl.y }); return pl; };

test('floors 12-13: the Gargoyle and Pendulum rows, perches on static platforms, never a gate guard, no elites', () => {
  for (const seed of SEEDS) {
    const mk = f => { const g = new Game(() => {}, seed, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.loadFloor(f); return g; }, g12 = mk(12), g13 = mk(13);
    for (const g of [g12, g13]) { assert.equal(g.enemies.length, 6); assert.ok(!g.enemies.some(e => e.elite)); assert.ok(g.enemies.filter(e => e.required).every(e => e.type !== 'gargoyle'), 'never a guard'); }
    assert.equal(g12.enemies.filter(e => e.type === 'gargoyle').length, 2); assert.equal(g12.enemies[1].type, 'gargoyle'); assert.equal(g12.enemies[3].type, 'gargoyle');
    assert.equal(g13.enemies.filter(e => e.type === 'pendulum').length, 2); assert.equal(g13.enemies[1].type, 'gargoyle'); assert.ok(g13.enemies.filter(e => e.type === 'pendulum' && e.required).length <= 1);
    for (const e of [...g12.enemies, ...g13.enemies].filter(e => e.type === 'gargoyle')) assert.ok(e.plat && !e.plat.moving && e.y === e.plat.y, 'perched on a static platform');
    assert.equal(new Set(g12.enemies.filter(e => e.type === 'gargoyle').map(e => e.plat)).size, 2, 'one gargoyle per perch');
    assert.ok(![...g12.enemies, ...g13.enemies].some(e => e.type === 'priest' || e.type === 'mage' || e.type === 'knight'));
  }
});

test('gargoyle: stone while watched (0.15 s), hits clink (x0.2, 1 blood, recoil), hit 3 and a plunge crack the shell, it wakes 0.25 s after the hero looks away', () => {
  const { game, player, events, e } = bel('gargoyle', 400, 700);
  advance(game, .1); assert.equal(e.stone, false, 'not yet'); advance(game, .2); assert.equal(e.stone, true, 'watched');
  const hp0 = e.hp, cd0 = player.attackCd; game.damageEnemy(e, 100, 1, false, false, false, 17);
  assert.equal(hp0 - e.hp, 20, 'x0.2 damage'); assert.ok(player.attackCd >= cd0 + .15 - 1e-9, 'the swing recoils'); assert.equal(evs(events, 'stoneClink').length, 1); assert.equal(e.stone, true);
  player.x = e.x - 60; const b0 = player.blood; game.attack(); advance(game, .4); assert.equal(player.blood, b0 - 2 + 1, 'a clink gives 1 blood (the swing costs 2)');
  game.damageEnemy(e, 100, 1, false, true, false, 62); // hit 3
  assert.equal(e.stone, false); assert.ok(e.recover >= .79 && e.punishable, 'a punishable stun'); assert.equal(evs(events, 'shellBreak').length, 1);
  const p2 = bel('gargoyle', 400, 700); advance(p2.game, .4); assert.equal(p2.e.stone, true); p2.game.damageEnemy(p2.e, 10, 1, false, false, false, 45); assert.equal(p2.e.stone, false, 'a plunge cracks it');
  const w = bel('gargoyle', 400, 700); advance(w.game, .4); assert.equal(w.e.stone, true);
  w.player.dir = -1; advance(w.game, .2); assert.equal(w.e.stone, true, 'still stone 0.2 s after the look away (it sees it 0.12 s late, then waits 0.25 s)'); advance(w.game, .25); assert.equal(w.e.stone, false, 'awake');
});

test('gargoyle rake: a tell of 0.55 s, no contact before it, a glide along the line fixed at tell start that hits once, a punishable recovery, then a flight to a perch', () => {
  const { game, player, events, e } = bel('gargoyle', 500, 700);
  perch(game, e); game.platforms.push(game.makePlatform(100, FLOOR - 100, 200, 'x', 'y'));
  e.cd = 0; player.dir = -1; game.snaps = []; const b0 = player.blood;
  advance(game, .05); assert.ok(e.tell > .45 && e.move === 'rake', 'the tell starts'); const line = { ...e.warn.line }; assert.ok(evs(events, 'enemyTell').some(t => t.enemy === 'gargoyle' && t.kind === 'rake'));
  player.x = 505; advance(game, .45); assert.equal(player.blood, b0, 'nothing before the tell is over'); assert.deepEqual(e.warn.line, line, 'the line is fixed');
  advance(game, .5); assert.ok(player.blood < b0, 'the glide hits'); assert.equal(evs(events, 'hurt').length, 1, 'once');
  assert.ok(e.recover > 0 && e.punishable && e.y === FLOOR, 'it lands on the floor with a punishable recovery'); assert.equal(e.struck, false, 'the glide leaves no stale struck flag (the bot reads it for heavies)');
  advance(game, .6); assert.ok(evs(events, 'brainStep').some(b => b.enemy === 'gargoyle' && b.kind === 'reperch'), 'then it flies to a perch');
  advance(game, 1); assert.ok(e.plat && e.y === e.plat.y && !e.plat.moving, 'perched again');
});

test('gargoyle rake: no tell starts whose earliest contact (0.55 s) falls inside the hero i-frames (#69 QA: contacts landed up to 0.05 s into i-frames)', () => {
  const short = bel('gargoyle', 500, 700); perch(short.game, short.e); short.game.platforms.push(short.game.makePlatform(100, FLOOR - 100, 200, 'x', 'y'));
  short.e.cd = 0; short.player.dir = -1; short.game.snaps = []; short.player.invulnerable = .1;
  advance(short.game, .05); assert.equal(short.e.move, 'rake', 'control: i-frames that end before the earliest contact let the rake start');
  const long = bel('gargoyle', 500, 700); perch(long.game, long.e); long.game.platforms.push(long.game.makePlatform(100, FLOOR - 100, 200, 'x', 'y'));
  long.e.cd = 0; long.player.dir = -1; long.game.snaps = []; long.player.invulnerable = .6;
  let t = 0; while (long.e.move !== 'rake' && t < 1) { advance(long.game, 1 / 120); t += 1 / 120; } // step frame by frame: the rake must start only once the i-frames are down to its earliest contact
  assert.equal(long.e.move, 'rake', 'the rake starts once its earliest contact is clear of i-frames');
  assert.ok(long.player.invulnerable <= .55 + 1 / 60, `i-frames still ${long.player.invulnerable.toFixed(3)} s at the rake start, past its 0.55 s earliest contact`);
});

test('gargoyle plummet: a hero under the perch draws a ring r 60 with a 0.95 s tell and glint; 100 damage only if still inside at contact; it ends embedded and punishable', () => {
  const run = step => {
    const { game, player, events, e } = bel('gargoyle', 700, 700); perch(game, e); e.cd = 0; player.dir = 1; player.x = 700; game.snaps = [];
    let heavy = null; for (let i = 0; i < 120 && !e.heavy; i++) game.update(1 / 120, {}); heavy = evs(events, 'enemyHeavy').find(h => h.kind === 'plummet');
    assert.ok(heavy && heavy.area.circles[0].r === 60, 'the ring is announced'); const hp0 = player.blood; step(player); advance(game, 1.2);
    return { game, player, e, lost: hp0 - player.blood, events };
  };
  const stood = run(() => {}); assert.equal(stood.lost, 100); assert.ok(stood.e.recover > 0 || stood.e.heavy === false); assert.equal(stood.e.y, FLOOR); assert.ok(evs(stood.events, 'enemyGlint').length >= 1);
  const moved = run(p => { p.x = 500; }); assert.equal(moved.lost, 0, 'walked out of the ring');
});

test('pendulum: every tick lands on a beat of its own clock, tell 0.45-0.65 s, a low sweep that a jump clears, then a punishable recovery', () => {
  const run = jump => {
    const { game, player, e } = bel('pendulum', 550, 650, 13); e.cd = 0; const b0 = player.blood; let tell = -1;
    for (let i = 0; i < 8 * 120 && !(e.recover > 0 || e.move === 'tock'); i++) { game.update(1 / 120, {}); if (e.tell > 0 && tell < 0) tell = e.tell; if (jump && e.tell > 0 && e.tell < .3 && player.grounded) { player.vy = -575; player.grounded = false; player.y -= 1; } } // stops at the tick's contact (a jumper then draws the tock)
    return { game, player, e, tell, lost: b0 - player.blood };
  };
  const stand = run(false); assert.ok(stand.tell >= .45 - 1e-9 && stand.tell <= .65 + 1e-9, `tell ${stand.tell}`); assert.ok(stand.lost > 0, 'the tick hurts a hero who stands');
  const B = 1.2, phase = ((stand.game.time - stand.e.bt0) % B + B) % B; assert.ok(phase < .05 || B - phase < .05, `contact on a tick (phase ${phase})`);
  assert.ok(stand.e.recover > 0 && stand.e.punishable);
  assert.equal(run(true).lost, 0, 'jumped');
});

test('pendulum tock: a hero in the air within 150 px at the tick contact draws the high sweep 0.6 s later; a grounded hero does not', () => {
  const go = air => {
    const { game, player, events, e } = bel('pendulum', 550, 650, 13); e.cd = 0;
    for (let i = 0; i < 8 * 120 && !(e.tell > 0); i++) game.update(1 / 120, {});
    const t0 = game.time + e.tell; while (e.tell > .02) game.update(1 / 120, {});
    if (air) { Object.assign(player, { y: FLOOR - 80, vy: 0, grounded: false }); game.snaps.forEach(s => { s.grounded = false; s.y = FLOOR - 80; }); }
    advance(game, .06); return { e, events, player };
  };
  const a = go(true); assert.equal(a.e.move, 'tock'); assert.ok(a.e.tell > .5 && a.e.tell <= .6); assert.ok(a.e.warn.box.y < a.e.y - 60, 'high sweep');
  assert.equal(go(false).e.move, '');
});

test('pendulum swingout: a heavy on a tick with a glint; a hero under the pivot (inside 70 px) or beyond 200 px is safe, one in the band is hit for 100', () => {
  const run = hx => {
    const { game, player, events, e } = bel('pendulum', 490, 650, 13); e.cd = 0; e.bsCd = 99; // standing under the pivot is the safe spot: the backstep is off for the test
    game.snaps = []; advance(game, .2);
    const b = game.tickIn(e); game.time += b - .95 + 1e-3; // the next tick is 0.95 s away
    Object.assign(player, { x: e.x - 160, dir: 1, vx: 200 }); game.snaps.forEach(s => { s.x = e.x - 160; s.vx = 200; s.dir = 1; });
    for (let i = 0; i < 120 && !e.heavy; i++) game.update(1 / 120, {});
    assert.ok(e.heavy && e.heavyKind === 'swingout', 'announced'); assert.ok(evs(events, 'enemyHeavy').some(h => h.kind === 'swingout')); const t = e.tell;
    player.x = e.x + hx; player.vx = 0; const b0 = player.blood; advance(game, t + .1);
    const phase = ((game.time - e.bt0) % 1.2 + 1.2) % 1.2; assert.ok(phase < .2 || 1.2 - phase < .2, 'the contact is on a tick');
    return { lost: b0 - player.blood, e };
  };
  assert.equal(run(-130).lost, 100, 'in the band'); assert.equal(run(-40).lost, 0, 'under the pivot'); assert.equal(run(-230).lost, 0, 'beyond 200'); assert.ok(run(-130).e.recover > 0);
});

test('Stopped Hour: a pendulum tell pushed back by the resume grace keeps its contact on a tick; a gargoyle mid-rake waits and the hero is safe in the grace', () => {
  const { game, player, e } = bel('pendulum', 550, 650, 13); e.tell = .1; e.move = 'tick'; e.warn = { kind: 'tick', box: { x: 500, y: e.y - 40, w: 140, h: 40 } }; e.cd = 99; game.hour.on = true;
  toll(game, 60); while (game.hour.still > 0) game.update(1 / 120, {});
  assert.ok(e.tell >= STILL_GRACE - .03, 'pushed to the grace'); assert.ok(Math.abs(game.tickIn(e) - e.tell) < 1e-6, 'the next tick is the contact');
  const g = bel('gargoyle', 500, 640, 12), pl = perch(g.game, g.e); g.game.hour.on = true; Object.assign(g.e, { tell: .05, move: 'rake', cd: 99, warn: { kind: 'rake', box: { x: 480, y: g.e.y - 58, w: 200, h: 160 }, line: { x1: g.e.x, y1: g.e.y, x2: 500, y2: FLOOR } } });
  const x0 = g.e.x; toll(g.game, 60); advance(g.game, .8); assert.equal(g.e.x, x0, 'frozen in the Hour'); assert.equal(g.player.blood, 60);
});

test('pendulum: the dodge-on-the-beat habit delays the next swingout by 0.4 s only from floor 15 (glint unchanged)', () => {
  const heavyTell = floor => { const { game, player, events, e } = bel('pendulum', 490, 650, floor); e.beats = [1, 1, 0]; e.cd = 0; e.bsCd = 99; game.snaps = []; advance(game, .2); game.time += game.tickIn(e) - .95 + 1e-3; Object.assign(player, { x: e.x - 160, dir: 1, vx: 200 }); game.snaps.forEach(s => { s.x = e.x - 160; s.vx = 200; s.dir = 1; }); for (let i = 0; i < 120 && !e.heavy; i++) game.update(1 / 120, {}); return { tell: e.tell, delayed: e.delayed, ev: evs(events, 'enemyHeavy').find(h => h.kind === 'swingout') }; };
  const a = heavyTell(13), b = heavyTell(15);
  assert.equal(a.delayed, false); assert.equal(b.delayed, true); assert.ok(b.tell - a.tell > .35 && b.tell - a.tell < .45); assert.equal(b.ev.delayed, true);
});

test('pendulum swingout geometry is exact: the hero centre at 69 and 201 px is safe, at 71 and 199 px is hit', () => {
  const lost = off => {
    const { game, player, e } = bel('pendulum', 490, 650, 13); e.cd = 0; e.bsCd = 99; game.snaps = []; advance(game, .2);
    game.time += game.tickIn(e) - .95 + 1e-3; Object.assign(player, { x: e.x - 160, dir: 1, vx: 200 }); game.snaps.forEach(s => { s.x = e.x - 160; s.vx = 200; s.dir = 1; });
    for (let i = 0; i < 120 && !e.heavy; i++) game.update(1 / 120, {});
    assert.equal(e.heavyKind, 'swingout'); const x = e.x + Math.sign(e.warn.box.x + 1 - e.x) * off; player.x = x; player.vx = 0; const b0 = player.blood; advance(game, e.tell + .1); return b0 - player.blood;
  };
  assert.equal(lost(69), 0); assert.equal(lost(201), 0); assert.ok(lost(71) > 0); assert.ok(lost(199) > 0);
});

test('a stone gargoyle that takes a posture break is no longer stone while stunned, so the riposte lands in full', () => {
  const { game, e } = bel('gargoyle', 400, 700); advance(game, .4); assert.equal(e.stone, true);
  e.poise = 1; game.damageEnemy(e, 10, 1, false, false, false, 17); assert.ok(e.stun > 0, 'posture broke');
  advance(game, .1); assert.ok(e.stun > 0); assert.equal(e.stone, false, 'stone is off during the stun'); const hp0 = e.hp; game.damageEnemy(e, 100, 1, false, false, false, 17); assert.ok(hp0 - e.hp > 20, 'no x0.2 clink on a staggered gargoyle');
});
