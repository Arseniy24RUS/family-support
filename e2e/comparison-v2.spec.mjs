import { expect, test } from '@playwright/test';

async function waitForComparisonModule(page) {
  await page.goto('/compare.html');
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#comparison-map')).toBeVisible();
  await expect(page.locator('#comparison-map-regions [data-region]')).toHaveCount(89, { timeout: 20_000 });
}

test('карта выбирает регионы и строит межрегиональное сравнение', async ({ page }) => {
  await waitForComparisonModule(page);

  const regions = page.locator('#comparison-map-regions [data-region]');
  const first = regions.nth(0);
  const second = regions.nth(1);
  const firstName = await first.getAttribute('data-region');
  const secondName = await second.getAttribute('data-region');

  await first.click({ force: true });
  await second.click({ force: true });

  await expect(page.locator('#selection-count')).toHaveText('2 / 4');
  await expect(page.locator('#selected-regions')).toContainText(firstName);
  await expect(page.locator('#selected-regions')).toContainText(secondName);
  await expect(page.locator('#run-comparison')).toBeEnabled();

  await page.locator('#run-comparison').click();
  await expect(page.locator('#comparison-results')).toBeVisible();
  await expect(page.locator('#regional-metrics article')).toHaveCount(2);
  await expect(page.locator('#strategy-passports article')).toHaveCount(2);
  await expect(page).toHaveURL(/region=/u);
});

test('слои карты, поиск и клавиатурный выбор остаются доступными', async ({ page }) => {
  await waitForComparisonModule(page);

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
});

test('библиотека показывает документы и загружает PDF только по отдельной команде', async ({ page }) => {
  await waitForComparisonModule(page);

  await page.locator('[data-strategy-scope="regional"]').click();
  await expect(page.locator('#strategy-document-list .strategy-document-card').first()).toBeVisible();
  await page.locator('#strategy-document-list .strategy-document-card').first().click();

  await expect(page.locator('#strategy-viewer-content')).toBeVisible();
  await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', 'about:blank');
  await expect(page.locator('#load-strategy-pdf')).toBeVisible();
  await expect(page.locator('#strategy-viewer-actions a[download]').first()).toBeVisible();
});

test('прямая ссылка открывает документ без автоматической загрузки PDF', async ({ page }) => {
  const id = await page.request.get('/data/strategies.json')
    .then(async (response) => (await response.json()).documents.find((item) => item.availability === 'available').id);

  await page.goto(`/compare.html?doc=${encodeURIComponent(id)}#strategy-library`);
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#strategy-viewer-content')).toBeVisible();
  await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', 'about:blank');
});

test('страница не создаёт горизонтального переполнения', async ({ page }) => {
  await waitForComparisonModule(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
