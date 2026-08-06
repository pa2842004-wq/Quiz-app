import {
  createSession,
  getAnswerFlowAction,
  getDisplayedOptions,
  goToQuestion,
  mapDisplayChoiceToOriginal,
  mapOriginalChoiceToDisplay,
  scoreSession,
  selectAnswer
} from "./quiz.js";
import {
  buildRangePresets,
  formatRangeLabel,
  getQuestionIdsForRange,
  hydrateRangeSettings,
  normalizeRangeSelection
} from "./range.js";
import { buildWrongAnswerReview } from "./review.js";
import { createQuizStorage } from "./storage.js";
import { resolvePageView } from "./page-routing.js";
import {
  escapeHtml,
  countAnswered,
  clampIndex,
  isValidOptionOrder
} from "./utils.js";
import {
  showReactionToast,
  launchConfetti,
  shakeCard
} from "./reactions.js";
import {
  loadHistory,
  saveHistory,
  deleteHistoryEntry,
  clearHistory
} from "./history.js";
import {
  render as renderView,
  renderHome as renderHomeView,
  renderQuiz as renderQuizView,
  renderResults as renderResultsView,
  renderHistoryDetail as renderHistoryDetailView
} from "./views.js";

const app = document.querySelector("#app");
const HOME_PAGE_URL = "./index.html";
const QUIZ_PAGE_URL = "./quiz.html";
const pageMode = document.body.dataset.page === "quiz" ? "quiz" : "home";

const TOPICS = [
  { id: "duoc", name: "Hóa Dược", file: "./data/questions.json", color: "pink" },
  { id: "gdct2", name: "Giáo dục chính trị 2", file: "./data/questions_gdct2.json", color: "lavender" },
  { id: "thucvat", name: "Thực vật - Dược liệu", file: "./data/questions_thucvat_duoclieu.json", color: "mint" }
];

let currentTopicId = localStorage.getItem("htbt-quiz-current-topic") || "duoc";
if (!TOPICS.some(t => t.id === currentTopicId)) {
  currentTopicId = "duoc";
}

let storage = null;
let historyStorage = null;

function initTopicStorage(topicId) {
  currentTopicId = topicId;
  localStorage.setItem("htbt-quiz-current-topic", topicId);

  const storageKey = `htbt-quiz-app-state-${topicId}`;
  const historyKey = `htbt-quiz-history-${topicId}`;

  // Migration for "duoc" topic if old generic keys exist
  if (topicId === "duoc") {
    if (!localStorage.getItem(storageKey) && localStorage.getItem("htbt-quiz-app-state")) {
      localStorage.setItem(storageKey, localStorage.getItem("htbt-quiz-app-state"));
    }
    if (!localStorage.getItem(historyKey) && localStorage.getItem("htbt-quiz-history")) {
      localStorage.setItem(historyKey, localStorage.getItem("htbt-quiz-history"));
    }
  }

  storage = createQuizStorage(window.localStorage, storageKey);
  historyStorage = createQuizStorage(window.localStorage, historyKey);
}

const state = {
  questions: [],
  questionsById: new Map(),
  loading: true,
  error: "",
  ui: {
    setupError: ""
  },
  persisted: {
    version: 1,
    settings: {
      shuffleQuestions: true,
      shuffleOptions: false,
      immediateFeedback: false,
      fastMode: false,
      rangeStart: "1",
      rangeEnd: "1"
    },
    session: null,
    lastResult: null,
    bookmarks: []
  },
};

// Track current view for keyboard handler
let currentView = "home"; // "home" | "quiz" | "results" | "history-detail"
// Show/hide question map
let showQuestionMap = false;
// Show/hide history section
let showHistory = false;

document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);
document.addEventListener("keydown", handleKeydown);


init();

async function init() {
  initTopicStorage(currentTopicId);
  await loadTopicData(currentTopicId);
}

async function loadTopicData(topicId) {
  state.loading = true;
  state.error = "";
  render();

  try {
    const topic = TOPICS.find((t) => t.id === topicId) || TOPICS[0];
    const response = await fetch(topic.file);
    if (!response.ok) {
      throw new Error(`Khong the tai ${topic.file} (${response.status})`);
    }
    const questions = await response.json();
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error(`${topic.file} khong co du lieu hop le.`);
    }

    state.questions = questions;
    state.questionsById = new Map(questions.map((question) => [question.id, question]));

    hydratePersistedState();

    state.persisted.settings = {
      ...state.persisted.settings,
      ...hydrateRangeSettings(state.persisted.settings, state.questions.length)
    };
    sanitizePersistedSession();
  } catch (error) {
    state.error = buildLoadErrorMessage(error);
  } finally {
    state.loading = false;
    render();
  }
}

