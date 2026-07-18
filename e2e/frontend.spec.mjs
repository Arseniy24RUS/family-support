import { test, expect } from '@playwright/test';
import { jsonFrom, numberFromText, observePage, openReady } from './helpers.mjs';

test('приложение и обязательные локальные ресурсы загружаются без ошибок', async ({ page }) => {
  const health = observePage(page);
  await openReady(page);
  await expect(page).toHaveTitle(/Меры поддержки семей с детьми/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Найдите меры поддержки');
  await expect(page.getByText('Войти', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Версия для слабовидящих', { exact: true })).toHaveCount(0);

  for (const path of [
    '/styles.css', '/app.js', '/assets/logo-isd.png', '/assets/hero-family.webp',
    '/assets/hero-family.jpg', '/assets/favicon.png', '/assets/logo-sovetmam-horizontal.jpg',
    '/assets/logo-sovetmam-round.svg', '/assets/logo-gosuslugi.svg', '/assets/logo-sfr.png',
    '/manifest.webmanifest', '/vendor/lucide.min.js', '/data/measures.json', '/data/meta.json',
    '/data/ru-regions.geojson'
  ]) {
    const response = await page.request.get(path);
    expect(response.ok(), path).toBeTruthy();
  }

  const brokenImages = await page.locator('img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src));
  expect(brokenImages).toEqual([]);
  expect(health.pageErrors).toEqual([]);
  expect(health.consoleErrors).toEqual([]);
  expect(health.failedRequests).toEqual([]);
});

test('header содержит только основной заголовок и партнёрский блок', async ({ page }) => {
  await openReady(page);
  await expect(page.locator('.institution-brand img')).toBeVisible();
  await expect(page.locator('.product-brand')).toHaveText('Меры поддержки семей с детьми');
  await expect(page.getByText(/Федеральный каталог/i)).toHaveCount(0);
  await expect(page.locator('header nav, #menu-toggle')).toHaveCount(0);
  const partner = page.locator('.header-partner');
  await expect(partner).toContainText('При поддержке Совета матерей');
  await expect(partner).toHaveAttribute('href', 'https://app.sovetmam.ru/');
  await expect(partner).toHaveAttribute('rel', /noopener/);
  await expect(partner).toHaveAttribute('rel', /noreferrer/);
  await expect(partner.locator('img')).toBeVisible();
});

test('интерфейс показывает полный рабочий снимок и фактическую статистику', async ({ page }) => {
  await openReady(page);
  const [measures, meta] = await Promise.all([
    jsonFrom(page, '/data/measures.json'), jsonFrom(page, '/data/meta.json')
  ]);
  expect(meta.demo).not.toBe(true);
  expect(meta.source).toBe('sovetmam');
  expect(meta.measure_count).toBe(measures.length);
  const federal = measures.filter((item) => item.level === 'federal').length;
  const regional = measures.filter((item) => item.level === 'regional').length;
  const regions = new Set(measures.map((item) => item.region).filter(Boolean)).size;
  await expect(page.locator('#stat-total')).toHaveText(new Intl.NumberFormat('ru-RU').format(measures.length));
  expect(numberFromText(await page.locator('#stat-federal').innerText())).toBe(federal);
  expect(numberFromText(await page.locator('#stat-regional').innerText())).toBe(regional);
  expect(numberFromText(await page.locator('#stat-regions').innerText())).toBe(regions);
  await expect(page.locator('i[data-lucide]')).toHaveCount(0);
  await expect(page.locator('svg.lucide').first()).toBeVisible();
  for (const text of await page.locator('.measure-card').allTextContents()) {
    expect(text).not.toMatch(/undefined|null|NaN/i);
  }
});
