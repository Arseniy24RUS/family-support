import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export function normalizeLegalText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[№#]/g, ' n ')
    .replace(/[«»„“”"'`]/g, ' ')
    .replace(/[^a-zа-я0-9/-]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function actIdentity(value) {
  const identity = value?.act_identity ?? {};
  const kind = normalizeLegalText(identity.kind ?? '');
  const date = String(identity.date ?? '').trim();
  const number = normalizeLegalText(identity.number ?? '');
  if (kind && date && number) return `${kind}|${date}|${number}`;

  const act = String(value?.act ?? '');
  const parsedDate = act.match(/(\d{2})[.\s](\d{2})[.\s](\d{4})/u);
  const parsedNumber = act.match(/[№N]\s*([A-Za-zА-Яа-я0-9/.-]+)/u);
  const parsedKind = act.match(/^(.+?)\s+от\s+\d{2}[.\s]\d{2}[.\s]\d{4}/iu);
  if (!parsedDate || !parsedNumber || !parsedKind) return null;
  return [
    normalizeLegalText(parsedKind[1]),
    `${parsedDate[3]}-${parsedDate[2]}-${parsedDate[1]}`,
    normalizeLegalText(parsedNumber[1])
  ].join('|');
}

export function legalTitleIdentity(value) {
  return normalizeLegalText(value?.official_title ?? value?.title ?? '');
}

export function validateManifest(manifest, scope = 'extended') {
  const errors = [];
  const groups = new Set(manifest?.scope_rules?.[scope] ?? []);
  if (!groups.size) return [`неизвестная область manifest: ${scope}`];
  if (!Array.isArray(manifest?.documents)) return ['поле documents должно быть массивом'];

  const selected = manifest.documents.filter((item) => groups.has(item.package_group));
  const expectedCount = Number(manifest?.expected_scope_counts?.[scope]);
  if (Number.isInteger(expectedCount) && selected.length !== expectedCount) {
    errors.push(`scope=${scope}: ожидается ${expectedCount} документов, получено ${selected.length}`);
  }

  const ids = new Set();
  const targets = new Set();
  const identities = new Set();
  for (const [index, item] of selected.entries()) {
    const label = item?.id || `documents[${index}]`;
    for (const field of [
      'id', 'package_group', 'scope', 'group', 'territory', 'title', 'official_title',
      'act', 'status', 'revision', 'edition_as_of', 'format', 'target_path', 'official_url'
    ]) {
      if (!item?.[field]) errors.push(`${label}: отсутствует ${field}`);
    }
    if (ids.has(item.id)) errors.push(`${label}: повторяющийся id`);
    ids.add(item.id);
    if (targets.has(item.target_path)) errors.push(`${label}: повторяющийся target_path`);
    targets.add(item.target_path);

    const identity = actIdentity(item);
    if (!identity) errors.push(`${label}: не сформирована идентичность акта`);
    else if (identities.has(identity)) errors.push(`${label}: повторяются вид, дата и номер акта`);
    else identities.add(identity);

    if (!['pdf', 'docx'].includes(item.format)) errors.push(`${label}: неподдерживаемый формат ${item.format}`);
    if (!String(item.target_path ?? '').startsWith('site/documents/legal/')) {
      errors.push(`${label}: target_path должен находиться в site/documents/legal/`);
    }
    if (!String(item.target_path ?? '').endsWith(`.${item.format}`)) {
      errors.push(`${label}: расширение target_path не соответствует формату`);
    }
    if (!Number.isInteger(item.min_bytes) || item.min_bytes < 5000) errors.push(`${label}: некорректный min_bytes`);
    if (!Number.isInteger(item.min_text_chars) || item.min_text_chars < 1000) {
      errors.push(`${label}: некорректный min_text_chars`);
    }
    if (!Array.isArray(item.required_phrases) || item.required_phrases.length < 2) {
      errors.push(`${label}: недостаточно контрольных фраз`);
    }
    if (!/^https:\/\//u.test(String(item.official_url ?? ''))) errors.push(`${label}: официальный URL должен быть HTTPS`);
    if (!Array.isArray(item.sources) || !item.sources.length) {
      errors.push(`${label}: отсутствуют источники`);
      continue;
    }
    const sources = [...item.sources].sort((left, right) => Number(left.priority ?? 999) - Number(right.priority ?? 999));
    if (!sources.some((source) => source.official)) errors.push(`${label}: нет официального источника`);
    if (!sources[0]?.official) errors.push(`${label}: источник первого приоритета должен быть официальным`);
    for (const source of sources) {
      if (!/^https:\/\//u.test(String(source.url ?? ''))) errors.push(`${label}: URL источника должен быть HTTPS`);
      if (!source.publisher || !source.source_class) errors.push(`${label}: источник без издателя или класса`);
      if (!['html', 'binary'].includes(source.mode)) errors.push(`${label}: источник с неизвестным mode`);
      if (source.mode === 'html' && item.format !== 'pdf') errors.push(`${label}: HTML-источник допустим только для PDF`);
      if (source.page_range && (source.mode !== 'binary' || item.format !== 'pdf')) {
        errors.push(`${label}: page_range допустим только для бинарного PDF`);
      }
    }
  }
  return errors;
}

export async function sha256File(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function decodeXml(value) {
  return value
    .replace(/<w:tab\b[^>]*\/>/giu, '\t')
    .replace(/<w:br\b[^>]*\/>/giu, '\n')
    .replace(/<\/w:p>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 200 * 1024 * 1024
  });
}

export function commandAvailable(command, args = ['--version']) {
  const result = run(command, args, { maxBuffer: 2 * 1024 * 1024 });
  return !result.error && result.status === 0;
}

export function extractPdfText(filePath) {
  const result = run('pdftotext', ['-layout', filePath, '-']);
  if (result.error || result.status !== 0) {
    return { text: '', error: result.error?.message || result.stderr?.trim() || 'pdftotext завершился с ошибкой' };
  }
  return { text: String(result.stdout ?? '').replace(/\u00a0/gu, ' ').trim(), error: null };
}

export function pdfPageCount(filePath) {
  const result = run('pdfinfo', [filePath]);
  if (result.error || result.status !== 0) return null;
  const match = String(result.stdout ?? '').match(/^Pages:\s+(\d+)/mu);
  return match ? Number(match[1]) : null;
}

export function extractDocxText(filePath) {
  const list = run('unzip', ['-Z1', filePath]);
  if (list.error || list.status !== 0) {
    return { text: '', error: list.error?.message || list.stderr?.trim() || 'DOCX не читается как ZIP', entries: [] };
  }
  const entries = String(list.stdout ?? '').split(/\r?\n/u).filter(Boolean);
  const required = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
  const missing = required.filter((entry) => !entries.includes(entry));
  if (missing.length) return { text: '', error: `в DOCX отсутствуют ${missing.join(', ')}`, entries };
  const xml = run('unzip', ['-p', filePath, 'word/document.xml']);
  if (xml.error || xml.status !== 0) {
    return { text: '', error: xml.error?.message || xml.stderr?.trim() || 'не удалось извлечь word/document.xml', entries };
  }
  return { text: decodeXml(String(xml.stdout ?? '')), error: null, entries };
}

export function docxPageCount(filePath) {
  const result = run('unzip', ['-p', filePath, 'docProps/app.xml']);
  if (result.error || result.status !== 0) return null;
  const match = String(result.stdout ?? '').match(/<Pages>(\d+)<\/Pages>/u);
  return match ? Number(match[1]) : null;
}

export function requiredPhraseErrors(text, item) {
  const normalized = normalizeLegalText(text);
  const phrases = Array.isArray(item?.required_phrases) ? item.required_phrases : [];
  return phrases
    .filter((phrase) => !normalized.includes(normalizeLegalText(phrase)))
    .map((phrase) => `не найдена контрольная фраза «${phrase}»`);
}

function htmlDisguisedAsBinary(buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<title>access denied');
}

export async function inspectDocument(filePath, item = {}) {
  const info = await stat(filePath);
  const buffer = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const format = String(item.format ?? extension.slice(1)).toLowerCase();
  const errors = [];
  const minimumBytes = Number(item.min_bytes ?? (format === 'docx' ? 5000 : 8000));

  if (info.size < minimumBytes) errors.push(`размер ${info.size} байт меньше ${minimumBytes}`);
  if (htmlDisguisedAsBinary(buffer)) errors.push('HTML сохранён под видом бинарного документа');

  let text = '';
  let textError = null;
  let pages = null;

  if (format === 'pdf') {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') errors.push('отсутствует сигнатура PDF');
    const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1');
    if (!tail.includes('%%EOF')) errors.push('не найден завершающий маркер PDF');
    ({ text, error: textError } = extractPdfText(filePath));
    pages = pdfPageCount(filePath);
  } else if (format === 'docx') {
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) errors.push('отсутствует ZIP-сигнатура DOCX');
    ({ text, error: textError } = extractDocxText(filePath));
    pages = docxPageCount(filePath);
  } else {
    errors.push(`неподдерживаемый формат ${format}`);
  }

  if (textError) errors.push(`извлечение текста: ${textError}`);
  const textChars = text.replace(/\s+/gu, ' ').trim().length;
  const minimumText = Number(item.min_text_chars ?? 1000);
  if (textChars < minimumText) errors.push(`извлечено ${textChars} знаков; требуется не менее ${minimumText}`);
  errors.push(...requiredPhraseErrors(text, item));
  if (!Number.isInteger(pages) || pages < 1) errors.push('не удалось определить число страниц');

  return {
    ok: errors.length === 0,
    format,
    bytes: info.size,
    pages,
    text,
    text_chars: textChars,
    sha256: await sha256File(filePath),
    errors
  };
}

export function csvEscape(value) {
  const text = value == null
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows, fields, { bom = false } = {}) {
  const body = [
    fields.join(';'),
    ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(';'))
  ].join('\n');
  return `${bom ? '\uFEFF' : ''}${body}\n`;
}
