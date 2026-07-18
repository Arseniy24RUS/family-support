import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegionName, parseCatalogCard, parseCatalogPayloadMeasure } from '../scripts/lib/parse-card.mjs';

test('разбирает региональную карточку каталога', () => {
  const value = parseCatalogCard({
    href: 'https://app.sovetmam.ru/catalog/adg-001',
    text: [
      'Здоровье | Республика Адыгея',
      'Выплата детям с фенилкетонурией (Республика Адыгея)',
      'Семьям, воспитывающим детей до 18 лет, выплачивают выплату.',
      'Ежемесячная выплата',
      'Подробнее'
    ].join('\n'),
    heading: 'Выплата детям с фенилкетонурией (Республика Адыгея)',
    paragraphs: []
  }, '2026-07-18T00:00:00.000Z');

  assert.equal(value.id, 'sovetmam:adg-001');
  assert.equal(value.level, 'regional');
  assert.equal(value.region, 'Республика Адыгея (Адыгея)');
  assert.equal(value.category, 'Здоровье');
  assert.match(value.summary, /Семьям/);
});

test('разбирает федеральную карточку', () => {
  const value = parseCatalogCard({
    href: 'https://app.sovetmam.ru/catalog/fed-001',
    text: 'Выплаты и пособия | Федеральная\nЕдиное пособие\nЕжемесячная выплата\nПодробнее',
    heading: '',
    paragraphs: []
  });

  assert.equal(value.level, 'federal');
  assert.equal(value.region, null);
  assert.equal(value.title, 'Единое пособие');
});

test('разбирает метаданные, разбитые на отдельные строки', () => {
  const value = parseCatalogCard({
    href: 'https://app.sovetmam.ru/catalog/adg-002',
    text: [
      'Выплаты и пособия',
      '|',
      'Республика Адыгея',
      'Дополнительное пособие при рождении ребёнка',
      'Семьям выплачивают единовременное пособие.',
      'Единовременная выплата',
      'Подробнее'
    ].join('\n'),
    heading: '',
    paragraphs: []
  });

  assert.equal(value.category, 'Выплаты и пособия');
  assert.equal(value.region, 'Республика Адыгея (Адыгея)');
  assert.equal(value.title, 'Дополнительное пособие при рождении ребёнка');
});

test('нормализует только явные алиасы регионов', () => {
  assert.equal(normalizeRegionName('Республика Адыгея'), 'Республика Адыгея (Адыгея)');
  assert.equal(normalizeRegionName('Республика Татарстан'), 'Республика Татарстан (Татарстан)');
  assert.equal(normalizeRegionName('Чувашская Республика'), 'Чувашская Республика — Чувашия');
  assert.equal(normalizeRegionName('Республика Саха (Якутия)'), 'Республика Саха (Якутия)');
});

test('разбирает структурированную запись встроенного каталога', () => {
  const measure = parseCatalogPayloadMeasure({
    slug: 'test-001',
    title: 'Скидка на товары для семей',
    shortDescription: 'Краткое описание.',
    category: 'Скидки в магазинах',
    amount: 'Скидка 10%',
    level: 'regional',
    region: 'Чувашская Республика'
  }, 'https://app.sovetmam.ru/catalog', '2026-07-18T00:00:00.000Z');

  assert.equal(measure.id, 'sovetmam:test-001');
  assert.equal(measure.region, 'Чувашская Республика — Чувашия');
  assert.equal(measure.source_url, 'https://app.sovetmam.ru/catalog/test-001');
  assert.equal(measure.category, 'Скидки в магазинах');
  assert.match(measure.content_hash, /^[a-f0-9]{64}$/);
});
