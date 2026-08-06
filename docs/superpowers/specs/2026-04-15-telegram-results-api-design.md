# Telegram Result Notifications Design

## Goal

Send a Telegram message to the site owner every time any quiz attempt is submitted, while keeping the existing quiz app deployed on GitHub Pages and keeping the Telegram bot token out of the frontend.

## Scope

This design covers:

- A separate Cloudflare Worker API used by the frontend
- One-time owner registration through Telegram `/start`
- Sending quiz result summaries to the owner's Telegram chat
- Basic request validation and origin checks
- Frontend integration that does not block the quiz result screen on failure
- Unit and integration-oriented test coverage for the new behavior

This design does not cover:

- User identity, authentication, or per-student tracking
- Persistent analytics beyond storing the owner's Telegram chat id
- Retrying failed Telegram sends in the background
- Moving the quiz frontend away from GitHub Pages

## Constraints

- The quiz frontend remains a static site hosted on GitHub Pages.
- The owner only wants to provide a Telegram bot token and perform a single `/start` action in Telegram.
- The frontend must never contain the bot token or the Telegram chat id.
- Submission flow must remain usable even if the notification API fails.
- The solution should stay within Cloudflare free-tier capabilities.

## Recommended Approach

Use a standalone Cloudflare Worker with a bound KV namespace.

- The Worker stores the owner's Telegram `chat_id` in KV after a one-time registration call.
- The quiz frontend calls the Worker on submission with a compact result payload.
- The Worker validates the request, formats a short message, and forwards it to the Telegram Bot API.

This is preferred over direct frontend-to-Telegram calls because direct calls would expose the bot token. It is preferred over a full Node server because the behavior is small, bursty, and fits Cloudflare's free model well.

## Architecture

### Components

1. GitHub Pages frontend
   Sends result summaries to the Worker after a successful local submit.

2. Cloudflare Worker API
   Exposes two HTTP endpoints:
   - `POST /register-owner`
   - `POST /send-result`

3. Cloudflare KV
   Stores the owner chat id under a fixed key.

4. Telegram Bot API
   Provides `getUpdates` during one-time registration and `sendMessage` during notification delivery.

### Data Flow

#### Owner registration

1. Owner creates a Telegram bot and gets `BOT_TOKEN`.
2. Owner sends `/start` to the bot once in Telegram.
3. Owner calls `POST /register-owner`.
4. Worker calls Telegram `getUpdates`.
5. Worker finds the most recent valid `/start` message and extracts the sender `chat_id`.
6. Worker stores that `chat_id` in KV.
7. Worker returns a short success response.

#### Quiz submission notification

1. A user submits the quiz in the existing frontend.
2. Frontend computes summary data as it already does.
3. Frontend asynchronously calls `POST /send-result`.
4. Worker checks method, origin, payload shape, and owner registration state.
5. Worker formats a Telegram message from the result payload.
6. Worker sends the message using Telegram `sendMessage`.
7. Frontend ignores notification failures for user-facing flow and still shows quiz results normally.

## API Design

### `POST /register-owner`

Purpose:
Register the owner's Telegram chat for future notifications.

Request:
- No body required, or a minimal JSON body reserved for future use.

Behavior:
- Reads recent Telegram updates using the configured bot token
- Finds the latest `/start` message
- Extracts the corresponding `chat_id`
- Saves it to KV using a fixed key such as `owner_chat_id`

Responses:
- `200` with `{ "ok": true }` when registration succeeds
- `404` with `{ "ok": false, "error": "start_message_not_found" }` when no `/start` update is available
- `502` with `{ "ok": false, "error": "telegram_fetch_failed" }` when Telegram cannot be queried

### `POST /send-result`

Purpose:
Receive a quiz result from the frontend and forward it to the owner's Telegram chat.

Request JSON:

```json
{
  "correctCount": 42,
  "incorrectCount": 8,
  "unansweredCount": 0,
  "total": 50,
  "percent": 84,
  "submittedAt": "2026-04-15T12:00:00.000Z",
  "pageUrl": "https://example.github.io/quiz-app/"
}
```

