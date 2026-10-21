// Headless bot runner (#52): plays castle runs from the Vigil for N seeds and reports per-floor results.
// Usage: node tools/bot-run.mjs [--seeds 20] [--floors 1-3] [--cap 240] [--first 1] [--weapon spear] [--skill expert|average] [--run]
// --duel N [--blood 100] [--relics dash,reach] [--tier 0] [--weapon w] [--cap 60]: apex arms-race harness. The bot fights N castle skeletons in an empty floor-1 room (no traps, obstacles or chests);
// a win is every skeleton dead. Reports win %, time, hero deaths by move, per-fight stats and the fairness audit ("unanswerable" = a hit landing less than REACTION_DELAY + 0.12 s after its tell started).
// --run: one life per seed from the first Vigil through floors 1-10; a clear is the Gate Warden's defeat. Reports clear rate, death floors and causes.
import { Game, WEAPONS, RELICS } from '../core.js';
import { createBot, resolveModal, chooseWeapon, REACTION_DELAY } from '../bot.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const seeds = +arg('seeds', 20), first = +arg('first', 1), cap = +arg('cap', 240), weapon = arg('weapon', ''), skill = arg('skill', 'expert'), runMode = process.argv.includes('--run');
const [lo, hi = lo] = arg('floors', '1-3').split('-').map(Number), start = +arg('start', lo >= 10 ? lo : 1); // floors 10+ start straight on that floor (no relics, 100 blood)
const rows = new Map(); // floor -> accumulated stats
const row = f => { if (!rows.has(f)) rows.set(f, { runs: 0, clears: 0, deaths: {}, timeouts: 0, clearTime: 0, gained: 0, taken: 0, frenzies: 0, swings: 0, whiffs: 0, fights: 0, fg: 0, ft: 0, fs: 0, fb: 0, ff: 0 }); return rows.get(f); };
const DT = 1 / 60;
const duelN = +arg('duel', 0);

export function playDuel(seed, { n = 1, weapon: w = 'heavy', blood = 100, relics = [], tier = 0, cap: capSeconds = 60, skill: botSkill = 'expert' } = {}) {
  const r = { win: false, dead: false, timeout: false, time: 0, move: '', kills: 0, whiffs: 0, swings: 0, dashes: 0, eclipses: 0, breaks: 0, gained: 0, lost: 0, hits: 0, unanswerable: 0 };
  let ctx = null, pending = null;
  const game = new Game(e => {
    if (e.type === 'hurt') { r.lost += e.amount; if (ctx) { r.hits++; r.move = ctx.move; if (ctx.age < REACTION_DELAY + .12) r.unanswerable++; } else r.move = 'burn'; ctx = null; } // no ctx: blood paid by the Spear assault dash, not an enemy hit
    else if (e.type === 'kill') r.kills++;
    else if (e.type === 'dash') r.dashes++;
    else if (e.type === 'magic') r.eclipses++;
    else if (e.type === 'stagger' && !e.boss) r.breaks++;
    else if (e.type === 'swing' && e.move !== 'plunge') { if (pending && pending.set.size === 0) r.whiffs++; r.swings++; pending = { t: game.time, set: game.hitSet }; }
  }, seed, 'castle');
  const start = new WeakMap(); // enemy -> game.time its current attack began, with the bot's own signature rules
  const sigOf = e => e.hp > 0 ? (e.tell > 0 ? 't' + (e.move || '') + (e.follows || 0) : e.strikeT > 0 || e.travel > 0 ? 's' : '') : '';
  const realHurt = game.hurt.bind(game);
  game.hurt = (amount, dir, hazard = false, heavy = false) => {
    const near = [...game.enemies].filter(e => e.hp > 0).sort((a, b) => Math.abs(a.x - game.player.x) - Math.abs(b.x - game.player.x))[0];
    ctx = { move: hazard ? 'trap' : heavy ? `heavy:${near?.heavyKind ?? '?'}` : near?.move || 'light', age: near && start.has(near) ? game.time - start.get(near).t : -1 };
    realHurt(amount, dir, hazard, heavy);
  };
  game.start(); game.setWeapon(w); game.descend();
  for (const id of relics) { RELICS.find(x => x.id === id).apply(game.player); game.relics.push(id); }
  game.enemies = []; game.traps = []; game.obstacles = []; game.chests = []; game.pickups = [];
  const p = game.player; p.blood = blood; p.x = 700; p.invulnerable = .8; game.setWeapon(w); // setWeapon rebuilds stats on top of the relics
  for (const dx of [300, 420, -250].slice(0, n)) game.spawnEnemy('skeleton', p.x + dx, tier);
  const bot = createBot({ skill: botSkill, seed });
  let last = p.blood, t0 = game.elapsed;
  while (game.state === 'playing') {
    if (game.elapsed - t0 > capSeconds) { r.timeout = true; break; }
    if (r.kills >= n) { r.win = true; break; }
    game.update(DT, bot.input(game));
    for (const e of game.enemies) { const sig = sigOf(e), s = start.get(e) || { sig: '', t: -1 }; if (sig && sig !== s.sig && !(s.sig[0] === 't' && sig === 's')) s.t = game.time; s.sig = sig; start.set(e, s); }
    if (pending && game.time - pending.t > .3) { if (pending.set.size === 0) r.whiffs++; pending = null; }
    r.gained += Math.max(0, p.blood - last); last = p.blood;
  }
  if (game.state === 'dead') r.dead = true;
  if (r.kills >= n) r.win = true;
  r.time = game.elapsed - t0;
  return r;
}

