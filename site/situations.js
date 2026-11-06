import {
  buildIssueUrl,
  catalogCoverage,
  catalogMeasureUrl,
  createDetailRepository,
  formatDate,
  inferProviderType,
  levelLabel,
  loadPlatformData,
  pluralMeasures,
  sourceName
} from './lib/platform-core.js';
import {
  LIFE_SITUATIONS,
  PROFILE_FACTS,
  matchMeasuresToProfile,
  profileSummary
} from './lib/life-situation-engine.js';
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
  details: null,
  profile: null,
  matches: null,
  factAnswers: {},
  clarificationFacts: new Map(),
  started: false,
  activeResult: null
};

const elements = {
  form: document.querySelector('#profile-form'),
  region: document.querySelector('#situation-region'),
  targetRegion: document.querySelector('#situation-target-region'),
  targetRegionField: document.querySelector('#situation-target-region-field'),
  situationGrid: document.querySelector('#situation-grid'),
  studentFamilyDefinition: document.querySelector('#student-family-definition'),
  factGrid: document.querySelector('#fact-grid'),
  query: document.querySelector('#profile-query'),
  dataStatus: document.querySelector('#data-status'),
  placeholder: document.querySelector('#results-placeholder'),
  profileSummary: document.querySelector('#profile-summary'),
  warning: document.querySelector('#matching-warning'),
  clarifications: document.querySelector('#matching-clarifications'),
  clarificationTitle: document.querySelector('#matching-clarifications-title'),
  clarificationHint: document.querySelector('#matching-clarifications-hint'),
  clarificationGrid: document.querySelector('#clarification-grid'),
  count: document.querySelector('#matching-count'),
  results: document.querySelector('#matching-results'),
  tools: document.querySelector('#results-tools'),
  copyLink: document.querySelector('#copy-profile-link'),
  downloadPlan: document.querySelector('#download-plan'),
  print: document.querySelector('#print-results'),
  dialog: document.querySelector('#module-measure-dialog'),
  dialogTitle: document.querySelector('#module-measure-title'),
  dialogScope: document.querySelector('#module-measure-scope'),
  dialogBody: document.querySelector('#module-measure-body')
};

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

function renderSituationChoices() {
  const fragment = document.createDocumentFragment();
  for (const item of LIFE_SITUATIONS) {
    const label = document.createElement('label');
    label.className = 'situation-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'life-situation';
    input.value = item.id;
    input.required = true;

    const card = document.createElement('span');
    card.className = 'situation-option__card';
    const iconBox = document.createElement('span');
    iconBox.className = 'situation-option__icon';
    iconBox.append(icon(item.icon));
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const description = document.createElement('small');
    description.textContent = item.description;
    text.append(title, description);
    card.append(iconBox, text);
    label.append(input, card);
    fragment.append(label);
  }
  elements.situationGrid.replaceChildren(fragment);
}

function factAnswerValue(answer) {
  return answer === true ? 'yes' : answer === false ? 'no' : 'unknown';
}

