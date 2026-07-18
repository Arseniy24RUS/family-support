import { test, expect } from '@playwright/test';
import { jsonFrom, openReady } from './helpers.mjs';

test('снимок данных полон, уникален и согласован с meta и справочником регионов', async ({ page }) => {
  await openReady(page);
  const [measures, meta, regionsBase] = await Promise.all([
    jsonFrom(page, '/data/measures.json'),
    jsonFrom(page, '/data/meta.json'),
    jsonFrom(page, '/data/regions-base.json')
  ]);
  expect(measures.length).toBeGreaterThanOrEqual(1000);
  expect(meta.measure_count).toBe(measures.length);
  expect(meta.loaded_link_count).toBe(measures.length);
  expect(meta.parse_error_count).toBe(0);
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