export function playRun(seed, { maxFloor = hi, cap: capSeconds = cap, onStep, startFloor = start, skill: botSkill = skill } = {}) {
  let cur = null, cause = 'light', pending = null, deathCause = '';
  const floors = [];
  const begin = floor => { cur = { floor, t0: 0, cleared: false, died: '', timeout: false, gained: 0, taken: 0, frenzies: 0, swings: 0, whiffs: 0, clearTime: 0, fight: null }; floors.push(cur); };
  const clear = () => { if (!cur.cleared) { cur.cleared = true; cur.clearTime = game.elapsed - cur.t0; } };
  const game = new Game(e => {
    if (e.type === 'stage' && e.mode === 'castle') { if (cur && e.floor === cur.floor + 1) clear(); begin(e.floor); cur.t0 = game.elapsed; }
    else if (e.type === 'upgrade' && e.reason === 'stage' && cur) clear();
    else if (e.type === 'sliceEnd' && cur) clear();
    else if (e.type === 'fightStats' && cur) { cur.fight = e; if (e.won) clear(); }
    else if (e.type === 'hurt' && cur) cur.taken += e.amount;
    else if (e.type === 'frenzy' && cur) cur.frenzies++;
    else if (e.type === 'swing' && cur && e.move !== 'plunge') { if (pending && pending.set.size === 0) cur.whiffs++; cur.swings++; pending = { t: game.time, set: game.hitSet }; }
    else if (e.type === 'death') deathCause = e.cause === 'toll' || e.cause === 'debt' ? e.cause : cause;
  }, seed, 'castle');
  const realHurt = game.hurt.bind(game);
  game.hurt = (amount, dir, hazard = false, heavy = false) => { // remember what hit the hero, for the death cause
    cause = hazard ? 'trap' : heavy ? `heavy:${[...game.enemies].filter(e => e.heavyKind).sort((a, b) => Math.abs(a.x - game.player.x) - Math.abs(b.x - game.player.x))[0]?.heavyKind ?? '?'}` : 'light';
    realHurt(amount, dir, hazard, heavy);
  };
  const bot = createBot({ skill: botSkill, seed });
  game.start();
  if (weapon in WEAPONS) { game.setWeapon(weapon); game.descend(); }
  else if (startFloor > 1) { game.setWeapon(chooseWeapon(game)); game.descend(); }
  if (startFloor > 1) game.loadFloor(startFloor);
  let blood = game.player.blood;
  while (game.state !== 'dead' && game.state !== 'sliceEnd' && game.state !== 'won') {
    if (game.state === 'rest' && game.vigil === 2) { clear(); break; } // the Warden is down: the second Vigil ends the measured run
    if (game.state === 'rest' || game.state === 'upgrade') { if (!resolveModal(game)) break; blood = game.player.blood; continue; }
    if (game.state !== 'playing') break;
    if (cur && game.floor > maxFloor) break;
    if (cur && game.elapsed - cur.t0 > capSeconds) { cur.timeout = true; break; }
    game.update(DT, bot.input(game));
    if (cur) { if (pending && game.time - pending.t > .3) { if (pending.set.size === 0) cur.whiffs++; pending = null; } cur.gained += Math.max(0, game.player.blood - blood); }
    blood = game.player.blood;
    onStep?.(game, bot);
  }
  if (game.state === 'dead' && cur) cur.died = deathCause;
  return { game, floors, bot };
}

