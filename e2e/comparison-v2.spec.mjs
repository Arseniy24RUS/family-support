import { expect, test } from '@playwright/test';

async function waitForComparisonModule(page) {
  await page.goto('/compare.html');
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#comparison-map')).toBeVisible();
  await expect(page.locator('#comparison-map-regions [data-region]')).toHaveCount(89, { timeout: 20_000 });
}

test('карта выбирает регионы и строит межрегиональное сравнение', async ({ page }) => {
  await waitForComparisonModule(page);

  const mapGeometry = await page.locator('#comparison-map-regions').evaluate((layer) => {
    const box = layer.getBBox();
    const svg = layer.ownerSVGElement;
    const rendered = svg.getBoundingClientRect();
    return {
      viewBoxHeight: svg.viewBox.baseVal.height,
      geometryRatio: box.width / box.height,
      geometryFill: box.height / svg.viewBox.baseVal.height,
      renderedRatio: rendered.width / rendered.height
    };
  });
  expect(mapGeometry.viewBoxHeight).toBe(620);
  expect(mapGeometry.geometryRatio).toBeGreaterThan(1.8);
  expect(mapGeometry.geometryRatio).toBeLessThan(1.95);
  expect(mapGeometry.geometryFill).toBeGreaterThan(0.85);
  expect(mapGeometry.renderedRatio).toBeCloseTo(1120 / 620, 1);

  const regions = page.locator('#comparison-map-regions [data-region]');
  const first = regions.nth(0);
  const second = regions.nth(1);
  const firstName = await first.getAttribute('data-region');
  const secondName = await second.getAttribute('data-region');

  await first.click({ force: true });
  await second.click({ force: true });

  await expect(page.locator('#selection-count')).toHaveText('2 / 10');
  await expect(page.locator('#selected-regions')).toContainText(firstName);
  await expect(page.locator('#selected-regions')).toContainText(secondName);
  await expect(page.locator('#run-comparison')).toBeEnabled();

  await page.locator('#run-comparison').click();
  await expect(page.locator('#comparison-results')).toBeVisible();
  await expect(page.locator('#regional-metrics article')).toHaveCount(2);
  await expect(page.locator('#strategy-passports article')).toHaveCount(2);
  await expect(page).toHaveURL(/region=/u);
});

test('сравнение принимает до десяти субъектов и сохраняет устойчивые цвета', async ({ page }) => {
  await waitForComparisonModule(page);

  const regions = page.locator('#comparison-map-regions [data-region]');
  for (let index = 0; index < 10; index += 1) {
    await regions.nth(index).focus();
    await page.keyboard.press('Enter');
  }

  await expect(page.locator('#selection-count')).toHaveText('10 / 10');
  await expect(page.locator('#selected-regions .selected-region-card')).toHaveCount(10);
  await expect(page.locator('#comparison-map-markers .comparison-map__marker')).toHaveCount(10);
  await expect(page.locator('#comparison-map-regions [data-slot="10"]')).toHaveCount(1);
  await expect(page.locator('#regional-metrics .region-metric-card-v2')).toHaveCount(10);
  await expect(page.locator('#overlap-grid .overlap-card-v2')).toHaveCount(45);
  await expect(page.locator('#selection-note')).toContainText('десять субъектов');
  expect(await page.evaluate(() => new URL(location.href).searchParams.getAll('region'))).toHaveLength(10);

  await regions.nth(10).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#selection-count')).toHaveText('10 / 10');
  await expect(page.locator('#selected-regions .selected-region-card')).toHaveCount(10);
});

