export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function shuffleArray(items, randomFn = Math.random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function byQuestionId(questions) {
  return new Map(questions.map((question) => [question.id, question]));
}

export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function countAnswered(session) {
  return session.order.filter((id) => Boolean(session.answers[id])).length;
}

export function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

export function isValidOptionOrder(order) {
  return Array.isArray(order)
    && order.length === 4
    && order.every((choice) => ["A", "B", "C", "D"].includes(choice))
    && new Set(order).size === 4;
}

const DANGER_KEYWORDS = [
  "không", "ngoại trừ", "không phải", "không đúng", "không có",
  "không gặp", "không xảy ra", "sai", "không bao giờ", "trừ", "không thuộc"
];

export function highlightKeywords(text) {
  let result = escapeHtml(text);
  // Sort longest first so "không phải" matches before "không"
  const sorted = [...DANGER_KEYWORDS].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(${sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );
  result = result.replace(pattern, '<mark class="keyword-danger">$1</mark>');
  return result;
}

export function isClinicalQuestion(questionText) {
  const clinicalPrefixes = [
    "bệnh nhân", "bệnh nhi", "người bệnh", "nb nam", "nb nữ", "bn nam", "bn nữ",
    "anh ", "chị ", "cháu ", "em bé"
  ];
  const lower = questionText.toLowerCase();
  return clinicalPrefixes.some(p => lower.startsWith(p) || lower.includes(p));
}