Validation rules:
- All count fields must be finite integers greater than or equal to `0`
- `total` must be greater than `0`
- `correctCount + incorrectCount + unansweredCount` must equal `total`
- `percent` must be a finite number from `0` to `100`
- `submittedAt` must be a valid ISO-like string
- `pageUrl` must be a valid URL string

Responses:
- `200` with `{ "ok": true }` when message delivery succeeds
- `400` with `{ "ok": false, "error": "invalid_payload" }` when validation fails
- `403` with `{ "ok": false, "error": "forbidden_origin" }` when the request origin is not allowed
- `409` with `{ "ok": false, "error": "owner_not_registered" }` when no owner chat id exists in KV
- `502` with `{ "ok": false, "error": "telegram_send_failed" }` when Telegram delivery fails

## Message Format

Telegram messages should stay short and scannable. Proposed content:

```text
Quiz moi vua nop bai
Dung: 42/50 (84%)
Sai: 8
Bo trong: 0
Luc nop: 2026-04-15T12:00:00.000Z
Trang: https://example.github.io/quiz-app/
```

Formatting principles:
- Plain text only for the first version
- No dependence on student identity
- Enough detail to judge result quality at a glance
- Deterministic format so tests can assert exact output

## Security and Abuse Controls

This is a lightweight public-web integration, so controls are intentionally basic but explicit.

### Secrets

- `BOT_TOKEN` is stored as a Cloudflare Worker secret
- Owner chat id is stored in KV
- Neither value is exposed to the frontend

### Request filtering

- Only `POST` is accepted for both endpoints
- `Origin` must match an allowlist containing the GitHub Pages domain used by the quiz app
- Requests must use `Content-Type: application/json` for `POST /send-result`
- Payload size should be capped conservatively

### Non-goals

- This is not strong caller authentication
- This does not prevent all spoofed traffic from determined attackers
- If stronger protection is later needed, add a signed token or Cloudflare Turnstile-backed workflow

## Frontend Integration

The current submit flow already computes a `summary` in `submitSession(...)`. The integration should:

1. Keep the existing local scoring and results rendering behavior unchanged
2. Build a notification payload from the already-computed summary
3. Send the payload with `fetch()` after local state persistence succeeds
4. Catch and log failures without altering UI state

Behavioral requirement:
- Users must still see the result page immediately even if the API is unavailable

Configuration requirement:
- Frontend should read the Worker endpoint from a small config constant so the deployed GitHub Pages site can point to the correct API URL

## Error Handling

### Worker errors

- Invalid method: return `405`
- Invalid origin: return `403`
- Invalid payload: return `400`
- Missing owner registration: return `409`
- Telegram upstream failure: return `502`

### Frontend behavior on Worker errors

- Do not block submission completion
- Do not replace the result page with an error state
- Log a concise warning for debugging purposes

This preserves the existing learning flow while making notifications best-effort.

## Testing Strategy

### Worker unit tests

Add tests for:

- payload validation
- Telegram message formatting
- parsing latest owner `chat_id` from Telegram updates
- origin allowlist logic

### Frontend tests

Add tests for:

- submit flow still computes and persists results correctly
- notification sending is attempted after submit
- notification failure does not break result rendering

### Manual verification

1. Deploy Worker with `BOT_TOKEN` and KV binding
2. Send `/start` to the bot
3. Call `POST /register-owner`
4. Submit a quiz attempt from the deployed site
5. Confirm Telegram receives the expected summary

## Deployment Notes

### Worker environment

Required bindings:

- `BOT_TOKEN` secret
- KV namespace for owner registration
- allowlisted frontend origin configured in Worker environment variables or constants

### Frontend environment

- The deployed GitHub Pages app must know the Worker base URL
- No Telegram secret is stored in the frontend

## Open Decisions Resolved

- Student name input: not included
- Owner registration method: one-time `/start` plus `POST /register-owner`
- Hosting model: GitHub Pages for frontend, Cloudflare Worker for API
- Persistence: KV only for owner chat id

## Implementation Boundaries

The implementation plan should be split into two focused tracks:

1. Worker API scaffold, Telegram integration, KV registration, and Worker tests
2. Frontend submit-hook integration and frontend tests

This keeps the API concerns isolated from the quiz UI logic and reduces risk when integrating with the already-working submission flow.
