import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { observePage } from './helpers.mjs';

const MORDOVIA = 'Республика Мордовия';

async function openMatcher(page) {
  const response = await page.goto('/situations.html');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle('Подбор по жизненной ситуации — меры поддержки семей с детьми');
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Подбор мер по жизненной ситуации');
}

async function chooseProfile(page, region, situation) {
  await page.locator('#situation-region').selectOption(region);
  await page.locator(`input[name="life-situation"][value="${situation}"]`).check();
}

function card(page, id, group = '') {
  return page.locator(`${group ? `.matching-group--${group} ` : ''}.matching-card[data-measure-id="${id}"]`);
}

test('Mordovia: an unknown school condition can be confirmed, rejected and reset without stale cards', async ({ page }) => {
  const health = observePage(page);
  await openMatcher(page);
  await chooseProfile(page, MORDOVIA, 'education');
  await page.locator('#profile-fact-three-plus-children').selectOption('yes');
  await page.locator('#profile-form button[type="submit"]').click();

  const id = 'sovetmam:mord-016';
  await expect(card(page, id, 'check')).toHaveCount(1);
  await expect(page.locator('#clarification-school-child')).toHaveValue('unknown');
  await page.locator('#clarification-school-child').selectOption('yes');
  await expect(card(page, id, 'high')).toHaveCount(1);
  await expect(card(page, id, 'check')).toHaveCount(0);

  await page.locator('#profile-fact-three-plus-children').selectOption('no');
  await expect(card(page, id)).toHaveCount(0);
  await page.locator('#profile-fact-three-plus-children').selectOption('unknown');
  await expect(card(page, id, 'check')).toHaveCount(1);
  await expect(page.locator('#clarification-three-plus-children')).toHaveValue('unknown');
  await page.locator('#clarification-three-plus-children').selectOption('yes');
  await expect(page.locator('#profile-fact-three-plus-children')).toHaveValue('yes');
  await expect(card(page, id, 'high')).toHaveCount(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator('#profile-form button[type="reset"]').click();
  await expect(page.locator('#matching-results .matching-card')).toHaveCount(0);
  await expect(page.locator('#matching-clarifications')).toBeHidden();
  await expect(page.locator('#profile-summary')).toBeHidden();
  await expect(page.locator('#profile-fact-three-plus-children')).toHaveValue('unknown');
  expect(new URL(page.url()).search).toBe('');
  expect(health.pageErrors).toEqual([]);
  expect(health.consoleErrors).toEqual([]);
});

test('territorial federal programmes react to region and Arctic municipality changes', async ({ page }) => {
  const health = observePage(page);
  await openMatcher(page);
  await chooseProfile(page, MORDOVIA, 'housing');
  await page.locator('#profile-fact-housing-need').selectOption('yes');
  await page.locator('#profile-form button[type="submit"]').click();

  const id = 'sovetmam:dalnevostochnaya-arkticheskaya-ipoteka';
  await expect(card(page, id)).toHaveCount(0);
  await page.locator('#situation-target-region').selectOption('Приморский край');
  await expect(card(page, id)).toHaveCount(1);
  await expect(page.locator('#situation-region')).toHaveValue(MORDOVIA);
  expect([...new URL(page.url()).searchParams.keys()].sort()).toEqual(['region', 'situation']);
  await page.locator('#situation-target-region').selectOption('');
  await expect(card(page, id)).toHaveCount(0);
  await page.locator('#situation-region').selectOption('Приморский край');
  await expect(card(page, id)).toHaveCount(1);
  await page.locator('#situation-region').selectOption('Республика Карелия');
  await expect(card(page, id, 'check')).toHaveCount(1);
  await expect(page.locator('#clarification-territory-arctic-municipality')).toHaveValue('unknown');
  await page.locator('#clarification-territory-arctic-municipality').selectOption('no');
  await expect(card(page, id)).toHaveCount(0);
  await page.locator('#clarification-territory-arctic-municipality').selectOption('yes');
  await expect(card(page, id)).toHaveCount(1);
  await page.locator('#situation-region').selectOption('Москва');
  await expect(card(page, id)).toHaveCount(0);
  expect(health.pageErrors).toEqual([]);
  expect(health.consoleErrors).toEqual([]);
});

test('all 85 matching cards are rendered and exported, including explicit negative answers', async ({ page }) => {
  const examples = Array.from({ length: 85 }, (_, index) => ({
    id: `regression-birth-${index + 1}`,
    title: `Единовременное пособие при рождении ребёнка — программа ${String(index + 1).padStart(3, '0')}`,
    summary: 'Разовая выплата одному из родителей.',
    category: 'Выплаты и пособия',
    level: 'federal',
    region: null,
    source: 'demo'
  }));
  await page.route('**/data/measures.json', (route) => route.fulfill({ json: examples }));
  await openMatcher(page);
  await chooseProfile(page, MORDOVIA, 'birth');
  await page.locator('#profile-fact-child-disabled').selectOption('no');
  const negativeLabel = await page.locator('#profile-fact-child-disabled-label').innerText();
  await page.locator('#profile-form button[type="submit"]').click();

  await expect(page.locator('#matching-results .matching-card')).toHaveCount(85);
  await expect(page.locator('#matching-count')).toContainText('Показано: 85');
  await expect(card(page, 'regression-birth-85')).toHaveCount(1);
  const downloaded = page.waitForEvent('download');
  await page.locator('#download-plan').click();
  const download = await downloaded;
  const exported = await readFile(await download.path(), 'utf8');
  expect(exported.match(/^\d+\. /gm)).toHaveLength(85);
  for (const example of examples) expect(exported).toContain(example.title);
  expect(exported).toContain(`${negativeLabel}: Нет`);
});

test('answers and free text stay out of links, network requests and browser storage', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(`${request.url()} ${request.postData() || ''}`));
  await openMatcher(page);
  await chooseProfile(page, MORDOVIA, 'birth');
  await page.locator('#profile-fact-child-disabled').selectOption('no');
  const privateText = 'семейный_секрет_5242';
  await page.locator('#profile-query').fill(privateText);
  await page.locator('#profile-form button[type="submit"]').click();
  await expect(page.locator('#profile-summary')).toContainText(privateText);

  expect([...new URL(page.url()).searchParams.keys()].sort()).toEqual(['region', 'situation']);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(privateText);
  expect(storage).not.toContain('child-disabled');
  expect(requests.join('\n')).not.toContain(privateText);
  expect(requests.join('\n')).not.toContain(encodeURIComponent(privateText));

  await page.reload();
  await expect(page.locator('#data-status')).not.toContainText('Загрузка', { timeout: 20_000 });
  await expect(page.locator('#situation-region')).toHaveValue(MORDOVIA);
  await expect(page.locator('#profile-fact-child-disabled')).toHaveValue('unknown');
  await expect(page.locator('#profile-query')).toHaveValue('');
});
