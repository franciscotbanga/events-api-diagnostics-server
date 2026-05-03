// HTTP layer for the /diagnose endpoint.
// This file's only job is to translate between Express and the pure
// diagnose() function in src/diagnose.js. Keeping the diagnostic logic
// out of the route makes it trivial to test and reuse from other contexts
// (CLI tools, batch jobs, future endpoints).

const express = require('express');

// `Router` is a mini Express app you can attach routes to and mount
// at a path in the main app. We'll mount this one at "/diagnose" in server.js.
const router = express.Router();

// Pull in the pure diagnostic engine. The route doesn't know anything
// about validators or severity — it just hands the body off and returns the result.
const { diagnose } = require('../src/diagnose');

// POST / — handles requests to /diagnose (mount path is added in server.js).
// Accepts any JSON body; the diagnose() function is responsible for figuring
// out what kind of event it is and what's wrong with it.
router.post('/', (req, res) => {
  // req.body is populated by the express.json() middleware registered in server.js.
  // If the client forgot to send a body (or sent invalid JSON), it will be undefined/{}.
  const event = req.body;

  // Run the diagnostic engine. This is a pure function call — no awaits, no I/O.
  const result = diagnose(event);

  // Send the result back as JSON. We deliberately return HTTP 200 even when
  // ok=false: the diagnostic *itself* succeeded, even though it found issues
  // in the submitted event. The "ok" field in the body conveys event validity.
  res.json(result);
});

module.exports = router;
