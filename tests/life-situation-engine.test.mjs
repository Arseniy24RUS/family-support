import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMeasuresToProfile, scoreMeasureForProfile } from '../site/lib/life-situation-engine.js';

const measures = [
  {
    id: 'federal-birth',
    title: 'Единовременное пособие при рождении ребёнка',
    summary: 'Федеральная выплата одному из родителей.',
    category: 'Денежные выплаты',
    level: 'federal'
  },
  {
    id: 'moscow-large',
    title: 'Региональный капитал многодетной семье',
    summary: 'Предоставляется при рождении третьего ребёнка.',
    category: 'Денежные выплаты',
    level: 'regional',
    region: 'Москва'
  },
  {
    id: 'tula-kindergarten',
    title: 'Компенсация платы за детский сад',
    summary: 'Региональная мера дошкольного образования.',
    category: 'Образование',
    level: 'regional',
    region: 'Тульская область'
  },
  {
    id: 'student-family-housing',
    title: 'Компенсация найма жилья студенческим семьям',
    summary: 'Семье родителей-студентов компенсируют аренду жилья.',
    category: 'Жильё',
    audiences: ['Студенческие семьи'],
    student_family_relevance: 'targeted',
    level: 'regional',
    region: 'Москва'
  },
  {
    id: 'student-from-large-family',
    title: 'Питание студентам из многодетных семей',
    summary: 'Льгота ребёнку из многодетной семьи, который учится в колледже.',
    category: 'Образование',
    level: 'regional',
    region: 'Москва'
  }
];

test('matcher explains a relevant federal birth benefit', () => {
  const result = scoreMeasureForProfile(measures[0], {
    region: 'Москва',
    situationId: 'birth',
    factIds: [],
    query: ''
  });
  assert.ok(result);
  assert.equal(result.measure.id, 'federal-birth');
  assert.ok(result.reasons.some((reason) => reason.includes('Рождение ребёнка')));
});

test('matcher excludes a regional measure from another selected region', () => {
  const result = scoreMeasureForProfile(measures[2], {
    region: 'Москва',
    situationId: 'preschool',
    factIds: [],
    query: ''
  });
  assert.equal(result, null);
});

test('selected family facts increase relevance transparently', () => {
  const withoutFact = scoreMeasureForProfile(measures[1], {
    region: 'Москва', situationId: 'birth', factIds: [], query: ''
  });
  const withFact = scoreMeasureForProfile(measures[1], {
    region: 'Москва', situationId: 'birth', factIds: ['three-plus-children'], query: ''
  });
  assert.ok(withFact.score > withoutFact.score);
  assert.ok(withFact.reasons.some((reason) => reason.includes('трое и более')));
});

test('results are grouped without claiming legal eligibility', () => {
  const result = matchMeasuresToProfile(measures, {
    region: 'Москва', situationId: 'large-family', factIds: ['three-plus-children'], query: ''
  });
  assert.ok(result.all.length > 0);
  assert.equal(result.all[0].measure.id, 'moscow-large');
  assert.ok(['high', 'check', 'related'].includes(result.all[0].tier));
});

test('student-family situation uses the explicit cross-cutting audience', () => {
  const result = matchMeasuresToProfile(measures, {
    region: 'Москва', situationId: 'student-family', factIds: [], query: ''
  });
  assert.deepEqual(result.all.map((item) => item.measure.id), ['student-family-housing']);
  assert.ok(result.all[0].reasons.some((reason) => reason.includes('прямо адресована')));
});
