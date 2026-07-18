export function strategyPeriodDomain(documents, { referenceYear = 2026 } = {}) {
  const years = [referenceYear];
  for (const document of documents ?? []) {
    const start = Number(document?.period?.start_year);
    const end = Number(document?.period?.end_year);
    if (Number.isFinite(start) && start > 1900 && start < 2100) years.push(start);
    if (Number.isFinite(end) && end > 1900 && end < 2100) years.push(end);
  }
  const minimum = Math.min(...years);
  const maximum = Math.max(...years);
  const start = Math.max(2000, Math.min(referenceYear - 3, minimum) - 1);
  const end = Math.min(2045, Math.max(referenceYear + 3, maximum) + 1);
  return { start, end: Math.max(start + 1, end), referenceYear };
}

export function strategyPeriodPosition(period, domain) {
  const startValue = period?.start_year;
  const endValue = period?.end_year;
  const startYear = startValue == null || startValue === '' ? Number.NaN : Number(startValue);
  const endYear = endValue == null || endValue === '' ? Number.NaN : Number(endValue);
  if (!Number.isFinite(startYear) && !Number.isFinite(endYear)) return null;
  const start = Number.isFinite(startYear) ? startYear : endYear;
  const end = Number.isFinite(endYear) ? endYear : startYear;
  const span = Math.max(1, domain.end - domain.start);
  const left = Math.max(0, Math.min(1, (start - domain.start) / span));
  const right = Math.max(left, Math.min(1, (end + 1 - domain.start) / span));
  return {
    left,
    width: Math.max(0.035, right - left),
    clippedStart: start < domain.start,
    clippedEnd: end > domain.end
  };
}

function profileValue(document, themeId) {
  return Number(document?.text_profile?.themes?.[themeId]?.per_10000_words) || 0;
}

export function lexicalThemeRows(corpus, documents, { limit = 8 } = {}) {
  const definitions = corpus?.analysis?.lexical_profile?.themes ?? [];
  return definitions
    .map((definition) => {
      const values = (documents ?? []).map((document) => ({
        region: document?.territory ?? '',
        documentId: document?.id ?? '',
        available: Boolean(document?.text_profile),
        reliability: document?.text_profile?.reliability ?? 'unavailable',
        value: profileValue(document, definition.id),
        matches: Number(document?.text_profile?.themes?.[definition.id]?.matches) || 0
      }));
      const numeric = values.filter((item) => item.available).map((item) => item.value);
      const max = numeric.length ? Math.max(...numeric) : 0;
      const min = numeric.length ? Math.min(...numeric) : 0;
      const mean = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0;
      return {
        id: definition.id,
        label: definition.label,
        values,
        max,
        min,
        mean,
        spread: max - min
      };
    })
    .filter((row) => row.max > 0)
    .sort((a, b) => b.spread - a.spread || b.mean - a.mean || a.label.localeCompare(b.label, 'ru'))
    .slice(0, Math.max(1, limit));
}

export function lexicalCosineSimilarity(documentA, documentB, themeIds = null) {
  if (!documentA?.text_profile || !documentB?.text_profile) return null;
  const ids = themeIds?.length
    ? themeIds
    : [...new Set([
        ...Object.keys(documentA.text_profile.themes ?? {}),
        ...Object.keys(documentB.text_profile.themes ?? {})
      ])];
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const id of ids) {
    const a = profileValue(documentA, id);
    const b = profileValue(documentB, id);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (!normA || !normB) return null;
  return Math.max(0, Math.min(1, dot / Math.sqrt(normA * normB)));
}

export function pairwiseLexicalSimilarity(documents, themeIds = null) {
  const rows = [];
  for (let left = 0; left < (documents?.length ?? 0); left += 1) {
    for (let right = left + 1; right < documents.length; right += 1) {
      rows.push({
        a: documents[left]?.territory ?? '',
        b: documents[right]?.territory ?? '',
        value: lexicalCosineSimilarity(documents[left], documents[right], themeIds)
      });
    }
  }
  return rows;
}
