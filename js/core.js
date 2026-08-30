export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.5;
export const SPEED_STEP = 0.05;

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
