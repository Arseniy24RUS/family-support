import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const repositoryRoot = process.cwd();
const provenancePath = path.join(repositoryRoot, 'site/data/family-documents-provenance.json');
const manifestPath = path.join(repositoryRoot, 'site/data/family-documents-additions.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const provenance = existsSync(provenancePath)
  ? JSON.parse(readFileSync(provenancePath, 'utf8'))
  : null;
const verifiedIds = new Set((provenance?.records ?? []).map((record) => record.id));
const documents = manifest.documents.filter((item) => verifiedIds.has(item.id));
const fulltextReady = documents.length > 0;

test.describe('полнотекстовые документы семейной политики', () => {
  test.skip(!fulltextReady, 'Корпус появляется после первого успешного запуска sync-family-documents.yml.');

  test('весь выбранный scope интегрирован, доступен по URL и имеет корректную сигнатуру', async ({ request }) => {
    expect(documents).toHaveLength(manifest.expected_scope_counts[provenance.scope]);
    if (provenance.scope === 'extended') expect(documents).toHaveLength(22);
    const corpusResponse = await request.get('/data/strategies.json');
    expect(corpusResponse.ok()).toBeTruthy();
    const corpus = await corpusResponse.json();
    const byId = new Map(corpus.documents.map((document) => [document.id, document]));

    for (const item of documents) {
      const integrated = byId.get(item.id);
      expect(integrated, item.id).toBeTruthy();
      expect(integrated.availability, item.id).toBe('available');
      expect(integrated.download_url, item.id).toBeTruthy();
      const response = await request.get(integrated.download_url.replace(/^\.\//u, '/'));
      expect(response.status(), item.id).toBe(200);
      const body = await response.body();
      if (item.format === 'pdf') {
        expect(body.subarray(0, 5).toString('ascii'), item.id).toBe('%PDF-');
      } else {
        expect([...body.subarray(0, 2)], item.id).toEqual([0x50, 0x4b]);
      }
    }
  });

  test('каждая новая карточка находится через поиск и открывает карточку просмотрщика', async ({ page }) => {
    await page.goto('/documents.html');
    for (const item of documents) {
      const scope = item.scope === 'federal' ? 'federal' : 'territorial';
      await page.locator(`[data-document-scope="${scope}"]`).click();
      await page.locator('#strategy-search-input').fill(item.id);
      const card = page.locator(`[data-document-id="${item.id}"]`);
      await expect(card, item.id).toBeVisible();
      await card.click();
      await expect(page.locator('#strategy-viewer-document-title'), item.id).toHaveText(item.title);
      await page.locator('#close-strategy-viewer').click();
    }
  });

  test('региональный фильтр показывает нормативные документы выбранного субъекта', async ({ page }) => {
    await page.goto('/documents.html');
    await page.locator('#documents-region-checklist input[value="Москва"]').check();
    await page.locator('#strategy-search-input').fill('regional-moscow-family-support-law-60');
    await expect(page.locator('[data-document-id="regional-moscow-family-support-law-60"]')).toBeVisible();
    await expect(page.locator('[data-document-id="regional-spb-social-code-728-132"]')).toHaveCount(0);
  });

  test('PDF и DOCX открываются во встроенном просмотрщике', async ({ page }) => {
    const pdf = documents.find((item) => item.format === 'pdf' && item.scope === 'federal');
    const docx = documents.find((item) => item.format === 'docx');
    expect(pdf).toBeTruthy();
    expect(docx).toBeTruthy();

    await page.goto(`/documents.html?scope=federal&doc=${encodeURIComponent(pdf.id)}#document-library`);
    await page.locator('#load-strategy-pdf').click();
    await expect(page.locator('#strategy-pdf-frame')).toBeVisible();
    await expect(page.locator('#strategy-pdf-frame')).toHaveAttribute('src', new RegExp(pdf.target_path.split('/').at(-1).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));

    await page.goto(`/documents.html?scope=federal&doc=${encodeURIComponent(docx.id)}#document-library`);
    await expect(page.locator('#load-strategy-docx')).toBeVisible();
    await page.locator('#load-strategy-docx').click();
    await expect(page.locator('#strategy-docx-viewer .docx-wrapper')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#strategy-docx-viewer section.docx').first()).toBeVisible();
  });

  test('desktop и mobile не имеют горизонтального переполнения', async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/documents.html?scope=federal&q=federal-family-code-223-fz');
      await expect(page.locator('[data-document-id="federal-family-code-223-fz"]')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    }
  });
});
