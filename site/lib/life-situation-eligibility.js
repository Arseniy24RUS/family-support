import { normalizeText } from './platform-core.js';
import { CATALOG_FACTS, CATALOG_REQUIREMENTS } from './life-situation-rules.js';

const fact = (id, label, primary = false) => ({ id, label, primary });

// These answers describe the household, not the topic the visitor wants to explore.
const facts = [
  fact('child-under-3', 'Есть ребёнок младше трёх лет', true),
  fact('three-plus-children', 'В семье трое и более детей', true),
  fact('low-income', 'Доход семьи ниже порога нуждаемости, указанного в мере', true),
  fact('child-disabled', 'У ребёнка установлена инвалидность', true),
  fact('adoptive-family', 'Семья усыновила ребёнка или оформила опеку', true),
  fact('single-parent', 'Ребёнка воспитывает один родитель', true),
  fact('student-family', 'Оба супруга учатся в СПО/вузе либо учится единственный родитель; возраст до 35 лет', true),
  fact('military-family', 'В семье есть военнослужащий или участник боевых действий', true),
  fact('employment-change', 'Изменился статус занятости или снизился трудовой доход', true),
  fact('preschool-no-place', 'Ребёнку не предоставлено место в детском саду', true),
  fact('housing-need', 'Семья признана нуждающейся в улучшении жилищных условий', true),
  fact('rural', 'Семья проживает в сельской местности', true),
  fact('pregnancy', 'В семье ожидается ребёнок'),
  fact('birth-event', 'В семье родился ребёнок'),
  fact('breadwinner-loss', 'Ребёнок потерял родителя или кормильца'),
  fact('school-child', 'В семье есть ребёнок, обучающийся в школе'),
  fact('college-student', 'Получатель меры учится в колледже или техникуме'),
  fact('university-student', 'Получатель меры учится в вузе'),
  fact('child-special-needs', 'У ребёнка установлены ограниченные возможности здоровья (ОВЗ)'),
  fact('adult-disabled', 'У взрослого получателя меры установлена инвалидность'),
  fact('family-disabled', 'У получателя меры или ребёнка установлена инвалидность'),
  fact('svo-family', 'Получатель меры или член семьи — участник СВО'),
  fact('conscript-family', 'Член семьи проходит военную службу по призыву'),
  fact('teacher', 'Получатель меры работает педагогом'),
  fact('it-worker', 'Получатель меры работает в аккредитованной ИТ-компании'),
  fact('young-family', 'Семья соответствует возрастным условиям программы для молодых семей'),
  fact('unemployed', 'Получатель меры не работает и имеет требуемый статус безработного'),
  fact('working-parent', 'Получатель меры работает'),
  fact('long-term-treatment', 'Ребёнку требуется длительное лечение, препятствующее посещению школы'),
  fact('difficult-situation', 'Семья находится в трудной жизненной ситуации, предусмотренной условиями меры'),
  fact('territory-arctic-municipality', 'Жильё или участок находится в муниципалитете, включённом в Арктическую зону РФ'),
  fact('rural-property', 'Жильё находится в населённом пункте из перечня сельских территорий программы'),
  fact('territorial-mortgage-program', 'Жильё и заявитель соответствуют условиям территориальной программы ипотеки'),
  fact('kazan-chelny-residence-5years', 'Семья проживает в Казани или Набережных Челнах не менее пяти лет'),
  fact('first-child-event', 'Мера запрашивается в связи с рождением первого ребёнка'),
  fact('second-child-event', 'Мера запрашивается в связи с рождением второго ребёнка'),
  fact('first-grader', 'Ребёнок поступает в первый класс'),
  fact('child-under-1-5', 'Есть ребёнок младше полутора лет'),
  fact('child-under-6', 'Есть ребёнок младше шести лет'),
  fact('child-under-7', 'Есть ребёнок младше семи лет'),
  fact('four-plus-children', 'В семье четверо и более детей'),
  fact('five-plus-children', 'В семье пятеро и более детей'),
  fact('seven-plus-children', 'В семье семеро и более детей'),
  fact('ten-plus-children', 'В семье десять и более детей')
];

export const PROFILE_FACTS = Object.freeze([...new Map([...facts, ...CATALOG_FACTS]
  .map((item) => [item.id, item])).values()]);
const factsById = new Map(PROFILE_FACTS.map((item) => [item.id, item]));

