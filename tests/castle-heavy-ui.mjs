// Optional browser regression checks for Castle heavy attacks (#47 PR B). Not part of npm test.
// Run with the server up: python3 -m http.server 8080, then node tests/castle-heavy-ui.mjs
// Rules are pinned in tests/core.test.js; this file checks the browser wiring: events, blood, the death screen and no heavies outside castle.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { ({ chromium } = require('/opt/codex/cua_node/lib/node_modules/playwright')); }
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const failures = [], errors = [];
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${name}\n     ${error.message.split('\n')[0]}`); }
}

// Page-side helpers. Time is stepped by hand (1/120 s) while frozen, so timing checks are exact.
function install() {
  const g = window.__nocturne.game;
  if (!g.__wrapped) {
    g.__wrapped = true; g.__log = [];
    const orig = g.emit.bind(g);
    g.emit = (type, data) => { g.__log.push({ type, kind: data && data.kind, heavy: data && data.heavy }); return orig(type, data); };
  }
  window.__qa = {
    g,
    freeze() { if (g.state === 'playing') g.state = 'paused'; },
    unfreeze() { if (g.state === 'paused') g.state = 'playing'; },
    act(fn) { const was = g.state; if (was === 'paused') g.state = 'playing'; const r = fn(); if (was === 'paused' && g.state === 'playing') g.state = 'paused'; return r; },
    step(sec) {
      const was = g.state; if (was === 'paused') g.state = 'playing';
      for (let i = 0; i < Math.round(sec * 120) && g.state === 'playing'; i++) g.update(1 / 120, {});
      if (was === 'paused' && g.state === 'playing') g.state = 'paused';
    },
    until(expr, maxSec = 30) {
      const f = new Function('g', 'p', 'e', 'return (' + expr + ');');
      const was = g.state; if (was === 'paused') g.state = 'playing';
      let el = -1;
      for (let i = 0; i < maxSec * 120 && g.state === 'playing'; i++) { if (f(g, g.player, g.enemies[0])) { el = i / 120; break; } g.update(1 / 120, {}); }
      if (was === 'paused' && g.state === 'playing') g.state = 'paused';
      return el;
    },
    setup(opts) {
      g.enemies.length = 0; g.__log.length = 0;
      const p = g.player;
      Object.assign(p, { blood: opts.blood ?? 150, invulnerable: 0, magicCd: 0, attackCd: 0, dashCd: 0, dash: 0, grounded: true, frenzy: false, x: 300, dir: 1, vx: 0, vy: 0, whiff: 0, comboWindow: 0, combo: 0, buffer: 0, perfect: 0 });
      g.freeze = 0; g.heavyGap = 0;
      for (const o of opts.enemies) {
        const e = g.spawnEnemy(o.type, p.x + o.dx, 0); // spawnEnemy pushes into g.enemies
        e.dir = o.dir ?? -1; e.cd = 0; e.heavyCd = 0; e.rollT = 0; e.hp = o.hp ?? e.hp; e.maxHp = e.hp; e.reface = 0; e.required = true;
      }
    },
    // retry setup until the enemy's first attack is its heavy (a light attack first would change the blood numbers)
    heavyFirst(opts) {
      for (let k = 0; k < 40; k++) {
        window.__qa.setup(opts);
        const was = g.state; if (was === 'paused') g.state = 'playing';
        let ok = false;
        for (let i = 0; i < 12 * 120 && g.state === 'playing'; i++) {
          if (g.__log.some(l => l.type === 'hurt' || (l.type === 'enemySwing' && !l.heavy))) break;
          if (g.enemies[0].heavy) { ok = true; break; }
          g.update(1 / 120, {});
        }
        if (was === 'paused' && g.state === 'playing') g.state = 'paused';
        if (ok) return true;
      }
      return false;
    },
    snapshot() {
      const p = g.player, e = g.enemies[0] || {};
      return { state: g.state, blood: p.blood, heavy: !!e.heavy, tell: +(e.tell || 0).toFixed(3), recover: +(e.recover || 0).toFixed(3), punishable: !!e.punishable, hp: e.hp };
    },
  };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openCastle(viewport = { width: 812, height: 375 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/?test`);
  await page.locator('#castle-button').click();
  await page.locator('#modal-panel[data-kind="vigil"]').waitFor();
  await page.locator('[data-weapon="heavy"]').click();
  await page.evaluate(install);
  await page.evaluate(() => window.__qa.freeze());
  return { context, page };
}
const q = (page, fn, ...args) => page.evaluate(fn, ...args);
const snap = page => q(page, () => window.__qa.snapshot());
const skeleton = { type: 'skeleton', dx: 75, dir: -1, hp: 999 };

