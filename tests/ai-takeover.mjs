// Optional browser check for the test AI takeover (#52). Not part of npm test.
// Run with the server up: python3 -m http.server 8080, then node tests/ai-takeover.mjs
// Covers ?test: key B and the badge toggle, input ignored while the AI is on, and input restored when it is off, at desktop and 812x375 touch, in en and zh-Hant.
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
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = page => page.evaluate(() => {
  const g = window.__nocturne.game, p = g.player;
  return { state: g.state, floor: g.floor, weapon: p.weapon, kind: document.querySelector('#modal-panel').dataset.kind, modalHidden: document.querySelector('#modal').hidden, ai: window.__nocturne.ai, pressed: document.querySelector('#ai-toggle').getAttribute('aria-pressed'), lit: document.querySelectorAll('[data-control].active').length };
});
async function waitState(page, predicate, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (predicate(await state(page))) return true; await wait(50); }
  return false;
}

async function scenario({ label, viewport, touch, locale }) {
  const errors = [];
  const context = await browser.newContext({ viewport, hasTouch: touch, locale });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const cdp = await context.newCDPSession(page);
  const check = async (name, fn) => {
    try { await fn(); console.log(`PASS [${label}] ${name}`); }
    catch (error) { failures.push(`${label}: ${name}`); console.log(`FAIL [${label}] ${name}\n     ${error.message.split('\n')[0]}`); }
  };
  const center = async selector => { const box = await page.locator(selector).first().boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const touchPress = async (x, y) => { // a real touch held briefly; returns the state while it is held
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await wait(120);
    const held = await state(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return held;
  };

  await page.goto(`${baseUrl}/?test`);
  await page.waitForFunction(() => window.__nocturne);
  await check('badge is shown and labelled in the page language', async () => {
    assert.ok((await page.locator('#ai-toggle').boundingBox())?.width > 0, 'badge hidden');
    const label = await page.locator('#ai-toggle').getAttribute('aria-label');
    assert.ok(locale === 'en-US' ? /Toggle test AI/.test(label) : /[一-鿿]/.test(label), `aria-label "${label}"`);
  });
  await check('B toggles the AI on and off on the title screen', async () => {
    await page.keyboard.press('KeyB'); await wait(50);
    assert.equal((await state(page)).pressed, 'true');
    await page.keyboard.press('KeyB'); await wait(50);
    assert.equal((await state(page)).pressed, 'false');
  });
  await page.locator('#castle-button').click();
  await page.locator('#modal-panel[data-kind="vigil"]').waitFor();
  await check('while on, a trusted click on a Vigil weapon does nothing; the AI then picks the spear and starts floor 1', async () => {
    await page.keyboard.press('KeyB'); await wait(30);
    assert.equal((await state(page)).ai, true);
    await page.locator('[data-weapon="heavy"]').click({ force: true }).catch(() => {});
    await wait(120);
    const s = await state(page);
    assert.ok(s.state === 'rest' && s.kind === 'vigil' && s.weapon !== 'heavy', `click went through: ${JSON.stringify(s)}`);
    assert.ok(await waitState(page, s => s.state === 'playing'), 'AI did not start the run');
    const started = await state(page);
    assert.ok(started.floor === 1 && started.weapon === 'spear', JSON.stringify(started));
  });
  await check('while on, keys, the d-pad, attack and Escape do not light a control or pause', async () => {
    await page.keyboard.down('ArrowRight'); await wait(150); const right = await state(page); await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyJ'); await page.keyboard.press('Escape'); await wait(80);
    const after = await state(page);
    assert.equal(right.lit, 0, 'arrow key lit a control');
    assert.notEqual(after.state, 'paused', 'Escape paused the game');
    for (const selector of ['[data-control="right"]', '[data-control="attack"]']) {
      const c = await center(selector);
      const held = touch ? await touchPress(c.x, c.y) : await (async () => { await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(120); const h = await state(page); await page.mouse.up(); return h; })();
      assert.equal(held.lit, 0, `${touch ? 'touch' : 'mouse'} on ${selector} lit a control`);
    }
  });
  await check('while on, the pause button does nothing', async () => {
    const c = await center('#pause-button');
    if (touch) await touchPress(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await wait(120);
    const s = await state(page);
    assert.ok(s.state !== 'paused' && s.modalHidden, `pause opened: ${JSON.stringify(s)}`);
  });
  await check('B turns the AI off: keys light controls again and Escape pauses and resumes', async () => {
    await page.keyboard.press('KeyB'); await wait(60);
    assert.equal((await state(page)).pressed, 'false');
    await page.keyboard.down('ArrowRight'); await wait(80); const right = await state(page); await page.keyboard.up('ArrowRight');
    assert.ok(right.lit >= 1, 'arrow key did not light a control after AI off');
    await page.keyboard.press('Escape');
    assert.ok(await waitState(page, s => s.state === 'paused', 2000), 'Escape did not pause');
    await page.keyboard.press('Escape');
    assert.ok(await waitState(page, s => s.state === 'playing', 2000), 'Escape did not resume');
  });
  await check('the badge toggles the AI on and off with a click', async () => {
    await page.locator('#ai-toggle').click(); await wait(60);
    assert.equal((await state(page)).pressed, 'true');
    await page.locator('#ai-toggle').click(); await wait(60);
    assert.equal((await state(page)).pressed, 'false');
  });
  if (touch) await check('after the AI is off, a real touch on the d-pad lights its control', async () => {
    const c = await center('[data-control="left"]');
    assert.ok((await touchPress(c.x, c.y)).lit >= 1, 'touch did not light left');
  });
  await check('no browser console errors or uncaught exceptions', async () => assert.equal(errors.length, 0, errors.join(' | ')));
  await context.close();
}

async function withoutTest() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/`);
  try {
    await page.locator('#castle-button').click();
    await page.locator('#modal-panel[data-kind="vigil"]').waitFor();
    await page.keyboard.press('KeyB'); await wait(800);
    assert.equal(await page.locator('#modal-panel').getAttribute('data-kind'), 'vigil', 'B changed the Vigil');
    assert.equal(await page.locator('#ai-toggle').isVisible(), false, 'badge shown without ?test');
    assert.equal(await page.evaluate(() => window.__nocturne), undefined, '__nocturne exposed without ?test');
    console.log('PASS [no ?test] no badge, no __nocturne handle, B does nothing');
  } catch (error) { failures.push('no ?test'); console.log(`FAIL [no ?test]\n     ${error.message.split('\n')[0]}`); }
  if (errors.length) { failures.push('no ?test console'); console.log(`FAIL [no ?test] console errors: ${errors.join(' | ')}`); }
  await context.close();
}

try {
  await scenario({ label: 'desktop en', viewport: { width: 1366, height: 900 }, touch: false, locale: 'en-US' });
  await scenario({ label: 'desktop zh-Hant', viewport: { width: 1366, height: 900 }, touch: false, locale: 'zh-Hant' });
  await scenario({ label: 'touch 812x375 en', viewport: { width: 812, height: 375 }, touch: true, locale: 'en-US' });
  await scenario({ label: 'touch 812x375 zh-Hant', viewport: { width: 812, height: 375 }, touch: true, locale: 'zh-Hant' });
  await withoutTest();
} finally {
  await browser.close();
}
if (failures.length) { console.log(`AI takeover checks: ${failures.length} failing: ${failures.join('; ')}`); process.exitCode = 1; }
else console.log('all AI takeover checks passed');
