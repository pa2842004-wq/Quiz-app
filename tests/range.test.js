import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRangePresets,
  formatRangeLabel,
  getQuestionIdsForRange,
  hydrateRangeSettings,
  normalizeRangeSelection
} from "../js/range.js";

const questions = [
  { id: 1, question: "Cau 1" },
  { id: 2, question: "Cau 2" },
  { id: 3, question: "Cau 3" },
  { id: 4, question: "Cau 4" }
];

test("normalizeRangeSelection clamps values into bounds", () => {
  assert.deepEqual(normalizeRangeSelection("0", "99", 4), {
    rangeStart: 1,
    rangeEnd: 4,
    isValid: true,
    error: ""
  });
});

test("normalizeRangeSelection rejects reversed ranges", () => {
  assert.deepEqual(normalizeRangeSelection("4", "2", 4), {
    rangeStart: 4,
    rangeEnd: 2,
    isValid: false,
    error: "Khoảng câu không hợp lệ. Vui lòng kiểm tra lại từ câu và đến câu."
  });
});

test("hydrateRangeSettings fills in defaults for legacy settings", () => {
  assert.deepEqual(hydrateRangeSettings({ customQuestionCount: "50" }, 4), {
    rangeStart: "1",
    rangeEnd: "4"
  });
});

test("hydrateRangeSettings falls back to safe defaults for reversed ranges", () => {
  assert.deepEqual(hydrateRangeSettings({ rangeStart: "4", rangeEnd: "2" }, 4), {
    rangeStart: "1",
    rangeEnd: "4"
  });
});

test("hydrateRangeSettings keeps explicit saved range values when present", () => {
  assert.deepEqual(hydrateRangeSettings({ rangeStart: "51", rangeEnd: "100" }, 461), {
    rangeStart: "51",
    rangeEnd: "100"
  });
});

test("hydrateRangeSettings keeps legacy-bridged count values once mapped to a range", () => {
  assert.deepEqual(hydrateRangeSettings({ rangeStart: "1", rangeEnd: "50" }, 461), {
    rangeStart: "1",
    rangeEnd: "50"
  });
});

test("buildRangePresets creates 50-question blocks and a partial tail block", () => {
  assert.deepEqual(buildRangePresets(120), [
    { start: 1, end: 50, label: "1-50" },
    { start: 51, end: 100, label: "51-100" },
    { start: 101, end: 120, label: "101-120" }
  ]);
});

test("buildRangePresets falls back to the default step when given an invalid step", () => {
  assert.deepEqual(buildRangePresets(120, 0), [
    { start: 1, end: 50, label: "1-50" },
    { start: 51, end: 100, label: "51-100" },
    { start: 101, end: 120, label: "101-120" }
  ]);
});

test("buildRangePresets creates the partial tail block for 461 questions", () => {
  const presets = buildRangePresets(461);
  assert.deepEqual(presets.at(-1), {
    start: 451,
    end: 461,
    label: "451-461"
  });
});

test("getQuestionIdsForRange returns only ids inside the inclusive range", () => {
  assert.deepEqual(getQuestionIdsForRange(questions, 2, 3), [2, 3]);
});

test("formatRangeLabel returns the study label shown in the UI", () => {
  assert.equal(formatRangeLabel(51, 100), "câu 51-100");
});
