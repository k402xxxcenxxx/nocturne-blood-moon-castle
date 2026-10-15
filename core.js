export const FLOOR = 438;
export const STAGES = [
  { name: '荒廢城門', en: 'THE FORSAKEN GATE', subtitle: '血月初升，長夜將至。', count: 7, width: 2260 },
  { name: '禁忌書庫', en: 'THE FORBIDDEN ARCHIVE', subtitle: '那些書頁，仍在低聲呼吸。', count: 9, width: 2500 },
  { name: '永夜鐘塔', en: 'THE TIMELESS BELFRY', subtitle: '午夜的鐘聲，為誰而鳴。', count: 11, width: 2740 },
  { name: '緋紅聖堂', en: 'THE CRIMSON CATHEDRAL', subtitle: '祈禱已逝，唯有利刃。', count: 13, width: 3000 },
  { name: '血月王座', en: 'THE BLOODMOON THRONE', subtitle: '以你的劍，終結這場永夜。', count: 9, width: 2800 },
];
export const RELICS = [
  { id: 'edge', icon: 'sword', name: '渴血之刃', type: '力量', text: '所有普通攻擊傷害提升 25%。', apply: p => p.damage *= 1.25 },
  { id: 'haste', icon: 'wind', name: '疾風之羽', type: '迅捷', text: '連斬速度提升 18%，移動速度提升 8%。', apply: p => { p.attackSpeed *= .82; p.speed *= 1.08; } },
  { id: 'crit', icon: 'star', name: '獵人的凝視', type: '暴擊', text: '暴擊機率增加 18%。暴擊造成雙倍傷害。', apply: p => p.crit = Math.min(.8, p.crit + .18) },
  { id: 'vital', icon: 'heart', name: '不朽之心', type: '生存', text: '生命上限增加 30，並恢復 40 點生命。', apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 40); } },
  { id: 'leech', icon: 'drop', name: '猩紅契約', type: '汲取', text: '每次擊殺敵人，額外恢復 5 點生命。', apply: p => p.leech += 5 },
  { id: 'arcane', icon: 'moon', name: '月蝕秘典', type: '魔法', text: '月蝕魔法傷害提升 45%，魔力消耗降低 5。', apply: p => { p.magicDamage *= 1.45; p.magicCost = Math.max(15, p.magicCost - 5); } },
  { id: 'reach', icon: 'sword', name: '幽魂長鋒', type: '範圍', text: '劍刃攻擊範圍增加 28，擊退效果提升。', apply: p => { p.reach += 28; p.knockback += 70; } },
  { id: 'mana', icon: 'gem', name: '星夜結晶', type: '魔力', text: '魔力上限增加 30，魔力恢復速度提升 50%。', apply: p => { p.maxMp += 30; p.mp = p.maxMp; p.mpRegen *= 1.5; } },
  { id: 'dash', icon: 'wind', name: '渡鴉之影', type: '閃避', text: '衝刺冷卻縮短 30%，無敵時間延長。', apply: p => { p.dashCooldown *= .7; p.dashShield += .1; } },
  { id: 'armor', icon: 'shield', name: '黯銀護符', type: '防禦', text: '受到的傷害降低 20%，並恢復 20 點生命。', apply: p => { p.armor *= .8; p.hp = Math.min(p.maxHp, p.hp + 20); } },
];
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }
export class Game {
  constructor(onEvent = () => {}, seed = randomSeed()) {
    this.onEvent = onEvent;
    this.seed = seed;
    this.randomState = seed || 1;
    this.state = 'title';
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
      const type = i % 4 === 1 ? 'bat' : index >= 2 && roll < .23 ? 'mage' : index >= 1 && roll < .58 ? 'knight' : 'skeleton';
      this.spawnEnemy(type, 540 + i * (spec.width - 900) / spec.count + this.rand() * 65, index);
    }
    if (index === 4) this.spawnEnemy('boss', spec.width - 400, index);
    this.totalEnemies = this.enemies.length;
    Object.assign(this.player, { x: 150, y: FLOOR, vx: 0, vy: 0, grounded: true, jumps: 0, attack: 0, attackCd: 0, dash: 0, dashCd: 0, invulnerable: .8, combo: 0 });
  }
  spawnEnemy(type, x, stage) {
    const boss = type === 'boss';
    const hp = boss ? 640 : (type === 'knight' ? 65 : type === 'bat' ? 27 : 43) + stage * 12;
    this.enemies.push({ type, x, y: type === 'bat' ? FLOOR - 95 : FLOOR, baseY: FLOOR - 95, w: boss ? 64 : 27, h: boss ? 102 : type === 'bat' ? 28 : 58, vx: 0, dir: -1, hp, maxHp: hp, damage: boss ? 22 : 8 + stage * 2.5, speed: boss ? 75 : type === 'bat' ? 115 : type === 'knight' ? 57 : 72, cd: 1 + this.rand(), tell: 0, flash: 0, stun: 0, phase: this.rand() * 6, action: 0 });
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.elapsed += dt;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    const p = this.player;
    for (const key of ['attack', 'attackCd', 'dash', 'dashCd', 'magicCd', 'invulnerable', 'comboWindow']) p[key] = Math.max(0, p[key] - dt);
    p.mp = Math.min(p.maxMp, p.mp + dt * p.mpRegen);
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (direction && p.dash <= 0) p.dir = direction;
    if (input.jump) this.jump();
    if (input.dash) this.dash();
    if (input.magic) this.magic();
    if (input.attack) this.attack();
    if (p.dash > 0) p.vx = p.dir * 730;
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
    if (p.attack > .035) this.hitTargets();
    for (const e of this.enemies) if (e.hp > 0) this.updateEnemy(e, dt);
    if (this.state !== 'playing') return;
    for (const b of this.projectiles) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (Math.abs(b.x - p.x) < p.w / 2 + b.r && b.y > p.y - p.h && b.y < p.y + 4 && p.dash <= 0) {
        this.hurt(b.damage, Math.sign(b.vx)); b.life = 0;
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
    if (p.jumps >= 2 || p.dash > 0) return;
    p.vy = p.jumps === 0 ? -575 : -520;
    p.jumps++; p.grounded = false;
    this.emit('jump', { x: p.x, y: p.y, double: p.jumps === 2 });
  }
  dash() {
    const p = this.player;
    if (p.dashCd > 0) return;
    p.dash = .18; p.dashCd = p.dashCooldown; p.invulnerable = .23 + p.dashShield; p.vy = Math.min(p.vy, 0);
    this.emit('dash', { x: p.x, y: p.y, dir: p.dir });
  }
  attack() {
    const p = this.player;
    if (p.attackCd > 0 || p.dash > 0) return;
    p.combo = p.comboWindow > 0 ? p.combo % 3 + 1 : 1;
    p.comboWindow = .8;
    p.attack = .24; p.attackCd = (p.combo === 3 ? .39 : .29) * p.attackSpeed;
    this.hitSet = new Set();
    this.emit('swing', { x: p.x, y: p.y - 30, dir: p.dir, combo: p.combo });
    this.hitTargets();
  }
  hitTargets() {
    const p = this.player;
    const reach = p.reach + (p.combo === 3 ? 24 : 0);
    for (const e of this.enemies) {
      const dx = (e.x - p.x) * p.dir;
      if (e.hp <= 0 || this.hitSet?.has(e) || dx < -e.w / 2 || dx > reach + e.w / 2 || e.y < p.y - 88 || e.y - e.h > p.y - 4) continue;
      this.hitSet?.add(e);
      const crit = this.rand() < p.crit;
      const amount = Math.round(p.damage * [1, 1, 1.15, 1.6][p.combo] * (crit ? 2 : 1));
      this.damageEnemy(e, amount, p.dir, crit, p.combo === 3);
      p.mp = Math.min(p.maxMp, p.mp + 2);
    }
  }
  magic() {
    const p = this.player;
    if (p.mp < p.magicCost || p.magicCd > 0) { if (p.magicCd <= 0) this.emit('noMana'); return; }
    p.mp -= p.magicCost; p.magicCd = .65; p.invulnerable = Math.max(p.invulnerable, .28);
    this.emit('magic', { x: p.x, y: p.y - 32 });
    for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 210) this.damageEnemy(e, Math.round(p.magicDamage), Math.sign(e.x - p.x) || p.dir, false, true);
    this.projectiles = this.projectiles.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > 230);
  }
  damageEnemy(e, amount, dir, crit, heavy) {
    e.hp -= amount; e.flash = .14; e.stun = e.type === 'boss' ? .08 : heavy ? .42 : .24;
    e.vx = dir * this.player.knockback * (heavy ? 1.6 : 1) * (e.type === 'boss' ? .25 : 1);
    if (e.type !== 'boss') e.tell = 0;
    this.freeze = Math.max(this.freeze, heavy || crit ? .065 : .035);
    this.emit('hit', { x: e.x, y: e.y - e.h * .55, amount, dir, crit, heavy });
    if (e.hp <= 0) {
      e.hp = 0; this.kills++; this.souls += e.type === 'boss' ? 100 : e.type === 'knight' ? 15 : 10;
      const p = this.player;
      p.hp = Math.min(p.maxHp, p.hp + p.leech); p.mp = Math.min(p.maxMp, p.mp + 6);
      this.emit('kill', { x: e.x, y: e.y - e.h * .5, boss: e.type === 'boss' });
      if (this.rand() < .25) this.pickups.push({ x: e.x, y: Math.min(FLOOR - 20, e.y - 20), age: 0 });
    }
  }
  updateEnemy(e, dt) {
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.stun = Math.max(0, e.stun - dt);
    if (e.stun > 0) { e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); e.vx *= Math.exp(-dt * 8); return; }
    const dx = p.x - e.x, distance = Math.abs(dx);
    e.dir = dx >= 0 ? 1 : -1;
    if (distance > (e.type === 'boss' ? 750 : 590)) { e.vx = 0; return; }
    if (e.tell > 0) {
      e.tell -= dt; e.vx = 0;
      if (e.tell <= 0) this.enemyAttack(e);
      return;
    }
    if (e.type === 'bat') {
      e.y += ((p.y - 34 + Math.sin(this.time * 4 + e.phase) * 15) - e.y) * dt * 1.6;
      e.vx = e.dir * e.speed; e.x += e.vx * dt;
      if (distance < 30 && Math.abs(e.y - (p.y - 25)) < 40 && e.cd <= 0) { e.tell = .3; e.cd = 1.3; }
    } else if (e.type === 'mage') {
      if (distance < 460 && e.cd <= 0) { e.tell = .65; e.cd = 2.4 - this.stage * .13; }
      else if (distance > 320) { e.vx = e.dir * e.speed * .6; e.x += e.vx * dt; }
      else e.vx = 0;
    } else if (e.type === 'boss') {
      if (e.cd <= 0 && (distance < 145 || e.action % 3 === 2)) { e.tell = e.hp < e.maxHp / 2 ? .48 : .72; e.cd = e.hp < e.maxHp / 2 ? 1.35 : 1.8; }
      else { e.vx = distance > 95 ? e.dir * e.speed * (e.hp < e.maxHp / 2 ? 1.5 : 1) : 0; e.x += e.vx * dt; }
    } else {
      if (distance < 60 && Math.abs(p.y - e.y) < 82 && e.cd <= 0) { e.tell = e.type === 'knight' ? .6 : .43; e.cd = Math.max(.9, 1.7 - this.stage * .12); }
      else { e.vx = distance > 45 ? e.dir * e.speed : 0; e.x += e.vx * dt; }
    }
  }
  enemyAttack(e) {
    const p = this.player;
    if (e.type === 'mage' || (e.type === 'boss' && e.action % 3 === 2)) {
      const base = Math.atan2(p.y - 30 - (e.y - e.h * .6), p.x - e.x);
      const spread = e.type === 'boss' ? [-.25, 0, .25] : [0];
      for (const offset of spread) this.projectiles.push({ x: e.x, y: e.y - e.h * .6, vx: Math.cos(base + offset) * 250, vy: Math.sin(base + offset) * 250, r: e.type === 'boss' ? 9 : 7, life: 4, damage: e.damage });
    } else {
      const range = e.type === 'boss' ? 155 : e.type === 'bat' ? 43 : 82;
      this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: e.type === 'boss' });
      if (Math.abs(p.x - e.x) < range && Math.abs(p.y - e.y) < (e.type === 'bat' ? 58 : e.type === 'boss' ? 100 : 77)) this.hurt(e.damage, e.dir);
    }
    e.action++;
  }
  hurt(amount, dir) {
    const p = this.player;
    if (p.invulnerable > 0 || this.state !== 'playing') return;
    const actual = Math.round(amount * p.armor);
    p.hp = Math.max(0, p.hp - actual); p.invulnerable = .8;
    p.x = clamp(p.x + dir * 20, 25, this.worldWidth - 30);
    this.freeze = .06;
    this.emit('hurt', { x: p.x, y: p.y - 30, amount: actual });
    if (p.hp === 0) { this.state = 'dead'; this.emit('death'); }
  }
  finishStage() {
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