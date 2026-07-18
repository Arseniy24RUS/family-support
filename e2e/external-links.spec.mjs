import { test, expect } from '@playwright/test';
import { jsonFrom, openReady } from './helpers.mjs';

test('«Подробнее» открывает внутреннюю карточку, а действия ведут только на официальные сервисы', async ({ page }) => {
  await openReady(page);
  await page.locator('#search-filter').fill('Единое пособие на детей и беременных женщин');
  const firstCard = page.locator('.measure-card').first();
  await expect(firstCard.locator('h3')).toHaveText('Единое пособие на детей и беременных женщин');
  const renderedTitle = (await firstCard.locator('h3').innerText()).trim();
  const button = firstCard.locator('button.measure-card__link');
  await expect(button).toHaveText(/Подробнее/);
  await button.click();
  await expect(page.locator('#measure-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#measure-dialog-title')).toHaveText(renderedTitle);
  await expect(page.locator('.measure-detail-section').first()).toBeVisible();
  await expect(page.locator('.measure-detail-actions a').first()).toBeVisible();
  await expect(page.locator('.measure-detail-actions a').first()).toHaveAttribute('href', 'https://www.gosuslugi.ru/10630/1/form');
  await expect(page.locator('.measure-detail-actions a').first().locator('img[src$="logo-gosuslugi.svg"]')).toBeVisible();
  await expect(page.locator('.measure-detail-actions a[href^="https://sfr.gov.ru/"] img[src$="logo-sfr.png"]')).toBeVisible();
  await expect(page.locator('a[href="https://app.sovetmam.ru/"]')).toHaveCount(2);
  const allowedHosts = new Set(['gosuslugi.ru', 'www.gosuslugi.ru', 'sfr.gov.ru', 'nalog.gov.ru', 'www.nalog.gov.ru', 'trudvsem.ru', 'www.trudvsem.ru']);
  for (const href of await page.locator('.measure-detail-actions a').evaluateAll((nodes) => nodes.map((node) => node.href))) {
    expect(allowedHosts.has(new URL(href).hostname), href).toBeTruthy();
  }
});

test('детерминированная выборка внешних карточек доступна по сети', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name.startsWith('mobile'), 'Сетевая выборка проверяется один раз на desktop.');
  test.skip(process.env.CHECK_EXTERNAL_LINKS !== '1', 'Сетевая проверка запускается после обновления данных.');
  await openReady(page);
  const manifest = await jsonFrom(page, '/data/details/manifest.json');
  const shards = await Promise.all(Array.from({ length: manifest.shard_count }, (_, index) =>
    jsonFrom(page, `/data/details/${String(index).padStart(2, '0')}.json`)
  ));
  const links = [...new Map(shards.flatMap((shard) => Object.values(shard))
    .flatMap((detail) => detail.official_links)
    .map((link) => [link.url, link])).values()].slice(0, 5);
  const results = await Promise.all(links.map(async (link) => {
    try {
      const response = await request.get(link.url, { timeout: 60_000, failOnStatusCode: false });
      return { link, status: response.status() };
    } catch (error) {
      return { link, error: String(error?.message ?? error) };
    }
  }));
  const reached = results.filter((result) => Number.isInteger(result.status));
  expect(reached.length, JSON.stringify(results, null, 2)).toBeGreaterThanOrEqual(3);
  for (const result of reached) expect(result.status, result.link.url).toBeLessThan(500);
});
