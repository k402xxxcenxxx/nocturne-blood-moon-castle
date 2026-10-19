import { Game, RELICS, FLOOR, clamp, WEAPONS, BLOOD_MAX, BLOOD_HALF, SKILL_COST, SKILL_MIN, SWING_COST, HEAVY_DAMAGE } from './core.js';
import { drawScene, drawHero, drawEnemy, drawAffixIcon, drawStatus, drawPortal, drawTrap, drawObstacle, drawChest } from './art.js';
import { AudioSystem } from './audio.js';
import { createBot, chooseWeapon, chooseRelic } from './bot.js';
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
const records = { runs: 0, wins: 0, best: 0, bestFloor: 0, ...readSaved('nocturne-records', {}) };
let game, camera = 0, viewWidth = 960, worldTime = 0, lastTime = 0, particles = [], effects = [], numbers = [], trails = [];
let phaseTime = 0, dustTimer = 0, shakeTime = 0, shakePower = 0, damageFlash = 0, whiteFlash = 0, silverFlash = 0, hitCount = 0, comboTime = 0;
let announceTime = 0, roomTime = 0, toastTime = 0, trailTimer = 0, returnState = null, modalKind = '', modalReturn = null, previousFocus = null;
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
const endlessUnlocked = () => records.wins >= 1;
const stageLabel = (stage, floor = game.floor) => game.mode === 'castle' ? t('hud.floorOf', { n: floor, total: 10 }) : game.mode === 'endless' ? t('hud.floor', { n: floor }) : `${roman[stage]} — V`;
function updateBest() {
  const eb = $('endless-button'), on = endlessUnlocked(); eb.setAttribute('aria-disabled', String(!on)); eb.querySelector('span').textContent = t(on ? 'title.endlessHint' : 'title.endlessLocked'); eb.querySelector('em').textContent = on && records.bestFloor ? t('title.endlessBest', { n: records.bestFloor }) : ''; $('best-label').textContent = records.best ? t('best.record', { stage: roman[Math.min(records.best, 5) - 1], wins: records.wins }) : t('best.none'); }
