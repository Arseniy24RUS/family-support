import { measureMatchesRegion, measureSearchText, normalizeText, tokenize } from './platform-core.js';

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
    'малоимущ', 'нуждаем', 'среднедуш', 'прожиточн.{0,15}миним', 'низк.{0,15}доход', 'единое пособ', 'социальн.{0,15}контракт'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('large-family', 'Третий ребёнок или многодетная семья', 'Меры для семей с тремя и более детьми.', 'users-round', [
    'многодет', 'трет.{0,12}ребен', 'трое детей', 'трех и более дет', 'четырех и более дет', 'региональн.{0,15}капитал'
  ], ['выплат', 'пособ', 'жиль', 'ипотек', 'налог', 'льгот']),
  situation('disability', 'Инвалидность или особые потребности ребёнка', 'Выплаты, реабилитация, уход, образование и технические средства.', 'accessibility', [
    'ребен.{0,15}инвалид', 'дет.{0,15}инвалид', 'ограниченн.{0,15}возможност', '\\bовз\\b', 'реабилитац', 'техническ.{0,15}средств', 'уход.{0,20}инвалид'
  ], ['здоров', 'медиц', 'социал', 'льгот', 'образ']),
  situation('adoption', 'Усыновление, опека или приёмная семья', 'Поддержка усыновителей, опекунов и приёмных родителей.', 'hand-heart', [
    'усынов', 'удочер', 'опек', 'попечител', 'приемн.{0,15}сем', 'замещающ.{0,15}сем'
  ], ['выплат', 'пособ', 'социал', 'льгот']),
  situation('preschool', 'Детский сад и дошкольное образование', 'Очередь, отсутствие места, компенсация платы и питание.', 'school', [
    'детск.{0,10}сад', 'дошколь', 'не предоставлен.{0,20}мест', 'компенсац.{0,25}родительск.{0,15}плат', 'присмотр.{0,15}уход'
  ], ['образ', 'детсад', 'школ']),
  situation('education', 'Школа, колледж, вуз или студенческая семья', 'Питание, проезд, обучение, общежитие и поддержка студентов-родителей.', 'graduation-cap', [
    'школ', 'обучен', 'образован', 'студент', 'вуз', 'университет', 'колледж', 'общежити', 'школьн.{0,15}питан'
  ], ['образ', 'школ', 'проезд', 'транспорт']),
  situation('housing', 'Жилищный вопрос', 'Ипотека, субсидии, земельные участки и улучшение жилищных условий.', 'house', [
    'жиль', 'жилищ', 'ипотек', 'земел.{0,15}участ', 'первоначальн.{0,15}взнос', 'погашен.{0,15}кредит'
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
    'регистрац', 'мест.{0,15}жительств', 'мест.{0,15}пребыван', 'проживан.{0,20}регион', 'пропис', 'переезд'
  ], ['социал', 'льгот'])
]);

const fact = (id, label, patterns) => ({ id, label, patterns });

export const PROFILE_FACTS = Object.freeze([
  fact('child-under-3', 'Есть ребёнок младше трёх лет', ['до трех лет', 'до 3 лет', 'ранн.{0,15}возраст', 'уход.{0,15}ребен', 'ясл']),
  fact('three-plus-children', 'В семье трое и более детей', ['многодет', 'трое детей', 'трех и более дет', 'трет.{0,12}ребен']),
  fact('low-income', 'Доход семьи предположительно ниже регионального порога', ['малоимущ', 'нуждаем', 'среднедуш', 'прожиточн.{0,15}миним', 'низк.{0,15}доход', 'единое пособ']),
  fact('child-disabled', 'У ребёнка установлена инвалидность или ОВЗ', ['ребен.{0,15}инвалид', 'дет.{0,15}инвалид', '\\bовз\\b', 'ограниченн.{0,15}возможност']),
  fact('adoptive-family', 'Семья усыновила ребёнка или оформила опеку', ['усынов', 'удочер', 'опек', 'попечител', 'приемн.{0,15}сем']),
  fact('single-parent', 'Ребёнка воспитывает один родитель', ['неполн.{0,15}сем', 'одинок.{0,15}родител', 'единственн.{0,15}родител', 'алимент']),
  fact('student-family', 'Один или оба родителя учатся', ['студент', 'вуз', 'университет', 'колледж', 'обучающ']),
  fact('military-family', 'Есть военнослужащий или участник боевых действий', ['военнослуж', 'мобилиз', 'участник.{0,15}(сво|боев)', 'ветеран.{0,15}боев']),
  fact('employment-change', 'Изменился статус занятости или снизился трудовой доход', ['безработ', 'занятост', 'трудоустрой', 'самозанят', 'социальн.{0,15}контракт']),
  fact('preschool-no-place', 'Ребёнку не предоставлено место в детском саду', ['не предоставлен.{0,20}мест', 'очеред.{0,15}детск.{0,10}сад', 'компенсац.{0,20}детск.{0,10}сад']),
  fact('housing-need', 'Семье требуется улучшение жилищных условий', ['улучшен.{0,20}жилищ', 'жиль', 'ипотек', 'земел.{0,15}участ']),
  fact('rural', 'Семья проживает в сельской местности', ['сельск.{0,15}местност', 'сельск.{0,15}территор', 'на селе'])
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

function normalizedCategoryMatch(category, candidates) {
  const normalized = normalizeText(category);
  return candidates.some((candidate) => normalized.includes(normalizeText(candidate)));
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
    .map(({ label }) => `Проверьте ${label}`)
    .slice(0, 3);
}

function tierForScore(score) {
  if (score >= 9) return 'high';
  if (score >= 4.5) return 'check';
  return 'related';
}

export function scoreMeasureForProfile(measure, profile) {
  const selectedSituation = LIFE_SITUATIONS.find((item) => item.id === profile?.situationId);
  if (!selectedSituation || !measureMatchesRegion(measure, profile?.region)) return null;

  const title = normalizeText(measure?.title);
  const text = measureSearchText(measure);
  let score = 0;
  const reasons = [];
  const matchedSituation = matchingPatterns(text, selectedSituation.patterns);
  const matchedSituationTitle = matchingPatterns(title, selectedSituation.patterns);

  if (matchedSituationTitle.length) score += Math.min(7, 4.5 + matchedSituationTitle.length * 0.75);
  else if (matchedSituation.length) score += Math.min(5, 2.5 + matchedSituation.length * 0.5);

  if (matchedSituation.length) {
    reasons.push(`Текст карточки связан с ситуацией «${selectedSituation.title}»`);
  }

  if (normalizedCategoryMatch(measure?.category, selectedSituation.categories)) {
    score += 1.25;
    reasons.push(`Категория «${measure.category}» релевантна выбранной ситуации`);
  }

  const selectedFacts = PROFILE_FACTS.filter((item) => profile?.factIds?.includes(item.id));
  for (const selectedFact of selectedFacts) {
    const titleMatches = matchingPatterns(title, selectedFact.patterns);
    const bodyMatches = titleMatches.length ? titleMatches : matchingPatterns(text, selectedFact.patterns);
    if (!bodyMatches.length) continue;
    score += titleMatches.length ? 2.75 : 1.5;
    reasons.push(`Учтён признак: ${selectedFact.label.toLocaleLowerCase('ru-RU')}`);
  }

  const queryTokens = tokenize(profile?.query, { minLength: 4 }).slice(0, 6);
  const matchedTokens = queryTokens.filter((token) => text.includes(token));
  if (matchedTokens.length) {
    score += Math.min(3.5, matchedTokens.length * 0.9);
    reasons.push(`Совпали дополнительные слова: ${matchedTokens.join(', ')}`);
  }

  if (measure?.level === 'regional' && measure?.region === profile?.region) score += 0.35;
  if (score < 2.5 || !matchedSituation.length && reasons.length < 2) return null;

  reasons.push(measure?.level === 'federal'
    ? 'Федеральная запись учитывается для любого выбранного региона'
    : `Региональная запись относится к субъекту «${profile.region}»`);

  return {
    measure,
    score: Number(score.toFixed(2)),
    tier: tierForScore(score),
    reasons: [...new Set(reasons)].slice(0, 4),
    checks: buildChecks(text)
  };
}

export function matchMeasuresToProfile(measures, profile, { limit = 60 } = {}) {
  const ranked = measures
    .map((measure) => scoreMeasureForProfile(measure, profile))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score
      || (a.measure.level === b.measure.level ? 0 : a.measure.level === 'regional' ? -1 : 1)
      || String(a.measure.title).localeCompare(String(b.measure.title), 'ru'))
    .slice(0, Math.max(1, limit));

  return {
    high: ranked.filter((item) => item.tier === 'high'),
    check: ranked.filter((item) => item.tier === 'check'),
    related: ranked.filter((item) => item.tier === 'related'),
    all: ranked
  };
}

export function profileSummary(profile) {
  const selectedSituation = LIFE_SITUATIONS.find((item) => item.id === profile?.situationId);
  const facts = PROFILE_FACTS.filter((item) => profile?.factIds?.includes(item.id));
  return {
    situation: selectedSituation?.title ?? '',
    region: profile?.region ?? '',
    facts: facts.map((item) => item.label),
    query: String(profile?.query ?? '').trim()
  };
}
