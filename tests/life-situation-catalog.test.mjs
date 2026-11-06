import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchMeasuresToProfile, scoreMeasureForProfile } from '../site/lib/life-situation-engine.js';

const measures = JSON.parse(await readFile(new URL('../site/data/measures.json', import.meta.url), 'utf8'));
const byId = new Map(measures.map((measure) => [measure.id, measure]));

// Fictitious households. Expected conditions come from the catalogue descriptions,
// independently of the matching rules under test.
function family(region, situationId, factAnswers = {}, query = '') {
  return { region, situationId, factAnswers, query };
}

function match(id, profile) {
  assert.ok(byId.has(id), `Regression fixture disappeared from the catalogue: ${id}`);
  return scoreMeasureForProfile(byId.get(id), profile);
}

function missing(result, factId) {
  assert.ok(result);
  assert.equal(result.tier, 'check');
  assert.ok(result.missingFacts.some((fact) => fact.id === factId), `Missing clarification: ${factId}`);
}

const MORDOVIA = 'Республика Мордовия';

test('Mordovia: school-year payment preserves all four alternative family routes', () => {
  const cases = [
    { count: 4, single: false, low: false, expected: 'high' },
    { count: 3, single: true, low: false, expected: 'high' },
    { count: 3, single: false, low: true, expected: 'high' },
    { count: 2, single: true, low: true, expected: 'high' },
    { count: 3, single: false, low: false, expected: null },
    { count: 2, single: false, low: true, expected: null },
    { count: 1, single: true, low: true, expected: null }
  ];
  for (const { count, single, low, expected } of cases) {
    const actual = match('sovetmam:mord-007', family(MORDOVIA, 'education', {
      'four-plus-schoolchildren': count >= 4,
      'three-plus-schoolchildren': count >= 3,
      'two-plus-schoolchildren': count >= 2,
      'single-mother': single,
      'low-income': low
    }));
    assert.equal(actual?.tier ?? null, expected, JSON.stringify({ count, single, low }));
  }
});

test('every catalogue region keeps local and federal housing cards without leaking another region', () => {
  const regions = [...new Set(measures.filter((item) => item.level === 'regional').map((item) => item.region))];
  for (const region of regions) {
    const results = matchMeasuresToProfile(measures, family(region, 'housing'));
    assert.equal(results.all.length, results.high.length + results.check.length);
    assert.ok(results.all.every(({ measure }) => measure.level === 'federal' || measure.region === region), region);
    assert.ok(results.check.every((result) => result.missingFacts.length > 0), region);
  }
});

test('Mordovia: a family with one child retains a general birth benefit without special-category leakage', () => {
  const profile = family(MORDOVIA, 'birth', {
    'three-plus-children': false,
    'child-disabled': false,
    'military-family': false,
    'svo-family': false,
    'conscript-family': false,
    'adoptive-family': false
  });
  assert.ok(match('sovetmam:edinovremennoe-pri-rozhdenii-rebenka', profile));
  assert.equal(match('sovetmam:mord-012', profile), null);
  assert.equal(match('sovetmam:mord-011', profile), null);
  const results = matchMeasuresToProfile(measures, profile);
  assert.ok(results.all.length > 0);
  assert.ok(results.all.every(({ measure }) => measure.level === 'federal' || measure.region === MORDOVIA));
});

test('general maternity support is not made exclusive to student families by its catalogue audience tag', () => {
  assert.ok(match('sovetmam:posobie-po-beremennosti-i-rodam', family(MORDOVIA, 'pregnancy', {
    'student-family': false
  })));
});

test('birth and adoption alternatives do not make general maternity capital exclusive to adoptive or large families', () => {
  assert.ok(match('sovetmam:materinskiy-kapital', family(MORDOVIA, 'birth', {
    'adoptive-family': false, 'three-plus-children': false
  })));
});

test('Mordovia: school meals require both a schoolchild and a large family', () => {
  const id = 'sovetmam:mord-016';
  missing(match(id, family(MORDOVIA, 'education', { 'school-child': true })), 'three-plus-children');
  missing(match(id, family(MORDOVIA, 'education', { 'three-plus-children': true })), 'school-child');
  assert.equal(match(id, family(MORDOVIA, 'education', {
    'three-plus-children': false, 'school-child': true
  })), null);
  assert.equal(match(id, family(MORDOVIA, 'education', {
    'three-plus-children': true, 'school-child': false
  })), null);
  assert.equal(match(id, family(MORDOVIA, 'education', {
    'three-plus-children': true, 'school-child': true
  }))?.tier, 'high');
});

test('Mordovia: a child disability does not establish the specific phenylketonuria condition', () => {
  const id = 'sovetmam:mord-011';
  missing(match(id, family(MORDOVIA, 'disability', { 'child-disabled': true })), 'phenylketonuria');
  assert.equal(match(id, family(MORDOVIA, 'disability', {
    'child-disabled': true, phenylketonuria: false
  })), null);
  assert.equal(match(id, family(MORDOVIA, 'disability', {
    'child-disabled': true, phenylketonuria: true
  }))?.tier, 'high');
});

test('Mordovia: general military service does not establish SVO-specific eligibility', () => {
  const id = 'sovetmam:mord-025';
  missing(match(id, family(MORDOVIA, 'education', { 'military-family': true })), 'svo-family');
  assert.equal(match(id, family(MORDOVIA, 'education', {
    'military-family': true, 'svo-family': false
  })), null);
  assert.equal(match(id, family(MORDOVIA, 'education', {
    'military-family': true, 'svo-family': true
  }))?.tier, 'high');
});

