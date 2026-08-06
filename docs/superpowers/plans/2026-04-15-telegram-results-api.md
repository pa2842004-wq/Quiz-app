# Telegram Results API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Cloudflare Worker API that registers the site owner's Telegram chat and receives quiz submission summaries from the GitHub Pages frontend, then forwards those summaries to Telegram.

**Architecture:** Keep the existing quiz app static and unchanged in its core scoring flow, then add a small Worker service with two endpoints: one for owner registration and one for result delivery. Store the owner `chat_id` in Cloudflare KV, keep the Telegram bot token in Worker secrets, and make the frontend notification call best-effort so quiz submission still succeeds if the API fails.

**Tech Stack:** JavaScript, Cloudflare Workers, Cloudflare KV, Telegram Bot API, browser `fetch`, Node built-in test runner

---

### File Structure

**Files:**
- Create: `/mnt/d/mun/quiz-app/worker/package.json`
- Create: `/mnt/d/mun/quiz-app/worker/wrangler.jsonc`
- Create: `/mnt/d/mun/quiz-app/worker/src/index.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/telegram.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/validation.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/response.js`
- Create: `/mnt/d/mun/quiz-app/worker/tests/validation.test.js`
- Create: `/mnt/d/mun/quiz-app/worker/tests/telegram.test.js`
- Create: `/mnt/d/mun/quiz-app/worker/tests/worker.test.js`
- Modify: `/mnt/d/mun/quiz-app/index.html`
- Modify: `/mnt/d/mun/quiz-app/js/app.js`
- Modify: `/mnt/d/mun/quiz-app/tests/quiz.test.js`
- Create: `/mnt/d/mun/quiz-app/js/notify.js`
- Create: `/mnt/d/mun/quiz-app/docs/telegram-worker-setup.md`

### Task 1: Lock Worker Payload Validation and Telegram Formatting

**Files:**
- Create: `/mnt/d/mun/quiz-app/worker/tests/validation.test.js`
- Create: `/mnt/d/mun/quiz-app/worker/tests/telegram.test.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/validation.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/telegram.js`
- Create: `/mnt/d/mun/quiz-app/worker/package.json`

- [ ] **Step 1: Write the failing validation tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { validateResultPayload, isAllowedOrigin } from "../src/validation.js";

const validPayload = {
  correctCount: 42,
  incorrectCount: 8,
  unansweredCount: 0,
  total: 50,
  percent: 84,
  submittedAt: "2026-04-15T12:00:00.000Z",
  pageUrl: "https://example.github.io/quiz-app/"
};

test("validateResultPayload accepts a valid summary payload", () => {
  assert.deepEqual(validateResultPayload(validPayload), {
    ok: true,
    value: validPayload
  });
});

test("validateResultPayload rejects mismatched totals", () => {
  assert.deepEqual(validateResultPayload({ ...validPayload, incorrectCount: 9 }), {
    ok: false,
    error: "invalid_payload"
  });
});

test("isAllowedOrigin accepts an exact allowlisted origin", () => {
  assert.equal(
    isAllowedOrigin("https://phamchidinh.github.io", ["https://phamchidinh.github.io"]),
    true
  );
});

test("isAllowedOrigin rejects a non-allowlisted origin", () => {
  assert.equal(
    isAllowedOrigin("https://evil.example", ["https://phamchidinh.github.io"]),
    false
  );
});
```

- [ ] **Step 2: Write the failing Telegram helper tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { formatResultMessage, getLatestOwnerChatId } from "../src/telegram.js";

test("formatResultMessage renders a compact plain-text summary", () => {
  const text = formatResultMessage({
    correctCount: 42,
    incorrectCount: 8,
    unansweredCount: 0,
    total: 50,
    percent: 84,
    submittedAt: "2026-04-15T12:00:00.000Z",
    pageUrl: "https://example.github.io/quiz-app/"
  });

  assert.equal(
    text,
    [
      "Quiz moi vua nop bai",
      "Dung: 42/50 (84%)",
      "Sai: 8",
      "Bo trong: 0",
      "Luc nop: 2026-04-15T12:00:00.000Z",
      "Trang: https://example.github.io/quiz-app/"
    ].join("\\n")
  );
});

test("getLatestOwnerChatId returns the newest /start chat id from updates", () => {
  const updates = [
    {
      update_id: 100,
      message: {
        text: "hello",
        chat: { id: 111 }
      }
    },
    {
      update_id: 101,
      message: {
        text: "/start",
        chat: { id: 222 }
      }
    }
  ];

  assert.equal(getLatestOwnerChatId(updates), "222");
});
```

