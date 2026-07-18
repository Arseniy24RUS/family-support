const OFFICIAL_HOSTS = new Set([
  'www.gosuslugi.ru',
  'gosuslugi.ru',
  'sfr.gov.ru',
  'www.nalog.gov.ru',
  'nalog.gov.ru',
  'trudvsem.ru',
  'www.trudvsem.ru'
]);

const OFFICIAL_LINK_RULES = [
  {
    pattern: /единое пособие/i,
    title: 'Подать заявление на единое пособие',
    url: 'https://www.gosuslugi.ru/universal_benefits',
    service: 'Госуслуги'
  },
  {
    pattern: /материнск(?:ий|ого|ому|им)?.*капитал|маткапитал/i,
    title: 'Материнский капитал на Госуслугах',
    url: 'https://www.gosuslugi.ru/maternity-capital',
    service: 'Госуслуги'
  },
  {
    pattern: /семейн(?:ая|ой|ую).*ипотек/i,
    title: 'Условия программы «Семейная ипотека»',
    url: 'https://www.gosuslugi.ru/newsearch/semejnaya-ipoteka',
    service: 'Госуслуги'
  },
  {
    pattern: /статус.*многодетн|многодетн.*семь/i,
    title: 'Сервисы для многодетной семьи',
    url: 'https://www.gosuslugi.ru/large_family',
    service: 'Госуслуги'
  },
  {
    pattern: /беременности и родам|декретн/i,
    title: 'Пособие по беременности и родам',
    url: 'https://www.gosuslugi.ru/life/details/maternity_benefits',
    service: 'Госуслуги'
  },
  {
    pattern: /уход[а-яё\s]*до 1[,.]?5|уход[а-яё\s]*полутора/i,
    title: 'Пособие по уходу за ребёнком',
    url: 'https://www.gosuslugi.ru/life/details/infant_monthly_allowance',
    service: 'Госуслуги'
  },
  {
    pattern: /ежегодн(?:ая|ой).*семейн(?:ая|ой).*выплат/i,
    title: 'Ежегодная семейная выплата',
    url: 'https://www.gosuslugi.ru/newsearch/ezhegodnaya-semejnaya-vyplata',
    service: 'Госуслуги'
  }
];

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textFromHtml(value) {
  return decodeEntities(String(value ?? '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionItems(html, heading) {
  const match = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .find((candidate) => textFromHtml(candidate[1]).toLocaleLowerCase('ru-RU') === heading.toLocaleLowerCase('ru-RU'));
  if (!match) return [];
  const sectionEnd = html.indexOf('</section>', match.index + match[0].length);
  const fragment = html.slice(match.index + match[0].length, sectionEnd < 0 ? undefined : sectionEnd);
  return [...fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((item) => textFromHtml(item[1]).replace(/^(?:\d+|[•·–—-])\s*/, '').trim())
    .filter(Boolean);
}

function checkedOfficialLink(link) {
  const url = new URL(link.url);
  if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname)) {
    throw new Error(`Недопустимая официальная ссылка: ${link.url}`);
  }
  return { title: link.title, url: url.toString(), service: link.service };
}

export function resolveOfficialLinks(measure, details = {}) {
  const searchable = [
    measure.title,
    measure.summary,
    measure.benefit,
    ...(details.steps ?? []),
    ...(details.documents ?? []),
    ...(details.notes ?? [])
  ].filter(Boolean).join(' ');

  const links = [];
  const specific = OFFICIAL_LINK_RULES.find((rule) => rule.pattern.test(searchable));
  if (specific) links.push(specific);

  if (/СФР|социальн(?:ый|ого|ому) фонд|пенсионн(?:ый|ого) фонд/i.test(searchable)) {
    links.push({
      title: 'Официальная информация Социального фонда',
      url: 'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/',
      service: 'СФР'
    });
  }

  if (/налог|НДФЛ|ФНС|вычет/i.test(searchable)) {
    links.push({
      title: 'Сервисы Федеральной налоговой службы',
      url: 'https://www.nalog.gov.ru/rn77/fl/',
      service: 'ФНС России'
    });
  }

  if (/занятост|безработ|ваканси|трудоустрой/i.test(searchable)) {
    links.push({
      title: 'Общероссийская база вакансий и услуг занятости',
      url: 'https://trudvsem.ru/',
      service: 'Работа России'
    });
  }

  if (!specific) {
    links.push({
      title: measure.level === 'regional' ? 'Найти региональную услугу на Госуслугах' : 'Подобрать услугу на Госуслугах',
      url: 'https://www.gosuslugi.ru/social-navigator',
      service: 'Госуслуги'
    });
  }

  const unique = new Map();
  for (const link of links.map(checkedOfficialLink)) unique.set(link.url, link);
  return [...unique.values()];
}

export function parseMeasureDetailsHtml(html, measure) {
  const details = {
    steps: sectionItems(html, 'Как оформить'),
    documents: sectionItems(html, 'Какие документы нужны'),
    notes: sectionItems(html, 'Полезно знать')
  };
  details.official_links = resolveOfficialLinks(measure, details);
  return details;
}

export function detailShardKey(id, shardCount = 32) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % shardCount;
}

export { OFFICIAL_HOSTS };
