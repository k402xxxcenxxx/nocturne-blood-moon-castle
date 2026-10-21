import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLOOR, RELICS, WEAPONS } from '../core.js';
import { createBot, chooseWeapon, chooseRelic, resolveModal, REACTION_DELAY, MAX_PRESSES_PER_SECOND, SKILLS } from '../bot.js';

const DT = 1 / 60;
const castle = (seed = 1, apex = false) => { const game = new Game(() => {}, seed, 'castle'); game.apex = apex; game.start(); resolveModal(game); return game; }; // Vigil weapon pick, then floor 1 (apex skeletons off: these tests cover the bot's limits, not the arms race)

test('modal decisions go through the core methods the UI uses', () => {
  const game = new Game(() => {}, 3, 'castle');
  game.start();
  assert.equal(game.state, 'rest');
  assert.ok(chooseWeapon(game) in WEAPONS);
  assert.equal(resolveModal(game), true);
  assert.equal(game.state, 'playing');
  game.rollChoices('stage', RELICS.map(r => r.id));
  const offers = [RELICS.find(r => r.cursed), RELICS.find(r => r.id === 'edge'), RELICS.find(r => r.id === 'wave')];
  assert.equal(chooseRelic(game, offers).cursed, undefined, 'a cursed relic is never preferred over a plain one');
  game.choices = offers; game.state = 'upgrade';
  assert.equal(resolveModal(game), true);
  assert.ok(game.relics.length === 1);
});

test('the bot waits out its reaction delay before dodging a new tell', () => {
  const game = castle();
  const p = game.player;
  game.enemies = []; game.traps = []; game.obstacles = []; game.platforms = [];
  game.spawnEnemy('knight', p.x + 50, 0); // a knight keeps its tell when hit, so dodging is the only answer
  const e = game.enemies[0];
  Object.assign(e, { hp: 500, maxHp: 500, tell: .3, dir: -1, cd: 5 });
  p.invulnerable = 0;
  const bot = createBot();
  let dashAt = null, t = 0;
  while (t < .3 && dashAt === null) {
    const input = bot.input(game);
    if (input.dash) dashAt = t;
    game.update(DT, input); t += DT;
  }
  assert.ok(dashAt !== null, 'it dodges in the end');
  assert.ok(dashAt >= REACTION_DELAY - DT, `dashed at ${dashAt}, before the ${REACTION_DELAY} s reaction delay`);
  assert.equal(game.player.blood > 0, true);
});

test('the bot clears castle floor 1 on a fixed seed within a time cap, never exceeding the press rate', () => {
  const game = castle(7), bot = createBot();
  const edges = []; let prev = {};
  while (game.state === 'playing' && game.floor === 1 && game.elapsed < 120) {
    const input = bot.input(game);
    for (const key of ['left', 'right', 'jump', 'attack', 'dash', 'magic']) if (input[key] && !prev[key]) edges.push(game.time);
    prev = input;
    game.update(DT, input);
  }
  assert.ok(game.floor === 2 || game.state === 'upgrade', `floor 1 not cleared (state ${game.state}, ${game.elapsed.toFixed(0)} s)`);
  for (let i = 0; i < edges.length; i++) {
    const inWindow = edges.filter(t => t > edges[i] - 1 && t <= edges[i]).length;
    assert.ok(inWindow <= MAX_PRESSES_PER_SECOND, `${inWindow} presses within one second`);
  }
});

test('the press limiter caps rising edges even when the policy asks for far more', () => {
  const game = castle(), flip = { n: 0 };
  const bot = createBot({ decide: () => { flip.n++; return { dir: flip.n % 2 ? 1 : -1, jump: flip.n % 2 === 0, attack: flip.n % 2 === 0, dash: flip.n % 2 === 0, magic: false, urgent: true }; } });
  const edges = []; let prev = {};
  for (let i = 0; i < 300; i++) {
    const input = bot.input(game);
    for (const key of ['left', 'right', 'jump', 'attack', 'dash']) if (input[key] && !prev[key]) edges.push(game.time);
    prev = input;
    game.update(DT, input);
  }
  assert.ok(edges.length > 20, 'the policy did press');
  for (const t of edges) assert.ok(edges.filter(x => x > t - 1 && x <= t).length <= MAX_PRESSES_PER_SECOND);
});

test('the bot beats the Gate Warden on floor 10 under the same human limits and ends at the second Vigil', () => {
  for (const seed of [1, 2, 3]) {
    const events = [], game = new Game(e => events.push(e), seed, 'castle');
    game.start(); resolveModal(game); game.loadFloor(10);
    const bot = createBot();
    for (let t = 0; t < 120 && game.state === 'playing'; t += DT) game.update(DT, bot.input(game));
    assert.equal(game.state, 'rest', `seed ${seed}: Warden down, second Vigil open`);
    assert.equal(game.vigil, 2);
    assert.equal(events.find(e => e.type === 'fightStats').won, true);
    assert.ok(bot.presses.length <= MAX_PRESSES_PER_SECOND);
  }
});

