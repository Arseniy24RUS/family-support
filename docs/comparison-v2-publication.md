# Публикация модуля и корпуса документов

## Объём поставки

Корпус включает 98 PDF общим объёмом 434 784 042 байта, то есть около 414,64 MiB. Крупнейший PDF имеет размер около 61,61 MiB. Дополнительно сохраняются 12 исходных Word/RTF/MHTML-файлов.

## GitHub

GitHub предупреждает о файлах свыше 50 MiB, блокирует обычные Git-файлы свыше 100 MiB и ограничивает загрузку через браузер 25 MiB на файл. Поэтому данный патч следует добавлять через локальный Git или GitHub Desktop, а не через веб-форму.

Официальные сведения:

- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

Рекомендуемый порядок:

```bash
git switch -c feature/regional-comparison-v2
node /путь/к/патчу/apply-comparison-v2-patch.mjs "$PWD" --full-check
npm run test:e2e
git status --short
git add site/compare.html site/compare.js site/compare-v2.css \
  site/lib/compare-map.js site/lib/comparison-insights.js \
  site/lib/strategy-library.js site/lib/strategy-text-analysis.js \
  site/data/strategies.json site/data/strategies-manifest.csv \
  site/data/strategies-lexical-profile.csv site/documents/strategies \
  scripts/check-comparison-v2.mjs scripts/profile-strategy-texts.py \
  tests/comparison-v2.test.mjs e2e/comparison-v2.spec.mjs docs package.json
git commit -m "feat: rebuild regional comparison and add fertility strategy corpus"
git push -u origin feature/regional-comparison-v2
```

## GitHub Pages

GitHub Pages допускает опубликованный сайт размером не более 1 GB и устанавливает мягкий лимит трафика 100 GB в месяц. Текущий корпус укладывается в этот предел, но занимает значительную его долю.

Официальные сведения:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

Перед публикацией следует проверить фактический размер всей директории `site`:

```bash
du -sh site
find site -type f -size +50M -print
find site -type f -size +100M -print
```

Git LFS не следует использовать для файлов, которые должны непосредственно обслуживаться GitHub Pages: официальная документация указывает, что Git LFS несовместим с Pages. При дальнейшем росте корпуса предпочтительна гибридная схема, где GitHub Pages хранит интерфейс и метаданные, а PDF размещаются в объектном хранилище с устойчивыми публичными URL.

## Производительность

Страница не загружает PDF при первоначальном открытии. Встроенный `iframe` получает адрес только после явной команды пользователя. JSON-манифест и лексические профили загружаются как обычные статические данные. Для сохранения приемлемого времени публикации не следует включать перерасчёт лексического профиля в каждый обычный запуск сайта.
