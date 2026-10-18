// Optional browser regression checks for Castle Descent, step 1 of #45 (QA). Not part of npm test.
// Run with the server up: python3 -m http.server 8080, then node tests/castle-ui.mjs
// The relic-tray check is expected to FAIL until the stale tray after death is fixed (P3, see the QA report).
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
const state = page => page.evaluate(() => {
  const g = window.__nocturne.game, p = g.player;
  return { state: g.state, floor: g.floor, blood: p.blood, frenzy: p.frenzy, relics: g.relics.length, weapon: p.weapon, time: g.time, kind: document.querySelector('#modal-panel').dataset.kind, tray: document.querySelector('#relic-tray').children.length };
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/?test`);
  await page.locator('#castle-button').click();
  await page.locator('#modal-panel[data-kind="vigil"]').waitFor();

  await check('Castle Descent opens the Vigil and Escape does not leave it', async () => {
    await page.keyboard.press('Escape');
    assert.equal((await state(page)).kind, 'vigil');
  });
  await check('picking a weapon starts floor 1 at 100 blood with no relics', async () => {
    await page.locator('[data-weapon="heavy"]').click();
    const s = await state(page);
    assert.equal(s.state, 'playing'); assert.equal(s.floor, 1); assert.equal(s.blood, 100); assert.equal(s.relics, 0); assert.equal(s.weapon, 'heavy');
  });
  await check('Eclipse is refused below 40 blood and costs 18 at 40', async () => {
    await page.evaluate(() => { const p = window.__nocturne.game.player; p.blood = 39; p.magicCd = 0; });
    await page.keyboard.press('KeyL'); await wait(60); await page.keyboard.up('KeyL');
    assert.equal((await state(page)).blood, 39);
    await page.evaluate(() => { const p = window.__nocturne.game.player; p.blood = 40; p.magicCd = 0; });
    await page.keyboard.press('KeyL'); await wait(60);
    assert.equal(Math.round((await state(page)).blood), 22);
  });
  await check('frenzy starts at 200, burns to 100 in about 8.3 s of game time, and pause freezes it', async () => {
    await page.evaluate(() => { const p = window.__nocturne.game.player; p.blood = 200; p.frenzy = true; p.invulnerable = 99; });
    await wait(200);
    await page.keyboard.press('Escape'); await wait(100);
    const paused = await state(page);
    await wait(1200);
    assert.equal((await state(page)).blood, paused.blood, 'burn advanced while paused');
    await page.keyboard.press('Escape'); await wait(100);
    const t0 = (await state(page)).time;
    await page.waitForFunction(() => !window.__nocturne.game.player.frenzy, null, { timeout: 15000, polling: 50 });
    const s = await state(page);
    assert.ok(Math.abs(s.blood - 100) < 1.5, `blood ${s.blood} at frenzy end`);
    assert.ok(Math.abs((s.time - t0) - 100 / 12) < 1.5, `frenzy lasted ${(s.time - t0).toFixed(2)} s`);
  });
  await check('a relic pick after floor 3 gives one relic and the next floor', async () => {
    await page.evaluate(() => window.__nocturne.game.loadFloor(3));
    await page.evaluate(() => { const g = window.__nocturne.game; g.enemies.forEach(e => e.hp = 0); g.player.x = g.portalX; g.player.y = 438; });
    await page.waitForFunction(() => window.__nocturne.game.state === 'upgrade', null, { timeout: 5000 });
    await page.locator('[data-relic]').first().click();
    const s = await state(page);
    assert.equal(s.floor, 4); assert.equal(s.relics, 1); assert.equal(s.state, 'playing');
  });
  await check('death returns to the Vigil at 100 blood with no relics and no weapon', async () => {
    await page.evaluate(() => { const g = window.__nocturne.game; g.player.invulnerable = 0; g.player.blood = 3; g.hurt(30, 1); });
    await page.locator('#modal-panel[data-kind="dead"]').waitFor();
    await page.locator('[data-command="restart"]').click();
    await page.locator('#modal-panel[data-kind="vigil"]').waitFor();
    const s = await state(page);
    assert.equal(s.state, 'rest'); assert.equal(s.blood, 100); assert.equal(s.relics, 0); assert.equal(s.weapon, null);
  });
  await check('no lost relic stays in the HUD tray after death (expected to fail until fixed)', async () => {
    // The HUD tray still lists the relics of the dead run behind the Vigil; it should be emptied when the run resets.
    assert.equal((await state(page)).tray, 0, 'relic tray still shows the lost relics');
  });
  await check('no browser console errors or uncaught exceptions', async () => {
    assert.deepEqual(errors, []);
  });
  await context.close();
} finally {
  await browser.close();
}
if (failures.length) { console.log(`castle UI checks: ${failures.length} failing: ${failures.join('; ')}`); process.exit(1); }
console.log('all castle UI checks passed');
