#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  actIdentity,
  inspectDocument,
  legalTitleIdentity,
  normalizeLegalText,
  requiredPhraseErrors,
  rowsToCsv,
  validateManifest
} from './lib/family-documents.mjs';

const SCRIPT_VERSION = '2.0.0';
const DEFAULT_MANIFEST = 'site/data/family-documents-additions.json';
const DEFAULT_REPORT_DIR = 'build/family-documents';
const PROVENANCE_PATH = 'site/data/family-documents-provenance.json';

function parseArgs(argv) {
  const args = {
    repoRoot: process.cwd(),
    manifest: DEFAULT_MANIFEST,
    scope: 'extended',
    reportDir: DEFAULT_REPORT_DIR,
    force: false,
    dryRun: false,
    headful: false,
    only: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo-root') args.repoRoot = argv[++index];
    else if (token === '--manifest') args.manifest = argv[++index];
    else if (token === '--scope') args.scope = argv[++index];
    else if (token === '--report-dir') args.reportDir = argv[++index];
    else if (token === '--force') args.force = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--headful') args.headful = true;
    else if (token === '--only') args.only = new Set(String(argv[++index] ?? '').split(',').filter(Boolean));
    else if (token === '--help' || token === '-h') {
      console.log('node scripts/sync-family-documents.mjs [--scope primary|extended] [--force] [--dry-run] [--only id,id]');
      process.exit(0);
    } else throw new Error(`Неизвестный параметр: ${token}`);
  }
  return args;
}