test('the average profile reacts in 0.3 s, presses at most 6 times a second and never touches game.rand()', () => {
  const avg = SKILLS.average;
  assert.ok(avg.reaction >= .3 && avg.presses <= 6 && avg.mistime > 0 && avg.greedy > 0 && avg.misread > 0);
  assert.throws(() => createBot({ skill: 'nope' }));
  const game = new Game(() => {}, 5, 'castle');
  game.start(); resolveModal(game);
  const real = game.rand.bind(game); let botCalls = 0, inBot = false;
  game.rand = () => { if (inBot) botCalls++; return real(); };
  const bot = createBot({ skill: 'average', seed: 5 }), edges = []; let prev = {}, dashAt = null;
  // reaction: a fresh tell must wait 0.3 s
  game.enemies = []; game.traps = []; game.obstacles = []; game.platforms = [];
  const e = game.spawnEnemy('knight', game.player.x + 50, 0);
  Object.assign(e, { hp: 500, maxHp: 500, tell: .5, dir: -1, cd: 5 }); game.player.invulnerable = 0;
  for (let t = 0; t < .5 && dashAt === null; t += DT) {
    inBot = true; const input = bot.input(game); inBot = false;
    if (input.dash) dashAt = t;
    game.update(DT, input);
  }
  assert.ok(dashAt === null || dashAt >= avg.reaction - DT, `dashed at ${dashAt}`);
  for (let i = 0; i < 1800 && game.state === 'playing'; i++) { // then a stretch of play: press cap
    inBot = true; const input = bot.input(game); inBot = false;
    for (const key of ['left', 'right', 'jump', 'attack', 'dash', 'magic']) if (input[key] && !prev[key]) edges.push(game.time);
    prev = input; game.update(DT, input);
  }
  for (const x of edges) assert.ok(edges.filter(y => y > x - 1 && y <= x).length <= avg.presses);
  assert.equal(botCalls, 0, 'the bot rolls its mistakes from its own RNG');
});

test('the bot answers a Warden follow-up only after its reaction delay', () => {
  const game = castle(); game.loadFloor(10);
  const w = game.enemies.find(e => e.warden), bot = createBot();
  Object.assign(w, { engaged: true, cd: 99 }); game.player.invulnerable = 99;
  game.wardenStart(w, 'sweep');
  for (let i = 0; i < 15; i++) { bot.input(game); game.update(DT, {}); w.tell = 1; } // the bot has reacted to the first tell
  assert.equal(bot.reacts(w, game.time), true);
  w.follows = 1; game.wardenStart(w, 'charge', false, true); w.follows = 1; // the follow-up opens in the same update the previous tell ended
  bot.input(game);
  assert.equal(bot.reacts(w, game.time), false, 'a fresh follow-up tell is not answered at once');
  for (let i = 0; i < Math.ceil(REACTION_DELAY / DT) + 1; i++) { game.update(DT, {}); w.tell = 1; bot.input(game); }
  assert.equal(bot.reacts(w, game.time), true);
});

// heavy seed 1 became 3: seed 1 now loses to a debt death, the intended new risk of the Greatsword frenzy (#61).
test('the expert bot beats the Fallen King on floor 50 (all weapons, a few seeds) and leaves a won fight', () => {
  for (const [seed, weapon] of [[3, 'heavy'], [2, 'twin'], [3, 'spear'], [4, 'spear']]) {
    const events = [], game = new Game(e => events.push(e), seed, 'castle');
    game.start(); game.setWeapon(weapon); game.descend(); game.loadFloor(50);
    const bot = createBot({ seed });
    for (let t = 0; t < 300 && game.state === 'playing'; t += DT) game.update(DT, bot.input(game));
    assert.equal(game.state, 'sliceEnd', `${weapon} seed ${seed}`);
    assert.equal(events.find(e => e.type === 'sliceEnd').king, 'won'); assert.equal(events.find(e => e.type === 'fightStats').won, true);
    assert.ok(bot.presses.length <= MAX_PRESSES_PER_SECOND);
  }
});

test('the expert bot answers the PR 2 moves (sweep, knight string, bat swoop) within human limits', () => {
  for (const [type, gap, floor, kinds] of [['spear', 60, 3, ['sweep']], ['knight', 50, 7, ['slash', 'overhead', 'turnswipe']], ['bat', 25, 4, ['swoop']]]) {
    const game = castle(3); game.loadFloor(floor);
    const p = game.player, seen = new Set();
    game.onEvent = ev => { if (ev.type === 'enemySwing' && ev.kind) seen.add(ev.kind); };
    game.enemies = []; game.traps = []; game.obstacles = []; game.platforms = [];
    game.rand = () => .99; // no heavy rolls: only the light kits
    game.spawnEnemy(type, p.x + gap, 0);
    const e = game.enemies[0];
    Object.assign(e, { hp: 1e6, maxHp: 1e6, dir: -1, cd: 0 }); if (type === 'bat') e.y = p.y - 30;
    p.invulnerable = 0; p.blood = 150;
    const bot = createBot({ skill: 'expert', seed: 5 });
    for (let t = 0; t < 8; t += DT) game.update(DT, bot.input(game));
    assert.ok(kinds.some(k => seen.has(k)), `${type}: the move happened (${[...seen]})`);
    assert.ok(p.blood >= 150 - 4, `${type}: the bot took ${150 - p.blood} blood`);
  }
});

test('the apex duel harness is deterministic for a fixed seed', async () => {
  const { playDuel } = await import('../tools/bot-run.mjs');
  const opt = { n: 3, weapon: 'spear', cap: 20 };
  const a = playDuel(4, opt), b = playDuel(4, opt);
  assert.deepEqual(a, b);
  assert.ok(a.win || a.dead || a.timeout || a.left);
});

test('the expert bot can still beat a castle apex skeleton 1v1 with every weapon (some seed per weapon), taking no unanswerable hit', async () => {
  const { playDuel } = await import('../tools/bot-run.mjs');
  for (const weapon of Object.keys(WEAPONS)) {
    const runs = [1, 2, 3].map(seed => playDuel(seed, { n: 1, weapon, cap: 40 }));
    assert.ok(runs.some(r => r.win), `${weapon}: no seed was won`);
    assert.ok(runs.every(r => !r.dead && r.unanswerable === 0), `${weapon}: a death or an unanswerable hit`);
  }
});
