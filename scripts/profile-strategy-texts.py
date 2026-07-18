#!/usr/bin/env python3
"""Build transparent lexical profiles for the strategy corpus.

The script never classifies legal provisions. It counts predefined Russian
stems/phrases and normalises matches per 10,000 word tokens. The result is an
exploratory textual indicator, not a measure of policy priority or quality.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

METHOD_VERSION = "ru-lexical-themes-v1"

THEMES: dict[str, dict[str, Any]] = {
    "cash_support": {
        "label": "Денежная поддержка",
        "patterns": [r"\bпособ\w*", r"\bвыплат\w*", r"\bкомпенсац\w*", r"\bматериал\w+\s+помощ\w*"],
    },
    "housing": {
        "label": "Жильё и ипотека",
        "patterns": [r"\bжилищ\w*", r"\bжиль[её]\w*", r"\bипотек\w*", r"\bжил\w+\s+помещен\w*", r"\bаренд\w+\s+жиль\w*"],
    },
    "childcare": {
        "label": "Дошкольный уход",
        "patterns": [r"\bдошкольн\w*", r"\bдетск\w+\s+сад\w*", r"\bясел\w*", r"\bприсмотр\w*\s+и\s+уход\w*"],
    },
    "reproductive_health": {
        "label": "Репродуктивное здоровье",
        "patterns": [r"\bрепродуктивн\w+\s+здоров\w*", r"\bбесплоди\w*", r"\bэкстракорпоральн\w*", r"\bэко\b", r"\bпренатальн\w*", r"\bженск\w+\s+консультац\w*"],
    },
    "student_families": {
        "label": "Студенческие семьи",
        "patterns": [r"\bстуденческ\w+\s+сем\w*", r"\bстудент\w+[- ]родител\w*", r"\bобучающ\w+.*?\bсем\w*"],
    },
    "large_families": {
        "label": "Многодетные семьи",
        "patterns": [r"\bмногодетн\w*", r"\bтреть\w+\s+(?:и\s+)?последующ\w+\s+реб[её]н\w*"],
    },
    "work_family_balance": {
        "label": "Совмещение семьи и занятости",
        "patterns": [r"\bсовмещ\w+\s+.*?\bсемейн\w+\s+обязанност\w*", r"\bгибк\w+\s+(?:форм\w+\s+)?занятост\w*", r"\bдистанционн\w+\s+работ\w*", r"\bтрудоустройств\w+\s+женщин\w*", r"\bзанятост\w+\s+женщин\w*"],
    },
    "employers": {
        "label": "Участие работодателей",
        "patterns": [r"\bработодател\w*", r"\bкорпоративн\w+\s+(?:демограф\w*|социальн\w+|программ\w*)"],
    },
    "fatherhood": {
        "label": "Отцовство",
        "patterns": [r"\bотцовств\w*", r"\bответственн\w+\s+отцовств\w*", r"\bотц\w+\s+.*?\bвоспитан\w*"],
    },
    "family_values": {
        "label": "Семейные ценности и информирование",
        "patterns": [r"\bсемейн\w+\s+ценност\w*", r"\bответственн\w+\s+родительств\w*", r"\bпрестиж\w+\s+сем\w*", r"\bинформационн\w+\s+кампани\w*", r"\bпопуляризац\w+\s+.*?\bсем\w*"],
    },
    "rural_territories": {
        "label": "Сельские территории",
        "patterns": [r"\bсельск\w+\s+(?:местност\w*|территори\w*|поселен\w*)", r"\bмал\w+\s+город\w*", r"\bудал[её]нн\w+\s+территори\w*"],
    },
    "monitoring": {
        "label": "Мониторинг и целевые показатели",
        "patterns": [r"\bмониторинг\w*", r"\bцелев\w+\s+показател\w*", r"\bиндикатор\w*", r"\bоценк\w+\s+эффективност\w*", r"\bконтрольн\w+\s+точк\w*"],
    },
}

WORD_RE = re.compile(r"[а-яёa-z]{2,}", re.IGNORECASE)
SPACE_RE = re.compile(r"\s+")


def extract_text(pdf_path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as handle:
        output_path = Path(handle.name)
    try:
        subprocess.run(
            ["pdftotext", str(pdf_path), str(output_path)],
            check=True,
            timeout=240,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        return output_path.read_text(encoding="utf-8", errors="ignore")
    finally:
        output_path.unlink(missing_ok=True)


def normalise(text: str) -> str:
    return SPACE_RE.sub(" ", text.casefold().replace("ё", "е")).strip()


def profile_text(text: str, quality: str) -> dict[str, Any]:
    normalised = normalise(text)
    token_count = len(WORD_RE.findall(normalised))
    themes: dict[str, dict[str, Any]] = {}
    for theme_id, definition in THEMES.items():
        matches = sum(len(re.findall(pattern.replace("ё", "е"), normalised, flags=re.IGNORECASE)) for pattern in definition["patterns"])
        per_10000 = round(matches * 10000 / token_count, 2) if token_count else 0.0
        themes[theme_id] = {
            "label": definition["label"],
            "matches": matches,
            "per_10000_words": per_10000,
        }
    reliability = "limited" if quality != "full" or token_count < 1500 else "standard"
    return {
        "method": METHOD_VERSION,
        "token_count": token_count,
        "reliability": reliability,
        "themes": themes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", type=Path, default=Path("site"))
    parser.add_argument("--text-cache", type=Path)
    args = parser.parse_args()

    site_root = args.site_root.resolve()
    corpus_path = site_root / "data" / "strategies.json"
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))

    for document in corpus.get("documents", []):
        if document.get("availability") != "available" or not document.get("pdf_url"):
            document.pop("text_profile", None)
            continue
        pdf_path = site_root / document["pdf_url"].removeprefix("./")
        cache_path = args.text_cache / f"{document['id']}.txt" if args.text_cache else None
        if cache_path and cache_path.exists():
            text = cache_path.read_text(encoding="utf-8", errors="ignore")
        else:
            text = extract_text(pdf_path)
        document["text_profile"] = profile_text(text, document.get("quality", "full"))

    corpus.setdefault("analysis", {})["lexical_profile"] = {
        "method": METHOD_VERSION,
        "normalisation": "matches per 10,000 extracted word tokens",
        "themes": [{"id": key, "label": value["label"]} for key, value in THEMES.items()],
        "warning": "Лексическая частота отражает особенности текста и структуры документа, но не доказывает наличие, масштаб, финансирование или результативность соответствующих мер.",
    }
    corpus_path.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    csv_path = site_root / "data" / "strategies-lexical-profile.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        header = ["document_id", "scope", "territory", "quality", "token_count", "reliability"]
        for theme_id, definition in THEMES.items():
            header += [f"{theme_id}_matches", f"{theme_id}_per_10000_words"]
        writer.writerow(header)
        for document in corpus.get("documents", []):
            profile = document.get("text_profile")
            if not profile:
                continue
            row = [document["id"], document.get("scope", ""), document.get("territory", ""), document.get("quality", ""), profile["token_count"], profile["reliability"]]
            for theme_id in THEMES:
                theme = profile["themes"][theme_id]
                row += [theme["matches"], str(theme["per_10000_words"]).replace(".", ",")]
            writer.writerow(row)


if __name__ == "__main__":
    main()
