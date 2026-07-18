import { test, expect } from '@playwright/test';
import { openReady } from './helpers.mjs';

test('skip-link, фокус, диалог и базовая семантика доступны с клавиатуры', async ({ page }) => {
  await openReady(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  const headingLevels = await page.locator('h1,h2,h3,h4,h5,h6').evaluateAll((nodes) => nodes.map((node) => Number(node.tagName[1])));
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index] - headingLevels[index - 1]).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('#region-dialog')).toHaveAttribute('aria-labelledby', 'region-dialog-title');
  await expect(page.locator('#measure-dialog')).toHaveAttribute('aria-labelledby', 'measure-dialog-title');
  for (const control of ['#region-filter', '#category-filter', '#level-filter', '#search-filter']) {
    await expect(page.locator(control)).toHaveAccessibleName(/.+/);
  }
  for (const opener of await page.locator('[data-open-regions]').all()) {
    await expect(opener).toHaveAccessibleName(/.+/);
  }
  await expect(page.locator('#region-map')).toHaveAccessibleName(/.+/);
  await expect(page.locator('#region-map-layer .region-map__region')).toHaveCount(89);
  await expect(page.locator('#region-map-layer .region-map__region').first()).toHaveAttribute('tabindex', '0');
  await page.locator('.measure-card__link').first().click();
  await expect(page.locator('#measure-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('[data-close-measure]')).toHaveAccessibleName(/.+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#measure-dialog')).not.toHaveAttribute('open', '');
  expect(await page.locator('button:not([type])').count()).toBe(0);
});
