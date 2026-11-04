// Shared test helpers, split out of core.test.js; every test file imports what it needs from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, KEEPER_FLOOR, SLICE_FLOORS, BELFRY_FROM, CASTLE_PICKS, clamp, WARDEN_HP, ASSAULT_BURN, FLOOR, WARDEN_FLOOR, KING_FLOOR, KING_ARMOR, KING_HP, TITHE_RESTORE, LEDGE_TIME, DESCENT_RADIUS, POOL_GAIN as POOL_PAY, ARMOR_MAX, ARMOR_LOCK, BREAK_STUN, FRENZY_CHIP, POOL_GAIN, GLINT_LEAD, RELICS, STAGES, BUILD_POOL, BLOOD_MAX, SLICE_POOL, HEAVY_DAMAGE, HEAVY_CD, ATTACK_TOKENS, STAGGER_STUN, STARVED, APEX_REACT, APEX_PROFILES, apexProfile, CASTLE_HP_MUL, floorScale } from '../core.js';
import { HOUR_PERIOD, HOUR_WARN, STILL, STILL_GRACE, ECHO_DELAY, ECHO_DAMAGE } from '../core.js';

export function arena(seed = 42) {
  const events = [];
  const game = new Game(event => events.push(event), seed);
  game.start();
  game.state = 'playing'; // skip the opening pick
  game.enemies = [];
  game.platforms = []; game.traps = []; game.obstacles = [];
  game.player.invulnerable = 0;
  return { game, player: game.player, events };
}

export function enemy(game, x, { y = FLOOR, hp = 500, type = 'skeleton' } = {}) {
  game.spawnEnemy(type, x, game.stage);
  const target = game.enemies.at(-1);
  Object.assign(target, { hp, maxHp: hp, y });
  return target;
}

export function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds; time += 1 / 120) game.update(1 / 120, input);
}

export function airborne(game, y = FLOOR - 150) { const p = game.player; p.y = y; p.vy = 0; p.grounded = false; p.jumps = 1; p.x = 400; p.dir = 1; }

export function boss(x = 500, heroX = 700) {
  const t = arena();
  const b = enemy(t.game, x, { type: 'boss', hp: 900 });
  Object.assign(t.player, { x: heroX, hp: 1e4, maxHp: 1e4 });
  b.cd = 99; b.dir = Math.sign(heroX - x) || 1;
  return { ...t, b };
}
export function fires(game, player, b, move, tell = 1.4) {
  const hp = player.hp;
  game.bossStart(b, move);
  advance(game, tell);
  return hp - player.hp;
}

export function elem(...relics) {
  const ctx = arena();
  ctx.game.relics.push(...relics);
  return ctx;
}
export const sword = (game, e, heavy = false) => game.damageEnemy(e, 24, 1, false, heavy, false, 0);

export const combo3 = (game) => { game.player.combo = 2; game.player.comboWindow = .8; game.attack(); };
export const hp = e => e.maxHp - e.hp;

export function trapAt(game, x, { t = 0, kind = 'spikes', period = 4, active = 1.5, w = 70 } = {}) {
  return game.spawnTrap(kind, x, w, period, active, t, game.stage);
}

export const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
export const lowest = p => p.move?.axis === 'y' ? p.y0 + p.move.amp : p.y0; // lowest top surface a platform reaches
export const span = p => p.move?.axis === 'x' ? [p.x0 - p.move.amp, p.x0 + p.w + p.move.amp] : [p.x0, p.x0 + p.w];
export const gapBetween = (a, b) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]));
export function layouts(fn) {
  for (const seed of SEEDS) { const game = new Game(() => {}, seed); for (let stage = 0; stage < 5; stage++) { game.loadStage(stage); fn(game, stage, seed); } }
}

export function eliteOf(game) { return game.enemies.find(e => e.elite); }
export function withAffix(affix, { type = 'skeleton', hp = 300 } = {}) {
  const { game, player, events } = arena();
  const e = enemy(game, 800, { hp, type });
  Object.assign(e, { elite: true, affix, maxHp: hp, ward: affix === 'warded' ? 30 : 0, wardT: 6, required: false });
  player.x = 200;
  return { game, player, events, e };
}