function relicTray() { return game.relics.map(id => { const r = RELICS.find(x => x.id === id); return `<span class="relic-icon"${r.cursed ? ' data-cursed' : ''} title="${t(`relic.${id}.name`)}: ${t(`relic.${id}.text`)}${r.cursed ? ` ${t('upgrade.cost')}: ${t(`relic.${id}.cost`)}` : ''}">${icon(r.icon)}</span>`; }).join(''); }
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
// Test-mode AI player (#52): only with ?test. While on, every player input except the toggle is ignored.
const testMode = new URLSearchParams(location.search).has('test');
let ai = null, aiModalT = 0;
function toggleAI() {
  if (!testMode) return;
  ai = ai ? null : createBot(); aiModalT = .7; clearInput();
  $('ai-toggle').setAttribute('aria-pressed', String(!!ai));
}
function aiModal(dt) { // the modals are DOM: click the card the bot picked, so the normal handler applies it
  if ($('modal').hidden) { aiModalT = .7; return; }
  if ((aiModalT -= dt) > 0) return;
  const panel = $('modal-panel');
  if (modalKind === 'vigil') panel.querySelector(`[data-weapon="${chooseWeapon(game)}"]`)?.click();
  else if (modalKind === 'upgrade') panel.querySelector(`[data-relic="${chooseRelic(game, game.choices).id}"]`)?.click();
  else if (['pause', 'settings', 'help', 'confirm'].includes(modalKind)) panel.querySelector('[data-command="resume"]')?.click(); // auto-pause on focus loss: resume through the UI
  else if (modalKind === 'dead' && game.mode === 'castle') panel.querySelector('[data-command="restart"]')?.click();
  aiModalT = .7;
}
function press(control, source) {
  if (ai || game.state !== 'playing') return;
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
const lastWard = new WeakMap(); // enemy -> ward value last frame
function toast(message) { $('toast').textContent = message; toastTime = 2.6; $('toast').classList.add('show'); }
function burst(x, y, color, count = 12, power = 150, dir = 0, size = 0) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = power * (.25 + Math.random());
    particles.push({ x, y, vx: Math.cos(angle) * speed + dir * power * .7, vy: Math.sin(angle) * speed - 30, life: .25 + Math.random() * .4, max: .65, color, size: size || (Math.random() > .7 ? 3 : 2) });
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);
}
const WARD_COLOR = '#9fd0ff';
const bannerQueue = []; // top banners (room names, elite sightings) wait for the stage announcement and each other
function flashNumber(e, color = '#f0ddaa') { numbers.push({ x: e.x + Math.random() * 12 - 6, y: e.y - 6, text: String(e.amount), life: .85, crit: e.crit, size: e.size, color }); }
function rumble(power, duration = .15) { if (settings.shake) { shakePower = Math.max(shakePower, power); shakeTime = duration; } }
function recordResult(win) { if (game.mode === 'castle') return; if (game.mode === 'endless') records.bestFloor = Math.max(records.bestFloor, game.floor); else { records.best = Math.max(records.best, game.stage + 1); if (win) records.wins++; } save('nocturne-records', records); updateBest(); }
function handleEvent(e) {
  switch (e.type) {
    case 'stage': {
      clearInput(); camera = 0; particles = []; effects = []; trails = []; numbers = [];
      hitCount = 0; comboTime = 0; $('title-screen').hidden = true; $('touch-controls').hidden = false; $('objective').hidden = false;
      $('stage-number').textContent = stageLabel(e.stage, e.floor); $('stage-name').textContent = t(`stage.${e.stage}.name`);
      const announcement = $('stage-announcement');
      announcement.querySelector('small').textContent = t('decor.announce', { stage: e.mode === 'endless' ? e.floor : roman[e.stage], name: t(`decor.stage.${e.stage}`) });
      announcement.querySelector('strong').textContent = t(`stage.${e.stage}.name`);
      announcement.querySelector('span').textContent = t(`stage.${e.stage}.subtitle`);
      announcement.classList.add('show'); announceTime = 2.8;
      [...$('stage-dots').children].forEach((dot, i) => { dot.className = i === e.stage ? 'current' : i < e.stage ? 'done' : ''; });
      [...$('journey-stages').children].forEach((item, i) => { item.className = i === e.stage ? 'active' : i < e.stage ? 'done' : ''; });
      $('relic-tray').innerHTML = relicTray();
      if (e.mode === 'castle') { /* castle records come in step 3 */ } else if (e.mode === 'endless') records.bestFloor = Math.max(records.bestFloor, e.floor); else records.best = Math.max(records.best, e.stage + 1);
      save('nocturne-records', records); updateBest();
      audio.setIntensity(1); audio.play(e.stage ? 'portal' : 'ui');
      break;
    }
    case 'swing': if (e.cost > 0 && settings.shake) $('blood-meter').animate([{ filter: 'brightness(2.2)' }, { filter: 'none' }], 200); // swing cost tick
      if (e.move === 'plunge') audio.play('dive', .9); else if (e.move === 'thrust') audio.play('lunge'); else audio.play('swing', e.combo === 3 ? 1.2 : .75); break;
    case 'hit':
      audio.play(e.crit ? 'crit' : 'hit', e.heavy ? 1.15 : .8);
      if (e.punish) audio.play('guardBreak', .9); // opening punished
      rumble(e.crit || e.heavy ? 6 : 3, e.heavy ? .16 : .1);
      if (e.crit && settings.shake) whiteFlash = .045;
      burst(e.x, e.y, e.crit ? '#ffe8a6' : '#e2bb80', e.heavy ? 22 : 12, e.heavy ? 240 : 180);
      burst(e.x, e.y, '#bf6078', 6, 100);
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .16, max: .16, dir: e.dir });
      if (e.absorbed > 0) numbers.push({ x: e.x + 18, y: e.y - 20, text: String(e.absorbed), life: .85, size: 12, color: WARD_COLOR });
      if (!(e.amount <= 0 && e.absorbed > 0)) flashNumber(e, e.crit ? '#fff0a9' : '#f0ddaa'); // ward ate everything: no "0"
      hitCount++; comboTime = 2.1;
      break;
    case 'kill':
      audio.play('kill', e.boss ? 1 : .65); burst(e.x, e.y, '#a78cc0', e.boss ? 42 : 20, e.boss ? 260 : 160);
      if (e.boss) { rumble(9, .4); toast(t('toast.bossDown')); }
      break;
    case 'eliteKill': lastEliteAffix = e.affix; // big purple burst, ring and shake
      audio.play('eliteKill', 1); burst(e.x, e.y, '#b48cf0', 48, 300); burst(e.x, e.y, '#efe2ff', 20, 200); rumble(8, .3);
      effects.push({ type: 'wardBreak', x: e.x, y: e.y, life: .5, max: .5, color: '#b48cf0', r: 150 }); break;
    case 'hurt':
      audio.play('hurt'); if (e.heavy) audio.play('heavyHit'); damageFlash = .3; rumble(7, .22); hitCount = 0; comboTime = 0;
      flashNumber({ ...e, amount: `−${e.amount}` }, '#ed7e88'); burst(e.x, e.y, '#a93959', 16, 170); break;
    case 'jump': audio.play('jump', e.double ? .65 : .45); burst(e.x, e.y - 4, e.double ? '#b8adcf' : '#9a8c77', e.double ? 15 : 7, 75); break;
    case 'perfectDash': audio.play('perfect'); trails.push({ ...game.player, life: .4, invulnerable: 0, silver: true }); if (settings.shake) silverFlash = .09; flashNumber({ ...e, y: e.y - 20, size: 23, amount: t('float.perfect') }, '#e8ecf8'); break;
    case 'dash': audio.play('dash'); burst(e.x, e.y - 25, '#afa2cf', 10, 130); break;
    case 'magic':
      if (game.stacks('vortex')) audio.play('vortex');
      audio.play('magic'); rumble(5, .23); effects.push({ type: 'magic', x: e.x, y: e.y, life: .6, max: .6 }); burst(e.x, e.y, '#c5b6f4', 35, 290);
      if (game.stacks('vortex')) effects.push({ type: 'vortex', x: e.x, y: e.y, radius: e.radius, life: .5, max: .5 });
      break;
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
    case 'shot': if (e.kind !== 'ground' || e.dir > 0) audio.play(e.kind === 'beam' ? 'beam' : e.kind === 'ground' ? 'groundWave' : 'crescent'); break; // both ground waves launch together: sound once, for the right-hand one
    case 'plunge':
      if (!e.radius) { audio.play('plunge', .5); burst(e.x, e.y - 2, '#b8adcf', 4, 70); break; } // short fall: no shockwave, so no ring
      audio.play('plunge', 1.1); rumble(5, .14);
      effects.push({ type: 'dust', x: e.x, y: e.y, radius: e.radius, life: .35, max: .35 });
      burst(e.x - e.radius * .8, e.y - 2, '#9a8c77', 5, 90, -1, 3); burst(e.x + e.radius * .8, e.y - 2, '#9a8c77', 5, 90, 1, 3); burst(e.x, e.y - 2, '#b8adcf', 8, 110);
      break;
    case 'stagger':
      audio.play('stagger', e.boss ? 1.3 : 1); flashNumber({ ...e, amount: t('float.stagger') }, '#ffd36e'); rumble(e.boss ? 7 : 5, .18);
      burst(e.x, e.y, '#ffd36e', e.boss ? 26 : 16, 240); burst(e.x, e.y, '#fff0c0', 8, 150, 0, 3);
      if (e.enemy) effects.push({ type: 'wardBreak', x: e.x, y: e.y - 30, life: .3, max: .3, color: '#ffd36e' }); // castle posture break: gold ring (the crack is drawn on the body)
      effects.push({ type: 'impact', x: e.x, y: e.y, life: .2, max: .2, dir: 0 });
      break;
    case 'bossPhase': // roar: darken the screen, pulse the moon red, burst of embers
      audio.play('roar', e.phase >= 3 ? 1.3 : 1); audio.setIntensity(e.phase);
      toast(t('boss.phase' + e.phase)); phaseTime = 1.6; rumble(10, .5);
      burst(e.x, e.y, '#e0584c', 34, 280); burst(e.x, e.y, '#ffd0a0', 12, 180, 0, 3);
      effects.push({ type: 'dust', x: e.x, y: FLOOR, radius: 300, life: .6, max: .6 });
      break;
    case 'enemyHeavy': audio.play('heavyWarn'); break;
    case 'enemyGlint': audio.play('glint'); burst(e.x, e.y, '#ffffff', 6, 120); break;
    case 'enemyTell': { // per-move cue; a tell from an enemy that does not hold an attack token plays 6 dB down
      const cue = { slash: 'tellSlash', stepcut: 'tellStepcut', bash: 'tellBash', counter: 'tellCounter' }[e.kind] || 'tellGeneric';
      audio.play(cue, game.tokens.some(h => h.type === e.enemy && Math.abs(h.x - e.x) < 2) ? 1 : .5); break;
    }
    case 'riposte': // heavier than a normal hit: white pop, gold ring and burst
      audio.play('riposte', 1); rumble(6, .14); if (settings.shake) whiteFlash = .05;
      burst(e.x, e.y, '#ffd36e', 22, 260); burst(e.x, e.y, '#ffffff', 8, 160, 0, 3);
      effects.push({ type: 'wardBreak', x: e.x, y: e.y, life: .25, max: .25, color: '#fff0b0', r: 90 }); break;
    case 'enemySwing':
      if (e.heavy) audio.play('heavyWhoosh'); else
      if (e.kind === 'spear') audio.play('thrust');
      else if (e.boss) { const s = { slash: 'bossSlash', slam: 'bossSlam', charge: 'bossCharge', volley: 'bossVolley', ritual: 'bossBurst' }[e.kind]; if (s) audio.play(s, .9); }
      if (!(e.heavy && (e.kind === 'rush' || e.kind === 'dive'))) effects.push({ type: 'enemySlash', x: e.x, y: e.y, dir: e.dir, life: e.heavy ? .36 : .24, max: e.heavy ? .36 : .24, boss: e.boss || e.heavy, big: e.heavy }); // rush and dive draw their own streak on the body
      if (e.heavy) rumble(6, .16); break;
    case 'reaction': {
      const col = { shatter: '#bfe8ff', bloodFlame: '#ff8a5c', chain: '#ffe97a' }[e.name];
      flashNumber({ ...e, y: e.y - 30, size: 22, amount: t('reaction.' + e.name) }, col);
      if (e.name === 'shatter') {
        const shards = []; for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, d = e.radius * (.35 + Math.random() * .65); shards.push({ a, d, s: 4 + (Math.random() * 6 | 0), r: Math.random() * 6 }); }
        effects.push({ type: 'shards', x: e.x, y: e.y, radius: e.radius, shards, life: .5, max: .5 }); rumble(5, .12);
        audio.play('shatter');
      } else if (e.name === 'bloodFlame') {
        effects.push({ type: 'flameCol', x: e.x, y: e.y, radius: e.radius, life: .6, max: .6 }); rumble(4, .12);
        audio.play('bloodFlame');
      } else {
        audio.play('chain');
        if (e.solo) burst(e.x, e.y, '#ffe97a', 12, 160, 0, 2); // no targets: a local spark on the zapped enemy
        for (const to of e.targets) {
          const pts = [[e.x, e.y]], n = 5, dx = to.x - e.x, dy = to.y - e.y, len = Math.hypot(dx, dy) || 1;
          for (let i = 1; i < n; i++) pts.push([e.x + dx * i / n - dy / len * (Math.random() - .5) * 26, e.y + dy * i / n + dx / len * (Math.random() - .5) * 26]);
          pts.push([to.x, to.y]); effects.push({ type: 'arc', pts, life: .22, max: .22 }); burst(to.x, to.y, '#ffe97a', 4, 90, 0, 2);
        }
      }
      break;
    }
    case 'status': if (e.name === 'frozen') audio.play('freeze'); break;
    case 'statusTick': { // merge rapid ticks from one source near one spot into a single small number
      if (e.source === 'burn' || e.source === 'bleed') audio.play('tick', e.source === 'burn' ? 1 : .8); // reactions have their own sound
      const col = { burn: '#ff9a3a', bleed: '#d8445a', shatter: '#bfe8ff', bloodFlame: '#ff8a5c', chain: '#ffe97a', frost: '#9fd8ff', shock: '#ffe97a' }[e.source] || '#c9c2d8';
      for (const [key, amount, color, dx] of [[e.source, e.amount, col, 0], [`${e.source}:ward`, e.absorbed, WARD_COLOR, 14]]) {
        if (!(amount > 0)) continue; // zero damage to HP shows only the ward number
        const n = numbers.find(o => o.tick === key && o.life > .45 && Math.abs(o.x - e.x - dx) < 26 && Math.abs(o.y - e.y) < 40);
        if (n) { n.sum += amount; n.text = String(n.sum); n.life = .7; }
        else if (numbers.filter(o => o.tick).length < 12) numbers.push({ x: e.x + dx + Math.random() * 10 - 5, y: e.y - 4 - dx, text: String(amount), sum: amount, tick: key, life: .7, size: 13, color, soft: true });
      }
      break;
    }
    case 'obstacleHit': audio.play(e.kind === 'altar' ? 'stoneHit' : 'woodHit', .6 + Math.min(e.amount || 0, 40) / 100); burst(e.x, e.y, e.kind === 'altar' ? '#a93959' : '#a8814f', 6, 110); break;
    case 'break': audio.play(e.kind === 'altar' ? 'altarShatter' : 'woodBreak'); rumble(4, .14); burst(e.x, e.y, e.kind === 'altar' ? '#c9627f' : '#a8814f', 22, 200); burst(e.x, e.y, '#6b5236', 10, 140, 0, 3);
      effects.push({ type: 'debris', x: e.x, y: FLOOR, altar: e.kind === 'altar', life: .9, max: .9, bits: Array.from({ length: 9 }, (_, i) => ({ a: -.4 - i * .3, d: 22 + (i * 37 % 30), s: 3 + i % 3 })) });
      if (e.traps) for (const id of e.traps) { const tr = game.traps[id]; if (tr) { effects.push({ type: 'snap', x: e.x, y: FLOOR - 2, x2: tr.x, life: .5, max: .5 }); burst(tr.x, FLOOR - 6, '#3a2a30', 8, 70, 0, 3); } } // linked glow lines snap and the traps die
      break;
    case 'trapWarn': if (Math.abs(e.x - game.player.x) < 600) audio.play('trapWarn'); break;
    case 'trapActive': if (Math.abs(e.x - game.player.x) < 600) audio.play(e.kind === 'pillar' ? 'pillarGush' : e.kind === 'gears' ? 'gearGrind' : 'spikeClang'); burst(e.x, e.y - e.h / 2, e.kind === 'pillar' ? '#c9627f' : '#cfd6e6', 6, 90); break;
    case 'enemyBuff': audio.play('bless', .8); break;
    case 'noMana': toast(t(game.mode === 'castle' ? 'toast.noBlood' : 'toast.noMana')); break;
    case 'frenzy': audio.play('frenzy', 1); audio.setHeartbeat(true); rumble(8, .3); toast(t('hud.frenzy')); burst(e.x, e.y - 30, '#e0584c', 30, 240); break; // placeholder feedback; vignette, aura and heartbeat belong to art and audio
    case 'frenzyEnd': audio.setHeartbeat(false); audio.play('frenzyEnd'); break;
    case 'rest': audio.setHeartbeat(false); $('title-screen').hidden = true; $('touch-controls').hidden = false; clearInput(); audio.play('vigil'); $('relic-tray').innerHTML = ''; openVigil(); break;
    case 'sliceEnd': audio.setHeartbeat(false); clearInput(); audio.play('win'); audio.setIntensity(1); openResult(true); break;
    case 'heal': flashNumber({ ...e, amount: `+${e.amount}` }, '#8cddb3'); burst(e.x, e.y + 20, '#82c9a3', 8, 75); break;
    case 'room': if (announceTime <= 0) showRoom(e.stage, e.index); break; // the stage announcement already names room 0; later rooms are shown when it ends (see tick)
    case 'chest': audio.play(e.kind === 'heal' ? 'chestHeal' : 'chestOpen', e.optional ? 1.25 : 1); burst(e.x, e.y - 14, e.kind === 'heal' ? '#82c9a3' : '#c5b6f4', 22, 170); if (e.optional) burst(e.x, e.y - 24, '#e0bd6a', 12, 120); break;
    case 'unseal': burst(e.x, e.y - 18, '#8f6be0', 18, 140); break;
    case 'guards': audio.play('guardDown', e.n === e.total ? 1.4 : .9); flashNumber({ x: game.player.x, y: game.player.y - 90, amount: t('hud.guards', { n: e.n, total: e.total }) }, '#e8d9a8'); break;
    case 'elite': audio.play('eliteDrone', 1); bannerQueue.push({ text: t(e.bonus ? 'hint.eliteBonus' : 'hint.elite', { affix: t(`affix.${e.affix}`) }), time: 3.6, elite: true }); break;
    case 'clear': audio.play('portal'); toast(t('toast.clear')); break;
    case 'upgrade': if (e.reason === 'start') { $('title-screen').hidden = true; $('touch-controls').hidden = false; syncGear(); } clearInput(); audio.play('upgrade'); openUpgrade(e.choices); break;
    case 'death': deathHeavy = !!e.heavy; audio.setHeartbeat(false); clearInput(); audio.play('death'); audio.setIntensity(1); recordResult(false); openResult(false); break;
    case 'win': audio.setHeartbeat(false); clearInput(); audio.play('win'); audio.setIntensity(1); recordResult(true); openResult(true); break;
  }
}
let startBestFloor = 0;
function startRun(mode = 'normal') {
  closeModal(false); clearInput(); audio.setHeartbeat(false); audio.unlock(); audio.resume();
  game = new Game(handleEvent, undefined, mode); resetHud(); bannerQueue.length = 0; lastRoomText = ''; particles = []; effects = []; numbers = []; trails = [];
  shakeTime = 0; phaseTime = 0; damageFlash = 0; whiteFlash = 0; startBestFloor = records.bestFloor; if (mode === 'normal') records.runs++; // an endless trial never touches normal-run progress
  save('nocturne-records', records);
  game.start();
  frame.scrollIntoView({ block: 'nearest' }); // the masthead pushes the frame's bottom off short desktop windows
}
// Drives the short-landscape settings gear (CSS .gear-on): only on title and the relic pick, never during play.
function syncGear() { document.body.classList.toggle('gear-on', !$('title-screen').hidden || (!$('modal').hidden && ['upgrade', 'vigil'].includes(modalKind))); }
function openModal(html, kind, pause = true) {
  if ($('modal').hidden) previousFocus = document.activeElement;
  if (pause && game.state === 'playing') { returnState = 'playing'; game.state = 'paused'; audio.suspend(); }
  clearInput(); modalKind = kind; $('modal-panel').dataset.kind = kind; $('modal-panel').innerHTML = html; $('modal').hidden = false; syncGear();
  requestAnimationFrame(() => $('modal-panel').querySelector('button')?.focus({ preventScroll: true }));
}
function closeModal(resume = true) {
  if (resume && modalReturn) {
    const target = modalReturn; modalReturn = null;
    if (target === 'upgrade') openUpgrade(game.choices);
    else if (target === 'vigil') openVigil();
    else openResult(target === 'won');
    return;
  }
  modalReturn = null;
  $('modal').hidden = true; modalKind = ''; syncGear();
  if (resume && returnState === 'playing' && game.state === 'paused') { game.state = 'playing'; audio.resume(); }
  returnState = null; clearInput(); previousFocus?.focus?.({ preventScroll: true });
}
const ELEMENTS = ['fire', 'frost', 'shock', 'bleed'];
function pauseRelics() {
  const counts = {}; game.relics.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const ids = Object.keys(counts);
  if (!ids.length) return `<p class="pause-relics-none">${t('pause.relicsNone')}</p>`;
  const syn = game.activeSynergies().map(s => `<li title="${t(s.key)}"><b>${t(`relic.${s.a}.name`)} + ${t(`relic.${s.b}.name`)}</b> ${t(s.key)}</li>`).join('');
  return `<ul class="pause-relics">${ids.map(id => { const r = RELICS.find(x => x.id === id); return `<li${ELEMENTS.includes(id) ? ` data-element="${id}"` : ''}${r.cursed ? ' data-cursed' : ''} title="${t(`relic.${id}.text`)}${r.cursed ? ` ${t('upgrade.cost')}: ${t(`relic.${id}.cost`)}` : ''}">${icon(r.icon)}<span>${t(`relic.${id}.name`)}</span>${counts[id] > 1 ? `<b>×${counts[id]}</b>` : ''}${r.cursed ? `<em class="pause-cost">${t(`relic.${id}.cost`)}</em>` : ''}</li>`; }).join('')}</ul>${syn ? `<ul class="pause-synergies" aria-label="${t('pause.synergies')}">${syn}</ul>` : ''}`;
}
function openPause() {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  openModal(`<div class="modal-eyebrow">${t('decor.pause')}</div><h2 id="modal-title">${t('pause.title')}</h2><p>${t(game.mode === 'endless' ? 'pause.infoEndless' : game.mode === 'castle' ? 'pause.infoCastle' : 'pause.info', { stage: roman[game.stage], n: game.floor, name: t(`stage.${game.stage}.name`), relics: game.relics.length })}</p>${pauseRelics()}<div class="modal-buttons"><button class="primary-button" data-command="resume">${icon('sword')}${t('pause.resume')}</button><button class="secondary-button" data-command="settings">${t('pause.settings')}</button><button class="secondary-button" data-command="help">${t('pause.help')}</button></div><button class="text-button" data-command="restart-confirm">${t('pause.abandon')}</button>`, 'pause');
}
function openSettings() {
  if (['upgrade', 'dead', 'won', 'vigil'].includes(modalKind)) modalReturn = modalKind;
  const list = ['sound', 'music', 'haptics', 'shake'];
  const languages = Object.entries(LANGUAGES).map(([code, name]) => `<button class="language-option" data-language="${code}" lang="${code}" aria-pressed="${settings.lang === code}">${name}</button>`).join('');
  openModal(`<div class="modal-eyebrow">${t('decor.settings')}</div><h2 id="modal-title">${t('settings.title')}</h2><div class="settings-list"><div class="setting"><div><strong>${t('settings.language')}</strong><small>${t('settings.languageDesc')}</small></div><div class="language-options" role="group" aria-label="${t('settings.language')}">${languages}</div></div>${list.map(id => `<div class="setting"><div><strong>${t(`settings.${id}`)}</strong><small>${t(`settings.${id}Desc`)}</small></div><button class="toggle" data-setting="${id}" aria-label="${t(`settings.${id}`)}" aria-pressed="${settings[id]}"></button></div>`).join('')}</div><p class="modal-footnote">${t('vibrate' in navigator ? 'settings.vibrateYes' : 'settings.vibrateNo')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('settings.back')}</button></div>`, 'settings');
}
function openHelp() {
  const castle = game.mode === 'castle' && game.state !== 'title';
  const items = [ ['wind', 'move'], ['jump', 'jump'], ['sword', 'combo'], ['wind', 'dash'], ['moon', castle ? 'castleMagic' : 'magic'], ['gem', castle ? 'castleBlood' : 'relics'], ...(castle ? [['drop', 'castleHeavy'], ['shield', 'castleArmor']] : []) ];
  openModal(`<div class="modal-eyebrow">${t('decor.help')}</div><h2 id="modal-title">${t('help.title')}</h2><div class="help-grid">${items.map(([symbol, key]) => `<div class="help-item">${icon(symbol)}<strong>${t(`help.${key}`)}</strong><p>${t(`help.${key}Text`, { cost: SWING_COST, damage: HEAVY_DAMAGE })}</p></div>`).join('')}</div><p class="modal-footnote">${t(castle ? 'help.castleFootnote' : 'help.footnote')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('help.ready')}</button></div>`, 'help');
}
function synergyLine(id) {
  const partners = game.synergyPartners(id);
  return partners.length ? `<em class="card-synergy">${partners.map(p => `<span><b>${t('upgrade.synergy', { name: t(`relic.${p.with}.name`) })}</b> — ${t(p.key)}</span>`).join('')}</em>` : '';
}
let deathHeavy = false; // the killing blow of the last death was a castle heavy
let lastEliteAffix = ''; // affix of the elite just slain; the 'elite' pick follows its event
function openUpgrade(choices) {
  openModal(`<div class="modal-eyebrow">${game.pickReason === 'start' ? t('decor.start') : game.pickReason === 'chest' ? t('decor.chest') : game.pickReason === 'elite' ? t('decor.elite', { affix: t(`affix.${lastEliteAffix}`).toUpperCase() }) : game.mode === 'endless' ? t('decor.floorCleared', { n: game.floor }) : t('decor.upgrade', { stage: roman[game.stage] })}</div><h2 id="modal-title">${t(game.pickReason === 'start' ? 'upgrade.start' : game.pickReason === 'chest' ? 'upgrade.chestTitle' : game.pickReason === 'elite' ? 'upgrade.eliteTitle' : 'upgrade.title')}</h2><p>${t('upgrade.text')}</p><div class="relic-choices">${choices.map((r,i) => `<button class="relic-card"${r.cursed ? ' data-cursed' : ''} data-relic="${r.id}"${game.synergyPartners(r.id).length ? ' data-synergy' : ''}${ELEMENTS.includes(r.id) ? ` data-element="${r.id}"` : ''}><span class="card-number">0${i+1}</span>${icon(r.icon)}<small>${t(`relic.${r.id}.type`)}</small><strong>${t(`relic.${r.id}.name`)}</strong><p>${t(`relic.${r.id}.text`)}</p>${r.cursed ? `<p class="card-cost"><b>${t('upgrade.cost')}</b> ${t(`relic.${r.id}.cost`)}</p>` : ''}${synergyLine(r.id)}</button>`).join('')}</div><p class="modal-footnote">${t(game.pickReason === 'start' ? 'upgrade.startFootnote' : game.pickReason === 'chest' ? 'upgrade.chestFootnote' : game.pickReason === 'elite' ? 'upgrade.eliteFootnote' : 'upgrade.footnote')}</p>`, 'upgrade', false);
}
function openVigil() { // rest point: one weapon card each, choosing one starts floor 1
  openModal(`<div class="modal-eyebrow">${t('rest.title')}</div><h2 id="modal-title">${t('rest.choose')}</h2><div class="relic-choices">${Object.keys(WEAPONS).map((id, i) => `<button class="relic-card" data-weapon="${id}"><span class="card-number">0${i + 1}</span>${icon('sword')}<strong>${t(`weapon.${id}.name`)}</strong><p>${t(`weapon.${id}.desc`)}</p><p class="card-cost">${t('weapon.stats', { damage: WEAPONS[id].damage, speed: Math.round(100 / WEAPONS[id].cd), reach: WEAPONS[id].reach })}</p></button>`).join('')}</div>`, 'vigil', false);
}
function duration(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
function openResult(win) {
  openModal(`${icon(win ? 'moon' : 'sword').replace('<svg ', '<svg class="result-icon" ')}<div class="modal-eyebrow">${t(win ? 'decor.win' : 'decor.lose')}</div><h2 id="modal-title">${t(game.mode === 'castle' && win ? 'castle.sliceTitle' : win ? 'result.winTitle' : 'result.loseTitle')}</h2><p>${game.mode === 'castle' ? t(win ? 'castle.sliceEnd' : deathHeavy ? 'castle.deadHeavy' : 'castle.dead') : t(win ? 'result.winText' : 'result.loseText')}${game.mode === 'endless' ? ` ${t('result.bestFloor', { n: records.bestFloor })}` : ''}</p>${game.mode === 'endless' && game.floor > startBestFloor ? `<p class="new-record">${t('result.newRecord')}</p>` : ''}<div class="result-stats"><div><strong>${game.mode === 'endless' ? game.floor : game.mode === 'castle' ? `${game.floor} / 10` : `${roman[game.stage]} / V`}</strong><span>${t(game.mode === 'endless' || game.mode === 'castle' ? 'result.floor' : 'result.deepest')}</span></div><div><strong>${game.kills}</strong><span>${t('result.kills')}</span></div><div><strong>${duration(game.elapsed)}</strong><span>${t('result.time')}</span></div><div><strong>${game.relics.length}</strong><span>${t('result.relics')}</span></div></div><div class="modal-buttons"><button class="primary-button" data-command="restart">${icon('sword')}${t(game.mode === 'castle' ? 'castle.toVigil' : 'result.again')}</button><button class="secondary-button" data-command="title">${t('result.title')}</button></div>`, win ? 'won' : 'dead', false);
}
// Puts the HUD back to a fresh run's stage I (shared by the title and 'Play again').
function resetHud() {
  camera = 0; $('boss-hud').hidden = true; $('relic-tray').innerHTML = ''; $('stage-announcement').classList.remove('show');
  $('stage-name').textContent = t('stage.0.name'); $('stage-number').textContent = stageLabel(0);
  [...$('stage-dots').children].forEach((e,i) => e.className = i === 0 ? 'current' : '');
  [...$('journey-stages').children].forEach((e,i) => e.className = i === 0 ? 'active' : '');
  hitCount = 0; comboTime = 0; updateHud();
}
function showTitle() {
  closeModal(false); game = new Game(handleEvent); resetHud();
  $('title-screen').hidden = false; syncGear(); $('touch-controls').hidden = true; $('objective').hidden = true;
  bannerQueue.length = 0; particles = []; effects = []; trails = []; numbers = [];
  audio.setHeartbeat(false); audio.suspend(); audio.setIntensity(1);
}

$('start-button').addEventListener('click', () => startRun());
$('endless-button').addEventListener('click', () => { if (endlessUnlocked()) startRun('endless'); });
$('castle-button').addEventListener('click', () => startRun('castle'));
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
  if (button.dataset.weapon) { if (game.state === 'rest' && game.setWeapon(button.dataset.weapon)) { closeModal(false); game.descend(); } return; }
  if (button.dataset.relic) { const id = button.dataset.relic; if (game.state === 'upgrade' && game.choices.some(r => r.id === id)) { closeModal(false); audio.resume(); audio.play(RELICS.find(r => r.id === id)?.cursed ? 'cursedPick' : 'upgrade'); game.chooseRelic(id); $('relic-tray').innerHTML = relicTray(); } return; }
  switch (button.dataset.command) {
    case 'resume': closeModal(); break;
    case 'settings': openSettings(); break;
    case 'help': openHelp(); break;
    case 'restart': if (game.mode === 'castle' && game.state === 'dead') { closeModal(false); game.enterRest(); } else startRun(game.mode); break; // castle death returns to the Vigil
    case 'title': showTitle(); break;
    case 'restart-confirm': openModal(`<div class="modal-eyebrow">${t('decor.confirm')}</div><h2 id="modal-title">${t('confirm.title')}</h2><p>${t('confirm.text')}</p><div class="modal-buttons"><button class="primary-button" data-command="resume">${t('pause.resume')}</button><button class="secondary-button" data-command="title">${t('result.title')}</button></div>`, 'confirm'); break;
  }
});
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if (!audio.context) audio.unlock(); press(button.dataset.control, `pointer-${e.pointerId}`); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => { e.preventDefault(); release(`pointer-${e.pointerId}`); });
  button.addEventListener('contextmenu', e => e.preventDefault());
});
// While the AI is on, real (trusted) pointer, click and key-release events are swallowed except on the toggle; the AI's own modal clicks are synthetic and pass.
if (testMode) for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'keyup']) window.addEventListener(type, e => {
  if (ai && e.isTrusted && !(e.target.closest?.('#ai-toggle') || (type === 'keyup' && e.code === 'KeyB'))) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
}, { capture: true, passive: false });
window.addEventListener('keydown', e => {
  if (testMode && e.code === 'KeyB') { e.preventDefault(); if (!e.repeat) toggleAI(); return; }
  if (ai) { if (/^(Enter|Space|Digit[123])$/.test(e.code)) e.preventDefault(); return; } // modal shortcuts, pause and game keys are all ignored
  if (!$('modal').hidden) {
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); return; } // a held Enter must not activate the focused modal button
    if (e.code === 'Escape' && !['upgrade', 'dead', 'won', 'vigil'].includes(modalKind)) { e.preventDefault(); closeModal(); }
    if (e.code === 'Tab') {
      const buttons = [...$('modal-panel').querySelectorAll('button')];
      if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus(); }
    }
    if (modalKind === 'upgrade' && /^Digit[123]$/.test(e.code)) $('modal-panel').querySelectorAll('[data-relic]')[Number(e.code.slice(-1)) - 1]?.click();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); openPause(); return; }
  if (game.state === 'title' && document.activeElement?.closest('button, a, [tabindex]')) return; // a focused title control handles Enter/Space itself
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

