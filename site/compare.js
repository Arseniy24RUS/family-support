import {
  catalogCoverage,
  catalogMeasureUrl,
  formatDate,
  loadPlatformData,
  pluralMeasures
} from './lib/platform-core.js';
import {
  compareRegions,
  comparisonToCsv
} from './lib/region-comparison-engine.js';
import {
  copyText,
  downloadText,
  icon,
  initModuleShell,
  refreshIcons,
  showToast
} from './lib/module-shell.js';

const state = {
  measures: [],
  meta: {},
  regions: [],
  coverage: null,
  selected: [],
  comparison: null
};

const elements = {
  dataStatus: document.querySelector('#data-status'),
  form: document.querySelector('#compare-form'),
  select: document.querySelector('#compare-region-select'),
  add: document.querySelector('#add-region'),
  run: document.querySelector('#run-comparison'),
  selected: document.querySelector('#selected-regions'),
  placeholder: document.querySelector('#comparison-placeholder'),
  results: document.querySelector('#comparison-results'),
  warning: document.querySelector('#coverage-warning'),
  metrics: document.querySelector('#regional-metrics'),
  bars: document.querySelector('#comparison-bars'),
  table: document.querySelector('#category-table'),
  overlaps: document.querySelector('#overlap-grid'),
  distinctive: document.querySelector('#distinctive-grid'),
  copyLink: document.querySelector('#copy-comparison-link'),
  download: document.querySelector('#download-comparison'),
  print: document.querySelector('#print-comparison')
};

function populateRegions() {
  for (const region of state.regions) {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    elements.select.append(option);
  }
}

function comparisonUrl() {
  const url = new URL(location.href);
  url.search = '';
  for (const region of state.selected) url.searchParams.append('region', region);
  return url;
}

