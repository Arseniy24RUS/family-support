import {
  catalogCoverage,
  catalogMeasureUrl,
  formatDate,
  loadPlatformData,
  normalizeText,
  pluralMeasures
} from './lib/platform-core.js';
import { MAX_COMPARISON_REGIONS, compareRegions, comparisonToCsv } from './lib/region-comparison-engine.js';
import { copyText, downloadText, icon, initModuleShell, refreshIcons, showToast } from './lib/module-shell.js';
import {
  clampZoom,
  createMapProjection,
  featureRegionName,
  geometryCentroid,
  geometryPath,
  quantileClass,
  quantileThresholds,
  selectionSlot,
  strategyMapClass
} from './lib/compare-map.js';
import {
  STRATEGY_GROUP_LABELS,
  buildResearchExport,
  createStrategyIndex,
  filterStrategyDocuments,
  formatFileSize,
  loadStrategyCorpus,
  municipalStrategiesForRegion,
  strategyCoverageCounts,
  strategyForRegion,
  strategyPermalink,
  strategyQualityLabel,
  strategySummaryForRegions,
  strategyTemporalLabel
} from './lib/strategy-library.js';
import {
  buildComparisonInsights,
  categoryRowsWithShares,
  pairwiseCategorySimilarity,
  topDifferentiatingCategories
} from './lib/comparison-insights.js';
import {
  lexicalThemeRows,
  pairwiseLexicalSimilarity,
  strategyPeriodDomain,
  strategyPeriodPosition
} from './lib/strategy-text-analysis.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_WIDTH = 1120;
const MAP_HEIGHT = 620;
const REGION_SEARCH_LIMIT = 24;
const SLOT_COLORS = ['#0072b2', '#d55e00', '#008a68', '#8f4db8', '#b44b83', '#9b6500', '#007f91', '#6e6a00', '#b13c4b', '#526a7f'];
const SLOT_SOFT_COLORS = ['#e8f4fb', '#fff0e4', '#e6f6f0', '#f5ebfb', '#f9eaf3', '#fff4d8', '#e5f6f8', '#f3f2dc', '#fae9eb', '#edf1f4'];
const DOCX_RUNTIME_SCRIPTS = ['./vendor/jszip.min.js', './vendor/docx-preview.min.js'];

let docxRuntimePromise = null;
let documentLoadController = null;
let lastDocumentFormat = 'pdf';

const state = {
  measures: [],
  meta: {},
  regions: [],
  geoData: null,
  coverage: null,
  regionalCounts: new Map(),
  federalCount: 0,
  corpus: null,
  strategyIndex: null,
  selected: [],
  comparison: null,
  mapLayer: 'neutral',
  chartMode: 'count',
  strategyScope: 'selected',
  strategyQuery: '',
  strategyQuality: 'all',
  strategyTemporal: 'all',
  strategyListLimit: 24,
  currentDocument: null,
  map: {
    features: [],
    project: null,
    paths: new Map(),
    centroids: new Map(),
    transform: { x: 0, y: 0, scale: 1 },
    pointer: null,
    suppressClick: false,
    thresholds: []
  }
};

const elements = Object.fromEntries([
  'data-status',
  'comparison-map-shell',
  'comparison-map',
  'comparison-map-viewport',
  'comparison-map-regions',
  'comparison-map-markers',
  'comparison-map-empty',
  'comparison-map-tooltip',
  'map-layer-switch',
  'map-legend',
  'map-zoom-in',
  'map-zoom-out',
  'map-zoom-reset',
  'open-region-search',
  'clear-regions',
  'selected-regions',
  'selection-count',
  'selection-note',
  'region-search-panel',
  'region-search-input',
  'region-search-results',
  'run-comparison',
  'comparison-output',
  'comparison-placeholder',
  'comparison-results',
  'comparison-results-subtitle',
  'coverage-warning',
  'comparison-insights',
  'regional-metrics',
  'chart-mode-switch',
  'category-comparison-description',
  'category-differences',
  'comparison-bars',
  'category-table',
  'strategy-passports',
  'strategy-timeline',
  'strategy-lexical-summary',
  'strategy-theme-matrix',
  'strategy-lexical-similarity',
  'overlap-grid',
  'distinctive-grid',
  'copy-comparison-link',
  'download-comparison',
  'download-research-json',
  'print-comparison',
  'strategy-corpus-stats',
  'strategy-provenance-note',
  'selected-strategy-count',
  'regional-strategy-count',
  'federal-strategy-count',
  'strategy-search-input',
  'strategy-quality-filter',
  'strategy-temporal-filter',
  'strategy-list-summary',
  'strategy-document-list',
  'strategy-load-more',
  'strategy-viewer-placeholder',
  'strategy-viewer-content',
  'strategy-viewer-eyebrow',
  'strategy-viewer-document-title',
  'strategy-viewer-document-meta',
  'strategy-viewer-actions',
  'strategy-viewer-details',
  'strategy-document-stage',
  'strategy-document-consent',
  'strategy-document-consent-title',
  'strategy-document-consent-text',
  'strategy-document-load-actions',
  'strategy-document-loading',
  'strategy-document-loading-text',
  'load-strategy-pdf',
  'load-strategy-docx',
  'strategy-pdf-frame',
  'strategy-docx-viewer',
  'strategy-document-error',
  'strategy-document-error-text',
  'retry-strategy-document',
  'close-strategy-viewer'
].map((id) => [camelCase(id), document.querySelector(`#${id}`)]));

elements.strategyTabs = [...document.querySelectorAll('[data-strategy-scope]')];
elements.mapLayerInputs = [...document.querySelectorAll('input[name="map-layer"]')];
elements.chartModeInputs = [...document.querySelectorAll('input[name="chart-mode"]')];
elements.strategyWorkspace = document.querySelector('.strategy-workspace');

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function percent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(digits).replace('.', ',')}%`;
}

function pointPercentage(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(digits).replace('.', ',')} п.п.`;
}

