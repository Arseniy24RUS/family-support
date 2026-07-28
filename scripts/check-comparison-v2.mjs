import { createHash } from 'node:crypto';
import { access, open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const site = path.join(root, 'site');
const errors = [];
const warnings = [];
const checkedFiles = new Set();

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function exists(filepath) {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filepath, label) {
  try {
    return JSON.parse(await readFile(filepath, 'utf8'));
  } catch (error) {
    fail(`${label}: не удалось прочитать JSON (${error.message}).`);
    return null;
  }
}

function regionNames(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean);
}

function resolveSiteUrl(url, label) {
  if (!url) return null;
  if (!String(url).startsWith('./')) {
    fail(`${label}: локальный URL должен начинаться с "./" (${url}).`);
    return null;
  }
  const resolved = path.resolve(site, String(url).slice(2));
  if (resolved !== site && !resolved.startsWith(`${site}${path.sep}`)) {
    fail(`${label}: путь выходит за пределы site (${url}).`);
    return null;
  }
  return resolved;
}

async function sha256(filepath) {
  const hash = createHash('sha256');
  const handle = await open(filepath, 'r');
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest('hex');
}

async function pdfHeader(filepath) {
  const handle = await open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    return buffer.toString('ascii');
  } finally {
    await handle.close();
  }
}

async function zipHeader(filepath) {
  const handle = await open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    await handle.read(buffer, 0, 2, 0);
    return [...buffer];
  } finally {
    await handle.close();
  }
}

async function walk(directory) {
  if (!await exists(directory)) return [];
  const values = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filepath = path.join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(filepath));
    else if (entry.isFile()) values.push(filepath);
  }
  return values;
}

const requiredFiles = [
  'site/compare.html',
  'site/compare.js',
  'site/compare-v2.css',
  'site/documents.html',
  'site/documents.js',
  'site/documents.css',
  'site/lib/compare-map.js',
  'site/lib/strategy-library.js',
  'site/lib/comparison-insights.js',
  'site/lib/strategy-text-analysis.js',
  'site/data/strategies.json',
  'site/data/strategies-manifest.csv',
  'site/data/strategies-lexical-profile.csv',
  'site/vendor/jszip.min.js',
  'site/vendor/docx-preview.min.js',
  'site/vendor/JSZIP-LICENSE.txt',
  'site/vendor/DOCX-PREVIEW-LICENSE.txt',
  'scripts/profile-strategy-texts.py'
];
for (const relative of requiredFiles) {
  if (!await exists(path.join(root, relative))) fail(`Отсутствует обязательный файл: ${relative}.`);
}

const htmlPath = path.join(site, 'compare.html');
const html = await exists(htmlPath) ? await readFile(htmlPath, 'utf8') : '';
const requiredIds = [
  'comparison-map', 'comparison-map-regions', 'comparison-map-markers', 'selected-regions',
  'run-comparison', 'comparison-results',
  'strategy-timeline', 'strategy-theme-matrix', 'strategy-lexical-similarity'
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) fail(`compare.html: отсутствует #${id}.`);
}
if (!html.includes('./compare-v2.css')) fail('compare.html: не подключён compare-v2.css.');
if (!html.includes('type="module" src="./compare.js"')) fail('compare.html: compare.js должен подключаться как ES-модуль.');
if (!/value="strategies"/u.test(html) || !/value="catalog"/u.test(html) || !/value="neutral"/u.test(html)) fail('compare.html: отсутствуют слои карты.');
if (!/value="neutral" checked/u.test(html)) fail('compare.html: нейтральный слой должен быть выбран по умолчанию.');
if (html.indexOf('value="neutral"') > html.indexOf('value="strategies"')) fail('compare.html: нейтральный слой должен идти первым.');
if (html.includes('id="document-library"')) fail('compare.html: документальная база должна находиться на отдельной странице.');

const documentsPath = path.join(site, 'documents.html');
const documentsHtml = await exists(documentsPath) ? await readFile(documentsPath, 'utf8') : '';
for (const id of [
  'document-library', 'documents-region-checklist', 'strategy-document-list',
  'strategy-viewer-content', 'strategy-document-stage', 'strategy-pdf-frame', 'strategy-docx-viewer',
  'load-strategy-pdf', 'load-strategy-docx', 'strategy-load-more',
  'federal-collection-guide', 'federal-section-filter'
]) {
  if (!documentsHtml.includes(`id="${id}"`)) fail(`documents.html: отсутствует #${id}.`);
}
if (/id="strategy-pdf-frame"[^>]+src=/u.test(documentsHtml)) fail('documents.html: iframe PDF не должен иметь исходный src — документы загружаются лениво.');
if (/src="\.\/vendor\/(?:jszip|docx-preview)\.min\.js"/u.test(documentsHtml)) fail('documents.html: просмотрщик DOCX нельзя загружать до запроса пользователя.');

