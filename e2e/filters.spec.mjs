import { test, expect } from '@playwright/test';
import { jsonFrom, numberFromText, openReady } from './helpers.mjs';

test('поиск из hero и панели фильтров сохраняется в URL и после перезагрузки', async ({ page }) => {
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const withYo = measures.find((item) => /ё/i.test(`${item.title} ${item.summary ?? ''}`)) ?? measures[0];
  const query = (withYo.title.match(/[А-Яа-яЁё]{6,}/)?.[0] ?? withYo.title).replace(/ё/gi, 'е');
  await page.locator('#hero-search').fill(query.toUpperCase());
  await page.locator('#hero-search-form').getByRole('button', { name: 'Найти' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(query.toUpperCase());
  await expect(page.locator('.measure-card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('#search-filter')).toHaveValue(query.toUpperCase());

  await page.locator('#search-filter').fill('запрос-которого-точно-нет-987654');
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#result-count')).toContainText('0 мер');
  await page.locator('#search-filter').fill('');
  await expect(page.locator('.measure-card').first()).toBeVisible();
});

test('диалог региона фильтрует федеральные и региональные меры и доступен с клавиатуры', async ({ page }) => {
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const regional = measures.find((item) => item.level === 'regional' && item.region);
  const expected = measures.filter((item) => item.level === 'federal' || item.region === regional.region).length;
  const opener = page.locator('.panel-heading [data-open-regions]');
  await opener.click();
  await expect(page.locator('#region-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#region-search')).toBeFocused();
  await page.locator('#region-search').fill(regional.region.slice(0, 8));
  await page.locator('#region-list').getByRole('button', { name: regional.region, exact: true }).click();
  expect(numberFromText(await page.locator('#result-count').innerText())).toBe(expected);
  await expect(page.locator('#map-selection-label')).toContainText(regional.region);
  await expect(page.locator('#active-filters')).toContainText(regional.region);
  await expect.poll(() => new URL(page.url()).searchParams.get('region')).toBe(regional.region);

  await opener.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#region-dialog')).not.toHaveAttribute('open', '');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.locator('#region-list').getByRole('button', { name: 'Вся Россия', exact: true }).click();
  await expect(page.locator('#region-filter')).toHaveValue('');
  await expect.poll(() => new URL(page.url()).searchParams.get('region')).toBeNull();
});

test('карта показывает подсказку и выбирает регион мышью и клавиатурой', async ({ page }) => {
  await openReady(page);
  const mapGeometry = await page.locator('#region-map-layer').evaluate((layer) => {
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
  expect(mapGeometry.viewBoxHeight).toBe(600);
  expect(mapGeometry.geometryRatio).toBeGreaterThan(1.8);
  expect(mapGeometry.geometryRatio).toBeLessThan(1.95);
  expect(mapGeometry.geometryFill).toBeGreaterThan(0.85);
  expect(mapGeometry.renderedRatio).toBeCloseTo(11 / 6, 1);

  const measures = await jsonFrom(page, '/data/measures.json');
  const regional = measures.find((item) => item.level === 'regional' && item.region);
  const regionalCount = measures.filter((item) => item.level === 'regional' && item.region === regional.region).length;
  const federalCount = measures.filter((item) => item.level === 'federal').length;
  const path = page.locator(`#region-map-layer [data-region="${regional.region}"]`);
  await expect(path).toHaveCount(1);
  await path.hover({ force: true });
  await expect(page.locator('#map-tooltip')).toContainText(regional.region);
  await expect(page.locator('#map-tooltip')).toContainText(String(regionalCount));
  await path.click({ force: true });
  await expect(page.locator('#region-filter')).toHaveValue(regional.region);
  expect(numberFromText(await page.locator('#result-count').innerText())).toBe(regionalCount + federalCount);
  await expect(page.locator('#map-summary-region')).toHaveText(regional.region);
  await expect(path).toHaveClass(/is-selected/);

  await path.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#region-filter')).toHaveValue('');
});

test('категория, уровень, сочетание фильтров и сброс работают на реальных данных', async ({ page }) => {
  await openReady(page);
  const measures = await jsonFrom(page, '/data/measures.json');
  const category = measures.find((item) => item.level === 'regional')?.category;
  await page.locator('#category-filter').selectOption(category);
  expect(numberFromText(await page.locator('#result-count').innerText())).toBe(measures.filter((item) => item.category === category).length);
  await page.locator('#level-filter').selectOption('regional');
  expect(numberFromText(await page.locator('#result-count').innerText())).toBe(measures.filter((item) => item.category === category && item.level === 'regional').length);
  for (const card of await page.locator('.measure-card').allTextContents()) expect(card).toContain('Региональная мера');
  await page.locator('#level-filter').selectOption('federal');
  for (const card of await page.locator('.measure-card').allTextContents()) expect(card).toContain('Федеральная мера');
  await page.locator('#reset-filters').click();
  await expect(page.locator('#category-filter')).toHaveValue('');
  await expect(page.locator('#level-filter')).toHaveValue('');
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

test('постраничное раскрытие увеличивает каталог и скрывается при пустом результате', async ({ page }) => {
  await openReady(page);
  await expect(page.locator('.measure-card')).toHaveCount(12);
  await page.locator('#load-more').click();
  await expect(page.locator('.measure-card')).toHaveCount(24);
  await page.locator('#search-filter').fill('запрос-которого-точно-нет');
  await expect(page.locator('#load-more')).toBeHidden();
  await expect(page.locator('#empty-state')).toBeVisible();
});