function decimal(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

function createText(tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function applySlotTheme(element, slot) {
  const index = Number(slot) - 1;
  element.style.setProperty('--slot-color', SLOT_COLORS[index] || SLOT_COLORS[0]);
  element.style.setProperty('--slot-soft', SLOT_SOFT_COLORS[index] || SLOT_SOFT_COLORS[0]);
}

function clearSlotTheme(element) {
  element.style.removeProperty('--slot-color');
  element.style.removeProperty('--slot-soft');
}

function appendDefinitionList(list, rows) {
  list.replaceChildren();
  for (const [term, value] of rows) {
    const row = document.createElement('div');
    const dt = createText('dt', term);
    const dd = createText('dd', value || '—');
    row.append(dt, dd);
    list.append(row);
  }
}

function currentUrl({ includeDocument = true } = {}) {
  const url = new URL(location.href);
  url.search = '';
  for (const region of state.selected) url.searchParams.append('region', region);
  if (state.mapLayer !== 'neutral') url.searchParams.set('layer', state.mapLayer);
  if (state.chartMode !== 'count') url.searchParams.set('mode', state.chartMode);
  if (includeDocument && state.currentDocument?.id) url.searchParams.set('doc', state.currentDocument.id);
  return url;
}

function syncQuery({ preserveHash = true } = {}) {
  const url = currentUrl();
  if (preserveHash) url.hash = location.hash;
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function restoreQuery() {
  const params = new URLSearchParams(location.search);
  state.selected = [...new Set(params.getAll('region'))]
    .filter((region) => state.regions.includes(region))
    .slice(0, MAX_COMPARISON_REGIONS);
  state.mapLayer = ['strategies', 'catalog', 'neutral'].includes(params.get('layer'))
    ? params.get('layer')
    : 'neutral';
  state.chartMode = ['count', 'share'].includes(params.get('mode'))
    ? params.get('mode')
    : 'count';
  for (const input of elements.mapLayerInputs) input.checked = input.value === state.mapLayer;
  for (const input of elements.chartModeInputs) input.checked = input.value === state.chartMode;
  return params.get('doc');
}

function buildRegionalCounts() {
  state.regionalCounts = new Map(state.regions.map((region) => [region, 0]));
  state.federalCount = 0;
  for (const measure of state.measures) {
    if (measure?.level === 'federal') {
      state.federalCount += 1;
    } else if (measure?.level === 'regional' && measure?.region) {
      state.regionalCounts.set(measure.region, (state.regionalCounts.get(measure.region) || 0) + 1);
    }
  }
  state.map.thresholds = quantileThresholds([...state.regionalCounts.values()], 4);
}

function updateDataStatus() {
  const stats = state.corpus?.stats ?? {};
  const measureCount = state.measures.length;
  elements.dataStatus.querySelector('span').textContent = [
    `Каталог: ${formatNumber(measureCount)} ${pluralMeasures(measureCount)}, снимок от ${formatDate(state.meta.generated_at)}.`,
    `Региональные записи представлены для ${state.coverage.representedCount} из ${state.coverage.totalRegions} субъектов.`,
    `Документальный корпус: ${stats.regional_full ?? 0} полных и ${stats.regional_partial ?? 0} частичных региональных текстов; ${formatNumber(stats.total_pages ?? 0)} страниц.`
  ].join(' ');
}

function mapRegionDescription(region) {
  const regionalCount = state.regionalCounts.get(region) || 0;
  const strategy = strategyForRegion(state.strategyIndex, region);
  const selectedSlot = selectionSlot(state.selected, region);
  const parts = [];
  if (selectedSlot) parts.push(`выбран под номером ${selectedSlot}`);
  parts.push(regionalCount
    ? `${formatNumber(regionalCount)} ${pluralMeasures(regionalCount)} регионального уровня в каталоге`
    : 'региональные карточки в текущем источнике не представлены');
  parts.push(strategy
    ? `${strategyQualityLabel(strategy).toLocaleLowerCase('ru-RU')}; ${strategy.period?.label || 'период не установлен'}`
    : 'программа отсутствует в корпусе');
  return parts.join(' · ');
}

function mapPathClass(region) {
  if (state.mapLayer === 'catalog') return quantileClass(state.regionalCounts.get(region) || 0, state.map.thresholds);
  if (state.mapLayer === 'neutral') return 'map-neutral';
  return strategyMapClass(strategyForRegion(state.strategyIndex, region));
}

function renderMap() {
  elements.comparisonMapRegions.replaceChildren();
  elements.comparisonMapMarkers.replaceChildren();
  state.map.paths.clear();
  state.map.centroids.clear();

  const features = Array.isArray(state.geoData?.features)
    ? state.geoData.features.filter((feature) => state.regions.includes(featureRegionName(feature)))
    : [];
  state.map.features = features;

  if (!features.length) {
    elements.comparisonMapEmpty.hidden = false;
    elements.comparisonMap.hidden = true;
    return;
  }

  elements.comparisonMapEmpty.hidden = true;
  elements.comparisonMap.hidden = false;
  const project = createMapProjection(features, MAP_WIDTH, MAP_HEIGHT, 25);
  state.map.project = project;
  const fragment = document.createDocumentFragment();

  for (const feature of features) {
    const region = featureRegionName(feature);
    if (!region) continue;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', geometryPath(feature.geometry, project));
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('role', 'button');
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `${region}: ${mapRegionDescription(region)}. Нажмите для изменения выбора.`);
    path.setAttribute('aria-pressed', String(state.selected.includes(region)));
    path.classList.add('comparison-map__region', mapPathClass(region));
    path.dataset.region = region;
    const slot = selectionSlot(state.selected, region);
    if (slot) {
      path.dataset.slot = String(slot);
      applySlotTheme(path, slot);
    }

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${region}. ${mapRegionDescription(region)}`;
    path.append(title);

    path.addEventListener('click', () => {
      if (state.map.suppressClick) return;
      toggleRegion(region);
    });
    path.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleRegion(region);
    });
    path.addEventListener('pointerenter', (event) => showMapTooltip(region, event.clientX, event.clientY));
    path.addEventListener('pointermove', (event) => positionMapTooltip(event.clientX, event.clientY));
    path.addEventListener('pointerleave', hideMapTooltip);
    path.addEventListener('focus', () => {
      const bounds = path.getBoundingClientRect();
      showMapTooltip(region, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    });
    path.addEventListener('blur', hideMapTooltip);

    state.map.paths.set(region, path);
    state.map.centroids.set(region, geometryCentroid(feature.geometry, project));
    fragment.append(path);
  }
  elements.comparisonMapRegions.append(fragment);
  renderMapSelection();
  renderMapLegend();
  applyMapTransform();
}

function renderMapLayer() {
  for (const [region, path] of state.map.paths) {
    path.classList.remove(
      'strategy-available', 'strategy-partial', 'strategy-historical', 'strategy-unavailable', 'strategy-missing',
      'quantile-0', 'quantile-1', 'quantile-2', 'quantile-3', 'quantile-4', 'map-neutral'
    );
    path.classList.add(mapPathClass(region));
  }
  renderMapLegend();
}

function renderMapSelection() {
  elements.comparisonMapMarkers.replaceChildren();
  for (const [region, path] of state.map.paths) {
    const slot = selectionSlot(state.selected, region);
    if (slot) {
      path.dataset.slot = String(slot);
      applySlotTheme(path, slot);
    } else {
      delete path.dataset.slot;
      clearSlotTheme(path);
    }
    path.setAttribute('aria-pressed', String(Boolean(slot)));
    path.setAttribute('aria-label', `${region}: ${mapRegionDescription(region)}. Нажмите для изменения выбора.`);
    const title = path.querySelector('title');
    if (title) title.textContent = `${region}. ${mapRegionDescription(region)}`;
  }

  for (const [index, region] of state.selected.entries()) {
    const centroid = state.map.centroids.get(region);
    if (!centroid) continue;
    const [x, y] = centroid;
    const group = document.createElementNS(SVG_NS, 'g');
    group.classList.add('comparison-map__marker');
    group.dataset.slot = String(index + 1);
    applySlotTheme(group, index + 1);
    group.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '12');
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = String(index + 1);
    group.append(circle, text);
    elements.comparisonMapMarkers.append(group);
  }
}

function renderMapLegend() {
  elements.mapLegend.replaceChildren();
  const title = createText('strong', state.mapLayer === 'strategies'
    ? 'Полнота и период документа'
    : state.mapLayer === 'catalog'
      ? 'Число региональных карточек'
      : 'Нейтральный фон', 'map-legend__title');
  elements.mapLegend.append(title);

  if (state.mapLayer === 'neutral') {
    elements.mapLegend.append(createLegendItem('#dce5ec', 'Все субъекты без аналитической заливки'));
  } else if (state.mapLayer === 'strategies') {
    const rows = [
      ['#7dc4ad', 'Полный или иной доступный текст, период включает 2026 год либо не установлен'],
      ['#a9c6d3', 'Доступный текст с завершённым периодом'],
      ['#ebbd74', 'Частичный материал'],
      ['#d9aaa5', 'В архиве есть отметка, но файл не передан'],
      ['#d9dee5', 'Субъект отсутствует в переданном корпусе']
    ];
    for (const row of rows) elements.mapLegend.append(createLegendItem(...row));
  } else {
    const thresholds = state.map.thresholds;
    const labels = [
      'Нет региональных карточек в снимке',
      thresholds[0] ? `До ${formatNumber(thresholds[0])}` : 'Низкое значение',
      thresholds[1] ? `${formatNumber((thresholds[0] ?? 0) + 1)}–${formatNumber(thresholds[1])}` : 'Ниже среднего',
      thresholds[2] ? `${formatNumber((thresholds[1] ?? thresholds[0] ?? 0) + 1)}–${formatNumber(thresholds[2])}` : 'Выше среднего',
      thresholds[2] ? `Более ${formatNumber(thresholds[2])}` : 'Высокое значение'
    ];
    ['#e4e9ef', '#cbdff0', '#9ec2e2', '#659dce', '#306da8'].forEach((color, index) => {
      elements.mapLegend.append(createLegendItem(color, labels[index]));
    });
  }

  const selected = document.createElement('div');
  selected.className = 'map-legend__item';
  const swatches = document.createElement('span');
  swatches.className = 'map-legend__selection-swatches';
  swatches.style.display = 'flex';
  swatches.style.gap = '2px';
  for (const color of SLOT_COLORS) {
    const swatch = document.createElement('i');
    swatch.className = 'map-legend__swatch';
    swatch.style.background = color;
    swatch.style.width = '7px';
    swatches.append(swatch);
  }
  selected.append(swatches, createText('span', 'Выбранные субъекты — постоянные цвета 1–10'));
  elements.mapLegend.append(selected);
}

function createLegendItem(color, label) {
  const item = document.createElement('div');
  item.className = 'map-legend__item';
  const swatch = document.createElement('span');
  swatch.className = 'map-legend__swatch';
  swatch.style.background = color;
  item.append(swatch, createText('span', label));
  return item;
}

function showMapTooltip(region, clientX, clientY) {
  const strategy = strategyForRegion(state.strategyIndex, region);
  const title = createText('strong', region);
  const detail = document.createElement('span');
  const count = state.regionalCounts.get(region) || 0;
  const selected = selectionSlot(state.selected, region);
  detail.textContent = `${selected ? `Выбран: № ${selected} · ` : ''}${count ? `${formatNumber(count)} ${pluralMeasures(count)} регионального уровня` : 'Нет региональных карточек в снимке'} · ${strategy ? `${strategyQualityLabel(strategy)}, ${strategy.period?.label || 'период не установлен'}` : 'Документ отсутствует в корпусе'}`;
  elements.comparisonMapTooltip.replaceChildren(title, detail);
  elements.comparisonMapTooltip.hidden = false;
  positionMapTooltip(clientX, clientY);
}

function positionMapTooltip(clientX, clientY) {
  const shell = elements.comparisonMapShell.getBoundingClientRect();
  const tooltip = elements.comparisonMapTooltip.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - shell.left + 14, 8), Math.max(8, shell.width - tooltip.width - 8));
  const y = Math.min(Math.max(clientY - shell.top + 14, 8), Math.max(8, shell.height - tooltip.height - 8));
  elements.comparisonMapTooltip.style.left = `${x}px`;
  elements.comparisonMapTooltip.style.top = `${y}px`;
}

function hideMapTooltip() {
  elements.comparisonMapTooltip.hidden = true;
}

function applyMapTransform() {
  const { x, y, scale } = state.map.transform;
  elements.comparisonMapViewport.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`);
}

function zoomMap(factor, anchor = [MAP_WIDTH / 2, MAP_HEIGHT / 2]) {
  const previous = state.map.transform.scale;
  const next = clampZoom(previous * factor);
  if (Math.abs(next - previous) < 1e-6) return;
  const [anchorX, anchorY] = anchor;
  const worldX = (anchorX - state.map.transform.x) / previous;
  const worldY = (anchorY - state.map.transform.y) / previous;
  state.map.transform.x = anchorX - worldX * next;
  state.map.transform.y = anchorY - worldY * next;
  state.map.transform.scale = next;
  applyMapTransform();
}

function resetMapTransform() {
  state.map.transform = { x: 0, y: 0, scale: 1 };
  applyMapTransform();
}

function svgPointFromEvent(event) {
  const rect = elements.comparisonMap.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / rect.width * MAP_WIDTH,
    (event.clientY - rect.top) / rect.height * MAP_HEIGHT
  ];
}

function setupMapInteractions() {
  elements.mapZoomIn.addEventListener('click', () => zoomMap(1.35));
  elements.mapZoomOut.addEventListener('click', () => zoomMap(1 / 1.35));
  elements.mapZoomReset.addEventListener('click', resetMapTransform);

  elements.comparisonMap.addEventListener('wheel', (event) => {
    if (matchMedia('(max-width: 760px)').matches) return;
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 1.15 : 1 / 1.15, svgPointFromEvent(event));
  }, { passive: false });

  elements.comparisonMap.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || matchMedia('(max-width: 760px)').matches) return;
    state.map.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mapX: state.map.transform.x,
      mapY: state.map.transform.y,
      moved: false
    };
  });

  elements.comparisonMap.addEventListener('pointermove', (event) => {
    const pointer = state.map.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    const rect = elements.comparisonMap.getBoundingClientRect();
    const dx = (event.clientX - pointer.startX) / rect.width * MAP_WIDTH;
    const dy = (event.clientY - pointer.startY) / rect.height * MAP_HEIGHT;
    if (Math.hypot(dx, dy) > 2.5 && !pointer.moved) {
      pointer.moved = true;
      elements.comparisonMap.setPointerCapture?.(event.pointerId);
    }
    state.map.transform.x = pointer.mapX + dx;
    state.map.transform.y = pointer.mapY + dy;
    elements.comparisonMapShell.classList.toggle('is-dragging', pointer.moved);
    if (pointer.moved) {
      hideMapTooltip();
      applyMapTransform();
    }
  });

  const endPointer = (event) => {
    const pointer = state.map.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.moved) {
      state.map.suppressClick = true;
      setTimeout(() => { state.map.suppressClick = false; }, 80);
    }
    state.map.pointer = null;
    elements.comparisonMapShell.classList.remove('is-dragging');
  };
  elements.comparisonMap.addEventListener('pointerup', endPointer);
  elements.comparisonMap.addEventListener('pointercancel', endPointer);
}