function absolute(root, value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function relativeUrl(targetPath) {
  const sitePrefix = `site${path.sep}`;
  const relative = targetPath.startsWith(sitePrefix) ? targetPath.slice(sitePrefix.length) : targetPath;
  return `./${relative.replaceAll(path.sep, '/')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function blockedMarker(text) {
  const value = normalizeLegalText(text);
  const markers = [
    'access denied',
    'captcha',
    'cloudflare',
    'проверка браузера',
    'подтвердите что вы не робот',
    'доступ к документу ограничен',
    'необходимо авторизоваться',
    'слишком много запросов',
    'service unavailable',
    'страница не найдена',
    'ошибка 404',
    'ошибка 500'
  ];
  return markers.find((marker) => value.includes(normalizeLegalText(marker))) ?? null;
}

async function loadPreviousProvenance(repoRoot) {
  const filePath = path.join(repoRoot, PROVENANCE_PATH);
  if (!existsSync(filePath)) return new Map();
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8'));
    return new Map((payload.records ?? []).map((record) => [record.id, record]));
  } catch {
    return new Map();
  }
}

async function clickConsent(page) {
  for (const pattern of [/^принять$/iu, /^согласен$/iu, /принять все/iu, /разрешить все/iu, /^ok$/iu]) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.count()) await button.click({ timeout: 1500 }).catch(() => {});
  }
}

async function expandDocument(context, page) {
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) details.open = true;
  }).catch(() => {});
  const patterns = [
    /открыть полный текст документа/iu,
    /полный текст документа/iu,
    /показать полностью/iu,
    /развернуть документ/iu,
    /читать полностью/iu,
    /показать ещё/iu,
    /показать все/iu
  ];
  let activePage = page;
  for (const pattern of patterns) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = activePage.getByText(pattern, { exact: false }).first();
      if (!(await candidate.count())) break;
      const popupPromise = context.waitForEvent('page', { timeout: 2500 }).catch(() => null);
      const clicked = await candidate.click({ timeout: 2500 }).then(() => true).catch(() => false);
      if (!clicked) break;
      const popup = await popupPromise;
      if (popup) {
        activePage = popup;
        await activePage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      }
      await activePage.waitForTimeout(800);
    }
  }
  return activePage;
}

async function extractDocumentHtml(page) {
  return page.evaluate(() => {
    const selectors = [
      'main',
      'article',
      '[itemprop="articleBody"]',
      '[role="main"]',
      '#document',
      '#content',
      '.document',
      '.document-content',
      '.document__content',
      '.doc-content',
      '.b-document',
      '.document-page',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.content-text',
      '.content__text',
      '.content'
    ];
    const nodes = [document.body];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) nodes.push(node);
    }
    let best = document.body;
    let bestText = '';
    for (const node of [...new Set(nodes)].filter(Boolean)) {
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length > bestText.length) {
        best = node;
        bestText = text;
      }
    }
    const clone = best.cloneNode(true);
    for (const selector of [
      'script',
      'style',
      'noscript',
      'iframe',
      'canvas',
      'video',
      'audio',
      'form',
      'nav',
      'header',
      'footer',
      'aside',
      '[role="navigation"]',
      '[role="banner"]',
      '[class*="cookie"]',
      '[id*="cookie"]',
      '[class*="advert"]',
      '[id*="advert"]',
      '[class*="banner"]',
      '[class*="sidebar"]',
      '[class*="toolbar"]',
      '[class*="share"]',
      '[class*="social"]',
      '[class*="menu"]'
    ]) {
      for (const node of clone.querySelectorAll(selector)) node.remove();
    }
    for (const node of clone.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        if (/^on/iu.test(attribute.name) || ['style', 'contenteditable'].includes(attribute.name)) {
          node.removeAttribute(attribute.name);
        }
      }
    }
    return {
      pageTitle: document.title,
      html: clone.innerHTML,
      text: (clone.innerText || bestText).replace(/\u00a0/g, ' ').trim()
    };
  });
}

function printableHtml(item, source, finalUrl, retrievedAt, extracted) {
  const cover = `
    <section class="archive-cover">
      <div class="archive-kicker">Полнотекстовая архивно-справочная копия</div>
      <h1>${escapeHtml(item.title)}</h1>
      <dl>
        <dt>Реквизиты</dt><dd>${escapeHtml(item.act)}</dd>
        <dt>Редакция</dt><dd>${escapeHtml(item.revision)}</dd>
        <dt>Территория</dt><dd>${escapeHtml(item.territory)}</dd>
        <dt>Источник</dt><dd>${escapeHtml(source.publisher)} — ${escapeHtml(finalUrl)}</dd>
        <dt>Получено</dt><dd>${escapeHtml(retrievedAt)}</dd>
        <dt>Идентификатор</dt><dd><code>${escapeHtml(item.id)}</code></dd>
      </dl>
      <p class="archive-warning">Копия предназначена для исследовательского и справочного использования. Юридически значимый статус и последующие изменения следует сверять с официальным источником.</p>
    </section>`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(item.title)}</title>
<style>
@page { size: A4; margin: 18mm 16mm 18mm 20mm; }
* { box-sizing: border-box; }
html { font-family: "DejaVu Serif", "Liberation Serif", serif; color: #111; font-size: 10.5pt; line-height: 1.42; }
body { margin: 0; }
.archive-cover { min-height: 245mm; page-break-after: always; padding-top: 12mm; }
.archive-kicker { font-family: sans-serif; text-transform: uppercase; letter-spacing: .08em; font-size: 8.5pt; color: #444; margin-bottom: 16mm; }
h1 { font-size: 18pt; line-height: 1.25; margin: 0 0 14mm; }
dl { display: grid; grid-template-columns: 42mm 1fr; gap: 3.5mm 6mm; }
dt { font-family: sans-serif; font-weight: 700; }
dd { margin: 0; overflow-wrap: anywhere; }
.archive-warning { margin-top: 16mm; padding: 5mm; border: 1px solid #777; font-family: sans-serif; font-size: 9pt; }
.archive-document h1, .archive-document h2, .archive-document h3 { page-break-after: avoid; }
.archive-document p { margin: 0 0 3mm; text-align: justify; }
.archive-document table { border-collapse: collapse; width: 100%; margin: 4mm 0; font-size: 9pt; }
.archive-document tr { page-break-inside: avoid; }
.archive-document th, .archive-document td { border: .35pt solid #666; padding: 1.8mm; vertical-align: top; }
.archive-document img { max-width: 100%; height: auto; }
.archive-document a { color: inherit; text-decoration: none; }
</style></head><body>${cover}<main class="archive-document">${extracted.html}</main></body></html>`;
}

async function renderHtmlSource(context, item, source, targetPath) {
  if (item.format !== 'pdf') throw new Error('HTML-источник нельзя сохранить как DOCX');
  let page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.4' });
  const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const httpStatus = response?.status() ?? 0;
  if (httpStatus < 200 || httpStatus >= 300) throw new Error(`HTTP ${httpStatus || 'не определён'}`);
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await clickConsent(page);
  page = await expandDocument(context, page);
  await page.waitForTimeout(800);

  const bodyText = await page.locator('body').innerText({ timeout: 15000 }).catch(() => '');
  const marker = blockedMarker(bodyText);
  if (marker) throw new Error(`страница заблокирована или ошибочна: ${marker}`);
  const extracted = await extractDocumentHtml(page);
  const textChars = extracted.text.replace(/\s+/gu, ' ').trim().length;
  if (textChars < Number(item.min_text_chars ?? 1000)) {
    throw new Error(`недостаточный объём текста: ${textChars}`);
  }
  const phraseErrors = requiredPhraseErrors(extracted.text, item);
  if (phraseErrors.length) throw new Error(phraseErrors.join('; '));

  const retrievedAt = new Date().toISOString();
  const finalUrl = page.url();
  const printPage = await context.newPage();
  await printPage.setContent(printableHtml(item, source, finalUrl, retrievedAt, extracted), {
    waitUntil: 'load',
    timeout: 60000
  });
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.part`;
  await rm(temporary, { force: true });
  await printPage.pdf({
    path: temporary,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:8px;color:#555;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${escapeHtml(item.id)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '8mm', bottom: '12mm', left: '0mm', right: '0mm' }
  });
  await printPage.close();
  await page.close();
  const inspection = await inspectDocument(temporary, item);
  if (!inspection.ok) {
    await rm(temporary, { force: true });
    throw new Error(inspection.errors.join('; '));
  }
  await rename(temporary, targetPath);
  return {
    source_url: source.url,
    final_url: finalUrl,
    source_publisher: source.publisher,
    source_class: source.source_class,
    source_is_official: Boolean(source.official),
    source_http_status: httpStatus,
    content_type: response?.headers()['content-type'] ?? 'text/html',
    method: 'rendered_fulltext_pdf',
    retrieved_at: retrievedAt,
    ...inspection,
    text_preview: extracted.text.replace(/\s+/gu, ' ').trim().slice(0, 1800)
  };
}

function extractPdfRange(downloadPath, outputPath, pageRange) {
  const [first, last] = pageRange.map(Number);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) {
    throw new Error(`некорректный диапазон страниц: ${JSON.stringify(pageRange)}`);
  }
  const prefix = `${downloadPath}.page`;
  const pattern = `${prefix}-%d.pdf`;
  const split = spawnSync('pdfseparate', ['-f', String(first), '-l', String(last), downloadPath, pattern], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (split.error || split.status !== 0) {
    throw new Error(split.error?.message || split.stderr?.trim() || 'pdfseparate завершился с ошибкой');
  }
  const pages = [];
  for (let number = first; number <= last; number += 1) pages.push(`${prefix}-${number}.pdf`);
  const unite = spawnSync('pdfunite', [...pages, outputPath], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  for (const pagePath of pages) rm(pagePath, { force: true }).catch(() => {});
  if (unite.error || unite.status !== 0) {
    throw new Error(unite.error?.message || unite.stderr?.trim() || 'pdfunite завершился с ошибкой');
  }
}

async function downloadBinarySource(request, item, source, targetPath) {
  const response = await request.get(source.url, {
    timeout: 120000,
    maxRedirects: 10,
    failOnStatusCode: false
  });
  const httpStatus = response.status();
  if (httpStatus < 200 || httpStatus >= 300) throw new Error(`HTTP ${httpStatus}`);
  const body = await response.body();
  const contentType = response.headers()['content-type'] ?? '';
  if (/text\/html|application\/xhtml/iu.test(contentType)) {
    throw new Error(`источник вернул HTML (${contentType})`);
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  const downloaded = `${targetPath}.download.part`;
  const temporary = `${targetPath}.part`;
  await rm(downloaded, { force: true });
  await rm(temporary, { force: true });
  await writeFile(downloaded, body);
  try {
    if (Array.isArray(source.page_range)) {
      extractPdfRange(downloaded, temporary, source.page_range);
    } else {
      await rename(downloaded, temporary);
    }
    const inspection = await inspectDocument(temporary, item);
    if (!inspection.ok) throw new Error(inspection.errors.join('; '));
    await rename(temporary, targetPath);
    return {
      source_url: source.url,
      final_url: response.url(),
      source_publisher: source.publisher,
      source_class: source.source_class,
      source_is_official: Boolean(source.official),
      source_http_status: httpStatus,
      content_type: contentType,
      method: Array.isArray(source.page_range) ? 'official_pdf_page_extract' : 'direct_binary',
      retrieved_at: new Date().toISOString(),
      ...inspection,
      text_preview: inspection.text.replace(/\s+/gu, ' ').trim().slice(0, 1800)
    };
  } finally {
    await rm(downloaded, { force: true }).catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function fetchItem({ context, request, item, repoRoot, force, previous }) {
  const targetPath = absolute(repoRoot, item.target_path);
  if (!force && existsSync(targetPath)) {
    const inspection = await inspectDocument(targetPath, item);
    const previousRecord = previous.get(item.id);
    if (inspection.ok && previousRecord?.source_http_status >= 200 && previousRecord?.source_http_status < 300) {
      return {
        id: item.id,
        status: 'existing',
        target_path: item.target_path,
        source_url: previousRecord.source_url,
        final_url: previousRecord.final_url,
        source_publisher: previousRecord.source_publisher,
        source_class: previousRecord.source_class,
        source_is_official: previousRecord.source_is_official,
        source_http_status: previousRecord.source_http_status,
        content_type: previousRecord.content_type,
        method: previousRecord.method,
        retrieved_at: previousRecord.retrieved_at,
        ...inspection,
        text_preview: inspection.text.replace(/\s+/gu, ' ').trim().slice(0, 1800)
      };
    }
  }

  const attempts = [];
  const sources = [...item.sources].sort((left, right) => Number(left.priority ?? 999) - Number(right.priority ?? 999));
  for (const source of sources) {
    try {
      const result = source.mode === 'binary'
        ? await downloadBinarySource(request, item, source, targetPath)
        : await renderHtmlSource(context, item, source, targetPath);
      return {
        id: item.id,
        status: 'downloaded',
        target_path: item.target_path,
        ...result
      };
    } catch (error) {
      attempts.push({
        source_url: source.url,
        source_publisher: source.publisher,
        source_is_official: Boolean(source.official),
        error: error instanceof Error ? error.message : String(error)
      });
      await rm(`${targetPath}.part`, { force: true }).catch(() => {});
      await rm(`${targetPath}.download.part`, { force: true }).catch(() => {});
    }
  }
  return { id: item.id, status: 'failed', target_path: item.target_path, attempts };
}

function strategyRecord(item, result) {
  const fileUrl = relativeUrl(item.target_path);
  const isPdf = item.format === 'pdf';
  const fallbackNote = result.source_is_official
    ? 'Полный текст получен из официального источника и прошёл техническую проверку.'
    : `Полный текст получен из резервного публичного источника (${result.source_publisher}); официальный источник указан отдельно.`;
  return {
    id: item.id,
    scope: item.scope,
    group: item.group,
    ...(item.federal_section ? { federal_section: item.federal_section } : {}),
    title: item.title,
    official_title: item.official_title,
    territory: item.territory,
    parent_region: item.parent_region ?? null,
    quality: 'full',
    quality_note: fallbackNote,
    availability: 'available',
    source_filename: path.basename(item.target_path),
    document_url: fileUrl,
    pdf_url: isPdf ? fileUrl : null,
    download_url: fileUrl,
    original_url: isPdf ? null : fileUrl,
    file_format: item.format,
    official_url: item.official_url,
    source_url: result.final_url ?? result.source_url,
    source_publisher: result.source_publisher,
    source_class: result.source_class,
    source_is_official: result.source_is_official,
    source_http_status: result.source_http_status,
    source_verified_at: result.retrieved_at.slice(0, 10),
    retrieved_at: result.retrieved_at,
    pages: result.pages,
    size_bytes: result.bytes,
    sha256: result.sha256,
    searchable: true,
    period: item.period,
    act: item.act,
    act_identity: item.act_identity,
    status: item.status,
    revision: item.revision,
    edition_as_of: item.edition_as_of,
    text_preview: result.text_preview
  };
}

function recomputeStats(corpus) {
  const documents = corpus.documents ?? [];
  const coverage = documents.filter((item) => item.scope === 'regional' && item.group === 'regional');
  const available = documents.filter((item) => item.availability === 'available');
  const statusCount = (status) => coverage.filter((item) => {
    const effective = item.availability === 'available' ? item.quality : item.availability;
    return effective === status;
  }).length;
  return {
    ...(corpus.stats ?? {}),
    regional_total: coverage.length,
    regional_full: statusCount('full'),
    regional_partial: statusCount('partial'),
    regional_unavailable: statusCount('unavailable'),
    regional_missing: statusCount('missing'),
    municipal_available: available.filter((item) => item.scope === 'municipal').length,
    federal_available: available.filter((item) => item.scope === 'federal' && item.group !== 'methodology').length,
    methodology_available: available.filter((item) => item.group === 'methodology').length,
    available_files: available.length,
    total_pages: available.reduce((sum, item) => sum + Number(item.pages ?? 0), 0),
    total_pdf_bytes: available
      .filter((item) => item.file_format === 'pdf' || Boolean(item.pdf_url))
      .reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0)
  };
}

function mergeCorpus(corpus, items, results) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const additions = items.map((item) => strategyRecord(item, resultById.get(item.id)));
  const ids = new Set(additions.map((item) => item.id));
  const identities = new Set(additions.map(actIdentity).filter(Boolean));
  const titlesByIdentity = new Set(additions.map((item) => `${actIdentity(item) ?? ''}|${legalTitleIdentity(item)}`));

  const kept = (corpus.documents ?? []).filter((document) => {
    if (ids.has(document.id)) return false;
    const identity = actIdentity(document);
    if (identity && identities.has(identity)) return false;
    if (titlesByIdentity.has(`${identity ?? ''}|${legalTitleIdentity(document)}`)) return false;
    return true;
  });

  const merged = {
    ...corpus,
    generated_at: new Date().toISOString(),
    provenance: {
      ...(corpus.provenance ?? {}),
      note: 'Региональный корпус программ передан владельцем проекта. Федеральные и дополнительные нормативные документы синхронизируются с приоритетом официальных источников и проходят строгую полнотекстовую проверку.',
      family_documents_manifest: './family-documents-additions.json',
      family_documents_provenance: './family-documents-provenance.json',
      family_documents_verified_at: new Date().toISOString().slice(0, 10)
    },
    documents: [...kept, ...additions]
  };
  merged.stats = recomputeStats(merged);
  return merged;
}

function strategyManifestCsv(documents) {
  const fields = [
    'id', 'scope', 'group', 'federal_section', 'territory', 'parent_region', 'title',
    'quality', 'availability', 'period', 'temporal_status', 'pages', 'size_bytes', 'sha256',
    'source_filename', 'file_format', 'pdf_url', 'original_url', 'download_url', 'official_url',
    'source_url', 'source_publisher', 'source_is_official', 'source_http_status',
    'source_verified_at', 'retrieved_at', 'act', 'revision', 'quality_note'
  ];
  const rows = documents.map((document) => ({
    ...document,
    period: document.period?.label ?? '',
    temporal_status: document.period?.temporal_status ?? ''
  }));
  return rowsToCsv(rows, fields, { bom: true });
}

function additionsCsv(items, results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const fields = [
    'id', 'package_group', 'scope', 'group', 'territory', 'title', 'act', 'revision',
    'edition_as_of', 'format', 'target_path', 'official_url', 'status', 'bytes', 'pages',
    'text_chars', 'sha256', 'source_url', 'source_publisher', 'source_is_official',
    'source_http_status', 'retrieved_at'
  ];
  const rows = items.map((item) => ({ ...item, ...(byId.get(item.id) ?? {}) }));
  return rowsToCsv(rows, fields, { bom: true });
}

async function integrate(repoRoot, manifest, items, results) {
  const corpusPath = path.join(repoRoot, 'site/data/strategies.json');
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
  const merged = mergeCorpus(corpus, items, results);
  await writeFile(corpusPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(repoRoot, 'site/data/strategies-manifest.csv'),
    strategyManifestCsv(merged.documents),
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, 'site/data/family-documents-additions.csv'),
    additionsCsv(items, results),
    'utf8'
  );
  return merged;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.repoRoot);
  const manifestPath = absolute(repoRoot, args.manifest);
  const reportDir = absolute(repoRoot, args.reportDir);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestErrors = validateManifest(manifest, args.scope);
  if (manifestErrors.length) {
    throw new Error(`Manifest не прошёл проверку:\n- ${manifestErrors.join('\n- ')}`);
  }
  const groups = new Set(manifest.scope_rules?.[args.scope] ?? []);
  if (!groups.size) throw new Error(`Неизвестная область синхронизации: ${args.scope}`);
  const items = manifest.documents.filter((item) => groups.has(item.package_group) && (!args.only || args.only.has(item.id)));
  if (!items.length) throw new Error('В выбранной области нет документов');
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error('Manifest содержит повторяющиеся идентификаторы');

  console.log(`Manifest: ${manifest.package_id}`);
  console.log(`Область: ${args.scope}; документов: ${items.length}`);
  if (args.dryRun) {
    for (const item of items) {
      console.log(`- ${item.id} -> ${item.target_path} (${item.sources.length} ист.)`);
    }
    console.log('DRY RUN: manifest, scope и целевые пути корректны.');
    return;
  }

  await mkdir(reportDir, { recursive: true });
  const previous = await loadPreviousProvenance(repoRoot);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: !args.headful,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--lang=ru-RU']
  });
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 family-support-corpus-builder/2.0'
  });
  const request = context.request;
  const results = [];
  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      process.stdout.write(`[${index + 1}/${items.length}] ${item.id} ... `);
      const result = await fetchItem({
        context,
        request,
        item,
        repoRoot,
        force: args.force,
        previous
      });
      results.push(result);
      console.log(result.status === 'failed' ? 'ОШИБКА' : 'готово');
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const failures = results.filter((result) => result.status === 'failed');
  const report = {
    schema_version: 2,
    builder_version: SCRIPT_VERSION,
    package_id: manifest.package_id,
    scope: args.scope,
    generated_at: new Date().toISOString(),
    selected_count: items.length,
    success_count: results.length - failures.length,
    failed_count: failures.length,
    results: results.map(({ text, ...result }) => result)
  };
  await writeFile(path.join(reportDir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (failures.length) {
    console.error(`Синхронизация остановлена: не получено или не проверено документов — ${failures.length}.`);
    process.exitCode = 2;
    return;
  }

  await integrate(repoRoot, manifest, items, results);
  console.log(`Интегрировано в библиотеку: ${items.length}; отчёт: ${path.relative(repoRoot, reportDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