function hydratePersistedState() {
  const saved = storage.load();
  if (saved && typeof saved === "object") {
    const savedSettings = saved.settings ?? {};
    const hasExplicitRangeStart = savedSettings.rangeStart != null;
    const hasExplicitRangeEnd = savedSettings.rangeEnd != null;
    const legacyCustomQuestionCount = savedSettings.customQuestionCount;
    const derivedRangeStart =
      !hasExplicitRangeStart && !hasExplicitRangeEnd && legacyCustomQuestionCount != null
        ? "1"
        : savedSettings.rangeStart ?? "1";
    const derivedRangeEnd =
      !hasExplicitRangeStart && !hasExplicitRangeEnd && legacyCustomQuestionCount != null
        ? String(legacyCustomQuestionCount)
        : savedSettings.rangeEnd ?? "1";

    state.persisted = {
      version: 1,
      settings: {
        shuffleQuestions: savedSettings.shuffleQuestions ?? true,
        shuffleOptions: savedSettings.shuffleOptions ?? false,
        immediateFeedback: savedSettings.immediateFeedback ?? false,
        fastMode: savedSettings.fastMode ?? false,
        rangeStart: derivedRangeStart,
        rangeEnd: derivedRangeEnd
      },
      session: saved.session ?? null,
      lastResult: saved.lastResult ?? null,
      bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks : []
    };
  }
}

function sanitizePersistedSession() {
  const session = state.persisted.session;
  if (!session) return;

  const hasImmediateFeedback = !session.fastMode && Boolean(session.immediateFeedback);
  const validOrder = Array.isArray(session.order)
    ? session.order.filter((id) => state.questionsById.has(id))
    : [];

  if (validOrder.length === 0) {
    state.persisted.session = null;
    persistState();
    return;
  }

  const safeAnswers = {};
  const rawAnswers = session.answers ?? {};
  const safeFeedback = {};
  const safeOptionOrderByQuestion = {};

  for (const id of validOrder) {
    const savedAnswer = rawAnswers[id];
    const rawOptionOrder = session.optionOrderByQuestion?.[id];
    safeOptionOrderByQuestion[id] = isValidOptionOrder(rawOptionOrder)
      ? [...rawOptionOrder]
      : ["A", "B", "C", "D"];

    if (["A", "B", "C", "D"].includes(savedAnswer)) {
      safeAnswers[id] = savedAnswer;
      if (hasImmediateFeedback) {
        const correctAnswer = state.questionsById.get(id)?.answer;
        if (correctAnswer) {
          safeFeedback[id] = {
            selected: savedAnswer,
            correct: correctAnswer,
            isCorrect: savedAnswer === correctAnswer
          };
        }
      }
    }
  }

  state.persisted.session = {
    order: validOrder,
    answers: safeAnswers,
    currentIndex: clampIndex(session.currentIndex ?? 0, validOrder.length),
    submitted: Boolean(session.submitted),
    mode: session.mode === "wrong-only" ? "wrong-only" : session.mode === "bookmark" ? "bookmark" : "all",
    rangeStart: Number.isInteger(session.rangeStart) ? session.rangeStart : null,
    rangeEnd: Number.isInteger(session.rangeEnd) ? session.rangeEnd : null,
    fastMode: Boolean(session.fastMode),
    immediateFeedback: hasImmediateFeedback,
    feedbackByQuestion: safeFeedback,
    optionOrderByQuestion: safeOptionOrderByQuestion
  };
}

function buildLoadErrorMessage(error) {
  const protocolHint =
    window.location.protocol === "file:"
      ? "Ban can mo app bang local server, vi fetch data/questions.json se khong on dinh khi mo truc tiep file://."
      : "";
  return [error.message, protocolHint].filter(Boolean).join(" ");
}

function persistState() {
  storage.save(state.persisted);
}