for (const relative of [
  'site/compare.js', 'site/documents.js', 'site/lib/compare-map.js', 'site/lib/strategy-library.js',
  'site/lib/comparison-insights.js', 'site/lib/strategy-text-analysis.js', 'scripts/check-comparison-v2.mjs'
]) {
  const filepath = path.join(root, relative);
  if (!await exists(filepath)) continue;
  const result = spawnSync(process.execPath, ['--check', filepath], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${relative}: синтаксическая ошибка JavaScript (${result.stderr.trim()}).`);
}

const corpusPath = path.join(site, 'data', 'strategies.json');
const corpus = await readJson(corpusPath, 'strategies.json');
const regionsPayload = await readJson(path.join(site, 'data', 'regions-base.json'), 'regions-base.json');
const baseRegions = regionNames(regionsPayload);

if (corpus) {
  if (!Number.isInteger(corpus.schema_version) || corpus.schema_version < 2) fail('strategies.json: требуется schema_version >= 2.');
  if (!Array.isArray(corpus.documents)) fail('strategies.json: поле documents должно быть массивом.');
  if (!corpus.stats || typeof corpus.stats !== 'object') fail('strategies.json: отсутствует объект stats.');
  if (!corpus.provenance?.note) fail('strategies.json: отсутствует описание происхождения корпуса.');
  const lexicalDefinition = corpus.analysis?.lexical_profile;
  if (!lexicalDefinition?.method || !Array.isArray(lexicalDefinition?.themes)) {
    fail('strategies.json: отсутствует методика лексического профиля.');
  }
  const lexicalThemeIds = new Set((lexicalDefinition?.themes ?? []).map((item) => item?.id).filter(Boolean));
  if (lexicalThemeIds.size < 8) fail('strategies.json: лексический профиль должен содержать не менее восьми тематических полей.');

  const documents = Array.isArray(corpus.documents) ? corpus.documents : [];
  const ids = new Set();
  const regional = [];
  let totalPages = 0;
  let totalPdfBytes = 0;
  let availableFiles = 0;
  let federalAvailable = 0;
  let methodologyAvailable = 0;
  let municipalAvailable = 0;
  const regionalStatuses = { full: 0, partial: 0, unavailable: 0, missing: 0 };

  for (const [index, document] of documents.entries()) {
    const label = `documents[${index}]${document?.id ? ` (${document.id})` : ''}`;
    if (!document?.id || typeof document.id !== 'string') {
      fail(`${label}: отсутствует id.`);
      continue;
    }
    if (ids.has(document.id)) fail(`${label}: повторяющийся id.`);
    ids.add(document.id);
    if (!document.title) fail(`${label}: отсутствует title.`);
    if (!['regional', 'municipal', 'federal'].includes(document.scope)) fail(`${label}: недопустимый scope.`);
    if (!['regional', 'municipal', 'strategic', 'implementation', 'normative', 'methodology'].includes(document.group)) fail(`${label}: недопустимый group.`);
    if (!['available', 'unavailable', 'missing'].includes(document.availability)) fail(`${label}: недопустимый availability.`);
    if (!['full', 'partial', 'unavailable', 'missing'].includes(document.quality)) fail(`${label}: недопустимый quality.`);
    if (!document.period || !['active', 'historical', 'future', 'undated'].includes(document.period.temporal_status)) {
      fail(`${label}: некорректный временной статус.`);
    }
    if (document.official_url && !/^https:\/\//u.test(document.official_url)) fail(`${label}: official_url должен использовать HTTPS.`);
    if (document.scope === 'federal' && !['core', 'implementation', 'student-family', 'related', 'methodology', 'archive'].includes(document.federal_section)) {
      fail(`${label}: отсутствует или недопустим federal_section.`);
    }

    const isRegionalCoverage = document.scope === 'regional' && document.group === 'regional';
    if (isRegionalCoverage) regional.push(document);
    if (isRegionalCoverage) {
      const key = document.availability === 'available' ? document.quality : document.availability;
      if (key in regionalStatuses) regionalStatuses[key] += 1;
    }

    if (document.availability === 'available') {
      const fileFormat = document.file_format || (document.pdf_url ? 'pdf' : /\.docx$/iu.test(document.original_url || '') ? 'docx' : null);
      const documentUrl = document.document_url || document.pdf_url || document.original_url;
      if (!documentUrl || !document.download_url) fail(`${label}: доступному документу нужны document_url и download_url.`);
      if (!['pdf', 'docx'].includes(fileFormat)) fail(`${label}: доступному документу нужен поддерживаемый file_format.`);
      if (fileFormat === 'pdf' && !document.pdf_url) fail(`${label}: для PDF отсутствует pdf_url.`);
      if (fileFormat === 'docx' && !document.original_url) fail(`${label}: для DOCX отсутствует original_url.`);
      if (!Number.isInteger(document.pages) || document.pages < 1) fail(`${label}: некорректное число страниц.`);
      if (!Number.isInteger(document.size_bytes) || document.size_bytes < 5) fail(`${label}: некорректный размер файла.`);
      if (!/^[a-f0-9]{64}$/u.test(document.sha256 || '')) fail(`${label}: некорректная SHA-256.`);
      const textProfile = document.text_profile;
      if (!textProfile || textProfile.method !== lexicalDefinition?.method) {
        fail(`${label}: отсутствует воспроизводимый лексический профиль.`);
      } else {
        if (!Number.isInteger(textProfile.token_count) || textProfile.token_count < 0) fail(`${label}: некорректный token_count.`);
        if (!['standard', 'limited', 'unavailable'].includes(textProfile.reliability)) fail(`${label}: некорректная надёжность лексического профиля.`);
        if (textProfile.token_count === 0 && textProfile.reliability !== 'unavailable') {
          fail(`${label}: нулевой текстовый слой должен быть явно отмечен как unavailable.`);
        }
        for (const themeId of lexicalThemeIds) {
          const theme = textProfile.themes?.[themeId];
          if (!theme || !Number.isFinite(Number(theme.matches)) || !Number.isFinite(Number(theme.per_10000_words))) {
            fail(`${label}: отсутствуют числовые показатели темы ${themeId}.`);
          }
        }
      }

      const documentPath = resolveSiteUrl(documentUrl, `${label}.document_url`);
      if (documentPath) {
        checkedFiles.add(documentPath);
        if (!await exists(documentPath)) {
          fail(`${label}: файл отсутствует (${documentUrl}).`);
        } else {
          const info = await stat(documentPath);
          if (info.size !== document.size_bytes) fail(`${label}: размер файла не совпадает с манифестом (${info.size} != ${document.size_bytes}).`);
          if (info.size > 100 * 1024 * 1024) fail(`${label}: файл превышает 100 MiB и не будет принят обычным Git-репозиторием GitHub.`);
          if (fileFormat === 'pdf' && await pdfHeader(documentPath) !== '%PDF-') fail(`${label}: файл не имеет заголовка PDF.`);
          if (fileFormat === 'docx') {
            const [first, second] = await zipHeader(documentPath);
            if (first !== 0x50 || second !== 0x4b) fail(`${label}: файл не имеет ZIP-заголовка DOCX.`);
          }
          if (process.env.FAST_STRATEGY_CHECK !== '1' && /^[a-f0-9]{64}$/u.test(document.sha256 || '')) {
            const digest = await sha256(documentPath);
            if (digest !== document.sha256) fail(`${label}: контрольная сумма файла не совпадает.`);
          }
          if (fileFormat === 'pdf') totalPdfBytes += info.size;
          totalPages += document.pages;
          availableFiles += 1;
          if (document.scope === 'federal' && document.group !== 'methodology') federalAvailable += 1;
          if (document.group === 'methodology') methodologyAvailable += 1;
          if (document.scope === 'municipal') municipalAvailable += 1;
        }
      }
      if (document.download_url !== documentUrl) warn(`${label}: download_url отличается от document_url; проверьте намеренность.`);
    } else if (document.pdf_url || document.download_url) {
      fail(`${label}: недоступная запись не должна ссылаться на PDF.`);
    }

    if (document.original_url) {
      const sourcePath = resolveSiteUrl(document.original_url, `${label}.original_url`);
      if (sourcePath) {
        checkedFiles.add(sourcePath);
        if (!await exists(sourcePath)) fail(`${label}: исходный Word/RTF-файл отсутствует.`);
      }
    }
  }

  if (regional.length !== 89) fail(`strategies.json: ожидается 89 региональных записей покрытия, обнаружено ${regional.length}.`);
  const regionalTerritories = regional.map((document) => document.territory).filter(Boolean);
  if (new Set(regionalTerritories).size !== regional.length) fail('strategies.json: региональные территории повторяются.');
  if (baseRegions.length) {
    const missingInCorpus = baseRegions.filter((region) => !regionalTerritories.includes(region));
    const extraInCorpus = regionalTerritories.filter((region) => !baseRegions.includes(region));
    if (missingInCorpus.length) fail(`strategies.json: нет записей покрытия для субъектов: ${missingInCorpus.join(', ')}.`);
    if (extraInCorpus.length) fail(`strategies.json: территории отсутствуют в regions-base.json: ${extraInCorpus.join(', ')}.`);
  }

  const expectedStats = {
    regional_total: regional.length,
    regional_full: regionalStatuses.full,
    regional_partial: regionalStatuses.partial,
    regional_unavailable: regionalStatuses.unavailable,
    regional_missing: regionalStatuses.missing,
    federal_available: federalAvailable,
    methodology_available: methodologyAvailable,
    municipal_available: municipalAvailable,
    available_files: availableFiles,
    total_pages: totalPages,
    total_pdf_bytes: totalPdfBytes
  };
  for (const [key, value] of Object.entries(expectedStats)) {
    if (corpus.stats?.[key] !== value) fail(`strategies.json: stats.${key}=${corpus.stats?.[key]} вместо рассчитанного ${value}.`);
  }

  const documentsRoot = path.join(site, 'documents', 'strategies');
  for (const filepath of await walk(documentsRoot)) {
    if (!checkedFiles.has(filepath)) warn(`Неиспользуемый файл корпуса: ${path.relative(root, filepath)}.`);
  }
  const legalDocumentsRoot = path.join(site, 'documents', 'legal');
  for (const filepath of await walk(legalDocumentsRoot)) {
    if (path.basename(filepath) === 'SHA256SUMS') continue;
    if (!checkedFiles.has(filepath)) warn(`Неиспользуемый юридический документ: ${path.relative(root, filepath)}.`);
  }
}

const csvPath = path.join(site, 'data', 'strategies-manifest.csv');
if (await exists(csvPath)) {
  const csv = await readFile(csvPath, 'utf8');
  if (!csv.startsWith('\uFEFF') && !csv.startsWith('id;')) warn('strategies-manifest.csv: отсутствует BOM; Excel может неверно определить UTF-8.');
  if (!/regional-/u.test(csv) || !/federal-/u.test(csv)) fail('strategies-manifest.csv: отсутствуют ожидаемые группы документов.');
}

const lexicalCsvPath = path.join(site, 'data', 'strategies-lexical-profile.csv');
if (await exists(lexicalCsvPath)) {
  const csv = await readFile(lexicalCsvPath, 'utf8');
  if (!csv.startsWith('﻿')) warn('strategies-lexical-profile.csv: отсутствует BOM; Excel может неверно определить UTF-8.');
  if (!/token_count/u.test(csv) || !/per_10000_words/u.test(csv)) fail('strategies-lexical-profile.csv: отсутствуют обязательные показатели.');
}

const pythonProfilePath = path.join(root, 'scripts', 'profile-strategy-texts.py');
if (await exists(pythonProfilePath)) {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  let pythonCommand = null;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) {
      pythonCommand = candidate;
      break;
    }
  }
  if (!pythonCommand) {
    warn('Python не найден; синтаксис воспроизводящего сценария profile-strategy-texts.py не проверен.');
  } else {
    const syntaxProbe = [
      'import ast, pathlib, sys',
      "source = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')",
      'ast.parse(source, filename=sys.argv[1])'
    ].join('; ');
    const args = pythonCommand === 'py'
      ? ['-3', '-c', syntaxProbe, pythonProfilePath]
      : ['-c', syntaxProbe, pythonProfilePath];
    const result = spawnSync(pythonCommand, args, { encoding: 'utf8' });
    if (result.status !== 0) {
      const details = String(result.stderr || result.stdout || result.error?.message || 'неизвестная ошибка').trim();
      fail(`scripts/profile-strategy-texts.py: синтаксическая ошибка Python (${details}).`);
    }
  }
}

const packagePath = path.join(root, 'package.json');
if (await exists(packagePath)) {
  const packageJson = await readJson(packagePath, 'package.json');
  if (packageJson?.scripts?.check && !packageJson.scripts.check.includes('check-comparison-v2.mjs')) {
    warn('package.json: npm run check пока не включает check-comparison-v2.mjs.');
  }
}

for (const message of warnings) console.warn(`Предупреждение: ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`Ошибка: ${message}`);
  console.error(`\nПроверка модуля сравнения не пройдена: ${errors.length} ошибок, ${warnings.length} предупреждений.`);
  process.exit(1);
}

console.log([
  'Проверка модуля сравнения пройдена.',
  corpus?.stats ? `Регионов: ${corpus.stats.regional_total}; доступных файлов: ${corpus.stats.available_files}; страниц: ${corpus.stats.total_pages}.` : '',
  warnings.length ? `Предупреждений: ${warnings.length}.` : 'Предупреждений нет.'
].filter(Boolean).join(' '));
