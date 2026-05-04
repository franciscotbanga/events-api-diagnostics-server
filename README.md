# events-api-diagnostics-server

A working implementation-support tool for the kind of tracking issues a Brazilian advertiser hits when wiring up the TikTok Pixel + Events API. Single advertiser ticket, one tool: paste an event, see what's wrong, see the fix in pt-BR and English, see the actual TikTok Events API request that would go on the wire.

> **Why this exists.** I built this to think through how I'd approach a Level-3 Implementation-Support ticket end-to-end. I wanted the artifact to demonstrate, not just describe, the diagnostic mindset.

---

## What this demonstrates (mapped to the Technical Product Specialist JD)

| JD requirement | How this repo proves it |
|---|---|
| Pixel (web tracking) | `/demo` — fake checkout that fires a TikTok Pixel-style `ttq.track('CompletePayment', …)` call, with the SAME `event_id` used by the server-side event |
| API-based tracking integration | `/forward` — maps internal events to **TikTok Events API v1.3** payload (correct event names, hashed PII in arrays, `properties.contents` shape) and POSTs to `business-api.tiktok.com` |
| Diagnose tracking/attribution issues | `/diagnose` — returns severity (high/medium/low), client-facing explanation, and developer-facing fix |
| Conduct **technical audits** | `/audit` — accepts a batch of events, returns failure rates per field, top issues ranked by impact, evidence event IDs, summary in pt-BR and English |
| Step-by-step developer guidance | Every diagnostic returns a `developer_fix` string written as a directly actionable instruction |
| Translating tech for advertisers | The `client_explanation` field is written for the advertiser; `developer_fix` for their dev team — same diagnostic, two audiences |
| Brazil market | All sample data is BRL/+55/pt-BR; `/demo` page is in Portuguese; `/audit` returns a `summary_pt` field; main SPA has hover-to-translate on every UI string |
| Following structured technical documentation | The TikTok mapper in `src/tiktok-mapper.js` follows the v1.3 spec — `CompletePayment` (not "Purchase"), SHA-256 hashed user identity, `event_time` in epoch seconds, etc. |
| Ability to admit knowledge gaps | See the **Scope & gaps** section below — explicitly lists what this does NOT cover |

---

## Demo flow (5–7 minutes)

This is the screen-share path:

1. **Open `/`** — the SPA tester. Hover any UI string to see the pt-BR translation.
2. **Click "Diagnose" tab → "Missing currency" sample → Send.** Severity = `medium`. Client explanation = ROAS impact. Developer fix = "Add currency using an ISO 4217 code such as BRL or USD."
3. **Click "Audit Batch" tab → Load sample → Send.** Aggregated audit across multiple events, top issues ranked by impact, summary in pt-BR.
4. **Click "Forward to TikTok" tab → Send.** Shows the exact TikTok Events API v1.3 request body the server would POST — with email and phone already SHA-256 hashed, `CompletePayment` (not "Purchase") as the event name, `properties.contents` correctly shaped. With credentials in `.env`, this becomes a live API call.
5. **Click "Pixel demo" in the footer → `/demo`.** Fake Brazilian e-commerce checkout. Click "Finalizar compra". Watch BOTH the pixel-side event and the server-side event fire with the SAME `event_id`. Dedup banner confirms TikTok will deduplicate correctly.
6. **Open a `tickets/` file.** This is roughly what the reply email would look like for a related advertiser ticket, in pt-BR.

---

## Scope & gaps (what this does NOT cover)

Being explicit because misinforming an advertiser is the worst thing a TPS can do.

- **Mobile attribution / MMPs (AppsFlyer, Adjust)** — out of scope. Different surface (postbacks, install windows, SKAdNetwork). I'd ramp on this during onboarding.
- **Production secret management** — `.env` is fine for local dev; real systems would use a secret manager.
- **Multi-pixel orchestration / Pixel Helper-equivalent** — this tool checks one event's shape, not whether the pixel is firing across a real site.
- **Authentication on internal endpoints** — `/logs` exposes the in-memory buffer with no auth; production would lock that down.
- **TikTok-specific edge cases** — I've coded against v1.3 for web events. Mobile App Events, offline conversions, and the Conversions Lift API would each need their own mapping.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/diagnose` | Single-event validation; returns severity + fixes in two voices |
| `POST` | `/audit` | Batch audit across many events; returns ranked findings |
| `POST` | `/forward` | Map to TikTok Events API v1.3 + send (or compose-only if no creds) |
| `POST` | `/dedup` | Has this `event_id` been seen recently? |
| `POST` | `/hash` | Normalize-then-SHA-256 helper for email/phone (the gotcha most integrations miss) |
| `GET`  | `/logs` | In-memory ring buffer of the last 20 `/diagnose` calls |
| `GET`  | `/status` | JSON health check + reports whether TikTok credentials are set |
| `GET`  | `/` | SPA tester (this is what you'll demo) |
| `GET`  | `/demo` | Fake Brazilian checkout — pixel + server-side dedup demo |

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To enable live TikTok API calls (instead of compose-only mode):

```bash
cp .env.example .env
# fill in TIKTOK_ACCESS_TOKEN, TIKTOK_PIXEL_ID, TIKTOK_TEST_EVENT_CODE
```

See `.env.example` for where to find each value in TikTok For Business / Events Manager.

## Tech stack

Node 18+ · Express 5 · `dotenv` · vanilla HTML/JS for the frontend (no React, no Tailwind, no build step) · Node's built-in `fetch` for the TikTok API call · Node's built-in `crypto` for SHA-256.