function render() {
  renderView(app, state, {
    pageMode,
    session: state.persisted.session,
    historyStorage,
    showHistory,
    showQuestionMap,
    redirectToHomePage,
    renderHome,
    renderQuiz,
    renderResults
  });
}

function renderHome() {
  currentView = "home";
  renderHomeView(app, state, {
    session: state.persisted.session,
    lastResult: state.persisted.lastResult,
    bookmarks: state.persisted.bookmarks,
    historyStorage,
    showHistory,
    currentTopicId,
    TOPICS
  });
}

function renderQuiz(session) {
  currentView = "quiz";
  renderQuizView(app, session, {
    questionsById: state.questionsById,
    bookmarks: state.persisted.bookmarks,
    showQuestionMap
  });
}

function renderResults(session) {
  currentView = "results";
  renderResultsView(app, session, {
    questions: state.questions,
    lastResult: state.persisted.lastResult
  });
}

function renderHistoryDetail(index) {
  currentView = "history-detail";
  const success = renderHistoryDetailView(app, historyStorage, index);
  if (!success) renderHome();
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || state.loading || state.error) return;

  const { action } = button.dataset;

  if (action === "switch-topic") {
    const newTopicId = button.dataset.topicId;
    if (newTopicId && newTopicId !== currentTopicId) {
      initTopicStorage(newTopicId);
      await loadTopicData(newTopicId);
    }
    return;
  }

  if (action === "start-new") {
    if (button.dataset.rangeStart && button.dataset.rangeEnd) {
      startRangeSession(button.dataset.rangeStart, button.dataset.rangeEnd);
      return;
    }
    startRangeSession("1", String(button.dataset.count || state.questions.length));
    return;
  }
  if (action === "start-custom") {
    startRangeSession("1", String(state.persisted.settings.rangeEnd));
    return;
  }
  if (action === "start-range") {
    startRangeSession();
    return;
  }
  if (action === "start-range-preset") {
    startRangeSession(button.dataset.rangeStart, button.dataset.rangeEnd);
    return;
  }
  if (action === "start-surprise") {
    showQuestionMap = false;
    state.ui.setupError = "";
    state.persisted.session = createSession(state.questions, {
      shuffleQuestions: true,
      shuffleOptions: state.persisted.settings.shuffleOptions,
      questionLimit: 10,
      mode: "all",
      immediateFeedback: state.persisted.settings.immediateFeedback,
      fastMode: state.persisted.settings.fastMode
    });
    state.persisted.lastResult = null;
    persistState();
    if (pageMode === "home") navigateToQuizPage();
    else renderQuiz(state.persisted.session);
    return;
  }
  if (action === "continue-session") {
    navigateToQuizPage();
    return;
  }
  if (action === "review-wrong") {
    startReviewWrongSession();
    return;
  }
  if (action === "review-bookmarks") {
    startBookmarkSession();
    return;
  }
  if (action === "reset-state") {
    resetAllState();
    return;
  }
  if (action === "history-toggle") {
    showHistory = !showHistory;
    renderHome();
    return;
  }
  if (action === "view-history-detail") {
    const idx = parseInt(button.dataset.index, 10);
    if (!isNaN(idx)) renderHistoryDetail(idx);
    return;
  }
  if (action === "delete-history-entry") {
    const idx = parseInt(button.dataset.index, 10);
    if (!isNaN(idx)) {
      deleteHistoryEntry(historyStorage, idx);
      renderHome();
    }
    return;
  }
  if (action === "clear-all-history") {
    clearHistory(historyStorage);
    renderHome();
    return;
  }
  if (action === "go-home") {
    navigateToHomePage();
    return;
  }
  if (action === "toggle-map") {
    showQuestionMap = !showQuestionMap;
    renderQuiz(state.persisted.session);
    return;
  }
  if (action === "jump-to-question") {
    const idx = parseInt(button.dataset.index, 10);
    if (!isNaN(idx)) {
      state.persisted.session = goToQuestion(state.persisted.session, idx);
      persistState();
      renderQuiz(state.persisted.session);
    }
    return;
  }
  if (action === "do-quick-jump") {
    const input = document.getElementById("quick-jump-input");
    if (input) {
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= 1) {
        state.persisted.session = goToQuestion(state.persisted.session, val - 1);
        persistState();
        renderQuiz(state.persisted.session);
      }
    }
    return;
  }
  if (action === "toggle-bookmark") {
    toggleBookmark(Number(button.dataset.questionId));
    renderQuiz(state.persisted.session);
    return;
  }

  const session = state.persisted.session;
  if (!session || session.submitted) return;

  if (action === "select-answer") {
    handleAnswerSelection(session, Number(button.dataset.questionId), button.dataset.choice);
    return;
  }
  if (action === "go-prev") {
    state.persisted.session = goToQuestion(session, session.currentIndex - 1);
    persistState();
    renderQuiz(state.persisted.session);
    return;
  }
  if (action === "go-next") {
    state.persisted.session = goToQuestion(session, session.currentIndex + 1);
    persistState();
    renderQuiz(state.persisted.session);
    return;
  }
  if (action === "submit-quiz") {
    submitSession(session);
  }
}

