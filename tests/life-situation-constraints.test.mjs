import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMeasureEligibility, PROFILE_FACTS } from '../site/lib/life-situation-eligibility.js';
import { scoreMeasureForProfile } from '../site/lib/life-situation-engine.js';

const catalogue = JSON.parse(readFileSync(new URL('../site/data/measures.json', import.meta.url), 'utf8'));
const measures = new Map(catalogue.map((measure) => [measure.id, measure]));
const federalRegion = 'Республика Мордовия';

function measure(id) {
  const result = measures.get(`sovetmam:${id}`);
  assert.ok(result, `Missing catalogue fixture: ${id}`);
  return result;
}

function profile(id, factAnswers = {}, extra = {}) {
  return { region: measure(id).region || federalRegion, situationId: 'housing', factAnswers, ...extra };
}

function status(id, factAnswers, extra) {
  return evaluateMeasureEligibility(measure(id), profile(id, factAnswers, extra)).status;
}

function result(id, factAnswers, situationId, extra = {}) {
  return scoreMeasureForProfile(measure(id), profile(id, factAnswers, { situationId, ...extra }));
}

const allNo = () => Object.fromEntries(PROFILE_FACTS.map((fact) => [fact.id, false]));

test('regional medicines preserve both age routes in eight independent regions', () => {
  const ids = ['vol-031', 'kostroma-012', 'psk-001', 'hak-008', 'sve-019', 'tamb-005', 'tver-029', 'khab-008'];
  for (const id of ids) {
    assert.equal(status(id, { 'child-under-3': true, 'three-plus-children': false }), 'eligible', `${id}: ordinary toddler`);
    assert.equal(status(id, { 'child-under-3': false, 'child-under-6': true, 'three-plus-children': true }), 'eligible', `${id}: four-year-old in large family`);
    assert.equal(status(id, { 'child-under-3': false, 'child-under-6': true, 'three-plus-children': false }), 'excluded', `${id}: no qualifying age/category route`);
  }
});

test('Tyumen medicine income condition applies to both age routes', () => {
  for (const ages of [
    { 'child-under-3': true, 'three-plus-children': false },
    { 'child-under-3': false, 'child-under-6': true, 'three-plus-children': true }
  ]) {
    assert.equal(status('tyumen-007', { ...ages, 'low-income': false }), 'excluded');
    assert.equal(status('tyumen-007', { ...ages, 'low-income': true }), 'eligible');
    assert.equal(status('tyumen-007', ages), 'needs-info');
  }
});

test('Yamal medicines retain Indigenous, psychiatric and SVO alternatives', () => {
  assert.equal(status('yamal-007', {
    'child-under-3': false, 'child-under-6': true, 'three-plus-children': false,
    'indigenous-small-numbered-north': true
  }), 'eligible');
  assert.equal(status('yamal-007', {
    'child-under-3': false, 'child-under-6': false, 'three-plus-children': false,
    'child-under-18': true, 'child-mental-disorder': true
  }), 'eligible');
  assert.equal(status('yamal-007', {
    'child-under-3': false, 'child-under-6': false, 'three-plus-children': false,
    'child-mental-disorder': false, 'svo-family': true
  }), 'eligible');
  assert.equal(status('yamal-007', allNo()), 'excluded');
});

test('Yaroslavl medicines retain children of deceased service members as a separate route', () => {
  assert.equal(status('yarosl-003', {
    'child-under-3': false, 'child-under-6': false, 'three-plus-children': false,
    'child-of-deceased-service-member': true
  }), 'eligible');
  assert.equal(status('yarosl-003', {
    'child-under-3': false, 'child-under-6': false, 'three-plus-children': false
  }), 'needs-info');
  assert.equal(status('yarosl-003', allNo()), 'excluded');
});

test('Chernobyl compensation requires its specific beneficiary category', () => {
  assert.equal(status('kompensaciya-zhku-chernobyl', {}), 'needs-info');
  assert.equal(status('kompensaciya-zhku-chernobyl', { 'chernobyl-beneficiary': false }), 'excluded');
  assert.equal(status('kompensaciya-zhku-chernobyl', { 'chernobyl-beneficiary': true }), 'eligible');
});

test('employer programmes are not promised to every employed parent', () => {
  assert.equal(status('matkapital-ot-rabotodatelya', { 'birth-event': true, 'working-parent': true }), 'needs-info');
  assert.equal(status('matkapital-ot-rabotodatelya', { 'birth-event': true, 'employer-birth-program': false }), 'excluded');
  assert.equal(status('matkapital-ot-rabotodatelya', { 'birth-event': true, 'employer-birth-program': true }), 'eligible');
  assert.equal(status('pomoshch-s-zhilyem-ot-rabotodatelya', { 'working-parent': true }), 'needs-info');
  assert.equal(status('pomoshch-s-zhilyem-ot-rabotodatelya', { 'employer-housing-program': false }), 'excluded');
  assert.equal(status('pomoshch-s-zhilyem-ot-rabotodatelya', { 'employer-housing-program': true }), 'eligible');
});

