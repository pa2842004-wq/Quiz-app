import test from "node:test";
import assert from "node:assert/strict";

import {
  createSession,
  getAnswerFlowAction,
  getDisplayedOptions,
  mapDisplayChoiceToOriginal,
  mapOriginalChoiceToDisplay,
  selectAnswer,
  goToQuestion,
  scoreSession
} from "../js/quiz.js";
import { buildWrongAnswerReview } from "../js/review.js";

const questions = [
  {
    id: 1,
    question: "Cau 1",
    options: { A: "A1", B: "B1", C: "C1", D: "D1" },
    answer: "A"
  },
  {
    id: 2,
    question: "Cau 2",
    options: { A: "A2", B: "B2", C: "C2", D: "D2" },
    answer: "C"
  },
  {
    id: 3,
    question: "Cau 3",
    options: { A: "A3", B: "B3", C: "C3", D: "D3" },
    answer: "B"
  }
];

test("createSession keeps original order by default", () => {
  const session = createSession(questions);

  assert.deepEqual(session.order, [1, 2, 3]);
  assert.equal(session.currentIndex, 0);
  assert.deepEqual(session.answers, {});
  assert.equal(session.submitted, false);
  assert.equal(session.mode, "all");
});

test("createSession can shuffle questions with injected randomness", () => {
  const randomValues = [0.9, 0.1];
  const session = createSession(questions, {
    shuffleQuestions: true,
    randomFn: () => randomValues.shift() ?? 0
  });

  assert.deepEqual(session.order, [2, 1, 3]);
});

test("createSession can limit the number of questions", () => {
  const session = createSession(questions, {
    questionLimit: 2
  });

  assert.deepEqual(session.order, [1, 2]);
});

test("createSession keeps selected range metadata on normal sessions", () => {
  const session = createSession(questions, {
    sourceQuestionIds: [2, 3],
    rangeStart: 2,
    rangeEnd: 3
  });

  assert.deepEqual(session.order, [2, 3]);
  assert.equal(session.rangeStart, 2);
  assert.equal(session.rangeEnd, 3);
});

test("createSession can shuffle answer order once per question", () => {
  const session = createSession(questions, {
    shuffleOptions: true,
    randomFn: () => 0
  });

  assert.deepEqual(session.optionOrderByQuestion, {
    1: ["B", "C", "D", "A"],
    2: ["B", "C", "D", "A"],
    3: ["B", "C", "D", "A"]
  });
});

test("createSession turns off immediate feedback when fast mode is enabled", () => {
  const session = createSession(questions, {
    fastMode: true,
    immediateFeedback: true
  });

  assert.equal(session.fastMode, true);
  assert.equal(session.immediateFeedback, false);
});

test("selectAnswer records a choice by question id", () => {
  const session = createSession(questions);
  const updated = selectAnswer(session, 2, "D");

  assert.deepEqual(updated.answers, { 2: "D" });
  assert.deepEqual(session.answers, {});
});

test("selectAnswer stores immediate feedback and locks the question after the first choice", () => {
  const session = createSession(questions, {
    immediateFeedback: true
  });
  const answered = selectAnswer(session, 1, "B", "A");
  const secondAttempt = selectAnswer(answered, 1, "A", "A");

  assert.deepEqual(answered.answers, { 1: "B" });
  assert.deepEqual(answered.feedbackByQuestion, {
    1: {
      selected: "B",
      correct: "A",
      isCorrect: false
    }
  });
  assert.deepEqual(secondAttempt.answers, { 1: "B" });
  assert.deepEqual(secondAttempt.feedbackByQuestion, answered.feedbackByQuestion);
});

test("display choice mapping uses shuffled answer order", () => {
  const session = createSession(questions, {
    shuffleOptions: true,
    randomFn: () => 0
  });

  assert.equal(mapDisplayChoiceToOriginal(session, 1, "A"), "B");
  assert.equal(mapDisplayChoiceToOriginal(session, 1, "D"), "A");
  assert.equal(mapOriginalChoiceToDisplay(session, 1, "A"), "D");
  assert.deepEqual(getDisplayedOptions(questions[0], session, 1), [
    { label: "A", originalKey: "B", text: "B1" },
    { label: "B", originalKey: "C", text: "C1" },
    { label: "C", originalKey: "D", text: "D1" },
    { label: "D", originalKey: "A", text: "A1" }
  ]);
});

test("goToQuestion moves the active question safely", () => {
  const session = createSession(questions);
  const updated = goToQuestion(session, 2);
  const clamped = goToQuestion(session, 99);

  assert.equal(updated.currentIndex, 2);
  assert.equal(clamped.currentIndex, 2);
});

