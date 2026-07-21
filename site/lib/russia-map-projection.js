const DEGREES_TO_RADIANS = Math.PI / 180;

export const RUSSIA_LAMBERT_PARAMETERS = Object.freeze({
  centralMeridian: 100,
  latitudeOfOrigin: 52,
  standardParallel1: 45,
  standardParallel2: 65
});

function geometryRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flatMap((polygon) => polygon);
  return [];
}

function longitudeDelta(longitude, centralMeridian) {
  let delta = Number(longitude) - centralMeridian;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function createRawLambert(parameters) {
  const phi1 = parameters.standardParallel1 * DEGREES_TO_RADIANS;
  const phi2 = parameters.standardParallel2 * DEGREES_TO_RADIANS;
  const phi0 = parameters.latitudeOfOrigin * DEGREES_TO_RADIANS;
  const tangent = (latitude) => Math.tan(Math.PI / 4 + latitude / 2);
  const n = Math.log(Math.cos(phi1) / Math.cos(phi2)) / Math.log(tangent(phi2) / tangent(phi1));
  const factor = Math.cos(phi1) * tangent(phi1) ** n / n;
  const originRadius = factor / tangent(phi0) ** n;

  return ([longitude, latitude]) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    const phi = Math.max(-89.5, Math.min(89.5, latitude)) * DEGREES_TO_RADIANS;
    const radius = factor / tangent(phi) ** n;
    const theta = n * longitudeDelta(longitude, parameters.centralMeridian) * DEGREES_TO_RADIANS;
    return [
      radius * Math.sin(theta),
      radius * Math.cos(theta) - originRadius
    ];
  };
}

function projectedBounds(features, rawProject) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const feature of features ?? []) {
    for (const ring of geometryRings(feature?.geometry)) {
      for (const coordinate of ring ?? []) {
        const projected = rawProject(coordinate);
        if (!projected) continue;
        const [x, y] = projected;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return bounds;
}

export function createRussiaLambertProjection(features, width, height, padding = 24, overrides = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const safePadding = Math.max(0, Math.min(Number(padding) || 0, Math.min(viewportWidth, viewportHeight) / 2));
  const parameters = { ...RUSSIA_LAMBERT_PARAMETERS, ...overrides };
  const rawProject = createRawLambert(parameters);
  const bounds = projectedBounds(features, rawProject);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const innerWidth = Math.max(1, viewportWidth - safePadding * 2);
  const innerHeight = Math.max(1, viewportHeight - safePadding * 2);
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const offsetX = safePadding + (innerWidth - spanX * scale) / 2 - bounds.minX * scale;
  const offsetY = safePadding + (innerHeight - spanY * scale) / 2 - bounds.minY * scale;

  const project = (coordinate) => {
    const projected = rawProject(coordinate);
    return projected
      ? [offsetX + projected[0] * scale, offsetY + projected[1] * scale]
      : [viewportWidth / 2, viewportHeight / 2];
  };
  project.metadata = Object.freeze({
    name: 'Lambert Conformal Conic — Russia',
    parameters: Object.freeze(parameters),
    bounds: Object.freeze(bounds),
    width: viewportWidth,
    height: viewportHeight,
    padding: safePadding,
    scale
  });
  return project;
}
