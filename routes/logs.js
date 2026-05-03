// HTTP layer for the /logs endpoint.
// Returns the in-memory ring buffer of recent /diagnose calls, newest first.
//
// IMPORTANT: this exposes whatever was POSTed to /diagnose since the last
// server restart. In production this would need authentication (you don't
// want random callers reading other advertisers' event payloads) and would
// be backed by a real datastore — see comments in src/log.js.

const express = require('express');
const router = express.Router();

const { list, MAX_ENTRIES } = require('../src/log');

// GET / — handles requests to /logs (mount path is added in server.js).
// Returns:
//   {
//     count: number of entries currently in the buffer,
//     max:   buffer capacity (oldest entries beyond this are dropped),
//     entries: [{ received_at, payload, response }, ...]  // newest first
//   }
// We wrap the array in an object instead of returning a bare array because
// it's easier to add fields later (pagination cursor, filter info, etc.)
// without breaking clients.
router.get('/', (req, res) => {
  const entries = list();
  res.json({
    count: entries.length,
    max: MAX_ENTRIES,
    entries,
  });
});

module.exports = router;
