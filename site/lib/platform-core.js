const DEFAULT_DETAIL_SHARD_COUNT = 32;

export const DATA_STATUS = Object.freeze({
  REPRESENTED: 'represented',
  NOT_REPRESENTED: 'not-represented'
});

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»„“”"'`´]/g, ' ')
    .replace(/[—–−-]/g, ' ')
    .replace(/[^\p{L}\p{N}%+./]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value, { minLength = 3 } = {}) {
  return [...new Set(normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= minLength))];
}

export function pluralMeasures(value) {
  const n = Math.abs(Number(value)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'мер';
  if (n1 > 1 && n1 < 5) return 'меры';
  if (n1 === 1) return 'мера';
  return 'мер';
}

export function formatDate(value, { fallback = 'дата не указана' } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow'
  }).format(date);
}

export function regionNamesFromPayload(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => typeof item === 'string' ? item : item?.name)
    .filter(Boolean);
}

export function sourceName(measure) {
  if (measure?.source_name) return measure.source_name;
  if (measure?.source === 'sovetmam') return '«Шпаргалка для родителей»';
  if (measure?.source === 'demo') return 'Демонстрационный набор';
  return measure?.source || 'Внешний источник';
}

export function levelLabel(measure) {
  return measure?.level === 'federal' ? 'Федеральная мера' : 'Региональная мера';
}

export function measureSearchText(measure) {
  return normalizeText([
    measure?.title,
    measure?.summary,
    measure?.benefit,
    measure?.region,
    measure?.category,
    sourceName(measure)
  ].join(' '));
}

export function measureMatchesRegion(measure, region) {
  if (!region) return measure?.level === 'federal';
  return measure?.level === 'federal' || measure?.region === region;
}

export function inferProviderType(measure) {
  const title = normalizeText(measure?.title);
  const text = normalizeText([measure?.title, measure?.summary].join(' '));

  if (/работодател|корпоративн|сотрудник.*компани|компани.*сотрудник/.test(title)) {
    return { id: 'employer', label: 'Корпоративная программа', inferred: true };
  }
  if (/университет|институт|вуз|колледж|образовательн.*организац/.test(title)) {
    return { id: 'education', label: 'Программа образовательной организации', inferred: true };
  }
  if (/некоммерческ|общественн.*организац|благотворительн.*фонд/.test(text)) {
    return { id: 'nonprofit', label: 'Негосударственная программа', inferred: true };
  }
  return measure?.level === 'federal'
    ? { id: 'federal-government', label: 'Федеральный уровень', inferred: false }
    : { id: 'regional-government', label: 'Региональный уровень', inferred: false };
}

export function detailShardKey(id, shardCount = DEFAULT_DETAIL_SHARD_COUNT) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, Number(shardCount) || DEFAULT_DETAIL_SHARD_COUNT);
}

export function createDetailRepository({
  basePath = './data/details',
  shardCount = DEFAULT_DETAIL_SHARD_COUNT,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Для загрузки подробностей требуется fetch.');
  const cache = new Map();

  return {
    async get(measure) {
      if (!measure?.id) throw new TypeError('У меры отсутствует идентификатор.');
      const shard = String(detailShardKey(measure.id, shardCount)).padStart(2, '0');
      if (!cache.has(shard)) {
        const response = await fetchImpl(`${basePath}/${shard}.json`, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Не удалось загрузить подробную карточку.');
        cache.set(shard, await response.json());
      }
      const detail = cache.get(shard)?.[measure.id];
      if (!detail) throw new Error('Подробная карточка этой меры временно недоступна.');
      return detail;
    },
    clear() {
      cache.clear();
    }
  };
}

async function fetchJson(fetchImpl, url, cache) {
  const response = await fetchImpl(url, { cache });
  if (!response.ok) throw new Error(`Не удалось загрузить ${url}.`);
  return response.json();
}

export async function loadPlatformData({
  basePath = './data',
  fetchImpl = globalThis.fetch,
  includeGeo = false
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Для загрузки каталога требуется fetch.');

  const requests = [
    fetchJson(fetchImpl, `${basePath}/measures.json`, 'no-store'),
    fetchJson(fetchImpl, `${basePath}/meta.json`, 'no-store'),
    fetchJson(fetchImpl, `${basePath}/regions-base.json`, 'force-cache')
  ];
  if (includeGeo) requests.push(fetchJson(fetchImpl, `${basePath}/ru-regions.geojson`, 'force-cache'));

  const [measures, meta, regionPayload, geoData = null] = await Promise.all(requests);
  if (!Array.isArray(measures)) throw new Error('Каталог имеет некорректный формат.');
  const regions = regionNamesFromPayload(regionPayload)
    .filter((region, index, array) => array.indexOf(region) === index)
    .sort((a, b) => a.localeCompare(b, 'ru'));

  return { measures, meta: meta ?? {}, regions, geoData };
}

export function catalogCoverage(measures, regions) {
  const representedRegions = new Set(
    measures
      .filter((measure) => measure?.level === 'regional' && measure?.region)
      .map((measure) => measure.region)
  );
  return {
    totalRegions: regions.length,
    representedCount: regions.filter((region) => representedRegions.has(region)).length,
    representedRegions,
    missingRegions: regions.filter((region) => !representedRegions.has(region))
  };
}

export function catalogMeasureUrl(measure, { region = '', base = './index.html' } = {}) {
  const params = new URLSearchParams();
  if (region) params.set('region', region);
  if (measure?.id) params.set('measure', measure.id);
  return `${base}${params.size ? `?${params}` : ''}`;
}

export function buildIssueUrl(measure, { repository = 'Arseniy24RUS/family-support' } = {}) {
  const title = `Неточность в карточке: ${measure?.title || measure?.id || 'мера поддержки'}`;
  const body = [
    '### Карточка',
    `- ID: ${measure?.id || 'не указан'}`,
    `- Название: ${measure?.title || 'не указано'}`,
    `- Регион: ${measure?.region || 'федеральная / не указан'}`,
    '',
    '### Что требуется исправить',
    '<!-- Не указывайте персональные данные. Опишите неточность и, по возможности, приложите ссылку на официальный источник. -->'
  ].join('\n');
  return `https://github.com/${repository}/issues/new?${new URLSearchParams({ title, body })}`;
}

export function safeLocalStorage(storage = globalThis.localStorage) {
  return {
    get(key, fallback = null) {
      try {
        const value = storage?.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage?.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  };
}
