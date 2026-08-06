import test from "node:test";
import assert from "node:assert/strict";

import { createQuizStorage } from "../js/storage.js";

function createMemoryStorage() {
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

test("quiz storage saves and loads state", () => {
  const storage = createQuizStorage(createMemoryStorage(), "quiz-state");
  const session = { order: [1, 2], answers: { 1: "A" }, currentIndex: 1 };

  storage.save(session);

  assert.deepEqual(storage.load(), session);
});

test("quiz storage returns null for missing state", () => {
  const storage = createQuizStorage(createMemoryStorage(), "quiz-state");

  assert.equal(storage.load(), null);
});

test("quiz storage clears saved state", () => {
  const storage = createQuizStorage(createMemoryStorage(), "quiz-state");

  storage.save({ order: [1] });
  storage.clear();

  assert.equal(storage.load(), null);
});

test("quiz storage ignores malformed JSON", () => {
  const memoryStorage = createMemoryStorage();
  memoryStorage.setItem("quiz-state", "{bad json");

  const storage = createQuizStorage(memoryStorage, "quiz-state");

  assert.equal(storage.load(), null);
});
