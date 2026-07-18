import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const repositoryRoot = process.cwd();
const siteRoot = resolve(repositoryRoot, 'site');

const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'situations.html',
  'situations.js',
  'compare.html',
  'compare.js',
  'methodology.html',
  'methodology.js',
  'modules.css',
  'lib/platform-core.js',
  'lib/life-situation-engine.js',
  'lib/region-comparison-engine.js',
  'lib/module-shell.js',
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
  'data/details/manifest.json'
];

for (const file of requiredFiles) await access(resolve(siteRoot, file));

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function insideSite(path) {
  const rel = relative(siteRoot, path);
  return rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(`${sep}..${sep}`);
}

function localReferences(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith('./') || value.startsWith('../'))
    .map((value) => value.split(/[?#]/, 1)[0])
    .filter(Boolean);
}

function idsIn(html) {
  return [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
}

async function validateHtml(file) {
  const path = resolve(siteRoot, file);
  const html = await readFile(path, 'utf8');
  assert(/<!doctype html>/i.test(html), `${file}: отсутствует doctype.`);
  assert(/<html[^>]+lang=["']ru["']/i.test(html), `${file}: не указан русский язык документа.`);
  assert(/name=["']viewport["']/i.test(html), `${file}: отсутствует viewport.`);
  assert(/class=["'][^"']*skip-link/.test(html), `${file}: отсутствует ссылка пропуска навигации.`);
  assert(/<h1\b/i.test(html), `${file}: отсутствует заголовок первого уровня.`);
  assert(/\.\/index\.html/.test(html), `${file}: нет ссылки на каталог.`);
  assert(/\.\/situations\.html/.test(html), `${file}: нет ссылки на подбор.`);
  assert(/\.\/compare\.html/.test(html), `${file}: нет ссылки на сравнение.`);
  assert(/\.\/methodology\.html/.test(html), `${file}: нет ссылки на методологию.`);

  const ids = idsIn(html);
  assert(ids.length === new Set(ids).size, `${file}: обнаружены повторяющиеся id.`);

  for (const reference of new Set(localReferences(html))) {
    const target = resolve(dirname(path), reference);
    assert(insideSite(target) || target === siteRoot, `${file}: ссылка выходит за пределы site/: ${reference}`);
    await access(target);
  }
  return html;
}

const htmlFiles = ['index.html', 'situations.html', 'compare.html', 'methodology.html'];
const htmlByFile = new Map();
for (const file of htmlFiles) htmlByFile.set(file, await validateHtml(file));

const indexHtml = htmlByFile.get('index.html');
const catalogCss = await readFile(resolve(siteRoot, 'styles.css'), 'utf8');
const catalogJs = await readFile(resolve(siteRoot, 'app.js'), 'utf8');
const forbiddenLegacyFeatures = [
  ['index.html', indexHtml, /Версия для слабовидящих|>Войти<|login-link|a11y-toggle/i],
  ['styles.css', catalogCss, /a11y-mode|login-link|a11y-toggle/i],
  ['app.js', catalogJs, /family-support-a11y|a11yToggle|setA11yMode/i],
  ['app.js', catalogJs, /safeUrl\(measure\.source_url\)|href\s*=\s*measure\.source_url/i]
];
for (const [name, content, pattern] of forbiddenLegacyFeatures) {
  assert(!pattern.test(content), `${name}: найдена удалённая или небезопасная функция интерфейса (${pattern}).`);
}
assert((indexHtml.match(/href=["']https:\/\/app\.sovetmam\.ru\/["']/g) || []).length === 2,
  'index.html должен содержать ровно две атрибутированные ссылки на информационного партнёра.');
for (const id of [
  'hero-search-form', 'region-filter', 'category-filter', 'level-filter', 'search-filter',
  'region-map-layer', 'popular-list', 'category-grid', 'catalog', 'favorites-filter',
  'region-dialog', 'measure-dialog'
]) {
  assert(indexHtml.includes(`id="${id}"`), `index.html: отсутствует обязательный элемент #${id}.`);
}
assert(indexHtml.includes('Ключевые федеральные меры'), 'Блок фиксированного редакционного выбора не переименован.');
assert(!indexHtml.includes('Популярные меры поддержки'), 'Не следует обозначать редакционный выбор как измеренную популярность.');
assert(indexHtml.includes('Отсутствие региональной записи означает отсутствие сведений'),
  'Каталог должен объяснять смысл отсутствующей региональной записи.');

const situationsHtml = htmlByFile.get('situations.html');
for (const id of ['profile-form', 'situation-region', 'situation-grid', 'fact-grid', 'matching-results']) {
  assert(situationsHtml.includes(`id="${id}"`), `situations.html: отсутствует #${id}.`);
}
assert(/не (?:является|подтверждает|решение)[^<]*(?:прав|назнач)/i.test(situationsHtml),
  'Страница подбора должна явно отрицать юридически значимое определение права.');
assert(/ответы[^<]*(?:устройств|браузер)|не передаются/i.test(situationsHtml),
  'Страница подбора должна объяснять локальную обработку ответов.');

const compareHtml = htmlByFile.get('compare.html');
const comparisonV2 = compareHtml.includes('id="comparison-map"');
const comparisonIds = comparisonV2
  ? ['comparison-map', 'comparison-map-regions', 'selected-regions', 'run-comparison', 'comparison-results', 'category-table', 'strategy-library']
  : ['compare-form', 'compare-region-select', 'selected-regions', 'comparison-results', 'category-table'];
for (const id of comparisonIds) {
  assert(compareHtml.includes(`id="${id}"`), `compare.html: отсутствует #${id}.`);
}
assert(/нулев[^<]*(?:источник|снимок|сведен)/i.test(compareHtml),
  'Страница сравнения должна объяснять нулевые значения как пробел источника.');
assert(comparisonV2
  ? /не рейтинг[^<]*(?:не оценка эффективности)/i.test(compareHtml)
  : /не измеряет[^<]*(?:финанс|эффектив)/i.test(compareHtml),
'Страница сравнения должна ограничивать интерпретацию показателей.');

const methodologyHtml = htmlByFile.get('methodology.html');
for (const anchor of ['data', 'matching', 'comparison', 'privacy', 'corrections']) {
  assert(methodologyHtml.includes(`id="${anchor}"`), `methodology.html: отсутствует раздел #${anchor}.`);
}

for (const [file, html] of htmlByFile) {
  assert(html.includes('class="platform-nav"'), `${file}: отсутствует основная навигация платформы.`);
  for (const href of ['./index.html', './situations.html', './compare.html', './methodology.html']) {
    assert(html.includes(`href="${href}"`), `${file}: в header отсутствует ссылка ${href}.`);
  }
  assert((html.match(/aria-current="page"/g) || []).length === 1,
    `${file}: ровно один раздел основной навигации должен быть отмечен текущим.`);
}
assert(indexHtml.includes('class="platform-entrypoints site-container"'),
  'index.html: новые инструменты должны быть заметно представлены сразу после hero-блока.');

const [measures, meta, regionsBase, regionsGeo, detailManifest] = await Promise.all([
  readJson(resolve(siteRoot, 'data/measures.json')),
  readJson(resolve(siteRoot, 'data/meta.json')),
  readJson(resolve(siteRoot, 'data/regions-base.json')),
  readJson(resolve(siteRoot, 'data/ru-regions.geojson')),
  readJson(resolve(siteRoot, 'data/details/manifest.json'))
]);

assert(Array.isArray(measures), 'measures.json должен содержать массив.');
assert(Array.isArray(regionsBase), 'regions-base.json должен содержать массив.');
assert(regionsBase.length === 89, `Базовый справочник должен содержать 89 регионов; получено ${regionsBase.length}.`);
assert(new Set(regionsBase).size === regionsBase.length, 'В базовом справочнике есть повторяющиеся регионы.');
assert(regionsGeo?.type === 'FeatureCollection' && regionsGeo.features?.length === 89,
  `GeoJSON должен содержать 89 регионов; получено ${regionsGeo?.features?.length ?? 'неизвестно'}.`);
assert(new Set(regionsGeo.features.map((feature) => feature.properties?.name)).size === 89,
  'В GeoJSON отсутствуют названия регионов или есть повторы.');

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
assert(!missingGeometry.length && !unknownGeometry.length,
  `GeoJSON не совпадает со справочником: без геометрии [${missingGeometry.join(', ')}], неизвестные [${unknownGeometry.join(', ')}].`);

if (process.env.ALLOW_DEMO !== '1') {
  assert(meta.source === 'sovetmam' && meta.demo !== true,
    'Рабочий снимок имеет неверный источник или demo-флаг.');
  assert(measures.length >= 1000, `Рабочий снимок содержит только ${measures.length} мер.`);
  assert(Number(meta.loaded_link_count) === measures.length,
    'loaded_link_count не совпадает с числом мер.');
  assert(Number(meta.parse_error_count) === 0, 'Рабочий снимок содержит ошибки разбора.');
  if (Number(meta.page_reported_count)) {
    assert(measures.length >= Number(meta.page_reported_count) * 0.97,
      'Извлечено менее 97% сообщённого страницей числа мер.');
  }
}

assert(Number(meta.measure_count) === measures.length, 'measure_count не совпадает с числом мер.');
assert(Number(meta.detail_count) === measures.length, 'detail_count не совпадает с числом мер.');
assert(Number(detailManifest.measure_count) === measures.length, 'Манифест подробностей не совпадает с каталогом.');
assert(Number(detailManifest.detail_count) === measures.length, 'detail_count манифеста не совпадает с каталогом.');
assert(Number(detailManifest.shard_count) === Number(meta.detail_shard_count),
  'Число шардов подробностей расходится в метаданных.');

const ids = new Set();
const representedRegions = new Set();
for (const measure of measures) {
  for (const key of ['id', 'title', 'level', 'category', 'source_url']) {
    assert(measure?.[key], `Карточка без обязательного поля ${key}: ${JSON.stringify(measure)}`);
  }
  assert(!ids.has(measure.id), `Повтор идентификатора ${measure.id}.`);
  ids.add(measure.id);
  assert(['federal', 'regional'].includes(measure.level), `Недопустимый уровень у ${measure.id}.`);

  const sourceUrl = new URL(measure.source_url);
  assert(sourceUrl.protocol === 'https:' && sourceUrl.hostname === 'app.sovetmam.ru',
    `Недопустимый URL источника ${measure.source_url}.`);

  if (measure.level === 'regional') {
    assert(measure.region && regionsBase.includes(measure.region),
      `Регион отсутствует в базовом справочнике: ${measure.region}.`);
    representedRegions.add(measure.region);
  }
  assert(measure.content_hash && measure.fetched_at, `Нет метаданных целостности у ${measure.id}.`);
}

assert(Number(meta.region_count) === representedRegions.size,
  'region_count не совпадает с числом субъектов, представленных региональными карточками.');

const detailDirectory = resolve(siteRoot, 'data/details');
const shardFiles = (await readdir(detailDirectory))
  .filter((file) => /^\d{2}\.json$/.test(file))
  .sort();
assert(shardFiles.length === Number(detailManifest.shard_count),
  `Найдено ${shardFiles.length} шардов вместо ${detailManifest.shard_count}.`);

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
for (const file of shardFiles) {
  const shard = await readJson(resolve(detailDirectory, file));
  assert(shard && !Array.isArray(shard) && typeof shard === 'object', `Некорректный файл ${file}.`);
  for (const [id, detail] of Object.entries(shard)) {
    assert(!detailsById.has(id), `Подробная карточка ${id} встречается дважды.`);
    for (const key of ['steps', 'documents', 'notes', 'official_links']) {
      assert(Array.isArray(detail?.[key]), `В подробной карточке ${id} поле ${key} должно быть массивом.`);
    }
    assert(detail.steps.length > 0, `В подробной карточке ${id} не указан порядок оформления.`);
    for (const link of detail.official_links) {
      const url = new URL(link.url);
      assert(url.protocol === 'https:' && officialHosts.has(url.hostname),
        `В карточке ${id} недопустимая внешняя ссылка: ${link.url}`);
      assert(!forbiddenGenericUrls.has(link.url),
        `В карточке ${id} указана общая ссылка вместо страницы конкретной услуги: ${link.url}`);
      officialLinkCount += 1;
    }
    detailsById.set(id, detail);
  }
}

for (const id of ids) assert(detailsById.has(id), `Нет подробной карточки для ${id}.`);
assert(detailsById.size === measures.length, 'Количество подробных карточек не совпадает с каталогом.');
assert(officialLinkCount === Number(meta.official_link_count)
  && officialLinkCount === Number(detailManifest.official_link_count),
'Количество проверенных официальных ссылок не совпадает с метаданными.');

console.log([
  `Проверка завершена: ${measures.length} мер и подробных карточек;`,
  `${regionsBase.length} позиций регионального справочника;`,
  `${representedRegions.size} субъектов представлены в источнике;`,
  `${officialLinkCount} точных официальных ссылок;`,
  '4 пользовательские страницы и взаимные ссылки проверены.'
].join(' '));
