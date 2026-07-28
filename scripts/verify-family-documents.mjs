#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  actIdentity,
  commandAvailable,
  inspectDocument,
  legalTitleIdentity,
  validateManifest
} from './lib/family-documents.mjs';

const DEFAULT_MANIFEST = 'site/data/family-documents-additions.json';
const DEFAULT_REPORT_DIR = 'build/family-documents';
const PROVENANCE_PATH = 'site/data/family-documents-provenance.json';
const SUMS_PATH = 'site/documents/legal/SHA256SUMS';

function parseArgs(argv) {
  const args = {
    repoRoot: process.cwd(),
    manifest: DEFAULT_MANIFEST,
    scope: 'extended',
    reportDir: DEFAULT_REPORT_DIR,
    strict: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo-root') args.repoRoot = argv[++index];
    else if (token === '--manifest') args.manifest = argv[++index];
    else if (token === '--scope') args.scope = argv[++index];
    else if (token === '--report-dir') args.reportDir = argv[++index];
    else if (token === '--strict') args.strict = true;
    else if (token === '--help' || token === '-h') {
      console.log('node scripts/verify-family-documents.mjs [--scope primary|extended] [--strict]');
      process.exit(0);
    } else throw new Error(`Неизвестный параметр: ${token}`);
  }
  return args;
}

