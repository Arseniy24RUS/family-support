import { resolve } from 'node:path';
import { scrapeSovetmam } from './adapters/sovetmam.mjs';
import { readJson, writeJsonAtomic } from './lib/io.mjs';
import { validateSnapshot } from './lib/validate.mjs';
import { detailShardKey } from './lib/details.mjs';

const dataDirectory = resolve('site/data');
const measuresPath = resolve(dataDirectory, 'measures.json');
const metaPath = resolve(dataDirectory, 'meta.json');
const regionsPath = resolve(dataDirectory, 'regions.json');
const regionsBasePath = resolve(dataDirectory, 'regions-base.json');
const detailsDirectory = resolve(dataDirectory, 'details');
const detailShardCount = 32;
const previousMeta = await readJson(metaPath, null);
const baseRegions = await readJson(regionsBasePath, []);

console.log('Получение каталога мер поддержки…');
const result = await scrapeSovetmam();
const validation = validateSnapshot({
  measures: result.measures,
  reportedCount: result.reportedCount,
  previousMeta,
  baseRegions
});

for (const warning of validation.warnings) console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${warning}`);
if (result.parseErrors.length) {
  validation.errors.push(`Не разобрано карточек: ${result.parseErrors.length}.`);
  console.error(result.parseErrors.slice(0, 10));
}
if (result.detailErrors.length || result.details.length !== result.measures.length) {
  validation.errors.push(
    `Подробно разобрано ${result.details.length} из ${result.measures.length} карточек; ошибок: ${result.detailErrors.length}.`
  );
  console.error(result.detailErrors.slice(0, 20));
}

if (validation.errors.length) {
  console.error('\nПубликация отменена:');
  for (const error of validation.errors) console.error(`— ${error}`);
  process.exitCode = 1;
} else {
  const regions = [...new Set(result.measures.map((item) => item.region).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const meta = {
    schema_version: 2,
    generated_at: result.fetchedAt,
    source: result.source,
    source_url: result.sourceUrl,
    page_reported_count: result.reportedCount,
    loaded_link_count: result.loadedLinkCount,
    extraction_mode: result.extractionMode,
    measure_count: result.measures.length,
    region_count: validation.stats.regions,
    category_count: validation.stats.categories,
    parse_error_count: result.parseErrors.length,
    detail_count: result.details.length,
    detail_error_count: result.detailErrors.length,
    detail_shard_count: detailShardCount,
    official_link_count: result.details.reduce((total, item) => total + item.official_links.length, 0)
  };

  const detailShards = Array.from({ length: detailShardCount }, () => ({}));
  for (const detail of result.details) {
    detailShards[detailShardKey(detail.id, detailShardCount)][detail.id] = detail;
  }

  await writeJsonAtomic(measuresPath, result.measures);
  await writeJsonAtomic(regionsPath, regions);
  await writeJsonAtomic(metaPath, meta);
  await Promise.all(detailShards.map((shard, index) => writeJsonAtomic(
    resolve(detailsDirectory, `${String(index).padStart(2, '0')}.json`),
    shard
  )));
  await writeJsonAtomic(resolve(detailsDirectory, 'manifest.json'), {
    schema_version: 1,
    generated_at: result.fetchedAt,
    shard_count: detailShardCount,
    measure_count: result.measures.length,
    detail_count: result.details.length,
    official_link_count: meta.official_link_count
  });
  console.log(`Готово: ${meta.measure_count} мер, ${meta.detail_count} подробных карточек, ${meta.region_count} регионов.`);
}