export const cursed = RELICS.filter(r => r.cursed);
export const grant = (game, id) => { game.choices = [RELICS.find(r => r.id === id)]; game.state = 'upgrade'; game.pickReason = 'chest'; assert.ok(game.chooseRelic(id)); };

export function stackedEndless(relicId, count, seed = 5) {
  const events = [], game = new Game(event => events.push(event), seed, 'endless');
  game.start(); game.chooseRelic(game.choices[0].id);
  game.state = 'playing'; game.enemies = []; game.platforms = []; game.traps = []; game.obstacles = []; game.player.invulnerable = 0;
  for (let i = 0; i < count; i++) { game.rollChoices('chest'); game.choices = [RELICS.find(r => r.id === relicId)]; game.chooseRelic(relicId); }
  return { game, player: game.player, events };
}

export function castle(seed = 42, floor = 1, apex = false) { // apex off by default: the pre-#66 skeleton rules stay covered; apex tests pass true
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

export function heavyFoe(type = 'skeleton', gap = 50, seed = 42) {
  const c = castle(seed);
  c.game.rand = () => 0; // every heavy roll succeeds
  const e = enemy(c.game, c.player.x + gap, { type });
  e.cd = 0; e.dir = -1;
  return { ...c, e };
}
export const heavyStrikes = events => events.filter(ev => ev.type === 'enemySwing' && ev.heavy);

export function lightFoe(type = 'skeleton', gap = 40, floor = 1) {
  const c = castle(42, floor);
  c.game.rand = () => .99; // heavy and read rolls fail: only light attacks
  const e = enemy(c.game, c.player.x + gap, { type });
  e.cd = 0; e.dir = -1;
  return { ...c, e };
}
export const holders = game => game.enemies.filter(e => e.hp > 0 && e.token);

export function warden(wx = 1000, hx = 940) {
  const t = castle(42, WARDEN_FLOOR), b = t.game.spawnWarden(wx);
  Object.assign(t.player, { x: hx }); Object.assign(b, { engaged: true, cd: 99, dir: -1 }); // cd 99: it never picks a move by itself
  return { ...t, b };
}
export const hit = (game, b, n = 10) => game.damageEnemy(b, n, 1, false, false, false, 17);

export const wardenP2 = (wx, hx) => { const t = warden(wx, hx); t.b.bossPhase = 2; t.player.invulnerable = 99; return t; };
export const runTo = (game, b, move, limit = 2) => { for (let t = 0; t < limit && !(b.move === move && b.tell > 0 && b.follow); t += 1 / 120) game.update(1 / 120, {}); };

export function kingFight(kx = 1400, hx = 1300, phase = 1) {
  const t = castle(42, KING_FLOOR), b = t.game.spawnKing(kx);
  Object.assign(t.player, { x: hx }); Object.assign(b, { engaged: true, cd: 99, dir: -1, opened: true, bossPhase: phase }); // cd 99: it never picks a move by itself
  return { ...t, b };
}
export const kHit = (game, b, n = 10) => game.damageEnemy(b, n, 1, false, false, false, 17);
export const ledge = game => game.makePlatform(1000, FLOOR - 110, 190, 'cathedral', 'ledge');

export function frenzied(weapon, blood = 195) {
  const t = castle(); t.game.setWeapon(weapon);
  Object.assign(t.player, { blood, frenzy: true, x: 600, invulnerable: 0 });
  return t;
}
export const calm = (e, cd = 99) => Object.assign(e, { cd });

export const swings = (events, kind) => events.filter(ev => ev.type === 'enemySwing' && (kind === undefined || ev.kind === kind));
export const tellsOf = (events, kind) => events.filter(ev => (ev.type === 'enemyTell' || ev.type === 'enemyHeavy') && ev.kind === kind);

export function kit(type, gap, { floor = 5, rand = .99, elite = false } = {}) {
  const c = castle(42, floor); c.game.rand = () => rand;
  const e = enemy(c.game, c.player.x + gap, { type }); e.cd = 0; e.dir = -1;
  if (elite) c.game.makeElite(e, 0);
  return { ...c, e };
}
export const ranged = t => t === 'priest' || t === 'mage';
export const queue = (game, ...values) => { game.rand = () => values.length ? values.shift() : .99; }; // the next rolls in order, then 0.99
export function until(game, done, limit = 3) { for (let i = 0; i < limit * 120 && !done(); i++) game.update(1 / 120, {}); return game.time; }

export function apexFoe(gap = 100, { floor = 1, hp = 1e5 } = {}) {
  const c = castle(42, floor, true);
  c.game.rand = () => .99; // no mixed-strategy baits, no heavy rolls
  c.player.x = 700; c.player.invulnerable = 0;
  const e = enemy(c.game, c.player.x + gap, { hp }); e.dir = -1; e.maxPoise = e.poise = 500;
  return { ...c, e };
}
export const apexSwings = events => events.filter(ev => ev.type === 'enemySwing');

export function brainFoe(type, gap = 100, { floor = 1, hp = 1e5 } = {}) {
  const c = castle(42, floor, true);
  c.game.rand = () => .99;
  c.player.x = 700; c.player.invulnerable = 0;
  const e = enemy(c.game, c.player.x + gap, { type, hp }); e.dir = -1; e.maxPoise = e.poise = 500; e.armor = 0; e.action = 1; e.braceCd = 99; // brace off unless a test turns it on; // action 1: a brain has already acted, so cooldowns hold (no spawn cooldown override)
  return { ...c, e };
}
export const WARDEN_HEAVIES = ['slam', 'charge', 'seize'];
export const evs = (events, type) => events.filter(ev => ev.type === type);
export const lull = (game, s = .3) => { const keep = game.enemies.map(e => [e.cd, e.mixT]); for (const e of game.enemies) Object.assign(e, { cd: 99, mixT: 99 }); advance(game, s); game.enemies.forEach((e, i) => Object.assign(e, { cd: keep[i][0], mixT: keep[i][1] })); }; // let the snapshot ring fill with the foes holding still
export const noSwing = e => Object.assign(e, { cd: 99, mixT: 99 }); // keep a foe from picking an attack while a test sets the scene

export function skeletonHash() { // the refactor guard: a skeleton-only castle floor, scripted hero
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

export const tellOf = (game, e, input = {}, max = 600) => { for (let i = 0; i < max && !(e.tell > 0); i++) game.update(1 / 120, input); return e.tell > 0 ? e.tell + 1 / 120 : 0; };
export const stamped = c => { c.game.onEvent = ev => c.events.push({ ...ev, t: c.game.time }); return c; }; // events carry the game time they fired at

export const SPEAR_TELL = .64;

export function screenScene(floor = 4) {
  const c = stamped(castle(42, floor, true)); const { game, player } = c;
  game.rand = () => .99; player.x = 700; player.blood = 150; player.invulnerable = 0;
  const shield = enemy(game, 810, { type: 'shield', hp: 1e5 }), spear = enemy(game, 940, { type: 'spear', hp: 1e5 });
  for (const e of [shield, spear]) Object.assign(e, { dir: -1, action: 1, maxPoise: 500, poise: 500, cd: 0 });
  shield.mixT = 99; shield.braceCd = 99; // no rush and no brace: the screen is the move under test
  return { ...c, shield, spear };
}
export const runUntil = (c, done, max = 20) => { const t1 = c.game.time + max; while (c.game.time < t1 && !done() && c.game.state === 'playing') { c.player.blood = c.player.frenzy ? 190 : Math.min(c.player.blood, 190); c.game.update(1 / 120, {}); } };

export const POISE_PLUNGE = 45;

export function wardenBrainArena(hx = 900, wx = 1300) { // floor 10 with the apex brain on: the Warden alone, idle (cd 99), hero placed
  const t = castle(42, WARDEN_FLOOR, true), b = t.game.spawnWarden(wx);
  Object.assign(b, { x: wx, engaged: true, cd: 99, dir: -1 }); Object.assign(t.player, { x: hx, invulnerable: 0, blood: 200 }); t.game.snaps = [];
  return { ...t, b };
}

export function kingBrainArena(hx = 1300, kx = 1700, blood = 200) { // floor 50 with its ledges: the King alone, idle (cd 99), hero placed
  const events = [], game = new Game(e => events.push(e), 42, 'castle'); game.start(); game.setWeapon('spear'); game.descend(); game.loadFloor(KING_FLOOR);
  const k = game.enemies.find(e => e.king); Object.assign(k, { x: kx, engaged: true, cd: 99, dir: -1, pause: 0, opened: true }); Object.assign(game.player, { x: hx, invulnerable: 0, blood }); game.snaps = [];
  return { game, player: game.player, events, k };
}

export function castleFloorsHash() { // floors 1-10, two seeds and weapons, a scripted hero: state and event stream
  const h = createHash('sha1');
  for (const seed of [5, 9]) for (let f = 1; f <= 10; f++) {
    const ev = []; const g = new Game(e => ev.push(e.type), seed, 'castle'); g.start(); g.setWeapon(seed === 5 ? 'spear' : 'heavy'); g.descend(); g.loadFloor(f); g.state = 'playing';
    const p = g.player; p.blood = 150;
    for (let step = 0; step < 900 && g.state === 'playing'; step++) {
      const fo = g.enemies.filter(e => e.hp > 0).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0], d = fo ? fo.x - p.x : 1, close = fo && Math.abs(d) < p.reach - 20;
      g.update(1 / 60, { attack: step % 200 < 120, right: !close && d > 0, left: !close && d < 0, jump: step % 97 === 0, dash: step % 131 === 0, magic: step % 400 === 0 });
      if (step % 30 === 0) h.update(JSON.stringify([g.state, g.floor, g.stage, g.tier, g.worldWidth, Math.round(p.x), Math.round(p.blood), g.enemies.map(e => [e.type, Math.round(e.x), Math.round(e.hp), +e.tell.toFixed(2), e.move, !!e.required, e.elite ? 1 : 0]), g.traps.length, g.obstacles.length, g.platforms.length]));
    }
    h.update(ev.join(','));
  }
  return h.digest('hex').slice(0, 16);
}

export function modesHash() { // Normal stages 0-4 and Endless floors, scripted hero: state and event stream
  const h = createHash('sha1');
  for (const mode of ['normal', 'endless']) for (const seed of [2, 6]) for (const lvl of mode === 'normal' ? [0, 1, 2, 3, 4] : [1, 4, 5, 10]) {
    const ev = []; const g = new Game(e => ev.push(e.type), seed, mode); g.start(); g.state = 'playing'; if (mode === 'endless') g.loadFloor(lvl); else g.loadStage(lvl); g.state = 'playing';
    const p = g.player;
    for (let step = 0; step < 900 && g.state === 'playing'; step++) {
      const f = g.enemies.filter(e => e.hp > 0).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0], d = f ? f.x - p.x : 1, close = f && Math.abs(d) < p.reach - 20;
      g.update(1 / 60, { attack: step % 240 < 150, right: !close && d > 0, left: !close && d < 0, jump: step % 97 === 0, dash: step % 311 === 0, magic: step % 400 === 0 });
      if (step % 30 === 0) h.update(JSON.stringify([g.state, Math.round(p.x), Math.round(p.hp), g.stage, g.enemies.map(e => [e.type, Math.round(e.x), Math.round(e.hp), +e.tell.toFixed(2)]), g.traps.map(t => t.damage), g.obstacles.map(o => o.hp)]));
    }
    h.update(ev.join(','));
  }
  return h.digest('hex').slice(0, 16);
}

export const hourTypes = events => events.filter(e => e.type === 'hour').map(e => e.state);
export function toll(game, blood) { game.player.blood = blood; game.hour.t = HOUR_PERIOD - .01; advance(game, .03); } // jump the clock to the toll