try {
  await check('a cleave from exactly 100 blood kills and the death screen names the heavy', async () => {
    const { context, page } = await openCastle();
    assert.equal(await q(page, o => window.__qa.heavyFirst(o), { blood: 100, enemies: [skeleton] }), true);
    await q(page, () => window.__qa.until('e.recover > 0', 3));
    const s = await snap(page);
    assert.equal(s.state, 'dead');
    await q(page, () => window.__qa.unfreeze());
    await wait(250);
    const text = await page.locator('#modal-panel').innerText();
    assert.ok(text.includes('A heavy blow took everything. Above half blood, you would have lived.'), 'heavy death line missing');
    await context.close();
  });

  await check('a cleave from 101 blood leaves 1 blood and the run goes on', async () => {
    const { context, page } = await openCastle();
    assert.equal(await q(page, o => window.__qa.heavyFirst(o), { blood: 101, enemies: [skeleton] }), true);
    await q(page, () => window.__qa.until('e.recover > 0', 3));
    const s = await snap(page);
    assert.equal(s.state, 'paused');
    assert.equal(s.blood, 1);
    await context.close();
  });

  await check('a stationary hero in the cleave area takes 100, then a punish hit in recovery nets +3 and a normal hit +1', async () => {
    const { context, page } = await openCastle();
    assert.equal(await q(page, o => window.__qa.heavyFirst(o), { blood: 150, enemies: [{ ...skeleton, hp: 999 }] }), true);
    await q(page, () => window.__qa.until('e.recover > 0', 3));
    const hit = await snap(page);
    assert.equal(hit.blood, 50);
    assert.ok(hit.punishable && hit.recover > 0.8);
    const before = hit.blood;
    await q(page, () => window.__qa.act(() => window.__qa.g.attack()));
    await q(page, () => window.__qa.step(0.3));
    assert.equal((await snap(page)).blood - before, 3, 'punish hit should net +3 (cost 2, hit 3, punish 2)');
    assert.ok(await q(page, () => window.__qa.until('e.recover <= 0 && e.tell > 0 && !e.heavy', 2)) >= 0, 'the punish should draw one provoked answer once the cleave recovery ends');
    assert.equal((await snap(page)).punishable, false);
    assert.ok(await q(page, () => window.__qa.until('e.tell <= 0 && e.recover <= 0 && !e.punishable', 3)) >= 0, 'the provoked answer should end');
    const b2 = (await snap(page)).blood;
    await q(page, () => window.__qa.act(() => window.__qa.g.attack()));
    await q(page, () => window.__qa.step(0.3));
    assert.equal((await snap(page)).blood - b2, 1, 'a normal hit should net +1');
    await context.close();
  });

  await check('a sword hit does not cancel a wind-up; Eclipse does and no strike follows', async () => {
    const { context, page } = await openCastle();
    assert.equal(await q(page, o => window.__qa.heavyFirst(o), { blood: 150, enemies: [{ ...skeleton }] }), true);
    await q(page, () => window.__qa.step(0.2));
    await q(page, () => window.__qa.act(() => window.__qa.g.attack()));
    await q(page, () => window.__qa.step(0.05));
    assert.equal((await snap(page)).heavy, true, 'sword hit cancelled the wind-up');
    await q(page, () => window.__qa.act(() => { const p = window.__qa.g.player; p.magicCd = 0; p.blood = 150; window.__qa.g.magic(); }));
    await q(page, () => window.__qa.step(0.05));
    assert.equal((await snap(page)).heavy, false, 'Eclipse did not cancel the wind-up');
    await q(page, () => window.__qa.step(2));
    assert.ok((await snap(page)).blood > 50, 'a strike landed after the Eclipse cancel');
    await context.close();
  });

  await check('three skeletons in range: never two heavies live, and strikes at least 1.1 s apart', async () => {
    const { context, page } = await openCastle();
    await q(page, o => window.__qa.setup(o), { blood: 150, enemies: [{ ...skeleton, dx: 80 }, { ...skeleton, dx: 130 }, { ...skeleton, dx: 180 }] });
    const res = await q(page, () => {
      const g = window.__qa.g, p = g.player;
      let maxLive = 0;
      window.__qa.unfreeze();
      g.state = 'paused';
      for (let i = 0; i < 90 * 120; i++) {
        g.state = 'playing';
        p.blood = Math.max(p.blood, 150); p.invulnerable = 0;
        g.update(1 / 120, {});
        const live = g.enemies.filter(e => e.hp > 0 && e.heavy && (e.tell > 0 || e.strikeT > 0) && Math.abs(p.x - e.x) <= 620).length;
        maxLive = Math.max(maxLive, live);
      }
      g.state = 'paused';
      return { maxLive, starts: g.__log.filter(l => l.type === "enemySwing" && l.heavy).length };
    });
    assert.ok(res.maxLive <= 1, `${res.maxLive} heavies live at once`);
    assert.ok(res.starts >= 3, 'expected several heavy strikes in 90 s');
    await context.close();
  });

  for (const mode of ['normal', 'endless']) {
    await check(`${mode} runs never start a heavy attack`, async () => {
      const context = await browser.newContext({ viewport: { width: 812, height: 375 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/?test`);
      await page.evaluate(m => window.__nocturne.startRun(m), mode);
      await page.waitForFunction(() => window.__nocturne.game.state === 'upgrade');
      await page.locator('[data-relic]').first().click();
      await page.evaluate(install);
      await q(page, () => window.__qa.freeze());
      await q(page, o => window.__qa.setup(o), { blood: 150, enemies: [{ ...skeleton, dx: 80 }, { type: 'shield', dx: 150, dir: -1, hp: 999 }, { type: 'knight', dx: 200, dir: -1, hp: 999 }] });
      const count = await q(page, () => {
        const g = window.__qa.g, p = g.player;
        g.state = 'playing';
        for (let i = 0; i < 60 * 120; i++) { p.hp = Math.max(p.hp, 60); p.invulnerable = 0; g.update(1 / 120, {}); }
        g.state = 'paused';
        return g.__log.filter(l => l.type === 'enemyHeavy' || (l.type === 'enemySwing' && l.heavy)).length;
      });
      assert.equal(count, 0);
      await context.close();
    });
  }

  await check('the blood bar carries the danger class at 100 only (not at 101, not in frenzy)', async () => {
    const { context, page } = await openCastle();
    const classes = async () => page.evaluate(() => document.querySelector('#vitals').classList.contains('danger'));
    await q(page, () => { window.__qa.g.player.blood = 100; });
    await wait(200);
    assert.equal(await classes(), true);
    await q(page, () => { window.__qa.g.player.blood = 101; });
    await wait(200);
    assert.equal(await classes(), false);
    await q(page, () => { const p = window.__qa.g.player; p.blood = 200; p.frenzy = true; });
    await wait(200);
    assert.equal(await classes(), false);
    await context.close();
  });

  await check('no browser console errors or uncaught exceptions', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}

if (failures.length) { console.log(`\n${failures.length} castle heavy check(s) failed`); process.exit(1); }
console.log('all castle heavy checks passed');
