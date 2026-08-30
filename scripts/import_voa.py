#!/usr/bin/env python3
"""Import VOA Learning English Level 2 lessons into a static JSON file.

The website itself never scrapes VOA at runtime. Run this script deliberately,
review the generated data, and then commit the JSON.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup, Tag

INDEX_URL = "https://learningenglish.voanews.com/p/6765.html"
DEFAULT_USER_AGENT = (
    "voa-level-2-player/0.1 "
    "(+https://github.com/i-sync/voa-level-2; educational course importer)"
)

LESSON_LINK_RE = re.compile(r"^Lesson\s+(\d+)\s*:\s*(.+?)\s*$", re.IGNORECASE)
TITLE_RE = re.compile(r"^Lesson\s+(\d+)\s*:\s*(.+?)\s*$", re.IGNORECASE)
VIDEO_QUALITY_RE = re.compile(r"(\d{3,4})\s*p", re.IGNORECASE)
AUDIO_BITRATE_RE = re.compile(r"(\d{2,3})\s*kbps", re.IGNORECASE)
SPEAKER_TOKEN = r"(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ\'’\-]*|(?:Mr|Mrs|Ms|Dr|Prof)\.)"
SPEAKER_RE = re.compile(
    rf"(?<![\w’'])((?:(?:Professor|Prof\.?|Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+)?"
    rf"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’\-]*"
    rf"(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’\-]*){{0,2}}):\s*"
)
STOP_HEADING_RE = re.compile(
    r"^(listening\s+quiz|quiz|free\s+materials|for\s+teachers|comments|related)\b",
    re.IGNORECASE,
)
PLAYER_NOISE = {
    "embed",
    "direct link",
    "pop-out player",
    "no media source currently available",
    "the code has been copied to your clipboard.",
}


class ImportFailure(RuntimeError):
    """Raised when a required part of a lesson cannot be imported safely."""


@dataclass(frozen=True)
class LessonLink:
    id: int
    title: str
    url: str


def clean_text(value: str) -> str:
    """Collapse HTML whitespace while preserving readable punctuation."""

    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def normalise_media_url(url: str, base_url: str) -> str:
    """Resolve relative links and remove download-only query parameters."""

    absolute = urljoin(base_url, url)
    parts = urlsplit(absolute)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() != "download"
    ]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def parse_index(html: str, base_url: str = INDEX_URL) -> list[LessonLink]:
    """Return real Lesson 1–30 links and ignore review entries."""

    soup = BeautifulSoup(html, "html.parser")
    lessons_by_id: dict[int, LessonLink] = {}

    for anchor in soup.select("a[href]"):
        text = clean_text(anchor.get_text(" ", strip=True))
        match = LESSON_LINK_RE.match(text)
        if not match:
            continue

        lesson_id = int(match.group(1))
        title = match.group(2).strip()
        lessons_by_id.setdefault(
            lesson_id,
            LessonLink(lesson_id, title, urljoin(base_url, anchor["href"])),
        )

    lessons = sorted(lessons_by_id.values(), key=lambda lesson: lesson.id)
    if not lessons:
        raise ImportFailure("No Lesson links were found on the course index page.")

    return lessons


def choose_video_source(
    soup: BeautifulSoup,
    base_url: str,
    preferred_quality: int = 1080,
) -> tuple[int, str]:
    """Return the closest available MP4 quality and its normalized URL."""

    candidates: list[tuple[int, str]] = []

    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href", ""))
        if ".mp4" not in href.lower():
            continue

        text = clean_text(anchor.get_text(" ", strip=True))
        match = VIDEO_QUALITY_RE.search(text)
        quality = int(match.group(1)) if match else 10_000
        candidates.append((quality, normalise_media_url(href, base_url)))

    if not candidates:
        raise ImportFailure("No MP4 link was found on the lesson page.")

    return min(candidates, key=lambda item: (abs(item[0] - preferred_quality), -item[0]))


def choose_video_url(
    soup: BeautifulSoup,
    base_url: str,
    preferred_quality: int = 1080,
) -> str:
    """Return only the selected MP4 URL for callers that do not need metadata."""

    return choose_video_source(soup, base_url, preferred_quality)[1]


def choose_audio_url(soup: BeautifulSoup, base_url: str, preferred_bitrate: int = 128) -> str:
    candidates: list[tuple[int, str]] = []

    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href", ""))
        if ".mp3" not in href.lower():
            continue

        text = clean_text(anchor.get_text(" ", strip=True))
        match = AUDIO_BITRATE_RE.search(text)
        bitrate = int(match.group(1)) if match else 0
        candidates.append((bitrate, normalise_media_url(href, base_url)))

    if not candidates:
        raise ImportFailure("No MP3 link was found on the lesson page.")

    return min(candidates, key=lambda item: (abs(item[0] - preferred_bitrate), -item[0]))[1]


def find_conversation_heading(soup: BeautifulSoup) -> Tag:
    for heading in soup.find_all(re.compile(r"^h[1-6]$")):
        text = clean_text(heading.get_text(" ", strip=True))
        if text.casefold() == "conversation":
            return heading

    raise ImportFailure("The Conversation heading was not found.")


def dialogue_parts(text: str) -> list[tuple[str | None, str]]:
    """Split one text block that may contain several `Speaker: text` entries."""

    cleaned = clean_text(text)
    if not cleaned:
        return []

    matches = list(SPEAKER_RE.finditer(cleaned))
    if not matches:
        return [(None, cleaned)]

    parts: list[tuple[str | None, str]] = []
    prefix = cleaned[: matches[0].start()].strip(" -|\n")
    if prefix:
        parts.append((None, prefix))

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)
        spoken_text = cleaned[start:end].strip()
        if spoken_text:
            parts.append((clean_text(match.group(1)), spoken_text))

    return parts


def _is_noise(text: str) -> bool:
    lowered = text.casefold().strip()
    if lowered in PLAYER_NOISE:
        return True
    if re.fullmatch(r"(?:\d+:\d{2}\s*){2,3}", lowered):
        return True
    if re.fullmatch(r"(?:240|360|480|720|1080)p(?:\s*\|.*)?", lowered):
        return True
    if re.fullmatch(r"(?:64|128)\s*kbps(?:\s*\|.*)?", lowered):
        return True
    return False


def extract_transcript(soup: BeautifulSoup) -> list[dict[str, str | None]]:
    heading = find_conversation_heading(soup)
    blocks: list[str] = []

    for element in heading.find_all_next(["h1", "h2", "h3", "p", "li"]):
        if element is heading:
            continue

        text = clean_text(element.get_text(" ", strip=True))
        if not text:
            continue

        if element.name in {"h1", "h2", "h3"}:
            if STOP_HEADING_RE.match(text):
                break
            # Embedded media titles commonly use h3/h5. They are not transcript text.
            continue

        if _is_noise(text):
            continue

        # Ignore paragraphs that are only wrappers around direct media links.
        media_links = element.select("a[href*='.mp3'], a[href*='.mp4']")
        if media_links and clean_text(element.get_text(" ", strip=True)) == text:
            continue

        blocks.append(text)

    transcript: list[dict[str, str | None]] = []
    dialogue_started = False

    for block in blocks:
        for speaker, text in dialogue_parts(block):
            if speaker:
                dialogue_started = True
                transcript.append({"speaker": speaker, "text": text})
                continue

            if not dialogue_started:
                # Player labels and article prose before the first speaker are not Conversation.
                continue

            if text.startswith("*"):
                transcript.append({"speaker": None, "text": text.lstrip("* ")})
            elif transcript and transcript[-1]["speaker"]:
                transcript[-1]["text"] = f"{transcript[-1]['text']} {text}".strip()
            else:
                transcript.append({"speaker": None, "text": text})

    if not transcript:
        raise ImportFailure("No dialogue entries were found below Conversation.")

    return transcript


def parse_lesson(
    html: str,
    source_url: str,
    *,
    expected_id: int | None = None,
    fallback_title: str | None = None,
) -> dict[str, object]:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h1")
    heading_text = clean_text(heading.get_text(" ", strip=True)) if heading else ""
    title_match = TITLE_RE.match(heading_text)

    if title_match:
        lesson_id = int(title_match.group(1))
        title = title_match.group(2).strip()
    elif expected_id is not None and fallback_title:
        lesson_id = expected_id
        title = fallback_title
    else:
        raise ImportFailure(f"Could not parse lesson title from h1: {heading_text!r}")

    if expected_id is not None and lesson_id != expected_id:
        raise ImportFailure(
            f"Index expected Lesson {expected_id}, but page title says Lesson {lesson_id}."
        )

    video_quality, video_url = choose_video_source(soup, source_url)

    return {
        "id": lesson_id,
        "title": title,
        "sourceUrl": source_url,
        "videoUrl": video_url,
        "videoQuality": video_quality,
        "audioUrl": choose_audio_url(soup, source_url),
        "transcriptStatus": "complete",
        "transcript": extract_transcript(soup),
    }


def fetch_html(session: requests.Session, url: str, timeout: float) -> str:
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    return response.text


def import_course(
    *,
    index_url: str,
    limit: int | None,
    requested_lessons: set[int] | None,
    delay_seconds: float,
    timeout: float,
    user_agent: str,
) -> dict[str, object]:
    session = requests.Session()
    session.headers.update({"User-Agent": user_agent, "Accept-Language": "en-US,en;q=0.9"})

    index_html = fetch_html(session, index_url, timeout)
    lesson_links = parse_index(index_html, index_url)

    if requested_lessons:
        lesson_links = [lesson for lesson in lesson_links if lesson.id in requested_lessons]
        missing = requested_lessons - {lesson.id for lesson in lesson_links}
        if missing:
            raise ImportFailure(f"Requested lessons were not found: {sorted(missing)}")

    if limit is not None:
        lesson_links = lesson_links[:limit]

    imported: list[dict[str, object]] = []
    for index, lesson in enumerate(lesson_links, start=1):
        print(f"[{index}/{len(lesson_links)}] Importing Lesson {lesson.id}: {lesson.title}", file=sys.stderr)
        html = fetch_html(session, lesson.url, timeout)
        imported.append(
            parse_lesson(
                html,
                lesson.url,
                expected_id=lesson.id,
                fallback_title=lesson.title,
            )
        )
        if delay_seconds > 0 and index < len(lesson_links):
            time.sleep(delay_seconds)

    validate_lessons(imported)
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "course": {
            "title": "Let's Learn English — Level 2",
            "sourceUrl": index_url,
            "publisher": "VOA Learning English",
        },
        "lessons": imported,
    }


def validate_lessons(lessons: Iterable[dict[str, object]]) -> None:
    materialised = list(lessons)
    ids = [int(lesson["id"]) for lesson in materialised]
    if len(ids) != len(set(ids)):
        raise ImportFailure("Lesson IDs are not unique.")
    if ids != sorted(ids):
        raise ImportFailure("Lessons are not sorted by ID.")

    for lesson in materialised:
        lesson_id = lesson.get("id")
        for field in ("title", "sourceUrl", "videoUrl", "audioUrl"):
            if not lesson.get(field):
                raise ImportFailure(f"Lesson {lesson_id} is missing {field}.")
        if not lesson.get("transcript"):
            raise ImportFailure(f"Lesson {lesson_id} has no transcript entries.")


def atomic_write_json(output_path: Path, payload: dict[str, object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(output_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-url", default=INDEX_URL)
    parser.add_argument("--output", type=Path, default=Path("data/lessons.generated.json"))
    parser.add_argument("--limit", type=int, help="Import only the first N matching lessons.")
    parser.add_argument(
        "--lesson",
        type=int,
        action="append",
        dest="lessons",
        help="Import one lesson ID. Repeat the option for multiple lessons.",
    )
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between lesson requests.")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.limit is not None and args.limit < 1:
        print("--limit must be at least 1", file=sys.stderr)
        return 2
    if args.delay < 0:
        print("--delay cannot be negative", file=sys.stderr)
        return 2

    try:
        payload = import_course(
            index_url=args.index_url,
            limit=args.limit,
            requested_lessons=set(args.lessons) if args.lessons else None,
            delay_seconds=args.delay,
            timeout=args.timeout,
            user_agent=args.user_agent,
        )
        atomic_write_json(args.output, payload)
    except (ImportFailure, requests.RequestException) as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {len(payload['lessons'])} lessons to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())