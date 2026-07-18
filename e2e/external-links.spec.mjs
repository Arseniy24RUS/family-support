import { test, expect } from '@playwright/test';
import { jsonFrom, openReady } from './helpers.mjs';

test('ссылки карточек безопасны и совпадают с source_url', async ({ page }) => {
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const firstCard = page.locator('.measure-card').first();
  const renderedTitle = await firstCard.locator('h3').innerText();
  const rendered = measures.find((item) => item.title === renderedTitle);
  expect(rendered).toBeTruthy();
  const link = firstCard.locator('a.measure-card__link');
  await expect(link).toHaveAttribute('href', rendered.source_url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  expect(rendered.source_url).toMatch(/^https:\/\/app\.sovetmam\.ru\/catalog\//);
});

test('детерминированная выборка внешних карточек доступна по сети', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Сетевая выборка проверяется один раз на desktop.');
  test.skip(process.env.CHECK_EXTERNAL_LINKS !== '1', 'Сетевая проверка запускается после обновления данных.');
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const sample = [
    measures.find((item) => item.level === 'federal'),
    measures.find((item) => item.level === 'regional'),
    measures.find((item) => item.level === 'regional' && item.category === 'Образование')
  ].filter(Boolean);
  for (const measure of sample) {
    const response = await request.get(measure.source_url, { timeout: 45_000, failOnStatusCode: false });
    expect(response.status(), measure.source_url).toBeLessThan(400);
  }
});
