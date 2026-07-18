# Предлагаемая модель данных версии 3

Текущая схема сохраняется для обратной совместимости. Ниже описано расширение, необходимое для перехода от тематического подбора к формализованной предварительной проверке условий.

```json
{
  "id": "stable-id",
  "title": "Название меры",
  "aliases": [],
  "territory": {
    "scope": "federal|regional|municipal",
    "regions": [],
    "municipalities": [],
    "residence_required": null,
    "registration_required": null,
    "minimum_residence_months": null
  },
  "provider": {
    "type": "federal_authority|regional_authority|municipality|employer|education|nonprofit|other",
    "name": null
  },
  "legal_status": "statutory_right|competitive|discretionary|corporate|informational",
  "support": {
    "type": "cash|compensation|tax|service|in_kind|credit|other",
    "amount_text": null,
    "formula": null,
    "periodicity": "once|monthly|annual|event|other",
    "indexation_rule": null
  },
  "eligibility": {
    "recipients": [],
    "children": {
      "minimum_count": null,
      "birth_order": null,
      "minimum_age_months": null,
      "maximum_age_months": null,
      "disability_required": null
    },
    "family_statuses": [],
    "income": {
      "required": null,
      "threshold_formula": null,
      "reference_period_months": null
    },
    "property_rules": [],
    "employment_rules": [],
    "exceptions": []
  },
  "application": {
    "proactive": false,
    "channels": [],
    "documents": [],
    "deadline_text": null
  },
  "validity": {
    "valid_from": null,
    "valid_to": null,
    "last_verified_at": null
  },
  "evidence": {
    "level": "A|B|C|D",
    "legal_acts": [],
    "official_service_urls": [],
    "official_explanation_urls": []
  }
}
```

Ключевой принцип — не выводить юридический результат из свободного текста, когда правило может быть представлено структурированными полями. До заполнения такой схемы текущий подбор должен оставаться тематическим и объяснимым.
