import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';
import { POISE_PLUNGE, SPEAR_TELL, WARDEN_HEAVIES, advance, airborne, arena, brainFoe, castle, cursed, enemy, evs, fires, frenzied, hit, hp, kingBrainArena, kit, ledge, lowest, lull, noSwing, runUntil, screenScene, skeletonHash, stamped, swings, sword, tellOf, toll, until, warden, wardenBrainArena } from './helpers.js';

// ---- Brains (#62 PR 1): shield bearer and spearman read a 0.12 s old snapshot of the hero and answer it ----
test('brains: a skeleton-only castle floor replays bit-for-bit (hash updated for the halved stat profile)', () => {
  assert.equal(skeletonHash(), '186c408138057b1f', 'hash of the scripted skeleton floor (the state part is unchanged since the halved profile: only the new interrupt event joined the stream) (user decision 2026-10-31; the PR 1 refactor hash 0edbaf3fe1ff4c49 was taken with the old x9.6 profile)');
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
  assert.ok(gap - 14 >= 28, `adjacent bolts ${(gap - 14).toFixed(0)} px apart edge to edge (bolt radius 7)`);
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
test('blood curse ends when the hero dies (the death screen shows no curse)', () => {
  const c = brainFoe('priest', 200, { floor: 6 }); c.e.speed = 0; c.e.cd = 99; lull(c.game); c.player.blood = 150;
  c.game.hex('priest'); assert.ok(c.game.curseT > 2.5, 'cursed');
  c.player.invulnerable = 0; c.player.blood = 1; c.game.hurt(50, 1);
  assert.equal(c.game.state, 'dead', 'the hit killed the hero');
  assert.equal(c.game.curseT, 0, 'the curse ends with the hero');
});

test('blood curse: a rite blocked by i-frames in the same frame as an earlier landed hit starts no curse', () => {
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
  const w = new Game(() => {}, 5, 'castle'); w.apex = true; w.enemies = []; const wd = w.spawnWarden(1400); assert.equal(wd.hp, WARDEN_HP, 'the Warden has WARDEN_HP (1100, user decision 2026-10-31)'); assert.equal(WARDEN_HP, 1100);
  const k = new Game(() => {}, 5, 'castle'); k.apex = true; k.enemies = []; const kg = k.spawnKing(1400); assert.equal(kg.hp, KING_HP, 'the King is unchanged');
});

// --- The Gate Warden's brain (#62 PR 4) ---
test('warden gate: the column falls 240 px behind the hero, hurts a hero under it, and stands as a wall that blocks walking and dashing but not a double jump', () => {
  const { game, player, events, b } = wardenBrainArena(900, 1300);
  assert.equal(game.gateSpot(b, game.heroSnap()), 660, '240 px on the side away from the Warden');
  game.wardenStart(b, 'gate'); assert.equal(b.warn.x, 660); assert.ok(b.warn.box.w === 44 && b.warn.box.h >= FLOOR, 'the shadow column runs ceiling to floor'); assert.ok(b.tell >= 1, 'a 1.0 s tell');
  player.x = 670; // hero stands in the column during the tell: caught at contact
  advance(game, 1.1); const g = game.obstacles.find(o => o.gate); assert.ok(g && g.x === 660 && g.h === 150, 'a 150 px wall');
  assert.equal(evs(events, 'gateDrop').length, 1); assert.ok(evs(events, 'hurt').some(h => h.heavy && h.amount === 100), 'a hero under the column takes 100');
  player.invulnerable = 0; player.x = g.x + 60; player.dir = -1;
  advance(game, 1.2, { left: true }); assert.ok(player.x >= g.x + 36 - 1, 'walking is blocked');
  game.dash(); advance(game, .3, { left: true }); assert.ok(player.x >= g.x + 36 - 1, 'a dash is blocked too');
  advance(game, .8); player.dashCd = 0; game.jump(); advance(game, .37, { left: true }); game.jump(); advance(game, 1.2, { left: true });
  assert.ok(player.x < g.x - 20, `a double jump clears the wall (x ${player.x.toFixed(0)})`);
  game.obstacles.find(o => o.gate); const hp0 = g.hp; game.damageObstacle(g, 999); assert.equal(g.hp, hp0, 'a portcullis cannot be broken');
});

test('warden gates: at most 2 stand (the older lifts first), each lifts after 5 s, none within 300 px of another, and a gate stops the Warden', () => {
  const { game, events, b } = wardenBrainArena(900, 1300);
  game.dropGate(400); game.dropGate(900); assert.equal(game.obstacles.filter(o => o.gate).length, 2);
  game.dropGate(1500); const xs = game.obstacles.filter(o => o.gate).map(o => o.x); assert.deepEqual(xs, [900, 1500], 'the older one lifted'); assert.equal(evs(events, 'gateLift')[0].x, 400);
  const s = { ...game.heroSnap(), x: 1100 }; assert.equal(game.gateSpot(b, { ...s, x: 1100 }), null, 'a spot within 300 px of a standing gate is refused');
  b.x = 1400; assert.ok(game.wallClip(b, 1000) > 900, 'the Warden cannot pass the gate at 900'); assert.ok(game.wallClip(b, 1300) === 1300);
  advance(game, 5.1); assert.equal(game.obstacles.filter(o => o.gate).length, 0, 'gates lift by themselves after 5 s'); assert.equal(evs(events, 'gateLift').length, 3);
  game.dropGate(b.x + b.dir * 150); game.wardenStart(b, 'charge'); assert.ok(Math.abs(b.chargeTo - b.x) <= 150, 'a charge drawn toward a gate ends at the gate');
});

test('warden reads move onto the shared brain: a retreating hero is penned in, the follow-up is chosen from where a dash lands, and brainOff keeps the old pick', () => {
  const a = wardenBrainArena(900, 1300); a.b.habit.push('retreated', 'retreated'); a.game.time = 10;
  assert.equal(a.game.wardenPick(a.b, 400, a.game.heroSnap()).move, 'gate', 'retreated twice: a gate behind the hero');
  a.b.habit.push('retreated', 'retreated'); assert.equal(a.game.wardenPick(a.b, 400).move, 'charge', 'without the brain it is still the charge');
  assert.ok(a.game.habits.warden === a.b.habit, 'the shared habit memory is the Warden\'s');
  const k = wardenBrainArena(900, 1300); k.game.noteHabit('warden', k.b, false); k.game.noteHabit('warden', k.b, false); assert.deepEqual(k.b.habit, ['retreated', 'retreated']);
  const d = wardenBrainArena(1200, 1300); d.player.dash = .1; d.player.dir = -1; d.game.noteAnswer(d.b, 'stood'); assert.equal(d.b.habit.at(-1), 'dashed', 'a dash is its own answer');
  // a dash in the snapshot lands the hero behind the Warden: the follow-up is the backhand/charge for there, not for where the hero was
  const f = wardenBrainArena(1200, 1300); const s = { ...f.game.heroSnap(), x: 1230, dash: .18, dir: 1, vx: 730, t: f.game.time - .12 };
  assert.equal(f.game.landing(s, .5) > 1300, true, 'the dash carries the hero past the Warden'); f.b.follows = 0;
  assert.equal(f.game.wardenFollow(f.b, 'sweep', s), 'backhand', 'chosen for the dash landing: behind it'); assert.equal(f.game.wardenFollow(f.b, 'sweep', { ...s, dash: 0, vx: 0, x: 1200 }) !== 'backhand', true, 'the same hero standing in front gets another follow-up');
});

test('warden gate string: after the door shuts the charge follows a hero in front of the Warden, never a hero behind it or out of reach, and the brainOff Warden has no gate', () => {
  const { game, b } = wardenBrainArena(1100, 1300); const s = game.heroSnap(); b.follows = 0;
  assert.equal(game.wardenFollow(b, 'gate', s), 'charge'); assert.equal(game.wardenFollow(b, 'gate', { ...s, x: 1500 }), '', 'behind the Warden'); assert.equal(game.wardenFollow(b, 'gate', { ...s, x: 800 }), '', 'out of the charge\'s 330 px');
  assert.equal(game.wardenFollow(b, 'gate'), '', 'no snapshot (brain off): no follow-up'); game.brainOff = new Set(['warden']); assert.equal(game.wardenBrain(b), false);
});

test('warden dash spam: two dashes within 2.5 s hold the next opening heavy 0.4 s longer (one delay per string), a single dash does not', () => {
  const t = wardenBrainArena(1200, 1300); const { game, player, b } = t; game.rand = () => .99;
  game.dash(); player.dashCd = 0; advance(game, .3); game.dash(); advance(game, .3); const s = game.snap();
  assert.equal(game.dashSpam(game.heroSnap()), true, 'two dashes in the log');
  const pick = game.wardenPick(b, 100, game.heroSnap()); assert.ok(WARDEN_HEAVIES.includes(pick.move) && pick.delay === true, `${pick.move} delayed`);
  assert.equal(game.dashLog.length, 0, 'the read is spent');
  const one = wardenBrainArena(1200, 1300); one.game.rand = () => .99; one.game.dash(); advance(one.game, .3); assert.notEqual(one.game.wardenPick(one.b, 100, one.game.heroSnap()).delay, true);
  game.wardenStart(b, 'charge', true); assert.ok(b.delayed && b.tell > .95 + .3, 'the delayed opener'); game.cancelAttack(b); b.follows = 0;
  game.wardenStart(b, 'charge', true, true); assert.equal(b.delayed, false, 'a follow-up is never delayed');
});

test('warden guards: the phase 2 roar calls a skeleton and a shield bearer from the arena ends (at most 2 live); the horn at 25% calls only the missing one; brainOff calls none', () => {
  const { game, player, events, b } = wardenBrainArena(900, 1300);
  game.wardenPhase(b); const guards = () => game.enemies.filter(o => o.add && o.hp > 0);
  assert.deepEqual(guards().map(o => o.type).sort(), ['shield', 'skeleton']); assert.ok(guards().every(o => !o.required && Math.abs(o.x - player.x) >= 420), 'they walk in from the ends');
  assert.equal(evs(events, 'wardenCall')[0].count, 2); game.wardenPhase(b); assert.equal(guards().length, 2, 'never more than 2');
  const sk = guards().find(o => o.type === 'skeleton'); sk.hp = 0;
  advance(game, 1.2); game.wardenStart(b, 'call'); assert.ok(b.tell >= .8 && !b.heavy, 'a 0.8 s horn, not an attack'); advance(game, .85);
  assert.deepEqual(guards().map(o => o.type).sort(), ['shield', 'skeleton'], 'the missing one is called'); assert.ok(evs(events, 'wardenCall').at(-1).horn && evs(events, 'wardenCall').at(-1).count === 1);
  assert.ok(b.punishable && b.recover > .9, 'then a 1.0 s punishable recovery');
  const off = wardenBrainArena(900, 1300); off.game.brainOff = new Set(['warden']); off.game.wardenPhase(off.b); assert.equal(off.game.enemies.filter(o => o.add).length, 0);
});

test('warden guards: no add tell during a Warden heavy tell, strike or recovery, one token shared by the adds, contacts 0.5 s from the Warden\'s, and they cower at 180 px in the hero\'s frenzy', () => {
  const { game, player, b } = wardenBrainArena(900, 1300); game.wardenPhase(b);
  const [g1, g2] = game.enemies.filter(o => o.add); Object.assign(g1, { x: 1000 }); Object.assign(g2, { x: 800 });
  game.wardenStart(b, 'charge'); assert.equal(game.addHeld(g1), true, 'a heavy tell holds the guards'); game.cancelAttack(b); b.heavy = false;
  b.heavy = true; b.recover = 1; assert.equal(game.addHeld(g1), true, 'and its recovery'); b.heavy = false; b.recover = 0;
  assert.equal(game.addHeld(g1), false); g2.token = 'light'; assert.equal(game.addHeld(g1), true, 'one token for both adds'); g2.token = '';
  game.wardenStart(b, 'sweep'); b.tell = .3; assert.equal(game.canStrike(g1, .45), false, 'a contact 0.15 s from the Warden\'s sweep waits');
  game.cancelAttack(b); b.tell = 0; player.frenzy = true; game.snaps = [];
  g1.x = player.x + 100; g1.speed = 60; const x0 = g1.x; assert.equal(game.guardKeep(g1, .1), true, 'a frenzied hero: the guard holds'); assert.ok(g1.x > x0, 'and backs off to 180 px');
  g1.x = player.x + 300; assert.equal(game.guardKeep(g1, .1), true); assert.equal(g1.x, player.x + 300, 'at 180 px or more it stands still'); player.frenzy = false; game.snaps = []; assert.equal(game.guardKeep(g1, .1), false, 'out of frenzy it fights');
});

test('warden bell: rings leave both ways, ring 1 low and ring 2 high 1.0 s behind; a standing hero is hit by the low ring only, an airborne hero by the high one, a dash by neither', () => {
  const { game, events, player, b } = wardenBrainArena(1000, 1300);
  game.wardenStart(b, 'bell'); assert.ok(b.tell >= 1.6 && b.heavy, 'a 1.6 s heavy tell'); assert.equal(b.warn.rings.length, 2);
  advance(game, 1.65); assert.equal(evs(events, 'ring').filter(r => r.kind === 'low').length, 2, 'two low rings at contact (one each way)'); assert.equal(game.rings.filter(r => r.kind === 'high').length, 2, 'the high pair waits');
  advance(game, 1.2); assert.equal(evs(events, 'ring').filter(r => r.kind === 'high').length, 2, 'the high pair 1.0 s later'); const hurts = evs(events, 'hurt'); assert.equal(hurts.length, 1, 'a grounded hero is hit once, by ring 1'); assert.equal(hurts[0].amount, 100);
  const air = wardenBrainArena(1000, 1300); air.player.invulnerable = 0; air.game.rings.push({ x: 1000, dir: 1, kind: 'high', top: FLOOR - 200, bottom: FLOOR - 70, wait: 0, dist: 0, hit: false }); air.player.x = 1060;
  for (let i = 0; i < 40; i++) { Object.assign(air.player, { y: FLOOR - 110, vy: 0, grounded: false }); air.game.update(1 / 120, {}); } assert.ok(evs(air.events, 'hurt').length === 1, 'a hero 110 px up is inside ring 2');
  const st = wardenBrainArena(1000, 1300); st.game.rings.push({ x: 1000, dir: 1, kind: 'high', top: FLOOR - 200, bottom: FLOOR - 70, wait: 0, dist: 0, hit: false }); st.player.x = 1060; advance(st.game, .5); assert.equal(evs(st.events, 'hurt').length, 0, 'ring 2 misses a standing hero');
  const dash = wardenBrainArena(1000, 1300); dash.game.rings.push({ x: 1000, dir: 1, kind: 'low', top: FLOOR - 60, bottom: FLOOR, wait: 0, dist: 0, hit: false }); dash.player.x = 1060; dash.player.invulnerable = .5; advance(dash.game, .5); assert.equal(evs(dash.events, 'hurt').length, 0, 'i-frames pass a ring');
  advance(game, 3); assert.equal(game.rings.length, 0, 'rings end at 900 px');
});

test('warden Great Toll: all blood above 100 plus 40, gauge gain, 160 px throw, debt in Greatsword frenzy, its own death cause; the chains pull at 80 px/s but not during a dash; the box is 330 px by 90', () => {
  const run = blood => { const t = wardenBrainArena(1100, 1300); t.player.blood = blood; t.b.superArmor = 10; t.b.dir = -1; t.game.wardenStart(t.b, 'greatToll'); return t; };
  const a = run(180); assert.ok(a.b.tell >= 1.8 && a.b.heavy, 'a 1.8 s heavy tell'); a.player.invulnerable = 0; a.game.wardenToll(a.b, true);
  assert.equal(Math.round(a.player.blood), 60, '180 - 80 - 40'); assert.equal(a.b.superArmor, 100, 'the gauge gains the amount (capped)'); assert.equal(evs(a.events, 'toll')[0].great, true); assert.ok(a.player.x < 1100 - 100, 'thrown back 160 px');
  const lo = run(100); lo.game.wardenToll(lo.b, true); assert.equal(Math.round(lo.player.blood), 60, '100 pays 40'); const frenzy = run(150); frenzy.player.frenzy = true; frenzy.game.wardenToll(frenzy.b, true); assert.equal(frenzy.player.frenzy, false, 'frenzy ends at 100 or less');
  const dead = run(30); dead.game.wardenToll(dead.b, true); assert.equal(dead.game.state, 'dead'); assert.equal(evs(dead.events, 'death')[0].cause, 'greatToll');
  const numb = run(180); numb.player.frenzy = true; numb.player.weapon = 'heavy'; numb.game.wardenToll(numb.b, true); assert.ok(numb.player.debt >= 100 && numb.player.blood === 180, 'Greatsword frenzy: the toll is debt'); assert.equal(numb.b.superArmor, 100);
  const pull = run(150); pull.b.tell = 1.8; const x0 = pull.player.x; advance(pull.game, .5); assert.ok(Math.abs((pull.player.x - x0) - 40) < 6, `pulled ~80 px/s (${pull.player.x - x0})`);
  const dash = run(150); dash.player.dash = .18; const d0 = dash.player.x; dash.game.greatPull(dash.b, .5); assert.equal(dash.player.x, d0, 'no pull during a dash');
  const far = wardenBrainArena(900, 1300); far.player.blood = 150; far.b.dir = -1; far.game.wardenStart(far.b, 'greatToll'); far.b.tell = 0; far.game.wardenStrike(far.b); assert.equal(far.player.blood, 150, '400 px away: outside the 330 px box');
  const up = wardenBrainArena(1100, 1300); up.player.blood = 150; up.b.dir = -1; up.game.wardenStart(up.b, 'greatToll'); up.b.tell = 0; up.player.y = FLOOR - 100; up.player.grounded = false; up.game.wardenStrike(up.b); assert.equal(up.player.blood, 150, 'above 90 px at contact: clear');
});

test('warden ultimates: the Bell at 75% then every 30 s of phase 1; in phase 2 the call at 25% (only if a guard is missing), then the Great Toll, then every 30 s; reading the snapshot', () => {
  const { game, b } = wardenBrainArena(1100, 1300); const s = () => game.heroSnap();
  assert.equal(game.wardenUlt(b, s()), null, 'full health: none'); b.hp = b.maxHp * .74; assert.equal(game.wardenUlt(b, s()).move, 'bell');
  game.wardenStart(b, 'bell'); game.cancelAttack(b); assert.equal(game.wardenUlt(b, s()), null, 'not again for 30 s'); game.time += 30.1; assert.equal(game.wardenUlt(b, s()).move, 'bell');
  game.wardenPhase(b); b.hp = b.maxHp * .3; assert.equal(game.wardenUlt(b, s()), null, 'phase 2 above 25%: none'); b.hp = b.maxHp * .24; game.cancelAttack(b);
  assert.equal(game.enemies.filter(o => o.add && o.hp > 0).length, 2); assert.equal(game.wardenUlt(b, s()).move === 'call', false, 'both guards alive: no horn'); 
  const t2 = wardenBrainArena(1100, 1300); t2.game.wardenPhase(t2.b); t2.game.enemies.filter(o => o.add)[0].hp = 0; t2.b.hp = t2.b.maxHp * .24; assert.equal(t2.game.wardenUlt(t2.b, t2.game.heroSnap()).move, 'call', 'a guard is missing: the horn first');
  assert.equal(t2.game.wardenUlt(t2.b, t2.game.heroSnap()).move === 'call', false, 'the horn blows once');
  const t3 = wardenBrainArena(1100, 1300); t3.game.wardenPhase(t3.b); t3.b.hp = t3.b.maxHp * .24; const pick = t3.game.wardenUlt(t3.b, t3.game.heroSnap()); assert.ok(['gate', 'greatToll'].includes(pick.move), `${pick.move}: the door shuts first, then the toll`);
  t3.game.dropGate(1100 - 240); assert.equal(t3.game.wardenUlt(t3.b, t3.game.heroSnap()).move, 'greatToll', 'a penned hero pays the toll');
  const far = wardenBrainArena(500, 1300); far.game.wardenPhase(far.b); far.b.hp = far.b.maxHp * .24; far.game.wardenUlt(far.b, far.game.heroSnap()); assert.equal(far.game.wardenUlt(far.b, far.game.heroSnap()), null, 'a hero out of the toll\'s reach is not tolled');
});

test('warden presence and cleanup: a gate slams behind the hero on floor 10, footfalls shake while it walks, and its death takes the gates, guards and rings with it; brainOff restores the #50 Warden', () => {
  const events = []; const g = new Game(e => events.push(e), 42, 'castle'); g.start(); g.setWeapon('spear'); g.descend(); g.loadFloor(WARDEN_FLOOR);
  assert.equal(evs(events, 'wardenWake').length, 1); assert.equal(evs(events, 'wardenWake')[0].duration, 1.2);
  const off = []; const o = new Game(e => off.push(e), 42, 'castle'); o.brainOff = new Set(['warden']); o.start(); o.setWeapon('spear'); o.descend(); o.loadFloor(WARDEN_FLOOR); assert.equal(evs(off, 'wardenWake').length, 0);
  const { game, events: ev, player, b } = wardenBrainArena(300, 900); b.cd = 99; b.engaged = true; advance(game, 1.5); assert.ok(evs(ev, 'wardenStep').length >= 2, 'footfalls while it walks'); assert.ok(evs(ev, 'wardenStep')[0].y === FLOOR);
  game.wardenPhase(b); game.dropGate(500); game.rings.push({ x: 800, dir: 1, kind: 'low', top: FLOOR - 60, bottom: FLOOR, wait: 0, dist: 0, hit: false }); player.invulnerable = 99;
  b.hp = 1; b.superArmor = 0; game.damageEnemy(b, 50, 1, false, false, false, 17);
  assert.equal(game.obstacles.filter(q => q.gate).length, 0, 'gates lift'); assert.ok(game.enemies.filter(q => q.add).every(q => q.hp === 0), 'guards fall'); assert.equal(game.rings.length, 0);
});

test('warden throws stop at a portcullis: the Great Toll (160 px) and the seize (120 px) leave the hero on the Warden\'s side of a gate, a gate top is not a platform, and the break slide stops at a gate', () => {
  const great = wardenBrainArena(1150, 1300); great.player.blood = 180; great.b.dir = -1; great.game.dropGate(1010); great.game.wardenToll(great.b, true);
  assert.ok(great.player.x > 1010 + 36 - 1, `Great Toll throw ends beside the gate, not behind it (x ${great.player.x.toFixed(0)})`);
  const seize = wardenBrainArena(1210, 1300); seize.player.blood = 180; seize.b.dir = -1; seize.game.dropGate(1100); seize.game.wardenToll(seize.b);
  assert.ok(seize.player.x > 1100 + 36 - 1, `seize throw ends beside the gate (x ${seize.player.x.toFixed(0)})`);
  const top = wardenBrainArena(900, 1300); top.game.dropGate(1000); Object.assign(top.player, { x: 1000, y: FLOOR - 200, vy: 0, grounded: false }); advance(top.game, 1);
  assert.ok(Math.abs(top.player.x - 1000) > 30 && top.player.y >= FLOOR - 1, 'a hero dropped on a gate slides off and reaches the floor');
  const slide = wardenBrainArena(1100, 1300); slide.game.dropGate(1200); slide.b.x = 1260; Object.assign(slide.b, { stun: 1, breakStun: 1, vx: -1120 }); advance(slide.game, .5);
  assert.ok(slide.b.x >= 1200 + 58 - 1, 'the break slide stops at the gate');
});

// --- The Fallen King's brain (#62 PR 5) ---
test('king brain: presence, shared habit with a dashed answer, dash spam delays the opening heavy, a spent dash sends the string to the charge for where the dash lands', () => {
  const { game, k, events } = kingBrainArena(); assert.equal(evs(events, 'kingWake').length, 1); assert.equal(k.pause, 0);
  const w = new Game(() => {}, 5, 'castle'); w.start(); w.setWeapon('spear'); w.descend(); w.loadFloor(KING_FLOOR); assert.ok(w.enemies.find(e => e.king).pause > 1.4, 'he rises for 1.5 s'); assert.ok(game.habits.king === k.habit);
  game.player.dash = .1; game.noteAnswer(k, 'stood'); assert.equal(k.habit.at(-1), 'dashed'); game.dashLog.push(game.time - .3, game.time - .1); const pick = game.kingPick(k, 100, game.heroSnap());
  assert.ok(['slam', 'charge'].includes(pick.move) ? pick.delay === true : true); assert.equal(game.dashLog.length, 0, 'the dash read is spent');
  const b = kingBrainArena(1500, 1700); b.k.bossPhase = 1; b.game.snaps = [{ ...b.game.heroSnap(), dashCd: .8, t: b.game.time - .12 }];
  b.k.dir = -1; Object.assign(b.k, { move: 'string', tell: .4, follow: true }); b.game.kingBranch(b.k); assert.equal(b.k.move, 'charge', 'dash down, hero in front within 330: the charge');
  const c = kingBrainArena(1500, 1700); c.game.snaps = [{ ...c.game.heroSnap(), dashCd: 0, t: c.game.time - .12 }]; Object.assign(c.k, { move: 'string', tell: .4 }); c.game.kingBranch(c.k); assert.equal(c.k.move, 'slash', 'dash ready: the plain branch');
});

test('king raise: untaken pools rise as at most 2 husks (skeleton kit, 40 HP, add), a pool taken in the tell denies its husk, a 12 s cooldown, the adds wait for him', () => {
  const { game, player, events, k } = kingBrainArena(900, 1700); k.bossPhase = 2; game.addPool(1500, FLOOR, true); game.addPool(1300, FLOOR, true);
  const pick = game.kingPick(k, 800, game.snap()); assert.equal(pick.move, 'raise'); game.kingStart(k, 'raise'); assert.ok(k.tell >= 1.2 && !k.heavy, 'a 1.2 s tell, not an attack'); assert.equal(k.warn.pools.length, 2);
  assert.equal(game.addHeld({ add: true, token: '' }), true, 'no add tell while he kneels');
  player.x = 1300; advance(game, .05); assert.equal(game.pools.length, 1, 'taking one pool in the tell denies its husk'); advance(game, 1.17);
  const husks = game.enemies.filter(o => o.husk && o.hp > 0); assert.equal(husks.length, 1); assert.ok(husks[0].add && husks[0].maxHp === 40 && husks[0].type === 'skeleton'); assert.equal(evs(events, 'husk').length, 1); assert.equal(evs(events, 'raise')[0].pools, 1);
  assert.ok(k.punishable && k.recover > .9, 'then a 1.0 s punishable recovery'); assert.ok(k.raiseAt >= game.time + 11, 'cooldown 12 s');
  game.addPool(1500, FLOOR, true); game.addPool(1600, FLOOR, true); game.raiseHusks(k);
  assert.equal(game.enemies.filter(o => o.husk && o.hp > 0).length, 2, 'never more than 2: one more rises, the other pool stays'); assert.equal(game.pools.length, 1);
});

test('king crown guard: a frenzied hero within 200 px draws it (phase 2-3, once per 8 s); the first sword hit is countered with 40 damage and a 160 px shove, a Greatsword frenzy takes it as debt, then 0.8 s punishable', () => {
  const { game, player, events, k } = kingBrainArena(1600, 1700); k.bossPhase = 2; player.frenzy = true; player.blood = 190;
  assert.equal(game.kingPick(k, 100, game.heroSnap()).move, 'crownGuard'); k.bossPhase = 1; assert.notEqual(game.kingPick(k, 100, game.heroSnap()).move, 'crownGuard', 'not in phase 1'); k.bossPhase = 2;
  game.kingStart(k, 'crownGuard'); assert.ok(k.tell >= .45 && k.tell < .5 && !k.heavy); advance(game, .5); assert.equal(k.move, 'guardHold'); assert.ok(k.guardT > .9); assert.ok(k.guardAt > game.time + 7, 'once per 8 s');
  const b0 = player.blood, x0 = player.x; player.invulnerable = 0; game.damageEnemy(k, 30, 1, false, false, false, 17); assert.equal(k.hp, k.maxHp, 'the hit is blocked'); assert.equal(player.blood, b0 - 40); assert.ok(Math.abs(player.x - x0) >= 100, 'shoved'); assert.equal(evs(events, 'crownGuard').filter(c => c.state === 'counter').length, 1);
  advance(game, .1); assert.ok(k.recover > .6 && k.punishable, 'a punishable recovery');
  const n = kingBrainArena(1600, 1700); n.k.bossPhase = 2; n.player.frenzy = true; n.player.weapon = 'heavy'; n.player.blood = 190; n.game.kingStart(n.k, 'crownGuard'); advance(n.game, .5); const nx = n.player.x; n.player.invulnerable = 0; n.game.damageEnemy(n.k, 30, 1, false, false, false, 17);
  assert.ok(n.player.debt >= 40 && n.player.x === nx, 'Greatsword frenzy: 40 debt, no shove');
  const idle = kingBrainArena(1600, 1700); idle.k.bossPhase = 2; idle.game.kingStart(idle.k, 'crownGuard'); advance(idle.game, 1.6); assert.equal(evs(idle.events, 'crownGuard').filter(c => c.state === 'counter').length, 0, 'a hero who waits is never countered'); assert.equal(evs(idle.events, 'crownGuard').filter(c => c.state === 'end').length, 1);
});

test('king judgement (phase 1, 84%): set A is 5 columns 60 px wide with gaps the hero fits, set B covers the rest but one 140 px gap by the nearest A gap; walking from the A gap to the B gap survives both sets, standing still does not', () => {
  const run = walk => {
    const { game, player, events, k } = kingBrainArena(1500, 1900, 300); k.hp = k.maxHp * .8; k.bossPhase = 1; assert.equal(game.kingUlt(k, game.heroSnap()).move, 'judgement'); k.judgeAt = 0; game.kingStart(k, 'judgement');
    const A = k.warn.setA; assert.equal(A.length, 5); assert.ok(A.every(c => c.w === 60)); assert.ok(k.warn.gaps.every(g => g.w >= 60), 'every gap fits the hero'); assert.ok(k.tell >= 1.6 && k.heavy, 'a 1.6 s heavy tell');
    const gap = k.warn.gaps.reduce((a, g) => Math.abs(player.x - (g.x + g.w / 2)) < Math.abs(player.x - (a.x + a.w / 2)) ? a : g); player.x = gap.x + gap.w / 2; // stand in the nearest A gap
    advance(game, 1.65); assert.equal(k.move, 'judgementB'); const B = k.warn.setB, safe = k.warn.safe; assert.ok(safe.w >= 120, 'a new gap of at least 120 px'); assert.ok(Math.min(Math.abs(safe.x - (gap.x + gap.w)), Math.abs(safe.x + safe.w - gap.x)) <= 120, 'its near edge by the A gap');
    assert.ok(!B.some(c => c.x < safe.x + safe.w && c.x + c.w > safe.x), 'set B leaves the safe gap open'); const hurts0 = evs(events, 'hurt').length;
    if (walk) { const dir = safe.x > player.x ? 1 : -1, goal = safe.x + safe.w / 2; advance(game, .18); for (let i = 0; i < 60 && Math.abs(player.x - goal) > 4; i++) game.update(1 / 120, dir > 0 ? { right: true } : { left: true }); }
    advance(game, 1); return evs(events, 'hurt').length - hurts0;
  };
  assert.equal(run(true), 0, 'walk gap to gap: no hit'); assert.ok(run(false) >= 1, 'standing in the A gap is hit by set B');
});

test('king long night (phase 2, 50%): a 1.8 s opener, then six hits branching at their glints (one delayed heavy among hits 3-5, 0.5 s or more apart), a 1.6 s recovery where sword hits chip the gauge 10', () => {
  const { game, player, events, k } = kingBrainArena(1600, 1700, 400); k.bossPhase = 2; k.hp = k.maxHp * .45; assert.equal(game.kingUlt(k, game.heroSnap()).move, 'longNight'); game.kingStart(k, 'longNight'); assert.ok(k.tell >= 1.8 && !k.heavy);
  player.invulnerable = 99; const swings = []; let delayed = 0, t0 = game.time;
  for (let i = 0; i < 120 * 14 && !(k.recover > 1.5 && !k.night); i++) { game.update(1 / 120, {}); player.invulnerable = 99; }
  for (const ev of events) if (ev.type === 'enemySwing' && ev.enemy === 'king' && ['slash', 'turnslash', 'charge'].includes(ev.kind)) swings.push(ev); for (const ev of events) if ((ev.type === 'enemyTell' || ev.type === 'enemyHeavy') && ev.night && ev.delayed) delayed++;
  assert.equal(swings.length, 6, 'six hits'); assert.equal(delayed, 1, 'exactly one held hit'); assert.ok(k.recover > 1.4 && k.recover <= 1.6 && k.chipT > 1.4, 'the long recovery');
  const s0 = k.superArmor; k.superArmor = 100; game.armorHit(k, false); assert.equal(k.superArmor, 90, 'a sword hit chips 10'); const idx = events.indexOf(events.find(e => e.type === 'enemySwing' && e.enemy === 'king')); assert.ok(idx >= 0);
});

test('king blood moon (phase 3, 15%): a safe ring r 110 around him; everything outside takes 100, the ring is safe; then 3 pools inside it', () => {
  const mk = hx => { const t = kingBrainArena(hx, 1700, 300); t.k.bossPhase = 3; t.k.hp = t.k.maxHp * .14; return t; };
  const a = mk(1640); assert.equal(a.game.kingUlt(a.k, a.game.heroSnap()).move, 'bloodMoon'); a.game.kingStart(a.k, 'bloodMoon'); assert.ok(a.k.tell >= 1.8 && a.k.heavy); assert.deepEqual([a.k.warn.ring.x, a.k.warn.ring.r], [1700, 110]);
  advance(a.game, 1.85); assert.equal(evs(a.events, 'hurt').length, 0, 'inside the ring: safe'); const moon = evs(a.events, 'bloodPool').filter(q => q.moon); assert.equal(moon.length, 3, 'three pools inside the ring'); assert.ok(moon.every(q => Math.abs(q.x - 1700) <= 110)); assert.ok(a.k.recover > 1.3);
  const b = mk(1350); b.game.kingStart(b.k, 'bloodMoon'); advance(b.game, 1.85); assert.equal(evs(b.events, 'hurt')[0].amount, 100, 'outside: 100');
  const w = mk(1350); w.game.kingStart(w.k, 'bloodMoon'); advance(w.game, .2); for (let i = 0; i < 120 * 1.3; i++) w.game.update(1 / 120, { right: true }); advance(w.game, .4); assert.equal(evs(w.events, 'hurt').length, 0, 'walking into the ring from 350 px is in time');
  const far = mk(1300); far.k.x = 1700; assert.equal(far.game.kingUlt(far.k, { ...far.game.heroSnap(), x: 1000 }), null, 'a hero beyond 360 px of the ring is not the target');
});

test('king flood (phase 3): called only on a hero within 200 px of a ledge; 10 blood/s on the floor for 4 s, none on a ledge; it can kill (cause flood); floor pools are drawn in; the King then picks only descent, volley and ritual; never during an ultimate', () => {
  const near = kingBrainArena(300, 1700, 200); near.k.bossPhase = 3; const g = near.game; g.platforms = g.platforms.filter(p => p.kind === 'ledge'); assert.ok(g.ledgeNear(300) && !g.ledgeNear(900), '200 px of reach');
  g.maybeFlood(near.k, { x: 900 }); assert.equal(g.flood, null, 'a hero far from every ledge is never flooded'); g.maybeFlood(near.k, { ...g.heroSnap(), x: 300 }); assert.ok(g.flood && evs(near.events, 'flood')[0].state === 'tell' && evs(near.events, 'flood')[0].tell === 1.5);
  assert.ok(near.k.floodAt >= g.time + 17, 'every 18 s'); g.maybeFlood(near.k, { x: 300 }); assert.equal(evs(near.events, 'flood').length, 1, 'never twice at once');
  g.addPool(1500, FLOOR, true); const b0 = near.player.blood; advance(g, 1.4); assert.equal(near.player.blood, b0, 'no drain during the tell'); advance(g, .3); assert.ok(evs(near.events, 'flood').some(f => f.state === 'rise')); assert.ok(g.pools.every(q => q.draining), 'floor pools are drawn in');
  advance(g, 1); assert.ok(Math.abs((b0 - near.player.blood) - 10 * 1) < 2.5, `about 10 blood a second (${(b0 - near.player.blood).toFixed(1)})`); assert.equal(evs(near.events, 'hurt').length, 0, 'a drain is not a hit');
  assert.ok(['volley', 'ritual'].includes(g.kingPick(near.k, 300, g.heroSnap()).move), 'only descent, volley and ritual during a flood'); assert.equal(g.kingUlt(near.k, g.heroSnap()), null, 'no ultimate during a flood');
  advance(g, 4); assert.equal(g.flood, null); assert.equal(evs(near.events, 'flood').at(-1).state, 'end'); const after = near.player.blood; advance(g, 1); assert.equal(near.player.blood, after, 'the drain ends with the flood');
  const kill = kingBrainArena(300, 1700, 20); kill.k.bossPhase = 3; kill.game.flood = { tell: 0, life: 4, live: true }; advance(kill.game, 3); assert.equal(kill.game.state, 'dead'); assert.equal(evs(kill.events, 'death')[0].cause, 'flood', 'the flood can kill');
  const led = kingBrainArena(150, 1700, 100); led.k.bossPhase = 3; Object.assign(led.player, { y: FLOOR - 110, grounded: true, on: led.game.platforms.find(p => p.kind === 'ledge') }); led.game.flood = { tell: 0, life: 4, live: true }; const lb = led.player.blood; for (let i = 0; i < 120 * 2; i++) { led.game.update(1 / 120, {}); } assert.equal(led.player.blood, lb, 'a hero on a ledge is not drained');
});

test('king flood softlock search: from every floor position where the flood can be called, walking to the ledge and double jumping (no dash) leaves the floor before it rises, so no blood is lost; the descent on a ledge is jumped without a dash', () => {
  const W = 2800, bad = [];
  for (let x = 40; x < W - 30; x += 20) {
    const t = kingBrainArena(x, x < W / 2 ? 1700 : 900, 100); t.k.bossPhase = 3; const g = t.game, p = t.player;
    if (!g.ledgeNear(x)) continue;
    g.maybeFlood(t.k, { ...g.heroSnap(), x }); if (!g.flood) { bad.push(`${x}: not called`); continue; }
    const ledge = g.platforms.filter(q => q.kind === 'ledge').sort((a, b) => Math.abs(x - (a.x + a.w / 2)) - Math.abs(x - (b.x + b.w / 2)))[0], blood = p.blood; let reacted = 0;
    for (let i = 0; i < 120 * 6; i++) { // a human clock: nothing for 0.18 s, then the same simple policy every frame
      const input = {}; reacted += 1 / 120;
      if (reacted > .18 && !(p.grounded && p.on)) {
        const goal = clamp(p.x, ledge.x + 30, ledge.x + ledge.w - 30), d = goal - p.x;
        if (Math.abs(d) > 4) input[d > 0 ? 'right' : 'left'] = true;
        if (Math.abs(d) < 110 && ((p.grounded) || (p.jumps === 1 && p.vy > -150)) && p.y > ledge.y - 20) input.jump = true;
      }
      g.update(1 / 120, input); t.k.cd = 99;
    }
    if (p.blood < blood - 0.001 || g.state !== 'playing') bad.push(`${x}: lost ${(blood - p.blood).toFixed(1)}`);
  }
  assert.deepEqual(bad, [], 'every callable flood is escapable on foot');
  // the combination flood + descent: on the ledge, jump the shockwave (a hero more than 70 px above the surface is safe), land on the ledge again, no drain, no hit
  const t = kingBrainArena(150, 1700, 100), ledge = t.game.platforms.find(q => q.kind === 'ledge'); t.k.bossPhase = 3; Object.assign(t.player, { x: ledge.x + ledge.w / 2, y: ledge.y, grounded: true, on: ledge }); t.k.ledge = ledge; t.k.ledgeT = 3; t.game.flood = { tell: 0, life: 6, live: true };
  const b = t.player.blood; t.game.kingStart(t.k, 'descent'); let jumped = false;
  for (let i = 0; i < 120 * 3; i++) { const go = !jumped && t.k.tell > 0 && t.k.tell <= .45 + .18 - .18; if (go) jumped = true; t.game.update(1 / 120, go ? { jump: true } : {}); }
  assert.equal(evs(t.events, 'hurt').length, 0, 'the shockwave is jumped without a dash'); assert.equal(t.player.blood, b, 'and a hero on the ledge is never drained'); assert.ok(t.player.grounded && t.player.on === ledge, 'back on the ledge');
});

test('PR 4 leftovers: ringNear fires only for a ring heading at the hero that can still reach him (one low cue, none for the away side or beyond 900 px), and a Warden follow-up never lands within 0.5 s of a guard\'s tell', () => {
  const near = wardenBrainArena(1000, 1300); near.game.wardenStart(near.b, 'bell'); advance(near.game, 3);
  const cues = evs(near.events, 'ringNear'); assert.equal(cues.filter(c => c.kind === 'low').length, 1, 'one low cue (the away side gives none)'); assert.ok(cues.every(c => c.dir === 1 ? 1300 + 1 > 1000 : true));
  const far = wardenBrainArena(100, 2000); far.game.wardenStart(far.b, 'bell'); advance(far.game, 4); assert.equal(evs(far.events, 'ringNear').length, 0, 'a hero 1900 px away is out of the rings\' range');
  const cross = wardenBrainArena(1000, 1300); cross.game.wardenStart(cross.b, 'bell'); advance(cross.game, 1.62); cross.player.x = 1650; cross.player.invulnerable = 99; advance(cross.game, .5); assert.equal(evs(cross.events, 'ringNear').filter(c => c.dir === -1).length, 0, 'a hero who crossed over is no longer the target of the ring heading the other way');
  const { game, b } = wardenBrainArena(1100, 1300); game.wardenPhase(b); const g = game.enemies.find(o => o.add); g.tell = .5; b.follows = 0; b.dir = -1;
  game.wardenStart(b, 'sweep'); b.tell = 0; b.warn = { kind: 'sweep', box: { x: 0, y: 0, w: 1, h: 1 } }; game.wardenRecover(b, 'sweep'); assert.ok(!b.tell || Math.abs(b.tell - g.tell) >= .5, 'no follow-up inside 0.5 s of the guard\'s contact');
  assert.equal(game.addClash(.5), true); g.tell = 0; assert.equal(game.addClash(.5), false);
});

test('PR 5 review: judgement gaps keep 60 px at the arena walls, the Long Night ends on an armor break, a phase change or a blocked follow-up, and an i-frame-absorbed riposte gives no shove', () => {
  for (const x of [25, 100, 150, 1400, 2700, 2775]) {
    const { game, k } = kingBrainArena(x, 1700, 300); const s = game.judgementSets(); k.bossPhase = 1;
    assert.ok(s.gaps.every(g => g.w >= 60), `x ${x}: gaps ${s.gaps.map(g => g.w.toFixed(0))}`); assert.ok(s.view[0] >= 40 && s.view[1] <= game.worldWidth - 40, 'the view stays inside the arena');
  }
  const night = () => { const t = kingBrainArena(1600, 1700, 400); t.k.bossPhase = 2; t.k.night = { k: 2, left: 4, delayedHit: 4 }; t.k.chipT = 1; return t; };
  const a = night(); a.game.armorBreak(a.k); assert.deepEqual([a.k.night, a.k.chipT], [null, 0], 'an armor break ends the night');
  const b = night(); b.game.kingPhase(b.k, 3); assert.deepEqual([b.k.night, b.k.chipT], [null, 0], 'and so does a phase change');
  const c = night(); c.game.wardenPhase = c.game.wardenPhase; const g = c.game.spawnEnemy('skeleton', 1500, 4); Object.assign(g, { add: true, tell: .85 }); c.game.kingFollow = () => 'string'; c.game.kingRecover(c.k, 'slash'); assert.equal(c.k.night, null, 'a follow-up held back by a husk\'s tell ends it');
  const d = kingBrainArena(1600, 1700, 200); d.k.bossPhase = 2; d.player.frenzy = true; d.game.kingStart(d.k, 'crownGuard'); advance(d.game, .5); d.player.invulnerable = 5; const x0 = d.player.x; d.game.damageEnemy(d.k, 30, 1, false, false, false, 17); assert.equal(d.player.x, x0, 'no shove when the riposte is absorbed');
});
