// QA #62 PR 4 (Gate Warden) regression tests from the playtest on 876a958. The three rules are fixed in 1e2f690; the bell feel rule stays `todo` until the designer decides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLOOR } from '../core.js';

// A floor-10 Warden arena with only the Warden alive, the hero placed by the test.
function arena(seed, heroX, wardenX, dir = -1) {
  const game = new Game(() => {}, seed, 'castle');
  game.apex = true; game.start(); game.setWeapon('heavy'); game.descend(); game.loadFloor(10);
  game.enemies = game.enemies.filter(e => e.warden); game.traps = []; game.player.invulnerable = 0;
  const warden = game.enemies[0], hero = game.player;
  Object.assign(warden, { x: wardenX, dir, engaged: true, cd: 99, bellAt: 1e9, gateAt: 1e9, tollAt: 1e9 });
  Object.assign(hero, { x: heroX, y: FLOOR, blood: 180, frenzy: 0 });
  return { game, warden, hero };
}
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) game.update(1 / 120, {}); };

// Repro on 876a958, fixed in 1e2f690: a Toll throw stopped at a standing gate.
test('a Great Toll throw stops at a standing gate: the hero stays on the Warden\'s side', () => {
  const { game, warden } = arena(1, 1050, 1200, -1);
  game.dropGate(1010);
  game.wardenToll(warden, true);
  assert.ok(game.player.x > 1010 + 22, `hero thrown to x ${game.player.x.toFixed(0)}, past the gate at 1010`);
});

test('a Gate Toll (seize) throw stops at a standing gate too', () => {
  const { game, warden } = arena(2, 1050, 1200, -1);
  game.dropGate(1010);
  game.wardenToll(warden, false);
  assert.ok(game.player.x > 1010 + 22, `hero thrown to x ${game.player.x.toFixed(0)}, past the gate at 1010`);
});

// Repro on 876a958, fixed in 1e2f690: a hero standing on a gate top (150 px) was safe from every Warden box.
test('a portcullis is a wall, not a platform: a hero who lands on its top is put back on the floor', () => {
  const { game, hero } = arena(3, 700, 1200, -1);
  game.dropGate(500);
  hero.x = 500 + 22 + hero.w / 2 + 2; advance(game, 0.1);
  game.update(1 / 120, { jump: true }); advance(game, 0.25); game.update(1 / 120, { jump: true });
  for (let i = 0; i < 30; i++) game.update(1 / 120, { left: true }); // walk into the gate while the second jump is in the air: it lands on top
  advance(game, 2);
  assert.ok(hero.y > FLOOR - 100, `hero rests at y ${hero.y.toFixed(0)} (gate top is ${FLOOR - 150})`);
});

// Feel-rule (bell, jump): the glint is the heavy cue, and a jump on the glint (0.4 s before contact) lands before the low ring arrives at any range.
test('a jump on the bell glint clears the low ring at 300 px', { todo: 'Feel, P2 (readability): the safe low-ring jump window is 0.3 s and moves with range; a jump on the glint is hit at 150, 300 and 600 px (tests in scratchpad qa64/bellpre.mjs)' }, () => {
  const { game, warden, hero } = arena(4, 600, 900, -1);
  warden.hp = warden.maxHp * .7; warden.bossPhase = 1; hero.blood = 300;
  game.wardenStart(warden, 'bell'); // the tell starts here; the glint is 0.4 s before the rings leave (frame 144)
  const b0 = hero.blood;
  for (let f = 0; f < 120 * 9; f++) { game.update(1 / 120, f === 144 ? { jump: true } : {}); }
  assert.equal(hero.blood, b0, `hero lost ${b0 - hero.blood} blood to the bell`);
});
