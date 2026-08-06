import { byQuestionId, clamp, shuffleArray } from "./utils.js";

const DISPLAY_CHOICES = ["A", "B", "C", "D"];

export function createSession(questions, options = {}) {
  const {
    shuffleQuestions = false,
    shuffleOptions = false,
    randomFn = Math.random,
    mode = "all",
    sourceQuestionIds = null,
    questionLimit = null,
    immediateFeedback = false,
    fastMode = false,
    rangeStart = null,
    rangeEnd = null
  } = options;

  const selectedQuestions = sourceQuestionIds
    ? questions.filter((question) => sourceQuestionIds.includes(question.id))
    : questions;
  const orderedIds = selectedQuestions.map((question) => question.id);
  const nextOrder = shuffleQuestions ? shuffleArray(orderedIds, randomFn) : orderedIds;
  const normalizedLimit =
    Number.isInteger(questionLimit) && questionLimit > 0
      ? Math.min(questionLimit, nextOrder.length)
      : nextOrder.length;

  return {
    order: nextOrder.slice(0, normalizedLimit),
    answers: {},
    optionOrderByQuestion: buildOptionOrderByQuestion(
      nextOrder.slice(0, normalizedLimit),
      shuffleOptions,
      randomFn
    ),
    currentIndex: 0,
    submitted: false,
    mode,
    rangeStart,
    rangeEnd,
    fastMode,
    immediateFeedback: fastMode ? false : immediateFeedback,
    feedbackByQuestion: {}
  };
}

export function buildOptionOrderByQuestion(questionIds, shuffleOptions = false, randomFn = Math.random) {
  return Object.fromEntries(
    questionIds.map((questionId) => [
      questionId,
      shuffleOptions ? shuffleArray(DISPLAY_CHOICES, randomFn) : [...DISPLAY_CHOICES]
    ])
  );
}

export function getOptionOrderForQuestion(session, questionId) {
  const optionOrder = session.optionOrderByQuestion?.[questionId];

  if (!Array.isArray(optionOrder) || optionOrder.length !== DISPLAY_CHOICES.length) {
    return [...DISPLAY_CHOICES];
  }

  return optionOrder;
}

export function getDisplayedOptions(question, session, questionId) {
  const optionOrder = getOptionOrderForQuestion(session, questionId);

  return DISPLAY_CHOICES.map((label, index) => {
    const originalKey = optionOrder[index] ?? label;

    return {
      label,
      originalKey,
      text: question.options[originalKey]
    };
  });
}

export function mapDisplayChoiceToOriginal(session, questionId, displayChoice) {
  const optionOrder = getOptionOrderForQuestion(session, questionId);
  const displayIndex = DISPLAY_CHOICES.indexOf(displayChoice);

  if (displayIndex === -1) {
    return displayChoice;
  }

  return optionOrder[displayIndex] ?? displayChoice;
}

export function mapOriginalChoiceToDisplay(session, questionId, originalChoice) {
  const optionOrder = getOptionOrderForQuestion(session, questionId);
  const displayIndex = optionOrder.indexOf(originalChoice);

  if (displayIndex === -1) {
    return originalChoice;
  }

  return DISPLAY_CHOICES[displayIndex];
}

export function selectAnswer(session, questionId, choice, correctAnswer = null) {
  if (session.immediateFeedback && session.feedbackByQuestion?.[questionId]) {
    return session;
  }

  const nextFeedback =
    session.immediateFeedback && correctAnswer
      ? {
        ...session.feedbackByQuestion,
        [questionId]: {
          selected: choice,
          correct: correctAnswer,
          isCorrect: choice === correctAnswer
        }
      }
      : session.feedbackByQuestion ?? {};

  return {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: choice
    },
    feedbackByQuestion: nextFeedback
  };
}

export function goToQuestion(session, nextIndex) {
  return {
    ...session,
    currentIndex: clamp(nextIndex, 0, Math.max(session.order.length - 1, 0))
  };
}

export function getAnswerFlowAction(session) {
  if (!session.fastMode) {
    return "stay";
  }

  return session.currentIndex >= session.order.length - 1 ? "submit" : "next";
}

export function scoreSession(session, questions) {
  const questionsById = byQuestionId(questions);
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  const wrongAnswers = [];

  for (const questionId of session.order) {
    const question = questionsById.get(questionId);
    const selected = session.answers[questionId];

    if (!selected) {
      unansweredCount += 1;
      wrongAnswers.push({
        id: questionId,
        selected: null,
        correct: question.answer
      });
      continue;
    }

    if (selected === question.answer) {
      correctCount += 1;
      continue;
    }

    incorrectCount += 1;
    wrongAnswers.push({
      id: questionId,
      selected,
      correct: question.answer
    });
  }

  const total = session.order.length;
  const scoreOn10 = total > 0
    ? Number((correctCount / total * 10).toFixed(2))
    : 0;

  return {
    correctCount,
    incorrectCount,
    unansweredCount,
    answeredCount: correctCount + incorrectCount,
    scoreOn10,
    wrongAnswers
  };
}
