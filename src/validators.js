// Pure validation functions for Events API payloads.
// "Pure" means: no side effects, no I/O, no Express — just take an event object
// in, return a result object out. Easy to test, easy to reason about.
//
// Every validator returns the same shape:
//   {
//     ok:      true if no problems found, false otherwise
//     missing: array of required field names that are absent
//     issues:  array of human-readable strings describing fields that are
//              present but malformed (wrong type, bad value, etc.)
//   }
// Splitting "missing" from "issues" lets the caller (and the human reading
// diagnostic output) tell apart "you forgot to send X" from "X is there but wrong".

// Base fields every event needs, regardless of type.
// Pulled out as a constant so all three validators stay in sync if we add a field.
const BASE_REQUIRED = ['event_name', 'event_id', 'timestamp'];

// Helper: is a value "missing"?
// We treat undefined, null, and empty string as missing.
// We do NOT treat 0 or false as missing — those are valid values for numeric/boolean fields.
function isMissing(value) {
  return value === undefined || value === null || value === '';
}

// Helper: walk a list of required field names against the event object,
// return the names of the ones that are missing.
// `event ?? {}` guards against the caller passing null/undefined as the whole event.
function findMissing(event, requiredFields) {
  const safe = event ?? {};
  return requiredFields.filter((field) => isMissing(safe[field]));
}

// Generic validator — used for unknown event types or as a base sanity check.
// Only verifies the three fields every event must carry.
function validateEventGeneric(event) {
  const missing = findMissing(event, BASE_REQUIRED);
  const issues = [];

  // Even for the generic case, we lightly type-check the base fields when present,
  // because a wrong-type field is just as broken as a missing one.
  if (event && event.timestamp !== undefined && typeof event.timestamp !== 'number') {
    // Events APIs expect Unix epoch seconds (a number). A string like "2026-01-01"
    // or an ISO date will be rejected downstream — better to flag it here.
    issues.push('timestamp must be a number (Unix epoch seconds)');
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    missing,
    issues,
  };
}

// Purchase validator — base fields plus value, currency, content_ids.
// Purchases are the most common revenue-attribution event, so we check the
// money-related fields more strictly.
function validatePurchase(event) {
  // Start by combining the generic check with Purchase-specific required fields.
  const required = [...BASE_REQUIRED, 'value', 'currency', 'content_ids'];
  const missing = findMissing(event, required);
  const issues = [];

  // Only run type/format checks if we actually have an event object to inspect.
  // (If `event` is null, `missing` will already list everything — no need to also crash on issues.)
  if (event) {
    // Same timestamp check as the generic validator. Duplicated rather than shared
    // because the issue-collection logic is short and the duplication is clearer
    // than threading state through a helper.
    if (event.timestamp !== undefined && typeof event.timestamp !== 'number') {
      issues.push('timestamp must be a number (Unix epoch seconds)');
    }

    // `value` should be a positive number — a Purchase with value 0 or a negative
    // number doesn't make sense for revenue tracking.
    if (event.value !== undefined && !isMissing(event.value)) {
      if (typeof event.value !== 'number') {
        issues.push('value must be a number');
      } else if (event.value <= 0) {
        issues.push('value must be greater than 0');
      }
    }

    // `currency` should be an ISO 4217 three-letter code (USD, EUR, GBP, etc.).
    // We don't validate against the full ISO list — just the shape — to keep this
    // dependency-free. The downstream API will reject unknown codes anyway.
    if (event.currency !== undefined && !isMissing(event.currency)) {
      if (typeof event.currency !== 'string' || !/^[A-Z]{3}$/.test(event.currency)) {
        issues.push('currency must be a 3-letter uppercase ISO code (e.g. "USD")');
      }
    }

    // `content_ids` should be a non-empty array. A Purchase needs to identify
    // *what* was purchased — an empty array means no products attached.
    if (event.content_ids !== undefined && !isMissing(event.content_ids)) {
      if (!Array.isArray(event.content_ids)) {
        issues.push('content_ids must be an array');
      } else if (event.content_ids.length === 0) {
        issues.push('content_ids must contain at least one id');
      }
    }
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    missing,
    issues,
  };
}

// Lead validator — currently identical to the generic check, since Leads only
// need the three base fields. Kept as a separate function so the caller can
// be explicit about intent ("I expect a Lead") and so we have a clear place
// to add Lead-specific rules later (e.g. requiring hashed email/phone).
function validateLead(event) {
  const missing = findMissing(event, BASE_REQUIRED);
  const issues = [];

  if (event && event.timestamp !== undefined && typeof event.timestamp !== 'number') {
    issues.push('timestamp must be a number (Unix epoch seconds)');
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    missing,
    issues,
  };
}

// Export the three validators. Callers will typically pick one based on
// `event.event_name` — e.g. route "Purchase" to validatePurchase, "Lead" to
// validateLead, and anything else to validateEventGeneric.
module.exports = {
  validatePurchase,
  validateLead,
  validateEventGeneric,
};
