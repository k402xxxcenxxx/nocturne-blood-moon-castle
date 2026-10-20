export const FLOOR = 438;
const BEAM_REACH = 560, GROUND_WAVE_REACH = 340; // px; kept inside the narrowest visible area
const VOLLEY_RANGE = 420; // drawn line length; the bolt tip (r 9) stops at its end
// Display text for stages and relics lives in i18n.js, keyed by stage index and relic id.
export const STAGES = [
  { count: 7, width: 3000 },
  { count: 9, width: 3050 },
  { count: 11, width: 3100 },
  { count: 13, width: 3200 },
  { count: 9, width: 2800 },
];
// Stage routes: 5 authored rooms per non-boss stage (the floor is the always-connected low route, platforms are one-way high routes).
// Each platform is [dx from room start, rise above FLOOR, width, kind?, moving axis?]. Rises 90 and 160 are single-jump steps (apex ~107, double jump ~190);
// never shallower than 85 (the Cathedral pillar is 80 tall). A moving platform's rise is its centre: it swings +-ROOM_SWING, so its lowest point is still 90.
const THEMES = ['gate', 'archive', 'belfry', 'cathedral'], PLATFORM_KINDS = ['stone', 'shelf', 'gear', 'ledge'];
const ROOM_SWING = 60, ROOM_SWING_SPEED = 1; // rad/s: peak platform speed 60 px/s
const ROOM_PLATFORMS = [
  [[], [[110, 90, 140, 'bridge'], [215, 160, 120], [320, 90, 140, 'bridge']], [[150, 90, 130], [330, 160, 160]], [[90, 90, 150], [260, 160, 150], [420, 90, 100]], [[160, 90, 170]]],
  [[[260, 90, 160]], [[80, 90, 150], [250, 160, 150], [420, 90, 110]], [[100, 90, 140], [270, 160, 140], [430, 90, 110]], [[60, 90, 130], [210, 160, 130], [360, 90, 130]], [[150, 90, 150], [330, 160, 130]]],
  [[[260, 90, 150]], [[90, 90, 120, 'gear', 'x'], [310, 90, 110], [430, 160, 110]], [[80, 90, 120], [260, 160, 150], [440, 90, 100]], [[90, 90, 130], [250, 160, 130], [400, 150, 120, 'gear', 'y']], [[150, 90, 150]]],
  [[[250, 90, 150]], [[100, 90, 140], [290, 160, 140]], [[80, 90, 130], [260, 160, 150], [440, 90, 100]], [[130, 90, 150], [330, 160, 140]], [[170, 90, 140]]],
];
export const RELICS = [
  { id: 'edge', icon: 'sword', apply: p => p.damage *= 1.25 },
  { id: 'haste', icon: 'wind', apply: p => { p.attackSpeed = Math.max(.3, p.attackSpeed * .82); p.speed *= 1.08; } },
  { id: 'crit', icon: 'star', apply: p => p.crit = Math.min(.8, p.crit + .18) },
  { id: 'vital', icon: 'heart', apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 40); } },
  { id: 'leech', icon: 'drop', apply: p => p.leech += 5 },
  { id: 'arcane', icon: 'moon', apply: p => { p.magicDamage *= 1.45; p.magicCost = Math.max(15, p.magicCost - 5); } },
  { id: 'reach', icon: 'sword', apply: p => { p.reach += 28; p.knockback += 70; p.plungeRadius = Math.max(p.plungeRadius, Math.min(150, p.plungeRadius + 12)); } },
  { id: 'mana', icon: 'gem', apply: p => { p.maxMp += 30; p.mp = p.maxMp; p.mpRegen *= 1.5; } },
  { id: 'dash', icon: 'wind', apply: p => { p.dashCooldown = Math.max(.35, p.dashCooldown * .7); p.dashShield = Math.min(.3, p.dashShield + .1); p.thrustMul = Math.min(2.4, p.thrustMul + .35); p.perfectMp = Math.min(30, p.perfectMp + 8); } },
  { id: 'armor', icon: 'shield', apply: p => { p.armor = Math.max(.25, p.armor * .8); p.hp = Math.min(p.maxHp, p.hp + 20); } },
  // Elemental relics: no stat change; core reads the stack count (see Game.stacks) when a hit lands.
  { id: 'fire', icon: 'star', apply: () => {} },
  { id: 'frost', icon: 'gem', apply: () => {} },
  { id: 'shock', icon: 'moon', apply: () => {} },
  { id: 'bleed', icon: 'drop', apply: () => {} },
  // Attack-form relics: no stat change except plunge; core reads the stack count when the move fires.
  { id: 'wave', icon: 'moon', apply: () => {} },
  { id: 'pierce', icon: 'sword', apply: () => {} },
  { id: 'plunge', icon: 'star', apply: p => p.plungeRadius = Math.min(190, p.plungeRadius + 24) },
  { id: 'vortex', icon: 'moon', apply: () => {} },
  // Cursed relics: a benefit and a cost, never in the opening pick, at most one per offer; `max` copies, then no longer offered.
  { id: 'bloodOath', icon: 'drop', cursed: true, max: 2, apply: p => { p.swordMul *= 1.6; p.takenMul *= 1.25; } }, // swordMul scales sword hits (combo, thrust, plunge), not wave/beam shots; takenMul applies after armor
  { id: 'lunaticMoon', icon: 'moon', cursed: true, max: 1, apply: p => { p.lunatic = true; p.magicCdMax = 6; p.mpRegen = 0; } }, // Eclipse free, 6 s cooldown; hit / kill / perfect-dodge MP still pays
  { id: 'nightwalk', icon: 'wind', cursed: true, max: 2, apply: p => { p.speed *= 1.2; p.dashCooldown = Math.max(.35, p.dashCooldown * .6); p.maxHp = Math.max(40, p.maxHp - 25); p.hp = Math.min(p.hp, p.maxHp); } },
];
// Symmetric synergy pairs; the i18n key is `synergy.<first>-<second>` in either direction. Only text: the relics already do the work.
const SYNERGY_PAIRS = [['arcane', 'vortex'], ['arcane', 'fire'], ['arcane', 'frost'], ['dash', 'pierce'], ['wave', 'shock'], ['wave', 'vortex'], ['wave', 'bleed'], ['pierce', 'vortex'], ['plunge', 'frost'], ['plunge', 'fire'], ['fire', 'bleed']];
for (const r of RELICS) r.synergies = SYNERGY_PAIRS.filter(p => p.includes(r.id)).map(p => ({ with: p[0] === r.id ? p[1] : p[0], key: `synergy.${p[0]}-${p[1]}` }));
export const BUILD_POOL = ['wave', 'pierce', 'plunge', 'vortex', 'fire', 'frost', 'shock', 'bleed']; // opening-pick relics
const SYNERGY_WEIGHT = .8;
const STATUS_TIMERS = ['chill', 'frozen', 'freezeImmune', 'shock'];
const SHOT_POISE = 8;
// Stage hazards. Traps cycle idle -> warn (TRAP_WARN s) -> active; obstacles are breakable solids (x = centre, y = base, h up, like enemies).
const TRAP_WARN = .7;
const TRAP_KINDS = { 0: 'spikes', 2: 'gears', 3: 'pillar' }, TRAP_HEIGHT = { spikes: 34, gears: 44, pillar: 80 };
const OBSTACLES = { barricade: { w: 40, h: 62 }, altar: { w: 46, h: 74 } };
const PILLAR_LINK = 600; // a pillar stands within this horizontal distance of its altar
const SPAWN_CLEAR = 250; // traps and obstacles keep this far from the hero spawn and the Moon Gate
const OBSTACLE_GAP = 30; // minimum free floor between two hazards
const CHEST_SIZE = { w: 34, h: 28 }, CHEST_REACH = 46; // a grounded hero this close (x) on the chest's surface opens it
// Castle Descent (mode 'castle', #44): one blood meter replaces HP and MP.
export const BLOOD_MAX = 200, BLOOD_HALF = 100, SKILL_COST = 18, SKILL_MIN = 40, FRENZY_BURN = 12, CASTLE_PICKS = [3, 6, 9], SWING_COST = 2, HEAVY_DAMAGE = 100;
export const ASSAULT_BURN = 6, TWIN_FRENZY_CD = .6, TWIN_SEEK = 260; // weapon frenzies (#61)
// The Gate Warden (#50 section 5, floor 10): super armor gauge instead of posture, the Gate Toll, blood pools. All numbers are playtest starting points.
export const WARDEN_FLOOR = 10, ARMOR_MAX = 100, ECLIPSE_CHIP = 25, FRENZY_CHIP = 34, BREAK_STUN = 1.8, BREAK_MUL = 1.5, ARMOR_LOCK = 2.5, BREAK_KNOCK = 140, TOLL_BASE = 30, POOL_GAIN = 14, POOL_LIFE = 4, MAX_POOLS = 2;
const WARDEN_MOVES = { // tell and recovery in seconds; heavy ones deal a flat HEAVY_DAMAGE and glint GLINT_LEAD before contact
  sweep: { tell: .6, recover: .6 }, backhand: { tell: .5, recover: .6 },
  slam: { tell: .95, recover: 1.2, heavy: true }, charge: { tell: .9, recover: 1, heavy: true }, seize: { tell: 1.1, recover: 1.3, heavy: true },
};
// Warden strings: a follow-up starts at the end of a sweep, charge, slam or seize, picked by where the hero stands then; its tell is FOLLOW_TELL (heavies still glint GLINT_LEAD before contact), it is never delayed, and a pick draws at most MAX_FOLLOWS[phase] of them.
const FOLLOW_TELL = { charge: .5, seize: .75, backhand: .5, slam: .7 }, PHASE2_RECOVER_CUT = .3, MAX_FOLLOWS = { 1: 2, 2: 3 };
// The Fallen King, castle version (#50 section 6, floor 50): the Warden's gauge, pools and habit memory with its own moves, the Tithe and the Blood Moon. Playtest starting points.
export const KING_FLOOR = 50, KING_HP = 1200, KING_ARMOR = 150, TITHE_DELAY = 3, TITHE_RESTORE = 25, LEDGE_TIME = 2, DESCENT_RADIUS = 120;
const KING_MOVES = { // a 'string' is the second hit of a slash string: its branch (slash / turnslash / charge) is chosen at the glint, 0.4 s before contact
  slash: { tell: .6, recover: .6 }, turnslash: { tell: .5, recover: .6 }, string: { tell: .85, recover: .8 }, volley: { tell: .92, recover: .9 }, ritual: { tell: 1.28, recover: 1 },
  slam: { tell: .95, recover: 1.2, heavy: true }, charge: { tell: .9, recover: 1, heavy: true }, descent: { tell: 1.1, recover: 1.3, heavy: true },
};
const CASTLE_LIGHT = { skeleton: 10, bat: 8, shield: 12, spear: 12, knight: 14 }; // castle light-attack damage at tier 0, +2 per tier
// Castle heavy attacks (#47): tell and recovery in seconds, base heavy chance, and extra chances for visible hero states (highest applies).
const HEAVY = {
  skeleton: { kind: 'cleave', tell: .85, recover: 1, base: .1, reads: { whiff: .8, dashSpent: .5 } },
  bat: { kind: 'dive', tell: .9, recover: 1, base: .15, reads: { airborne: .6, frenzy: .5 } },
  shield: { kind: 'rush', tell: .9, recover: 1, base: .15, reads: { approach: .55, cast: .6 } },
  spear: { kind: 'lunge', tell: .9, recover: 1, base: .2, reads: { dashSpent: .55, approach: .45 } },
  knight: { kind: 'greatswing', tell: 1, recover: 1.1, base: .25, reads: { frenzy: .65, whiff: .5, dashSpent: .4 } },
};
export const HEAVY_CD = 3, HEAVY_WHIFF = .4;
// Castle combat systems (#50 PR 1). Posture, flinch budget, attack tokens, glint and delayed heavies; all numbers are playtest starting points.
export const ATTACK_TOKENS = 2, TOKEN_GAP = .3, STARVED = 2; // tokens for the whole field (at most 1 heavy), retake gap, s of denial after which an enemy outranks the rest
export const STEADY = .5, POISE_REGEN_DELAY = 1.5, POISE_REGEN = .25, STAGGER_STUN = 1.5, RIPOSTE_MUL = 1.5, RIPOSTE_BLOOD = 5, GLINT_LEAD = .4, DELAY_EXTRA = .4;
export const SCREEN_LEFT = 320, SCREEN_RIGHT = 560; // a tell may only start within this many px left / right of the hero
const CASTLE_POISE = { skeleton: 60, bat: 30, shield: 70, spear: 55, knight: 140, priest: 45, mage: 40 };
const LIGHT_RECOVER = { skeleton: .45, shield: .6 }; // castle light-attack recovery (standing still, punishable); other types join with their kits
const LIGHT_CD = { skeleton: 1 }; // castle light-attack cooldown overrides (s); others keep the stage-based cooldown
const LIGHT_KIND = { skeleton: 'slash', shield: 'bash', bat: 'swoop', spear: 'thrust', knight: 'slash', priest: 'bolt', mage: 'bolt' };
const TRIGGER = { bat: 30, skeleton: 80, knight: 60, shield: 70, spear: 193, priest: 460, mage: 460 }; // distance at which a ready enemy asks for a token
const REFACE = { bat: .15, skeleton: .15, spear: .2, shield: .25, priest: .2, mage: .2, knight: .35 }; // castle re-face delay outside attacks
const PROVOKED_REACH = 150; // a provoked ring-holder may start a light tell from this far (the slash itself still only reaches 82)
const HOLD_RING = { skeleton: 112, shield: 100 }; // without a token a melee enemy waits 30-50 px outside its probe range (ring width 20)
const HEAVY_FIRST_FLOOR = { cleave: 1, rush: 2, dive: 4, lunge: 5, greatswing: 7 }; // a heavy is only delayed on floors after the player met it
const DELAY_CHANCE = floor => floor >= 8 ? .5 : floor >= 5 ? .3 : 0;
export const WEAPONS = { heavy: { damage: 30, cd: 1.25, reach: 112 }, twin: { damage: 17, cd: .75, reach: 88 }, spear: { damage: 22, cd: 1, reach: 128 } };
const SLICE_EXCLUDED = ['vital', 'leech', 'mana', 'arcane', 'lunaticMoon', 'nightwalk']; // relics that only touch HP, MP or magic cost
export const SLICE_POOL = RELICS.filter(r => !SLICE_EXCLUDED.includes(r.id)).map(r => r.id);
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
// Endless Trial: per-floor enemy multipliers compound from floor 1 and stay finite at any depth.
export const ENDLESS_HP = 1.22, ENDLESS_DAMAGE = 1.13, ENDLESS_BOSS_EVERY = 5, ENDLESS_ELITE_FROM = 6, ENDLESS_ELITE_CHANCE = .2, SCALE_CAP = 1e9, STAT_CAP = 1e12;
export const floorScale = floor => ({ hp: Math.min(SCALE_CAP, ENDLESS_HP ** (floor - 1)), damage: Math.min(SCALE_CAP, ENDLESS_DAMAGE ** (floor - 1)) });
export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }
// Poise damage per source.
const AFFIXES = ['swift', 'splitting', 'warded'], ELITE_BEAT = .8, ELITE_DAMAGE = 1.3, WARD_AMOUNT = 30, WARD_PERIOD = 6, ELITE_NOTICE = 600;
const POISE_DAMAGE = { combo: [0, 17, 17, 62], eclipse: 55, thrust: 35, plunge: 45 };

const basePlayer = () => ({
      x: 155, y: FLOOR, w: 28, h: 58, vx: 0, vy: 0, dir: 1, grounded: true, jumps: 0,
      hp: 100, maxHp: 100, mp: 100, maxMp: 100, damage: 24, magicDamage: 58, magicCost: 35,
      speed: 245, attackSpeed: 1, crit: .12, reach: 100, leech: 0, armor: 1, swordMul: 1, takenMul: 1, lunatic: false, magicCdMax: .65, mpRegen: 8,
      knockback: 180, dashCooldown: .85, dashShield: 0, attack: 0, attackCd: 0,
      dash: 0, dashCd: 0, magicCd: 0, invulnerable: 0, combo: 0, comboWindow: 0,
      attackLen: .24, move: '', buffer: 0, thrustWindow: 0, thrustMul: 1.35, perfect: 0, otherInv: 0, dashBuf: 0, perfectUsed: false, perfectMp: 10, plunge: 0, plungeT: 0, plungeY: 0, plungeRadius: 90, whiff: 0, blood: BLOOD_HALF, frenzy: false, weapon: null, debt: 0,
});

