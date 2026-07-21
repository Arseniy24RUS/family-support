import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  clampZoom,
  createMapProjection,
  featureRegionName,
  geometryCentroid,
  geometryRings,
  geometryPath,
  quantileClass,
  quantileThresholds,
  selectionSlot,
  strategyMapClass
} from '../site/lib/compare-map.js';
import {
  buildResearchExport,
  createStrategyIndex,
  filterStrategyDocuments,
  formatFileSize,
  strategyCoverageCounts,
  strategyForRegion,
  strategyPermalink,
  strategyQualityLabel,
  strategySummaryForRegions
} from '../site/lib/strategy-library.js';
import {
  buildComparisonInsights,
  categoryRowsWithShares,
  pairwiseCategorySimilarity,
  topDifferentiatingCategories
} from '../site/lib/comparison-insights.js';
import {
  lexicalCosineSimilarity,
  lexicalThemeRows,
  pairwiseLexicalSimilarity,
  strategyPeriodDomain,
  strategyPeriodPosition
} from '../site/lib/strategy-text-analysis.js';
import {
  RUSSIA_LAMBERT_PARAMETERS,
  createRussiaLambertProjection
} from '../site/lib/russia-map-projection.js';

const feature = {
  type: 'Feature',
  properties: { name: 'Город Москва' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[37, 55], [38, 55], [38, 56], [37, 56], [37, 55]]]
  }
};

const corpus = {
  analysis: {
    lexical_profile: {
      method: 'ru-lexical-themes-v1',
      themes: [
        { id: 'housing', label: 'Жильё и ипотека' },
        { id: 'monitoring', label: 'Мониторинг и целевые показатели' }
      ]
    }
  },
  documents: [
    {
      id: 'r-a', scope: 'regional', group: 'regional', territory: 'Регион А',
      title: 'Программа А', availability: 'available', quality: 'full', pages: 50,
      size_bytes: 1024 * 1024,
      period: { start_year: 2024, end_year: 2027, label: '2024–2027 годы', temporal_status: 'active' },
      text_profile: {
        method: 'ru-lexical-themes-v1', token_count: 10000, reliability: 'standard',
        themes: {
          housing: { matches: 40, per_10000_words: 40 },
          monitoring: { matches: 20, per_10000_words: 20 }
        }
      }
    },
    {
      id: 'r-b', scope: 'regional', group: 'regional', territory: 'Регион Б',
      title: 'Материал Б', availability: 'available', quality: 'partial', pages: 5,
      size_bytes: 2048,
      period: { start_year: null, end_year: null, label: 'период не установлен', temporal_status: 'undated' },
      text_profile: {
        method: 'ru-lexical-themes-v1', token_count: 5000, reliability: 'limited',
        themes: {
          housing: { matches: 5, per_10000_words: 10 },
          monitoring: { matches: 25, per_10000_words: 50 }
        }
      }
    },
    {
      id: 'r-c', scope: 'regional', group: 'regional', territory: 'Регион В',
      title: 'Программа В', availability: 'missing', quality: 'missing', pages: null,
      size_bytes: 0, period: { label: 'период не установлен', temporal_status: 'undated' }
    },
    {
      id: 'm-a', scope: 'municipal', group: 'municipal', territory: 'Город А', parent_region: 'Регион А',
      title: 'Муниципальная программа', availability: 'available', quality: 'full', pages: 10,
      size_bytes: 1024, period: { label: '2025–2027 годы', temporal_status: 'active' }
    },
    {
      id: 'f-a', scope: 'federal', group: 'strategic', territory: 'Российская Федерация',
      title: 'Федеральная стратегия', availability: 'available', quality: 'full', pages: 20,
      size_bytes: 4096, period: { label: 'до 2036 года', temporal_status: 'active' }
    }
  ]
};

