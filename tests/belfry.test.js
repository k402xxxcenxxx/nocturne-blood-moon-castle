import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';
import { advance, boss, castle, castleFloorsHash, enemy, evs, hit, hourTypes, hp, kingBrainArena, modesHash, ranged, toll, until, warden, wardenBrainArena } from './helpers.js';

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
  assert.equal(castleFloorsHash(), 'a7b2567624cfce15');
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
    const expected = f <= 3 ? 5 : f >= 17 ? 7 : f >= BELFRY_FROM ? 6 : f >= 8 ? 7 : 6; assert.equal(game.enemies.length, expected + (f >= 8 ? 1 : 0), `floor ${f}: the plan plus the bonus elite from floor 8`);
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
