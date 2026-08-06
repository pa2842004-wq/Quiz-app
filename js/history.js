export const MAX_HISTORY = 30;

export function loadHistory(historyStorage) {
  const data = historyStorage.load();
  return Array.isArray(data) ? data : [];
}

export function saveHistory(historyStorage, summary, session, wrongReview = []) {
  const history = loadHistory(historyStorage);
  const modeLabel =
    session.mode === "wrong-only" ? "Ôn câu sai" :
      session.mode === "bookmark" ? "Câu đánh dấu" :
        session.mode === "search" ? "Tìm kiếm" :
          (session.rangeStart && session.rangeEnd)
            ? `Câu ${session.rangeStart}–${session.rangeEnd}`
            : "Toàn bộ đề";

  const entry = {
    ts: Date.now(),
    mode: modeLabel,
    total: session.order.length,
    correct: summary.correctCount,
    incorrect: summary.incorrectCount,
    unanswered: summary.unansweredCount,
    scoreOn10: typeof summary.scoreOn10 === "number" ? summary.scoreOn10 : 0,
    percent: session.order.length > 0
      ? Math.round((summary.correctCount / session.order.length) * 100)
      : 0,
    wrongReview
  };

  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  historyStorage.save(history);
}

export function deleteHistoryEntry(historyStorage, index) {
  const history = loadHistory(historyStorage);
  history.splice(index, 1);
  historyStorage.save(history);
}

export function clearHistory(historyStorage) {
  historyStorage.save([]);
}