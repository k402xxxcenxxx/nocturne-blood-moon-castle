// Test bot (#52): plays the hero from the full game state, but through the same input object a human produces
// ({ left, right, jump, attack, dash, magic }) and under human limits. Pure logic: no DOM, Canvas, Audio or storage, so it runs in Node.
// It reads only the current state (never future game.rand() rolls). Used by tools/bot-run.mjs, tests/bot.test.js and game.js (?test, key B).
import { FLOOR, WEAPONS, SKILL_MIN } from './core.js';

export const REACTION_DELAY = .18; // s before the bot reacts to a new tell, strike, projectile or enemy
export const MAX_PRESSES_PER_SECOND = 8; // rising edges of any button, in any sliding second
export const MIN_HOLD = 1 / 30; // s a direction stays held before it may change (non-urgent)
const DASH_LEAD = .12; // dash when a hit is this close: the 0.23 s of i-frames cover it with +-0.1 s of slack (no frame-perfect timing)
const ATTACK_RESERVE = 2; // attack presses stop this far under the cap so a dodge never waits for the budget
const WEAPON_PICK = 'spear';
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
    return e.tell > 0 && w.box && rectHit(px, py, w.box) ? e.tell : Infinity;
  }
  if (!(e.tell > 0) || e.heavy) return Infinity;
  const dx = Math.abs(px - e.x), dy = Math.abs(py - e.y);
  if (e.type === 'boss') return w && (w.box && rectHit(px, py, w.box) || w.circles?.some(c => Math.abs(px - c.x) < c.r + 14 && py > e.y - c.r)) ? e.tell : Infinity;
  if (e.type === 'bat') return dx < 55 && dy < 58 ? e.tell : Infinity;
  if (e.type === 'spear') return e.thrustBox && rectHit(px, py, e.thrustBox) ? e.tell : Infinity;
  if (e.type === 'shield') return dx < 70 && (px - e.x) * e.dir >= 0 && dy < 77 ? e.tell : Infinity;
  if (e.type === 'skeleton' || e.type === 'knight') return dx < 82 && dy < 77 ? e.tell : Infinity;
  return Infinity; // mages and priests act through projectiles
}