test('Mordovia: low income and large-family status alone do not establish a social scholarship', () => {
  const id = 'sovetmam:mord-008';
  const profile = family(MORDOVIA, 'education', {
    'low-income': true,
    'three-plus-children': true,
    'full-time-budget-student': true,
    'student-orphan': false,
    'student-disabled': false,
    'student-veteran': false
  });
  missing(match(id, profile), 'receives-social-assistance');
  assert.equal(match(id, {
    ...profile, factAnswers: { ...profile.factAnswers, 'receives-social-assistance': false }
  }), null);
  assert.equal(match(id, {
    ...profile, factAnswers: { ...profile.factAnswers, 'receives-social-assistance': true }
  })?.tier, 'high');
});

test('Mordovia: a scholarship alternative remains available without low income or social assistance', () => {
  assert.equal(match('sovetmam:mord-008', family(MORDOVIA, 'education', {
    'full-time-budget-student': true,
    'student-disabled': true,
    'student-orphan': false,
    'student-veteran': false,
    'receives-social-assistance': false,
    'low-income': false,
    'three-plus-children': false
  }))?.tier, 'high');
});

test('Mordovia: disability of an unspecified child does not stand in for disability of the student', () => {
  missing(match('sovetmam:mord-008', family(MORDOVIA, 'education', {
    'full-time-budget-student': true,
    'child-disabled': true,
    'student-orphan': false,
    'student-veteran': false,
    'receives-social-assistance': false
  })), 'student-disabled');
});

test('Mordovia: a housing benefit that explicitly does not test income survives a negative income answer', () => {
  const result = match('sovetmam:zhku-mnogodetnym-mordovia', family(MORDOVIA, 'large-family', {
    'three-plus-children': true,
    'low-income': false
  }));
  assert.ok(result);
  assert.ok(!result.missingFacts.some((fact) => fact.id === 'low-income'));
});

test('other regions: Moscow large-family support cannot appear in Mordovia or Tula', () => {
  const id = 'sovetmam:msk-mnogodetnym-telefon';
  assert.ok(match(id, family('Москва', 'large-family', { 'three-plus-children': true })));
  for (const region of [MORDOVIA, 'Тульская область']) {
    assert.equal(match(id, family(region, 'large-family', { 'three-plus-children': true })), null);
  }
  assert.equal(match(id, family('Москва', 'large-family', { 'three-plus-children': false })), null);
});

test('other regions: the Primorye means-tested birth payment requires the income condition', () => {
  const id = 'sovetmam:prim-001';
  missing(match(id, family('Приморский край', 'birth')), 'low-income');
  assert.equal(match(id, family('Приморский край', 'birth', { 'low-income': false })), null);
  assert.ok(match(id, family('Приморский край', 'birth', { 'low-income': true })));
  assert.equal(match(id, family(MORDOVIA, 'birth', { 'low-income': true })), null);
});

test('federal territorial programmes are excluded outside the Far East and Arctic', () => {
  for (const id of [
    'sovetmam:dalnevostochnaya-arkticheskaya-ipoteka',
    'sovetmam:domrf-arenda-dfo-arktika',
    'sovetmam:dalnevostochnyy-gektar'
  ]) {
    for (const region of [MORDOVIA, 'Москва', 'Тульская область']) {
      assert.equal(match(id, family(region, 'housing', { 'housing-need': true })), null, `${id}: ${region}`);
    }
  }
});

test('Far Eastern and fully Arctic regions retain the relevant federal mortgage programme', () => {
  const id = 'sovetmam:dalnevostochnaya-arkticheskaya-ipoteka';
  for (const region of ['Приморский край', 'Мурманская область']) {
    assert.ok(match(id, family(region, 'housing', { 'housing-need': true })), region);
  }
});

test('a housing programme uses an explicitly selected destination without changing the residence region', () => {
  const profile = {
    ...family(MORDOVIA, 'housing', { 'housing-need': true }),
    targetRegion: 'Приморский край'
  };
  assert.ok(match('sovetmam:dalnevostochnaya-arkticheskaya-ipoteka', profile));
  assert.equal(profile.region, MORDOVIA);
});

test('partly Arctic regions need the municipality rather than blanket inclusion or exclusion', () => {
  const id = 'sovetmam:dalnevostochnaya-arkticheskaya-ipoteka';
  const profile = family('Республика Карелия', 'housing', { 'housing-need': true });
  missing(match(id, profile), 'territory-arctic-municipality');
  assert.equal(match(id, {
    ...profile, factAnswers: { ...profile.factAnswers, 'territory-arctic-municipality': false }
  }), null);
  assert.ok(match(id, {
    ...profile, factAnswers: { ...profile.factAnswers, 'territory-arctic-municipality': true }
  }));
});

test('the conscript benefit cannot be established by generic military-family status', () => {
  const id = 'sovetmam:posobie-beremennoy-zhene-prizyvnika';
  const profile = family('Тульская область', 'pregnancy', { 'military-family': true });
  missing(match(id, profile), 'conscript-family');
  assert.equal(match(id, {
    ...profile, factAnswers: { ...profile.factAnswers, 'conscript-family': false }
  }), null);
});