let lastRoomText = '';
function showRoom(stage, index) { for (let i = bannerQueue.length; i--;) if (bannerQueue[i].room !== undefined) bannerQueue.splice(i, 1); bannerQueue.push({ text: t(`room.${stage}.${index}`), time: 2.2, room: index }); }
function pumpBanner() {
  while (bannerQueue.length && bannerQueue[0].room !== undefined && bannerQueue[0].room !== game.roomIndex) bannerQueue.shift(); // stale room names from stepping back and forth
  if (announceTime > 0 || roomTime > 0 || !bannerQueue.length) return;
  const b = bannerQueue.shift(), el = $('room-banner');
  if (b.room !== undefined) { if (b.text === lastRoomText) return; lastRoomText = b.text; } // same room name twice in a row is noise
  el.textContent = b.text; el.classList.toggle('elite', !!b.elite); el.classList.add('show'); roomTime = b.time;
}
function updateHud() {
  const p = game.player;
  const castle = game.mode === 'castle'; // castle mode: the HP bar becomes the blood bar (notch at half, MP row shows the state)
  $('vitals').classList.toggle('castle', castle); $('vitals').classList.toggle('frenzy', castle && p.frenzy); $('vitals').classList.toggle('danger', castle && !p.frenzy && p.blood <= BLOOD_HALF); // danger: one heavy (100) kills
  if (castle) { const m = $('blood-meter'); m.style.setProperty('--split', `${Math.min(100, BLOOD_HALF / Math.max(1, p.blood) * 100)}%`); m.setAttribute('role', 'meter'); m.setAttribute('aria-label', t('hud.blood')); m.setAttribute('aria-valuemin', 0); m.setAttribute('aria-valuemax', BLOOD_MAX); m.setAttribute('aria-valuenow', Math.ceil(p.blood)); $('mp-name').textContent = t(p.frenzy ? 'hud.frenzy' : 'hud.blood'); $('mp-text').textContent = ''; }
  else { $('blood-meter').removeAttribute('role'); $('mp-name').textContent = 'MP'; }
  const magicLabel = document.querySelector('[data-control="magic"] span'), want = castle ? t('touch.magicCost', { n: SKILL_COST }) : t('touch.magicShort');
  if (magicLabel.textContent !== want) magicLabel.textContent = want;
  $('hp-text').innerHTML = castle ? `${Math.ceil(p.blood)} <em>/ ${BLOOD_MAX}</em>` : `${Math.ceil(p.hp)} <em>/ ${p.maxHp}</em>`;
  $('hp-bar').style.width = `${castle ? p.blood / BLOOD_MAX * 100 : p.hp / p.maxHp * 100}%`;
  $('mp-bar').style.width = `${p.mp / p.maxMp * 100}%`;
  if (!castle) $('mp-text').textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
  $('souls').textContent = game.souls;
  const guards = game.guardStatus();
  const bossStage = game.stage === 4; // only the king is required there, so no guard counter
  $('enemy-count').textContent = bossStage ? '' : t('hud.guards', { n: guards.n, total: guards.total });
  $('enemy-count').hidden = bossStage;
  $('objective-text').textContent = t(game.portalOpen ? 'objective.open' : bossStage ? 'objective.boss' : 'objective.fight');
  const boss = game.enemies.find(e => e.type === 'boss' && e.hp > 0 && Math.abs(e.x - p.x) < 800);
  $('boss-hud').hidden = !boss || game.state === 'title';
  if (boss) $('boss-bar').style.width = `${boss.hp / boss.maxHp * 100}%`;
  document.querySelector('[data-control="magic"]').classList.toggle('unavailable', castle ? p.blood < SKILL_MIN : !p.lunatic && p.mp < p.magicCost);
  for (const [c, cd, total] of [['magic', p.magicCd, p.magicCdMax], ['dash', p.dashCd, p.dashCooldown]]) { const b = document.querySelector(`[data-control="${c}"]`); b.classList.toggle('cooldown', cd > 0); b.style.setProperty('--cd', Math.min(1, Math.max(0, cd / total))); }
  $('combo-display').classList.toggle('show', hitCount > 1 && comboTime > 0 && game.state === 'playing');
  $('combo-display').querySelector('strong').textContent = hitCount;
}
const WEAPON_TINT = { heavy: '#ff9a6a', twin: '#b6e8ff', spear: '#e6d4ff' }; // placeholder trail tints per Vigil weapon
let auraG = null, vigG = null, vigW = 0; // frenzy gradients are built once; strength fades via globalAlpha
function auraGradient() { if (!auraG) { auraG = ctx.createRadialGradient(0, 0, 8, 0, 0, 70); auraG.addColorStop(0, 'rgba(255,70,70,.45)'); auraG.addColorStop(1, 'rgba(255,70,70,0)'); } return auraG; }
function vignetteGradient() { if (!vigG || vigW !== viewWidth) { vigW = viewWidth; vigG = ctx.createRadialGradient(viewWidth / 2, 270, 170, viewWidth / 2, 270, Math.hypot(viewWidth, 540) / 2); vigG.addColorStop(0, 'rgba(160,10,30,0)'); vigG.addColorStop(1, 'rgba(160,10,30,.55)'); } return vigG; }
function drawSlash(x, y, dir, progress, heavy = false, enemy = false, weapon = null, big = false) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
  ctx.globalAlpha = Math.max(0, Math.sin(progress * Math.PI));
  const radius = weapon === 'heavy' ? 118 : weapon === 'twin' ? 62 : big ? 135 : heavy ? 105 : 82, tint = WEAPON_TINT[weapon];
  if (weapon === 'twin') { // two short crossed arcs
    ctx.strokeStyle = tint; ctx.lineWidth = 3;
    for (const f of [1, -1]) { ctx.save(); ctx.scale(1, f); ctx.beginPath(); ctx.arc(7, -3, radius, -.95, .6); ctx.stroke(); ctx.restore(); }
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.arc(7, -3, radius, -.95, 1.1); ctx.arc(3, -4, radius * .74, 1.1, -.95, true); ctx.closePath();
  ctx.fillStyle = tint ? tint + '88' : enemy ? '#e7657577' : heavy ? '#d7c8ef99' : '#c7e2df88'; ctx.fill();
  ctx.beginPath(); ctx.arc(7, -3, radius - 2, -.75, .88); ctx.lineWidth = weapon === 'heavy' ? 8 : heavy ? 5 : 3; ctx.strokeStyle = enemy ? '#ef8990' : tint || '#f6e7be'; ctx.stroke();
  ctx.beginPath(); ctx.arc(5, -4, radius * .84, -.5, .75); ctx.lineWidth = 2; ctx.strokeStyle = enemy ? '#fc9da4' : '#fffbee'; ctx.stroke();
  ctx.restore();
}
function drawThrust(x, y, dir, progress, weapon = null) { // long thin trail covering the 155 px thrust reach
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
  const spear = weapon === 'spear', len = Math.round((spear ? 190 : 155) * Math.min(1, progress * 4 + .3));
  ctx.globalAlpha = Math.max(0, 1 - progress);
  ctx.fillStyle = spear ? WEAPON_TINT.spear + '88' : '#c7e2df88'; ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(len, 0); ctx.lineTo(8, 3); ctx.fill();
  ctx.fillStyle = '#fffbee'; ctx.fillRect(12, -1, len - 12, 2);
  ctx.restore();
}
function drawGroundWave(b) { // low floor ripple: rising crest at the front, trailing tail; the faint circle is the exact r hit area
  const d = Math.sign(b.vx) || 1, x = Math.round(b.x), y = Math.round(b.y), r = b.r, f = Math.sin(worldTime * 30) * 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
  ctx.strokeStyle = '#ff7a6a66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowColor = '#d4423a'; ctx.shadowBlur = 8; ctx.fillStyle = '#b8453f';
  ctx.beginPath(); ctx.moveTo(-46, r - 6); ctx.lineTo(-18, 2); ctx.lineTo(0, -r + 2 + f); ctx.lineTo(r, r - 6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd0b0'; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(0, -r + 2 + f); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9a8c77'; for (let i = 0; i < 4; i++) ctx.fillRect(-12 - i * 11, r - 9 - ((i * 7 + Math.round(worldTime * 20)) % 6), 3, 3); // dust trail
  ctx.restore();
}
function drawShot(s) { // sized to the hit radius s.r
  const x = Math.round(s.x), y = Math.round(s.y);
  ctx.save(); ctx.translate(x, y);
  if (s.kind === 'wave') { // pale crescent opening backward along the heading; cooler on the returning pass
    ctx.rotate(Math.atan2(s.vy, s.vx)); ctx.shadowColor = s.back ? '#9fb8ff' : '#e8e2ff'; ctx.shadowBlur = 8;
    ctx.fillStyle = s.back ? '#c4d2ff' : '#f2edff';
    ctx.beginPath(); ctx.arc(0, 0, s.r, -1.9, 1.9); ctx.arc(-s.r * .55, 0, s.r * .8, 1.5, -1.5, true); ctx.closePath(); ctx.fill();
  } else if (s.kind === 'beam') { // narrow star streak: faded tail behind a bright core 2r long
    const d = Math.sign(s.vx) || 1;
    ctx.shadowColor = '#fff3b0'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff3b066'; ctx.fillRect(d > 0 ? -s.r - 30 : s.r, -1, 30, 2);
    ctx.fillStyle = '#fffbe0'; ctx.fillRect(-s.r, -2, s.r * 2, 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(-1, -s.r * .6, 2, s.r * 1.2); ctx.fillRect(-s.r * .6, -1, s.r * 1.2, 2);
  } else { // ground: low ripple, two arcs, hit width 2r
    ctx.globalAlpha = Math.min(1, s.life / s.maxLife * 3 + .3); ctx.lineWidth = 2;
    // dome sits on the surface (s.y + s.r) and rises to the full hit height 2r, so it covers the hit circle
    ctx.shadowColor = '#ffe9b0'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffe9b030'; ctx.beginPath(); ctx.ellipse(0, s.r, s.r, s.r * 2, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff1c4'; ctx.beginPath(); ctx.ellipse(0, s.r, s.r, s.r * 2, 0, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#d9c9a0'; ctx.beginPath(); ctx.ellipse(0, s.r, s.r * .55, s.r * 1.1, 0, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#fff1c4'; ctx.fillRect(-s.r, s.r - 1, s.r * 2, 2);
  }
  ctx.restore();
}
function drawEffects(dt) {
  for (const fx of effects) {
    const progress = 1 - fx.life / fx.max;
    if (fx.type === 'wardBreak') { // expanding ring: blue for a shattered ward, purple for an elite kill
      ctx.save(); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = fx.color; ctx.lineWidth = 4 * (1 - progress) + 1; ctx.beginPath(); ctx.arc(fx.x, fx.y, Math.round(20 + progress * (fx.r || 60)), 0, 7); ctx.stroke(); ctx.restore();
    }
    if (fx.type === 'magic') {
      ctx.save(); ctx.translate(fx.x, fx.y); ctx.globalAlpha = (1 - progress) * .85;
      const radius = 28 + Math.sin(progress * Math.PI / 2) * 185;
      ctx.strokeStyle = '#ccb8fa'; ctx.lineWidth = 3 * (1 - progress) + 1; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8e73be'; ctx.lineWidth = 10 * (1 - progress); ctx.beginPath(); ctx.arc(0, 0, radius - 8, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + progress; ctx.fillStyle = '#f0e4ff'; ctx.fillRect(Math.cos(a) * radius - 2, Math.sin(a) * radius - 2, 4, 4); }
      ctx.restore();
    } else if (fx.type === 'vortex') { // three spiral arms drawn inward, plus a ring shrinking to the hero
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = Math.min(1, (1 - progress) * 1.6);
      ctx.strokeStyle = '#8e73be'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, fx.radius * (1 - progress), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e4d8ff';
      for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 7; i++) {
        const k = Math.max(0, (1 - progress) - i * .07), a = arm * 2.094 + progress * 7 + (1 - k) * 2.2, d = fx.radius * k;
        ctx.fillRect(Math.round(Math.cos(a) * d) - 2, Math.round(Math.sin(a) * d * .8) - 2, 4 - (i > 3), 4 - (i > 3));
      }
      ctx.restore();
    } else if (fx.type === 'debris') { // chunks arc out and settle on the floor; altars also flash a pink core
      ctx.save(); ctx.translate(Math.round(fx.x), fx.y);
      for (const b of fx.bits) { const k = Math.min(1, progress * 1.8), bx = Math.round(Math.cos(b.a) * b.d * k * (b.a % 2 > 1 ? -1 : 1)), by = Math.round(Math.sin(b.a) * b.d * k * 1.4 - Math.sin(k * Math.PI) * 14);
        ctx.globalAlpha = 1 - progress * progress; ctx.fillStyle = fx.altar ? (b.s & 1 ? '#5a4650' : '#2c2128') : (b.s & 1 ? '#7a5a38' : '#4d3820'); ctx.fillRect(bx - b.s, Math.min(-2, by) - b.s, b.s * 2, b.s); }
      if (fx.altar) { ctx.globalAlpha = (1 - progress) * .6; ctx.fillStyle = '#ff6a8a'; ctx.fillRect(-26, -38 * (1 - progress), 52, 6); }
      ctx.restore();
    } else if (fx.type === 'snap') { // the broken altar's glow line to a trap fades out
      ctx.save(); ctx.globalAlpha = (1 - progress) * .8; ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(fx.x), fx.y); ctx.lineTo(Math.round(fx.x + (fx.x2 - fx.x) * (1 - progress)), fx.y); ctx.stroke(); ctx.restore();
    } else if (fx.type === 'dust') { // ring of dust expanding along the floor to the plunge radius
      const r = fx.radius * Math.sin(progress * Math.PI / 2);
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = (1 - progress) * .8;
      ctx.strokeStyle = '#b3a68f'; ctx.lineWidth = 4 * (1 - progress) + 1; ctx.beginPath(); ctx.ellipse(0, -3, r, 9 * (1 - progress * .5), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e4dccb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, -3, r * .92, 7 * (1 - progress * .5), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (fx.type === 'impact') {
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = fx.life / fx.max;
      ctx.fillStyle = '#fff5cd'; ctx.beginPath(); ctx.moveTo(-24, -3); ctx.lineTo(-4,-6); ctx.lineTo(-2,-25); ctx.lineTo(3,-5); ctx.lineTo(28,0); ctx.lineTo(4,4); ctx.lineTo(0,21); ctx.lineTo(-4,5); ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (fx.type === 'shards') { // ice shards fly outward, then fall; pale ring marks the radius
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = (1 - progress) * .9;
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, fx.radius * Math.min(1, progress * 3), 0, Math.PI * 2); ctx.stroke();
      for (const s of fx.shards) { const k = Math.sin(Math.min(1, progress * 1.6) * Math.PI / 2), sx = Math.round(Math.cos(s.a) * s.d * k), sy = Math.round(Math.sin(s.a) * s.d * k * .7 + progress * progress * 40);
        ctx.fillStyle = '#e9f8ff'; ctx.beginPath(); ctx.moveTo(sx, sy - s.s); ctx.lineTo(sx + 2 + s.r * .3, sy + s.s * .5); ctx.lineTo(sx - 2, sy + s.s * .4); ctx.fill(); ctx.fillStyle = '#7fc4f0'; ctx.fillRect(sx, sy, 1, s.s >> 1); }
      ctx.restore();
    } else if (fx.type === 'flameCol') { // rising blood-flame column plus a floor ring of the exact radius
      ctx.save(); ctx.translate(Math.round(fx.x), Math.round(fx.y)); ctx.globalAlpha = (1 - progress) * .85;
      const hgt = 40 + 120 * Math.sin(Math.min(1, progress * 1.5) * Math.PI / 2), wd = 22 * (1 - progress * .5);
      ctx.fillStyle = '#9c1f2e'; ctx.fillRect(-wd, -hgt, wd * 2, hgt + 20); ctx.fillStyle = '#ff6a3c'; ctx.fillRect(-wd * .6, -hgt * .85, wd * 1.2, hgt * .85 + 20); ctx.fillStyle = '#ffe08a'; ctx.fillRect(-wd * .25, -hgt * .6, wd * .5, hgt * .6 + 20);
      ctx.strokeStyle = '#ff8a5c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 18, fx.radius * Math.min(1, progress * 3 + .2), 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (fx.type === 'arc') { // jagged bolt, drawn twice (glow then core), fades fast
      ctx.save(); ctx.globalAlpha = fx.life / fx.max; ctx.lineJoin = 'miter';
      for (const [w, c] of [[4, '#ffe97a88'], [1.5, '#fffbd0']]) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); fx.pts.forEach(([px, py], i) => i ? ctx.lineTo(Math.round(px), Math.round(py)) : ctx.moveTo(Math.round(px), Math.round(py))); ctx.stroke(); }
      ctx.restore();
    } else drawSlash(fx.x, fx.y, fx.dir, progress, fx.boss, true, null, fx.big);
    fx.life -= dt;
  }
  effects = effects.filter(e => e.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 330 * dt; p.life -= dt;
    ctx.globalAlpha = clamp(p.life / .2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1; particles = particles.filter(p => p.life > 0);
  for (const number of numbers) {
    number.y -= dt * 37; number.life -= dt; ctx.globalAlpha = Math.min(number.soft ? .75 : 1, number.life * 3);
    ctx.font = `bold ${number.size || (number.crit ? 23 : 16)}px Georgia`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#13101b'; ctx.strokeText(number.text, number.x, number.y); ctx.fillStyle = number.color; ctx.fillText(number.text, number.x, number.y);
    if (number.crit) { ctx.font = '7px sans-serif'; ctx.fillText('CRITICAL', number.x, number.y - 22); }
  }
  ctx.globalAlpha = 1; numbers = numbers.filter(n => n.life > 0);
}
function render(dt) {
  const title = game.state === 'title', p = game.player;
  const frenzyK = p.frenzy && game.mode === 'castle' ? .25 + .75 * clamp((p.blood - BLOOD_HALF) / (BLOOD_MAX - BLOOD_HALF), 0, 1) : 0; // fades as blood burns 200 -> 100
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
    for (const trail of trails) { ctx.globalAlpha = Math.min(1, trail.life * 2.5); if (trail.silver) ctx.filter = 'grayscale(1) brightness(1.7)'; drawHero(ctx, trail, worldTime); ctx.filter = 'none'; trail.life -= dt; }
    ctx.globalAlpha = 1; trails = trails.filter(t => t.life > 0);
    for (const c of game.chests) if (c.x > camera - 150 && c.x < camera + viewWidth + 150) drawChest(ctx, c, worldTime);
    for (const tr of game.traps) if (tr.x > camera - 150 && tr.x < camera + viewWidth + 150) drawTrap(ctx, tr, worldTime);
    for (const o of game.obstacles) if (o.x > camera - 150 && o.x < camera + viewWidth + 150) drawObstacle(ctx, o, worldTime, game.stage, game.traps);
    for (const e of game.enemies) {
      if (e.hp <= 0 || e.x < camera - 150 || e.x > camera + viewWidth + 150) continue;
      if (e.elite) { // ward broke since last frame: shatter flash (render-only; compares against the previous frame)
        if (lastWard.get(e) > 0 && !(e.ward > 0)) { burst(e.x, e.y - 30, '#9fd8ff', 16, 190); effects.push({ type: 'wardBreak', x: e.x, y: e.y - 30, life: .3, max: .3, color: '#9fd8ff' }); }
        lastWard.set(e, e.ward);
      }
      drawEnemy(ctx, e, worldTime, !settings.shake); drawStatus(ctx, e, worldTime, !settings.shake);
      if (e.type === 'boss' && e.travel > 0 && (dustTimer -= dt) <= 0) { dustTimer = .035; burst(e.x - e.dir * 28, e.y - 2, '#9a8c77', 3, 90, -e.dir, 3); } // charge dust kicked up behind the feet
      if (e.type !== 'boss' && e.hp < e.maxHp) {
        const barY = e.y - e.h - (e.type === 'knight' ? 29 : (e.type === 'mage' || e.type === 'priest') ? 17 : e.type === 'shield' ? 21 : 9);
        ctx.fillStyle = '#13111b'; ctx.fillRect(Math.round(e.x - 18), Math.round(barY), 36, 4); ctx.fillStyle = '#b75a66'; ctx.fillRect(Math.round(e.x - 17), Math.round(barY + 1), Math.max(0, 34 * e.hp / e.maxHp), 2);
      }
      const brk = e.riposte && e.stun > 0; // posture bar: only below max (or flashing while broken, until the riposte lands)
      if (e.maxPoise && (brk || e.poise < e.maxPoise) && (game.mode === 'castle' || e.type === 'knight' || e.type === 'shield' || e.type === 'boss') && e.type !== 'bat') {
        const bw = e.type === 'boss' ? 56 : 30, bx = Math.round(e.x - bw / 2), by = Math.round(e.y + 5);
        ctx.fillStyle = brk ? '#fff0b0' : '#13111b'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5); ctx.fillStyle = '#13111b'; ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = brk ? (!settings.shake || (worldTime * 12 | 0) % 2 ? '#fff0b0' : '#ffd36e') : e.punishable ? '#ffd36e' : '#c9a85a'; ctx.fillRect(bx + 1, by + 1, brk ? bw - 2 : Math.max(0, Math.round((bw - 2) * e.poise / e.maxPoise)), 1);
      }
      if (e.stun > 0 && e.armor > 0 && e.hp > 0) { // stun with armor left = a stagger stun (flinch stuns need armor 0): ring of gold stars over the head
        const ry = Math.round(e.y - e.h - 6), rw = e.type === 'boss' ? 26 : 16; ctx.fillStyle = '#ffd36e';
        for (let i = 0; i < 4; i++) { const a = worldTime * 6 + i * Math.PI / 2; ctx.fillRect(Math.round(e.x + Math.cos(a) * rw) - 2, Math.round(ry + Math.sin(a) * 4) - 2, 4, 4); }
      }
      if (e.required && e.hp > 0) { // gate-guard crest: small gold shield with a crimson gem, left of the head so it never overlaps the "!"
        const cx = Math.round(e.x - (e.type === 'boss' ? 22 : 13)), cy = Math.round(e.y - e.h - 12);
        ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy - 5); ctx.lineTo(cx + 5, cy + 1); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 5, cy + 1); ctx.closePath();
        ctx.fillStyle = '#13111b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#e0bd6a'; ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = '#d8445a'; ctx.fillRect(cx - 1, cy - 2, 3, 4);
      }
      if (e.elite && e.hp > 0 && e.affix) drawAffixIcon(ctx, e.affix, e.x + (e.type === 'boss' ? 36 : 25), e.y - e.h - 14); // right of the head, clear of the "!", crest (left), HP bar and stun stars
      if (e.tell > 0) { /* "!" slides clear of the hero and lifts above the 0.1 s glint star */ ctx.textAlign = 'center'; ctx.font = 'bold 15px Georgia'; const pdx = e.x - game.player.x; let bx = Math.round(Math.abs(pdx) < 26 ? game.player.x + (pdx < 0 || (pdx === 0 && e.dir === 1) ? -26 : 26) : e.x), by2 = Math.round(e.y - e.h - (e.type === 'shield' ? 25 : 15) - (e.glint > 0 ? 26 : 0)); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#13111b'; const hv = e.heavy && e.type !== 'boss', mark = hv ? '!!' : '!'; if (hv) ctx.font = 'bold 27px Georgia'; ctx.strokeText(mark, bx, by2); ctx.fillStyle = hv ? '#ff3b30' : e.punishable ? '#ffd36e' : '#f4ae84'; ctx.fillText(mark, bx, by2); ctx.lineWidth = 1; }
    }
    if (p.plunge === 2) { // short vertical streak above the falling hero
      const g = ctx.createLinearGradient(0, p.y - 130, 0, p.y - 40); g.addColorStop(0, '#c7e2df00'); g.addColorStop(1, '#c7e2dfaa');
      ctx.fillStyle = g; ctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 130, 3, 90); ctx.fillRect(Math.round(p.x) + 5, Math.round(p.y) - 110, 2, 70);
    }
    if (frenzyK > 0) { ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y - 32)); ctx.globalAlpha = frenzyK * (settings.shake ? .75 + .25 * Math.sin(worldTime * 9) : .85); ctx.fillStyle = auraGradient(); ctx.fillRect(-70, -80, 140, 160); ctx.restore(); }
    if (game.state !== 'dead' || Math.sin(worldTime * 7) > 0) drawHero(ctx, p, worldTime);
    if (p.attack > 0) { const prog = 1 - p.attack / p.attackLen; if (p.move === 'thrust') drawThrust(p.x, p.y - 33, p.dir, prog, p.weapon); else drawSlash(p.x, p.y - 33, p.dir, prog, p.combo === 3, false, p.weapon); }
    for (const s of game.shots) if (s.x > camera - 60 && s.x < camera + viewWidth + 60) drawShot(s);
    for (const b of game.projectiles) {
      if (b.ground) { drawGroundWave(b); continue; }
      ctx.shadowColor = '#d46ea3'; ctx.shadowBlur = 14; ctx.fillStyle = '#ca6a9c'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffe0e7'; ctx.fillRect(Math.round(b.x - 2), Math.round(b.y - 2), 4, 4);
    }
  }
  drawEffects(dt); ctx.restore();
  if (phaseTime > 0) { // phase roar: screen darkens, then a red pulse blooms on the moon (steady when reduced motion is on)
    const k = Math.max(0, Math.min(1, phaseTime / .4, (1.6 - phaseTime) / .15)), pulse = settings.shake ? .5 + .5 * Math.sin(phaseTime * 14) : 1;
    ctx.fillStyle = `rgba(8,2,10,${.55 * k})`; ctx.fillRect(0, 0, viewWidth, 540);
    for (let mx = 715 - (Math.floor(camera * .13) % 1440); mx < viewWidth + 200; mx += 1440) { const mr = 150 + 40 * pulse, gr = ctx.createRadialGradient(mx, 150, 10, mx, 150, mr); gr.addColorStop(0, `rgba(255,70,60,${.7 * k})`); gr.addColorStop(1, 'rgba(255,70,60,0)'); ctx.fillStyle = gr; ctx.fillRect(mx - mr, 150 - mr, mr * 2, mr * 2); }
  }
  if (frenzyK > 0) { ctx.globalAlpha = frenzyK * (settings.shake ? .8 + .2 * Math.sin(worldTime * 9) : .9); ctx.fillStyle = vignetteGradient(); ctx.fillRect(0, 0, viewWidth, 540); ctx.globalAlpha = 1; }
  if (damageFlash > 0) { ctx.fillStyle = `rgba(144,27,50,${damageFlash * .65})`; ctx.fillRect(0, 0, viewWidth, 540); }
  if (whiteFlash > 0) { ctx.fillStyle = `rgba(255,232,193,${whiteFlash * 3})`; ctx.fillRect(0, 0, viewWidth, 540); }
  if (silverFlash > 0) { ctx.fillStyle = `rgba(214,224,255,${silverFlash * 3})`; ctx.fillRect(0, 0, viewWidth, 540); }
  ctx.restore();
}
let hudTimer = 0;
let prevBlood = null; // castle blood meter feedback: no core event, so compare per frame
function watchBlood() {
  const p = game.player, live = game.mode === 'castle' && game.state === 'playing';
  if (live && prevBlood !== null && p.blood > prevBlood + .5) audio.play(prevBlood < BLOOD_HALF && p.blood >= BLOOD_HALF ? 'bloodHalf' : 'bloodGain', .3 + p.blood / BLOOD_MAX * 1.2);
  prevBlood = live ? p.blood : null;
}
function watchHold() { // delayed-heavy hold loop: on only while a delayed heavy waits before its glint; no allocation
  let hold = false;
  if (game.state === 'playing') for (const e of game.enemies) if (e.delayed && e.heavy && e.hp > 0 && e.tell > 0 && !e.glinted) { hold = true; break; }
  audio.setHold(hold);
}
function tick(now) {
  const dt = Math.min((now - (lastTime || now)) / 1000, 1 / 30); lastTime = now; worldTime += dt;
  if (ai) aiModal(dt);
  const input = ai && game.state === 'playing' ? ai.input(game) : getInput(), consume = game.state === 'playing' && game.freeze <= 0;
  game.update(dt, input);
  watchBlood(); watchHold();
  if (consume) for (const control of impulseControls) if (input[control]) buffered.delete(control);
  if (game.state === 'playing' && game.player.dash > 0) { trailTimer -= dt; if (trailTimer <= 0) { trails.push({ ...game.player, life: .24, invulnerable: 0 }); trailTimer = .035; } }
  shakeTime = Math.max(0, shakeTime - dt); if (!shakeTime) shakePower = 0;
  phaseTime = Math.max(0, phaseTime - dt);
  damageFlash = Math.max(0, damageFlash - dt); whiteFlash = Math.max(0, whiteFlash - dt); silverFlash = Math.max(0, silverFlash - dt);
  comboTime = Math.max(0, comboTime - dt); if (!comboTime) hitCount = 0;
  if (announceTime > 0) { announceTime -= dt; if (announceTime <= 0) { $('stage-announcement').classList.remove('show'); if (game.state === 'playing' && game.roomIndex > 0) showRoom(game.stage, game.roomIndex); } }
  if (roomTime > 0) { roomTime -= dt; if (roomTime <= 0) $('room-banner').classList.remove('show'); }
  pumpBanner();
  if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('toast').classList.remove('show'); }
  render(dt); hudTimer -= dt; if (hudTimer <= 0) { updateHud(); hudTimer = .08; }
  requestAnimationFrame(tick);
}
game = new Game(handleEvent); applyLanguage(); updateHud(); requestAnimationFrame(tick);
syncGear();
// Opt-in test handle: absent in normal play; useful for deterministic browser smoke checks.
if (testMode) $('ai-toggle').hidden = false;
if (testMode) $('ai-toggle').addEventListener('click', e => { toggleAI(); e.currentTarget.blur(); });
if (testMode) window.__nocturne = { get game() { return game; }, audio, settings, startRun, clearInput, toggleAI, get ai() { return !!ai; } };