function syncQuery() {
  const url = comparisonUrl();
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function restoreQuery() {
  const params = new URLSearchParams(location.search);
  const regions = params.getAll('region')
    .filter((region) => state.regions.includes(region));
  state.selected = [...new Set(regions)].slice(0, 4);
}

function updateDataStatus() {
  const measureCount = state.measures.length;
  elements.dataStatus.querySelector('span').textContent = [
    `Снимок от ${formatDate(state.meta.generated_at)}: ${measureCount.toLocaleString('ru-RU')} ${pluralMeasures(measureCount)}.`,
    `${state.coverage.representedCount} из ${state.coverage.totalRegions} субъектов представлены региональными карточками.`,
    'Сравнение использует абсолютные числа записей без нормирования на население или бюджет.'
  ].join(' ');
}

function renderSelected() {
  elements.selected.replaceChildren();
  if (!state.selected.length) {
    const hint = document.createElement('p');
    hint.className = 'selected-regions__hint';
    hint.textContent = 'Регионы ещё не выбраны.';
    elements.selected.append(hint);
  } else {
    for (const region of state.selected) {
      const chip = document.createElement('span');
      chip.className = 'selected-region-chip';
      const text = document.createElement('span');
      text.textContent = region;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Удалить из сравнения: ${region}`);
      remove.append(icon('x'));
      remove.addEventListener('click', () => {
        state.selected = state.selected.filter((item) => item !== region);
        state.comparison = null;
        renderSelected();
        syncQuery();
        hideResults();
      });
      chip.append(text, remove);
      elements.selected.append(chip);
    }
  }
  elements.run.disabled = state.selected.length < 2;
  elements.add.disabled = state.selected.length >= 4;
  refreshIcons();
}

function addSelectedRegion() {
  const region = elements.select.value;
  if (!region) {
    showToast('Сначала выберите регион.');
    return;
  }
  if (state.selected.includes(region)) {
    showToast('Этот регион уже включён в сравнение.');
    return;
  }
  if (state.selected.length >= 4) {
    showToast('Одновременно можно сравнить не более четырёх регионов.');
    return;
  }
  state.selected.push(region);
  elements.select.value = '';
  renderSelected();
  syncQuery();
}

function hideResults() {
  elements.results.hidden = true;
  elements.placeholder.hidden = false;
}

function percent(value) {
  return value == null ? '—' : `${(value * 100).toFixed(1).replace('.', ',')}%`;
}

function createMetricCard(profile, max) {
  const article = document.createElement('article');
  article.className = `region-metric-card${profile.status === 'not-represented' ? ' is-missing' : ''}`;
  const heading = document.createElement('div');
  heading.className = 'region-metric-card__heading';
  const title = document.createElement('h3');
  title.textContent = profile.region;
  const status = document.createElement('span');
  status.textContent = profile.status === 'represented' ? 'Есть записи источника' : 'Нет записей источника';
  heading.append(title, status);

  const value = document.createElement('strong');
  value.className = 'region-metric-card__value';
  value.textContent = profile.regionalCount.toLocaleString('ru-RU');
  const label = document.createElement('p');
  label.textContent = `${pluralMeasures(profile.regionalCount)} регионального уровня в текущем снимке`;

  const bar = document.createElement('div');
  bar.className = 'metric-progress';
  const fill = document.createElement('span');
  fill.style.width = `${profile.regionalCount / max * 100}%`;
  bar.append(fill);

  const dl = document.createElement('dl');
  const rows = [
    ['Категорий', profile.categoryCount.toLocaleString('ru-RU')],
    ['Крупнейшая категория', profile.largestCategory?.category || 'данные не представлены'],
    ['Её доля', profile.largestCategory ? percent(profile.largestCategory.share) : '—']
  ];
  for (const [term, result] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = result;
    dl.append(dt, dd);
  }
  article.append(heading, value, label, bar, dl);
  return article;
}

function renderCoverageWarning() {
  const missing = state.comparison.profiles.filter((profile) => profile.status === 'not-represented');
  elements.warning.hidden = missing.length === 0;
  if (!missing.length) return;
  elements.warning.replaceChildren(icon('triangle-alert'));
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Сравнение содержит регионы без записей в текущем источнике';
  const paragraph = document.createElement('p');
  paragraph.textContent = `${missing.map((profile) => profile.region).join(', ')}. Нулевые значения описывают полноту каталога, а не фактическое отсутствие мер поддержки.`;
  text.append(title, paragraph);
  elements.warning.append(text);
}

function renderMetrics() {
  elements.metrics.replaceChildren();
  for (const profile of state.comparison.profiles) {
    elements.metrics.append(createMetricCard(profile, state.comparison.maxRegionalCount));
  }
}

function renderBars() {
  elements.bars.replaceChildren();
  const topRows = state.comparison.categoryRows.slice(0, 8);
  const max = Math.max(1, ...topRows.flatMap((row) => Object.values(row.values)));
  for (const row of topRows) {
    const group = document.createElement('div');
    group.className = 'comparison-bar-group';
    const title = document.createElement('strong');
    title.textContent = row.category;
    const series = document.createElement('div');
    series.className = 'comparison-bar-group__series';
    for (const profile of state.comparison.profiles) {
      const value = row.values[profile.region] || 0;
      const line = document.createElement('div');
      line.className = 'comparison-bar-line';
      const label = document.createElement('span');
      label.textContent = profile.region;
      const track = document.createElement('div');
      track.className = 'comparison-bar-track';
      const fill = document.createElement('span');
      fill.style.width = `${value / max * 100}%`;
      track.append(fill);
      const number = document.createElement('b');
      number.textContent = value.toLocaleString('ru-RU');
      line.append(label, track, number);
      series.append(line);
    }
    group.append(title, series);
    elements.bars.append(group);
  }
}

function renderCategoryTable() {
  const caption = document.createElement('caption');
  caption.textContent = 'Число региональных записей по категориям';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const category = document.createElement('th');
  category.scope = 'col';
  category.textContent = 'Категория';
  headRow.append(category);
  for (const profile of state.comparison.profiles) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = profile.region;
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const row of state.comparison.categoryRows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row.category;
    tr.append(th);
    for (const profile of state.comparison.profiles) {
      const td = document.createElement('td');
      td.textContent = (row.values[profile.region] || 0).toLocaleString('ru-RU');
      tr.append(td);
    }
    tbody.append(tr);
  }
  elements.table.replaceChildren(caption, thead, tbody);
}

function renderOverlap() {
  elements.overlaps.replaceChildren();
  if (!state.comparison.overlaps.length) return;
  for (const pair of state.comparison.overlaps) {
    const card = document.createElement('article');
    card.className = 'overlap-card';
    const title = document.createElement('strong');
    title.textContent = `${pair.first} ↔ ${pair.second}`;
    const value = document.createElement('b');
    value.textContent = pair.value == null ? 'недостаточно данных' : percent(pair.value);
    const text = document.createElement('p');
    text.textContent = 'совпадение нормализованных названий региональных записей';
    card.append(title, value, text);
    elements.overlaps.append(card);
  }
}

function renderDistinctive() {
  elements.distinctive.replaceChildren();
  for (const profile of state.comparison.profiles) {
    const section = document.createElement('section');
    section.className = 'distinctive-region';
    const title = document.createElement('h4');
    title.textContent = profile.region;
    const hint = document.createElement('p');
    hint.textContent = 'Названия, не совпавшие с названиями в других выбранных регионах:';
    const values = state.comparison.distinctive.get(profile.region) || [];
    if (!values.length) {
      const empty = document.createElement('p');
      empty.className = 'distinctive-region__empty';
      empty.textContent = profile.status === 'not-represented'
        ? 'Региональные записи в источнике не представлены.'
        : 'Отличительные названия в пределах показанного списка не выявлены.';
      section.append(title, hint, empty);
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
      section.append(title, hint, list);
    }
    elements.distinctive.append(section);
  }
}

function renderComparison() {
  state.comparison = compareRegions(state.measures, state.selected);
  elements.placeholder.hidden = true;
  elements.results.hidden = false;
  renderCoverageWarning();
  renderMetrics();
  renderBars();
  renderCategoryTable();
  renderOverlap();
  renderDistinctive();
  refreshIcons();
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindEvents() {
  elements.add.addEventListener('click', addSelectedRegion);
  elements.select.addEventListener('change', () => {
    if (elements.select.value && state.selected.length < 4) addSelectedRegion();
  });
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.selected.length < 2) {
      showToast('Для сравнения необходимо выбрать не менее двух регионов.');
      return;
    }
    syncQuery();
    renderComparison();
  });

  elements.copyLink.addEventListener('click', async () => {
    const copied = await copyText(comparisonUrl().href);
    showToast(copied ? 'Ссылка на сравнение скопирована.' : 'Не удалось скопировать ссылку.');
  });
  elements.download.addEventListener('click', () => {
    const csv = comparisonToCsv(state.comparison, state.meta);
    downloadText('sravnenie-regionov.csv', csv, 'text/csv;charset=utf-8');
    showToast('Таблица сравнения сохранена в CSV.');
  });
  elements.print.addEventListener('click', () => window.print());
}

async function init() {
  initModuleShell('compare');
  bindEvents();
  try {
    const data = await loadPlatformData();
    state.measures = data.measures;
    state.meta = data.meta;
    state.regions = data.regions;
    state.coverage = catalogCoverage(data.measures, data.regions);
    populateRegions();
    updateDataStatus();
    restoreQuery();
    renderSelected();
    if (state.selected.length >= 2) renderComparison();
  } catch (error) {
    elements.dataStatus.classList.add('is-error');
    elements.dataStatus.querySelector('span').textContent = String(error?.message || error);
    showToast('Не удалось загрузить каталог.');
  }
}

init();
