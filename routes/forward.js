// What this file does:
// POST /forward — takes an internal event, transforms it into a TikTok
// Events API v1.3 payload (using src/tiktok-mapper.js), and either:
//   - Sends it to TikTok for real (if TIKTOK_ACCESS_TOKEN + TIKTOK_PIXEL_ID env vars are set)
//   - Returns the prepared request body without sending (if creds are missing)
//
// Why both modes:
//   "Compose mode" lets you demo what TikTok would receive without exposing
//   credentials in screenshots/recordings. "Live mode" proves the integration
//   actually works end-to-end. The response always shows the request body so
//   the interviewer can read exactly what TikTok would see.

const express = require('express');
const router = express.Router();
const { buildTikTokRequest } = require('../src/tiktok-mapper');
const { diagnose } = require('../src/diagnose');

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

router.post('/', async (req, res) => {
  const event = req.body;

  // Always run our own validator first. No point shipping a known-broken event
  // to TikTok and waiting for them to reject it — fail fast locally.
  const diagnostic = diagnose(event);
  if (!diagnostic.ok && diagnostic.severity === 'high') {
    return res.status(400).json({
      ok: false,
      stage: 'local_validation',
      reason: 'Event would be rejected by TikTok. Fix locally first.',
      diagnostic,
    });
  }

  // Read credentials from env. Missing creds = compose mode.
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const pixelCode = process.env.TIKTOK_PIXEL_ID;
  const testEventCode = process.env.TIKTOK_TEST_EVENT_CODE;

  // Build the TikTok-shaped request body either way.
  const tiktokBody = buildTikTokRequest({
    events: [event],
    pixelCode: pixelCode || '<MISSING_TIKTOK_PIXEL_ID>',
    testEventCode,
  });

  // Compose mode: no live call, just show what would be sent.
  if (!accessToken || !pixelCode) {
    return res.json({
      ok: true,
      mode: 'compose',
      note:
        'TIKTOK_ACCESS_TOKEN and/or TIKTOK_PIXEL_ID not set in .env — request was built but NOT sent. Add credentials to switch to live mode.',
      diagnostic,
      request: {
        url: TIKTOK_API_URL,
        method: 'POST',
        headers: {
          'Access-Token': '<REDACTED>',
          'Content-Type': 'application/json',
        },
        body: tiktokBody,
      },
    });
  }

  // Live mode: actually POST to TikTok.
  try {
    const startedAt = Date.now();
    const tiktokRes = await fetch(TIKTOK_API_URL, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tiktokBody),
    });
    const elapsedMs = Date.now() - startedAt;
    const responseBody = await tiktokRes.json().catch(() => ({}));

    return res.json({
      ok: tiktokRes.ok && responseBody.code === 0,
      mode: 'live',
      diagnostic,
      request: {
        url: TIKTOK_API_URL,
        method: 'POST',
        headers: {
          'Access-Token': '<REDACTED>',
          'Content-Type': 'application/json',
        },
        body: tiktokBody,
      },
      tiktok_response: {
        http_status: tiktokRes.status,
        elapsed_ms: elapsedMs,
        body: responseBody,
      },
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      mode: 'live',
      stage: 'network',
      reason: err.message,
      request: {
        url: TIKTOK_API_URL,
        body: tiktokBody,
      },
    });
  }
});

module.exports = router;
