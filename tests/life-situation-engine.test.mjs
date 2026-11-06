import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMeasuresToProfile, scoreMeasureForProfile } from '../site/lib/life-situation-engine.js';

const REGION = 'Республика Мордовия';

function measure(title, summary, extra = {}) {
  return { id: 'example', title, summary, category: 'Выплаты и пособия', level: 'federal', ...extra };
}

function profile(factAnswers = {}, extra = {}) {
  return { region: REGION, situationId: 'housing', factAnswers, query: '', ...extra };
}

const largeFamilyHousing = measure(
  'Помощь с жильём многодетным семьям',
  'Семьям с тремя и более детьми предоставляют выплату на покупку жилья.'
);

function assertNeeds(result, factId) {
  assert.ok(result, 'Карточка с неизвестным условием должна оставаться доступной для уточнения');
  assert.equal(result.tier, 'check');
  assert.equal(result.eligibility.status, 'needs-info');
  assert.ok(result.missingFacts.some((fact) => fact.id === factId), `Нет уточнения ${factId}`);
}

test('a federal birth benefit is found by its actual subject and has an explanation', () => {
  const result = scoreMeasureForProfile(measure(
    'Единовременное пособие при рождении ребёнка',
    'Федеральная выплата одному из родителей.'
  ), profile({}, { situationId: 'birth' }));
  assert.ok(result);
  assert.ok(result.reasons.some((reason) => reason.includes('Рождение ребёнка')));
});

test('a general category plus matching facts and query words cannot replace a topic match', () => {
  const unrelated = measure(
    'Компенсация школьной формы многодетным семьям',
    'Школьникам из многодетных семей компенсируют стоимость формы.'
  );
  assert.equal(scoreMeasureForProfile(unrelated, profile({
    'three-plus-children': true,
    'school-child': true
  }, { situationId: 'birth', query: 'школьной формы многодетным' })), null);
});

test('a matching generic category alone does not produce a result', () => {
  assert.equal(scoreMeasureForProfile(measure(
    'Компенсация стационарного телефона',
    'Возмещение стоимости услуг связи.'
  ), profile({}, { situationId: 'pregnancy', query: 'компенсация телефона' })), null);
});

test('a topic present in the description remains discoverable without a title match', () => {
  const result = scoreMeasureForProfile(measure(
    'Региональная социальная помощь',
    'Родителям компенсируют часть платы за детский сад.',
    { level: 'regional', region: REGION }
  ), profile({}, { situationId: 'preschool' }));
  assert.ok(result);
});

test('a special family category is mandatory, with distinct yes, no and unknown states', () => {
  assertNeeds(scoreMeasureForProfile(largeFamilyHousing, profile()), 'three-plus-children');
  assertNeeds(scoreMeasureForProfile(largeFamilyHousing, profile({ 'three-plus-children': null })), 'three-plus-children');
  assert.equal(scoreMeasureForProfile(largeFamilyHousing, profile({ 'three-plus-children': false })), null);
  const confirmed = scoreMeasureForProfile(largeFamilyHousing, profile({ 'three-plus-children': true }));
  assert.equal(confirmed?.tier, 'high');
  assert.equal(confirmed?.eligibility.status, 'eligible');
});

test('choosing the large-family topic does not silently confirm large-family status', () => {
  assertNeeds(scoreMeasureForProfile(largeFamilyHousing, profile({}, {
    situationId: 'large-family'
  })), 'three-plus-children');
});

test('strong title and query relevance never promote an unknown condition to confirmed', () => {
  assertNeeds(scoreMeasureForProfile(largeFamilyHousing, profile({}, {
    query: 'жильём многодетным семьям покупку жилья'
  })), 'three-plus-children');
});

test('an explicit negative answer takes precedence over a legacy positive fact', () => {
  assert.equal(scoreMeasureForProfile(largeFamilyHousing, profile({
    'three-plus-children': false
  }, { factIds: ['three-plus-children'] })), null);
});

test('legacy positive factIds remain usable while omitted facts are still unknown', () => {
  const confirmed = scoreMeasureForProfile(largeFamilyHousing, {
    region: REGION, situationId: 'housing', factIds: ['three-plus-children'], query: ''
  });
  assert.equal(confirmed?.tier, 'high');
  assertNeeds(scoreMeasureForProfile(largeFamilyHousing, {
    region: REGION, situationId: 'housing', factIds: [], query: ''
  }), 'three-plus-children');
});

