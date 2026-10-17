import { Game, RELICS, FLOOR, clamp } from './core.js';
import { drawScene, drawHero, drawEnemy, drawPortal } from './art.js';
import { AudioSystem } from './audio.js';
import { LANGUAGES, detectLanguage, setLanguage, language, t } from './i18n.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
const frame = $('game-frame'), audio = new AudioSystem();
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const roman = ['I', 'II', 'III', 'IV', 'V'];
function readSaved(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can disable storage. The run still works. */ } }
const storedSettings = readSaved('nocturne-settings', {});
const settings = { sound: true, music: true, haptics: true, shake: !matchMedia('(prefers-reduced-motion: reduce)').matches, lang: detectLanguage(navigator.language), ...storedSettings };
const records = { runs: 0, wins: 0, best: 0, ...readSaved('nocturne-records', {}) };
let game, camera = 0, viewWidth = 960, worldTime = 0, lastTime = 0, particles = [], effects = [], numbers = [], trails = [];
let shakeTime = 0, shakePower = 0, damageFlash = 0, whiteFlash = 0, hitCount = 0, comboTime = 0;
let announceTime = 0, toastTime = 0, trailTimer = 0, returnState = null, modalKind = '', modalReturn = null, previousFocus = null;
const held = new Map(), buffered = new Map();
const keyControls = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyJ: 'attack', KeyZ: 'attack', KeyK: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash', KeyL: 'magic', KeyC: 'magic' };
const impulseControls = new Set(['jump', 'dash', 'magic']);
function applySettings() {
  audio.setMuted(!settings.sound); audio.setMusic(settings.music); audio.setHaptics(settings.haptics);
  $('sound-button').innerHTML = icon(settings.sound ? 'sound' : 'mute');
  $('sound-button').setAttribute('aria-label', t(settings.sound ? 'hud.soundOff' : 'hud.soundOn'));
  frame.classList.toggle('reduced-motion', !settings.shake);
  save('nocturne-settings', settings);
}
function updateBest() { $('best-label').textContent = records.best ? t('best.record', { stage: roman[Math.min(records.best, 5) - 1], wins: records.wins }) : t('best.none'); }
function relicTray() { return game.relics.map(id => `<span class="relic-icon" title="${t(`relic.${id}.name`)}: ${t(`relic.${id}.text`)}">${icon(RELICS.find(r => r.id === id).icon)}</span>`).join(''); }
function applyLanguage() {
  setLanguage(settings.lang); document.documentElement.lang = language();
  document.title = t('meta.title'); document.querySelector('meta[name="description"]').content = t('meta.description');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $('stage-name').textContent = t(`stage.${game.stage}.name`); $('relic-tray').innerHTML = relicTray();
  applySettings(); updateBest();
}
function clearInput() { held.clear(); buffered.clear(); document.querySelectorAll('[data-control]').forEach(b => b.classList.remove('active')); }
function press(control, source) {
  if (game.state !== 'playing') return;
  held.set(source, control);
  if (impulseControls.has(control)) buffered.set(control, performance.now() + 200);
  document.querySelector(`[data-control="${control}"]`)?.classList.add('active');
}
function release(source) {
  const control = held.get(source); held.delete(source);
  if (![...held.values()].includes(control)) document.querySelector(`[data-control="${control}"]`)?.classList.remove('active');
}
function getInput() {
  const input = {};
  for (const control of held.values()) if (!impulseControls.has(control)) input[control] = true;
  for (const [control, expires] of buffered) {
    if (expires < performance.now()) buffered.delete(control);
    else input[control] = true;
  }
  return input;
}
function toast(message) { $('toast').textContent = message; toastTime = 2.6; $('toast').classList.add('show'); }
function burst(x, y, color, count = 12, power = 150, dir = 0, size = 0) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = power * (.25 + Math.random());
    particles.push({ x, y, vx: Math.cos(angle) * speed + dir * power * .7, vy: Math.sin(angle) * speed - 30, life: .25 + Math.random() * .4, max: .65, color, size: size || (Math.random() > .7 ? 3 : 2) });
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);
}
function flashNumber(e, color = '#f0ddaa') { numbers.push({ x: e.x + Math.random() * 12 - 6, y: e.y - 6, text: String(e.amount), life: .85, crit: e.crit, color }); }
function rumble(power, duration = .15) { if (settings.shake) { shakePower = Math.max(shakePower, power); shakeTime = duration; } }
function recordResult(win) { records.best = Math.max(records.best, game.stage + 1); if (win) records.wins++; save('nocturne-records', records); updateBest(); }
function handleEvent(e) {
  switch (e.type) {
    case 'stage': {
      clearInput(); camera = 0; particles = []; effects = []; trails = []; numbers = [];
      hitCount = 0; comboTime = 0; $('title-screen').hidden = true; $('touch-controls').hidden = false; $('objective').hidden = false;
      $('stage-number').textContent = `${roman[e.stage]} — V`; $('stage-name').textContent = t(`stage.${e.stage}.name`);
      const announcement = $('stage-announcement');
      announcement.querySelector('small').textContent = t('decor.announce', { stage: roman[e.stage], name: t(`decor.stage.${e.stage}`) });
      announcement.querySelector('strong').textContent = t(`stage.${e.stage}.name`);
      announcement.querySelector('span').textContent = t(`stage.${e.stage}.subtitle`);
      announcement.classList.add('show'); announceTime = 2.8;
      [...$('stage-dots').children].forEach((dot, i) => { dot.className = i === e.stage ? 'current' : i < e.stage ? 'done' : ''; });
      [...$('journey-stages').children].forEach((item, i) => { item.className = i === e.stage ? 'active' : i < e.stage ? 'done' : ''; });
      $('relic-tray').innerHTML = relicTray();
      records.best = Math.max(records.best, e.stage + 1); save('nocturne-records', records); updateBest();
      audio.play(e.stage ? 'portal' : 'ui');
      break;
    }
    case 'swing': audio.play('swing', e.combo === 3 ? 1.2 : .75); break;
    case 'hit':
      audio.play(e.crit ? 'crit' : 'hit', e.heavy ? 1.15 : .8);
      rumble(e.crit || e.heavy ? 6 : 3, e.heavy ? .16 : .1);
      if (e.crit && settings.shake) whiteFlash = .045;
      burst(e.x, e.y, e.crit ? '#ffe8a6' : '#e2bb80', e.heavy ? 22 : 12, e.heavy ? 240 : 180);
      burst(e.x, e.y, '#bf6078', 6, 100);
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .16, max: .16, dir: e.dir });
      flashNumber(e, e.crit ? '#fff0a9' : '#f0ddaa'); hitCount++; comboTime = 2.1;
      break;
    case 'kill':
      audio.play('kill', e.boss ? 1 : .65); burst(e.x, e.y, '#a78cc0', e.boss ? 42 : 20, e.boss ? 260 : 160);
      if (e.boss) { rumble(9, .4); toast(t('toast.bossDown')); }
      break;
    case 'hurt':
      audio.play('hurt'); damageFlash = .3; rumble(7, .22); hitCount = 0; comboTime = 0;
      flashNumber({ ...e, amount: `−${e.amount}` }, '#ed7e88'); burst(e.x, e.y, '#a93959', 16, 170); break;
    case 'jump': audio.play('jump', e.double ? .65 : .45); burst(e.x, e.y - 4, e.double ? '#b8adcf' : '#9a8c77', e.double ? 15 : 7, 75); break;
    case 'dash': audio.play('dash'); burst(e.x, e.y - 25, '#afa2cf', 10, 130); break;
    case 'magic':
      audio.play('magic'); rumble(5, .23); effects.push({ type: 'magic', x: e.x, y: e.y, life: .6, max: .6 }); burst(e.x, e.y, '#c5b6f4', 35, 290); break;
    case 'block': { // metal sparks kicked off the shield face toward the attacker
      e = { ...e, x: e.x + e.dir * 13 }; // core sends the body edge; the drawn shield face sits 13 px further out
      audio.play('block'); rumble(2, .07); flashNumber(e, '#9aa3b5');
      burst(e.x, e.y, '#ffe6a0', 10, 170, e.dir); burst(e.x, e.y, '#cfd6e6', 5, 120, e.dir);
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .1, max: .1, dir: e.dir });
      break;
    }
    case 'guardBreak':
      audio.play('guardBreak'); rumble(8, .26); if (settings.shake) whiteFlash = .06;
      burst(e.x, e.y, '#8e99a8', 10, 230, 0, 4); burst(e.x, e.y, '#d6b46a', 12, 260); burst(e.x, e.y, '#f4ecd6', 8, 150);
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .22, max: .22, dir: e.dir });
      break;
    case 'stagger':
      audio.play('stagger', e.boss ? 1.3 : 1); flashNumber({ ...e, amount: t('float.stagger') }, '#ffd36e'); rumble(e.boss ? 7 : 5, .18);
      burst(e.x, e.y, '#ffd36e', e.boss ? 26 : 16, 240); burst(e.x, e.y, '#fff0c0', 8, 150, 0, 3);
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .2, max: .2, dir: 0 });
      break;
    case 'enemySwing': if (e.kind === 'spear') audio.play('thrust'); effects.push({ type: 'enemySlash', x: e.x, y: e.y, dir: e.dir, life: .24, max: .24, boss: e.boss }); break;
    case 'enemyBuff': audio.play('bless', .8); break;
    case 'noMana': toast(t('toast.noMana')); break;
    case 'heal': flashNumber({ ...e, amount: `+${e.amount}` }, '#8cddb3'); burst(e.x, e.y + 20, '#82c9a3', 8, 75); break;
    case 'clear': audio.play('portal'); toast(t('toast.clear')); break;
    case 'upgrade': clearInput(); audio.play('upgrade'); openUpgrade(e.choices); break;
    case 'death': clearInput(); audio.play('death'); recordResult(false); openResult(false); break;
    case 'win': clearInput(); audio.play('win'); recordResult(true); openResult(true); break;
  }
}
function startRun() {
  closeModal(false); clearInput(); audio.unlock(); audio.resume();
  game = new Game(handleEvent); particles = []; effects = []; numbers = []; trails = [];
  shakeTime = 0; damageFlash = 0; whiteFlash = 0; records.runs++; save('nocturne-records', records);
  game.start();
}
function openModal(html, kind, pause = true) {
  if ($('modal').hidden) previousFocus = document.activeElement;
  if (pause && game.state === 'playing') { returnState = 'playing'; game.state = 'paused'; audio.suspend(); }
  clearInput(); modalKind = kind; $('modal-panel').innerHTML = html; $('modal').hidden = false;
  requestAnimationFrame(() => $('modal-panel').querySelector('button')?.focus({ preventScroll: true }));
}
function closeModal(resume = true) {
  if (resume && modalReturn) {
    const target = modalReturn; modalReturn = null;
    if (target === 'upgrade') openUpgrade(game.choices);
    else openResult(target === 'won');
    return;
  }
  modalReturn = null;
  $('modal').hidden = true; modalKind = '';
  if (resume && returnState === 'playing' && game.state === 'paused') { game.state = 'playing'; audio.resume(); }
  returnState = null; clearInput(); previousFocus?.focus?.({ preventScroll: true });
}
function openPause() {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  openModal(`<div class="modal-eyebrow">${t('decor.pause')}</div><h2 id="modal-title">${t('pause.title')}</h2><p>${t('pause.info', { stage: roman[game.stage], name: t(`stage.${game.stage}.name`), relics: game.relics.length })}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${icon('sword')}${t('pause.resume')}</button><button class="secondary-button" data-command="settings">${t('pause.settings')}</button><button class="secondary-button" data-command="help">${t('pause.help')}</button></div><button class="text-button" data-command="restart-confirm">${t('pause.abandon')}</button>`, 'pause');
}
function openSettings() {
  if (['upgrade', 'dead', 'won'].includes(modalKind)) modalReturn = modalKind;
  const list = ['sound', 'music', 'haptics', 'shake'];
  const languages = Object.entries(LANGUAGES).map(([code, name]) => `<button class="language-option" data-language="${code}" lang="${code}" aria-pressed="${settings.lang === code}">${name}</button>`).join('');
  openModal(`<div class="modal-eyebrow">${t('decor.settings')}</div><h2 id="modal-title">${t('settings.title')}</h2><div class="settings-list"><div class="setting"><div><strong>${t('settings.language')}</strong><small>${t('settings.languageDesc')}</small></div><div class="language-options" role="group" aria-label="${t('settings.language')}">${languages}</div></div>${list.map(id => `<div class="setting"><div><strong>${t(`settings.${id}`)}</strong><small>${t(`settings.${id}Desc`)}</small></div><button class="toggle" data-setting="${id}" aria-label="${t(`settings.${id}`)}" aria-pressed="${settings[id]}"></button></div>`).join('')}</div><p class="modal-footnote">${t('vibrate' in navigator ? 'settings.vibrateYes' : 'settings.vibrateNo')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('settings.back')}</button></div>`, 'settings');
}
function openHelp() {
  const items = [ ['wind', 'move'], ['jump', 'jump'], ['sword', 'combo'], ['wind', 'dash'], ['moon', 'magic'], ['gem', 'relics'] ];
  openModal(`<div class="modal-eyebrow">${t('decor.help')}</div><h2 id="modal-title">${t('help.title')}</h2><div class="help-grid">${items.map(([symbol, key]) => `<div class="help-item">${icon(symbol)}<strong>${t(`help.${key}`)}</strong><p>${t(`help.${key}Text`)}</p></div>`).join('')}</div><p class="modal-footnote">${t('help.footnote')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('help.ready')}</button></div>`, 'help');
}
function openUpgrade(choices) {
  openModal(`<div class="modal-eyebrow">${t('decor.upgrade', { stage: roman[game.stage] })}</div><h2 id="modal-title">${t('upgrade.title')}</h2><p>${t('upgrade.text')}</p><div class="relic-choices">${choices.map((r,i) => `<button class="relic-card" data-relic="${r.id}"><span class="card-number">0${i+1}</span>${icon(r.icon)}<small>${t(`relic.${r.id}.type`)}</small><strong>${t(`relic.${r.id}.name`)}</strong><p>${t(`relic.${r.id}.text`)}</p></button>`).join('')}</div><p class="modal-footnote">${t('upgrade.footnote')}</p>`, 'upgrade', false);
}
function duration(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
function openResult(win) {
  openModal(`${icon(win ? 'moon' : 'sword').replace('<svg ', '<svg class="result-icon" ')}<div class="modal-eyebrow">${t(win ? 'decor.win' : 'decor.lose')}</div><h2 id="modal-title">${t(win ? 'result.winTitle' : 'result.loseTitle')}</h2><p>${t(win ? 'result.winText' : 'result.loseText')}</p><div class="result-stats"><div><strong>${roman[game.stage]} / V</strong><span>${t('result.deepest')}</span></div><div><strong>${game.kills}</strong><span>${t('result.kills')}</span></div><div><strong>${duration(game.elapsed)}</strong><span>${t('result.time')}</span></div><div><strong>${game.relics.length}</strong><span>${t('result.relics')}</span></div></div><div class="modal-buttons"><button class="primary-button" data-command="restart">${icon('sword')}${t('result.again')}</button><button class="secondary-button" data-command="title">${t('result.title')}</button></div>`, win ? 'won' : 'dead', false);
}
function showTitle() {
  closeModal(false); game = new Game(handleEvent); camera = 0;
  $('title-screen').hidden = false; $('touch-controls').hidden = true; $('objective').hidden = true;
  $('boss-hud').hidden = true; $('relic-tray').innerHTML = ''; $('stage-announcement').classList.remove('show');
  $('stage-name').textContent = t('stage.0.name'); $('stage-number').textContent = 'I — V';
  [...$('stage-dots').children].forEach((e,i) => e.className = i === 0 ? 'current' : '');
  [...$('journey-stages').children].forEach((e,i) => e.className = i === 0 ? 'active' : '');
  particles = []; effects = []; trails = []; numbers = []; hitCount = 0; comboTime = 0;
  audio.suspend();
}

$('start-button').addEventListener('click', startRun);
$('help-button').addEventListener('click', openHelp);
$('settings-button').addEventListener('click', openSettings);
$('pause-button').addEventListener('click', () => { if (game.state === 'title') openHelp(); else if (game.state === 'paused') closeModal(); else openPause(); });
$('sound-button').addEventListener('click', () => { settings.sound = !settings.sound; applySettings(); if (game.state === 'playing') audio.unlock(); });
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); }
    else if (frame.classList.contains('fullscreen-fallback')) frame.classList.remove('fullscreen-fallback');
    else if (frame.requestFullscreen) { await frame.requestFullscreen(); try { await screen.orientation?.lock?.('landscape'); } catch { /* Optional mobile enhancement. */ } }
    else frame.classList.add('fullscreen-fallback');
  } catch { frame.classList.toggle('fullscreen-fallback'); }
});
$('modal').addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.language) {
    // Re-render the open settings panel in the new language without losing the modal it returns to.
    settings.lang = button.dataset.language; applyLanguage();
    const back = modalReturn; openSettings(); modalReturn = back;
    requestAnimationFrame(() => $('modal-panel').querySelector(`[data-language="${settings.lang}"]`)?.focus({ preventScroll: true }));
    return;
  }
  if (button.dataset.setting) { const key = button.dataset.setting; settings[key] = !settings[key]; button.setAttribute('aria-pressed', settings[key]); applySettings(); return; }
  if (button.dataset.relic) { const id = button.dataset.relic; if (game.state === 'upgrade' && game.choices.some(r => r.id === id)) { closeModal(false); audio.play('upgrade'); game.chooseRelic(id); } return; }
  switch (button.dataset.command) {
    case 'resume': closeModal(); break;
    case 'settings': openSettings(); break;
    case 'help': openHelp(); break;
    case 'restart': startRun(); break;
    case 'title': showTitle(); break;
    case 'restart-confirm': openModal(`<div class="modal-eyebrow">${t('decor.confirm')}</div><h2 id="modal-title">${t('confirm.title')}</h2><p>${t('confirm.text')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('pause.resume')}</button><button class="secondary-button" data-command="title">${t('result.title')}</button></div>`, 'confirm'); break;
  }
});
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if (!audio.context) audio.unlock(); press(button.dataset.control, `pointer-${e.pointerId}`); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => { e.preventDefault(); release(`pointer-${e.pointerId}`); });
  button.addEventListener('contextmenu', e => e.preventDefault());
});
window.addEventListener('keydown', e => {
  if (!$('modal').hidden) {
    if (e.code === 'Escape' && !['upgrade', 'dead', 'won'].includes(modalKind)) { e.preventDefault(); closeModal(); }
    if (e.code === 'Tab') {
      const buttons = [...$('modal-panel').querySelectorAll('button')];
      if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus(); }
    }
    if (modalKind === 'upgrade' && /^Digit[123]$/.test(e.code)) $('modal-panel').querySelectorAll('[data-relic]')[Number(e.code.slice(-1)) - 1]?.click();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); openPause(); return; }
  if (game.state === 'title' && e.code === 'Enter') { e.preventDefault(); startRun(); return; }
  if (keyControls[e.code]) { e.preventDefault(); if (!e.repeat) press(keyControls[e.code], e.code); }
});
window.addEventListener('keyup', e => release(e.code));
function autoPause() { clearInput(); if (game.state === 'playing') openPause(); audio.suspend(); }
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
function resizeCanvas() {
  clearInput();
  const bounds = frame.getBoundingClientRect();
  viewWidth = Math.round(Math.max(960, Math.min(1500, bounds.width / bounds.height * 540)));
  canvas.width = viewWidth;
}
window.addEventListener('resize', resizeCanvas);
document.addEventListener('fullscreenchange', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(frame);
window.addEventListener('pagehide', () => audio.suspend());

function updateHud() {
  const p = game.player;
  $('hp-text').innerHTML = `${Math.ceil(p.hp)} <em>/ ${p.maxHp}</em>`;
  $('hp-bar').style.width = `${p.hp / p.maxHp * 100}%`;
  $('mp-bar').style.width = `${p.mp / p.maxMp * 100}%`;
  $('mp-text').textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
  $('souls').textContent = game.souls;
  const remaining = game.enemies.filter(e => e.hp > 0).length;
  $('enemy-count').textContent = `${game.totalEnemies - remaining} / ${game.totalEnemies}`;
  $('objective-text').textContent = t(game.portalOpen ? 'objective.open' : 'objective.fight');
  const boss = game.enemies.find(e => e.type === 'boss' && e.hp > 0 && Math.abs(e.x - p.x) < 800);
  $('boss-hud').hidden = !boss || game.state === 'title';
  if (boss) $('boss-bar').style.width = `${boss.hp / boss.maxHp * 100}%`;
  document.querySelector('[data-control="magic"]').classList.toggle('unavailable', p.mp < p.magicCost);
  document.querySelector('[data-control="dash"]').classList.toggle('cooldown', p.dashCd > 0);
  $('combo-display').classList.toggle('show', hitCount > 1 && comboTime > 0 && game.state === 'playing');
  $('combo-display').querySelector('strong').textContent = hitCount;
}
function drawSlash(x, y, dir, progress, heavy = false, enemy = false) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
  ctx.globalAlpha = Math.max(0, Math.sin(progress * Math.PI));
  const radius = heavy ? 105 : 82;
  ctx.beginPath(); ctx.arc(7, -3, radius, -.95, 1.1); ctx.arc(3, -4, radius * .74, 1.1, -.95, true); ctx.closePath();
  ctx.fillStyle = enemy ? '#e7657577' : heavy ? '#d7c8ef99' : '#c7e2df88'; ctx.fill();
  ctx.beginPath(); ctx.arc(7, -3, radius - 2, -.75, .88); ctx.lineWidth = heavy ? 5 : 3; ctx.strokeStyle = enemy ? '#ef8990' : '#f6e7be'; ctx.stroke();
  ctx.beginPath(); ctx.arc(5, -4, radius * .84, -.5, .75); ctx.lineWidth = 2; ctx.strokeStyle = enemy ? '#fc9da4' : '#fffbee'; ctx.stroke();
  ctx.restore();
}
function drawEffects(dt) {
  for (const fx of effects) {
    const progress = 1 - fx.life / fx.max;
    if (fx.type === 'magic') {
      ctx.save(); ctx.translate(fx.x, fx.y); ctx.globalAlpha = (1 - progress) * .85;
      const radius = 28 + Math.sin(progress * Math.PI / 2) * 185;
      ctx.strokeStyle = '#ccb8fa'; ctx.lineWidth = 3 * (1 - progress) + 1; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8e73be'; ctx.lineWidth = 10 * (1 - progress); ctx.beginPath(); ctx.arc(0, 0, radius - 8, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + progress; ctx.fillStyle = '#f0e4ff'; ctx.fillRect(Math.cos(a) * radius - 2, Math.sin(a) * radius - 2, 4, 4); }
      ctx.restore();
    } else if (fx.type === 'impact') {
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = fx.life / fx.max;
      ctx.fillStyle = '#fff5cd'; ctx.beginPath(); ctx.moveTo(-24, -3); ctx.lineTo(-4,-6); ctx.lineTo(-2,-25); ctx.lineTo(3,-5); ctx.lineTo(28,0); ctx.lineTo(4,4); ctx.lineTo(0,21); ctx.lineTo(-4,5); ctx.closePath(); ctx.fill(); ctx.restore();
    } else drawSlash(fx.x, fx.y, fx.dir, progress, fx.boss, true);
    fx.life -= dt;
  }
  effects = effects.filter(e => e.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 330 * dt; p.life -= dt;
    ctx.globalAlpha = clamp(p.life / .2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1; particles = particles.filter(p => p.life > 0);
  for (const number of numbers) {
    number.y -= dt * 37; number.life -= dt; ctx.globalAlpha = Math.min(1, number.life * 3);
    ctx.font = `bold ${number.crit ? 23 : 16}px Georgia`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#13101b'; ctx.strokeText(number.text, number.x, number.y); ctx.fillStyle = number.color; ctx.fillText(number.text, number.x, number.y);
    if (number.crit) { ctx.font = '7px sans-serif'; ctx.fillText('CRITICAL', number.x, number.y - 22); }
  }
  ctx.globalAlpha = 1; numbers = numbers.filter(n => n.life > 0);
}
function render(dt) {
  const title = game.state === 'title', p = game.player;
  if (!title) camera += (clamp(p.x - viewWidth * .37, 0, game.worldWidth - viewWidth) - camera) * Math.min(1, dt * 7);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0d15'; ctx.fillRect(0, 0, viewWidth, 540);
  if (shakeTime > 0 && settings.shake) ctx.translate(Math.round((Math.random() - .5) * shakePower * 2), Math.round((Math.random() - .5) * shakePower));
  drawScene(ctx, { camera, width: viewWidth, height: 540, time: worldTime, stage: game.stage, platforms: game.platforms, worldWidth: game.worldWidth });
  ctx.save(); ctx.translate(-Math.round(camera), 0);
  if (title) {
    drawHero(ctx, { ...p, x: viewWidth * .68, y: FLOOR, invulnerable: 0, vx: 0, dir: 1 }, worldTime);
    drawEnemy(ctx, { ...game.enemies.find(e => e.type === 'skeleton'), x: viewWidth * .86, y: FLOOR, dir: -1, tell: 0 }, worldTime);
  } else {
    drawPortal(ctx, game.portalX, FLOOR, worldTime, game.portalOpen);
    for (const item of game.pickups) {
      const y = item.y + Math.sin(worldTime * 3) * 4;
      ctx.shadowColor = '#e35d83'; ctx.shadowBlur = 12; ctx.fillStyle = '#c9627f';
      ctx.beginPath(); ctx.moveTo(item.x, y+6); ctx.lineTo(item.x-7, y); ctx.lineTo(item.x-7,y-4); ctx.lineTo(item.x-3,y-7); ctx.lineTo(item.x,y-4); ctx.lineTo(item.x+3,y-7); ctx.lineTo(item.x+7,y-4);ctx.lineTo(item.x+7,y);ctx.fill();ctx.shadowBlur = 0;
    }
    for (const trail of trails) { ctx.globalAlpha = trail.life * 2.5; drawHero(ctx, trail, worldTime); trail.life -= dt; }
    ctx.globalAlpha = 1; trails = trails.filter(t => t.life > 0);
    for (const e of game.enemies) {
      if (e.hp <= 0 || e.x < camera - 150 || e.x > camera + viewWidth + 150) continue;
      drawEnemy(ctx, e, worldTime);
      if (e.type !== 'boss' && e.hp < e.maxHp) {
        const barY = e.y - e.h - (e.type === 'knight' ? 29 : (e.type === 'mage' || e.type === 'priest') ? 17 : e.type === 'shield' ? 21 : 9);
        ctx.fillStyle = '#13111b'; ctx.fillRect(Math.round(e.x - 18), Math.round(barY), 36, 4); ctx.fillStyle = '#b75a66'; ctx.fillRect(Math.round(e.x - 17), Math.round(barY + 1), Math.max(0, 34 * e.hp / e.maxHp), 2);
      }
      if (e.maxPoise && e.poise < e.maxPoise && (e.type === 'knight' || e.type === 'shield' || e.type === 'boss')) {
        const bw = e.type === 'boss' ? 56 : 30, by = Math.round(e.y + 5);
        ctx.fillStyle = '#13111b'; ctx.fillRect(Math.round(e.x - bw / 2), by, bw, 3); ctx.fillStyle = e.punishable ? '#ffd36e' : '#c9a85a'; ctx.fillRect(Math.round(e.x - bw / 2 + 1), by + 1, Math.max(0, Math.round((bw - 2) * e.poise / e.maxPoise)), 1);
      }
      if (e.stun > .45 && e.hp > 0) { // stagger stun (flinches are <= .42 s): ring of gold stars over the head
        const ry = Math.round(e.y - e.h - 6), rw = e.type === 'boss' ? 26 : 16; ctx.fillStyle = '#ffd36e';
        for (let i = 0; i < 4; i++) { const a = worldTime * 6 + i * Math.PI / 2; ctx.fillRect(Math.round(e.x + Math.cos(a) * rw) - 2, Math.round(ry + Math.sin(a) * 4) - 2, 4, 4); }
      }
      if (e.tell > 0) { ctx.textAlign = 'center'; ctx.font = 'bold 15px Georgia'; const bx = Math.round(e.x), by2 = Math.round(e.y - e.h - (e.type === 'shield' ? 25 : 15)); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#13111b'; ctx.strokeText('!', bx, by2); ctx.fillStyle = e.punishable ? '#ffd36e' : '#f4ae84'; ctx.fillText('!', bx, by2); ctx.lineWidth = 1; }
    }
    if (game.state !== 'dead' || Math.sin(worldTime * 7) > 0) drawHero(ctx, p, worldTime);
    if (p.attack > 0) drawSlash(p.x, p.y - 33, p.dir, 1 - p.attack / .24, p.combo === 3);
    for (const b of game.projectiles) {
      ctx.shadowColor = '#d46ea3'; ctx.shadowBlur = 14; ctx.fillStyle = '#ca6a9c'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffe0e7'; ctx.fillRect(Math.round(b.x - 2), Math.round(b.y - 2), 4, 4);
    }
  }
  drawEffects(dt); ctx.restore();
  if (damageFlash > 0) { ctx.fillStyle = `rgba(144,27,50,${damageFlash * .65})`; ctx.fillRect(0, 0, viewWidth, 540); }
  if (whiteFlash > 0) { ctx.fillStyle = `rgba(255,232,193,${whiteFlash * 3})`; ctx.fillRect(0, 0, viewWidth, 540); }
  ctx.restore();
}
let hudTimer = 0;
function tick(now) {
  const dt = Math.min((now - (lastTime || now)) / 1000, 1 / 30); lastTime = now; worldTime += dt;
  const input = getInput(), consume = game.state === 'playing' && game.freeze <= 0;
  game.update(dt, input);
  if (consume) for (const control of impulseControls) if (input[control]) buffered.delete(control);
  if (game.state === 'playing' && game.player.dash > 0) { trailTimer -= dt; if (trailTimer <= 0) { trails.push({ ...game.player, life: .24, invulnerable: 0 }); trailTimer = .035; } }
  shakeTime = Math.max(0, shakeTime - dt); if (!shakeTime) shakePower = 0;
  damageFlash = Math.max(0, damageFlash - dt); whiteFlash = Math.max(0, whiteFlash - dt);
  comboTime = Math.max(0, comboTime - dt); if (!comboTime) hitCount = 0;
  if (announceTime > 0) { announceTime -= dt; if (announceTime <= 0) $('stage-announcement').classList.remove('show'); }
  if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('toast').classList.remove('show'); }
  render(dt); hudTimer -= dt; if (hudTimer <= 0) { updateHud(); hudTimer = .08; }
  requestAnimationFrame(tick);
}
game = new Game(handleEvent); applyLanguage(); updateHud(); requestAnimationFrame(tick);
// Opt-in test handle: absent in normal play; useful for deterministic browser smoke checks.
if (new URLSearchParams(location.search).has('test')) window.__nocturne = { get game() { return game; }, audio, settings, startRun, clearInput };