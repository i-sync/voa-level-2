import {
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  clamp,
  formatRemaining,
  formatSpeed,
  getAdjacentLessonId,
  normalizeCustomTimerMinutes,
  normalizeSpeed,
  parseLessonId,
} from "./core.js";

const RESUME_END_GUARD_SECONDS = 8;

const KEYS = {
  preferences: "voa-level2.preferences.v1",
  positions: "voa-level2.positions.v1",
  completed: "voa-level2.completed.v1",
  timer: "voa-level2.sleep-timer.v1",
};

const DEFAULTS = {
  speed: 0.8,
  loop: false,
  mode: "audio",
  fontScale: 1,
  currentLesson: 1,
};

const $ = (selector) => document.querySelector(selector);
const dom = {
  appError: $("#appError"),
  previousLesson: $("#previousLesson"),
  nextLesson: $("#nextLesson"),
  lessonSelect: $("#lessonSelect"),
  lessonEyebrow: $("#lessonEyebrow"),
  lessonTitle: $("#lessonTitle"),
  completed: $("#completedCheckbox"),
  sourceLink: $("#sourceLink"),
  audioTab: $("#audioTab"),
  videoTab: $("#videoTab"),
  audioPanel: $("#audioPanel"),
  videoPanel: $("#videoPanel"),
  audio: $("#audioPlayer"),
  video: $("#videoPlayer"),
  mediaError: $("#mediaError"),
  speedPresets: $("#speedPresets"),
  speedValue: $("#speedValue"),
  speedDown: $("#speedDown"),
  speedUp: $("#speedUp"),
  seekBackward: $("#seekBackward"),
  seekForward: $("#seekForward"),
  loopToggle: $("#loopToggle"),
  timerPresets: $("#timerPresets"),
  timerStatus: $("#timerStatus"),
  customMinutes: $("#customMinutes"),
  setCustomTimer: $("#setCustomTimer"),
  cancelTimer: $("#cancelTimer"),
  transcript: $("#transcript"),
  fontDown: $("#fontDown"),
  fontUp: $("#fontUp"),
  toast: $("#toast"),
};

const media = { audio: dom.audio, video: dom.video };
const storedPreferences = readJson(KEYS.preferences, {});
const storedPositions = readJson(KEYS.positions, {});
const storedCompleted = readJson(KEYS.completed, []);
const storedTimer = readJson(KEYS.timer, {});

let lessons = [];
let currentLesson = null;
let activeMode = "audio";
let preferences = {
  ...DEFAULTS,
  ...(isRecord(storedPreferences) ? storedPreferences : {}),
};
let positions = isRecord(storedPositions) ? storedPositions : {};
let completed = new Set(
  (Array.isArray(storedCompleted) ? storedCompleted : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0),
);
let timer = isRecord(storedTimer)
  ? storedTimer
  : { deadline: null, durationMinutes: null };
let timerInterval = null;
let timerTimeout = null;
let toastTimeout = null;
const lastPositionWrite = { audio: 0, video: 0 };
let lastSessionPositionUpdate = 0;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Playback remains usable when storage is blocked.
  }
}

function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function savePreferences() {
  writeJson(KEYS.preferences, preferences);
}

function showToast(message) {
  clearTimeout(toastTimeout);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimeout = setTimeout(() => {
    dom.toast.hidden = true;
  }, 2600);
}

function currentMedia() {
  return media[activeMode];
}

function pauseAll() {
  dom.audio.pause();
  dom.video.pause();
  updatePlaybackState();
}

function setMode(mode, { persist = true, pausePrevious = true } = {}) {
  if (!(mode in media)) return;
  if (pausePrevious && activeMode !== mode) media[activeMode].pause();

  activeMode = mode;
  dom.audioPanel.hidden = mode !== "audio";
  dom.videoPanel.hidden = mode !== "video";

  for (const tab of [dom.audioTab, dom.videoTab]) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  if (persist) {
    preferences.mode = mode;
    savePreferences();
  }
  updateMediaMetadata();
  updatePlaybackState();
}