function createFactChoice(item, { clarification = false } = {}) {
  const label = document.createElement('label');
  label.className = 'fact-option';
  const id = `${clarification ? 'clarification' : 'profile-fact'}-${item.id}`;
  label.htmlFor = id;
  const text = document.createElement('span');
  text.id = `${id}-label`;
  text.textContent = item.label;
  const select = document.createElement('select');
  select.id = id;
  select.name = clarification ? 'clarification-fact' : 'profile-fact';
  select.dataset.factId = item.id;
  select.setAttribute('aria-labelledby', text.id);
  for (const [value, title] of [['unknown', 'Не указано'], ['yes', 'Да'], ['no', 'Нет']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = title;
    select.append(option);
  }
  select.value = factAnswerValue(state.factAnswers[item.id]);
  label.append(text, select);
  if (clarification) {
    const hint = document.createElement('small');
    hint.id = `${id}-hint`;
    const count = Number(item.count) || 0;
    hint.textContent = count
      ? `Карточек с этим условием: ${count.toLocaleString('ru-RU')}.`
      : 'Ответ учтён. Его можно изменить.';
    select.setAttribute('aria-describedby', hint.id);
    label.append(hint);
  } else {
    select.setAttribute('aria-describedby', 'profile-facts-hint');
  }
  return label;
}

function renderFactChoices() {
  elements.factGrid.replaceChildren(...PROFILE_FACTS
    .filter((item) => item.primary !== false)
    .map((item) => createFactChoice(item)));
}

function setFactAnswer(select) {
  const id = select.dataset.factId;
  state.factAnswers[id] = select.value === 'yes' ? true : select.value === 'no' ? false : null;
  for (const other of document.querySelectorAll('select[data-fact-id]')) {
    if (other.dataset.factId === id) other.value = factAnswerValue(state.factAnswers[id]);
  }
}

function populateRegions() {
  for (const region of state.regions) {
    for (const select of [elements.region, elements.targetRegion]) {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      select.append(option);
    }
  }
}

function selectedSituationId() {
  return elements.form.elements.namedItem('life-situation')?.value || '';
}

function updateSituationFields() {
  const situationId = selectedSituationId();
  elements.studentFamilyDefinition.hidden = situationId !== 'student-family';
  const showTargetRegion = situationId === 'housing' || situationId === 'move';
  elements.targetRegionField.hidden = !showTargetRegion;
  elements.targetRegion.disabled = !showTargetRegion;
}

function currentProfile() {
  const situationId = selectedSituationId();
  return {
    region: elements.region.value,
    targetRegion: situationId === 'housing' || situationId === 'move' ? elements.targetRegion.value : '',
    situationId,
    factAnswers: { ...state.factAnswers },
    query: elements.query.value.trim()
  };
}

function answeredFactLabels(profile) {
  const labels = new Map(PROFILE_FACTS.map((item) => [item.id, item.label]));
  for (const item of state.clarificationFacts.values()) labels.set(item.id, item.label);
  return Object.entries(profile.factAnswers || {})
    .filter(([, answer]) => answer === true || answer === false)
    .map(([id, answer]) => `${labels.get(id) || id}: ${answer ? 'Да' : 'Нет'}`);
}

function publicProfileUrl(profile = currentProfile()) {
  const url = new URL(location.href);
  url.search = '';
  if (profile.region) url.searchParams.set('region', profile.region);
  if (profile.situationId) url.searchParams.set('situation', profile.situationId);
  return url;
}

function syncPublicQuery(profile) {
  const url = publicProfileUrl(profile);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function restorePublicQuery() {
  const params = new URLSearchParams(location.search);
  const region = params.get('region') || '';
  const situationId = params.get('situation') || '';
  if (state.regions.includes(region)) elements.region.value = region;
  const radio = [...elements.form.querySelectorAll('input[name="life-situation"]')]
    .find((input) => input.value === situationId);
  if (radio) radio.checked = true;
  return Boolean(elements.region.value && radio);
}

function updateDataStatus() {
  const measureCount = state.measures.length;
  const officialCount = Number(state.meta.official_link_count) || 0;
  const generated = formatDate(state.meta.generated_at);
  elements.dataStatus.classList.remove('is-error');
  elements.dataStatus.querySelector('span').textContent = [
    `Снимок от ${generated}: ${measureCount.toLocaleString('ru-RU')} ${pluralMeasures(measureCount)}.`,
    `${state.coverage.representedCount} из ${state.coverage.totalRegions} регионов имеют региональные записи.`,
    `${officialCount.toLocaleString('ru-RU')} точных официальных ссылок.`
  ].join(' ');
}

function statusLabel(tier) {
  return tier === 'high' ? 'Соответствует указанным условиям' : 'Нужно уточнить условия';
}

function createTag(text, modifier = '') {
  const tag = document.createElement('span');
  tag.className = `result-tag${modifier ? ` result-tag--${modifier}` : ''}`;
  tag.textContent = text;
  return tag;
}

function createReasonList(titleText, items, className) {
  if (!items.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = className;
  const title = document.createElement('strong');
  title.textContent = titleText;
  const list = document.createElement('ul');
  for (const value of items) {
    const item = document.createElement('li');
    item.textContent = value;
    list.append(item);
  }
  wrapper.append(title, list);
  return wrapper;
}

function createResultCard(result) {
  const measure = result.measure;
  const article = document.createElement('article');
  article.className = `matching-card matching-card--${result.tier}`;
  article.dataset.measureId = measure.id;

  const top = document.createElement('div');
  top.className = 'matching-card__top';
  const tags = document.createElement('div');
  tags.className = 'matching-card__tags';
  tags.append(createTag(statusLabel(result.tier), result.tier));
  tags.append(createTag(levelLabel(measure)));
  if (measure.level === 'regional' && measure.region) tags.append(createTag(measure.region, 'region'));
  if (measure.audiences?.includes('Студенческие семьи')) tags.append(createTag('Студенческие семьи'));
  top.append(tags);

  const title = document.createElement('h4');
  title.textContent = measure.title;
  const summary = document.createElement('p');
  summary.className = 'matching-card__summary';
  summary.textContent = measure.summary || 'Краткое описание в текущем снимке отсутствует.';
  article.append(top, title, summary);

  if (measure.benefit) {
    const benefit = document.createElement('div');
    benefit.className = 'matching-card__benefit';
    benefit.append(icon('gift'));
    const text = document.createElement('span');
    text.textContent = measure.benefit;
    benefit.append(text);
    article.append(benefit);
  }

  const reasons = createReasonList('Почему показана', result.reasons, 'matching-card__reasons');
  if (reasons) article.append(reasons);
  const missingFacts = result.missingFacts || [];
  const missing = createReasonList('Уточните для этой меры', missingFacts.map((item) => item.label), 'matching-card__missing');
  if (missing) article.append(missing);
  const checks = createReasonList('Что проверить', result.checks, 'matching-card__checks');
  if (checks) article.append(checks);

  const footer = document.createElement('div');
  footer.className = 'matching-card__footer';
  const source = document.createElement('small');
  source.textContent = `Источник: ${sourceName(measure)}`;
  const actions = document.createElement('div');
  actions.className = 'matching-card__actions';

  if (missingFacts.length) {
    const clarify = document.createElement('button');
    clarify.type = 'button';
    clarify.className = 'text-button';
    clarify.textContent = 'Уточнить условия';
    clarify.addEventListener('click', () => {
      const field = document.getElementById(`clarification-${missingFacts[0].id}`);
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    actions.append(clarify);
  }

  const details = document.createElement('button');
  details.type = 'button';
  details.className = 'secondary-action secondary-action--compact';
  details.textContent = 'Порядок оформления';
  details.addEventListener('click', () => openMeasure(result));

  const catalog = document.createElement('a');
  catalog.className = 'text-link text-link--arrow';
  catalog.href = catalogMeasureUrl(measure, { region: state.profile.region });
  catalog.textContent = 'Открыть в каталоге';
  catalog.append(icon('arrow-right'));

  actions.append(details, catalog);
  footer.append(source, actions);
  article.append(footer);
  return article;
}

function renderGroup(title, description, results, tier) {
  if (!results.length) return null;
  const section = document.createElement('section');
  section.className = `matching-group matching-group--${tier}`;
  const heading = document.createElement('div');
  heading.className = 'matching-group__heading';
  const text = document.createElement('div');
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  text.append(titleElement, paragraph);
  const count = document.createElement('span');
  count.textContent = `${results.length.toLocaleString('ru-RU')} ${pluralMeasures(results.length)}`;
  heading.append(text, count);
  const list = document.createElement('div');
  list.className = 'matching-group__list';
  for (const result of results) list.append(createResultCard(result));
  section.append(heading, list);
  return section;
}

function renderProfileSummary(profile) {
  const summary = profileSummary(profile);
  const heading = document.createElement('strong');
  heading.textContent = 'Параметры подбора';
  const chips = document.createElement('div');
  chips.className = 'profile-summary__chips';
  const targetRegion = summary.targetRegion || profile.targetRegion;
  for (const text of [
    summary.region,
    summary.situation,
    ...(targetRegion ? [`Регион жилья или участка: ${targetRegion}`] : []),
    ...answeredFactLabels(profile)
  ]) {
    if (!text) continue;
    const chip = document.createElement('span');
    chip.textContent = text;
    chips.append(chip);
  }
  if (summary.query) {
    const query = document.createElement('p');
    query.textContent = `Дополнительный запрос: ${summary.query}`;
    elements.profileSummary.replaceChildren(heading, chips, query);
  } else {
    elements.profileSummary.replaceChildren(heading, chips);
  }
  elements.profileSummary.hidden = false;
}

function renderCoverageWarning(profile) {
  const missing = !state.coverage.representedRegions.has(profile.region);
  elements.warning.hidden = !missing;
  if (!missing) return;
  elements.warning.replaceChildren(icon('info'));
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Региональные сведения в текущем источнике не представлены';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Результат будет состоять из федеральных карточек. Это не означает, что в регионе нет собственных мер поддержки.';
  text.append(title, paragraph);
  elements.warning.append(text);
}

function renderClarifications() {
  const questions = state.matches.questions || [];
  const retained = [...state.clarificationFacts.values()]
    .filter((item) => state.factAnswers[item.id] === true || state.factAnswers[item.id] === false)
    .map((item) => [item.id, { ...item, count: 0 }]);
  state.clarificationFacts = new Map(retained);
  for (const question of questions) state.clarificationFacts.set(question.id, question);
  elements.clarifications.hidden = !state.clarificationFacts.size;
  elements.clarificationTitle.textContent = questions.length ? 'Уточните условия семьи' : 'Уточнения учтены';
  elements.clarificationHint.textContent = questions.length
    ? 'Для части карточек не хватает ответов. Выберите «Да» или «Нет», если условие известно. Ответ «Не указано» оставит карточку в группе уточнений. Результаты обновятся сразу.'
    : 'Ответы применены к подбору. При изменении ответа результаты обновятся автоматически.';
  elements.clarificationGrid.replaceChildren(...[...state.clarificationFacts.values()]
    .map((item) => createFactChoice(item, { clarification: true })));
}

function renderMatches({ scroll = false } = {}) {
  elements.results.replaceChildren();
  elements.placeholder.hidden = true;
  elements.tools.hidden = false;
  renderClarifications();
  renderProfileSummary(state.profile);
  renderCoverageWarning(state.profile);
  elements.count.hidden = false;
  const total = state.matches.all.length;
  elements.count.textContent = `Показано: ${total.toLocaleString('ru-RU')} ${pluralMeasures(total)}. `
    + `Соответствуют указанным условиям: ${state.matches.high.length.toLocaleString('ru-RU')}. `
    + `Нужно уточнить: ${state.matches.check.length.toLocaleString('ru-RU')}.`;

  if (!state.matches.all.length) {
    const empty = document.createElement('div');
    empty.className = 'results-empty';
    empty.append(icon('search-x'));
    const title = document.createElement('h3');
    title.textContent = 'Карточки по заданным условиям не найдены';
    const text = document.createElement('p');
    text.textContent = 'Проверьте регион, жизненную ситуацию и ответы. Отсутствие результата не доказывает отсутствие права на поддержку.';
    empty.append(title, text);
    elements.results.append(empty);
    refreshIcons();
    if (scroll) elements.count.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const groups = [
    renderGroup(
      'Соответствуют указанным условиям',
      'Карточки связаны с выбранной ситуацией; распознанные обязательные условия подтверждены вашими ответами. Перед обращением проверьте полные условия в официальном источнике.',
      state.matches.high,
      'high'
    ),
    renderGroup(
      'Нужно уточнить условия',
      'Применимость этих карточек пока не подтверждена. Для каждой меры указаны недостающие сведения; после уточнения карточка перейдёт в подходящие или будет исключена.',
      state.matches.check,
      'check'
    )
  ].filter(Boolean);
  elements.results.append(...groups);
  refreshIcons();
  if (scroll) {
    (elements.clarifications.hidden ? elements.count : elements.clarifications)
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearResults() {
  state.profile = null;
  state.matches = null;
  elements.results.replaceChildren();
  elements.profileSummary.replaceChildren();
  elements.count.textContent = '';
  elements.profileSummary.hidden = true;
  elements.warning.hidden = true;
  elements.clarifications.hidden = true;
  elements.count.hidden = true;
  elements.tools.hidden = true;
  elements.placeholder.hidden = false;
}

function updateMatches({ scroll = false, focusId = '' } = {}) {
  if (!elements.form.checkValidity()) {
    clearResults();
    syncPublicQuery(currentProfile());
    return;
  }
  state.profile = currentProfile();
  state.matches = matchMeasuresToProfile(state.measures, state.profile);
  syncPublicQuery(state.profile);
  renderMatches({ scroll });
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function handleSubmit(event) {
  event.preventDefault();
  if (!elements.form.reportValidity()) return;
  state.started = true;
  updateMatches({ scroll: true });
}

function createDetailSection(titleText, values, ordered = false) {
  if (!Array.isArray(values) || !values.length) return null;
  const section = document.createElement('section');
  section.className = 'measure-detail-section';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const list = document.createElement(ordered ? 'ol' : 'ul');
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = value;
    list.append(item);
  }
  section.append(title, list);
  return section;
}

function renderDetail(result, detail) {
  const measure = result.measure;
  const fragment = document.createDocumentFragment();
  const quality = document.createElement('div');
  const links = (detail.official_links || [])
    .map((link) => ({ ...link, safeUrl: officialUrl(link.url) }))
    .filter((link) => link.safeUrl);
  quality.className = `detail-quality${links.length ? ' detail-quality--verified' : ' detail-quality--caution'}`;
  quality.append(icon(links.length ? 'badge-check' : 'triangle-alert'));
  const qualityText = document.createElement('div');
  const qualityTitle = document.createElement('strong');
  qualityTitle.textContent = links.length ? 'Есть точная ссылка на официальный сервис' : 'Точная официальная ссылка пока не подтверждена';
  const qualityDescription = document.createElement('p');
  qualityDescription.textContent = links.length
    ? 'Перед отправкой заявления всё равно проверьте редакцию условий и дату действия услуги.'
    : 'Используйте порядок оформления как ориентир и подтвердите условия у ведомства или в МФЦ.';
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

  const explanation = document.createElement('section');
  explanation.className = 'measure-detail-section measure-detail-section--explanation';
  const explanationTitle = document.createElement('h3');
  explanationTitle.textContent = 'Основание предварительного подбора';
  const reasonList = document.createElement('ul');
  for (const reason of result.reasons) {
    const item = document.createElement('li');
    item.textContent = reason;
    reasonList.append(item);
  }
  explanation.append(explanationTitle, reasonList);
  fragment.append(explanation);

  const unresolved = createDetailSection('Условия, требующие уточнения', (result.missingFacts || []).map((item) => item.label));
  if (unresolved) fragment.append(unresolved);

  const sections = [
    createDetailSection('Как оформить', detail.steps, true),
    createDetailSection('Какие документы нужны', detail.documents),
    createDetailSection('Полезно знать', detail.notes)
  ].filter(Boolean);
  fragment.append(...sections);

  if (links.length) {
    const section = document.createElement('section');
    section.className = 'measure-detail-actions';
    const title = document.createElement('h3');
    title.textContent = 'Официальные сервисы';
    const list = document.createElement('div');
    list.className = 'measure-detail-actions__list';
    for (const link of links) {
      const anchor = document.createElement('a');
      anchor.href = link.safeUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      const label = document.createElement('span');
      const service = document.createElement('small');
      service.textContent = link.service || 'Официальный сервис';
      const strong = document.createElement('strong');
      strong.textContent = link.title || 'Открыть услугу';
      label.append(service, strong);
      anchor.append(icon('landmark'), label, icon('arrow-up-right'));
      list.append(anchor);
    }
    section.append(title, list);
    fragment.append(section);
  }

  const provider = inferProviderType(measure);
  const meta = document.createElement('dl');
  meta.className = 'detail-meta-list';
  const values = [
    ['Источник карточки', sourceName(measure)],
    ['Территориальный уровень', levelLabel(measure)],
    [provider.inferred ? 'Предполагаемый поставщик' : 'Классификация', provider.label],
    ['Дата получения карточки', formatDate(measure.fetched_at)]
  ];
  for (const [term, value] of values) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    meta.append(dt, dd);
  }
  fragment.append(meta);

  const footer = document.createElement('div');
  footer.className = 'detail-footer-actions';
  const catalog = document.createElement('a');
  catalog.className = 'primary-action';
  catalog.href = catalogMeasureUrl(measure, { region: state.profile.region });
  catalog.textContent = 'Открыть в каталоге';
  catalog.append(icon('arrow-right'));
  const report = document.createElement('a');
  report.className = 'secondary-action';
  report.href = buildIssueUrl(measure);
  report.target = '_blank';
  report.rel = 'noopener noreferrer';
  report.textContent = 'Сообщить о неточности';
  report.append(icon('message-square-warning'));
  footer.append(catalog, report);
  fragment.append(footer);

  elements.dialogBody.replaceChildren(fragment);
  refreshIcons();
}

async function openMeasure(result) {
  state.activeResult = result;
  elements.dialogTitle.textContent = result.measure.title;
  elements.dialogScope.textContent = [statusLabel(result.tier), levelLabel(result.measure), result.measure.region].filter(Boolean).join(' · ');
  const loading = document.createElement('div');
  loading.className = 'measure-dialog__loading';
  loading.append(icon('loader-circle'));
  const text = document.createElement('p');
  text.textContent = 'Загружаем подробные условия…';
  loading.append(text);
  elements.dialogBody.replaceChildren(loading);
  if (!elements.dialog.open) elements.dialog.showModal();
  document.body.classList.add('dialog-open');
  refreshIcons();

  try {
    const detail = await state.details.get(result.measure);
    if (state.activeResult?.measure.id === result.measure.id && elements.dialog.open) renderDetail(result, detail);
  } catch (error) {
    const wrapper = document.createElement('div');
    wrapper.className = 'measure-detail-error';
    wrapper.append(icon('triangle-alert'));
    const title = document.createElement('h3');
    title.textContent = 'Подробности не загрузились';
    const message = document.createElement('p');
    message.textContent = String(error?.message || error);
    wrapper.append(title, message);
    elements.dialogBody.replaceChildren(wrapper);
    refreshIcons();
  }
}

function closeDialog() {
  if (elements.dialog.open) elements.dialog.close();
  state.activeResult = null;
  document.body.classList.remove('dialog-open');
}

function planText() {
  const summary = profileSummary(state.profile);
  const answers = answeredFactLabels(state.profile);
  const lines = [
    'ПРЕДВАРИТЕЛЬНЫЙ НАВИГАТОР МЕР ПОДДЕРЖКИ',
    `Сформировано: ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date())}`,
    '',
    `Регион: ${summary.region}`,
    ...((summary.targetRegion || state.profile.targetRegion)
      ? [`Регион жилья или участка: ${summary.targetRegion || state.profile.targetRegion}`] : []),
    `Жизненная ситуация: ${summary.situation}`,
    answers.length ? `Ответы об обстоятельствах: ${answers.join('; ')}` : 'Уточняющие обстоятельства: не указаны',
    ...(summary.query ? [`Дополнительный запрос: ${summary.query}`] : []),
    '',
    `Всего карточек: ${state.matches.all.length}. Соответствуют указанным условиям: ${state.matches.high.length}. Нужно уточнить: ${state.matches.check.length}.`,
    'Подбор учитывает тему, территорию и распознанные обязательные условия. Карточки с недостающими ответами требуют уточнения. Окончательное право и полные условия необходимо проверить в официальном источнике.',
    ''
  ];

  state.matches.all.forEach((result, index) => {
    const measure = result.measure;
    lines.push(`${index + 1}. ${measure.title}`);
    lines.push(`   Статус: ${statusLabel(result.tier)}`);
    lines.push(`   Уровень: ${levelLabel(measure)}${measure.region ? `, ${measure.region}` : ''}`);
    lines.push(`   Почему показана: ${result.reasons.join('; ')}`);
    if (result.missingFacts?.length) lines.push(`   Уточнить: ${result.missingFacts.map((item) => item.label).join('; ')}`);
    if (result.checks.length) lines.push(`   Проверить: ${result.checks.join('; ')}`);
    lines.push(`   Карточка: ${new URL(catalogMeasureUrl(measure, { region: state.profile.region }), location.href).href}`);
    lines.push('');
  });
  return lines.join('\n');
}

function bindEvents() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.form.addEventListener('change', (event) => {
    if (event.target?.matches('select[data-fact-id]')) setFactAnswer(event.target);
    if (event.target?.name === 'life-situation') updateSituationFields();
    if (state.started) updateMatches();
  });
  elements.query.addEventListener('input', () => {
    if (state.started) updateMatches();
  });
  elements.clarifications.addEventListener('change', (event) => {
    if (!event.target?.matches('select[data-fact-id]')) return;
    const focusId = event.target.id;
    setFactAnswer(event.target);
    updateMatches({ focusId });
  });
  elements.form.addEventListener('reset', () => {
    window.setTimeout(() => {
      state.factAnswers = {};
      state.clarificationFacts.clear();
      state.started = false;
      clearResults();
      elements.clarificationGrid.replaceChildren();
      updateSituationFields();
      history.replaceState(null, '', location.pathname);
    });
  });

  elements.copyLink.addEventListener('click', async () => {
    const copied = await copyText(publicProfileUrl(state.profile).href);
    showToast(copied
      ? 'Ссылка скопирована. Уточняющие ответы и свободный текст в неё не включены.'
      : 'Не удалось скопировать ссылку.');
  });
  elements.downloadPlan.addEventListener('click', () => {
    downloadText('plan-mer-podderzhki.txt', planText());
    showToast('Предварительный план сохранён на устройстве.');
  });
  elements.print.addEventListener('click', () => window.print());

  document.querySelectorAll('[data-close-module-measure]').forEach((button) => button.addEventListener('click', closeDialog));
  elements.dialog.addEventListener('close', () => {
    state.activeResult = null;
    document.body.classList.remove('dialog-open');
  });
  elements.dialog.addEventListener('click', (event) => {
    const bounds = elements.dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) closeDialog();
  });
}

async function init() {
  initModuleShell('situations');
  renderSituationChoices();
  renderFactChoices();
  bindEvents();
  refreshIcons();

  try {
    const data = await loadPlatformData();
    state.measures = data.measures;
    state.meta = data.meta;
    state.regions = data.regions;
    state.coverage = catalogCoverage(data.measures, data.regions);
    state.details = createDetailRepository({ shardCount: data.meta.detail_shard_count });
    populateRegions();
    updateDataStatus();
    const restored = restorePublicQuery();
    updateSituationFields();
    refreshIcons();
    if (restored) elements.form.requestSubmit();
  } catch (error) {
    elements.dataStatus.classList.add('is-error');
    elements.dataStatus.querySelector('span').textContent = String(error?.message || error);
    showToast('Не удалось загрузить каталог.');
  }
}

init();
