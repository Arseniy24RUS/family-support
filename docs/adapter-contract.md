# Контракт дополнительного адаптера

Каждый источник подключается отдельным модулем в `scripts/adapters/`. Адаптер возвращает объект:

```js
{
  source: 'source-code',
  sourceUrl: 'https://...',
  fetchedAt: 'ISO-8601',
  reportedCount: 123,
  loadedLinkCount: 123,
  parseErrors: [],
  detailErrors: [],
  measures: [],
  details: []
}
```

Минимальная запись меры:

```js
{
  id: 'source:stable-id',
  title: 'Название',
  level: 'federal' | 'regional',
  region: null | 'Название субъекта',
  category: 'Категория',
  summary: null | 'Короткая аннотация',
  benefit: null | 'Короткое описание объёма поддержки',
  source: 'source-code',
  source_name: 'Название источника',
  source_url: 'https://...',
  fetched_at: 'ISO-8601',
  content_hash: 'sha256'
}
```

Запись подробностей связывается с мерой по `id`:

```js
{
  id: 'source:stable-id',
  steps: ['Порядок оформления'],
  documents: ['Необходимый документ'],
  notes: ['Важное условие'],
  official_links: [
    { title: 'Подать заявление', service: 'Госуслуги', url: 'https://www.gosuslugi.ru/...' }
  ]
}
```

Все пользовательские внешние ссылки должны использовать HTTPS и входить в белый список официальных государственных доменов. URL информационного источника хранится в основной записи для аудита обновления, но не выводится как ссылка в интерфейсе.
