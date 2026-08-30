from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

from scripts.import_voa import validate_lessons


def test_seed_lesson_data_is_valid() -> None:
    payload = json.loads(Path("data/lessons.json").read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert payload["course"]["publisher"] == "VOA Learning English"
    assert [lesson["id"] for lesson in payload["lessons"]] == [1, 2, 3]
    validate_lessons(payload["lessons"])


def test_seed_media_urls_are_https() -> None:
    payload = json.loads(Path("data/lessons.json").read_text(encoding="utf-8"))
    for lesson in payload["lessons"]:
        assert lesson["sourceUrl"].startswith("https://")
        assert lesson["videoUrl"].startswith("https://")
        assert urlsplit(lesson["videoUrl"]).path.endswith(".mp4")
        assert lesson["audioUrl"].startswith("https://")
        assert lesson["audioUrl"].endswith(".mp3")