test('specialist housing preserves urban scientist and housing-cooperative routes', () => {
  assert.equal(status('zhilishchnye-programmy-specialistov', {
    rural: false, 'rural-specialist-program': false, 'scientist-housing-program': true
  }), 'eligible');
  assert.equal(status('zhilishchnye-programmy-specialistov', {
    rural: false, 'rural-specialist-program': false, 'scientist-housing-program': false,
    'supported-housing-cooperative': true
  }), 'eligible');
  assert.equal(status('zhilishchnye-programmy-specialistov', { rural: true }), 'needs-info');
  assert.equal(status('zhilishchnye-programmy-specialistov', allNo()), 'excluded');
});

test('care allowance requires the under-1.5 age limit and a qualifying caregiver route', () => {
  const parent = {
    'child-under-1-5': true, 'childcare-caregiver': true,
    'working-parent': true, 'childcare-leave-or-retained-benefit': true
  };
  assert.equal(status('posobie-po-uhodu-do-1-5-let', parent), 'eligible');
  assert.equal(status('posobie-po-uhodu-do-1-5-let', { ...parent, 'child-under-1-5': false }), 'excluded');
  assert.equal(status('posobie-po-uhodu-do-1-5-let', { ...parent, 'childcare-caregiver': false }), 'excluded');
  assert.equal(status('posobie-po-uhodu-do-1-5-let', { 'child-under-1-5': true }), 'needs-info');
});

test('care allowance does not exclude non-working parents or full-time student mothers', () => {
  for (const route of ['nonworking-without-unemployment-benefit', 'full-time-student-mother', 'entrepreneur-caregiver']) {
    assert.equal(status('posobie-po-uhodu-do-1-5-let', {
      'child-under-1-5': true, 'childcare-caregiver': true,
      'working-parent': false, 'childcare-leave-or-retained-benefit': false, [route]: true
    }), 'eligible', route);
  }
});

test('merit scholarships require a student and achievements', () => {
  assert.equal(status('stipendii-prezidentskie-imennye', { 'university-student': true }), 'needs-info');
  assert.equal(status('stipendii-prezidentskie-imennye', { 'university-student': true, 'student-achievements': false }), 'excluded');
  assert.equal(status('stipendii-prezidentskie-imennye', { 'university-student': true, 'student-achievements': true }), 'eligible');
  assert.equal(status('stipendii-prezidentskie-imennye', {
    'university-student': false, 'college-student': false, 'full-time-budget-student': false,
    'student-achievements': true
  }), 'excluded');
});

test('maternity allowance preserves working, student and liquidation-dismissal routes', () => {
  for (const route of ['working-parent', 'full-time-student-mother', 'eligible-liquidation-dismissal']) {
    assert.equal(status('posobie-po-beremennosti-i-rodam', {
      'maternity-benefit-recipient': true, [route]: true
    }), 'eligible', route);
  }
  assert.equal(status('posobie-po-beremennosti-i-rodam', {
    'maternity-benefit-recipient': true, 'working-parent': false,
    'full-time-student-mother': false, 'eligible-liquidation-dismissal': false
  }), 'excluded');
});

test('a disability mention in an alternative list is not compulsory for all legal-aid recipients', () => {
  assert.equal(status('besplatnaya-yuridicheskaya-pomoshch', {
    'low-income': true, 'three-plus-children': false,
    'family-disabled': false, 'svo-family': false
  }), 'eligible');
  assert.equal(status('krd-010', {
    'three-plus-children': true, 'low-income': false,
    'family-disabled': false, 'svo-family': false
  }), 'eligible');
});

test('school-clothing support excludes a family without schoolchildren', () => {
  assert.equal(status('msk-mnogodetnym-odezhda', { 'three-plus-children': true, 'school-child': false }), 'excluded');
  assert.equal(status('msk-mnogodetnym-odezhda', { 'three-plus-children': true, 'school-child': true }), 'eligible');
});

test('enhanced-payment wording does not erase basic income and child-count conditions', () => {
  assert.equal(status('bsh-002', { 'three-plus-children': true, 'four-plus-children': false, 'low-income': false }), 'excluded');
  assert.equal(status('bsh-002', { 'three-plus-children': true, 'four-plus-children': true, 'low-income': true }), 'eligible');
});

test('enumerated recipient routes remain alternatives across real regional records', () => {
  assert.equal(status('yamal-015', { 'svo-family': true, 'low-income': false }), 'eligible');
  assert.equal(status('arh-012', { 'svo-family': true, 'difficult-situation': false }), 'eligible');
  assert.equal(status('kbr-020', { 'three-plus-children': true, 'child-disabled': false, 'svo-family': false }), 'eligible');
});

test('purpose clauses, utilities and Cyrillic OVZ remain discoverable by topic', () => {
  assert.ok(result('materinskiy-kapital', { 'birth-event': true }, 'housing'));
  assert.ok(result('materinskiy-kapital', { 'birth-event': true }, 'education'));
  assert.ok(result('kbr-007', { 'three-plus-children': true }, 'housing'));
  assert.ok(result('khab-014', {
    'child-special-needs': true, 'low-income': false, 'college-student': true
  }, 'disability'));
});

test('the short and official Татарстан names address the same regional measures', () => {
  for (const region of ['Республика Татарстан', 'Республика Татарстан (Татарстан)']) {
    assert.equal(status('rtadd-008', { 'kindergarten-fee': true }, { region }), 'eligible');
  }
});
