import { resolve } from 'node:path';
import { scrapeSovetmam } from './adapters/sovetmam.mjs';
import { readJson, writeJsonAtomic } from './lib/io.mjs';
import { validateSnapshot } from './lib/validate.mjs';

const dataDirectory = resolve('site/data');
const measuresPath = resolve(dataDirectory, 'measures.json');
const metaPath = resolve(dataDirectory, 'meta.json');
const regionsPath = resolve(dataDirectory, 'regions.json');
const regionsBasePath = resolve(dataDirectory, 'regions-base.json');
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

if (validation.errors.length) {
  console.error('\nПубликация отменена:');
  for (const error of validation.errors) console.error(`— ${error}`);
  process.exitCode = 1;
} else {
  const regions = [...new Set(result.measures.map((item) => item.region).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const meta = {
    schema_version: 1,
    generated_at: result.fetchedAt,
    source: result.source,
    source_url: result.sourceUrl,
    page_reported_count: result.reportedCount,
    loaded_link_count: result.loadedLinkCount,
    extraction_mode: result.extractionMode,
    measure_count: result.measures.length,
    region_count: validation.stats.regions,
    category_count: validation.stats.categories,
    parse_error_count: result.parseErrors.length
  };

  await writeJsonAtomic(measuresPath, result.measures);
  await writeJsonAtomic(regionsPath, regions);
  await writeJsonAtomic(metaPath, meta);
  console.log(`Готово: ${meta.measure_count} мер, ${meta.region_count} регионов.`);
}
