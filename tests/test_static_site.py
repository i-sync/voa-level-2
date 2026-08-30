import json
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def test_index_has_unique_ids_and_existing_local_assets():
    soup = BeautifulSoup((ROOT / "index.html").read_text(encoding="utf-8"), "html.parser")
    ids = [tag["id"] for tag in soup.find_all(attrs={"id": True})]
    assert len(ids) == len(set(ids))

    local_paths = []
    for tag, attribute in (("link", "href"), ("script", "src")):
        for element in soup.find_all(tag):
            value = element.get(attribute)
            if value and not value.startswith(("http://", "https://", "//")):
                local_paths.append(value.split("?", 1)[0])

    assert local_paths
    for local_path in local_paths:
        assert (ROOT / local_path).is_file(), local_path


def test_sample_lesson_data_is_ordered_and_has_official_sources():
    payload = json.loads((ROOT / "data" / "lessons.json").read_text(encoding="utf-8"))
    lessons = payload["lessons"]

    assert [lesson["id"] for lesson in lessons] == sorted(lesson["id"] for lesson in lessons)
    assert len({lesson["id"] for lesson in lessons}) == len(lessons)
    assert lessons

    for lesson in lessons:
        assert lesson["sourceUrl"].startswith("https://learningenglish.voanews.com/")
        assert lesson["audioUrl"].startswith("https://")
        assert lesson["videoUrl"].startswith("https://")
        assert lesson.get("transcriptStatus") == "complete"
        assert isinstance(lesson["transcript"], list)
        assert len(lesson["transcript"]) >= 20


def test_stylesheet_has_balanced_blocks():
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    assert css.count("{") == css.count("}")



def test_javascript_id_selectors_exist_in_html():
    import re

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    script = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    html_ids = {tag["id"] for tag in soup.find_all(attrs={"id": True})}
    selected_ids = set(re.findall(r'\$\("#([A-Za-z][A-Za-z0-9_-]*)"\)', script))

    assert selected_ids
    assert selected_ids <= html_ids, sorted(selected_ids - html_ids)
