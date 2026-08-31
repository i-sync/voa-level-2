from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

from scripts.import_voa import validate_lessons


def test_complete_course_data_is_valid() -> None:
    payload = json.loads(Path("data/lessons.json").read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert payload["course"]["publisher"] == "VOA Learning English"
    assert [lesson["id"] for lesson in payload["lessons"]] == list(range(1, 31))
    validate_lessons(payload["lessons"])


def test_course_media_urls_are_https_and_full_hd() -> None:
    payload = json.loads(Path("data/lessons.json").read_text(encoding="utf-8"))

    for lesson in payload["lessons"]:
        assert lesson["sourceUrl"].startswith("https://")

        assert lesson["videoQuality"] == 1080
        assert lesson["videoUrl"].startswith("https://")
        assert urlsplit(lesson["videoUrl"]).path.endswith(".mp4")

        assert lesson["audioUrl"].startswith("https://")
        audio_path = urlsplit(lesson["audioUrl"]).path
        audio_format = lesson["audioFormat"]

        if audio_format == "mp3":
            assert audio_path.endswith(".mp3")
            assert lesson["audioBitrate"] == 128
            assert "audioFallbackVideoQuality" not in lesson
        else:
            assert audio_format == "mp4"
            assert audio_path.endswith(".mp4")
            assert lesson["audioFallbackVideoQuality"] in {240, 360, 480, 720, 1080}
            assert "audioBitrate" not in lesson
