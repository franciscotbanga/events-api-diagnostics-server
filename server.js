// Import the Express framework. `require` is Node's built-in way to load a module.
// Express returns a factory function that we'll call below to create our app instance.
const express = require('express');

// CORS middleware. Browsers block cross-origin requests by default —
// without this, a JS app served from any other origin (a pixel playground,
// a local React app, a hosted advertiser dashboard) couldn't POST to /diagnose.
const cors = require('cors');

// Pull in route modules. Each route file exports a `Router` that we mount
// at a specific path below. Keeping routes in their own files keeps server.js
// focused on app setup and lets each endpoint grow independently.
const diagnoseRoute = require('./routes/diagnose');
const logsRoute = require('./routes/logs');

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

// Register a route handler for HTTP GET requests to the root path "/".
// The callback receives `req` (incoming request) and `res` (outgoing response).
app.get('/', (req, res) => {
  // Send a JSON response. Express sets Content-Type: application/json automatically.
  // `endpoints` lists the routes this server exposes, so a developer hitting
  // the root URL can discover what's available without reading the source.
  res.json({
    service: 'events-api-diagnostics-server',
    status: 'ok',
    endpoints: ['POST /diagnose', 'GET /logs'],
  });
});

// Mount the diagnose router at /diagnose. Any route defined inside
// routes/diagnose.js with path "/" will respond at "/diagnose".
app.use('/diagnose', diagnoseRoute);

// Mount the logs router at /logs. Returns the in-memory ring buffer of
// recent /diagnose calls.
app.use('/logs', logsRoute);

// Start the HTTP server and bind it to PORT.
// The callback runs once the server is successfully listening.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
