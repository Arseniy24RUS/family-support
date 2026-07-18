import { test, expect } from '@playwright/test';
import { jsonFrom, openReady } from './helpers.mjs';

test('снимок данных полон, уникален и согласован с meta и справочником регионов', async ({ page }) => {
  await openReady(page);
  const [measures, meta, regionsBase, detailManifest] = await Promise.all([
    jsonFrom(page, '/data/measures.json'),
    jsonFrom(page, '/data/meta.json'),
    jsonFrom(page, '/data/regions-base.json'),
    jsonFrom(page, '/data/details/manifest.json')
  ]);
  expect(measures.length).toBeGreaterThanOrEqual(1000);
  expect(meta.measure_count).toBe(measures.length);
  expect(meta.loaded_link_count).toBe(measures.length);
  expect(meta.parse_error_count).toBe(0);
  expect(meta.detail_error_count).toBe(0);
  expect(meta.detail_count).toBe(measures.length);
  expect(detailManifest.detail_count).toBe(measures.length);
  expect(measures.length / meta.page_reported_count).toBeGreaterThanOrEqual(0.97);
  expect(new Set(measures.map((item) => item.id)).size).toBe(measures.length);
  expect(new Set(regionsBase).size).toBe(89);
  for (const item of measures) {
    expect(item.id).toBeTruthy();
    expect(item.title).toBeTruthy();
    expect(item.category).toBeTruthy();
    expect(item.source_url).toMatch(/^https:\/\/app\.sovetmam\.ru\/catalog\/[a-z0-9-]+$/i);
    expect(item.content_hash).toMatch(/^[a-f0-9]{64}$/);
    if (item.level === 'regional') expect(regionsBase).toContain(item.region);
  }

  const shards = await Promise.all(Array.from({ length: detailManifest.shard_count }, (_, index) =>
    jsonFrom(page, `/data/details/${String(index).padStart(2, '0')}.json`)
  ));
  const details = Object.assign({}, ...shards);
  expect(Object.keys(details)).toHaveLength(measures.length);
  const allowedHosts = new Set(['gosuslugi.ru', 'www.gosuslugi.ru', 'sfr.gov.ru', 'nalog.gov.ru', 'www.nalog.gov.ru', 'trudvsem.ru', 'www.trudvsem.ru']);
  const forbiddenGenericUrls = new Set([
    'https://www.gosuslugi.ru/social-navigator',
    'https://www.gosuslugi.ru/large_family',
    'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/',
    'https://www.nalog.gov.ru/rn77/fl/',
    'https://trudvsem.ru/'
  ]);
  let officialLinkCount = 0;
  for (const measure of measures) {
    const detail = details[measure.id];
    expect(detail, measure.id).toBeTruthy();
    expect(detail.steps.length, measure.id).toBeGreaterThan(0);
    officialLinkCount += detail.official_links.length;
    for (const link of detail.official_links) {
      expect(allowedHosts.has(new URL(link.url).hostname), link.url).toBeTruthy();
      expect(forbiddenGenericUrls.has(link.url), link.url).toBeFalsy();
    }
  }
  expect(officialLinkCount).toBe(meta.official_link_count);
  expect(officialLinkCount).toBe(detailManifest.official_link_count);
  expect(officialLinkCount).toBeGreaterThan(20);
});

test('все фактические категории доступны в фильтре и имеют SVG-иконки', async ({ page }) => {
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const categories = [...new Set(measures.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'ru'));
  const options = await page.locator('#category-filter option').evaluateAll((nodes) => nodes.slice(1).map((node) => node.value).sort((a, b) => a.localeCompare(b, 'ru')));
  expect(options).toEqual(categories);
  await expect(page.locator('.category-card')).toHaveCount(categories.length);
  await expect(page.locator('.category-card svg.lucide')).toHaveCount(categories.length);
});
