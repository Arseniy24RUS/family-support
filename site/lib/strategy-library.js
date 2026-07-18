const QUALITY_LABELS = Object.freeze({
  full: 'Полный текст',
  partial: 'Частичный материал',
  unavailable: 'Файл не передан',
  missing: 'Нет в корпусе'
});

const TEMPORAL_LABELS = Object.freeze({
  active: 'Период включает 2026 год',
  historical: 'Завершённый период',
  future: 'Будущий период',
  undated: 'Период не установлен'
});

export const STRATEGY_GROUP_LABELS = Object.freeze({
  regional: 'Региональная программа',
  municipal: 'Муниципальная программа',
  strategic: 'Федеральный стратегический документ',
  methodology: 'Методический документ'
});

function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»„“”"'`]/g, ' ')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clonePlain(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

export async function loadStrategyCorpus(url = './data/strategies.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не удалось загрузить корпус стратегий: HTTP ${response.status}.`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.documents)) throw new Error('Файл корпуса стратегий имеет неверную структуру.');
  return payload;
}

export function createStrategyIndex(corpus) {
  const documents = safeArray(corpus?.documents);
  const byId = new Map();
  const regionalByTerritory = new Map();
  const municipalByRegion = new Map();
  const byGroup = new Map();

  for (const document of documents) {
    if (!document?.id) continue;
    byId.set(document.id, document);
    if (!byGroup.has(document.group)) byGroup.set(document.group, []);
    byGroup.get(document.group).push(document);

    if (document.scope === 'regional' && document.territory) {
      regionalByTerritory.set(document.territory, document);
    }
    if (document.scope === 'municipal' && document.parent_region) {
      if (!municipalByRegion.has(document.parent_region)) municipalByRegion.set(document.parent_region, []);
      municipalByRegion.get(document.parent_region).push(document);
    }
  }

  for (const values of municipalByRegion.values()) {
    values.sort((a, b) => String(a.territory ?? a.title).localeCompare(String(b.territory ?? b.title), 'ru'));
  }

  return {
    corpus,
    documents,
    byId,
    regionalByTerritory,
    municipalByRegion,
    byGroup
  };
}

export function strategyForRegion(index, region) {
  return index?.regionalByTerritory?.get(region) ?? null;
}

export function municipalStrategiesForRegion(index, region) {
  return [...(index?.municipalByRegion?.get(region) ?? [])];
}

export function strategySummaryForRegions(index, regions) {
  return safeArray(regions).map((region) => {
    const document = strategyForRegion(index, region);
    return {
      region,
      document,
      municipal: municipalStrategiesForRegion(index, region),
      quality: document?.quality ?? 'missing',
      availability: document?.availability ?? 'missing',
      period: document?.period?.label || 'период не установлен'
    };
  });
}

export function strategyQualityLabel(document) {
  if (!document) return QUALITY_LABELS.missing;
  if (document.availability === 'unavailable') return QUALITY_LABELS.unavailable;
  if (document.availability === 'missing') return QUALITY_LABELS.missing;
  return QUALITY_LABELS[document.quality] ?? 'Статус не установлен';
}

export function strategyTemporalLabel(document) {
  return TEMPORAL_LABELS[document?.period?.temporal_status] ?? TEMPORAL_LABELS.undated;
}

export function strategyCoverageCounts(documents) {
  const result = { full: 0, partial: 0, unavailable: 0, missing: 0 };
  for (const document of safeArray(documents)) {
    if (document?.scope !== 'regional') continue;
    const status = document.availability === 'available' ? document.quality : document.availability;
    if (status in result) result[status] += 1;
  }
  return result;
}

export function filterStrategyDocuments(documents, options = {}) {
  const {
    query = '',
    scope = 'all',
    selectedRegions = [],
    quality = 'all',
    temporal = 'all'
  } = options;
  const selected = new Set(safeArray(selectedRegions));
  const normalizedQuery = normalizeText(query);

  return safeArray(documents).filter((document) => {
    if (!document) return false;

    if (scope === 'selected') {
      const belongsToSelected = document.scope === 'regional'
        ? selected.has(document.territory)
        : document.scope === 'municipal' && selected.has(document.parent_region);
      if (!belongsToSelected) return false;
    } else if (scope === 'regional') {
      if (document.scope !== 'regional') return false;
    } else if (scope === 'federal') {
      if (document.scope !== 'federal') return false;
    } else if (scope === 'municipal') {
      if (document.scope !== 'municipal') return false;
    }

    const effectiveQuality = document.availability === 'available' ? document.quality : document.availability;
    if (quality !== 'all' && effectiveQuality !== quality) return false;
    if (temporal !== 'all' && document.period?.temporal_status !== temporal) return false;

    if (normalizedQuery) {
      const haystack = normalizeText([
        document.title,
        document.territory,
        document.parent_region,
        document.act,
        document.revision,
        document.period?.label,
        document.source_filename,
        document.text_preview
      ].filter(Boolean).join(' '));
      if (!haystack.includes(normalizedQuery)) return false;
    }

    return true;
  });
}

