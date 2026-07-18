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
    '/data/ru-regions.geojson', '/data/details/manifest.json'
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

test('header объединяет логотипы организаций и открывает основные разделы платформы', async ({ page }) => {
  await openReady(page);
  const organizations = page.locator('.header-organizations');
  await expect(organizations.locator('.institution-brand img')).toBeVisible();
  await expect(organizations.locator('.header-organizations__divider')).toBeVisible();
  await expect(organizations.locator('.council-brand img')).toBeVisible();
  await expect(page.locator('.product-brand > strong')).toHaveText('Меры поддержки семей с детьми');
  await expect(page.getByText(/Федеральный каталог/i)).toHaveCount(0);
  const platformNav = page.locator('header .platform-nav');
  await expect(platformNav).toBeVisible();
  await expect(platformNav.locator('a')).toHaveCount(4);
  await expect(platformNav.locator('a[aria-current="page"]')).toHaveText('Каталог');
  await expect(page.locator('#menu-toggle')).toHaveCount(0);
  await expect(page.locator('.header-partner')).toHaveCount(0);
  await expect(page.getByText(/при поддержке/i)).toHaveCount(0);
  const councilLinks = page.locator('a[href="https://app.sovetmam.ru/"]');
  await expect(councilLinks).toHaveCount(2);
  await expect(organizations.locator('a.council-brand')).toHaveAttribute('target', '_blank');
  await expect(page.locator('.service-list a.service-list__item')).toHaveAttribute('target', '_blank');

  const councilLogo = organizations.locator('.council-brand img');
  const institutionLogo = organizations.locator('.institution-brand img');
  expect((await councilLogo.boundingBox()).height).toBeGreaterThan((await institutionLogo.boundingBox()).height * 0.45);
  const productStyle = await page.locator('.product-brand strong').evaluate((node) => ({
    textAlign: getComputedStyle(node).textAlign,
    color: getComputedStyle(node).color
  }));
  expect(productStyle.textAlign).toBe('left');
  expect(productStyle.color).not.toBe('rgb(27, 35, 48)');

  const sourceLogo = page.locator('.service-icon--logo').first();
  const sourceStyle = await sourceLogo.evaluate((node) => ({
    width: getComputedStyle(node).width,
    borderTopWidth: getComputedStyle(node).borderTopWidth,
    backgroundColor: getComputedStyle(node).backgroundColor
  }));
  expect(Number.parseFloat(sourceStyle.width)).toBeGreaterThanOrEqual(56);
  expect(sourceStyle.borderTopWidth).toBe('0px');
  expect(sourceStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
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
