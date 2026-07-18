import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegionProfile,
  compareRegions,
  comparisonToCsv,
  titleOverlap
} from '../site/lib/region-comparison-engine.js';

const measures = [
  { id: 'f1', level: 'federal', title: 'Единое пособие', category: 'Денежные выплаты' },
  { id: 'a1', level: 'regional', region: 'Регион А', title: 'Компенсация детского сада', category: 'Образование' },
  { id: 'a2', level: 'regional', region: 'Регион А', title: 'Региональный материнский капитал', category: 'Денежные выплаты' },
  { id: 'b1', level: 'regional', region: 'Регион Б', title: 'Компенсация детского сада', category: 'Образование' }
];

test('profile reports catalog representation, not policy absence', () => {
  const represented = buildRegionProfile(measures, 'Регион А');
  const absent = buildRegionProfile(measures, 'Регион В');
  assert.equal(represented.status, 'represented');
  assert.equal(represented.regionalCount, 2);
  assert.equal(absent.status, 'not-represented');
  assert.equal(absent.regionalCount, 0);
});

test('comparison keeps federal measures outside regional structural counts', () => {
  const result = compareRegions(measures, ['Регион А', 'Регион Б']);
  assert.equal(result.federalCount, 1);
  assert.equal(result.profiles[0].regionalCount, 2);
  assert.equal(result.profiles[1].regionalCount, 1);
});

test('title overlap is explicitly based on normalized names', () => {
  const a = buildRegionProfile(measures, 'Регион А');
  const b = buildRegionProfile(measures, 'Регион Б');
  assert.ok(titleOverlap(a, b) > 0);
});

test('CSV includes methodological limitation', () => {
  const csv = comparisonToCsv(compareRegions(measures, ['Регион А', 'Регион Б']), { generated_at: '2026-01-01' });
  assert.ok(csv.includes('структура записей текущего источника'));
  assert.ok(csv.startsWith('\uFEFF'));
});
