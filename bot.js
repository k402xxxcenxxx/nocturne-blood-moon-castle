// Test bot (#52): plays the hero from the full game state, but through the same input object a human produces
// ({ left, right, jump, attack, dash, magic }) and under human limits. Pure logic: no DOM, Canvas, Audio or storage, so it runs in Node.
// It reads only the current state (never future game.rand() rolls). Used by tools/bot-run.mjs, tests/bot.test.js and game.js (?test, key B).
import { FLOOR, WEAPONS, SKILL_MIN } from './core.js';

export const REACTION_DELAY = .18; // s before the bot reacts to a new tell, strike, projectile or enemy
export const MAX_PRESSES_PER_SECOND = 8; // rising edges of any button, in any sliding second
export const MIN_HOLD = 1 / 30; // s a direction stays held before it may change (non-urgent)
// Skill profiles. `mistime`: chance that one attack's dodge is early or late by `mistimeBy` s; `greedy`: chance of one extra swing after a punish when a new
// threat appears; `misread`: chance of dodging the wrong way. Rolled once per attack from the bot's own seeded RNG (never game.rand()); expert rolls nothing.
export const SKILLS = {
  expert: { reaction: REACTION_DELAY, presses: MAX_PRESSES_PER_SECOND, mistime: 0, mistimeBy: 0, greedy: 0, misread: 0 },
  average: { reaction: .3, presses: 6, mistime: .15, mistimeBy: .12, greedy: .1, misread: .05 },
};
const DASH_LEAD = .12; // dash when a hit is this close: the 0.23 s of i-frames cover it with +-0.1 s of slack (no frame-perfect timing)
const ATTACK_RESERVE = 3, MOVE_RESERVE = 2, DODGE_RESERVE = 1; // attack and non-urgent direction presses stop this far under the cap, so a jump, dash or Eclipse never waits for the budget
const JUMP_AT = .4, EDGE_MARGIN = 25, CLIP_PATIENCE = 3;
const WEAPON_PICK = 'spear';
const HEAVY_DEBT_CAP = 30; // Greatsword frenzy: the bot stops trading light hits once debt plus the hit would pass this (debt of 100 kills)
const RELIC_ORDER = ['armor', 'dash', 'edge', 'haste', 'reach', 'crit', 'wave', 'pierce', 'fire', 'frost', 'shock', 'bleed', 'plunge', 'vortex'];

export const chooseWeapon = () => WEAPON_PICK in WEAPONS ? WEAPON_PICK : Object.keys(WEAPONS)[0];
// Cursed relics are never taken unless they are all that is offered (a Blood Oath makes a heavy lethal at any blood).
export function chooseRelic(game, offers = game.choices) {
  const rank = r => (r.cursed ? 1000 : 0) + (RELIC_ORDER.indexOf(r.id) + 1 || 500);
  return [...offers].sort((a, b) => rank(a) - rank(b))[0];
}
// Applies a modal decision the way the UI does, for headless play: Vigil weapon, relic pick. Returns true if it acted.
export function resolveModal(game) {
  if (game.state === 'rest') return game.setWeapon(chooseWeapon(game)) && game.descend();
  if (game.state === 'upgrade') return game.chooseRelic(chooseRelic(game, game.choices).id);
  return false;
}

const CHARGE_SPEED = 610; // Warden charge: 305 px in 0.5 s
const WARDEN_STANDOFF = 120; // the bot waits this far from the Warden: outside its slam box, so every close move shows a tell it can answer
// Seconds until the Warden's current attack would hurt a hero standing at feet (px, py); Infinity if it would miss (a seize box is 80 px tall: feet above it are safe).
function wardenHit(w, px, py) {
  const a = w.warn, striking = w.travel > 0;
  if (!a || !(w.tell > 0 || striking)) return Infinity;
  if (a.kind === 'charge') {
    if (py <= w.y - w.h) return Infinity; // feet above the body: a double jump clears the pass
    const d = Math.sign(w.chargeTo - w.x) || w.dir, ahead = (px - w.x) * d;
    if (ahead < -50 || ahead > Math.abs(w.chargeTo - w.x) + 50) return Infinity;
    return (striking ? 0 : w.tell) + Math.max(0, ahead - 50) / CHARGE_SPEED;
  }
  if (!(w.tell > 0)) return Infinity;
  if (a.kind === 'volley') { // the Fallen King's five drawn lines: sample each orb's flight after release
    for (const l of a.lines) for (let s = 0; s <= 1.6; s += .04) {
      const bx = l.x1 + Math.cos(l.angle) * 265 * s, by = l.y1 + Math.sin(l.angle) * 265 * s;
      if (Math.abs(bx - px) < 23 && by > py - 58 && by < py + 4) return w.tell + s;
    }
    return Infinity;
  }
  if (a.kind === 'ritual') return a.circles.some(c => Math.abs(px - c.x) < c.r + 14 && py > w.y - c.r) ? w.tell : Infinity; // ground discs: a gap between them is safe
  if (a.kind === 'descent') { const l = a.landing; return Math.abs(px - l.x) < l.r + 14 && py > l.y - 70 && py < l.y + 20 ? w.tell : Infinity; } // shockwave on the ledge surface
  return a.box && rectHit(px, py, a.box) ? w.tell : Infinity;
}
const rectHit = (px, py, r, pad = 0) => px + 14 > r.x - pad && px - 14 < r.x + r.w + pad && py + pad > r.y && py - 58 < r.y + r.h + pad;