const comparison = {
  profiles: [
    { region: 'Регион А', regionalCount: 10, categoryCount: 2, largestCategory: { category: 'Выплаты', share: 0.7 } },
    { region: 'Регион Б', regionalCount: 8, categoryCount: 2, largestCategory: { category: 'Услуги', share: 0.625 } }
  ],
  categoryRows: [
    { category: 'Выплаты', values: { 'Регион А': 7, 'Регион Б': 3 } },
    { category: 'Услуги', values: { 'Регион А': 3, 'Регион Б': 5 } }
  ],
  overlaps: [{ first: 'Регион А', second: 'Регион Б', value: 0.25 }]
};

test('названия GeoJSON нормализуются к справочнику платформы', () => {
  assert.equal(featureRegionName(feature), 'Москва');
});

test('проекция, path и центроид формируются для полигона', () => {
  const project = createMapProjection([feature], 1120, 620, 24);
  const path = geometryPath(feature.geometry, project);
  const [x, y] = geometryCentroid(feature.geometry, project);
  assert.match(path, /^M/);
  assert.match(path, /Z$/);
  assert.ok(x > 0 && x < 1120);
  assert.ok(y > 0 && y < 620);
});

test('россия-центричная проекция Ламберта сохраняет пропорции всей карты', () => {
  const geoData = JSON.parse(readFileSync(new URL('../site/data/ru-regions.geojson', import.meta.url), 'utf8'));
  const project = createRussiaLambertProjection(geoData.features, 1100, 600, 24);
  const points = geoData.features.flatMap((item) => geometryRings(item.geometry))
    .flatMap((ring) => ring)
    .map(project);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const projectedWidth = Math.max(...xs) - Math.min(...xs);
  const projectedHeight = Math.max(...ys) - Math.min(...ys);

  assert.equal(project.metadata.name, 'Lambert Conformal Conic — Russia');
  assert.deepEqual(project.metadata.parameters, RUSSIA_LAMBERT_PARAMETERS);
  assert.ok(project.metadata.scale > 0);
  assert.ok(Math.min(...xs) >= 24 - 1e-7 && Math.max(...xs) <= 1100 - 24 + 1e-7);
  assert.ok(Math.min(...ys) >= 24 - 1e-7 && Math.max(...ys) <= 600 - 24 + 1e-7);
  assert.ok(projectedWidth / projectedHeight > 1.8);
  assert.ok(projectedWidth / projectedHeight < 1.95);
  assert.ok(projectedHeight > 0.9 * (600 - 48));
});

test('квантили дают отдельный класс нулевым значениям', () => {
  const thresholds = quantileThresholds([0, 1, 2, 3, 4, 10], 4);
  assert.equal(quantileClass(0, thresholds), 'quantile-0');
  assert.equal(quantileClass(10, thresholds), 'quantile-4');
});

test('выбор региона сохраняет устойчивый слот и ограничивает масштаб', () => {
  assert.equal(selectionSlot(['А', 'Б', 'В'], 'Б'), 2);
  assert.equal(selectionSlot(['А'], 'В'), 0);
  assert.equal(clampZoom(9), 4.5);
  assert.equal(clampZoom(0.1), 1);
});

test('класс документального слоя учитывает полноту и период', () => {
  assert.equal(strategyMapClass(corpus.documents[0]), 'strategy-available');
  assert.equal(strategyMapClass(corpus.documents[1]), 'strategy-partial');
  assert.equal(strategyMapClass(corpus.documents[2]), 'strategy-missing');
});

test('индекс связывает региональную и муниципальную документацию', () => {
  const index = createStrategyIndex(corpus);
  assert.equal(strategyForRegion(index, 'Регион А').id, 'r-a');
  const summary = strategySummaryForRegions(index, ['Регион А'])[0];
  assert.equal(summary.document.id, 'r-a');
  assert.equal(summary.municipal.length, 1);
  assert.equal(summary.municipal[0].id, 'm-a');
});

test('фильтр выбранных регионов включает их муниципальные приложения', () => {
  const values = filterStrategyDocuments(corpus.documents, {
    scope: 'selected', selectedRegions: ['Регион А']
  });
  assert.deepEqual(values.map((item) => item.id), ['r-a', 'm-a']);
});

test('поиск корпуса нормализует регистр и букву ё', () => {
  const values = filterStrategyDocuments(corpus.documents, { query: 'ФЕДЕРАЛЬНАЯ СТРАТЕГИЯ' });
  assert.deepEqual(values.map((item) => item.id), ['f-a']);
});