const parents = {
  'svo-family': ['military-family'],
  'conscript-family': ['military-family'],
  'married-to-conscript': ['conscript-family', 'military-family'],
  'father-conscript': ['conscript-family', 'military-family'],
  'child-disabled': ['family-disabled'],
  'adult-disabled': ['family-disabled'],
  'student-disabled': ['family-disabled'],
  'parent-disabled': ['adult-disabled', 'family-disabled'],
  'child-adopted': ['adoptive-family'],
  'single-mother': ['single-parent'],
  'documented-housing-need': ['housing-need'],
  'third-or-later-child-born-or-adopted': ['three-plus-children'],
  'five-plus-minor-children': ['three-plus-children', 'four-plus-children', 'five-plus-children'],
  'two-plus-schoolchildren': ['school-child'],
  'three-plus-schoolchildren': ['school-child', 'two-plus-schoolchildren', 'three-plus-children'],
  'four-plus-schoolchildren': ['school-child', 'two-plus-schoolchildren', 'three-plus-schoolchildren', 'three-plus-children', 'four-plus-children'],
  'child-under-1-5': ['child-under-3', 'child-under-6', 'child-under-7'],
  'child-under-3': ['child-under-6', 'child-under-7'],
  'child-under-6': ['child-under-7'],
  'four-plus-children': ['three-plus-children'],
  'five-plus-children': ['three-plus-children', 'four-plus-children'],
  'seven-plus-children': ['three-plus-children', 'four-plus-children', 'five-plus-children'],
  'ten-plus-children': ['three-plus-children', 'four-plus-children', 'five-plus-children', 'seven-plus-children'],
  'first-grader': ['school-child']
};

function rawAnswer(profile, id) {
  if (Object.hasOwn(profile?.factAnswers ?? {}, id)) {
    const answer = profile.factAnswers[id];
    return answer === true || answer === false ? answer : null;
  }
  if (profile?.factIds?.includes(id)) return true;
  return null;
}

export function profileFactAnswer(profile, id) {
  const answer = rawAnswer(profile, id);
  // A more specific answer never overrides an explicit contradictory general answer.
  if ((parents[id] ?? []).some((parent) => rawAnswer(profile, parent) === false)) return false;
  if (answer !== null) return answer;
  if (Object.entries(parents).some(([child, broader]) => broader.includes(id)
    && rawAnswer(profile, child) === true)) return true;
  return null;
}

const all = (...conditions) => ({ all: conditions.flat().filter((item) => item !== true) });
const any = (...conditions) => ({ any: conditions.flat() });
const unique = (values) => [...new Set(values)];

function evaluate(expression, profile) {
  if (expression === true || expression == null) return { value: true, missing: [], matched: [] };
  if (expression === false) return { value: false, missing: [], matched: [] };
  if (typeof expression === 'string') {
    const value = profileFactAnswer(profile, expression);
    return { value, missing: value === null ? [expression] : [], matched: value === true ? [expression] : [] };
  }
  const isAny = Array.isArray(expression.any);
  const children = isAny ? expression.any : expression.all;
  if (!Array.isArray(children)) return { value: null, missing: [], matched: [] };
  const results = children.map((child) => evaluate(child, profile));
  if (isAny) {
    const satisfied = results.filter((result) => result.value === true);
    if (satisfied.length) return { value: true, missing: [], matched: unique(satisfied.flatMap((r) => r.matched)) };
    const viable = results.filter((result) => result.value !== false);
    return { value: viable.length ? null : false, missing: unique(viable.flatMap((r) => r.missing)), matched: [] };
  }
  if (results.some((result) => result.value === false)) return { value: false, missing: [], matched: [] };
  return {
    value: results.every((result) => result.value === true) ? true : null,
    missing: unique(results.flatMap((result) => result.missing)),
    matched: unique(results.flatMap((result) => result.matched))
  };
}

