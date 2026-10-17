export const FLOOR = 438;
const VOLLEY_RANGE = 420; // drawn line length; the bolt tip (r 9) stops at its end
// Display text for stages and relics lives in i18n.js, keyed by stage index and relic id.
export const STAGES = [
  { count: 7, width: 2260 },
  { count: 9, width: 2500 },
  { count: 11, width: 2740 },
  { count: 13, width: 3000 },
  { count: 9, width: 2800 },
];
export const RELICS = [
  { id: 'edge', icon: 'sword', apply: p => p.damage *= 1.25 },
  { id: 'haste', icon: 'wind', apply: p => { p.attackSpeed *= .82; p.speed *= 1.08; } },
  { id: 'crit', icon: 'star', apply: p => p.crit = Math.min(.8, p.crit + .18) },
  { id: 'vital', icon: 'heart', apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 40); } },
  { id: 'leech', icon: 'drop', apply: p => p.leech += 5 },
  { id: 'arcane', icon: 'moon', apply: p => { p.magicDamage *= 1.45; p.magicCost = Math.max(15, p.magicCost - 5); } },
  { id: 'reach', icon: 'sword', apply: p => { p.reach += 28; p.knockback += 70; p.plungeRadius = Math.min(150, p.plungeRadius + 12); } },
  { id: 'mana', icon: 'gem', apply: p => { p.maxMp += 30; p.mp = p.maxMp; p.mpRegen *= 1.5; } },
  { id: 'dash', icon: 'wind', apply: p => { p.dashCooldown = Math.max(.35, p.dashCooldown * .7); p.dashShield += .1; p.thrustMul = Math.min(2.4, p.thrustMul + .35); p.perfectMp = Math.min(30, p.perfectMp + 8); } },
  { id: 'armor', icon: 'shield', apply: p => { p.armor *= .8; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  // Elemental relics: no stat change; core reads the stack count (see Game.stacks) when a hit lands.
  { id: 'fire', icon: 'star', apply: () => {} },
  { id: 'frost', icon: 'gem', apply: () => {} },
  { id: 'shock', icon: 'moon', apply: () => {} },
  { id: 'bleed', icon: 'drop', apply: () => {} },
];
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }
// Poise damage per source.
const POISE_DAMAGE = { combo: [0, 17, 17, 62], eclipse: 55, thrust: 35, plunge: 45 };