test('слои карты, поиск и клавиатурный выбор остаются доступными', async ({ page }) => {
  await waitForComparisonModule(page);

  await expect(page.getByLabel('Нейтральный')).toBeChecked();
  await expect(page.locator('#map-layer-switch label').first()).toContainText('Нейтральный');
  await expect(page.locator('#comparison-map-regions .comparison-map__region').first()).toHaveClass(/map-neutral/u);

  await page.locator('#map-layer-switch').getByText('Каталог мер', { exact: true }).click();
  await expect(page.getByLabel('Каталог мер')).toBeChecked();
  await expect(page.locator('#comparison-map-regions .comparison-map__region').first()).toHaveClass(/quantile-/u);

  await page.locator('#open-region-search').click();
  await page.locator('#region-search-input').fill('Москва');
  const result = page.locator('#region-search-results button').filter({ hasText: 'Москва' }).first();
  await expect(result).toBeVisible();
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#selected-regions')).toContainText('Москва');

  const selectedPath = page.locator('#comparison-map-regions [data-region="Москва"]');
  await expect(selectedPath).toHaveAttribute('aria-pressed', 'true');
  await selectedPath.focus();
  await expect(selectedPath).toHaveCSS('outline-style', 'none');
  await expect(selectedPath).toHaveCSS('stroke', 'rgb(15, 47, 85)');
});

test('библиотека показывает документы и загружает PDF только по отдельной команде', async ({ page }) => {
  await waitForComparisonModule(page);

  await page.locator('[data-strategy-scope="regional"]').click();
  await expect(page.locator('#strategy-document-list .strategy-document-card').first()).toBeVisible();
  await page.locator('#strategy-document-list .strategy-document-card').first().click();

  await expect(page.locator('#strategy-viewer-content')).toBeVisible();
  await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', 'about:blank');
  await expect(page.locator('#load-strategy-pdf')).toBeVisible();
  await expect(page.locator('#strategy-viewer-actions')).not.toContainText('Открыть PDF');
  await expect(page.locator('#strategy-viewer-actions a[download]').first()).toBeVisible();

  await page.locator('#load-strategy-pdf').click();
  await expect(page.locator('#strategy-pdf-frame')).not.toHaveAttribute('src', 'about:blank');
  await expect(page.locator('#strategy-pdf-frame')).toBeVisible();
});

test('прямая ссылка открывает документ без автоматической загрузки PDF', async ({ page }) => {
  const id = await page.request.get('/data/strategies.json')
    .then(async (response) => (await response.json()).documents.find((item) => item.availability === 'available').id);

  await page.goto(`/compare.html?doc=${encodeURIComponent(id)}#strategy-library`);
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#strategy-viewer-content')).toBeVisible();
  await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', 'about:blank');
  await expect(page.locator('script[data-document-runtime]')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(window.docx || window.JSZip))).toBe(false);
});

test('DOCX загружается и отображается внутри страницы только после нажатия', async ({ page }) => {
  const strategyDocument = await page.request.get('/data/strategies.json')
    .then(async (response) => (await response.json()).documents.find((item) => /\.docx$/iu.test(item.original_url || '')));
  expect(strategyDocument).toBeTruthy();

  const requestedUrls = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  await page.goto(`/compare.html?doc=${encodeURIComponent(strategyDocument.id)}#strategy-library`);
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#load-strategy-docx')).toBeVisible();
  expect(requestedUrls.some((url) => url.includes(strategyDocument.original_url.replace(/^\.\//u, '')))).toBe(false);
  expect(requestedUrls.some((url) => /(?:docx-preview|jszip)\.min\.js/u.test(url))).toBe(false);

  await page.locator('#load-strategy-docx').click();
  await expect(page.locator('#strategy-docx-viewer .docx-wrapper')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#strategy-docx-viewer section.docx').first()).toBeVisible();
  await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', 'about:blank');
  expect(requestedUrls.filter((url) => url.includes(strategyDocument.original_url.replace(/^\.\//u, '')))).toHaveLength(1);
  expect(requestedUrls.some((url) => /docx-preview\.min\.js/u.test(url))).toBe(true);
  expect(requestedUrls.some((url) => /jszip\.min\.js/u.test(url))).toBe(true);
});

test('страница не создаёт горизонтального переполнения', async ({ page }) => {
  await waitForComparisonModule(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
