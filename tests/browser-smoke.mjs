// Optional end-to-end check: serve the project, then run node tests/browser-smoke.mjs.
// Uses a locally installed Playwright or the Codex browser tooling when available.
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
const errors = [];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
function passed(message) { console.log(`PASS ${message}`); }
async function state(page, value) {
  await page.waitForFunction(expected => window.__nocturne.game.state === expected, value);
}
async function settingsRoundTrip(page, expectedState, restoredControl, escape = false) {
  await page.locator('#settings-button').click();
  await page.locator('[data-setting="sound"]').waitFor({ state: 'visible' });
  if (escape) await page.keyboard.press('Escape');
  else await page.locator('[data-command="resume"]').click();
  await state(page, expectedState);
  assert.equal(await page.locator(restoredControl).first().isVisible(), true);
}
async function arena(page) {
  await page.evaluate(() => {
    const game = window.__nocturne.game;
    game.enemies = [];
    game.platforms = [];
    game.projectiles = [];
    game.pickups = [];
    game.player.x = 150;
    game.player.y = 438;
    game.player.vy = 0;
    game.player.jumps = 0;
    game.player.hp = 100;
    game.player.invulnerable = 100;
    game.player.dash = 0;
    game.player.dashCd = 0;
    game.player.magicCd = 0;
    game.player.mp = 100;
    game.freeze = 0;
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${baseUrl}/?test`);
  await page.locator('#sound-button').click();
  assert.equal(await page.evaluate(() => window.__nocturne.settings.sound), false);
  await page.locator('#sound-button').click();
  await page.locator('#pause-button').click();
  assert.equal(await page.locator('.help-grid').isVisible(), true);
  await page.locator('[data-command="resume"]').click();
  await state(page, 'title');
  passed('title HUD sound and help buttons are clickable');
  await page.locator('#start-button').click();
  await state(page, 'playing');
  await arena(page);

  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__nocturne.game.player.x > 195);
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(() => window.__nocturne.game.player.vx === 0);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__nocturne.game.player.jumps === 1 && window.__nocturne.game.player.y < 438);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__nocturne.game.player.jumps === 2);
  await page.waitForFunction(() => window.__nocturne.game.player.grounded);
  passed('keyboard movement, release, jump, and double jump');

  await page.evaluate(() => {
    const game = window.__nocturne.game;
    game.spawnEnemy('skeleton', game.player.x + 65, 0);
    const enemy = game.enemies[0];
    enemy.hp = enemy.maxHp = 1000;
    enemy.cd = 100;
  });
  await page.keyboard.down('j');
  await page.waitForFunction(() => window.__nocturne.game.enemies[0].hp < 1000);
  await page.keyboard.up('j');
  await page.waitForFunction(() => window.__nocturne.game.freeze <= 0);
  await page.keyboard.press('k');
  await page.waitForFunction(() => window.__nocturne.game.player.dashCd > 0);
  await page.waitForFunction(() => window.__nocturne.game.freeze <= 0);
  await page.keyboard.press('l');
  await page.waitForFunction(() => window.__nocturne.game.player.mp < 80);
  passed('keyboard attack lands, dash activates, and magic spends mana');

  await page.keyboard.press('p');
  await state(page, 'paused');
  const pausedTime = await page.evaluate(() => window.__nocturne.game.elapsed);
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => window.__nocturne.game.elapsed), pausedTime);
  await page.locator('[data-command="settings"]').click();
  await state(page, 'paused');
  await page.keyboard.press('Escape');
  await state(page, 'playing');
  passed('pause freezes run time, nested settings and Escape resume');

  for (let stage = 0; stage < 5; stage++) {
    await page.evaluate(() => {
      const game = window.__nocturne.game;
      for (const enemy of game.enemies) enemy.hp = 0;
      game.freeze = 0;
      game.projectiles = [];
      game.player.x = game.portalX;
      game.player.y = 438;
      game.player.vy = 0;
      game.player.dash = 0;
      game.player.invulnerable = 100;
    });
    if (stage < 4) {
      await state(page, 'upgrade');
      assert.equal(await page.locator('[data-relic]').count(), 3);
      if (stage === 0) {
        await settingsRoundTrip(page, 'upgrade', '[data-relic]');
        await settingsRoundTrip(page, 'upgrade', '[data-relic]', true);
        passed('settings returns to mandatory relic selection by button and Escape');
      }
      await page.keyboard.press('Escape');
      await state(page, 'upgrade');
      await page.locator('[data-relic]').nth(stage % 3).click();
      await state(page, 'playing');
      assert.equal(await page.evaluate(() => window.__nocturne.game.stage), stage + 1);
      assert.equal(await page.evaluate(() => window.__nocturne.game.relics.length), stage + 1);
      assert.equal(await page.locator('#modal').isVisible(), false);
    }
  }
  await state(page, 'won');
  assert.match(await page.locator('#modal-title').innerText(), /黎明/);
  await settingsRoundTrip(page, 'won', '[data-command="restart"]', true);
  assert.match(await page.locator('#modal-title').innerText(), /黎明/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nocturne-records')).wins), 1);
  passed('five stages, four actual relic UI choices, final victory, and record saving');

  await page.locator('[data-command="restart"]').click();
  await state(page, 'playing');
  assert.deepEqual(await page.evaluate(() => {
    const g = window.__nocturne.game;
    return { stage: g.stage, hp: g.player.hp, relics: g.relics.length };
  }), { stage: 0, hp: 100, relics: 0 });
  await page.evaluate(() => {
    const game = window.__nocturne.game;
    game.player.invulnerable = 0;
    game.hurt(9999, 1);
  });
  await state(page, 'dead');
  assert.match(await page.locator('#modal-title').innerText(), /止步/);
  await settingsRoundTrip(page, 'dead', '[data-command="restart"]');
  assert.match(await page.locator('#modal-title').innerText(), /止步/);
  await page.locator('[data-command="title"]').click();
  await state(page, 'title');
  assert.equal(await page.locator('#start-button').isVisible(), true);
  passed('restart resets the run; death and return-to-title UI work');

  await page.locator('#settings-button').click();
  for (const setting of ['sound', 'music', 'haptics', 'shake']) {
    const toggle = page.locator(`[data-setting="${setting}"]`);
    if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
  }
  await page.locator('[data-command="resume"]').click();
  await page.reload();
  await page.waitForFunction(() => window.__nocturne);
  assert.deepEqual(await page.evaluate(() => window.__nocturne.settings), { sound: false, music: false, haptics: false, shake: false });
  await page.locator('#settings-button').click();
  for (const setting of ['sound', 'music', 'haptics', 'shake']) assert.equal(await page.locator(`[data-setting="${setting}"]`).getAttribute('aria-pressed'), 'false');
  passed('all four settings persist across reload and their UI reflects saved values');
  await page.goto(baseUrl);
  assert.equal(await page.evaluate(() => '__nocturne' in window), false);
  passed('test handle is absent from the normal URL');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage();
  watch(phone);
  await phone.goto(`${baseUrl}/?test`);
  await phone.locator('#start-button').tap();
  await state(phone, 'playing');
  await arena(phone);
  await phone.evaluate(() => {
    const game = window.__nocturne.game;
    game.spawnEnemy('skeleton', 220, 0);
    game.enemies[0].hp = game.enemies[0].maxHp = 1000;
    game.enemies[0].cd = 100;
  });
  const cdp = await mobile.newCDPSession(phone);
  const point = async (control, id) => {
    const box = await phone.locator(`[data-control="${control}"]`).boundingBox();
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const right = await point('right', 1), attack = await point('attack', 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, attack] });
  await phone.waitForFunction(() => window.__nocturne.game.player.x > 180 && window.__nocturne.game.enemies[0].hp < 1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForFunction(() => window.__nocturne.game.player.vx === 0);
  assert.equal(await phone.locator('[data-control].active').count(), 0);
  await phone.locator('[data-control="jump"]').tap();
  await phone.waitForFunction(() => window.__nocturne.game.player.jumps === 1);
  await phone.locator('[data-control="dash"]').tap();
  await phone.waitForFunction(() => window.__nocturne.game.player.dashCd > 0);
  await phone.locator('[data-control="magic"]').tap();
  await phone.waitForFunction(() => window.__nocturne.game.player.mp < 80);
  passed('mobile multi-touch movement + attack, release, jump, dash, and magic');

  await phone.locator('#pause-button').tap();
  await state(phone, 'paused');
  await phone.locator('[data-command="resume"]').tap();
  await state(phone, 'playing');
  await phone.setViewportSize({ width: 390, height: 844 });
  const layout = await phone.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, controls: [...document.querySelectorAll('[data-control]')].map(button => {
    const r = button.getBoundingClientRect();
    return { x: r.x, right: r.right, width: r.width, height: r.height };
  }) }));
  assert.ok(layout.documentWidth <= layout.width, 'portrait page must not overflow horizontally');
  assert.ok(layout.controls.every(button => button.x >= 0 && button.right <= layout.width && button.width >= 40 && button.height >= 40));
  passed('mobile pause/resume and portrait controls remain inside the viewport');
  await mobile.close();
  assert.deepEqual(errors, [], 'browser console and page errors');
  passed('no browser console errors or uncaught exceptions');
} finally {
  await browser.close();
}