function handleChange(event) {
  const target = event.target;
  const role = target.dataset.role;

  if (role === 'shuffle-toggle') {
    state.persisted.settings.shuffleQuestions = target.checked;
  } else if (role === 'shuffle-options-toggle') {
    state.persisted.settings.shuffleOptions = target.checked;
  } else if (role === 'fast-mode-toggle') {
    state.persisted.settings.fastMode = target.checked;
    if (target.checked) state.persisted.settings.immediateFeedback = false;
  } else if (role === 'instant-feedback-toggle') {
    state.persisted.settings.immediateFeedback = target.checked;
    if (target.checked) state.persisted.settings.fastMode = false;
  } else if (role === 'range-start') {
    state.persisted.settings.rangeStart = target.value;
    state.ui.setupError = "";
  } else if (role === 'range-end') {
    state.persisted.settings.rangeEnd = target.value;
    state.ui.setupError = "";
  } else if (role === 'custom-question-count') {
    state.persisted.settings.rangeStart = "1";
    state.persisted.settings.rangeEnd = target.value;
    state.ui.setupError = "";
  } else {
    return;
  }

  persistState();
  if (currentView === "home") renderHome();
}

function handleKeydown(event) {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (currentView !== "quiz") return;

  const session = state.persisted.session;
  if (!session || session.submitted) return;

  const currentQuestionId = session.order[session.currentIndex];
  const feedback = session.feedbackByQuestion?.[currentQuestionId] ?? null;
  const isLocked = Boolean(session.immediateFeedback && feedback);

  switch (event.key.toLowerCase()) {
    case "a":
    case "b":
    case "c":
    case "d":
      if (!isLocked) handleAnswerSelection(session, currentQuestionId, event.key.toUpperCase());
      break;
    case "arrowright":
    case " ":
      event.preventDefault();
      state.persisted.session = goToQuestion(session, session.currentIndex + 1);
      persistState();
      renderQuiz(state.persisted.session);
      break;
    case "arrowleft":
      event.preventDefault();
      state.persisted.session = goToQuestion(session, session.currentIndex - 1);
      persistState();
      renderQuiz(state.persisted.session);
      break;
    case "s":
      toggleBookmark(currentQuestionId);
      renderQuiz(state.persisted.session);
      break;
    case "m":
      showQuestionMap = !showQuestionMap;
      renderQuiz(state.persisted.session);
      break;
  }
}

function handleAnswerSelection(session, questionId, displayChoice) {
  const correctAnswer = state.questionsById.get(questionId)?.answer ?? null;
  const chosenAnswer = mapDisplayChoiceToOriginal(session, questionId, displayChoice);
  const updatedSession = selectAnswer(session, questionId, chosenAnswer, correctAnswer);

  state.persisted.session = updatedSession;
  persistState();

  const nextStep = getAnswerFlowAction(updatedSession);
  if (nextStep === "submit") {
    submitSession(updatedSession);
    return;
  }
  if (nextStep === "next") {
    state.persisted.session = goToQuestion(updatedSession, updatedSession.currentIndex + 1);
    persistState();
    renderQuiz(state.persisted.session);
    return;
  }
  if (updatedSession.immediateFeedback && correctAnswer) {
    const isCorrect = chosenAnswer === correctAnswer;
    showReactionToast(isCorrect);
    if (isCorrect) launchConfetti();
    else shakeCard();
  }
  renderQuiz(state.persisted.session);
}