function toggleRegion(region) {
  if (!state.regions.includes(region)) return;
  if (state.selected.includes(region)) {
    state.selected = state.selected.filter((item) => item !== region);
  } else if (state.selected.length >= MAX_COMPARISON_REGIONS) {
    showToast('Одновременно можно сравнить не более десяти субъектов.');
    return;
  } else {
    state.selected.push(region);
  }
  selectionChanged();
}

function clearRegions() {
  if (!state.selected.length) return;
  state.selected = [];
  selectionChanged();
}

function selectionChanged() {
  renderSelectedRegions();
  renderMapSelection();
  renderRegionSearch();
  syncQuery();
  if (state.selected.length >= 2) renderComparison();
  else hideComparison();
}

function renderSelectedRegions() {
  elements.selectedRegions.replaceChildren();
  elements.selectionCount.textContent = `${state.selected.length} / ${MAX_COMPARISON_REGIONS}`;

  if (!state.selected.length) {
    elements.selectedRegions.append(createText('p', 'На карте пока ничего не выбрано.', 'selected-regions-v2__empty'));
  } else {
    for (const [index, region] of state.selected.entries()) {
      const strategy = strategyForRegion(state.strategyIndex, region);
      const count = state.regionalCounts.get(region) || 0;
      const card = document.createElement('article');
      card.className = 'selected-region-card';
      card.dataset.slot = String(index + 1);
      applySlotTheme(card, index + 1);
      const badge = createText('span', String(index + 1), 'region-slot-badge');
      const body = document.createElement('div');
      body.append(
        createText('strong', region),
        createText('small', `${formatNumber(count)} региональных записей · ${strategy ? strategyQualityLabel(strategy) : 'нет документа в корпусе'}`)
      );
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Удалить из сравнения: ${region}`);
      remove.append(icon('x'));
      remove.addEventListener('click', () => toggleRegion(region));
      card.append(badge, body, remove);
      elements.selectedRegions.append(card);
    }
  }

  const missing = Math.max(0, 2 - state.selected.length);
  elements.runComparison.disabled = state.selected.length < 2;
  elements.selectionNote.textContent = missing
    ? `Для построения результата выберите ещё ${missing === 1 ? 'один субъект' : 'два субъекта'}.`
    : state.selected.length < MAX_COMPARISON_REGIONS
      ? 'Сравнение обновляется автоматически; можно добавить ещё субъекты.'
      : 'Достигнут предел: десять субъектов.';
  refreshIcons();
}

function renderRegionSearch() {
  const query = normalizeText(elements.regionSearchInput.value);
  const candidates = state.regions
    .filter((region) => !query || normalizeText(region).includes(query))
    .sort((a, b) => {
      const aSelected = state.selected.includes(a) ? 0 : 1;
      const bSelected = state.selected.includes(b) ? 0 : 1;
      return aSelected - bSelected || a.localeCompare(b, 'ru');
    })
    .slice(0, REGION_SEARCH_LIMIT);

  elements.regionSearchResults.replaceChildren();
  if (!candidates.length) {
    elements.regionSearchResults.append(createText('p', 'Совпадений не найдено.', 'selected-regions-v2__empty'));
    return;
  }

  for (const region of candidates) {
    const selected = state.selected.includes(region);
    const strategy = strategyForRegion(state.strategyIndex, region);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `region-search-result${selected ? ' is-selected' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));
    const body = document.createElement('div');
    body.append(
      createText('strong', region),
      createText('small', `${formatNumber(state.regionalCounts.get(region) || 0)} региональных записей · ${strategy ? strategyQualityLabel(strategy) : 'нет документа'}`)
    );
    button.append(body, createText('span', selected ? 'Выбран' : 'Добавить'));
    button.addEventListener('click', () => toggleRegion(region));
    elements.regionSearchResults.append(button);
  }
}

