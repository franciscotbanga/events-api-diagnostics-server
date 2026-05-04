// What this file does:
// Converts our INTERNAL event shape (the simple {event_name, event_id, value, currency, content_ids} format)
// into the EXACT payload shape that TikTok's Events API v1.3 expects.
//
// This is the single most important file for proving you've actually read the
// TikTok docs. The transformations here are not generic — they're the specific
// quirks of TikTok's API:
//   1. TikTok event names are NOT the same as the words "Purchase" or "Lead".
//      "Purchase" → "CompletePayment" in TikTok's vocabulary.
//   2. PII (email, phone) MUST be SHA-256 hashed before sending. TikTok will
//      reject (or silently drop) raw email/phone.
//   3. The user identity goes in `user.email` / `user.phone` as ARRAYS, not strings.
//   4. Product info goes inside `properties.contents`, with `content_id`
//      (singular) per item — not `content_ids` (plural array of strings).
//   5. event_time must be Unix epoch SECONDS (not milliseconds).
//
// Reference: https://business-api.tiktok.com/portal/docs?id=1771101027431425

const { hashEmail, hashPhone } = require('./hash');

// Map our internal event_name → TikTok's standard event vocabulary.
// Our /diagnose accepts conversational names; TikTok wants its own taxonomy.
// Anything not in this map is passed through as a custom event name.
const EVENT_NAME_MAP = {
  Purchase: 'CompletePayment',
  Lead: 'CompleteRegistration',
  AddToCart: 'AddToCart',
  ViewContent: 'ViewContent',
  Search: 'Search',
};

// Convert a single internal event into a TikTok `data[]` entry.
function mapEvent(event) {
  // Build the user object. TikTok expects email/phone as arrays of hashes —
  // arrays because a person can have multiple identifiers (e.g. work + personal email).
  const user = {};
  if (event.email) {
    user.email = [hashEmail(event.email)];
  }
  if (event.phone) {
    user.phone = [hashPhone(event.phone)];
  }
  if (event.external_id) {
    // external_id (e.g. internal user/customer id) should also be hashed per TikTok's spec.
    user.external_id = [hashEmail(event.external_id)]; // re-using SHA-256 hex
  }
  if (event.ip) user.ip = event.ip;
  if (event.user_agent) user.user_agent = event.user_agent;
  if (event.ttclid) user.ttclid = event.ttclid;       // TikTok click id (from URL on landing)
  if (event.ttp) user.ttp = event.ttp;                // TikTok cookie param

  // Build the properties object — value, currency, contents.
  const properties = {};
  if (event.currency) properties.currency = event.currency;
  if (event.value !== undefined) properties.value = event.value;

  // Convert our content_ids: ["sku-1", "sku-2"] → contents: [{content_id: "sku-1"}, ...]
  // This is the TikTok-specific shape — they want an array of objects, not strings.
  if (Array.isArray(event.content_ids)) {
    properties.contents = event.content_ids.map((id) => ({
      content_id: id,
      content_type: 'product',
    }));
  }
  // If the caller passes richer `contents` directly (with name/quantity/price), prefer that.
  if (Array.isArray(event.contents)) {
    properties.contents = event.contents;
  }

  return {
    event: EVENT_NAME_MAP[event.event_name] ?? event.event_name,
    event_time: event.timestamp ?? Math.floor(Date.now() / 1000),
    event_id: event.event_id,
    user,
    properties,
    // Optional page context — useful for web events for better attribution.
    ...(event.page_url || event.page_referrer
      ? {
          page: {
            url: event.page_url,
            referrer: event.page_referrer,
          },
        }
      : {}),
  };
}

// Build the FULL TikTok request body, ready to POST to the v1.3 endpoint.
// `pixelCode` and `testEventCode` come from env config, not from the event itself.
function buildTikTokRequest({ events, pixelCode, testEventCode }) {
  const body = {
    event_source: 'web',
    event_source_id: pixelCode,
    data: events.map(mapEvent),
  };
  // test_event_code routes events to the "Test Events" tab in TikTok Events Manager
  // instead of the production stream. Critical for development — never send real
  // marketing data while debugging. Omit this field in production.
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }
  return body;
}

module.exports = {
  buildTikTokRequest,
  mapEvent,
  EVENT_NAME_MAP,
};
