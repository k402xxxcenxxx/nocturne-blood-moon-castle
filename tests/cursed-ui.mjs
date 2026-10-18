// Optional browser regression checks for cursed relics (QA #1). Not part of npm test.
// Run with the server up: python3 -m http.server 8080, then node tests/cursed-ui.mjs
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
const failures = [];
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${name}\n     ${error.message.split('\n')[0]}`); }
}

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${baseUrl}/?test`);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__nocturne.game.state === 'upgrade');
  await page.locator('[data-relic]').first().click();
  await page.waitForFunction(() => window.__nocturne.game.state === 'playing');
  // Offer Lunatic Moon by re-rolling stage offers until it appears, then take it.
  await page.evaluate(() => window.__nocturne.game.finishStage());
  for (let i = 0; i < 500; i++) {
    const has = await page.evaluate(() => window.__nocturne.game.choices.some(r => r.id === 'lunaticMoon'));
    if (has) break;
    await page.evaluate(() => window.__nocturne.game.rollChoices('stage'));
  }
  await page.locator('[data-relic="lunaticMoon"]').click();
  await page.waitForFunction(() => window.__nocturne.game.state === 'playing');

  await check('Eclipse button is not shown as unavailable with Lunatic Moon and 0 MP (Eclipse is free)', async () => {
    await page.evaluate(() => { const g = window.__nocturne.game; g.enemies = []; g.player.mp = 0; g.player.magicCd = 0; });
    await page.waitForTimeout(120);
    const unavailable = await page.evaluate(() => document.querySelector('[data-control="magic"]').classList.contains('unavailable'));
    assert.equal(unavailable, false, 'magic button has class unavailable although the cast is free and ready');
  });

  await check('a room banner for the same room is not shown twice in a row while the hero stays there', async () => {
    await page.evaluate(() => { const g = window.__nocturne.game; g.player.invulnerable = 1000; g.enemies.forEach(e => e.hp = 0); });
    await page.waitForTimeout(3000); // stage announcement ends
    const rooms = await page.evaluate(() => window.__nocturne.game.rooms.map(r => ({ x: r.x, w: r.w })));
    await page.evaluate(() => {
      const el = document.getElementById('room-banner'); window.__banner = [];
      new MutationObserver(() => { if (el.classList.contains('show')) window.__banner.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    // Flip between rooms 0 and 1 for 2 s, then stay in room 1.
    await page.evaluate(async rooms => {
      const g = window.__nocturne.game; const s = performance.now(); let i = 0;
      while (performance.now() - s < 2000) { const r = rooms[i++ % 2]; g.player.x = r.x + r.w / 2; await new Promise(res => setTimeout(res, 30)); }
      g.player.x = rooms[1].x + rooms[1].w / 2;
    }, rooms);
    await page.waitForTimeout(7000);
    const shows = await page.evaluate(() => window.__banner);
    const repeats = shows.reduce((n, t, i) => n + (i > 0 && shows[i - 1] === t ? 1 : 0), 0);
    assert.equal(repeats, 0, `banner shown ${repeats} extra time(s) in a row: ${JSON.stringify(shows)}`);
  });
} finally {
  await browser.close();
}
if (failures.length) { console.log(`${failures.length} check(s) failing: ${failures.join('; ')}`); process.exitCode = 1; }
else console.log('all cursed UI checks passed');
