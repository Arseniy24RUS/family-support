import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { openReady } from './helpers.mjs';

test('desktop и mobile не имеют горизонтального overflow и сохраняют ключевую компоновку', async ({ page }, testInfo) => {
  await openReady(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.filter-bar')).toBeVisible();
  await expect(page.locator('.map-panel')).toBeVisible();
  await expect(page.locator('.catalog')).toBeVisible();
  await expect(page.locator('.site-footer')).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  const name = testInfo.project.name.startsWith('mobile') ? 'frontend-mobile.png' : 'frontend-desktop.png';
  await page.screenshot({ path: `artifacts/${name}`, fullPage: true });
});

test('диалог региона помещается в viewport и сохраняется как визуальный артефакт', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Отдельный эталон диалога сохраняется на desktop.');
  await openReady(page);
  await page.locator('.panel-heading [data-open-regions]').click();
  const box = await page.locator('#region-dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1672);
  expect(box.y + box.height).toBeLessThanOrEqual(941);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/region-dialog.png', fullPage: true });
});

test('подробная карточка меры помещается в viewport и сохраняется как визуальный артефакт', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Отдельный эталон подробной карточки сохраняется на desktop.');
  await openReady(page);
  await page.locator('.measure-card__link').first().click();
  await expect(page.locator('.measure-detail-section').first()).toBeVisible();
  const box = await page.locator('#measure-dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1672);
  expect(box.y + box.height).toBeLessThanOrEqual(941);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/measure-dialog.png', fullPage: true });
});
