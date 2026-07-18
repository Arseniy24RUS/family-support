const ALLOWED_HOSTS = new Set(['app.sovetmam.ru']);

function percentage(part, whole) {
  return whole === 0 ? 0 : part / whole;
}

export function validateSnapshot({ measures, reportedCount, previousMeta, baseRegions = [] }) {
  const errors = [];
  const warnings = [];
  const minimum = Number.parseInt(process.env.MIN_MEASURES ?? '1000', 10);

  if (!Array.isArray(measures)) errors.push('Результат парсера не является массивом.');
  if (measures.length < minimum) {
    errors.push(`Получено ${measures.length} мер; установленный минимум — ${minimum}.`);
  }

  if (reportedCount && measures.length < Math.floor(reportedCount * 0.97)) {
    errors.push(
      `Страница сообщает о ${reportedCount} мерах, но извлечено только ${measures.length} (<97%).`
    );
  }

  const ids = new Set();
  const allowedRegions = new Set(baseRegions);
  let unknownRegion = 0;
  let invalid = 0;

  for (const measure of measures) {
    if (!measure?.id || !measure?.title || !measure?.source_url) {
      invalid += 1;
      continue;
    }
    if (ids.has(measure.id)) errors.push(`Повтор идентификатора: ${measure.id}`);
    ids.add(measure.id);

    if (!['federal', 'regional'].includes(measure.level)) {
      errors.push(`Некорректный уровень у ${measure.id}: ${measure.level}`);
    }
    if (!measure.category || !measure.content_hash || !measure.fetched_at) {
      errors.push(`Неполные служебные метаданные у ${measure.id}.`);
    }

    try {
      const url = new URL(measure.source_url);
      if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
        errors.push(`Недопустимый URL источника: ${measure.source_url}`);
      }
    } catch {
      errors.push(`Некорректный URL источника: ${measure.source_url}`);
    }

    if (measure.level === 'regional' && !measure.region) unknownRegion += 1;
    if (measure.level === 'regional' && allowedRegions.size && !allowedRegions.has(measure.region)) {
      errors.push(`Регион карточки отсутствует в базовом справочнике: ${measure.region} (${measure.id}).`);
    }
  }

  if (invalid) errors.push(`Неполных карточек: ${invalid}.`);
  if (percentage(unknownRegion, measures.length) > 0.01) {
    errors.push(`Не удалось определить регион у ${unknownRegion} региональных карточек.`);
  }

  const previousCount = Number(previousMeta?.measure_count ?? 0);
  const largeDropAllowed = process.env.ALLOW_LARGE_DROP === '1';
  if (previousCount > 0 && measures.length < previousCount * 0.8 && !largeDropAllowed) {
    errors.push(
      `Число мер сократилось с ${previousCount} до ${measures.length} (>20%). ` +
      'Для осознанного принятия изменения задайте ALLOW_LARGE_DROP=1.'
    );
  }

  const categories = new Set(measures.map((item) => item.category));
  const regions = new Set(measures.filter((item) => item.region).map((item) => item.region));
  if (categories.size < 5) warnings.push(`Выделено лишь ${categories.size} категорий.`);
  if (regions.size < 70) warnings.push(`Выделено лишь ${regions.size} регионов.`);

  return { errors, warnings, stats: { categories: categories.size, regions: regions.size } };
}
