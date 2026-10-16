import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, STRINGS, detectLanguage, setLanguage, t } from '../i18n.js';
import { RELICS, STAGES } from '../core.js';

const translatable = key => !key.startsWith('decor.');

test('every language defines the same translatable keys', () => {
  const english = Object.keys(STRINGS.en).filter(translatable).sort();
  for (const lang of Object.keys(LANGUAGES)) {
    assert.deepEqual(Object.keys(STRINGS[lang]).filter(translatable).sort(), english, `${lang} keys differ from en`);
  }
});

test('every stage and relic has display text', () => {
  const keys = [
    ...STAGES.flatMap((_, i) => [`stage.${i}.name`, `stage.${i}.subtitle`, `decor.stage.${i}`]),
    ...RELICS.flatMap(r => ['name', 'type', 'text'].map(field => `relic.${r.id}.${field}`)),
  ];
  for (const key of keys) assert.ok(STRINGS.en[key], `missing ${key}`);
});

test('language detection, fallback, and interpolation', () => {
  assert.equal(detectLanguage('zh-TW'), 'zh-Hant');
  assert.equal(detectLanguage('en-US'), 'en');
  assert.equal(detectLanguage('fr'), 'en');
  assert.equal(setLanguage('xx'), 'en');
  setLanguage('zh-Hant');
  assert.equal(t('decor.pause'), STRINGS.en['decor.pause'], 'decor keys fall back to en');
  assert.equal(t('pause.info', { stage: 'II', name: 'X', relics: 1 }), '第 II 夜 · X · 聖物 1 件');
  setLanguage('en');
});
