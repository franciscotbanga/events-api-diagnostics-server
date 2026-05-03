# events-api-diagnostics-server

A small Node + Express server that takes an event payload, runs it through a set of validators, and returns a plain-English explanation of what's wrong with it — written for both the advertiser and the developer who has to fix it.

## Why I built this

When I dig into Events API issues with advertisers, the same problems come up over and over: a Purchase event missing `currency`, an `event_id` that doesn't match the pixel, a `timestamp` sent as an ISO string instead of Unix seconds. Each one breaks something different — sometimes the event is rejected outright, sometimes it gets ingested but reporting is silently wrong.

I wanted a tool that does two things at once:

1. Tells the **advertiser** in plain language what they're losing (e.g. "ROAS will be inaccurate without a currency code").
2. Tells the **developer** exactly what to change (e.g. "Add `currency` using an ISO 4217 code such as BRL or USD").

That's the gap this fills. Same diagnostic, two audiences, one HTTP call.

## What it does

POST any event payload to `/diagnose` and you get back:

```json
{
  "ok": false,
  "summary": "Purchase event is missing currency.",
  "client_explanation": "Your Purchase event includes a value but does not include currency. Without a valid currency code such as BRL or USD, revenue reporting and ROAS calculations may be inaccurate.",
  "developer_fix": "Add currency using an ISO 4217 code such as BRL or USD.",
  "severity": "medium"
}
```

Severity follows what actually happens downstream:

- **high** — event will be rejected (missing `event_id`, bad `timestamp` type, `value <= 0`)
- **medium** — event ingests but reporting/attribution is degraded (missing `currency`, malformed `content_ids`)
- **low** — cosmetic, no business impact

## How it's structured

```
src/
  validators.js   pure validation rules — no Express, easy to test
  diagnose.js     turns validator output into the two-audience response
  hash.js         SHA-256 helpers for email/phone (normalize, then hash)
routes/
  diagnose.js     thin Express handler — just calls into src/diagnose.js
examples/         sample payloads (valid, missing currency, missing event_id)
server.js         app bootstrap
```

The validators are deliberately pure functions — no HTTP, no I/O. The HTTP layer is a few lines. That separation means the diagnostic logic could just as easily run as a CLI, a batch job, or a Lambda without touching the core.

## Run it locally

```bash
npm install
npm run dev
```

Then in another terminal:

```bash
curl -X POST http://localhost:3000/diagnose \
  -H "Content-Type: application/json" \
  -d @examples/diagnose-purchase-missing-currency.json
```

## What's next

This is project 1 of a 4-project series I'm building to go deep on the advertiser side of the Events API stack:

1. **events-api-diagnostics-server** — this repo
2. **advertiser-technical-discovery-playbook** — the discovery questions I'd actually ask on a kickoff call
3. **javascript-event-tracking-playground** — a sandbox for the pixel side, so I can see both halves end-to-end
4. **shopify-webhook-to-purchase-event-mock** — turning a real Shopify webhook into a properly-formed Purchase event

Next on this repo specifically: add a `/hash` endpoint that exposes the PII normalization helpers, and an `/identify` endpoint that scores how complete an event's identity matching will be (email + phone + click ID = strong, IP-only = weak).