// Geographic coverage is separate from the financing level of the programme.
// Territory lists: https://erdc.ru/about-azrf/ and the DFO regions in the government
// spatial development strategy: https://static.government.ru/media/files/NAlSPJ8QMRZUPd9LIMWJoeVhn1l6eGqD.pdf
const FAR_EAST = [
  'Республика Бурятия', 'Республика Саха (Якутия)', 'Забайкальский край',
  'Камчатский край', 'Приморский край', 'Хабаровский край', 'Амурская область',
  'Магаданская область', 'Сахалинская область', 'Еврейская автономная область', 'Чукотский автономный округ'
].map(normalizeText);
const ARCTIC_FULL = ['Мурманская область', 'Ненецкий автономный округ', 'Ямало-Ненецкий автономный округ', 'Чукотский автономный округ'].map(normalizeText);
const ARCTIC_PARTIAL = ['Республика Карелия', 'Республика Коми', 'Республика Саха (Якутия)',
  'Архангельская область', 'Красноярский край', 'Ханты-Мансийский автономный округ — Югра'].map(normalizeText);
const FAR_EAST_ARCTIC_PROGRAMS = new Set([
  'sovetmam:dalnevostochnaya-arkticheskaya-ipoteka',
  'sovetmam:domrf-arenda-dfo-arktika',
  'sovetmam:dalnevostochnyy-gektar'
]);

function regionKey(value) {
  return normalizeText(value).replace(/^республика татарстан татарстан$/u, 'республика татарстан');
}

function territoryCondition(measure, profile) {
  const region = regionKey(profile?.region);
  if (measure?.level !== 'federal') {
    if (!region || regionKey(measure?.region) !== region) return false;
    if (measure.id === 'sovetmam:rtadd-001') return 'kazan-chelny-residence-5years';
    return true;
  }
  // Some imported federal records also provide an explicit programme region.
  if (measure.region && !/вся россия|российская федерация|все регионы/iu.test(measure.region)
    && regionKey(measure.region) !== region) return false;
  const target = regionKey(profile?.targetRegion || profile?.region);
  if (Array.isArray(measure?.territory?.regions)
    && !measure.territory.regions.some((item) => regionKey(item) === target)) return false;
  const title = normalizeText(measure.title);
  const farEastArctic = FAR_EAST_ARCTIC_PROGRAMS.has(measure.id)
    || /дальневосточн.{0,15}арктическ|дальн(?:ий|ем) восток.{0,15}арктик/u.test(title);
  if (farEastArctic) {
    if (FAR_EAST.includes(target) || ARCTIC_FULL.includes(target)) return true;
    if (ARCTIC_PARTIAL.includes(target)) return 'territory-arctic-municipality';
    return false;
  }
  if (measure.id === 'sovetmam:lgotnye-ipoteki-territorii-it') {
    // This card contains two alternative programmes. Restrict each branch separately.
    const territorial = ['Донецкая Народная Республика', 'Луганская Народная Республика',
      'Запорожская область', 'Херсонская область', 'Курская область', 'Белгородская область']
      .map(regionKey).includes(target);
    const it = !['москва', 'санкт петербург'].includes(target);
    return any(...(territorial ? ['territorial-mortgage-program'] : []), ...(it ? ['it-worker'] : []));
  }
  if (measure.id === 'sovetmam:selskaya-ipoteka') return 'rural-property';
  return true;
}

// Discard mentions of enhanced amounts, examples and explicitly non-required statuses.
// Neither an optional entitlement branch nor a document mentioned "if applicable"
// makes its category compulsory for all recipients.
export function conditionText(value) {
  return String(value ?? '')
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !/^(?:Для отдельных категорий|Повышенный размер)|сами по себе|сам по себе|не дают права|не дает права/iu.test(sentence))
    .map((sentence) => sentence
      .replace(/([,;]\s*)повышенн\S*.*/iu, '')
      .replace(/(?:можно направить|может быть направлен).*/iu, '')
      .replace(/(?:,?\s*(?:в том числе|включая|например)\s).*/iu, (match, offset) =>
        /льготн|отдельн.{0,15}категор|незащищ/iu.test(sentence.slice(0, offset)) ? match : '')
      .replace(/(?:,?\s*(?:а|но)\s+)?(?:малообеспеченн|малоимущ)\S*\s+семьям\s*[—–-].*/iu, '')
      .replace(/(?:независимо от|без учета|без учёта).{0,60}(?:дохода|нуждаемости|многодетности|инвалидности)/giu, '')
      .replace(/доход\S*\s+(?:не\s+(?:проверя\S*|учитыва\S*)|не\s+требуется)/giu, ''))
    .join(' ');
}

