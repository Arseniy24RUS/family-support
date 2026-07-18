import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('site');
const required = [
  'index.html',
  'styles.css',
  'app.js',
  '.nojekyll',
  'manifest.webmanifest',
  'assets/favicon.png',
  'assets/logo-isd.png',
  'assets/hero-family.webp',
  'assets/hero-family.jpg',
  'assets/russia-map.svg',
  'assets/logo-sovetmam-horizontal.jpg',
  'assets/logo-sovetmam-round.svg',
  'assets/logo-gosuslugi.svg',
  'assets/logo-sfr.png',
  'vendor/lucide.min.js',
  'vendor/LUCIDE-LICENSE.txt',
  'data/measures.json',
  'data/meta.json',
  'data/regions.json',
  'data/regions-base.json',
  'data/ru-regions.geojson'
];

for (const relative of required) {
  await access(resolve(root, relative));
}

const [html, css, js, measuresText, metaText, regionsBaseText, geoText] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'data/measures.json'), 'utf8'),
  readFile(resolve(root, 'data/meta.json'), 'utf8'),
  readFile(resolve(root, 'data/regions-base.json'), 'utf8'),
  readFile(resolve(root, 'data/ru-regions.geojson'), 'utf8')
]);

const forbidden = [
  ['index.html', html, /Версия для слабовидящих|>Войти<|login-link|a11y-toggle/i],
  ['styles.css', css, /a11y-mode|login-link|a11y-toggle/i],
  ['app.js', js, /family-support-a11y|a11yToggle|setA11yMode/i]
];
for (const [name, content, pattern] of forbidden) {
  if (pattern.test(content)) throw new Error(`${name}: найдена удалённая функция интерфейса (${pattern}).`);
}

const measures = JSON.parse(measuresText);
const meta = JSON.parse(metaText);
const regionsBase = JSON.parse(regionsBaseText);
const regionsGeo = JSON.parse(geoText);
if (!Array.isArray(measures) || measures.length === 0) throw new Error('Каталог мер пуст.');
if (!Array.isArray(regionsBase) || regionsBase.length !== 89) {
  throw new Error(`В базовом списке должно быть 89 регионов; получено ${regionsBase?.length ?? 'неизвестно'}.`);
}
if (new Set(regionsBase).size !== regionsBase.length) throw new Error('В базовом списке регионов есть повторы.');
if (regionsGeo?.type !== 'FeatureCollection' || regionsGeo.features?.length !== 89) {
  throw new Error(`GeoJSON должен содержать 89 регионов; получено ${regionsGeo?.features?.length ?? 'неизвестно'}.`);
}
if (new Set(regionsGeo.features.map((feature) => feature.properties?.name)).size !== 89) {
  throw new Error('В GeoJSON отсутствуют названия регионов или есть повторы.');
}
const geoNameAliases = new Map([
  ['Город Москва', 'Москва'],
  ['Город Санкт-Петербург', 'Санкт-Петербург'],
  ['Город Севастополь', 'Севастополь'],
  ['Кемеровская область – Кузбасс', 'Кемеровская область — Кузбасс'],
  ['Республика Северная Осетия – Алания', 'Республика Северная Осетия — Алания'],
  ['Ханты-Мансийский автономный округ – Югра', 'Ханты-Мансийский автономный округ — Югра'],
  ['Чувашская Республика - Чувашия', 'Чувашская Республика — Чувашия']
]);
const mappedGeoNames = new Set(regionsGeo.features.map((feature) => {
  const name = feature.properties?.name;
  return geoNameAliases.get(name) ?? name;
}));
const missingGeometry = regionsBase.filter((region) => !mappedGeoNames.has(region));
const unknownGeometry = [...mappedGeoNames].filter((region) => !regionsBase.includes(region));
if (missingGeometry.length || unknownGeometry.length) {
  throw new Error(`GeoJSON не совпадает со справочником: без геометрии [${missingGeometry.join(', ')}], неизвестные [${unknownGeometry.join(', ')}].`);
}
if (Number(meta.measure_count) !== measures.length) {
  throw new Error(`meta.measure_count (${meta.measure_count}) не совпадает с числом карточек (${measures.length}).`);
}
if (meta.source !== 'demo') {
  if (meta.source !== 'sovetmam' || meta.demo === true) throw new Error('Рабочий снимок имеет неверный источник или demo-флаг.');
  if (measures.length < 1000) throw new Error(`Рабочий снимок содержит только ${measures.length} мер.`);
  if (Number(meta.loaded_link_count) !== measures.length) throw new Error('loaded_link_count не совпадает с числом мер.');
  if (Number(meta.parse_error_count) !== 0) throw new Error('Рабочий снимок содержит ошибки разбора.');
  if (Number(meta.page_reported_count) && measures.length < Number(meta.page_reported_count) * 0.97) {
    throw new Error('Извлечено менее 97% сообщённого страницей числа мер.');
  }
}

const ids = new Set();
for (const measure of measures) {
  for (const key of ['id', 'title', 'level', 'category', 'source_url']) {
    if (!measure?.[key]) throw new Error(`Карточка без обязательного поля ${key}: ${JSON.stringify(measure)}`);
  }
  if (ids.has(measure.id)) throw new Error(`Повтор идентификатора ${measure.id}.`);
  ids.add(measure.id);
  const sourceUrl = new URL(measure.source_url);
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'app.sovetmam.ru') {
    throw new Error(`Недопустимый URL ${measure.source_url}.`);
  }
  if (measure.level === 'regional' && !regionsBase.includes(measure.region)) {
    throw new Error(`Регион отсутствует в базовом справочнике: ${measure.region}.`);
  }
  if (!measure.content_hash || !measure.fetched_at) throw new Error(`Нет метаданных целостности у ${measure.id}.`);
}

const localReferences = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)]
  .map((match) => match[1])
  .filter((value) => !value.startsWith('./#'));
for (const reference of new Set(localReferences)) {
  await access(resolve(root, reference.slice(2)));
}

console.log(`Проверка завершена: ${measures.length} карточек, ${regionsBase.length} регионов, все локальные ресурсы доступны.`);
