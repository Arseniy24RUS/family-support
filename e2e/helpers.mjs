import { expect } from '@playwright/test';

export function observePage(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(), error: request.failure()?.errorText ?? 'unknown'
  }));
  return { consoleErrors, pageErrors, failedRequests };
}

export async function openReady(page, path = '/') {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#stat-total')).not.toHaveText('—');
  await expect(page.locator('.measure-card').first()).toBeVisible();
  return response;
}

export async function jsonFrom(page, path) {
  const response = await page.request.get(path);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export function numberFromText(value) {
  return Number.parseInt(String(value).replace(/\D/g, ''), 10);
}