if (import.meta.url === `file://${process.argv[1]}` && duelN) {
  const opt = { n: duelN, blood: +arg('blood', 100), relics: arg('relics', '').split(',').filter(Boolean), tier: +arg('tier', 0), cap: +arg('cap', 60), skill };
  for (const w of weapon in WEAPONS ? [weapon] : Object.keys(WEAPONS)) {
    const t0 = Date.now(), res = [], deaths = {}; let wins = 0, dead = 0, timeouts = 0, winT = 0, firstWin = '-';
    const sum = k => res.reduce((a, r) => a + r[k], 0), avg = k => (sum(k) / seeds).toFixed(1);
    for (let s = 0; s < seeds; s++) {
      const r = playDuel(first + s, { ...opt, weapon: w }); res.push(r);
      if (r.win) { wins++; winT += r.time; if (firstWin === '-') firstWin = first + s; } else if (r.dead) { dead++; deaths[r.move] = (deaths[r.move] || 0) + 1; } else timeouts++;
    }
    console.log(`duel ${duelN} weapon=${w} skill=${skill} blood=${opt.blood} relics=${opt.relics.join('+') || '-'} tier=${opt.tier} seeds=${first}..${first + seeds - 1}: win ${wins}/${seeds} (${(100 * wins / seeds).toFixed(1)}%), deaths ${dead}, timeouts ${timeouts}, mean win time ${wins ? (winT / wins).toFixed(1) : '-'}s, first winning seed ${firstWin}, wall ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  hero deaths by move: ${Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ') || '-'}`);
    console.log(`  per fight: skeleton deaths ${avg('kills')} | whiffs ${avg('whiffs')}/${avg('swings')} swings | dashes ${avg('dashes')} | eclipses ${avg('eclipses')} | breaks ${avg('breaks')} | blood +${avg('gained')} / -${avg('lost')} | hits taken ${avg('hits')}`);
    console.log(`  fairness audit: unanswerable hits ${sum('unanswerable')} of ${sum('hits')}`);
  }
} else if (import.meta.url === `file://${process.argv[1]}` && runMode) {
  const t0 = Date.now(), floorsDied = {}, causes = {}, times = [];
  let clears = 0, timeouts = 0;
  for (let s = 0; s < seeds; s++) {
    const { floors, game } = playRun(first + s, { startFloor: 1, maxFloor: 10 });
    const last = floors.at(-1);
    if (last.floor === 10 && last.cleared) { clears++; times.push(game.elapsed); }
    else if (last.timeout) timeouts++;
    else { floorsDied[last.floor] = (floorsDied[last.floor] || 0) + 1; causes[last.died || '?'] = (causes[last.died || '?'] || 0) + 1; }
  }
  const fmt = o => Object.entries(o).sort((a, b) => +a[0] - +b[0] || b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(`run weapon=${weapon || 'bot pick'} skill=${skill} seeds=${first}..${first + seeds - 1}: clear ${clears}/${seeds} (${(100 * clears / seeds).toFixed(0)}%), timeouts ${timeouts}, mean clear time ${times.length ? (times.reduce((a, b) => a + b) / times.length).toFixed(0) : '-'}s, wall ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  deaths by floor: ${fmt(floorsDied)}`);
  console.log(`  deaths by cause: ${fmt(causes)}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  for (let s = 0; s < seeds; s++) {
    const { floors } = playRun(first + s);
    for (const f of floors) {
      if (f.floor < lo || f.floor > hi) continue;
      const r = row(f.floor);
      r.runs++; r.gained += f.gained; r.taken += f.taken; r.frenzies += f.frenzies; r.swings += f.swings; r.whiffs += f.whiffs;
      if (f.fight) { r.fights++; r.fg += f.fight.gained; r.ft += f.fight.taken; r.fs += f.fight.time; r.fb += f.fight.breaks; r.ff += f.fight.frenzies; }
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
  for (const [f, r] of rows) if (r.fights) console.log(`floor ${f} fightStats (avg of ${r.fights}): gained ${(r.fg / r.fights).toFixed(0)} | taken ${(r.ft / r.fights).toFixed(0)} | ratio ${(r.fg / Math.max(1, r.ft)).toFixed(2)} | time ${(r.fs / r.fights).toFixed(1)}s | breaks ${(r.fb / r.fights).toFixed(1)} | frenzies ${(r.ff / r.fights).toFixed(1)}`);
}
