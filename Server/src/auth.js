const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');

// Passwords are stored as "scrypt$<salt>$<hash>" and are never returned by the API.
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [algorithm, salt, hash] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected);
}

// Used when the e-mail is unknown, so a missing account takes as long as a wrong password.
let dummyHash;
function burnPasswordCheck(password) {
  dummyHash ||= hashPassword('not-a-real-password');
  verifyPassword(password, dummyHash);
}

// The browser keeps the random token; the database keeps only its SHA-256 hash.
function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function newId() {
  return randomBytes(12).toString('hex'); // 24 hex characters, like a MongoDB ObjectId
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

module.exports = { hashPassword, verifyPassword, burnPasswordCheck, newSessionToken, hashToken, newId, publicUser };
