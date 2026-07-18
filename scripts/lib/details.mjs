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
    pattern: /^Единое пособие на детей и беременных женщин$/i,
    level: 'federal',
    links: [
      {
        title: 'Подать заявление на единое пособие',
        url: 'https://www.gosuslugi.ru/10630/1/form',
        service: 'Госуслуги'
      },
      {
        title: 'Условия назначения единого пособия',
        url: 'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/edinoe_posobie/',
        service: 'СФР'
      }
    ]
  },
  {
    pattern: /^Материнский \(семейный\) капитал$/i,
    level: 'federal',
    links: [
      {
        title: 'Распорядиться средствами материнского капитала',
        url: 'https://www.gosuslugi.ru/600121/1/form',
        service: 'Госуслуги'
      },
      {
        title: 'Материнский капитал: условия и направления',
        url: 'https://sfr.gov.ru/grazhdanam/msk/',
        service: 'СФР'
      }
    ]
  },
  {
    pattern: /^Ежемесячная выплата из материнского капитала$/i,
    level: 'federal',
    links: [{
      title: 'Оформить ежемесячную выплату из маткапитала',
      url: 'https://www.gosuslugi.ru/maternity_capital_payment',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Единовременное пособие при рождении ребёнка$/i,
    level: 'federal',
    links: [
      {
        title: 'Подать заявление на пособие при рождении ребёнка',
        url: 'https://www.gosuslugi.ru/600686/1/form',
        service: 'Госуслуги'
      },
      {
        title: 'Порядок выплаты пособия при рождении ребёнка',
        url: 'https://sfr.gov.ru/grazhdanam/families_with_children/birth',
        service: 'СФР'
      }
    ]
  },
  {
    pattern: /^Ежемесячное пособие по уходу за ребёнком до 1[,.]5 лет$/i,
    level: 'federal',
    links: [
      {
        title: 'Оформить пособие по уходу за ребёнком до 1,5 лет',
        url: 'https://www.gosuslugi.ru/life/details/infant_monthly_allowance',
        service: 'Госуслуги'
      },
      {
        title: 'Размер и порядок выплаты пособия',
        url: 'https://sfr.gov.ru/grazhdanam/families_with_children/care',
        service: 'СФР'
      }
    ]
  },
  {
    pattern: /^Выплата по уходу за ребёнком-инвалидом$/i,
    level: 'federal',
    links: [{
      title: 'Подать заявление на выплату по уходу',
      url: 'https://www.gosuslugi.ru/613202/1/form',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Технические средства реабилитации \(ТСР\)$/i,
    level: 'federal',
    links: [{
      title: 'Подать заявление на обеспечение ТСР',
      url: 'https://www.gosuslugi.ru/help/faq/rehabilitation/100675',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Санаторно-курортное лечение ребёнка-инвалида$/i,
    level: 'federal',
    links: [{
      title: 'Подать заявление на санаторно-курортное лечение',
      url: 'https://www.gosuslugi.ru/611287/1/form',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Статус и удостоверение многодетной семьи$/i,
    level: 'federal',
    links: [{
      title: 'Оформить статус многодетной семьи',
      url: 'https://www.gosuslugi.ru/600164/1/form',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^(?:Государственная социальная помощь на основании социального контракта|Социальный контракт)(?: \(.+\))?$/i,
    links: [{
      title: 'Подать заявление на социальный контракт',
      url: 'https://www.gosuslugi.ru/600238/1/form',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Постановка на учёт нуждающихся в жилье$/i,
    level: 'federal',
    links: [{
      title: 'Подать заявление о постановке на жилищный учёт',
      url: 'https://www.gosuslugi.ru/600246/1/form',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Семейная ипотека под 6%$/i,
    level: 'federal',
    links: [{
      title: 'Условия программы «Семейная ипотека»',
      url: 'https://www.gosuslugi.ru/newsearch/semejnaya-ipoteka',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Семейная налоговая выплата за 2025 год$/i,
    level: 'federal',
    links: [
      {
        title: 'Подать заявление на ежегодную семейную выплату',
        url: 'https://www.gosuslugi.ru/newsearch/ezhegodnaya-semejnaya-vyplata',
        service: 'Госуслуги'
      },
      {
        title: 'Условия ежегодной семейной выплаты',
        url: 'https://sfr.gov.ru/grazhdanam/semyam_s_detmi/ezhegodnaya_semejnaya_vyplata/',
        service: 'СФР'
      }
    ]
  },
  {
    pattern: /^Пособие по безработице$/i,
    level: 'federal',
    links: [{
      title: 'Подать заявление на поиск работы и пособие',
      url: 'https://www.gosuslugi.ru/600366/1',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Льготы при приёме и оплате детского сада$/i,
    level: 'federal',
    links: [{
      title: 'Записать ребёнка в детский сад',
      url: 'https://www.gosuslugi.ru/newsearch/zayavlenie-v-detskij-sad',
      service: 'Госуслуги'
    }]
  },
  {
    pattern: /^Сертификат дополнительного образования \(кружки и секции\)$/i,
    level: 'federal',
    links: [{
      title: 'Оформить сертификат дополнительного образования',
      url: 'https://www.gosuslugi.ru/newsearch/sertifikat-dopolnitelnogo-obrazovaniya-pfdo',
      service: 'Госуслуги'
    }]
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
  const links = [];
  for (const rule of OFFICIAL_LINK_RULES) {
    if ((!rule.level || rule.level === measure.level) && rule.pattern.test(measure.title ?? '')) {
      links.push(...rule.links);
    }
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