export class Game {
  constructor(onEvent = () => {}, seed = randomSeed(), mode = 'normal') {
    this.onEvent = onEvent;
    this.mode = mode; // 'normal' (five stages), 'endless' (floors loop through the stages) or 'castle' (blood loop, floors 1-9 of the Gate)
    this.floor = 1; // 1-based; stage stays the 0-4 theme index, (floor - 1) % 5, in endless
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
    this.player = basePlayer();
    this.step = 0; // last frame's dt (denied token requests count their wait with it)
    this.pools = []; this.assaulted = null; this.fightStats = null; this.fightOn = false; this.vigil = 0; this.vigilT = 0; this.kingT = 0; // Warden fight: blood pools, stats, rest-point number (1 or 2), kill-to-Vigil timer
    this.loadStage(0);
  }
  rand() { let t = this.randomState += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  emit(type, data = {}) { this.onEvent({ type, ...data }); }
  start() { if (this.mode === 'castle') this.enterRest(); else this.rollChoices('start', BUILD_POOL); } // the run opens with a build pick; stage 1 begins after it
  // Offer 3 distinct relics (weighted sampling without replacement); reason is 'start' or 'stage'.
  rollChoices(reason, pool) {
    this.state = 'upgrade'; this.pickReason = reason;
    const left = RELICS.filter(r => (!pool || pool.includes(r.id)) && (!r.max || this.stacks(r.id) < r.max)), choices = [];
    const weight = r => 1 + SYNERGY_WEIGHT * r.synergies.filter(s => this.relics.includes(s.with)).length;
    while (choices.length < 3 && left.length) {
      let roll = this.rand() * left.reduce((n, r) => n + weight(r), 0), i = 0;
      while (i < left.length - 1 && (roll -= weight(left[i])) >= 0) i++;
      const [pick] = left.splice(i, 1);
      choices.push(pick);
      if (pick.cursed) for (let j = left.length; j--;) if (left[j].cursed) left.splice(j, 1); // at most one cursed relic per offer
    }
    this.choices = choices;
    this.emit('upgrade', { choices, reason });
  }
  // Owned partners of a relic, as [{ with, key }] (for "Synergy: <partner>" lines on cards).
  synergyPartners(id) { return RELICS.find(r => r.id === id).synergies.filter(s => this.relics.includes(s.with)); }
  // Pairs where both relics are owned, as [{ a, b, key }] (for the pause menu).
  activeSynergies() { return SYNERGY_PAIRS.filter(([a, b]) => this.relics.includes(a) && this.relics.includes(b)).map(([a, b]) => ({ a, b, key: `synergy.${a}-${b}` })); }
  loadStage(index) {
    this.stage = index;
    const castle = this.mode === 'castle', king = castle && this.floor === KING_FLOOR, fight = castle && (this.floor === WARDEN_FLOOR || king), spec = fight ? STAGES[4] : STAGES[index], boss = index === 4 || fight; // the Warden fights in the boss arena layout with Gate art
    const tier = castle ? Math.min(4, (this.floor - 1) >> 1) : index; // enemy scaling; castle floors keep the Gate art and rooms (index 0)
    this.tier = tier; this.gaps = []; // splitting copies use the floor tier; attack-token retake gaps start clear
    const plan = castle ? this.castlePlan() : null; // enemy types of the floor; the last two are the gate guards
    const total = plan ? plan.length : spec.count;
    this.worldWidth = spec.width;
    this.portalX = spec.width - 145;
    this.portalOpen = false;
    this.freeze = 0;
    this.projectiles = [];
    this.shots = []; // player-owned projectiles; never touched by enemy-projectile code or Eclipse clearing
    this.pickups = [];
    this.platforms = []; this.rooms = []; this.chests = []; this.roomIndex = -1;
    this.enemies = []; this.eliteBeat = 0;
    this.pools = []; this.vigilT = 0; this.kingT = 0; this.fightOn = fight; this.fightStats = fight ? { gained: 0, taken: 0, time: 0, breaks: 0, frenzies: 0 } : null;
    this.traps = []; this.obstacles = [];
    const spot = boss ? null : this.buildRooms(index);
    const regular = fight ? 0 : boss ? spec.count : total - 2; // the last two are the required guards at the gate
    const rollType = i => {
      if (plan) return plan[i];
      const roll = this.rand();
      const type = i % 4 === 1 ? 'bat' : index >= 2 && roll < .23 ? (this.rand() < .3 ? 'priest' : 'mage') : index >= 1 && roll < .58 ? (roll > .44 ? 'shield' : 'knight') : 'skeleton';
      return type === 'knight' && this.rand() < .28 ? 'spear' : type;
    };
    for (let i = 0; i < regular; i++) this.spawnEnemy(rollType(i), this.mirrorX(540 + i * (spec.width - 900) / total + this.rand() * 65), tier);
    if (this.mode === 'endless' && this.floor >= ENDLESS_ELITE_FROM) for (const e of this.enemies) if (this.rand() < ENDLESS_ELITE_CHANCE) this.makeElite(e, index).bonus = true; // extra elites: no reward pick
    if (boss) {
      if (king) this.spawnKing(spec.width - 700); else if (fight) this.spawnWarden(spec.width - 700); else this.spawnEnemy('boss', spec.width - 400, index).required = true;
      // Boss arena: the centre stays flat, two raised ledges near the edges are escape routes.
      this.platforms = [this.makePlatform(60, FLOOR - 110, 190, 'cathedral', 'ledge'), this.makePlatform(spec.width - 250, FLOOR - 110, 190, 'cathedral', 'ledge')];
    } else {
      for (let g = 0; g < 2; g++) { const type = rollType(regular + g); this.spawnEnemy(type === 'bat' ? 'skeleton' : type, this.portalX - 230 - g * 150 + this.rand() * 30, tier).required = true; }
      if (castle) { // no chests; floors 8-9 add one bonus elite (no reward pick)
        this.chests = [];
        if (this.floor >= 8) Object.assign(this.makeElite(this.spawnEnemy('knight', spot.x, tier), tier), { bonus: true, y: spot.y, plat: spot.plat });
      } else {
      const guard = this.spawnEnemy(index === 0 ? 'skeleton' : this.rand() < .5 ? 'knight' : 'shield', spot.x, index); // tougher guard of the optional chest
      Object.assign(guard, { y: spot.y, plat: spot.plat });
      Object.assign(this.chests[1], { sealed: true }); // sealed until this guard (linked by chest id) is gone
      this.makeElite(guard, index).chest = 1; // the optional chest's guard is this stage's elite
      }
    }
    this.totalEnemies = this.enemies.length;
    if (!fight) this.placeHazards(index);
    Object.assign(this.player, { x: 150, y: FLOOR, vx: 0, vy: 0, grounded: true, on: null, jumps: 0, attack: 0, attackCd: 0, dash: 0, dashCd: 0, invulnerable: .8, combo: 0, move: '', buffer: 0, thrustWindow: 0, perfect: 0, otherInv: 0, dashBuf: 0, perfectUsed: false, plunge: 0, plungeT: 0 });
  }
  // Castle floor table (#47): floors 1-3 are fixed mixes (5 enemies), 4-7 roll 6, 8-9 roll 7 and add knights; slot 1 is a bat.
  castlePlan() {
    const f = this.floor, fill = (n, t) => Array(n).fill(t);
    if (f <= 3) {
      const list = (f === 2 ? fill(2, 'shield') : f === 3 ? fill(2, 'spear') : []); list.push(...fill(5 - list.length, 'skeleton'));
      for (let i = list.length; --i > 0;) { const j = Math.floor(this.rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      return list;
    }
    const pool = f >= 8 ? ['skeleton', 'shield', 'spear', 'knight'] : ['skeleton', 'shield', 'spear'];
    return Array.from({ length: f >= 8 ? 7 : 6 }, (_, i) => i === 1 ? 'bat' : pool[Math.floor(this.rand() * pool.length)]);
  }
  loadFloor(n) {
    if (n === KING_FLOOR && this.mode !== 'castle') return false; // the Fallen King's castle fight is a Castle Descent floor
    this.floor = n; this.loadStage(n === KING_FLOOR ? 4 : 0); this.emit('stage', { stage: this.stage, floor: n, mode: this.mode });
    return true;
  }
  // The slice-end screen's "Face the Fallen King": floor 50 at 100 blood with the current weapon and relics. A win or a death comes back to the slice end (no records).
  challengeKing() {
    if (this.state !== 'sliceEnd') return false;
    const p = this.player;
    this.endFrenzy(); p.blood = BLOOD_HALF; p.debt = 0;
    this.state = 'playing'; return this.loadFloor(KING_FLOOR);
  }
  leaveKing(won) {
    if (this.floor !== KING_FLOOR || (this.state !== 'playing' && this.state !== 'dead')) return false;
    this.endFight(false); this.endFrenzy();
    this.enemies = []; this.projectiles = []; this.pools = []; this.kingT = 0;
    this.floor = WARDEN_FLOOR; this.state = 'sliceEnd'; this.emit('sliceEnd', { king: won ? 'won' : 'dead' });
    return true;
  }
  // Weapon base stats replace damage, attack cooldown and reach (frenzy effects are step 2). Chosen at a Vigil; the player is rebuilt so owned relics stack on the new base.
  setWeapon(id) {
    const w = WEAPONS[id], p = this.player;
    if (!w) return false;
    Object.assign(p, basePlayer(), { blood: p.blood, weapon: id, damage: w.damage, attackSpeed: w.cd, reach: w.reach });
    for (const r of this.relics) RELICS.find(x => x.id === r).apply(p);
    return true;
  }
  // The first Vigil (rest point): blood back to 100, no relics, no frenzy; also where death returns. Pick a weapon, then descend().
  enterRest() {
    this.endFrenzy(); this.endFight(false);
    this.relics = []; Object.assign(this.player, basePlayer());
    this.state = 'rest'; this.vigil = 1;
    this.emit('rest', { weapons: Object.keys(WEAPONS), vigil: 1 });
  }
  // The second Vigil, after the Warden: relics stay, blood back to 100, frenzy ends and debt is cleared; the weapon may change.
  enterVigil() {
    const p = this.player;
    this.endFrenzy(); p.blood = BLOOD_HALF; p.debt = 0; p.invulnerable = 0;
    this.state = 'rest'; this.vigil = 2; this.vigilT = 0;
    this.emit('rest', { weapons: Object.keys(WEAPONS), vigil: 2 });
  }
  descend() {
    if (this.state !== 'rest' || !this.player.weapon) return false;
    if (this.vigil === 2) { this.state = 'sliceEnd'; this.emit('sliceEnd'); return true; } // floors 11+ are not built
    this.state = 'playing'; this.loadFloor(1);
    return true;
  }
  nextFloor() {
    if (this.floor >= WARDEN_FLOOR) { this.enterVigil(); return; } // normally the Warden's death gets here first
    this.state = 'playing'; this.loadFloor(this.floor + 1);
  }
  // Blood gain from a hit, kill or perfect dodge; halved (min 1) during frenzy. Skill and damage-over-time hits set noBlood.
  gainBlood(amount) {
    const p = this.player;
    if (this.mode !== 'castle' || this.noBlood || this.state !== 'playing') return;
    this.addBlood(p.frenzy ? Math.max(1, amount >> 1) : amount);
  }
  // Adds blood unhalved (pools use it directly), counts it for the fight stats and starts the frenzy at the cap.
  addBlood(n) {
    const p = this.player, before = p.blood;
    p.blood = Math.min(BLOOD_MAX, p.blood + n);
    if (this.fightOn) this.fightStats.gained += p.blood - before;
    if (!p.frenzy && p.blood >= BLOOD_MAX) { p.frenzy = true; if (this.fightOn) this.fightStats.frenzies++; this.emit('frenzy', { weapon: p.weapon, x: p.x, y: p.y }); }
  }
  // Fight stats go out once, on the Warden's kill or the hero's death.
  endFight(won) {
    if (!this.fightOn) return;
    this.fightOn = false;
    this.emit('fightStats', { won, ...this.fightStats });
  }
  // pay = the frenzy ran out (burn, skill or dash cost): the Greatsword's blood debt comes due at once and kills at 100 or more. Death, a Vigil and a floor reset clear it unpaid.
  endFrenzy(pay = false) {
    const p = this.player, debt = pay ? Math.round(p.debt) : 0;
    if (!p.frenzy) return;
    p.frenzy = false; p.debt = 0;
    this.emit('frenzyEnd', { weapon: p.weapon, debt });
    if (debt <= 0) return;
    p.blood = Math.max(0, p.blood - debt);
    this.emit('debt', { amount: debt, x: p.x, y: p.y - 30 });
    if (p.blood <= 0) this.heroDown(false, 'debt');
  }
  // True while this weapon's frenzy effect is on (castle only; frenzy exists only there).
  frenzyOf(weapon) { const p = this.player; return p.frenzy && p.weapon === weapon && this.mode === 'castle'; }
  // Frenzy ends once blood is back at the life half (burn, damage or the skill).
  checkFrenzy() { const p = this.player; if (p.frenzy && p.blood <= BLOOD_HALF) this.endFrenzy(true); }
  // Elite stats and a random affix (a shield bearer is never Warded).
  makeElite(e, index) {
    const mult = index === 0 ? 2.6 : e.type === 'shield' ? 1.8 : 2.2; // elite health multiplier
    let affix = AFFIXES[Math.floor(this.rand() * AFFIXES.length)];
    if (affix === 'warded' && e.type === 'shield') affix = AFFIXES[Math.floor(this.rand() * 2)];
    Object.assign(e, { elite: true, affix, damage: e.damage * ELITE_DAMAGE, hp: Math.round(e.hp * mult), maxHp: Math.round(e.hp * mult) });
    if (affix === 'swift') e.speed *= 1.5;
    if (affix === 'warded') { e.ward = WARD_AMOUNT; e.wardT = WARD_PERIOD; }
    return e;
  }
  makePlatform(x, y, w, theme, kind, axis = null) {
    const move = axis ? { axis, amp: ROOM_SWING, speed: ROOM_SWING_SPEED } : null, plat = { x, y, w, h: 18, theme, kind, moving: !!move, move, x0: x, y0: y, t: move ? this.rand() * Math.PI * 2 : 0, dx: 0, dy: 0 };
    if (move) { const s = Math.sin(plat.t) * move.amp; if (axis === 'x') plat.x += s; else plat.y += s; }
    return plat;
  }
  // Rooms, their platforms and chests for stages 0-3. Rooms 2 and 4 (indices 1 and 3) are mirrored as a whole by seed. Returns the optional chest's guard spot.
  buildRooms(index) {
    const base = STAGES[index].width / 5, jitter = Array.from({ length: 5 }, () => (this.rand() * 2 - 1) * 30), mean = jitter.reduce((a, b) => a + b, 0) / 5;
    const widths = jitter.slice(0, 4).map(j => Math.round(base + j - mean)); // the last room takes the remainder, so every room stays within base +- 60
    widths.push(STAGES[index].width - widths.reduce((a, b) => a + b, 0));
    let x = 0;
    this.rooms = widths.map((w, i) => { const room = { x, w, mirror: (i === 1 || i === 3) && this.rand() < .5 }; x += w; return room; });
    ROOM_PLATFORMS[index].forEach((list, i) => {
      const room = this.rooms[i];
      for (const [dx, rise, w, kind, axis] of list) this.platforms.push(this.makePlatform(room.x + (room.mirror ? room.w - dx - w : dx), FLOOR - rise, w, THEMES[index], kind || PLATFORM_KINDS[index], axis));
    });
    const main = this.rooms[1 + Math.floor(this.rand() * 3)], side = this.rooms[1 + Math.floor(this.rand() * 3)];
    let cx = Math.round(main.x + main.w * (.3 + this.rand() * .4));
    const clear = x => this.platforms.every(p => x < p.x - 60 || x > p.x + p.w + 60); // the floor chest never sits under or beside a platform span
    for (let d = 0; !clear(cx) && d <= main.w; d += 5) for (const s of [d, -d]) if (clear(Math.round(main.x + main.w * .5) + s)) { cx = Math.round(main.x + main.w * .5) + s; d = main.w; break; }
    this.chests.push({ id: 0, x: cx, y: FLOOR, ...CHEST_SIZE, kind: 'relic', optional: false, opened: false });
    const top = this.platforms.filter(p => !p.moving && p.x >= side.x && p.x < side.x + side.w).sort((a, b) => a.y - b.y)[0];
    this.chests.push({ id: 1, x: Math.round(top.x + top.w * .25), y: top.y, ...CHEST_SIZE, kind: this.rand() < .5 ? 'relic' : 'heal', optional: true, opened: false });
    const chest = this.chests[1]; // the guard stands just right of the chest (the hero arrives from the left), so taking it means facing it
    return { x: Math.min(chest.x + 36, top.x + top.w - 14), y: top.y, plat: top };
  }
  mirrorX(x) { const r = this.rooms.find(r => r.mirror && x >= r.x && x < r.x + r.w); return r ? 2 * r.x + r.w - x : x; }
  // Traps, barricades and altars (none on the boss stage; traps only on stages 0, 2, 3). Drawn after enemies so existing seeds keep their layout.
  placeHazards(index) {
    if (index === 4) return;
    const taken = this.chests.filter(c => c.y === FLOOR).map(c => ({ x: c.x, w: 50 })), lo = 150 + SPAWN_CLEAR, hi = this.portalX - SPAWN_CLEAR;
    const free = (x, w, pad, a, b) => x - w / 2 >= Math.max(lo, a) && x + w / 2 <= Math.min(hi, b) && (w !== OBSTACLES.altar.w || this.platforms.every(p => x + w / 2 < p.x || x - w / 2 > p.x + p.w)) && taken.every(t => Math.abs(x - t.x) >= (w + t.w) / 2 + OBSTACLE_GAP) && this.enemies.every(e => e.type === 'bat' || Math.abs(x - e.x) >= w / 2 + pad);
    const place = (w, near = null) => { // random tries between enemies, then anywhere, then a left-to-right scan; `near` limits |x - near| to PILLAR_LINK
      const a = near === null ? -Infinity : near - PILLAR_LINK, b = near === null ? Infinity : near + PILLAR_LINK, from = Math.max(lo + w / 2, a), to = Math.min(hi - w / 2, b);
      for (const pad of [20, -999]) for (let i = 0; i < 40; i++) { const x = Math.round(from + this.rand() * (to - from)); if (free(x, w, pad, a, b)) { taken.push({ x, w }); return x; } }
      for (let x = Math.ceil(from); x <= to; x += 5) if (free(x, w, -999, a, b)) { taken.push({ x, w }); return x; }
      return null;
    };
    const kind = TRAP_KINDS[index], altars = index === 3 ? 1 + Math.floor(this.rand() * 2) : 0;
    const pillars = kind ? (altars === 1 ? 2 : 2 + Math.floor(this.rand() * 2)) : 0;
    const altarObjs = []; // altars first so each pillar can be placed within PILLAR_LINK of the altar that disables it
    for (let i = 0; i < altars; i++) { const x = place(OBSTACLES.altar.w); if (x !== null) altarObjs.push(this.spawnObstacle('altar', x, index)); }
    for (let i = 0; i < pillars; i++) {
      const altar = altarObjs.length ? altarObjs[i % altarObjs.length] : null;
      const w = Math.round(60 + this.rand() * 30), period = 3.4 + this.rand() * 1.1, active = kind === 'pillar' ? 1.8 + this.rand() * .35 : 1.1 + this.rand() * 1.05, x = place(w, altar && altar.x);
      if (x === null) continue;
      const trap = this.spawnTrap(kind, x, w, period, active, this.rand() * period, index);
      if (altar) { trap.altar = altar.id; altar.traps.push(trap.id); }
    }
    const barricades = 1 + Math.floor(this.rand() * 2);
    for (let i = 0; i < barricades; i++) { const x = place(OBSTACLES.barricade.w); if (x !== null) this.spawnObstacle('barricade', x, index); }
  }
  spawnTrap(kind, x, w, period, active, t = 0, stage = 0) {
    const trap = { id: this.traps.length, kind, x, y: FLOOR, w, h: TRAP_HEIGHT[kind], period, active, t, damage: 10 * 1.13 ** stage, altar: null, disabled: false, state: 'idle', warn: false, progress: 0 };
    this.traps.push(trap); this.trapPhase(trap);
    return trap;
  }
  // Recompute state / warn / progress (0..1 through the warning, or through the active window) from the cycle clock t.
  trapPhase(tr) {
    tr.state = tr.disabled ? 'off' : tr.t < tr.active ? 'active' : tr.t >= tr.period - TRAP_WARN ? 'warn' : 'idle';
    tr.warn = tr.state === 'warn';
    tr.progress = tr.warn ? (tr.t - (tr.period - TRAP_WARN)) / TRAP_WARN : tr.state === 'active' ? tr.t / tr.active : 0;
  }
  updateTraps(dt) {
    const p = this.player;
    for (const tr of this.traps) {
      if (tr.disabled) continue;
      const before = tr.state;
      tr.t = (tr.t + dt) % tr.period; this.trapPhase(tr);
      if (tr.state !== before && (tr.state === 'warn' || tr.state === 'active')) this.emit(tr.state === 'warn' ? 'trapWarn' : 'trapActive', { id: tr.id, kind: tr.kind, x: tr.x, y: tr.y, w: tr.w, h: tr.h });
      if (tr.state === 'active' && Math.abs(p.x - tr.x) < (p.w + tr.w) / 2 && p.y > tr.y - tr.h && p.y - p.h < tr.y) this.hurt(tr.damage, Math.sign(p.x - tr.x) || 1, true);
    }
  }
  spawnObstacle(kind, x, stage = 0) {
    const hp = kind === 'altar' ? 64 : 38 + 12 * stage;
    const o = { id: (this.obstacleId = (this.obstacleId || 0) + 1), kind, x, y: FLOOR, ...OBSTACLES[kind], hp, maxHp: hp, flash: 0, ...(kind === 'altar' ? { traps: [] } : {}) };
    this.obstacles.push(o);
    return o;
  }
  // Damage from sword, shot, plunge or Eclipse. No statuses, poise, MP or drops; an altar takes its linked pillars down with it.
  damageObstacle(o, amount) {
    o.hp = Math.max(0, o.hp - amount); o.flash = .12;
    this.emit('obstacleHit', { x: o.x, y: o.y - o.h / 2, amount, kind: o.kind });
    if (o.hp > 0) return;
    this.obstacles = this.obstacles.filter(x => x !== o);
    if (o.kind === 'altar') for (const id of o.traps) { const tr = this.traps[id]; tr.disabled = true; this.trapPhase(tr); }
    this.emit('break', { x: o.x, y: o.y - o.h / 2, kind: o.kind, ...(o.kind === 'altar' ? { traps: o.traps } : {}) });
  }
  spawnEnemy(type, x, stage = 0) {
    const maxPoise = (this.mode === 'castle' && CASTLE_POISE[type]) || { skeleton: 40, bat: 22, mage: 34, shield: 60, knight: 110, boss: 120, spear: 48, priest: 42 }[type];
    const boss = type === 'boss';
    const scale = this.mode === 'endless' ? floorScale(this.floor) : { hp: 1, damage: 1 }; // combined with the per-stage scaling by multiplication
    const hp = Math.round((boss ? 900 : (type === 'knight' ? 65 : type === 'shield' ? (this.mode === 'castle' ? 60 : 55) : type === 'spear' ? 53 : type === 'priest' ? 54 : type === 'bat' ? 27 : this.mode === 'castle' ? 55 : 43) + stage * 12) * scale.hp);
    this.enemies.push({ type, x, y: type === 'bat' ? FLOOR - 95 : FLOOR, baseY: FLOOR - 95, w: boss ? 64 : 27, h: boss ? 102 : type === 'bat' ? 28 : 58, vx: 0, dir: -1, hp, maxHp: hp, damage: (boss ? 22 : this.mode === 'castle' && CASTLE_LIGHT[type] ? CASTLE_LIGHT[type] + stage * 2 : 8 + stage * 2.5) * scale.damage, speed: boss ? 75 : type === 'bat' ? 115 : type === 'knight' ? 57 : type === 'shield' ? 50 : type === 'spear' ? 77 : type === 'priest' ? 67 : 72, cd: 1 + this.rand(), tell: 0, flash: 0, stun: 0, guardBreak: 0, blessed: 0, blessCd: 0, blessRadius: 0, vault: false, vy: 0, plat: null, jumpCd: 0, dropT: 0, jumpVx: 0, required: false, turn: 0, reface: 0, phase: this.rand() * 6, action: 0, poise: maxPoise, maxPoise, punishable: false, armor: 0, bossPhase: 1, pause: 0, recover: 0, heavy: false, heavyKind: '', heavyCd: 0, rollT: 0, strikeT: 0, travel: 0, chargeN: 0, move: '', lastMove: '', warn: null, steady: 0, poiseHit: 0, token: '', wait: 0, stepT: 0, cutT: 0, glint: 0, glinted: false, delayed: false, riposte: false, blocks: [], counterT: 0, stepRoll: 0, provoke: 0, elite: false, affix: null, seen: false, ward: 0, wardT: 0, burn: 0, burnDmg: 0, bleed: 0, bleedStacks: 0, dotT: 0, chill: 0, frozen: 0, freezeImmune: 0, frostMeter: 0, shock: 0 });
    return this.enemies.at(-1);
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.elapsed += dt;
    if (this.eliteBeat > 0) { // frozen beat after an elite dies: nothing updates, then the reward pick opens
      if ((this.eliteBeat -= dt) <= 0) this.rollChoices('elite');
      return;
    }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    const p = this.player;
    this.step = dt;
    if (this.vigilT > 0 && (this.vigilT -= dt) <= 0) { this.enterVigil(); return; }
    if (this.kingT > 0 && (this.kingT -= dt) <= 0) { this.leaveKing(true); return; }
    if (this.fightOn && this.enemies.some(e => e.armored && e.engaged)) this.fightStats.time += dt;
    this.gaps = this.gaps.map(g => g - dt).filter(g => g > 0);
    if (p.frenzy) { p.blood = Math.max(BLOOD_HALF, p.blood - FRENZY_BURN * dt); this.checkFrenzy(); } // frozen by pause, picks and hit-stop (all return above)
    this.updatePlatforms(dt);
    for (const key of ['attack', 'attackCd', 'dash', 'dashCd', 'magicCd', 'invulnerable', 'comboWindow', 'buffer', 'thrustWindow', 'perfect', 'otherInv', 'dashBuf', 'whiff']) if (!(p.plunge && (key === 'buffer' || key === 'dashBuf'))) p[key] = Math.max(0, p[key] - dt); // buffered input waits out a plunge
    p.mp = Math.min(p.maxMp, p.mp + dt * p.mpRegen);
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (direction && p.dash <= 0 && !this.frenzyOf('twin')) p.dir = direction; // twin frenzy: movement never turns the facing (only the swing-start seek does), so you can walk backwards while attacking
    if (input.jump) this.jump();
    this.heldDir = direction;
    if (input.dash) this.dash();
    else if (p.dashBuf > 0) this.dash(true);
    if (input.magic) this.magic();
    if (p.dash > 0) { p.thrustWindow = Math.max(p.thrustWindow, .65); if (p.buffer > 0) p.buffer = .16; } // both timers run from the end of the dash
    if (p.buffer > 0 && p.attackCd <= 0 && p.dash <= 0 && !p.plunge) this.attack();
    if (input.attack) this.attack();
    else if (this.frenzyOf('twin') && p.grounded && p.attackCd <= 0 && p.attack <= 0 && p.dash <= 0 && !p.plunge) { p.thrustWindow = 0; this.attack(); } // Unstoppable combo: grounded swings start on their own
    if (p.dash > 0 && this.assaulted) this.assault();
    if (p.plunge === 1 && (p.plungeT -= dt) <= 0) p.plunge = 2;
    if (p.plunge === 1) p.vy = 0; // hang for the wind-up
    if (p.plunge === 2) p.vy = Math.max(p.vy, 800);
    if (p.plunge === 3 && (p.plungeT -= dt) <= 0) { p.plunge = 0; p.move = ''; }
    if (p.plunge === 3) p.vx = 0;
    else if (p.dash > 0) p.vx = p.dir * 730;
    else if (p.attack > .035 && p.move === 'thrust') p.vx = p.dir * 420;
    else p.vx = direction * p.speed * (p.attack > 0 && !this.frenzyOf('twin') ? .65 : 1);
    if (p.on && p.grounded && this.platforms.includes(p.on)) { p.x += p.on.dx || 0; p.y = p.on.y; } // a moving platform carries its rider
    const oldX = p.x;
    p.x = clamp(p.x + p.vx * dt, 25, this.worldWidth - 30);
    for (const o of this.obstacles) if (p.y > o.y - o.h + 1 && p.y - p.h < o.y && Math.abs(p.x - o.x) < (p.w + o.w) / 2) p.x = o.x + (oldX < o.x ? -1 : 1) * (p.w + o.w) / 2; // solid sides
    for (const e of this.enemies) if (e.armored && e.hp > 0 && e.travel <= 0 && p.y <= e.y + 6 && p.dash <= 0 && p.y > e.y - e.h + 1 && Math.abs(p.x - e.x) < (p.w + e.w) / 2) { const half = (p.w + e.w) / 2, side = oldX < e.x ? -1 : 1, nx = e.x + side * half; p.x = clamp(nx < 25 || nx > this.worldWidth - 30 ? e.x - side * half : nx, 25, this.worldWidth - 30); } // the Warden's body blocks walking (a dash passes, a double jump clears it); at a wall the hero is pushed to the other side
    const oldY = p.y;
    p.vy += 1550 * dt;
    p.y += p.vy * dt;
    p.grounded = false; p.on = null;
    if (p.vy >= 0) {
      let floor = FLOOR, on = null;
      for (const plat of this.platforms) if (oldY <= plat.y + 1 && p.y >= plat.y && p.x + p.w / 2 > plat.x && p.x - p.w / 2 < plat.x + plat.w && plat.y < floor) { floor = plat.y; on = plat; }
      for (const o of this.obstacles) if (oldY <= o.y - o.h + 1 && p.y >= o.y - o.h && Math.abs(p.x - o.x) < (p.w + o.w) / 2 && o.y - o.h < floor) { floor = o.y - o.h; on = null; } // stand on top
      if (p.y >= floor) { p.y = floor; p.vy = 0; p.grounded = true; p.on = on; p.jumps = 0; }
    }
    if (p.plunge === 2) this.plungeHit(oldY);
    if (p.attack > .035) this.hitTargets();
    for (const e of this.enemies) if (e.hp > 0) this.updateEnemy(e, dt);
    this.updateTraps(dt);
    for (const o of this.obstacles) o.flash = Math.max(0, o.flash - dt);
    this.updateShots(dt);
    if (this.state !== 'playing' || this.eliteBeat > 0) return; // an elite that died this frame: the beat starts now, no chest, portal or projectile step
    for (const b of this.projectiles) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (Math.abs(b.x - p.x) < p.w / 2 + b.r && b.y > p.y - p.h && b.y < p.y + 4) {
        this.hurt(b.damage, Math.sign(b.vx), false, !!b.heavy); b.life = 0; // a shot that meets the hero is consumed, also while a dash shields them
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
    this.updatePools(dt);
    this.updateChests();
    if (this.state !== 'playing') return;
    const room = this.rooms.findIndex(r => p.x >= r.x && p.x < r.x + r.w);
    if (room >= 0 && room !== this.roomIndex) { this.roomIndex = room; this.emit('room', { stage: this.stage, index: room }); }
    if (!this.portalOpen && !(this.mode === 'castle' && (this.floor === WARDEN_FLOOR || this.floor === KING_FLOOR)) && this.enemies.every(e => !e.required || e.hp <= 0)) { this.portalOpen = true; this.emit('clear'); }
    if (this.state === 'playing' && this.portalOpen && Math.abs(p.x - this.portalX) < 46 && p.y > FLOOR - 80) this.finishStage();
  }
  // Moving platforms swing on a sine; dx / dy are this frame's movement, which riders (hero, grounded enemies) copy.
  updatePlatforms(dt) {
    for (const pl of this.platforms) {
      if (!pl.move) continue;
      pl.t += dt * pl.move.speed;
      const s = Math.sin(pl.t) * pl.move.amp, x = pl.move.axis === 'x' ? pl.x0 + s : pl.x, y = pl.move.axis === 'y' ? pl.y0 + s : pl.y;
      pl.dx = x - pl.x; pl.dy = y - pl.y; pl.x = x; pl.y = y;
    }
  }
  // A grounded hero beside an unopened chest opens it: a relic chest offers a 3-relic pick (no heal, play resumes in place), a heal chest restores HP and MP.
  updateChests() {
    const p = this.player;
    for (const c of this.chests) if (c.sealed && !this.enemies.some(e => e.chest === c.id && e.hp > 0)) { c.sealed = false; this.emit('unseal', { x: c.x, y: c.y }); }
    if (!p.grounded) return;
    for (const c of this.chests) if (!c.opened && !c.sealed && Math.abs(p.x - c.x) < CHEST_REACH && Math.abs(p.y - c.y) < 2) {
      c.opened = true;
      this.emit('chest', { x: c.x, y: c.y, kind: c.kind, optional: c.optional });
      if (c.kind === 'relic') { this.rollChoices('chest'); return; }
      const amount = Math.max(25, Math.round(p.maxHp * .3));
      p.hp = Math.min(p.maxHp, p.hp + amount); p.mp = p.maxMp;
      this.emit('heal', { x: p.x, y: p.y - 70, amount });
    }
  }
  // Required guards killed / total (the Moon Gate opens at n === total; the boss alone on stage 5).
  guardStatus() {
    const guards = this.enemies.filter(e => e.required);
    return { n: guards.filter(e => e.hp <= 0).length, total: guards.length };
  }
  jump() {
    const p = this.player;
    if (p.jumps >= 2 || p.dash > 0 || p.plunge) return;
    p.vy = p.jumps === 0 ? -575 : -520;
    p.jumps++; p.grounded = false;
    this.emit('jump', { x: p.x, y: p.y, double: p.jumps === 2 });
  }
  dash(fromBuffer = false) {
    const p = this.player, assault = this.frenzyOf('spear');
    if (this.frenzyOf('twin')) { p.dashBuf = 0; return; } // Unstoppable combo: dash is ignored and never buffered
    if (p.dashCd > 0 || p.plunge || p.attack > p.attackLen * .26 || (assault && p.dash > 0)) { if (!fromBuffer) p.dashBuf = .16; return; } // an attack can only be cancelled after 74% of it has played; an assault dash is one at a time
    p.attack = 0; p.dashBuf = 0; p.otherInv = p.invulnerable; p.perfect = assault ? 0 : .15; p.perfectUsed = assault;
    p.dash = .18; p.dashCd = assault ? 0 : p.dashCooldown;
    if (!assault) p.invulnerable = Math.max(p.invulnerable, Math.min(.23 + p.dashShield, p.dashCooldown * .8)); // i-frames cover at most 80% of the cooldown, so chained dashes always leave a gap; an assault has none
    p.vy = Math.min(p.vy, 0);
    this.emit('dash', { x: p.x, y: p.y, dir: p.dir, assault });
    this.assaulted = assault ? new Set() : null;
    if (assault) { p.blood = Math.max(BLOOD_HALF, p.blood - ASSAULT_BURN); this.checkFrenzy(); } // the extra burn can end the frenzy; this dash still finishes as an assault
  }
  attack() {
    const p = this.player;
    if (p.attackCd > 0 || p.dash > 0 || p.plunge) { p.buffer = .16; return; }
    p.buffer = 0;
    let cost = 0; // castle swing cost, paid as the swing starts (never lethal, free in frenzy)
    if (this.mode === 'castle' && !p.frenzy) { cost = Math.max(0, Math.min(SWING_COST, p.blood - 1)); p.blood -= cost; }
    if (!p.grounded) { // air attack wins over a thrust; it neither advances nor resets the combo
      Object.assign(p, { plunge: 1, plungeT: .07, plungeY: p.y, move: 'plunge', attack: 0, thrustWindow: 0 });
      this.hitSet = new Set(); this.flameUsed = this.chainUsed = false;
      this.emit('swing', { x: p.x, y: p.y - 30, dir: p.dir, combo: p.combo, move: 'plunge', cost });
      return;
    }
    const twin = this.frenzyOf('twin'), thrust = p.thrustWindow > 0;
    if (twin) { // faces the nearest living enemy within 260 at each swing start; none in range keeps the facing
      const t = this.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) <= TWIN_SEEK && e.x !== p.x).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (t) p.dir = Math.sign(t.x - p.x);
    }
    if (thrust && !this.heldDir) { // auto-face a living enemy within 200 (facing side first, else nearest) when no direction is held
      const near = this.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) <= 200).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
      const t = near.find(e => (e.x - p.x) * p.dir > 0) || near[0]; // prefer the facing side
      if (t && t.x !== p.x) p.dir = Math.sign(t.x - p.x);
    }
    if (thrust) p.thrustWindow = 0; // a thrust neither advances nor resets the combo
    else { p.combo = p.comboWindow > 0 ? p.combo % 3 + 1 : 1; p.comboWindow = .8; }
    p.move = thrust ? 'thrust' : '';
    p.whiff = HEAVY_WHIFF; // cleared by the first enemy the swing hits
    const quick = twin ? TWIN_FRENZY_CD : 1; // the swing itself speeds up too, or the 0.24 s floor would swallow the cooldown
    p.attack = p.attackLen = .24 * quick; p.attackCd = Math.max(p.attackLen, (thrust ? .34 : p.combo === 3 ? .39 : .29) * p.attackSpeed * quick); // never shorter than the swing animation
    this.hitSet = new Set(); this.flameUsed = this.chainUsed = false;
    this.emit('swing', { x: p.x, y: p.y - 30, dir: p.dir, combo: p.combo, move: thrust ? 'thrust' : 'combo', cost });
    if (!thrust && p.combo === 3 && this.stacks('wave')) this.launchShot('wave', .85 + .45 * (this.stacks('wave') - 1), 540, 4, 16);
    if ((thrust || p.combo === 3) && this.stacks('pierce')) this.launchShot('beam', .55 * this.stacks('pierce'), 780, BEAM_REACH / 780, 10);
    this.hitTargets();
  }
  // Player projectile (a wave's life is only a safety cap; it turns after 0.52 s and ends on reaching the hero): passes through enemies, one hit per enemy per pass (one frost hit per enemy per throw), poise 8, never heavy and no Chain Lightning.
  launchShot(kind, mul, speed, life, r, x = this.player.x, y = this.player.y - 30, dir = this.player.dir) {
    const shot = { kind, x, y, dir, vx: dir * speed, vy: 0, r, life, maxLife: life, mul, back: false, hit: new Set(), frosted: new Set() };
    this.shots.push(shot);
    this.emit('shot', { kind, x, y, dir, speed, life });
  }
  updateShots(dt) {
    const p = this.player, targets = this.enemies.concat(this.obstacles);
    for (const s of this.shots) {
      if (s.kind === 'wave' && !s.back && s.maxLife - s.life >= .52) { s.back = true; s.hit = new Set(); } // turn around: the returning pass hits again
      if (s.back) {
        const dx = p.x - s.x, dy = p.y - 30 - s.y, d = Math.hypot(dx, dy), step = 620 * dt;
        if (d <= step + 14) s.life = 0;
        else { s.x += dx / d * step; s.y += dy / d * step; s.vx = dx / d * 620; s.vy = dy / d * 620; }
      } else s.x += s.vx * dt;
      s.life -= dt;
      if (s.life <= 0) continue;
      for (const e of targets) {
        if (e.hp <= 0 || s.hit.has(e) || Math.abs(e.x - s.x) > e.w / 2 + s.r || s.y + s.r < e.y - e.h || s.y - s.r > e.y) continue;
        s.hit.add(e);
        if (e.kind) { this.damageObstacle(e, Math.round(p.damage * s.mul)); continue; }
        const crit = this.rand() < p.crit;
        const amount = Math.round(p.damage * s.mul * (crit ? 2 : 1));
        const blocked = e.type === 'shield' && e.guardBreak <= 0 && s.vx * e.dir < 0; // frontal only (decided by travel direction, robust at low frame rates); a returning crescent can hit a back
        this.damageEnemy(e, blocked ? Math.max(1, Math.round(amount * .15)) : amount, Math.sign(s.vx) || s.dir, crit, false, blocked, SHOT_POISE, false, 1, s.frosted.has(e) ? 'repeat' : true);
        if (this.bloodOk(e)) this.gainBlood(1);
        s.frosted.add(e); // a throw lands at most one frost hit per enemy, on either pass
      }
    }
    this.shots = this.shots.filter(s => s.life > 0 && s.x > 0 && s.x < this.worldWidth);
  }
  hitTargets() {
    const p = this.player;
    const thrust = p.move === 'thrust';
    const reach = thrust ? 155 + Math.min(60, 20 * this.stacks('pierce')) : p.reach + (p.combo === 3 ? 24 : 0);
    const mul = thrust ? p.thrustMul : [1, 1, 1.15, 1.8][p.combo];
    for (const e of this.enemies.concat(this.obstacles)) {
      const dx = (e.x - p.x) * p.dir;
      if (e.hp <= 0 || this.hitSet?.has(e) || dx < -e.w / 2 || dx > reach + e.w / 2 || (thrust ? e.y < p.y - 48 || e.y - e.h > p.y - 18 : e.y < p.y - 88 || e.y - e.h > p.y - 4)) continue;
      this.hitSet?.add(e);
      if (e.kind) { this.damageObstacle(e, Math.round(p.damage * p.swordMul * mul)); continue; }
      const crit = this.rand() < p.crit;
      const rip = this.takeRiposte(e);
      const amount = Math.round(p.damage * p.swordMul * mul * (crit ? 2 : 1) * (rip ? RIPOSTE_MUL : 1));
      // Shield bearers block sword hits from the side they face unless Eclipse broke their guard.
      const blocked = e.type === 'shield' && e.guardBreak <= 0 && (p.x - e.x) * e.dir >= 0;
      const punish = this.punishing(e);
      p.whiff = 0;
      this.damageEnemy(e, blocked ? Math.max(1, Math.round(amount * .15)) : amount, p.dir, crit, thrust || p.combo === 3, blocked, thrust ? POISE_DAMAGE.thrust : POISE_DAMAGE.combo[p.combo]);
      p.mp = Math.min(p.maxMp, p.mp + 2);
      if (this.bloodOk(e)) this.gainBlood((blocked ? 1 : !thrust && p.combo === 3 ? 5 : 3) + (punish && !blocked ? 2 : 0) + (rip ? RIPOSTE_BLOOD : 0));
      if (rip) this.emit('riposte', { x: e.x, y: e.y - e.h * .55 });
    }
  }
  // Spear frenzy: the dashing hero hits every enemy it overlaps once per dash (1.0 x damage, heavy knockback, 35 poise); a sword hit for blood, statuses and armor break. A shield front stops the dash.
  assault() {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0 || this.assaulted.has(e) || Math.abs(e.x - p.x) > (e.w + p.w) / 2 + 8 || e.y < p.y - p.h || e.y - e.h > p.y) continue;
      this.assaulted.add(e);
      const crit = this.rand() < p.crit, amount = Math.round(p.damage * p.swordMul * (crit ? 2 : 1));
      const blocked = e.type === 'shield' && e.guardBreak <= 0 && (p.x - e.x) * e.dir >= 0;
      p.whiff = 0;
      this.damageEnemy(e, blocked ? Math.max(1, Math.round(amount * .15)) : amount, p.dir, crit, true, blocked, POISE_DAMAGE.thrust);
      p.mp = Math.min(p.maxMp, p.mp + 2);
      if (this.bloodOk(e)) this.gainBlood(blocked ? 1 : 3);
      this.emit('assaultHit', { x: e.x, y: e.y - e.h * .55, dir: p.dir, blocked });
      if (blocked) p.dash = 0;
    }
  }
  // Castle: the first sword hit on an enemy stunned by a posture break is a riposte (x1.5 damage, +5 blood); the flag is spent by that hit.
  takeRiposte(e) { const r = this.mode === 'castle' && e.riposte && e.stun > 0; if (r) e.riposte = false; return r; }
  // Plunge hits: sword-style damage, never blocked (it comes from above); the fall and the landing shockwave share this.hitSet.
  plungeStrike(e, mul, poise, knock) {
    const p = this.player, crit = this.rand() < p.crit, punish = this.punishing(e), rip = this.takeRiposte(e);
    this.hitSet.add(e);
    this.damageEnemy(e, Math.round(p.damage * p.swordMul * mul * (crit ? 2 : 1) * (rip ? RIPOSTE_MUL : 1)), Math.sign(e.x - p.x) || p.dir, crit, true, false, poise, false, knock);
    p.mp = Math.min(p.maxMp, p.mp + 2);
    if (this.bloodOk(e)) this.gainBlood(3 + (punish ? 2 : 0) + (rip ? RIPOSTE_BLOOD : 0));
    if (rip) this.emit('riposte', { x: e.x, y: e.y - e.h * .55 });
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
    const vow = this.stacks('plunge');
    if (vow) for (const dir of [-1, 1]) this.launchShot('ground', .45 * vow, 420, GROUND_WAVE_REACH / 420, 12, p.x, p.y - 12, dir);
    for (const e of this.enemies.concat(this.obstacles)) {
      if (e.hp <= 0 || this.hitSet.has(e) || Math.abs(e.x - p.x) > radius + e.w / 2 || e.y < p.y - 100 || e.y - e.h > p.y + 4) continue;
      if (e.kind) { this.hitSet.add(e); this.damageObstacle(e, Math.round(p.damage * p.swordMul * (1 + .5 * vow))); continue; }
      this.plungeStrike(e, 1 + .5 * vow, POISE_DAMAGE.plunge, 1.4);
    }
  }
  magic() {
    const p = this.player;
    const cost = p.lunatic ? 0 : p.magicCost, castle = this.mode === 'castle'; // Lunatic Moon: free Eclipse, so noMana never fires
    if ((castle ? p.blood < SKILL_MIN : p.mp < cost) || p.magicCd > 0) { if (p.magicCd <= 0) this.emit('noMana'); return; }
    if (castle) { p.blood -= SKILL_COST; this.checkFrenzy(); } else p.mp -= cost;
    p.magicCd = p.magicCdMax; p.invulnerable = Math.max(p.invulnerable, .28);
    this.flameUsed = false; // Eclipse never chains, so it must not re-arm the chain of a swing still in progress
    const vortex = this.stacks('vortex'), radius = vortex ? Math.min(320, 210 + 35 * vortex) : 210;
    this.emit('magic', { x: p.x, y: p.y - 32, radius });
    const caught = this.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < radius);
    if (vortex) for (const e of caught) {
      if (e.armored && e.superArmor > 0) continue; // knockback-immune while armored
      const from = e.x; e.x = clamp(e.x + (p.x - e.x) * (e.type === 'boss' ? .1 : .78), 30, this.worldWidth - 40); // keeps y: never changes platform height
      if (e.type !== 'bat') for (const o of this.obstacles) { // stay on the near side of any solid in the way
        const half = (e.w + o.w) / 2;
        if (e.y > o.y - o.h + 1 && Math.abs(from - o.x) >= half && (Math.abs(e.x - o.x) < half || (from - o.x) * (e.x - o.x) < 0)) e.x = o.x + Math.sign(from - o.x) * half;
      }
    }
    const noBlood = this.noBlood; this.noBlood = true; // Eclipse hits and kills give no blood
    for (const e of caught) {
      this.damageEnemy(e, Math.round(p.magicDamage * (1 + .35 * vortex)), Math.sign(e.x - p.x) || p.dir, false, true, false, POISE_DAMAGE.eclipse, true);
      if (e.type === 'shield' && e.hp > 0) { e.guardBreak = 1.5; this.emit('guardBreak', { x: e.x, y: e.y - e.h * .55, dir: e.dir, duration: e.guardBreak }); }
    }
    this.noBlood = noBlood;
    for (const o of this.obstacles.slice()) if (Math.hypot(o.x - p.x, o.y - p.y) < radius) this.damageObstacle(o, Math.round(p.magicDamage * (1 + .35 * vortex)));
    this.projectiles = this.projectiles.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > 230);
  }
  damageEnemy(e, amount, dir, crit, heavy, blocked = false, poiseDamage = 0, eclipse = false, knock = 1, shot = false) {
    const warden = !!e.armored; // super armor instead of posture: full damage, never poise, flinch, knockback or interrupted tells
    if (warden) { poiseDamage = 0; if (e.breakStun > 0) amount = Math.round(amount * BREAK_MUL); }
    const through = this.absorb(e, amount), absorbed = amount - through;
    e.hp -= through; e.flash = .14;
    // Castle (#50): every minion attack (not a priest's bless) has hyper armor from tell start; posture damage still lands at x0.5. Before: heavy wind-up and strike only.
    const castle = this.mode === 'castle' && e.type !== 'boss';
    const winding = castle ? this.attacking(e) && !e.blessRadius : e.heavy && (e.tell > 0 || e.strikeT > 0); // hyper armor against everything except Eclipse
    const armored = e.armor > 0 || (winding && !eclipse); // post-stagger armor: damage lands, but no poise damage, flinch or knockback
    if (e.hp > 0 && (castle ? e.armor <= 0 : !armored) && poiseDamage > 0) {
      e.poise -= poiseDamage * (blocked ? .25 : 1) * (castle && winding ? .5 : 1) * (e.punishable ? 2 : 1);
      e.poiseHit = POISE_REGEN_DELAY; e.provoke = POISE_REGEN_DELAY;
    }
    const broken = e.hp > 0 && e.poise <= 0 && !warden;
    // The boss deliberately keeps its warning but still takes a 0.08 s hit stun (see the stun line below).
    const keepsTell = (e.type === 'knight' || e.type === 'boss') && e.tell > 0 && !broken && !(eclipse && e.type !== 'boss'); // light hits don't interrupt heavy enemies
    const hold = castle && !eclipse && (e.recover > 0 || e.steady > 0); // castle: no flinch during recovery or the steady window after a flinch
    if (blocked) {
      if (castle && e.type === 'shield' && !shot) { e.blocks = e.blocks.filter(t => this.time - t < 1).concat(this.time); if (e.blocks.length >= 2) e.counterT = 1; }
      // A block keeps the enemy's footing and its bash wind-up, and pushes the player away from the shield.
      const p = this.player;
      if (!shot) { // a projectile hitting the shield pushes nobody
        const fromHero = p.x, fromBearer = e.x;
        p.x = clamp(p.x + e.dir * 40, 25, this.worldWidth - 30); this.keepBeside(p, fromHero);
        // Shield shove: the bearer follows the pushback so blocking never opens distance.
        e.x = clamp(e.x + e.dir * Math.min(40, Math.max(0, Math.abs(p.x - e.x) - 30)), 30, this.worldWidth - 40); this.keepBeside(e, fromBearer);
        this.freeze = Math.max(this.freeze, .035);
      }
      this.emit('block', { x: e.x + e.dir * e.w / 2, y: e.y - e.h * .55, amount, dir: e.dir });
    } else {
      const quiet = (armored && !(eclipse && e.type !== 'boss')) || hold || warden; // Eclipse still interrupts armored non-bosses
      if (!quiet && (!keepsTell || e.type === 'boss')) {
        e.stun = Math.max(e.stun, e.type === 'boss' ? .08 : heavy ? .42 : .24);
        if (castle) e.steady = e.stun + STEADY;
        e.vx = dir * this.player.knockback * (heavy ? 1.6 : 1) * knock * (e.type === 'boss' ? .25 : 1);
      } else if (!quiet && e.type === 'knight') e.vx = dir * this.player.knockback * (heavy ? 1.6 : 1) * knock * .4;
      if ((!quiet || (castle && e.blessRadius)) && !keepsTell && e.type !== 'boss') { if (winding) this.cancelAttack(e); if (e.blessRadius) e.blessCd = 2.5; e.tell = 0; e.thrustBox = null; e.blessRadius = 0; } // a bless has no armor: any hit cancels it
      this.freeze = Math.max(this.freeze, heavy || crit ? .065 : .035);
      this.emit('hit', { x: e.x, y: e.y - e.h * .55, amount: through, absorbed, dir, crit, heavy, punish: this.punishing(e) });
    }
    if (broken) this.stagger(e);
    if (warden && e.hp > 0) this.armorHit(e, eclipse);
    this.settle(e);
    if (!blocked) this.elements(e, amount, heavy, eclipse, shot);
  }
  // After a forced sideways move (shield shove), put a body back on the side of every solid obstacle it started on.
  keepBeside(b, fromX) {
    for (const o of this.obstacles) {
      if (b.y <= o.y - o.h + 1 || b.y - b.h >= o.y) continue;
      const half = (b.w + o.w) / 2;
      if (Math.abs(b.x - o.x) < half || (fromX - o.x) * (b.x - o.x) < 0) b.x = o.x + (fromX < o.x ? -1 : 1) * half;
    }
  }
  // Boss phase change and death handling, shared by sword hits and damage-over-time / reaction damage.
  settle(e) {
    if (e.hp > 0 && e.king) { const phase = e.hp <= e.maxHp * .34 ? 3 : e.hp <= e.maxHp * .67 ? 2 : 1; if (phase > e.bossPhase) this.kingPhase(e, phase); }
    else if (e.hp > 0 && e.warden && e.bossPhase < 2 && e.hp <= e.maxHp * .5) this.wardenPhase(e);
    else if (e.hp > 0 && e.type === 'boss' && !e.warden) {
      const phase = e.hp <= e.maxHp * .34 ? 3 : e.hp <= e.maxHp * .67 ? 2 : 1;
      if (phase > e.bossPhase) this.enterPhase(e, phase);
    }
    if (e.hp <= 0) {
      e.hp = 0;
      const p = this.player;
      if (this.state === 'playing') { // no credit, leech, MP or drops once the hero is dead or the run ended
        if (this.rand() < .25 && this.mode !== 'castle') this.pickups.push({ x: e.x, y: Math.min(FLOOR - 20, e.y - 20), age: 0 });
        this.kills++; this.souls += e.type === 'boss' ? 100 : e.type === 'knight' ? 15 : 10;
        p.hp = Math.min(p.maxHp, p.hp + p.leech); p.mp = Math.min(p.maxMp, p.mp + 6);
        this.gainBlood(8);
      }
      this.emit('kill', { x: e.x, y: e.y - e.h * .5, boss: e.type === 'boss', warden: !!e.warden, king: !!e.king });
      if (e.warden && this.state === 'playing') { this.projectiles = []; this.pools = []; this.endFight(true); this.vigilT = 1.6; } // the Moon Gate is skipped: the second Vigil follows the kill
      if (e.king && this.state === 'playing') { this.projectiles = []; this.pools = []; this.endFight(true); this.kingT = 1.6; } // the slice-end screen follows the kill
      if (e.required) this.emit('guards', this.guardStatus());
      if (e.affix === 'splitting') this.splitElite(e);
      if (e.elite) {
        this.emit('eliteKill', { x: e.x, y: e.y - e.h * .5, affix: e.affix });
        if (this.state === 'playing' && !e.bonus) this.eliteBeat = ELITE_BEAT;
      }
    }
  }
  // A warded elite's shield soaks damage before HP; returns what gets through.
  absorb(e, amount) { const soak = Math.min(e.ward, amount); e.ward -= soak; return amount - soak; }
  // Splitting elite death: two copies (0.4x max health, plain enemies) on the same surface, to its left and right, never inside obstacles or off the platform.
  splitElite(e) {
    for (const side of [-1, 1]) {
      let x = e.x;
      const lo = Math.max(30, e.plat ? e.plat.x + e.w / 2 : 0), hi = Math.min(this.worldWidth - 40, e.plat ? e.plat.x + e.plat.w - e.w / 2 : Infinity);
      for (let d = 40; d <= 240; d += 20) {
        const c = clamp(e.x + side * d, lo, hi); // toward the platform interior: clamped, never beyond the edge
        if (side * (c - e.x) < 12 || this.obstacles.some(o => e.y > o.y - o.h + 1 && Math.abs(c - o.x) < (e.w + o.w) / 2)) continue;
        x = c; break;
      }
      const copy = this.spawnEnemy(e.type, x, this.tier), hp = Math.round(e.maxHp * .4);
      Object.assign(copy, { hp, maxHp: hp, y: e.y, plat: e.plat, dir: e.dir });
    }
  }
  thawImmunity() { return Math.max(1.2, 2 - .2 * (this.stacks('frost') - 1)); } // each frost stack past the first shortens post-thaw immunity
  stacks(id) { return this.relics.filter(r => r === id).length; }
  // Elemental damage: no hit-stop, flinch, poise damage or new statuses. Art listens to 'statusTick'.
  elemDamage(e, amount, source) {
    amount = Math.max(1, Math.round(amount));
    const through = this.absorb(e, amount);
    e.hp -= through;
    this.emit('statusTick', { source, x: e.x, y: e.y - e.h * .55, amount: through, absorbed: amount - through });
    const noBlood = this.noBlood; this.noBlood = true; this.settle(e); this.noBlood = noBlood;
  }
  // Statuses and reactions for one landed, unblocked sword/Eclipse hit. Reactions read the pre-hit state, then the hit applies its statuses.
  elements(e, amount, heavy, eclipse, shot = false) {
    const fire = this.stacks('fire'), frost = this.stacks('frost'), shock = this.stacks('shock'), bleed = this.stacks('bleed');
    if (!(fire || frost || shock || bleed)) return;
    const base = this.player.damage, mid = o => ({ x: o.x, y: o.y - o.h * .55 });
    const dist = o => Math.hypot(o.x - e.x, (o.y - o.h * .55) - (e.y - e.h * .55));
    const alive = () => this.enemies.filter(o => o.hp > 0);
    if (heavy && frost && e.frozen > 0) { // Shatter
      const radius = 130 + 10 * frost;
      e.frozen = 0; if (e.type !== 'boss') e.freezeImmune = this.thawImmunity();
      this.emit('reaction', { name: 'shatter', ...mid(e), radius });
      for (const o of alive().filter(o => dist(o) <= radius)) this.elemDamage(o, base * (1 + .35 * frost), 'shatter');
    }
    if (heavy && fire && e.bleedStacks > 0 && !this.flameUsed) { // Blood Flame, once per attack or Eclipse cast
      this.flameUsed = true;
      const n = e.bleedStacks, radius = 115;
      e.bleed = 0; e.bleedStacks = 0;
      this.emit('reaction', { name: 'bloodFlame', ...mid(e), radius });
      for (const o of alive().filter(o => dist(o) <= radius)) this.elemDamage(o, (.7 + .3 * n) * base * (1 + .3 * fire) * (o === e ? 1 : .5), 'bloodFlame');
    }
    if (shock && !eclipse && !shot && e.shock > 0 && !this.chainUsed) { // Chain (sword hits only) Lightning, once per attack
      const targets = alive().filter(o => o !== e && dist(o) <= 180 + 14 * shock).sort((a, b) => dist(a) - dist(b)).slice(0, 2 + shock);
      const zap = (.35 * base + .12 * amount) * shock;
      this.chainUsed = true;
      if (targets.length) {
        this.emit('reaction', { name: 'chain', ...mid(e), targets: targets.map(mid) });
        for (const o of targets) { this.elemDamage(o, zap, 'chain'); if (o.hp > 0) o.shock = 4; }
      } else if (e.hp > 0) { // no one to arc to: the living shocked target takes half the chain damage itself
        this.emit('reaction', { name: 'chain', ...mid(e), targets: [], solo: true });
        this.elemDamage(e, zap * .5, 'chain');
        if (e.hp <= 0) return;
      }
    }
    if (e.hp <= 0) return;
    const at = mid(e), boss = e.type === 'boss';
    if (fire) { e.burn = 4; e.burnDmg = .32 * base * fire; this.emit('status', { name: 'burn', ...at }); }
    if (shock) { e.shock = 4; this.emit('status', { name: 'shock', ...at }); }
    if (bleed) { e.bleed = 5; e.bleedStacks = Math.min(10 * bleed, e.bleedStacks + bleed); this.emit('status', { name: 'bleed', ...at, stacks: e.bleedStacks }); }
    if (frost && shot !== 'repeat') {
      e.chill = 2.5; e.frostT = 3;
      if (e.frozen <= 0 && e.freezeImmune <= 0) e.frostMeter += frost + (eclipse ? 1 : 0);
      if (e.frostMeter >= 3) {
        e.frostMeter = 0;
        if (e.freezeImmune <= 0 && e.frozen <= 0 && !e.armored) { // the boss freezes briefly, then ignores freezing for a while
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
    for (const k of STATUS_TIMERS) e[k] = Math.max(0, e[k] - dt);
    if (wasFrozen && e.frozen <= 0 && e.type !== 'boss') e.freezeImmune = this.thawImmunity(); // thawed: normal enemies get a window to act
    if (e.frostMeter > 0 && (e.frostT = (e.frostT || 0) - dt) <= 0) e.frostMeter = 0; // meter decays 3 s after the last frost hit
    if (e.burn <= 0 && e.bleed <= 0) { e.dotT = 0; return; }
    const burning = e.burn > 0, stacks = e.bleed > 0 ? e.bleedStacks : 0; // a tick landing on the frame a timer expires still counts
    e.burn = Math.max(0, e.burn - dt); e.bleed = Math.max(0, e.bleed - dt);
    if (e.bleed <= 0) e.bleedStacks = 0;
    e.dotT += dt;
    while (e.dotT >= .5 && e.hp > 0) {
      e.dotT -= .5;
      if (burning) this.elemDamage(e, e.burnDmg, 'burn');
      if (e.hp > 0 && stacks) this.elemDamage(e, .08 * this.player.damage * stacks, 'bleed');
    }
  }
  enterPhase(e, phase) {
    Object.assign(e, { bossPhase: phase, tell: 0, warn: null, move: '', travel: 0, recover: 0, punishable: false, poise: e.maxPoise, pause: 1.1 });
    this.emit('bossPhase', { phase, x: e.x, y: e.y - e.h * .5 });
  }
  // An attack in progress: wind-up, strike, the skeleton's backstep and lunge, or a boss charge.
  attacking(e) { return e.tell > 0 || e.strikeT > 0 || e.stepT > 0 || e.cutT > 0 || e.travel > 0; }
  cancelAttack(e) {
    if (e.heavy) e.heavyCd = HEAVY_CD; // a cancelled heavy cools down like a landed one; its token frees on the next update
    if (e.blessRadius) e.blessCd = 2.5;
    e.warn = null; e.move = ''; e.travel = 0; e.recover = 0;
    e.tell = 0; e.thrustBox = null; e.blessRadius = 0; e.punishable = false;
    e.heavy = false; e.heavyKind = ''; e.strikeT = 0; e.stepT = 0; e.cutT = 0; e.glint = 0; e.glinted = false; e.delayed = false;
  }
  stagger(e) {
    const cancelled = this.attacking(e) || e.recover > 0, castle = this.mode === 'castle' && e.type !== 'boss';
    this.cancelAttack(e); e.poise = e.maxPoise;
    e.stun = e.type === 'boss' ? .85 : castle ? STAGGER_STUN : 1;
    e.riposte = castle; // the first sword hit during this stun is a riposte
    e.armor = e.stun + (e.type === 'boss' ? .6 : 1.2); // counts down with the stun, so 1.2 s (boss 0.6 s) of armor remain once it ends
    if (e.type === 'shield') e.guardBreak = Math.max(e.guardBreak, e.stun); // guard is down for the stun
    this.freeze = Math.max(this.freeze, .055);
    this.emit('stagger', { x: e.x, y: e.y - e.h * .55, boss: e.type === 'boss', enemy: e.type, cancelled });
  }
  // Castle attack tokens (#50). Holders are living enemies with e.token ('light' or 'heavy'); a released token is free again after TOKEN_GAP.
  get tokens() { return this.enemies.filter(e => e.hp > 0 && e.token).map(e => ({ type: e.type, kind: e.token, x: Math.round(e.x) })); }
  // Does o ask for a token right now: ready, not busy, and the hero is inside its trigger range?
  wantsToken(o) {
    const p = this.player;
    return o.hp > 0 && o.type !== 'boss' && !o.token && !this.attacking(o) && o.recover <= 0 && o.stun <= 0 && o.frozen <= 0 && this.ready(o) && o.turn <= 0
      && Math.abs(o.x - p.x) < (this.provoked(o) ? PROVOKED_REACH : TRIGGER[o.type]) && (o.type === 'priest' || o.type === 'mage' || Math.abs(o.y - p.y) < 90);
  }
  // Wind-up limiter. Castle: only a token holder may start a tell (kind 'light', 'heavy' or 'support'); several ready enemies are ranked starved first, then the
  // one in front of the hero, then the longest waiting. Elsewhere: at most 2 (stages 1-3) or 3 (stages 4-5) enemies near the hero may be winding up at once.
  canWindUp(e, kind = 'light') {
    const p = this.player;
    if (this.mode === 'castle' && e.type !== 'boss') {
      if (e.x - p.x < -SCREEN_LEFT || e.x - p.x > SCREEN_RIGHT) return false; // nothing attacks from off screen
      if (kind === 'support') return !this.enemies.some(o => o !== e && o.hp > 0 && o.blessRadius && o.tell > 0);
      const holders = this.enemies.filter(o => o.hp > 0 && o.token), free = ATTACK_TOKENS - holders.length - this.gaps.length;
      const deny = () => { e.wait += this.step; return false; };
      if (free <= 0) return deny();
      if (kind === 'heavy' && holders.some(o => o.token === 'heavy')) return false; // one heavy token; the light attack that follows still asks
      const rivals = this.enemies.filter(o => o !== e && this.wantsToken(o)), ranged = o => o.type === 'priest' || o.type === 'mage';
      if (ranged(e) && rivals.some(o => !ranged(o) && Math.abs(o.x - p.x) < 110)) return deny(); // ranged enemies yield to close melee
      const front = o => (o.x - p.x) * p.dir > 0, ahead = (a, b) => (a.wait >= STARVED) !== (b.wait >= STARVED) ? a.wait >= STARVED : front(a) !== front(b) ? front(a) : a.wait > b.wait;
      return rivals.filter(o => ahead(o, e)).length < free || deny();
    }
    if (Math.abs(p.x - e.x) > (e.type === 'boss' ? 620 : 560)) return false;
    return this.enemies.filter(o => o !== e && o.hp > 0 && o.tell > 0 && Math.abs(p.x - o.x) <= 620).length < (this.stage >= 3 ? 3 : 2);
  }
  updateEnemy(e, dt) {
    e.blessed = Math.max(0, e.blessed - dt); e.blessCd = Math.max(0, e.blessCd - dt);
    this.tickStatus(e, dt);
    if (e.hp <= 0) return;
    if (e.elite) {
      if (e.affix === 'warded' && (e.wardT -= dt) <= 0) { e.wardT += WARD_PERIOD; e.ward = WARD_AMOUNT; }
      if (!e.seen && Math.abs(this.player.x - e.x) < ELITE_NOTICE) { e.seen = true; this.emit('elite', { x: e.x, y: e.y, affix: e.affix, bonus: !!e.bonus }); }
    }
    const speed = e.speed;
    if (e.blessed > 0) e.speed *= 1.15;
    if (e.chill > 0) e.speed *= e.type === 'boss' ? .85 : .68;
    const prevX = e.x;
    if (e.armored) this.moveWarden(e, dt); else this.moveEnemy(e, dt);
    e.speed = speed;
    if (this.mode === 'castle' && e.type !== 'boss') this.syncToken(e);
    // Hero above and a step up is in reach: hold at the platform edge instead of walking off, until the jump cooldown allows the jump.
    // Only while a reachable step exists and the cooldown runs, so it can never wait forever.
    const pl = e.plat, hp = this.player;
    if (pl && e.vy === 0 && e.jumpCd > 0 && hp.grounded && e.y - hp.y > 50 && e.stun <= 0 && e.frozen <= 0 && (e.x < pl.x || e.x > pl.x + pl.w) && this.stepUpFor(e)) e.x = clamp(e.x, pl.x, pl.x + pl.w);
    this.collideEnemy(e, prevX, dt);
    if (e.type !== 'bat' && e.type !== 'boss' && !e.vault) this.groundEnemy(e, dt);
  }
  // Ground enemy vertical life: gravity, standing on platforms, riding moving ones, a jump up toward a hero above (only onto a platform within a single jump)
  // and a drop through toward a hero below. A hero 90 px above the enemy's platform chain is reached step by step; an enemy directly under a 160 step just waits.
  stepUpFor(e) { // a platform one jump up, within 50 px sideways, and not above the hero; the one nearest the hero
    const p = this.player; let best = null, bestGap = 1e9;
    for (const pl of this.platforms) {
      const rise = e.y - pl.y, side = Math.max(pl.x - e.x, e.x - (pl.x + pl.w), 0);
      if (rise >= 40 && rise <= 95 && side <= 50 && pl.y >= p.y - 10 && Math.abs(pl.x + pl.w / 2 - p.x) < bestGap) { best = pl; bestGap = Math.abs(pl.x + pl.w / 2 - p.x); }
    }
    return best;
  }
  groundEnemy(e, dt) {
    const p = this.player, near = Math.abs(p.x - e.x) < 560, calm = e.stun <= 0 && e.frozen <= 0 && !(e.tell > 0);
    e.jumpCd = Math.max(0, e.jumpCd - dt); e.dropT = Math.max(0, e.dropT - dt);
    if (e.plat && e.vy === 0) { if (this.platforms.includes(e.plat)) { e.x = clamp(e.x + (e.plat.dx || 0), 30, this.worldWidth - 40); e.y = e.plat.y; } else e.plat = null; }
    if (calm && near && e.vy === 0) {
      if (e.plat && p.y - e.y > 60) { e.dropT = .4; e.plat = null; e.vy = 1; } // hero clearly below: step off through the platform
      else if (p.grounded && e.y - p.y > 50 && e.jumpCd <= 0) {
        const best = this.stepUpFor(e);
        if (best) { e.vy = -575; e.jumpCd = 1.6; e.plat = null; e.jumpVx = e.x < best.x + 8 ? 140 : e.x > best.x + best.w - 8 ? -140 : 0; }
      }
    }
    const oldY = e.y;
    e.x = clamp(e.x + e.jumpVx * dt, 30, this.worldWidth - 40);
    e.vy += 1550 * dt; e.y += e.vy * dt;
    let floor = FLOOR, on = null;
    if (e.vy >= 0 && e.dropT <= 0) for (const pl of this.platforms) if (oldY <= pl.y + 1 && e.y >= pl.y && e.x + e.w / 2 > pl.x && e.x - e.w / 2 < pl.x + pl.w && pl.y < floor) { floor = pl.y; on = pl; }
    if (e.y >= floor) { e.y = floor; e.vy = 0; e.plat = on; e.jumpVx = 0; }
  }
  // Obstacles are solid for ground enemies (bats fly over). A blocked walker hops over (vault); the boss and stunned or frozen enemies just stop. Returns true if blocked.
  collideEnemy(e, prevX, dt) {
    if (e.type === 'bat' || (!this.obstacles.length && !e.vault)) return false;
    if (e.vault) {
      const oldY = e.y;
      if (e.stun <= 0 && e.frozen <= 0 && !(e.tell > 0)) e.x = clamp(e.x + e.dir * 180 * dt, 30, this.worldWidth - 40);
      e.vy += 1550 * dt; e.y += e.vy * dt;
      let floor = FLOOR;
      for (const o of this.obstacles) if (oldY <= o.y - o.h + 1 && e.y >= o.y - o.h && Math.abs(e.x - o.x) < (e.w + o.w) / 2) floor = Math.min(floor, o.y - o.h);
      if (e.y >= floor) { e.y = floor; e.vy = 0; e.vault = floor !== FLOOR; } // stays in vault state on top of an obstacle so it falls off the far edge
    }
    let blocked = false, ahead = false; // vault only over an obstacle in the facing direction; otherwise just stop
    for (const o of this.obstacles) if (e.y > o.y - o.h + 1 && Math.abs(e.x - o.x) < (e.w + o.w) / 2) { e.x = o.x + (prevX < o.x ? -1 : 1) * (e.w + o.w) / 2; blocked = true; if ((o.x - prevX) * e.dir > 0) ahead = true; }
    if (ahead && !e.vault && e.type !== 'boss' && !e.heavy && !(e.stepT > 0 || e.cutT > 0) && e.stun <= 0 && e.frozen <= 0 && !(e.tell > 0)) { e.vault = true; e.vy = -520; }
    return blocked;
  }
  moveEnemy(e, dt) {
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.armor = Math.max(0, e.armor - dt);
    e.guardBreak = Math.max(0, e.guardBreak - dt);
    const castle = this.mode === 'castle' && e.type !== 'boss';
    if (castle) {
      e.steady = Math.max(0, e.steady - dt); e.poiseHit = Math.max(0, e.poiseHit - dt); e.provoke = Math.max(0, e.provoke - dt); e.counterT = Math.max(0, e.counterT - dt); e.stepRoll = Math.max(0, e.stepRoll - dt); e.glint = Math.max(0, e.glint - dt);
      if (e.poiseHit <= 0 && e.stun <= 0 && e.poise < e.maxPoise) e.poise = Math.min(e.maxPoise, e.poise + e.maxPoise * POISE_REGEN * dt); // posture refills after a quiet spell, never during a stun
      if (e.stun <= 0) e.riposte = false;
    }
    if (e.frozen > 0) { e.vx = 0; return; } // frozen: cannot move or attack (warnings were cancelled)
    const wasTurning = e.turn > 0;
    e.turn = Math.max(0, e.turn - dt); e.rollT = Math.max(0, e.rollT - dt); e.heavyCd = Math.max(0, e.heavyCd - dt);
    const resting = e.heavy || (e.recover > 0 && e.type !== 'boss'); // recovering from a heavy or (castle) a light attack
    if (e.stun > 0) { if (resting && !e.strikeT && !(e.tell > 0) && (e.recover -= dt) <= 0) Object.assign(e, { recover: 0, heavy: false, heavyKind: '', punishable: false }); e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); e.vx *= Math.exp(-dt * 8); return; }
    if (e.strikeT > 0) { this.heavyTravel(e, dt); return; }
    if (e.stepT > 0 || e.cutT > 0) { this.stepcut(e, dt); return; }
    if (resting && !(e.tell > 0)) { // recovery: stands still, facing locked, open to punishing hits
      e.vx = 0;
      if (e.type === 'bat' && e.heavy) e.y += (FLOOR - e.y) * Math.min(1, dt * 10);
      if ((e.recover -= dt) <= 0) Object.assign(e, { recover: 0, heavy: false, heavyKind: '', punishable: false });
      return;
    }
    const dx = p.x - e.x, distance = Math.abs(dx);
    const face = dx >= 0 ? 1 : -1;
    if (e.heavy) e.reface = 0; // heavy: facing locked from wind-up to the end of recovery
    else if (castle) { // castle: facing locks at tell start; outside attacks a minion turns after its own re-face delay
      if (e.tell > 0 || e.turn > 0) e.reface = 0;
      else if (wasTurning || dx * e.dir >= 0) { if (wasTurning) e.dir = face; e.reface = 0; }
      else if ((e.reface += dt) >= REFACE[e.type]) { e.dir = face; e.reface = 0; }
    } else if (e.type === 'boss') { if (!(e.tell > 0 || e.travel > 0)) e.dir = face; } // boss facing is locked while warning and charging
    else if (e.type !== 'shield' && !(e.type === 'spear' && e.tell > 0)) e.dir = face; // spear facing is locked during the warning
    else if (e.tell > 0 || e.turn > 0) e.reface = 0; // facing locked during the bash warning and the post-bash turn delay
    else if (wasTurning) e.dir = face; // the turn delay just ended: face at once, no re-face delay on top
    else if (dx * e.dir >= 0) e.reface = 0;
    else if ((e.reface += dt) >= .25) { e.dir = face; e.reface = 0; } // player behind: re-face delay
    if (!(e.tell > 0) && !(e.travel > 0) && distance > (e.type === 'boss' ? 750 : 590)) { e.vx = 0; return; } // a started warning always counts down
    if (e.tell > 0) {
      e.tell -= dt; e.vx = 0;
      if (e.heavyKind === 'dive') e.y += (e.warn.hover - e.y) * Math.min(1, dt * 8); // the bat rises and hovers during the tell
      if (castle && e.heavy && !e.glinted && e.tell <= GLINT_LEAD) { // release cue: the same 0.4 s before contact for every heavy, delayed or not
        e.glinted = true; e.glint = .1;
        this.emit('enemyGlint', { x: e.x, y: e.y - e.h * .5, kind: e.heavyKind, enemy: e.type, delayed: e.delayed });
      }
      if (e.tell <= 0) this.enemyAttack(e);
      return;
    }
    if (e.travel > 0) { this.bossCharge(e, dt, face); return; }
    const tellBefore = e.tell;
    if (this.mode === 'castle' && e.type !== 'boss' && this.startHeavy(e, distance)) e.vx = 0;
    else if (e.type === 'bat') {
      e.y += ((p.y - 34 + Math.sin(this.time * 4 + e.phase) * 15) - e.y) * dt * 1.6;
      e.vx = e.dir * e.speed; e.x += e.vx * dt;
      if (distance < 30 && Math.abs(e.y - (p.y - 25)) < 40 && e.cd <= 0 && this.canWindUp(e)) { e.tell = .36; e.cd = 1.3; }
    } else if (e.type === 'mage') {
      if (distance < 460 && e.cd <= 0 && this.canWindUp(e)) { e.tell = .65; e.cd = 2.4 - this.stage * .13; }
      else if (distance > 320) { e.vx = e.dir * e.speed * .6; e.x += e.vx * dt; }
      else e.vx = 0;
    } else if (e.type === 'priest') {
      const near = this.enemies.filter(o => o !== e && o.hp > 0 && o.type !== 'boss' && Math.abs(o.x - e.x) <= 250);
      if (near.length && e.blessCd <= 0 && this.canWindUp(e, 'support')) { e.tell = .9; e.blessRadius = 250; e.vx = 0; }
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
    } else if (castle && this.startMove(e, distance)) {
      e.vx = 0; // skeleton stepcut / shield counter started
    } else {
      const near = distance < (this.provoked(e) ? PROVOKED_REACH : e.type === 'shield' ? 70 : 60) && Math.abs(p.y - e.y) < 82 && this.ready(e);
      if (near && this.canWindUp(e)) { e.tell = e.type === 'knight' ? .6 : e.type === 'shield' ? .55 : castle ? .5 : .43; e.cd = (castle && LIGHT_CD[e.type]) || Math.max(.9, 1.7 - this.stage * .12); }
      else if (castle && HOLD_RING[e.type] && (near || !this.ready(e) || this.tokensFree() <= 0)) { // no token: wait just outside probe range, backing off when the hero walks in
        const lo = HOLD_RING[e.type];
        e.vx = distance < lo ? -face * e.speed * .6 : distance > lo + 20 ? e.dir * e.speed : 0;
        e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40);
      } else { e.vx = distance > 45 ? e.dir * e.speed : 0; e.x += e.vx * dt; }
    }
    if (e.affix === 'swift' && e.tell > 0 && !(tellBefore > 0)) e.tell = Math.max(e.heavy ? .7 : .3, e.tell * .8); // Swift: shorter warnings, never under 0.3 s (heavy 0.7 s)
  }
  // Castle skeleton / shield bearer that took posture damage in the last 1.5 s: one answer per posture hit. It answers a poke at once (no spawn or attack cooldown parking it in the hold
  // ring, inside the hero's reach) and may start its light tell from PROVOKED_REACH, so a hero who pokes from a distance always meets a tell.
  provoked(e) { return this.mode === 'castle' && !!HOLD_RING[e.type] && e.provoke > 0 && e.recover <= 0; }
  ready(e) { return e.cd <= 0 || this.provoked(e); }
  tokensFree() { return ATTACK_TOKENS - this.enemies.filter(o => o.hp > 0 && o.token).length - this.gaps.length; }
  // A token is taken when a tell (or the stepcut backstep) starts and released once the whole attack, recovery included, is over or cancelled.
  syncToken(e) {
    if (!e.token && !e.blessRadius && (e.tell > 0 || e.stepT > 0)) {
      e.token = e.heavy ? 'heavy' : 'light'; e.wait = 0; e.provoke = 0; // every tell start (light, heavy, stepcut, counter) spends the answer
      if (!e.heavy) this.emit('enemyTell', { x: e.x, y: e.y - e.h * .5, enemy: e.type, kind: e.move || LIGHT_KIND[e.type], dir: e.dir });
    } else if (e.token && !this.attacking(e) && !(e.recover > 0)) { e.token = ''; this.gaps.push(TOKEN_GAP); }
  }
  // Third moves of the PR 1 kits. Skeleton `stepcut` (read: the hero walks in within 100): backstep 70 px in 0.25 s, then a 0.5 s tell and a 0.15 s lunge of 80 px.
  // Shield `counter` (read: 2 blocked sword hits within 1 s): a 0.45 s tell, then a shove in front. Returns true if the move started.
  startMove(e, distance) {
    const p = this.player, dy = Math.abs(p.y - e.y);
    if (e.type === 'shield') {
      if (!(e.counterT > 0 && (p.x - e.x) * e.dir > 0 && distance <= 100 && dy < 82 && this.canWindUp(e))) return false;
      const d = e.dir;
      Object.assign(e, { tell: .45, move: 'counter', counterT: 0, cd: Math.max(e.cd, 1.2), warn: { kind: 'counter', box: { x: Math.min(e.x + d * 10, e.x + d * 60), y: e.y - 58, w: 50, h: 58 } } });
      return true;
    }
    if (e.type !== 'skeleton' || e.cd > 0 || e.stepRoll > 0 || distance >= 100 || dy >= 82 || !(p.vx * (e.x - p.x) > 0 && Math.abs(p.vx) > 100) || !this.canWindUp(e)) return false;
    if (this.rand() >= .5) { e.stepRoll = 1; return false; } // its own retry timer: a failed cleave roll (rollT) does not block it
    Object.assign(e, { stepT: .25, move: 'stepcut', stepV: -(Math.sign(p.x - e.x) || 1) * 280, cd: Math.max(e.cd, 1.2) });
    return true;
  }
  // Stepcut backstep, then (after the tell, see enemyAttack) the lunge along the path fixed at tell start. Hyper armor throughout (attacking()).
  stepcut(e, dt) {
    const prevX = e.x;
    if (e.stepT > 0) {
      e.stepT = Math.max(0, e.stepT - dt); e.vx = e.stepV; e.x = clamp(e.x + e.stepV * dt, 30, this.worldWidth - 40);
      if (this.collideEnemy(e, prevX, dt)) e.stepT = 0; // a barricade ends the backstep
      if (e.stepT > 0) return;
      const d = e.dir, to = clamp(e.x + d * 80, 30, this.worldWidth - 40);
      e.vx = 0; e.tell = .5;
      e.warn = { kind: 'stepcut', to, line: { x1: e.x, y1: e.y - 29, x2: to, y2: e.y - 29 }, box: { x: Math.min(to + d * 10, to + d * 100), y: e.y - 70, w: 90, h: 70 } };
      return;
    }
    const w = e.warn, d = e.dir;
    e.cutT = Math.max(0, e.cutT - dt);
    e.x = e.cutFrom + (w.to - e.cutFrom) * (1 - e.cutT / .15); e.vx = (e.x - prevX) / dt;
    if (this.collideEnemy(e, prevX, dt)) e.cutT = 0; // a barricade stops the lunge
    if (e.cutT > 0) return;
    if (this.heavyHits(e, { x: Math.min(e.x + d * 10, e.x + d * 100), y: e.y - 70, w: 90, h: 70 })) this.hurt(e.damage * (e.blessed > 0 ? 1.25 : 1), d);
    Object.assign(e, { warn: null, move: '', vx: 0, recover: .6, punishable: true, cd: Math.max(e.cd, 1.2) });
    e.action++;
  }
  // --- The Gate Warden (#50 section 5): a boss with a super armor gauge, a Gate Toll and blood pools. It reuses the boss body (type 'boss', warden: true) but none of the King's moves. ---
  spawnWarden(x) {
    const e = this.spawnEnemy('boss', x, 0);
    Object.assign(e, { warden: true, armored: true, required: true, hp: 520, maxHp: 520, w: 72, h: 112, damage: 16, speed: 75, maxPoise: 0, poise: 1, superArmor: ARMOR_MAX, superArmorMax: ARMOR_MAX, armorLock: 0, breakStun: 0, habit: [], read: '', chain: '', engaged: false, noted: false, struck: false });
    return e;
  }
  // Blood from a hit on the Warden: none while the gauge is up, except during a heavy's recovery (and the break stun, when the gauge is empty).
  bloodOk(e) { return !e.armored || e.superArmor <= 0 || (e.heavy && e.recover > 0); }
  // Gauge rules for one landed hit: a frenzy hit breaks it in phase 1 and chips FRENZY_CHIP in phase 2 (user decision); Eclipse chips 25; normal hits and the post-stun lock change nothing.
  armorHit(e, eclipse) {
    if (e.superArmor <= 0 || e.armorLock > 0) return;
    const frenzy = this.player.frenzy;
    if (frenzy && e.bossPhase < 2) { this.armorBreak(e); return; }
    if (!eclipse && !frenzy) return;
    const chip = frenzy ? FRENZY_CHIP : ECLIPSE_CHIP;
    e.superArmor = Math.max(0, e.superArmor - chip);
    this.emit('armorChip', { x: e.x, y: e.y - e.h * .55, value: chip, left: e.superArmor });
    if (e.superArmor <= 0) this.armorBreak(e);
  }
  armorBreak(e) {
    this.cancelAttack(e);
    Object.assign(e, { superArmor: 0, stun: BREAK_STUN, breakStun: BREAK_STUN, chain: '', force: '', pause: 0, vx: (Math.sign(e.x - this.player.x) || 1) * BREAK_KNOCK * 8 }); // the stun path slides it vx / 8 = 140 px
    if (this.fightOn) this.fightStats.breaks++;
    this.freeze = Math.max(this.freeze, .08);
    this.emit('armorBreak', { x: e.x, y: e.y - e.h * .55 });
  }
  wardenPhase(e) {
    this.cancelAttack(e);
    Object.assign(e, { bossPhase: 2, chain: '', pause: 1.1, stun: 0, breakStun: 0, vx: 0, superArmor: ARMOR_MAX, armorLock: 1.1 }); // the roar ends a break stun and restores the gauge, locked through the pause
    this.emit('wardenPhase', { phase: 2, x: e.x, y: e.y - e.h * .5 });
  }
  moveWarden(e, dt) {
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt); e.cd = Math.max(0, e.cd - dt); e.armorLock = Math.max(0, e.armorLock - dt); e.glint = Math.max(0, e.glint - dt); e.pause = Math.max(0, e.pause - dt);
    if (e.king) this.trackLedge(e, dt);
    if (e.frozen > 0) { e.vx = 0; return; }
    if (e.stun > 0) { // armor break: slides back, takes x1.5 damage, then the gauge refills and locks
      e.stun = Math.max(0, e.stun - dt); e.breakStun = e.stun;
      e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40); e.vx *= Math.exp(-dt * 8);
      if (e.stun <= 0) { Object.assign(e, { superArmor: e.superArmorMax, armorLock: ARMOR_LOCK, cd: .4, vx: 0 }); this.emit('armorRestore', { x: e.x, y: e.y - e.h * .55 }); }
      return;
    }
    if (e.pause > 0) { e.vx = 0; return; }
    const dx = p.x - e.x, distance = Math.abs(dx);
    if (e.tell > 0) {
      e.tell -= dt; e.vx = 0;
      if (e.move === 'string' && e.tell <= GLINT_LEAD) this.kingBranch(e); // the second hit of a slash string commits at the glint
      else if (e.heavy && !e.glinted && e.tell <= GLINT_LEAD) { e.glinted = true; e.glint = .1; this.emit('enemyGlint', { x: e.x, y: e.y - e.h * .5, kind: e.move, enemy: e.king ? 'king' : 'warden', delayed: e.delayed }); }
      if (e.tell > 0) return;
      if (e.move) { if (e.king) this.kingStrike(e); else this.wardenStrike(e); }
      return;
    }
    if (e.travel > 0) { this.wardenCharge(e, dt); return; }
    if (e.recover > 0) {
      e.vx = 0;
      if ((e.recover -= dt) <= 0) Object.assign(e, { recover: 0, heavy: false, heavyKind: '', punishable: false, cd: Math.max(e.cd, e.king && e.bossPhase >= 3 ? .2 : .35) }); // the Blood Moon quickens the pace
      return;
    }
    if (e.king && e.y < FLOOR) { e.y = Math.min(FLOOR, e.y + 700 * dt); e.vx = 0; return; } // after a descent it drops back off the ledge
    e.dir = dx >= 0 ? 1 : -1;
    if (!e.engaged) { if (distance > 900) { e.vx = 0; return; } e.engaged = true; }
    const side = e.x - p.x; // nothing attacks from off screen
    if (e.cd <= 0 && side >= -SCREEN_LEFT && side <= SCREEN_RIGHT) {
      if (e.king) { const pick = this.kingPick(e, distance); this.kingStart(e, pick.move, pick.delay); return; }
      const pick = this.wardenPick(e, distance); this.wardenStart(e, pick.move, pick.delay); return;
    }
    if (e.king && p.frenzy && distance < 320 && e.x - e.dir * 20 > 100 && e.x - e.dir * 20 < this.worldWidth - 100) { e.vx = -e.dir * e.speed * 1.3; e.x += e.vx * dt; return; } // kites the burn: backsteps while the hero is frenzied, unless cornered
    e.vx = distance > (e.king ? 105 : 95) ? e.dir * e.speed : 0; e.x = clamp(e.x + e.vx * dt, 30, this.worldWidth - 40);
  }
  // Move choice. Habit memory first (two of the last three heavy answers match), then the Toll against an overfed hero, then the band's pool.
  wardenPick(e, distance) {
    const p = this.player, close = distance < 150, counts = {};
    for (const h of e.habit.slice(-3)) counts[h] = (counts[h] || 0) + 1;
    const read = ['crossed', 'jumped', 'retreated'].find(k => counts[k] >= 2);
    e.chain = ''; e.read = read || ''; e.follows = 0;
    if (read) {
      e.habit = [];
      if (read === 'crossed') { e.chain = 'backhand'; return { move: close ? 'sweep' : 'charge' }; }
      if (read === 'jumped') return close ? { move: 'slam' } : { move: 'charge', delay: true };
      return { move: 'charge' };
    }
    if ((p.frenzy || p.blood > 150) && distance <= 160 && (e.lastMove !== 'seize' || p.frenzy && e.bossPhase >= 2)) return { move: 'seize' }; // phase 2 seizes a frenzied hero again and again
    const approach = p.vx * (e.x - p.x) > 0 && Math.abs(p.vx) > 100;
    const pool = close ? (e.bossPhase >= 2 ? ['sweep', 'slam', 'seize', 'charge'] : ['sweep', 'slam', 'seize']) : distance <= 330 ? (approach ? ['charge', 'slam', 'seize'] : ['charge', 'slam']) : ['charge']; // mid range: the slam's floor wave covers it too
    const list = pool.filter(m => m !== e.lastMove);
    const from = list.length ? list : pool;
    return { move: from[Math.floor(this.rand() * from.length)] };
  }
  // Starts a tell and exposes the exact hit area in e.warn. Heavies (slam, charge, seize) are held 0.4 s longer when delayed; their glint always comes GLINT_LEAD before contact.
  wardenStart(e, move, forceDelay = false, follow = false) {
    if (follow && move !== 'backhand') e.dir = this.player.x >= e.x ? 1 : -1; // a follow-up turns to the hero as its tell starts, then locks
    const d = e.dir, def = WARDEN_MOVES[move], warn = { kind: move };
    const front = (from, to, h) => ({ x: Math.min(e.x + d * from, e.x + d * to), y: e.y - h, w: to - from, h });
    if (move === 'sweep') warn.box = front(0, 146, e.h);
    else if (move === 'backhand') warn.box = front(-120, -10, e.h);
    else if (move === 'slam') { warn.box = front(0, 112, 123); warn.wave = { x1: e.x + d * 40, y1: FLOOR - 6, x2: e.x + d * 760, y2: FLOOR - 6 }; }
    else if (move === 'seize') warn.box = front(10, 95, 80);
    else {
      e.chargeTo = clamp(e.x + d * 305, 30, this.worldWidth - 40);
      warn.line = { x1: e.x, y1: e.y - e.h * .5, x2: e.chargeTo, y2: e.y - e.h * .5 };
      warn.box = { x: Math.min(e.x, e.chargeTo) - e.w / 2, y: e.y - e.h, w: Math.abs(e.chargeTo - e.x) + e.w, h: e.h };
    }
    const delayed = !!def.heavy && !follow && (forceDelay || (e.bossPhase >= 2 && this.rand() < .5)); // phase 2: any opening heavy, the seize included
    if (move === 'slam' && e.bossPhase >= 2) warn.wave2 = { x1: e.x - d * 40, y1: FLOOR - 6, x2: e.x - d * 760, y2: FLOOR - 6 }; // phase 2: a second wave runs out behind it
    Object.assign(e, { move, lastMove: move, warn, tell: follow ? FOLLOW_TELL[move] : def.tell + (delayed ? DELAY_EXTRA : 0), follow, heavy: !!def.heavy, heavyKind: def.heavy ? move : '', delayed, glinted: false, glint: 0, punishable: false, recover: 0, vx: 0, struck: false, noted: false });
    if (def.heavy) this.emit('enemyHeavy', { x: e.x, y: e.y - e.h * .5, kind: move, enemy: 'warden', area: warn, delayed });
    else this.emit('enemyTell', { x: e.x, y: e.y - e.h * .5, enemy: 'warden', kind: move, dir: d });
  }
  wardenRecover(e, move) {
    if (e.king) { this.kingRecover(e, move); return; }
    const cut = e.bossPhase >= 2 && WARDEN_MOVES[move].heavy ? PHASE2_RECOVER_CUT : 0;
    Object.assign(e, { warn: null, move: '', vx: 0, recover: Math.max(cut ? .9 : 0, WARDEN_MOVES[move].recover - cut), punishable: true, cd: Math.max(e.cd, .35) });
    const next = this.wardenFollow(e, move);
    if (next) { e.chain = ''; e.follows = (e.follows || 0) + 1; Object.assign(e, { recover: 0, punishable: false, heavy: false, heavyKind: '' }); this.wardenStart(e, next, false, true); }
  }
  // Which follow-up (if any) ends a sweep, charge, slam or seize, from where the hero is at that moment (visible state only); a backhand ends the string. A crossed read always ends in the backhand.
  wardenFollow(e, move) {
    const p = this.player, side = e.x - p.x, behind = (p.x - e.x) * e.dir < 0, gap = Math.abs(side);
    if (this.state !== 'playing' || move === 'backhand' || (e.follows || 0) >= MAX_FOLLOWS[e.bossPhase] || side < -SCREEN_LEFT || side > SCREEN_RIGHT) return '';
    if (e.chain === 'backhand') return 'backhand'; // a crossed read expects the hero behind it
    if (move === 'slam') return gap <= 330 ? 'charge' : ''; // the floor wave pins the hero to a jump; the charge meets the landing
    if (move === 'seize' && (e.struck || !p.grounded)) return !e.struck && gap <= 200 ? 'slam' : ''; // a landed Toll ends the string; a jumped gauntlet meets the slam on the landing
    if (move === 'charge') return behind && gap <= 330 ? 'charge' : ''; // the return charge: a dash through the first one leaves the dash on cooldown; a return may draw another
    if (behind) return gap <= 140 ? 'backhand' : 'charge';
    return gap <= 130 && p.grounded && move === 'sweep' ? 'seize' : gap <= 330 ? 'charge' : ''; // walked out: the gauntlet (after a sweep) or the charge follows
  }
  // How the hero answered a heavy at contact: jumped (airborne), crossed (behind the Warden), stood (in the area) or retreated (out of range).
  noteAnswer(e, answer) { e.habit.push(answer); if (e.habit.length > 3) e.habit.shift(); }
  wardenStrike(e) {
    const p = this.player, w = e.warn, move = e.move, d = e.dir;
    e.tell = 0;
    const hit = p.x + p.w / 2 > w.box.x && p.x - p.w / 2 < w.box.x + w.box.w && p.y > w.box.y && p.y - p.h < w.box.y + w.box.h;
    const answer = hit ? 'stood' : 'retreated', seen = !p.grounded ? 'jumped' : (p.x - e.x) * d < 0 ? 'crossed' : answer;
    this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: d, boss: true, kind: move, heavy: e.heavy, enemy: 'warden', area: w });
    if (move === 'charge') { e.warn = w; e.travel = .5; return; }
    if (move === 'sweep') { if (hit) this.hurt(e.damage, d); }
    else if (move === 'backhand') { if (hit) this.hurt(e.damage, -d); }
    else if (move === 'slam') {
      this.noteAnswer(e, seen);
      if (hit) this.hurt(HEAVY_DAMAGE, d, false, true);
      for (const [wave, dir] of [[w.wave, d], [w.wave2, -d]]) if (wave) this.projectiles.push({ x: wave.x1, y: wave.y1, vx: dir * 240, vy: 0, r: 14, life: 3, damage: HEAVY_DAMAGE, heavy: true, ground: true });
      this.spawnPools(e);
    } else { // seize: the Toll takes a hero inside its 80 px tall box, so a jump must clear the box at contact (a late jump is still caught)
      this.noteAnswer(e, seen);
      if (hit) this.wardenToll(e);
    }
    if (this.state === 'playing' || this.state === 'dead') this.wardenRecover(e, move);
  }
  wardenCharge(e, dt) {
    const p = this.player, step = (e.chargeTo - e.x) * Math.min(1, dt / e.travel);
    e.travel -= dt; e.x += step; e.vx = step / dt;
    if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) { const was = p.invulnerable; this.hurt(HEAVY_DAMAGE, e.dir, false, true); if (was <= 0) e.struck = true; } // i-frames (0.8 s) outlast the 0.5 s charge: once per charge
    if (!e.noted && (p.x - e.x) * e.dir < 0) { e.noted = true; this.noteAnswer(e, !p.grounded ? 'jumped' : e.struck ? 'stood' : 'crossed'); }
    if (e.travel > 0) return;
    e.x = e.chargeTo; e.vx = 0;
    if (!e.noted) this.noteAnswer(e, e.struck ? 'stood' : !p.grounded ? 'jumped' : 'retreated');
    if (e.king && e.bossPhase >= 3 && !e.struck) this.addPool(e.x, FLOOR, true); // Blood Moon: a charge that missed bleeds where it ended
    this.wardenRecover(e, 'charge');
  }
  // The Gate Toll: all blood above 100 (30 at 100 or below) goes to the Warden's gauge. A dash or the 0.8 s of invulnerability avoids it.
  wardenToll(e) {
    const p = this.player;
    if (p.invulnerable > 0) { this.perfectDodge(); return; }
    const taken = Math.min(p.blood, p.blood > BLOOD_HALF ? p.blood - BLOOD_HALF : TOLL_BASE), numb = this.frenzyOf('heavy'); // Numb to pain: the toll is debt and no knockback, but the gauge still refills
    if (numb) p.debt += Math.round(taken); else p.blood -= taken; // debt stays whole so the HUD, lethal cue and payment agree
    e.superArmor = Math.min(e.superArmorMax, e.superArmor + taken); e.struck = true;
    p.invulnerable = .8; if (!numb) p.x = clamp(p.x + e.dir * 120, 25, this.worldWidth - 30); this.freeze = .06;
    if (this.fightOn) this.fightStats.taken += taken;
    this.emit('toll', { x: p.x, y: p.y - 30, amount: taken, debt: numb });
    if (p.blood <= 0) this.heroDown(true, 'toll'); else this.checkFrenzy();
  }
  // Two pools on the floor beside the boss after a slam (+-200, phase 2 +-260); the newest MAX_POOLS stay.
  spawnPools(e) {
    const off = e.bossPhase >= 2 ? 260 : 200;
    for (const side of [-1, 1]) this.addPool(e.x + side * off, FLOOR, !!e.king);
  }
  // A blood pool; the King's are Tithe pools (drawn into him if left for TITHE_DELAY s). Pushed-out older pools stop draining.
  addPool(x, y, tithe = false) {
    const pool = { x: clamp(x, 60, this.worldWidth - 60), y, life: POOL_LIFE, max: POOL_LIFE, tithe };
    this.pools.push(pool);
    this.emit('bloodPool', { x: pool.x, y: pool.y, life: POOL_LIFE, tithe });
    for (const old of this.pools.splice(0, Math.max(0, this.pools.length - MAX_POOLS))) if (old.draining) this.emit('tithe', { state: 'broken', x: old.x, y: old.y });
  }
  updatePools(dt) {
    const p = this.player, king = this.enemies.find(e => e.king && e.hp > 0);
    for (const pool of this.pools) {
      pool.life -= dt;
      if (p.grounded && Math.abs(p.y - pool.y) <= 4 && Math.abs(p.x - pool.x) < 38) { // taken by touch while standing on its surface; frenzy does not halve it
        pool.life = 0; this.addBlood(POOL_GAIN); this.emit('poolTaken', { x: pool.x, y: pool.y, amount: POOL_GAIN });
        if (pool.draining) this.emit('tithe', { state: 'broken', x: pool.x, y: pool.y });
      } else if (pool.tithe && king) { // the Tithe: an untaken pool is drawn in along a visible stream for its last second and restores armor
        if (!pool.draining && pool.max - pool.life >= TITHE_DELAY) { pool.draining = true; this.emit('tithe', { state: 'start', x: pool.x, y: pool.y, toX: king.x, toY: king.y - king.h * .55, duration: pool.max - TITHE_DELAY }); }
        if (pool.life <= 0 && pool.draining) {
          const before = king.superArmor;
          if (king.breakStun <= 0) king.superArmor = Math.min(king.superArmorMax, before + TITHE_RESTORE);
          this.emit('tithe', { state: 'end', x: pool.x, y: pool.y, toX: king.x, toY: king.y - king.h * .55, amount: king.superArmor - before, left: king.superArmor });
        }
      }
    }
    this.pools = this.pools.filter(pool => pool.life > 0);
  }
  // --- The Fallen King, castle version (#50 section 6): the Warden's gauge, pools and habit memory, plus the slash string, volley, descent, ritual, the Tithe and the Blood Moon. ---
  spawnKing(x) {
    const e = this.spawnEnemy('boss', x, 4);
    Object.assign(e, { king: true, armored: true, required: true, hp: KING_HP, maxHp: KING_HP, w: 80, h: 128, damage: 24, speed: 75, maxPoise: 0, poise: 1, superArmor: KING_ARMOR, superArmorMax: KING_ARMOR, armorLock: 0, breakStun: 0, habit: [], read: '', chain: '', force: '', engaged: false, noted: false, struck: false, opened: false, ledge: null, ledgeT: 0, ledgeOff: 0 });
    return e;
  }
  // How long the hero has stood on one ledge (a 0.35 s hop off does not reset it).
  trackLedge(e, dt) {
    const p = this.player, on = p.grounded && p.on && p.on.kind === 'ledge' ? p.on : null;
    if (on && on === e.ledge) { e.ledgeT += dt; e.ledgeOff = 0; }
    else if (on) { e.ledge = on; e.ledgeT = dt; e.ledgeOff = 0; }
    else if (e.ledge && (e.ledgeOff += dt) > .35) { e.ledge = null; e.ledgeT = 0; }
  }
  kingPhase(e, phase) {
    this.cancelAttack(e);
    Object.assign(e, { bossPhase: phase, chain: '', force: '', pause: 1.1, stun: 0, breakStun: 0, vx: 0, superArmor: e.superArmorMax, armorLock: 1.1 }); // the roar ends a break stun and restores the gauge, locked through the pause
    this.emit('kingPhase', { phase, x: e.x, y: e.y - e.h * .5 });
  }
  // Move choice. A first move above 150 blood is the charge; a ledge held for LEDGE_TIME draws the descent; then habit memory (two of the last three heavy answers); a frenzied hero draws the volley; then the band's pool.
  kingPick(e, distance) {
    const p = this.player, ph = e.bossPhase, close = distance < 160, counts = {};
    for (const h of e.habit.slice(-3)) counts[h] = (counts[h] || 0) + 1;
    const read = ['crossed', 'jumped', 'retreated'].find(k => counts[k] >= 2);
    e.chain = ''; e.force = ''; e.read = read || ''; e.follows = 0; e.action++;
    if (!e.opened) { e.opened = true; if (p.blood > 150) return { move: 'charge' }; }
    if (ph >= 2 && e.ledge && e.ledgeT >= LEDGE_TIME) return { move: 'descent' };
    if (read) {
      e.habit = [];
      if (read === 'crossed') { e.force = 'turnslash'; if (close) { e.chain = 'string'; return { move: 'slash' }; } return { move: 'charge' }; }
      if (read === 'jumped') return close ? { move: 'slam' } : { move: 'charge', delay: true };
      return { move: 'charge' };
    }
    if (ph >= 2 && p.frenzy && this.rand() < .75) return { move: 'volley' };
    if (ph >= 3 && e.action % 3 === 0) return { move: 'ritual' };
    const pool = close ? (ph >= 2 ? ['slash', 'slam', 'charge'] : ['slash', 'slash', 'slam']) : distance <= 330 ? (ph >= 2 && distance > 200 ? ['charge', 'slam', 'volley'] : ['charge', 'slam']) : ph >= 2 ? ['charge', 'volley'] : ['charge'];
    const list = pool.filter(m => m !== e.lastMove), from = list.length ? list : pool;
    const move = from[Math.floor(this.rand() * from.length)];
    if (move === 'slash') e.chain = 'string';
    return { move };
  }
  // The exact hit area of a move, fixed when its tell starts (the string's branch builds its area at the glint).
  kingArea(e, move) {
    const p = this.player, d = e.dir, o = { x: e.x, y: e.y - e.h * .6 }, warn = { kind: move };
    const front = (from, to, h) => ({ x: Math.min(e.x + d * from, e.x + d * to), y: e.y - h, w: Math.abs(to - from), h });
    if (move === 'slash') warn.box = front(0, 146, e.h);
    else if (move === 'turnslash') warn.box = front(-120, -10, e.h);
    else if (move === 'slam') { warn.box = front(0, 112, 123); warn.wave = { x1: e.x + d * 40, y1: FLOOR - 6, x2: e.x + d * 760, y2: FLOOR - 6 }; }
    else if (move === 'charge') {
      e.chargeTo = clamp(e.x + d * 305, 30, this.worldWidth - 40);
      warn.line = { x1: e.x, y1: e.y - e.h * .5, x2: e.chargeTo, y2: e.y - e.h * .5 };
      warn.box = { x: Math.min(e.x, e.chargeTo) - e.w / 2, y: e.y - e.h, w: Math.abs(e.chargeTo - e.x) + e.w, h: e.h };
    } else if (move === 'volley') {
      warn.base = Math.atan2(p.y - 30 - o.y, p.x - o.x);
      warn.lines = [-.5, -.25, 0, .25, .5].map(a => ({ x1: o.x, y1: o.y, x2: o.x + Math.cos(warn.base + a) * VOLLEY_RANGE, y2: o.y + Math.sin(warn.base + a) * VOLLEY_RANGE, angle: warn.base + a }));
    } else if (move === 'ritual') warn.circles = [-200, 0, 200].map(dx => ({ x: p.x + dx, y: e.y, r: 56 }));
    else if (move === 'descent') { // lands on the ledge the hero has stood on; the shadow ring marks the shockwave
      const plat = e.ledge || p.on, land = { x: plat.x + plat.w / 2, y: plat.y, r: DESCENT_RADIUS };
      warn.landing = land; warn.circles = [land];
    }
    return warn;
  }
  kingStart(e, move, forceDelay = false, follow = false) {
    if (follow && move !== 'turnslash') e.dir = this.player.x >= e.x ? 1 : -1; // a string's second hit turns to the hero as its tell starts, then locks
    const def = KING_MOVES[move], delayed = !!def.heavy && !follow && (move === 'slam' || move === 'charge') && (forceDelay || (e.bossPhase >= 2 && this.rand() < .5)); // phase 2-3: the slam and the charge are delayed half the time
    const warn = this.kingArea(e, move), heavy = !!def.heavy;
    Object.assign(e, { move, lastMove: move, warn, tell: follow && FOLLOW_TELL[move] ? FOLLOW_TELL[move] : def.tell + (delayed ? DELAY_EXTRA : 0), follow, heavy, heavyKind: heavy ? move : '', delayed, glinted: false, glint: 0, punishable: false, recover: 0, vx: 0, struck: false, noted: false });
    if (heavy) this.emit('enemyHeavy', { x: e.x, y: e.y - e.h * .5, kind: move, enemy: 'king', area: warn, delayed });
    else this.emit('enemyTell', { x: e.x, y: e.y - e.h * .5, enemy: 'king', kind: move, dir: e.dir });
  }
  // The second glint of a slash string: where the hero stands now picks the hit. In front and close: slash; behind it: turnslash; far in front: charge. A crossed read forces the turnslash.
  kingBranch(e) {
    const p = this.player, behind = (p.x - e.x) * e.dir < 0, gap = Math.abs(p.x - e.x);
    const branch = e.force || (behind ? (gap <= 220 ? 'turnslash' : '') : gap <= 200 ? 'slash' : 'charge');
    e.force = '';
    if (!branch) { Object.assign(e, { tell: 0, move: '', warn: null, recover: KING_MOVES.string.recover, punishable: true, cd: Math.max(e.cd, .35) }); return; } // out of reach behind it: the string ends
    const def = KING_MOVES[branch], warn = this.kingArea(e, branch), heavy = !!def.heavy;
    Object.assign(e, { move: branch, warn, heavy, heavyKind: heavy ? branch : '', glinted: true, glint: .1 });
    this.emit('enemyGlint', { x: e.x, y: e.y - e.h * .5, kind: branch, enemy: 'king', delayed: false, branch: true });
    if (heavy) this.emit('enemyHeavy', { x: e.x, y: e.y - e.h * .5, kind: branch, enemy: 'king', area: warn, delayed: false, branch: true });
    else this.emit('enemyTell', { x: e.x, y: e.y - e.h * .5, enemy: 'king', kind: branch, dir: e.dir, branch: true });
  }
  kingRecover(e, move) {
    const def = KING_MOVES[move], cut = e.bossPhase >= 2 && def.heavy ? PHASE2_RECOVER_CUT : 0;
    Object.assign(e, { warn: null, move: '', vx: 0, recover: Math.max(cut ? .9 : 0, def.recover - cut), punishable: true, cd: Math.max(e.cd, .35) });
    const next = this.kingFollow(e, move);
    if (next) { e.follows = (e.follows || 0) + 1; Object.assign(e, { recover: 0, punishable: false, heavy: false, heavyKind: '' }); this.kingStart(e, next, false, true); }
  }
  // A slash opens the string's second hit; a crossed read's charge ends in the turnslash when the hero is right behind it. Visible state only; nothing starts once the hero is dead or off screen.
  kingFollow(e, move) {
    const p = this.player, side = e.x - p.x;
    if (this.state !== 'playing' || side < -SCREEN_LEFT || side > SCREEN_RIGHT) return '';
    if (move === 'slash' && e.chain === 'string') { e.chain = ''; return 'string'; }
    const behind = (p.x - e.x) * e.dir < 0, gap = Math.abs(side);
    if (move === 'charge' && e.force === 'turnslash') { e.force = ''; if (behind && gap <= 220) return 'turnslash'; }
    if (e.follows >= MAX_FOLLOWS[Math.min(2, e.bossPhase)] + 1 || e.chain) return '';
    if (move === 'slam') return gap <= 330 ? 'charge' : ''; // the floor wave pins the hero to a jump; the charge meets the landing
    if (move === 'charge') return behind && gap <= 330 ? 'charge' : ''; // the return charge, as the Warden's
    return '';
  }
  kingStrike(e) {
    const p = this.player, w = e.warn, move = e.move, d = e.dir;
    e.tell = 0;
    const hit = !!w.box && p.x + p.w / 2 > w.box.x && p.x - p.w / 2 < w.box.x + w.box.w && p.y > w.box.y && p.y - p.h < w.box.y + w.box.h;
    const seen = !p.grounded ? 'jumped' : (p.x - e.x) * d < 0 ? 'crossed' : hit ? 'stood' : 'retreated';
    this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: d, boss: true, kind: move, heavy: e.heavy, enemy: 'king', area: w });
    if (move === 'charge') { e.travel = .5; return; }
    if (move === 'slash') { if (hit) this.hurt(e.damage, d); }
    else if (move === 'turnslash') { if (hit) this.hurt(e.damage, -d); }
    else if (move === 'slam') {
      this.noteAnswer(e, seen);
      if (hit) this.hurt(HEAVY_DAMAGE, d, false, true);
      this.projectiles.push({ x: w.wave.x1, y: w.wave.y1, vx: d * 240, vy: 0, r: 14, life: 3, damage: HEAVY_DAMAGE, heavy: true, ground: true });
      if (e.bossPhase < 3) this.spawnPools(e); // Blood Moon: slams make no pools, a missed one sheds a pool at its contact point
      else if (!hit) this.addPool(e.x + d * 100, FLOOR, true);
    } else if (move === 'volley') {
      for (const l of w.lines) this.projectiles.push({ x: l.x1, y: l.y1, vx: Math.cos(l.angle) * 265, vy: Math.sin(l.angle) * 265, r: 9, life: (VOLLEY_RANGE - 9) / 265, damage: e.damage });
    } else if (move === 'ritual') { // ground-centred discs: a grounded hero inside one is hit, a gap or a high jump is safe
      if (w.circles.some(c => Math.hypot(c.x - clamp(c.x, p.x - p.w / 2, p.x + p.w / 2), c.y - clamp(c.y, p.y - p.h, p.y)) < c.r)) this.hurt(e.damage * 1.35, Math.sign(p.x - e.x) || 1);
    } else { // descent: lands on the ledge; a hero on that surface (up to 70 px above it) is caught by the shockwave
      const land = w.landing, caught = Math.abs(p.x - land.x) < land.r && p.y > land.y - 70 && p.y < land.y + 20;
      e.x = land.x; e.y = land.y; e.ledgeT = 0;
      this.emit('descent', { x: land.x, y: land.y, r: land.r, hit: caught });
      if (caught) this.hurt(HEAVY_DAMAGE, Math.sign(p.x - land.x) || 1, false, true);
      else if (e.bossPhase >= 3) this.addPool(land.x + d * 60, land.y, true);
    }
    if (this.state === 'playing' || this.state === 'dead') this.kingRecover(e, move);
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
    const prevX = e.x;
    e.travel -= dt; e.x += step; e.vx = step / dt;
    if (this.collideEnemy(e, prevX, dt)) { e.chargeTo = e.x; e.travel = 0; } // a barricade stops the charge
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
    if (e.heavy) { this.heavyStrike(e); return; }
    e.punishable = false;
    const dmg = e.damage * (e.blessed > 0 ? 1.25 : 1), castle = this.mode === 'castle';
    if (castle && e.move === 'stepcut') { // the tell is over: lunge along the stored path
      Object.assign(e, { cutT: .15, cutFrom: e.x });
      this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: false, kind: 'stepcut' });
      return;
    }
    if (castle && e.move === 'counter') {
      const w = e.warn, was = p.invulnerable, from = p.x;
      Object.assign(e, { warn: null, move: '', recover: .5, punishable: true });
      this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: false, kind: 'counter' });
      if (this.heavyHits(e, w.box)) {
        this.hurt(dmg, e.dir);
        if (was <= 0 && this.state === 'playing') { p.x = clamp(p.x + e.dir * 100, 25, this.worldWidth - 30); this.keepBeside(p, from); } // hurt pushes 20; the shove makes it 120
      }
      e.action++;
      return;
    }
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
    if (castle && LIGHT_RECOVER[e.type]) { e.recover = LIGHT_RECOVER[e.type]; e.punishable = true; } // the attack ends in a punishable recovery
    e.action++;
  }
  // --- Castle heavy attacks (#47) ---
  punishing(e) { return this.mode === 'castle' && e.punishable && e.recover > 0; } // a hit on an enemy recovering from an attack
  // Delayed heavy (castle): never on floors 1-4; 30% on floors 5-7 and 50% on 8-9, only for a heavy met on an earlier floor.
  delayHeavy(e, kind) {
    const chance = DELAY_CHANCE(this.floor); // shortcut: elites and bosses (50% on any floor) join with their twists in PR 3 / 4
    if (!chance || this.floor <= HEAVY_FIRST_FLOOR[kind]) return false;
    return this.rand() < chance;
  }
  // Hero state the player can already see (never raw input) decides the heavy chance.
  heavyChance(e) {
    const p = this.player, h = HEAVY[e.type];
    const seen = { whiff: p.whiff > 0, dashSpent: p.dashCd > 0 && p.dash <= 0, airborne: !p.grounded, frenzy: p.frenzy, cast: p.magicCd > 0, approach: p.vx * (e.x - p.x) > 0 && Math.abs(p.vx) > 100 };
    return Math.max(h.base, ...Object.entries(h.reads).filter(([k]) => seen[k]).map(([, c]) => c));
  }
  // Called where a ready enemy would pick an attack: returns true if a heavy wind-up started (the caller skips the light attack).
  startHeavy(e, distance) {
    const h = HEAVY[e.type], p = this.player;
    if (!h || e.cd > 0 || e.heavyCd > 0 || e.rollT > 0 || e.turn > 0 || e.reface > 0 || e.heavy) return false;
    const dy = Math.abs(p.y - e.y), front = (p.x - e.x) * e.dir > 0, d = e.dir;
    const ok = { cleave: distance <= 260 && dy < 82, dive: distance <= 160 && p.y - p.h / 2 > e.y - e.h / 2, rush: front && distance >= 100 && distance <= 240 && dy < 64, lunge: distance <= 240 && dy < 64, greatswing: distance <= 110 && dy < 82 }[h.kind];
    if (!ok || !this.canWindUp(e, 'heavy')) return false;
    if (this.rand() >= this.heavyChance(e)) { e.rollT = 1; return false; } // one roll per attack chance; a failed roll retries a second later
    const box = (from, to, height) => ({ x: Math.min(e.x + d * from, e.x + d * to), y: e.y - height, w: to - from, h: height });
    const warn = { kind: h.kind };
    if (h.kind === 'cleave') warn.box = box(10, 125, 90);
    else if (h.kind === 'greatswing') warn.box = box(10, 150, 100);
    else if (h.kind === 'lunge') warn.box = box(10, 300, 54);
    else if (h.kind === 'rush') {
      const to = clamp(e.x + d * 200, 30, this.worldWidth - 40);
      warn.to = to; warn.line = { x1: e.x, y1: e.y - 29, x2: to, y2: e.y - 29 };
      warn.box = { x: Math.min(e.x, to) - e.w / 2, y: e.y - 58, w: Math.abs(to - e.x) + e.w, h: 58 };
    } else {
      const hover = e.y - 30, ax = e.x, ay = hover - e.h / 2, tx = p.x, ty = p.y - p.h / 2, len = Math.hypot(tx - ax, ty - ay) || 1;
      const x2 = clamp(tx + (tx - ax) / len * 60, 30, this.worldWidth - 40), y2 = Math.min(FLOOR - e.h / 2, ty + (ty - ay) / len * 60);
      warn.hover = hover; warn.r = 22; warn.line = { x1: ax, y1: ay, x2, y2 };
    }
    const delayed = this.delayHeavy(e, h.kind); // the tell grows by 0.4 s; the glint still comes 0.4 s before contact
    Object.assign(e, { heavy: true, heavyKind: h.kind, tell: h.tell + (delayed ? DELAY_EXTRA : 0), warn, recover: 0, punishable: false, thrustBox: null, delayed, glinted: false, glint: 0 });
    e.cd = 1.2;
    this.emit('enemyHeavy', { x: e.x, y: e.y - e.h * .5, kind: h.kind, area: warn, delayed });
    return true;
  }
  heavyHits(e, rect, pad = 0) {
    const p = this.player;
    return p.x + p.w / 2 > rect.x - pad && p.x - p.w / 2 < rect.x + rect.w + pad && p.y + pad > rect.y && p.y - p.h < rect.y + rect.h + pad;
  }
  heavyStrike(e) {
    const w = e.warn, dmg = HEAVY_DAMAGE * (e.elite ? ELITE_DAMAGE : 1);
    this.emit('enemySwing', { x: e.x, y: e.y - e.h * .5, dir: e.dir, boss: false, kind: e.heavyKind, heavy: true, area: w });
    if (e.heavyKind === 'rush' || e.heavyKind === 'dive') {
      Object.assign(e, { strikeT: e.heavyKind === 'rush' ? .35 : .3, strikeMax: e.heavyKind === 'rush' ? .35 : .3, struck: false, from: { x: e.x, y: e.y }, dmg });
      return;
    }
    if (this.heavyHits(e, w.box)) this.hurt(dmg, e.dir, false, true);
    this.heavyEnd(e);
  }
  // Rush and dive: move along the fixed path; the body hits at most once.
  heavyTravel(e, dt) {
    const w = e.warn, p = this.player, prevX = e.x;
    e.strikeT = Math.max(0, e.strikeT - dt);
    const k = 1 - e.strikeT / e.strikeMax;
    if (e.heavyKind === 'rush') {
      e.x = e.from.x + (w.to - e.from.x) * k; e.vx = (e.x - prevX) / dt;
      if (this.collideEnemy(e, prevX, dt)) { w.to = e.x; e.strikeT = 0; } // a barricade stops the rush
      if (!e.struck && this.heavyHits(e, { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h })) { e.struck = true; this.hurt(e.dmg, e.dir, false, true); }
    } else {
      e.x = e.from.x + (w.line.x2 - e.from.x) * k; e.y = e.from.y + (w.line.y2 + e.h / 2 - e.from.y) * k; e.vx = (e.x - prevX) / dt;
      if (!e.struck && this.heavyHits(e, { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }, w.r)) { e.struck = true; this.hurt(e.dmg, Math.sign(p.x - e.x) || 1, false, true); }
    }
    if (e.strikeT <= 0 && this.state === 'playing') this.heavyEnd(e);
  }
  heavyEnd(e) {
    Object.assign(e, { warn: null, strikeT: 0, vx: 0, recover: HEAVY[e.type].recover, punishable: true, heavyCd: HEAVY_CD, cd: Math.max(e.cd, 1.2) });
    e.action++;
  }
  // The first 0.15 s of a dash is a perfect window: one ignored hit per dash pays MP and refreshes the thrust window.
  perfectDodge() {
    const p = this.player;
    if (p.perfect <= 0 || p.perfectUsed || p.otherInv > 0) return; // only if the dash itself stopped the hit
    p.perfectUsed = true; p.mp = Math.min(p.maxMp, p.mp + p.perfectMp); this.gainBlood(5); p.thrustWindow = Math.max(p.thrustWindow, .9);
    this.freeze = Math.max(this.freeze, .05);
    this.emit('perfectDash', { x: p.x, y: p.y - 30 });
  }
  hurt(amount, dir, hazard = false, heavy = false) {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (p.invulnerable > 0) { if (!hazard) this.perfectDodge(); return; } // a trap is never a perfect dodge
    const actual = Math.max(1, Math.round(amount * p.armor * p.takenMul)); // a landed hit always costs at least 1 HP
    const castle = this.mode === 'castle';
    const numb = this.frenzyOf('heavy'); // Numb to pain: damage becomes debt, no knockback
    if (numb) p.debt += actual; else if (castle) p.blood = Math.max(0, p.blood - actual); else p.hp = Math.max(0, p.hp - actual);
    p.invulnerable = .8;
    if (!numb) p.x = clamp(p.x + dir * 20, 25, this.worldWidth - 30);
    this.freeze = .06;
    if (this.fightOn) this.fightStats.taken += actual;
    this.emit('hurt', { x: p.x, y: p.y - 30, amount: actual, heavy, debt: numb ? p.debt : 0 });
    if (numb) return;
    if (castle ? p.blood === 0 : p.hp === 0) this.heroDown(heavy); else this.checkFrenzy();
  }
  heroDown(heavy, cause = '') {
    const p = this.player;
    this.state = 'dead'; p.plunge = 0; p.move = ''; this.endFrenzy(); this.endFight(false);
    this.emit('death', { heavy, cause });
  }
  finishStage() {
    this.player.plunge = 0; this.player.move = '';
    if (this.stage === 4 && this.mode === 'normal') { this.state = 'won'; this.emit('win'); return; }
    if (this.mode === 'castle' && !CASTLE_PICKS.includes(this.floor)) this.nextFloor();
    else this.rollChoices('stage', this.mode === 'castle' ? SLICE_POOL : undefined);
  }
  chooseRelic(id) {
    if (this.state !== 'upgrade') return false;
    const relic = this.choices.find(r => r.id === id);
    if (!relic) return false;
    relic.apply(this.player); this.relics.push(relic.id);
    for (const k in this.player) if (typeof this.player[k] === 'number' && !(Math.abs(this.player[k]) <= STAT_CAP)) this.player[k] = Number.isNaN(this.player[k]) ? 0 : Math.sign(this.player[k]) * STAT_CAP; // finite guard for endless stacking
    if (this.mode === 'castle') { this.nextFloor(); return true; } // castle picks restore nothing; they only come after floors 3, 6 and 9
    if (this.pickReason === 'elite') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20); this.player.mp = this.player.maxMp; this.state = 'playing'; return true; } // like a stage pick's restore, but play resumes in place
    if (this.pickReason === 'chest') { this.state = 'playing'; return true; } // chest pick: no heal, no stage change
    if (this.pickReason === 'start') this.state = 'playing'; // opening pick: no heal, stage 1 is already loaded
    else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
      this.player.mp = this.player.maxMp;
      this.floor++; this.loadStage(this.mode === 'endless' ? (this.floor - 1) % STAGES.length : this.stage + 1); this.state = 'playing';
    }
    this.emit('stage', { stage: this.stage, floor: this.floor, mode: this.mode });
    return true;
  }
}