function setSpeed(value, { persist = true } = {}) {
  preferences.speed = normalizeSpeed(value);
  for (const item of Object.values(media)) {
    item.playbackRate = preferences.speed;
    item.defaultPlaybackRate = preferences.speed;
    if ("preservesPitch" in item) item.preservesPitch = true;
    if ("webkitPreservesPitch" in item) item.webkitPreservesPitch = true;
  }

  dom.speedValue.textContent = formatSpeed(preferences.speed);
  dom.speedDown.disabled = preferences.speed <= SPEED_MIN;
  dom.speedUp.disabled = preferences.speed >= SPEED_MAX;
  for (const button of dom.speedPresets.querySelectorAll("[data-speed]")) {
    const selected = Math.abs(Number(button.dataset.speed) - preferences.speed) < 0.001;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (persist) savePreferences();
}

function setLoop(value, { persist = true } = {}) {
  preferences.loop = Boolean(value);
  dom.audio.loop = preferences.loop;
  dom.video.loop = preferences.loop;
  dom.loopToggle.setAttribute("aria-pressed", String(preferences.loop));
  dom.loopToggle.textContent = `循环本课：${preferences.loop ? "开" : "关"}`;
  if (persist) savePreferences();
}

function setFontScale(value, { persist = true } = {}) {
  const scale = Math.round(clamp(Number(value) || 1, 0.9, 1.4) * 10) / 10;
  preferences.fontScale = scale;
  document.documentElement.style.setProperty("--transcript-scale", String(scale));
  dom.fontDown.disabled = scale <= 0.9;
  dom.fontUp.disabled = scale >= 1.4;
  if (persist) savePreferences();
}

function savedPosition(lessonId, mode) {
  const value = Number(positions[String(lessonId)]?.[mode]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function savePosition(item, mode, force = false) {
  const lessonId = Number(item.dataset.lessonId);
  if (!lessonId || !Number.isFinite(item.currentTime)) return;
  const now = Date.now();
  if (!force && now - lastPositionWrite[mode] < 2500) return;

  positions[String(lessonId)] ??= {};
  positions[String(lessonId)][mode] = Math.max(0, item.currentTime);
  lastPositionWrite[mode] = now;
  writeJson(KEYS.positions, positions);
}

function restorePosition(item, mode) {
  const lessonId = Number(item.dataset.lessonId);
  const position = savedPosition(lessonId, mode);
  if (position > 1 && Number.isFinite(item.duration) && position < item.duration - RESUME_END_GUARD_SECONDS) {
    try {
      item.currentTime = position;
    } catch {
      // Some streams become seekable shortly after metadata loads.
    }
  }
}

function renderLessonOptions() {
  const selected = currentLesson?.id ?? preferences.currentLesson;
  const fragment = document.createDocumentFragment();
  for (const lesson of lessons) {
    const option = document.createElement("option");
    option.value = String(lesson.id);
    option.textContent = `Lesson ${lesson.id} · ${lesson.title}${completed.has(lesson.id) ? " ✓" : ""}`;
    fragment.append(option);
  }
  dom.lessonSelect.replaceChildren(fragment);
  dom.lessonSelect.value = String(selected);
}

function renderTranscript(entries = []) {
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "transcript-entry";
    const text = document.createElement("p");
    text.className = "transcript-text";
    text.textContent = entry.text || "";

    if (entry.speaker) {
      const speaker = document.createElement("div");
      speaker.className = "transcript-speaker";
      speaker.textContent = entry.speaker;
      row.append(speaker, text);
    } else {
      row.classList.add("is-note");
      row.append(text);
    }
    fragment.append(row);
  }

  if (!fragment.childNodes.length) {
    const empty = document.createElement("p");
    empty.className = "subtle";
    empty.textContent = "本课暂时没有导入 Conversation 文本。";
    fragment.append(empty);
  }
  dom.transcript.replaceChildren(fragment);
}

function updateNavigation() {
  const previous = getAdjacentLessonId(lessons, currentLesson.id, -1);
  const next = getAdjacentLessonId(lessons, currentLesson.id, 1);
  dom.previousLesson.disabled = previous === null;
  dom.nextLesson.disabled = next === null;
}

function updateUrl(id, mode) {
  if (mode === "none") return;
  const url = new URL(location.href);
  url.searchParams.set("lesson", String(id));
  history[mode === "push" ? "pushState" : "replaceState"]({ lessonId: id }, "", url);
}

function setSource(item, mode, url, lessonId) {
  item.pause();
  item.dataset.mode = mode;
  item.dataset.lessonId = String(lessonId);
  item.removeAttribute("src");
  if (url) item.src = url;
  item.load();
}

function loadLesson(id, { historyMode = "push", autoplay = false } = {}) {
  const lesson = lessons.find((candidate) => candidate.id === id);
  if (!lesson) return;

  savePosition(dom.audio, "audio", true);
  savePosition(dom.video, "video", true);
  pauseAll();
  dom.mediaError.hidden = true;

  currentLesson = lesson;
  preferences.currentLesson = lesson.id;
  savePreferences();

  dom.lessonEyebrow.textContent = `Lesson ${lesson.id} of ${lessons.length}`;
  dom.lessonTitle.textContent = lesson.title;
  dom.completed.checked = completed.has(lesson.id);
  dom.sourceLink.href = lesson.sourceUrl;
  document.title = `Lesson ${lesson.id}: ${lesson.title} · VOA Level 2`;
  renderTranscript(lesson.transcript);
  renderLessonOptions();
  updateNavigation();
  updateUrl(lesson.id, historyMode);

  setSource(dom.audio, "audio", lesson.audioUrl, lesson.id);
  setSource(dom.video, "video", lesson.videoUrl, lesson.id);
  setSpeed(preferences.speed, { persist: false });
  setLoop(preferences.loop, { persist: false });
  updateMediaMetadata();

  if (autoplay) {
    const item = currentMedia();
    const play = () => item.play().catch(() => showToast("请手动点击播放。"));
    if (item.readyState >= 1) play();
    else item.addEventListener("loadedmetadata", play, { once: true });
  }
}

function navigate(direction, autoplay = false) {
  if (!currentLesson) return;
  const id = getAdjacentLessonId(lessons, currentLesson.id, direction);
  if (id !== null) loadLesson(id, { autoplay });
}

function seek(seconds) {
  const item = currentMedia();
  if (!Number.isFinite(item.duration)) return;
  item.currentTime = clamp(item.currentTime + seconds, 0, item.duration);
  savePosition(item, activeMode, true);
  updateSessionPosition(item, true);
}

function startTimer(minutes) {
  const normalized = normalizeCustomTimerMinutes(minutes);
  if (normalized === null) {
    showToast("请输入 1–240 分钟。 ");
    return;
  }
  timer = { deadline: Date.now() + normalized * 60_000, durationMinutes: normalized };
  writeJson(KEYS.timer, timer);
  scheduleTimer();
  renderTimer();
  showToast(`已设置 ${normalized} 分钟后停止播放。`);
}

function clearTimer(announce = false) {
  clearInterval(timerInterval);
  clearTimeout(timerTimeout);
  timerInterval = null;
  timerTimeout = null;
  timer = { deadline: null, durationMinutes: null };
  removeStored(KEYS.timer);
  renderTimer();
  if (announce) showToast("已取消睡眠定时。 ");
}

function scheduleTimer() {
  clearInterval(timerInterval);
  clearTimeout(timerTimeout);
  if (!timer.deadline) return;
  timerInterval = setInterval(checkTimer, 1000);
  timerTimeout = setTimeout(checkTimer, Math.max(0, timer.deadline - Date.now()) + 50);
  checkTimer();
}

function checkTimer() {
  if (!timer.deadline) return renderTimer();
  if (Date.now() >= timer.deadline) {
    pauseAll();
    clearTimer(false);
    showToast("睡眠定时结束，播放已暂停。 ");
    return;
  }
  renderTimer();
}

function renderTimer() {
  const active = Boolean(timer.deadline && timer.deadline > Date.now());
  dom.timerStatus.textContent = active ? `${formatRemaining(timer.deadline - Date.now())} 后停止` : "未设置";
  dom.cancelTimer.disabled = !active;
  for (const button of dom.timerPresets.querySelectorAll("[data-minutes]")) {
    const selected = active && Number(button.dataset.minutes) === timer.durationMinutes;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function restoreTimer() {
  timer = readJson(KEYS.timer, { deadline: null, durationMinutes: null });
  if (!Number.isFinite(Number(timer.deadline)) || Number(timer.deadline) <= Date.now()) {
    clearTimer(false);
    return;
  }
  timer.deadline = Number(timer.deadline);
  timer.durationMinutes = Number(timer.durationMinutes) || null;
  scheduleTimer();
}

function updateMediaMetadata() {
  if (!("mediaSession" in navigator) || !currentLesson || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `Lesson ${currentLesson.id}: ${currentLesson.title}`,
    artist: "VOA Learning English",
    album: `Let's Learn English · Level 2 · ${activeMode === "audio" ? "Audio" : "Video"}`,
  });
}

function updatePlaybackState() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = currentMedia().paused ? "paused" : "playing";
  } catch {
    // Optional browser enhancement.
  }
}

function updateSessionPosition(item, force = false) {
  if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") return;
  if (!Number.isFinite(item.duration) || item.duration <= 0 || !Number.isFinite(item.currentTime)) return;
  const now = Date.now();
  if (!force && now - lastSessionPositionUpdate < 1000) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: item.duration,
      playbackRate: item.playbackRate,
      position: clamp(item.currentTime, 0, item.duration),
    });
    lastSessionPositionUpdate = now;
  } catch {
    // Metadata can change while a browser is updating its lock-screen UI.
  }
}

function registerMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: () => currentMedia().play(),
    pause: () => currentMedia().pause(),
    seekbackward: (details) => seek(-(details.seekOffset || 10)),
    seekforward: (details) => seek(details.seekOffset || 10),
    seekto: (details) => {
      const item = currentMedia();
      if (Number.isFinite(details.seekTime) && Number.isFinite(item.duration)) {
        item.currentTime = clamp(details.seekTime, 0, item.duration);
      }
    },
    previoustrack: () => navigate(-1, true),
    nexttrack: () => navigate(1, true),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Safari versions expose different action subsets.
    }
  }
}

function bindMedia(item, mode) {
  item.dataset.mode = mode;
  item.addEventListener("loadedmetadata", () => {
    item.playbackRate = preferences.speed;
    item.defaultPlaybackRate = preferences.speed;
    item.loop = preferences.loop;
    if ("preservesPitch" in item) item.preservesPitch = true;
    restorePosition(item, mode);
  });
  item.addEventListener("play", () => {
    setMode(mode, { pausePrevious: false });
    media[mode === "audio" ? "video" : "audio"].pause();
    dom.mediaError.hidden = true;
    checkTimer();
    updatePlaybackState();
  });
  item.addEventListener("pause", () => {
    savePosition(item, mode, true);
    updatePlaybackState();
  });
  item.addEventListener("timeupdate", () => {
    savePosition(item, mode);
    checkTimer();
    if (item === currentMedia()) updateSessionPosition(item);
  });
  item.addEventListener("ratechange", () => updateSessionPosition(item, true));
  item.addEventListener("ended", () => {
    if (!preferences.loop && currentLesson && Number(item.dataset.lessonId) === currentLesson.id) {
      completed.add(currentLesson.id);
      writeJson(KEYS.completed, [...completed].sort((a, b) => a - b));
      dom.completed.checked = true;
      positions[String(currentLesson.id)] ??= {};
      positions[String(currentLesson.id)][mode] = 0;
      writeJson(KEYS.positions, positions);
      renderLessonOptions();
    }
    checkTimer();
  });
  item.addEventListener("canplay", () => {
    dom.mediaError.hidden = true;
  });
  item.addEventListener("error", () => {
    if (item.currentSrc && currentLesson && Number(item.dataset.lessonId) === currentLesson.id) {
      dom.mediaError.hidden = false;
    }
  });
}

function bindEvents() {
  dom.previousLesson.addEventListener("click", () => navigate(-1));
  dom.nextLesson.addEventListener("click", () => navigate(1));
  dom.lessonSelect.addEventListener("change", () => loadLesson(Number(dom.lessonSelect.value)));
  dom.audioTab.addEventListener("click", () => setMode("audio"));
  dom.videoTab.addEventListener("click", () => setMode("video"));
  dom.speedPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-speed]");
    if (button) setSpeed(Number(button.dataset.speed));
  });
  dom.speedDown.addEventListener("click", () => setSpeed(preferences.speed - SPEED_STEP));
  dom.speedUp.addEventListener("click", () => setSpeed(preferences.speed + SPEED_STEP));
  dom.seekBackward.addEventListener("click", () => seek(-10));
  dom.seekForward.addEventListener("click", () => seek(10));
  dom.loopToggle.addEventListener("click", () => setLoop(!preferences.loop));
  dom.timerPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-minutes]");
    if (button) startTimer(Number(button.dataset.minutes));
  });
  dom.setCustomTimer.addEventListener("click", () => {
    const minutes = normalizeCustomTimerMinutes(dom.customMinutes.value);
    if (minutes === null) return showToast("请输入 1–240 分钟。 ");
    dom.customMinutes.value = String(minutes);
    startTimer(minutes);
  });
  dom.customMinutes.addEventListener("keydown", (event) => {
    if (event.key === "Enter") dom.setCustomTimer.click();
  });
  dom.cancelTimer.addEventListener("click", () => clearTimer(true));
  dom.completed.addEventListener("change", () => {
    if (!currentLesson) return;
    if (dom.completed.checked) completed.add(currentLesson.id);
    else completed.delete(currentLesson.id);
    writeJson(KEYS.completed, [...completed].sort((a, b) => a - b));
    renderLessonOptions();
  });
  dom.fontDown.addEventListener("click", () => setFontScale(preferences.fontScale - 0.1));
  dom.fontUp.addEventListener("click", () => setFontScale(preferences.fontScale + 0.1));
  window.addEventListener("popstate", () => {
    const id = parseLessonId(new URL(location.href).searchParams.get("lesson"), lessons, preferences.currentLesson);
    if (id !== currentLesson?.id) loadLesson(id, { historyMode: "none" });
  });
  window.addEventListener("beforeunload", () => {
    savePosition(dom.audio, "audio", true);
    savePosition(dom.video, "video", true);
  });
  window.addEventListener("pageshow", checkTimer);
  window.addEventListener("focus", checkTimer);
  document.addEventListener("visibilitychange", checkTimer);
}

