// Situational slow motion (#53): which answers earn a slow-motion moment, how often, and its curve. Pure and DOM-free: game.js owns the clock, the canvas and the audio.
// The random source is injected (game.js passes Math.random). It must never be game.rand(): slow motion is presentation and must not touch the seeded stream.
// Numbers are playtest starting points.

export const SPEC = {
  refill: 12, refillCrisis: 7,      // seconds for the budget b to go 0 -> 1
  cooldown: 2.5, cooldownCrisis: 1.5, // no full slow motion this soon after the last one ended
  cap: .95,                           // the chance ceiling (only boss moments are certain)
  protect: .15,                       // threatIn() below this: accent only, the budget is not spent
  normal: { drop: .25, hold: .12, ease: .45 }, boss: { drop: .2, hold: .2, ease: .55 }, // time scale, hold and ease-back seconds (real time)
  maxLen: .8,                         // hard cap, real seconds
  fastExit: .08,                      // real seconds to get back to 1.0x when a threat appears
};

// Base weights per trigger row. 'boss' rows are always full. tint: the vignette colour family.
export const ROWS = {
  breakCancel: { weight: .6, tint: 'red' }, break: { weight: .35, tint: 'red' },
  interruptHeavy: { weight: .6, tint: 'silver' }, interruptLight: { weight: .2, tint: 'silver' },
  dodgeHeavy: { weight: .5, tint: 'silver' }, dodgeLight: { weight: .1, tint: 'silver' },
  guardBreak: { weight: .3, tint: 'silver' },
  bossBreak: { weight: 1, tint: 'red', boss: true }, bossPhase: { weight: 1, tint: 'red', boss: true },
};

// Maps a core event to its row, or null when it is not a trigger. Blocked hits, ripostes, kills, hits taken and parries (the knight's, the spear haft guard) are never triggers.
export function rowOf(e) {
  switch (e.type) {
    case 'stagger': return e.boss ? 'bossBreak' : e.cancelled ? 'breakCancel' : 'break';
    case 'armorBreak': return 'bossBreak';                       // the Warden's and the King's gauge break
    case 'bossPhase': case 'wardenPhase': case 'kingPhase': return 'bossPhase';
    case 'interrupt': return e.heavy ? 'interruptHeavy' : 'interruptLight';
    case 'perfectDash': return e.heavy ? 'dodgeHeavy' : 'dodgeLight';
    case 'guardBreak': return 'guardBreak';
    default: return null;
  }
}

// ctx is read from visible game state by game.js: { castle, blood, hp, maxHp, last, others, frenzyAgo, boss }.
export function crisisOf(ctx = {}) {
  let m = 1, crisis = false;
  const low = ctx.castle ? ctx.blood <= 40 : ctx.maxHp > 0 && ctx.hp <= ctx.maxHp * .3, mid = ctx.castle && ctx.blood <= 100;
  if (low) { m *= 2; crisis = true; } else if (mid) { m *= 1.5; crisis = true; }
  if (ctx.last) { m *= 1.5; crisis = true; }
  if (ctx.others >= 3) { m *= 1.4; crisis = true; }
  if (ctx.frenzyAgo <= 2) { m *= 1.3; crisis = true; }
  if (ctx.boss) { m *= 1.3; crisis = true; }
  return { mult: m, crisis };
}

export function createSpectacle() { return { b: 1, t: 0, endsAt: -Infinity, lastRow: '', seen: new Set() }; }
export function resetFloor(state, now = 0) { state.b = 1; state.t = now; state.seen.clear(); state.lastRow = ''; state.endsAt = -Infinity; }

// Integral of the time scale over the ease-back (progress u in 0..1, ease-out cubic): drop + (1 - drop) * 0.75.
const easeGame = (drop) => drop + (1 - drop) * .75;
// The curve of a full slow motion for a protected situation. `threat` is game.threatIn(): when it is shorter than the curve's game time the hold is dropped and the ease compressed to end by then.
export function curve(boss, threat = Infinity) {
  const base = boss ? SPEC.boss : SPEC.normal;
  let { drop, hold, ease } = base;
  const game = hold * drop + ease * easeGame(drop);
  if (threat < game) { hold = 0; ease = Math.max(.12, threat / easeGame(drop)); }
  const len = Math.min(SPEC.maxLen, hold + ease);
  if (hold + ease > len) ease = len - hold;
  return { drop, hold, ease, len };
}
// Time scale at real time t into a curve (1 after the end).
export function scaleAt(c, t) {
  if (t >= c.len) return 1;
  if (t < c.hold) return c.drop;
  const u = Math.min(1, (t - c.hold) / c.ease), q = 1 - (1 - u) ** 3;
  return c.drop + (1 - c.drop) * q;
}
// k: 1 at the drop, 0 at 1.0x. The zoom, tint and audio follow it.
export const kAt = (c, t) => t >= c.len ? 0 : (1 - scaleAt(c, t)) / (1 - c.drop);

// decide(state, event, now, random) -> { kind: 'full' | 'accent', row, tint, boss, curve?, reason }
// event: a core event plus { ctx, threat } (threat = game.threatIn()). `now` is real seconds. Mutates state (budget, cooldown, novelty) only on a full slow motion.
export function decide(state, event, now, random) {
  const row = rowOf(event);
  if (!row) return null;
  const def = ROWS[row], { mult, crisis } = crisisOf(event.ctx);
  state.b = Math.min(1, state.b + Math.max(0, now - state.t) / (crisis ? SPEC.refillCrisis : SPEC.refill)); state.t = now;
  const accent = reason => ({ kind: 'accent', row, tint: def.tint, boss: !!def.boss, reason });
  if ((event.threat ?? Infinity) < SPEC.protect) return accent('threat');
  const full = () => {
    const c = curve(!!def.boss, event.threat ?? Infinity);
    state.b = 0; state.endsAt = now + c.len; state.lastRow = row; state.seen.add(row);
    return { kind: 'full', row, tint: def.tint, boss: !!def.boss, curve: c };
  };
  if (def.boss) return full();                                    // boss moments ignore the budget and the cooldown
  if (now < state.endsAt + (crisis ? SPEC.cooldownCrisis : SPEC.cooldown)) return accent('cooldown');
  let novelty = 1;
  if (row === state.lastRow) novelty = .5; else if (!state.seen.has(row)) novelty = 1.5;
  const p = Math.min(SPEC.cap, def.weight * mult * novelty) * state.b * state.b;
  if (random() < p) return full();
  state.seen.add(row);                                            // the row has been shown (as an accent): its first-of-floor bonus is spent
  return accent('roll');
}
