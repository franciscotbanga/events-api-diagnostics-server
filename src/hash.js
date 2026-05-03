// Node's built-in cryptography module. No `npm install` needed —
// `crypto` ships with Node itself, so we can `require` it directly.
const crypto = require('crypto');

// Internal helper: SHA-256 hash a string and return the result as lowercase hex.
// We extract this so both hashEmail and hashPhone share the exact same hashing step.
function sha256Hex(input) {
  // createHash('sha256') returns a Hash object configured for the SHA-256 algorithm.
  // .update(input) feeds the string into the hasher.
  // .digest('hex') finalizes the hash and returns it as a hex-encoded string
  // (64 characters long, since SHA-256 produces 256 bits = 32 bytes = 64 hex chars).
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Normalize an email and return its SHA-256 hex hash.
// Events APIs (TikTok, Meta, etc.) require PII to be hashed before transmission,
// AND require a consistent normalization so the same person always produces the same hash.
function hashEmail(email) {
  // .trim() removes leading/trailing whitespace (e.g. " user@x.com " → "user@x.com").
  // .toLowerCase() ensures "User@X.com" and "user@x.com" produce the same hash.
  const normalized = email.trim().toLowerCase();

  // Hash the normalized string and return the hex digest.
  return sha256Hex(normalized);
}

// Normalize a phone number and return its SHA-256 hex hash.
// Phone numbers come in many formats ("+1 (555) 123-4567", "555.123.4567", etc.),
// so we strip everything that isn't a digit to get a canonical form before hashing.
function hashPhone(phone) {
  // .replace(/\D/g, '') uses a regular expression to remove every non-digit character.
  //   \D  → matches any character that is NOT a digit (0-9)
  //   g   → "global" flag, replace ALL matches (not just the first)
  // So "+1 (555) 123-4567" becomes "15551234567".
  const normalized = phone.replace(/\D/g, '');

  // Hash the digits-only string and return the hex digest.
  return sha256Hex(normalized);
}

// Export both functions so other files can `require('./hash')` and use them.
module.exports = { hashEmail, hashPhone };

// ---------------------------------------------------------------------------
// Example usage (commented out — uncomment and run `node src/hash.js` to try):
//
// const { hashEmail, hashPhone } = require('./hash');
//
// console.log(hashEmail('  User@Example.com  '));
// // → "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"
//
// console.log(hashPhone('+1 (555) 123-4567'));
// // → "d6736136ea896c1bfdc553e0e86e702c70d060d805696ca3e4e9e0961353860a"
//
// Note: the same input always produces the same 64-character hex string.
// SHA-256 is one-way — you cannot recover the original email/phone from the hash.
// ---------------------------------------------------------------------------