async function init() {
  bindMedia(dom.audio, "audio");
  bindMedia(dom.video, "video");
  bindEvents();
  registerMediaSession();

  try {
    const response = await fetch("data/lessons.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.lessons) || payload.lessons.length === 0) throw new Error("课程数据为空");
    lessons = [...payload.lessons].sort((a, b) => a.id - b.id);

    preferences.speed = normalizeSpeed(preferences.speed);
    preferences.fontScale = clamp(Number(preferences.fontScale) || 1, 0.9, 1.4);
    activeMode = preferences.mode === "video" ? "video" : "audio";
    setMode(activeMode, { persist: false, pausePrevious: false });
    setSpeed(preferences.speed, { persist: false });
    setLoop(Boolean(preferences.loop), { persist: false });
    setFontScale(preferences.fontScale, { persist: false });
    renderLessonOptions();

    const requested = new URL(location.href).searchParams.get("lesson");
    const id = parseLessonId(requested, lessons, preferences.currentLesson);
    loadLesson(id, { historyMode: "replace" });
    restoreTimer();
  } catch (error) {
    console.error(error);
    dom.appError.textContent =
      "课程数据加载失败。请通过 HTTP 静态服务器打开项目（例如 npm run serve），不要直接双击 index.html。";
    dom.appError.hidden = false;
  }
}

init();
