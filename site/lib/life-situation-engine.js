import { normalizeText, tokenize } from './platform-core.js';
import {
  PROFILE_FACTS,
  evaluateMeasureEligibility,
  profileFactAnswer
} from './life-situation-eligibility.js';

export { PROFILE_FACTS };

const situation = (id, title, description, icon, patterns, categories = []) => ({
  id,
  title,
  description,
  icon,
  patterns,
  categories
});

export const LIFE_SITUATIONS = Object.freeze([
  situation('pregnancy', 'Ожидание ребёнка', 'Беременность, отпуск по беременности и родам, медицинское сопровождение.', 'heart-handshake', [
    'беремен', 'пособи.{0,20}беремен', 'женск.{0,20}консультац', 'декрет', 'родов', 'ранн.{0,15}срок'
  ], ['здоров', 'медиц', 'выплат', 'пособ']),
  situation('birth', 'Рождение ребёнка', 'Выплаты и услуги, возникающие в связи с рождением ребёнка.', 'baby', [
    'при рождени', 'рождени.{0,20}ребен', 'новорожден', 'родов', 'свидетельств.{0,15}рожд'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('early-childhood', 'Ребёнок до трёх лет', 'Уход за ребёнком, питание, ясли и выплаты раннего возраста.', 'blocks', [
    'уход.{0,20}ребен', 'до полутора лет', 'до 1[,.]?5', 'до трех лет', 'до 3 лет', 'ясл', 'молочн.{0,15}кухн'
  ], ['выплат', 'пособ', 'образ', 'детсад', 'здоров', 'медиц']),
  situation('low-income', 'Снижение дохода или нуждаемость', 'Адресные выплаты и услуги, зависящие от дохода семьи.', 'wallet-cards', [
    'малоимущ', 'малообеспеч', 'нуждающ.{0,15}сем', 'доход.{0,50}(ниже|не превыш)', 'низк.{0,15}доход', 'невысок.{0,15}доход', 'единое пособ', 'социальн.{0,15}контракт'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('large-family', 'Третий ребёнок или многодетная семья', 'Меры для семей с тремя и более детьми.', 'users-round', [
    'многодет', 'трет.{0,12}ребен', 'трое детей', 'трех и более дет', 'четырех и более дет'
  ], ['выплат', 'пособ', 'жиль', 'ипотек', 'налог', 'льгот']),
  situation('disability', 'Инвалидность или особые потребности ребёнка', 'Выплаты, реабилитация, уход, образование и технические средства.', 'accessibility', [
    'ребен.{0,15}инвалид', 'дет.{0,15}инвалид', 'ограниченн.{0,15}возможност', '(?:^|\\s)овз(?=\\s|$)', 'реабилитац', 'техническ.{0,15}средств', 'уход.{0,20}инвалид'
  ], ['здоров', 'медиц', 'социал', 'льгот', 'образ']),
  situation('adoption', 'Усыновление, опека или приёмная семья', 'Поддержка усыновителей, опекунов и приёмных родителей.', 'hand-heart', [
    'усынов', 'удочер', 'опек', 'попечител', 'приемн.{0,15}сем', 'замещающ.{0,15}сем'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('preschool', 'Детский сад и дошкольное образование', 'Очередь, отсутствие места, компенсация платы и питание.', 'school', [
    'детск.{0,10}сад', 'дошколь', 'не предоставлен.{0,20}мест', 'компенсац.{0,25}родительск.{0,15}плат', 'присмотр.{0,15}уход'
  ], ['образ', 'детсад', 'школ']),
  situation('student-family', 'Студенческая семья', 'Оба супруга учатся в колледже или вузе либо учится единственный родитель; возраст — до 35 лет включительно.', 'book-heart', [
    'студенческ.{0,15}сем', 'родител.{0,12}студент', 'студент.{0,12}родител', 'беременн.{0,15}студент'
  ], ['студенческ', 'образ']),
  situation('education', 'Школа, колледж или вуз', 'Питание, проезд, обучение, общежитие и общие образовательные гарантии.', 'graduation-cap', [
    '(?<!до)школ', 'обучен', 'образован', 'студент', 'вуз', 'университет', 'колледж', 'общежити', 'кружк', 'секци'
  ], ['образ', 'школ', 'проезд', 'транспорт']),
  situation('housing', 'Жилищный вопрос', 'Ипотека, субсидии, земельные участки и улучшение жилищных условий.', 'house', [
    'жиль', 'жилищ', 'ипотек', 'земел.{0,15}участ', 'первоначальн.{0,15}взнос', 'погашен.{0,15}кредит', '(?:^|\\s)жку(?=\\s|$)', '(?:^|\\s)жкх(?=\\s|$)', 'коммунальн', 'газификац'
  ], ['жиль', 'ипотек', 'земел', 'жкх', 'коммун']),
  situation('employment', 'Потеря работы или изменение занятости', 'Содействие занятости, обучение, социальный контракт и выплаты.', 'briefcase-business', [
    'безработ', 'потер.{0,15}работ', 'занятост', 'трудоустрой', 'профессиональн.{0,15}обучен', 'социальн.{0,15}контракт', 'самозанят'
  ], ['работ', 'занят', 'выплат', 'пособ']),
  situation('military', 'Семья военнослужащего', 'Поддержка семей военнослужащих, мобилизованных и ветеранов.', 'shield', [
    'военнослуж', 'мобилиз', 'участник.{0,15}(сво|боев)', 'ветеран.{0,15}боев', 'военн.{0,15}служб'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('breadwinner-loss', 'Потеря кормильца', 'Пенсии, выплаты и услуги после смерти родителя или кормильца.', 'umbrella', [
    'потер.{0,15}кормил', 'смерт.{0,15}родител', 'пенси.{0,20}кормил', 'ребенок сирот', 'дети сирот'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('single-parent', 'Неполная семья или одинокий родитель', 'Меры, связанные с воспитанием ребёнка одним родителем и алиментами.', 'user-round', [
    'неполн.{0,15}сем', 'одинок.{0,15}родител', 'единственн.{0,15}родител', 'одна воспитывает', 'один воспитывает', 'алимент'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('move', 'Переезд или смена регистрации', 'Меры, для которых важны место жительства, регистрация и срок проживания.', 'map-pin-house', [
    'смен.{0,15}регистрац', 'смен.{0,15}мест.{0,15}жительств', 'переезд', 'переселен'
  ], ['социал', 'льгот'])
]);

const compiledPatterns = new Map();
function matchesPattern(text, pattern) {
  const key = String(pattern);
  if (!compiledPatterns.has(key)) compiledPatterns.set(key, new RegExp(key, 'iu'));
  return compiledPatterns.get(key).test(text);
}

function matchingPatterns(text, patterns) {
  return patterns.filter((pattern) => matchesPattern(text, pattern));
}

const constraintDetectors = Object.freeze([
  { label: 'уровень и расчётный период дохода', pattern: /доход|нуждаем|прожиточн|среднедуш/iu },
  { label: 'возраст ребёнка на дату обращения', pattern: /возраст|до \d+ лет|до достижен|старше \d+/iu },
  { label: 'регистрацию и требуемый срок проживания', pattern: /регистрац|проживан|место жительств|пропис/iu },
  { label: 'статус занятости и учитываемые доходы', pattern: /занятост|работа|работодател|самозанят|безработ/iu },
  { label: 'имущественные ограничения', pattern: /имуществ|недвижим|автомобил|земельн.{0,10}участ|вклад/iu },
  { label: 'срок обращения после жизненного события', pattern: /не позднее|в течение \d+|срок обращ|до исполнен/iu }
]);

function buildChecks(text) {
  return constraintDetectors
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => `Проверьте ${label}`);
}

function topicText(value, situationId) {
  // Purposes such as spending maternity capital on education are valid topic
  // evidence even though they are not mandatory recipient conditions.
  let text = normalizeText(String(value ?? '').split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !/сами по себе|сам по себе|не дают права|не дает права/iu.test(sentence)).join(' '));
  if (situationId === 'education') text = text.replace(/дошкольн\p{L}*\s+образован\p{L}*/gu, '');
  return text;
}

/** Eligibility is a three-valued condition check; relevance only orders surviving cards. */
export function scoreMeasureForProfile(measure, profile) {
  const selectedSituation = LIFE_SITUATIONS.find((item) => item.id === profile?.situationId);
  if (!selectedSituation || !measure) return null;
  const eligibility = evaluateMeasureEligibility(measure, profile);
  if (eligibility.status === 'excluded') return null;

  // Category names, benefit amounts, source names and region labels are not evidence
  // that a measure addresses the selected life event.
  const title = topicText(measure.title, selectedSituation.id);
  const text = topicText([measure.title, measure.summary].join(' '), selectedSituation.id);
  const isStudentFamilyMeasure = measure.audiences?.includes('Студенческие семьи');
  const matchedTitle = matchingPatterns(title, selectedSituation.patterns);
  const matchedBody = matchingPatterns(text, selectedSituation.patterns);
  if (selectedSituation.id === 'student-family') {
    if (!isStudentFamilyMeasure && !matchedBody.length) return null;
  } else if (!matchedBody.length) return null;

  let score = matchedTitle.length ? Math.min(7, 4.5 + matchedTitle.length * 0.75)
    : Math.min(5, 2.5 + matchedBody.length * 0.5);
  const reasons = [`Название или описание связано с ситуацией «${selectedSituation.title}»`];
  if (selectedSituation.id === 'student-family' && isStudentFamilyMeasure) {
    score = measure.student_family_relevance === 'targeted' ? 8 : 6;
    reasons.push(measure.student_family_relevance === 'targeted'
      ? 'Мера прямо адресована студенческим семьям или родителям-студентам'
      : 'Мера предусматривает поддержку обучающихся при беременности или рождении ребёнка');
  }
  for (const item of eligibility.matchedFacts) reasons.push(`Подтверждено: ${item.label}`);
  const matchedTokens = tokenize(profile?.query, { minLength: 4 })
    .filter((token) => text.includes(token));
  if (matchedTokens.length) {
    score += Math.min(3.5, matchedTokens.length * 0.9);
    reasons.push(`Дополнительные слова уточняют тему: ${matchedTokens.join(', ')}`);
  }
  if (measure.level === 'regional') {
    score += 0.35;
    reasons.push(`Региональная мера для субъекта «${profile.region}»`);
  } else {
    reasons.push(eligibility.territoryConfirmed
      ? 'Федеральная мера: учтены ограничения территории действия'
      : 'Территорию действия федеральной программы требуется уточнить');
  }
  return {
    measure,
    score: Number(score.toFixed(2)),
    tier: eligibility.status === 'eligible' ? 'high' : 'check',
    eligibility,
    missingFacts: eligibility.missingFacts,
    reasons: [...new Set(reasons)],
    checks: buildChecks(text)
  };
}

export function matchMeasuresToProfile(measures, profile) {
  const ranked = measures
    .map((measure) => scoreMeasureForProfile(measure, profile))
    .filter(Boolean)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'high' ? -1 : 1)
      || b.score - a.score
      || (a.measure.level === b.measure.level ? 0 : a.measure.level === 'regional' ? -1 : 1)
      || String(a.measure.title).localeCompare(String(b.measure.title), 'ru'));
  const questions = new Map();
  for (const result of ranked) {
    for (const item of result.missingFacts) {
      const current = questions.get(item.id);
      questions.set(item.id, { ...item, count: (current?.count ?? 0) + 1 });
    }
  }
  return {
    high: ranked.filter((item) => item.tier === 'high'),
    check: ranked.filter((item) => item.tier === 'check'),
    related: [],
    all: ranked,
    questions: [...questions.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
  };
}

export function profileSummary(profile) {
  const selectedSituation = LIFE_SITUATIONS.find((item) => item.id === profile?.situationId);
  return {
    situation: selectedSituation?.title ?? '',
    region: profile?.region ?? '',
    targetRegion: profile?.targetRegion ?? '',
    facts: PROFILE_FACTS.filter((item) => profileFactAnswer(profile, item.id) === true).map((item) => item.label),
    negativeFacts: PROFILE_FACTS.filter((item) => profileFactAnswer(profile, item.id) === false).map((item) => item.label),
    query: String(profile?.query ?? '').trim()
  };
}