test('conjunctive recipient conditions must all be satisfied', () => {
  const bothRequired = measure(
    'Жилищная выплата многодетным малоимущим семьям',
    'Выплату на жильё предоставляют многодетным семьям с доходом ниже прожиточного минимума.'
  );
  assert.equal(scoreMeasureForProfile(bothRequired, profile({
    'three-plus-children': true, 'low-income': false
  })), null);
  assert.equal(scoreMeasureForProfile(bothRequired, profile({
    'three-plus-children': false, 'low-income': true
  })), null);
  assertNeeds(scoreMeasureForProfile(bothRequired, profile({
    'three-plus-children': true
  })), 'low-income');
  assert.equal(scoreMeasureForProfile(bothRequired, profile({
    'three-plus-children': true, 'low-income': true
  }))?.tier, 'high');
});

test('explicit alternative recipient categories do not become cumulative requirements', () => {
  const alternatives = measure(
    'Помощь с жильём малоимущим или многодетным семьям',
    'Малоимущим семьям или многодетным семьям предоставляют помощь с жильём.'
  );
  for (const answers of [
    { 'three-plus-children': true, 'low-income': false },
    { 'three-plus-children': false, 'low-income': true }
  ]) {
    assert.equal(scoreMeasureForProfile(alternatives, profile(answers))?.tier, 'high');
  }
  assert.equal(scoreMeasureForProfile(alternatives, profile({
    'three-plus-children': false, 'low-income': false
  })), null);
  assertNeeds(scoreMeasureForProfile(alternatives, profile({
    'three-plus-children': false
  })), 'low-income');
});

test('an explicit absence of an income test does not require low-income status', () => {
  const noIncomeTest = measure(
    'Помощь с жильём многодетным семьям',
    'Многодетным семьям выплачивают жилищную компенсацию. Доход не проверяют.'
  );
  assert.equal(scoreMeasureForProfile(noIncomeTest, profile({
    'three-plus-children': true, 'low-income': false
  }))?.tier, 'high');
});

test('an inclusive mention of a special category does not exclude other recipients', () => {
  const inclusive = measure(
    'Консультации по жилищным вопросам для всех семей с детьми',
    'Консультации доступны всем семьям с детьми, включая многодетные семьи.'
  );
  assert.ok(scoreMeasureForProfile(inclusive, profile({ 'three-plus-children': false })));
});

test('a different regional jurisdiction cannot be rescued by relevance or positive facts', () => {
  assert.equal(scoreMeasureForProfile({
    ...largeFamilyHousing, level: 'regional', region: 'Москва'
  }, profile({ 'three-plus-children': true }, {
    query: 'Помощь с жильём многодетным семьям'
  })), null);
});

test('matching territory is not itself a topic match', () => {
  assert.equal(scoreMeasureForProfile(measure(
    'Компенсация расходов на связь',
    'Родителям компенсируют расходы на телефон.',
    { level: 'regional', region: REGION }
  ), profile({}, { situationId: 'birth' })), null);
});

test('the student-family audience is distinct from a student who is a child in a large family', () => {
  const studentMeasures = [
    measure('Помощь с жильём студенческим семьям', 'Выплату получают родители-студенты.', {
      id: 'student-parents', audiences: ['Студенческие семьи'], student_family_relevance: 'targeted'
    }),
    measure('Питание студентам из многодетных семей', 'Льгота ребёнку, который учится в колледже.', {
      id: 'student-child'
    })
  ];
  const matches = matchMeasuresToProfile(studentMeasures, profile({}, { situationId: 'student-family' }));
  assert.deepEqual(matches.all.map((item) => item.measure.id), ['student-parents']);
  assertNeeds(matches.all[0], 'student-family');
});

test('all matching cards are returned beyond the former 60-card limit', () => {
  const manyMeasures = Array.from({ length: 85 }, (_, index) => measure(
    `Помощь с жильём многодетным семьям — программа ${String(index + 1).padStart(2, '0')}`,
    'Выплату на покупку жилья предоставляют многодетным семьям.',
    { id: `large-housing-${index}` }
  ));
  const result = matchMeasuresToProfile(manyMeasures, profile({ 'three-plus-children': true }));
  assert.equal(result.all.length, 85);
  assert.equal(result.high.length, 85);
  assert.equal(new Set(result.all.map((entry) => entry.measure.id)).size, 85);
  assert.equal(result.check.length, 0);
  assert.equal(result.related.length, 0);
});

test('clarification groups preserve every card and aggregate each missing fact once per card', () => {
  const result = matchMeasuresToProfile([
    { ...largeFamilyHousing, id: 'first' },
    { ...largeFamilyHousing, id: 'second' }
  ], profile());
  assert.equal(result.all.length, 2);
  assert.equal(result.check.length, 2);
  assert.equal(result.high.length, 0);
  assert.equal(result.related.length, 0);
  const question = result.questions.find((item) => item.id === 'three-plus-children');
  assert.equal(question?.count, 2);
  assert.deepEqual(
    new Set([...result.high, ...result.check].map((entry) => entry.measure.id)),
    new Set(result.all.map((entry) => entry.measure.id))
  );
});
