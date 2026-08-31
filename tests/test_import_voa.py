from __future__ import annotations

from scripts.import_voa import (
    build_parser,
    dialogue_parts,
    normalise_media_url,
    parse_index,
    parse_lesson,
    validate_lessons,
)


def test_parse_index_keeps_lessons_and_ignores_reviews() -> None:
    html = """
    <main>
      <a href="/a/lesson-2/2.html">Lesson 2: The Interview</a>
      <a href="/a/review.html">Review of Level 2 Lessons 1 - 5</a>
      <a href="/a/lesson-1/1.html">Lesson 1: Budget Cuts</a>
      <a href="/a/lesson-1/duplicate.html">Lesson 1: Budget Cuts</a>
    </main>
    """

    lessons = parse_index(html, "https://example.test/course")

    assert [lesson.id for lesson in lessons] == [1, 2]
    assert lessons[0].title == "Budget Cuts"
    assert lessons[0].url == "https://example.test/a/lesson-1/1.html"


def test_normalise_media_url_removes_download_but_keeps_cache_key() -> None:
    result = normalise_media_url(
        "/media/file.mp3?download=1&cb=abc",
        "https://example.test/lesson",
    )
    assert result == "https://example.test/media/file.mp3?cb=abc"


def test_dialogue_parts_splits_multiple_speakers_in_one_block() -> None:
    parts = dialogue_parts("Anna: Hello. Pete: Hi there. Ms. Weaver: Sit down.")
    assert parts == [
        ("Anna", "Hello."),
        ("Pete", "Hi there."),
        ("Ms. Weaver", "Sit down."),
    ]


def test_parse_lesson_prefers_1080p_and_128_kbps_and_extracts_conversation() -> None:
    html = """
    <html><body>
      <h1>Lesson 7: Tip Your Tour Guide</h1>
      <a href="/video-1080.mp4?cb=fullhd&amp;download=1">1080p | 140MB</a>
      <a href="/video-720.mp4?download=1">720p | 70MB</a>
      <a href="/video-360.mp4?cb=xyz&amp;download=1">360p | 22MB</a>
      <h2>Conversation</h2>
      <p>Direct link</p>
      <a href="/audio-64.mp3?download=1">64 kbps | MP3</a>
      <a href="/audio-128.mp3?download=1">128 kbps | MP3</a>
      <p>Anna: First line.</p>
      <p>Pete: Second line. Anna: A second sentence.</p>
      <p>This continues Anna's sentence.</p>
      <p>* A useful cultural note.</p>
      <h2>Listening Quiz</h2>
      <p>Anna: This must not be imported.</p>
    </body></html>
    """

    lesson = parse_lesson(
        html,
        "https://example.test/a/lesson-7.html",
        expected_id=7,
        fallback_title="Fallback",
    )

    assert lesson["id"] == 7
    assert lesson["title"] == "Tip Your Tour Guide"
    assert lesson["videoUrl"] == "https://example.test/video-1080.mp4?cb=fullhd"
    assert lesson["videoQuality"] == 1080
    assert lesson["audioUrl"] == "https://example.test/audio-128.mp3"
    assert lesson["audioFormat"] == "mp3"
    assert lesson["audioBitrate"] == 128
    assert lesson["transcriptStatus"] == "complete"
    assert lesson["transcript"] == [
        {"speaker": "Anna", "text": "First line."},
        {"speaker": "Pete", "text": "Second line."},
        {
            "speaker": "Anna",
            "text": "A second sentence. This continues Anna's sentence.",
        },
        {"speaker": None, "text": "A useful cultural note."},
    ]


def test_parse_lesson_uses_smallest_mp4_audio_track_when_mp3_is_missing() -> None:
    html = """
    <html><body>
      <h1>Lesson 8: The Best Barbecue</h1>
      <a href="/video-1080.mp4?download=1">1080p | 140MB</a>
      <a href="/video-360.mp4?download=1">360p | 22MB</a>
      <a href="/video-240.mp4?cb=small&amp;download=1">240p | 12MB</a>
      <h2>Conversation</h2>
      <p>Anna: Thanks for meeting me.</p>
      <p>Kelly: Sure.</p>
      <h2>Listening Quiz</h2>
    </body></html>
    """

    lesson = parse_lesson(
        html,
        "https://example.test/a/lesson-8.html",
        expected_id=8,
        fallback_title="Fallback",
    )

    assert lesson["videoQuality"] == 1080
    assert lesson["audioUrl"] == "https://example.test/video-240.mp4?cb=small"
    assert lesson["audioFormat"] == "mp4"
    assert lesson["audioFallbackVideoQuality"] == 240
    assert "audioBitrate" not in lesson


def test_validate_lessons_accepts_well_formed_sorted_data() -> None:
    validate_lessons(
        [
            {
                "id": 1,
                "title": "One",
                "sourceUrl": "https://example.test/1",
                "videoUrl": "https://example.test/1.mp4",
                "audioUrl": "https://example.test/1.mp3",
                "transcript": [{"speaker": "Anna", "text": "Hello"}],
            }
        ]
    )


def test_importer_defaults_to_a_review_file() -> None:
    args = build_parser().parse_args([])
    assert str(args.output) == "data/lessons.generated.json"
