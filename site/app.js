import { buildIssueUrl, inferProviderType, safeLocalStorage } from './lib/platform-core.js';

const PAGE_SIZE = 12;
const SEARCH_DELAY = 180;
const FAVORITES_KEY = 'family-support:favorites:v1';

const state = {
  measures: [],
  filtered: [],
  shown: PAGE_SIZE,
  meta: null,
  allRegions: [],
  categoryCounts: new Map(),
  regionalCounts: new Map(),
  federalCount: 0,
  geoData: null,
  searchTimer: null,
  detailShards: new Map(),
  detailShardCount: 32,
  selectedMeasure: null,
  requestedMeasureId: null,
  favoriteIds: new Set(),
  favoritesOnly: false
};

const elements = {
  header: document.querySelector('#site-header'),
  heroForm: document.querySelector('#hero-search-form'),
  heroSearch: document.querySelector('#hero-search'),
  region: document.querySelector('#region-filter'),
  category: document.querySelector('#category-filter'),
  level: document.querySelector('#level-filter'),
  search: document.querySelector('#search-filter'),
  reset: document.querySelector('#reset-filters'),
  catalog: document.querySelector('#catalog'),
  count: document.querySelector('#result-count'),
  favoritesFilter: document.querySelector('#favorites-filter'),
  favoritesCount: document.querySelector('#favorites-count'),
  loadMore: document.querySelector('#load-more'),
  empty: document.querySelector('#empty-state'),
  snapshot: document.querySelector('#snapshot'),
  popular: document.querySelector('#popular-list'),
  categories: document.querySelector('#category-grid'),
  activeFilters: document.querySelector('#active-filters'),
  mapLabel: document.querySelector('#map-selection-label'),
  map: document.querySelector('#region-map'),
  mapLayer: document.querySelector('#region-map-layer'),
  mapContainer: document.querySelector('#region-map-container'),
  mapTooltip: document.querySelector('#map-tooltip'),
  mapSummaryRegion: document.querySelector('#map-summary-region'),
  mapSummaryDetails: document.querySelector('#map-summary-details'),
  statTotal: document.querySelector('#stat-total'),
  statRegions: document.querySelector('#stat-regions'),
  statFederal: document.querySelector('#stat-federal'),
  statRegional: document.querySelector('#stat-regional'),
  regionDialog: document.querySelector('#region-dialog'),
  regionSearch: document.querySelector('#region-search'),
  regionList: document.querySelector('#region-list'),
  measureDialog: document.querySelector('#measure-dialog'),
  measureDialogTitle: document.querySelector('#measure-dialog-title'),
  measureDialogScope: document.querySelector('#measure-dialog-scope'),
  measureDialogBody: document.querySelector('#measure-dialog-body'),
  toast: document.querySelector('#toast'),
  currentYear: document.querySelector('#current-year')
};

const MAP_REGION_ALIASES = new Map([
  ['Город Москва', 'Москва'],
  ['Город Санкт-Петербург', 'Санкт-Петербург'],
  ['Город Севастополь', 'Севастополь'],
  ['Кемеровская область – Кузбасс', 'Кемеровская область — Кузбасс'],
  ['Республика Северная Осетия – Алания', 'Республика Северная Осетия — Алания'],
  ['Ханты-Мансийский автономный округ – Югра', 'Ханты-Мансийский автономный округ — Югра'],
  ['Чувашская Республика - Чувашия', 'Чувашская Республика — Чувашия']
]);

function normalizeMapRegion(value) {
  return MAP_REGION_ALIASES.get(value) ?? value;
}

const numberFormatter = new Intl.NumberFormat('ru-RU');
const storage = safeLocalStorage();

function normalize(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(value) {
  if (!value) return 'дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Moscow'
      }).format(date);
}

function pluralMeasures(value) {
  const n = Math.abs(Number(value)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'мер';
  if (n1 > 1 && n1 < 5) return 'меры';
  if (n1 === 1) return 'мера';
  return 'мер';
}

function icon(name, className = '') {
  const element = document.createElement('i');
  element.dataset.lucide = name;
  element.setAttribute('aria-hidden', 'true');
  if (className) element.className = className;
  return element;
}

function refreshIcons() {
  if (!window.lucide?.createIcons) return;
  window.lucide.createIcons({
    attrs: {
      'aria-hidden': 'true'
    }
  });
}

const OFFICIAL_HOSTS = new Set([
  'gosuslugi.ru',
  'www.gosuslugi.ru',
  'sfr.gov.ru',
  'nalog.gov.ru',
  'www.nalog.gov.ru',
  'trudvsem.ru',
  'www.trudvsem.ru'
]);

function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && OFFICIAL_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function officialServiceLogo(url) {
  const hostname = new URL(url).hostname;
  const logo = document.createElement('span');
  logo.className = 'official-service-logo';
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.src = hostname === 'sfr.gov.ru' ? './assets/logo-sfr.png' : './assets/logo-gosuslugi.svg';
  logo.append(image);
  return logo;
}

function categoryIcon(category) {
  const value = normalize(category);
  if (/деньг|выплат|пособ|капитал|финанс/.test(value)) return 'russian-ruble';
  if (/жиль|ипотек|земел/.test(value)) return 'house';
  if (/жкх|коммун/.test(value)) return 'house-plug';
  if (/здоров|медиц|инвалид/.test(value)) return 'heart-pulse';
  if (/образ|школ|детсад|вуз|студент/.test(value)) return 'graduation-cap';
  if (/проезд|транспорт/.test(value)) return 'bus-front';
  if (/отдых|оздоров|туризм/.test(value)) return 'trees';
  if (/культур|музе|театр/.test(value)) return 'ticket-check';
  if (/налог/.test(value)) return 'badge-percent';
  if (/скидк|магазин/.test(value)) return 'tags';
  if (/работ|занят|доход/.test(value)) return 'briefcase-business';
  if (/социал|защит|льгот/.test(value)) return 'shield-check';
  if (/рожд|ребен|семь|родител/.test(value)) return 'baby';
  return 'circle-ellipsis';
}

function categoryUsesRed(category) {
  return /деньг|выплат|пособ|здоров|медиц|рожд|ребен|культур/.test(normalize(category));
}

function sourceName(measure) {
  if (measure.source_name) return measure.source_name;
  if (measure.source === 'sovetmam') return '«Шпаргалка для родителей»';
  if (measure.source === 'demo') return 'Демонстрационный набор';
  return measure.source || 'Внешний источник';
}

function levelLabel(measure) {
  return measure.level === 'federal' ? 'Федеральная мера' : 'Региональная мера';
}

function clearGeneratedOptions(select) {
  for (const option of [...select.options].slice(1)) option.remove();
}

function appendOptions(select, values) {
  clearGeneratedOptions(select);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function ensureSelectOption(select, value) {
  if (!value || [...select.options].some((option) => option.value === value)) return;
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  select.append(option);
}


function restoreFavorites() {
  try {
    const parsed = JSON.parse(storage.get(FAVORITES_KEY, '[]'));
    state.favoriteIds = new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : []);
  } catch {
    state.favoriteIds = new Set();
  }
}

function persistFavorites() {
  storage.set(FAVORITES_KEY, JSON.stringify([...state.favoriteIds]));
}

function isFavorite(measure) {
  return Boolean(measure?.id && state.favoriteIds.has(measure.id));
}

function setFavoriteButtonState(button, measure, { labeled = false } = {}) {
  const active = isFavorite(measure);
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? `Удалить «${measure.title}» из избранного` : `Добавить «${measure.title}» в избранное`);
  const text = button.querySelector('[data-favorite-label]');
  if (labeled && text) text.textContent = active ? 'В избранном' : 'В избранное';
}

function updateFavoriteControls() {
  const count = state.favoriteIds.size;
  if (elements.favoritesCount) elements.favoritesCount.textContent = numberFormatter.format(count);
  if (elements.favoritesFilter) {
    elements.favoritesFilter.classList.toggle('is-active', state.favoritesOnly);
    elements.favoritesFilter.setAttribute('aria-pressed', String(state.favoritesOnly));
    elements.favoritesFilter.title = count
      ? `Сохранено карточек: ${numberFormatter.format(count)}`
      : 'Избранное хранится только в этом браузере';
  }
}

function toggleFavorite(measure, button = null, options = {}) {
  if (!measure?.id) return;
  if (isFavorite(measure)) state.favoriteIds.delete(measure.id);
  else state.favoriteIds.add(measure.id);
  persistFavorites();
  if (button) setFavoriteButtonState(button, measure, options);
  updateFavoriteControls();

  if (state.favoritesOnly) applyFilters();
  else renderCatalog();

  showToast(isFavorite(measure) ? 'Карточка сохранена в избранное' : 'Карточка удалена из избранного');
}

function createFavoriteButton(measure, { labeled = false, className = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'measure-card__favorite';
  button.append(icon('heart'));
  if (labeled) {
    const label = document.createElement('span');
    label.dataset.favoriteLabel = '';
    button.append(label);
  }
  setFavoriteButtonState(button, measure, { labeled });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(measure, button, { labeled });
  });
  return button;
}

