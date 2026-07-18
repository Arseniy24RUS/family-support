import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseCatalogCard, parseCatalogPayloadMeasure } from '../lib/parse-card.mjs';
import { parseMeasureDetailsHtml } from '../lib/details.mjs';

const DEFAULT_URL = 'https://app.sovetmam.ru/catalog';
const CARD_LINK_SELECTOR = 'a[href*="/catalog/"]';

async function countCardLinks(page) {
  return page.locator(CARD_LINK_SELECTOR).evaluateAll((anchors) => {
    const urls = anchors
      .map((anchor) => anchor.href)
      .filter((href) => /\/catalog\/[^/?#]+\/?(?:[?#].*)?$/.test(href));
    return new Set(urls).size;
  });
}

async function visibleLoadMore(page) {
  const selectors = [
    'button:has-text("Показать ещё")',
    '[role="button"]:has-text("Показать ещё")',
    'text=/^Показать ещё/'
  ];

  for (const selector of selectors) {
    const candidates = page.locator(selector);
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  return null;
}

async function saveDebug(page, debugDir, error) {
  await mkdir(debugDir, { recursive: true });
  await Promise.allSettled([
    page.screenshot({ path: `${debugDir}/sovetmam-failure.png`, fullPage: true }),
    page.content().then((html) => writeFile(`${debugDir}/sovetmam-failure.html`, html, 'utf8')),
    writeFile(`${debugDir}/sovetmam-error.txt`, `${error?.stack ?? error}\n`, 'utf8')
  ]);
}

function booleanEnvironment(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function launchOptions() {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const proxyServer = process.env.PLAYWRIGHT_PROXY || process.env.HTTPS_PROXY;
  return {
    headless: process.env.HEADLESS !== '0',
    executablePath: executablePath ? resolve(executablePath) : undefined,
    proxy: proxyServer ? { server: proxyServer } : undefined,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu']
  };
}

async function extractEmbeddedCatalog(page) {
  return page.evaluate(() => {
    for (const script of document.scripts) {
      const text = script.textContent || '';
      if (!text.includes('self.__next_f.push') || !text.includes('measures')) continue;
      try {
        const callStart = text.indexOf('push(') + 5;
        const outer = JSON.parse(text.slice(callStart, text.lastIndexOf(')')));
        const flightRow = outer?.[1];
        if (typeof flightRow !== 'string') continue;
        const colon = flightRow.indexOf(':');
        const payload = JSON.parse(flightRow.slice(colon + 1));
        const candidate = payload?.[3];
        if (Array.isArray(candidate?.measures)) return candidate;
      } catch {
        // Следующий script может содержать нужный Flight payload.
      }
    }
    return null;
  });
}

async function collectDomCards(page, reportedCount) {
  let currentCount = await countCardLinks(page);
  let stagnantRounds = 0;
  const maximumRounds = Math.max(300, Math.ceil((reportedCount || 3000) / 10) + 30);

  for (let round = 0; round < maximumRounds; round += 1) {
    if (reportedCount > 0 && currentCount >= reportedCount) break;
    const loadMore = await visibleLoadMore(page);
    if (!loadMore) break;
    const before = currentCount;
    await loadMore.scrollIntoViewIfNeeded().catch(() => {});
    await loadMore.click({ force: true });
    const deadline = Date.now() + 12_000;
    do {
      await page.waitForTimeout(100);
      currentCount = await countCardLinks(page);
      if (currentCount > before) break;
    } while (Date.now() < deadline);
    stagnantRounds = currentCount <= before ? stagnantRounds + 1 : 0;
    if (stagnantRounds >= 3) break;
  }

  return page.locator(CARD_LINK_SELECTOR).evaluateAll((anchors) => {
    const seen = new Set();
    return anchors.flatMap((anchor) => {
      const href = anchor.href;
      if (!/\/catalog\/[^/?#]+\/?(?:[?#].*)?$/.test(href) || seen.has(href)) return [];
      seen.add(href);
      return [{
        href,
        text: anchor.innerText,
        heading: anchor.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '',
        paragraphs: [...anchor.querySelectorAll('p')].map((node) => node.textContent ?? '')
      }];
    });
  });
}

async function collectMeasureDetails(request, measures, timeout) {
  const concurrency = Math.max(1, Math.min(24, Number(process.env.DETAIL_CONCURRENCY ?? 12)));
  const details = new Array(measures.length);
  const errors = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < measures.length) {
      const index = cursor;
      cursor += 1;
      const measure = measures[index];
      let lastError;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await request.get(measure.source_url, {
            timeout: Math.max(30_000, timeout),
            failOnStatusCode: false,
            headers: { accept: 'text/html,application/xhtml+xml' }
          });
          if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
          const html = await response.text();
          const parsed = parseMeasureDetailsHtml(html, measure);
          if (!parsed.steps.length) throw new Error('не найден раздел «Как оформить»');
          details[index] = { id: measure.id, ...parsed };
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 350));
        }
      }

      if (lastError) {
        errors.push({
          id: measure.id,
          url: measure.source_url,
          message: String(lastError?.message ?? lastError)
        });
      }

      completed += 1;
      if (completed % 100 === 0 || completed === measures.length) {
        console.log(`Подробные карточки: ${completed}/${measures.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { details: details.filter(Boolean), errors };
}

export async function scrapeSovetmam(options = {}) {
  const url = options.url ?? process.env.SOVETMAM_URL ?? DEFAULT_URL;
  const debugDir = options.debugDir ?? 'debug';
  const fetchedAt = new Date().toISOString();
  const browser = await chromium.launch(launchOptions());

  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: booleanEnvironment('PLAYWRIGHT_IGNORE_HTTPS_ERRORS')
  });
  const traceEnabled = booleanEnvironment('TRACE') || booleanEnvironment('DEBUG');
  if (traceEnabled) {
    await mkdir(debugDir, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  const page = await context.newPage();
  const parserTimeout = Number(process.env.PARSER_TIMEOUT_MS ?? 20_000);
  page.setDefaultTimeout(parserTimeout);

  const diagnostics = { console: [], pageErrors: [], failedRequests: [] };
  page.on('console', (message) => diagnostics.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => diagnostics.pageErrors.push(String(error?.stack ?? error)));
  page.on('requestfailed', (request) => {
    if (!['image', 'media', 'font'].includes(request.resourceType())) {
      diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' });
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(60_000, parserTimeout) });
    if (!response?.ok()) throw new Error(`Каталог вернул HTTP ${response?.status() ?? 'без ответа'}.`);
    await page.locator('h1').filter({ hasText: /Каталог мер поддержки/i }).waitFor();

    const pageText = await page.locator('body').innerText();
    const reportedCount = Number.parseInt(
      pageText.match(/Найдено:\s*([\d\s]+)\s*мер/i)?.[1]?.replace(/\s/g, '') ?? '0',
      10
    );

    const parseErrors = [];
    const measures = [];
    const embedded = await extractEmbeddedCatalog(page);
    let extractionMode = 'embedded-flight-payload';
    let loadedLinkCount = 0;

    if (embedded?.measures?.length) {
      if (!Array.isArray(embedded.categories) || !Array.isArray(embedded.regions)) {
        throw new Error('Встроенный каталог не содержит валидных списков категорий и регионов.');
      }
      for (const raw of embedded.measures) {
        try {
          measures.push(parseCatalogPayloadMeasure(raw, url, fetchedAt));
        } catch (error) {
          parseErrors.push({ slug: raw?.slug ?? null, message: String(error?.message ?? error) });
        }
      }
      loadedLinkCount = new Set(measures.map((item) => item.source_url)).size;
      const domLinks = await page.locator(CARD_LINK_SELECTOR).evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
      const payloadLinks = new Set(measures.map((item) => item.source_url));
      if (!domLinks.length || domLinks.some((href) => !payloadLinks.has(href))) {
        throw new Error('Встроенный каталог не согласуется с карточками, показанными в DOM.');
      }
    } else {
      extractionMode = 'dom-load-more-fallback';
      const rawCards = await collectDomCards(page, reportedCount);
      loadedLinkCount = rawCards.length;
      for (const raw of rawCards) {
        try {
          measures.push(parseCatalogCard(raw, fetchedAt));
        } catch (error) {
          parseErrors.push({ href: raw.href, message: String(error?.message ?? error) });
        }
      }
    }

    measures.sort((a, b) =>
      (a.region ?? '').localeCompare(b.region ?? '', 'ru') ||
      a.category.localeCompare(b.category, 'ru') ||
      a.title.localeCompare(b.title, 'ru')
    );

    diagnostics.extractionMode = extractionMode;
    diagnostics.reportedCount = reportedCount;
    diagnostics.loadedLinkCount = loadedLinkCount;
    diagnostics.parsedCount = measures.length;

    const detailResult = await collectMeasureDetails(context.request, measures, parserTimeout);
    diagnostics.detailCount = detailResult.details.length;
    diagnostics.detailErrors = detailResult.errors;
    await mkdir(debugDir, { recursive: true });
    await writeFile(`${debugDir}/sovetmam-diagnostics.json`, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
    if (traceEnabled) await page.screenshot({ path: `${debugDir}/sovetmam-success.png`, fullPage: true });

    return {
      source: 'sovetmam',
      sourceUrl: url,
      fetchedAt,
      reportedCount,
      loadedLinkCount,
      extractionMode,
      parseErrors,
      measures,
      details: detailResult.details,
      detailErrors: detailResult.errors
    };
  } catch (error) {
    await saveDebug(page, debugDir, error);
    throw error;
  } finally {
    if (traceEnabled) {
      await context.tracing.stop({ path: `${debugDir}/trace.zip` }).catch(() => {});
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
