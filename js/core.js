export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.5;
export const SPEED_STEP = 0.05;
export const REPEAT_MODES = ["off", "one", "queue"];

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const stepped = Math.round(clamp(numeric, SPEED_MIN, SPEED_MAX) / SPEED_STEP) * SPEED_STEP;
  return Number(stepped.toFixed(2));
}

export function formatSpeed(value) {
  const speed = normalizeSpeed(value);
  return `${speed.toFixed(2).replace(/0$/, "")}×`;
}

export function formatMediaTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function parseLessonId(value, lessons, fallbackId = 1) {
  const requested = Number.parseInt(String(value), 10);
  if (lessons.some((lesson) => lesson.id === requested)) return requested;

  const fallback = Number.parseInt(String(fallbackId), 10);
  if (lessons.some((lesson) => lesson.id === fallback)) return fallback;

  return lessons[0]?.id ?? 1;
}

export function getAdjacentLessonId(lessons, currentId, direction) {
  const index = lessons.findIndex((lesson) => lesson.id === currentId);
  if (index < 0) return null;
  return lessons[index + direction]?.id ?? null;
}

export function normalizeCustomTimerMinutes(value) {
  const minutes = Number.parseInt(String(value), 10);
  if (!Number.isFinite(minutes)) return null;
  return clamp(minutes, 1, 240);
}

export function normalizeRepeatMode(value, legacyLoop = false) {
  if (REPEAT_MODES.includes(value)) return value;
  return legacyLoop ? "one" : "off";
}

export function normalizeLessonQueue(values, lessons) {
  const validIds = new Set(
    lessons
      .map((lesson) => Number(typeof lesson === "number" ? lesson : lesson?.id))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  return [...new Set((Array.isArray(values) ? values : []).map(Number))]
    .filter((id) => validIds.has(id))
    .sort((a, b) => a - b);
}

export function getQueueLessonId(queue, currentId, direction = 1) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const index = queue.indexOf(Number(currentId));
  if (index < 0) return direction < 0 ? queue.at(-1) : queue[0];
  const offset = ((index + direction) % queue.length + queue.length) % queue.length;
  return queue[offset];
}

export function formatLessonQueue(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return "未设置播放列表";
  const ids = [...queue].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const contiguous = ids.every((id, index) => index === 0 || id === ids[index - 1] + 1);
  if (contiguous && ids.length > 1) {
    return `Lesson ${ids[0]}–${ids.at(-1)} · ${ids.length} 课`;
  }
  const displayed = ids.length <= 6 ? ids.join("、") : `${ids.slice(0, 5).join("、")}…`;
  return `Lesson ${displayed} · ${ids.length} 课`;
}