function hideComparison() {
  state.comparison = null;
  elements.comparisonResults.hidden = true;
  elements.comparisonPlaceholder.hidden = false;
}

function renderComparison({ scroll = false } = {}) {
  if (state.selected.length < 2) {
    hideComparison();
    return;
  }
  state.comparison = compareRegions(state.measures, state.selected);
  elements.comparisonPlaceholder.hidden = true;
  elements.comparisonResults.hidden = false;
  elements.comparisonResultsSubtitle.textContent = `${state.selected.join(' · ')}. Федеральные карточки (${formatNumber(state.comparison.federalCount)}) рассматриваются как общий фон и не прибавляются к региональным значениям.`;
  renderCoverageWarning();
  renderInsights();
  renderMetrics();
  renderCategories();
  renderStrategyPassports();
  renderStrategyAnalysis();
  renderOverlap();
  renderDistinctive();
  refreshIcons();
  if (scroll) elements.comparisonOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCoverageWarning() {
  const catalogMissing = state.comparison.profiles.filter((profile) => profile.status === 'not-represented');
  const strategyGaps = strategySummaryForRegions(state.strategyIndex, state.selected)
    .filter((item) => ['missing', 'unavailable', 'partial'].includes(item.quality));
  const messages = [];
  if (catalogMissing.length) {
    messages.push(`В текущем каталоге нет региональных карточек для: ${catalogMissing.map((item) => item.region).join(', ')}.`);
  }
  if (strategyGaps.length) {
    messages.push(`Документальный корпус неполон для: ${strategyGaps.map((item) => item.region).join(', ')}.`);
  }
  elements.coverageWarning.hidden = messages.length === 0;
  if (!messages.length) return;
  const body = document.createElement('div');
  body.append(
    createText('strong', 'Ограничения исходных данных'),
    createText('p', `${messages.join(' ')} Нулевые значения описывают покрытие источников, а не отсутствие поддержки или политики.`)
  );
  elements.coverageWarning.replaceChildren(icon('triangle-alert'), body);
}

function renderInsights() {
  const summaries = strategySummaryForRegions(state.strategyIndex, state.selected);
  const insights = buildComparisonInsights(state.comparison, summaries).slice(0, 4);
  elements.comparisonInsights.replaceChildren();
  for (const insight of insights) {
    const card = document.createElement('article');
    card.className = 'insight-card';
    const iconBox = document.createElement('span');
    iconBox.className = 'insight-card__icon';
    iconBox.append(icon(insight.icon));
    card.append(
      iconBox,
      createText('small', insight.title),
      createText('strong', insight.value),
      createText('p', insight.note)
    );
    elements.comparisonInsights.append(card);
  }
}

function renderMetrics() {
  elements.regionalMetrics.replaceChildren();
  for (const [index, profile] of state.comparison.profiles.entries()) {
    const card = document.createElement('article');
    card.className = 'region-metric-card-v2';
    card.dataset.slot = String(index + 1);
    applySlotTheme(card, index + 1);
    const head = document.createElement('div');
    head.className = 'region-metric-card-v2__head';
    const badge = createText('span', String(index + 1), 'region-slot-badge');
    const heading = document.createElement('div');
    heading.append(
      createText('h3', profile.region),
      createText('span', profile.status === 'represented' ? 'Есть региональные записи в источнике' : 'Региональные записи не представлены', 'region-metric-card-v2__status')
    );
    head.append(badge, heading);

    const body = document.createElement('div');
    body.className = 'region-metric-card-v2__body';
    const value = createText('strong', formatNumber(profile.regionalCount), 'region-metric-card-v2__value');
    const label = createText('p', `${pluralMeasures(profile.regionalCount)} регионального уровня`, 'region-metric-card-v2__label');
    const progress = document.createElement('div');
    progress.className = 'metric-progress';
    const fill = document.createElement('span');
    fill.style.width = `${profile.regionalCount / state.comparison.maxRegionalCount * 100}%`;
    progress.append(fill);
    const dl = document.createElement('dl');
    appendDefinitionList(dl, [
      ['Категорий', formatNumber(profile.categoryCount)],
      ['Крупнейшая категория', profile.largestCategory?.category || 'данные не представлены'],
      ['Доля крупнейшей категории', profile.largestCategory ? percent(profile.largestCategory.share) : '—'],
      ['Концентрация HHI', profile.concentration == null ? '—' : profile.concentration.toFixed(3).replace('.', ',')]
    ]);
    body.append(value, label, progress, dl);
    card.append(head, body);
    elements.regionalMetrics.append(card);
  }
}

function renderCategories() {
  const rows = categoryRowsWithShares(state.comparison);
  const topRows = rows.slice(0, 9);
  elements.categoryComparisonDescription.textContent = state.chartMode === 'count'
    ? 'Абсолютное число региональных карточек по категориям текущего каталога.'
    : 'Доля категории в региональном наборе карточек каждого выбранного субъекта.';

  const differences = topDifferentiatingCategories(state.comparison, 5);
  elements.categoryDifferences.replaceChildren();
  if (differences.length) {
    for (const row of differences) {
      const chip = document.createElement('span');
      chip.className = 'category-difference-chip';
      chip.append(document.createTextNode(`${row.category}: `), createText('b', pointPercentage(row.range)));
      elements.categoryDifferences.append(chip);
    }
  }

  renderCategoryBars(topRows);
  renderCategoryTable(rows);
}

function renderCategoryBars(rows) {
  elements.comparisonBars.replaceChildren();
  const values = rows.flatMap((row) => state.comparison.profiles.map((profile) => (
    state.chartMode === 'share' ? row.shares[profile.region] : row.values[profile.region]
  )));
  const maximum = Math.max(...values, 1e-9);

  for (const row of rows) {
    const group = document.createElement('div');
    group.className = 'comparison-bar-group-v2';
    group.append(createText('strong', row.category));
    const series = document.createElement('div');
    series.className = 'comparison-bar-series-v2';
    for (const [index, profile] of state.comparison.profiles.entries()) {
      const value = state.chartMode === 'share' ? row.shares[profile.region] : row.values[profile.region];
      const line = document.createElement('div');
      line.className = 'comparison-bar-line-v2';
      line.dataset.slot = String(index + 1);
      applySlotTheme(line, index + 1);
      const label = createText('span', profile.region);
      label.title = profile.region;
      const track = document.createElement('div');
      track.className = 'comparison-bar-track-v2';
      const fill = document.createElement('span');
      fill.style.width = `${value / maximum * 100}%`;
      track.append(fill);
      const output = createText('b', state.chartMode === 'share' ? percent(value) : formatNumber(value));
      line.append(label, track, output);
      series.append(line);
    }
    group.append(series);
    elements.comparisonBars.append(group);
  }
}

function renderCategoryTable(rows) {
  const caption = createText('caption', state.chartMode === 'share'
    ? 'Доля категорий в региональном наборе карточек'
    : 'Число региональных карточек по категориям');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const categoryHead = createText('th', 'Категория');
  categoryHead.scope = 'col';
  headRow.append(categoryHead);
  for (const [index, profile] of state.comparison.profiles.entries()) {
    const th = createText('th', profile.region);
    th.scope = 'col';
    const marker = document.createElement('span');
    marker.className = 'table-region-marker';
    marker.style.background = SLOT_COLORS[index];
    th.append(marker);
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const th = createText('th', row.category);
    th.scope = 'row';
    tr.append(th);
    for (const profile of state.comparison.profiles) {
      const value = state.chartMode === 'share' ? row.shares[profile.region] : row.values[profile.region];
      tr.append(createText('td', state.chartMode === 'share' ? percent(value) : formatNumber(value)));
    }
    tbody.append(tr);
  }
  elements.categoryTable.replaceChildren(caption, thead, tbody);
}

function strategyStatusClass(summary) {
  return ['full', 'partial', 'unavailable', 'missing'].includes(summary.quality) ? summary.quality : 'missing';
}

function renderStrategyPassports() {
  const summaries = strategySummaryForRegions(state.strategyIndex, state.selected);
  elements.strategyPassports.replaceChildren();
  for (const [index, summary] of summaries.entries()) {
    const doc = summary.document;
    const card = document.createElement('article');
    card.className = 'strategy-passport';
    card.dataset.slot = String(index + 1);
    applySlotTheme(card, index + 1);
    const head = document.createElement('div');
    head.className = 'strategy-passport__head';
    head.append(
      createText('h4', summary.region),
      createText('span', strategyQualityLabel(doc), `strategy-status-badge is-${strategyStatusClass(summary)}`)
    );
    const dl = document.createElement('dl');
    appendDefinitionList(dl, [
      ['Период', summary.period],
      ['Временной статус', strategyTemporalLabel(doc)],
      ['Объём', doc?.pages ? `${formatNumber(doc.pages)} стр., ${formatFileSize(doc.size_bytes)}` : 'файл недоступен'],
      ['Редакция', doc?.revision || 'не установлена']
    ]);
    const municipal = createText(
      'p',
      summary.municipal.length
        ? `Муниципальные приложения: ${summary.municipal.map((item) => item.territory).join(', ')}.`
        : 'Муниципальные приложения в переданном корпусе не обнаружены.',
      'strategy-passport__municipal'
    );
    const actions = document.createElement('div');
    actions.className = 'strategy-passport__actions';
    const documentsUrl = new URL('./documents.html', location.href);
    documentsUrl.searchParams.append('region', summary.region);
    if (doc?.id) documentsUrl.searchParams.set('doc', doc.id);
    documentsUrl.hash = 'document-library';
    if (doc?.availability === 'available') {
      const view = document.createElement('a');
      view.href = documentsUrl.href;
      view.append(icon('eye'), document.createTextNode('Открыть'));
      const download = document.createElement('a');
      download.href = doc.download_url;
      download.download = '';
      download.append(icon('download'), document.createTextNode('PDF'));
      actions.append(view, download);
    } else {
      const browse = document.createElement('a');
      browse.href = documentsUrl.href;
      browse.append(icon('file-warning'), document.createTextNode('Карточка'));
      actions.append(browse);
    }
    const catalog = document.createElement('a');
    catalog.href = `./index.html?${new URLSearchParams({ region: summary.region, level: 'regional' })}`;
    catalog.append(icon('library-big'), document.createTextNode('Каталог'));
    actions.append(catalog);
    card.append(head, dl, municipal, actions);
    elements.strategyPassports.append(card);
  }
}


function selectedStrategyDocuments() {
  return state.selected.map((region) => strategyForRegion(state.strategyIndex, region) || {
    id: `missing-${normalizeText(region).replace(/\s+/g, '-')}`,
    territory: region,
    availability: 'missing',
    quality: 'missing',
    period: { start_year: null, end_year: null, label: 'период не установлен', temporal_status: 'undated' }
  });
}

function renderStrategyAnalysis() {
  const documents = selectedStrategyDocuments();
  renderStrategyTimeline(documents);
  renderStrategyLexicalProfiles(documents);
}

function renderStrategyTimeline(documents) {
  elements.strategyTimeline.replaceChildren();
  const domain = strategyPeriodDomain(documents, { referenceYear: 2026 });
  const referencePosition = (domain.referenceYear - domain.start) / Math.max(1, domain.end - domain.start);
  const axis = document.createElement('div');
  axis.className = 'strategy-timeline-axis';
  axis.append(createText('span', 'Субъект'));
  const track = document.createElement('div');
  track.className = 'strategy-timeline-axis__track';
  const ticks = [...new Set([domain.start, domain.referenceYear, domain.end])].sort((a, b) => a - b);
  for (const year of ticks) {
    const tick = createText('span', String(year));
    tick.style.left = `${(year - domain.start) / Math.max(1, domain.end - domain.start) * 100}%`;
    if (year === domain.referenceYear) tick.classList.add('is-reference');
    track.append(tick);
  }
  axis.append(track, createText('span', 'Статус'));
  elements.strategyTimeline.append(axis);

  for (const [index, strategyDocument] of documents.entries()) {
    const row = document.createElement('div');
    row.className = 'strategy-timeline-row';
    row.dataset.slot = String(index + 1);
    applySlotTheme(row, index + 1);
    const label = document.createElement('div');
    label.className = 'strategy-timeline-row__label';
    label.append(
      createText('span', String(index + 1), 'strategy-timeline-row__number'),
      createText('strong', strategyDocument.territory)
    );
    const timeline = document.createElement('div');
    timeline.className = 'strategy-timeline-row__track';
    const reference = document.createElement('i');
    reference.className = 'strategy-timeline-row__reference';
    reference.style.left = `${Math.max(0, Math.min(1, referencePosition)) * 100}%`;
    timeline.append(reference);
    const position = strategyPeriodPosition(strategyDocument.period, domain);
    if (position) {
      const bar = document.createElement('span');
      bar.className = 'strategy-timeline-row__bar';
      bar.style.left = `${position.left * 100}%`;
      bar.style.width = `${position.width * 100}%`;
      bar.title = strategyDocument.period?.label || 'Период по метаданным';
      bar.append(createText('b', strategyDocument.period?.label || 'период'));
      timeline.append(bar);
    } else {
      const undated = createText('span', 'Период не установлен', 'strategy-timeline-row__undated');
      timeline.append(undated);
    }
    const status = createText('span', strategyTemporalLabel(strategyDocument), 'strategy-timeline-row__status');
    row.append(label, timeline, status);
    elements.strategyTimeline.append(row);
  }
}

function renderStrategyLexicalProfiles(documents) {
  elements.strategyLexicalSummary.replaceChildren();
  elements.strategyThemeMatrix.replaceChildren();
  elements.strategyLexicalSimilarity.replaceChildren();

  for (const [index, strategyDocument] of documents.entries()) {
    const profile = strategyDocument.text_profile;
    const chip = document.createElement('div');
    chip.className = 'strategy-lexical-profile-chip';
    chip.dataset.slot = String(index + 1);
    applySlotTheme(chip, index + 1);
    chip.append(
      createText('strong', strategyDocument.territory),
      createText('span', profile
        ? `${formatNumber(profile.token_count)} слов · ${profile.reliability === 'limited' ? 'ограниченная сопоставимость' : 'стандартная сопоставимость'}`
        : 'текстовый профиль недоступен')
    );
    elements.strategyLexicalSummary.append(chip);
  }

  const rows = lexicalThemeRows(state.corpus, documents, { limit: 8 });
  if (!rows.length) {
    elements.strategyThemeMatrix.append(createText('p', 'Для выбранных документов невозможно построить сопоставимый лексический профиль.', 'strategy-analysis-empty'));
    return;
  }

  for (const row of rows) {
    const group = document.createElement('div');
    group.className = 'strategy-theme-row';
    group.append(createText('strong', row.label));
    const series = document.createElement('div');
    series.className = 'strategy-theme-row__series';
    for (const [index, item] of row.values.entries()) {
      const line = document.createElement('div');
      line.className = 'strategy-theme-line';
      line.dataset.slot = String(index + 1);
      applySlotTheme(line, index + 1);
      const label = createText('span', item.region);
      label.title = item.region;
      const barTrack = document.createElement('div');
      barTrack.className = 'strategy-theme-line__track';
      const fill = document.createElement('span');
      fill.style.width = item.available && row.max ? `${Math.max(2, item.value / row.max * 100)}%` : '0%';
      barTrack.append(fill);
      const value = createText('b', item.available ? `${decimal(item.value, 1)} / 10 тыс.` : '—');
      value.title = item.available ? `${formatNumber(item.matches)} словарных совпадений` : 'Текстовый профиль недоступен';
      line.append(label, barTrack, value);
      series.append(line);
    }
    group.append(series);
    elements.strategyThemeMatrix.append(group);
  }

  const themeIds = rows.map((row) => row.id);
  const pairs = pairwiseLexicalSimilarity(documents, themeIds);
  if (!pairs.length) return;
  const heading = createText('h4', 'Сходство лексических профилей по показанным темам');
  elements.strategyLexicalSimilarity.append(heading);
  const grid = document.createElement('div');
  grid.className = 'strategy-lexical-similarity__grid';
  for (const pair of pairs) {
    const card = document.createElement('article');
    card.className = 'strategy-lexical-similarity-card';
    const [aColor, bColor] = pairColors(pair.a, pair.b);
    card.style.setProperty('--pair-a', aColor);
    card.style.setProperty('--pair-b', bColor);
    card.append(
      createText('strong', `${pair.a} ↔ ${pair.b}`),
      createText('b', pair.value == null ? '—' : percent(pair.value)),
      createText('p', pair.value == null ? 'Недостаточно извлечённого текста.' : 'Косинусное сходство нормированных частот; не является оценкой близости политики.')
    );
    grid.append(card);
  }
  elements.strategyLexicalSimilarity.append(grid);
}

function pairColors(first, second) {
  return [SLOT_COLORS[state.selected.indexOf(first)] || SLOT_COLORS[0], SLOT_COLORS[state.selected.indexOf(second)] || SLOT_COLORS[1]];
}

function renderOverlap() {
  elements.overlapGrid.replaceChildren();
  const categoryPairs = new Map(pairwiseCategorySimilarity(state.comparison)
    .map((pair) => [`${pair.a}\u0000${pair.b}`, pair.similarity]));
  for (const pair of state.comparison.overlaps) {
    const card = document.createElement('article');
    card.className = 'overlap-card-v2';
    const [aColor, bColor] = pairColors(pair.first, pair.second);
    card.style.setProperty('--pair-a', aColor);
    card.style.setProperty('--pair-b', bColor);
    const categorySimilarity = categoryPairs.get(`${pair.first}\u0000${pair.second}`);
    card.append(
      createText('strong', `${pair.first} ↔ ${pair.second}`),
      createText('b', pair.value == null ? '—' : percent(pair.value)),
      createText('p', `Совпадение нормализованных названий. Сходство долевой структуры категорий: ${percent(categorySimilarity)}.`)
    );
    elements.overlapGrid.append(card);
  }
}

function renderDistinctive() {
  elements.distinctiveGrid.replaceChildren();
  for (const [index, profile] of state.comparison.profiles.entries()) {
    const section = document.createElement('section');
    section.className = 'distinctive-region-v2';
    section.dataset.slot = String(index + 1);
    applySlotTheme(section, index + 1);
    section.append(
      createText('h4', profile.region),
      createText('p', 'До 12 названий, не совпавших с названиями в других выбранных субъектах.')
    );
    const values = state.comparison.distinctive.get(profile.region) || [];
    if (!values.length) {
      section.append(createText('p', profile.status === 'not-represented'
        ? 'Региональные записи в источнике не представлены.'
        : 'Отличительные названия в пределах показанного списка не выявлены.'));
    } else {
      const list = document.createElement('ul');
      for (const measure of values) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = catalogMeasureUrl(measure, { region: profile.region });
        link.textContent = measure.title;
        item.append(link);
        list.append(item);
      }
      section.append(list);
    }
    elements.distinctiveGrid.append(section);
  }
}

