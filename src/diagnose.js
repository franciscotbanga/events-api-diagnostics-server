// Diagnostic engine for event payloads.
// Takes a raw event in, returns a single human-readable diagnosis object.
//
// This module is intentionally pure (no Express, no I/O). The HTTP layer
// (routes/diagnose.js) just calls diagnose() and returns the result.

const {
  validatePurchase,
  validateLead,
  validateEventGeneric,
} = require('./validators');

// Severity scale used in the response:
//   low    — cosmetic; event will still process and report normally
//   medium — event will process, but reporting/attribution will be degraded
//   high   — event will be rejected or fail to process at all
const SEVERITY = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

// Numeric ranking so we can compare severities and pick the worst one.
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

// Knowledge base for MISSING fields.
// Keyed first by event type, then by field name. Each entry has the three
// human-facing strings plus a severity.
//
// Severity reasoning:
//   - event_name / event_id / timestamp are HIGH because the API will reject
//     events without them (or, in the case of event_id, deduplication breaks).
//   - Purchase.value is HIGH because a Purchase with no monetary value cannot
//     be attributed at all — there's nothing to report.
//   - Purchase.currency is MEDIUM because the event will be ingested, but
//     revenue/ROAS reporting will be wrong without a known currency.
//   - Purchase.content_ids is MEDIUM because revenue still flows through, but
//     product-level attribution is lost.
const MISSING_FIELD_INFO = {
  // Fields shared across all event types fall back to this bucket.
  GENERIC: {
    event_name: {
      client_explanation:
        'Your event does not include an event_name. Without it, the platform cannot tell what kind of action the user took (Purchase, Lead, etc.) and the event will be rejected.',
      developer_fix: 'Add an event_name field, e.g. "Purchase" or "Lead".',
      severity: SEVERITY.HIGH,
    },
    event_id: {
      client_explanation:
        'Your event does not include an event_id. Without it, the platform cannot deduplicate against pixel events, which can cause double-counting or rejection.',
      developer_fix:
        'Add a unique event_id (e.g. an order ID for Purchase, a session+timestamp hash for Lead) that matches the value sent from the browser pixel.',
      severity: SEVERITY.HIGH,
    },
    timestamp: {
      client_explanation:
        'Your event does not include a timestamp. Events without a timestamp cannot be placed on the attribution timeline and will be rejected.',
      developer_fix:
        'Add a timestamp field as Unix epoch seconds, e.g. Math.floor(Date.now() / 1000).',
      severity: SEVERITY.HIGH,
    },
  },
  Purchase: {
    value: {
      client_explanation:
        'Your Purchase event does not include a value. Without a monetary value the purchase cannot be attributed to ad spend and will not appear in revenue reporting.',
      developer_fix:
        'Add a value field as a positive number representing the order total (e.g. 79.50).',
      severity: SEVERITY.HIGH,
    },
    currency: {
      client_explanation:
        'Your Purchase event includes a value but does not include currency. Without a valid currency code such as BRL or USD, revenue reporting and ROAS calculations may be inaccurate.',
      developer_fix: 'Add currency using an ISO 4217 code such as BRL or USD.',
      severity: SEVERITY.MEDIUM,
    },
    content_ids: {
      client_explanation:
        'Your Purchase event does not include content_ids. The revenue will still report, but product-level attribution and catalog-based optimization will not work.',
      developer_fix:
        'Add content_ids as an array of one or more product/SKU identifiers, e.g. ["sku-001", "sku-042"].',
      severity: SEVERITY.MEDIUM,
    },
  },
};

// Knowledge base for MALFORMED-field issue strings.
// Keyed by the exact strings the validators produce in their `issues` array.
// Keeping this as a flat lookup (instead of parsing the strings) means the
// validator messages and the diagnostic messages are coupled by an explicit
// table — when you add a new issue string in validators.js, you'll get an
// "unknown issue" entry here until you map it, which is the desired behavior.
const ISSUE_INFO = {
  'timestamp must be a number (Unix epoch seconds)': {
    client_explanation:
      'Your event has a timestamp, but it is not in the expected format. Events APIs expect Unix epoch seconds (a number), not an ISO date string.',
    developer_fix:
      'Convert the timestamp to Unix epoch seconds using Math.floor(new Date(yourDate).getTime() / 1000).',
    severity: SEVERITY.HIGH,
  },
  'value must be a number': {
    client_explanation:
      'Your Purchase event includes a value, but it is not a number. Strings like "79.50" will be rejected by the platform.',
    developer_fix:
      'Send value as a numeric type, not a string. Use parseFloat() before sending if you receive it as a string.',
    severity: SEVERITY.HIGH,
  },
  'value must be greater than 0': {
    client_explanation:
      'Your Purchase event has a value of zero or less. The platform treats this as an invalid purchase and will not attribute revenue.',
    developer_fix:
      'Ensure value is a positive number representing the actual order total. If the order is free, do not send a Purchase event.',
    severity: SEVERITY.HIGH,
  },
  'currency must be a 3-letter uppercase ISO code (e.g. "USD")': {
    client_explanation:
      'Your Purchase event includes a currency field, but it is not a valid ISO 4217 code. Lowercase codes ("usd"), symbols ("$"), or full names ("Dollar") will not be recognized.',
    developer_fix:
      'Send currency as a 3-letter uppercase ISO 4217 code, e.g. "USD", "BRL", "EUR".',
    severity: SEVERITY.MEDIUM,
  },
  'content_ids must be an array': {
    client_explanation:
      'Your Purchase event includes content_ids, but it is not formatted as an array. A single string will not be parsed as a list of products.',
    developer_fix:
      'Wrap content_ids in an array even if there is only one product, e.g. ["sku-001"].',
    severity: SEVERITY.MEDIUM,
  },
  'content_ids must contain at least one id': {
    client_explanation:
      'Your Purchase event has content_ids set to an empty array. Product-level attribution and catalog optimization need at least one product identifier.',
    developer_fix:
      'Populate content_ids with one or more SKU/product IDs from your catalog.',
    severity: SEVERITY.MEDIUM,
  },
};

