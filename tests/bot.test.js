import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLOOR, RELICS, WEAPONS } from '../core.js';
import { createBot, chooseWeapon, chooseRelic, resolveModal, REACTION_DELAY, MAX_PRESSES_PER_SECOND } from '../bot.js';

const DT = 1 / 60;
const castle = (seed = 1) => { const game = new Game(() => {}, seed, 'castle'); game.start(); resolveModal(game); return game; }; // Vigil weapon pick, then floor 1

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