function renderStrategyCounts() {
  const coverage = strategyCoverageCounts(state.strategyIndex.documents);
  const selectedCount = filterStrategyDocuments(state.strategyIndex.documents, {
    scope: 'selected', selectedRegions: state.selected
  }).length;
  elements.selectedStrategyCount.textContent = formatNumber(selectedCount);
  elements.regionalStrategyCount.textContent = formatNumber(state.corpus.stats?.regional_total ?? 89);
  elements.federalStrategyCount.textContent = formatNumber(state.strategyIndex.documents.filter((doc) => doc.scope === 'federal').length);

  const stats = state.corpus.stats ?? {};
  const cards = [
    [stats.regional_total ?? 0, 'субъектов в матрице покрытия'],
    [coverage.full ?? 0, 'полных региональных текстов'],
    [coverage.partial ?? 0, 'частичных региональных материалов'],
    [stats.federal_available ?? 0, 'федеральных стратегических документов'],
    [stats.total_pages ?? 0, 'страниц в доступных PDF']
  ];
  elements.strategyCorpusStats.replaceChildren();
  for (const [value, label] of cards) {
    const card = document.createElement('article');
    card.className = 'corpus-stat';
    card.append(createText('strong', formatNumber(value)), createText('span', label));
    elements.strategyCorpusStats.append(card);
  }
}

