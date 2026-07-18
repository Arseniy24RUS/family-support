function safeProfiles(comparison) {
  return Array.isArray(comparison?.profiles) ? comparison.profiles : [];
}

function safeRows(comparison) {
  return Array.isArray(comparison?.categoryRows) ? comparison.categoryRows : [];
}

function cosine(valuesA, valuesB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.max(valuesA.length, valuesB.length);
  for (let index = 0; index < length; index += 1) {
    const a = Number(valuesA[index]) || 0;
    const b = Number(valuesB[index]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  return Math.max(0, Math.min(1, dot / Math.sqrt(normA * normB)));
}

export function categoryRowsWithShares(comparison) {
  const profiles = safeProfiles(comparison);
  const totals = new Map(profiles.map((profile) => [profile.region, Number(profile.regionalCount) || 0]));
  return safeRows(comparison).map((row) => {
    const shares = {};
    const values = {};
    for (const profile of profiles) {
      const count = Number(row?.values?.[profile.region]) || 0;
      values[profile.region] = count;
      shares[profile.region] = totals.get(profile.region) ? count / totals.get(profile.region) : 0;
    }
    const shareValues = Object.values(shares);
    const maxShare = shareValues.length ? Math.max(...shareValues) : 0;
    const minShare = shareValues.length ? Math.min(...shareValues) : 0;
    return {
      category: row.category,
      values,
      shares,
      total: Object.values(values).reduce((sum, value) => sum + value, 0),
      maxShare,
      minShare,
      range: maxShare - minShare
    };
  });
}

export function topDifferentiatingCategories(comparison, limit = 5) {
  return categoryRowsWithShares(comparison)
    .filter((row) => row.total > 0)
    .sort((a, b) => b.range - a.range || b.total - a.total || String(a.category).localeCompare(String(b.category), 'ru'))
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function pairwiseCategorySimilarity(comparison) {
  const profiles = safeProfiles(comparison);
  const rows = categoryRowsWithShares(comparison);
  const result = [];
  for (let first = 0; first < profiles.length; first += 1) {
    for (let second = first + 1; second < profiles.length; second += 1) {
      const a = profiles[first].region;
      const b = profiles[second].region;
      result.push({
        a,
        b,
        similarity: cosine(rows.map((row) => row.shares[a] || 0), rows.map((row) => row.shares[b] || 0))
      });
    }
  }
  return result;
}

function numberRange(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return { min: 0, max: 0, range: 0 };
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return { min, max, range: max - min };
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1).replace('.', ',')}%`;
}

export function buildComparisonInsights(comparison, strategySummaries = []) {
  const profiles = safeProfiles(comparison);
  if (!profiles.length) return [];

  const countRange = numberRange(profiles.map((profile) => profile.regionalCount));
  const categoryRange = numberRange(profiles.map((profile) => profile.categoryCount));
  const differences = topDifferentiatingCategories(comparison, 1);
  const similarityPairs = pairwiseCategorySimilarity(comparison);
  const fullTexts = strategySummaries.filter((summary) => summary?.quality === 'full').length;
  const gaps = strategySummaries.filter((summary) => summary?.quality !== 'full').length;
  const insights = [
    {
      icon: 'library-big',
      title: 'Размах представления в каталоге',
      value: countRange.range.toLocaleString('ru-RU'),
      note: `Разница между максимумом (${countRange.max.toLocaleString('ru-RU')}) и минимумом (${countRange.min.toLocaleString('ru-RU')}) зависит от полноты исходного каталога и не измеряет объём поддержки.`
    },
    {
      icon: 'layers-3',
      title: 'Тематическая широта',
      value: `${categoryRange.min.toLocaleString('ru-RU')}–${categoryRange.max.toLocaleString('ru-RU')}`,
      note: 'Диапазон числа категорий, в которых представлены региональные карточки выбранных субъектов.'
    }
  ];

  if (differences[0]) {
    insights.push({
      icon: 'split-square-horizontal',
      title: 'Наибольшее структурное различие',
      value: differences[0].category,
      note: `Размах долей категории между выбранными субъектами составляет ${formatPercent(differences[0].range)}.`
    });
  }

  insights.push({
    icon: gaps ? 'file-warning' : 'files',
    title: 'Документальное покрытие',
    value: `${fullTexts} из ${strategySummaries.length}`,
    note: gaps
      ? `${gaps} выбранных субъектов представлены частично, отметкой об отсутствии файла либо не представлены в переданном корпусе.`
      : 'Для всех выбранных субъектов в корпусе имеется полный текст региональной программы.'
  });

  if (similarityPairs.length) {
    const closest = [...similarityPairs].sort((a, b) => b.similarity - a.similarity)[0];
    insights.push({
      icon: 'git-compare-arrows',
      title: 'Наиболее близкая структура',
      value: `${closest.a} — ${closest.b}`,
      note: `Косинусное сходство долей категорий: ${formatPercent(closest.similarity)}. Показатель не устанавливает правовую эквивалентность мер.`
    });
  }

  return insights;
}