function startRangeSession(
  rangeStartValue = state.persisted.settings.rangeStart,
  rangeEndValue = state.persisted.settings.rangeEnd
) {
  showQuestionMap = false;
  const normalized = normalizeRangeSelection(rangeStartValue, rangeEndValue, state.questions.length);
  const sourceQuestionIds = normalized.isValid
    ? getQuestionIdsForRange(state.questions, normalized.rangeStart, normalized.rangeEnd)
    : [];

  if (!normalized.isValid || sourceQuestionIds.length === 0) {
    state.ui.setupError = normalized.error || "Khoảng câu không hợp lệ.";
    renderHome();
    return;
  }

  state.ui.setupError = "";
  state.persisted.settings.rangeStart = String(normalized.rangeStart);
  state.persisted.settings.rangeEnd = String(normalized.rangeEnd);
  state.persisted.session = createSession(state.questions, {
    shuffleQuestions: state.persisted.settings.shuffleQuestions,
    shuffleOptions: state.persisted.settings.shuffleOptions,
    mode: "all",
    sourceQuestionIds,
    rangeStart: normalized.rangeStart,
    rangeEnd: normalized.rangeEnd,
    immediateFeedback: state.persisted.settings.immediateFeedback,
    fastMode: state.persisted.settings.fastMode
  });
  state.persisted.lastResult = null;
  persistState();
  if (pageMode === "home") navigateToQuizPage();
  else renderQuiz(state.persisted.session);
}

function startReviewWrongSession() {
  const wrongIds = state.persisted.lastResult?.wrongAnswers?.map((item) => item.id) ?? [];
  if (wrongIds.length === 0) {
    render();
    return;
  }
  showQuestionMap = false;
  state.ui.setupError = "";
  state.persisted.session = createSession(state.questions, {
    shuffleQuestions: state.persisted.settings.shuffleQuestions,
    shuffleOptions: state.persisted.settings.shuffleOptions,
    mode: "wrong-only",
    sourceQuestionIds: wrongIds,
    immediateFeedback: state.persisted.settings.immediateFeedback,
    fastMode: state.persisted.settings.fastMode
  });
  persistState();
  if (pageMode === "home") navigateToQuizPage();
  else renderQuiz(state.persisted.session);
}

function startBookmarkSession() {
  const bookmarkIds = state.persisted.bookmarks;
  if (bookmarkIds.length === 0) {
    renderHome();
    return;
  }
  showQuestionMap = false;
  state.ui.setupError = "";
  state.persisted.session = createSession(state.questions, {
    shuffleQuestions: state.persisted.settings.shuffleQuestions,
    shuffleOptions: state.persisted.settings.shuffleOptions,
    mode: "bookmark",
    sourceQuestionIds: bookmarkIds,
    immediateFeedback: state.persisted.settings.immediateFeedback,
    fastMode: state.persisted.settings.fastMode
  });
  persistState();
  if (pageMode === "home") navigateToQuizPage();
  else renderQuiz(state.persisted.session);
}

function toggleBookmark(questionId) {
  const idx = state.persisted.bookmarks.indexOf(questionId);
  if (idx === -1) state.persisted.bookmarks.push(questionId);
  else state.persisted.bookmarks.splice(idx, 1);
  persistState();
}

function submitSession(session) {
  const submittedSession = { ...session, submitted: true };
  const summary = scoreSession(submittedSession, state.questions);
  const wrongReview = buildWrongAnswerReview(state.questions, submittedSession);
  saveHistory(historyStorage, summary, session, wrongReview);
  state.persisted.session = submittedSession;
  state.persisted.lastResult = summary;
  persistState();
  renderResults(submittedSession);
}

function resetAllState() {
  state.ui.setupError = "";
  state.persisted.session = null;
  state.persisted.lastResult = null;
  state.persisted.bookmarks = [];
  storage.clear();
  persistState();
  if (pageMode === "quiz") navigateToHomePage();
  else renderHome();
}

function navigateToQuizPage() { window.location.href = QUIZ_PAGE_URL; }
function navigateToHomePage() { window.location.href = HOME_PAGE_URL; }
function redirectToHomePage() {
  app.innerHTML = `<div class="status-block"><p>Khong co phien lam bai hop le. Dang quay ve trang chinh...</p></div>`;
  window.location.replace(HOME_PAGE_URL);
}
