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
  'data/ru-regions.geojson',
  'data/details/manifest.json',
  ...Array.from({ length: 32 }, (_, index) => `data/details/${String(index).padStart(2, '0')}.json`)
];

for (const relative of required) {
  await access(resolve(root, relative));
}

const [html, css, js, measuresText, metaText, regionsBaseText, geoText, detailManifestText, ...detailShardTexts] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'data/measures.json'), 'utf8'),
  readFile(resolve(root, 'data/meta.json'), 'utf8'),
  readFile(resolve(root, 'data/regions-base.json'), 'utf8'),
  readFile(resolve(root, 'data/ru-regions.geojson'), 'utf8'),
  readFile(resolve(root, 'data/details/manifest.json'), 'utf8'),
  ...Array.from({ length: 32 }, (_, index) => readFile(
    resolve(root, `data/details/${String(index).padStart(2, '0')}.json`),
    'utf8'
  ))
]);

const forbidden = [
  ['index.html', html, /Версия для слабовидящих|>Войти<|login-link|a11y-toggle/i],
  ['styles.css', css, /a11y-mode|login-link|a11y-toggle/i],
  ['app.js', js, /family-support-a11y|a11yToggle|setA11yMode/i],
  ['app.js', js, /safeUrl\(measure\.source_url\)|href\s*=\s*measure\.source_url/i]
];
for (const [name, content, pattern] of forbidden) {
  if (pattern.test(content)) throw new Error(`${name}: найдена удалённая функция интерфейса (${pattern}).`);
}
const councilLinkCount = (html.match(/href=["']https:\/\/app\.sovetmam\.ru\/["']/gi) ?? []).length;
if (councilLinkCount !== 2) throw new Error(`В header и разделе источников должно быть ровно две ссылки на Совет матерей; получено ${councilLinkCount}.`);

const measures = JSON.parse(measuresText);
const meta = JSON.parse(metaText);
const regionsBase = JSON.parse(regionsBaseText);
const regionsGeo = JSON.parse(geoText);
const detailManifest = JSON.parse(detailManifestText);
const detailShards = detailShardTexts.map((text) => JSON.parse(text));
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
if (Number(meta.detail_shard_count) !== detailShards.length || Number(detailManifest.shard_count) !== detailShards.length) {
  throw new Error('Количество файлов подробных карточек не совпадает с метаданными.');
}
if (Number(meta.detail_count) !== measures.length || Number(detailManifest.detail_count) !== measures.length) {
  throw new Error('Подробные карточки есть не для всех мер.');
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

const officialHosts = new Set([
  'gosuslugi.ru', 'www.gosuslugi.ru', 'sfr.gov.ru', 'nalog.gov.ru',
  'www.nalog.gov.ru', 'trudvsem.ru', 'www.trudvsem.ru'
]);
const forbiddenGenericUrls = new Set([
  'https://www.gosuslugi.ru/social-navigator',
  'https://www.gosuslugi.ru/large_family',
  'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/',
  'https://www.nalog.gov.ru/rn77/fl/',
  'https://trudvsem.ru/'
]);
const detailsById = new Map();
let officialLinkCount = 0;
for (const shard of detailShards) {
  if (!shard || Array.isArray(shard) || typeof shard !== 'object') throw new Error('Некорректный файл подробных карточек.');
  for (const [id, detail] of Object.entries(shard)) {
    if (detailsById.has(id)) throw new Error(`Подробная карточка ${id} встречается дважды.`);
    for (const key of ['steps', 'documents', 'notes', 'official_links']) {
      if (!Array.isArray(detail?.[key])) throw new Error(`В подробной карточке ${id} поле ${key} должно быть массивом.`);
    }
    if (!detail.steps.length) throw new Error(`В подробной карточке ${id} не указан порядок оформления.`);
    for (const link of detail.official_links) {
      const url = new URL(link.url);
      if (url.protocol !== 'https:' || !officialHosts.has(url.hostname)) {
        throw new Error(`В карточке ${id} недопустимая внешняя ссылка: ${link.url}`);
      }
      if (forbiddenGenericUrls.has(link.url)) {
        throw new Error(`В карточке ${id} указана общая ссылка вместо страницы конкретной услуги: ${link.url}`);
      }
      officialLinkCount += 1;
    }
    detailsById.set(id, detail);
  }
}
for (const id of ids) {
  if (!detailsById.has(id)) throw new Error(`Нет подробной карточки для ${id}.`);
}
if (detailsById.size !== measures.length) throw new Error('Количество подробных карточек не совпадает с каталогом.');
if (officialLinkCount !== meta.official_link_count || officialLinkCount !== detailManifest.official_link_count) {
  throw new Error('Количество проверенных официальных ссылок не совпадает с метаданными.');
}

const localReferences = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)]
  .map((match) => match[1])
  .filter((value) => !value.startsWith('./#'));
for (const reference of new Set(localReferences)) {
  await access(resolve(root, reference.slice(2)));
}

console.log(`Проверка завершена: ${measures.length} мер и подробных карточек, ${regionsBase.length} регионов, ${officialLinkCount} точных официальных ссылок.`);