test('фильтры полноты и периода не смешивают статусы', () => {
  assert.deepEqual(filterStrategyDocuments(corpus.documents, { quality: 'partial' }).map((item) => item.id), ['r-b']);
  assert.equal(filterStrategyDocuments(corpus.documents, { temporal: 'active' }).length, 3);
});

test('сводка покрытия различает полный, частичный и отсутствующий текст', () => {
  assert.deepEqual(strategyCoverageCounts(corpus.documents), { full: 1, partial: 1, unavailable: 0, missing: 1 });
  assert.equal(strategyQualityLabel(corpus.documents[2]), 'Нет в корпусе');
});

test('формат размера файла пригоден для карточек', () => {
  assert.equal(formatFileSize(1024 * 1024), '1,0 МБ');
  assert.equal(formatFileSize(0), '—');
});

test('ссылка на документ сохраняет параметры сравнения и добавляет doc', () => {
  const url = strategyPermalink(corpus.documents[0], 'https://example.test/compare.html?region=Регион+А');
  assert.equal(url.searchParams.get('region'), 'Регион А');
  assert.equal(url.searchParams.get('doc'), 'r-a');
  assert.equal(url.hash, '#strategy-library');
});

test('долевые строки рассчитываются внутри каждого региона', () => {
  const rows = categoryRowsWithShares(comparison);
  assert.equal(rows[0].shares['Регион А'], 0.7);
  assert.equal(rows[0].shares['Регион Б'], 0.375);
});

test('выделяются категории с наибольшим размахом долей', () => {
  const rows = topDifferentiatingCategories(comparison, 1);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].range > 0.3);
});

test('сходство категориальной структуры симметрично и ограничено единицей', () => {
  const pairs = pairwiseCategorySimilarity(comparison);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].similarity >= 0 && pairs[0].similarity <= 1);
});

test('аналитические выводы содержат оговорку о полноте источника', () => {
  const insights = buildComparisonInsights(comparison, strategySummaryForRegions(createStrategyIndex(corpus), ['Регион А', 'Регион Б']));
  assert.ok(insights.length >= 4);
  assert.match(insights[0].note, /полноты исходного каталога/);
});

test('временная шкала охватывает периоды документов и 2026 год', () => {
  const domain = strategyPeriodDomain(corpus.documents.slice(0, 2));
  assert.ok(domain.start <= 2024);
  assert.ok(domain.end >= 2027);
  const position = strategyPeriodPosition(corpus.documents[0].period, domain);
  assert.ok(position.left >= 0 && position.left < 1);
  assert.ok(position.width > 0);
  assert.equal(strategyPeriodPosition(corpus.documents[1].period, domain), null);
});

test('лексические строки ранжируются по различиям нормированной частоты', () => {
  const rows = lexicalThemeRows(corpus, corpus.documents.slice(0, 2), { limit: 2 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].spread, 30);
  assert.equal(rows[0].values.length, 2);
});

test('лексическое сходство симметрично и доступно попарно', () => {
  const a = corpus.documents[0];
  const b = corpus.documents[1];
  assert.equal(lexicalCosineSimilarity(a, b), lexicalCosineSimilarity(b, a));
  const pairs = pairwiseLexicalSimilarity([a, b]);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].value >= 0 && pairs[0].value <= 1);
});

test('исследовательский JSON переносит overlap и документальные метаданные', () => {
  const payload = buildResearchExport({
    comparison,
    strategies: strategySummaryForRegions(createStrategyIndex(corpus), ['Регион А', 'Регион Б']),
    meta: { generated_at: '2026-07-18T00:00:00Z' },
    generatedAt: '2026-07-18T12:00:00Z'
  });
  assert.equal(payload.regions.length, 2);
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.regions[0].strategy.id, 'r-a');
  assert.equal(payload.regions[0].strategy.lexical_profile.method, 'ru-lexical-themes-v1');
  assert.equal(payload.pairwise_title_overlap.length, 1);
});