export function createBot() {
  const info = new Map(); // enemy or projectile -> { sig, since, seen }: when the bot first perceived it / its current attack
  const presses = []; // timestamps of recent rising edges
  let prev = {}, last = {}, dirSince = -1;
  const api = {
    presses,
    // Has the bot had REACTION_DELAY to notice enemy e's current attack?
    reacts(e, now) { const r = info.get(e); return !!(r && r.sig && now - r.since >= REACTION_DELAY); },
    known(e, now) { const r = info.get(e); return !!(r && r.seen !== null && now - r.seen >= REACTION_DELAY); },
    input(game) {
      if (game.state !== 'playing' || game.freeze > 0 || game.eliteBeat > 0) return last; // the core ignores this frame; a pending impulse waits
      const now = game.time;
      track(game, now);
      const want = decide(game, now);
      while (presses.length && presses[0] < now - 1) presses.shift();
      const out = {};
      const allow = (kind, key) => { // rising edges cost budget; attacks leave a reserve for dodges
        if (prev[key]) return true;
        const cap = MAX_PRESSES_PER_SECOND - (kind === 'attack' ? ATTACK_RESERVE : 0);
        if (presses.length >= cap) return false;
        presses.push(now); return true;
      };
      for (const key of ['jump', 'dash', 'magic', 'attack']) if (want[key] && !prev[key] && allow(key, key)) out[key] = true;
      let dir = want.dir;
      const held = prev.right ? 1 : prev.left ? -1 : 0;
      if (dir !== held && !want.urgent && now - dirSince < MIN_HOLD) dir = held;
      if (dir && dir !== held && !allow('dir', dir > 0 ? 'right' : 'left')) dir = held;
      if (dir !== held) dirSince = now;
      if (dir) out[dir > 0 ? 'right' : 'left'] = true;
      prev = out; last = out;
      return out;
    },
  };
  function track(game, now) {
    const p = game.player;
    for (const e of game.enemies) {
      let r = info.get(e); if (!r) info.set(e, r = { sig: '', since: 0, seen: null });
      const sig = e.hp > 0 ? (e.tell > 0 ? 't' : e.strikeT > 0 ? 's' : '') : '';
      if (sig && !r.sig) r.since = now;
      r.sig = sig;
      if (r.seen === null && Math.abs(e.x - p.x) < 700) r.seen = now;
    }
    for (const b of game.projectiles) if (!info.has(b)) info.set(b, { sig: 'p', since: now, seen: now });
  }
  function decide(game, now) {
    const p = game.player, W = game.worldWidth, castle = game.mode === 'castle';
    const o = { dir: 0, jump: false, attack: false, dash: false, magic: false, urgent: false };
    const speed = p.speed * (p.attack > 0 ? .65 : 1), foes = game.enemies.filter(e => e.hp > 0);
    const canCast = p.magicCd <= 0 && (castle ? p.blood >= SKILL_MIN : p.lunatic || p.mp >= p.magicCost);
    const dashReady = p.dashCd <= 0 && !p.plunge, ready = p.grounded && p.attackCd <= .03 && p.dash <= 0 && !p.plunge;
    const trapHot = (tr, extra = .8) => !tr.disabled && (tr.state !== 'idle' || tr.period - tr.t < extra);
    const trapIn = (x, tr) => Math.abs(x - tr.x) < tr.w / 2 + 18;
    const safeSpot = x => game.traps.every(tr => !trapIn(x, tr) || !trapHot(tr)) && game.obstacles.every(ob => Math.abs(x - ob.x) >= (ob.w + 28) / 2 || p.y <= ob.y - ob.h);
    // --- threats at the hero's current spot, soonest first
    const threats = [];
    for (const e of foes) if (api.reacts(e, now)) { const t = hitTime(e, p.x, p.y); if (t < Infinity) threats.push({ e, t }); }
    for (const b of game.projectiles) {
      if (now - info.get(b).since < REACTION_DELAY) continue;
      for (let s = 0; s <= .6; s += .02) {
        const bx = b.x + b.vx * s, by = b.y + b.vy * s;
        if (Math.abs(bx - p.x) < 14 + b.r && by > p.y - 58 && by < p.y + 4) { threats.push({ e: null, t: s, b }); break; }
      }
    }
    threats.sort((a, b) => a.t - b.t);
    const canHit = e => { // would a swing from here land on e (same test as core.hitTargets)
      const dx = (e.x - p.x) * p.dir;
      return dx >= -e.w / 2 && dx <= p.reach + e.w / 2 && e.y >= p.y - 88 && e.y - e.h <= p.y - 4;
    };
    const blockedBy = e => e.type === 'shield' && e.guardBreak <= 0 && (p.x - e.x) * e.dir >= 0;
    const flinches = e => !e.heavy && e.type !== 'knight' && e.type !== 'boss' && e.armor <= 0 && !blockedBy(e) && e.frozen <= 0;
    const dirAway = e => Math.sign(p.x - e.x) || -p.dir;
    let danger = Infinity;
    if (threats.length) {
      const { e, t } = threats[0]; danger = t;
      if (e && flinches(e) && canHit(e) && ready && t > .05) o.attack = true; // a landed light hit cancels the swing
      else if (t <= DASH_LEAD && dashReady) { o.dash = true; o.urgent = true; o.dir = e ? dirAway(e) : -Math.sign(threats[0].b.vx); } // i-frames; the dash direction is picked by the core on the same frame
      else if (t <= .25 && !dashReady && canCast && (e ? e.heavy && Math.hypot(e.x - p.x, e.y - p.y) < 205 : true)) o.magic = true; // Eclipse cancels a heavy and clears projectiles
      else { // walk out of the area if the time allows
        let best = null;
        for (let d = 10; d <= 320 && !best; d += 10) for (const s of [1, -1]) {
          const x = Math.max(25, Math.min(W - 30, p.x + s * d));
          if (d / speed < t - .05 && safeSpot(x) && threats.every(th => th.e ? hitTime(th.e, x, p.y) === Infinity : Math.abs(th.b.x + th.b.vx * th.t - x) > 14 + th.b.r)) { best = { dir: s }; break; }
        }
        if (best) { o.dir = best.dir; o.urgent = true; }
      }
    }
    // --- offence and navigation when nothing is about to land
    if (danger > .45) {
      const known = foes.filter(e => api.known(e, now));
      const punish = known.filter(e => e.heavy && e.punishable && e.recover > 0 && Math.abs(e.x - p.x) < 330);
      const pool = punish.length ? punish : known;
      const target = pool.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      let goal = null, tol = 16;
      const swing = known.find(e => canHit(e) && !blockedBy(e) && hitTime(e, p.x, p.y) === Infinity);
      if (swing && ready) o.attack = true;
      else if (target && Math.abs(target.x - p.x) < 620) {
        const dx = target.x - p.x, face = Math.sign(dx) || p.dir, spacing = Math.max(50, p.reach - 22);
        if (blockedBy(target) && !target.heavy) { // frontal block: Eclipse breaks the guard, otherwise walk or dash round to its back
          if (canCast && castle && p.blood >= 90 && Math.abs(dx) < 190) o.magic = true;
          else if (dashReady && Math.abs(dx) < 120 && Math.abs(dx) > 30) { o.dash = true; o.dir = face; }
          else { goal = target.x - target.dir * 50; tol = 10; }
        } else if (Math.abs(dx) > spacing) { goal = target.x; tol = spacing - 4; }
        else if (p.dir !== face) o.dir = face; // turn to face
      } else {
        const guard = foes.filter(e => e.required).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        goal = game.portalOpen || !guard ? game.portalX : guard.x; tol = game.portalOpen ? 20 : 120;
      }
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
    if (!p.grounded) o.attack = false; // an air attack would be a plunge
    return o;
  }
  return api;
}
