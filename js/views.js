import {
  escapeHtml,
  highlightKeywords,
  isClinicalQuestion,
  countAnswered
} from "./utils.js";
import {
  buildRangePresets,
  formatRangeLabel
} from "./range.js";
import {
  getDisplayedOptions,
  mapOriginalChoiceToDisplay,
  scoreSession
} from "./quiz.js";
import { buildWrongAnswerReview } from "./review.js";
import { resolvePageView } from "./page-routing.js";
import { getResultEvaluation } from "./reactions.js";
import { loadHistory } from "./history.js";

function formatScoreOn10(score) {
  const value = typeof score === "number" && !Number.isNaN(score) ? score : 0;
  return value.toFixed(2);
}

function resolveEntryScoreOn10(entry) {
  if (entry && typeof entry.scoreOn10 === "number" && !Number.isNaN(entry.scoreOn10)) {
    return entry.scoreOn10;
  }
  if (entry && entry.total > 0) {
    return Number(((entry.correct / entry.total) * 10).toFixed(2));
  }
  return 0;
}

function scoreColorClass(scoreOn10) {
  if (scoreOn10 >= 7.5) return "good";
  if (scoreOn10 >= 5) return "ok";
  return "bad";
}

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function renderDashboard(history) {
  const entries = Array.isArray(history) ? history.slice(0, 10).reverse() : [];

  if (entries.length === 0) {
    return `
      <section class="dashboard-section">
        <h3 class="dashboard-title">📊 Thống kê của Mun ngu</h3>
        <div class="dashboard-empty">
          <p>Hoàn thành một bài để Mun ngu mở khoá thống kê nha~ 🌷</p>
        </div>
      </section>
    `;
  }

  // Bar chart — newest on the right
  const columns = entries.map((entry, idx) => {
    const score = resolveEntryScoreOn10(entry);
    const cls = scoreColorClass(score);
    const heightPct = Math.max(4, Math.min(100, Number(entry.percent) || 0));
    return `
      <div class="chart-column">
        <span class="bar-value">${formatScoreOn10(score)}</span>
        <div class="bar-wrapper">
          <div class="chart-bar bar--${cls}" style="height:${heightPct}%"></div>
        </div>
        <span class="bar-label">${escapeHtml(truncate(entry.mode, 8))}</span>
      </div>
    `;
  }).join("");

  // Wrong-question frequency — aggregate across all entries
  const freq = new Map();
  for (const entry of entries) {
    const review = Array.isArray(entry.wrongReview) ? entry.wrongReview : [];
    for (const item of review) {
      const existing = freq.get(item.id) ?? { count: 0, question: item.question };
      existing.count += 1;
      freq.set(item.id, existing);
    }
  }
  const topWrong = [...freq.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const wrongFreqHtml = topWrong.length === 0
    ? `<p class="history-empty">Chưa có câu sai nào được ghi nhận. Bé giỏi quá! 🌷</p>`
    : `<ul class="wrong-freq-list">
        ${topWrong.map((w) => `
          <li class="wrong-freq-item">
            <span class="wrong-freq-count">${w.count}×</span>
            <span class="wrong-freq-text">Câu ${escapeHtml(String(w.id))}: ${escapeHtml(truncate(w.question, 80))}</span>
          </li>
        `).join("")}
      </ul>`;

  return `
    <section class="dashboard-section">
      <div>
        <h3 class="dashboard-title">📊 Thống kê của Mun ngu</h3>
        <p class="dashboard-subtitle">10 lần làm bài gần nhất</p>
      </div>
      <div class="dashboard-chart-wrap">
        <div class="dashboard-chart">${columns}</div>
      </div>
      <div>
        <h4 class="dashboard-title" style="font-size:1.05rem;">🎯 Câu hay sai nhất</h4>
        ${wrongFreqHtml}
      </div>
    </section>
  `;
}

export function render(app, state, options) {
  const {
    pageMode,
    session,
    historyStorage,
    showHistory,
    showQuestionMap,
    redirectToHomePage,
    renderHome,
    renderQuiz,
    renderResults
  } = options;

  if (state.loading) {
    app.innerHTML = `
      <div class="status-block">
        <div class="loading-spinner"></div>
        <p>Đang tải dữ liệu câu hỏi...</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="error-state">
        <div class="warning-box">
          <strong>Không thể khởi tạo app.</strong>
          <p>${escapeHtml(state.error)}</p>
        </div>
      </div>
    `;
    return;
  }

  const pageView = resolvePageView(pageMode, session);

  if (pageView === "home") {
    renderHome();
    return;
  }

  if (pageView === "redirect-home") {
    redirectToHomePage();
    return;
  }

  if (pageView === "quiz") {
    renderQuiz(session);
    return;
  }

  renderResults(session);
}

export function renderHome(app, state, { session, lastResult, bookmarks, historyStorage, showHistory, currentTopicId, TOPICS }) {
  const wrongCount = lastResult?.wrongAnswers?.length ?? 0;
  const canContinue = Boolean(session && !session.submitted);
  const canReviewWrong = wrongCount > 0;
  const bookmarkCount = bookmarks.length;
  const answeredCount = session ? countAnswered(session) : 0;
  const rangePresets = buildRangePresets(state.questions.length);
  const sessionRangeLabel = session?.rangeStart && session?.rangeEnd
    ? formatRangeLabel(session.rangeStart, session.rangeEnd)
    : "";


  const topicTabsHtml = TOPICS.map(topic => {
    const isActive = topic.id === currentTopicId;
    const icon = topic.id === "duoc" ? "💊" : topic.id === "gdct2" ? "🏛️" : "🌿";
    const color = topic.color ?? "pink";
    return `
      <button class="topic-tab ${isActive ? "active" : ""}" data-action="switch-topic" data-topic-id="${topic.id}" data-color="${color}">
        <span class="topic-tab-icon">${icon}</span>
        <span class="topic-tab-name">${escapeHtml(topic.name)}</span>
      </button>
    `;
  }).join("");

  const topicSelectorHtml = `
    <section class="topic-selector-card">
      <h3>📚 Chọn học phần cho Mun Ngu</h3>
      <div class="topic-tabs">
        ${topicTabsHtml}
      </div>
    </section>
  `;

  app.innerHTML = `
    <div class="home-grid">
      ${topicSelectorHtml}
      <section class="stats-grid">
        <article class="stat-card">
          <p class="stat-label">Tổng câu hỏi</p>
          <p class="stat-value">${state.questions.length}</p>
        </article>
        <article class="stat-card">
          <p class="stat-label">Tiến độ hiện tại</p>
          <p class="stat-value">${session && !session.submitted ? `${answeredCount}/${session.order.length}` : "Chưa có"}</p>
        </article>
        <article class="stat-card">
          <p class="stat-label">Câu sai gần nhất</p>
          <p class="stat-value">${canReviewWrong ? wrongCount : "0"}</p>
        </article>
        <article class="stat-card stat-card--bookmark">
          <p class="stat-label">⭐ Đánh dấu</p>
          <p class="stat-value">${bookmarkCount}</p>
        </article>
      </section>

      <section class="control-row">
        <label class="toggle-card">
          <input type="checkbox" data-role="shuffle-toggle" ${state.persisted.settings.shuffleQuestions ? "checked" : ""} />
          <span>🔀 Trộn thứ tự câu hỏi cho Mun ngu</span>
        </label>
        <label class="toggle-card">
          <input type="checkbox" data-role="shuffle-options-toggle" ${state.persisted.settings.shuffleOptions ? "checked" : ""} />
          <span>🔤 Đảo đáp án A/B/C/D cho Mun ngu</span>
        </label>
        <label class="toggle-card">
          <input type="checkbox" data-role="fast-mode-toggle" ${state.persisted.settings.fastMode ? "checked" : ""} />
          <span>⏩ Làm nhanh cho Mun ngu</span>
        </label>
        <label class="toggle-card">
          <input type="checkbox" data-role="instant-feedback-toggle" ${state.persisted.settings.immediateFeedback ? "checked" : ""} />
          <span>⚡ Báo đúng/sai cho Mun ngu</span>
        </label>
      </section>

      <section class="setup-card">
        <div>
          <h3>🚀 Bắt đầu theo khoảng câu cho Mun ngu</h3>
          <p class="subtle-text">
            chọn khoảng câu cho Mun Ngu
          </p>
        </div>

        <div class="range-input-row">
          <label class="input-stack" for="range-start-input">
            <span>Từ câu</span>
            <input
              id="range-start-input"
              class="number-input"
              type="number"
              min="1"
              max="${state.questions.length}"
              step="1"
              value="${escapeHtml(state.persisted.settings.rangeStart)}"
              data-role="range-start"
            />
          </label>
          <label class="input-stack" for="range-end-input">
            <span>Đến câu</span>
            <input
              id="range-end-input"
              class="number-input"
              type="number"
              min="1"
              max="${state.questions.length}"
              step="1"
              value="${escapeHtml(state.persisted.settings.rangeEnd)}"
              data-role="range-end"
            />
          </label>
          <button class="secondary-button" data-action="start-range">Mun ngu bắt đầu</button>
        </div>

        ${state.ui.setupError
      ? `<p class="setup-inline-error" role="alert">${escapeHtml(state.ui.setupError)}</p>`
      : ""}

        <div class="range-preset-row">
          ${rangePresets.map((preset) => `
            <button
              class="ghost-button"
              data-action="start-range-preset"
              data-range-start="${preset.start}"
              data-range-end="${preset.end}"
            >
              ${escapeHtml(preset.label)}
            </button>
          `).join("")}
        </div>
      </section>

      <section class="button-row">
        <button class="button surprise-button" data-action="start-surprise">
          🎲 Surprise Me (10 câu ngẫu nhiên)
        </button>
        <button class="ghost-button" data-action="continue-session" ${canContinue ? "" : "disabled"}>
          ▶️ Tiếp tục
        </button>
        <button class="secondary-button" data-action="review-wrong" ${canReviewWrong ? "" : "disabled"}>
          🎯 Ôn lại câu sai
        </button>
        <button class="bookmark-button" data-action="review-bookmarks" ${bookmarkCount > 0 ? "" : "disabled"}>
          ⭐ Ôn câu đánh dấu (${bookmarkCount})
        </button>
        <button class="danger-button" data-action="reset-state" ${canContinue || canReviewWrong || bookmarkCount > 0 ? "" : "disabled"}>
          🗑️ Xóa tiến độ
        </button>
      </section>

      ${session
      ? `<p class="subtle-text">
              Trạng thái lưu hiện tại:
              <strong>${session.submitted ? "Đã nộp bài" : "Đang làm"}</strong>${sessionRangeLabel ? ` · Khoảng ${escapeHtml(sessionRangeLabel)}` : ""}.
            </p>`
      : ""
    }

      ${renderHistorySection(loadHistory(historyStorage), showHistory)}

      ${renderDashboard(loadHistory(historyStorage))}
    </div>
  `;
}

export function renderHistorySection(history, showHistory) {
  const hasHistory = history.length > 0;

  const entriesHtml = hasHistory
    ? history.map((h, i) => {
      const d = new Date(h.ts);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const scoreOn10 = resolveEntryScoreOn10(h);
      const scoreClass = scoreOn10 >= 7.5 ? 'history-score--good' : scoreOn10 >= 5 ? 'history-score--ok' : 'history-score--bad';
      return `
          <div class="history-entry">
            <div class="history-entry__info">
              <span class="history-entry__date">${escapeHtml(dateStr)}</span>
              <span class="history-entry__mode">${escapeHtml(h.mode)}</span>
            </div>
            <div class="history-entry__right">
              <span class="history-score ${scoreClass}">${formatScoreOn10(scoreOn10)}/10 · ${h.percent}%</span>
              ${h.wrongReview && h.wrongReview.length > 0 ? `<button class="history-detail-btn" data-action="view-history-detail" data-index="${i}" title="Xem chi tiết">🔍</button>` : ""}
              <button class="history-delete-btn" data-action="delete-history-entry" data-index="${i}" title="Xóa lần này">🗑️</button>
            </div>
          </div>
        `;
    }).join("")
    : `<p class="history-empty">Chưa có lịch sử. Hoàn thành một bài thi để bắt đầu!</p>`;

  return `
    <section class="history-section">
      <div class="history-header">
        <h3 class="history-title">📋 Lịch sử làm bài của Mun ngu ${hasHistory ? `<span class="history-count">(${history.length})</span>` : ""}</h3>
        <button class="history-toggle-btn" data-action="history-toggle">
          ${showHistory ? '▲ Thu lại' : '▼ Mở ra'}
        </button>
      </div>

      ${showHistory ? `
        <div class="history-list">
          ${entriesHtml}
          ${hasHistory ? `
            <button class="danger-button history-clear-btn" data-action="clear-all-history">🗑️ Xóa tất cả lịch sử</button>
          ` : ""}
        </div>
      ` : ""}
    </section>
  `;
}

export function renderQuiz(app, session, { questionsById, bookmarks, showQuestionMap }) {
  const currentQuestionId = session.order[session.currentIndex];
  const question = questionsById.get(currentQuestionId);
  const selected = session.answers[currentQuestionId] ?? "";
  const feedback = session.feedbackByQuestion?.[currentQuestionId] ?? null;
  const isLocked = Boolean(session.immediateFeedback && feedback);
  const answeredCount = countAnswered(session);
  const progressPercent = Math.round(((session.currentIndex + 1) / session.order.length) * 100);
  const isBookmarked = bookmarks.includes(currentQuestionId);
  const isClinical = isClinicalQuestion(question.question);
  const displayedOptions = getDisplayedOptions(question, session, currentQuestionId);
  const selectedDisplay = selected
    ? mapOriginalChoiceToDisplay(session, currentQuestionId, selected)
    : "";
  const correctDisplay = feedback
    ? mapOriginalChoiceToDisplay(session, currentQuestionId, feedback.correct)
    : "";
  const rangeLabel = session.rangeStart && session.rangeEnd
    ? formatRangeLabel(session.rangeStart, session.rangeEnd)
    : "";

  const selectionButtons = displayedOptions
    .map(({ label, text }) => {
      const isSelected = selectedDisplay === label;
      const isCorrectChoice = feedback && correctDisplay === label;
      const isWrongSelected = feedback && selectedDisplay === label && !feedback.isCorrect;
      return `
        <button
          class="option-button ${isSelected ? "is-selected" : ""} ${isCorrectChoice ? "is-correct" : isWrongSelected ? "is-wrong" : ""}"
          data-action="select-answer"
          data-choice="${label}"
          data-question-id="${question.id}"
          ${isLocked ? "disabled" : ""}
        >
          <span class="option-letter">${label}</span>
          <span class="option-copy">${highlightKeywords(text)}</span>
        </button>
      `;
    })
    .join("");

  // Mini question map
  const mapDots = session.order.map((qId, idx) => {
    const isAnswered = Boolean(session.answers[qId]);
    const isBookmarkedDot = bookmarks.includes(qId);
    const isCurrent = idx === session.currentIndex;
    const dotClass = [
      "qmap-dot",
      isCurrent ? "qmap-dot--current" : "",
      isAnswered ? "qmap-dot--answered" : "",
      isBookmarkedDot ? "qmap-dot--bookmarked" : ""
    ].filter(Boolean).join(" ");
    return `<button class="${dotClass}" data-action="jump-to-question" data-index="${idx}" title="Câu ${idx + 1}${isBookmarkedDot ? " ⭐" : ""}"></button>`;
  }).join("");

  app.innerHTML = `
    <section class="quiz-panel">
      <div class="quiz-header-row">
        <div>
          <h2>📝 Làm bài</h2>
          <p class="quiz-meta">
            Câu ${session.currentIndex + 1}/${session.order.length} · Đã trả lời ${answeredCount}/${session.order.length}
          </p>
          ${rangeLabel ? `<p class="quiz-range-label">Khoảng học: ${escapeHtml(rangeLabel)}</p>` : ""}
        </div>
        <div class="quiz-header-actions">
          <button class="map-toggle-btn ${showQuestionMap ? "active" : ""}" data-action="toggle-map" title="Bản đồ câu hỏi">
            🗺️ Bản đồ
          </button>
          <div class="kbd-hints">
            <span class="kbd">A</span><span class="kbd">B</span><span class="kbd">C</span><span class="kbd">D</span>
            <span class="kbd-sep">·</span>
            <span class="kbd">←</span><span class="kbd">→</span>
          </div>
        </div>
      </div>

      <div class="progress-bar" aria-hidden="true">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>

      ${showQuestionMap ? `
        <div class="question-map">
          <div class="qmap-legend">
            <span><span class="qmap-dot qmap-dot--answered" style="display:inline-block"></span> Đã trả lời</span>
            <span><span class="qmap-dot qmap-dot--bookmarked" style="display:inline-block"></span> Đánh dấu</span>
            <span><span class="qmap-dot qmap-dot--current" style="display:inline-block"></span> Hiện tại</span>
          </div>
          <div class="qmap-grid">${mapDots}</div>

          <div class="quick-jump-row">
            <label for="quick-jump-input">Nhảy đến câu:</label>
            <input
              id="quick-jump-input"
              class="quick-jump-input"
              type="number"
              min="1"
              max="${session.order.length}"
              placeholder="1–${session.order.length}"
              data-role="quick-jump-input"
            />
            <button class="ghost-button small-btn" data-action="do-quick-jump">Đi</button>
          </div>
        </div>
      ` : ""}

      <article class="question-card">
        <div class="question-card-header">
          <p class="question-number">Câu ${question.id}</p>
          <div class="question-card-badges">
            ${isClinical ? '<span class="clinical-badge">🏥 Lâm sàng</span>' : ""}
            <button class="bookmark-toggle ${bookmarks.includes(currentQuestionId) ? "is-bookmarked" : ""}" data-action="toggle-bookmark" data-question-id="${currentQuestionId}" title="${bookmarks.includes(currentQuestionId) ? "Bỏ đánh dấu" : "Đánh dấu câu này"}">
              ${bookmarks.includes(currentQuestionId) ? "⭐" : "☆"} ${bookmarks.includes(currentQuestionId) ? "Đã đánh dấu" : "Đánh dấu"}
            </button>
          </div>
        </div>
        <p class="question-text">${highlightKeywords(question.question)}</p>
      </article>

      ${feedback
      ? `
            <div class="feedback-banner ${feedback.isCorrect ? "is-correct" : "is-wrong"}">
              <strong>${feedback.isCorrect ? "✅ Chính xác" : "❌ Sai rồi"}</strong>
              <p>
                ${feedback.isCorrect
        ? "Bạn đã trả lời đúng. Bấm Câu sau để tiếp tục."
        : `Đáp án đúng là <strong>${correctDisplay}</strong>`
      }
              </p>
              ${question.explanation
        ? `<p class="feedback-explanation">💡 ${escapeHtml(question.explanation)}</p>`
        : ""}
            </div>
          `
      : ""
    }

      <div class="options-list">
        ${selectionButtons}
      </div>

      <div class="footer-bar">
        <div class="button-row">
          <button
            class="ghost-button"
            data-action="go-prev"
            ${session.currentIndex === 0 ? "disabled" : ""}
          >
            ← Câu trước
          </button>
          <button
            class="ghost-button"
            data-action="go-next"
          >
            ${session.currentIndex === session.order.length - 1 ? "Đến cuối bài →" : "Câu sau →"}
          </button>
        </div>

        <div class="button-row">
          <button class="danger-button" data-action="go-home">🏠 Về trang chính</button>
          <button class="button" data-action="submit-quiz">✅ Nộp bài</button>
        </div>
      </div>
    </section>
  `;
}

export function renderResults(app, session, { questions, lastResult }) {
  const summary = lastResult ?? scoreSession(session, questions);
  const wrongReview = buildWrongAnswerReview(questions, session);
  const total = session.order.length;
  const scorePercent = total > 0 ? Math.round((summary.correctCount / total) * 100) : 0;
  const ev = getResultEvaluation(scorePercent);
  const hasRangeContext = session.mode === "all" && session.rangeStart && session.rangeEnd;
  const modeLabel = session.mode === "wrong-only"
    ? "Ôn câu sai"
    : session.mode === "bookmark"
      ? "Câu đánh dấu"
      : hasRangeContext
        ? `Khoảng ${formatRangeLabel(session.rangeStart, session.rangeEnd)}`
        : "Toàn bộ đề";
  const restartRangeAttrs = hasRangeContext
    ? ` data-range-start="${session.rangeStart}" data-range-end="${session.rangeEnd}"`
    : "";

  app.innerHTML = `
    <section class="result-panel">
      <div class="result-header">
        <div class="result-grade-badge">${ev.emoji}</div>
        <h2>${ev.grade}</h2>
        <div class="result-score-10">${formatScoreOn10(summary.scoreOn10)}<span class="result-score-10__denom">/10</span></div>
        <p class="result-copy">
          Bé đúng ${summary.correctCount}/${total} câu · ${scorePercent}%.
        </p>
        <div class="result-evaluation-msg">${ev.msg}</div>
      </div>

      <div class="score-grid">
        <article class="score-card is-correct">
          <span class="stat-label">Đúng</span>
          <strong>${summary.correctCount}</strong>
        </article>
        <article class="score-card is-wrong">
          <span class="stat-label">Sai</span>
          <strong>${summary.incorrectCount}</strong>
        </article>
        <article class="score-card">
          <span class="stat-label">Chưa trả lời</span>
          <strong>${summary.unansweredCount}</strong>
        </article>
        <article class="score-card">
          <span class="stat-label">Chế độ</span>
          <strong>${modeLabel}</strong>
        </article>
      </div>

      <div class="button-row">
        <button class="button" data-action="start-new"${restartRangeAttrs}>🔄 Làm lại từ đầu</button>
        <button class="secondary-button" data-action="review-wrong" ${wrongReview.length ? "" : "disabled"}>
          🎯 Ôn lại câu sai
        </button>
        <button class="ghost-button" data-action="go-home">🏠 Về trang chính</button>
      </div>

      ${wrongReview.length
      ? `
            <div class="review-list">
              <h3 style="margin: 16px 0 0; color: var(--muted); font-size: 1.1rem;">Nội dung cần ôn tập</h3>
              ${wrongReview.map(renderWrongItem).join("")}
            </div>
          `
      : `
            <div class="empty-state">
              <p>🎉 Tuyệt vời! Không có câu sai để ôn lại.</p>
            </div>
          `
    }
    </section>
  `;
}

export function renderWrongItem(item) {
  const optionList = ["A", "B", "C", "D"]
    .map((choice) => {
      const option = item.displayOptions.find((entry) => entry.label === choice);
      const value = highlightKeywords(option?.text ?? "");
      const prefix = choice === item.correctDisplay ? "Đúng" : choice === item.selectedDisplay ? "Bạn chọn" : "";

      return `
        <p class="answer-note ${choice === item.correctDisplay ? "is-correct" : choice === item.selectedDisplay ? "is-wrong" : ""}">
          <strong>${choice}.</strong> ${value} ${prefix ? `· <em>${prefix}</em>` : ""}
        </p>
      `;
    })
    .join("");

  const isClinical = isClinicalQuestion(item.question);
  const explanationHtml = item.explanation
    ? `<p class="review-explanation">
        <span class="review-explanation-label">💡 Giải thích:</span>
        ${escapeHtml(item.explanation)}
      </p>`
    : "";

  return `
    <article class="review-item">
      <h3>
        ${isClinical ? '<span class="clinical-badge clinical-badge--sm">🏥</span>' : ""}
        Câu ${item.id}: ${highlightKeywords(item.question)}
      </h3>
      ${optionList}
      ${explanationHtml}
    </article>
  `;
}

export function renderHistoryDetail(app, historyStorage, index) {
  const history = loadHistory(historyStorage);
  const entry = history[index];

  if (!entry) {
    return false;
  }

  const d = new Date(entry.ts);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  app.innerHTML = `
    <section class="result-panel">
      <div class="result-header">
        <h2>Chi tiết lần làm bài</h2>
        <p class="result-copy">Thời gian: ${escapeHtml(dateStr)} · Chế độ: ${escapeHtml(entry.mode)}</p>
        <div class="result-score-10">${formatScoreOn10(resolveEntryScoreOn10(entry))}<span class="result-score-10__denom">/10</span></div>
        <p class="result-copy">Đúng: <strong>${entry.correct}/${entry.total} (${entry.percent}%)</strong></p>
      </div>

      <div class="button-row">
        <button class="ghost-button" data-action="go-home">🏠 Về trang chính</button>
      </div>

      <div class="review-list">
        <h3 style="margin: 16px 0 0; color: var(--muted); font-size: 1.1rem;">Các câu trả lời sai</h3>
        ${entry.wrongReview && entry.wrongReview.length ? entry.wrongReview.map(renderWrongItem).join("") : "<p>Không có câu sai.</p>"}
      </div>
    </section>
  `;
  return true;
}