function strategyCardMeta(strategyDocument) {
  if (strategyDocument.availability !== 'available') return strategyQualityLabel(strategyDocument);
  const parts = [strategyQualityLabel(strategyDocument), strategyDocument.period?.label, strategyDocument.pages ? `${formatNumber(strategyDocument.pages)} стр.` : null]
    .filter(Boolean);
  return parts.join(' · ');
}

function resetStrategyListLimit() {
  state.strategyListLimit = 24;
}

function renderStrategyList() {
  const filteredDocuments = filterStrategyDocuments(state.strategyIndex.documents, {
    query: state.strategyQuery,
    scope: state.strategyScope,
    quality: state.strategyQuality,
    temporal: state.strategyTemporal,
    selectedRegions: state.selected
  });
  const activeIndex = filteredDocuments.findIndex((item) => item.id === state.currentDocument?.id);
  if (activeIndex >= state.strategyListLimit) {
    state.strategyListLimit = Math.ceil((activeIndex + 1) / 24) * 24;
  }
  const documents = filteredDocuments.slice(0, state.strategyListLimit);
  elements.strategyDocumentList.replaceChildren();
  elements.strategyListSummary.textContent = filteredDocuments.length > documents.length
    ? `Показано ${formatNumber(documents.length)} из ${formatNumber(filteredDocuments.length)} документов и записей покрытия. Полный текст загружается только после отдельной команды.`
    : `${formatNumber(filteredDocuments.length)} документов и записей покрытия. Полный текст загружается только после отдельной команды.`;
  const remaining = Math.max(0, filteredDocuments.length - documents.length);
  elements.strategyLoadMore.hidden = remaining === 0;
  elements.strategyLoadMore.innerHTML = remaining
    ? `${icon('list-plus').outerHTML} Показать ещё ${formatNumber(Math.min(24, remaining))}`
    : '';

  if (!filteredDocuments.length) {
    const empty = document.createElement('div');
    empty.className = 'strategy-list-empty';
    empty.append(
      icon('file-x-2'),
      createText('p', state.strategyScope === 'selected' && !state.selected.length
        ? 'Сначала выберите на карте хотя бы один субъект или откройте вкладку «Все субъекты».'
        : 'По заданным фильтрам документы не найдены.')
    );
    elements.strategyDocumentList.append(empty);
    refreshIcons();
    return;
  }

  for (const strategyDocument of documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `strategy-document-card${state.currentDocument?.id === strategyDocument.id ? ' is-active' : ''}`;
    button.dataset.documentId = strategyDocument.id;
    const iconBox = document.createElement('span');
    iconBox.className = 'strategy-document-card__icon';
    iconBox.append(icon(strategyDocument.availability === 'available' ? 'file-text' : 'file-warning'));
    const body = document.createElement('span');
    body.className = 'strategy-document-card__body';
    body.append(
      createText('strong', strategyDocument.title),
      createText('small', [strategyDocument.territory, strategyDocument.act || strategyDocument.quality_note].filter(Boolean).join(' · ') || 'Метаданные ограничены')
    );
    const meta = document.createElement('span');
    meta.className = 'strategy-document-card__meta';
    meta.append(
      createText('span', strategyCardMeta(strategyDocument)),
      createText('span', strategyTemporalLabel(strategyDocument))
    );
    button.append(iconBox, body, meta);
    button.addEventListener('click', () => openStrategyDocument(strategyDocument));
    elements.strategyDocumentList.append(button);
  }
  refreshIcons();
}

