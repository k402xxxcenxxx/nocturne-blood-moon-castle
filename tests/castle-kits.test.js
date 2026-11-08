import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';
import { advance, airborne, apexFoe, apexSwings, calm, castle, enemy, fires, frenzied, heavyFoe, hit, holders, hp, kingFight, kit, lightFoe, queue, ranged, swings, sword, tellOf, tellsOf, toll, until, warden } from './helpers.js';

// --- Weapon frenzies (#61) ---
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
// Steps until `done()` is true (at most `limit` seconds) and returns the game time then.
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

test('greatsword: a combo swing winds up before it can hit, sound and blow come together; a thrust does not', () => {
  const { game, player, events } = castle(); game.setWeapon('heavy'); game.enemies = []; game.traps = []; game.obstacles = [];
  const target = enemy(game, player.x + 80), hp = target.hp; player.dir = 1;
  game.attack();
  assert.ok(player.windupT > 0); assert.equal(target.hp, hp, 'nothing lands at the press'); assert.ok(!events.some(e => e.type === 'swing'));
  advance(game, .2); assert.equal(target.hp, hp, 'still raised');
  advance(game, .1); assert.ok(target.hp < hp, 'the blow lands'); assert.ok(events.some(e => e.type === 'swing'));
  const counter = castle(); counter.game.setWeapon('heavy'); counter.player.thrustWindow = .5; counter.game.attack();
  assert.equal(counter.player.windupT, 0); assert.equal(counter.player.move, 'thrust');
});

test('twin blades: the spread-arm second and third cuts hit both sides, the first and a thrust only the front', () => {
  const { game, player } = castle(); game.setWeapon('twin'); game.enemies = []; game.traps = []; game.obstacles = [];
  const behind = enemy(game, player.x - 70), hp = behind.hp; player.dir = 1;
  game.attack(); assert.equal(behind.hp, hp, 'the first cut is in front');
  player.attackCd = 0; game.attack(); assert.ok(behind.hp < hp, 'the second reaches behind');
});