export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = [
    ['ГБ', 1024 ** 3],
    ['МБ', 1024 ** 2],
    ['КБ', 1024],
    ['Б', 1]
  ];
  const [label, divisor] = units.find(([, threshold]) => bytes >= threshold) ?? units.at(-1);
  const digits = divisor === 1 ? 0 : 1;
  return `${(bytes / divisor).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${label}`;
}

export function strategyPermalink(document, baseUrl = globalThis.location?.href ?? 'https://example.invalid/compare.html') {
  const url = new URL(baseUrl);
  if (document?.id) url.searchParams.set('doc', document.id);
  else url.searchParams.delete('doc');
  url.hash = 'strategy-library';
  return url;
}

function serialiseStrategy(summary) {
  const document = summary?.document;
  if (!document) {
    return {
      id: null,
      quality: summary?.quality ?? 'missing',
      availability: summary?.availability ?? 'missing',
      period: summary?.period ?? 'период не установлен',
      lexical_profile: null
    };
  }
  return {
    id: document.id,
    title: document.title,
    quality: document.quality,
    availability: document.availability,
    period: clonePlain(document.period),
    pages: document.pages ?? null,
    size_bytes: document.size_bytes ?? 0,
    sha256: document.sha256 ?? null,
    pdf_url: document.pdf_url ?? null,
    official_url: document.official_url ?? null,
    act: document.act ?? null,
    revision: document.revision ?? null,
    lexical_profile: document.text_profile ? clonePlain(document.text_profile) : null
  };
}

export function buildResearchExport({ comparison, strategies = [], meta = {}, generatedAt } = {}) {
  const profiles = safeArray(comparison?.profiles);
  const summaryByRegion = new Map(safeArray(strategies).map((summary) => [summary.region, summary]));
  const regions = profiles.map((profile) => {
    const summary = summaryByRegion.get(profile.region) ?? {
      region: profile.region,
      quality: 'missing',
      availability: 'missing',
      period: 'период не установлен',
      municipal: []
    };
    return {
      region: profile.region,
      catalog: {
        status: profile.status,
        regional_count: profile.regionalCount,
        category_count: profile.categoryCount,
        largest_category: clonePlain(profile.largestCategory),
        concentration_hhi: profile.concentration ?? null,
        categories: clonePlain(profile.categories ?? [])
      },
      strategy: serialiseStrategy(summary),
      municipal_documents: safeArray(summary.municipal).map((document) => ({
        id: document.id,
        title: document.title,
        territory: document.territory,
        period: clonePlain(document.period),
        pages: document.pages ?? null,
        sha256: document.sha256 ?? null,
        pdf_url: document.pdf_url ?? null
      }))
    };
  });

  return {
    schema_version: 2,
    generated_at: generatedAt ?? new Date().toISOString(),
    catalog_snapshot_generated_at: meta?.generated_at ?? null,
    methodology: {
      catalog: 'Региональные карточки текущего информационного снимка; федеральные записи вынесены в общий фон.',
      title_overlap: 'Коэффициент Жаккара для нормализованных названий; юридическую эквивалентность не устанавливает.',
      lexical_profile: 'Частота словарных маркеров на 10 000 извлечённых слов; не является оценкой эффективности политики.'
    },
    federal_catalog_count: comparison?.federalCount ?? 0,
    regions,
    category_rows: clonePlain(comparison?.categoryRows ?? []),
    pairwise_title_overlap: clonePlain(comparison?.overlaps ?? []),
    limitations: [
      'Количество карточек зависит от полноты исходного каталога.',
      'Показатели не нормированы на население, число детей, расходы бюджета или число получателей.',
      'Документальный корпус требует сверки редакций с официальными публикациями.'
    ]
  };
}