function groupLabel(strategyDocument) {
  return STRATEGY_GROUP_LABELS[strategyDocument.group] ?? 'Документ';
}

function openStrategyDocument(strategyDocument, { updateUrl = true } = {}) {
  if (!strategyDocument) return;
  state.currentDocument = strategyDocument;
  elements.strategyWorkspace?.classList.add('has-open-document');
  elements.strategyViewerPlaceholder.hidden = true;
  elements.strategyViewerContent.hidden = false;
  elements.strategyViewerEyebrow.textContent = `${groupLabel(strategyDocument)} · ${strategyQualityLabel(strategyDocument)}`;
  elements.strategyViewerDocumentTitle.textContent = strategyDocument.title;
  elements.strategyViewerDocumentMeta.textContent = [strategyDocument.territory, strategyDocument.period?.label, strategyDocument.revision ? `редакция: ${strategyDocument.revision}` : null]
    .filter(Boolean).join(' · ');
  renderStrategyViewerActions(strategyDocument);
  appendDefinitionList(elements.strategyViewerDetails, [
    ['Территория', strategyDocument.territory || 'Российская Федерация'],
    ['Нормативное основание', strategyDocument.act || 'в метаданных корпуса не установлено'],
    ['Период', strategyDocument.period?.label || 'не установлен'],
    ['Временной статус', strategyTemporalLabel(strategyDocument)],
    ['Объём', strategyDocument.pages ? `${formatNumber(strategyDocument.pages)} стр.; ${formatFileSize(strategyDocument.size_bytes)}` : 'файл недоступен'],
    ['Контрольная сумма', strategyDocument.sha256 ? `SHA-256: ${strategyDocument.sha256}` : 'не рассчитывалась'],
    ['Исходное имя', strategyDocument.source_filename || 'не указано'],
    ['Примечание', strategyDocument.quality_note || 'Техническая читаемость проверена; официальная актуальность требует отдельной верификации.']
  ]);
  prepareDocumentStage(strategyDocument);
  renderStrategyList();
  if (updateUrl) syncQuery();
  if (matchMedia('(max-width: 980px)').matches) {
    requestAnimationFrame(() => elements.strategyViewer?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  refreshIcons();
}

function renderStrategyViewerActions(strategyDocument) {
  elements.strategyViewerActions.replaceChildren();
  if (strategyDocument.download_url) {
    const download = document.createElement('a');
    download.href = strategyDocument.download_url;
    download.download = '';
    download.append(icon('download'), document.createTextNode('Скачать PDF'));
    elements.strategyViewerActions.append(download);
  }
  if (strategyDocument.original_url) {
    const original = document.createElement('a');
    original.href = strategyDocument.original_url;
    original.download = '';
    original.append(icon('file-down'), document.createTextNode(`Скачать ${originalDocumentFormat(strategyDocument)}`));
    elements.strategyViewerActions.append(original);
  }
  if (strategyDocument.official_url) {
    const official = document.createElement('a');
    official.href = strategyDocument.official_url;
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    official.append(icon('landmark'), document.createTextNode('Официальная публикация'));
    elements.strategyViewerActions.append(official);
  }
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.append(icon('link'), document.createTextNode('Ссылка на документ'));
  copy.addEventListener('click', async () => {
    const copied = await copyText(strategyPermalink(strategyDocument, currentUrl().href).href);
    showToast(copied ? 'Ссылка на документ скопирована.' : 'Не удалось скопировать ссылку.');
  });
  elements.strategyViewerActions.append(copy);
}

function originalDocumentFormat(strategyDocument) {
  const match = String(strategyDocument.original_url || strategyDocument.source_filename || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/iu);
  return match?.[1]?.toUpperCase() || 'исходник';
}

function canRenderDocx(strategyDocument) {
  return originalDocumentFormat(strategyDocument) === 'DOCX' && Boolean(strategyDocument.original_url);
}

function abortDocumentLoad() {
  documentLoadController?.abort();
  documentLoadController = null;
}

function resetDocumentStage() {
  abortDocumentLoad();
  elements.strategyPdfFrame.src = 'about:blank';
  elements.strategyPdfFrame.hidden = true;
  elements.strategyDocxViewer.replaceChildren();
  elements.strategyDocxViewer.hidden = true;
  elements.strategyDocumentLoading.hidden = true;
  elements.strategyDocumentError.hidden = true;
  elements.strategyDocumentErrorText.textContent = '';
  elements.strategyDocumentConsent.hidden = false;
}

function prepareDocumentStage(strategyDocument) {
  resetDocumentStage();
  elements.loadStrategyPdf.hidden = false;
  elements.loadStrategyDocx.hidden = !canRenderDocx(strategyDocument);
  elements.strategyDocumentStage.querySelector('.strategy-unavailable-stage')?.remove();

  if (strategyDocument.availability !== 'available' || !strategyDocument.pdf_url) {
    elements.strategyDocumentConsent.hidden = true;
    const unavailable = document.createElement('div');
    unavailable.className = 'strategy-unavailable-stage';
    unavailable.append(
      icon(strategyDocument.availability === 'missing' ? 'file-question' : 'file-warning'),
      createText('p', strategyDocument.quality_note || 'Полный текст отсутствует в переданном корпусе. Запись сохранена, чтобы отсутствие документа не интерпретировалось как отсутствие региональной политики.')
    );
    elements.strategyDocumentStage.append(unavailable);
    refreshIcons();
    return;
  }

  const formats = canRenderDocx(strategyDocument) ? 'PDF или исходный DOCX' : 'PDF';
  elements.strategyDocumentConsentTitle.textContent = `${formats} пока не загружен${canRenderDocx(strategyDocument) ? 'ы' : ''}`;
  elements.strategyDocumentConsentText.textContent = `${formatNumber(strategyDocument.pages || 0)} стр., PDF — ${formatFileSize(strategyDocument.size_bytes)}. Выберите формат для просмотра внутри страницы; остальные файлы останутся незагруженными.`;
}

function loadCurrentPdf() {
  const strategyDocument = state.currentDocument;
  if (!strategyDocument?.pdf_url) return;
  lastDocumentFormat = 'pdf';
  abortDocumentLoad();
  elements.strategyDocxViewer.replaceChildren();
  elements.strategyDocxViewer.hidden = true;
  elements.strategyDocumentLoading.hidden = true;
  elements.strategyDocumentError.hidden = true;
  elements.strategyPdfFrame.src = `${strategyDocument.pdf_url}#toolbar=1&navpanes=0&view=FitH`;
  elements.strategyDocumentConsent.hidden = true;
  elements.strategyPdfFrame.hidden = false;
  elements.strategyPdfFrame.focus({ preventScroll: true });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-document-runtime="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    const handleLoad = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    const handleError = () => {
      script.remove();
      reject(new Error(`Не удалось загрузить компонент ${src}.`));
    };
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.documentRuntime = src;
      document.head.append(script);
    }
  });
}

