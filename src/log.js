// In-memory ring buffer for recent /diagnose calls.
//
// IMPORTANT: this is in-memory ONLY. Two consequences:
//   1. The log is wiped every time the server restarts.
//   2. If we ever scale beyond a single Node process, each instance keeps
//      its own log and a request for /logs only sees what hit *that* instance.
//
// In production this would be replaced by a real datastore — Redis (for short
// retention), Postgres (for queryable history), or a logging pipeline like
// Kafka → ClickHouse. Keeping the API of this module narrow (record + list)
// means the swap is a one-file change later.

// How many entries to keep. Older entries are evicted as new ones come in.
// 20 is enough to be useful in a demo; production would tune this much higher.
const MAX_ENTRIES = 20;

// The buffer itself. Plain array — we keep it small enough that Array.shift()
// (O(n)) is fine. If MAX_ENTRIES grew to thousands we'd switch to a true
// circular buffer with a write index, but at 20 the simpler code wins.
const entries = [];

// Push a new entry into the buffer. Evicts the oldest if we're at capacity.
// `payload` is the raw event the caller POSTed; `response` is what /diagnose returned.
function record(payload, response) {
  entries.push({
    // ISO 8601 string — easy to read in JSON, easy to sort/filter later.
    received_at: new Date().toISOString(),
    payload,
    response,
  });

  // Trim from the front when we exceed capacity, so the array length never
  // grows past MAX_ENTRIES regardless of how many calls come in.
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

// Return all entries, newest first.
// `.slice()` returns a shallow copy so callers can't mutate our internal state
// by sorting or splicing the returned array.
function list() {
  return entries.slice().reverse();
}

module.exports = { record, list, MAX_ENTRIES };
