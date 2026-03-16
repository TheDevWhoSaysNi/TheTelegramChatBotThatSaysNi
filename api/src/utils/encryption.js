const crypto = require('crypto');
const algorithm = 'aes-256-gcm';
const ivLength = 12;
const KEY_LENGTH = 32;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set and at least 32 characters for AES-256-GCM.');
  }
  return Buffer.from(raw.slice(0, 32), 'utf8');
}

function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // We store the IV and AuthTag along with the encrypted string
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(combined) {
  if (!combined || typeof combined !== 'string') return null;
  const [ivHex, authTagHex, encryptedHex] = combined.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) return null;
  const key = getKey();
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };