import test from "node:test";
import assert from "node:assert/strict";

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createAppHarness({ page = "home" } = {}) {
  const listeners = new Map();
  const app = { innerHTML: "" };
  const localStorage = createStorageMock();
  const location = {
    protocol: "http:",
    href: "http://127.0.0.1:4173/index.html",
    replace(nextHref) {
      this.href = nextHref;
    }
  };

  const document = {
    activeElement: { tagName: "BODY" },
    body: {
      dataset: { page },
      appendChild() {}
    },
    querySelector(selector) {
      return selector === "#app" ? app : null;
    },
    createElement() {
      return {
        style: {},
        className: "",
        innerHTML: "",
        classList: {
          add() {},
          remove() {}
        },
        remove() {}
      };
    },
    getElementById() {
      return null;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    }
  };

  const window = {
    localStorage,
    location
  };

  return { app, document, listeners, window };
}

function createRoleTarget(role, value) {
  return {
    value,
    closest(selector) {
      return selector === `[data-role='${role}']` ? this : null;
    }
  };
}

function createActionTarget(action) {
  return {
    dataset: { action },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    }
  };
}

function createActionTargetWithDataset(action, extraDataset) {
  return {
    dataset: { action, ...extraDataset },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    }
  };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buildQuestions(total) {
  return Array.from({ length: total }, (_, index) => {
    const id = index + 1;
    return {
      id,
      question: `Cau ${id}`,
      options: { A: `A${id}`, B: `B${id}`, C: `C${id}`, D: `D${id}` },
      answer: "A"
    };
  });
}

test("editing a range input clears the inline setup error from the rendered home view", async () => {
  const harness = createAppHarness();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  globalThis.window = harness.window;
  globalThis.document = harness.document;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return [
        { id: 1, question: "Cau 1", options: { A: "A1", B: "B1", C: "C1", D: "D1" }, answer: "A" },
        { id: 2, question: "Cau 2", options: { A: "A2", B: "B2", C: "C2", D: "D2" }, answer: "B" },
        { id: 3, question: "Cau 3", options: { A: "A3", B: "B3", C: "C3", D: "D3" }, answer: "C" },
        { id: 4, question: "Cau 4", options: { A: "A4", B: "B4", C: "C4", D: "D4" }, answer: "D" }
      ];
    }
  });
  globalThis.requestAnimationFrame = (callback) => callback();

  try {
    await import(new URL(`../js/app.js?test=${Date.now()}`, import.meta.url));
    await flushAsyncWork();

    const changeHandler = harness.listeners.get("change");
    const clickHandler = harness.listeners.get("click");

    assert.ok(changeHandler, "expected app to register a change handler");
    assert.ok(clickHandler, "expected app to register a click handler");

    changeHandler({ target: createRoleTarget("range-start", "4") });
    changeHandler({ target: createRoleTarget("range-end", "2") });
    clickHandler({ target: createActionTarget("start-range") });

    assert.match(harness.app.innerHTML, /setup-inline-error/);

    changeHandler({ target: createRoleTarget("range-end", "4") });

    assert.doesNotMatch(harness.app.innerHTML, /setup-inline-error/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("restarting from results preserves the completed range session context", async () => {
  const harness = createAppHarness({ page: "quiz" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const questions = buildQuestions(120);

  harness.window.localStorage.setItem(
    "htbt-quiz-app-state",
    JSON.stringify({
      version: 1,
      settings: {
        shuffleQuestions: false,
        shuffleOptions: false,
        immediateFeedback: false,
        fastMode: false,
        rangeStart: "51",
        rangeEnd: "100"
      },
      session: {
        order: Array.from({ length: 50 }, (_, index) => 51 + index),
        answers: {},
        currentIndex: 0,
        submitted: true,
        mode: "all",
        rangeStart: 51,
        rangeEnd: 100,
        fastMode: false,
        immediateFeedback: false,
        feedbackByQuestion: {},
        optionOrderByQuestion: {}
      },
      lastResult: {
        correctCount: 10,
        incorrectCount: 5,
        unansweredCount: 35,
        wrongAnswers: [{ id: 52 }]
      },
      bookmarks: []
    })
  );

  globalThis.window = harness.window;
  globalThis.document = harness.document;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return questions;
    }
  });
  globalThis.requestAnimationFrame = (callback) => callback();

  try {
    await import(new URL(`../js/app.js?test=${Date.now()}`, import.meta.url));
    await flushAsyncWork();

    const clickHandler = harness.listeners.get("click");

    assert.ok(clickHandler, "expected app to register a click handler");
    assert.match(harness.app.innerHTML, /data-range-start="51"/);
    assert.match(harness.app.innerHTML, /data-range-end="100"/);
    assert.match(harness.app.innerHTML, /câu 51-100/);

    clickHandler({
      target: createActionTargetWithDataset("start-new", {
        rangeStart: "51",
        rangeEnd: "100"
      })
    });

    const persisted = JSON.parse(harness.window.localStorage.getItem("htbt-quiz-app-state"));

    assert.equal(persisted.session.submitted, false);
    assert.equal(persisted.session.mode, "all");
    assert.equal(persisted.session.rangeStart, 51);
    assert.equal(persisted.session.rangeEnd, 100);
    assert.equal(persisted.session.order.length, 50);
    assert.ok(
      persisted.session.order.every((id) => id >= 51 && id <= 100),
      "expected restarted order to stay inside the selected range"
    );
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});
