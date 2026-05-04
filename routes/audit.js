// What this file does:
// POST /audit — accepts { events: [...] }, returns aggregated findings.
// This is the "audit a batch" endpoint that maps to the JD's
// "Conduct technical audits of advertiser setups" responsibility.

const express = require('express');
const router = express.Router();
const { audit } = require('../src/audit');

router.post('/', (req, res) => {
  const body = req.body || {};
  const events = body.events;
  const result = audit(events);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

module.exports = router;