function measurePermalink(measure) {
  const url = new URL(location.href);
  url.searchParams.set('measure', measure.id);
  return url.href;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function shareMeasure(measure) {
  const url = measurePermalink(measure);
  try {
    if (navigator.share) {
      await navigator.share({ title: measure.title, text: 'Карточка меры поддержки семьи с детьми', url });
      return;
    }
    await copyText(url);
    showToast('Ссылка на карточку скопирована');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Не удалось скопировать ссылку');
  }
}

function syncQuery() {
  const params = new URLSearchParams();
  if (elements.region.value) params.set('region', elements.region.value);
  if (elements.category.value) params.set('category', elements.category.value);
  if (elements.level.value) params.set('level', elements.level.value);
  if (elements.search.value.trim()) params.set('q', elements.search.value.trim());
  if (state.favoritesOnly) params.set('favorites', '1');
  const measureId = state.selectedMeasure?.id || state.requestedMeasureId;
  if (measureId) params.set('measure', measureId);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
}

function restoreQuery() {
  const params = new URLSearchParams(location.search);
  const region = params.get('region') ?? '';
  const category = params.get('category') ?? '';
  ensureSelectOption(elements.region, region);
  ensureSelectOption(elements.category, category);
  elements.region.value = region;
  elements.category.value = category;
  elements.level.value = ['federal', 'regional'].includes(params.get('level')) ? params.get('level') : '';
  elements.search.value = params.get('q') ?? '';
  elements.heroSearch.value = elements.search.value;
  state.favoritesOnly = params.get('favorites') === '1';
  state.requestedMeasureId = params.get('measure') || null;
  updateFavoriteControls();
}

function updateSnapshot() {
  const meta = state.meta ?? {};
  const span = elements.snapshot.querySelector('span');
  elements.snapshot.classList.toggle('is-demo', Boolean(meta.demo || meta.source === 'demo'));

  if (meta.demo || meta.source === 'demo') {
    span.textContent = `Демонстрационный набор интерфейса: ${numberFormatter.format(state.measures.length)} ${pluralMeasures(state.measures.length)}. После запуска обновления данные будут заменены каталогом источника.`;
    return;
  }

  const source = meta.source === 'sovetmam' ? '«Шпаргалка для родителей»' : meta.source || 'внешний источник';
  span.textContent = `Источник: ${source}. Снимок данных от ${formatDate(meta.generated_at)}. ${numberFormatter.format(state.measures.length)} ${pluralMeasures(state.measures.length)}.`;
}

function updateStats() {
  const federal = state.measures.filter((measure) => measure.level === 'federal').length;
  const regional = state.measures.filter((measure) => measure.level === 'regional').length;
  const regions = new Set(state.measures.map((measure) => measure.region).filter(Boolean)).size;
  elements.statTotal.textContent = numberFormatter.format(state.measures.length);
  elements.statRegions.textContent = numberFormatter.format(regions);
  elements.statFederal.textContent = numberFormatter.format(federal);
  elements.statRegional.textContent = numberFormatter.format(regional);
}

function createStatusTag(text, warm = false) {
  const tag = document.createElement('span');
  tag.className = `status-tag${warm ? ' status-tag--warm' : ''}`;
  tag.textContent = text;
  return tag;
}

function createPopularItem(measure) {
  const article = document.createElement('article');
  article.className = 'popular-item';

  const iconBox = document.createElement('span');
  iconBox.className = `popular-item__icon${categoryUsesRed(measure.category) ? ' is-red' : ''}`;
  iconBox.append(icon(categoryIcon(measure.category)));

  const body = document.createElement('div');
  body.className = 'popular-item__body';
  const title = document.createElement('h3');
  title.textContent = measure.title;
  const summary = document.createElement('p');
  summary.textContent = measure.summary || measure.benefit || 'Подробные условия доступны во внутренней карточке меры.';
  const meta = document.createElement('div');
  meta.className = 'popular-item__meta';
  meta.append(createStatusTag(levelLabel(measure)));
  if (measure.category) meta.append(createStatusTag(measure.category, true));
  body.append(title, summary, meta);

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'popular-item__link';
  link.textContent = 'Подробнее';
  link.addEventListener('click', () => openMeasureDialog(measure));

  article.append(iconBox, body, link);
  return article;
}

function selectPopularMeasures() {
  const priorities = [
    /единое пособие/i,
    /семейная ипотека/i,
    /материнск.*капитал/i
  ];
  const selected = [];
  for (const pattern of priorities) {
    const match = state.measures.find((measure) => pattern.test(measure.title) && !selected.includes(measure));
    if (match) selected.push(match);
  }
  for (const measure of state.measures) {
    if (selected.length >= 3) break;
    if (!selected.includes(measure)) selected.push(measure);
  }
  return selected.slice(0, 3);
}

function renderPopular() {
  elements.popular.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const measure of selectPopularMeasures()) fragment.append(createPopularItem(measure));
  elements.popular.append(fragment);
  refreshIcons();
}

function buildCategoryCounts() {
  state.categoryCounts = new Map();
  state.regionalCounts = new Map();
  state.federalCount = 0;
  for (const measure of state.measures) {
    const category = measure.category || 'Прочие меры';
    state.categoryCounts.set(category, (state.categoryCounts.get(category) || 0) + 1);
    if (measure.level === 'federal') {
      state.federalCount += 1;
    } else if (measure.region) {
      state.regionalCounts.set(measure.region, (state.regionalCounts.get(measure.region) || 0) + 1);
    }
  }
}

function geometryRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates;
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.flatMap((polygon) => polygon);
  return [];
}

function geometryBounds(features) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const feature of features) {
    for (const ring of geometryRings(feature.geometry)) {
      for (const coordinate of ring) {
        bounds.minX = Math.min(bounds.minX, coordinate[0]);
        bounds.maxX = Math.max(bounds.maxX, coordinate[0]);
        bounds.minY = Math.min(bounds.minY, coordinate[1]);
        bounds.maxY = Math.max(bounds.maxY, coordinate[1]);
      }
    }
  }
  return bounds;
}

function createMapProjection(features, width = 1100, height = 430, padding = 18) {
  const bounds = geometryBounds(features);
  const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
  const minMercator = mercatorY(bounds.minY);
  const maxMercator = mercatorY(bounds.maxY);
  return ([longitude, latitude]) => [
    padding + ((longitude - bounds.minX) / (bounds.maxX - bounds.minX)) * (width - padding * 2),
    padding + ((maxMercator - mercatorY(latitude)) / (maxMercator - minMercator)) * (height - padding * 2)
  ];
}

function geometryPath(geometry, project) {
  return geometryRings(geometry).map((ring) => ring.map((coordinate, index) => {
    const [x, y] = project(coordinate);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z').join(' ');
}

function mapCountClass(count, maximum) {
  if (!count) return 'has-no-regional-data';
  const ratio = count / Math.max(maximum, 1);
  if (ratio >= 0.66) return 'has-high-data';
  if (ratio >= 0.33) return 'has-medium-data';
  return 'has-low-data';
}

function mapMeasureText(region) {
  const regional = state.regionalCounts.get(region) || 0;
  const available = state.federalCount + regional;
  return {
    regional,
    available,
    description: regional
      ? `${numberFormatter.format(regional)} ${pluralMeasures(regional)} регионального уровня представлены в источнике · ${numberFormatter.format(state.federalCount)} ${pluralMeasures(state.federalCount)} федерального уровня · всего в выборке ${numberFormatter.format(available)}`
      : `Региональные сведения в текущем источнике не представлены · ${numberFormatter.format(state.federalCount)} ${pluralMeasures(state.federalCount)} федерального уровня остаются в каталоге`
  };
}

function positionMapTooltip(clientX, clientY) {
  const containerBounds = elements.mapContainer.getBoundingClientRect();
  const tooltipBounds = elements.mapTooltip.getBoundingClientRect();
  const left = Math.min(Math.max(clientX - containerBounds.left + 14, 8), containerBounds.width - tooltipBounds.width - 8);
  const top = Math.min(Math.max(clientY - containerBounds.top + 14, 8), containerBounds.height - tooltipBounds.height - 8);
  elements.mapTooltip.style.left = `${left}px`;
  elements.mapTooltip.style.top = `${top}px`;
}

function showMapTooltip(region, clientX, clientY) {
  const counts = mapMeasureText(region);
  const title = document.createElement('strong');
  title.textContent = region;
  const details = document.createElement('span');
  details.textContent = counts.description;
  elements.mapTooltip.replaceChildren(title, details);
  elements.mapTooltip.hidden = false;
  positionMapTooltip(clientX, clientY);
}

function hideMapTooltip() {
  elements.mapTooltip.hidden = true;
}

function updateMapSelection() {
  const selectedRegion = elements.region.value;
  for (const path of elements.mapLayer?.querySelectorAll('.region-map__region') ?? []) {
    const selected = path.dataset.region === selectedRegion;
    path.classList.toggle('is-selected', selected);
    path.setAttribute('aria-pressed', String(selected));
  }

  if (selectedRegion) {
    const counts = mapMeasureText(selectedRegion);
    elements.mapSummaryRegion.textContent = selectedRegion;
    elements.mapSummaryDetails.textContent = counts.description;
  } else {
    elements.mapSummaryRegion.textContent = 'Вся Россия';
    elements.mapSummaryDetails.textContent = `${numberFormatter.format(state.measures.length)} ${pluralMeasures(state.measures.length)} в каталоге · ${numberFormatter.format(state.federalCount)} федеральных карточек · региональные записи представлены для ${numberFormatter.format(state.regionalCounts.size)} из ${numberFormatter.format(state.allRegions.length)} субъектов`;
  }
}

function renderRegionMap() {
  elements.mapLayer?.replaceChildren();
  const features = state.geoData?.features;
  if (!Array.isArray(features) || !features.length) {
    elements.mapSummaryDetails.textContent = 'Геометрия регионов временно недоступна; используйте список субъектов.';
    return;
  }

  const project = createMapProjection(features);
  const maximum = Math.max(...state.regionalCounts.values(), 1);
  const fragment = document.createDocumentFragment();
  const svgNamespace = 'http://www.w3.org/2000/svg';

  for (const feature of features) {
    const region = normalizeMapRegion(feature.properties?.name || feature.properties?.territory_name || '');
    if (!region) continue;
    const regionalCount = state.regionalCounts.get(region) || 0;
    const availableCount = state.federalCount + regionalCount;
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', geometryPath(feature.geometry, project));
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', regionalCount
      ? `${region}: в источнике представлено ${regionalCount} региональных карточек; федеральных карточек ${state.federalCount}; всего в выборке ${availableCount}`
      : `${region}: региональные сведения в текущем источнике не представлены; федеральных карточек ${state.federalCount}`);
    path.setAttribute('aria-pressed', 'false');
    path.setAttribute('fill-rule', 'evenodd');
    path.classList.add('region-map__region', mapCountClass(regionalCount, maximum));
    path.dataset.region = region;

    const title = document.createElementNS(svgNamespace, 'title');
    title.textContent = mapMeasureText(region).description;
    path.append(title);

    const selectFromMap = () => selectRegion(elements.region.value === region ? '' : region);
    path.addEventListener('click', selectFromMap);
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectFromMap();
      }
    });
    path.addEventListener('pointerenter', (event) => showMapTooltip(region, event.clientX, event.clientY));
    path.addEventListener('pointermove', (event) => positionMapTooltip(event.clientX, event.clientY));
    path.addEventListener('pointerleave', hideMapTooltip);
    path.addEventListener('focus', () => {
      const bounds = path.getBoundingClientRect();
      showMapTooltip(region, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    });
    path.addEventListener('blur', hideMapTooltip);
    fragment.append(path);
  }

  elements.mapLayer.append(fragment);
  updateMapSelection();
}

