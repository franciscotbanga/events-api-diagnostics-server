// Import the Express framework. `require` is Node's built-in way to load a module.
// Express returns a factory function that we'll call below to create our app instance.
const express = require('express');

// `path` is a Node built-in — used here to resolve the absolute path to /public
// regardless of where the server is started from.
const path = require('path');

// CORS middleware. Browsers block cross-origin requests by default —
// without this, a JS app served from any other origin (a pixel playground,
// a local React app, a hosted advertiser dashboard) couldn't POST to /diagnose.
const cors = require('cors');

// Pull in route modules. Each route file exports a `Router` that we mount
// at a specific path below. Keeping routes in their own files keeps server.js
// focused on app setup and lets each endpoint grow independently.
const diagnoseRoute = require('./routes/diagnose');
const logsRoute = require('./routes/logs');
const hashRoute = require('./routes/hash');
const dedupRoute = require('./routes/dedup');

// Create an Express application instance. `app` is the object we register
// routes and middleware on, and that we eventually start listening for HTTP requests.
const app = express();

// Define the port the server will listen on.
// 3000 is a conventional default for local Node dev servers.
const PORT = 3000;

// Allow cross-origin requests from anywhere. This is the right setting for
// local development and for a public diagnostics tool where any caller is welcome.
//
// IN PRODUCTION this should be locked down — pass an `origin` option listing
// the specific advertiser/partner domains we want to accept calls from, e.g.:
//   app.use(cors({ origin: ['https://advertiser-a.com', 'https://advertiser-b.com'] }))
// Wide-open CORS in production would let any site on the internet call this
// API from a user's browser, which is fine for a stateless diagnostic but
// dangerous the moment we add authenticated endpoints or rate-limited resources.
app.use(cors());

// Tell Express to automatically parse incoming JSON request bodies.
// Without this, `req.body` would be undefined when clients POST JSON.
// Express 5 ships with this built-in (no need for the separate body-parser package).
app.use(express.json());

// Machine-readable status (handy for curl / health checks). Used to live at "/",
// but "/" now serves the SPA tester so a browser visit shows the UI.
app.get('/status', (req, res) => {
  res.json({
    service: 'events-api-diagnostics-server',
    status: 'ok',
    endpoints: [
      'POST /diagnose',
      'POST /hash',
      'POST /dedup',
      'GET /logs',
      'GET /status',
    ],
  });
});

// Mount the API routers. Each one lives in its own file under /routes.
app.use('/diagnose', diagnoseRoute);
app.use('/hash', hashRoute);
app.use('/dedup', dedupRoute);
app.use('/logs', logsRoute);

// Serve the single-page tester from /public. This must come AFTER the API
// routes so /diagnose etc. aren't shadowed by a hypothetical static file
// of the same name. Hitting "/" in a browser gets index.html.
app.use(express.static(path.join(__dirname, 'public')));

// Start the HTTP server and bind it to PORT.
// The callback runs once the server is successfully listening.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