- [ ] **Step 3: Add the Worker package manifest**

```json
{
  "name": "quiz-app-telegram-worker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test ./tests/*.test.js",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4.83.0"
  }
}
```

- [ ] **Step 4: Run the Worker helper tests to verify they fail**

Run: `npm test` from `/mnt/d/mun/quiz-app/worker`

Expected: FAIL with module-not-found or missing-export errors for `validation.js` and `telegram.js`

- [ ] **Step 5: Implement the minimal payload validation module**

```js
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateResultPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "invalid_payload" };
  }

  const {
    correctCount,
    incorrectCount,
    unansweredCount,
    total,
    percent,
    submittedAt,
    pageUrl
  } = payload;

  const countsAreValid =
    isNonNegativeInteger(correctCount)
    && isNonNegativeInteger(incorrectCount)
    && isNonNegativeInteger(unansweredCount)
    && isNonNegativeInteger(total)
    && total > 0;

  const totalsMatch = correctCount + incorrectCount + unansweredCount === total;
  const percentIsValid = Number.isFinite(percent) && percent >= 0 && percent <= 100;
  const submittedAtIsValid = typeof submittedAt === "string" && !Number.isNaN(Date.parse(submittedAt));
  const pageUrlIsValid = typeof pageUrl === "string" && /^https?:\/\//.test(pageUrl);

  if (!countsAreValid || !totalsMatch || !percentIsValid || !submittedAtIsValid || !pageUrlIsValid) {
    return { ok: false, error: "invalid_payload" };
  }

  return {
    ok: true,
    value: {
      correctCount,
      incorrectCount,
      unansweredCount,
      total,
      percent,
      submittedAt,
      pageUrl
    }
  };
}

export function isAllowedOrigin(origin, allowlist) {
  return typeof origin === "string" && allowlist.includes(origin);
}
```

- [ ] **Step 6: Implement the minimal Telegram helper module**

```js
export function formatResultMessage(payload) {
  return [
    "Quiz moi vua nop bai",
    `Dung: ${payload.correctCount}/${payload.total} (${payload.percent}%)`,
    `Sai: ${payload.incorrectCount}`,
    `Bo trong: ${payload.unansweredCount}`,
    `Luc nop: ${payload.submittedAt}`,
    `Trang: ${payload.pageUrl}`
  ].join("\n");
}

export function getLatestOwnerChatId(updates) {
  const startUpdate = [...updates]
    .reverse()
    .find((update) => update?.message?.text === "/start" && update?.message?.chat?.id != null);

  return startUpdate ? String(startUpdate.message.chat.id) : null;
}
```

- [ ] **Step 7: Re-run the Worker helper tests to verify they pass**

Run: `npm test` from `/mnt/d/mun/quiz-app/worker`

Expected: PASS for `validation.test.js` and `telegram.test.js`

- [ ] **Step 8: Commit the helper layer**

```bash
git -C /mnt/d/mun/quiz-app add worker/package.json worker/src/validation.js worker/src/telegram.js worker/tests/validation.test.js worker/tests/telegram.test.js
git -C /mnt/d/mun/quiz-app commit -m "feat: add worker validation and telegram helpers"
```

### Task 2: Build and Test the Cloudflare Worker Endpoints

**Files:**
- Create: `/mnt/d/mun/quiz-app/worker/tests/worker.test.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/index.js`
- Create: `/mnt/d/mun/quiz-app/worker/src/response.js`
- Create: `/mnt/d/mun/quiz-app/worker/wrangler.jsonc`
- Modify: `/mnt/d/mun/quiz-app/worker/src/telegram.js`

- [ ] **Step 1: Write the failing endpoint tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

function createEnv(overrides = {}) {
  return {
    BOT_TOKEN: "test-token",
    ALLOWED_ORIGINS: "https://phamchidinh.github.io",
    OWNER_STATE: {
      value: null,
      async get() {
        return this.value;
      },
      async put(key, value) {
        this.value = value;
      }
    },
    TELEGRAM_API_BASE: "https://api.telegram.org",
    FETCH_IMPL: async () => new Response(JSON.stringify({ ok: true, result: [] })),
    ...overrides
  };
}

test("POST /register-owner stores the latest owner chat id", async () => {
  const env = createEnv();
  env.FETCH_IMPL = async () => new Response(JSON.stringify({
    ok: true,
    result: [{ update_id: 1, message: { text: "/start", chat: { id: 999 } } }]
  }));

  const response = await worker.fetch(
    new Request("https://worker.example/register-owner", { method: "POST" }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(env.OWNER_STATE.value, "999");
});

test("POST /send-result rejects a bad origin", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    new Request("https://worker.example/send-result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example"
      },
      body: JSON.stringify({
        correctCount: 1,
        incorrectCount: 0,
        unansweredCount: 0,
        total: 1,
        percent: 100,
        submittedAt: "2026-04-15T12:00:00.000Z",
        pageUrl: "https://phamchidinh.github.io/quiz-app/"
      })
    }),
    env
  );

  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the endpoint tests to verify they fail**

Run: `npm test` from `/mnt/d/mun/quiz-app/worker`

Expected: FAIL because `index.js` does not yet expose a Worker `fetch()` handler

- [ ] **Step 3: Add the response helpers**

```js
export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}

export function errorResponse(status, error) {
  return json({ ok: false, error }, { status });
}
```

- [ ] **Step 4: Extend Telegram helpers for API calls**

```js
export async function fetchTelegramUpdates(env) {
  const fetchImpl = env.FETCH_IMPL ?? fetch;
  const response = await fetchImpl(
    `${env.TELEGRAM_API_BASE}/bot${env.BOT_TOKEN}/getUpdates`
  );

  if (!response.ok) {
    throw new Error("telegram_fetch_failed");
  }

  const data = await response.json();
  return data.result ?? [];
}

export async function sendTelegramMessage(env, chatId, text) {
  const fetchImpl = env.FETCH_IMPL ?? fetch;
  const response = await fetchImpl(
    `${env.TELEGRAM_API_BASE}/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  if (!response.ok) {
    throw new Error("telegram_send_failed");
  }
}
```

- [ ] **Step 5: Implement the Worker request router**

```js
import { errorResponse, json } from "./response.js";
import {
  fetchTelegramUpdates,
  formatResultMessage,
  getLatestOwnerChatId,
  sendTelegramMessage
} from "./telegram.js";
import { isAllowedOrigin, validateResultPayload } from "./validation.js";

async function handleRegisterOwner(env) {
  const updates = await fetchTelegramUpdates(env);
  const chatId = getLatestOwnerChatId(updates);

  if (!chatId) {
    return errorResponse(404, "start_message_not_found");
  }

  await env.OWNER_STATE.put("owner_chat_id", chatId);
  return json({ ok: true });
}

async function handleSendResult(request, env) {
  const origin = request.headers.get("origin");
  const allowlist = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);

  if (!isAllowedOrigin(origin, allowlist)) {
    return errorResponse(403, "forbidden_origin");
  }

  const payload = validateResultPayload(await request.json());
  if (!payload.ok) {
    return errorResponse(400, payload.error);
  }

  const chatId = await env.OWNER_STATE.get("owner_chat_id");
  if (!chatId) {
    return errorResponse(409, "owner_not_registered");
  }

  await sendTelegramMessage(env, chatId, formatResultMessage(payload.value));
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed");
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/register-owner") {
        return await handleRegisterOwner(env);
      }

      if (url.pathname === "/send-result") {
        return await handleSendResult(request, env);
      }

      return errorResponse(404, "not_found");
    } catch (error) {
      if (error.message === "telegram_fetch_failed") {
        return errorResponse(502, "telegram_fetch_failed");
      }

      if (error.message === "telegram_send_failed") {
        return errorResponse(502, "telegram_send_failed");
      }

      return errorResponse(500, "internal_error");
    }
  }
};
```

- [ ] **Step 6: Add the Wrangler config**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quiz-app-telegram-worker",
  "main": "src/index.js",
  "compatibility_date": "2026-04-15"
}
```