function siteUrl(targetPath) {
  const relative = targetPath.replace(/^site\//u, '');
  return `./${relative}`;
}

function recordErrors(item, result, inspection, strategy) {
  const errors = [...inspection.errors];
  if (!result) {
    errors.push('отсутствует запись о получении в build-report.json');
    return errors;
  }
  if (!Number.isInteger(result.source_http_status) || result.source_http_status < 200 || result.source_http_status >= 300) {
    errors.push(`не подтверждён успешный HTTP-статус источника (${result.source_http_status ?? 'нет'})`);
  }
  if (!result.source_url || !/^https:\/\//u.test(result.source_url)) errors.push('не зафиксирован HTTPS-адрес фактического источника');
  if (!result.final_url || !/^https:\/\//u.test(result.final_url)) errors.push('не зафиксирован итоговый URL после перенаправлений');
  if (!result.source_publisher) errors.push('не указан издатель источника');
  if (typeof result.source_is_official !== 'boolean') errors.push('не указан класс официальности источника');
  if (!result.source_class) errors.push('не указан класс источника');
  if (!result.content_type) errors.push('не зафиксирован Content-Type');
  if (!result.retrieved_at || Number.isNaN(Date.parse(result.retrieved_at))) errors.push('не зафиксирована дата получения');
  if (!item.official_url || !/^https:\/\//u.test(item.official_url)) errors.push('в manifest отсутствует официальный URL');
  if (!item.act || !item.revision || !item.edition_as_of) errors.push('неполные реквизиты или сведения о редакции');
  if (result.sha256 && result.sha256 !== inspection.sha256) errors.push('SHA-256 не совпадает с build-report');
  if (result.bytes && result.bytes !== inspection.bytes) errors.push('размер не совпадает с build-report');
  if (result.text_chars && result.text_chars !== inspection.text_chars) errors.push('объём извлечённого текста не совпадает с build-report');

  if (!strategy) {
    errors.push('документ не интегрирован в strategies.json');
    return errors;
  }
  if (strategy.act !== item.act) errors.push('реквизиты в strategies.json не совпадают с manifest');
  if (strategy.revision !== item.revision) errors.push('редакция в strategies.json не совпадает с manifest');
  if (strategy.official_url !== item.official_url) errors.push('официальный URL в strategies.json не совпадает с manifest');
  if (strategy.sha256 !== inspection.sha256) errors.push('SHA-256 в strategies.json не совпадает с файлом');
  if (strategy.size_bytes !== inspection.bytes) errors.push('размер в strategies.json не совпадает с файлом');
  if (strategy.pages !== inspection.pages) errors.push('число страниц в strategies.json не совпадает с файлом');
  if (strategy.file_format !== item.format) errors.push('формат в strategies.json не совпадает с manifest');
  const expectedUrl = siteUrl(item.target_path);
  if (strategy.download_url !== expectedUrl || strategy.document_url !== expectedUrl) {
    errors.push('URL скачивания в strategies.json не совпадает с целевым путём');
  }
  if (item.format === 'pdf' && strategy.pdf_url !== expectedUrl) errors.push('PDF не подключён к встроенному просмотрщику');
  if (item.format === 'docx' && strategy.original_url !== expectedUrl) errors.push('DOCX не подключён к встроенному просмотрщику');
  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.repoRoot);
  const reportDir = path.join(repoRoot, args.reportDir);
  await mkdir(reportDir, { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(repoRoot, args.manifest), 'utf8'));
  const groups = new Set(manifest.scope_rules?.[args.scope] ?? []);
  if (!groups.size) throw new Error(`Неизвестная область: ${args.scope}`);
  const items = manifest.documents.filter((item) => groups.has(item.package_group));
  const manifestErrors = validateManifest(manifest, args.scope);

  const buildReportPath = path.join(reportDir, 'build-report.json');
  const buildReport = existsSync(buildReportPath)
    ? JSON.parse(await readFile(buildReportPath, 'utf8'))
    : { results: [] };
  const resultById = new Map((buildReport.results ?? []).map((result) => [result.id, result]));
  const corpus = JSON.parse(await readFile(path.join(repoRoot, 'site/data/strategies.json'), 'utf8'));
  const strategyById = new Map((corpus.documents ?? []).map((document) => [document.id, document]));
  const rows = [];

  for (const item of items) {
    const filePath = path.join(repoRoot, item.target_path);
    if (!existsSync(filePath)) {
      rows.push({
        id: item.id,
        ok: false,
        target_path: item.target_path,
        errors: ['файл отсутствует']
      });
      continue;
    }
    const inspection = await inspectDocument(filePath, item);
    const result = resultById.get(item.id);
    const strategy = strategyById.get(item.id);
    const errors = recordErrors(item, result, inspection, strategy);
    rows.push({
      id: item.id,
      ok: errors.length === 0,
      target_path: item.target_path,
      format: inspection.format,
      bytes: inspection.bytes,
      pages: inspection.pages,
      text_chars: inspection.text_chars,
      sha256: inspection.sha256,
      act: item.act,
      revision: item.revision,
      edition_as_of: item.edition_as_of,
      official_url: item.official_url,
      source_url: result?.source_url ?? null,
      final_url: result?.final_url ?? null,
      source_publisher: result?.source_publisher ?? null,
      source_class: result?.source_class ?? null,
      source_is_official: result?.source_is_official ?? null,
      source_http_status: result?.source_http_status ?? null,
      content_type: result?.content_type ?? null,
      method: result?.method ?? null,
      retrieved_at: result?.retrieved_at ?? null,
      errors
    });
  }

  const selectedIds = new Set(items.map((item) => item.id));
  const corpusByIdentity = new Map();
  const duplicates = [];
  for (const document of corpus.documents ?? []) {
    const identity = actIdentity(document);
    if (!identity) continue;
    if (!corpusByIdentity.has(identity)) corpusByIdentity.set(identity, []);
    corpusByIdentity.get(identity).push(document);
  }
  for (const [identity, documents] of corpusByIdentity) {
    if (documents.length < 2 || !documents.some((document) => selectedIds.has(document.id))) continue;
    const details = documents
      .map((document) => `${document.id} («${document.official_title ?? document.title}»)`)
      .join(', ');
    duplicates.push(`повтор акта ${identity}: ${details}`);
    const titles = new Set(documents.map(legalTitleIdentity));
    if (titles.size === 1) duplicates.push(`полный дубль по реквизитам и наименованию: ${details}`);
  }

  const failures = rows.filter((row) => !row.ok).length + manifestErrors.length + duplicates.length;
  const report = {
    schema_version: 2,
    package_id: manifest.package_id,
    scope: args.scope,
    verified_at: new Date().toISOString(),
    selected_count: items.length,
    passed_count: rows.filter((row) => row.ok).length,
    failed_count: failures,
    tools: {
      pdftotext: commandAvailable('pdftotext', ['-v']),
      pdfinfo: commandAvailable('pdfinfo', ['-v']),
      unzip: commandAvailable('unzip', ['-v'])
    },
    manifest_errors: manifestErrors,
    duplicate_errors: [...new Set(duplicates)],
    rows
  };
  await writeFile(path.join(reportDir, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  for (const row of rows) {
    console.log(`${row.ok ? 'OK' : 'FAIL'} ${row.id}${row.errors.length ? ` — ${row.errors.join('; ')}` : ''}`);
  }
  for (const error of manifestErrors) console.log(`FAIL manifest — ${error}`);
  for (const error of [...new Set(duplicates)]) console.log(`FAIL duplicate — ${error}`);
  console.log(`Проверено: ${report.passed_count}/${report.selected_count}; ошибок: ${failures}`);

  if (failures === 0) {
    const provenance = {
      schema_version: 2,
      package_id: manifest.package_id,
      scope: args.scope,
      verified_at: report.verified_at,
      selected_count: items.length,
      records: rows.map(({ ok, errors, ...row }) => row)
    };
    await mkdir(path.dirname(path.join(repoRoot, PROVENANCE_PATH)), { recursive: true });
    await writeFile(path.join(repoRoot, PROVENANCE_PATH), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
    const sums = rows
      .map((row) => `${row.sha256}  ${row.target_path}`)
      .sort((left, right) => left.localeCompare(right))
      .join('\n');
    await mkdir(path.dirname(path.join(repoRoot, SUMS_PATH)), { recursive: true });
    await writeFile(path.join(repoRoot, SUMS_PATH), `${sums}\n`, 'utf8');
  }

  if (args.strict && failures) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
