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
  'site/lib/compare-map.js',
  'site/lib/strategy-library.js',
  'site/lib/comparison-insights.js',
  'site/lib/strategy-text-analysis.js',
  'site/data/strategies.json',
  'site/data/strategies-manifest.csv',
  'site/data/strategies-lexical-profile.csv',
  'scripts/profile-strategy-texts.py'
];
for (const relative of requiredFiles) {
  if (!await exists(path.join(root, relative))) fail(`Отсутствует обязательный файл: ${relative}.`);
}

const htmlPath = path.join(site, 'compare.html');
const html = await exists(htmlPath) ? await readFile(htmlPath, 'utf8') : '';
const requiredIds = [
  'comparison-map', 'comparison-map-regions', 'comparison-map-markers', 'selected-regions',
  'run-comparison', 'comparison-results', 'strategy-library', 'strategy-document-list',
  'strategy-viewer-content', 'strategy-pdf-frame', 'load-strategy-pdf', 'strategy-load-more',
  'strategy-timeline', 'strategy-theme-matrix', 'strategy-lexical-similarity'
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) fail(`compare.html: отсутствует #${id}.`);
}
if (!html.includes('./compare-v2.css')) fail('compare.html: не подключён compare-v2.css.');
if (!html.includes('type="module" src="./compare.js"')) fail('compare.html: compare.js должен подключаться как ES-модуль.');
if (/id="strategy-pdf-frame"[^>]+src=/u.test(html)) fail('compare.html: iframe PDF не должен иметь исходный src — документы загружаются лениво.');
if (!/value="strategies"/u.test(html) || !/value="catalog"/u.test(html)) fail('compare.html: отсутствуют аналитические слои карты.');

for (const relative of [
  'site/compare.js', 'site/lib/compare-map.js', 'site/lib/strategy-library.js',
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
    if (!['regional', 'municipal', 'strategic', 'methodology'].includes(document.group)) fail(`${label}: недопустимый group.`);
    if (!['available', 'unavailable', 'missing'].includes(document.availability)) fail(`${label}: недопустимый availability.`);
    if (!['full', 'partial', 'unavailable', 'missing'].includes(document.quality)) fail(`${label}: недопустимый quality.`);
    if (!document.period || !['active', 'historical', 'future', 'undated'].includes(document.period.temporal_status)) {
      fail(`${label}: некорректный временной статус.`);
    }
    if (document.official_url && !/^https:\/\//u.test(document.official_url)) fail(`${label}: official_url должен использовать HTTPS.`);

    if (document.scope === 'regional') regional.push(document);
    if (document.scope === 'regional') {
      const key = document.availability === 'available' ? document.quality : document.availability;
      if (key in regionalStatuses) regionalStatuses[key] += 1;
    }

    if (document.availability === 'available') {
      if (!document.pdf_url || !document.download_url) fail(`${label}: доступному документу нужны pdf_url и download_url.`);
      if (!Number.isInteger(document.pages) || document.pages < 1) fail(`${label}: некорректное число страниц.`);
      if (!Number.isInteger(document.size_bytes) || document.size_bytes < 5) fail(`${label}: некорректный размер файла.`);
      if (!/^[a-f0-9]{64}$/u.test(document.sha256 || '')) fail(`${label}: некорректная SHA-256.`);
      const textProfile = document.text_profile;
      if (!textProfile || textProfile.method !== lexicalDefinition?.method) {
        fail(`${label}: отсутствует воспроизводимый лексический профиль.`);
      } else {
        if (!Number.isInteger(textProfile.token_count) || textProfile.token_count < 1) fail(`${label}: некорректный token_count.`);
        if (!['standard', 'limited'].includes(textProfile.reliability)) fail(`${label}: некорректная надёжность лексического профиля.`);
        for (const themeId of lexicalThemeIds) {
          const theme = textProfile.themes?.[themeId];
          if (!theme || !Number.isFinite(Number(theme.matches)) || !Number.isFinite(Number(theme.per_10000_words))) {
            fail(`${label}: отсутствуют числовые показатели темы ${themeId}.`);
          }
        }
      }

      const pdfPath = resolveSiteUrl(document.pdf_url, `${label}.pdf_url`);
      if (pdfPath) {
        checkedFiles.add(pdfPath);
        if (!await exists(pdfPath)) {
          fail(`${label}: PDF отсутствует (${document.pdf_url}).`);
        } else {
          const info = await stat(pdfPath);
          if (info.size !== document.size_bytes) fail(`${label}: размер PDF не совпадает с манифестом (${info.size} != ${document.size_bytes}).`);
          if (info.size > 100 * 1024 * 1024) fail(`${label}: файл превышает 100 MiB и не будет принят обычным Git-репозиторием GitHub.`);
          if (await pdfHeader(pdfPath) !== '%PDF-') fail(`${label}: файл не имеет заголовка PDF.`);
          if (process.env.FAST_STRATEGY_CHECK !== '1' && /^[a-f0-9]{64}$/u.test(document.sha256 || '')) {
            const digest = await sha256(pdfPath);
            if (digest !== document.sha256) fail(`${label}: контрольная сумма PDF не совпадает.`);
          }
          totalPdfBytes += info.size;
          totalPages += document.pages;
          availableFiles += 1;
          if (document.scope === 'federal' && document.group === 'strategic') federalAvailable += 1;
          if (document.group === 'methodology') methodologyAvailable += 1;
          if (document.scope === 'municipal') municipalAvailable += 1;
        }
      }
      if (document.download_url !== document.pdf_url) warn(`${label}: download_url отличается от pdf_url; проверьте намеренность.`);
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
  corpus?.stats ? `Регионов: ${corpus.stats.regional_total}; доступных PDF: ${corpus.stats.available_files}; страниц: ${corpus.stats.total_pages}.` : '',
  warnings.length ? `Предупреждений: ${warnings.length}.` : 'Предупреждений нет.'
].filter(Boolean).join(' '));