const categoryDetectors = [
  ['three-plus-children', /многодет\p{L}*|трет(?:ьего|ий|ьим|ьему|ьих)|трое детей|(?:трех|тремя) и более дет|3\s*\+\s*дет/gu],
  ['low-income', /малоимущ\p{L}*|малообеспеч\p{L}*|(?:низк\p{L}*|невысок\p{L}*)\s+доход\p{L}*|доход\p{L}*.{0,45}(?:ниже|не превыша)|нуждающ\p{L}*\s+сем\p{L}*/gu],
  ['child-disabled', /(?:ребен\p{L}*|дет\p{L}*)\s+(?:с\s+)?инвалид\p{L}*|инвалидност\p{L}*\s+ребен\p{L}*/gu],
  ['adult-disabled', /родител\p{L}*\s+(?:с\s+)?инвалид\p{L}*|инвалидност\p{L}*\s+родител\p{L}*/gu],
  ['family-disabled', /инвалид\p{L}*/gu],
  ['child-special-needs', /(?:^|\s)овз(?=\s|$)|ограниченн\p{L}*\s+возможност\p{L}*\s+здоровья/gu],
  ['svo-family', /участник\p{L}*\s+сво|сем\p{L}*\s+участник\p{L}*\s+сво|военнослуж\p{L}*\s+сво|специальн\p{L}*\s+военн\p{L}*\s+операци\p{L}*/gu],
  ['conscript-family', /военнослуж\p{L}*\s+по\s+призыву|(?:жене|семь\p{L}*|дет\p{L}*|ребен\p{L}*)\s+призывник\p{L}*/gu],
  ['military-family', /военнослуж\p{L}*|мобилизован\p{L}*|ветеран\p{L}*\s+боев\p{L}*/gu],
  ['single-parent', /одинок\p{L}*\s+(?:матер\p{L}*|мам\p{L}*|родител\p{L}*|отц\p{L}*)|единственн\p{L}*\s+родител\p{L}*|неполн\p{L}*\s+сем\p{L}*/gu],
  ['student-family', /студенческ\p{L}*\s+сем\p{L}*|семь\p{L}*\s+студент\p{L}*|родител\p{L}*\s+студент\p{L}*/gu],
  ['adoptive-family', /усыновител\p{L}*|удочерител\p{L}*|приемн\p{L}*\s+(?:сем\p{L}*|родител\p{L}*)|замещающ\p{L}*\s+сем\p{L}*|опекун\p{L}*/gu],
  ['difficult-situation', /трудн\p{L}*\s+жизненн\p{L}*\s+ситуаци\p{L}*/gu],
  ['breadwinner-loss', /потер\p{L}*\s+кормильц\p{L}*|погибш\p{L}*\s+(?:родител\p{L}*|военнослуж\p{L}*)/gu]
];

function detectedCategories(text) {
  const found = [];
  for (const [id, pattern] of categoryDetectors) {
    for (const match of text.matchAll(pattern)) found.push({ id, start: match.index, end: match.index + match[0].length });
  }
  // Specific service categories already imply military affiliation. Keep the stricter one.
  const filtered = found.filter((item) => {
    const moreSpecific = item.id === 'military-family' ? ['svo-family', 'conscript-family']
      : item.id === 'family-disabled' ? ['child-disabled', 'adult-disabled'] : [];
    return !found.some((other) => moreSpecific.includes(other.id)
      && other.start <= item.end && other.end >= item.start);
  });
  return filtered.sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((item, index, array) => array.findIndex((other) => other.id === item.id) === index);
}

function categoryExpression(text) {
  const found = detectedCategories(text);
  if (!found.length) return { expression: true, ids: [] };
  const groups = [[found[0].id]];
  for (let index = 1; index < found.length; index += 1) {
    const between = text.slice(found[index - 1].end, found[index].start).trim();
    // Enumerations name alternative recipient categories. Qualifying phrases such
    // as "семьям с доходом ниже..." instead introduce another required condition.
    const alternative = /(?:,|(?:^|\s)(?:или|либо|и|а также)(?:\s|$))/u.test(between)
      && !/(?:^|\s)(?:котор|при\s|имеющ|воспитывающ|если\s|где\s|нуждающ)/u.test(between);
    if (alternative) groups.at(-1).push(found[index].id);
    else groups.push([found[index].id]);
  }
  return { expression: all(groups.map((group) => group.length === 1 ? group[0] : any(group))), ids: found.map((item) => item.id) };
}

