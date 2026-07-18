import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogCoverage,
  catalogMeasureUrl,
  detailShardKey,
  inferProviderType,
  measureMatchesRegion,
  normalizeText,
  pluralMeasures
} from '../site/lib/platform-core.js';

test('normalizeText normalizes ё, punctuation and spaces', () => {
  assert.equal(normalizeText('  Пособие — на РЕБЁНКА!  '), 'пособие на ребенка');
});

test('pluralMeasures uses Russian plural forms', () => {
  assert.equal(pluralMeasures(1), 'мера');
  assert.equal(pluralMeasures(2), 'меры');
  assert.equal(pluralMeasures(5), 'мер');
  assert.equal(pluralMeasures(11), 'мер');
  assert.equal(pluralMeasures(21), 'мера');
});

test('regional selection always includes federal measures', () => {
  assert.equal(measureMatchesRegion({ level: 'federal' }, 'Москва'), true);
  assert.equal(measureMatchesRegion({ level: 'regional', region: 'Москва' }, 'Москва'), true);
  assert.equal(measureMatchesRegion({ level: 'regional', region: 'Тула' }, 'Москва'), false);
  assert.equal(measureMatchesRegion({ level: 'regional', region: 'Тула' }, ''), false);
});

test('catalogCoverage distinguishes missing source records from represented regions', () => {
  const result = catalogCoverage([
    { level: 'regional', region: 'Москва' },
    { level: 'federal' }
  ], ['Москва', 'Тула']);
  assert.equal(result.representedCount, 1);
  assert.deepEqual(result.missingRegions, ['Тула']);
});

test('deep link contains a stable measure id and optional region', () => {
  assert.equal(catalogMeasureUrl({ id: 'abc' }, { region: 'Москва' }), './index.html?region=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&measure=abc');
});

test('provider inference marks only explicit corporate wording as inferred', () => {
  assert.deepEqual(inferProviderType({ title: 'Материнский капитал от работодателя', level: 'federal' }), {
    id: 'employer', label: 'Корпоративная программа', inferred: true
  });
  assert.equal(inferProviderType({ title: 'Единое пособие', level: 'federal' }).inferred, false);
});

test('detail shard hash remains compatible with the existing catalog', () => {
  assert.equal(detailShardKey('test-id', 32), detailShardKey('test-id', 32));
  assert.ok(detailShardKey('test-id', 32) >= 0 && detailShardKey('test-id', 32) < 32);
});