function ensureDocxRuntime() {
  if (window.docx?.renderAsync && window.JSZip) return Promise.resolve(window.docx);
  if (!docxRuntimePromise) {
    docxRuntimePromise = DOCX_RUNTIME_SCRIPTS.reduce(
      (chain, src) => chain.then(() => loadScript(src)),
      Promise.resolve()
    ).then(() => {
      if (!window.docx?.renderAsync || !window.JSZip) throw new Error('Компонент просмотра DOCX загрузился некорректно.');
      return window.docx;
    }).catch((error) => {
      docxRuntimePromise = null;
      throw error;
    });
  }
  return docxRuntimePromise;
}

function showDocumentLoading(message) {
  elements.strategyDocumentConsent.hidden = true;
  elements.strategyPdfFrame.src = 'about:blank';
  elements.strategyPdfFrame.hidden = true;
  elements.strategyDocxViewer.hidden = true;
  elements.strategyDocumentError.hidden = true;
  elements.strategyDocumentLoadingText.textContent = message;
  elements.strategyDocumentLoading.hidden = false;
}

function showDocumentError(error) {
  elements.strategyDocumentLoading.hidden = true;
  elements.strategyDocumentErrorText.textContent = `${error?.message || 'Неизвестная ошибка.'} Файл можно скачать по ссылке выше.`;
  elements.strategyDocumentError.hidden = false;
}

async function loadCurrentDocx() {
  const strategyDocument = state.currentDocument;
  if (!canRenderDocx(strategyDocument)) return;

  lastDocumentFormat = 'docx';
  abortDocumentLoad();
  elements.strategyDocxViewer.replaceChildren();
  showDocumentLoading('Подключаем просмотрщик DOCX…');
  const documentId = strategyDocument.id;

  try {
    const renderer = await ensureDocxRuntime();
    if (state.currentDocument?.id !== documentId) return;

    const controller = new AbortController();
    documentLoadController = controller;
    showDocumentLoading('Загружаем выбранный DOCX…');
    const response = await fetch(strategyDocument.original_url, {
      cache: 'default',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Сервер вернул ошибку ${response.status}.`);
    const contents = await response.arrayBuffer();
    if (state.currentDocument?.id !== documentId || controller.signal.aborted) return;

    showDocumentLoading('Готовим страницы документа…');
    await renderer.renderAsync(contents, elements.strategyDocxViewer, elements.strategyDocxViewer, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderAltChunks: false,
      debug: false
    });
    if (state.currentDocument?.id !== documentId || controller.signal.aborted) return;
    elements.strategyDocumentLoading.hidden = true;
    elements.strategyDocxViewer.hidden = false;
    elements.strategyDocxViewer.focus({ preventScroll: true });
  } catch (error) {
    if (error?.name !== 'AbortError' && state.currentDocument?.id === documentId) showDocumentError(error);
  }
}

function retryCurrentDocument() {
  if (lastDocumentFormat === 'docx') loadCurrentDocx();
  else loadCurrentPdf();
}

function closeStrategyViewer() {
  state.currentDocument = null;
  elements.strategyWorkspace?.classList.remove('has-open-document');
  resetDocumentStage();
  elements.strategyViewerContent.hidden = true;
  elements.strategyViewerPlaceholder.hidden = false;
  elements.strategyDocumentStage.querySelector('.strategy-unavailable-stage')?.remove();
  renderStrategyList();
  syncQuery();
}

function exportCsv() {
  if (!state.comparison) return;
  downloadText(
    `family-support-comparison-${new Date().toISOString().slice(0, 10)}.csv`,
    comparisonToCsv(state.comparison, state.meta),
    'text/csv;charset=utf-8'
  );
}

function exportJson() {
  if (!state.comparison) return;
  const payload = buildResearchExport({
    comparison: state.comparison,
    strategies: strategySummaryForRegions(state.strategyIndex, state.selected),
    meta: state.meta
  });
  downloadText(
    `family-support-comparison-${new Date().toISOString().slice(0, 10)}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
    'application/json;charset=utf-8'
  );
}

async function copyComparisonLink() {
  const url = currentUrl({ includeDocument: false });
  url.hash = 'comparison-output';
  const copied = await copyText(url.href);
  showToast(copied ? 'Ссылка на сравнение скопирована.' : 'Не удалось скопировать ссылку.');
}

function setupControls() {
  elements.openRegionSearch.addEventListener('click', () => {
    const open = elements.regionSearchPanel.hidden;
    elements.regionSearchPanel.hidden = !open;
    elements.openRegionSearch.setAttribute('aria-expanded', String(open));
    if (open) {
      renderRegionSearch();
      elements.regionSearchInput.focus();
    }
  });
  elements.regionSearchInput.addEventListener('input', renderRegionSearch);
  elements.clearRegions.addEventListener('click', clearRegions);
  elements.runComparison.addEventListener('click', () => renderComparison({ scroll: true }));

  for (const input of elements.mapLayerInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.mapLayer = input.value;
      renderMapLayer();
      syncQuery();
    });
  }
  for (const input of elements.chartModeInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.chartMode = input.value;
      if (state.comparison) renderCategories();
      syncQuery();
    });
  }

  elements.copyComparisonLink.addEventListener('click', copyComparisonLink);
  elements.downloadComparison.addEventListener('click', exportCsv);
  elements.downloadResearchJson.addEventListener('click', exportJson);
  elements.printComparison.addEventListener('click', () => print());

}

function validateDocumentRequest(documentId) {
  if (!documentId) return;
  const url = new URL('./documents.html', location.href);
  for (const region of state.selected) url.searchParams.append('region', region);
  url.searchParams.set('doc', documentId);
  url.hash = 'document-library';
  location.replace(url.href);
}

async function initialize() {
  initModuleShell('compare');
  setupControls();
  setupMapInteractions();
  try {
    const [platform, corpus] = await Promise.all([
      loadPlatformData({ includeGeo: true }),
      loadStrategyCorpus()
    ]);
    state.measures = platform.measures;
    state.meta = platform.meta;
    state.regions = platform.regions;
    state.geoData = platform.geoData;
    state.coverage = catalogCoverage(state.measures, state.regions);
    state.corpus = corpus;
    state.strategyIndex = createStrategyIndex(corpus);
    buildRegionalCounts();
    const requestedDocument = restoreQuery();
    if (requestedDocument) {
      validateDocumentRequest(requestedDocument);
      return;
    }
    updateDataStatus();
    renderMap();
    renderSelectedRegions();
    renderRegionSearch();
    if (state.selected.length >= 2) renderComparison();
    syncQuery();
    refreshIcons();
  } catch (error) {
    console.error(error);
    elements.dataStatus.classList.add('is-error');
    elements.dataStatus.querySelector('span').textContent = 'Не удалось загрузить данные сравнения. Проверьте целостность каталога, GeoJSON и реестра стратегий.';
    elements.comparisonMapEmpty.hidden = false;
    elements.comparisonMap.hidden = true;
  }
}

initialize();
