import {
  catalogCoverage,
  formatDate,
  loadPlatformData,
  pluralMeasures
} from './lib/platform-core.js';
import { initModuleShell, refreshIcons } from './lib/module-shell.js';

initModuleShell('methodology');

const status = document.querySelector('#methodology-status');

try {
  const { measures, meta, regions } = await loadPlatformData();
  const coverage = catalogCoverage(measures, regions);
  const officialCount = Number(meta.official_link_count) || 0;
  status.querySelector('span').textContent = [
    `Текущий снимок от ${formatDate(meta.generated_at)} содержит ${measures.length.toLocaleString('ru-RU')} ${pluralMeasures(measures.length)}.`,
    `Региональные карточки представлены для ${coverage.representedCount} из ${coverage.totalRegions} позиций территориального справочника.`,
    `Точных официальных ссылок в метаданных: ${officialCount.toLocaleString('ru-RU')}.`
  ].join(' ');
} catch (error) {
  status.classList.add('is-error');
  status.querySelector('span').textContent = `Метаданные снимка недоступны: ${String(error?.message || error)}`;
}

refreshIcons();
