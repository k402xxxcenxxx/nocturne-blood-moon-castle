import { Game, STAGES, RELICS, FLOOR, clamp } from './core.js';
import { drawScene, drawHero, drawEnemy, drawPortal } from './art.js';
import { AudioSystem } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
const frame = $('game-frame'), audio = new AudioSystem();
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const roman = ['I', 'II', 'III', 'IV', 'V'];
function readSaved(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can disable storage. The run still works. */ } }
const storedSettings = readSaved('nocturne-settings', {});
const settings = { sound: true, music: true, haptics: true, shake: !matchMedia('(prefers-reduced-motion: reduce)').matches, ...storedSettings };
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
  $('sound-button').setAttribute('aria-label', settings.sound ? '關閉聲音' : '開啟聲音');
  frame.classList.toggle('reduced-motion', !settings.shake);
  save('nocturne-settings', settings);
}
function updateBest() { $('best-label').textContent = records.best ? `最深夜境 ${roman[Math.min(records.best, 5) - 1]} / V · 完成 ${records.wins} 次遠征` : '五重夜境 · 一次命運'; }
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
function burst(x, y, color, count = 12, power = 150) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = power * (.25 + Math.random());
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: .25 + Math.random() * .4, max: .65, color, size: Math.random() > .7 ? 3 : 2 });
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
      $('stage-number').textContent = `${roman[e.stage]} — V`; $('stage-name').textContent = STAGES[e.stage].name;
      const announcement = $('stage-announcement');
      announcement.querySelector('small').textContent = `CHAPTER ${roman[e.stage]} · ${STAGES[e.stage].en}`;
      announcement.querySelector('strong').textContent = STAGES[e.stage].name;
      announcement.querySelector('span').textContent = STAGES[e.stage].subtitle;
      announcement.classList.add('show'); announceTime = 2.8;
      [...$('stage-dots').children].forEach((dot, i) => { dot.className = i === e.stage ? 'current' : i < e.stage ? 'done' : ''; });
      [...$('journey-stages').children].forEach((item, i) => { item.className = i === e.stage ? 'active' : i < e.stage ? 'done' : ''; });
      $('relic-tray').innerHTML = game.relics.map(id => { const r = RELICS.find(r => r.id === id); return `<span class="relic-icon" title="${r.name}：${r.text}">${icon(r.icon)}</span>`; }).join('');
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
      if (e.boss) { rumble(9, .4); toast('墮落之王已隕落 · 前往月之門'); }
      break;
    case 'hurt':
      audio.play('hurt'); damageFlash = .3; rumble(7, .22); hitCount = 0; comboTime = 0;
      flashNumber({ ...e, amount: `−${e.amount}` }, '#ed7e88'); burst(e.x, e.y, '#a93959', 16, 170); break;
    case 'jump': audio.play('jump', e.double ? .65 : .45); burst(e.x, e.y - 4, e.double ? '#b8adcf' : '#9a8c77', e.double ? 15 : 7, 75); break;
    case 'dash': audio.play('dash'); burst(e.x, e.y - 25, '#afa2cf', 10, 130); break;
    case 'magic':
      audio.play('magic'); rumble(5, .23); effects.push({ type: 'magic', x: e.x, y: e.y, life: .6, max: .6 }); burst(e.x, e.y, '#c5b6f4', 35, 290); break;
    case 'enemySwing': effects.push({ type: 'enemySlash', x: e.x, y: e.y, dir: e.dir, life: .24, max: .24, boss: e.boss }); break;
    case 'noMana': toast('魔力不足 · 稍候恢復，或擊殺敵人汲取魔力'); break;
    case 'heal': flashNumber({ ...e, amount: `+${e.amount}` }, '#8cddb3'); burst(e.x, e.y + 20, '#82c9a3', 8, 75); break;
    case 'clear': audio.play('portal'); toast('守衛已盡數擊敗 · 向右進入月之門 →'); break;
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
  openModal(`<div class="modal-eyebrow">A MOMENT IN THE DARK</div><h2 id="modal-title">讓黑夜稍候</h2><p>第 ${roman[game.stage]} 夜 · ${STAGES[game.stage].name} · 聖物 ${game.relics.length} 件</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${icon('sword')}繼續遠征</button><button class="secondary-button" data-command="settings">遊戲設定</button><button class="secondary-button" data-command="help">操作指南</button></div><button class="text-button" data-command="restart-confirm">放棄本次遠征</button>`, 'pause');
}
function openSettings() {
  if (['upgrade', 'dead', 'won'].includes(modalKind)) modalReturn = modalKind;
  const list = [ ['sound', '遊戲聲音', '劍刃、命中與環境音效'], ['music', '夜境配樂', '原創暗黑管風琴'], ['haptics', '震動回饋', '支援震動 API 的手機瀏覽器'], ['shake', '打擊震動與閃光', '關閉可減少畫面晃動'] ];
  openModal(`<div class="modal-eyebrow">YOUR NIGHT, YOUR WAY</div><h2 id="modal-title">夜境設定</h2><div class="settings-list">${list.map(([id,name,desc]) => `<div class="setting"><div><strong>${name}</strong><small>${desc}</small></div><button class="toggle" data-setting="${id}" aria-label="${name}" aria-pressed="${settings[id]}"></button></div>`).join('')}</div><p class="modal-footnote">${'vibrate' in navigator ? '震動效果依裝置與瀏覽器支援而異。' : '此瀏覽器不支援震動，音效與視覺回饋仍可正常使用。'}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">返回夜境</button></div>`, 'settings');
}
function openHelp() {
  const items = [ ['wind', '移動', '<kbd>A</kbd> <kbd>D</kbd> 或 ← →<br>手機：按住左下方向鍵'], ['jump', '二段跳', '<kbd>SPACE</kbd> / W / ↑<br>空中再次輕點可二段跳'], ['sword', '三段連斬', '<kbd>J</kbd> / Z，長按連斬<br>第三擊範圍更大、擊退更強'], ['wind', '無敵衝刺', '<kbd>K</kbd> / SHIFT / X<br>穿過攻擊，冷卻後可再施放'], ['moon', '月蝕魔法', '<kbd>L</kbd> / C，消耗 35 MP<br>範圍傷害並消除附近飛彈'], ['gem', '隨機聖物', '擊敗所有守衛，向右進門<br>三選一強化，並恢復 20 HP'] ];
  openModal(`<div class="modal-eyebrow">THE NIGHTWALKER'S GUIDE</div><h2 id="modal-title">以劍刃，穿越黑夜</h2><div class="help-grid">${items.map(([symbol,name,text]) => `<div class="help-item">${icon(symbol)}<strong>${name}</strong><p>${text}</p></div>`).join('')}</div><p class="modal-footnote">五關一輪 · 第五關迎戰墮落之王 · 死亡後本輪聖物重置<br>手機支援多指操作，橫向與全螢幕遊玩效果最佳。</p><div class="modal-buttons"><button class="primary-button" data-command="resume">已準備好</button></div>`, 'help');
}
function openUpgrade(choices) {
  openModal(`<div class="modal-eyebrow">CHAPTER ${roman[game.stage]} COMPLETE</div><h2 id="modal-title">黑夜的饋贈</h2><p>選擇一件聖物。讓命運，在你的劍鋒上改寫。</p><div class="relic-choices">${choices.map((r,i) => `<button class="relic-card" data-relic="${r.id}"><span class="card-number">0${i+1}</span>${icon(r.icon)}<small>${r.type}</small><strong>${r.name}</strong><p>${r.text}</p></button>`).join('')}</div><p class="modal-footnote">獲得聖物後，恢復 20 點生命與全部魔力 · 效果持續至本輪結束</p>`, 'upgrade', false);
}
function duration(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
function openResult(win) {
  openModal(`${icon(win ? 'moon' : 'sword').replace('<svg ', '<svg class="result-icon" ')}<div class="modal-eyebrow">${win ? 'THE DAWN IS YOURS' : 'THE NIGHT REMEMBERS'}</div><h2 id="modal-title">${win ? '黎明，終於降臨' : '今夜，止步於此'}</h2><p>${win ? '墮落之王已隕落。你走過五重夜境，將黎明帶回這座城。' : '黑夜收下了你的足跡。下一次遠征，將是全新的命運。'}</p><div class="result-stats"><div><strong>${roman[game.stage]} / V</strong><span>最深夜境</span></div><div><strong>${game.kills}</strong><span>擊敗敵人</span></div><div><strong>${duration(game.elapsed)}</strong><span>遠征時間</span></div><div><strong>${game.relics.length}</strong><span>獲得聖物</span></div></div><div class="modal-buttons"><button class="primary-button" data-command="restart">${icon('sword')}再次遠征</button><button class="secondary-button" data-command="title">返回主畫面</button></div>`, win ? 'won' : 'dead', false);
}
function showTitle() {
  closeModal(false); game = new Game(handleEvent); camera = 0;
  $('title-screen').hidden = false; $('touch-controls').hidden = true; $('objective').hidden = true;
  $('boss-hud').hidden = true; $('relic-tray').innerHTML = ''; $('stage-announcement').classList.remove('show');
  $('stage-name').textContent = STAGES[0].name; $('stage-number').textContent = 'I — V';
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
  if (button.dataset.setting) { const key = button.dataset.setting; settings[key] = !settings[key]; button.setAttribute('aria-pressed', settings[key]); applySettings(); return; }
  if (button.dataset.relic) { const id = button.dataset.relic; if (game.state === 'upgrade' && game.choices.some(r => r.id === id)) { closeModal(false); audio.play('upgrade'); game.chooseRelic(id); } return; }
  switch (button.dataset.command) {
    case 'resume': closeModal(); break;
    case 'settings': openSettings(); break;
    case 'help': openHelp(); break;
    case 'restart': startRun(); break;
    case 'title': showTitle(); break;
    case 'restart-confirm': openModal(`<div class="modal-eyebrow">LEAVE THIS EXPEDITION</div><h2 id="modal-title">讓這段遠征落幕？</h2><p>本輪進度與聖物將重置，最佳紀錄仍會保留。</p><div class="modal-buttons"><button class="primary-button" data-command="resume">繼續遠征</button><button class="secondary-button" data-command="title">返回主畫面</button></div>`, 'confirm'); break;
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
  $('objective-text').textContent = game.portalOpen ? '月之門已開啟 · 向右前進 →' : '擊敗守衛，開啟月之門';
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
        const barY = e.y - e.h - (e.type === 'knight' ? 29 : e.type === 'mage' ? 17 : 9);
        ctx.fillStyle = '#13111b'; ctx.fillRect(Math.round(e.x - 18), Math.round(barY), 36, 4); ctx.fillStyle = '#b75a66'; ctx.fillRect(Math.round(e.x - 17), Math.round(barY + 1), Math.max(0, 34 * e.hp / e.maxHp), 2);
      }
      if (e.tell > 0) { ctx.textAlign = 'center'; ctx.font = 'bold 15px Georgia'; ctx.fillStyle = '#f4ae84'; ctx.fillText('!', Math.round(e.x), Math.round(e.y - e.h - 15)); }
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
applySettings(); updateBest(); game = new Game(handleEvent); updateHud(); requestAnimationFrame(tick);
// Opt-in test handle: absent in normal play; useful for deterministic browser smoke checks.
if (new URLSearchParams(location.search).has('test')) window.__nocturne = { get game() { return game; }, audio, settings, startRun, clearInput };