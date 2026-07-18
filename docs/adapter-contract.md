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
  measures: []
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

Полный текст условий, перечни документов и нормативные документы в локальную запись намеренно не копируются: карточка витрины должна вести к владельцу исходной информации.
