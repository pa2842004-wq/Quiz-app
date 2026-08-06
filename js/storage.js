export function createQuizStorage(storage, key = "quiz-app-state") {
  return {
    load() {
      const raw = storage.getItem(key);

      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    save(value) {
      storage.setItem(key, JSON.stringify(value));
    },
    clear() {
      storage.removeItem(key);
    }
  };
}
