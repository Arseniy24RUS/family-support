import { expect, test } from '@playwright/test';

async function waitForCatalog(page) {
  await expect(page.locator('#snapshot')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#catalog .measure-card').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('комплексное расширение платформы', () => {
  test('существующий каталог сохраняет работу и получает локальное избранное и устойчивые ссылки', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForCatalog(page);

    const firstCard = page.locator('#catalog .measure-card').first();
    const favorite = firstCard.locator('.measure-card__favorite');
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#favorites-count')).toHaveText('1');

    await page.reload();
    await waitForCatalog(page);
    await expect(page.locator('#favorites-count')).toHaveText('1');
    await expect(page.locator('#catalog .measure-card').first().locator('.measure-card__favorite')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#catalog .measure-card').first().locator('.measure-card__link').click();
    await expect(page.locator('#measure-dialog')).toBeVisible();
    await expect(page).toHaveURL(/(?:\?|&)measure=/);
    await expect(page.locator('#measure-dialog .measure-detail-toolbar')).toBeVisible();
    await expect(page.locator('#measure-dialog .detail-quality, #measure-dialog .measure-detail-quality')).toBeVisible();

    await page.locator('[data-close-measure]').click();
    await expect(page.locator('#measure-dialog')).not.toBeVisible();
    await expect(page).not.toHaveURL(/(?:\?|&)measure=/);
  });

  test('подбор по жизненной ситуации формирует объяснимый предварительный результат без записи анкеты в URL', async ({ page }) => {
    await page.goto('/situations.html');
    await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });

    await page.locator('#situation-region').selectOption({ index: 1 });
    await page.locator('input[name="life-situation"]').first().check();
    await page.locator('input[name="profile-fact"]').first().check();
    await page.locator('#profile-query').fill('пособие и отпуск');
    await page.locator('#profile-form button[type="submit"]').click();

    await expect(page.locator('#profile-summary')).toBeVisible();
    await expect(page.locator('#matching-results .matching-card').first()).toBeVisible();
    await expect(page.locator('#matching-results .matching-card').first().locator('.matching-card__reasons')).toContainText('Почему показана');
    await expect(page.locator('#matching-results .matching-card').first().locator('a[href*="measure="]')).toBeVisible();

    const parameters = await page.evaluate(() => [...new URL(location.href).searchParams.keys()]);
    expect(parameters.sort()).toEqual(['region', 'situation']);
  });

  test('межрегиональное сравнение отделяет региональные записи от федерального фона', async ({ page }) => {
    await page.goto('/compare.html');
    await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });

    await page.locator('#compare-region-select').selectOption({ index: 1 });
    await page.locator('#compare-region-select').selectOption({ index: 2 });
    await expect(page.locator('#selected-regions .selected-region-chip')).toHaveCount(2);
    await page.locator('#run-comparison').click();

    await expect(page.locator('#comparison-results')).toBeVisible();
    await expect(page.locator('#regional-metrics .region-metric-card')).toHaveCount(2);
    await expect(page.locator('#category-table thead th')).toHaveCount(3);
    await expect(page.locator('#overlap-grid .overlap-card')).toHaveCount(1);
    const regions = await page.evaluate(() => new URL(location.href).searchParams.getAll('region'));
    expect(regions).toHaveLength(2);
  });

  test('методология раскрывает ограничения, приватность и канал исправлений', async ({ page }) => {
    await page.goto('/methodology.html');
    await expect(page.locator('#data')).toBeVisible();
    await expect(page.locator('#matching')).toBeVisible();
    await expect(page.locator('#comparison')).toBeVisible();
    await expect(page.locator('#privacy')).toContainText(/браузер|устройств/i);
    await expect(page.locator('#corrections a[href*="issues/new"]')).toBeVisible();
  });

  test('новые страницы не создают горизонтального переполнения на мобильном экране', async ({ page }) => {
    for (const path of ['/situations.html', '/compare.html', '/methodology.html']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path}: горизонтальное переполнение`).toBeLessThanOrEqual(1);
    }
  });
});
