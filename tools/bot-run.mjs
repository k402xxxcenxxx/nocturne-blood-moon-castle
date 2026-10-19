// Headless bot runner (#52): plays castle runs from the Vigil for N seeds and reports per-floor results.
// Usage: node tools/bot-run.mjs [--seeds 20] [--floors 1-3] [--cap 240] [--first 1] [--weapon spear]
import { Game, WEAPONS } from '../core.js';
import { createBot, resolveModal } from '../bot.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const seeds = +arg('seeds', 20), first = +arg('first', 1), cap = +arg('cap', 240), weapon = arg('weapon', '');
const [lo, hi] = arg('floors', '1-3').split('-').map(Number);
const rows = new Map(); // floor -> accumulated stats
const row = f => { if (!rows.has(f)) rows.set(f, { runs: 0, clears: 0, deaths: {}, timeouts: 0, clearTime: 0, gained: 0, taken: 0, frenzies: 0, swings: 0, whiffs: 0 }); return rows.get(f); };
const DT = 1 / 60;

export function playRun(seed, { maxFloor = hi, cap: capSeconds = cap, onStep } = {}) {
  let cur = null, cause = 'light', pending = null, deathCause = '';
  const floors = [];
  const begin = floor => { cur = { floor, t0: 0, cleared: false, died: '', timeout: false, gained: 0, taken: 0, frenzies: 0, swings: 0, whiffs: 0, clearTime: 0 }; floors.push(cur); };
  const clear = () => { if (!cur.cleared) { cur.cleared = true; cur.clearTime = game.elapsed - cur.t0; } };
  const game = new Game(e => {
    if (e.type === 'stage' && e.mode === 'castle') { if (cur && e.floor === cur.floor + 1) clear(); begin(e.floor); cur.t0 = game.elapsed; }
    else if (e.type === 'upgrade' && e.reason === 'stage' && cur) clear();
    else if (e.type === 'sliceEnd' && cur) clear();
    else if (e.type === 'hurt' && cur) cur.taken += e.amount;
    else if (e.type === 'frenzy' && cur) cur.frenzies++;
    else if (e.type === 'swing' && cur && e.move !== 'plunge') { if (pending && !pending.hit) cur.whiffs++; cur.swings++; pending = { t: game.time, hit: false }; }
    else if ((e.type === 'hit' || e.type === 'block' || e.type === 'obstacleHit') && pending) pending.hit = true;
    else if (e.type === 'death') deathCause = cause;
  }, seed, 'castle');
  const realHurt = game.hurt.bind(game);
  game.hurt = (amount, dir, hazard = false, heavy = false) => { // remember what hit the hero, for the death cause
    cause = hazard ? 'trap' : heavy ? `heavy:${[...game.enemies].filter(e => e.heavyKind).sort((a, b) => Math.abs(a.x - game.player.x) - Math.abs(b.x - game.player.x))[0]?.heavyKind ?? '?'}` : 'light';
    realHurt(amount, dir, hazard, heavy);
  };
  const bot = createBot();
  game.start();
  if (weapon in WEAPONS) { game.setWeapon(weapon); game.descend(); }
  let blood = game.player.blood;
  while (game.state !== 'dead' && game.state !== 'sliceEnd' && game.state !== 'won') {
    if (game.state === 'rest' || game.state === 'upgrade') { if (!resolveModal(game)) break; blood = game.player.blood; continue; }
    if (game.state !== 'playing') break;
    if (cur && game.floor > maxFloor) break;
    if (cur && game.elapsed - cur.t0 > capSeconds) { cur.timeout = true; break; }
    game.update(DT, bot.input(game));
    if (cur) { if (pending && !pending.hit && game.time - pending.t > .3) { cur.whiffs++; pending = null; } cur.gained += Math.max(0, game.player.blood - blood); }
    blood = game.player.blood;
    onStep?.(game, bot);
  }
  if (game.state === 'dead' && cur) cur.died = deathCause;
  return { game, floors, bot };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (let s = 0; s < seeds; s++) {
    const { floors } = playRun(first + s);
    for (const f of floors) {
      if (f.floor < lo || f.floor > hi) continue;
      const r = row(f.floor);
      r.runs++; r.gained += f.gained; r.taken += f.taken; r.frenzies += f.frenzies; r.swings += f.swings; r.whiffs += f.whiffs;
      if (f.cleared) { r.clears++; r.clearTime += f.clearTime; } else if (f.died) r.deaths[f.died] = (r.deaths[f.died] || 0) + 1; else if (f.timeout) r.timeouts++;
    }
  }
  console.log(`weapon=${weapon || 'bot pick'} seeds=${first}..${first + seeds - 1} cap=${cap}s`);
  console.log('floor | runs | clear% | deaths (cause:n) | timeouts | clear s | blood +gain/-taken | frenzies | whiffs/swings');
  for (const [f, r] of [...rows].sort((a, b) => a[0] - b[0])) {
    const deaths = Object.entries(r.deaths).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
    const n = Math.max(1, r.runs);
    console.log(`${String(f).padStart(5)} | ${String(r.runs).padStart(4)} | ${(100 * r.clears / n).toFixed(0).padStart(5)}% | ${deaths} | ${r.timeouts} | ${r.clears ? (r.clearTime / r.clears).toFixed(1) : '-'} | +${(r.gained / n).toFixed(0)} / -${(r.taken / n).toFixed(0)} | ${r.frenzies} | ${r.whiffs}/${r.swings}`);
  }
}