- [ ] **Step 7: Re-run the Worker tests to verify the endpoints pass**

Run: `npm test` from `/mnt/d/mun/quiz-app/worker`

Expected: PASS for registration, origin checks, and Worker routing tests

- [ ] **Step 8: Commit the Worker service**

```bash
git -C /mnt/d/mun/quiz-app add worker/src/index.js worker/src/response.js worker/src/telegram.js worker/tests/worker.test.js worker/wrangler.jsonc
git -C /mnt/d/mun/quiz-app commit -m "feat: add cloudflare worker telegram api"
```

### Task 3: Add Frontend Notification Hook Without Breaking Submit Flow

**Files:**
- Modify: `/mnt/d/mun/quiz-app/index.html`
- Create: `/mnt/d/mun/quiz-app/js/notify.js`
- Modify: `/mnt/d/mun/quiz-app/js/app.js`
- Modify: `/mnt/d/mun/quiz-app/tests/quiz.test.js`

- [ ] **Step 1: Write the failing frontend notification tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { buildResultNotificationPayload } from "../js/notify.js";

test("buildResultNotificationPayload derives the API payload from a summary", () => {
  const payload = buildResultNotificationPayload(
    {
      correctCount: 42,
      incorrectCount: 8,
      unansweredCount: 0
    },
    50,
    "https://phamchidinh.github.io/quiz-app/"
  );

  assert.equal(payload.total, 50);
  assert.equal(payload.percent, 84);
  assert.equal(payload.pageUrl, "https://phamchidinh.github.io/quiz-app/");
  assert.match(payload.submittedAt, /^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 2: Run the quiz tests to verify they fail**

Run: `npm test` from `/mnt/d/mun/quiz-app`

Expected: FAIL because `notify.js` and the new export do not exist yet

- [ ] **Step 3: Implement the notification helper**

```js
function getTelegramResultsApiUrl() {
  return globalThis.__QUIZ_APP_CONFIG__?.telegramResultsApiUrl ?? "";
}

export function buildResultNotificationPayload(summary, total, pageUrl, submittedAt = new Date().toISOString()) {
  const percent = total > 0 ? Math.round((summary.correctCount / total) * 100) : 0;

  return {
    correctCount: summary.correctCount,
    incorrectCount: summary.incorrectCount,
    unansweredCount: summary.unansweredCount,
    total,
    percent,
    submittedAt,
    pageUrl
  };
}

export async function sendResultNotification(summary, total, pageUrl, fetchImpl = fetch) {
  const apiBaseUrl = getTelegramResultsApiUrl();
  if (!apiBaseUrl) {
    return;
  }

  const payload = buildResultNotificationPayload(summary, total, pageUrl);

  const response = await fetchImpl(`${apiBaseUrl}/send-result`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("result_notification_failed");
  }
}
```

- [ ] **Step 4: Add a frontend config block in `index.html`**

```html
<script>
  window.__QUIZ_APP_CONFIG__ = {
    telegramResultsApiUrl: ""
  };
</script>
```

- [ ] **Step 5: Hook submission into the existing app flow**

```js
import { sendResultNotification } from "./notify.js";

function submitSession(session) {
  const submittedSession = { ...session, submitted: true };
  const summary = scoreSession(submittedSession, state.questions);

  state.stats = updateStudyHistory(state.stats, summary, session.order.length);
  persistStats();

  state.persisted.session = submittedSession;
  state.persisted.lastResult = summary;
  persistState();

  void sendResultNotification(summary, session.order.length, window.location.href)
    .catch((error) => {
      console.warn("Telegram result notification failed", error);
    });

  renderResults(submittedSession);
}
```

- [ ] **Step 6: Re-run the quiz tests to verify the new helper passes**

Run: `npm test` from `/mnt/d/mun/quiz-app`

Expected: PASS for existing quiz logic tests and the new notification payload test

- [ ] **Step 7: Commit the frontend notification hook**

```bash
git -C /mnt/d/mun/quiz-app add index.html js/notify.js js/app.js tests/quiz.test.js
git -C /mnt/d/mun/quiz-app commit -m "feat: send quiz results to telegram worker"
```

### Task 4: Document Deployment and Registration

**Files:**
- Create: `/mnt/d/mun/quiz-app/docs/telegram-worker-setup.md`
- Modify: `/mnt/d/mun/quiz-app/worker/wrangler.jsonc`
- Modify: `/mnt/d/mun/quiz-app/index.html`

- [ ] **Step 1: Write the setup guide**

```md
# Telegram Worker Setup

## 1. Install Worker dependencies

```bash
cd /mnt/d/mun/quiz-app/worker
npm install
```

## 2. Create KV

```bash
npx wrangler kv namespace create OWNER_STATE
```

Copy the returned namespace id into `worker/wrangler.jsonc` inside the `kv_namespaces` array.

## 3. Set secrets and vars

```bash
npx wrangler secret put BOT_TOKEN
```

Add your GitHub Pages origin to `worker/wrangler.jsonc` before deploy:

```jsonc
{
  "vars": {
    "ALLOWED_ORIGINS": "https://phamchidinh.github.io"
  }
}
```

## 4. Deploy

```bash
npx wrangler deploy
```

## 5. Register owner chat

1. Open Telegram
2. Send `/start` to your bot
3. Call:

```bash
curl -X POST "$(cat worker-url.txt)/register-owner"
```
```

- [ ] **Step 2: Finalize deploy-time config with exact generated values**

Update `worker/wrangler.jsonc` to use:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quiz-app-telegram-worker",
  "main": "src/index.js",
  "compatibility_date": "2026-04-15",
  "vars": {
    "ALLOWED_ORIGINS": "https://phamchidinh.github.io"
  }
}
```

Then add a `kv_namespaces` entry using the exact namespace id printed by `npx wrangler kv namespace create OWNER_STATE`, deploy, and save the exact deploy URL for the frontend config:

```bash
cd /mnt/d/mun/quiz-app/worker
npx wrangler deploy | tee /tmp/worker-deploy.log
grep -Eo 'https://[^ ]+\.workers\.dev' /tmp/worker-deploy.log | head -n 1 > /mnt/d/mun/quiz-app/worker-url.txt
```

Update `/mnt/d/mun/quiz-app/index.html` to use the captured URL:

```bash
python3 - <<'PY'
from pathlib import Path

index_path = Path("/mnt/d/mun/quiz-app/index.html")
worker_url = Path("/mnt/d/mun/quiz-app/worker-url.txt").read_text().strip()
original = index_path.read_text()
updated = original.replace('telegramResultsApiUrl: ""', f'telegramResultsApiUrl: "{worker_url}"')
index_path.write_text(updated)
PY
```

- [ ] **Step 3: Run final verification commands**

Run from `/mnt/d/mun/quiz-app/worker`:

```bash
npm test
```

Expected: PASS for all Worker tests

Run from `/mnt/d/mun/quiz-app`:

```bash
npm test
```

Expected: PASS for quiz logic and notification payload tests

Smoke test after deploy:

```bash
curl -X POST "$(cat /mnt/d/mun/quiz-app/worker-url.txt)/register-owner"
curl -X POST "$(cat /mnt/d/mun/quiz-app/worker-url.txt)/send-result" \
  -H "content-type: application/json" \
  -H "origin: https://phamchidinh.github.io" \
  --data '{"correctCount":42,"incorrectCount":8,"unansweredCount":0,"total":50,"percent":84,"submittedAt":"2026-04-15T12:00:00.000Z","pageUrl":"https://phamchidinh.github.io/quiz-app/"}'
```

Expected:
- first command returns `{ "ok": true }` after `/start`
- second command returns `{ "ok": true }`
- Telegram receives the summary message

- [ ] **Step 4: Commit the setup docs and config**

```bash
git -C /mnt/d/mun/quiz-app add docs/telegram-worker-setup.md worker/wrangler.jsonc index.html
git -C /mnt/d/mun/quiz-app commit -m "docs: add telegram worker deployment guide"
```