export class Game {
  constructor(onEvent = () => {}, seed = randomSeed()) {
    this.onEvent = onEvent;
    this.seed = seed;
    this.randomState = seed || 1;
    this.state = 'title';
    this.heldDir = 0;
    this.stage = 0;
    this.time = 0;
    this.elapsed = 0;
    this.kills = 0;
    this.souls = 0;
    this.relics = [];
    this.player = {
      x: 155, y: FLOOR, w: 28, h: 58, vx: 0, vy: 0, dir: 1, grounded: true, jumps: 0,
      hp: 100, maxHp: 100, mp: 100, maxMp: 100, damage: 24, magicDamage: 58, magicCost: 35,
      speed: 245, attackSpeed: 1, crit: .12, reach: 100, leech: 0, armor: 1, mpRegen: 8,
      knockback: 180, dashCooldown: .85, dashShield: 0, attack: 0, attackCd: 0,
      dash: 0, dashCd: 0, magicCd: 0, invulnerable: 0, combo: 0, comboWindow: 0,
      attackLen: .24, move: '', buffer: 0, thrustWindow: 0, thrustMul: 1.35, perfect: 0, otherInv: 0, dashBuf: 0, perfectUsed: false, perfectMp: 10, plunge: 0, plungeT: 0, plungeY: 0, plungeRadius: 90,
    };
    this.loadStage(0);
  }
  rand() { let t = this.randomState += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  start() { this.state = 'playing'; this.emit('stage', { stage: this.stage }); }
  loadStage(index) {
    this.stage = index;
    const spec = STAGES[index];
    this.worldWidth = spec.width;
    this.portalX = spec.width - 145;
    this.portalOpen = false;
    this.freeze = 0;
    this.projectiles = [];
    this.pickups = [];
    this.platforms = Array.from({ length: 5 }, (_, i) => ({ x: 360 + i * 360 + this.rand() * 65, y: FLOOR - 85 - (i % 2) * 54, w: 148 + this.rand() * 70, h: 18 }));
    this.enemies = [];
    for (let i = 0; i < spec.count; i++) {
      const roll = this.rand();
      const type = i % 4 === 1 ? 'bat' : index >= 2 && roll < .23 ? (this.rand() < .3 ? 'priest' : 'mage') : index >= 1 && roll < .58 ? (roll > .44 ? 'shield' : 'knight') : 'skeleton';
      this.spawnEnemy(type === 'knight' && this.rand() < .28 ? 'spear' : type, 540 + i * (spec.width - 900) / spec.count + this.rand() * 65, index);
    }
    if (index === 4) {
      this.spawnEnemy('boss', spec.width - 400, index);
      // Boss arena: the centre stays flat, two raised ledges near the edges are escape routes (rand above is still drawn, keeping the seed stream).
      this.platforms = [{ x: 60, y: FLOOR - 110, w: 190, h: 18 }, { x: spec.width - 250, y: FLOOR - 110, w: 190, h: 18 }];
    }
    this.totalEnemies = this.enemies.length;
    Object.assign(this.player, { x: 150, y: FLOOR, vx: 0, vy: 0, grounded: true, jumps: 0, attack: 0, attackCd: 0, dash: 0, dashCd: 0, invulnerable: .8, combo: 0, move: '', buffer: 0, thrustWindow: 0, perfect: 0, otherInv: 0, dashBuf: 0, perfectUsed: false, plunge: 0, plungeT: 0 });
  }
  spawnEnemy(type, x, stage = 0) {
    const maxPoise = { skeleton: 40, bat: 22, mage: 34, shield: 60, knight: 110, boss: 120, spear: 48, priest: 42 }[type];
    const boss = type === 'boss';
    const hp = boss ? 900 : (type === 'knight' ? 65 : type === 'shield' ? 55 : type === 'spear' ? 53 : type === 'priest' ? 54 : type === 'bat' ? 27 : 43) + stage * 12;
    this.enemies.push({ type, x, y: type === 'bat' ? FLOOR - 95 : FLOOR, baseY: FLOOR - 95, w: boss ? 64 : 27, h: boss ? 102 : type === 'bat' ? 28 : 58, vx: 0, dir: -1, hp, maxHp: hp, damage: boss ? 22 : 8 + stage * 2.5, speed: boss ? 75 : type === 'bat' ? 115 : type === 'knight' ? 57 : type === 'shield' ? 50 : type === 'spear' ? 77 : type === 'priest' ? 67 : 72, cd: 1 + this.rand(), tell: 0, flash: 0, stun: 0, guardBreak: 0, blessed: 0, blessCd: 0, blessRadius: 0, turn: 0, reface: 0, phase: this.rand() * 6, action: 0, poise: maxPoise, maxPoise, punishable: false, armor: 0, bossPhase: 1, pause: 0, recover: 0, travel: 0, chargeN: 0, move: '', lastMove: '', warn: null, burn: 0, burnDmg: 0, bleed: 0, bleedStacks: 0, dotT: 0, chill: 0, frozen: 0, freezeImmune: 0, frostMeter: 0, shock: 0 });
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.elapsed += dt;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    const p = this.player;
    for (const key of ['attack', 'attackCd', 'dash', 'dashCd', 'magicCd', 'invulnerable', 'comboWindow', 'buffer', 'thrustWindow', 'perfect', 'otherInv', 'dashBuf']) if (!(p.plunge && (key === 'buffer' || key === 'dashBuf'))) p[key] = Math.max(0, p[key] - dt); // buffered input waits out a plunge
    p.mp = Math.min(p.maxMp, p.mp + dt * p.mpRegen);
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (direction && p.dash <= 0) p.dir = direction;
    if (input.jump) this.jump();
    this.heldDir = direction;
    if (input.dash) this.dash();
    else if (p.dashBuf > 0) this.dash(true);
    if (input.magic) this.magic();
    if (p.dash > 0) { p.thrustWindow = Math.max(p.thrustWindow, .65); if (p.buffer > 0) p.buffer = .16; } // both timers run from the end of the dash
    if (p.buffer > 0 && p.attackCd <= 0 && p.dash <= 0 && !p.plunge) this.attack();
    if (input.attack) this.attack();
    if (p.plunge === 1 && (p.plungeT -= dt) <= 0) p.plunge = 2;
    if (p.plunge === 1) p.vy = 0; // hang for the wind-up
    if (p.plunge === 2) p.vy = Math.max(p.vy, 800);
    if (p.plunge === 3 && (p.plungeT -= dt) <= 0) { p.plunge = 0; p.move = ''; }
    if (p.plunge === 3) p.vx = 0;
    else if (p.dash > 0) p.vx = p.dir * 730;
    else if (p.attack > .035 && p.move === 'thrust') p.vx = p.dir * 420;
    else p.vx = direction * p.speed * (p.attack > 0 ? .65 : 1);
    p.x = clamp(p.x + p.vx * dt, 25, this.worldWidth - 30);
    const oldY = p.y;
    p.vy += 1550 * dt;
    p.y += p.vy * dt;
    p.grounded = false;
    if (p.vy >= 0) {
      let floor = FLOOR;
      for (const plat of this.platforms) if (oldY <= plat.y + 1 && p.y >= plat.y && p.x + p.w / 2 > plat.x && p.x - p.w / 2 < plat.x + plat.w) floor = Math.min(floor, plat.y);
      if (p.y >= floor) { p.y = floor; p.vy = 0; p.grounded = true; p.jumps = 0; }
    }
    if (p.plunge === 2) this.plungeHit(oldY);
    if (p.attack > .035) this.hitTargets();
    for (const e of this.enemies) if (e.hp > 0) this.updateEnemy(e, dt);
    if (this.state !== 'playing') return;
    for (const b of this.projectiles) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (Math.abs(b.x - p.x) < p.w / 2 + b.r && b.y > p.y - p.h && b.y < p.y + 4) {
        this.hurt(b.damage, Math.sign(b.vx)); b.life = 0; // a shot that meets the hero is consumed, also while a dash shields them
        if (this.state !== 'playing') return;
      }
    }
    this.projectiles = this.projectiles.filter(b => b.life > 0 && b.x > 0 && b.x < this.worldWidth);
    for (const item of this.pickups) {
      item.age += dt;
      const d = Math.hypot(item.x - p.x, item.y - (p.y - 25));
      if (d < 155) { item.x += (p.x - item.x) * dt * 6; item.y += (p.y - 25 - item.y) * dt * 6; }
      if (d < 25) { p.hp = Math.min(p.maxHp, p.hp + 14); item.dead = true; this.emit('heal', { x: p.x, y: p.y - 70, amount: 14 }); }
    }
    this.pickups = this.pickups.filter(i => !i.dead);
    if (!this.portalOpen && this.enemies.every(e => e.hp <= 0)) { this.portalOpen = true; this.emit('clear'); }
    if (this.state === 'playing' && this.portalOpen && Math.abs(p.x - this.portalX) < 46 && p.y > FLOOR - 80) this.finishStage();
  }
  jump() {
    const p = this.player;
    if (p.jumps >= 2 || p.dash > 0 || p.plunge) return;
    p.vy = p.jumps === 0 ? -575 : -520;
    p.jumps++; p.grounded = false;
    this.emit('jump', { x: p.x, y: p.y, double: p.jumps === 2 });
  }
  dash(fromBuffer = false) {
    const p = this.player;
    if (p.dashCd > 0 || p.plunge || p.attack > p.attackLen * .26) { if (!fromBuffer) p.dashBuf = .16; return; } // an attack can only be cancelled after 74% of it has played
    p.attack = 0; p.dashBuf = 0; p.otherInv = p.invulnerable; p.perfect = .15; p.perfectUsed = false;
    p.dash = .18; p.dashCd = p.dashCooldown; p.invulnerable = Math.max(p.invulnerable, .23 + p.dashShield); p.vy = Math.min(p.vy, 0);
    this.emit('dash', { x: p.x, y: p.y, dir: p.dir });
  }
  attack() {
    const p = this.player;
    if (p.attackCd > 0 || p.dash > 0 || p.plunge) { p.buffer = .16; return; }
    p.buffer = 0;
    if (!p.grounded) { // air attack wins over a thrust; it neither advances nor resets the combo
      Object.assign(p, { plunge: 1, plungeT: .07, plungeY: p.y, move: 'plunge', attack: 0, thrustWindow: 0 });
      this.hitSet = new Set(); this.flameUsed = false;
      this.emit('swing', { x: p.x, y: p.y - 30, dir: p.dir, combo: p.combo, move: 'plunge' });
      return;
    }
    const thrust = p.thrustWindow > 0;
    if (thrust && !this.heldDir) { // auto-face a living enemy within 200 (facing side first, else nearest) when no direction is held
      const near = this.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) <= 200).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
      const t = near.find(e => (e.x - p.x) * p.dir > 0) || near[0]; // prefer the facing side
      if (t && t.x !== p.x) p.dir = Math.sign(t.x - p.x);
    }
    if (thrust) p.thrustWindow = 0; // a thrust neither advances nor resets the combo
    else { p.combo = p.comboWindow > 0 ? p.combo % 3 + 1 : 1; p.comboWindow = .8; }
    p.move = thrust ? 'thrust' : '';
    p.attack = p.attackLen = .24; p.attackCd = (thrust ? .34 : p.combo === 3 ? .39 : .29) * p.attackSpeed;
    this.hitSet = new Set(); this.flameUsed = false;
    this.emit('swing', { x: p.x, y: p.y - 30, dir: p.dir, combo: p.combo, move: thrust ? 'thrust' : 'combo' });
    this.hitTargets();
  }
  hitTargets() {
    const p = this.player;
    const thrust = p.move === 'thrust';
    const reach = thrust ? 155 : p.reach + (p.combo === 3 ? 24 : 0);
    for (const e of this.enemies) {
      const dx = (e.x - p.x) * p.dir;
      if (e.hp <= 0 || this.hitSet?.has(e) || dx < -e.w / 2 || dx > reach + e.w / 2 || (thrust ? e.y < p.y - 48 || e.y - e.h > p.y - 18 : e.y < p.y - 88 || e.y - e.h > p.y - 4)) continue;
      this.hitSet?.add(e);
      const crit = this.rand() < p.crit;
      const amount = Math.round(p.damage * (thrust ? p.thrustMul : [1, 1, 1.15, 1.8][p.combo]) * (crit ? 2 : 1));
      // Shield bearers block sword hits from the side they face unless Eclipse broke their guard.
      const blocked = e.type === 'shield' && e.guardBreak <= 0 && (p.x - e.x) * e.dir >= 0;
      this.damageEnemy(e, blocked ? Math.max(1, Math.round(amount * .15)) : amount, p.dir, crit, thrust || p.combo === 3, blocked, thrust ? POISE_DAMAGE.thrust : POISE_DAMAGE.combo[p.combo]);
      p.mp = Math.min(p.maxMp, p.mp + 2);
    }
  }
  // Plunge hits: sword-style damage, never blocked (it comes from above); the fall and the landing shockwave share this.hitSet.
  plungeStrike(e, mul, poise, knock) {
    const p = this.player, crit = this.rand() < p.crit;
    this.hitSet.add(e);
    this.damageEnemy(e, Math.round(p.damage * mul * (crit ? 2 : 1)), Math.sign(e.x - p.x) || p.dir, crit, true, false, poise, false, knock);
    p.mp = Math.min(p.maxMp, p.mp + 2);
  }
  plungeHit(oldY) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0 || this.hitSet.has(e) || Math.abs(e.x - p.x) > (e.w + p.w) / 2 || e.y < oldY - p.h || e.y - e.h > p.y) continue;
      this.plungeStrike(e, 1.25, POISE_DAMAGE.plunge, 1);
    }
    if (!p.grounded) return;
    const radius = p.y - p.plungeY >= 40 ? p.plungeRadius : 0; // short drops: fall hits only, radius 0 = no shockwave
    p.plunge = 3; p.plungeT = .09;
    this.emit('plunge', { x: p.x, y: p.y, radius });
    if (!radius) return;
    for (const e of this.enemies) {
      if (e.hp <= 0 || this.hitSet.has(e) || Math.abs(e.x - p.x) > radius + e.w / 2 || e.y < p.y - 100 || e.y - e.h > p.y + 4) continue;
      this.plungeStrike(e, 1, POISE_DAMAGE.plunge, 1.4);
    }
  }
  magic() {
    const p = this.player;
    if (p.mp < p.magicCost || p.magicCd > 0) { if (p.magicCd <= 0) this.emit('noMana'); return; }
    p.mp -= p.magicCost; p.magicCd = .65; p.invulnerable = Math.max(p.invulnerable, .28);
    this.emit('magic', { x: p.x, y: p.y - 32 });
    this.flameUsed = false;
    for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 210) {
      this.damageEnemy(e, Math.round(p.magicDamage), Math.sign(e.x - p.x) || p.dir, false, true, false, POISE_DAMAGE.eclipse, true);
      if (e.type === 'shield' && e.hp > 0) { e.guardBreak = 1.5; this.emit('guardBreak', { x: e.x, y: e.y - e.h * .55, dir: e.dir, duration: e.guardBreak }); }
    }
    this.projectiles = this.projectiles.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > 230);
  }
  damageEnemy(e, amount, dir, crit, heavy, blocked = false, poiseDamage = 0, eclipse = false, knock = 1) {
    e.hp -= amount; e.flash = .14;
    const armored = e.armor > 0; // post-stagger armor: damage lands, but no poise damage, flinch or knockback
    if (e.hp > 0 && !armored) e.poise -= poiseDamage * (blocked ? .25 : 1) * (e.punishable ? 2 : 1);
    const broken = e.hp > 0 && e.poise <= 0;
    // The boss deliberately keeps its warning but still takes a 0.08 s hit stun (see the stun line below).
    const keepsTell = (e.type === 'knight' || e.type === 'boss') && e.tell > 0 && !broken && !(eclipse && e.type !== 'boss'); // light hits don't interrupt heavy enemies
    if (blocked) {
      // A block keeps the enemy's footing and its bash wind-up, and pushes the player away from the shield.
      const p = this.player;
      p.x = clamp(p.x + e.dir * 40, 25, this.worldWidth - 30);
      // Shield shove: the bearer follows the pushback so blocking never opens distance.
      e.x = clamp(e.x + e.dir * Math.min(40, Math.max(0, Math.abs(p.x - e.x) - 30)), 30, this.worldWidth - 40);
      this.freeze = Math.max(this.freeze, .035);
      this.emit('block', { x: e.x + e.dir * e.w / 2, y: e.y - e.h * .55, amount, dir: e.dir });
    } else {
      const quiet = armored && !(eclipse && e.type !== 'boss'); // Eclipse still interrupts armored non-bosses
      if (!quiet && (!keepsTell || e.type === 'boss')) {
        e.stun = Math.max(e.stun, e.type === 'boss' ? .08 : heavy ? .42 : .24);
        e.vx = dir * this.player.knockback * (heavy ? 1.6 : 1) * knock * (e.type === 'boss' ? .25 : 1);
      } else if (!quiet && e.type === 'knight') e.vx = dir * this.player.knockback * (heavy ? 1.6 : 1) * knock * .4;
      if (!quiet && !keepsTell && e.type !== 'boss') { if (e.blessRadius) e.blessCd = 2.5; e.tell = 0; e.thrustBox = null; e.blessRadius = 0; }
      this.freeze = Math.max(this.freeze, heavy || crit ? .065 : .035);
      this.emit('hit', { x: e.x, y: e.y - e.h * .55, amount, dir, crit, heavy });
    }
    if (broken) this.stagger(e);
    this.settle(e);
    if (!blocked) this.elements(e, amount, heavy, eclipse); // hook: attack-form projectiles (none yet) should call this too
  }
  // Boss phase change and death handling, shared by sword hits and damage-over-time / reaction damage.
  settle(e) {
    if (e.hp > 0 && e.type === 'boss') {
      const phase = e.hp <= e.maxHp * .34 ? 3 : e.hp <= e.maxHp * .67 ? 2 : 1;
      if (phase > e.bossPhase) this.enterPhase(e, phase);
    }
    if (e.hp <= 0) {
      e.hp = 0;
      const p = this.player;
      if (this.state === 'playing') { // no credit, leech or MP once the hero is dead or the run ended
        this.kills++; this.souls += e.type === 'boss' ? 100 : e.type === 'knight' ? 15 : 10;
        p.hp = Math.min(p.maxHp, p.hp + p.leech); p.mp = Math.min(p.maxMp, p.mp + 6);
      }
      this.emit('kill', { x: e.x, y: e.y - e.h * .5, boss: e.type === 'boss' });
      if (this.rand() < .25) this.pickups.push({ x: e.x, y: Math.min(FLOOR - 20, e.y - 20), age: 0 });
    }
  }
  stacks(id) { return this.relics.filter(r => r === id).length; }
  // Elemental damage: no hit-stop, flinch, poise damage or new statuses. Art listens to 'statusTick'.
  elemDamage(e, amount, source) {
    amount = Math.max(1, Math.round(amount));
    e.hp -= amount;
    this.emit('statusTick', { source, x: e.x, y: e.y - e.h * .55, amount });
    this.settle(e);
  }
  // Statuses and reactions for one landed, unblocked sword/Eclipse hit. Reactions read the pre-hit state, then the hit applies its statuses.
  elements(e, amount, heavy, eclipse) {
    const fire = this.stacks('fire'), frost = this.stacks('frost'), shock = this.stacks('shock'), bleed = this.stacks('bleed');
    if (!(fire || frost || shock || bleed)) return;
    const base = this.player.damage, mid = o => ({ x: o.x, y: o.y - o.h * .55 });
    const dist = o => Math.hypot(o.x - e.x, (o.y - o.h * .55) - (e.y - e.h * .55));
    const alive = () => this.enemies.filter(o => o.hp > 0);
    if (heavy && frost && e.frozen > 0) { // Shatter
      const radius = 130 + 10 * frost;
      e.frozen = 0; if (e.type !== 'boss') e.freezeImmune = 2;
      this.emit('reaction', { name: 'shatter', ...mid(e), radius });
      for (const o of alive().filter(o => dist(o) <= radius)) this.elemDamage(o, base * (1 + .65 * frost), 'shatter');
    }
    if (heavy && fire && e.bleedStacks > 0 && !this.flameUsed) { // Blood Flame, once per attack or Eclipse cast
      this.flameUsed = true;
      const n = e.bleedStacks, radius = 115;
      e.bleed = 0; e.bleedStacks = 0;
      this.emit('reaction', { name: 'bloodFlame', ...mid(e), radius });
      for (const o of alive().filter(o => dist(o) <= radius)) this.elemDamage(o, (.7 + .3 * n) * base * (1 + .3 * fire), 'bloodFlame');
    }
    if (shock && !eclipse && e.shock > 0) { // Chain (sword hits only) Lightning
      const targets = alive().filter(o => o !== e && dist(o) <= 180 + 14 * shock).sort((a, b) => dist(a) - dist(b)).slice(0, 2 + shock);
      if (targets.length) {
        this.emit('reaction', { name: 'chain', ...mid(e), targets: targets.map(mid) });
        for (const o of targets) { this.elemDamage(o, (.35 * base + .12 * amount) * shock, 'chain'); if (o.hp > 0) o.shock = 4; }
      }
    }
    if (e.hp <= 0) return;
    const at = mid(e), boss = e.type === 'boss';
    if (fire) { e.burn = 4; e.burnDmg = .14 * base * fire; this.emit('status', { name: 'burn', ...at }); }
    if (shock) { e.shock = 4; this.emit('status', { name: 'shock', ...at }); }
    if (bleed) { e.bleed = 5; e.bleedStacks = Math.min(10 * bleed, e.bleedStacks + bleed); this.emit('status', { name: 'bleed', ...at, stacks: e.bleedStacks }); }
    if (frost) {
      e.chill = 2.5; e.frostT = 3;
      if (e.frozen <= 0 && e.freezeImmune <= 0) e.frostMeter += frost + (eclipse ? 1 : 0);
      if (e.frostMeter >= 3) {
        e.frostMeter = 0;
        if (e.freezeImmune <= 0 && e.frozen <= 0) { // the boss freezes briefly, then ignores freezing for a while
          e.frozen = boss ? .28 : Math.min(1.5, .75 + .12 * frost);
          if (boss) e.freezeImmune = .28 + 1.8;
          this.cancelAttack(e);
          this.emit('status', { name: 'frozen', ...at, duration: e.frozen });
        }
      } else this.emit('status', { name: 'chill', ...at });
      this.elemDamage(e, .08 * base * frost, 'frost');
    }
  }
  // Status timers and damage-over-time (every 0.5 s), run each frame for a living enemy.
  tickStatus(e, dt) {
    const wasFrozen = e.frozen > 0;
    for (const k of ['chill', 'frozen', 'freezeImmune', 'shock']) e[k] = Math.max(0, e[k] - dt);
    if (wasFrozen && e.frozen <= 0 && e.type !== 'boss') e.freezeImmune = 2; // thawed: normal enemies get a window to act
    if (e.frostMeter > 0 && (e.frostT = (e.frostT || 0) - dt) <= 0) e.frostMeter = 0; // meter decays 3 s after the last frost hit
    if (e.burn <= 0 && e.bleed <= 0) { e.dotT = 0; return; }
    const burning = e.burn > 0, stacks = e.bleed > 0 ? e.bleedStacks : 0; // a tick landing on the frame a timer expires still counts
    e.burn = Math.max(0, e.burn - dt); e.bleed = Math.max(0, e.bleed - dt);
    if (e.bleed <= 0) e.bleedStacks = 0;
    e.dotT += dt;
    while (e.dotT >= .5 && e.hp > 0) {
      e.dotT -= .5;
      if (burning) this.elemDamage(e, e.burnDmg, 'burn');
      if (e.hp > 0 && stacks) this.elemDamage(e, .1 * this.player.damage * stacks, 'bleed');
    }
  }
  enterPhase(e, phase) {
    Object.assign(e, { bossPhase: phase, tell: 0, warn: null, move: '', travel: 0, recover: 0, punishable: false, poise: e.maxPoise, pause: 1.1 });
    this.emit('bossPhase', { phase, x: e.x, y: e.y - e.h * .5 });
  }
  cancelAttack(e) {
    if (e.blessRadius) e.blessCd = 2.5;
    e.warn = null; e.move = ''; e.travel = 0; e.recover = 0;
    e.tell = 0; e.thrustBox = null; e.blessRadius = 0; e.punishable = false;
  }
  stagger(e) {
    this.cancelAttack(e); e.poise = e.maxPoise;
    e.stun = e.type === 'boss' ? .85 : 1;
    e.armor = e.stun + (e.type === 'boss' ? .6 : 1.2); // counts down with the stun, so 1.2 s (boss 0.6 s) of armor remain once it ends
    if (e.type === 'shield') e.guardBreak = Math.max(e.guardBreak, e.stun); // guard is down for the stun
    this.freeze = Math.max(this.freeze, .055);
    this.emit('stagger', { x: e.x, y: e.y - e.h * .55, boss: e.type === 'boss' });
  }
  // Wind-up limiter: at most 2 (stages 1-3) or 3 (stages 4-5) enemies near the hero may be winding up at once; far enemies never start.
  canWindUp(e) {
    const p = this.player;
    if (Math.abs(p.x - e.x) > (e.type === 'boss' ? 620 : 560)) return false;
    return this.enemies.filter(o => o !== e && o.hp > 0 && o.tell > 0 && Math.abs(p.x - o.x) <= 620).length < (this.stage >= 3 ? 3 : 2);
  }
  updateEnemy(e, dt) {
    e.blessed = Math.max(0, e.blessed - dt); e.blessCd = Math.max(0, e.blessCd - dt);
    this.tickStatus(e, dt);
    if (e.hp <= 0) return;
    const speed = e.speed;
    if (e.blessed > 0) e.speed *= 1.15;
    if (e.chill > 0) e.speed *= e.type === 'boss' ? .85 : .68;
    this.moveEnemy(e, dt);
    e.speed = speed;
  }
  moveEnemy(e, dt) {
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.armor = Math.max(0, e.armor - dt);
    e.guardBreak = Math.max(0, e.guardBreak - dt);
    if (e.frozen > 0) { e.vx = 0; return; } // frozen: cannot move or attack (warnings were cancelled)
    const wasTurning = e.turn > 0;
    e.turn = Math.max(0, e.turn - dt);
    if (e.stun > 0) { e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); e.vx *= Math.exp(-dt * 8); return; }
    const dx = p.x - e.x, distance = Math.abs(dx);
    const face = dx >= 0 ? 1 : -1;
    if (e.type === 'boss') { if (!(e.tell > 0 || e.travel > 0)) e.dir = face; } // boss facing is locked while warning and charging
    else if (e.type !== 'shield' && !(e.type === 'spear' && e.tell > 0)) e.dir = face; // spear facing is locked during the warning
    else if (e.tell > 0 || e.turn > 0) e.reface = 0; // facing locked during the bash warning and the post-bash turn delay
    else if (wasTurning) e.dir = face; // the turn delay just ended: face at once, no re-face delay on top
    else if (dx * e.dir >= 0) e.reface = 0;
    else if ((e.reface += dt) >= .25) { e.dir = face; e.reface = 0; } // player behind: re-face delay
    if (!(e.tell > 0) && !(e.travel > 0) && distance > (e.type === 'boss' ? 750 : 590)) { e.vx = 0; return; } // a started warning always counts down
    if (e.tell > 0) {
      e.tell -= dt; e.vx = 0;
      if (e.tell <= 0) this.enemyAttack(e);
      return;
    }
    if (e.travel > 0) { this.bossCharge(e, dt, face); return; }
    if (e.type === 'bat') {
      e.y += ((p.y - 34 + Math.sin(this.time * 4 + e.phase) * 15) - e.y) * dt * 1.6;
      e.vx = e.dir * e.speed; e.x += e.vx * dt;
      if (distance < 30 && Math.abs(e.y - (p.y - 25)) < 40 && e.cd <= 0 && this.canWindUp(e)) { e.tell = .36; e.cd = 1.3; }
    } else if (e.type === 'mage') {
      if (distance < 460 && e.cd <= 0 && this.canWindUp(e)) { e.tell = .65; e.cd = 2.4 - this.stage * .13; }
      else if (distance > 320) { e.vx = e.dir * e.speed * .6; e.x += e.vx * dt; }
      else e.vx = 0;
    } else if (e.type === 'priest') {
      const near = this.enemies.filter(o => o !== e && o.hp > 0 && o.type !== 'boss' && Math.abs(o.x - e.x) <= 250);
      if (near.length && e.blessCd <= 0 && this.canWindUp(e)) { e.tell = .9; e.blessRadius = 250; e.vx = 0; }
      else if (distance < 460 && e.cd <= 0 && this.canWindUp(e)) { e.tell = .9; e.cd = 2.4 - this.stage * .13; }
      else { e.vx = distance > 335 ? e.dir * e.speed : distance < 185 ? -e.dir * e.speed : 0; e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); }
    } else if (e.type === 'boss') {
      e.pause = Math.max(0, e.pause - dt); e.recover = Math.max(0, e.recover - dt);
      const move = e.pause <= 0 && e.recover <= 0 && e.cd <= 0 && this.canWindUp(e) ? this.bossPick(e, distance) : '';
      if (move) this.bossStart(e, move);
      else { e.vx = e.pause <= 0 && e.recover <= 0 && distance > 95 ? e.dir * e.speed : 0; e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); }
    } else if (e.type === 'spear') {
      if (e.turn > 0) e.vx = 0; // recovery after the thrust
      else if (distance <= 193 && Math.abs(p.y - e.y) < 64 && e.cd <= 0 && this.canWindUp(e)) {
        e.tell = .64; e.cd = Math.max(1.2, 2.2 - this.stage * .12); e.vx = 0;
        const x0 = e.x + e.dir * 10, x1 = e.x + e.dir * 194;
        e.thrustBox = { x: Math.min(x0, x1), y: e.y - 54, w: 184, h: 54 };
      } else { e.vx = distance > 145 ? e.dir * e.speed : distance < 80 ? -e.dir * e.speed * .8 : 0; e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); }
    } else if (e.turn > 0 || e.reface > 0) {
      e.vx = 0; // shield bearer recovering from a bash or about to turn: holds its old facing, leaving its back open
    } else {
      if (distance < (e.type === 'shield' ? 70 : 60) && Math.abs(p.y - e.y) < 82 && e.cd <= 0 && this.canWindUp(e)) { e.tell = e.type === 'knight' ? .6 : e.type === 'shield' ? .55 : .43; e.cd = Math.max(.9, 1.7 - this.stage * .12); }
      else { e.vx = distance > 45 ? e.dir * e.speed : 0; e.x += e.vx * dt; }
    }
  }
  // Boss move choice: never the same move twice in a row; null-like '' means walk closer.
  bossPick(e, distance) {
    const ph = e.bossPhase;
    let list = (ph === 3 && e.action % 3 === 2 ? ['ritual'] : []).filter(m => m !== e.lastMove);
    if (!list.length) {
      const pool = distance < 145 ? ['slash', 'slam'] : ph >= 2 && distance > 170 ? ['charge', 'volley'] : ['charge'];
      list = pool.filter(m => m !== e.lastMove);
      if (!list.length) list = pool; // nothing else is legal at this range: repeat rather than only walk
    }
    return list[Math.floor(this.rand() * list.length)];
  }
  // Starts a boss warning and exposes its exact hit area in e.warn (box / line / lines / circles / wave), which bossAttack reads back.
  bossStart(e, move, tell) {
    const p = this.player, d = e.dir, o = { x: e.x, y: e.y - e.h * .6 };
    const front = (len, h) => ({ x: Math.min(e.x, e.x + d * len), y: e.y - h, w: len, h });
    const warn = { kind: move };
    e.move = move; e.lastMove = move; e.vx = 0; e.punishable = false;
    if (move === 'slash') { e.tell = tell || .62; warn.box = front(146, e.h); }
    else if (move === 'slam') {
      e.tell = .88; e.punishable = true; warn.box = front(112, 123);
      if (e.bossPhase >= 2) warn.wave = { x1: e.x + d * 40, y1: FLOOR - 6, x2: e.x + d * 760, y2: FLOOR - 6 };
    } else if (move === 'charge') {
      e.tell = .82; e.chargeTo = clamp(e.x + d * 305, 30, this.worldWidth - 40);
      warn.line = { x1: e.x, y1: e.y - e.h * .5, x2: e.chargeTo, y2: e.y - e.h * .5 };
      warn.box = { x: Math.min(e.x, e.chargeTo) - e.w / 2, y: e.y - e.h, w: Math.abs(e.chargeTo - e.x) + e.w, h: e.h };
    } else if (move === 'volley') {
      e.tell = .92; warn.base = Math.atan2(p.y - 30 - o.y, p.x - o.x);
      warn.lines = [-.5, -.25, 0, .25, .5].map(a => ({ x1: o.x, y1: o.y, x2: o.x + Math.cos(warn.base + a) * VOLLEY_RANGE, y2: o.y + Math.sin(warn.base + a) * VOLLEY_RANGE, angle: warn.base + a }));
    } else {
      e.tell = 1.28; e.punishable = true;
      warn.circles = [-200, 0, 200].map(dx => ({ x: p.x + dx, y: e.y, r: 56 }));
    }
    e.warn = warn;
  }
  bossCharge(e, dt, face) {
    const p = this.player, step = (e.chargeTo - e.x) * Math.min(1, dt / e.travel);
    e.travel -= dt; e.x += step; e.vx = step / dt;
    if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) this.hurt(e.damage * 1.1, e.dir); // i-frames after a hit (0.8 s) outlast the 0.48 s charge: once per charge
    if (e.travel > 0) return;
    e.x = e.chargeTo; e.vx = 0; e.move = ''; e.cd = 1; e.chargeN++;
    e.dir = face;
    if (e.bossPhase >= 2 && e.chargeN % 2 === 0 && Math.abs(p.x - e.x) <= 190 && this.canWindUp(e)) this.bossStart(e, 'slash', .46);
  }
  bossAttack(e, dmg) {
    const p = this.player, w = e.warn, move = e.move;
    const overlaps = b => p.x + p.w / 2 > b.x && p.x - p.w / 2 < b.x + b.w && p.y > b.y && p.y - p.h < b.y + b.h;
    e.warn = null; e.move = move === 'charge' ? move : '';
    if (move === 'charge') { e.travel = .48; this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: true, kind: 'charge', area: w }); return; }
    this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: true, kind: move, area: w });
    if (move === 'slash') { if (overlaps(w.box)) this.hurt(dmg, e.dir); e.cd = 1.2; }
    else if (move === 'slam') {
      if (overlaps(w.box)) this.hurt(dmg * 1.3, e.dir);
      if (w.wave) this.projectiles.push({ x: w.wave.x1, y: w.wave.y1, vx: e.dir * 240, vy: 0, r: 14, life: 3, damage: dmg * .7, ground: true });
      e.cd = e.recover = 1;
    } else if (move === 'volley') {
      for (const l of w.lines) this.projectiles.push({ x: l.x1, y: l.y1, vx: Math.cos(l.angle) * 265, vy: Math.sin(l.angle) * 265, r: 9, life: (VOLLEY_RANGE - 9) / 265, damage: dmg });
      e.cd = 1.4;
    } else {
      // circles are ground-centred discs: a grounded hero inside one is hit, a gap or a high jump is safe
      const hit = w.circles.some(c => Math.hypot(c.x - clamp(c.x, p.x - p.w / 2, p.x + p.w / 2), c.y - clamp(c.y, p.y - p.h, p.y)) < c.r);
      if (hit) this.hurt(dmg * 1.35, Math.sign(p.x - e.x) || 1);
      e.cd = 1.5;
    }
  }
  enemyAttack(e) {
    const p = this.player;
    e.punishable = false;
    const dmg = e.damage * (e.blessed > 0 ? 1.25 : 1);
    if (e.blessRadius) {
      const targets = this.enemies.filter(o => o !== e && o.hp > 0 && o.type !== 'boss' && Math.abs(o.x - e.x) <= e.blessRadius);
      for (const o of targets) o.blessed = 5;
      e.blessRadius = 0; e.blessCd = 7; e.cd = Math.max(e.cd, 1);
      this.emit('enemyBuff', { x: e.x, y: e.y - e.h * .5, targets: targets.map(o => ({ x: o.x, y: o.y - o.h * .5 })) });
    } else if (e.type === 'boss') {
      this.bossAttack(e, dmg);
    } else if (e.type === 'mage' || e.type === 'priest') {
      const base = Math.atan2(p.y - 30 - (e.y - e.h * .6), p.x - e.x);
      this.projectiles.push({ x: e.x, y: e.y - e.h * .6, vx: Math.cos(base) * 250, vy: Math.sin(base) * 250, r: 7, life: 4, damage: dmg });
    } else if (e.type === 'spear') {
      const b = e.thrustBox; e.turn = .72; e.thrustBox = null;
      this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: false, kind: 'spear' });
      if (b && p.x + p.w / 2 > b.x && p.x - p.w / 2 < b.x + b.w && p.y > b.y && p.y - p.h < b.y + b.h) this.hurt(dmg, e.dir);
    } else {
      const range = e.type === 'bat' ? 55 : e.type === 'shield' ? 70 : 82;
      if (e.type === 'shield') e.turn = .6;
      this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: false });
      if (Math.abs(p.x - e.x) < range && (e.type !== 'shield' || (p.x - e.x) * e.dir >= 0) && Math.abs(p.y - e.y) < (e.type === 'bat' ? 58 : 77)) this.hurt(dmg, e.dir);
    }
    e.action++;
  }
  // The first 0.15 s of a dash is a perfect window: one ignored hit per dash pays MP and refreshes the thrust window.
  perfectDodge() {
    const p = this.player;
    if (p.perfect <= 0 || p.perfectUsed || p.otherInv > 0) return; // only if the dash itself stopped the hit
    p.perfectUsed = true; p.mp = Math.min(p.maxMp, p.mp + p.perfectMp); p.thrustWindow = Math.max(p.thrustWindow, .9);
    this.freeze = Math.max(this.freeze, .05);
    this.emit('perfectDash', { x: p.x, y: p.y - 30 });
  }
  hurt(amount, dir) {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (p.invulnerable > 0) { this.perfectDodge(); return; }
    const actual = Math.round(amount * p.armor);
    p.hp = Math.max(0, p.hp - actual); p.invulnerable = .8;
    p.x = clamp(p.x + dir * 20, 25, this.worldWidth - 30);
    this.freeze = .06;
    this.emit('hurt', { x: p.x, y: p.y - 30, amount: actual });
    if (p.hp === 0) { this.state = 'dead'; p.plunge = 0; p.move = ''; this.emit('death'); }
  }
  finishStage() {
    this.player.plunge = 0; this.player.move = '';
    if (this.stage === 4) { this.state = 'won'; this.emit('win'); return; }
    this.state = 'upgrade';
    this.choices = [...RELICS];
    for (let i = this.choices.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.choices[i], this.choices[j]] = [this.choices[j], this.choices[i]]; }
    this.choices = this.choices.slice(0, 3);
    this.emit('upgrade', { choices: this.choices });
  }
  chooseRelic(id) {
    if (this.state !== 'upgrade') return false;
    const relic = this.choices.find(r => r.id === id);
    if (!relic) return false;
    relic.apply(this.player); this.relics.push(relic.id);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
    this.player.mp = this.player.maxMp;
    this.loadStage(this.stage + 1); this.state = 'playing';
    this.emit('stage', { stage: this.stage });
    return true;
  }
}