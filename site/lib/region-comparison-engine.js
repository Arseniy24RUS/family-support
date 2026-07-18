import { DATA_STATUS, inferProviderType, normalizeText } from './platform-core.js';

function categoryCounts(measures) {
  const counts = new Map();
  for (const measure of measures) {
    const category = measure?.category || 'Прочие меры';
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

function providerCounts(measures) {
  const counts = new Map();
  for (const measure of measures) {
    const provider = inferProviderType(measure);
    counts.set(provider.label, (counts.get(provider.label) || 0) + 1);
  }
  return counts;
}

export function normalizeMeasureTitle(value) {
  return normalizeText(value)
    .replace(/\b(мера|поддержка|семья|семей|дети|ребенок|региональный|федеральный)\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRegionProfile(measures, region) {
  const regional = measures.filter((measure) => measure?.level === 'regional' && measure?.region === region);
  const categories = categoryCounts(regional);
  const sortedCategories = [...categories.entries()]
    .map(([category, count]) => ({
      category,
      count,
      share: regional.length ? count / regional.length : 0
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'ru'));
  const largest = sortedCategories[0] ?? null;
  const concentration = regional.length
    ? sortedCategories.reduce((sum, item) => sum + item.share ** 2, 0)
    : null;

  return {
    region,
    status: regional.length ? DATA_STATUS.REPRESENTED : DATA_STATUS.NOT_REPRESENTED,
    regionalCount: regional.length,
    categoryCount: categories.size,
    largestCategory: largest,
    concentration,
    categories: sortedCategories,
    providers: [...providerCounts(regional).entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider, 'ru')),
    measures: regional
  };
}

function distinctiveMeasures(profiles) {
  const ownership = new Map();
  for (const profile of profiles) {
    for (const measure of profile.measures) {
      const key = normalizeMeasureTitle(measure.title) || normalizeText(measure.title);
      if (!ownership.has(key)) ownership.set(key, []);
      ownership.get(key).push({ region: profile.region, measure });
    }
  }

  const result = new Map(profiles.map((profile) => [profile.region, []]));
  for (const owners of ownership.values()) {
    const regions = new Set(owners.map((item) => item.region));
    if (regions.size !== 1) continue;
    const [{ region, measure }] = owners;
    result.get(region).push(measure);
  }
  for (const [region, values] of result) {
    result.set(region, values
      .sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'))
      .slice(0, 12));
  }
  return result;
}

function titleSet(profile) {
  return new Set(profile.measures.map((measure) => normalizeMeasureTitle(measure.title)).filter(Boolean));
}

export function titleOverlap(profileA, profileB) {
  const a = titleSet(profileA);
  const b = titleSet(profileB);
  const union = new Set([...a, ...b]);
  if (!union.size) return null;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / union.size;
}

export function compareRegions(measures, regions) {
  const selected = [...new Set(regions.filter(Boolean))].slice(0, 4);
  const profiles = selected.map((region) => buildRegionProfile(measures, region));
  const allCategories = [...new Set(profiles.flatMap((profile) => profile.categories.map((item) => item.category)))]
    .sort((a, b) => {
      const totalA = profiles.reduce((sum, profile) => sum + (profile.categories.find((item) => item.category === a)?.count || 0), 0);
      const totalB = profiles.reduce((sum, profile) => sum + (profile.categories.find((item) => item.category === b)?.count || 0), 0);
      return totalB - totalA || a.localeCompare(b, 'ru');
    });

  const categoryRows = allCategories.map((category) => ({
    category,
    values: Object.fromEntries(profiles.map((profile) => [
      profile.region,
      profile.categories.find((item) => item.category === category)?.count || 0
    ]))
  }));

  const overlaps = [];
  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      overlaps.push({
        first: profiles[i].region,
        second: profiles[j].region,
        value: titleOverlap(profiles[i], profiles[j])
      });
    }
  }

  return {
    profiles,
    federalCount: measures.filter((measure) => measure?.level === 'federal').length,
    categoryRows,
    distinctive: distinctiveMeasures(profiles),
    overlaps,
    maxRegionalCount: Math.max(1, ...profiles.map((profile) => profile.regionalCount))
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function comparisonToCsv(comparison, meta = {}) {
  const regions = comparison.profiles.map((profile) => profile.region);
  const lines = [
    ['Показатель', ...regions],
    ['Региональных записей', ...comparison.profiles.map((profile) => profile.regionalCount)],
    ['Представлено категорий', ...comparison.profiles.map((profile) => profile.categoryCount)],
    ['Крупнейшая категория', ...comparison.profiles.map((profile) => profile.largestCategory?.category || 'данные не представлены')],
    ['Доля крупнейшей категории', ...comparison.profiles.map((profile) => profile.largestCategory ? `${(profile.largestCategory.share * 100).toFixed(1)}%` : '')],
    [],
    ['Категория', ...regions],
    ...comparison.categoryRows.map((row) => [row.category, ...regions.map((region) => row.values[region])]),
    [],
    ['Метаданные', 'Значение'],
    ['Федеральных записей в общем каталоге', comparison.federalCount],
    ['Дата снимка', meta.generated_at || 'не указана'],
    ['Ограничение', 'Сравнивается структура записей текущего источника, а не объём финансирования или эффективность политики.']
  ];
  return `\uFEFF${lines.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
}
