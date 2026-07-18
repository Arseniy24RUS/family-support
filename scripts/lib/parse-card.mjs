import { createHash } from 'node:crypto';

const CATEGORIES = [
  'Выплаты и пособия',
  'Жильё и ипотека',
  'Налоги и льготы',
  'Здоровье',
  'Образование',
  'Транспорт',
  'Культура и отдых',
  'Работа и занятость',
  'Помощь и сопровождение',
  'Скидки в магазинах'
];

const REGION_ALIASES = new Map([
  ['Республика Адыгея', 'Республика Адыгея (Адыгея)'],
  ['Республика Татарстан', 'Республика Татарстан (Татарстан)'],
  ['Чувашская Республика', 'Чувашская Республика — Чувашия']
]);

function normalizeLine(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cleanLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !/^Подробнее$/i.test(line));
}

function safeHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`Ожидался HTTPS URL, получено: ${value}`);
  }
  return url.toString();
}

function slugFromUrl(url) {
  const pathname = new URL(url).pathname.replace(/\/+$/, '');
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}

export function normalizeRegionName(value) {
  const normalized = normalizeLine(value);
  if (!normalized) return null;
  return REGION_ALIASES.get(normalized) ?? normalized;
}

function buildMeasure({ slug, title, level, region, category, summary, benefit, sourceUrl, fetchedAt }) {
  const normalizedLevel = level === 'federal' ? 'federal' : 'regional';
  const measure = {
    id: `sovetmam:${slug}`,
    title: normalizeLine(title),
    level: normalizedLevel,
    region: normalizedLevel === 'federal' ? null : normalizeRegionName(region),
    category: normalizeLine(category) || 'Другое',
    summary: normalizeLine(summary) || null,
    benefit: normalizeLine(benefit) || null,
    source: 'sovetmam',
    source_name: 'Шпаргалка для родителей — Совет матерей',
    source_url: safeHttpsUrl(sourceUrl),
    fetched_at: fetchedAt
  };

  if (!measure.id || !measure.title || measure.title.length < 3) {
    throw new Error(`Не удалось выделить обязательные поля карточки ${sourceUrl}`);
  }

  measure.content_hash = createHash('sha256')
    .update(JSON.stringify({
      title: measure.title,
      level: measure.level,
      region: measure.region,
      category: measure.category,
      summary: measure.summary,
      benefit: measure.benefit,
      source_url: measure.source_url
    }))
    .digest('hex');

  return measure;
}

function parseMetadata(lines) {
  const categoryIndex = lines.findIndex((line) => CATEGORIES.includes(line));
  let category = categoryIndex >= 0 ? lines[categoryIndex] : null;
  let scope = '';
  let metadataEndIndex = categoryIndex;

  const pipeIndex = lines.findIndex((line) => line.includes('|'));
  if (pipeIndex >= 0) {
    const [left = '', right = ''] = lines[pipeIndex].split('|').map(normalizeLine);
    if (left && CATEGORIES.includes(left)) category = left;
    if (right) {
      scope = right;
      metadataEndIndex = pipeIndex;
    } else if (lines[pipeIndex] === '|' && lines[pipeIndex + 1]) {
      scope = lines[pipeIndex + 1];
      metadataEndIndex = pipeIndex + 1;
    } else if (!right && lines[pipeIndex + 1]) {
      scope = lines[pipeIndex + 1];
      metadataEndIndex = pipeIndex + 1;
    }
  }

  // Иногда интерфейс разбивает «категория | территория» на три DOM-строки.
  if (!scope && categoryIndex >= 0) {
    const candidates = lines.slice(categoryIndex + 1, categoryIndex + 4);
    const scopeOffset = candidates.findIndex((line) => line !== '|' && !CATEGORIES.includes(line));
    if (scopeOffset >= 0) {
      scope = candidates[scopeOffset];
      metadataEndIndex = categoryIndex + 1 + scopeOffset;
    }
  }

  if (!scope) {
    const federalIndex = lines.findIndex((line) => /^Федеральн/i.test(line));
    if (federalIndex >= 0) {
      scope = lines[federalIndex];
      metadataEndIndex = Math.max(metadataEndIndex, federalIndex);
    }
  }

  const federal = /^Федеральн/i.test(scope);
  return {
    category: category ?? 'Другое',
    level: federal ? 'federal' : 'regional',
    region: federal ? null : normalizeRegionName(scope),
    metadataEndIndex
  };
}

/**
 * Преобразует видимый текст одной карточки каталога в компактную запись.
 * Сохраняется только то, что нужно для поиска и перехода к первоисточнику.
 */
export function parseCatalogCard(raw, fetchedAt = new Date().toISOString()) {
  const sourceUrl = safeHttpsUrl(raw.href);
  const lines = cleanLines(raw.text);
  const parsedMeta = parseMetadata(lines);

  const heading = normalizeLine(raw.heading);
  const fallbackTitle = lines.slice(Math.max(0, parsedMeta.metadataEndIndex + 1))
    .find((line) => line !== '|' && !CATEGORIES.includes(line));
  const title = heading || normalizeLine(fallbackTitle);

  if (!title || title.length < 3) {
    throw new Error(`Не удалось выделить заголовок карточки ${sourceUrl}`);
  }

  const titleIndex = lines.findIndex((line) => line === title);
  const contentLines = lines.slice(titleIndex >= 0 ? titleIndex + 1 : parsedMeta.metadataEndIndex + 1)
    .filter((line) => line !== '|' && !CATEGORIES.includes(line));

  const paragraphs = (raw.paragraphs ?? []).map(normalizeLine).filter(Boolean);
  const summary = paragraphs[0] || contentLines[0] || null;
  const benefit = paragraphs[1] || contentLines[1] || null;
  const slug = slugFromUrl(sourceUrl);
  return buildMeasure({
    slug,
    title,
    level: parsedMeta.level,
    region: parsedMeta.region,
    category: parsedMeta.category,
    summary,
    benefit,
    sourceUrl,
    fetchedAt
  });
}

export function parseCatalogPayloadMeasure(raw, baseUrl, fetchedAt = new Date().toISOString()) {
  const slug = normalizeLine(raw?.slug);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    throw new Error(`Некорректный идентификатор карточки: ${slug || '(пусто)'}`);
  }
  if (!['federal', 'regional'].includes(raw?.level)) {
    throw new Error(`Некорректный уровень карточки ${slug}: ${raw?.level}`);
  }

  const sourceUrl = new URL(`./catalog/${encodeURIComponent(slug)}`, baseUrl).toString();
  return buildMeasure({
    slug,
    title: raw.title,
    level: raw.level,
    region: raw.region,
    category: raw.category,
    summary: raw.shortDescription,
    benefit: raw.amount,
    sourceUrl,
    fetchedAt
  });
}

export { CATEGORIES, REGION_ALIASES };
