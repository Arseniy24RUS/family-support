import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  actIdentity,
  legalTitleIdentity,
  normalizeLegalText,
  requiredPhraseErrors,
  validateManifest
} from '../scripts/lib/family-documents.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../site/data/family-documents-additions.json', import.meta.url),
  'utf8'
));

test('scope=extended содержит ровно 22 полнотекстовых документа', () => {
  assert.equal(manifest.documents.length, 22);
  assert.equal(validateManifest(manifest, 'extended').length, 0);
  assert.equal(
    manifest.documents.filter((item) => manifest.scope_rules.primary.includes(item.package_group)).length,
    20
  );
});

test('manifest не повторяет id, целевые пути и реквизиты актов', () => {
  const ids = manifest.documents.map((item) => item.id);
  const paths = manifest.documents.map((item) => item.target_path);
  const identities = manifest.documents.map(actIdentity);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(new Set(identities).size, identities.length);
  assert.ok(identities.every(Boolean));
});

test('каждый документ начинает поиск с официального источника', () => {
  for (const item of manifest.documents) {
    const sources = [...item.sources].sort((left, right) => left.priority - right.priority);
    assert.equal(sources[0].official, true, item.id);
    assert.match(item.official_url, /^https:\/\//u, item.id);
  }
});

test('идентичность акта учитывает вид, дату и номер, а не имя файла', () => {
  const first = {
    act: 'Закон города Москвы от 23.11.2005 № 60',
    title: 'Социальная поддержка семей с детьми'
  };
  const renamed = {
    act: 'Закон города Москвы от 23.11.2005 № 60',
    title: 'Другое отображаемое имя'
  };
  assert.equal(actIdentity(first), actIdentity(renamed));
  assert.notEqual(legalTitleIdentity(first), legalTitleIdentity(renamed));
});

test('проверка контрольных фраз нормализует регистр, кавычки и букву ё', () => {
  const text = 'ФЕДЕРАЛЬНЫЙ ЗАКОН № 81-ФЗ. Пособие по беременности и родам.';
  assert.equal(requiredPhraseErrors(text, {
    required_phrases: ['Федеральный закон', '№ 81-ФЗ', 'пособие по беременности и родам']
  }).length, 0);
  assert.equal(normalizeLegalText('Ёлка «Семья»'), 'елка семья');
});