function genericRequirements(measure) {
  const normalizeConditions = (value) => conditionText(value).replace(/(\d),(\d)/gu, '$1.$2')
    .split(',').map(normalizeText).join(', ');
  const title = normalizeConditions(measure.title);
  const summary = normalizeConditions(measure.summary);
  const text = `${title} ${summary}`;
  const titleCategories = categoryExpression(title);
  const summaryCategories = categoryExpression(summary);
  // Descriptions can explicitly broaden the shortened title with alternative recipients.
  const clauses = [summaryCategories.expression];
  if (!titleCategories.ids.every((id) => summaryCategories.ids.includes(id))) clauses.push(titleCategories.expression);
  if (!summaryCategories.ids.length) clauses.push(titleCategories.expression);

  if (/(?:^|\s)школьн|школах|ученик|первоклассник|общеобразовательн/u.test(text)) clauses.push('school-child');
  if (/первоклассник|первый класс/u.test(text)) clauses.push('first-grader');
  if (/(?:студент|обучающ)\p{L}*.{0,25}(?:колледж|техникум)|в колледжах|студентам колледжей/u.test(text)) clauses.push('college-student');
  if (/сельск\p{L}*\s+(?:сем\p{L}*|местност\p{L}*|территори\p{L}*)|на селе/u.test(text)
    && measure.id !== 'sovetmam:selskaya-ipoteka') clauses.push('rural');
  if (/молод\p{L}*\s+сем\p{L}*/u.test(text)) clauses.push('young-family');
  if (/учител\p{L}*|педагог\p{L}*/u.test(title)) clauses.push('teacher');
  if (/безработ\p{L}*/u.test(title)) clauses.push('unemployed');
  if (/беременн/u.test(title) && !/детей и беременных|родителей беременных/u.test(title)) clauses.push('pregnancy');
  if (/при рождении первого ребенка/u.test(text)) clauses.push('first-child-event');
  if (/при рождении второго ребенка/u.test(text) && !/второго и последующих/u.test(text)) clauses.push('second-child-event');

  const quantitative = [
    ['child-under-1-5', /до (?:1[,.\s]5|полутора) (?:лет|год)/u],
    ['child-under-3', /до (?:3|трех) лет|младше (?:3|трех) лет/u],
    ['child-under-6', /до (?:6|шести) лет/u],
    ['child-under-7', /до (?:7|семи) лет/u],
    ['four-plus-children', /(?:четырьмя|четырех|четверых|четверо|4)\s*(?:и более|\+)\s*дет/u],
    ['five-plus-children', /(?:пятью|пяти|пятерых|пятеро|5)\s*(?:и более|\+)\s*дет/u],
    ['seven-plus-children', /(?:семью|семи|семерых|семеро|7)\s*(?:и более|\+)\s*дет/u],
    ['ten-plus-children', /(?:десятью|десяти|десятерых|десять|10)\s*(?:и более|\+)\s*дет/u]
  ];
  for (const [id, pattern] of quantitative) if (pattern.test(text)) clauses.push(id);
  // An explicit audience annotation is a useful condition but never a score bonus.
  if (measure.audiences?.includes('Студенческие семьи') && !titleCategories.ids.length && !summaryCategories.ids.length
    && measure.student_family_relevance !== 'related') clauses.push('student-family');
  return all(clauses);
}

const requirementCache = new WeakMap();
function requirementsFor(measure) {
  if (requirementCache.has(measure)) return requirementCache.get(measure);
  let expression;
  if (Object.hasOwn(CATALOG_REQUIREMENTS, measure.id)) expression = CATALOG_REQUIREMENTS[measure.id];
  else if (measure.id === 'sovetmam:lgotnye-ipoteki-territorii-it') expression = true;
  else expression = genericRequirements(measure);
  requirementCache.set(measure, expression);
  return expression;
}

export function evaluateMeasureEligibility(measure, profile) {
  const territorial = territoryCondition(measure, profile);
  if (territorial === false) return { status: 'excluded', missingFacts: [], matchedFacts: [] };
  const result = evaluate(all(territorial, requirementsFor(measure)), profile);
  return {
    status: result.value === false ? 'excluded' : result.value === null ? 'needs-info' : 'eligible',
    missingFacts: result.missing.map((id) => factsById.get(id) ?? { id, label: id, primary: false }),
    matchedFacts: result.matched.map((id) => factsById.get(id) ?? { id, label: id, primary: false }),
    territoryConfirmed: evaluate(territorial, profile).value === true
  };
}