// Seconds until enemy e's current attack would hurt a hero standing at feet (px, py); Infinity if it would miss. Reads the warn geometry the core exposes.
function hitTime(e, px, py) {
  const w = e.warn;
  if (e.heavy && w && (e.tell > 0 || e.strikeT > 0) && !e.struck) {
    if (w.kind === 'rush' || w.kind === 'dive') { // travelling body: sample the fixed path
      const dive = w.kind === 'dive', max = dive ? .3 : .35, striking = e.strikeT > 0, base = striking ? 0 : e.tell;
      const k0 = striking ? 1 - e.strikeT / (e.strikeMax || max) : 0;
      const fx = striking ? e.from.x : e.x, fy = striking ? e.from.y : dive ? w.hover : e.y;
      const tx = dive ? w.line.x2 : w.to, ty = dive ? w.line.y2 + e.h / 2 : e.y;
      for (let k = k0; k <= 1.0001; k += .05) {
        const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k;
        if (rectHit(px, py, { x: x - e.w / 2, y: y - e.h, w: e.w, h: e.h }, dive ? w.r : 0)) return base + (k - k0) * max;
      }
      return Infinity;
    }
    if (w.kind === 'ray') return w.box && rectHit(px, py, w.box) ? Math.max(0, e.tell) : Infinity; // mage ray: a 0.15 s contact window after the tell (a jump clears the 16 px line)
    if (w.kind === 'rite') { const c = w.circles[0]; return e.tell > 0 && Math.abs(px - c.x) < c.r + 14 && py > c.y - c.r ? e.tell : Infinity; } // priest rite: a ground disc, walk out of it
    return e.tell > 0 && w.box && rectHit(px, py, w.box) ? e.tell : Infinity;
  }
  if (e.move === 'stepcut' && w?.box) return rectHit(px, py, w.box, 4) ? (e.cutT > 0 ? e.cutT : e.tell + .15) : Infinity; // castle skeleton lunge: tell, then a 0.15 s step
  if (e.move === 'overhead' && w?.box) return rectHit(px, py, w.box) ? e.tell : Infinity; // knight overhead: steps during the tell, lands at its end
  if ((e.move === 'counter' || e.move === 'rising' || e.move === 'rimstrike' || e.move === 'shove') && w?.box) return e.tell > 0 && rectHit(px, py, w.box) && (e.move !== 'rising' || py < e.y - 40) ? e.tell : Infinity; // castle shield shove and rim strike, apex skeleton counter and rising slash: the drawn box
  if (e.move === 'lift' && w?.box) { return e.tell > 0 && rectHit(px, py, w.box) ? e.tell : Infinity; } // spearman lift: a column centred on the landing, 0-170 px above its feet
  if (e.move === 'plant' && w?.box) return rectHit(px, py, w.box) && !e.plantHit ? (e.tell > 0 ? e.tell : .01) : Infinity; // planted spear: the tip box is live for 1.2 s after the tell
  if (!(e.tell > 0) || e.heavy) return Infinity;
  const dx = Math.abs(px - e.x), dy = Math.abs(py - e.y);
  if (e.type === 'boss') return w && (w.box && rectHit(px, py, w.box) || w.circles?.some(c => Math.abs(px - c.x) < c.r + 14 && py > e.y - c.r)) ? e.tell : Infinity;
  if (e.type === 'knight' && w?.box) return rectHit(px, py, w.box) ? e.tell : Infinity; // castle knight slash and turnswipe: the drawn box
  if (e.type === 'bat') return dx < 55 && dy < 58 ? e.tell : Infinity;
  if (e.type === 'spear') return e.thrustBox && rectHit(px, py, e.thrustBox) ? e.tell : Infinity;
  if (e.type === 'shield') return dx < 70 && (px - e.x) * e.dir >= 0 && dy < 77 ? e.tell : Infinity;
  if (e.type === 'skeleton' || e.type === 'knight') return dx < 82 && dy < 77 ? e.tell : Infinity;
  return Infinity; // mages and priests act through projectiles
}

