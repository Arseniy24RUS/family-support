import { createRussiaLambertProjection } from './russia-map-projection.js';

const MAP_REGION_ALIASES = new Map([
  ['Город Москва', 'Москва'],
  ['Город Санкт-Петербург', 'Санкт-Петербург'],
  ['Город Севастополь', 'Севастополь'],
  ['Кемеровская область – Кузбасс', 'Кемеровская область — Кузбасс'],
  ['Кемеровская область - Кузбасс', 'Кемеровская область — Кузбасс'],
  ['Республика Северная Осетия – Алания', 'Республика Северная Осетия — Алания'],
  ['Республика Северная Осетия - Алания', 'Республика Северная Осетия — Алания'],
  ['Ханты-Мансийский автономный округ – Югра', 'Ханты-Мансийский автономный округ — Югра'],
  ['Ханты-Мансийский автономный округ - Югра', 'Ханты-Мансийский автономный округ — Югра'],
  ['Чувашская Республика - Чувашия', 'Чувашская Республика — Чувашия'],
  ['Чувашская Республика – Чувашия', 'Чувашская Республика — Чувашия'],
  ['Республика Татарстан', 'Республика Татарстан (Татарстан)'],
  ['Республика Адыгея', 'Республика Адыгея (Адыгея)']
]);

export function normalizeMapRegion(value) {
  const source = String(value ?? '').trim();
  return MAP_REGION_ALIASES.get(source) ?? source;
}

export function featureRegionName(feature) {
  return normalizeMapRegion(feature?.properties?.name || feature?.properties?.territory_name || feature?.properties?.region || '');
}

export function geometryRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flatMap((polygon) => polygon);
  return [];
}

export function createMapProjection(features, width = 1120, height = 620, padding = 28) {
  return createRussiaLambertProjection(features, width, height, padding);
}

export function geometryPath(geometry, project) {
  return geometryRings(geometry).map((ring) => ring.map((coordinate, index) => {
    const [x, y] = project(coordinate);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z').join(' ');
}

function ringAreaAndCentroid(ring, project) {
  const points = (ring ?? []).map(project);
  if (points.length < 3) return { area: 0, x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0 };
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-7) {
    const sum = points.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return { area: 0, x: sum[0] / points.length, y: sum[1] / points.length };
  }
  return {
    area: Math.abs(twiceArea / 2),
    x: cx / (3 * twiceArea),
    y: cy / (3 * twiceArea)
  };
}

export function geometryCentroid(geometry, project) {
  const candidates = geometryRings(geometry)
    .map((ring) => ringAreaAndCentroid(ring, project))
    .sort((a, b) => b.area - a.area);
  return candidates[0] ? [candidates[0].x, candidates[0].y] : [0, 0];
}

export function quantileThresholds(values, groups = 4) {
  const sorted = (values ?? []).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const thresholds = [];
  for (let index = 1; index < groups; index += 1) {
    const position = Math.min(sorted.length - 1, Math.ceil(index * sorted.length / groups) - 1);
    thresholds.push(sorted[position]);
  }
  return [...new Set(thresholds)];
}

export function quantileClass(value, thresholds) {
  if (!Number.isFinite(value) || value <= 0) return 'quantile-0';
  let index = 1;
  for (const threshold of thresholds ?? []) {
    if (value > threshold) index += 1;
  }
  return `quantile-${Math.min(index, 4)}`;
}

export function strategyMapClass(document) {
  if (!document || document.availability === 'missing') return 'strategy-missing';
  if (document.availability === 'unavailable') return 'strategy-unavailable';
  if (document.quality === 'partial') return 'strategy-partial';
  if (document.period?.temporal_status === 'historical') return 'strategy-historical';
  return 'strategy-available';
}

export function selectionSlot(selectedRegions, region) {
  const index = (selectedRegions ?? []).indexOf(region);
  return index < 0 ? 0 : index + 1;
}

export function clampZoom(value, min = 1, max = 4.5) {
  return Math.max(min, Math.min(max, Number(value) || min));
}
