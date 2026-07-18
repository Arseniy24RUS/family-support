import test from 'node:test';
import assert from 'node:assert/strict';
import { detailShardKey, parseMeasureDetailsHtml, resolveOfficialLinks } from '../scripts/lib/details.mjs';

const measure = {
  id: 'sovetmam:test-measure',
  title: 'Единое пособие на детей и беременных женщин',
  level: 'federal',
  category: 'Выплаты и пособия',
  summary: 'Заявление рассматривает СФР.',
  benefit: 'Ежемесячная выплата'
};

test('извлекает шаги, документы и примечания из подробной карточки', () => {
  const html = `
    <section><h2>Как оформить</h2><ol>
      <li><span>1</span><span>Подайте заявление на Госуслугах</span></li>
      <li><span>2</span><span>Дождитесь решения СФР</span></li>
    </ol></section>
    <section><h2>Какие документы нужны</h2><ul><li>Паспорт</li><li>Свидетельство о рождении</li></ul></section>
    <section><h2><svg><path></path></svg>Полезно знать</h2><ul><li>• Доход оценивают за расчётный период</li></ul></section>
  `;
  const parsed = parseMeasureDetailsHtml(html, measure);
  assert.deepEqual(parsed.steps, ['Подайте заявление на Госуслугах', 'Дождитесь решения СФР']);
  assert.deepEqual(parsed.documents, ['Паспорт', 'Свидетельство о рождении']);
  assert.deepEqual(parsed.notes, ['Доход оценивают за расчётный период']);
  assert.equal(parsed.official_links[0].url, 'https://www.gosuslugi.ru/10630/1/form');
  assert.equal(parsed.official_links[1].url, 'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/edinoe_posobie/');
});

test('внешние ссылки ограничены официальными доменами', () => {
  const links = resolveOfficialLinks({
    ...measure,
    title: 'Статус и удостоверение многодетной семьи'
  });
  assert.deepEqual(links.map((link) => link.url), ['https://www.gosuslugi.ru/600164/1/form']);
  assert.ok(links.every((link) => !new URL(link.url).hostname.includes('sovetmam')));
});

test('не подставляет общую ссылку, если конкретная услуга не проверена', () => {
  const links = resolveOfficialLinks({
    ...measure,
    title: 'Региональная компенсация расходов на школьную форму',
    level: 'regional'
  });
  assert.deepEqual(links, []);
});

test('социальный контракт ведёт сразу к форме заявления', () => {
  const links = resolveOfficialLinks({ ...measure, title: 'Социальный контракт (Тульская область)', level: 'regional' });
  assert.deepEqual(links.map((link) => link.url), ['https://www.gosuslugi.ru/600238/1/form']);
});

test('распределение подробностей по шардам детерминировано', () => {
  assert.equal(detailShardKey(measure.id), detailShardKey(measure.id));
  assert.ok(detailShardKey(measure.id) >= 0 && detailShardKey(measure.id) < 32);
});
