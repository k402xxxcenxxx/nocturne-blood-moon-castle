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

// Feel-rule (bell, jump): each ring gives its own cue, `ringNear`, 0.4 s before it reaches the hero, so a jump on the cue clears the low ring at any range (the old cue was the bell's glint, which says nothing about the ring's arrival).
for (const gap of [60, 150, 300, 600]) {
  test(`a jump on the low ring's cue clears it at ${gap} px, and the cue comes 0.4 s ahead`, () => {
    const { game, warden, hero } = arena(4, 900 - gap, 900, -1);
    warden.hp = warden.maxHp * .7; warden.bossPhase = 1; hero.blood = 300;
    let near = null, jumped = false; const emit = game.emit.bind(game); game.emit = (type, data) => { if (type === 'ringNear' && data.kind === 'low' && !near) near = { ...data, at: game.time }; return emit(type, data); };
    game.wardenStart(warden, 'bell');
    const b0 = hero.blood; let hitAt = -1;
    for (let f = 0; f < 120 * 9; f++) { game.update(1 / 120, near && !jumped ? (jumped = true, { jump: true }) : {}); if (hitAt < 0 && hero.blood < b0) hitAt = game.time; }
    assert.ok(near && near.eta === .4, 'the cue fired');
    assert.equal(hero.blood, b0, `hero lost ${b0 - hero.blood} blood to the bell`);
    const ring = game.rings.length === 0;
    assert.ok(ring);
  });
}
test('the bell cue is 0.4 s from the ring\'s arrival for a hero 60 px away too: the rings on his side leave later', () => {
  const { game, warden, hero } = arena(5, 840, 900, -1); warden.hp = warden.maxHp * .7; hero.blood = 300;
  game.wardenStart(warden, 'bell'); advance(game, 1.65);
  const low = game.rings.filter(r => r.kind === 'low' && r.dir === -1)[0]; assert.ok(low.wait > 0 || low.dist === 0, 'the near ring waits'); assert.ok(game.rings.find(r => r.kind === 'low' && r.dir === 1).wait <= 0, 'the far side does not');
});
