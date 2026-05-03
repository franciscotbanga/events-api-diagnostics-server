// HTTP layer for the /dedup endpoint.
// Checks whether a given event_id has already been seen by /diagnose recently.
//
// Real-world relevance: when an advertiser sends an event via the server-side
// Events API AND the browser pixel, the platform deduplicates by event_id.
// If the IDs don't match, the same purchase gets counted twice. This endpoint
// is a sanity check — "have I already sent this event_id today?"
//
// IMPORTANT: backed by the in-memory ring buffer in src/log.js (last 20 events).
// In production this would query a real datastore with a longer retention window.

const express = require('express');
const router = express.Router();

const { list } = require('../src/log');

// POST / — accepts { event_id }.
// Returns whether the id has been seen, how many times, and when.
router.post('/', (req, res) => {
  const { event_id } = req.body || {};

  if (!event_id) {
    return res.status(400).json({
      ok: false,
      error: 'event_id is required',
    });
  }

  // Walk the ring buffer for entries whose payload had the same event_id.
  // ?. guards against malformed payloads in the log (e.g. someone POSTed null).
  const matches = list().filter(
    (entry) => entry.payload?.event_id === event_id
  );

  const seen = matches.length > 0;

  res.json({
    ok: true,
    event_id,
    seen,
    count: matches.length,
    // Surfacing the actual occurrences makes it obvious *why* the dedup check
    // fired — the user can see the timestamps and event types in the response.
    occurrences: matches.map((m) => ({
      received_at: m.received_at,
      event_name: m.payload?.event_name ?? null,
    })),
    // Plain-English summary so the frontend doesn't have to write its own copy.
    summary: seen
      ? `event_id "${event_id}" has been seen ${matches.length} time(s) in the recent buffer. If you send it again, the platform will treat it as a duplicate.`
      : `event_id "${event_id}" has not been seen in the recent buffer — safe to send as a new event.`,
  });
});

module.exports = router;