test("getAnswerFlowAction stays on the same question outside fast mode", () => {
  const session = createSession(questions);

  assert.equal(getAnswerFlowAction(session), "stay");
});

test("getAnswerFlowAction advances in fast mode until the last question", () => {
  const session = createSession(questions, {
    fastMode: true
  });
  const lastQuestionSession = goToQuestion(session, 2);

  assert.equal(getAnswerFlowAction(session), "next");
  assert.equal(getAnswerFlowAction(lastQuestionSession), "submit");
});

test("scoreSession counts correct, wrong, and unanswered questions", () => {
  let session = createSession(questions);
  session = selectAnswer(session, 1, "A");
  session = selectAnswer(session, 2, "D");

  const result = scoreSession(session, questions);

  assert.equal(result.correctCount, 1);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.unansweredCount, 1);
  assert.equal(result.answeredCount, 2);
  assert.equal(result.scoreOn10, 3.33);
  assert.deepEqual(result.wrongAnswers, [
    {
      id: 2,
      selected: "D",
      correct: "C"
    }
  ]);
});

test("scoreOn10 counts all questions including unanswered in the denominator", () => {
  let session = createSession(questions);
  session = selectAnswer(session, 1, "A");
  session = selectAnswer(session, 2, "C");
  session = selectAnswer(session, 3, "D");

  const result = scoreSession(session, questions);

  assert.equal(result.correctCount, 2);
  assert.equal(result.scoreOn10, 6.67);
});

test("scoreOn10 returns 0 when session is empty", () => {
  const session = createSession(questions);
  const result = scoreSession(session, questions);

  assert.equal(result.correctCount, 0);
  assert.equal(result.scoreOn10, 0);
});

test("scoreOn10 reaches exactly 10 when every question is correct", () => {
  let session = createSession(questions);
  session = selectAnswer(session, 1, "A");
  session = selectAnswer(session, 2, "C");
  session = selectAnswer(session, 3, "B");

  const result = scoreSession(session, questions);

  assert.equal(result.correctCount, 3);
  assert.equal(result.scoreOn10, 10);
});

test("scoreOn10 rounds to two decimal places", () => {
  const customQuestions = [
    { id: 1, question: "Q1", options: { A: "a", B: "b", C: "c", D: "d" }, answer: "A" },
    { id: 2, question: "Q2", options: { A: "a", B: "b", C: "c", D: "d" }, answer: "A" },
    { id: 3, question: "Q3", options: { A: "a", B: "b", C: "c", D: "d" }, answer: "A" },
    { id: 4, question: "Q4", options: { A: "a", B: "b", C: "c", D: "d" }, answer: "A" }
  ];
  let session = createSession(customQuestions);
  session = selectAnswer(session, 1, "A");
  session = selectAnswer(session, 2, "A");
  session = selectAnswer(session, 3, "A");

  const result = scoreSession(session, customQuestions);

  assert.equal(result.correctCount, 3);
  assert.equal(result.scoreOn10, 7.5);
});

test("buildWrongAnswerReview returns the wrong questions with selected and correct answers", () => {
  let session = createSession(questions);
  session = selectAnswer(session, 1, "B");
  session = selectAnswer(session, 2, "C");

  const review = buildWrongAnswerReview(questions, session);

  assert.deepEqual(review, [
    {
      id: 1,
      question: "Cau 1",
      options: { A: "A1", B: "B1", C: "C1", D: "D1" },
      displayOptions: [
        { label: "A", originalKey: "A", text: "A1" },
        { label: "B", originalKey: "B", text: "B1" },
        { label: "C", originalKey: "C", text: "C1" },
        { label: "D", originalKey: "D", text: "D1" }
      ],
      selected: "B",
      correct: "A",
      selectedDisplay: "B",
      correctDisplay: "A"
    }
  ]);
});

test("buildWrongAnswerReview keeps shuffled display labels for review mode", () => {
  let session = createSession(questions, {
    shuffleOptions: true,
    randomFn: () => 0
  });
  session = selectAnswer(session, 1, "B");

  const [reviewItem] = buildWrongAnswerReview(questions, session);

  assert.equal(reviewItem.selectedDisplay, "A");
  assert.equal(reviewItem.correctDisplay, "D");
  assert.deepEqual(reviewItem.displayOptions, [
    { label: "A", originalKey: "B", text: "B1" },
    { label: "B", originalKey: "C", text: "C1" },
    { label: "C", originalKey: "D", text: "D1" },
    { label: "D", originalKey: "A", text: "A1" }
  ]);
});
