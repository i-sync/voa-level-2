# AGENTS.md

## Product

Build a small, reliable, mobile-first player for VOA Let's Learn English Level 2. The primary user is an iPhone Safari user who needs slow playback, whole-lesson looping, a sleep timer, transcripts, and saved progress.

## Engineering constraints

- Keep the runtime as plain HTML, CSS, and JavaScript.
- Do not add React, Vue, Next.js, a bundler, a package manager, a backend, a database, Docker, or authentication unless the user explicitly changes the scope.
- Keep deployment compatible with GitHub Pages from the repository root.
- Use native `<audio>` and `<video>` as the playback foundation. Do not replace them with a custom audio engine.
- Default first-use playback speed to 0.80; preserve the user's later choice in `localStorage`.
- Store course data in `data/lessons.json` and user preferences in `localStorage`.
- The website must not scrape VOA at runtime. `scripts/import_voa.py` is a development-only importer.
- Do not mirror large media files into the repository. Use the recorded VOA media URLs until real testing proves this unreliable.
- Treat iPhone Safari behavior as a first-class acceptance requirement. Do not claim background timers are reliable without real-device evidence.
- Prefer a small targeted change over architecture work or speculative abstractions.

## Current MVP boundary

The MVP includes:

- lessons 1–3 as seed data;
- video and audio playback;
- 0.50–1.50 speed with 0.05 steps;
- whole-lesson loop;
- 15/30/45/60/custom sleep timer;
- transcript display;
- local progress and preference storage;
- previous/next lesson navigation;
- progressive Media Session support.

Do not add synchronized subtitles, sentence looping, accounts, cloud sync, analytics, monetization, or an app wrapper during MVP stabilization.

## Validation before completion

Run:

```bash
node --check js/app.js
node --check js/core.js
npm test
python -m pytest -q
python -m json.tool data/lessons.json > /dev/null
```

For UI changes, serve the repository over HTTP and check at both mobile and desktop widths. For playback or timer changes, preserve the iPhone test checklist in `docs/REQUIREMENTS.md`.
