// Optional browser regression check for the Endless Trial title entry (QA #22). Not part of npm test.
// Run with the server up: python3 -m http.server 8080, then node tests/endless-ui.mjs
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

async function titleWith(records) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(saved => localStorage.setItem('nocturne-records', JSON.stringify(saved)), records);
  await page.goto(`${baseUrl}/?test`);
  await page.waitForFunction(() => window.__nocturne);
  return { context, page };
}

// Rule: focusing the Endless Trial button and pressing Enter starts an endless run, and a locked one starts nothing.
{
  const { context, page } = await titleWith({ wins: 1, bestFloor: 2 });
  await page.locator('#endless-button').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const mode = await page.evaluate(() => window.__nocturne.game.mode);
  assert.equal(mode, 'endless', `Enter on the focused Endless Trial button started a ${mode} run`);
  console.log('PASS Enter on the unlocked Endless Trial button starts an endless run');
  await context.close();
}
{
  const { context, page } = await titleWith({});
  await page.locator('#endless-button').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => window.__nocturne.game.state);
  assert.equal(state, 'title', `Enter on the locked Endless Trial button started a run (state ${state})`);
  console.log('PASS Enter on the locked Endless Trial button starts nothing');
  await context.close();
}
assert.deepEqual(errors, []);
console.log('endless UI checks passed');
await browser.close();