export function createBot({ decide: decider, skill: skillName = 'expert', seed = 1 } = {}) { // `decide` overrides the policy (tests drive the press limiter with it)
  const skill = SKILLS[skillName];
  if (!skill) throw new Error(`unknown bot skill: ${skillName}`);
  let rs = seed >>> 0 || 1; // mulberry32: the bot's own mistakes, so game.rand() rolls stay untouched
  const rng = () => { let t = rs += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const roll = r => { r.jit = skill.mistime && rng() < skill.mistime ? (rng() < .5 ? -1 : 1) * skill.mistimeBy : 0; r.flip = !!skill.misread && rng() < skill.misread; };
  const jit = o => info.get(o)?.jit || 0, flip = (o, d) => (info.get(o)?.flip ? -d : d);
  let fightN = 0, clipSince = -1, greedyUntil = 0, wasOpen = false; // a pending greedy extra swing expires at greedyUntil
  const greedyOn = now => now < greedyUntil;
  const rollGreedy = now => { if (skill.greedy && rng() < skill.greedy) greedyUntil = now + 1.5; };
  const rolled = new WeakMap(); // enemy -> attack count of the punish window already rolled for greed
  const info = new WeakMap(); // enemy or projectile -> { sig, since, seen }: when the bot first perceived it / its current attack
  const presses = []; // timestamps of recent rising edges
  let prev = {}, last = {}, dirSince = -1;
  const api = {
    presses,
    // Has the bot had REACTION_DELAY to notice enemy e's current attack?
    reacts(e, now) { const r = info.get(e); return !!(r && r.sig && now - r.since >= skill.reaction); },
    known(e, now) { const r = info.get(e); return !!(r && r.seen !== null && now - r.seen >= skill.reaction); },
    input(game) {
      if (game.state !== 'playing' || game.freeze > 0 || game.eliteBeat > 0) return last; // the core ignores this frame; a pending impulse waits
      const now = game.time;
      track(game, now);
      const want = (decider || decide)(game, now);
      while (presses.length && presses[0] < now - 1) presses.shift();
      const out = {};
      const allow = (kind, key) => { // rising edges cost budget; attacks and non-urgent steps leave a reserve for dodges
        if (prev[key]) return true;
        const cap = skill.presses - (kind === 'attack' ? ATTACK_RESERVE : kind === 'dir' ? (want.urgent ? DODGE_RESERVE : MOVE_RESERVE) : 0);
        if (presses.length >= cap) return false;
        presses.push(now); return true;
      };
      let dir = want.dir;
      const held = prev.right ? 1 : prev.left ? -1 : 0;
      if (dir !== held && !want.urgent && now - dirSince < MIN_HOLD) dir = held;
      if (dir && dir !== held && !allow('dir', dir > 0 ? 'right' : 'left')) dir = 0; // no press left for the turn: stop rather than keep walking the wrong way
      if (dir !== held) dirSince = now;
      if (dir) out[dir > 0 ? 'right' : 'left'] = true;
      for (const key of ['jump', 'dash', 'magic', 'attack']) {
        if (key === 'dash' && want.dir && dir !== want.dir && !want.urgent) continue; // an assault or chase dash goes where the hero faces: wait for the turn
        if (want[key] && !prev[key] && allow(key, key)) out[key] = true;
      }
      prev = out; last = out;
      return out;
    },
  };
  function track(game, now) {
    const p = game.player;
    for (const e of game.enemies) {
      let r = info.get(e); if (!r) info.set(e, r = { sig: '', since: 0, seen: null });
      const sig = e.hp > 0 ? (e.tell > 0 ? 't' + (e.move || '') + (e.follows || 0) : e.strikeT > 0 || e.travel > 0 || e.cutT > 0 || e.plantT > 0 ? 's' : '') : '';
      if (sig && sig !== r.sig && !(r.sig[0] === 't' && sig === 's')) { r.since = now; roll(r); } // a tell continuing into its strike keeps its clock; a strike straight into a new tell restarts it
      r.sig = sig;
      if (r.seen === null && Math.abs(e.x - p.x) < 700) r.seen = now;
    }
    for (const b of game.projectiles) if (!info.has(b)) { const r = { sig: 'p', since: now, seen: now }; roll(r); info.set(b, r); }
  }
  // The Gate Warden: answer its tell (jump the seize and the slam wave, walk out of boxes, dash through a charge), take pools,
  // hit it in its heavy recoveries and break stun, and break the armor with the first hit of a frenzy.
  function decideWarden(game, now, w) {
    const p = game.player, W = game.worldWidth;
    const o = { dir: 0, jump: false, attack: false, dash: false, magic: false, urgent: false };
    const fw = game.mode === 'castle' && p.frenzy ? p.weapon : ''; // twin frenzy: no dash at all; spear frenzy: a dash is an assault with no i-frames, so it never dodges
    const speed = p.speed * (p.attack > 0 && fw !== 'twin' ? .65 : 1), dashReady = p.dashCd <= 0 && !p.plunge && fw !== 'twin' && fw !== 'spear', ready = p.grounded && p.attackCd <= .03 && p.dash <= 0 && !p.plunge;
    const lock = Math.min(.14, Math.max(0, p.attack - p.attackLen * .26)); // the core refuses a dash until 74% of a swing has played (it buffers 0.16 s): press early enough to fire on time
    const toward = Math.sign(w.x - p.x) || p.dir, away = -toward, held = prev.right ? 1 : prev.left ? -1 : 0;
    let danger = Infinity;
    const t = api.reacts(w, now) ? wardenHit(w, p.x, p.y) : Infinity;
    if (t < Infinity) {
      danger = t;
      const kind = w.warn.kind;
      if (greedyOn(now) && ready && t > .05 && t < .6) { o.attack = true; greedyUntil = 0; }
      else if (kind === 'seize') { // misread: takes the Toll for a sweep and steps the wrong way instead of jumping
        if (flip(w, 1) < 0) { if (p.grounded) o.dir = toward; }
        else if (p.grounded && t <= .38 + 2 * jit(w)) { o.jump = true; o.urgent = true; } // the Toll's wide jump window needs a twice-as-bad slip before a late jump is caught
      }
      else {
        let best = null; // walk out on this side of the body if there is time
        if (kind === 'descent') { // leave the ledge before the landing: walk off the nearer edge (the fall takes it out of the shockwave)
          const l = w.warn.landing, plat = game.platforms.find(pl => pl.y === l.y), edge = plat ? (p.x < plat.x + plat.w / 2 ? -1 : 1) : -Math.sign(p.x - l.x) || 1;
          if (p.grounded) { o.dir = edge; o.urgent = true; }
        }
        else if (kind !== 'charge') for (let d = 10; d <= 260 && !best; d += 10) for (const sd of kind === 'volley' || kind === 'ritual' ? [away, toward] : [away]) { // lines and circles have gaps on both sides
          const x = p.x + sd * d;
          if (x > 40 && x < W - 40 && (x - w.x) * (p.x - w.x) > 0 && Math.abs(x - w.x) > 52 && d / speed < t - .05 && wardenHit(w, x, p.y) === Infinity) { best = { dir: sd }; break; }
        }
        if (best) { o.dir = flip(w, best.dir); o.urgent = true; }
        else if (kind === 'charge' && fw !== 'heavy' && (!w.follow || !dashReady || (p.dashCd > 0 && p.dashCd > t - .1))) {
          // double jump the first charge (keeps the dash for the quick return charge), or any charge while the dash is on cooldown; the dash is the fallback
          if ((p.grounded && t <= .5 + jit(w) && t > .3) || (!p.grounded && p.jumps === 1 && p.vy > -150)) { o.jump = true; o.urgent = true; }
          else if (t <= .1 + lock + jit(w) && dashReady) { o.dash = true; o.urgent = true; o.dir = flip(w, toward); }
        }
        else if (t <= (kind === 'charge' ? .1 : .12) + lock + jit(w) && dashReady) { o.dash = true; o.urgent = true; o.dir = flip(w, toward); } // through the body: i-frames, and a perfect dodge pays blood
      }
    }
    if (api.reacts(w, now) && w.warn?.kind === 'slam' && w.tell > 0 && t === Infinity) { // the wave lines (front, and behind in phase 2) are drawn during the tell: time the jump to their arrival
      for (const v of [w.warn.wave, w.warn.wave2]) {
        if (!v) continue;
        const dir = Math.sign(v.x2 - v.x1), s = (p.x - v.x1) * dir, arrive = w.tell + s / 240;
        if (s > 0) { danger = Math.min(danger, arrive); if (arrive <= .28 + jit(w) && p.grounded) { o.jump = true; o.urgent = true; } }
      }
    }
    for (const b of game.projectiles) { // the slam's floor wave: jump it (it was announced by the tell, so no fresh reaction delay)
      if (!b.ground) continue;
      for (let s = 0; s <= .5; s += .02) if (Math.abs(b.x + b.vx * s - p.x) < 14 + b.r) { danger = Math.min(danger, s); if (s <= .3 + jit(b) && p.grounded) { o.jump = true; o.urgent = true; } break; }
    }
    const orbs = game.projectiles.filter(b => !b.ground && now - (info.get(b)?.since ?? now) >= skill.reaction); // the King's volley after release: walk into a gap, else dash
    const orbT = (b, x) => { for (let s = 0; s <= .6; s += .02) { const by = b.y + b.vy * s; if (Math.abs(b.x + b.vx * s - x) < 14 + b.r && by > p.y - 58 && by < p.y + 4) return s; } return Infinity; };
    const orbNow = Math.min(Infinity, ...orbs.map(b => orbT(b, p.x)));
    if (orbNow < Infinity) {
      danger = Math.min(danger, orbNow);
      let go = 0;
      for (let d = 10; d <= 200 && !go; d += 10) for (const sd of [away, toward]) { const x = p.x + sd * d; if (x > 40 && x < W - 40 && d / speed < orbNow - .05 && orbs.every(b => orbT(b, x) === Infinity)) { go = sd; break; } }
      if (go) { o.dir = go; o.urgent = true; } else if (orbNow <= .12 + lock + jit(orbs[0]) && dashReady) { o.dash = true; o.urgent = true; o.dir = toward; }
    }
    if (danger > .45) {
      const dx = w.x - p.x, face = Math.sign(dx) || p.dir, gap = Math.abs(dx);
      const open = w.superArmor <= 0 || (w.heavy && w.recover > 0); // blood-paying windows: break stun, heavy recovery
      if (open && !wasOpen) rollGreedy(now);
      wasOpen = open;
      const breakable = p.frenzy && w.superArmor > 0 && w.armorLock <= 0;
      const pool = game.pools.filter(q => (q.x - w.x) * (p.x - w.x) > 0 || Math.abs(q.x - w.x) > 60).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).find(q => q.y >= FLOOR - 5 && Math.abs(q.x - p.x) / speed < q.life - .1); // floor pools only: take them before the King's Tithe draws them in
      let goal = null, tol = 12;
      if ((open || breakable) && gap < 330) {
        const spacing = Math.max(50, p.reach - 22);
        if (gap > spacing) { goal = w.x; tol = spacing - 4; }
        else if (p.dir !== face) o.dir = face;
        else if (ready && p.y >= FLOOR - 5) o.attack = true;
      } else if (pool && p.grounded) { goal = pool.x; tol = 6; }
      else if (gap < WARDEN_STANDOFF - 25 || held === away && gap < WARDEN_STANDOFF - 5) { const x = p.x + away * 30; if (x > 60 && x < W - 60) o.dir = away; } // too close: back off to the standoff
      else if (gap > WARDEN_STANDOFF + 40 || held === toward && gap > WARDEN_STANDOFF + 20) { goal = w.x - Math.sign(w.x - p.x) * WARDEN_STANDOFF; tol = 20; } // hysteresis: a step that started keeps going to the edge of the band, so the standoff never flips direction every frame
      if (goal !== null && Math.abs(goal - p.x) > tol) o.dir = Math.sign(goal - p.x);
    }
    return o;
  }
  function decide(game, now) {
    const warden = game.enemies.find(e => e.armored && e.hp > 0);
    if (warden) return decideWarden(game, now, warden);
    const p = game.player, W = game.worldWidth, castle = game.mode === 'castle';
    const o = { dir: 0, jump: false, attack: false, dash: false, magic: false, urgent: false };
    const fw = castle && p.frenzy ? p.weapon : ''; // see decideWarden
    const speed = p.speed * (p.attack > 0 && fw !== 'twin' ? .65 : 1), foes = game.enemies.filter(e => e.hp > 0);
    const canCast = p.magicCd <= 0 && (castle ? p.blood >= SKILL_MIN : p.lunatic || p.mp >= p.magicCost);
    const dashReady = p.dashCd <= 0 && !p.plunge && fw !== 'twin' && fw !== 'spear', ready = p.grounded && p.attackCd <= .03 && p.dash <= 0 && !p.plunge;
    const trapHot = (tr, extra = .8) => !tr.disabled && (tr.state !== 'idle' || tr.period - tr.t < extra);
    const trapIn = (x, tr) => Math.abs(x - tr.x) < tr.w / 2 + 18;
    const safeSpot = x => game.traps.every(tr => !trapIn(x, tr) || !trapHot(tr)) && game.obstacles.every(ob => Math.abs(x - ob.x) >= (ob.w + 28) / 2 || p.y <= ob.y - ob.h);
    const rm = game.rooms?.find(r => p.x >= r.x && p.x < r.x + r.w), inRoom = castle && rm ? foes.filter(e => e.type === 'skeleton' && e.x >= rm.x && e.x < rm.x + rm.w).length : 0;
    fightN = inRoom ? Math.max(fightN, inRoom) : 0; // a group fight (3+ skeletons) stays in its room: running out of it only gets the hero flanked
    const fenced = inRoom > 0 && fightN >= 3;
    const lo = fenced ? rm.x + 45 : 25, hi = fenced ? rm.x + rm.w - 45 : W - 30;
    // --- threats at the hero's current spot, soonest first
    const threats = [];
    for (const e of foes) if (api.reacts(e, now)) { const t = hitTime(e, p.x, p.y); if (t < Infinity) threats.push({ e, t }); }
    for (const b of game.projectiles) {
      if (now - info.get(b).since < skill.reaction) continue;
      for (let s = 0; s <= .6; s += .02) {
        const bx = b.x + b.vx * s, by = b.y + b.vy * s;
        if (Math.abs(bx - p.x) < 14 + b.r && by > p.y - 58 && by < p.y + 4) { threats.push({ e: null, t: s, b }); break; }
      }
    }
    if (fw === 'heavy') for (let i = threats.length - 1; i >= 0; i--) { const th = threats[i]; if (th.e && !th.e.heavy && th.e.type !== 'boss' && p.debt + th.e.damage * 1.3 <= HEAVY_DEBT_CAP) threats.splice(i, 1); } // Numb to pain: trade through light hits while the debt stays small; heavies and big debts are still dodged
    threats.sort((a, b) => a.t - b.t);
    const canHit = e => { // would a swing from here land on e (same test as core.hitTargets)
      const dx = (e.x - p.x) * p.dir;
      return dx >= -e.w / 2 && dx <= p.reach + e.w / 2 && e.y >= p.y - 88 && e.y - e.h <= p.y - 4;
    };
    const ownBlock = e => (e.type === 'shield' && e.guardBreak <= 0 || e.type === 'spear' && e.gT > 0) && (p.x - e.x) * e.dir >= 0; // a shield bearer's shield, or a spearman's raised haft: go round to the back (or Eclipse breaks either)
    const blockedBy = e => ownBlock(e) || !!game.coverFor?.(e); // a shield in front of the hero, or one covering an ally (interpose, Phalanx)
    const blocker = e => ownBlock(e) ? e : game.coverFor(e);
    // castle attacks have hyper armor from tell start, so a light hit cancels nothing
    const flinches = e => !castle && !e.heavy && e.type !== 'knight' && e.type !== 'boss' && e.armor <= 0 && !blockedBy(e) && e.frozen <= 0;
    const dirAway = e => Math.sign(p.x - e.x) || -p.dir;
    // A dash covers 131 px: take the side whose landing spot no other announced attack covers (a dash into a second skeleton's lunge box is the dash trap).
    const dashSide = d => { const lands = x => threats.some(th => th.e && th.t > .2 && hitTime(th.e, Math.max(25, Math.min(W - 30, x)), p.y) < Infinity), out = x => fenced && (x < rm.x + 20 || x > rm.x + rm.w - 20), cost = x => (lands(x) ? 2 : 0) + (out(x) ? 1 : 0); return cost(p.x - d * 131) < cost(p.x + d * 131) ? -d : d; };
    let danger = Infinity;
    if (threats.length) {
      const { e, t } = threats[0]; danger = t;
      if (greedyOn(now) && ready && t > .05 && t < .6) { o.attack = true; greedyUntil = 0; } // a greedy extra swing instead of dodging
      else if (e && flinches(e) && canHit(e) && ready && t > .05) o.attack = true; // a landed light hit cancels the swing
      else if (t <= DASH_LEAD + jit(e || threats[0].b) && dashReady) { o.dash = true; o.urgent = true; o.dir = e ? (e.heavy ? flip(e, dashSide(dirAway(e))) : dashSide(dirAway(e))) : -Math.sign(threats[0].b.vx); } // i-frames; the dash direction is picked by the core on the same frame
      else if (t <= .25 && !dashReady && canCast && (e ? e.heavy && Math.hypot(e.x - p.x, e.y - p.y) < 205 : true)) o.magic = true; // Eclipse cancels a heavy and clears projectiles
      else { // walk out of the area if the time allows
        let best = null;
        for (let d = 10; d <= 320 && !best; d += 10) for (const s of [1, -1]) {
          const x = Math.max(25, Math.min(W - 30, p.x + s * d)); if (x < lo && s < 0 || x > hi && s > 0) continue;
          if (d / speed < t - .05 && safeSpot(x) && threats.every(th => th.e ? hitTime(th.e, x, p.y) === Infinity : Math.abs(th.b.x + th.b.vx * th.t - x) > 14 + th.b.r)) { best = { dir: s }; break; }
        }
        if (best) { o.dir = e && e.heavy ? flip(e, best.dir) : best.dir; o.urgent = true; }
        else if (e && e.type === 'skeleton' && !e.heavy && e.move !== 'stepcut' && !dashReady && p.grounded && t <= .38 + jit(e) && t >= .18) { o.jump = true; o.urgent = true; } // slash, counter or chain with no dash and no room: the 77 px hit height is cleared 0.17-0.57 s after the press
        else if (e && e.move === 'stepcut' && !dashReady && p.grounded && t <= JUMP_AT + jit(e) && t >= .19) { o.jump = true; o.urgent = true; } // castle lunge with the dash down: airborne above its 70 px box from 0.16 to 0.58 s after the press, so a jump at 0.2-0.4 s before contact clears it
        else if (e && e.move === 'plant' && p.grounded && t <= .45) { o.jump = true; o.urgent = true; o.dir = dirAway(e); } // a planted spear with no time to walk clear: jump and steer out of the box in the air (it stays live 1.2 s)
        else if (e && (e.move === 'sweep' || e.warn?.kind === 'ray' || (e.type === 'spear' && e.warn?.kind === 'thrust' && !dashReady && t >= .2)) && p.grounded && t <= .36 + jit(e)) { o.jump = true; o.urgent = true; } // the spearman's sweep (30 px) and the mage's ray (16 px line, 440 long) leave no room to walk out: jump them, airborne through the contact
      }
    }
    // --- offence and navigation when nothing is about to land
    if (danger > .45) {
      const known = foes.filter(e => api.known(e, now));
      const punish = known.filter(e => e.punishable && e.recover > 0 && Math.abs(e.x - p.x) < 330);
      const pool = punish.length ? punish : known;
      const target = pool.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      let goal = null, tol = 16;
      const swing = known.find(e => canHit(e) && !blockedBy(e) && hitTime(e, p.x, p.y) === Infinity);
      const planted = foes.some(e => e.plantT > 0 || e.move === 'plant'); // a planted spear stops an assault dash: no chain dashes while one is down
      const lane = fw === 'spear' && !planted && target && target.punishable && target.recover > 0 && p.dash <= 0 && !p.plunge && p.grounded && target && !blockedBy(target) && Math.abs(target.x - p.x) > 35 && Math.abs(target.x - p.x) < 125 && Math.abs(target.y - p.y) < 40 && p.x + Math.sign(target.x - p.x) * 131 > lo && p.x + Math.sign(target.x - p.x) * 131 < hi;
      if (lane) { o.dash = true; o.dir = Math.sign(target.x - p.x); } // chain assault dashes through the pack (each burns 6 blood)
      else if (swing && ready) { o.attack = true; if (swing.punishable && swing.recover > 0 && rolled.get(swing) !== swing.action) { rolled.set(swing, swing.action); rollGreedy(now); } }
      else if (target && Math.abs(target.x - p.x) < 620) {
        const dx = target.x - p.x, face = Math.sign(dx) || p.dir, spacing = Math.max(50, p.reach - 22);
        if (blockedBy(target) && !target.heavy) { // frontal block: Eclipse breaks the guard, otherwise walk or dash round to its back
          if (canCast && castle && p.blood >= 90 && Math.abs(dx) < 190) o.magic = true;
          else if (dashReady && Math.abs(dx) < 120 && Math.abs(dx) > 30) { o.dash = true; o.dir = face; }
          else { const b = blocker(target); goal = b.x - b.dir * 50; tol = 10; } // round to the back of the shield that blocks
        } else if (dashReady && target.punishable && target.recover > .4 && Math.abs(dx) > spacing + 40 && Math.abs(dx) < 260 && Math.abs(target.y - p.y) < 40 && target.type === 'spear') { o.dash = true; o.dir = face; // a spearman in recovery out-spaces a walk: dash the gap while it cannot thrust
        } else if (Math.abs(dx) > spacing) { goal = target.x; tol = spacing - 4; }
        else if (p.dir !== face) o.dir = face; // turn to face
      } else {
        const guard = foes.filter(e => e.required).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        const far = !game.portalOpen && !guard && pool[0]; // nothing required and the gate shut (a duel room): chase the foe that kited off instead of walking out
        goal = far ? far.x : game.portalOpen || !guard ? game.portalX : guard.x; tol = game.portalOpen ? 20 : far ? 100 : 120;
      }
      if (goal !== null && fenced) { // chasing past the room edge only gets the hero flanked: clamp the goal, but give up after a stand-off of CLIP_PATIENCE s (a skeleton that kites out of the room must still be followed)
        const clamped = Math.max(lo + EDGE_MARGIN, Math.min(hi - EDGE_MARGIN, goal));
        if (clamped === goal) clipSince = -1; else { if (clipSince < 0) clipSince = now; if (now - clipSince < CLIP_PATIENCE) goal = clamped; }
      } else clipSince = -1;
      if (goal !== null && Math.abs(goal - p.x) > tol) o.dir = Math.sign(goal - p.x);
      const perch = p.grounded && p.y < FLOOR - 5 && (p.on || game.obstacles.find(ob => p.y === ob.y - ob.h && Math.abs(p.x - ob.x) < (ob.w + p.w) / 2));
      if (perch && !o.attack) { // stranded on a platform or barricade (a jump landed there): walk off toward the goal, else the nearer edge
        const x0 = perch.w ? (perch.kind ? perch.x - perch.w / 2 : perch.x) : 0, x1 = x0 + perch.w, to = goal ?? target?.x ?? game.portalX;
        o.dir = to < x0 ? -1 : to > x1 ? 1 : p.x - x0 < x1 - p.x ? -1 : 1;
      }
    }
    // --- terrain: jump barricades and spikes, never step into an armed trap
    if (o.dir && p.grounded) {
      const d = o.dir;
      for (const ob of game.obstacles) { const gap = (ob.x - p.x) * d - (ob.w / 2 + 14); if (gap > -2 && gap < 36 && p.y > ob.y - ob.h + 1) o.jump = true; }
      for (const tr of game.traps) {
        const gap = (tr.x - p.x) * d - (tr.w / 2 + 14);
        if (gap <= 0 || gap > 44 || tr.disabled) continue;
        const cross = (tr.w + 28 + gap) / speed + .3;
        if (trapHot(tr, cross)) { if (gap >= 14) o.jump = true; else o.dir = 0; }
      }
    }
    if (o.dir && p.grounded && !o.jump) { const nx = p.x + o.dir * 16; if (!safeSpot(nx) && game.traps.some(tr => trapIn(nx, tr) && !trapIn(p.x, tr))) o.dir = 0; }
    if (o.dir && p.grounded && !o.jump) { // never walk back into a box that was just left (step out, step in, hit): hold at its edge until the attack resolves
      const inBox = x => foes.some(e => api.reacts(e, now) && hitTime(e, x, p.y) < Infinity);
      if (!inBox(p.x) && inBox(p.x + o.dir * 24)) o.dir = 0;
    }
    if (!p.grounded || fw === 'twin') o.attack = false; // an air attack would be a plunge; twin frenzy swings on its own
    return o;
  }
  return api;
}
