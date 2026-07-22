import { formatDate } from './lib/platform-core.js';
import { copyText, icon, initModuleShell, refreshIcons, showToast } from './lib/module-shell.js';
import {
  STRATEGY_GROUP_LABELS,
  createStrategyIndex,
  filterStrategyDocuments,
  formatFileSize,
  loadStrategyCorpus,
  strategyCoverageCounts,
  strategyQualityLabel,
  strategyTemporalLabel
} from './lib/strategy-library.js';

const PAGE_SIZE = 24;
const DOCX_RUNTIME_SCRIPTS = ['./vendor/jszip.min.js', './vendor/docx-preview.min.js'];

let docxRuntimePromise = null;
let documentLoadController = null;
let lastDocumentFormat = 'pdf';

const state = {
  corpus: null,
  index: null,
  regions: [],
  selectedRegions: [],
  scope: 'territorial',
  query: '',
  regionQuery: '',
  quality: 'all',
  temporal: 'all',
  listLimit: PAGE_SIZE,
  currentDocument: null
};

const elements = Object.fromEntries([
  'data-status',
  'strategy-corpus-stats',
  'strategy-provenance-note',
  'territorial-document-count',
  'federal-document-count',
  'documents-region-filter',
  'documents-region-search',
  'documents-region-summary',
  'documents-region-checklist',
  'select-all-document-regions',
  'clear-document-regions',
  'strategy-search-input',
  'strategy-quality-filter',
  'strategy-temporal-filter',
  'strategy-list-summary',
  'strategy-document-list',
  'strategy-load-more',
  'strategy-viewer',
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

elements.scopeTabs = [...document.querySelectorAll('[data-document-scope]')];
elements.strategyWorkspace = document.querySelector('.strategy-workspace');

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function createText(tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function appendDefinitionList(list, rows) {
  list.replaceChildren();
  for (const [term, value] of rows) {
    const row = document.createElement('div');
    row.append(createText('dt', term), createText('dd', value || '—'));
    list.append(row);
  }
}

function currentUrl() {
  const url = new URL(location.href);
  url.search = '';
  if (state.scope !== 'territorial') url.searchParams.set('scope', state.scope);
  for (const region of state.selectedRegions) url.searchParams.append('region', region);
  if (state.query) url.searchParams.set('q', state.query);
  if (state.quality !== 'all') url.searchParams.set('quality', state.quality);
  if (state.temporal !== 'all') url.searchParams.set('period', state.temporal);
  if (state.currentDocument?.id) url.searchParams.set('doc', state.currentDocument.id);
  return url;
}

function syncQuery() {
  const url = currentUrl();
  url.hash = state.currentDocument ? 'document-library' : location.hash;
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function restoreQuery() {
  const params = new URLSearchParams(location.search);
  state.scope = params.get('scope') === 'federal' ? 'federal' : 'territorial';
  state.selectedRegions = [...new Set(params.getAll('region'))].filter((region) => state.regions.includes(region));
  state.query = params.get('q') || '';
  state.quality = ['full', 'partial', 'unavailable', 'missing'].includes(params.get('quality')) ? params.get('quality') : 'all';
  state.temporal = ['active', 'historical', 'undated'].includes(params.get('period')) ? params.get('period') : 'all';
  elements.strategySearchInput.value = state.query;
  elements.strategyQualityFilter.value = state.quality;
  elements.strategyTemporalFilter.value = state.temporal;
  return params.get('doc');
}

function regionForDocument(strategyDocument) {
  if (strategyDocument.scope === 'regional') return strategyDocument.territory;
  if (strategyDocument.scope === 'municipal') return strategyDocument.parent_region;
  return null;
}

function filteredDocuments() {
  const filtered = filterStrategyDocuments(state.index.documents, {
    query: state.query,
    scope: state.scope === 'federal' ? 'federal' : 'all',
    quality: state.quality,
    temporal: state.temporal
  });
  if (state.scope === 'federal') return filtered;
  const selected = new Set(state.selectedRegions);
  return filtered.filter((strategyDocument) => {
    if (!['regional', 'municipal'].includes(strategyDocument.scope)) return false;
    return !selected.size || selected.has(regionForDocument(strategyDocument));
  });
}

function renderStatus() {
  const stats = state.corpus.stats ?? {};
  elements.dataStatus.querySelector('span').textContent = [
    `В реестре ${formatNumber(state.index.documents.length)} документов и записей покрытия.`,
    `${formatNumber(stats.regional_full ?? 0)} полных и ${formatNumber(stats.regional_partial ?? 0)} частичных региональных текстов.`,
    `Доступные PDF: ${formatNumber(stats.available_files ?? 0)}; всего ${formatNumber(stats.total_pages ?? 0)} страниц.`
  ].join(' ');
}

function renderCorpusStats() {
  const stats = state.corpus.stats ?? {};
  const coverage = strategyCoverageCounts(state.index.documents);
  const cards = [
    [stats.regional_total ?? state.regions.length, 'субъектов в матрице покрытия'],
    [coverage.full ?? 0, 'полных региональных текстов'],
    [coverage.partial ?? 0, 'частичных региональных материалов'],
    [state.index.documents.filter((item) => item.scope === 'federal').length, 'федеральных документов'],
    [stats.total_pages ?? 0, 'страниц в доступных PDF']
  ];
  elements.strategyCorpusStats.replaceChildren();
  for (const [value, label] of cards) {
    const card = document.createElement('article');
    card.className = 'corpus-stat';
    card.append(createText('strong', formatNumber(value)), createText('span', label));
    elements.strategyCorpusStats.append(card);
  }
  elements.territorialDocumentCount.textContent = formatNumber(state.index.documents.filter((item) => ['regional', 'municipal'].includes(item.scope)).length);
  elements.federalDocumentCount.textContent = formatNumber(state.index.documents.filter((item) => item.scope === 'federal').length);
}

function renderCorpusProvenance() {
  const body = elements.strategyProvenanceNote.querySelector('div');
  if (!body || !state.corpus.provenance) return;
  const paragraph = body.querySelector('p');
  if (paragraph) {
    paragraph.textContent = `${state.corpus.provenance.note} Снимок реестра сформирован ${formatDate(state.corpus.generated_at)}; техническая проверка не заменяет проверку официальной редакции.`;
  }
  if (state.corpus.provenance.official_collection_url) {
    const link = document.createElement('a');
    link.href = state.corpus.provenance.official_collection_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'text-link';
    link.textContent = 'Раздел демографической политики Минтруда России';
    body.append(link);
  }
}

function renderRegionChecklist() {
  const selected = new Set(state.selectedRegions);
  const query = normalizeText(state.regionQuery);
  elements.documentsRegionChecklist.replaceChildren();
  let visibleCount = 0;
  for (const region of state.regions) {
    if (query && !normalizeText(region).includes(query)) continue;
    visibleCount += 1;
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'document-region';
    input.value = region;
    input.checked = selected.has(region);
    input.addEventListener('change', updateSelectedRegions);
    label.append(input, createText('span', region));
    elements.documentsRegionChecklist.append(label);
  }
  if (!visibleCount) elements.documentsRegionChecklist.append(createText('p', 'Субъекты по запросу не найдены.', 'documents-region-empty'));
  elements.documentsRegionSummary.textContent = state.selectedRegions.length
    ? `Выбрано: ${formatNumber(state.selectedRegions.length)} из ${formatNumber(state.regions.length)}`
    : `Все ${formatNumber(state.regions.length)} субъектов`;
}

function updateSelectedRegions() {
  const checked = new Set([...elements.documentsRegionChecklist.querySelectorAll('input:checked')].map((input) => input.value));
  const previous = new Set(state.selectedRegions);
  for (const region of state.regions) {
    if (checked.has(region)) previous.add(region);
    else if (!state.regionQuery || normalizeText(region).includes(normalizeText(state.regionQuery))) previous.delete(region);
  }
  state.selectedRegions = state.regions.filter((region) => previous.has(region));
  state.listLimit = PAGE_SIZE;
  renderRegionChecklist();
  renderDocumentList();
  syncQuery();
}

function strategyCardMeta(strategyDocument) {
  if (strategyDocument.availability !== 'available') return strategyQualityLabel(strategyDocument);
  return [
    strategyQualityLabel(strategyDocument),
    strategyDocument.period?.label,
    strategyDocument.pages ? `${formatNumber(strategyDocument.pages)} стр.` : null
  ].filter(Boolean).join(' · ');
}

function renderDocumentList() {
  const filtered = filteredDocuments();
  const activeIndex = filtered.findIndex((item) => item.id === state.currentDocument?.id);
  if (activeIndex >= state.listLimit) state.listLimit = Math.ceil((activeIndex + 1) / PAGE_SIZE) * PAGE_SIZE;
  const visible = filtered.slice(0, state.listLimit);
  elements.strategyDocumentList.replaceChildren();
  elements.strategyListSummary.textContent = filtered.length > visible.length
    ? `Показано ${formatNumber(visible.length)} из ${formatNumber(filtered.length)} документов и записей покрытия.`
    : `${formatNumber(filtered.length)} документов и записей покрытия. Полный текст загружается только после отдельной команды.`;
  const remaining = Math.max(0, filtered.length - visible.length);
  elements.strategyLoadMore.hidden = remaining === 0;
  elements.strategyLoadMore.innerHTML = remaining
    ? `${icon('list-plus').outerHTML} Показать ещё ${formatNumber(Math.min(PAGE_SIZE, remaining))}`
    : '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'strategy-list-empty';
    empty.append(icon('file-x-2'), createText('p', 'По выбранным субъектам и дополнительным условиям документы не найдены.'));
    elements.strategyDocumentList.append(empty);
    refreshIcons();
    return;
  }

  for (const strategyDocument of visible) {
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
    meta.append(createText('span', strategyCardMeta(strategyDocument)), createText('span', strategyTemporalLabel(strategyDocument)));
    button.append(iconBox, body, meta);
    button.addEventListener('click', () => openDocument(strategyDocument));
    elements.strategyDocumentList.append(button);
  }
  refreshIcons();
}

function groupLabel(strategyDocument) {
  return STRATEGY_GROUP_LABELS[strategyDocument.group] ?? 'Документ';
}

function openDocument(strategyDocument, { updateUrl = true } = {}) {
  if (!strategyDocument) return;
  state.currentDocument = strategyDocument;
  elements.strategyWorkspace.classList.add('has-open-document');
  elements.strategyViewerPlaceholder.hidden = true;
  elements.strategyViewerContent.hidden = false;
  elements.strategyViewerEyebrow.textContent = `${groupLabel(strategyDocument)} · ${strategyQualityLabel(strategyDocument)}`;
  elements.strategyViewerDocumentTitle.textContent = strategyDocument.title;
  elements.strategyViewerDocumentMeta.textContent = [
    strategyDocument.territory,
    strategyDocument.period?.label,
    strategyDocument.revision ? `редакция: ${strategyDocument.revision}` : null
  ].filter(Boolean).join(' · ');
  renderViewerActions(strategyDocument);
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
  renderDocumentList();
  if (updateUrl) syncQuery();
  if (matchMedia('(max-width: 980px)').matches) {
    requestAnimationFrame(() => elements.strategyViewer.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  refreshIcons();
}

function documentPermalink(strategyDocument) {
  const url = currentUrl();
  url.searchParams.set('doc', strategyDocument.id);
  url.hash = 'document-library';
  return url;
}

function renderViewerActions(strategyDocument) {
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
    const copied = await copyText(documentPermalink(strategyDocument).href);
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
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error(`Не удалось загрузить компонент ${src}.`));
    }, { once: true });
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
    docxRuntimePromise = DOCX_RUNTIME_SCRIPTS.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve())
      .then(() => {
        if (!window.docx?.renderAsync || !window.JSZip) throw new Error('Компонент просмотра DOCX загрузился некорректно.');
        return window.docx;
      })
      .catch((error) => {
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
    const response = await fetch(strategyDocument.original_url, { cache: 'default', signal: controller.signal });
    if (!response.ok) throw new Error(`Сервер вернул ошибку ${response.status}.`);
    const contents = await response.arrayBuffer();
    if (state.currentDocument?.id !== documentId || controller.signal.aborted) return;
    showDocumentLoading('Готовим страницы документа…');
    await renderer.renderAsync(contents, elements.strategyDocxViewer, elements.strategyDocxViewer, {
      className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
      breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true,
      renderEndnotes: true, renderAltChunks: false, debug: false
    });
    if (state.currentDocument?.id !== documentId || controller.signal.aborted) return;
    elements.strategyDocumentLoading.hidden = true;
    elements.strategyDocxViewer.hidden = false;
    elements.strategyDocxViewer.focus({ preventScroll: true });
  } catch (error) {
    if (error?.name !== 'AbortError' && state.currentDocument?.id === documentId) showDocumentError(error);
  }
}

function closeViewer() {
  state.currentDocument = null;
  elements.strategyWorkspace.classList.remove('has-open-document');
  resetDocumentStage();
  elements.strategyViewerContent.hidden = true;
  elements.strategyViewerPlaceholder.hidden = false;
  elements.strategyDocumentStage.querySelector('.strategy-unavailable-stage')?.remove();
  renderDocumentList();
  syncQuery();
}

function updateScope() {
  for (const tab of elements.scopeTabs) tab.setAttribute('aria-selected', String(tab.dataset.documentScope === state.scope));
  elements.documentsRegionFilter.disabled = state.scope === 'federal';
  elements.documentsRegionFilter.classList.toggle('is-disabled', state.scope === 'federal');
}

function setupControls() {
  for (const tab of elements.scopeTabs) {
    tab.addEventListener('click', () => {
      state.scope = tab.dataset.documentScope;
      state.listLimit = PAGE_SIZE;
      updateScope();
      renderDocumentList();
      syncQuery();
    });
  }
  elements.documentsRegionSearch.addEventListener('input', () => {
    state.regionQuery = elements.documentsRegionSearch.value;
    renderRegionChecklist();
  });
  elements.selectAllDocumentRegions.addEventListener('click', () => {
    state.selectedRegions = [...state.regions];
    state.listLimit = PAGE_SIZE;
    renderRegionChecklist();
    renderDocumentList();
    syncQuery();
  });
  elements.clearDocumentRegions.addEventListener('click', () => {
    state.selectedRegions = [];
    state.listLimit = PAGE_SIZE;
    renderRegionChecklist();
    renderDocumentList();
    syncQuery();
  });
  elements.strategySearchInput.addEventListener('input', () => {
    state.query = elements.strategySearchInput.value.trim();
    state.listLimit = PAGE_SIZE;
    renderDocumentList();
    syncQuery();
  });
  elements.strategyQualityFilter.addEventListener('change', () => {
    state.quality = elements.strategyQualityFilter.value;
    state.listLimit = PAGE_SIZE;
    renderDocumentList();
    syncQuery();
  });
  elements.strategyTemporalFilter.addEventListener('change', () => {
    state.temporal = elements.strategyTemporalFilter.value;
    state.listLimit = PAGE_SIZE;
    renderDocumentList();
    syncQuery();
  });
  elements.strategyLoadMore.addEventListener('click', () => {
    state.listLimit += PAGE_SIZE;
    renderDocumentList();
  });
  elements.loadStrategyPdf.addEventListener('click', loadCurrentPdf);
  elements.loadStrategyDocx.addEventListener('click', loadCurrentDocx);
  elements.retryStrategyDocument.addEventListener('click', () => lastDocumentFormat === 'docx' ? loadCurrentDocx() : loadCurrentPdf());
  elements.closeStrategyViewer.addEventListener('click', closeViewer);
}

async function initialize() {
  initModuleShell('documents');
  setupControls();
  try {
    state.corpus = await loadStrategyCorpus();
    state.index = createStrategyIndex(state.corpus);
    state.regions = [...state.index.regionalByTerritory.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
    const requestedDocument = restoreQuery();
    renderStatus();
    renderCorpusStats();
    renderCorpusProvenance();
    renderRegionChecklist();
    updateScope();
    renderDocumentList();
    if (requestedDocument) {
      const strategyDocument = state.index.byId.get(requestedDocument);
      if (strategyDocument) openDocument(strategyDocument, { updateUrl: false });
      else showToast('Документ из ссылки не найден в текущем корпусе.');
    }
    syncQuery();
    refreshIcons();
  } catch (error) {
    console.error(error);
    elements.dataStatus.classList.add('is-error');
    elements.dataStatus.querySelector('span').textContent = 'Не удалось загрузить документальный реестр. Проверьте целостность файла strategies.json.';
  }
}

initialize();
