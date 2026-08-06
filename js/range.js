import { clamp } from "./utils.js";

const INVALID_RANGE_MESSAGE = "Khoảng câu không hợp lệ. Vui lòng kiểm tra lại từ câu và đến câu.";

function parseRangeValue(value, fallback, maxQuestionId) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(parsed, 1, maxQuestionId);
}

export function normalizeRangeSelection(startValue, endValue, maxQuestionId) {
  const safeMax = Math.max(maxQuestionId, 1);
  const rangeStart = parseRangeValue(startValue, 1, safeMax);
  const rangeEnd = parseRangeValue(endValue, safeMax, safeMax);

  if (rangeStart > rangeEnd) {
    return {
      rangeStart,
      rangeEnd,
      isValid: false,
      error: INVALID_RANGE_MESSAGE
    };
  }

  return {
    rangeStart,
    rangeEnd,
    isValid: true,
    error: ""
  };
}

export function hydrateRangeSettings(savedSettings = {}, maxQuestionId) {
  const normalized = normalizeRangeSelection(
    savedSettings.rangeStart ?? "1",
    savedSettings.rangeEnd ?? String(maxQuestionId),
    maxQuestionId
  );

  if (!normalized.isValid) {
    return {
      rangeStart: "1",
      rangeEnd: String(Math.max(maxQuestionId, 1))
    };
  }

  return {
    rangeStart: String(normalized.rangeStart),
    rangeEnd: String(normalized.rangeEnd)
  };
}

export function buildRangePresets(maxQuestionId, step = 50) {
  const safeStep = Number.isInteger(step) && step > 0 ? step : 50;
  const presets = [];

  for (let start = 1; start <= maxQuestionId; start += safeStep) {
    const end = Math.min(start + safeStep - 1, maxQuestionId);
    presets.push({ start, end, label: `${start}-${end}` });
  }

  return presets;
}

export function getQuestionIdsForRange(questions, rangeStart, rangeEnd) {
  return questions
    .filter((question) => question.id >= rangeStart && question.id <= rangeEnd)
    .map((question) => question.id);
}

export function formatRangeLabel(rangeStart, rangeEnd) {
  return `câu ${rangeStart}-${rangeEnd}`;
}