// Pick the appropriate validator based on event_name.
// Returns both the validator function and the canonical event-type label so
// we can use the label in summary messages and as a lookup key.
function pickValidator(event) {
  const name = event?.event_name;
  if (name === 'Purchase') return { validator: validatePurchase, eventType: 'Purchase' };
  if (name === 'Lead') return { validator: validateLead, eventType: 'Lead' };
  // Anything else — including events with no event_name — uses the generic check.
  return { validator: validateEventGeneric, eventType: 'Event' };
}

// Given a list of severities, return the highest one.
// Used to roll up multiple findings into a single response-level severity.
function highestSeverity(severities) {
  if (severities.length === 0) return SEVERITY.LOW;
  return severities.reduce((worst, current) =>
    SEVERITY_RANK[current] > SEVERITY_RANK[worst] ? current : worst
  );
}

// Build a one-line summary describing what's wrong.
// Single-finding case reads naturally ("Purchase event is missing currency.").
// Multi-finding case lists the count and the field/issue labels.
function buildSummary(eventType, findings) {
  if (findings.length === 1) {
    const f = findings[0];
    if (f.kind === 'missing') {
      return `${eventType} event is missing ${f.field}.`;
    }
    return `${eventType} event has an invalid field: ${f.label}.`;
  }
  const labels = findings.map((f) =>
    f.kind === 'missing' ? `missing ${f.field}` : `invalid ${f.label}`
  );
  return `${eventType} event has ${findings.length} issues: ${labels.join(', ')}.`;
}

// Extract a short field name from an issue string for use in the summary.
// E.g. 'value must be greater than 0' -> 'value'.
// We just take the first word, since every issue string starts with the field name.
function issueFieldLabel(issueString) {
  return issueString.split(' ')[0];
}

// Main entry point. Accepts any event-shaped object, returns the diagnosis.
function diagnose(event) {
  const { validator, eventType } = pickValidator(event);
  const result = validator(event);

  // Happy path: nothing wrong, return a low-severity "all clear" response.
  // We still fill in client_explanation and developer_fix so the response shape
  // stays consistent — callers don't have to special-case the ok=true branch.
  if (result.ok) {
    return {
      ok: true,
      summary: `${eventType} event is valid.`,
      client_explanation: 'No issues were found in this event payload.',
      developer_fix: 'No action required.',
      severity: SEVERITY.LOW,
    };
  }

  // Build a "findings" list — one entry per problem — with each problem's
  // human-facing strings and severity already resolved from the lookup tables.
  const findings = [];

  for (const field of result.missing) {
    // Look in the event-type-specific table first, then fall back to GENERIC.
    // This lets Purchase override generic field info if we ever need to,
    // while base fields (event_name etc.) stay defined in one place.
    const info =
      MISSING_FIELD_INFO[eventType]?.[field] ??
      MISSING_FIELD_INFO.GENERIC[field];

    if (info) {
      findings.push({ kind: 'missing', field, ...info });
    } else {
      // Fallback for fields we don't have copy for — should not happen in practice,
      // but keeps the response well-formed if validators ever flag a new field.
      findings.push({
        kind: 'missing',
        field,
        client_explanation: `Your event is missing the "${field}" field.`,
        developer_fix: `Add a "${field}" field to the event payload.`,
        severity: SEVERITY.MEDIUM,
      });
    }
  }

  for (const issue of result.issues) {
    const info = ISSUE_INFO[issue];
    const label = issueFieldLabel(issue);
    if (info) {
      findings.push({ kind: 'malformed', label, issue, ...info });
    } else {
      findings.push({
        kind: 'malformed',
        label,
        issue,
        client_explanation: `Your event has a malformed field: ${issue}.`,
        developer_fix: `Fix the field so that: ${issue}.`,
        severity: SEVERITY.MEDIUM,
      });
    }
  }

  // Roll up findings into the single-object response shape the API contract requires.
  // We join explanations and fixes with a space — the strings are written as
  // self-contained sentences so concatenation reads cleanly.
  return {
    ok: false,
    summary: buildSummary(eventType, findings),
    client_explanation: findings.map((f) => f.client_explanation).join(' '),
    developer_fix: findings.map((f) => f.developer_fix).join(' '),
    severity: highestSeverity(findings.map((f) => f.severity)),
  };
}

// Helper used by src/audit.js to look up per-issue copy when aggregating
// findings across many events. Without this, audit reports would have to
// re-derive the copy from concatenated diagnose() strings.
function getInfoForIssueLabel(label, eventType = 'Purchase') {
  if (label.startsWith('missing ')) {
    const field = label.slice('missing '.length);
    return (
      MISSING_FIELD_INFO[eventType]?.[field] ??
      MISSING_FIELD_INFO.GENERIC[field] ??
      null
    );
  }
  if (label.startsWith('invalid ')) {
    const field = label.slice('invalid '.length);
    // Find the ISSUE_INFO entry whose key starts with this field name.
    for (const [issueStr, info] of Object.entries(ISSUE_INFO)) {
      if (issueStr.startsWith(field + ' ')) return info;
    }
  }
  return null;
}

module.exports = { diagnose, getInfoForIssueLabel };
