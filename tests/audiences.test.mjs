import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateMeasureAudiences, studentFamilyRelevance } from '../scripts/lib/audiences.mjs';

test('marks measures directly addressed to student families', () => {
  const measure = {
    id: 'targeted',
    title: 'Компенсация найма жилья студенческим семьям',
    summary: 'Поддержка семей, где оба родителя обучаются очно.'
  };
  assert.equal(studentFamilyRelevance(measure), 'targeted');
  assert.deepEqual(annotateMeasureAudiences([measure])[0].audiences, ['Студенческие семьи']);
});

test('marks a pregnancy payment to a student as related', () => {
  assert.equal(studentFamilyRelevance({
    id: 'pregnancy',
    title: 'Выплата беременным студенткам',
    summary: 'Единовременная региональная выплата.'
  }), 'related');
});

test('does not confuse a student child from a large family with a student family', () => {
  assert.equal(studentFamilyRelevance({
    id: 'not-a-student-family',
    title: 'Питание студентам из многодетных семей',
    summary: 'Мера предоставляется детям из многодетных семей, обучающимся в колледже.'
  }), null);
});

test('does not combine unrelated parent and student labour guarantees', () => {
  assert.equal(studentFamilyRelevance({
    id: 'labour-rights',
    title: 'Трудовые права беременных, родителей и студентов',
    summary: 'Родителям доступны перерывы на кормление, студентам — учебный отпуск.'
  }), null);
});
