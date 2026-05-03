// HTTP layer for the /hash endpoint.
// Exposes the SHA-256 normalize-then-hash helpers from src/hash.js so the
// frontend tester can demonstrate what a properly hashed PII payload looks like.
//
// IMPORTANT: this is for demonstration only. In a real Events API integration
// the hashing happens server-side BEFORE sending to the platform — never in
// the browser, and never in a way that exposes the raw PII over the wire.

const express = require('express');
const router = express.Router();

const { hashEmail, hashPhone } = require('../src/hash');

// POST / — accepts { email?, phone? } (at least one required).
// Returns the hash for whatever was provided.
router.post('/', (req, res) => {
  const body = req.body || {};
  const { email, phone } = body;

  if (!email && !phone) {
    return res.status(400).json({
      ok: false,
      error: 'Provide at least one of: email, phone',
    });
  }

  const result = { ok: true };

  if (email) {
    result.email = {
      input: email,
      // Show what we hashed AFTER normalization, so the user can see the
      // trim+lowercase step explicitly. This is the gotcha most integrations get wrong.
      normalized: email.trim().toLowerCase(),
      hash: hashEmail(email),
    };
  }

  if (phone) {
    result.phone = {
      input: phone,
      normalized: phone.replace(/\D/g, ''),
      hash: hashPhone(phone),
    };
  }

  res.json(result);
});

module.exports = router;