function renderCategories() {
  elements.categories.replaceChildren();
  const categories = [...state.categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));

  const fragment = document.createDocumentFragment();
  for (const [category, count] of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-card';
    button.dataset.category = category;

    const iconBox = document.createElement('span');
    iconBox.className = 'category-card__icon';
    iconBox.append(icon(categoryIcon(category)));

    const title = document.createElement('strong');
    title.textContent = category;
    const total = document.createElement('span');
    total.textContent = `${numberFormatter.format(count)} ${pluralMeasures(count)}`;

    button.append(iconBox, title, total);
    button.addEventListener('click', () => {
      ensureSelectOption(elements.category, category);
      elements.category.value = category;
      applyFilters();
      document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    fragment.append(button);
  }
  elements.categories.append(fragment);
  updateActiveCategory();
  refreshIcons();
}

function updateActiveCategory() {
  for (const card of elements.categories.querySelectorAll('.category-card')) {
    card.classList.toggle('is-active', card.dataset.category === elements.category.value);
  }
}

function createMeasureCard(measure) {
  const article = document.createElement('article');
  article.className = 'measure-card';

  const top = document.createElement('div');
  top.className = 'measure-card__top';

  const iconBox = document.createElement('span');
  iconBox.className = `measure-card__icon${categoryUsesRed(measure.category) ? ' is-red' : ''}`;
  iconBox.append(icon(categoryIcon(measure.category)));

  const tags = document.createElement('div');
  tags.className = 'measure-card__tags';
  tags.append(createStatusTag(levelLabel(measure)));
  if (measure.level === 'regional' && measure.region) tags.append(createStatusTag(measure.region, true));
  const headActions = document.createElement('div');
  headActions.className = 'measure-card__head-actions';
  headActions.append(tags, createFavoriteButton(measure));
  top.append(iconBox, headActions);

  const title = document.createElement('h3');
  title.textContent = measure.title;

  const summary = document.createElement('p');
  summary.className = 'measure-card__summary';
  summary.textContent = measure.summary || 'Краткое описание отсутствует. Откройте внутреннюю карточку с условиями.';

  article.append(top, title, summary);

  if (measure.benefit) {
    const benefit = document.createElement('div');
    benefit.className = 'measure-card__benefit';
    benefit.append(icon('gift'));
    const benefitText = document.createElement('span');
    benefitText.textContent = measure.benefit;
    benefit.append(benefitText);
    article.append(benefit);
  }

  const footer = document.createElement('div');
  footer.className = 'measure-card__footer';
  const source = document.createElement('span');
  source.className = 'measure-card__source';
  source.textContent = `Источник: ${sourceName(measure)}`;

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'measure-card__link';
  const linkText = document.createElement('span');
  linkText.textContent = 'Подробнее';
  link.append(linkText, icon('arrow-right'));
  link.addEventListener('click', () => openMeasureDialog(measure));
  footer.append(source, link);
  article.append(footer);
  return article;
}

function renderActiveFilters() {
  elements.activeFilters.replaceChildren();
  const filters = [];
  if (elements.region.value) filters.push(['region', `Регион: ${elements.region.value}`]);
  if (elements.category.value) filters.push(['category', `Категория: ${elements.category.value}`]);
  if (elements.level.value) filters.push(['level', elements.level.value === 'federal' ? 'Только федеральные' : 'Только региональные']);
  if (elements.search.value.trim()) filters.push(['search', `Поиск: ${elements.search.value.trim()}`]);
  if (state.favoritesOnly) filters.push(['favorites', 'Только избранное']);

  for (const [key, label] of filters) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    const text = document.createElement('span');
    text.textContent = label;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Удалить фильтр «${label}»`);
    remove.append(icon('x'));
    remove.addEventListener('click', () => {
      if (key === 'region') elements.region.value = '';
      if (key === 'category') elements.category.value = '';
      if (key === 'level') elements.level.value = '';
      if (key === 'search') {
        elements.search.value = '';
        elements.heroSearch.value = '';
      }
      if (key === 'favorites') state.favoritesOnly = false;
      applyFilters();
    });
    chip.append(text, remove);
    elements.activeFilters.append(chip);
  }
  refreshIcons();
}

function renderCatalog() {
  elements.catalog.replaceChildren();
  const visible = state.filtered.slice(0, state.shown);
  const fragment = document.createDocumentFragment();
  for (const measure of visible) fragment.append(createMeasureCard(measure));
  elements.catalog.append(fragment);

  const total = state.filtered.length;
  elements.count.textContent = `Найдено: ${numberFormatter.format(total)} ${pluralMeasures(total)}`;
  elements.empty.hidden = total !== 0;
  elements.catalog.hidden = total === 0;
  elements.loadMore.hidden = state.shown >= total || total === 0;
  if (!elements.loadMore.hidden) {
    const remaining = Math.max(total - state.shown, 0);
    elements.loadMore.querySelector('span').textContent = `Показать ещё (${numberFormatter.format(remaining)})`;
  }
  renderActiveFilters();
  refreshIcons();
}

function updateMapLabel() {
  if (elements.region.value) {
    elements.mapLabel.textContent = `Выбран регион: ${elements.region.value}. Федеральные меры также включены.`;
  } else {
    elements.mapLabel.textContent = 'Сейчас показаны меры по всей России';
  }
}

function applyFilters({ preservePage = false } = {}) {
  const region = elements.region.value;
  const category = elements.category.value;
  const level = elements.level.value;
  const query = normalize(elements.search.value);

  state.filtered = state.measures.filter((measure) => {
    const regionMatches = !region || measure.level === 'federal' || measure.region === region;
    const categoryMatches = !category || measure.category === category;
    const levelMatches = !level || measure.level === level;
    const haystack = normalize([
      measure.title,
      measure.summary,
      measure.benefit,
      measure.region,
      measure.category,
      sourceName(measure)
    ].join(' '));
    const favoriteMatches = !state.favoritesOnly || state.favoriteIds.has(measure.id);
    return regionMatches && categoryMatches && levelMatches && favoriteMatches && (!query || haystack.includes(query));
  });

  state.filtered.sort((a, b) => {
    if (region && a.level !== b.level) return a.level === 'federal' ? -1 : 1;
    return (a.region ?? '').localeCompare(b.region ?? '', 'ru') || a.title.localeCompare(b.title, 'ru');
  });

  if (!preservePage) state.shown = PAGE_SIZE;
  elements.heroSearch.value = elements.search.value;
  syncQuery();
  updateMapLabel();
  updateMapSelection();
  updateActiveCategory();
  renderCatalog();
  renderRegionList(elements.regionSearch.value);
  updateFavoriteControls();
}

function resetFilters({ scroll = false } = {}) {
  elements.region.value = '';
  elements.category.value = '';
  elements.level.value = '';
  elements.search.value = '';
  elements.heroSearch.value = '';
  state.favoritesOnly = false;
  applyFilters();
  if (scroll) document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function regionNamesFromPayload(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => typeof item === 'string' ? item : item?.name)
    .filter(Boolean);
}

function renderRegionList(query = '') {
  elements.regionList.replaceChildren();
  const normalizedQuery = normalize(query);
  const fragment = document.createDocumentFragment();

  const all = document.createElement('button');
  all.type = 'button';
  all.className = `region-option region-option--all${elements.region.value ? '' : ' is-selected'}`;
  all.textContent = 'Вся Россия';
  all.addEventListener('click', () => selectRegion(''));
  fragment.append(all);

  const filteredRegions = state.allRegions.filter((region) => !normalizedQuery || normalize(region).includes(normalizedQuery));
  for (const region of filteredRegions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `region-option${elements.region.value === region ? ' is-selected' : ''}`;
    button.textContent = region;
    button.addEventListener('click', () => selectRegion(region));
    fragment.append(button);
  }

  elements.regionList.append(fragment);
}

function selectRegion(region) {
  ensureSelectOption(elements.region, region);
  elements.region.value = region;
  applyFilters();
  closeRegionDialog();
  showToast(region ? `Выбран регион: ${region}` : 'Показаны меры по всей России');
}

function openRegionDialog() {
  if (!elements.regionDialog?.showModal) return;
  elements.regionSearch.value = '';
  renderRegionList('');
  elements.regionDialog.showModal();
  document.body.classList.add('dialog-open');
  window.setTimeout(() => elements.regionSearch.focus(), 40);
}

function closeRegionDialog() {
  if (elements.regionDialog?.open) elements.regionDialog.close();
  syncDialogState();
}

function detailShardKey(id, shardCount = state.detailShardCount) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % shardCount;
}

async function loadMeasureDetail(measure) {
  const shardKey = String(detailShardKey(measure.id)).padStart(2, '0');
  if (!state.detailShards.has(shardKey)) {
    const response = await fetch(`./data/details/${shardKey}.json`, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Не удалось загрузить подробную карточку.');
    state.detailShards.set(shardKey, await response.json());
  }
  const detail = state.detailShards.get(shardKey)?.[measure.id];
  if (!detail) throw new Error('Подробная карточка этой меры временно недоступна.');
  return detail;
}

function createDetailSection(title, items, { ordered = false, iconName = 'list-checks' } = {}) {
  if (!Array.isArray(items) || !items.length) return null;
  const section = document.createElement('section');
  section.className = 'measure-detail-section';
  const heading = document.createElement('h3');
  heading.append(icon(iconName));
  const headingText = document.createElement('span');
  headingText.textContent = title;
  heading.append(headingText);
  const list = document.createElement(ordered ? 'ol' : 'ul');
  for (const item of items) {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    list.append(listItem);
  }
  section.append(heading, list);
  return section;
}

function renderMeasureDetail(measure, detail) {
  const fragment = document.createDocumentFragment();
  const links = (detail.official_links ?? [])
    .map((link) => ({ ...link, safeUrl: officialUrl(link.url) }))
    .filter((link) => link.safeUrl);

  const toolbar = document.createElement('div');
  toolbar.className = 'measure-detail-toolbar';
  const favorite = createFavoriteButton(measure, { labeled: true, className: 'measure-detail-favorite' });
  const share = document.createElement('button');
  share.type = 'button';
  share.append(icon('share-2'));
  const shareText = document.createElement('span');
  shareText.textContent = 'Поделиться';
  share.append(shareText);
  share.addEventListener('click', () => shareMeasure(measure));
  const report = document.createElement('a');
  report.href = buildIssueUrl(measure);
  report.target = '_blank';
  report.rel = 'noopener noreferrer';
  report.append(icon('message-square-warning'));
  const reportText = document.createElement('span');
  reportText.textContent = 'Сообщить о неточности';
  report.append(reportText);
  toolbar.append(favorite, share, report);
  fragment.append(toolbar);

  const quality = document.createElement('div');
  quality.className = `measure-detail-quality ${links.length ? 'is-verified' : 'is-caution'}`;
  quality.append(icon(links.length ? 'badge-check' : 'triangle-alert'));
  const qualityText = document.createElement('div');
  const qualityTitle = document.createElement('strong');
  qualityTitle.textContent = links.length ? 'Есть точный официальный маршрут' : 'Официальная ссылка ещё не подтверждена';
  const qualityDescription = document.createElement('p');
  qualityDescription.textContent = links.length
    ? 'Перед подачей заявления сопоставьте условия карточки с актуальной официальной страницей услуги.'
    : 'Карточка основана на информационном источнике. Не считайте её подтверждением права и уточните условия у уполномоченного органа.';
  qualityText.append(qualityTitle, qualityDescription);
  quality.append(qualityText);
  fragment.append(quality);

  const overview = document.createElement('div');
  overview.className = 'measure-detail-overview';
  if (measure.summary) {
    const summary = document.createElement('p');
    summary.textContent = measure.summary;
    overview.append(summary);
  }
  if (measure.benefit) {
    const benefit = document.createElement('div');
    benefit.className = 'measure-detail-benefit';
    benefit.append(icon('gift'));
    const text = document.createElement('span');
    text.textContent = measure.benefit;
    benefit.append(text);
    overview.append(benefit);
  }
  fragment.append(overview);

  const sections = [
    createDetailSection('Как оформить', detail.steps, { ordered: true, iconName: 'list-ordered' }),
    createDetailSection('Какие документы нужны', detail.documents, { iconName: 'files' }),
    createDetailSection('Полезно знать', detail.notes, { iconName: 'lightbulb' })
  ].filter(Boolean);
  fragment.append(...sections);

  if (links.length) {
    const actionSection = document.createElement('section');
    actionSection.className = 'measure-detail-actions';
    const actionTitle = document.createElement('h3');
    actionTitle.textContent = 'Официальные сервисы';
    const actionHint = document.createElement('p');
    actionHint.textContent = 'Ссылки ведут прямо к странице услуги или форме заявления на официальном портале.';
    actionSection.append(actionTitle, actionHint);
    const actionList = document.createElement('div');
    actionList.className = 'measure-detail-actions__list';
    for (const link of links) {
      const anchor = document.createElement('a');
      anchor.href = link.safeUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      const label = document.createElement('span');
      const service = document.createElement('small');
      service.textContent = link.service;
      const title = document.createElement('strong');
      title.textContent = link.title;
      label.append(service, title);
      anchor.append(officialServiceLogo(link.safeUrl), label, icon('arrow-up-right'));
      actionList.append(anchor);
    }
    actionSection.append(actionList);
    fragment.append(actionSection);
  }

  const provider = inferProviderType(measure);
  const metadata = document.createElement('dl');
  metadata.className = 'measure-detail-meta';
  const metadataRows = [
    ['Поставщик / уровень', `${provider.label}${provider.inferred ? ' (определено автоматически, требует проверки)' : ''}`],
    ['Территория', measure.level === 'regional' ? (measure.region || 'Регион не указан') : 'Российская Федерация'],
    ['Источник описания', sourceName(measure)],
    ['Дата получения карточки', formatDate(measure.fetched_at)],
    ['Официальный маршрут', links.length ? `Подтверждено ссылок: ${links.length}` : 'В карточке отсутствует'],
    ['Статус сведений', measure.level === 'regional' ? 'Региональная запись представлена в текущем источнике' : 'Федеральная запись']
  ];
  for (const [term, value] of metadataRows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    metadata.append(dt, dd);
  }
  fragment.append(metadata);

  const attribution = document.createElement('p');
  attribution.className = 'measure-detail-attribution';
  attribution.textContent = 'Описание систематизировано по материалам информационного каталога «Шпаргалка для родителей». Оно носит справочный характер и не является решением о назначении поддержки.';
  fragment.append(attribution);

  elements.measureDialogBody.replaceChildren(fragment);
  refreshIcons();
}

function renderMeasureDetailError(error) {
  const wrapper = document.createElement('div');
  wrapper.className = 'measure-detail-error';
  wrapper.append(icon('triangle-alert'));
  const title = document.createElement('h3');
  title.textContent = 'Подробности не загрузились';
  const message = document.createElement('p');
  message.textContent = String(error?.message ?? error);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Попробовать ещё раз';
  retry.addEventListener('click', () => openMeasureDialog(state.selectedMeasure, { reuse: true }));
  wrapper.append(title, message, retry);
  elements.measureDialogBody.replaceChildren(wrapper);
  refreshIcons();
}

function syncDialogState() {
  document.body.classList.toggle('dialog-open', Boolean(elements.regionDialog?.open || elements.measureDialog?.open));
}

async function openMeasureDialog(measure, { reuse = false } = {}) {
  if (!measure || !elements.measureDialog?.showModal) return;
  state.selectedMeasure = measure;
  state.requestedMeasureId = measure.id;
  syncQuery();
  elements.measureDialogTitle.textContent = measure.title;
  elements.measureDialogScope.textContent = [levelLabel(measure), measure.region, measure.category].filter(Boolean).join(' · ');

  const loading = document.createElement('div');
  loading.className = 'measure-dialog__loading';
  loading.append(icon('loader-circle'));
  const loadingText = document.createElement('p');
  loadingText.textContent = 'Загружаем подробные условия…';
  loading.append(loadingText);
  elements.measureDialogBody.replaceChildren(loading);
  if (!reuse && !elements.measureDialog.open) elements.measureDialog.showModal();
  syncDialogState();
  refreshIcons();

  try {
    const detail = await loadMeasureDetail(measure);
    if (state.selectedMeasure?.id === measure.id && elements.measureDialog.open) {
      renderMeasureDetail(measure, detail);
    }
  } catch (error) {
    if (state.selectedMeasure?.id === measure.id && elements.measureDialog.open) renderMeasureDetailError(error);
  }
}

function closeMeasureDialog() {
  if (elements.measureDialog?.open) elements.measureDialog.close();
  state.selectedMeasure = null;
  state.requestedMeasureId = null;
  syncQuery();
  syncDialogState();
}

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function bindEvents() {
  elements.heroForm.addEventListener('submit', (event) => {
    event.preventDefault();
    elements.search.value = elements.heroSearch.value.trim();
    applyFilters();
    document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  elements.heroSearch.addEventListener('input', () => {
    elements.search.value = elements.heroSearch.value;
  });

  for (const select of [elements.region, elements.category, elements.level]) {
    select.addEventListener('change', () => applyFilters());
  }

  elements.search.addEventListener('input', () => {
    elements.heroSearch.value = elements.search.value;
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => applyFilters(), SEARCH_DELAY);
  });

  elements.reset.addEventListener('click', () => resetFilters());
  document.querySelectorAll('[data-reset-filters]').forEach((button) => {
    button.addEventListener('click', () => resetFilters());
  });

  elements.favoritesFilter?.addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    applyFilters();
    document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  elements.loadMore.addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    renderCatalog();
  });

  document.querySelectorAll('[data-open-regions]').forEach((button) => {
    button.addEventListener('click', () => {
      openRegionDialog();
    });
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', closeRegionDialog);
  });

  elements.regionSearch.addEventListener('input', () => renderRegionList(elements.regionSearch.value));
  elements.regionDialog.addEventListener('close', syncDialogState);
  elements.regionDialog.addEventListener('click', (event) => {
    const bounds = elements.regionDialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) closeRegionDialog();
  });

  document.querySelectorAll('[data-close-measure]').forEach((button) => {
    button.addEventListener('click', closeMeasureDialog);
  });
  elements.measureDialog.addEventListener('close', () => {
    state.selectedMeasure = null;
    state.requestedMeasureId = null;
    syncQuery();
    syncDialogState();
  });
  elements.measureDialog.addEventListener('click', (event) => {
    const bounds = elements.measureDialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) closeMeasureDialog();
  });

  window.addEventListener('scroll', () => {
    elements.header.classList.toggle('is-scrolled', window.scrollY > 8);
  }, { passive: true });
}

async function loadData() {
  const [measuresResponse, metaResponse, baseRegionsResponse, geoResponse] = await Promise.all([
    fetch('./data/measures.json', { cache: 'no-store' }),
    fetch('./data/meta.json', { cache: 'no-store' }),
    fetch('./data/regions-base.json', { cache: 'force-cache' }).catch(() => null),
    fetch('./data/ru-regions.geojson', { cache: 'force-cache' }).catch(() => null)
  ]);

  if (!measuresResponse.ok || !metaResponse.ok) throw new Error('Не удалось загрузить каталог мер поддержки.');
  const measures = await measuresResponse.json();
  const meta = await metaResponse.json();
  const baseRegions = baseRegionsResponse?.ok ? await baseRegionsResponse.json() : [];
  const geoData = geoResponse?.ok ? await geoResponse.json() : null;
  return { measures, meta, baseRegions, geoData };
}

async function init() {
  elements.currentYear.textContent = String(new Date().getFullYear());
  restoreFavorites();
  updateFavoriteControls();
  bindEvents();
  refreshIcons();

  try {
    const { measures, meta, baseRegions, geoData } = await loadData();
    state.measures = Array.isArray(measures) ? measures : [];
    const currentIds = new Set(state.measures.map((measure) => measure.id));
    state.favoriteIds = new Set([...state.favoriteIds].filter((id) => currentIds.has(id)));
    persistFavorites();
    updateFavoriteControls();
    state.meta = meta;
    state.detailShardCount = Math.max(1, Number(meta.detail_shard_count) || 32);
    state.geoData = geoData;

    const baseRegionNames = regionNamesFromPayload(baseRegions);
    const measureRegionNames = state.measures.map((measure) => measure.region).filter(Boolean);
    state.allRegions = [...new Set([...baseRegionNames, ...measureRegionNames])]
      .sort((a, b) => a.localeCompare(b, 'ru'));

    buildCategoryCounts();
    appendOptions(elements.region, state.allRegions);
    appendOptions(elements.category, [...state.categoryCounts.keys()].sort((a, b) => a.localeCompare(b, 'ru')));
    restoreQuery();

    updateSnapshot();
    updateStats();
    renderRegionMap();
    renderPopular();
    renderCategories();
    renderRegionList('');
    applyFilters();

    if (state.requestedMeasureId) {
      const requested = state.measures.find((measure) => measure.id === state.requestedMeasureId);
      if (requested) openMeasureDialog(requested);
      else {
        state.requestedMeasureId = null;
        syncQuery();
        showToast('Карточка по ссылке не найдена в текущем снимке данных');
      }
    }
  } catch (error) {
    const message = String(error?.message ?? error);
    elements.snapshot.querySelector('span').textContent = 'Каталог временно недоступен.';
    elements.count.textContent = 'Ошибка загрузки';
    elements.empty.hidden = false;
    elements.empty.querySelector('h3').textContent = 'Не удалось загрузить каталог';
    elements.empty.querySelector('p').textContent = message;
    elements.catalog.hidden = true;
    showToast(message);
  }
}

init();
