// Import the Express framework. `require` is Node's built-in way to load a module.
// Express returns a factory function that we'll call below to create our app instance.
const express = require('express');

// Pull in route modules. Each route file exports a `Router` that we mount
// at a specific path below. Keeping routes in their own files keeps server.js
// focused on app setup and lets each endpoint grow independently.
const diagnoseRoute = require('./routes/diagnose');

// Create an Express application instance. `app` is the object we register
// routes and middleware on, and that we eventually start listening for HTTP requests.
const app = express();

// Define the port the server will listen on.
// 3000 is a conventional default for local Node dev servers.
const PORT = 3000;

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
    endpoints: ['POST /diagnose'],
  });
});

// Mount the diagnose router at /diagnose. Any route defined inside
// routes/diagnose.js with path "/" will respond at "/diagnose".
app.use('/diagnose', diagnoseRoute);

// Start the HTTP server and bind it to PORT.
// The callback runs once the server is successfully listening.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
